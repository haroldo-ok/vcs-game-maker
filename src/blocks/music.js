'use strict';

import * as Blockly from 'blockly/core';

import {useSongsStorage} from '../hooks/project';
import {MUSIC_ICON, STOP_ICON} from './icon';

const MUSIC_COLOR = 'rgb(255, 87, 34)';

// A pattern's length is adjustable (see PATTERN_STEP_OPTIONS below), but
// defaults to 16 steps (one bar at 2 steps/beat) and 140 BPM below - the same
// defaults FL Studio uses for a new project's step sequencer/tempo.
export const DEFAULT_PATTERN_STEPS = 16;

// Selectable pattern lengths - 2 as a shortest option (e.g. a quick
// two-note stinger/blip pattern), then in increments of 8 steps up to 64.
export const PATTERN_STEP_OPTIONS = [2, 4, 8, 16, 24, 32, 40, 48, 56, 64];
export const MAX_PATTERN_STEPS = PATTERN_STEP_OPTIONS[PATTERN_STEP_OPTIONS.length - 1];

// How many equal slices a single piano-roll step can be divided into for
// note duration (set via the dropdown under the Music tab's own header) -
// e.g. 4 lets a note be as short as a quarter of a step. Note events store
// their length in fixed, fine-grained units (see LENGTH_UNITS_PER_STEP)
// regardless of this setting, so changing it later only changes the
// snapping granularity for NEW edits, never reinterprets already-placed
// notes' lengths.
export const DURATION_SUBDIVISION_OPTIONS = [1, 2, 4, 8, 16];
export const DEFAULT_SUBDIVISION = 1;

// A note event's own "length" field is stored in units of 1/32 of a step -
// fine enough to exactly represent every selectable subdivision above
// (32 is the finest, so 1 of its slices = 1 unit) without ever needing
// fractional unit counts.
export const LENGTH_UNITS_PER_STEP = 32;

const emptyTrack = (id, soundEffectId, channel = 0) => ({
  id,
  soundEffectId,
  channel,
  // Sparse list of note events, not one slot per step - {step, midi, audf,
  // length} - so a note can be held across several steps, or be shorter
  // than one (see LENGTH_UNITS_PER_STEP - length is in those units, not
  // whole steps). midi is 'hit' for untunable instruments (see
  // utils/music-notes.js), otherwise the pitch's MIDI number; audf is that
  // specific note's own AUDF value (or null for a 'hit'), stored per-note so
  // playback doesn't have to re-derive it.
  notes: [],
});

// Two steps per beat (each step is an eighth note) - see
// utils/music-playback.js. 140 BPM matches FL Studio's own new-project
// default tempo.
export const DEFAULT_TEMPO = 140;

// Applies to every Tempo (BPM) field, song- and pattern-level alike (see
// MusicEditor.vue's own clampTempo, and the load-time clamp below for
// values from an older save/an imported file that predates this range).
export const MIN_TEMPO = 8;
export const MAX_TEMPO = 255;
export const clampTempo = (value) => {
  const tempo = Math.round(Number(value));
  return Number.isFinite(tempo) ? Math.min(MAX_TEMPO, Math.max(MIN_TEMPO, tempo)) : DEFAULT_TEMPO;
};

