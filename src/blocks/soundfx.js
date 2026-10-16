'use strict';

import Vue from 'vue';
import * as Blockly from 'blockly/core';

import {useSoundEffectsStorage} from '../hooks/project';
import {channelOptions} from './sound';
import {SOUND_ICON} from './icon';
import {STAIRCASE_FRAME_OPTIONS, DEFAULT_STAIRCASE_STEP, DEFAULT_STAIRCASE_FRAMES, MAX_STAIRCASE_STEP} from '../utils/staircase';
import {SWEEP_FRAME_OPTIONS, DEFAULT_SWEEP_END, DEFAULT_SWEEP_STEP, DEFAULT_SWEEP_FRAMES, MAX_SWEEP_STEP,
  DEFAULT_PITCH_ENVELOPE_AMOUNT, MAX_PITCH_ENVELOPE_AMOUNT, DEFAULT_PITCH_ENVELOPE_ATTACK, DEFAULT_PITCH_ENVELOPE_DECAY,
  DEFAULT_PITCH_ENVELOPE_DECAY_END, DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH, DEFAULT_PITCH_ENVELOPE_RELEASE_START,
  DEFAULT_PITCH_ENVELOPE_RELEASE} from '../utils/pitch-table';

const SOUND_COLOR = 'rgb(156, 39, 176)';

// How often the arpeggio flips pitch, as a note division relative to the
// song/pattern's  tempo (matching DURATION_SUBDIVISION_OPTIONS' style in
// blocks/music.js) - e.g. 8 means "flip every 1/8 step", so the arpeggio
// speeds up and slows down with the song instead of staying a fixed frame
// count. Converted to an actual frame count (and clamped to the 4-bit
// nibble it has to fit in - see generators/bbasic/music.js's eventsToBytes)
// per-note at data-generation time, since the conversion depends on
// whichever pattern's tempo that note is actually played in.
export const ARPEGGIO_DIVISION_OPTIONS = [1, 2, 4, 8, 16, 32];
export const DEFAULT_ARPEGGIO_DIVISION = 8;

// Default fixed AUDF bump between the note's  pitch and the "other"
// arpeggio pitch.
export const DEFAULT_ARPEGGIO_INTERVAL = 3;
// Must fit in the 3 spare bits alongside the real AUDF value (see
// generators/bbasic/music.js's eventsToBytes - AUDF hardware only reads the
// low 5 bits, leaving 3 free).
export const MIN_ARPEGGIO_INTERVAL = 1;
export const MAX_ARPEGGIO_INTERVAL = 7;

// Shape + range of the arpeggio pattern, like an old-style synth
// arpeggiator's range setting - see ARPEGGIO_PHASE_SEQUENCES in
// generators/bbasic/music.js for the exact note order each one plays:
// - UP/DOWN 1 OCT: the note's  pitch and pitch+interval, in ascending or
//   descending order.
// - UP/DOWN 2 OCT: that same two-note pattern, then repeats it one octave
//   up or down (pitch halved/doubled, since AUDF is a frequency divisor).
// - UP-DOWN 1/2 OCT: ascends through the pattern, then back down again,
//   within one or two octaves.
export const ARPEGGIO_RANGE_UP_1_OCT = 0;
export const ARPEGGIO_RANGE_DOWN_1_OCT = 1;
export const ARPEGGIO_RANGE_UP_2_OCT = 2;
export const ARPEGGIO_RANGE_DOWN_2_OCT = 3;
export const ARPEGGIO_RANGE_UP_DOWN_1_OCT = 4;
export const ARPEGGIO_RANGE_UP_DOWN_2_OCT = 5;
export const DEFAULT_ARPEGGIO_RANGE = ARPEGGIO_RANGE_UP_1_OCT;
// Display order only - the stored value (see ARPEGGIO_RANGE_* above) is
// what generators/bbasic/music.js and utils/music-playback.js actually key
// off of (an index into their  ARPEGGIO_PHASE_SEQUENCES), so reordering
// this list doesn't require touching either of them.
export const ARPEGGIO_RANGE_OPTIONS = [
  ['UP 2 OCT', ARPEGGIO_RANGE_UP_2_OCT],
  ['UP 1 OCT', ARPEGGIO_RANGE_UP_1_OCT],
  ['DOWN 1 OCT', ARPEGGIO_RANGE_DOWN_1_OCT],
  ['DOWN 2 OCT', ARPEGGIO_RANGE_DOWN_2_OCT],
  ['UP-DOWN 1 OCT', ARPEGGIO_RANGE_UP_DOWN_1_OCT],
  ['UP-DOWN 2 OCT', ARPEGGIO_RANGE_UP_DOWN_2_OCT],
];

