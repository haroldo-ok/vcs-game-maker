'use strict';

import {useConfigurationStorage} from '../hooks/project';
import {tvAudioClockScale} from './tv-standard';
import {midiForPianoIndex, PIANO_KEY_COUNT} from './dpc-sound';

// Maps TIA AUDC/AUDF combinations to musical notes, for the Music tab's
// pattern editor. AUDC 4/5/12/13 ("pure tone") produce a clean,
// single-frequency square wave, so their in-tune notes are computed directly
// from the TIA's  shift-clock formula below. AUDC 1/6/10/14 are
// buzzy/LFSR-driven distortions that don't follow that simple formula, but
// DO have real, recognizable pitches - EMPIRICAL_NOTE_CHARTS supplies their
// notes from an actual by-ear chart instead (see its  comment). Every
// other AUDC value has no well-defined single pitch at all, so those only
// ever get a plain on/off hit.
const NTSC_SHIFT_CLOCK = 31440;
const shiftClock = () => NTSC_SHIFT_CLOCK * tvAudioClockScale(useConfigurationStorage().value);
const PURE_TONE_AUDCS = new Set(['4', '5', '12', '13']);
const SLOW_CLOCK_AUDCS = new Set(['12', '13']);

// Semitone offset within an octave, C=0..B=11 - used to turn
// EMPIRICAL_NOTE_CHARTS' plain note-name rows into MIDI numbers.
const NOTE_SEMITONE = {
  'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11,
};

// Both standard spellings for each of the 5 "black key" semitones (a
// natural has only one name, same as a real piano's  key labels) - one
// name alone is arbitrary (C# and Db are the exact same pitch; which one a
// piece "should" use depends on its  key signature, not on anything this
// app knows), so every displayed note name shows both rather than silently
// picking just the sharp spelling the way this used to work.
const NOTE_NAME_PAIRS = [
  ['C'], ['C#', 'Db'], ['D'], ['D#', 'Eb'], ['E'], ['F'], ['F#', 'Gb'], ['G'], ['G#', 'Ab'], ['A'], ['A#', 'Bb'],
  ['B'],
];
const noteLabel = (semitone, octave) => NOTE_NAME_PAIRS[semitone].map((name) => `${name}${octave}`).join('/');

// By-ear note chart for the buzzy/distortion AUDC values that don't have a
// simple shift-clock formula, transcribed from Glenn Saunders' 1997 "PRECISE
// 2600 sound chart" (comp.sys.atari.2600 / Stella mailing list). Each entry
// is {note, cents} indexed by AUDF (0-31, same "higher AUDF = lower pitch"
// direction as the pure-tone values), or null where the chart has no usable
// pitch (just "RUMBLE"/"BUZZ" - pure noise texture, no recognizable note).
// AUDC 6 and 10 are documented as producing exactly the same notes; the
// source's "SAME AS 6" (for 7 and 9) and "SAME AS 14" (for 15) mean those
// share their notes too, despite being a different distortion circuit
// ("DIFF DIST" in the source) - see the aliases below.
//
// The source itself has no absolute octave reference ("I don't have a
// keyboard and no way of knowing what C1 is"), only relative note-to-note
// motion - octaves below are reconstructed by walking the list and dropping
// one whenever the pitch class sequence doubles back upward (see
// inferOctaves), anchored to start near the top of the existing pure-tone
// range. Treat the resulting octave placement as a best-effort approximation
// rather than a verified absolute pitch match to AUDC 4/12's  rows.
const EMPIRICAL_NOTE_CHARTS_RAW = {
  1: [
    ['C', -5], ['C', -5], ['F', -5], ['C', 0], ['G#', 11], ['F', -5], ['D', 30], ['C', 0],
    ['A#', -8], ['G#', 10], ['F#', 50], ['F', -5], ['E', -50], ['D', 30], ['C#', 10], ['C', 0],
    ['B', -10], ['A#', -10], ['A', 0], ['G#', 10], ['G', 30], ['F#', 50], ['F#', -30], ['F', -5],
    ['E', 30], ['E', -50], ['D#', -10], ['D', 35], ['D', -32], ['C#', 10], ['C#', -50], ['C', 0],
  ],
  6: [
    ['B', 40], ['B', 40], ['E', 40], ['B', 40], ['G#', -50], ['E', 40], ['D', -30], ['B', 40],
    ['A', 40], ['G#', 40], ['F#', -10], ['E', 40], ['D#', 0], ['D', -40], ['C#', -40], ['B', 40],
    ['A#', 50], ['A', 50], ['G#', 50], ['G#', -50], ['G', -40], ['F#', -20], ['F', 0], ['E', 30],
    ['E', -50], ['D#', -20], ['D', 30], ['D', 0], ['C#', 30], ['C#', -20], ['B', 0], ['B', 40],
  ],
  14: [
    ['E', 40], ['E', 40], ['A', 40], ['E', 40], ['C#', -50], ['A', 40], ['G', -50], ['E', 40],
    ['D', 50], ['C#', -50], ['B', 0], ['A', 0], ['G#', 0], ['G', -20], ['F', 20],
    // AUDF 15-31: "MED BUZZ"/"BUZZ"/"LOW BUZZ" in the source - no usable pitch.
  ],
};

