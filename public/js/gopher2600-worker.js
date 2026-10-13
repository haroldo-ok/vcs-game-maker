'use strict';

// Runs the gopher2600 emulator (tools/gopher2600-wasm) off the page's main
// thread, so a frame that takes 12 ms to emulate never delays the UI. It has
// no DOM: the page (public/index.html) sends it commands and one "tick" per
// display refresh, and it sends back each finished frame's pixels and audio.
//
// The tick carries the refresh's timestamp, and this file turns those into a
// steady 60 emulated frames per second whatever the monitor's refresh rate
// is (60, 120, 144 Hz...): it keeps an accumulator of elapsed time and runs a
// frame whenever a full frame's worth has built up.

importScripts('wasm_exec.js');

// PAL consoles run at 50 frames per second; the project's PAL60 mode (and
// NTSC) at 60. 60 rather than the NTSC 59.94 so a 60 Hz display gets exactly
// one frame per refresh instead of dropping one every few seconds.
let framePeriod = 1000 / 60;
// A refresh this early still counts as due, so ordinary timing jitter on a
// 60 Hz display never skips or doubles a frame.
const TOLERANCE = 3;
// After a stall or a hidden tab, only this many frames are run to catch up.
const MAX_FRAMES_PER_TICK = 2;
const STALL_MS = 100;

let accumulator = 0;
let lastTimestamp = null;

// Adaptive frame skipping (Options tab): when a frame takes nearly as long to emulate as it is
// shown for, the emulator draws only some of the frames it runs, so a slow computer spends its time
// on emulation instead of on turning each frame into a picture. Emulation speed and sound are
// unchanged. `stepCost` is a running average of how long a frame takes to run.
let adaptiveFrameSkip = false;
let stepCost = 0;
let framesSinceDrawn = 0;
const STEP_COST_SMOOTHING = 0.1;

// How many frames to run for each one drawn: 1 while there is headroom, 2 when a frame takes most
// of its time to emulate, 3 when it takes longer than that.
const drawEvery = () => {
  if (!adaptiveFrameSkip || stepCost === 0) return 1;
  const load = stepCost / framePeriod;
  if (load < 0.8) return 1;
  return load < 1.1 ? 2 : 3;
};

self.g2kReady = () => {
  self.postMessage({type: 'ready'});
};

// Blank the page's canvas at the idle picture size.
self.g2kBlank = (width, height) => {
  self.postMessage({type: 'blank', width, height});
};

self.g2kPostFrame = (width, height, pixels) => {
  self.postMessage({type: 'frame', width, height, pixels: pixels.buffer}, [pixels.buffer]);
};

self.g2kPostAudio = (frequency, bytes) => {
  self.postMessage({type: 'audio', frequency, samples: bytes.buffer}, [bytes.buffer]);
};

const runTick = (timestamp) => {
  if (!self.gopher2600) return;
  let elapsed = lastTimestamp === null ? framePeriod : timestamp - lastTimestamp;
  lastTimestamp = timestamp;
  // A hidden or stalled page would otherwise try to fast-forward.
  if (elapsed > STALL_MS || elapsed < 0) elapsed = framePeriod;
  accumulator += elapsed;
  let frames = 0;
  while (accumulator >= framePeriod - TOLERANCE && frames < MAX_FRAMES_PER_TICK) {
    accumulator -= framePeriod;
    frames++;
    // Only the last frame of a tick is drawn; earlier ones still make sound.
    let draw = frames === MAX_FRAMES_PER_TICK || accumulator < framePeriod - TOLERANCE;
    if (draw && adaptiveFrameSkip) {
      framesSinceDrawn++;
      if (framesSinceDrawn >= drawEvery()) framesSinceDrawn = 0;
      else draw = false;
    }
    if (adaptiveFrameSkip) {
      const started = performance.now();
      self.gopher2600.stepFrame(draw);
      const cost = performance.now() - started;
      stepCost = stepCost === 0 ? cost : stepCost + (cost - stepCost) * STEP_COST_SMOOTHING;
    } else {
      self.gopher2600.stepFrame(draw);
    }
  }
  // Behind by more than a frame after catching up: drop the backlog.
  if (accumulator > framePeriod) accumulator = framePeriod;
};

// Everything the page can ask for goes through the Go API object.
const handleMessage = (message) => {
  switch (message.type) {
    case 'tick':
      runTick(message.timestamp);
      // Tells the page one of its outstanding ticks is finished (it keeps a few outstanding).
      self.postMessage({type: 'tickDone'});
      break;
    case 'call': {
      if (!self.gopher2600) break;
      if (message.name === 'loadRom') {
        framePeriod = message.args[1] === 'PAL' ? 20 : 1000 / 60;
        // A fresh ROM starts with a fresh time base.
        accumulator = 0;
      }
      const fn = self.gopher2600[message.name];
      if (typeof fn === 'function') {
        // loadRom's bytes arrive as an ArrayBuffer; Go reads a Uint8Array.
        const args = message.args.map((arg) => (arg instanceof ArrayBuffer ? new Uint8Array(arg) : arg));
        fn(...args);
      }
      break;
    }
    case 'key':
      if (self.gopher2600) self.gopher2600.keyEvent(message.code, message.down);
      break;
    case 'setting':
      if (message.name === 'adaptiveFrameSkip') {
        adaptiveFrameSkip = !!message.value;
        stepCost = 0;
        framesSinceDrawn = 0;
      }
      break;
  }
};

// Commands that arrive while the WASM module is still loading wait here.
const queued = [];
let ready = false;
self.onmessage = (event) => {
  if (!ready) {
    queued.push(event.data);
    return;
  }
  handleMessage(event.data);
};

const go = new Go();
WebAssembly.instantiateStreaming(fetch('gopher2600.wasm'), go.importObject)
    .then((result) => {
      // Go's main() calls g2kReady() before blocking forever, so this does not
      // return until the program exits.
      const original = self.g2kReady;
      self.g2kReady = () => {
        ready = true;
        original();
        queued.splice(0).forEach(handleMessage);
      };
      return go.run(result.instance);
    })
    .then(() => self.postMessage({type: 'exited'}))
    .catch((err) => {
      console.error('gopher2600-wasm failed:', err);
      self.postMessage({type: 'crashed', message: String(err && err.message || err)});
    });