// ADSR volume envelope, shared by both this preset's one-shot Sound Effect
// use (soundfx_play - see generators/bbasic/soundfx.js) and its Music-tab
// instrument use (see generators/bbasic/music.js) - replaces the old
// single-stage "Fade" toggle entirely (Fade was just a degenerate envelope:
// instant attack, no decay, hold, then release - see utils/envelope.js's
// buildEnvelopeCurve, which now covers both shapes).
//
// Attack/Decay/Release are frame counts; Decay End and Release Start are
// LEVELS (percent of this sound's peak volume), not durations - see
// utils/envelope.js's comment for why. There's deliberately no single
// "sustain level" field: Decay End is where Decay bottoms out (and Sustain
// starts from), Release Start is where Sustain ends (and Release starts
// from) - previously these were the same one value, always held flat for
// Sustain's whole length, which made it impossible for Release to start
// any higher than wherever Sustain had settled (a real reported request:
// "increase the volume at the release point above the volume set for
// sustain"). Small, fixed dropdown option sets (not free-typed numbers) are
// deliberate, same reasoning the old fade-length dropdowns already
// established: keeps the total number of DISTINCT envelope shapes a
// project can generate small, which keeps the compiled ROM's per-config
// data tables small too (see generateEnvelopeChecks in
// generators/bbasic/soundfx.js).
export const ENVELOPE_STAGE_FRAME_OPTIONS = [0, 2, 4, 8, 16, 32, 64];
// Attack/Release specifically (not Decay, which stays on the smaller set
// above) get a wider range up to 32 frames - confirmed with the user: only
// those two needed expanding, not Decay. Each stage's  table cost (see
// buildEnvelopeConfigTables in generators/bbasic/soundfx.js) is still just
// one ROM byte per frame of that specific stage, so this only makes an
// envelope that actually USES a longer attack/release slightly bigger, not
// every envelope in the project.
export const ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS = [0, 2, 4, 8, 16, 32, 64];
export const DEFAULT_ENVELOPE_ATTACK = 0;
export const DEFAULT_ENVELOPE_DECAY = 0;
export const DEFAULT_ENVELOPE_RELEASE = 4;
// Shared by both Decay End and Release Start (see the class-level comment
// above) - same option set/default the old single Sustain level field used,
// so a preset that never touches either new field still sounds the same as
// it did under the old flat-Sustain model (Decay End === Release Start ===
// 100% by default, same as Sustain defaulting to 100% used to be).
export const ENVELOPE_VOLUME_PERCENT_OPTIONS = [0, 25, 50, 75, 100];
export const DEFAULT_ENVELOPE_VOLUME_PERCENT = 100;
// How many frames the Sustain ramp itself lasts - same small-fixed-dropdown
// reasoning as every other stage above, same range as Attack/Release (see
// ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS' comment). Release now always
// starts immediately after Sustain ends (see clampEnvelopeStages/
// buildEnvelopeCurve in utils/envelope.js) rather than always ending exactly
// on the sound/note's last frame the way it used to when Sustain had no
// length - a real reported request ("I should be able to shorten
// the sustain to 0"), which wasn't actually possible before this existed:
// Sustain used to just be "however long is left," with no way to make that
// zero regardless of how short Attack/Decay/Release were set. Defaults to
// the max option (32) so an existing preset saved before this field existed
// (see its migration clamp below) keeps sounding close to its old
// "holds until Release" behavior rather than suddenly cutting off early.
export const ENVELOPE_SUSTAIN_FRAME_OPTIONS = [0, 2, 4, 8, 16, 32, 64];
export const DEFAULT_ENVELOPE_SUSTAIN_FRAMES = 32;

