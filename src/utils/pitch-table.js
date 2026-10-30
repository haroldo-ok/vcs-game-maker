'use strict';

import {buildEnvelopeCurve} from './envelope';
import {frequencyForTia} from './dpc-sound';

// The pitch (AUDF, 0 to 31) a sound has on each frame it plays, for a sound whose pitch changes over its length: a frequency sweep,
// a frequency envelope, an arpeggio. Shared by the ROM generator (which turns it into a data table the per-frame check reads), the
// Sound tab's preview and the sound card, so what is heard in the browser is what the ROM plays. null for a sound whose pitch stays put.
//
// The three effects are applied in this order: the sweep moves the base pitch, the frequency envelope adds an offset to it, and the
// arpeggio then flips between that pitch and a second one.

export const SWEEP_FRAME_OPTIONS = [1, 2, 3, 4, 6, 8];
export const DEFAULT_SWEEP_END = 31;
export const DEFAULT_SWEEP_STEP = 1;
export const DEFAULT_SWEEP_FRAMES = 1;
export const MAX_SWEEP_STEP = 8;

export const DEFAULT_PITCH_ENVELOPE_AMOUNT = 8;
export const MAX_PITCH_ENVELOPE_AMOUNT = 31;
// A pitch envelope starts out as a short fall back to the sound's pitch.
export const DEFAULT_PITCH_ENVELOPE_ATTACK = 0;
export const DEFAULT_PITCH_ENVELOPE_DECAY = 8;
export const DEFAULT_PITCH_ENVELOPE_DECAY_END = 0;
export const DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH = 0;
export const DEFAULT_PITCH_ENVELOPE_RELEASE_START = 0;
export const DEFAULT_PITCH_ENVELOPE_RELEASE = 0;

// The longest a sound with a changing pitch can be: one table entry per frame, read through an 8-bit index.
export const MAX_PITCH_TABLE_FRAMES = 255;

// Mirrors ARPEGGIO_PHASE_SEQUENCES in utils/sound-preview.js and generators/bbasic/music.js (by ARPEGGIO_RANGE_* index in
// blocks/soundfx.js).
const ARPEGGIO_PHASE_SEQUENCES = [
  ['base', 'alt'],
  ['alt', 'base'],
  ['base', 'alt', 'upBase', 'upAlt'],
  ['base', 'alt', 'downBase', 'downAlt'],
  ['base', 'alt', 'base'],
  ['base', 'alt', 'upBase', 'upAlt', 'upBase', 'alt'],
];

const clampAudf = (value) => Math.max(0, Math.min(31, Math.round(value)));

// Without a song to take a tempo from, the arpeggio's speed (a note division of a step) is worked out as at the default tempo, the
// way the preview always did (a step is 30 / DEFAULT_TEMPO seconds; DEFAULT_TEMPO in blocks/music.js is 140, not imported here
// to keep this file free of the Blockly blocks).
const FRAMES_PER_STEP = 30 / 140 * 60;
const MAX_ARPEGGIO_SPEED_FRAMES = 15;

export const hasChangingPitch = (soundEffect) =>
  !!(soundEffect && (soundEffect.sweep || soundEffect.pitchEnvelope || soundEffect.arpeggio));

