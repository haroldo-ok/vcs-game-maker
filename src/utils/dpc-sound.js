'use strict';

// Converting a sound between the two kinds of sound the app makes.
//
// A Standard kernel sound is a TIA sound: a distortion type (AUDC) and a frequency divider (AUDF). The DPC+ kernel
// plays a sound with its music chip instead: a 32 sample waveform and a frequency in Hz (the chip's frequency table
// can hold any pitch). A DPC+ sound keeps its Standard settings (audc, audf) next to the DPC+ ones (dpcShape,
// dpcFrequency), so switching a project between kernels and back gives the same sound it started as.
//
// dpcShape names the waveform: one of the Sound tab's presets (square, buzzy, rough, noise...), or 'tia<N>' for the
// waveform the TIA makes for AUDC N. A converted Standard sound gets the preset that is the most direct match for its type
// (see presetForAudc).

import {tvAudioClockScale} from './tv-standard';

const NTSC_SHIFT_CLOCK = 31440;
export const DPC_WAVE_LENGTH = 32;
// The TIA's polynomial counters, stepped the same way the Sound tab's preview does (utils/sound-preview.js).
const TAPS_BY_BITS = {4: 0b1001, 5: 0b10010, 9: 0b100010000};
const stepLfsr = (lfsr, bits) => {
  const bit = lfsr & 1;
  const shifted = lfsr >> 1;
  return {next: (bit ? (shifted ^ TAPS_BY_BITS[bits]) : shifted) || 1, bit};
};

const polyChips = (bits, count, stepEvery = 1) => {
  const chips = [];
  let lfsr = 1;
  let output = 1;
  for (let i = 0; i < count; i++) {
    if (i % stepEvery === 0) {
      lfsr = stepLfsr(lfsr, bits).next;
      output = lfsr & 1;
    }
    chips.push(output);
  }
  return chips;
};

const gatedChips = (count) => {
  const chips = [];
  let poly5 = 1;
  let poly4 = 1;
  let output = 1;
  for (let i = 0; i < count; i++) {
    const five = stepLfsr(poly5, 5);
    poly5 = five.next;
    if (five.bit) {
      const four = stepLfsr(poly4, 4);
      poly4 = four.next;
      output = four.bit;
    }
    chips.push(output);
  }
  return chips;
};

const div31Chips = () => Array.from({length: 31}, (_, i) => (i < 18 ? 1 : 0));

// One repeat of an AUDC's output, one entry per chip (a shift of the TIA's register), and whether that AUDC runs on
// the slower clock. null for the types that make no sound. 'period' marks the pattern that repeats in that many
// chips; a longer pattern (the noise types) is reduced to its first 32 chips by waveFor below.
const AUDC_CHIPS = {
  1: () => ({chips: polyChips(4, 15), slow: false}),
  // The 4-bit poly, stepped once every 31 chips.
  2: () => ({chips: polyChips(4, 15 * 31, 31), slow: false, stepped: 31}),
  3: () => ({chips: gatedChips(465), slow: false}),
  4: () => ({chips: [1, 0], slow: false}),
  5: () => ({chips: [1, 0], slow: false}),
  6: () => ({chips: div31Chips(), slow: false}),
  7: () => ({chips: polyChips(5, 31), slow: false}),
  8: () => ({chips: polyChips(9, 511), slow: false}),
  9: () => ({chips: polyChips(5, 31), slow: false}),
  10: () => ({chips: div31Chips(), slow: false}),
  12: () => ({chips: [1, 0], slow: true}),
  13: () => ({chips: [1, 0], slow: true}),
  14: () => ({chips: div31Chips(), slow: true}),
  15: () => ({chips: polyChips(5, 31), slow: true}),
};

// The TIA's output for an AUDC, one entry (0 or 1) per step of its shift register, and whether it runs on the slower clock (a third of
// the speed); null for the types that make no sound. One step takes AUDF + 1 ticks of the 31440 Hz clock (see frequencyForTia).
export const TIA_AUDCS = Object.keys(AUDC_CHIPS).map(Number);
export const TIA_CLOCK_HZ = NTSC_SHIFT_CLOCK;
const tiaChipCache = {};
export const tiaChipPattern = (audc) => {
  const key = Number(audc);
  if (!AUDC_CHIPS[key]) return null;
  if (!tiaChipCache[key]) {
    const {chips, slow} = AUDC_CHIPS[key]();
    tiaChipCache[key] = {chips: Uint8Array.from(chips), slow};
  }
  return tiaChipCache[key];
};