// Only meaningful once a note actually overlaps another note on the same
// channel - see canPlaceNoteAt in MusicEditor.vue, which lets any
// instrument, tunable or noise, land on top of another track's note
// sharing the same channel. Ties (equal priority) still fall back to plain
// timing - whichever note starts later wins, same as before this existed -
// so this only needs to matter when a project actually wants one specific
// instrument (e.g. a kick) to never lose to another (e.g. a hi-hat)
// regardless of which one lands later in a pattern.
export const NOISE_PRIORITY_OPTIONS = [1, 2, 3, 4, 5];
export const DEFAULT_NOISE_PRIORITY = 1;

export const DEFAULT_SOUND_EFFECTS = {
  soundEffects: [
    {
      id: 1,
      name: 'Example blip',
      audc: '4',
      audf: 16,
      audv: 15,
      duration: 5,
      envelope: false,
      envelopeAttack: DEFAULT_ENVELOPE_ATTACK,
      envelopeDecay: DEFAULT_ENVELOPE_DECAY,
      envelopeDecayEnd: DEFAULT_ENVELOPE_VOLUME_PERCENT,
      envelopeReleaseStart: DEFAULT_ENVELOPE_VOLUME_PERCENT,
      envelopeSustainLength: DEFAULT_ENVELOPE_SUSTAIN_FRAMES,
      envelopeRelease: DEFAULT_ENVELOPE_RELEASE,
      // Only used for this preset's notes on the Music tab (see
      // generators/bbasic/music.js) - always on for every note played with
      // this instrument, not something set per-note. arpeggioDivision is how
      // often it flips (tempo-relative - see ARPEGGIO_DIVISION_OPTIONS),
      // arpeggioInterval the fixed AUDF bump between the two alternating
      // pitches.
      arpeggio: false,
      arpeggioDivision: DEFAULT_ARPEGGIO_DIVISION,
      arpeggioInterval: DEFAULT_ARPEGGIO_INTERVAL,
      arpeggioRange: DEFAULT_ARPEGGIO_RANGE,
      // See NOISE_PRIORITY_OPTIONS' comment.
      priority: DEFAULT_NOISE_PRIORITY,
      // A frequency sweep (utils/pitch-table.js): from the frequency above towards sweepEnd, sweepStep at a time every sweepFrames
      // frames, going back to the start when sweepRepeat is on. Only for a sound played from blocks, not on the Music tab.
      sweep: false,
      sweepEnd: DEFAULT_SWEEP_END,
      sweepStep: DEFAULT_SWEEP_STEP,
      sweepFrames: DEFAULT_SWEEP_FRAMES,
      sweepRepeat: false,
      // Goes the other way round, through 31 and 0.
      sweepWrap: false,
      // The sweep of a sound of the DPC+ chip ends on this note (a MIDI number; 0 for none yet) and steps in semitones.
      dpcSweepEnd: 0,
      // A staircase volume (utils/staircase.js): the volume envelope in steps of staircaseStep levels, each held staircaseFrames frames.
      staircase: false,
      staircaseStep: DEFAULT_STAIRCASE_STEP,
      staircaseFrames: DEFAULT_STAIRCASE_FRAMES,
      // A frequency envelope: the pitch moves by up to pitchEnvelopeAmount (AUDF steps, up or down) following the envelope's shape.
      pitchEnvelope: false,
      pitchEnvelopeAmount: DEFAULT_PITCH_ENVELOPE_AMOUNT,
      pitchEnvelopeAttack: DEFAULT_PITCH_ENVELOPE_ATTACK,
      pitchEnvelopeDecay: DEFAULT_PITCH_ENVELOPE_DECAY,
      pitchEnvelopeDecayEnd: DEFAULT_PITCH_ENVELOPE_DECAY_END,
      pitchEnvelopeSustainLength: DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH,
      pitchEnvelopeReleaseStart: DEFAULT_PITCH_ENVELOPE_RELEASE_START,
      pitchEnvelopeRelease: DEFAULT_PITCH_ENVELOPE_RELEASE,
      // A TIA color byte (utils/palette.js's index<<1 convention), or null
      // for "auto-assigned" - see utils/instrument-colors.js. Used by the
      // Music tab to color this sound's notes in the piano roll.
      color: null,
      // A display tag for the Sound tab's "show all/instruments/sounds"
      // filter (see SoundFXEditor.vue), but also the actual gate on the
      // Music tab's Instrument dropdown (see MusicEditor.vue's
      // soundEffectOptions, which only lists isInstrument sounds there).
      // The default sound starts as a plain sound effect; clicking its
      // icon on the Sound tab makes it an instrument.
      isInstrument: false,
      // A percussion sound (a drum hit): on the Music tab it plays from the Hit row at the pitch set here, never from
      // the piano keys. A sound is a sound effect, an instrument or percussion, never two of them.
      isPercussion: false,
    },
  ],
};