export const DEFAULT_SONGS = {
  songs: [
    {
      id: 1,
      name: 'Song 1',
      tempo: DEFAULT_TEMPO,
      // Whether the Music tab's own song-level preview playback (Play on
      // the song card, not any pattern's own preview - see pattern.loop
      // below and handlePlaySong/playSequence) repeats the whole sequence
      // once it reaches the end, instead of stopping there. A Music-tab-only
      // preview convenience, like pattern.loop - has no bearing on the
      // compiled ROM, which has its own separate Loop checkbox on the "Play
      // song" block itself (see music_play_song in this same file).
      loop: false,
      patterns: [
        {
          id: 1,
          name: 'Pattern 1',
          tempo: DEFAULT_TEMPO,
          // Whether this pattern plays at its OWN Tempo field (checked) or
          // follows its song's top-level one instead (unchecked) - a fresh
          // pattern follows the song by default, matching what most users
          // would expect.
          useOwnTempo: false,
          stepCount: DEFAULT_PATTERN_STEPS,
          loop: false,
          tracks: [emptyTrack(1, 1)],
        },
      ],
      // {id, patternId, count} per Sequence entry - count > 1 is a pattern
      // repeated that many times in a row (see MusicEditor.vue's own
      // handleSequenceResizeStart, which is how a user actually creates
      // one) - stored this way rather than one raw patternId per real
      // repeat specifically so a long repeated run doesn't bloat the
      // project JSON/localStorage with dozens of identical entries; see
      // normalizeSequenceGroups below for the migration from the old flat
      // shape. The compiled ROM keeps this same group shape too, rather
      // than expanding back to one entry per repeat - see
      // generators/bbasic/music.js's resolveProjectMusic (sequenceRepeatPacked)
      // and generateMusicChecks (the seqRepeatVar countdown) for the
      // runtime repeat counter that replays a group's own pattern in place
      // instead of needing a table row per real repeat.
      sequence: [{id: 1, patternId: 1, count: 1}],
    },
  ],
  // Optional per-sound-effect color overrides (soundEffectId -> TIA color
  // byte, matching utils/palette.js's index<<1 convention) - keyed globally
  // rather than per-song/pattern so the same instrument reads as the same
  // color everywhere it's used. Missing an entry means "auto-assigned"
  // (see instrumentColor in MusicEditor.vue).
  instrumentColors: {},
  // How finely a step is divided for note duration - global (not per-song),
  // set via the dropdown right under the Music tab's own header.
  subdivision: DEFAULT_SUBDIVISION,
  // A fresh project has no notes to migrate.
  noteLengthUnitsMigrated: true,
};

// Normalizes a song's own sequence into the current {id, patternId, count}
// shape - handles three cases at once: the OLD shape (a flat array of raw
// patternIds, one per real repeat, from a project saved before repeat
// groups existed - see DEFAULT_SONGS' own comment), the current shape
// (defensively re-validated - a hand-edited or corrupted file could have a
// missing id/non-integer count), and an already-correct in-memory sequence
// (a no-op pass, safe to call unconditionally on every load rather than
// needing its own one-time migration flag the way the note-length rescale
// above does, since collapsing already-grouped entries can't lose
// information the way re-scaling an already-migrated note length would).
// Exported (not just used internally below) since MusicEditor.vue's own
// handleImportSong needs this same normalization for an OLDER exported
// song .json file being imported into a project that's already on the new
// shape - that file's own `sequence` bypasses this function entirely
// otherwise, since importing overwrites a song's fields directly rather
// than going through this storage-load path.
export const normalizeSequenceGroups = (sequence) => {
  const flat = Array.isArray(sequence) ? sequence : [];
  let nextId = 1;
  if (flat.length && flat[0] && typeof flat[0] === 'object') {
    return flat.map((group) => {
      const id = group.id != null ? group.id : nextId;
      nextId = Math.max(nextId, id + 1);
      return {id, patternId: group.patternId, count: Math.max(1, Math.round(Number(group.count) || 1))};
    }).filter((group) => group.patternId != null);
  }
  const groups = [];
  flat.forEach((patternId) => {
    const last = groups[groups.length - 1];
    if (last && last.patternId === patternId) {
      last.count++;
    } else {
      groups.push({id: nextId++, patternId, count: 1});
    }
  });
  return groups;
};