const clockFor = (config, slow) => NTSC_SHIFT_CLOCK * tvAudioClockScale(config) / (slow ? 3 : 1);

const SHAPE_PATTERN = /^tia(\d+)$/;
export const shapeForAudc = (audc) => `tia${Number(audc)}`;
export const audcForShape = (shape) => {
  const match = SHAPE_PATTERN.exec(shape || '');
  return match && AUDC_CHIPS[Number(match[1])] ? String(Number(match[1])) : null;
};

// The 32 samples (0 or 1) of a TIA shape and how many chips of the TIA go into one cycle of them, or null for a shape
// that makes no sound.
const waveCache = {};
export const waveFor = (shape) => {
  if (waveCache[shape] !== undefined) return waveCache[shape];
  const audc = audcForShape(shape);
  let result = null;
  if (audc) {
    const {chips, stepped} = AUDC_CHIPS[audc]();
    // A pattern too long for 32 samples (the noise types) plays its first 32 chips over and over: its tone is then
    // the chip rate over 32, which keeps how bright the buzz is where the TIA has it.
    const period = chips.length > 64 ? DPC_WAVE_LENGTH : chips.length;
    const samples = Array.from({length: DPC_WAVE_LENGTH}, (_, i) => chips[Math.floor(i * period / DPC_WAVE_LENGTH)]);
    // The poly stepped every 31 chips: 15 steps make up the cycle, each as long as 31 chips.
    result = stepped ? {samples: Array.from({length: DPC_WAVE_LENGTH},
        (_, i) => chips[Math.floor(i * 15 / DPC_WAVE_LENGTH) * stepped]), chipsPerCycle: 15 * stepped} :
      {samples, chipsPerCycle: period};
  }
  waveCache[shape] = result;
  return result;
};

// Frequency in Hz the DPC+ plays the shape at to match a TIA sound with that AUDF.
export const frequencyForTia = (audc, audf, config) => {
  const shape = waveFor(shapeForAudc(audc));
  if (!shape) return 0;
  const {slow} = AUDC_CHIPS[Number(audc)]();
  return clockFor(config, slow) / (Number(audf) + 1) / shape.chipsPerCycle;
};

// The Sound tab's waveform preset that matches each Standard type the most directly: the 50% square types (4, 5, 12 and
// 13), the buzzy one (1) and the rough one (6, 10 and 14) are the same waveform, and the noise types (3, 7, 8, 9 and 15)
// are noise. Type 2, a slowly stepped 4-bit poly, is the nearest to the buzzy one.
const PRESET_FOR_AUDC = {
  1: 'buzzy', 2: 'buzzy', 3: 'noise', 4: 'square', 5: 'square', 6: 'rough', 7: 'noise', 8: 'noise', 9: 'noise',
  10: 'rough', 12: 'square', 13: 'square', 14: 'rough', 15: 'noise',
};
export const presetForAudc = (audc) => PRESET_FOR_AUDC[Number(audc)] || null;

export const isDpcPlusSound = (sound) => !!(sound && sound.dpcShape);

// The DPC+ waveform's top value: samples go from 0 to this, and a note's volume scales the whole shape.
export const DPC_WAVE_MAX = 15;

// A fixed noise shape, so the same preset always gives the same sound (what a percussion sound from the Standard kernel
// becomes under DPC+, unless it was buzzy).
export const NOISE_WAVE = (() => {
  let seed = 12345;
  return Array.from({length: DPC_WAVE_LENGTH}, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >> 8) % (DPC_WAVE_MAX + 1);
  });
})();

// A DPC+ sound's 32 samples, 0 to DPC_WAVE_MAX: the ones drawn in the Sound tab, otherwise those of its named shape.
export const dpcWaveOf = (sound) => {
  if (sound && Array.isArray(sound.dpcWave) && sound.dpcWave.length === DPC_WAVE_LENGTH) {
    return sound.dpcWave.map((value) => Math.max(0, Math.min(DPC_WAVE_MAX, Math.round(Number(value) || 0))));
  }
  if (sound && sound.dpcShape === 'noise') return NOISE_WAVE.slice();
  // The Buzzy and Rough presets of the Sound tab are the shapes of Standard types 1 and 6.
  const shape = sound && ({buzzy: 'tia1', rough: 'tia6'}[sound.dpcShape] || sound.dpcShape);
  const tia = sound && waveFor(shape);
  if (tia) return tia.samples.map((value) => value * DPC_WAVE_MAX);
  const named = sound && NAMED_WAVES[sound.dpcShape];
  return named ? named.map((value) => Math.round(value * DPC_WAVE_MAX)) : Array(DPC_WAVE_LENGTH).fill(0);
};