export const processSoundEffectsStorageDefaults = (soundEffectsStorage) => {
  const soundEffects = soundEffectsStorage.value;
  if (!soundEffects || !soundEffects.soundEffects || !soundEffects.soundEffects.length) {
    return structuredClone(DEFAULT_SOUND_EFFECTS);
  }
  // Presets saved before Arpeggio existed won't have these fields yet.
  soundEffects.soundEffects.forEach((soundEffect) => {
    soundEffect.arpeggio = !!soundEffect.arpeggio;
    // Vue.set (not a plain assignment) for every envelope* field below -
    // soundEffectsStorage is a Vue ref whose reactivity was already set up
    // (once, at load time - see hooks/storage.js's  ref(readInitial())
    // comment) from whatever plain JSON was in localStorage. A preset saved
    // before this feature existed simply never HAD an "envelope" key at
    // that point, so a plain "soundEffect.envelope = ..." assignment here
    // creates an ordinary, non-reactive property - Vue never defined a
    // getter/setter for a key that didn't exist during its  initial
    // walk. Confirmed as a real reported bug this way: the Envelope switch/
    // dropdowns/graph all silently stopped updating the view (toggling
    // Arpeggio - an OLD, already-reactive field - incidentally forced a
    // re-render that revealed the envelope fields' already-correct-but-
    // untracked values, and closing/reopening the card did the same via a
    // full remount). Vue.set defines the missing property properly instead,
    // exactly like $set is already used for the same reason elsewhere in
    // this app (see DataEditor.vue's  instance.proxy.$set calls).
    Vue.set(soundEffect, 'envelope', !!soundEffect.envelope);
    // Presets saved before this existed (or before it replaced the old
    // single-stage Fade) won't have these yet - same Number() coercion as
    // arpeggioDivision/arpeggioRange below, for the same Vuetify v-select
    // quirk.
    if (!ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS.includes(Number(soundEffect.envelopeAttack))) {
      Vue.set(soundEffect, 'envelopeAttack', DEFAULT_ENVELOPE_ATTACK);
    } else {
      Vue.set(soundEffect, 'envelopeAttack', Number(soundEffect.envelopeAttack));
    }
    if (!ENVELOPE_STAGE_FRAME_OPTIONS.includes(Number(soundEffect.envelopeDecay))) {
      Vue.set(soundEffect, 'envelopeDecay', DEFAULT_ENVELOPE_DECAY);
    } else {
      Vue.set(soundEffect, 'envelopeDecay', Number(soundEffect.envelopeDecay));
    }
    if (!ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS.includes(Number(soundEffect.envelopeRelease))) {
      Vue.set(soundEffect, 'envelopeRelease', DEFAULT_ENVELOPE_RELEASE);
    } else {
      Vue.set(soundEffect, 'envelopeRelease', Number(soundEffect.envelopeRelease));
    }
    // Presets saved before Decay End/Release Start replaced the old single
    // Sustain level won't have either new field yet, but WILL still have
    // its old envelopeSustain value - used as both new fields' fallback
    // (instead of DEFAULT_ENVELOPE_VOLUME_PERCENT) so an old project
    // imports sounding the same as it did under the old flat-Sustain model,
    // rather than silently resetting to 100% regardless of what it was
    // actually set to.
    const legacySustain = Number(soundEffect.envelopeSustain);
    const legacySustainFallback = ENVELOPE_VOLUME_PERCENT_OPTIONS.includes(legacySustain) ?
      legacySustain : DEFAULT_ENVELOPE_VOLUME_PERCENT;
    if (!ENVELOPE_VOLUME_PERCENT_OPTIONS.includes(Number(soundEffect.envelopeDecayEnd))) {
      Vue.set(soundEffect, 'envelopeDecayEnd', legacySustainFallback);
    } else {
      Vue.set(soundEffect, 'envelopeDecayEnd', Number(soundEffect.envelopeDecayEnd));
    }
    if (!ENVELOPE_VOLUME_PERCENT_OPTIONS.includes(Number(soundEffect.envelopeReleaseStart))) {
      Vue.set(soundEffect, 'envelopeReleaseStart', legacySustainFallback);
    } else {
      Vue.set(soundEffect, 'envelopeReleaseStart', Number(soundEffect.envelopeReleaseStart));
    }
    if (!ENVELOPE_SUSTAIN_FRAME_OPTIONS.includes(Number(soundEffect.envelopeSustainLength))) {
      Vue.set(soundEffect, 'envelopeSustainLength', DEFAULT_ENVELOPE_SUSTAIN_FRAMES);
    } else {
      Vue.set(soundEffect, 'envelopeSustainLength', Number(soundEffect.envelopeSustainLength));
    }
    if (!ARPEGGIO_DIVISION_OPTIONS.includes(Number(soundEffect.arpeggioDivision))) {
      soundEffect.arpeggioDivision = DEFAULT_ARPEGGIO_DIVISION;
    } else {
      soundEffect.arpeggioDivision = Number(soundEffect.arpeggioDivision);
    }
    if (!Number.isInteger(soundEffect.arpeggioInterval) ||
      soundEffect.arpeggioInterval < MIN_ARPEGGIO_INTERVAL || soundEffect.arpeggioInterval > MAX_ARPEGGIO_INTERVAL) {
      soundEffect.arpeggioInterval = DEFAULT_ARPEGGIO_INTERVAL;
    }
    // Normalized to a Number, not just validated by strict equality - a
    // v-select's bound value can come back as a string (a known Vuetify
    // quirk with non-string item values), which would otherwise silently
    // fail this check and reset the range back to default on every load,
    // discarding whatever the user picked.
    const range = Number(soundEffect.arpeggioRange);
    soundEffect.arpeggioRange = ARPEGGIO_RANGE_OPTIONS.some(([, value]) => value === range) ?
      range : DEFAULT_ARPEGGIO_RANGE;
    // Presets saved before this existed won't have it yet - defaults false
    // (a plain "sound effect"), matching every preset's  behavior before
    // this tag existed.
    soundEffect.isPercussion = !!soundEffect.isPercussion;
    soundEffect.isInstrument = !!soundEffect.isInstrument && !soundEffect.isPercussion;
    // Same Number() coercion as arpeggioRange above, for the same v-select
    // quirk. A preset saved before Priority existed at all falls back to
    // the default.
    const priority = Number(soundEffect.priority);
    soundEffect.priority = NOISE_PRIORITY_OPTIONS.includes(priority) ? priority : DEFAULT_NOISE_PRIORITY;
    // Presets saved before the frequency sweep and the frequency envelope existed have neither: off, with their settings at the
    // defaults. Numbers are coerced like the fields above (a v-select can hand back a string).
    const whole = (value, fallback, min, max) => {
      const number = Math.round(Number(value));
      return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
    };
    const oneOf = (value, options, fallback) => (options.includes(Number(value)) ? Number(value) : fallback);
    Vue.set(soundEffect, 'sweep', !!soundEffect.sweep);
    Vue.set(soundEffect, 'sweepRepeat', !!soundEffect.sweepRepeat);
    Vue.set(soundEffect, 'sweepWrap', !!soundEffect.sweepWrap);
    Vue.set(soundEffect, 'dpcSweepEnd', whole(soundEffect.dpcSweepEnd, 0, 0, 108));
    Vue.set(soundEffect, 'sweepEnd', whole(soundEffect.sweepEnd, DEFAULT_SWEEP_END, 0, 31));
    Vue.set(soundEffect, 'sweepStep', whole(soundEffect.sweepStep, DEFAULT_SWEEP_STEP, 1, MAX_SWEEP_STEP));
    Vue.set(soundEffect, 'sweepFrames', oneOf(soundEffect.sweepFrames, SWEEP_FRAME_OPTIONS, DEFAULT_SWEEP_FRAMES));
    Vue.set(soundEffect, 'staircase', !!soundEffect.staircase);
    Vue.set(soundEffect, 'staircaseStep', whole(soundEffect.staircaseStep, DEFAULT_STAIRCASE_STEP, 1, MAX_STAIRCASE_STEP));
    Vue.set(soundEffect, 'staircaseFrames', oneOf(soundEffect.staircaseFrames, STAIRCASE_FRAME_OPTIONS, DEFAULT_STAIRCASE_FRAMES));
    Vue.set(soundEffect, 'pitchEnvelope', !!soundEffect.pitchEnvelope);
    Vue.set(soundEffect, 'pitchEnvelopeAmount', whole(soundEffect.pitchEnvelopeAmount, DEFAULT_PITCH_ENVELOPE_AMOUNT,
        -MAX_PITCH_ENVELOPE_AMOUNT, MAX_PITCH_ENVELOPE_AMOUNT));
    Vue.set(soundEffect, 'pitchEnvelopeAttack', oneOf(soundEffect.pitchEnvelopeAttack,
        ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS, DEFAULT_PITCH_ENVELOPE_ATTACK));
    Vue.set(soundEffect, 'pitchEnvelopeDecay', oneOf(soundEffect.pitchEnvelopeDecay,
        ENVELOPE_STAGE_FRAME_OPTIONS, DEFAULT_PITCH_ENVELOPE_DECAY));
    Vue.set(soundEffect, 'pitchEnvelopeDecayEnd', oneOf(soundEffect.pitchEnvelopeDecayEnd,
        ENVELOPE_VOLUME_PERCENT_OPTIONS, DEFAULT_PITCH_ENVELOPE_DECAY_END));
    Vue.set(soundEffect, 'pitchEnvelopeSustainLength', oneOf(soundEffect.pitchEnvelopeSustainLength,
        ENVELOPE_SUSTAIN_FRAME_OPTIONS, DEFAULT_PITCH_ENVELOPE_SUSTAIN_LENGTH));
    Vue.set(soundEffect, 'pitchEnvelopeReleaseStart', oneOf(soundEffect.pitchEnvelopeReleaseStart,
        ENVELOPE_VOLUME_PERCENT_OPTIONS, DEFAULT_PITCH_ENVELOPE_RELEASE_START));
    Vue.set(soundEffect, 'pitchEnvelopeRelease', oneOf(soundEffect.pitchEnvelopeRelease,
        ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS, DEFAULT_PITCH_ENVELOPE_RELEASE));
  });
  return soundEffects;
};