// arpeggioFrames: how many frames each arpeggio flip lasts, when the caller knows the tempo of the song the sound plays in (a Music tab
// note); without it the default tempo's is used.
export const buildPitchTable = (soundEffect, {arpeggioFrames: songArpeggioFrames = 0} = {}) => {
  if (!hasChangingPitch(soundEffect)) return null;
  const frames = Math.max(0, Math.min(MAX_PITCH_TABLE_FRAMES, Math.round(Number(soundEffect.duration) || 0)));
  if (frames <= 0) return null;
  const start = clampAudf(Number(soundEffect.audf) || 0);

  // The sweep: one step of sweepStep every sweepFrames frames from the sound's frequency towards the end frequency; with Repeat it
  // goes back to the start after reaching the end, without it stays on the end.
  // With Wrap on it goes the other way round, through 31 and 0: from 30 to 20 that is 30, 31, 0, 1 ... 20, not 30, 29 ... 20.
  const sweepPitch = (frame) => {
    if (!soundEffect.sweep) return start;
    const end = clampAudf(Number(soundEffect.sweepEnd));
    const wrap = !!soundEffect.sweepWrap && end !== start;
    const direction = (end >= start) === !wrap ? 1 : -1;
    const span = wrap ? (direction * (end - start) + 32) % 32 : Math.abs(end - start);
    if (span === 0) return start;
    const step = Math.max(1, Math.min(MAX_SWEEP_STEP, Math.round(Number(soundEffect.sweepStep) || 1)));
    const every = Math.max(1, Math.round(Number(soundEffect.sweepFrames) || 1));
    const positions = Math.floor(span / step) + 1;
    const stepNumber = Math.floor(frame / every);
    const position = soundEffect.sweepRepeat ? stepNumber % positions : Math.min(stepNumber, positions - 1);
    return (start + direction * Math.min(span, position * step) + 32) % 32;
  };

  // The frequency envelope: its shape (the same stages as the volume envelope) scales the amount, which is added to the pitch.
  let offsets = null;
  if (soundEffect.pitchEnvelope) {
    const curve = buildEnvelopeCurve({
      attack: soundEffect.pitchEnvelopeAttack, decay: soundEffect.pitchEnvelopeDecay,
      decayEndPercent: soundEffect.pitchEnvelopeDecayEnd, releaseStartPercent: soundEffect.pitchEnvelopeReleaseStart,
      attackEndPercent: soundEffect.pitchEnvelopeAttackEnd,
      sustainLength: soundEffect.pitchEnvelopeSustainLength, release: soundEffect.pitchEnvelopeRelease,
      peakVolume: 15, totalFrames: frames,
    });
    const amount = Math.max(-MAX_PITCH_ENVELOPE_AMOUNT, Math.min(MAX_PITCH_ENVELOPE_AMOUNT,
        Math.round(Number(soundEffect.pitchEnvelopeAmount) || 0)));
    offsets = curve.map((level) => Math.round(amount * level / 15));
  }

  // The arpeggio: flips every few frames between the pitch and a second one (a lower AUDF, so a higher pitch), through the range's
  // sequence. AUDF is a divisor, so up an octave is half and down an octave is double.
  const arpeggioFrames = !soundEffect.arpeggio ? 0 : songArpeggioFrames > 0 ? songArpeggioFrames :
    Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(FRAMES_PER_STEP / (Number(soundEffect.arpeggioDivision) || 8))));
  const sequence = ARPEGGIO_PHASE_SEQUENCES[Number(soundEffect.arpeggioRange) || 0] || ARPEGGIO_PHASE_SEQUENCES[0];
  const interval = Number(soundEffect.arpeggioInterval) || 0;

  const table = [];
  for (let frame = 0; frame < frames; frame++) {
    let pitch = clampAudf(sweepPitch(frame) + (offsets ? offsets[frame] : 0));
    if (arpeggioFrames) {
      const alt = clampAudf(pitch - interval);
      const variants = {
        base: pitch, alt, upBase: Math.floor(pitch / 2), upAlt: Math.floor(alt / 2),
        downBase: clampAudf(pitch * 2), downAlt: clampAudf(alt * 2),
      };
      pitch = variants[sequence[Math.floor(frame / arpeggioFrames) % sequence.length]];
    }
    table.push(pitch);
  }
  return table;
};

// The table the per-frame check of a ROM reads: indexed by the frames the sound has left (its duration counter, after that frame's
// countdown), 1 to duration - 1, with the entry for the frame the sound starts on at the top too. Index 0 is never read.
// A sound that loops is started with a duration one frame longer (see soundfx_play), so it plays all of its frames every time round:
// it then has duration frames left after the countdown on its first frame, not duration - 1.
export const pitchTableByFramesLeft = (table, loops = false) => {
  const duration = table.length;
  if (loops) return [table[0], ...Array.from({length: duration}, (_, i) => table[duration - 1 - i])];
  const byLeft = [table[0]];
  for (let left = 1; left <= duration; left++) byLeft.push(table[left >= duration ? 0 : duration - 1 - left]);
  return byLeft;
};

// The same for a sound of the DPC+ sound chip, whose pitch is not a divider but a frequency: the number of semitones each frame is
// above (or below) the sound's pitch, null for a sound whose pitch stays put. The sweep goes from the sound's note to the note
// dpcSweepEnd (a key of the piano, by its MIDI number) sweepStep semitones every sweepFrames frames, the frequency envelope moves the pitch by up
// to its amount in semitones, and the arpeggio flips between the pitch and one interval semitones up (and octaves up or down).
// startHz is the frequency of the sound (or of the note on the Music tab).
const DPC_ARPEGGIO_SEQUENCES = [
  ['B', 'A'], ['A', 'B'], ['B', 'A', 'UB', 'UA'], ['B', 'A', 'DB', 'DA'], ['B', 'A', 'B'],
  ['B', 'A', 'UB', 'UA', 'UB', 'A'],
];

export const MAX_DPC_SWEEP_STEP = 12;

export const dpcKeyForHz = (hz) => Math.round(12 * Math.log2(Math.max(hz, 1) / 440) + 69) - 20;

