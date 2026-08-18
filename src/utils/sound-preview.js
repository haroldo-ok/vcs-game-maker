'use strict';

import {DEFAULT_TEMPO} from '../blocks/music';
import {DEFAULT_ARPEGGIO_DIVISION} from '../blocks/soundfx';

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
// of replacing it) can cut it off early. An array (not a single source)
// since an arpeggiating buffer-based instrument schedules several short
// back-to-back segments instead of one - see previewSoundEffect below.
let activeSources = [];
let activeGainNode = null;
// A short linear ramp to silence before actually stopping the source, to
// avoid the audible click a hard, instant stop mid-waveform would cause.
const STOP_FADE_SECONDS = 0.02;

const stopActivePreview = () => {
  if (!activeSources.length) return;
  const context = getAudioContext();
  const now = context.currentTime;
  if (activeGainNode) {
    activeGainNode.gain.cancelScheduledValues(now);
    activeGainNode.gain.setValueAtTime(activeGainNode.gain.value, now);
    activeGainNode.gain.linearRampToValueAtTime(0, now + STOP_FADE_SECONDS);
  }
  activeSources.forEach((source) => {
    try {
      source.stop(now + STOP_FADE_SECONDS);
    } catch (e) {
      // Already stopped/never started - nothing left to do.
    }
  });
  activeSources = [];
  activeGainNode = null;
};

// Mirrors ARPEGGIO_PHASE_SEQUENCES in generators/bbasic/music.js and
// utils/music-playback.js exactly (by ARPEGGIO_RANGE_* index - see
// blocks/soundfx.js) - duplicated rather than imported since
// music-playback.js already imports from this module, and importing back
// would make the two circular (same reasoning as that module's own
// duplicate of this sequence).
const ARPEGGIO_PHASE_SEQUENCES = [
  ['base', 'alt'], // UP 1 OCT
  ['alt', 'base'], // DOWN 1 OCT
  ['base', 'alt', 'upBase', 'upAlt'], // UP 2 OCT
  ['base', 'alt', 'downBase', 'downAlt'], // DOWN 2 OCT
  ['base', 'alt', 'base'], // UP-DOWN 1 OCT
  ['base', 'alt', 'upBase', 'upAlt', 'upBase', 'alt'], // UP-DOWN 2 OCT
];

// Same derivation as music-playback.js's own arpeggioPitchVariants - AUDF is
// a frequency divisor, so alt (base minus interval) sounds higher than base,
// up is base halved (one octave higher), down is base doubled (one octave
// lower), all wrapped to the hardware's real 5-bit AUDF range.
const arpeggioPitchVariants = (audf, arpeggioInterval) => {
  const base = audf & 31;
  const alt = (base - arpeggioInterval) & 31;
  return {
    base,
    alt,
    upBase: Math.floor(base / 2),
    upAlt: Math.floor(alt / 2),
    downBase: (base * 2) & 31,
    downAlt: (alt * 2) & 31,
  };
};

// Same per-frame flip rate the compiled ROM's own arpeggio timer uses (see
// generateMusicChecks in generators/bbasic/music.js) and MAX_ARPEGGIO_SPEED_
// FRAMES' 4-bit-nibble ceiling there - duplicated for the same
// avoid-a-circular-import reason as ARPEGGIO_PHASE_SEQUENCES above.
const FRAMES_PER_SECOND = 60;
const MAX_ARPEGGIO_SPEED_FRAMES = 15;

/** Stops whatever sound effect preview is currently playing, if any. */
export const stopSoundEffectPreview = () => {
  stopActivePreview();
};

/**
 * Plays a short approximation of a TIA sound effect for previewing in the
 * editor. duration is in NTSC frames (60 per second), matching the generated
 * bBasic code's units. arpeggio/arpeggioDivision/arpeggioInterval/
 * arpeggioRange are the instrument's own Arpeggio fields (see blocks/
 * soundfx.js) - when arpeggio is on, the preview steps through the same
 * pitch sequence the compiled ROM would (see generateMusicChecks in
 * generators/bbasic/music.js) instead of holding one static pitch. There's
 * no song/pattern tempo to convert arpeggioDivision against here (this is a
 * standalone preset preview, not a placed note), so it's anchored to
 * DEFAULT_TEMPO instead - the same fallback previewPatternNote in
 * utils/music-playback.js uses for the same reason.
 */
