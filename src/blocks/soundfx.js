'use strict';

import * as Blockly from 'blockly/core';

import {useSoundEffectsStorage} from '../hooks/project';
import {CHANNEL_OPTIONS} from './sound';
import {SOUND_ICON} from './icon';

const SOUND_COLOR = 'rgb(156, 39, 176)';

// How often the arpeggio flips pitch, as a note division relative to the
// song/pattern's own tempo (matching DURATION_SUBDIVISION_OPTIONS' style in
// blocks/music.js) - e.g. 8 means "flip every 1/8 step", so the arpeggio
// speeds up and slows down with the song instead of staying a fixed frame
// count. Converted to an actual frame count (and clamped to the 4-bit
// nibble it has to fit in - see generators/bbasic/music.js's eventsToBytes)
// per-note at data-generation time, since the conversion depends on
// whichever pattern's tempo that note is actually played in.
export const ARPEGGIO_DIVISION_OPTIONS = [1, 2, 4, 8, 16, 32];
export const DEFAULT_ARPEGGIO_DIVISION = 8;

// Default fixed AUDF bump between the note's own pitch and the "other"
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
// - UP/DOWN 1 OCT: the note's own pitch and pitch+interval, in ascending or
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
// off of (an index into their own ARPEGGIO_PHASE_SEQUENCES), so reordering
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
// Attack/Decay/Release are frame counts; Sustain is a LEVEL (percent of
// this sound's own peak volume), not a duration - see utils/envelope.js's
// own comment for why. Small, fixed dropdown option sets (not free-typed
// numbers) are deliberate, same reasoning the old fade-length dropdowns
// already established: keeps the total number of DISTINCT envelope shapes
// a project can generate small, which keeps the compiled ROM's own
// per-config data tables small too (see generateEnvelopeChecks in
// generators/bbasic/soundfx.js).
export const ENVELOPE_STAGE_FRAME_OPTIONS = [0, 2, 4, 8, 16];
export const DEFAULT_ENVELOPE_ATTACK = 0;
export const DEFAULT_ENVELOPE_DECAY = 0;
export const DEFAULT_ENVELOPE_RELEASE = 4;
export const ENVELOPE_SUSTAIN_PERCENT_OPTIONS = [0, 25, 50, 75, 100];
export const DEFAULT_ENVELOPE_SUSTAIN_PERCENT = 100;

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
      envelopeSustain: DEFAULT_ENVELOPE_SUSTAIN_PERCENT,
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
      // A TIA color byte (utils/palette.js's index<<1 convention), or null
      // for "auto-assigned" - see utils/instrument-colors.js. Used by the
      // Music tab to color this sound's notes in the piano roll.
      color: null,
      // Purely a display tag for the Sound tab's own "show all/instruments/
      // sounds" filter (see SoundFXEditor.vue) - every sound effect preset
      // is already usable BOTH as a soundfx_play trigger and as a Music tab
      // instrument regardless of this flag, so it doesn't gate or change
      // anything else. Defaults false (a plain "sound effect") since that's
      // what every preset already was before this existed.
      isInstrument: false,
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
    soundEffect.envelope = !!soundEffect.envelope;
    // Presets saved before this existed (or before it replaced the old
    // single-stage Fade) won't have these yet - same Number() coercion as
    // arpeggioDivision/arpeggioRange below, for the same Vuetify v-select
    // quirk.
    if (!ENVELOPE_STAGE_FRAME_OPTIONS.includes(Number(soundEffect.envelopeAttack))) {
      soundEffect.envelopeAttack = DEFAULT_ENVELOPE_ATTACK;
    } else {
      soundEffect.envelopeAttack = Number(soundEffect.envelopeAttack);
    }
    if (!ENVELOPE_STAGE_FRAME_OPTIONS.includes(Number(soundEffect.envelopeDecay))) {
      soundEffect.envelopeDecay = DEFAULT_ENVELOPE_DECAY;
    } else {
      soundEffect.envelopeDecay = Number(soundEffect.envelopeDecay);
    }
    if (!ENVELOPE_STAGE_FRAME_OPTIONS.includes(Number(soundEffect.envelopeRelease))) {
      soundEffect.envelopeRelease = DEFAULT_ENVELOPE_RELEASE;
    } else {
      soundEffect.envelopeRelease = Number(soundEffect.envelopeRelease);
    }
    if (!ENVELOPE_SUSTAIN_PERCENT_OPTIONS.includes(Number(soundEffect.envelopeSustain))) {
      soundEffect.envelopeSustain = DEFAULT_ENVELOPE_SUSTAIN_PERCENT;
    } else {
      soundEffect.envelopeSustain = Number(soundEffect.envelopeSustain);
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
    // (a plain "sound effect"), matching every preset's own behavior before
    // this tag existed.
    soundEffect.isInstrument = !!soundEffect.isInstrument;
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
        .appendField(new Blockly.FieldDropdown(CHANNEL_OPTIONS), 'CHANNEL');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SOUND_COLOR);
    this.setTooltip('Plays a named sound effect preset, set up on the SoundFX tab.');
  },
};
