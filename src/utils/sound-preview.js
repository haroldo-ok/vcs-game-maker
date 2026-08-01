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
const shiftClockFor = (audf, {slowClock = false} = {}) =>
  (slowClock ? NTSC_SHIFT_CLOCK / 3 : NTSC_SHIFT_CLOCK) / (Number(audf) + 1);

const NOISE_BUFFER_SECONDS = 1;
let noiseBuffer = null;
const getNoiseBuffer = (context) => {
  if (!noiseBuffer) {
    const length = context.sampleRate * NOISE_BUFFER_SECONDS;
    noiseBuffer = context.createBuffer(1, length, context.sampleRate);
    const data = noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
  }
  return noiseBuffer;
};

// Advances a Galois LFSR by one step. The tap patterns aren't claimed to
// match the real TIA polynomials exactly, they just need to produce an
// audibly pseudo-random (as opposed to perfectly periodic) bit sequence.
const TAPS_BY_BITS = {4: 0b1001, 5: 0b10010};
const stepLfsr = (lfsr, bits) => {
  const lsb = lfsr & 1;
  lfsr >>= 1;
  if (lsb) lfsr ^= TAPS_BY_BITS[bits];
  return lfsr || 1;
};

// Builds a buffer of a pseudo-random square-ish wave: each "chip" (one shift
// register clock) holds +1 or -1 according to the next LFSR bit, rather than
// strictly alternating like a clean square wave. That irregularity is what
// reads as "buzzy" rather than "tone".
// wavering slowly speeds up and slows down the chip rate, for AUDC 3's
// "flangy wavering" character.
const buildBuzzBuffer = (context, chipClockHz, seconds, bits, {wavering = false} = {}) => {
  const sampleRate = context.sampleRate;
  const length = Math.max(1, Math.ceil(sampleRate * seconds));
  const buffer = context.createBuffer(1, length, sampleRate);
  const data = buffer.getChannelData(0);

  const baseChipSamples = Math.max(1, Math.round(sampleRate / chipClockHz));
  let lfsr = 1;
  let output = 1;
  let samplesUntilNextChip = baseChipSamples;
  for (let i = 0; i < length; i++) {
    if (--samplesUntilNextChip <= 0) {
      lfsr = stepLfsr(lfsr, bits);
      output = (lfsr & 1) ? 1 : -1;
      const wobble = wavering ? 1 + 0.4 * Math.sin(2 * Math.PI * 3 * (i / length)) : 1;
      samplesUntilNextChip = Math.max(1, Math.round(baseChipSamples * wobble));
    }
    data[i] = output;
  }
  return buffer;
};

// Per-AUDC approximation. type is 'square' (clean pure tone), 'buzz'
// (LFSR-driven, clocked directly off the shift register rate), or 'noise'.
// slowClock marks the AUDC values documented as running off the slower
// CPUclock/114 base rather than pixelclock/114.
const AUDC_APPROXIMATIONS = {
  '0': null,
  '1': {type: 'buzz', bits: 4},
  '2': {type: 'buzz', bits: 4, lowpass: true},
  '3': {type: 'buzz', bits: 5, wavering: true},
  '4': {type: 'square'},
  '5': {type: 'square'},
  '6': {type: 'buzz', bits: 5},
  '7': {type: 'buzz', bits: 5},
  '8': {type: 'noise'},
  '9': {type: 'buzz', bits: 5},
  '10': {type: 'buzz', bits: 4},
  '11': null,
  '12': {type: 'square', slowClock: true},
  '13': {type: 'square', slowClock: true},
  '14': {type: 'buzz', bits: 4, lowpass: true},
  '15': {type: 'buzz', bits: 4, lowpass: true},
};

/**
 * Plays a short approximation of a TIA sound effect for previewing in the
 * editor. duration is in NTSC frames (60 per second), matching the generated
 * bBasic code's units.
 */
export const previewSoundEffect = ({audc, audf, audv, duration}) => {
  const approximation = AUDC_APPROXIMATIONS[`${audc}`];
  const seconds = Math.max(0, Number(duration) || 0) / 60;
  if (!approximation || seconds <= 0) {
    return;
  }

  const context = getAudioContext();
  const now = context.currentTime;
  const gainNode = context.createGain();
  const peakGain = Math.min(1, Math.max(0, Number(audv) || 0) / 15) * 0.3;
  gainNode.gain.setValueAtTime(peakGain, now);
  gainNode.gain.setValueAtTime(peakGain, now + seconds * 0.8);
  gainNode.gain.linearRampToValueAtTime(0, now + seconds);

  const chipClockHz = shiftClockFor(audf, {slowClock: approximation.slowClock});

  // gainNode always feeds the destination - AUDC values with a lowpass
  // filter (2, 14, 15) instead used to route the filter straight to
  // destination and leave gainNode as a dead end nothing ever played
  // through, so AUDV (and DIM, which lowers it before this ever runs) had no
  // audible effect for exactly those three types. Chaining the filter INTO
  // gainNode instead of past it fixes that for both the plain and
  // lowpass-filtered paths.
  gainNode.connect(context.destination);
  let output = gainNode;
  if (approximation.lowpass) {
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = Math.max(150, chipClockHz);
    filter.connect(gainNode);
    output = filter;
  }

  let source;
  if (approximation.type === 'noise') {
    source = context.createBufferSource();
    source.buffer = getNoiseBuffer(context);
    source.loop = true;
    source.connect(output);
  } else if (approximation.type === 'buzz') {
    source = context.createBufferSource();
    source.buffer = buildBuzzBuffer(context, chipClockHz, seconds, approximation.bits,
        {wavering: approximation.wavering});
    source.connect(output);
  } else {
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    oscillator.frequency.setValueAtTime(chipClockHz / 2, now);
    oscillator.connect(output);
    source = oscillator;
  }

  source.start(now);
  source.stop(now + seconds);
};