export const previewSoundEffect = ({
  audc, audf, audv, duration, fade, arpeggio, arpeggioDivision, arpeggioInterval, arpeggioRange,
}) => {
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
  gainNode.connect(context.destination);

  const stepSeconds = 30 / DEFAULT_TEMPO;
  const arpeggioSpeedFrames = arpeggio ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(
      (stepSeconds / (Number(arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)) * FRAMES_PER_SECOND,
  ))) : 0;
  const flipSeconds = arpeggioSpeedFrames / FRAMES_PER_SECOND;

  const sources = [];

  if (approximation.type === 'square') {
    const oscillator = context.createOscillator();
    oscillator.type = 'square';
    if (!arpeggioSpeedFrames) {
      oscillator.frequency.setValueAtTime(shiftClockFor(audf, {slowClock: approximation.slowClock}) / 2, now);
    } else {
      const variants = arpeggioPitchVariants(audf, Number(arpeggioInterval) || 0);
      const sequence = ARPEGGIO_PHASE_SEQUENCES[Number(arpeggioRange) || 0] || ARPEGGIO_PHASE_SEQUENCES[0];
      let t = now;
      let phase = 0;
      while (t < now + seconds) {
        const pitchAudf = variants[sequence[phase % sequence.length]];
        oscillator.frequency.setValueAtTime(shiftClockFor(pitchAudf, {slowClock: approximation.slowClock}) / 2, t);
        phase++;
        t += flipSeconds;
      }
    }
    oscillator.connect(gainNode);
    oscillator.start(now);
    oscillator.stop(now + seconds);
    sources.push(oscillator);
  } else {
    const buildBuffer = (chipClockHz, segmentSeconds) => {
      if (approximation.type === 'div31') return buildDiv31Buffer(context, chipClockHz, segmentSeconds);
      if (approximation.type === 'gatedbuzz') return buildGatedBuzzBuffer(context, chipClockHz, segmentSeconds);
      return buildBuzzBuffer(context, chipClockHz, segmentSeconds, approximation.bits,
          {stepDivider: approximation.stepDivider});
    };
    if (!arpeggioSpeedFrames) {
      const source = context.createBufferSource();
      source.buffer = buildBuffer(shiftClockFor(audf, {slowClock: approximation.slowClock}), seconds);
      source.connect(gainNode);
      source.start(now);
      source.stop(now + seconds);
      sources.push(source);
    } else {
      // A buffer is pre-rendered for one fixed clock, so its pitch can't be
      // automated live like an oscillator's - scheduled as several short
      // back-to-back buffers instead, one per flip, each built at that
      // phase's own pitch (matches how music-playback.js's own
      // playInstrumentHit previews a buzzy/noisy arpeggiating instrument).
      const variants = arpeggioPitchVariants(audf, Number(arpeggioInterval) || 0);
      const sequence = ARPEGGIO_PHASE_SEQUENCES[Number(arpeggioRange) || 0] || ARPEGGIO_PHASE_SEQUENCES[0];
      let t = now;
      let phase = 0;
      while (t < now + seconds) {
        const segmentSeconds = Math.min(flipSeconds, now + seconds - t);
        const pitchAudf = variants[sequence[phase % sequence.length]];
        const source = context.createBufferSource();
        source.buffer = buildBuffer(shiftClockFor(pitchAudf, {slowClock: approximation.slowClock}), segmentSeconds);
        source.connect(gainNode);
        source.start(t);
        source.stop(t + segmentSeconds);
        sources.push(source);
        phase++;
        t += flipSeconds;
      }
    }
  }

  activeSources = sources;
  activeGainNode = gainNode;
  const lastSource = sources[sources.length - 1];
  if (lastSource) {
    lastSource.onended = () => {
      // Only clear if this preview's sources are still the active ones - a
      // Stop press (or a newer preview replacing this one) already did its
      // own cleanup, and this handler firing afterward (stopping a node
      // fires "ended" too) shouldn't clobber whatever's playing now.
      if (activeSources === sources) {
        activeSources = [];
        activeGainNode = null;
      }
    };
  }
};
