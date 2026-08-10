'use strict';

// Approximates what a TIA (Atari 2600 sound chip) AUDC/AUDF/AUDV combination
// would sound like, for previewing sound effect presets in the browser.
//
// Most AUDC values are not clean waveforms on real hardware: they are driven
// by a pseudo-random bit generator (a 4- or 5-bit linear feedback shift
// register), which is what gives them their "buzzy"/"reedy"/"distorted"
// character. Modeling those as plain square/triangle/sawtooth oscillators
// made every short blip sound like a generic tone regardless of AUDC, since
// clean waveforms are hard to tell apart at short durations. Instead, the
// "buzzy" family below is synthesized from an actual LFSR bit sequence, and
// only the genuine "pure tone" AUDC values get a clean oscillator - so pure
// tones stay smooth while everything else has an audibly gritty character.
// This is still an approximation, not a faithful emulation of the hardware.

// One shared context, created lazily since browsers require a user gesture
// before audio can start.
let audioContext = null;
const getAudioContext = () => {
  if (!audioContext) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    audioContext = new AudioContextClass();
  }
  if (audioContext.state === 'suspended') {
    audioContext.resume();
  }
  return audioContext;
};

// TIA's tone generators are driven by a shift register clocked at pixelclock/114
// (31440Hz on NTSC) divided by (AUDF + 1); each register shift is one "chip" for
// the buzzy/noise waveforms below. A pure tone's square wave takes two shifts
// (one high, one low) to complete a cycle, so its actual pitch is half the
// shift rate - confirmed against the real AUDC=4 frequency table (e.g. AUDF=0
// is a 31440Hz shift rate but a 15720Hz tone). AUDC 12/13 ("much lower" pure
// tone) run off CPUclock/114 (10480Hz, exactly a third of 31440) instead.
const NTSC_SHIFT_CLOCK = 31440;
export const shiftClockFor = (audf, {slowClock = false} = {}) =>
  (slowClock ? NTSC_SHIFT_CLOCK / 3 : NTSC_SHIFT_CLOCK) / (Number(audf) + 1);

// Advances a Galois LFSR by one step, returning both the new state and the
// bit that was shifted out (needed by AUDC 3's gated poly5->poly4 below).
// The tap patterns aren't claimed to match the real TIA polynomials exactly,
// they just need to produce an audibly pseudo-random (as opposed to
// perfectly periodic) bit sequence of the right period. 9 bits is AUDC 8's
// real "9-bit poly" - a much longer repeat period than the 4/5-bit ones is
// what actually gives it a "white noise" character on real hardware, not
// literal per-sample randomness.
const TAPS_BY_BITS = {4: 0b1001, 5: 0b10010, 9: 0b100010000};
const stepLfsrWithBit = (lfsr, bits) => {
  const bit = lfsr & 1;
  const shifted = lfsr >> 1;
  const next = bit ? (shifted ^ TAPS_BY_BITS[bits]) : shifted;
  return {next: next || 1, bit};
};
const stepLfsr = (lfsr, bits) => stepLfsrWithBit(lfsr, bits).next;

// Builds a buffer of a pseudo-random square-ish wave: each "chip" (one shift
// register clock) holds +1 or -1 according to the next LFSR bit, rather than
// strictly alternating like a clean square wave. That irregularity is what
// reads as "buzzy" rather than "tone". stepDivider makes the LFSR advance
// only once every N chips instead of every chip - AUDC 2 is documented as a
// 4-bit poly that only advances on a div31 transition, so it sounds like the
// same buzz as AUDC 1 but roughly 31x slower rather than a different pattern.
export const buildBuzzBuffer = (context, chipClockHz, seconds, bits, {stepDivider = 1} = {}) => {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * seconds));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const chipSamples = Math.max(1, Math.round(sampleRate / chipClockHz));
  let lfsr = 1;
  let output = 1;
  let chipsUntilStep = stepDivider;
  let samplesUntilNextChip = chipSamples;
  for (let i = 0; i < length; i++) {
    if (--samplesUntilNextChip <= 0) {
      if (--chipsUntilStep <= 0) {
        chipsUntilStep = stepDivider;
        lfsr = stepLfsr(lfsr, bits);
        output = (lfsr & 1) ? 1 : -1;
      }
      samplesUntilNextChip = chipSamples;
    }
    data[i] = output;
  }
  return buffer;
};