// Whether a sound of the DPC+ chip follows the pitch of its Standard settings (see buildDpcPitchOffsets): when it says so itself, and
// otherwise for a sweep that has no end note set.
export const dpcFollowsStandardPitch = (soundEffect) => !!(soundEffect && (soundEffect.dpcSweepMatch !== undefined ?
  soundEffect.dpcSweepMatch : soundEffect.sweep && !soundEffect.dpcSweepEnd));

export const buildDpcPitchOffsets = (soundEffect, startHz, {arpeggioFrames: songArpeggioFrames = 0} = {}) => {
  if (!hasChangingPitch(soundEffect)) return null;
  const frames = Math.max(0, Math.min(MAX_PITCH_TABLE_FRAMES, Math.round(Number(soundEffect.duration) || 0)));
  if (frames <= 0) return null;

  // A sound that follows the pitch of its Standard (TIA) settings: each frame the chip plays the frequency the TIA's divider of that frame
  // gives (the sweep, the frequency envelope and the arpeggio of the Standard settings, steps of the divider, not of semitones), as
  // semitones above the pitch of the sound's frequency divider. So the chip sweeps through the same pitches as the TIA does.
  if (dpcFollowsStandardPitch(soundEffect)) {
    const table = buildPitchTable(soundEffect, {arpeggioFrames: songArpeggioFrames});
    const baseHz = frequencyForTia(soundEffect.audc, clampAudf(Number(soundEffect.audf) || 0), {});
    if (table && baseHz > 0) {
      return table.map((audf) => {
        const hz = frequencyForTia(soundEffect.audc, audf, {});
        return hz > 0 ? 12 * Math.log2(hz / baseHz) : 0;
      });
    }
  }

  const startKey = dpcKeyForHz(startHz);
  // dpcSweepEnd is the MIDI number of the note the sweep ends on (0 for none yet), key 1 of the piano being MIDI 21.
  const endKey = Math.max(1, Math.min(88, soundEffect.dpcSweepEnd ? Math.round(Number(soundEffect.dpcSweepEnd)) - 20 : startKey));
  const sweepOffset = (frame) => {
    if (!soundEffect.sweep) return 0;
    const span = Math.abs(endKey - startKey);
    if (span === 0) return 0;
    const step = Math.max(1, Math.min(MAX_DPC_SWEEP_STEP, Math.round(Number(soundEffect.sweepStep) || 1)));
    const every = Math.max(1, Math.round(Number(soundEffect.sweepFrames) || 1));
    const positions = Math.floor(span / step) + 1;
    const stepNumber = Math.floor(frame / every);
    const position = soundEffect.sweepRepeat ? stepNumber % positions : Math.min(stepNumber, positions - 1);
    return Math.sign(endKey - startKey) * Math.min(span, position * step);
  };

  let envelopeOffsets = null;
  if (soundEffect.pitchEnvelope) {
    const curve = buildEnvelopeCurve({
      attack: soundEffect.pitchEnvelopeAttack, decay: soundEffect.pitchEnvelopeDecay,
      decayEndPercent: soundEffect.pitchEnvelopeDecayEnd, releaseStartPercent: soundEffect.pitchEnvelopeReleaseStart,
      attackEndPercent: soundEffect.pitchEnvelopeAttackEnd,
      sustainLength: soundEffect.pitchEnvelopeSustainLength, release: soundEffect.pitchEnvelopeRelease,
      peakVolume: 15, totalFrames: frames,
    });
    const amount = Math.max(-MAX_PITCH_ENVELOPE_AMOUNT, Math.min(MAX_PITCH_ENVELOPE_AMOUNT,
        Math.round(Number(soundEffect.pitchEnvelopeAmount) || 0)));
    envelopeOffsets = curve.map((level) => Math.round(amount * level / 15));
  }

  const arpeggioFrames = !soundEffect.arpeggio ? 0 : songArpeggioFrames > 0 ? songArpeggioFrames :
    Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(FRAMES_PER_STEP / (Number(soundEffect.arpeggioDivision) || 8))));
  const sequence = DPC_ARPEGGIO_SEQUENCES[Number(soundEffect.arpeggioRange) || 0] || DPC_ARPEGGIO_SEQUENCES[0];
  const interval = Number(soundEffect.arpeggioInterval) || 0;
  const arpeggioShift = (token) => (token.endsWith('A') ? interval : 0) + (token[0] === 'U' ? 12 : token[0] === 'D' ? -12 : 0);

  const offsets = [];
  for (let frame = 0; frame < frames; frame++) {
    let offset = sweepOffset(frame) + (envelopeOffsets ? envelopeOffsets[frame] : 0);
    if (arpeggioFrames) offset += arpeggioShift(sequence[Math.floor(frame / arpeggioFrames) % sequence.length]);
    offsets.push(offset);
  }
  return offsets;
};
