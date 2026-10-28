'use strict';

// Makes the sound of a phrase for the editor's play buttons: runs the SpeakJet speech chip (speakjet.wasm, the synthesizer the AtariVox
// emulation of both emulators uses) over the bytes of a phrase and sends back the samples, 8192 a second.
//
//   in:  {id, bytes: Uint8Array}      the SpeakJet bytes of a phrase (see src/utils/speakjet.js)
//   out: {id, samples: ArrayBuffer}   float32 samples, -1 to 1 (empty if the chip could not be loaded)

importScripts('wasm_exec.js');

const SAMPLE_RATE = 8192;
const CHUNK = 512;
const MAX_SECONDS = 60;
// The control codes that take a second byte.
const DOUBLE_CODES = new Set([20, 21, 22, 23, 24, 25, 26, 28, 29, 30]);

let chipPromise = null;
const loadChip = () => {
  if (!chipPromise) {
    chipPromise = (async () => {
      const go = new Go();
      const {instance} = await WebAssembly.instantiateStreaming(fetch('speakjet.wasm'), go.importObject);
      go.run(instance);
      return self.speakjetChip;
    })();
  }
  return chipPromise;
};

const commandsOf = (bytes) => {
  const commands = [];
  for (let i = 0; i < bytes.length; i++) {
    if (DOUBLE_CODES.has(bytes[i]) && i + 1 < bytes.length) {
      commands.push([bytes[i], bytes[i + 1]]);
      i++;
    } else {
      commands.push([bytes[i], 0]);
    }
  }
  return commands;
};

const speak = async (bytes) => {
  const chip = await loadChip();
  chip.reset();
  const commands = commandsOf(bytes);
  const chunks = [];
  let total = 0;
  let next = 0;
  let quiet = 0;
  while (total < MAX_SECONDS * SAMPLE_RATE) {
    // The chip's input buffer is small: a phrase goes in as it makes room, like the program sends it.
    while (next < commands.length && chip.write(commands[next][0], commands[next][1])) next++;
    const out = chip.render(CHUNK);
    chunks.push(new Float32Array(out.buffer, out.byteOffset, CHUNK));
    total += CHUNK;
    if (next >= commands.length && !chip.speaking()) {
      quiet++;
      if (quiet >= 2) break;
    } else {
      quiet = 0;
    }
  }
  const samples = new Float32Array(total);
  let at = 0;
  chunks.forEach((chunk) => {
    samples.set(chunk, at);
    at += chunk.length;
  });
  return samples;
};

self.onmessage = async (event) => {
  const {id, bytes} = event.data;
  let samples;
  try {
    samples = await speak(bytes);
  } catch (error) {
    console.error('speakjet worker:', error);
    samples = new Float32Array(0);
  }
  self.postMessage({id, samples: samples.buffer}, [samples.buffer]);
};