// AUDC 6/10 ("div31 pure tone") and 14 (the same pattern, slow-clocked)
// aren't pseudo-random at all - real hardware documents this as a fixed,
// repeating 31-step pattern (18 high cycles then 13 low), which is what
// gives it an "almost pure tone but slightly uneven" character rather than a
// buzz. Modeling it as an LFSR (as the old approximation did) made it sound
// like noise instead of a lopsided tone.
const DIV31_HIGH_STEPS = 18;
const DIV31_TOTAL_STEPS = 31;
export const buildDiv31Buffer = (context, chipClockHz, seconds) => {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * seconds));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const chipSamples = Math.max(1, Math.round(sampleRate / chipClockHz));
  let step = 0;
  let output = 1;
  let samplesUntilNextChip = chipSamples;
  for (let i = 0; i < length; i++) {
    if (--samplesUntilNextChip <= 0) {
      step = (step + 1) % DIV31_TOTAL_STEPS;
      output = step < DIV31_HIGH_STEPS ? 1 : -1;
      samplesUntilNextChip = chipSamples;
    }
    data[i] = output;
  }
  return buffer;
};

// AUDC 3 ("5 bit poly -> 4 bit poly") is the most complex of the bunch: the
// 5-bit poly steps every chip clock unconditionally, but the 4-bit poly (and
// the actual sound output) only advances on chips where the poly5 bit just
// shifted out was 1 - on a 0, the output holds whatever it was. This is a
// genuinely different mechanism from a single gated/divided LFSR, not just a
// different bit-width, so it gets its own dual-register builder.
export const buildGatedBuzzBuffer = (context, chipClockHz, seconds) => {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * seconds));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const chipSamples = Math.max(1, Math.round(sampleRate / chipClockHz));
  let poly5 = 1;
  let poly4 = 1;
  let output = 1;
  let samplesUntilNextChip = chipSamples;
  for (let i = 0; i < length; i++) {
    if (--samplesUntilNextChip <= 0) {
      const poly5Step = stepLfsrWithBit(poly5, 5);
      poly5 = poly5Step.next;
      if (poly5Step.bit) {
        const poly4Step = stepLfsrWithBit(poly4, 4);
        poly4 = poly4Step.next;
        output = poly4Step.bit ? 1 : -1;
      }
      samplesUntilNextChip = chipSamples;
    }
    data[i] = output;
  }
  return buffer;
};

// Per-AUDC approximation, reconciled against problemkaputt.de's AUDC
// distortion table and 7800.8bitdev.org's per-distortion bit sequences:
//   0/11  constant high (silent)                8   9-bit poly (white noise)
//   1     4-bit poly                            9   5-bit poly
//   2     div31-gated 4-bit poly (~31x slower)   10  div31 pure tone (= 6)
//   3     5-bit poly gates 4-bit poly/output     11  constant high (silent)
//   4/5   div2 pure tone                         12/13 div2 pure tone, slow clock
//   6     div31 pure tone (fixed pattern)        14  div31 pure tone, slow clock (= 6, slow)
//   7     5-bit poly (= 9)                       15  5-bit poly, slow clock (= 7/9, slow)
// type is 'square' (clean oscillator), 'buzz' (LFSR-driven), 'div31' (fixed
// lopsided-tone pattern), or 'gatedbuzz' (AUDC 3's dual-register mechanism).
// slowClock marks the AUDC values documented as running off the slower
// CPUclock/114 base rather than pixelclock/114.
export const AUDC_APPROXIMATIONS = {
  '0': null,
  '1': {type: 'buzz', bits: 4},
  '2': {type: 'buzz', bits: 4, stepDivider: 31},
  '3': {type: 'gatedbuzz'},
  '4': {type: 'square'},
  '5': {type: 'square'},
  '6': {type: 'div31'},
  '7': {type: 'buzz', bits: 5},
  '8': {type: 'buzz', bits: 9},
  '9': {type: 'buzz', bits: 5},
  '10': {type: 'div31'},
  '11': null,
  '12': {type: 'square', slowClock: true},
  '13': {type: 'square', slowClock: true},
  '14': {type: 'div31', slowClock: true},
  '15': {type: 'buzz', bits: 5, slowClock: true},
};