// Read the sound effects afresh rather than through the module level storage:
// that is a computed over localStorage, which is not reactive, so it caches the
// first value it ever read and would keep serving stale names.
export const buildSoundEffectOptions = () => {
  try {
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());

    return data.soundEffects.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list sound effect options', e);
    return [['Error', '1']];
  }
};

// Looks up one stored sound effect preset by id, or null if it can't be found.
export const findSoundEffectById = (id) => {
  try {
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());
    return data.soundEffects.find((soundEffect) => `${soundEffect.id}` === `${id}`) || null;
  } catch (e) {
    console.error('Failed to load sound effect', e);
    return null;
  }
};

// Defined here instead of in the JSON array below, because a JSON definition
// can only take a fixed list of dropdown options. Passing the function to
// FieldDropdown lets Blockly rebuild the list every time the dropdown opens, so
// renamed, added and deleted sound effects show up without reloading the page.
Blockly.Blocks['soundfx_play'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SOUND_ICON} Play sound effect`)
        .appendField(new Blockly.FieldDropdown(buildSoundEffectOptions), 'SOUNDFX')
        .appendField('on')
        .appendField(new Blockly.FieldDropdown(() => channelOptions()), 'CHANNEL')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'LOOP')
        .appendField('loop');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SOUND_COLOR);
    this.setTooltip('Plays a named sound effect preset, set up on the SoundFX tab. Ticked: the sound plays again each time it ends, until another sound takes its channel or a Stop sound block.');
  },
};

// Silences whatever sound is playing on a channel (a Loop ends too). Music on the channel carries on with its next note.
Blockly.Blocks['soundfx_stop'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SOUND_ICON} Stop sound on`)
        .appendField(new Blockly.FieldDropdown(() => channelOptions()), 'CHANNEL');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SOUND_COLOR);
    this.setTooltip('Stops the sound playing on the channel, including one that is looping.');
  },
};

// The loudest any sound or music note may be, 0 to 15 (15, no limit, until this sets it). It follows the game, so a sound can
// get quieter while something happens.
Blockly.Blocks['soundfx_max_volume'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${SOUND_ICON} Set max sound volume to`);
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SOUND_COLOR);
    this.setTooltip('Sets the loudest volume (0 to 15) any sound or music note can play at, on every channel. 15 is no limit.');
  },
};