export const processSongsStorageDefaults = (songsStorage) => {
  const songs = songsStorage.value;
  if (!songs || !songs.songs || !songs.songs.length) {
    return structuredClone(DEFAULT_SONGS);
  }
  if (!songs.instrumentColors || typeof songs.instrumentColors !== 'object') {
    songs.instrumentColors = {};
  }
  if (!DURATION_SUBDIVISION_OPTIONS.includes(songs.subdivision)) {
    songs.subdivision = DEFAULT_SUBDIVISION;
  }
  // Notes saved before sub-step durations existed stored both their start
  // and length in whole steps directly, not LENGTH_UNITS_PER_STEP units - a
  // one-time, guarded rescale of both so those notes keep their original
  // position/duration instead of suddenly starting 32x earlier and playing
  // 32x shorter.
  if (!songs.noteLengthUnitsMigrated) {
    songs.songs.forEach((song) => {
      (song.patterns || []).forEach((pattern) => {
        (pattern.tracks || []).forEach((track) => {
          (track.notes || []).forEach((note) => {
            note.length = Math.max(1, Math.round(note.length || 1)) * LENGTH_UNITS_PER_STEP;
            note.step = Math.max(0, Math.round(note.step || 0)) * LENGTH_UNITS_PER_STEP;
          });
        });
      });
    });
    songs.noteLengthUnitsMigrated = true;
  }
  // Songs/patterns/tracks saved before the Tempo/Channel/step-count/
  // note-length fields existed won't have them yet.
  songs.songs.forEach((song) => {
    // Also re-clamps an already-set tempo, not just a missing one - an
    // older save (or an imported file - see MusicEditor.vue's own
    // handleImportSong) can carry a value from before this range existed.
    song.tempo = clampTempo(song.tempo ?? DEFAULT_TEMPO);
    // A song saved before this field existed had no way to loop its own
    // preview playback at all, so it always behaved like "off" - default it
    // to staying that way (see the field's own comment in DEFAULT_SONGS).
    if (typeof song.loop !== 'boolean') {
      song.loop = false;
    }
    song.sequence = normalizeSequenceGroups(song.sequence);
    (song.patterns || []).forEach((pattern) => {
      pattern.tempo = clampTempo(pattern.tempo ?? DEFAULT_TEMPO);
      // A pattern saved before this song-level Tempo field existed was
      // definitely relying on its own tempo, not a song-level one that
      // didn't exist yet - default it to staying that way, rather than
      // silently switching its playback speed to the (new, likely
      // different) song tempo.
      if (pattern.useOwnTempo == null) {
        pattern.useOwnTempo = true;
      }
      if (!PATTERN_STEP_OPTIONS.includes(pattern.stepCount)) {
        pattern.stepCount = DEFAULT_PATTERN_STEPS;
      }
      // Whether the pattern's own preview (see MusicEditor.vue's Play
      // button on the pattern card) keeps repeating until manually stopped
      // - a Music tab view preference only, not saved/used by the compiled
      // ROM (which loops at the whole SONG level instead - see the "Loop"
      // checkbox on the Play song block).
      if (pattern.loop == null) {
        pattern.loop = false;
      }
      (pattern.tracks || []).forEach((track) => {
        if (track.channel == null) {
          track.channel = 0;
        }
        // Pre-length-and-events tracks stored one slot per step directly
        // (null/AUDF/'hit') instead of a sparse {step, length} event list -
        // rather than replay that migration's edge cases, just drop the old
        // shape back to empty, since it was only ever this session's own
        // test data.
        if (!Array.isArray(track.notes) || track.notes.some((note) => note === null || typeof note !== 'object')) {
          track.notes = [];
        }
      });
    });
  });
  return songs;
};

// Looks up one stored song by id, or null if it can't be found. Read fresh
// each time (not through the module-level storage) for the same reason as
// findDataTableById in blocks/data.js - a computed() over localStorage caches
// its first read and would keep serving a stale/renamed song list.
export const findSongById = (id) => {
  try {
    const songs = processSongsStorageDefaults(useSongsStorage());
    return songs.songs.find((song) => `${song.id}` === `${id}`) || null;
  } catch (e) {
    console.error('Failed to load song', e);
    return null;
  }
};

// Passing the function itself (not a static array) to FieldDropdown, like
// blocks/data.js's buildDataTableOptions, so Blockly rebuilds the list every
// time the dropdown opens - renamed/added/deleted songs show up without
// reloading the page.
const buildSongOptions = () => {
  try {
    const songs = processSongsStorageDefaults(useSongsStorage());
    return songs.songs.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list song options', e);
    return [['Error', '1']];
  }
};

// Starts (or restarts) playback of one song created on the Music tab. Any
// number of distinct songs can be referenced across a project's own
// music_play_song/music_play_song_by_id blocks (see resolveProjectMusic in
// generators/bbasic/music.js) - each included song gets its own reset
// subroutine once there's more than one to choose between.
Blockly.Blocks['music_play_song'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} Play song:`)
        .appendField(new Blockly.FieldDropdown(buildSongOptions), 'SONG')
        .appendField('Loop')
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'LOOP');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Starts (or restarts) playback of a song created on the Music tab. ' +
      'When Loop is unchecked, the song plays once and stops instead of repeating.');
  },
};

// Same start/restart behavior as music_play_song above, but picks the song
// by a runtime VALUE (a variable or computed expression) instead of a fixed
// dropdown choice - since this can't be resolved at compile time, using this
// block anywhere in the project pulls EVERY song from storage into the
// compiled ROM, so whatever ID it's given at runtime always has real data to
// find (see resolveProjectMusic's own usesSongById comment). A separate
// block (not an added input on music_play_song) so existing projects using
// that one aren't disturbed.
Blockly.Blocks['music_play_song_by_id'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} Play song:`);
    this.appendValueInput('SONG_ID');
    this.appendDummyInput()
        .appendField('Loop')
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'LOOP');
    this.setInputsInline(true);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Same as "Play song", but picks the song by ID (a variable or computed value, ' +
      'not a fixed choice) - using this anywhere in the project makes every song available to pick ' +
      'from at runtime. When Loop is unchecked, the song plays once and stops instead of repeating.');
  },
};