// Matches generators/bbasic/soundfx.js's own FADE_TAIL_FRAMES/fadeTargetVolume
// - the compiled ROM drops to about a quarter volume for the last 4 frames
// (60fps) rather than a smooth ramp, so the preview steps down the same way
// instead of a continuous fade, to actually sound like what plays in game.
export const FADE_TAIL_SECONDS = 4 / 60;
export const fadeTargetGain = (peakGain) => peakGain * (Math.round(15 / 4) / 15);

// Tracks whatever preview is currently playing, so the Stop button (and a
// fresh Play press, which would otherwise overlap the old preview instead
// of replacing it) can cut it off early.
let activeSource = null;
let activeGainNode = null;
// A short linear ramp to silence before actually stopping the source, to
// avoid the audible click a hard, instant stop mid-waveform would cause.
const STOP_FADE_SECONDS = 0.02;

const stopActivePreview = () => {
  if (!activeSource) return;
  const context = getAudioContext();
  const now = context.currentTime;
  if (activeGainNode) {
    activeGainNode.gain.cancelScheduledValues(now);
    activeGainNode.gain.setValueAtTime(activeGainNode.gain.value, now);
    activeGainNode.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
  }
  try {
    activeSource.stop(now + STOP_FADE_SECONDS);
  } catch (e) {
    // Already stopped/never started - nothing left to do.
  }
  activeSource = null;
  activeGainNode = null;
};

/** Stops whatever sound effect preview is currently playing, if any. */
export const stopSoundEffectPreview = () => {
  stopActivePreview();
};

/**
 * Plays a short approximation of a TIA sound effect for previewing in the
 * editor. duration is in NTSC frames (60 per second), matching the generated
 * bBasic code's units.
 */
export const previewSoundEffect = ({audc, audf, audv, duration, fade}) => {
  const approximation = AUDC_APPROXIMATIONS[`${audc}`];
  const seconds = Math.max(0, Number(duration) || 0) / 60;
  if (!approximation || seconds <= 0) {
    return;
  }

  // A fresh preview replaces whatever was already playing rather than
  // layering on top of it.
  stopActivePreview();

  const context = getAudioContext();
  const now = context.currentTime;
  const gainNode = context.createGain();
  const peakGain = Math.min(1, Math.max(0, Number(audv) || 0) / 15) * 0.3;
  if (fade && seconds > FADE_TAIL_SECONDS) {
    const fadeStart = now + seconds - FADE_TAIL_SECONDS;
    gainNode.gain.setValueAtTime(peakGain, now);
    gainNode.gain.setValueAtTime(peakGain, fadeStart);
    gainNode.gain.setValueAtTime(fadeTargetGain(peakGain), fadeStart);
    gainNode.gain.setValueAtTime(fadeTargetGain(peakGain), now + seconds);
  } else {
    gainNode.gain.setValueAtTime(peakGain, now);
    gainNode.gain.setValueAtTime(peakGain, now + seconds * 0.8);
  }
  gainNode.gain.linearRampToValueAtTime(0, now + seconds);

  const chipClockHz = shiftClockFor(audf, {slowClock: approximation.slowClock});

  gainNode.connect(context.destination);
  const output = gainNode;

  let source;
  if (approximation.type === 'square') {
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(chipClockHz / 2, now);
    oscillator.connect(output);
    source = oscillator;
  } else {
    source = context.createBufferSource();
    if (approximation.type === 'div31') {
      source.buffer = buildDiv31Buffer(context, chipClockHz, seconds);
    } else if (approximation.type === 'gatedbuzz') {
      source.buffer = buildGatedBuzzBuffer(context, chipClockHz, seconds);
    } else {
      source.buffer = buildBuzzBuffer(context, chipClockHz, seconds, approximation.bits,
          {stepDivider: approximation.stepDivider});
    }
    source.connect(output);
  }

  source.start(now);
  source.stop(now + seconds);

  activeSource = source;
  activeGainNode = gainNode;
  source.onended = () => {
    // Only clear if this source is still the active one - a Stop press (or
    // a newer preview replacing this one) already did its own cleanup, and
    // this handler firing afterward (stopping a node fires "ended" too)
    // shouldn't clobber whatever's playing now.
    if (activeSource === source) {
      activeSource = null;
      activeGainNode = null;
    }
  };
};
