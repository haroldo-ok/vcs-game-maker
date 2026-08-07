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

// Advances a Galois LFSR by one step. The tap patterns aren't claimed to
// match the real TIA polynomials exactly, they just need to produce an
// audibly pseudo-random (as opposed to perfectly periodic) bit sequence.
// 9 bits is AUDC 8's real "9-bit poly" - a much longer repeat period than
// the 4/5-bit ones is what actually gives it a "white noise" character on
// real hardware, not literal per-sample randomness (see AUDC_APPROXIMATIONS'
// own comment on why '8' used to be modeled as unclocked noise instead).
const TAPS_BY_BITS = {4: 0b1001, 5: 0b10010, 9: 0b100010000};
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

// Per-AUDC approximation. type is 'square' (clean pure tone) or 'buzz'
// (LFSR-driven, clocked directly off the shift register rate). slowClock
// marks the AUDC values documented as running off the slower CPUclock/114
// base rather than pixelclock/114.
const AUDC_APPROXIMATIONS = {
  '0': null,
  '1': {type: 'buzz', bits: 4},
  '2': {type: 'buzz', bits: 4, lowpass: true},
  '3': {type: 'buzz', bits: 5, wavering: true},
  '4': {type: 'square'},
  '5': {type: 'square'},
  '6': {type: 'buzz', bits: 5},
  '7': {type: 'buzz', bits: 5},
  // Was modeled as unclocked, full-sample-rate white noise - real AUDC 8
  // ("9-bit poly") is clocked at exactly the same chip rate as every other
  // buzz value; ignoring AUDF like that meant this was the only AUDC value
  // whose preview pitch never matched the real ROM's output (confirmed:
  // Javatari's actual playback clearly tracks AUDF, the old preview didn't
  // move at all). A 9-bit LFSR just has a period long enough (511 steps) to
  // sound broadband/noisy rather than a repeating buzz, without needing
  // per-sample randomness.
  '8': {type: 'buzz', bits: 9},
  '9': {type: 'buzz', bits: 5},
  '10': {type: 'buzz', bits: 4},
  '11': null,
  '12': {type: 'square', slowClock: true},
  '13': {type: 'square', slowClock: true},
  '14': {type: 'buzz', bits: 4, lowpass: true},
  '15': {type: 'buzz', bits: 4, lowpass: true},
};

// Matches generators/bbasic/soundfx.js's own FADE_TAIL_FRAMES/fadeTargetVolume
// - the compiled ROM drops to about a quarter volume for the last 4 frames
// (60fps) rather than a smooth ramp, so the preview steps down the same way
// instead of a continuous fade, to actually sound like what plays in game.
const FADE_TAIL_SECONDS = 4 / 60;
const fadeTargetGain = (peakGain) => peakGain * (Math.round(15 / 4) / 15);

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
  if (approximation.type === 'buzz') {
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