// Immediately silences whatever song is currently playing (started by
// music_play_song) and marks it as stopped - a subsequent music_play_song
// restarts it from the beginning. Does not trigger music_song_stopped below
// (that only fires when a non-looping song reaches its own natural end).
Blockly.Blocks['music_stop_song'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} ${STOP_ICON} Stop music`);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Immediately stops whatever song is currently playing. A subsequent "Play song" ' +
      'restarts it from the beginning - unlike Pause below, there\'s no way to resume from here.');
  },
};

// Freezes whichever notes are currently sounding on every channel (held at
// their current pitch/volume, not silenced) and stops advancing through the
// song entirely - no timers count down, no new notes are read - until a
// matching music_unpause_song block runs. Distinct from Stop above: Stop
// discards playback position (a subsequent Play always restarts from the
// beginning); Pause keeps it exactly where it was, ready to pick back up
// mid-song. Has no effect if nothing is currently playing, or if already
// paused.
Blockly.Blocks['music_pause_song'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} Pause music`);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Freezes music playback exactly where it is (the currently sounding notes hold, ' +
      'they don\'t go silent) until "Unpause music" runs. Unlike "Stop music", playback position isn\'t ' +
      'lost - resuming continues the song from where it was paused, not from the beginning.');
  },
};

// Resumes playback exactly where music_pause_song above left it - the same
// notes that were held pick back up counting down from wherever their own
// timers were, not restarted. Has no effect if music isn't currently paused.
Blockly.Blocks['music_unpause_song'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} Unpause music`);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Resumes music playback frozen by "Pause music", continuing exactly where it left ' +
      'off. Has no effect if music isn\'t currently paused.');
  },
};

// Fires once, the moment a song played with Loop unchecked reaches its own
// natural end - never fires for a looping song (which never reaches an
// "end"), and never fires from the Stop block above (that's an explicit user
// action, not the song finishing on its own).
Blockly.Blocks['music_song_stopped'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} ${STOP_ICON} When song has stopped playing`);
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Runs the connected blocks once, the moment a song played with Loop unchecked ' +
      'reaches its own natural end. Never triggers for a looping song, or from the Stop block.');
  },
};

// Same trigger as music_song_stopped above (both fire off the exact same
// shared "just stopped" flag - see generateMusicChecks in
// generators/bbasic/music.js), just with an explicit SONG dropdown, for
// projects that want to name which song they mean at the call site - this
// dropdown is purely for readability, it isn't actually checked at runtime.
// Deliberately kept simple even with multi-song support (see
// resolveProjectMusic): "song stopped" fires whenever whichever song is
// CURRENTLY playing reaches its own end, regardless of which song that is -
// distinguishing which song actually stopped isn't implemented. A separate
// block (not an added field on music_song_stopped) so existing projects
// using that one aren't disturbed.
Blockly.Blocks['music_song_stopped_by_id'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} ${STOP_ICON} When song has stopped playing:`)
        .appendField(new Blockly.FieldDropdown(buildSongOptions), 'SONG');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Same as "When song has stopped playing", but names which song for readability - ' +
      'it isn\'t actually checked, this fires whenever whichever song is currently playing reaches ' +
      'its own end, regardless of which song that is.');
  },
};

// Same trigger again (see music_song_stopped_by_id's own comment - all
// three share one generator, generateSongStopped, in generators/bbasic/
// music.js), but picks the song by a runtime VALUE (a variable or computed
// ID) instead of a fixed dropdown choice - same reasoning as
// music_play_song_by_id vs music_play_song, and not checked at runtime for
// the same reason music_song_stopped_by_id's own dropdown isn't. A separate
// block (not an added input on music_song_stopped_by_id) so existing
// projects using that one aren't disturbed.
Blockly.Blocks['music_song_stopped_by_number'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MUSIC_ICON} ${STOP_ICON} When song has stopped playing:`);
    this.appendValueInput('SONG_ID');
    this.appendStatementInput('DO');
    this.setInputsInline(true);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(MUSIC_COLOR);
    this.setTooltip('Same as "When song has stopped playing", but picks the song by ID (a variable or ' +
      'computed value, not a fixed choice) for readability - it isn\'t actually checked, this fires ' +
      'whenever whichever song is currently playing reaches its own end, regardless of which song ' +
      'that is.');
  },
};