// Starting octave for each chart's AUDF=0 row, chosen to land the
// reconstructed sequence in roughly the same range as the existing
// pure-tone rows (which run from about octave 2 to 6) - see the module
// comment on EMPIRICAL_NOTE_CHARTS_RAW for why this is only an
// approximation, not a verified absolute match.
const EMPIRICAL_NOTE_CHART_START_OCTAVE = {1: 6, 6: 6, 14: 6};

const inferOctaves = (audc) => {
  const rows = EMPIRICAL_NOTE_CHARTS_RAW[audc];
  let octave = EMPIRICAL_NOTE_CHART_START_OCTAVE[audc];
  let prevSemitone = null;
  return rows.map(([note, cents]) => {
    const semitone = NOTE_SEMITONE[note];
    if (prevSemitone != null && semitone > prevSemitone) {
      // Pitch increased going down the list, even though AUDF ascending
      // should generally mean pitch descending - wrapped past a C boundary.
      octave -= 1;
    }
    prevSemitone = semitone;
    return {midi: (octave + 1) * 12 + semitone, name: noteLabel(semitone, octave), cents};
  });
};

// {audc: [{midi, name, cents}, ...]} indexed by AUDF, built once from
// EMPIRICAL_NOTE_CHARTS_RAW - AUDC 10/7/9 and 15 are plain aliases of AUDC
// 6 and 14 respectively (the source documents them as producing identical
// notes, despite being different distortion circuits).
const EMPIRICAL_NOTE_CHARTS = {
  1: inferOctaves(1),
  6: inferOctaves(6),
  14: inferOctaves(14),
};
EMPIRICAL_NOTE_CHARTS[10] = EMPIRICAL_NOTE_CHARTS[6];
EMPIRICAL_NOTE_CHARTS[7] = EMPIRICAL_NOTE_CHARTS[6];
EMPIRICAL_NOTE_CHARTS[9] = EMPIRICAL_NOTE_CHARTS[6];
EMPIRICAL_NOTE_CHARTS[15] = EMPIRICAL_NOTE_CHARTS[14];
const EMPIRICAL_TONE_AUDCS = new Set(['1', '6', '7', '9', '10', '14', '15']);

const shiftClockFor = (audf, slowClock) =>
  (slowClock ? shiftClock() / 3 : shiftClock()) / (Number(audf) + 1);

// A pure tone square wave takes two shift-register clocks per cycle (one
// high, one low), so its actual pitch is half the shift rate - matches
// sound-preview.js's  oscillator.frequency calculation.
const frequencyForAudf = (audf, slowClock) => shiftClockFor(audf, slowClock) / 2;

const A4_FREQUENCY = 440;

// How far (in cents - 100ths of a semitone) an AUDF's actual frequency is
// allowed to drift from the nearest equal-tempered note before it's excluded
// as not "in tune". 30 cents is under a third of a semitone, tight enough to
// sound in tune while still allowing most of the AUDF range through.
const IN_TUNE_CENTS_TOLERANCE = 30;

const nearestNote = (frequencyHz) => {
  const midi = 69 + 12 * Math.log2(frequencyHz / A4_FREQUENCY);
  const roundedMidi = Math.round(midi);
  const cents = Math.round((midi - roundedMidi) * 100);
  const semitone = ((roundedMidi % 12) + 12) % 12;
  const octave = Math.floor(roundedMidi / 12) - 1;
  return {name: noteLabel(semitone, octave), midi: roundedMidi, cents};
};