// The piano keys of the chip's frequency table: entry n is the key n semitones above A0 (27.5 Hz), 1 to 88.
export const PIANO_KEY_COUNT = 88;
export const pianoIndexForMidi = (midi) => midi - 20;
export const midiForPianoIndex = (index) => index + 20;
export const frequencyForMidi = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// A sound converted before the presets were matched to Standard types has a 'tia<N>' shape: it gets the preset that is the
// most direct match for that type instead. Returns true if the sound was changed.
export const normalizeTiaShape = (sound) => {
  const audc = isDpcPlusSound(sound) ? audcForShape(sound.dpcShape) : null;
  if (!audc) return false;
  sound.dpcShape = sound.isPercussion && audc !== '1' ? 'noise' : presetForAudc(audc);
  sound.dpcWave = dpcWaveOf(sound);
  return true;
};

// Adds the DPC+ settings to a Standard sound, in place. Returns true if the sound was changed.
export const convertSoundToDpcPlus = (sound, config) => {
  if (sound && isDpcPlusSound(sound)) return normalizeTiaShape(sound);
  if (!sound) return false;
  const shape = shapeForAudc(sound.audc);
  if (!waveFor(shape)) {
    // AUDC 0 and 11 make no sound (the TIA holds the output high).
    sound.dpcShape = 'off';
    sound.dpcFrequency = 0;
    sound.dpcWave = Array(DPC_WAVE_LENGTH).fill(0);
    return true;
  }
  sound.dpcFrequency = Math.round(frequencyForTia(sound.audc, sound.audf, config) * 100) / 100;
  // A changing pitch (sweep, frequency envelope, arpeggio) is played with the same pitches as the TIA plays them.
  if (sound.dpcSweepMatch === undefined && (sound.sweep || sound.pitchEnvelope || sound.arpeggio)) sound.dpcSweepMatch = true;
  // Percussion becomes noise, unless it was buzzy already (AUDC 1), which stays the buzzy shape.
  sound.dpcShape = sound.isPercussion && `${sound.audc}` !== '1' ? 'noise' : presetForAudc(sound.audc);
  sound.dpcWave = dpcWaveOf(sound);
  return true;
};

// A converted sound (one whose waveform is a TIA one) follows its Standard settings when they are edited: its DPC+
// settings are worked out again from them.
export const refreshDpcPlusFromStandard = (sound, config) => {
  if (!isDpcPlusSound(sound) || !(sound.dpcShape === 'off' || audcForShape(sound.dpcShape) ||
    sound.dpcShape === presetForAudc(sound.audc))) return;
  const before = `${sound.dpcShape}/${sound.dpcFrequency}`;
  delete sound.dpcShape;
  delete sound.dpcFrequency;
  delete sound.dpcWave;
  delete sound.dpcWaveBars;
  convertSoundToDpcPlus(sound, config);
  return before !== `${sound.dpcShape}/${sound.dpcFrequency}`;
};

// Waveforms a DPC+ sound can have besides the TIA ones, 32 samples from 0 to 1.
const NAMED_WAVES = {
  sine: Array.from({length: DPC_WAVE_LENGTH}, (_, i) => (Math.sin(2 * Math.PI * i / DPC_WAVE_LENGTH) + 1) / 2),
  triangle: Array.from({length: DPC_WAVE_LENGTH}, (_, i) => 1 - Math.abs(2 * i / DPC_WAVE_LENGTH - 1)),
  sawtooth: Array.from({length: DPC_WAVE_LENGTH}, (_, i) => i / (DPC_WAVE_LENGTH - 1)),
  square: Array.from({length: DPC_WAVE_LENGTH}, (_, i) => (i < DPC_WAVE_LENGTH / 2 ? 1 : 0)),
  pulse: Array.from({length: DPC_WAVE_LENGTH}, (_, i) => (i < DPC_WAVE_LENGTH / 4 ? 1 : 0)),
};

const samplesOf = (sound) => {
  const wave = dpcWaveOf(sound);
  return wave.some((value) => value > 0) ? wave : null;
};

// How much of a waveform's energy is in each of its first 15 harmonics - what makes a tone sound the way it does,
// whatever its pitch.
const spectrum = (samples) => {
  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  const bins = [];
  for (let k = 1; k <= 15; k++) {
    let re = 0;
    let im = 0;
    samples.forEach((value, i) => {
      re += (value - mean) * Math.cos(2 * Math.PI * k * i / samples.length);
      im += (value - mean) * Math.sin(2 * Math.PI * k * i / samples.length);
    });
    bins.push(Math.hypot(re, im));
  }
  const total = bins.reduce((a, b) => a + b, 0) || 1;
  return bins.map((value) => value / total);
};