/**
 * Lists the notes a given AUDC value can play back in tune, as
 * {value, label, midi} options ready for a dropdown - value is the AUDF
 * (0-31) to store/generate, label is a note name like "C4", or both standard
 * spellings for a black key like "C#4/Db4" (see noteLabel). Empty for AUDC
 * values with no clean, tunable pitch (buzz/noise/div31 types).
 * @param {string|number} audc The AUDC value to look up.
 * @return {Array<{value: number, label: string, midi: number}>} In-tune notes.
 */
// The project's settings when its sounds are played by the DPC+ music chip (see generators/bbasic/dpcplus-audio.js),
// otherwise null. The chip plays any waveform at any pitch, so the notes an instrument has come from that.
const dpcPlusSoundConfig = () => {
  const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
  return config.kernel === 'dpcplus' && config.enableDpcPlusAudio !== false ? config : null;
};
// What the note lists below depend on, so a cached list is only reused while it is still right.
const noteSetKey = () => {
  const config = dpcPlusSoundConfig();
  return config ? `dpcplus:${tvAudioClockScale(config)}` : `standard:${tvAudioClockScale(useConfigurationStorage().value)}`;
};

// A DPC+ instrument has a waveform and no sound type, and the chip can play it at any key of the piano: every
// key is a note, whose value is its entry in the chip's frequency table.
const dpcPlusNotes = () => Array.from({length: PIANO_KEY_COUNT}, (_, i) => {
  const midi = midiForPianoIndex(i + 1);
  const {name} = nearestNote(440 * Math.pow(2, (midi - 69) / 12));
  return {value: i + 1, label: name, midi};
});

// tia is true for what the TIA plays, which under DPC+ is channel 1 (the chip plays channel 0).
export const notesForAudc = (audc, tia = false) => {
  const key = `${audc}`;
  const dpcPlus = dpcPlusSoundConfig();
  if (dpcPlus && !tia) return dpcPlusNotes();

  if (EMPIRICAL_TONE_AUDCS.has(key)) {
    const seen = new Set();
    const notes = [];
    EMPIRICAL_NOTE_CHARTS[key].forEach(({midi, name, cents}, audf) => {
      if (Math.abs(cents) > IN_TUNE_CENTS_TOLERANCE || seen.has(midi)) return;
      seen.add(midi);
      notes.push({value: audf, label: name, midi});
    });
    return notes.reverse();
  }

  if (!PURE_TONE_AUDCS.has(key)) {
    return [];
  }
  const slowClock = SLOW_CLOCK_AUDCS.has(key);

  const seen = new Set();
  const notes = [];
  for (let audf = 0; audf <= 31; audf++) {
    // AUDF 0 is a documented real-hardware exception for AUDC 4/5
    // specifically (Saunders' chart marks it "SILENT", unlike every other
    // AUDF/AUDC combination here, which always produces some tone) - the
    // shift-clock formula below has no way to know that by itself, so it'd
    // otherwise surface this as a normal (if very high-pitched) selectable
    // note. AUDC 12/13 (the slow-clock pair) don't share this quirk - their
    // AUDF 0 row is a real, in-tune note in the same chart.
    if (audf === 0 && (key === '4' || key === '5')) continue;
    const frequencyHz = frequencyForAudf(audf, slowClock);
    const {name, midi, cents} = nearestNote(frequencyHz);
    if (Math.abs(cents) > IN_TUNE_CENTS_TOLERANCE || seen.has(midi)) {
      continue;
    }
    seen.add(midi);
    notes.push({value: audf, label: name, midi});
  }
  // Lowest AUDF is the highest pitch (shift clock divides by AUDF+1), so
  // reverse to list notes low-to-high like a piano.
  return notes.reverse();
};

/**
 * Whether the given AUDC value can play any in-tune pitched notes at all.
 * @param {string|number} audc The AUDC value to check.
 * @param {boolean} [tia] True for what the TIA plays, which under DPC+ is channel 1.
 * @return {boolean} True if it has a clean, tunable pitch.
 */
export const audcHasTunableNotes = (audc, tia = false) => {
  const dpcPlus = dpcPlusSoundConfig();
  if (dpcPlus && !tia) return true;
  return PURE_TONE_AUDCS.has(`${audc}`) || EMPIRICAL_TONE_AUDCS.has(`${audc}`);
};

// The piano-roll's row list, highest pitch first: the union of every tunable
// AUDC family's note names (the pure-tone pair run off the fast/slow shift
// clocks, the empirically-charted ones off their  by-ear charts), so they
// cover different, only partially overlapping pitch ranges. One instrument's
// actual playable AUDF for a given row can differ from another's - see
// notesForAudc for that per-instrument lookup - this is only the shared row
// layout everyone's grid lines up against.
const canonicalRowsCache = new Map();
export const getCanonicalNoteRows = () => {
  const key = noteSetKey();
  let rows = canonicalRowsCache.get(key);
  if (!rows) {
    const merged = new Map();
    // Every key of the piano when the DPC+ chip plays the sounds, plus what the TIA plays (channel 1).
    const audcs = ['4', '12', '1', '6', '14'];
    audcs.forEach((audc) => {
      notesForAudc(audc, true).forEach(({label, midi}) => {
        if (!merged.has(midi)) merged.set(midi, label);
      });
    });
    if (dpcPlusSoundConfig()) {
      notesForAudc('0').forEach(({label, midi}) => {
        if (!merged.has(midi)) merged.set(midi, label);
      });
    }
    rows = Array.from(merged.entries())
        .map(([midi, label]) => ({midi, label}))
        .sort((a, b) => b.midi - a.midi);
    canonicalRowsCache.set(key, rows);
  }
  return rows;
};

/**
 * Whether a sound plays pitched notes from the piano rows of the Music tab: not a percussion sound, and a sound type that
 * has in tune notes.
 * @param {Object} soundEffect The sound (Sound tab preset).
 * @param {boolean} [tia] True for what the TIA plays, which under DPC+ is channel 1.
 * @return {boolean} True if its notes are the piano keys.
 */
export const soundHasTunableNotes = (soundEffect, tia = false) =>
  !!soundEffect && !soundEffect.isPercussion && audcHasTunableNotes(soundEffect.audc, tia);

/**
 * Builds a midi-note-number -> AUDF lookup for one AUDC value, for
 * highlighting/enabling a piano-roll's rows against a specific instrument.
 * @param {string|number} audc The AUDC value to look up.
 * @return {Map<number, number>} Map of midi number to that AUDC's  AUDF.
 */
// Memoized per AUDC (the result never changes for a given one): the Music tab's
// piano roll asks this for every cell it draws, and building it means
// re-deriving every note of the AUDC each time. Callers only read the Map.
const audfByMidiCache = new Map();
export const audfByMidiForAudc = (audc, tia = false) => {
  const key = `${tia ? 'tia' : noteSetKey()}:${audc}`;
  let map = audfByMidiCache.get(key);
  if (!map) {
    map = new Map();
    notesForAudc(audc, tia).forEach(({value, midi}) => map.set(midi, value));
    audfByMidiCache.set(key, map);
  }
  return map;
};

/**
 * A note's  effective AUDV (volume, 0-15) - an explicit per-note
 * override (see the Music tab's  piano-roll volume row) if one's been
 * set, else the instrument's  preset value, exactly like a note with no
 * override already behaved before per-note volume existed. Shared by the
 * editor's  live preview, the Web Audio preview playback, and the
 * compiled ROM's  event generator, so all three always agree on
 * whichever value is actually in effect for a given note.
 * @param {Object} note The note to resolve a volume for.
 * @param {Object} soundEffect The note's  instrument (Sound tab preset).
 * @return {number} The effective AUDV, 0-15.
 */
export const noteAudv = (note, soundEffect) =>
  Number.isInteger(note.audv) ? note.audv : (Number(soundEffect.audv) || 0);

/**
 * The AUDF a note plays at: the one for its pitch on the instrument as it is now (the notes an instrument has depend
 * on the kernel), or the AUDF stored with the note when the instrument has no such note.
 * @param {Object} note The note.
 * @param {Object} soundEffect The note's instrument.
 * @param {boolean} [tia] True for what the TIA plays, which under DPC+ is channel 1.
 * @return {number} The AUDF.
 */
export const noteAudf = (note, soundEffect, tia = false) => {
  if (!soundHasTunableNotes(soundEffect, tia) || note.midi === 'hit') return soundEffect.audf;
  const audf = audfByMidiForAudc(soundEffect.audc, tia).get(note.midi);
  return audf === undefined ? note.audf : audf;
};