// The AUDC and AUDF that sound closest to a DPC+ waveform at a frequency: each type is judged on how near its
// harmonics are to the waveform's, with a pitch the type can't reach (its AUDF runs out at 0 or 31) counting against it.
const closestStandardSound = (samples, frequency, config) => {
  const target = spectrum(samples);
  let best = null;
  Object.keys(AUDC_CHIPS).forEach((audc) => {
    const tia = waveFor(shapeForAudc(audc));
    const {slow} = AUDC_CHIPS[audc]();
    const exact = clockFor(config, slow) / (tia.chipsPerCycle * Math.max(frequency, 0.001)) - 1;
    const audf = Math.min(31, Math.max(0, Math.round(exact)));
    const actual = clockFor(config, slow) / (audf + 1) / tia.chipsPerCycle;
    const cents = Math.abs(1200 * Math.log2(actual / Math.max(frequency, 0.001)));
    const distance = spectrum(tia.samples).reduce((sum, value, i) => sum + Math.abs(value - target[i]), 0);
    // A whole tone out of tune costs about as much as a completely different harmonic make-up.
    const score = distance + cents / 200;
    if (!best || score < best.score) best = {audc, audf, score};
  });
  return best;
};

// Turns a DPC+ sound back into a Standard one, in place. A TIA waveform goes back to exactly its type; any other
// waveform becomes the type that sounds closest ({approximated: true}). {converted: false} only for a sound with no
// waveform to compare.
export const convertSoundToStandard = (sound, config) => {
  if (!isDpcPlusSound(sound)) return {converted: false, unchanged: true};
  const clear = () => {
    delete sound.dpcShape;
    delete sound.dpcFrequency;
    delete sound.dpcWave;
    delete sound.dpcWaveBars;
    delete sound.dpcTiaEdited;
  };
  if (sound.dpcShape === 'off') {
    clear();
    return {converted: true};
  }
  // A sound keeps its Standard type and frequency (what channel 1 plays) when they were set by hand, when it came
  // from a Standard sound as it was (TIA waveforms), and when it is percussion that became noise.
  if (sound.audc !== undefined && (sound.dpcTiaEdited || sound.dpcShape === 'noise' ||
    sound.dpcShape === presetForAudc(sound.audc) || audcForShape(sound.dpcShape))) {
    clear();
    return {converted: true};
  }
  const audc = audcForShape(sound.dpcShape);
  if (audc) {
    const {slow} = AUDC_CHIPS[Number(audc)]();
    const cycles = waveFor(shapeForAudc(audc)).chipsPerCycle;
    // The AUDF that gives the closest pitch, in the 0-31 range the chip has.
    const exact = clockFor(config, slow) / (cycles * Math.max(sound.dpcFrequency, 0.001)) - 1;
    sound.audc = audc;
    sound.audf = Math.min(31, Math.max(0, Math.round(exact)));
    clear();
    return {converted: true};
  }
  const samples = samplesOf(sound);
  if (!samples) {
    return {converted: false, reason: `its waveform (${sound.dpcShape}) is not one that can be turned into a Standard sound`};
  }
  const closest = closestStandardSound(samples, sound.dpcFrequency, config);
  const shape = sound.dpcShape;
  sound.audc = closest.audc;
  sound.audf = closest.audf;
  clear();
  return {converted: true, approximated: `${shape} waveform became sound type ${closest.audc}`};
};

// Converts every sound in the list to the kernel ('dpcplus' or 'standard'). Returns the sounds that
// could not be converted (with .approximated listing the ones that became the closest Standard type).
export const convertSoundsToKernel = (soundEffects, kernel, config) => {
  const failed = [];
  const approximated = [];
  (soundEffects || []).forEach((sound) => {
    if (kernel === 'dpcplus') {
      convertSoundToDpcPlus(sound, config);
    } else {
      const result = convertSoundToStandard(sound, config);
      const name = sound.name || `Sound ${sound.id}`;
      if (result.reason) failed.push({name, reason: result.reason});
      if (result.approximated) approximated.push({name, note: result.approximated});
    }
  });
  failed.approximated = approximated;
  return failed;
};

export const kernelOfSound = (sound) => (isDpcPlusSound(sound) ? 'dpcplus' : 'standard');

export const KERNEL_NAMES = {standard: 'Standard', dpcplus: 'DPC+'};
