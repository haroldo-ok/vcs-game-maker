'use strict';

import {chunk} from 'lodash';

import {findSongById, processSongsStorageDefaults, DEFAULT_PATTERN_STEPS, LENGTH_UNITS_PER_STEP} from '../../blocks/music';
import {functionCallDiscardVarName} from '../../blocks/function';
import {processSoundEffectsStorageDefaults, DEFAULT_ARPEGGIO_DIVISION, DEFAULT_NOISE_PRIORITY} from '../../blocks/soundfx';
import {MAX_DATA_TABLE_VALUES} from '../../blocks/data';
import {useConfigurationStorage,
  useSoundEffectsStorage, useSongsStorage, loadMutedMusicTrackIds, loadSoloedMusicTrackIds,
  isMusicTrackMuted} from '../../hooks/project';
import {effectiveTempo} from '../../utils/music-playback';
import {buildEnvelopeCurve} from '../../utils/envelope';
import {frequencyForMidi} from '../../utils/dpc-sound';
import {settingsForChannel} from '../../utils/chip-settings';
import {buildVolumeStaircase} from '../../utils/staircase';
import {noteAudf, noteAudv, soundHasTunableNotes, rawFrequencyOf} from '../../utils/music-notes';
import {isVoiceInstrument} from '../../utils/note-speech';
import {envelopeFlatOn, envelopeStartPosition, registerEnvelopeConfig, NO_ENVELOPE_SENTINEL, volumeLimitAsm, soundPitchValues,
  getEnvelopeConfigs} from './soundfx';

// Set by generators/bbasic.js for the length of a compile in which the DPC+ music chip plays the sounds (see
// generators/bbasic/dpcplus-audio.js), otherwise null. Under it AUDC is the waveform number, AUDF the pitch (an
// entry of the frequency table, a piano key for a note), and arpeggios are written out as the notes they flip between.
let dpcPlusPlan = null;
export const setMusicDpcPlusPlan = (plan) => {
  dpcPlusPlan = plan;
  // The chip's second and third voices (channels 2 and 3) use the two spare bits of the music flags byte as their active flags.
  MUSIC_FLAGS_SPARE_BITS = [6, 7].filter((bit) => !(plan && plan.isChannel(bit === 6 ? 2 : 3)));
};
// The channel a track plays on: the chip's channels 2 and 3 only exist while the chip plays the sounds (any other channel
// number is channel 0), channel 1 is always the TIA's.
const trackChannel = (track) => {
  const channel = Number(track.channel) || 0;
  if (channel === 1) return 1;
  return channel >= 2 && dpcPlusPlan && dpcPlusPlan.isChannel(channel) ? channel : 0;
};
// The 2 or more notes of an arpeggio, as the events that are played one after the other: a flip is one event as long
// as the arpeggio speed (frames), and a pitch is the note's key plus the interval in semitones for the "alt" tokens
// and 12 more or less for an octave up or down.
const arpeggioToEvents = (event) => {
  const sequence = ARPEGGIO_PHASE_SEQUENCES[event.arpeggioRange] || ARPEGGIO_PHASE_SEQUENCES[0];
  const pitchOf = (token) => {
    const shift = (token.endsWith('A') ? event.arpeggioInterval : 0) + (token[0] === 'U' ? 12 : token[0] === 'D' ? -12 : 0);
    const id = Math.min(88, Math.max(1, event.audf + shift));
    if (dpcPlusPlan) dpcPlusPlan.useKey(id);
    return id;
  };
  const events = [];
  let remaining = event.frames;
  for (let phase = 0; remaining > 0; phase++) {
    const frames = Math.min(remaining, event.arpeggioSpeed);
    remaining -= frames;
    events.push({...event, audf: pitchOf(sequence[phase % sequence.length]), frames, arpeggioSpeed: 0,
      arpeggioInterval: 0, arpeggioRange: 0,
      // The envelope and the "note played" watch belong to the end and the start of the whole note.
      envelope: event.envelope && remaining === 0,
      notePlayedIndex: phase === 0 ? event.notePlayedIndex : 0,
      ...(remaining === 0 ? {} : {envelopeAttack: 0, envelopeDecay: 0, envelopeDecayEnd: 0, envelopeRelease: 0,
        envelopeSustainLength: 0, envelopeReleaseStart: 0, envelopeAttackEnd: 100})});
  }
  return events;
};

const FRAMES_PER_SECOND = 60; // NTSC - matches "set tv ntsc" in bbasic.bb.hbs
// How many frames one event (a note or a rest) holds at most, the duration being a byte: a longer note is written as several events (see
// the final chunking pass in flattenPatternEvents). The duration of an event stays below VOLUME_MARKER_BASE: the resume of a sound effect
// looks at the byte before a note for a volume marker.
const MAX_EVENT_FRAMES = 223;
// Same numeric limit as MAX_EVENT_FRAMES_WITH_ARPEGGIO (both are bounded by
// a 4-bit nibble), but a separate name since they bound conceptually
// different things - one a note's held duration, the other how many frames
// between arpeggio flips.
const MAX_ARPEGGIO_SPEED_FRAMES = 15;
// AUDV is 0-15 (now up to 0-239 once a "note played" watch index is packed
// into its  spare high nibble - see eventsToPages/
// MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS), so 255 in that byte position is
// still unambiguous as "end of song's data, loop back to the start" - same
// convention the reference bB file this format is based on uses for its
// background music channel.
const LOOP_SENTINEL = 255;
// A single "data" table can only hold MAX_DATA_TABLE_VALUES bytes (a real
// batari Basic limit - the index is a single byte). A channel needing more
// than that spans several tables ("pages") instead - this sentinel, also in
// the AUDV position, means "end of this page, not the whole song - advance
// to the next page's table and keep reading" (see generateMusicChecks).
const PAGE_BREAK_SENTINEL = 254;
// Also in the AUDV position (same convention as LOOP_SENTINEL/
// PAGE_BREAK_SENTINEL above) - means "this isn't a note at all, it's an
// instrument change: the next byte is an index into the shared instrument
// table (see musicInstrumentTableName/resolveProjectMusic's
// instrumentBytes) - apply it, then keep reading for the real note that
// follows" (see generateMusicChecks). Safely below PAGE_BREAK_SENTINEL/
// LOOP_SENTINEL and above the highest a real AUDV byte can ever legitimately
// reach (15 | (14 << 4) = 239, see MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS's
// cap), so it can never collide with either.
const INSTRUMENT_CHANGE_SENTINEL = 253;
// Also in the AUDV position (same convention as the sentinels above) - means
// "this isn't a note at all, it's an envelope-config change: the next byte
// is either an index into the shared project-wide envelope-config pool (see
// registerEnvelopeConfig in generators/bbasic/soundfx.js) or
// NO_ENVELOPE_SENTINEL (envelope off for this channel from here on) - apply
// it, then keep reading for the real note that follows (see
// buildEnvelopeMarkerSubroutine below). Unlike AUDC/arpeggio (which only
// ever depend on the CURRENT instrument, so only need re-applying on an
// actual instrument change), a note's  envelope config also depends on
// its  peak volume (AUDV), which can differ note-to-note even on the
// same instrument - so this marker is emitted whenever the SELECTOR
// (config index, or "off") changes, not just on an instrument change,
// though in practice most consecutive notes share both. One value below
// INSTRUMENT_CHANGE_SENTINEL, still safely above the highest real AUDV byte
// (239).
const ENVELOPE_CHANGE_SENTINEL = 252;
// What the notes of an instrument have in common (the sound type and the arpeggio, the volume, the "note played" watch, the pitch of a
// hit) is not stored with every note: it is a line of the instrument tables (see resolveProjectMusic), picked by an
// INSTRUMENT_CHANGE_SENTINEL marker.
// A note or a rest on a channel of the TIA is 1 or 2 bytes, by the top bit of the first one:
//  - top bit clear: a note with its pitch stored: the pitch (AUDF, 5 bits), TUNED_PACKED_FLAG and WATCH_FLAG above it, then a byte of
//    duration (in frames);
//  - top bit set (SHORT_FORM_FLAG): a rest (REST_FLAG) or a hit, a note that has the pitch of its instrument (WATCH_FLAG for the note);
//    the duration is in the low 5 bits when it is 1 to 31 frames, else those bits are 0 and a byte of duration follows.
// The chip of DPC+ has pitch numbers up to 255 (8 bits), so a note or a rest on a channel of the chip has no flags: a rest is a first byte of
// 0 and a duration, a hit is just its duration (the instrument has its pitch), a note with its pitch stored is the pitch and the
// duration. Its "note played" watch and its volume are markers before the note (see NOWATCH_MARKER and VOLUME_MARKER_BASE).
const SHORT_FORM_FLAG = 128;
const REST_FLAG = 32; // of a short form
const WATCH_FLAG = 64; // the note starts a watched instrument's note
const TUNED_PACKED_FLAG = 32; // of a note with its pitch stored: its volume is in the high nibble of the duration byte
const SHORT_FORM_FRAMES = 31;
// A note with a volume other than the volume of its instrument says so one of three ways. On the TIA, a note with its pitch stored and 15
// frames or less (and not of volume 14) has the volume in the high nibble of its duration byte (the duration in the low one) and
// TUNED_PACKED_FLAG on its first byte; any other has a 1-byte marker before it: this plus the volume (0-15), for that note only. On the
// chip it is always the marker. A watched instrument's note on the chip counts as a watched note unless a 1-byte NOWATCH_MARKER comes
// before it (the events of a note written as several: only the first starts the note).
const VOLUME_MARKER_BASE = 224;
const NOWATCH_MARKER = 240;
const PACKED_DURATION_LIMIT = 15;
const UNPACKABLE_VOLUME = 14;
// A generous ceiling on how many pages one channel can spread across, purely
// as a sanity guard against a pathologically long song generating enormous
// amounts of dispatch code - not a hard format limit. Applies to the SUM of
// pages across every song included for playback (see resolveProjectMusic),
// not one song alone, now that a project can reference more than one -
// raised from the original single-song value of 8 since that budget is now
// shared project-wide.
const MAX_MUSIC_PAGES = 16;

// Matches ARPEGGIO_RANGE_* in blocks/soundfx.js by array index. Each token
// names one of the 6 pitch variants precomputed once per note-fetch (see
// generateMusicChecks' arpApply): B=base, A=alt (base - interval), UB/UA=one
// octave up, DB/DA=one octave down. Played in order, one per arpeggioSpeed
// frames, looping back to the start once the sequence ends. Duplicated here
// rather than imported from utils/music-playback.js's  copy (which
// mirrors this exactly, just with longer token names) - that module already
// imports from this one (effectiveTempo), and importing back would make the
// two circular.
const ARPEGGIO_PHASE_SEQUENCES = [
  ['B', 'A'], // UP 1 OCT
  ['A', 'B'], // DOWN 1 OCT
  ['B', 'A', 'UB', 'UA'], // UP 2 OCT
  ['B', 'A', 'DB', 'DA'], // DOWN 2 OCT
  ['B', 'A', 'B'], // UP-DOWN 1 OCT
  ['B', 'A', 'UB', 'UA', 'UB', 'A'], // UP-DOWN 2 OCT
];

// Canonical (pre-letter-assignment) names for this feature's hidden
// variables - passed through nameDB_.getName(..., DEVELOPER_VARIABLE_TYPE)
// both when reserving a letter (see bbasic.js's pre-scan) and again at every
// generation call site below, matching the established convention (see
// collisionMoveOldXVar/canonicalDistanceVarName).
export const musicIndexVarName = (channel) => `musicCh${channel}Index`;
export const musicTimerVarName = (channel) => `musicCh${channel}Timer`;
// This channel's  CURRENT instrument byte (AUDC|arpeggioSpeed<<4) - kept
// up to date only at an actual INSTRUMENT_CHANGE_SENTINEL marker (see
// generateMusicChecks), not on every note fetch, now that AUDC is no longer
// part of the regular per-note record at all (see eventsToPages'
// comment on why). Needed specifically for the music/sound-effect
// interleaving feature's  resume logic: restoring AUDC once a sound
// effect's  hold on this channel ends used to just re-read the last-
// fetched record's  AUDC byte at a fixed offset from indexVar, which
// only worked because every record always had exactly one - a record with
// no AUDC byte of its  at all has no such offset to re-read, so this
// dev var is what resumeCheck copies from instead.
export const musicLastAudcVarName = (channel) => `musicCh${channel}LastAudc`;
// Only for a channel of the TIA that a sound effect can interrupt (see the resume check in generateMusicChecks): where the record of the
// note being played starts in its page, as the records have different sizes.
export const musicStartVarName = (channel) => `musicCh${channel}Start`;
// Only reserved/used for a channel whose data spans more than one page (see
// eventsToPages/MAX_DATA_TABLE_VALUES) - which table (of that channel's
// set) is currently being read.
export const musicPageVarName = (channel) => `musicCh${channel}Page`;
// Only reserved/used for a song whose sequence references more than one
// pattern (see resolveProjectMusic) - which position in the SONG's
// sequence this channel is currently playing through. Each DISTINCT pattern
// is only ever encoded once (see channelPages/patternStartPage in
// resolveProjectMusic), so a pattern repeated at several sequence positions
// needs this to know which page to jump BACK to once the current one's data
// runs out - musicPageVarName alone can't tell "which occurrence" apart,
// since the same pattern (and so the same starting page) can be reached from
// more than one sequence position.
export const musicSeqPosVarName = (channel) => `musicCh${channel}SeqPos`;
// Only reserved/used for a project where some included song's  Sequence
// list actually repeats a pattern several times in a row (see
// resolveProjectMusic's  groups/sequenceRepeatCount, and blocks/music.js's
// {id, patternId, count} shape a resized Sequence chip produces) - how many
// MORE times, after the one currently playing, a channel should replay the
// pattern at its current sequence position before actually advancing to the
// next one. Counting this down at the runtime pattern-transition point (see
// generateMusicChecks) rather than storing one flat sequence-table entry per
// real repeat (an earlier version of this) is what lets a resized-to-
// repeat-8-times chip cost a fixed couple bytes of ROM instead of 8.
//
// ONE SHARED byte for every channel, not one per channel - channel 0's
// count lives in the low nibble, channel 1's in the high nibble, same
// packed-nibble convention soundfx.js's  envelopeConfig already uses
// for its  per-channel envelope-config index (see soundfx_play/
// generateEnvelopeChecks there). Each channel only ever reads/writes its
// nibble (via & $0F / / 16, masking the other nibble off before writing
// - see generateMusicChecks), never the other channel's, so this is safe
// without any cross-channel coordination despite being one shared var - a
// genuinely different situation from seqPosVar/pageVar, which track state
// that would need actual synchronization to safely share (not attempted
// here). The cost of packing: a repeat count is capped at 16 total plays
// (a 4-bit nibble only reaches 15 repeats-remaining) - well past any
// realistic use, and still adjustable per group independently either way.
export const musicSeqRepeatVarName = (channel = 0) => (Number(channel) >= 2 ? 'musicRepB' : 'musicRep');
export const MAX_SEQ_REPEAT_COUNT = 16;
// One shared byte (not a var per flag/channel) holding every boolean the
// music player needs project-wide - dev vars are a hard-capped, only
// 25-of-them, project-wide resource, and this used to cost 3 vars
// (playing/loop/justStopped) plus 1 more PER CHANNEL (active) by itself.
// Bit layout (see musicPlayingBit/musicLoopBit/musicJustStoppedBit/
// musicChannelActiveBit below), each bit read/written individually via bB's
// var{n} bit syntax (already used elsewhere, e.g. sprites.js's
// CTRLPF{2}) so setting one flag never disturbs the others.
export const musicFlagsVarName = () => 'musicFlags';
export const musicPlayingBit = 0;
export const musicLoopBit = 1;
export const musicJustStoppedBit = 2;
// Channels 0/1 get bits 3/4 - independent per channel (unlike the shared
// playing bit) since two channels almost never run out of data at the same
// time (e.g. one full of short rests, the other one long sustained note).
// Gating each channel's  per-frame processing on the shared "playing"
// bit alone meant whichever channel finished first would freeze every OTHER
// channel's audio at whatever it happened to be at that instant, instead of
// letting it reach its  natural end and mute itself.
export const musicChannelActiveBit = (channel) => (Number(channel) >= 2 ? Number(channel) + 4 : 3 + Number(channel));
// Shared across every channel (like playing/loop/justStopped, unlike the
// per-channel active bits above) - set by music_pause_song, cleared by
// music_unpause_song, checked first thing in generateMusicChecks'
// per-channel body, before even the active-bit check, so a paused channel's
// timer never decrements and its data table is never advanced while set -
// the exact note playing at the moment of the pause just keeps sounding,
// unchanged, until unpaused. Bit 5 (not 3+channel) so it stays clear of the
// per-channel active bits even if a couple more channels are ever added.
export const musicPausedBit = 5;
// Overflow byte(s) for resolveMusicEventFlags below, only reserved once a
// project's  distinct one-shot music event watches (sequence-chip-
// finished AND note-played-by-instrument, sharing one pool - see that
// function's  comment) exceed the 2 spare bits (6-7, right above/below)
// musicFlagsVarName's  byte still has free. byteIndex picks which
// overflow byte (0 = the first 8 slots past the initial 2, 1 = the next 8,
// ...) - unlike the single fixed overflow byte this used to be split into
// (one for chip-finished, a separate one/two for note-played), a project
// mixing both watch types now only pays for as many TOTAL overflow bytes as
// its TOTAL watch count actually needs, not one set per feature.
export const musicEventFlagsOverflowVarName = (byteIndex) => `musicEvtFlags${byteIndex}`;
let MUSIC_FLAGS_SPARE_BITS = [6, 7];

// Resolves every one-shot music event watch a project's  blocks
// reference - music_sequence_chip_finished (fires for ANY chip, no
// selection), music_sequence_chip_finished_by_id (one specific song+chip
// pair), music_sequence_chip_finished_current_song (one chip id, checked
// against EVERY song that happens to have a chip with that id, but only the
// one actually playing at the time ever fires it), AND
// music_note_played/_by_id (one watched instrument each, see
// notePlayedIndexById/resolveNotePlayedInstruments) - into ONE shared
// flag-bit assignment, reusing musicFlagsVarName's  2 spare bits (see
// MUSIC_FLAGS_SPARE_BITS above - bits 0-5 are already claimed, see
// musicPlayingBit and friends) before ever reserving a new dev var. Sharing
// one pool across every watch TYPE (rather than each type exclusively
// owning its  separate spare-bit/overflow allocation, which is how this
// worked before note-played existed) means a project using, say, one
// chip-finished watch and one note-played watch together still costs
// nothing beyond musicFlagsVarName - previously the second watch TYPE
// would always cost a whole new dev var, even with spare bits
// sitting unused right next to it. Only once TOTAL distinct watches (of
// either type, combined) exceed 2 does this start assigning bits in
// musicEventFlagsOverflowVarName's  byte(s) instead (each still only
// reserved, via bbasic.js's  reserveDevVar, when actually needed).
//
// Every CHIP_ID field is a project-author-facing id (see the "ID: N" badge
// inside each Sequence chip in MusicEditor.vue), not the runtime sequence
// position generateMusicChecks actually tracks (seqPosVar) -
// resolveProjectMusic's "groups" drops the chip's  id entirely (see
// its  comment) since nothing at runtime needs it, so this resolves each
// watch back to its  compile-time INDEX within a song's (raw,
// storage-level, not yet resolveProjectMusic-processed) sequence array here,
// once, rather than needing any runtime lookup. A stale/deleted chip
// reference (findSongById fails, or the id doesn't match any current chip in
// ANY relevant song) is silently dropped - that watch's  flag is never
// reserved, so the event block's  generator (generateChipFinishedCheck
// below) falls through as a permanent no-op for it, matching how a dangling
// reference is already handled elsewhere in this file (e.g. resolvedSongs'
// stale-dropdown filter). A note-played watch whose instrument id
// never actually got assigned an index (stale reference, or nothing
// currently watches it) is likewise just absent from notePlayedFlags -
// music_note_played's  generator handles that the same "permanent no-op"
// way.
//
// Multiple event-block instances targeting the exact same watch (same
// song+chipId pair, same chipId for the current-song variant, or same
// instrument id for note-played) share one bit (deduped by key/id), same
// "don't reserve twice for the same thing" reasoning as
// collisionMovePlayers'  Set.
// Lowest-numbered channel a song actually uses is treated as the sole
// source of truth for any watch/check tied to that song - a song's two
// channels can advance past the same sequence position on different FRAMES
// (confirmed elsewhere this file - note-duration sums differ per channel),
// so reading/setting a flag from every channel would risk a mismatch a few
// frames wide. One well-defined channel avoids that entirely, at the cost
// of following that one channel's  note data specifically. Shared by
// resolveMusicEventFlags below (the one-shot "finished" watches) and the
// live "is playing" checks (music_sequence_chip_playing_by_id/
// _current_song), which need the exact same {songIndex, seqIndex,
// primaryChannel} resolution but without claiming a watch flag bit at all.
export const primaryChannelFor = (resolvedSong) => String(Math.min(...[...resolvedSong.channelsUsed]));

// "Chip ID" (both here and on the block's  field/tooltip) is the chip's
// CURRENT POSITION in the Sequence list (1 = first), matching the
// "ID: N" badge MusicEditor.vue now shows on each chip - deliberately NOT a
// permanent identity: reordering, inserting, or deleting chips changes
// which chip a given number refers to, at the user's  explicit request
// (an earlier version of this used each chip's  separate, permanent id
// field instead, which stayed pointed at the same chip regardless of
// reordering - reverted in favor of this simpler "number = current
// position" mental model). Out-of-range (chip deleted, or the number was
// never valid) resolves to -1, same as a not-found lookup always has.
export const chipIdToSeqIndex = (rawSong, chipId) => {
  const sequence = (rawSong && rawSong.sequence) || [];
  return chipId >= 1 && chipId <= sequence.length ? chipId - 1 : -1;
};

export const resolveMusicEventFlags = (workspace, music, notePlayedIndexById = new Map()) => {
  // !!music gates this exactly like every other watch below already is
  // (each pairs/byChipId entry only resolves once resolvedSong is truthy) -
  // without it, a project with a "When a sequence chip has finished
  // playing" block AND "Mute all in-game audio" both on would still claim
  // a flag bit here, but bbasic.js's  musicFlagsVarName reservation is
  // gated behind this.projectMusic (null when muted), so nothing would
  // ever actually declare that dev var - confirmed as a real compile
  // failure (DASM: "Unknown Mnemonic" on the raw, never-aliased
  // "musicFlags" name leaking straight into the assembly).
  const usesGeneral = !!music && workspace.getAllBlocks(false)
      .some((block) => block.type === 'music_sequence_chip_finished');

  const seenPairKeys = [];
  const resolvedPairs = new Map();
  workspace.getAllBlocks(false)
      .filter((block) => block.type === 'music_sequence_chip_finished_by_id')
      .forEach((block) => {
        const songId = Number(block.getFieldValue('SONG'));
        const chipId = Number(block.getFieldValue('CHIP_ID'));
        const key = `${songId}:${chipId}`;
        if (resolvedPairs.has(key)) return;
        const rawSong = findSongById(songId);
        const seqIndex = chipIdToSeqIndex(rawSong, chipId);
        // Only actually included in the compiled ROM if resolveProjectMusic
        // itself decided to include this song (e.g. it's referenced by some
        // "Play song" block somewhere) - a chip-finished watch on a song
        // nothing ever plays has no runtime signal to hook into either.
        const resolvedSong = music && seqIndex !== -1 && music.songs.find((s) => s.songId === songId);
        if (!resolvedSong) return;
        resolvedPairs.set(key, {
          songId, chipId, seqIndex, songIndex: resolvedSong.songIndex,
          primaryChannel: primaryChannelFor(resolvedSong),
        });
        seenPairKeys.push(key);
      });

  // Same idea as resolvedPairs above, but keyed by chipId ALONE - checked
  // against every song that has a chip in that position (position is only
  // meaningful WITHIN one song's  Sequence list, not project-wide), each
  // its {songIndex, seqIndex, primaryChannel} occurrence sharing ONE
  // flag bit. At runtime only whichever song is actually playing can
  // ever satisfy any one occurrence's  songIndexVar gate, so this never
  // double-fires across songs despite watching more than one.
  const seenChipIds = [];
  const resolvedByChipId = new Map();
  workspace.getAllBlocks(false)
      .filter((block) => block.type === 'music_sequence_chip_finished_current_song')
      .forEach((block) => {
        const chipId = Number(block.getFieldValue('CHIP_ID'));
        if (resolvedByChipId.has(chipId)) return;
        const occurrences = [];
        (music ? music.songs : []).forEach((resolvedSong) => {
          const rawSong = findSongById(resolvedSong.songId);
          const seqIndex = chipIdToSeqIndex(rawSong, chipId);
          if (seqIndex === -1) return;
          occurrences.push({
            songId: resolvedSong.songId, songIndex: resolvedSong.songIndex, seqIndex,
            primaryChannel: primaryChannelFor(resolvedSong),
          });
        });
        if (!occurrences.length) return;
        resolvedByChipId.set(chipId, {chipId, occurrences});
        seenChipIds.push(chipId);
      });

  const notePlayedIds = [...notePlayedIndexById.keys()];
  const totalSlots = (usesGeneral ? 1 : 0) + seenPairKeys.length + seenChipIds.length + notePlayedIds.length;
  if (totalSlots === 0) {
    return {general: null, pairs: new Map(), byChipId: new Map(), notePlayed: new Map(), overflowByteCount: 0};
  }
  // A generous sanity guard (4 overflow bytes' worth past the initial 2
  // free bits), not a real format limit - musicEventFlagsOverflowVarName
  // reserves exactly as many bytes as actually needed, so this only exists
  // to catch a pathological project rather than cap a reasonable one.
  const maxSlots = MUSIC_FLAGS_SPARE_BITS.length + 32;
  if (totalSlots > maxSlots) {
    throw new Error(`This project watches ${totalSlots} distinct music event conditions (sequence-chip- ` +
      `finished and note-played-by-instrument combined), but only ${maxSlots} are supported - try ` +
      'combining or removing some.');
  }
  let nextSlot = 0;
  const claimSlot = () => {
    const slot = nextSlot++;
    return slot < MUSIC_FLAGS_SPARE_BITS.length ?
      {varName: musicFlagsVarName(), bit: MUSIC_FLAGS_SPARE_BITS[slot]} :
      {
        varName: musicEventFlagsOverflowVarName(Math.floor((slot - MUSIC_FLAGS_SPARE_BITS.length) / 8)),
        bit: (slot - MUSIC_FLAGS_SPARE_BITS.length) % 8,
      };
  };

  const general = usesGeneral ? claimSlot() : null;
  const pairs = new Map();
  seenPairKeys.forEach((key) => pairs.set(key, {...resolvedPairs.get(key), ...claimSlot()}));
  const byChipId = new Map();
  seenChipIds.forEach((chipId) => byChipId.set(chipId, {...resolvedByChipId.get(chipId), ...claimSlot()}));
  const notePlayed = new Map();
  notePlayedIds.forEach((id) => notePlayed.set(id, claimSlot()));
  // How many musicEventFlagsOverflowVarName bytes actually got used - the
  // reservation site (bbasic.js, via reserveMusicDevVars) needs this to
  // reserve exactly that many, rather than re-deriving it by parsing
  // varName strings back apart.
  const overflowByteCount = Math.max(0, Math.ceil((nextSlot - MUSIC_FLAGS_SPARE_BITS.length) / 8));
  return {general, pairs, byChipId, notePlayed, overflowByteCount};
};

// The packed nibble baked into each note's  AUDV byte (see eventsToPages)
// is 4 bits (0-15), but 14, not 15, is the real ceiling: the packed byte is
// audv | (index << 4), and LOOP_SENTINEL/PAGE_BREAK_SENTINEL (254/255) sit
// right at the very top of the full byte range - index 15 combined with a
// full/near-full volume note (audv 14 or 15) would collide with one of
// them, corrupting the loop/page-advance detection entirely (confirmed by
// brute-forcing every audv/index combination). 0 is reserved to mean "no
// watched instrument" (every note not made by a watched instrument packs a
// plain 0 there, same as before this feature existed), leaving 1-14 as
// real, assignable watch indices.
export const MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS = 14;

// Resolves every "note played by instrument" watch a project's  blocks
// reference - music_note_played (dropdown) and music_note_played_by_id
// (typed ID) - into one shared index-per-instrument assignment, used ONLY
// to bake each watched instrument's  compile-time-known index straight
// into every one of its  note events' AUDV byte (see eventsToPages),
// read back and compared once per new note fetched (see
// generateMusicChecks). This index is NOT also this watch's  runtime
// flag-bit position any more (an earlier version of this had it double as
// both, since nothing else competed for those bits) - see
// resolveMusicEventFlags'  notePlayed map for that now, which pools
// flag-bit assignment together with sequence-chip-finished's  watches
// instead of each feature exclusively owning a separate byte. Called
// BEFORE resolveProjectMusic (which needs the returned index map to
// actually pack the bytes), unlike resolveMusicEventFlags, which needs
// resolveProjectMusic's  result first.
//
// Each distinct instrument (deduped by id, watched by either block type
// with no distinction between them - both mean "this instrument") gets the
// next index in 1..MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS, in first-seen order.
export const resolveNotePlayedInstruments = (workspace) => {
  // Same "Mute all in-game audio" check resolveProjectMusic itself makes -
  // duplicated (rather than passed in) since this has to run BEFORE
  // resolveProjectMusic even exists (see this function's  comment above
  // for why). Without this, a muted project with any music_note_played/
  // _by_id block would still assign watch indices here, harmlessly on its
  // (nothing reads them without real music to pack), but
  // resolveMusicEventFlags would then also still claim flag bits for them
  // (it has no way to tell "assigned an index" apart from "worth a real
  // flag" otherwise) - same class of bug resolveMusicEventFlags'
  // usesGeneral check exists to avoid for sequence-chip-finished.
  const configurationStorage = useConfigurationStorage();
  if (((configurationStorage && configurationStorage.value) || {}).muteAllAudio) return new Map();

  const seenIds = [];
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'music_note_played') seenIds.push(`${block.getFieldValue('INSTRUMENT')}`);
    if (block.type === 'music_note_played_by_id') seenIds.push(`${block.getFieldValue('INSTRUMENT_ID')}`);
  });
  // The AtariVox instruments (sound effects of the SpeakJet chip) that a note of any song uses are watched too: the music is silent for the
  // console at their notes and the program says the effect (see generateAvoxInstrumentChecks in speech.js), when the AtariVox is on.
  if (((configurationStorage && configurationStorage.value) || {}).enableAtariVox) {
    const avoxIds = new Set(processSoundEffectsStorageDefaults(useSoundEffectsStorage()).soundEffects
        .filter((soundEffect) => soundEffect.isAtariVox).map((soundEffect) => `${soundEffect.id}`));
    if (avoxIds.size) {
      processSongsStorageDefaults(useSongsStorage()).songs.forEach((song) => (song.patterns || []).forEach((pattern) =>
        (pattern.tracks || []).forEach((track) => {
          if (avoxIds.has(`${track.soundEffectId}`) && (track.notes || []).length) seenIds.push(`${track.soundEffectId}`);
        })));
    }
  }
  const distinctIds = [...new Set(seenIds)];
  if (distinctIds.length > MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS) {
    throw new Error(`This project watches ${distinctIds.length} distinct "note played by instrument" ` +
      `conditions, but only ${MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS} are supported - try combining or ` +
      'removing some.');
  }
  const indexById = new Map();
  distinctIds.forEach((id, i) => indexById.set(id, i + 1));
  return indexById;
};

// Only reserved/used for a channel with at least one arpeggiating note (see
// musicChannelHasArpeggio) - all of these describe the CURRENTLY PLAYING
// note (reset/recomputed at note-fetch time in generateMusicChecks), not the
// song as a whole. Base/alt (B/A) are precomputed once per fetch, since they
// only ever change when the note itself changes - the up/down-octave
// variants (UB/UA/DB/DA) are NOT similarly cached (that used to cost 4 more
// dev vars per channel, and dev vars are a hard-capped, project-wide, only
// 25-of-them resource) - see arpApply in generateMusicChecks, which derives
// them from base/interval on the spot, only on the rare frame a flip
// actually lands on one of them.
// Speed (0-15) and range (0-5) merged into one shared byte - speed | (range
// << 4), the same layout the duration byte itself already uses for these
// two fields (see eventsToPages) - saves a whole dev var per arpeggio
// channel at essentially zero per-frame cost: range is only ever nonzero
// when speed is too (see flattenPatternEvents, which defaults arpeggioRange to
// 0 for any non-arpeggiating event), so testing "is this note arpeggiating
// at all" against the WHOLE packed byte is exactly as correct as testing
// speed alone - the hot per-frame check in arpApply doesn't need to mask
// anything. Extracting just speed (packedVar & 15) or just range
// (packedVar / 16, which cleanly drops the low nibble since speed never
// exceeds 15) only happens on the rare frame a flip actually occurs.
export const musicArpSpeedRangeVarName = (channel) => `musicCh${channel}ArpSpeedRange`;
// Counter (frame countdown, 0-MAX_ARPEGGIO_SPEED_FRAMES) and phase (which
// note in the cycle, 0 - the longest ARPEGGIO_PHASE_SEQUENCES entry has 6
// steps) used to be two separate dev vars - counter fits a nibble exactly
// (0-15), phase comfortably fits the other one (0-5) - packed into one
// shared byte the same way arpSpeedRangeVar/arpBaseIntervalVar already pack
// their  two fields each. Counter in the LOW nibble (every frame this
// channel arpeggiates, it's decremented and compared - see arpApply's
// hot-path checks, which only need a cheap "& 15"/no-shift-at-all), phase in
// the HIGH nibble (only touched on the rare frame a flip actually happens,
// so it can afford the "/16"/"*16" a nibble in that position needs).
export const musicArpCounterPhaseVarName = (channel) => `musicCh${channel}ArpCounterPhase`;
// Base (0-31) and interval (0-7) merged into one shared byte - base |
// (interval << 5) - the exact same layout the AUDF data byte itself already
// uses (see eventsToPages), so this is literally just stored as-is straight
// from the fetched byte, no packing math needed at fetch time at all. Alt
// (base - interval) is no longer cached in its  dev var either - every
// place that used to read the base or alt dev var directly now derives
// whichever it needs from this one, only on the rare frame a flip actually
// lands on it (see arpApply's computeLines).
export const musicArpBaseIntervalVarName = (channel) => `musicCh${channel}ArpBaseInterval`;
const musicDataTableName = (channel, page) => `_musicCh${channel}Data${page}`;
// The shared instrument lookup table (see resolveProjectMusic's
// instrumentBytes build pass and eventsToPages'  INSTRUMENT_CHANGE_SENTINEL
// marker) - one AUDC|arpeggioSpeed<<4 byte per distinct instrument, indexed
// in the same stable order instrumentBytes itself uses. Project-wide, not
// per-channel or per-song, since an instrument's  byte value means the
// same thing regardless of which channel or song plays it.
const musicInstrumentTableName = () => '_musicInstruments';
// The other tables of the instrument lines (see instrumentSetOf), by the same index: volume; the watch index of "When note played"
// (shifted up a nibble); the arpeggio speed with its range, and its interval (shifted up 5 bits), for a channel that arpeggiates.
const musicInstrumentVolumeTableName = () => '_musicInstrVolume';
const musicInstrumentWatchTableName = () => '_musicInstrWatch';
const musicInstrumentPitchTableName = () => '_musicInstrPitch';
const musicInstrumentArpSpeedTableName = () => '_musicInstrArpSpeed';
const musicInstrumentArpIntervalTableName = () => '_musicInstrArpInterval';
// One entry per position in a song's  sequence (see resolveProjectMusic)
// - the page that channel's data starts at for whichever pattern plays at
// that position, so a repeated pattern's page only has to be looked up
// again, not re-stored. Only generated/read at all once there's more than
// one position/song to actually dispatch between (see the multiSeq/multiSong
// comments in generateMusicChecks) - songIndex is omitted for the common
// single-song case, reproducing the exact table name (and so the exact
// compiled output) a project with only one song has always used.
const musicSeqTableName = (channel, songIndex) =>
  songIndex === undefined ? `_musicCh${channel}Seq` : `_musicCh${channel}Song${songIndex}Seq`;
// Parallel to musicSeqTableName above, same one-entry-per-sequence-position
// shape and same single-song/multi-song naming split - how many MORE times
// (beyond the one about to start) that position's  pattern repeats before
// the sequence actually moves on (see musicSeqRepeatVarName). Only
// generated/read at all once music.hasRepeats is true. ONE shared table (not
// per-channel) - see musicSeqRepeatVarName's  comment for why the packed
// byte it stores doesn't need to vary by channel.
const musicSeqRepeatTableName = (songIndex) =>
  songIndex === undefined ? '_musicSeqRep' : `_musicSong${songIndex}SeqRep`;

// Prototype alternative to the per-song musicSeqTableName/
// musicSeqRepeatTableName split above, only used once
// music.combinedSeqTables is true (see resolveProjectMusic - gated on the
// combined table actually fitting in MAX_DATA_TABLE_VALUES). Every song's
// sequenceStartPage/sequenceRepeatPacked array is concatenated back to
// back into ONE table (per channel, for Seq; project-wide, for SeqRep, same
// "not per-channel" reasoning as musicSeqRepeatTableName itself) instead of
// one small table per song - see musicSongSeqOffsetTableName for how a
// specific song's  slice within it is found. Collapses the O(songs)
// "if songIndexVar <> X then goto next" dispatch chain generateMusicChecks
// used to need at every page/repeat lookup down to a single indexed table
// read, at the cost of one small per-song offset table shared by both.
const musicCombinedSeqTableName = (channel) => `_musicCh${channel}SeqAll`;
const musicCombinedSeqRepeatTableName = () => '_musicSeqRepAll';
// One entry per song (in songIndex order) - that song's  start offset
// within EVERY combined table above (musicCombinedSeqTableName for each
// channel, and musicCombinedSeqRepeatTableName) - all built by concatenating
// the same per-song arrays in the same songIndex order, so one offset table
// locates a song's  slice in all of them at once. Read once per
// pattern-transition dispatch point (not once per song), then just added to
// seqPosVar to get the final index - see generateMusicChecks'
// combinedSeqIndexLines.
const musicSongSeqOffsetTableName = () => '_musicSongSeqOffset';

// Name of the subroutine (see buildMusicPlayResetBody/RUN_ONCE_EDGE_RESET_NAME's
// comment in bbasic.js for the identical reasoning) a "Play song" call
// gosubs into, instead of each inlining its  full copy of the per-channel
// reset - a project with more than one "Play song" block used to duplicate
// this whole block once per call site, which on an already content-heavy
// project was enough by itself to push bank space that had otherwise fit
// into overflowing (confirmed directly: a project that compiled fine with
// one "Play song" block failed with two, referencing the exact same song,
// content otherwise unchanged). Registered into Blockly.BBasic.subroutines
// by bbasic.js's init() (see its  RUN_ONCE_EDGE_RESET_NAME registration,
// right next to this one) so it's relocatable exactly like a user-defined
// subroutine, rather than only ever inline at each call site.
//
// Only used when the project references exactly ONE song (see
// registerMusicPlayResetSubroutine) - once there's more than one, EACH
// song needs its  dedicated reset (see musicPlaySongResetName below)
// since which song a "Play song" block starts is no longer always the same
// one, so there's nothing left to usefully share under one name.
export const MUSIC_PLAY_RESET_NAME = '_music_play_reset';

// Per-song equivalent of MUSIC_PLAY_RESET_NAME above, used once a project
// references more than one song - every included song gets its reset
// subroutine (always, regardless of how many "Play song" blocks target it),
// since a shared name no longer makes sense when different call sites can
// target different songs.
export const musicPlaySongResetName = (songIndex) => `_music_play_song${songIndex}_reset`;

// Subroutine "Play song by ID" (see blocks/music.js) gosubs into once a
// project has more than one song - an if-chain comparing the runtime ID
// (written into musicPlayByIdArgVarName's  scratch var by the call site,
// since bB subroutines don't take parameters) against each included song's
// literal storage ID, gosub-ing into that song's
// musicPlaySongResetName subroutine (reusing it, not duplicating its body)
// and returning. No match silently falls through and returns - a no-op,
// rather than erroring, the same leniency subroutine_call's  stale-value
// fallback already uses elsewhere.
export const MUSIC_PLAY_BY_ID_NAME = '_music_play_by_id';
export const musicPlayByIdArgVarName = () => 'musicPlayByIdArg';
// Which song is currently active (that song's  0-based songIndex, see
// resolveProjectMusic) - set by every song's  reset subroutine. Only
// read back at the (relatively rare) moment a channel's sequence position
// advances, to pick which song's  Seq table (see musicSeqTableName) to
// consult - see generateMusicChecks'  seqTableLookup comment.
export const musicSongIndexVarName = () => 'musicSongIndex';
// Snapshots musicSongIndexVarName's  value at the exact moment a song
// naturally finishes (see generateMusicChecks'  finishCheck, right
// alongside where it sets musicJustStoppedBit) - lets music_song_stopped_by_
// id/_by_number (see their  generators below) tell WHICH song just
// stopped apart from "a song, some song, stopped", without needing a
// dedicated pooled bit per watched song the way music_sequence_chip_
// finished_by_id does (that system exists because MULTIPLE chip-finished
// watches can be genuinely simultaneous/overlapping; only one song is ever
// playing - and so ever stopping - at a time, so one shared "which song"
// byte is enough. Stays correctly matched to musicJustStoppedBit even if
// left unconsumed for a while - see the two "by" blocks'  comments - a
// later real stop always overwrites both together. Only reserved once the
// project actually has a music_song_stopped_by_id/_by_number block AND more
// than one song (see usesFilteredSongStopped/multiSong in
// reserveMusicDevVars) - a single-song project has nothing to distinguish.
export const musicJustStoppedSongVarName = () => 'musicJustStoppedSong';
// Current song's  sequence.length - replaces the literal constant the
// single-song version of generateMusicChecks' wrap check still uses
// directly, since that number now varies by whichever song is playing. Set
// by every song's  reset subroutine.
export const musicSeqLenVarName = () => 'musicSeqLen';

// Builds a song's  reset subroutine body: resets every channel THAT SONG
// uses (index/timer/page/sequence-position/arpeggio state, marked active),
// and - only once relevant, see the two branches below - either shares this
// logic under MUSIC_PLAY_RESET_NAME (project's only song) or becomes one of
// several musicPlaySongResetName subroutines (2+ songs), in which case it
// ALSO explicitly clears the active bit of every channel THIS song does NOT
// use (a channel some other included song uses, but this one doesn't) - a
// real correctness gap the single-song version never had to consider, since
// every song used to be the only one: without this, switching from a song
// that used a channel to one that doesn't would leave that channel stuck
// "active," still reading stale data from whatever it was last playing.
const buildMusicPlayResetBody = (Blockly, song, music) => {
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const resolveRW = (canonicalName) => Blockly.BBasic.superchipRwPairs[canonicalName];
  const flagsVar = resolveVar(musicFlagsVarName());
  // song.totalSteps (real repeats included) is what actually determines
  // whether any position-tracking is needed at all - song.sequenceLength
  // alone (now a GROUP count, see resolveProjectMusic) would wrongly skip
  // it for a song with only one group that still repeats several times.
  const multiSeq = song.totalSteps > 1;
  return Object.entries(music.channelPages).map(([channel, pages]) => {
    const pageReset = pages.length > 1 ? `${resolveRW(musicPageVarName(channel)).write} = 0\n` : '';
    const seqReset = multiSeq ? `${resolveVar(musicSeqPosVarName(channel))} = 0\n` : '';
    // The first group's  repeat count, already packed for both channels
    // (see resolveProjectMusic's  sequenceRepeatPacked) - a plain full
    // overwrite, not a masked per-nibble update, since this is a fresh
    // reset (nothing worth preserving from whatever the shared byte held
    // before).
    const seqRepeatReset = multiSeq && music.hasRepeats ?
      `${resolveVar(musicSeqRepeatVarName(channel))} = ${song.sequenceRepeatPacked[0] || 0}\n` : '';
    // Phase 0, counter 1 packed into one byte (see musicArpCounterPhaseVarName's
    // comment - counter in the low nibble) - a plain "= 1" already leaves
    // the high (phase) nibble zeroed too, same as the old two-statement
    // version did.
    const arpReset = music.channelHasArpeggio[channel] ?
      `${resolveVar(musicArpCounterPhaseVarName(channel))} = 1\n` :
      '';
    return `${resolveRW(musicIndexVarName(channel)).write} = 0\n${pageReset}${seqReset}${seqRepeatReset}${arpReset}` +
      `${resolveVar(musicTimerVarName(channel))} = 1\n` +
      `${flagsVar}{${musicChannelActiveBit(channel)}} = 1\n`;
  }).join('') + (Blockly.BBasic.avoxVoiceResetLines ? Blockly.BBasic.avoxVoiceResetLines() : '');
};

// Multi-song version of buildMusicPlayResetBody above - see its  comment
// for why every channel the project uses (not just this song's) needs
// visiting here, and why pageVar/seqPos are reset unconditionally (this
// song's  start page in the combined per-channel table is rarely 0 once
// an earlier song's pages already occupy the front of it, unlike the
// single-song case where it always was) rather than only when "needed" the
// way the single-song version still optimizes for.
const buildMusicPlaySongResetBody = (Blockly, song, music) => {
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const resolveRW = (canonicalName) => Blockly.BBasic.superchipRwPairs[canonicalName];
  const flagsVar = resolveVar(musicFlagsVarName());
  const lines = music.channels.map((channel) => {
    if (!song.channelsUsed.has(Number(channel))) {
      return `${flagsVar}{${musicChannelActiveBit(channel)}} = 0\n`;
    }
    // Phase 0, counter 1 packed into one byte - see buildMusicPlayResetBody's
    // identical line.
    const arpReset = music.channelHasArpeggio[channel] ?
      `${resolveVar(musicArpCounterPhaseVarName(channel))} = 1\n` :
      '';
    // Already packed for both channels (see resolveProjectMusic's
    // sequenceRepeatPacked) - a plain full overwrite, not a masked
    // per-nibble update, same reasoning as buildMusicPlayResetBody's
    // identical line.
    const seqRepeatReset = music.hasRepeats ?
      `${resolveVar(musicSeqRepeatVarName(channel))} = ${song.sequenceRepeatPacked[0] || 0}\n` : '';
    // pageVar only actually exists (see generateMusicChecks'  comment)
    // once this channel's  combined data spans more than one page -
    // writing to it otherwise would reference a dev var that was never
    // reserved at all.
    const pageReset = music.channelPages[channel].length > 1 ?
      `${resolveRW(musicPageVarName(channel)).write} = ${song.channelStartPage[channel]}\n` : '';
    return `${resolveRW(musicIndexVarName(channel)).write} = 0\n` +
      pageReset +
      `${resolveVar(musicSeqPosVarName(channel))} = 0\n` +
      seqRepeatReset +
      arpReset +
      `${resolveVar(musicTimerVarName(channel))} = 1\n` +
      `${flagsVar}{${musicChannelActiveBit(channel)}} = 1\n`;
  }).join('');
  return `${resolveVar(musicSongIndexVarName())} = ${song.songIndex}\n` +
    `${resolveVar(musicSeqLenVarName())} = ${Math.max(1, song.sequenceLength)}\n` +
    lines + (Blockly.BBasic.avoxVoiceResetLines ? Blockly.BBasic.avoxVoiceResetLines() : '');
};

// Builds MUSIC_PLAY_BY_ID_NAME's  if-chain body (see its  comment).
// getSubroutineBank (not getCurrentBank) is used for the "from" bank here
// since this body is built directly from bbasic.js's init(), not walked via
// a block's  generator (which is what normally keeps currentEventName -
// and so getCurrentBank - accurate) - MUSIC_PLAY_BY_ID_NAME's  resolved
// bank IS this code's  bank, known directly without it.
const buildMusicPlayByIdBody = (Blockly, music) => {
  const argVar = Blockly.BBasic.nameDB_.getName(musicPlayByIdArgVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const fromBank = Blockly.BBasic.getSubroutineBank(MUSIC_PLAY_BY_ID_NAME);
  return music.songs.map((song) => {
    const targetName = musicPlaySongResetName(song.songIndex);
    const suffix = Blockly.BBasic.bankJumpSuffix(fromBank, Blockly.BBasic.getSubroutineBank(targetName));
    return `if ${argVar} = ${song.songId} then gosub ${targetName}${suffix} : return`;
  }).join('\n');
};

// Called from bbasic.js's init(), right after this.projectMusic is resolved
// above - mirrors RUN_ONCE_EDGE_RESET_NAME's  registration (see its
// comment) for why this happens in init() rather than left until this
// block's  generator runs: getSubroutineBank/generateRelocatedSections
// need every subroutine name known up front, same as any user-defined one.
//
// singleSongShared (see musicPlayResetShared in bbasic.js's init()) only
// matters for the ONE-song case below: whether MUSIC_PLAY_RESET_NAME is
// worth registering at all depends on how many "Play song" call sites
// target that one song (a single call site is cheaper left inline - see
// buildMusicPlayResetBody's  comment). The 2+-song case is unconditional
// - always registered once there's more than one song to choose between,
// regardless of how many call sites exist, since "Play song by ID" alone
// (even a single call site) can still need to dispatch among every song in
// storage (see resolveProjectMusic's  usesSongById comment).
export const registerMusicPlayResetSubroutine = (Blockly, singleSongShared) => {
  const music = Blockly.BBasic.projectMusic;
  if (!music) return;
  if (music.songs.length === 1) {
    if (singleSongShared) {
      Blockly.BBasic.subroutines[MUSIC_PLAY_RESET_NAME] = buildMusicPlayResetBody(Blockly, music.songs[0], music);
    }
    return;
  }
  music.songs.forEach((song) => {
    Blockly.BBasic.subroutines[musicPlaySongResetName(song.songIndex)] =
      buildMusicPlaySongResetBody(Blockly, song, music);
  });
  if (music.usesSongById) {
    Blockly.BBasic.subroutines[MUSIC_PLAY_BY_ID_NAME] = buildMusicPlayByIdBody(Blockly, music);
  }
};

// Matches ARPEGGIO_RANGE_* in blocks/soundfx.js by array index. Each token
// names one of the 6 pitch variants precomputed once per note-fetch (see
// generateMusicChecks): B=base, A=alt (base+interval), UB/UA=one octave up,
// DB/DA=one octave down. Played in order, one per arpeggioSpeed frames,
// looping back to the start once the sequence ends.
// The old single-stage Fade's  runtime lookup tables/dispatch code
// (previously here) were removed along with the rest of its code
// generation - see generateMusicChecks'  comment on its ADSR Envelope
// successor. Still fully implemented in git history.

// Every channel actually used by at least one note anywhere in the song -
// only those need a data table + dev vars; an unused channel costs nothing.
export const musicChannelsUsedBySong = (song) => {
  const channels = new Set();
  (song.patterns || []).forEach((pattern) => {
    (pattern.tracks || []).forEach((track) => {
      if ((track.notes || []).length) channels.add(trackChannel(track));
    });
  });
  return channels;
};

// Flattens ONE pattern into an absolute-frame-timed event list per channel:
// {audv, audc, audf, frames}, including explicit {0,0,0,frames} rest/gap
// events so playback timing stays correct across silent stretches too.
// Mirrors utils/music-playback.js's  schedulePattern (identical
// tempo/step-to-seconds math) so ROM playback matches what the Music tab's
// browser preview plays, just quantized to whole NTSC frames instead of
// continuous AudioContext seconds. Applies the Options tab's "Dim SFX
// volume" setting to every note's  AUDV, the same way soundfx_play does
// for one-shot sound effects (see soundfx.js) - so turning that on/off
// affects music playback consistently with everything else on the channel.
//
// Scoped to a single pattern (rather than a song's whole sequence, an
// earlier version of this) so resolveProjectMusic can encode each DISTINCT
// pattern's data exactly once, no matter how many times - or from how many
// different sequence positions - it's actually played (see its  comment).
// A pattern's  encoded data is therefore always the same regardless of
// where in a sequence it's referenced, which is exactly what makes reusing
// it safe.
const flattenPatternEvents = (song, pattern, channels, soundEffects, config = {}, notePlayedIndexById = new Map(),
    channelHasEnvelopeOverride = null) => {
  const perChannel = {};
  channels.forEach((channel) => {
    perChannel[channel] = [];
  });

  // A muted (or, with something else soloed, effectively-muted) track is
  // treated exactly like it was never placed at all - its  notes never
  // enter perChannel, the same as if the user had deleted them - so the
  // compiled ROM matches whatever the Music tab's  preview already
  // plays, instead of always baking in every track regardless of its
  // mute/solo state (see isMusicTrackMuted's  comment in
  // hooks/project.js, the single shared formula MusicEditor.vue's
  // preview also uses). A one-shot, non-reactive read - correct as of
  // whenever this specific build was triggered, same as every other
  // Options-tab/app-preference read this function already does (see
  // useDimSoundFxStorage below).
  const mutedTrackIds = loadMutedMusicTrackIds();
  const soloedTrackIds = loadSoloedMusicTrackIds();

  // Merges into the previous event when it holds the exact same register
  // values, envelope flag, arpeggio speed/interval/range, AND
  // notePlayedIndex (e.g. two adjacent rests) - same audio, fewer bytes.
  // Never merges two AUDIBLE events (audv > 0) together, even when every
  // field matches exactly - each placed note is its  distinct attack the
  // user put on the piano roll, not a continuation of whatever happened to
  // precede it. Merging two adjacent same-pitch notes from the SAME
  // instrument used to collapse them into a single held note: harmless for
  // raw TIA audio (no discontinuity either way without an envelope), but it
  // silently dropped one of the two notes' "note played" watch firings
  // (see resolveNotePlayedInstruments) and any timing a project's  logic
  // derives from note boundaries - reported directly as "notes next to each
  // other, on the same pitch, blending into a single note". Merging rests
  // into each other (or into a following identical rest) is still safe and
  // desired - a rest never fires a note-played watch and has no boundary
  // for anything to observe.
  // Left un-chunked here on purpose: chunking to the per-channel
  // frame-per-byte limit only happens once, in a final pass below (see the
  // final chunking pass), so a long merged run always splits into the
  // fewest possible events instead of inheriting whatever chunk boundaries
  // its original pieces happened to have.
  const pushEvent = (channel, audv, audc, audf, frames, envelope = false, arpeggioSpeed = 0, arpeggioInterval = 0,
      arpeggioRange = 0, notePlayedIndex = 0, envelopeAttack = 0, envelopeDecay = 0, envelopeDecayEnd = 0,
      envelopeRelease = 0, envelopeSustainLength = 0, envelopeReleaseStart = 0, instrumentNp = 0, instrumentAudv = 0, hitPitch = 255,
      envelopeAttackEnd = 100, speech = null, speechFrames = 0) => {
    if (frames <= 0) return;
    const events = perChannel[channel];
    const prev = events[events.length - 1];
    if (prev && !(prev.audv > 0 && Number(audv) > 0) &&
      prev.audv === audv && prev.audc === audc && prev.audf === audf && prev.envelope === envelope &&
      prev.arpeggioSpeed === arpeggioSpeed && prev.arpeggioInterval === arpeggioInterval &&
      prev.arpeggioRange === arpeggioRange && prev.notePlayedIndex === notePlayedIndex &&
      prev.envelopeAttack === envelopeAttack && prev.envelopeDecay === envelopeDecay &&
      prev.envelopeDecayEnd === envelopeDecayEnd && prev.envelopeRelease === envelopeRelease &&
      prev.envelopeSustainLength === envelopeSustainLength && prev.envelopeReleaseStart === envelopeReleaseStart &&
      prev.instrumentNp === instrumentNp && prev.instrumentAudv === instrumentAudv &&
      prev.hitPitch === hitPitch && prev.envelopeAttackEnd === envelopeAttackEnd && speech === null && prev.speech === null) {
      prev.frames += frames;
    } else {
      events.push({audv, audc, audf, frames, envelope, arpeggioSpeed, arpeggioInterval, arpeggioRange,
        notePlayedIndex, envelopeAttack, envelopeDecay, envelopeDecayEnd, envelopeRelease, envelopeSustainLength,
        envelopeReleaseStart, instrumentNp, instrumentAudv, hitPitch, envelopeAttackEnd, speech, speechFrames});
    }
  };

  // A note whose instrument has a frequency sweep, a frequency envelope or a staircase volume has a pitch or volume that changes every
  // few frames, which the note events (one pitch and one volume each) cannot say: it is written out as a run of events, one for each stretch of frames with the
  // same pitch and volume (the volume envelope and the arpeggio too, since they are part of the same table). The same for a note of the
  // DPC+ chip, where the pitch is an entry of the chip's frequency table.
  const bakedFrames = (note, totalFrames) => {
    const table = soundPitchValues({...note.bakeSound, audf: note.bakePlan ? note.tiaAudf : note.audf, duration: totalFrames}, note.bakePlan,
        {arpeggioFrames: note.arpeggioSpeed, startHz: note.bakeStartHz}) || [];
    // A staircase volume is the volume of each frame already.
    const staircase = buildVolumeStaircase({...note.bakeSound, audv: note.audv, duration: totalFrames}, {loopSustain: true});
    let curve = null;
    if (staircase) {
      curve = Array.from({length: totalFrames}, (_, i) => staircase[Math.min(i, staircase.length - 1)]);
    } else if (note.envelope) {
      curve = buildEnvelopeCurve({
        attack: note.envelopeAttack, decay: note.envelopeDecay, decayEndPercent: note.envelopeDecayEnd,
        attackEndPercent: note.envelopeAttackEnd,
        sustainLength: note.envelopeSustainLength, releaseStartPercent: note.envelopeReleaseStart,
        release: note.envelopeRelease, peakVolume: note.audv, totalFrames, loopSustain: true,
      });
    }
    return Array.from({length: totalFrames}, (_, i) => ({
      audf: table.length ? table[Math.min(i, table.length - 1)] : note.audf,
      audv: curve ? curve[i] : note.audv,
    }));
  };
  // Pushes the events of one note (or of frames offset to offset + frames of it, when another note cut it short and it carries on).
  const pushNote = (channel, note, frames, offset = 0, totalFrames = frames) => {
    if (!note.bakeSound) {
      pushEvent(channel, note.audv, note.audc, note.audf, frames, note.envelope, note.arpeggioSpeed,
          note.arpeggioInterval, note.arpeggioRange, note.notePlayedIndex, note.envelopeAttack, note.envelopeDecay,
          note.envelopeDecayEnd, note.envelopeRelease, note.envelopeSustainLength, note.envelopeReleaseStart,
          note.instrumentNp, note.instrumentAudv, note.hitPitch, note.envelopeAttackEnd, note.speech, frames);
      return;
    }
    const perFrame = bakedFrames(note, totalFrames).slice(offset, offset + frames);
    let notePlayedIndex = offset === 0 ? note.notePlayedIndex : 0;
    for (let i = 0; i < perFrame.length;) {
      let end = i + 1;
      while (end < perFrame.length && perFrame[end].audv === perFrame[i].audv && perFrame[end].audf === perFrame[i].audf) end++;
      pushEvent(channel, perFrame[i].audv, note.audc, perFrame[i].audf, end - i, false, 0, 0, 0, notePlayedIndex,
          0, 0, 0, 0, 0, 0, note.instrumentNp, note.instrumentAudv, 255);
      notePlayedIndex = 0;
      i = end;
    }
  };

  const tempo = effectiveTempo(song, pattern);
  // Two steps per beat, LENGTH_UNITS_PER_STEP fine units per step - same
  // math as music-playback.js's stepSeconds/unitSeconds, converted to
  // frames instead of seconds.
  const framesPerUnit = (30 / tempo) / LENGTH_UNITS_PER_STEP * FRAMES_PER_SECOND;
  const stepCount = pattern.stepCount || DEFAULT_PATTERN_STEPS;
  const patternTotalFrames = Math.round(stepCount * LENGTH_UNITS_PER_STEP * framesPerUnit);

  // Merge every track's notes that share a channel into one time-sorted
  // list - safe because the piano roll already blocks same-channel tracks
  // from overlapping in time (see MusicEditor.vue's
  // trackNoteOverlappingUnits).
  const notesByChannel = {};
  channels.forEach((channel) => {
    notesByChannel[channel] = [];
  });
  (pattern.tracks || []).forEach((track) => {
    const channel = trackChannel(track);
    if (!notesByChannel[channel]) return;
    if (isMusicTrackMuted(mutedTrackIds, soloedTrackIds, song, pattern, track)) return;
    const baseSound = soundEffects.find(({id}) => `${id}` === `${track.soundEffectId}`);
    if (!baseSound) return;
    // Under DPC+ only the chip's channels are played by the chip (channel 1 stays on the TIA), and the notes on one use the settings the chip
    // has of the instrument: an instrument only played on one of them has nothing of the other in the ROM (see utils/chip-settings.js).
    const chipPlan = dpcPlusPlan && dpcPlusPlan.isChannel(channel) ? dpcPlusPlan : null;
    const soundEffect = settingsForChannel(baseSound, !!chipPlan);
    // arpeggioDivision is tempo-relative (e.g. 8 = "flip every 1/8 step" -
    // see blocks/soundfx.js), converted here into this note's  actual
    // frame count using the framesPerUnit already computed above for this
    // pattern - so the flip rate follows whichever tempo (song or pattern)
    // is actually in effect where this note plays, instead of a fixed
    // frame count. Clamped to what the duration byte's nibble can hold.
    // (A note of an AtariVox instrument is silent for the console: it only sets the watch of its instrument, if the AtariVox is on.)
    const isAvox = !!soundEffect.isAtariVox;
    // (A note of a voice instrument sets the watch too, and the program says its words: see speech.js. Its key is the voice, the pitch and the text.)
    const isVoice = isVoiceInstrument(soundEffect);
    const arpeggioSpeed = soundEffect.arpeggio && !isAvox ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES,
        Math.round((framesPerUnit * LENGTH_UNITS_PER_STEP) /
          (Number(soundEffect.arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)))) : 0;
    const arpeggioInterval = soundEffect.arpeggio && !isAvox ? Number(soundEffect.arpeggioInterval) || 0 : 0;
    const arpeggioRange = soundEffect.arpeggio && !isAvox ? Number(soundEffect.arpeggioRange) || 0 : 0;
    // Whether a note plays as a real chosen pitch or the instrument's
    // fixed hit-audf is decided from the instrument's CURRENT Sound type
    // (audc), not from whatever was true when the note was placed
    // (note.midi) - notes never store sound-type-dependent data of their
    // , they always follow the instrument's live settings, even if
    // those change after the note was placed.
    // Under DPC+ only channel 0 is played by the chip; channel 1 stays on the TIA, with the sound's Standard type.
    const isTunable = soundHasTunableNotes(soundEffect, !chipPlan);
    // 0 (the "no watched instrument" sentinel - see
    // resolveNotePlayedInstruments) for an instrument nothing actually
    // watches; same value every note on this track packs into its  AUDV
    // byte's spare nibble either way, computed once per track since it
    // depends only on the instrument, never on the individual note.
    const notePlayedIndex = notePlayedIndexById.get(`${soundEffect.id}`) || 0;
    (track.notes || []).forEach((note) => {
      // A hit plays at the pitch of the sound itself.
      // A note on a raw frequency row (a sound type with no in-tune notes) plays that frequency; not on the DPC+ chip.
      // On the DPC+ chip it is the pitch the TIA has for that frequency number with the instrument's sound type.
      const rawFrequency = rawFrequencyOf(note.midi);
      const audf = isAvox ? 0 : rawFrequency !== null ? (chipPlan ? chipPlan.pitchIdForTia(soundEffect.audc, rawFrequency) : rawFrequency) :
        !isTunable || note.midi === 'hit' ?
          (chipPlan ? chipPlan.pitchIdForSound(soundEffect) : soundEffect.audf) : noteAudf(note, soundEffect, !chipPlan);
      // (A note of the chip on a piano key is that key's place in the frequency table.)
      if (chipPlan && !isAvox && rawFrequency === null && isTunable && note.midi !== 'hit') chipPlan.useKey(audf);
      // Per-note override (see the Music tab's  piano-roll volume row),
      // falling back to the instrument's  preset - same DIM-scaling as
      // before, just applied to whichever value is actually in effect for
      // THIS note (an earlier version of this computed audv once per
      // TRACK, applying the exact same value to every note on it).
      // App-wide preference (see useDimSoundFxStorage's  comment in
      // hooks/project.js), not part of this project's  saved
      // configuration.
      const audv = isAvox ? 0 : noteAudv(note, soundEffect);
      notesByChannel[channel].push({
        startUnits: note.step,
        lengthUnits: note.length,
        audv,
        audc: isAvox ? 0 : chipPlan ? chipPlan.waveIdForSound(soundEffect) : soundEffect.audc,
        audf,
        envelope: !!soundEffect.envelope && !soundEffect.staircase && !isAvox,
        envelopeAttack: soundEffect.envelopeAttack,
        envelopeDecay: soundEffect.envelopeDecay,
        envelopeAttackEnd: soundEffect.envelopeAttackEnd,
        envelopeDecayEnd: soundEffect.envelopeDecayEnd,
        envelopeReleaseStart: soundEffect.envelopeReleaseStart,
        envelopeSustainLength: soundEffect.envelopeSustainLength,
        envelopeRelease: soundEffect.envelopeRelease,
        arpeggioSpeed,
        arpeggioInterval,
        arpeggioRange,
        notePlayedIndex,
        // The watch index of the instrument, which stays the same for every event of the note (notePlayedIndex above is only for the
        // event the note starts with when the note is written as several).
        instrumentNp: notePlayedIndex,
        // The volume of the instrument (the volume of the note is audv, which can be set for the note on the Music tab).
        instrumentAudv: Number(soundEffect.audv) || 0,
        // The pitch of a hit (a note that plays at the pitch of its instrument, which is stored once in the instrument tables); 255 for a
        // note with its pitch stored. The pitch of the TIA is up to 31, the pitch number of the chip up to 254.
        hitPitch: !isAvox && rawFrequency === null && (!isTunable || note.midi === 'hit') && Number(audf) >= 0 &&
          Number(audf) <= (chipPlan ? 254 : 31) ? Number(audf) : 255,
        // The instrument, for a note whose pitch changes while it plays (see bakedFrames).
        bakeSound: !isAvox && (soundEffect.sweep || soundEffect.pitchEnvelope || (soundEffect.envelope && soundEffect.staircase)) ? soundEffect : null,
        // For a note of the DPC+ chip: its plan, and the frequency of the piano key the note is on (a hit plays at the sound's frequency).
        bakePlan: chipPlan,
        bakeStartHz: chipPlan && rawFrequency !== null ? chipPlan.tiaFrequency(soundEffect.audc, rawFrequency) :
          chipPlan && isTunable && note.midi !== 'hit' ? frequencyForMidi(note.midi) : null,
        // The frequency number the sound's pitch starts from, for a sweep that follows the Standard pitches (see dpcFollowsStandardPitch).
        tiaAudf: rawFrequency !== null ? rawFrequency : soundEffect.audf,
        // Only meaningful for a note that actually ends up overlapping
        // another one (see the overlap-resolution pass below) - canPlaceNoteAt
        // in MusicEditor.vue lets any instrument, tunable or noise, land on
        // top of another track's note sharing the same channel, so this is
        // harmless dead weight only on a note that never overlaps anything.
        priority: Number(soundEffect.priority) || DEFAULT_NOISE_PRIORITY,
        speech: isVoice ? (String(note.text || '').trim() ? JSON.stringify([Number(soundEffect.avoxVoice), note.midi, String(note.text).trim()]) : '') : null,
      });
    });
  });

  channels.forEach((channel) => {
    const notes = notesByChannel[channel].slice().sort((a, b) => a.startUnits - b.startUnits);
    let cursorFrames = 0;
    // The audible note (if any) still sounding past cursorFrames -
    // {event, note, startFrames, endFrames}, null once nothing is open.
    // Only ever read by the overlap branch just below - the piano roll (see
    // canPlaceNoteAt in MusicEditor.vue) lets any instrument, tunable or
    // noise, land inside another track's already-placed note on the same
    // channel, so this branch can be reached by either kind.
    let openNote = null;

    notes.forEach((note) => {
      const startFrames = Math.round(note.startUnits * framesPerUnit);
      const lengthFrames = Math.max(1, Math.round(note.lengthUnits * framesPerUnit));
      const overlapsOpenNote = openNote && startFrames < openNote.endFrames;
      // Lower Priority (see the Sound tab's  field, only shown for a
      // noise instrument) than whatever's already sounding - dropped
      // entirely, openNote keeps playing straight through uninterrupted.
      // Equal priority still falls through to the "wins" branch below,
      // same plain "whichever note starts later wins" rule this had before
      // Priority existed - only a genuinely LOWER priority changes the
      // outcome.
      if (overlapsOpenNote && note.priority < openNote.note.priority) {
        return;
      }

      // Fire-and-forget channel steal, same technique a real tracker's
      // auto hi-hat uses (see canPlaceNoteAt's  comment): the still-
      // sounding background note is cut short right where this noise hit
      // starts, the noise hit plays as its  ordinary event, and (only if
      // the background note had time left over) a third event resumes it
      // for whatever's left of its  original duration - three plain
      // consecutive events on this channel's one linear timeline, no dev
      // var or runtime resume check needed at all.
      // A note whose pitch changes is a run of events, so it is cut by taking them out and writing the part before the new note, the new
      // note, and the part after it again from the note's frames.
      if (overlapsOpenNote && openNote.note.bakeSound) {
        const bg = openNote.note;
        perChannel[channel].splice(openNote.eventIndex, openNote.eventCount);
        if (startFrames > openNote.startFrames) {
          pushNote(channel, bg, startFrames - openNote.startFrames, openNote.startFrames - openNote.noteStart, openNote.noteFrames);
        }
        pushNote(channel, note, lengthFrames);
        const tailFrames = openNote.endFrames - (startFrames + lengthFrames);
        if (tailFrames > 0) {
          const eventIndex = perChannel[channel].length;
          pushNote(channel, bg, tailFrames, startFrames + lengthFrames - openNote.noteStart, openNote.noteFrames);
          openNote = {
            ...openNote, event: perChannel[channel][perChannel[channel].length - 1], startFrames: startFrames + lengthFrames,
            eventIndex, eventCount: perChannel[channel].length - eventIndex,
          };
        } else {
          cursorFrames = Math.max(cursorFrames, startFrames + lengthFrames);
          openNote = null;
        }
        return;
      }

      if (overlapsOpenNote) {
        const hasTail = openNote.endFrames > startFrames + lengthFrames;
        openNote.event.frames = startFrames - openNote.startFrames;
        if (openNote.event.frames <= 0) {
          // Cut down to nothing (the noise hit landed exactly by itself
          // start) - it never actually sounded, so drop it rather than
          // spend bytes on a zero-length record.
          perChannel[channel].splice(perChannel[channel].indexOf(openNote.event), 1);
        } else if (hasTail) {
          // Only the chronologically LAST piece of a split note keeps the
          // envelope - same rule the long-note chunking pass below already
          // follows (an envelope fires once, right before the note actually
          // ends, never at an arbitrary cut point) - the head is never the
          // last piece once a tail follows.
          openNote.event.envelope = false;
        }
        pushNote(channel, note, lengthFrames);
        if (hasTail) {
          const bg = openNote.note;
          pushNote(channel, bg, openNote.endFrames - (startFrames + lengthFrames), 0, openNote.endFrames - (startFrames + lengthFrames));
          openNote = {
            event: perChannel[channel][perChannel[channel].length - 1], note: bg,
            startFrames: startFrames + lengthFrames, endFrames: openNote.endFrames,
          };
        } else {
          cursorFrames = Math.max(cursorFrames, startFrames + lengthFrames);
          openNote = null;
        }
        return;
      }

      if (startFrames > cursorFrames) {
        pushEvent(channel, 0, 0, 0, startFrames - cursorFrames);
      }
      // The envelope's  numeric shape (attack/decay/sustain/release)
      // travels through as plain compile-time fields here - never written
      // to the byte stream directly (see eventsToPages'  comment on why
      // a 4th envelopeConfigIndex byte was tried and reverted), only used
      // there to register this shape (scoped to this event's  length and
      // peak volume) into the shared envelope-config pool and emit an
      // ENVELOPE_CHANGE_SENTINEL marker when it actually changes.
      const eventIndex = perChannel[channel].length;
      pushNote(channel, note, lengthFrames);
      cursorFrames = startFrames + lengthFrames;
      openNote = note.audv > 0 ?
        {
          event: perChannel[channel][perChannel[channel].length - 1], note, startFrames, endFrames: cursorFrames,
          // Where the note starts, how long it is, and which events of the channel are its (a note whose pitch changes is several).
          noteStart: startFrames, noteFrames: lengthFrames, eventIndex, eventCount: perChannel[channel].length - eventIndex,
        } :
        null;
    });

    // Fill any remaining silence to the end of THIS pattern, even a channel
    // with no notes in it at all - every pattern a channel is silent in
    // still needs its (all-rest) data, so every channel's data for a
    // given sequence position always spans the exact same number of frames,
    // keeping every channel in lockstep at each pattern boundary regardless
    // of which channels actually have notes in which patterns.
    if (patternTotalFrames > cursorFrames) {
      pushEvent(channel, 0, 0, 0, patternTotalFrames - cursorFrames);
      cursorFrames = patternTotalFrames;
    }
  });

  // A duration byte holds up to MAX_EVENT_FRAMES: expand each (now fully merged) event longer than that into consecutive events of
  // that length, done as this one final pass so a long merged run gets the fewest possible chunks. Only the LAST chunk of a note that got
  // split keeps the envelope flag - a long held note split into several chunks should only apply its envelope once, right before it
  // actually ends, not at every chunk boundary. Arpeggio speed/interval/range, unlike envelope, carry through every chunk unchanged -
  // they describe the whole note, not just its tail.
  const chunked = {};
  Object.entries(perChannel).forEach(([channel, events]) => {
    chunked[channel] = [];
    const playedEvents = dpcPlusPlan && dpcPlusPlan.isChannel(channel) ?
      events.flatMap((event) => (event.arpeggioSpeed > 0 && event.audv > 0 ? arpeggioToEvents(event) : [event])) : events;
    playedEvents.forEach(({audv, audc, audf, frames, envelope, arpeggioSpeed, arpeggioInterval, arpeggioRange,
      notePlayedIndex, instrumentNp, instrumentAudv, hitPitch, envelopeAttack, envelopeDecay, envelopeDecayEnd, envelopeRelease, envelopeSustainLength,
      envelopeReleaseStart, envelopeAttackEnd, speech}) => {
      const maxFrames = MAX_EVENT_FRAMES;
      let remaining = frames;
      // (The words of a note of a voice are said once, at the first chunk of a long note that is several events; the watch fires for each of them.)
      let firstChunk = true;
      while (remaining > 0) {
        const chunkFrames = Math.min(remaining, maxFrames);
        remaining -= chunkFrames;
        // notePlayedIndex carries through every chunk unchanged, same as
        // arpeggio's  fields - a "note played" watch on an instrument
        // whose note is long enough to split into several chunks (past
        // MAX_EVENT_FRAMES) fires
        // once per CHUNK, not once for the whole held note, since each chunk
        // is its  independently-fetched event at runtime with no concept
        // of "this is a continuation" - an accepted rare-case quirk rather
        // than spending another bit tracking it.
        const isFinalChunk = remaining === 0;
        const thisFirstChunk = firstChunk;
        firstChunk = false;
        chunked[channel].push({
          audv, audc, audf, frames: chunkFrames, envelope: envelope && isFinalChunk,
          arpeggioSpeed, arpeggioInterval, arpeggioRange, notePlayedIndex, instrumentNp, instrumentAudv, hitPitch,
          speech: speech === null || speech === undefined ? null : (thisFirstChunk ? speech : ''),
          // (the length of the whole note, on the first chunk: the program stops the voice when it ends)
          speechFrames: thisFirstChunk ? frames : 0,
          envelopeAttack: isFinalChunk ? envelopeAttack : 0,
          envelopeDecay: isFinalChunk ? envelopeDecay : 0,
          envelopeDecayEnd: isFinalChunk ? envelopeDecayEnd : 0,
          envelopeRelease: isFinalChunk ? envelopeRelease : 0,
          envelopeSustainLength: isFinalChunk ? envelopeSustainLength : 0,
          envelopeReleaseStart: isFinalChunk ? envelopeReleaseStart : 0,
          envelopeAttackEnd: isFinalChunk ? envelopeAttackEnd : 100,
        });
      }
    });
  });
  return chunked;
};

// True if any note played on this channel has its Envelope enabled on its
// Sound tab preset - only such a channel needs the envelope bit/dev vars/
// per-frame check at all (see resolveProjectMusic/generateMusicChecks).
export const musicChannelHasEnvelope = (events) => events.some((event) => event.envelope);

// True if any note played on this channel has Arpeggio enabled on its Sound
// tab preset - only such a channel needs the arpeggio nibble/bits/dev
// vars/per-frame check at all (see resolveProjectMusic/generateMusicChecks).
export const musicChannelHasArpeggio = (events) => events.some((event) => event.arpeggioSpeed > 0);

// What an instrument gives to each of its notes, one line of the instrument tables for each distinct set (see getInstrumentIndex in
// resolveProjectMusic): the sound type and the arpeggio speed (byte), the volume, the "note played" watch index (shifted up a nibble, as
// the watch checks compare it), the arpeggio speed with its range (as the arpeggio byte of the channel holds them) and its interval
// (shifted, as it is combined with the pitch). The volume is the volume of the instrument: a note with another volume has a marker for it.
const instrumentSetOf = (event) => {
  const arpeggioSpeed = Number(event.arpeggioSpeed) || 0;
  return {
    byte: Number(event.audc) | (arpeggioSpeed << 4),
    volume: Number(event.instrumentAudv) & 15,
    watch: (Number(event.instrumentNp) || 0) << 4,
    speedRange: arpeggioSpeed | ((Number(event.arpeggioRange) || 0) << 4),
    interval: (Number(event.arpeggioInterval) || 0) << 5,
    // The pitch of the hits of the instrument (255 when its notes have their pitch stored).
    fixed: Number(event.hitPitch) <= 254 ? Number(event.hitPitch) : 255,
  };
};
const instrumentSetKey = (set) => `${set.byte},${set.volume},${set.watch},${set.speedRange},${set.interval},${set.fixed}`;
// Whether a note of a TIA channel is a hit written in the short form (see SHORT_FORM_FLAG).
const isHitEvent = (event) => !isRestEvent(event) && Number(event.hitPitch) <= 254;
// A rest has no volume and no watched note (it keeps its pitch, which a silent note of a sound that changes its pitch has).
const isRestEvent = (event) => !(Number(event.audv) > 0) && !(Number(event.notePlayedIndex) > 0);
// How a note says its volume is not the one of its instrument: 0 it is, 1 in its duration byte, 2 with a marker before it (see
// VOLUME_MARKER_BASE).
const volumeModeOf = (event, chip) => {
  const volume = Number(event.audv) & 15;
  if (isRestEvent(event) || volume === (Number(event.instrumentAudv) & 15)) return 0;
  if (chip) return 2;
  return Number(event.frames) <= PACKED_DURATION_LIMIT && volume !== UNPACKABLE_VOLUME && !isHitEvent(event) ? 1 : 2;
};
// Whether the channel is played by the chip of DPC+, where a pitch is a number up to 88 instead of the 5 bits of an AUDF.
const isChipChannel = (channel) => !!(dpcPlusPlan && dpcPlusPlan.isChannel(Number(channel)));

// Converts one channel's event list into the raw byte pages for its data tables. An event is a note or a rest of 1 to 3 bytes (see
// SHORT_FORM_FLAG and noteBytes: a rest or a hit is 1 byte when it lasts 31 frames or less, a note with its pitch stored is 2). Everything
// else a note has comes from its instrument, a line of the instrument tables that a 2-byte INSTRUMENT_CHANGE_SENTINEL marker picks whenever
// the instrument of the notes changes (the sound type, volume, arpeggio, "note played" watch and hit pitch of the instrument, see
// instrumentSetOf). A note with another volume than its instrument has a 1-byte marker before it or the volume in its bytes (see
// VOLUME_MARKER_BASE).
//
// Every pattern's first note is preceded by a marker (lastInstrumentKey starts null on every call, never carried in from a caller): a
// pattern can be reached from many points of a song's sequence (see resolveProjectMusic's sequenceStartPage), so nothing here may
// assume which instrument the pattern played before it left.
//
// The envelope of a note depends on its length and its volume, so it has its marker too, whenever the shape changes (see
// ENVELOPE_CHANGE_SENTINEL). The 3 flags in the byte of a note: rest (volume 0, nothing to watch), and the watch flag (this note starts
// a note of an instrument the project watches with "When note played").
//
// A single "data" table can only hold MAX_DATA_TABLE_VALUES bytes, so events (and markers) are split across multiple pages/tables as
// needed - never splitting an item's bytes across a page boundary, since the reader always reads one whole item at a time. Every
// page but the last is terminated by PAGE_BREAK_SENTINEL alone (advance to the next page and keep reading); the last page is
// terminated by LOOP_SENTINEL alone - neither is padded out to a full record, the reader checks for them before trying to read the
// rest of an item (see generateMusicChecks below).
// The bytes of a note or a rest (see SHORT_FORM_FLAG), without its markers.
const noteBytes = (item, chip) => {
  const {audf, audv, frames, notePlayedIndex} = item.event;
  const watched = Number(notePlayedIndex) > 0;
  if (chip) {
    if (item.rest) return [0, frames];
    if (!item.hit && Number(audf) >= VOLUME_MARKER_BASE) throw new Error('The music uses a pitch number of the DPC+ chip above 223.');
    return item.hit ? [frames] : [Number(audf), frames];
  }
  if (item.rest || item.hit) {
    const flags = SHORT_FORM_FLAG | (item.rest ? REST_FLAG : 0) | (watched ? WATCH_FLAG : 0);
    return frames <= SHORT_FORM_FRAMES ? [flags | frames] : [flags, frames];
  }
  const packed = item.volumeMode === 1;
  return [(Number(audf) & 31) | (packed ? TUNED_PACKED_FLAG : 0) | (watched ? WATCH_FLAG : 0),
    packed ? ((Number(audv) & 15) << 4) | frames : frames];
};

const eventsToPages = (events, getInstrumentIndex, chip) => {
  const MARKER_SIZE = 2;

  const items = [];
  let lastInstrumentKey = null;
  // NO_ENVELOPE_SENTINEL (never a real config index) as the initial value guarantees this pattern's FIRST event always gets an
  // explicit envelope marker, same reasoning as lastInstrumentKey's null start. Tracked for EVERY event, rests included: a stale
  // envelopeConfig/envelopeStage{channel} left pointing at a previous note's config would otherwise keep being read by the per-frame
  // check (generateEnvelopeChecks in soundfx.js) all through a following rest or non-enveloped note, spuriously writing to AUDV.
  let lastEnvelopeSelector = NO_ENVELOPE_SENTINEL;
  events.forEach((event) => {
    const {audv, frames, envelope, envelopeAttack, envelopeDecay, envelopeDecayEnd, envelopeRelease, envelopeSustainLength,
      envelopeReleaseStart, envelopeAttackEnd} = event;
    const rest = isRestEvent(event);
    let volumeMode = 0;
    let noWatch = false;
    if (!rest) {
      const set = instrumentSetOf(event);
      const key = instrumentSetKey(set);
      if (key !== lastInstrumentKey) {
        items.push({marker: true, instrument: true, index: getInstrumentIndex(set)});
        lastInstrumentKey = key;
      }
      volumeMode = volumeModeOf(event, chip);
      noWatch = chip && Number(event.notePlayedIndex) === 0 && set.watch !== 0;
    }
    // The RAW envelopeAttack/Decay/SustainLength/Release values (registerEnvelopeConfig does its clamping internally - see its comment
    // in generators/bbasic/soundfx.js), with loopSustain explicitly on: a note placed in the piano roll longer than its instrument's
    // envelope loops the Decay End -> Release Start ramp to fill the gap instead of falling silent (see utils/envelope.js's comment on
    // clampEnvelopeStages for why this is Music-only, not shared with Sound Effects).
    const envelopeSelector = envelope ? registerEnvelopeConfig({
      attack: envelopeAttack, decay: envelopeDecay, sustainLength: envelopeSustainLength,
      release: envelopeRelease, decayEndPercent: envelopeDecayEnd, releaseStartPercent: envelopeReleaseStart,
      peakVolume: Number(audv), totalFrames: frames, loopSustain: true, attackEndPercent: envelopeAttackEnd,
    }) : NO_ENVELOPE_SENTINEL;
    if (envelopeSelector !== lastEnvelopeSelector) {
      if (envelopeSelector >= VOLUME_MARKER_BASE && envelopeSelector < NO_ENVELOPE_SENTINEL) {
        throw new Error('The music uses more than 223 different envelope shapes: use fewer volumes on the instruments with an envelope.');
      }
      items.push({marker: true, instrument: false, index: envelopeSelector});
      lastEnvelopeSelector = envelopeSelector;
    }
    items.push({marker: false, event, rest, volumeMode, noWatch, hit: isHitEvent(event)});
  });

  const pages = [];
  let current = [];
  let currentSize = 0;
  items.forEach((item) => {
    // A volume marker and the note it is for are one item: a page can end between markers, but not between this and its note.
    const size = item.marker ? MARKER_SIZE : noteBytes(item, chip).length + (item.volumeMode === 2 ? 1 : 0) + (item.noWatch ? 1 : 0);
    // +size for the item about to be added, +1 reserved for this page's terminator byte.
    if (currentSize + size + 1 > MAX_DATA_TABLE_VALUES) {
      pages.push(current);
      current = [];
      currentSize = 0;
    }
    current.push(item);
    currentSize += size;
  });
  pages.push(current);

  return pages.map((pageItems, pageIndex) => {
    const bytes = [];
    pageItems.forEach((item) => {
      if (item.marker) {
        bytes.push(item.instrument ? INSTRUMENT_CHANGE_SENTINEL : ENVELOPE_CHANGE_SENTINEL, item.index);
        return;
      }
      if (item.noWatch) bytes.push(NOWATCH_MARKER);
      if (item.volumeMode === 2) bytes.push(VOLUME_MARKER_BASE + (Number(item.event.audv) & 15));
      bytes.push(...noteBytes(item, chip));
    });
    bytes.push(pageIndex === pages.length - 1 ? LOOP_SENTINEL : PAGE_BREAK_SENTINEL);
    return bytes;
  });
};

// Finds every song the project actually needs compiled in for playback and
// builds one COMBINED set of per-channel data pages spanning all of them
// (see eventsToPages - a channel needing more than one data table's worth of
// bytes spans several). Returns null if nothing references a song at all.
//
// A "Play song" block (fixed dropdown) only pulls in the specific song(s) it
// references. "Play song by ID" (see blocks/music.js) takes a genuine
// runtime value instead - a variable or computed expression, not a dropdown
// - so there's no way to know at compile time which song any given run will
// actually pick; its mere presence anywhere in the project pulls in EVERY
// song from storage instead, so whatever ID it's given at runtime always has
// real data to find.
//
// Each DISTINCT pattern any included song's  sequence references is
// flattened and paged exactly once (see flattenPatternEvents), no matter how
// many times - or from how many different positions, in how many different
// songs'  sequences - it's actually played; repeats are handled purely by
// a lookup, not by storing the same bytes again (see each song's
// channelStartPage/sequenceStartPage below, and generateMusicChecks'
// loop-reset comment). A second song's  distinct patterns are simply MORE
// entries appended to the same per-channel table list a first song's already
// occupy - this is what lets the hot per-frame read dispatch
// (pagedReadLines/generateMusicChecks) stay completely unchanged regardless
// of how many songs are involved: it already reads "one of N tables picked
// by a page index," and N just grows. Throws a clear compile error if the
// combined data would need more than MAX_MUSIC_PAGES tables on any one
// channel (a sanity guard, not a real format limit).
export const resolveProjectMusic = (workspace, notePlayedIndexById = new Map()) => {
  // Same "no song configured" path a project with zero song references
  // already takes (see the empty songRefs.length check below) - every
  // dev-var reservation, per-frame check, and data table this drives is
  // already gated behind "is projectMusic non-null" throughout bbasic.js/
  // this file, so returning null here for the SAME reason (rather than
  // generating everything as normal and then silencing AUDV writes after
  // the fact) removes the whole music player's code and data from the
  // compiled ROM outright when muted, not just its audio output - AUDV is
  // real, unbuffered TIA hardware, so a "write, then immediately overwrite
  // with 0" approach still let the very start of every note briefly,
  // audibly reach the speaker first; never generating the write at all has
  // no such gap, and saves the ROM space besides.
  const configurationStorage = useConfigurationStorage();
  if (((configurationStorage && configurationStorage.value) || {}).muteAllAudio) return null;

  const usesSongById = workspace.getAllBlocks(false).some((block) => block.type === 'music_play_song_by_id');
  // Same "no compile-time target, so every song has to be available at
  // runtime" reasoning as usesSongById above, for music_song_playing_by_
  // number's  dynamic SONG_ID - kept as its  flag (not folded into
  // usesSongById itself) since that one ALSO gates the actual "Play song by
  // ID" dispatch subroutine and its scratch arg var (see
  // registerMusicPlayResetSubroutine and musicPlayByIdArgVarName's
  // reservation below), neither of which this purely-read-only check needs -
  // widening usesSongById itself would reserve both for a project that only
  // ever uses this block, never actually plays a song by dynamic ID.
  const usesSongPlayingByNumber = workspace.getAllBlocks(false)
      .some((block) => block.type === 'music_song_playing_by_number');
  const needsEverySong = usesSongById || usesSongPlayingByNumber;
  // Whether this project's "When song has stopped playing" watches ever
  // need to filter by which specific song stopped (music_song_stopped_by_id/
  // _by_number), rather than firing for whichever song happens to stop -
  // gates musicJustStoppedSongVarName's  reservation below (see its
  // comment) the same way usesSongById gates musicPlayByIdArgVarName's.
  const usesFilteredSongStopped = workspace.getAllBlocks(false)
      .some((block) => block.type === 'music_song_stopped_by_id' || block.type === 'music_song_stopped_by_number');
  const referencedIds = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'music_play_song') referencedIds.add(`${block.getFieldValue('SONG')}`);
  });
  const songRefs = needsEverySong ?
    processSongsStorageDefaults(useSongsStorage()).songs.map(({id}) => `${id}`) :
    [...referencedIds];
  if (!songRefs.length) return null;

  const soundEffects = processSoundEffectsStorageDefaults(useSoundEffectsStorage()).soundEffects;
  const config = (configurationStorage && configurationStorage.value) || {};

  // A stale/unmatched dropdown value (see findSongById), or a song whose
  // sequence is empty (nothing to ever actually play), is silently dropped
  // rather than compiled in as a dead entry.
  const resolvedSongs = songRefs
      .map((id) => ({id, song: findSongById(id)}))
      .filter(({song}) => song && (song.sequence || []).length > 0);
  if (!resolvedSongs.length) return null;

  // Union of every channel ANY included song actually uses - drives dev var
  // reservation for the whole project (see bbasic.js's init()), the same
  // resource a single song's  channels used to drive alone.
  const channels = new Set();
  resolvedSongs.forEach(({song}) => musicChannelsUsedBySong(song).forEach((channel) => channels.add(channel)));

  // Which channels each WATCHED instrument (see resolveNotePlayedInstruments)
  // is actually assigned to on any track, across every included song's every
  // pattern - lets generateMusicChecks skip a channel's  dispatch
  // entirely for an instrument that channel could never play (e.g. a
  // melody-only instrument never assigned to the drum channel), instead of
  // emitting - and running, on literally every note fetch - a comparison
  // against an index that channel will never see. Harmless if slightly
  // over-inclusive (an empty track still counts): this is a dispatch-size/
  // cycle optimization only, never a correctness requirement, since the
  // watch's  flag bit (see resolveMusicEventFlags'  notePlayed map)
  // only ever actually gets set when temp1's packed nibble genuinely
  // matches.
  const notePlayedChannelsById = new Map();
  if (notePlayedIndexById.size) {
    resolvedSongs.forEach(({song}) => {
      (song.patterns || []).forEach((pattern) => {
        (pattern.tracks || []).forEach((track) => {
          const id = `${track.soundEffectId}`;
          if (!notePlayedIndexById.has(id)) return;
          const channel = trackChannel(track);
          if (!notePlayedChannelsById.has(id)) notePlayedChannelsById.set(id, new Set());
          notePlayedChannelsById.get(id).add(channel);
        });
      });
    });
  }

  // Every distinct AUDC|arpeggioSpeed<<4 "instrument" byte actually used by
  // any AUDIBLE note (audv > 0 - a rest's  placeholder audc=0 would
  // otherwise falsely register as its  distinct "instrument") in any
  // pattern any included song's sequence actually references, deduplicated
  // project-wide (not per-channel/per-pattern) into one small shared lookup
  // table - see musicInstrumentTableName/generateMusicChecks'
  // INSTRUMENT_CHANGE_SENTINEL handling for where this gets used. Assigned
  // index in first-seen order, walked here in its  pass (calling
  // flattenPatternEvents a second time - it's pure, so this is safe, just
  // some repeated compile-time work) SPECIFICALLY so every table index is
  // already known and stable before eventsToPages below ever needs to
  // reference one - a table built up lazily DURING that same pass could
  // assign a different index to the same instrument depending on which
  // channel or pattern happened to encode it first, silently corrupting
  // playback for whichever channel didn't "win" that race.
  const instrumentSets = [];
  const instrumentIndexByKey = new Map();
  const getInstrumentIndex = (set) => {
    const key = instrumentSetKey(set);
    if (instrumentIndexByKey.has(key)) return instrumentIndexByKey.get(key);
    const index = instrumentSets.length;
    // A marker holds the index in 1 byte and an index must stay clear of the sentinels (252 and up).
    if (index >= VOLUME_MARKER_BASE) throw new Error('The music uses more than 223 different instruments (sound type, volume, arpeggio and watch).');
    instrumentSets.push(set);
    instrumentIndexByKey.set(key, index);
    return index;
  };
  resolvedSongs.forEach(({song}) => {
    const distinctPatternIds = [...new Set((song.sequence || []).map((group) => `${group.patternId}`))];
    distinctPatternIds.forEach((patternId) => {
      const pattern = (song.patterns || []).find(({id: pid}) => `${pid}` === patternId);
      if (!pattern) return;
      const perChannel = flattenPatternEvents(song, pattern, channels, soundEffects, config, notePlayedIndexById);
      Object.entries(perChannel).forEach(([channel, events]) => {
        events.forEach((event) => {
          if (!isRestEvent(event)) getInstrumentIndex(instrumentSetOf(event));
        });
      });
    });
  });

  // Whether ANY pattern, from ANY included song, ever plays an enveloped
  // note on this channel - needed BEFORE the real encoding pass below runs
  // (not derived incrementally as it goes), because generateMusicChecks'
  // duration-byte read (see its  hasEnvelope comment) masks off bit 7
  // per CHANNEL, project-wide, not per pattern. Passing this precomputed,
  // already-global flag into flattenPatternEvents (as channelHasEnvelopeOverride)
  // makes its  duration-byte chunking use the exact same scope the reader
  // will use - previously it recomputed a PATTERN-local hasEnvelope instead
  // (see flattenPatternEvents'  now-updated comment), so a channel mixing
  // one enveloped pattern with another, ordinary pattern could legitimately
  // write a long rest/note's duration byte with bit 7 set as part of the raw
  // frame count in the ordinary pattern, which the reader then silently
  // stripped 128 frames from - cutting that note/rest short and reported as
  // "missing notes", including on channels/notes that never enabled envelope
  // themselves at all. Computed the same way channelHasEnvelope itself is
  // (musicChannelHasEnvelope on flattenPatternEvents'  un-chunked-scope-
  // agnostic output - envelope presence survives chunking regardless of
  // maxFrames, see flattenPatternEvents'  isFinalChunk handling), just
  // run as its  pre-pass, mirroring instrumentBytes' pre-pass just above.
  const channelHasEnvelopeGlobal = {};
  channels.forEach((channel) => {
    channelHasEnvelopeGlobal[channel] = false;
  });
  resolvedSongs.forEach(({song}) => {
    const distinctPatternIds = [...new Set((song.sequence || []).map((group) => `${group.patternId}`))];
    distinctPatternIds.forEach((patternId) => {
      const pattern = (song.patterns || []).find(({id: pid}) => `${pid}` === patternId);
      if (!pattern) return;
      const perChannel = flattenPatternEvents(song, pattern, channels, soundEffects, config, notePlayedIndexById);
      Object.entries(perChannel).forEach(([channel, events]) => {
        if (musicChannelHasEnvelope(events)) channelHasEnvelopeGlobal[channel] = true;
      });
    });
  });

  // Whether a "Play sound" block (soundfx_play or simple_sound_set) exists
  // anywhere in the project that could ever hand this SPECIFIC channel's
  // hardware output back and forth with music - see generateMusicChecks'
  // resumeCheck/suppressibleWrite, which used to be generated for every
  // music channel unconditionally as soon as ANY music existed at all,
  // regardless of whether anything on that channel ever actually shared it
  // with a sound effect. That cost 3 extra branch checks every single frame
  // per channel (durationVar<>1/!activeBit/indexVar<3) plus an extra branch
  // wrapping every register write during a note fetch, for a feature a
  // project not actually interleaving sound effects with that channel's
  // music never uses - channnel{channel}duration would just permanently
  // read 0, so every one of those checks always took its  no-op branch.
  // CHANNEL is a fixed dropdown field on both block types (not a runtime
  // expression), so which channel each one targets is fully known here at
  // compile time, same reasoning as soundEffectChannelHasEnvelope in
  // soundfx.js.
  const channelHasSoundEffectDuration = {};
  channels.forEach((channel) => {
    channelHasSoundEffectDuration[channel] = workspace.getAllBlocks(false).some((block) =>
      (block.type === 'soundfx_play' || block.type === 'simple_sound_set') && block.isEnabled() &&
      `${block.getFieldValue('CHANNEL')}` === `${channel}`);
  });

  const channelPages = {};
  // Whether any note of the project starts a note of a watched instrument (see resolveNotePlayedInstruments): only then do the
  // instrument tables have the watch index.
  let anyWatch = false;
  // Which channels have a note with a volume other than the one of its instrument (a volume marker before it).
  const channelHasVolumeMarkers = {};
  const channelHasPackedVolumes = {};
  const channelHasFixedNotes = {};
  const channelHasTunedNotes = {};
  const channelHasNoWatchMarkers = {};
  const channelHasEnvelope = {};
  const channelHasArpeggio = {};
  // Parallel to channelPages[channel] - which song's  songId contributed
  // each page (patterns aren't shared across songs, so every page in the
  // combined array belongs to exactly one song, even once several songs'
  // pages are concatenated together here). Purely for the Generated
  // Code tab's "rem" labels on each data table (see songLabel/
  // generateMusicDataTables below) - nothing here reads it back at runtime.
  const channelPageSongIds = {};
  channels.forEach((channel) => {
    channelPages[channel] = [];
    channelHasEnvelope[channel] = false;
    channelHasVolumeMarkers[channel] = false;
    channelHasPackedVolumes[channel] = false;
    channelHasFixedNotes[channel] = false;
    channelHasTunedNotes[channel] = false;
    channelHasNoWatchMarkers[channel] = false;
    channelHasArpeggio[channel] = false;
    channelPageSongIds[channel] = [];
  });

  const songs = resolvedSongs.map(({id, song}, songIndex) => {
    // song.sequence is already stored as {id, patternId, count} groups (see
    // DEFAULT_SONGS/normalizeSequenceGroups in blocks/music.js - a resized
    // Sequence chip repeating a pattern several times in a row is one group
    // with count > 1, not one entry per repeat) - kept as groups all the way
    // through to the compiled ROM's  runtime sequence table too now (see
    // sequenceStartPage/sequenceRepeatCount below and generateMusicChecks'
    // repeat-count handling), rather than expanded back into one raw
    // entry per real repeat the way an earlier version of this function did:
    // storing one page byte plus one repeat-count byte per GROUP costs a
    // fixed 2 bytes regardless of how many times it repeats, instead of one
    // byte per actual repeat.
    const groups = (song.sequence || []).map((group) => ({
      patternId: group.patternId,
      // Capped at MAX_SEQ_REPEAT_COUNT (16), not 255 - see
      // musicSeqRepeatVarName's  comment on why the runtime repeat
      // counter is packed into a 4-bit nibble.
      count: Math.max(1, Math.min(MAX_SEQ_REPEAT_COUNT, Math.round(Number(group.count) || 1))),
    }));
    // Every DISTINCT pattern THIS song's sequence references, in the order
    // each is first seen - a Set (not sorted/deduped some other way) so
    // groups[0]'s  pattern always ends up first, which is what lets
    // channelStartPage below resolve without a separate lookup.
    const distinctPatternIds = [...new Set(groups.map(({patternId}) => `${patternId}`))];
    // patternStartPage[channel][patternId] = which page (an index into the
    // COMBINED channelPages array, spanning every included song) that
    // pattern's  data starts at - built up as each of THIS song's
    // distinct patterns is paged below, then used for channelStartPage/
    // sequenceStartPage afterwards.
    const patternStartPage = {};
    channels.forEach((channel) => {
      patternStartPage[channel] = {};
    });
    // The notes of the voice instruments of each pattern, by the watch index of the instrument: the key of the phrase of each (see speech.js), in the
    // order the watch fires. The channel they are on is kept too: the program counts the firings of an instrument, so they must all be on one channel.
    const patternVoice = {};
    const voiceChannels = {};

    distinctPatternIds.forEach((patternId) => {
      const pattern = (song.patterns || []).find(({id: pid}) => `${pid}` === patternId);
      if (!pattern) return;
      const perChannel = flattenPatternEvents(song, pattern, channels, soundEffects, config, notePlayedIndexById,
          channelHasEnvelopeGlobal);
      patternVoice[patternId] = {};
      Object.entries(perChannel).forEach(([channel, events]) => {
        events.filter((event) => event.speech !== null && event.speech !== undefined && Number(event.notePlayedIndex) > 0).forEach((event) => {
          const np = Number(event.instrumentNp);
          if (!patternVoice[patternId][np]) patternVoice[patternId][np] = [];
          patternVoice[patternId][np].push({key: event.speech, frames: event.speechFrames || 0});
          if (!voiceChannels[np]) voiceChannels[np] = new Set();
          voiceChannels[np].add(channel);
        });
      });
      Object.entries(perChannel).forEach(([channel, events]) => {
        const pages = eventsToPages(events, getInstrumentIndex, isChipChannel(channel));
        // A pattern whose bytes are the same as those of one already stored (a pattern repeated with another name, or a copy that was
        // never edited) is read from there: the pages of the two are the same run of tables, so they are stored once.
        const stored = channelPages[channel];
        const sameRun = (start) => pages.every((page, i) => stored[start + i] && stored[start + i].join() === page.join());
        let sharedStart = -1;
        for (let start = 0; start + pages.length <= stored.length && sharedStart === -1; start++) {
          if (sameRun(start)) sharedStart = start;
        }
        if (sharedStart !== -1) {
          patternStartPage[channel][patternId] = sharedStart;
        } else {
          patternStartPage[channel][patternId] = stored.length;
          channelPages[channel].push(...pages);
          pages.forEach(() => channelPageSongIds[channel].push(id));
        }
        if (musicChannelHasEnvelope(events)) channelHasEnvelope[channel] = true;
        if (musicChannelHasArpeggio(events)) channelHasArpeggio[channel] = true;
        if (events.some((event) => Number(event.notePlayedIndex) > 0 && !isRestEvent(event))) anyWatch = true;
        const channelChip = isChipChannel(channel);
        events.forEach((event) => {
          const mode = volumeModeOf(event, channelChip);
          if (mode === 1) channelHasPackedVolumes[channel] = true;
          if (!isRestEvent(event)) {
            if (isHitEvent(event)) channelHasFixedNotes[channel] = true;
            else channelHasTunedNotes[channel] = true;
            if (channelChip && Number(event.notePlayedIndex) === 0 && Number(event.instrumentNp) !== 0) channelHasNoWatchMarkers[channel] = true;
          }
          if (mode === 2) channelHasVolumeMarkers[channel] = true;
        });
        if (channelPages[channel].length > MAX_MUSIC_PAGES) {
          throw new Error(`Combined music data needs ${channelPages[channel].length} data tables on ` +
            `channel ${channel} (summed across every song used for playback), but only ${MAX_MUSIC_PAGES} ` +
            'are supported per channel currently - try shorter/simpler songs, or fewer of them.');
        }
      });
    });

    // This song's  start page in the COMBINED per-channel table - still
    // always groups[0]'s  pattern, same as the single-song version of
    // this same comment, just no longer always page 0 once an earlier
    // song's  pages already occupy the front of that table.
    const channelStartPage = {};
    channels.forEach((channel) => {
      channelStartPage[channel] = patternStartPage[channel][`${groups[0] && groups[0].patternId}`] ?? 0;
    });

    // One lookup per GROUP (not per distinct pattern, and - now - not per
    // real repeat either) - several positions referencing the same pattern
    // all resolve to that one pattern's (single) start page, which is
    // exactly how the same bytes end up read from more than one place in
    // the sequence without ever being stored more than once.
    const sequenceStartPage = {};
    channels.forEach((channel) => {
      sequenceStartPage[channel] = groups.map(({patternId}) => patternStartPage[channel][`${patternId}`] ?? 0);
    });
    // Parallel to sequenceStartPage above, same one-entry-per-group shape,
    // but ONE shared table (not per-channel) - how many total times that
    // group's  pattern plays before the sequence moves on (see
    // musicSeqRepeatVarName/generateMusicChecks), pre-packed into the SAME
    // nibble layout the runtime var itself uses (channel 0's
    // repeats-remaining count in the low nibble, channel 1's in the high
    // nibble - both the SAME number, since a group's  repeat count
    // doesn't actually vary by channel, just stored redundantly in both
    // nibbles so each channel's  masked read/write never has to know or
    // care whether the other channel is even in use).
    const sequenceRepeatPacked = groups.map(({count}) => {
      const repeatsLeft = count - 1;
      return repeatsLeft + repeatsLeft * 16;
    });

    // The notes of each voice instrument over the whole sequence (a group that repeats gives its notes again): what the program says, one at each
    // firing of the watch of the instrument. The program counts them, so a voice instrument has all its notes of a song on one channel.
    const voiceNotes = {};
    Object.entries(voiceChannels).forEach(([np, usedChannels]) => {
      if (usedChannels.size > 1) {
        throw new Error('A voice instrument has notes on both channels in one song: the program says its words in the order of its notes, so its notes have to stay on one channel.');
      }
      voiceNotes[np] = groups.flatMap(({patternId, count}) => Array.from({length: count}, () => (patternVoice[patternId] && patternVoice[patternId][np]) || []).flat());
    });

    return {
      songId: id,
      songIndex,
      voiceNotes,
      channelsUsed: musicChannelsUsedBySong(song),
      channelStartPage,
      sequenceStartPage,
      sequenceRepeatPacked,
      // Now the number of GROUPS (Sequence chips), not the number of real
      // repeats summed together - see generateMusicChecks'  multiSeq,
      // which needs the real repeat-inclusive total instead, computed
      // separately below as totalSteps.
      sequenceLength: groups.length,
      totalSteps: groups.reduce((sum, {count}) => sum + count, 0),
    };
  });

  // Prototype: one cumulative offset per song (songSeqOffset[i] = sum of
  // every earlier song's  sequenceLength) - where that song's  slice
  // starts within the combined tables below, once combinedSeqTables is on.
  // Computed regardless of songs.length (cheap either way), but only
  // actually consulted by generateMusicChecks/generateMusicDataTables when
  // combinedSeqTables is true.
  let cumulative = 0;
  const songSeqOffset = songs.map((song) => {
    const offset = cumulative;
    cumulative += song.sequenceLength;
    return offset;
  });
  // Only worth doing (and only valid at all) once there's more than one
  // song to actually combine, and only once the combined table fits in a
  // single "data" block's  MAX_DATA_TABLE_VALUES limit - a project with
  // either many songs or long sequences falls back to the original
  // per-song table + if-chain dispatch instead (see musicSeqTableName),
  // exactly as before this prototype existed.
  const combinedSeqTables = songs.length > 1 && cumulative <= MAX_DATA_TABLE_VALUES;

  return {
    songs,
    channels: [...channels],
    channelPages,
    channelPageSongIds,
    channelHasEnvelope,
    channelHasArpeggio,
    channelHasSoundEffectDuration,
    usesSongById,
    usesFilteredSongStopped,
    songSeqOffset,
    combinedSeqTables,
    notePlayedChannelsById,
    // The shared instrument lookup table (see its  build pass above) -
    // one AUDC|arpeggioSpeed<<4 byte per distinct instrument actually used,
    // in stable index order. Empty (never emitted as a real "data" table -
    // see generateMusicDataTables) for a project with no audible notes at
    // all.
    instrumentBytes: instrumentSets.map((set) => set.byte),
    // The lines of the instrument tables (see instrumentSetOf), in index order.
    instrumentSets,
    hasWatch: anyWatch,
    channelHasVolumeMarkers,
    channelHasPackedVolumes,
    channelHasFixedNotes,
    channelHasTunedNotes,
    channelHasNoWatchMarkers,
    // True as soon as ANY included song has ANY group repeating more than
    // once - gates whether musicSeqRepeatVarName/musicSeqRepeatTableName are
    // reserved/generated at all (see bbasic.js's dev-var reservation and
    // generateMusicChecks/generateMusicDataTables below), so a project with
    // no repeated patterns pays nothing extra for this feature.
    hasRepeats: songs.some((song) => song.sequenceRepeatPacked.some((packed) => packed > 0)),
  };
};

// Reserves every dev var the music player's  generated code (see
// generateMusicChecks below) actually needs, called once from bbasic.js's
// init() - moved here (rather than left inline there) so every "does
// this project actually need this specific var" decision lives right next
// to the rest of this file's  music-generation logic instead of split
// across two files. Pure bookkeeping, no runtime behavior change from
// however bbasic.js called this same sequence of reserveDevVar calls
// before this was extracted.
//
// reserveDevVar itself stays a callback (not imported) since it closes over
// bbasic.js's  nameDB_/routeDevVar state, which this file has no access
// to and shouldn't need to.
// @param {function(string): string} reserveDevVar
// @param {function(string, string=): {read: string, write: string}} reserveDevVarRW
//     Superchip's read/write pool (see generators/bbasic.js's comment on
//     it), used here for musicIndexVarName/musicPageVarName/
//     musicLastAudcVarName - each is a plain scalar read/write/if-compare/
//     table-index everywhere it's touched (checked by hand against every
//     call site in generateMusicChecks below), never a raw-asm "dec"/"inc"
//     target the way musicTimerVarName is (see its "dec timerVar" in
//     channelBody), which the RW pool's split read/write physical addresses
//     can't support - so musicTimerVarName stays on the ordinary reserveDevVar
//     pool.
// @param {?Object} music this.projectMusic - a no-op if null (nothing here
//     is worth reserving without real music to play).
// @param {{general: ?Object, pairs: Map, byChipId: Map, notePlayed: Map}} musicEventFlags
//     this.musicEventFlags (see resolveMusicEventFlags).
export const reserveMusicDevVars = (reserveDevVar, reserveDevVarRW, music, musicEventFlags) => {
  if (!music) return;
  const multiSong = music.songs.length > 1;
  // totalSteps (real repeats included), not sequenceLength (now a GROUP
  // count - see resolveProjectMusic above) - see buildMusicPlayResetBody's
  // comment for why those two differ.
  const multiSeq = multiSong || music.songs[0].totalSteps > 1;
  for (const channel of Object.keys(music.channelPages)) {
    reserveDevVarRW(musicIndexVarName(channel), 'this channel\'s position within its current pattern');
    reserveDevVar(musicTimerVarName(channel), undefined, 'this channel\'s frames-left-on-current-note countdown');
    // Only reserved once this channel actually plays some real (audible)
    // note - a channel with nothing but rests, or no data at all, never
    // hits an INSTRUMENT_CHANGE_SENTINEL marker and so never needs this
    // (see musicLastAudcVarName's  comment).
    if (music.instrumentBytes.length) {
      reserveDevVarRW(musicLastAudcVarName(channel), 'this channel\'s last-played AUDC value');
    }
    if (music.channelHasSoundEffectDuration[channel]) {
      reserveDevVarRW(musicStartVarName(channel), 'this channel\'s where the note being played starts in its data');
    }
    // Only reserved for a channel with at least one arpeggiating note (see
    // musicChannelHasArpeggio/channelHasArpeggio) - per-channel gated so a
    // project that never touches arpeggio anywhere pays nothing extra for
    // it, same reasoning as musicLastAudcVarName just above.
    if (music.channelHasArpeggio[channel]) {
      reserveDevVar(musicArpSpeedRangeVarName(channel), undefined, 'this channel\'s arpeggio: speed/range packed byte');
      reserveDevVar(musicArpCounterPhaseVarName(channel), undefined,
          'this channel\'s arpeggio: frame countdown/cycle position packed byte');
      reserveDevVar(musicArpBaseIntervalVarName(channel), undefined, 'this channel\'s arpeggio: base note\'s pitch');
    }
    // Only reserved when this channel's  combined data spans more than
    // one page - see generateMusicChecks'  comment on pageVar for why a
    // single-page channel has no use for it at all, even once the song has
    // more than one sequence position (confirmed directly as a real, pure
    // waste in an earlier version of this: a whole dev var reserved and
    // written to on every pattern transition for a value nothing
    // downstream ever read back).
    if (music.channelPages[channel].length > 1) {
      reserveDevVarRW(musicPageVarName(channel), 'this channel\'s current data-table page');
    }
    if (multiSeq) {
      reserveDevVar(musicSeqPosVarName(channel), undefined, 'this channel\'s position within the song sequence');
    }
  }
  // Only reserved once the project actually has a repeated pattern
  // somewhere (see musicSeqRepeatVarName's  comment) - a project with
  // none pays nothing extra for this feature. ONE shared var for every
  // channel (not per-channel - see musicSeqRepeatVarName's  comment on
  // the packed-nibble layout), reserved once here regardless of how many
  // channels the project actually uses.
  if (multiSeq && music.hasRepeats) {
    reserveDevVar(musicSeqRepeatVarName(), undefined, 'shared packed-nibble repeat counters, channels 0 and 1');
    if (dpcPlusPlan && (dpcPlusPlan.isChannel(2) || dpcPlusPlan.isChannel(3))) {
      reserveDevVar(musicSeqRepeatVarName(2), undefined, 'packed-nibble repeat counters, channels 2 and 3');
    }
  }
  // One shared byte for playing/loop/justStopped plus every channel's
  // active flag (see musicFlagsVarName's comment) - used to cost 3 vars
  // plus 1 more per channel by itself.
  reserveDevVar(musicFlagsVarName(), undefined, 'shared playing/loop/stopped/per-channel-active bit-flags byte');
  // Only reserved once this project's  music event watches (sequence-
  // chip-finished AND note-played-by-instrument, sharing one pool - see
  // resolveMusicEventFlags'  comment) actually need it beyond
  // musicFlagsVarName's  2 free spare bits - exactly as many overflow
  // bytes as musicEventFlags.overflowByteCount says, no more.
  for (let i = 0; i < musicEventFlags.overflowByteCount; i++) {
    reserveDevVar(musicEventFlagsOverflowVarName(i), undefined, 'extra music-event watch bits, once musicFlagsVarName\'s spares run out');
  }
  // Only needed once the project references more than one song (see
  // musicSongIndexVarName/musicSeqLenVarName's  comments) - a
  // single-song project keeps using a literal constant instead, same as it
  // always has, zero extra dev-var cost.
  if (multiSong) {
    reserveDevVar(musicSongIndexVarName(), undefined, 'which song is currently selected');
    reserveDevVar(musicSeqLenVarName(), undefined, 'that song\'s sequence length');
    // Only "Play song by ID" actually reads/writes this scratch var (see
    // its  comment) - no need to reserve it for a project that only
    // ever uses the fixed-dropdown "Play song" block.
    if (music.usesSongById) {
      reserveDevVar(musicPlayByIdArgVarName(), undefined, '"Play song by ID" runtime song-id argument');
    }
    // Only "When song [name]/[id] has stopped playing" actually reads/writes
    // this - the plain "When song has stopped playing" (no song specified)
    // never needs to know WHICH song stopped, so a project using only that
    // one pays nothing extra for it.
    if (music.usesFilteredSongStopped) {
      reserveDevVar(musicJustStoppedSongVarName(), undefined,
          'which song (its songIndex) most recently stopped, for the "by id"/"by number" song-stopped watches');
    }
  }
};

export default (Blockly) => {
  // A dev-var canonical name only becomes an actual bBasic letter once
  // nameDB_.getName() resolves it - reserved once in bbasic.js's
  // pre-scan (before letters are handed out), then re-resolved here at every
  // call site, exactly like collisionMoveOldXVar/canonicalDistanceVarName.
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  // musicIndexVarName/musicPageVarName/musicLastAudcVarName route through
  // Superchip's read/write pool instead (see reserveMusicDevVars' comment
  // on why) - already reserved by the time any generator here runs
  // (bbasic.js's init() always runs first), so this is a plain lookup, same
  // convention as generators/bbasic/function.js's resolveRW.
  const resolveRW = (canonicalName) => Blockly.BBasic.superchipRwPairs[canonicalName];

  // Shared by both music_play_song and music_play_song_by_id below.
  const generatePlaySong = (block) => {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return 'rem Song not found\n';
    const loop = block.getFieldValue('LOOP') === 'TRUE' ? 1 : 0;
    const flagsVar = resolveVar(musicFlagsVarName());

    let resetCode;
    if (music.songs.length === 1) {
      // Exactly the pre-multi-song behavior - one song, no per-song
      // dispatch needed at all regardless of which block type triggered it
      // (see music_play_song_by_id's  comment in blocks/music.js for why
      // its SONG_ID isn't even read in this case). The per-channel reset is
      // shared as its  subroutine (see MUSIC_PLAY_RESET_NAME) once the
      // project has more than one "Play song" call site targeting this one
      // song - a single call site is cheaper left plain inline, since a
      // real subroutine call costs its "gosub"/"return" overhead the
      // shared copy doesn't recoup until a second site exists to share it
      // with.
      resetCode = Blockly.BBasic.subroutines[MUSIC_PLAY_RESET_NAME] ?
        `gosub ${MUSIC_PLAY_RESET_NAME}${Blockly.BBasic.bankJumpSuffix(
            Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(MUSIC_PLAY_RESET_NAME))}\n` :
        buildMusicPlayResetBody(Blockly, music.songs[0], music);
    } else if (block.type === 'music_play_song_by_id') {
      // A genuine runtime value (see its  comment in blocks/music.js) -
      // written into a shared scratch var (bB subroutines don't take
      // parameters) before gosub-ing into the shared if-chain dispatch (see
      // MUSIC_PLAY_BY_ID_NAME) that resolves it to one specific song.
      const idExpr = Blockly.BBasic.valueToCode(block, 'SONG_ID', Blockly.BBasic.ORDER_NONE) || '0';
      const argVar = resolveVar(musicPlayByIdArgVarName());
      const suffix = Blockly.BBasic.bankJumpSuffix(
          Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(MUSIC_PLAY_BY_ID_NAME));
      resetCode = `${argVar} = ${idExpr}\ngosub ${MUSIC_PLAY_BY_ID_NAME}${suffix}\n`;
    } else {
      // Fixed dropdown - which song this SPECIFIC block starts is already
      // known at compile time, so it gosubs straight into that song's
      // reset subroutine, no runtime dispatch needed. Falls back to the
      // first included song if the dropdown's  value doesn't match any
      // (a stale/unsnapped value - see subroutine_call's  identical
      // fallback for a stale subroutine name).
      const chosenId = `${block.getFieldValue('SONG')}`;
      const song = music.songs.find((s) => `${s.songId}` === chosenId) || music.songs[0];
      const name = musicPlaySongResetName(song.songIndex);
      const suffix = Blockly.BBasic.bankJumpSuffix(
          Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name));
      resetCode = `gosub ${name}${suffix}\n`;
    }

    return resetCode +
      `${flagsVar}{${musicPlayingBit}} = 1\n` +
      `${flagsVar}{${musicLoopBit}} = ${loop}\n` +
      `${flagsVar}{${musicJustStoppedBit}} = 0\n` +
      // A (re)start always begins unpaused, even if the previous song was
      // paused when this ran - otherwise the freshly (re)started song would
      // silently never advance a single frame until some later, unrelated
      // Unpause block happened to run.
      `${flagsVar}{${musicPausedBit}} = 0\n`;
  };
  Blockly.BBasic['music_play_song'] = generatePlaySong;
  Blockly.BBasic['music_play_song_by_id'] = generatePlaySong;

  // Whether the NAMED song is the one currently playing - musicPlayingBit
  // alone (see musicFlagsVarName's  comment) can't answer that on its
  // once a project has more than one song, since it just means "some
  // song is playing," not which one. On a single-song project there's only
  // ever one possible song for it to mean, so this is just musicPlayingBit
  // directly - same "nothing to distinguish" shortcut music_song_stopped_by_
  // id's  generator already takes. Otherwise ANDed with a comparison
  // against musicSongIndexVarName - set by every song's  reset
  // subroutine (see its  comment) and left untouched by Stop/Pause, so it
  // still correctly names the last song actually played even after that
  // song stops (musicPlayingBit alone rules that stale case out). A stale
  // dropdown (song deleted, or never actually included - e.g. only ever
  // referenced here, never by an actual "Play song" block) has no runtime
  // songIndex to compare against at all, so it permanently reads false,
  // same leniency generateMusicEventCheck's "target is null" case uses
  // elsewhere in this file.
  Blockly.BBasic['music_song_playing'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const playingBit = `${resolveVar(musicFlagsVarName())}{${musicPlayingBit}}`;
    if (music.songs.length <= 1) return [playingBit, Blockly.BBasic.ORDER_ATOMIC];
    const songId = Number(block.getFieldValue('SONG'));
    const target = music.songs.find((s) => s.songId === songId);
    if (!target) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const songIndexVar = resolveVar(musicSongIndexVarName());
    return [`${playingBit} && ${songIndexVar} = ${target.songIndex}`, Blockly.BBasic.ORDER_LOGICAL_AND];
  };

  // Same check as music_song_playing above, but the target song is a
  // runtime VALUE (a variable or computed expression), not a fixed
  // dropdown - there's no single compile-time songIndex to compare
  // musicSongIndexVarName() against directly. Dispatches the other way
  // instead, same shape music_song_stopped_by_number already uses for the
  // identical problem: for whichever song musicSongIndexVarName() says is
  // CURRENTLY LOADED, compares THAT song's  real id against the runtime
  // value.
  //
  // Unlike music_song_stopped_by_number (an event-watch STATEMENT, free to
  // "goto" straight into an if-chain), this is a plain VALUE block - a
  // value block can't inject a preceding "goto" (same
  // constraint data_get_bit_by_id's  dynamic path hits, see its comment
  // in generators/bbasic/data.js), so the dispatch instead builds its
  // result into a var across several ordinary "if...then" lines, newline-
  // joined ahead of that var's  name as the real value - same preamble
  // convention background_get_pixel/data_get_bit_by_id already use, which
  // controls_if already knows how to hoist in front of an "if". Reuses
  // functionCallDiscardVarName's  scratch var (see musicSongPlayingByNumberUsed's
  // comment in generators/bbasic.js) rather than a dedicated one - same
  // "written and immediately consumed on the very next few lines, never
  // held across anything else" lifetime as every other use of that var.
  Blockly.BBasic['music_song_playing_by_number'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const playingBit = `${resolveVar(musicFlagsVarName())}{${musicPlayingBit}}`;
    if (music.songs.length <= 1) return [playingBit, Blockly.BBasic.ORDER_ATOMIC];
    if (!block.getInputTargetBlock('SONG_ID')) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const targetId = Blockly.BBasic.valueToCode(block, 'SONG_ID', Blockly.BBasic.ORDER_NONE) || '0';
    const songIndexVar = resolveVar(musicSongIndexVarName());
    // functionCallDiscardVarName now routes through reserveDevVarRW
    // (generators/bbasic.js's  init()) - every occurrence below except
    // the very last (the bare value this whole expression evaluates to)
    // is a plain "resultVar = ..." write; only that trailing reference is
    // a read.
    const resultPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const dispatch = music.songs.map((song) =>
      `if ${songIndexVar} = ${song.songIndex} then if ${targetId} = ${song.songId} then ${resultPair.write} = 1`);
    const lines = [
      `${resultPair.write} = 0`,
      ...dispatch,
      `if !${playingBit} then ${resultPair.write} = 0`,
      resultPair.read,
    ];
    return [lines.join('\n'), Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['music_stop_song'] = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return 'rem Song not found\n';
    const flagsVar = resolveVar(musicFlagsVarName());
    const muteLines = Object.keys(music.channelPages).map((channel) =>
      `AUDV${channel} = 0\n${flagsVar}{${musicChannelActiveBit(channel)}} = 0\n`).join('');
    // Also clears paused - same reasoning as generatePlaySong's  reset:
    // a later Play shouldn't inherit a stale paused state from before Stop.
    return muteLines + `${flagsVar}{${musicPlayingBit}} = 0\n${flagsVar}{${musicPausedBit}} = 0\n`;
  };

  // Just the one shared bit - see musicPausedBit's  comment and
  // generateMusicChecks below, which does the actual freezing/thawing by
  // checking it. No AUDV/index/timer touched here at all, unlike Stop -
  // that's the whole point, nothing about playback position is disturbed.
  Blockly.BBasic['music_pause_song'] = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return 'rem Song not found\n';
    return `${resolveVar(musicFlagsVarName())}{${musicPausedBit}} = 1\n`;
  };

  Blockly.BBasic['music_unpause_song'] = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return 'rem Song not found\n';
    return `${resolveVar(musicFlagsVarName())}{${musicPausedBit}} = 0\n`;
  };

  // Fires the connected blocks once, the moment generateMusicChecks below
  // sets the shared flags byte's justStopped bit (a non-looping song
  // reaching its  natural end) - same one-shot-flag shape as
  // event_run_once in generators/bbasic/event.js, except the flag is set
  // elsewhere rather than by this block itself, and gets cleared here so it
  // only fires once per stop rather than every frame after. Shared by both
  // music_song_stopped and music_song_stopped_by_id below - identical
  // behavior, the latter just also carries a SONG dropdown for readability
  // (see its  comment in blocks/music.js for why it's a separate block
  // rather than an added field on this one). Used directly for the plain
  // music_song_stopped block (fires for ANY song), and as the fallback for
  // music_song_stopped_by_id/_by_number on a single-song project (see their
  // comments below) - nothing to filter by there either way.
  const generateSongStopped = (block) => {
    const music = Blockly.BBasic.projectMusic;
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    if (!music) return '';
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_music_stopped_${blockNumber}_end`;
    const flagBit = `${resolveVar(musicFlagsVarName())}{${musicJustStoppedBit}}`;
    return '\n' +
    [
      `if !${flagBit} then goto ${labelEnd}`,
      `${flagBit} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };
  Blockly.BBasic['music_song_stopped'] = generateSongStopped;

  // Filters generateSongStopped's  shared flag by WHICH song actually
  // stopped (see musicJustStoppedSongVarName's  comment) - previously
  // shared generateSongStopped verbatim with every OTHER song-stopped
  // block, firing for whichever song happened to stop regardless of this
  // one's  SONG dropdown, a real reported bug. Target is known at
  // COMPILE time here (a fixed dropdown), so this only needs one constant
  // comparison, unlike music_song_stopped_by_number below.
  Blockly.BBasic['music_song_stopped_by_id'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    // Nothing to filter by on a single-song project - there's only ever
    // one possible song to have stopped, same reasoning as
    // musicJustStoppedSongVarName's  multiSong reservation gate.
    if (music.songs.length <= 1) return generateSongStopped(block);
    const songId = Number(block.getFieldValue('SONG'));
    const target = music.songs.find((s) => s.songId === songId);
    // A stale dropdown (song deleted, or never actually included by
    // resolveProjectMusic - e.g. nothing ever plays it) has no runtime
    // songIndex to match against at all - permanently no-ops, same leniency
    // generateMusicEventCheck's "target is null" case already uses
    // elsewhere in this file.
    if (!target) return '';
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_music_stopped_${blockNumber}_end`;
    const flagBit = `${resolveVar(musicFlagsVarName())}{${musicJustStoppedBit}}`;
    return '\n' +
    [
      `if !${flagBit} then goto ${labelEnd}`,
      // Deliberately does NOT clear flagBit when the song doesn't match -
      // some OTHER watch (a different song's  by-id/by-number block, or
      // a plain music_song_stopped) may still need to see it fire this same
      // frame. musicJustStoppedSongVarName always reflects the MOST RECENT
      // stop (updated alongside flagBit itself in generateMusicChecks) - a
      // genuinely stale, never-consumed flag can only go on to match a
      // LATER, real stop of THIS SAME target song; it can never spuriously
      // read as a match for the wrong reason.
      `if ${resolveVar(musicJustStoppedSongVarName())} <> ${target.songIndex} then goto ${labelEnd}`,
      `${flagBit} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };

  // Same filtering as music_song_stopped_by_id above, but the target song
  // is a runtime VALUE (a variable or computed expression), not a fixed
  // dropdown - there's no single compile-time songIndex to compare
  // musicJustStoppedSongVarName() against directly. Dispatches the other
  // way instead: for whichever song musicJustStoppedSongVarName() says
  // just stopped, compares THAT song's  real id against the runtime
  // value - the same "if songIndexVar = N then check id N" shape
  // buildMusicPlayByIdBody already uses for the opposite (id -> index)
  // direction, and the same "if A then if B then C" nested-single-line-if
  // batari Basic syntax already used elsewhere (e.g. real bB reference code:
  // "if joy0left then if player0x > 1 then gosub move_left").
  Blockly.BBasic['music_song_stopped_by_number'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    if (music.songs.length <= 1) return generateSongStopped(block);
    // Same ORDER_NONE as music_play_song_by_id's  identical SONG_ID
    // field, for the same reason - this substitutes into a plain "if X = Y"
    // comparison here rather than an assignment, but needs the same loose
    // precedence either way.
    const targetId = Blockly.BBasic.valueToCode(block, 'SONG_ID', Blockly.BBasic.ORDER_NONE) || '0';
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_music_stopped_${blockNumber}_end`;
    const labelMatch = `_music_stopped_${blockNumber}_match`;
    const flagBit = `${resolveVar(musicFlagsVarName())}{${musicJustStoppedBit}}`;
    const songVar = resolveVar(musicJustStoppedSongVarName());
    const dispatch = music.songs.map((song) =>
      `if ${songVar} = ${song.songIndex} then if ${targetId} = ${song.songId} then goto ${labelMatch}`);
    return '\n' +
    [
      `if !${flagBit} then goto ${labelEnd}`,
      ...dispatch,
      // No song matched (including the "flag stale/never consumed by
      // anyone" case) - same "leave flagBit alone" reasoning as
      // music_song_stopped_by_id above, so any other watch still gets its
      // chance to see it.
      `goto ${labelEnd}`,
      `@ ${labelMatch}`,
      `${flagBit} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };

  // Same one-shot check-and-clear shape as generateSongStopped above (the
  // flag itself is set elsewhere - see resolveMusicEventFlags'  comment
  // and generateMusicChecks' chipFinishedSetLines), just
  // reusable across both music_sequence_chip_finished (general.varName/bit)
  // and music_sequence_chip_finished_by_id (one pair's  varName/bit) -
  // target is null whenever this specific block instance's  flag was
  // never actually reserved (no matching block found by the pre-scan, a
  // stale song/chip id, or - for the general block - simply no music at
  // all), in which case this permanently no-ops rather than emitting a
  // check against a bit that doesn't exist.
  // Shared by every one-shot music event block (sequence-chip-finished AND
  // note-played-by-instrument alike, now that both draw from the same
  // pooled flag-bit assignment - see resolveMusicEventFlags) - the flag
  // itself is set elsewhere (chipFinishedSetLines/notePlayedSetLines in
  // generateMusicChecks), this just checks-and-clears it, label-prefixed
  // per call site (labelPrefix) purely so two different block TYPES'
  // generated labels can never collide with each other. target is null
  // whenever this specific watch was never actually resolved (no matching
  // block found by the pre-scan, a stale song/chip/instrument id, or -
  // for the general chip-finished block - simply no music at all), in
  // which case this permanently no-ops rather than checking a bit that
  // doesn't exist.
  const generateMusicEventCheck = (block, target, labelPrefix) => {
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    if (!target) return '';
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_${labelPrefix}_${blockNumber}_end`;
    const flagBit = `${resolveVar(target.varName)}{${target.bit}}`;
    return '\n' +
    [
      `if !${flagBit} then goto ${labelEnd}`,
      `${flagBit} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };
  Blockly.BBasic['music_sequence_chip_finished'] = function(block) {
    const flags = Blockly.BBasic.musicEventFlags;
    return generateMusicEventCheck(block, flags && flags.general, 'chipfin');
  };
  Blockly.BBasic['music_sequence_chip_finished_by_id'] = function(block) {
    const flags = Blockly.BBasic.musicEventFlags;
    const songId = Number(block.getFieldValue('SONG'));
    const chipId = Number(block.getFieldValue('CHIP_ID'));
    const pair = flags && flags.pairs.get(`${songId}:${chipId}`);
    return generateMusicEventCheck(block, pair, 'chipfin');
  };
  Blockly.BBasic['music_sequence_chip_finished_current_song'] = function(block) {
    const flags = Blockly.BBasic.musicEventFlags;
    const chipId = Number(block.getFieldValue('CHIP_ID'));
    const entry = flags && flags.byChipId.get(chipId);
    return generateMusicEventCheck(block, entry, 'chipfin');
  };
  // Whether seqPosVar exists for ANY channel at all - reserveMusicDevVars'
  // gate (see its "multiSeq" local there), duplicated here rather than
  // read back off it, since these two live "is playing" checks are the only
  // other place that needs to know before ever resolving a seqPosVar name -
  // referencing an unreserved dev var name would leak the raw canonical
  // string straight into the assembly (the exact "Unknown Mnemonic" failure
  // resolveMusicEventFlags'  comment on "!!music" already documents for
  // a different var).
  const musicSeqPosVarExists = (music) => music.songs.length > 1 || music.songs[0].totalSteps > 1;
  Blockly.BBasic['music_sequence_chip_playing_by_id'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const songId = Number(block.getFieldValue('SONG'));
    const chipId = Number(block.getFieldValue('CHIP_ID'));
    const rawSong = findSongById(songId);
    const seqIndex = chipIdToSeqIndex(rawSong, chipId);
    // music.songs[].songId is a string (see resolveProjectMusic's "id"
    // source, always string-converted) - coerced comparison, same
    // convention findSongById itself already uses, rather than a strict
    // === that would never match against Number(songId).
    const resolvedSong = seqIndex !== -1 && music.songs.find((s) => `${s.songId}` === `${songId}`);
    if (!resolvedSong) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const playingBit = `${resolveVar(musicFlagsVarName())}{${musicPlayingBit}}`;
    const songCheck = music.songs.length > 1 ?
      `${playingBit} && ${resolveVar(musicSongIndexVarName())} = ${resolvedSong.songIndex}` : playingBit;
    // A song with only one sequence position ever (totalSteps <= 1) has no
    // seqPosVar reserved for it at all (see reserveMusicDevVars) - its
    // single chip (already confirmed to exist above, or seqIndex would be
    // -1) is "playing" for the song's entire runtime, so the song-level
    // check alone is already the whole answer.
    if (!musicSeqPosVarExists(music)) return [songCheck, Blockly.BBasic.ORDER_LOGICAL_AND];
    const seqPosVar = resolveVar(musicSeqPosVarName(primaryChannelFor(resolvedSong)));
    return [`${songCheck} && ${seqPosVar} = ${seqIndex}`, Blockly.BBasic.ORDER_LOGICAL_AND];
  };
  Blockly.BBasic['music_sequence_chip_playing_current_song'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const chipId = Number(block.getFieldValue('CHIP_ID'));
    const occurrences = music.songs
        .map((resolvedSong) => ({resolvedSong, seqIndex: chipIdToSeqIndex(findSongById(resolvedSong.songId), chipId)}))
        .filter(({seqIndex}) => seqIndex !== -1);
    if (!occurrences.length) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const playingBit = `${resolveVar(musicFlagsVarName())}{${musicPlayingBit}}`;
    if (!musicSeqPosVarExists(music)) {
      // Only reachable with a single song whose only sequence position
      // is this chip (already confirmed above) - same reasoning as
      // music_sequence_chip_playing_by_id's  identical early-out.
      return [playingBit, Blockly.BBasic.ORDER_ATOMIC];
    }
    // Same "build into a scratch var across several plain ifs" shape
    // music_song_playing_by_number already uses - a value block can't
    // inject a preceding "goto" of its  to dispatch across several
    // songs the way an event-watch STATEMENT (music_sequence_chip_finished_
    // current_song) can.
    const songIndexVar = music.songs.length > 1 ? resolveVar(musicSongIndexVarName()) : null;
    const resultPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const dispatch = occurrences.map(({resolvedSong, seqIndex}) => {
      const seqPosVar = resolveVar(musicSeqPosVarName(primaryChannelFor(resolvedSong)));
      const songGuard = songIndexVar ? `if ${songIndexVar} = ${resolvedSong.songIndex} then ` : '';
      return `${songGuard}if ${seqPosVar} = ${seqIndex} then ${resultPair.write} = 1`;
    });
    const lines = [
      `${resultPair.write} = 0`,
      ...dispatch,
      `if !${playingBit} then ${resultPair.write} = 0`,
      resultPair.read,
    ];
    return [lines.join('\n'), Blockly.BBasic.ORDER_ATOMIC];
  };
  Blockly.BBasic['music_note_played'] = function(block) {
    const flags = Blockly.BBasic.musicEventFlags;
    const target = flags && flags.notePlayed.get(`${block.getFieldValue('INSTRUMENT')}`);
    return generateMusicEventCheck(block, target, 'noteplayed');
  };
  Blockly.BBasic['music_note_played_by_id'] = function(block) {
    const flags = Blockly.BBasic.musicEventFlags;
    const target = flags && flags.notePlayed.get(`${block.getFieldValue('INSTRUMENT_ID')}`);
    return generateMusicEventCheck(block, target, 'noteplayed');
  };

  // Data tables holding each used channel's AUDV/AUDC/AUDF/duration event
  // stream - spliced alongside generatedDataTables in bbasic.bb.hbs (a "data"
  // block is a read-only ROM table, not executable code, so it has to live in
  // the file's  never-fallen-into trailing section).
  // Labels each generated music data table with the same explanation this
  // file's  comments already give the JS side, for anyone reading the
  // Generated Code tab directly - purely a "rem" comment line ahead of each
  // "data" block, no effect on the compiled ROM.
  const songLabel = (songId) => {
    const song = findSongById(songId);
    return song && song.name ? song.name : `Song ${songId}`;
  };

  Blockly.BBasic.generateMusicDataTables = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    // Configuration.vue's "Show detailed comments" toggle (default off) -
    // same flag generators/bbasic.js's  dev-var "; description" comments
    // read, applied here to every data table's  explanatory "rem" line
    // too, not just variables.
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const showComments = config.showVariableComments ?? false;
    const tableComment = (text) => showComments ? ` rem ${text}\n` : '';
    const eventTables = Object.entries(music.channelPages).map(([channel, pages]) => pages.map((bytes, page) => {
      const rows = chunk(bytes, 16).map((row) => '  ' + row.join(', '));
      const pageNote = pages.length > 1 ? `, page ${page}` : '';
      // Every page belongs to exactly one song (see channelPageSongIds'
      // comment) - falls back to no song mention at all if that mapping is
      // somehow missing for this page, rather than a misleading guess.
      const songId = (music.channelPageSongIds && music.channelPageSongIds[channel] || [])[page];
      const songNote = songId != null ? ` for ${songLabel(songId)}` : '';
      return tableComment(`Channel ${channel}${songNote} note data${pageNote} (pitch with flags, duration per note - ` +
        `instrument changes are interleaved as their 2-byte markers, see the instrument tables below)`) +
        ` data ${musicDataTableName(channel, page)}\n${rows.join('\n')}\nend`;
    }).join('\n\n')).join('\n\n');
    // See musicInstrumentTableName's  comment: one line for each distinct set of what the notes of an instrument have in common (see
    // instrumentSetOf), in the index order of the sets. Empty (all the tables left out) for a project with no audible notes anywhere.
    const sets = music.instrumentSets || [];
    const anyArpeggio = Object.values(music.channelHasArpeggio || {}).some(Boolean);
    const instrumentTableOf = (name, comment, values) => tableComment(comment) +
      ` data ${name}\n${chunk(values, 16).map((row) => '  ' + row.join(', ')).join('\n')}\nend`;
    const instrumentTable = sets.length ? [
      instrumentTableOf(musicInstrumentTableName(), 'Instrument tables: AUDC|arpeggioSpeed<<4 of each instrument line - ' +
        'indexed by an INSTRUMENT_CHANGE_SENTINEL marker in the note data above', sets.map((set) => set.byte)),
      instrumentTableOf(musicInstrumentVolumeTableName(), 'Volume of each instrument line', sets.map((set) => set.volume)),
      ...(music.hasWatch ? [instrumentTableOf(musicInstrumentWatchTableName(),
          'The "note played" watch index of each instrument line, shifted up 4 bits', sets.map((set) => set.watch))] : []),
      ...(Object.values(music.channelHasFixedNotes || {}).some(Boolean) ? [instrumentTableOf(musicInstrumentPitchTableName(),
          'The pitch of the hits of each instrument line (255: the notes have their pitch stored)', sets.map((set) => set.fixed))] : []),
      ...(anyArpeggio ? [
        instrumentTableOf(musicInstrumentArpSpeedTableName(), 'Arpeggio speed (bits 0-3) and range (bits 4-6) of each instrument line',
            sets.map((set) => set.speedRange)),
        instrumentTableOf(musicInstrumentArpIntervalTableName(), 'Arpeggio interval of each instrument line, shifted up 5 bits',
            sets.map((set) => set.interval)),
      ] : []),
    ].join('\n\n') : '';
    // One small lookup table per channel - see generateMusicChecks'
    // loop-reset for the one place these are ever read. Single-song project:
    // only generated for a song with any real repetition at all (totalSteps,
    // not sequenceLength - see buildMusicPlayResetBody's  comment on why
    // those two differ now that a single GROUP can itself repeat more than
    // once), reproducing the exact table name/behavior a project with only
    // one song has always had. Multi-song project: EVERY included song gets
    // its  table (see musicSeqTableName/buildMusicPlaySongResetBody's
    // comments for why every song needs one once there's more than one to
    // dispatch between, even a trivial one-entry table for a song with only
    // one pattern).
    //
    // A parallel repeat-count table (musicSeqRepeatTableName) rides along
    // once per SONG (not once per channel - see its  comment on why the
    // packed byte it stores doesn't need to vary by channel), one row per
    // GROUP, whenever music.hasRepeats - a project with no repeated
    // patterns anywhere never generates this second table at all.
    let seqTables;
    if (music.songs.length === 1) {
      const song = music.songs[0];
      if (song.totalSteps > 1) {
        const pageTables = Object.keys(music.channelPages).map((channel) => {
          const rows = chunk(song.sequenceStartPage[channel], 16).map((row) => '  ' + row.join(', '));
          return tableComment(`Channel ${channel} sequence order (which note-data page plays at each step)`) +
            ` data ${musicSeqTableName(channel)}\n${rows.join('\n')}\nend`;
        }).join('\n\n');
        const repeatTable = music.hasRepeats ? (() => {
          const repeatRows = chunk(song.sequenceRepeatPacked, 16).map((row) => '  ' + row.join(', '));
          return '\n\n' + tableComment('Repeat count per sequence step (channel 0 low nibble, channel 1 high nibble)') +
            ` data ${musicSeqRepeatTableName()}\n${repeatRows.join('\n')}\nend`;
        })() : '';
        seqTables = pageTables + repeatTable;
      } else {
        seqTables = '';
      }
    } else if (music.combinedSeqTables) {
      // Prototype: one combined table per channel (every song's
      // sequenceStartPage[channel] concatenated in songIndex order) plus one
      // shared offset table, instead of a whole separate table per song -
      // see musicSongSeqOffsetTableName's  comment for why this replaces
      // generateMusicChecks' old O(songs) if-chain dispatch with a single
      // indexed read.
      const offsetRows = chunk(music.songSeqOffset, 16).map((row) => '  ' + row.join(', '));
      const offsetTable = tableComment('Each song\'s starting offset into the combined sequence tables below') +
        ` data ${musicSongSeqOffsetTableName()}\n${offsetRows.join('\n')}\nend`;
      const pageTables = Object.keys(music.channelPages).map((channel) => {
        const combined = music.songs.flatMap((song) => song.sequenceStartPage[channel]);
        const rows = chunk(combined, 16).map((row) => '  ' + row.join(', '));
        return tableComment(`Channel ${channel} sequence order for every song combined (see the offset table above ` +
          `for where each song's slice starts)`) + ` data ${musicCombinedSeqTableName(channel)}\n` +
          `${rows.join('\n')}\nend`;
      }).join('\n\n');
      const repeatTable = music.hasRepeats ? (() => {
        const combined = music.songs.flatMap((song) => song.sequenceRepeatPacked);
        const repeatRows = chunk(combined, 16).map((row) => '  ' + row.join(', '));
        return '\n\n' + tableComment(`Repeat count per sequence step for every song combined (channel 0 low nibble, ` +
          `channel 1 high nibble)`) + ` data ${musicCombinedSeqRepeatTableName()}\n${repeatRows.join('\n')}\nend`;
      })() : '';
      seqTables = offsetTable + '\n\n' + pageTables + repeatTable;
    } else {
      // A song with only one sequence position ever (totalSteps <= 1) gets
      // no table here at all - buildPageResetLines/the repeat-lookup
      // dispatch (both in generateMusicChecks) substitute a plain literal
      // for that one song instead of reading one back (see their
      // matching comments), same "why store a whole table for a single,
      // already-known byte" reasoning the single-song branch above already
      // applies via its  totalSteps > 1 check.
      seqTables = music.songs.filter((song) => song.totalSteps > 1).map((song) => {
        const label = songLabel(song.songId);
        const pageTables = Object.keys(music.channelPages).map((channel) => {
          const rows = chunk(song.sequenceStartPage[channel], 16).map((row) => '  ' + row.join(', '));
          return tableComment(`${label}: channel ${channel} sequence order (which note-data page plays at each step)`) +
            ` data ${musicSeqTableName(channel, song.songIndex)}\n${rows.join('\n')}\nend`;
        }).join('\n\n');
        const repeatTable = music.hasRepeats ? (() => {
          const repeatRows = chunk(song.sequenceRepeatPacked, 16).map((row) => '  ' + row.join(', '));
          return '\n\n' + tableComment(`${label}: repeat count per sequence step (channel 0 low nibble, channel 1 high ` +
            `nibble)`) + ` data ${musicSeqRepeatTableName(song.songIndex)}\n${repeatRows.join('\n')}\nend`;
        })() : '';
        return pageTables + repeatTable;
      }).join('\n\n');
    }
    // Combined attack+decay+sustain+release frame length per registered
    // envelope config (shared with one-shot Sound Effects - see
    // registerEnvelopeConfig in soundfx.js), indexed by an
    // ENVELOPE_CHANGE_SENTINEL marker's  runtime byte (see
    // buildEnvelopeMarkerSubroutine below). Generated HERE - as part of
    // musicEngine's  relocatable payload - rather than alongside
    // _envelope{n} (see buildEnvelopeDataTables in soundfx.js, itself now
    // folded into generateEnvelopeChecks' separate relocatable payload,
    // wrapRelocatableGraphics('soundfxEnvelopeChecks', ...) - the two units
    // can land in DIFFERENT banks from each other, so each has to carry its
    // copy of whatever data its  code reads): this table is read by
    // musicEngine's  code specifically, which can get relocated
    // independently, so it has to travel WITH that code instead (see
    // resumeRead's  comment just below on this exact class of bug - a
    // table and the code reading it must always share a bank, with no tag
    // needed when they do).
    const anyChannelHasEnvelope = Object.values(music.channelHasEnvelope || {}).some(Boolean);
    const envelopeAdLenTable = anyChannelHasEnvelope ? (() => {
      const configs = getEnvelopeConfigs();
      const rows = chunk(configs.map((config) => (envelopeFlatOn() ? envelopeStartPosition(config) : config.envelopeLength)), 16)
          .map((row) => '  ' + row.join(', '));
      return tableComment('Attack+decay+sustain+release frame length per envelope config, indexed by an ' +
        'ENVELOPE_CHANGE_SENTINEL marker\'s byte - see buildEnvelopeMarkerSubroutine') +
        ` data _envelopeAdLen\n${rows.join('\n')}\nend`;
    })() : '';
    return [eventTables, instrumentTable, seqTables, envelopeAdLenTable].filter(Boolean).join('\n\n');
  };

  // Spliced into commongamelogic (see bbasic.bb.hbs), the same per-frame slot
  // as generateEnvelopeChecks: decrements each used channel's timer, and on
  // reaching 0, reads the next 4-byte event. If the peeked AUDV byte is
  // LOOP_SENTINEL (end of the song's data), either loops back to index 0
  // (musicLoop set) or mutes the channel and marks the song stopped
  // (musicLoop clear - see music_song_stopped). Everything is gated behind
  // musicPlaying so a stopped song's channels stay silent and untouched
  // until the next music_play_song. Goto-based rather than "if X then A : B"
  // for the same reason as generateEnvelopeChecks - "if ... then" only
  // conditions the single statement right after "then".
  //
  // A channel with any enveloped note (see musicChannelHasEnvelope) reads
  // the ENVELOPE_BIT off the duration byte it just read (see eventsToBytes)
  // - there is no separate envelopeConfigIndex byte packed into the fixed
  // 3-byte record itself (see eventsToPages'  comment on why one was
  // tried there and reverted). Instead, each note's  config index (it
  // can change note-to-note, since it depends on this note's  peak
  // volume, not just its instrument - see eventsToPages) travels via a
  // dedicated ENVELOPE_CHANGE_SENTINEL marker, applied at fetch time by
  // buildEnvelopeMarkerSubroutine (see channelBody below) - the actual
  // per-frame Attack/Decay/Release application happens in
  // generateEnvelopeChecks (soundfx.js), shared with one-shot Sound
  // Effects rather than duplicated here.
  // A channel with any arpeggiating note (see musicChannelHasArpeggio) masks
  // its spare bits off the AUDC/AUDF/duration bytes it just read (see
  // eventsToBytes) at fetch time: the AUDC nibble becomes arpSpeedVar (0 =
  // no arpeggio), the duration bits 6-4 become arpRangeVar (an index into
  // ARPEGGIO_PHASE_SEQUENCES), and the AUDF spare bits (this note's
  // arpeggio interval) are used once to derive 6 pitch variants - base
  // (B), base+interval (A), and each of those one octave up (UB/UA, halved)
  // and one octave down (DB/DA, doubled) - stored so the per-frame apply
  // step below never has to recompute them. arpCounterPhaseVar (counter and
  // phase packed into one shared byte - see musicArpCounterPhaseVarName's
  // comment) resets on every fetch so a new note's arpeggio always
  // starts clean (in phase, full counter) rather than inheriting where the
  // previous note's cycle left off. Then, every frame (not just on a fetch)
  // that arpSpeedVar is nonzero, the counter ticks down and advances phase
  // once it reaches zero (refilling from arpSpeedVar, wrapping back to phase
  // 0 once past arpRangeVar's  sequence length), and AUDF is set to whichever
  // of the 6 precomputed variants that range/phase combination calls for -
  // same "compute once at fetch time, apply every frame" shape as fade.
  // Builds the bB lines for "read tables[pageVar][index] into temp1" -
  // dispatches to the right physical table based on which page is
  // currently active, since bB can't index a table by a computed/variable
  // table name. A single-page channel (the common case) skips the dispatch
  // chain entirely and reads directly, at zero extra cost. Never advances
  // indexVar itself - callers do that separately once they've decided
  // whether this read was a peek or a real consume.
  // A multi-page channel's  page-select dispatch chain (4 lines per page
  // beyond the first) used to be inlined FRESH at every single call site
  // below - and there were up to 9 of them per channel (durationRead,
  // audcRead [since removed - see eventsToPages'  comment], audfRead,
  // the loop-reset peek, 3x resumeRead via buildPageDispatchSubroutine's
  // 3 offsets, the main peek, and the final read) - confirmed as the
  // single largest contributor to
  // musicEngine's  compiled size on a real project (its per-channel
  // dispatch measured over 22KB of source, more than 4x its data tables'
  // size), and the direct cause of a real "Origin Reverse-indexed"
  // build failure once a project's musicEngine payload genuinely didn't fit
  // in its  reserved bank even with EVERY other relocatable unit already
  // evicted elsewhere. Factored into ONE physical copy per channel instead,
  // reached via gosub from every call site rather than re-expanded inline
  // each time - the exact same dispatch logic, just paid for once per
  // channel instead of up to 9 times. Only actually built (see
  // buildPageDispatchSubroutine below) when tables.length > 1 - a
  // single-page channel's  pagedReadLines call stays exactly as
  // lightweight (and inline) as it always was, since there's no dispatch to
  // share in the first place.
  const pageDispatchLabel = (channel) => `_musicpr${channel}_dispatch`;
  // Also leaves temp2 holding the NEXT byte after temp1's  index (table[
  // index+1]) - a cheap, bounded addition (2 lines per page, not a
  // duplicated chain) that lets a caller reading two always-consecutive
  // bytes (see audfAndDurationReadPlain below - AUDF immediately followed by
  // duration in every note record) skip a second full gosub/page-compare
  // chain walk entirely, just reading temp2 instead. Harmless for every
  // other caller, which already ignores temp2 - the extra read is discarded,
  // never a page/table boundary hazard (ROM continues sequentially past any
  // table's  last byte either way, so index+1 always resolves to SOME
  // real byte, just an unused one on a single-byte peek).
  // temp1 and temp2 are the bytes of a table at the index and the one after it: as asm that is 13 bytes where the bB statements are
  // about 22.
  const readPairAsm = (table, indexExpr) => [
    ' asm',
    `       ldx ${indexExpr}`,
    `       lda ${table},x`,
    '       sta temp1',
    '       inx',
    `       lda ${table},x`,
    '       sta temp2',
    'end',
  ];
  // table[index] into a target, as asm (the index can be a Superchip read variable).
  const tableLookupAsm = (table, indexVar, target) => [' asm', `       ldx ${indexVar}`, `       lda ${table},x`, `       sta ${target}`, 'end'];
  const buildPageDispatchSubroutine = (channel, tables, pageVar) => {
    if (tables.length <= 1) return null;
    const doneLabel = `_musicpr${channel}_done`;
    const lines = [pageDispatchLabel(channel)];
    tables.forEach((table, page) => {
      const isLast = page === tables.length - 1;
      if (!isLast) {
        const nextLabel = `_musicpr${channel}_p${page + 1}`;
        lines.push(` if ${pageVar} <> ${page} then goto ${nextLabel}`);
        lines.push(...readPairAsm(table, 'temp1'));
        lines.push(` goto ${doneLabel}`);
        lines.push(nextLabel);
      } else {
        lines.push(...readPairAsm(table, 'temp1'));
      }
    });
    lines.push(doneLabel);
    lines.push(' return');
    return lines.join('\n');
  };
  // indexExpr is read into temp1 first (skipped when it's already temp1
  // itself - resumeRead's  call already computes its offset read
  // straight into temp1, see its  comment) so the shared subroutine
  // always has exactly one calling convention (read temp1, page-select off
  // pageVar, leave the result in temp1) regardless of which named dev var
  // (or temp1 itself) a given call site's  index actually lives in.
  // Single-page channels mirror buildPageDispatchSubroutine's  temp2
  // convention here too (see its comment) - table[indexExpr+1], read into
  // temp2 alongside temp1, so audfAndDurationReadPlain doesn't need a
  // separate code path for single- vs multi-page channels.
  const pagedReadLines = (tables, pageVar, indexExpr, channel) => {
    if (tables.length === 1) {
      return readPairAsm(tables[0], indexExpr);
    }
    return [
      ...(indexExpr === 'temp1' ? [] : [` temp1 = ${indexExpr}`]),
      ` gosub ${pageDispatchLabel(channel)}`,
    ];
  };

  Blockly.BBasic.generateMusicChecks = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    const flagsVar = resolveVar(musicFlagsVarName());
    const playingBit = `${flagsVar}{${musicPlayingBit}}`;
    const loopBit = `${flagsVar}{${musicLoopBit}}`;
    const justStoppedBit = `${flagsVar}{${musicJustStoppedBit}}`;
    const allChannels = Object.keys(music.channelPages);
    // Resolved once upfront so each channel's  stop branch can check
    // every OTHER channel's active bit too (see the finishCheck below) -
    // the shared playing/justStopped bits only get cleared/set once every
    // channel has independently reached its  end, not just the first
    // one to.
    const activeBitByChannel = Object.fromEntries(
        allChannels.map((channel) => [channel, `${flagsVar}{${musicChannelActiveBit(channel)}}`]));
    // A single song's  sequence.length is the same for every channel
    // (it's a property of the whole song, not of any one channel's
    // data) - see musicSeqPosVarName's  comment for why this only matters
    // at all once there's more than one position to actually move between.
    // Once the project has more than one SONG, the exact same "more than one
    // position to track" problem also covers "more than one song's
    // position to track" - both reuse the identical seqPos/Seq-table
    // dispatch machinery below (see buildMusicPlaySongResetBody's
    // comment), so multiSong alone is enough to force it on, even for a
    // project where every individual song only has one pattern.
    const multiSong = music.songs.length > 1;
    const singleSong = multiSong ? null : music.songs[0];
    // totalSteps (real repeats included), not sequenceLength (now a GROUP
    // count - see resolveProjectMusic) - a single-group song that still
    // repeats its  one pattern several times needs position/repeat
    // tracking exactly as much as a song with several distinct groups does.
    const multiSeq = multiSong || singleSong.totalSteps > 1;
    // The wrap check below compares against a literal constant for a single
    // song (exactly as before - that number never changes at runtime), or
    // the shared musicSeqLenVarName dev var once more than one song can set
    // it to something different.
    const seqLenExpr = multiSong ? resolveVar(musicSeqLenVarName()) : `${singleSong.sequenceLength}`;
    const songIndexVar = multiSong ? resolveVar(musicSongIndexVarName()) : null;
    // Every watched instrument's "set my flag if temp1's  packed
    // nibble is my index" line (see resolveNotePlayedInstruments for the
    // index, resolveMusicEventFlags for the flag bit), scoped to just THIS
    // channel (see notePlayedChannelsById's  comment in
    // resolveProjectMusic) - an
    // instrument only ever assigned to tracks on channel 0 gets no
    // comparison at all generated into channel 1's  dispatch, since
    // channel 1 could never fetch a note packing that index anyway. Unlike
    // chipFinishedSetLines below, there's no song/sequence-position
    // dependency here, only channel - so this is a plain filter, not a
    // dispatch chain.
    //
    // Masks + compares against the nibble still in its original
    // position ((temp1 & $F0) = index*16) instead of dividing temp1 down
    // to a plain 0-14 value first (an earlier version of this did
    // "temp2 = temp1 / 16" then "if temp2 = index") - a masked compare
    // needs no division at all, avoiding pulling in the shared div_mul.asm
    // routine just for this (see seqRepeatVar's  identical "&"/"|"
    // nibble-masking above, which likewise never needs it, unlike an
    // actual "/16" division). index*16 is computed here at COMPILE time
    // (index is a fixed per-watch constant), so this is one plain masked
    // byte compare per watched instrument, no runtime multiply either.
    const notePlayedInstruments = Blockly.BBasic.notePlayedInstruments || new Map();
    const notePlayedFlags = (Blockly.BBasic.musicEventFlags && Blockly.BBasic.musicEventFlags.notePlayed) ||
      new Map();
    const notePlayedSetLinesForChannel = (channel, instrumentVar) => {
      const checks = [...notePlayedInstruments.entries()]
          .filter(([id]) => (music.notePlayedChannelsById.get(id) || new Set()).has(Number(channel)))
          .map(([id, index]) => {
            const target = notePlayedFlags.get(id);
            if (!target) return null;
            return ` if temp2 = ${index * 16} then ${resolveVar(target.varName)}{${target.bit}} = 1`;
          })
          .filter(Boolean);
      // temp2 = temp1 & $F0 masked ONCE here rather than as part of each
      // check's  comparison (a real, if modest, waste with 2+ watched
      // instruments sharing a channel - each extra check used to re-load
      // temp1 and re-AND $F0 from scratch just to immediately CMP it) - temp1
      // itself has to stay untouched either way (see this array's  call
      // site's comment: audfRead reuses it right after), and temp2 is free
      // here (whatever it held before is about to be overwritten by the very
      // next real table read regardless).
      return checks.length ? [...tableLookupAsm(musicInstrumentWatchTableName(), instrumentVar, 'temp2'), ...checks] : [];
    };
    const perChannelChecks = allChannels.map((channel) => {
      const pages = music.channelPages[channel];
      const tables = pages.map((_, page) => musicDataTableName(channel, page));
      const multiPage = tables.length > 1;
      // Only reserved/used at all when there's actually more than one page
      // to dispatch across - a channel whose distinct patterns all
      // combine into a single page has nothing for pageVar to ever
      // meaningfully hold (pagedReadLines skips the whole page-dispatch
      // chain whenever tables.length is 1, so its value is never read back
      // either way) or DISPATCH on, even once the song has more than one
      // sequence position - confirmed directly as a real, pure waste in an
      // earlier version of this: that case still reserved a whole dev var
      // AND wrote to it on every pattern transition, for a value nothing
      // downstream ever consulted. Dev vars are a hard-capped, only
      // 25-of-them, project-wide resource, so this alone is worth a whole
      // var for any single-page-per-channel song with more than one
      // sequence position (a common case).
      // pageVar/indexVar/lastAudcVar hold the READ-side symbol (used
      // everywhere below except the handful of assignment-target sites,
      // which use the matching ...Write variable instead) - routed through
      // Superchip's read/write pool (see reserveMusicDevVars' comment on
      // why these three specifically are safe for it).
      const pagePair = multiPage ? resolveRW(musicPageVarName(channel)) : null;
      const pageVar = pagePair ? pagePair.read : null;
      const pageVarWrite = pagePair ? pagePair.write : null;
      const seqPosVar = multiSeq ? resolveVar(musicSeqPosVarName(channel)) : null;
      // Emitted right before seqPosVar's  advance below (the exact point
      // where seqPosVar still holds the position that just exhausted its
      // repeats) - see resolveMusicEventFlags'  comment for the full
      // bit-allocation scheme this reads from. The general ("any chip")
      // flag is set from every channel unconditionally; each specific pair
      // only from its  resolved primary channel, gated on songIndexVar
      // too once the project has more than one song (two different songs'
      // sequences can share the same numeric position, so seqPosVar
      // alone wouldn't disambiguate which one just finished) - the same
      // "if songIndexVar <> X then goto skip" dispatch style already used
      // elsewhere in this function, rather than an unverified-in-this-
      // codebase "&&" combined condition.
      const chipFinishedSetLines = multiSeq ? (() => {
        const flags = Blockly.BBasic.musicEventFlags ||
          {general: null, pairs: new Map(), byChipId: new Map(), notePlayed: new Map()};
        const lines = flags.general ?
          [` ${resolveVar(flags.general.varName)}{${flags.general.bit}} = 1`] : [];
        // Every (varName, bit, songIndex, seqIndex) occurrence THIS channel
        // needs to check - from both pairs (one specific song+chip watch)
        // and byChipId (one chip id watched across every song that has a
        // matching chip) - combined into one flat list so they can be
        // grouped by song below, rather than handled as two separate loops
        // the way this used to work.
        const occurrences = [
          ...[...flags.pairs.values()]
              .filter((pair) => pair.primaryChannel === channel)
              .map((pair) => ({varName: pair.varName, bit: pair.bit,
                songIndex: pair.songIndex, seqIndex: pair.seqIndex})),
          ...[...flags.byChipId.values()].flatMap((entry) =>
            entry.occurrences
                .filter((occurrence) => occurrence.primaryChannel === channel)
                .map((occurrence) => ({varName: entry.varName, bit: entry.bit,
                  songIndex: occurrence.songIndex, seqIndex: occurrence.seqIndex}))),
        ];
        const setLine = ({varName, bit, seqIndex}) =>
          ` if ${seqPosVar} = ${seqIndex} then ${resolveVar(varName)}{${bit}} = 1`;
        if (!multiSong) {
          occurrences.forEach((occurrence) => lines.push(setLine(occurrence)));
          return lines;
        }
        // Grouped by songIndex - every occurrence targeting the SAME song
        // now shares ONE "if songIndexVar <> X then goto skip" guard,
        // instead of each occurrence re-checking songIndexVar entirely on
        // its (the original version of this) - a project with several
        // chip-finished watches on the same song used to pay for that same
        // songIndexVar check once per watch; grouping first means it only
        // pays for it once per DISTINCT song referenced. seqPosVar alone
        // still disambiguates within a song's  guard, same as before -
        // two different songs'  sequences can share the same numeric
        // position, which is exactly what the guard itself protects against.
        const bySong = new Map();
        occurrences.forEach((occurrence) => {
          if (!bySong.has(occurrence.songIndex)) bySong.set(occurrence.songIndex, []);
          bySong.get(occurrence.songIndex).push(occurrence);
        });
        [...bySong.entries()].forEach(([songIndex, songOccurrences]) => {
          const skipLabel = `_chipfin${channel}_song${songIndex}_skip`;
          lines.push(` if ${songIndexVar} <> ${songIndex} then goto ${skipLabel}`);
          songOccurrences.forEach((occurrence) => lines.push(setLine(occurrence)));
          lines.push(skipLabel);
        });
        return lines;
      })() : [];
      // Only reserved/used at all once the project actually has some
      // repeated pattern somewhere (see musicSeqRepeatVarName) - a project
      // with none generates none of the extra repeat-check code below,
      // identical output to before repeat groups existed. ONE shared var
      // for every channel - channel 0's  count lives in the low nibble,
      // channel 1's in the high nibble (see musicSeqRepeatVarName's
      // comment) - seqRepeatHigh picks which nibble THIS channel's
      // reads/writes below mask against.
      const seqRepeatVar = multiSeq && music.hasRepeats ? resolveVar(musicSeqRepeatVarName(channel)) : null;
      const seqRepeatHigh = channel === '1' || channel === '3';
      // Only channel 1's  high-nibble read (seqRepeatVar / 16) actually
      // needs division - channel 0's low-nibble read is a plain & mask.
      if (seqRepeatVar && seqRepeatHigh) Blockly.BBasic.usesDivMul = true;
      // Resets pageVar back to THIS sequence position's  start page -
      // used by both the advance branch below (a fresh position always
      // needs its  start page looked up) and the repeat-restart branch
      // (same position replayed from its  start again, see its
      // comment). seqPosVar hasn't moved in either case, so both read the
      // identical table row - but both branches can appear in the SAME
      // channel's output at once (a project can have both multi-page
      // patterns and repeats), so each call site needs its  labels
      // (tag distinguishes them) rather than sharing one fixed label set,
      // which would emit a duplicate DASM label whenever both are present.
      // A no-op array whenever pageVar doesn't even exist (every pattern on
      // this channel fits in a single page).
      // Prototype: music.combinedSeqTables replaces the whole per-song
      // if-chain below with a single indexed read into
      // musicCombinedSeqTableName's  table - see its  comment. temp1
      // is safe to reuse here (immediately consumed, same convention as
      // pagedReadLines/the repeat-count masking below).
      const buildPageResetLines = (tag) => !pageVar ? [] : music.combinedSeqTables ? [
        ` temp1 = ${musicSongSeqOffsetTableName()}[${songIndexVar}]`,
        ` temp1 = temp1 + ${seqPosVar}`,
        ` ${pageVarWrite} = ${musicCombinedSeqTableName(channel)}[temp1]`,
      ] : multiSong ? [
        ...music.songs.map((song, i) => {
          const isLast = i === music.songs.length - 1;
          const nextLabel = `_music${channel}_seqpage${tag}_song${song.songIndex}_next`;
          // A song with only one sequence position ever (totalSteps <= 1,
          // no groups beyond the first, no repeats - see resolveProjectMusic)
          // has a fixed, compile-time-known page for that position: the
          // same channelStartPage every one of its  sequenceStartPage
          // entries already resolves to (there's only ever the one entry).
          // No need for a whole dedicated data table (see
          // generateMusicDataTables'  matching skip) just to hold that
          // single already-known byte - a plain literal assignment costs
          // fewer bytes AND no indexed table read at runtime.
          const lookup = song.totalSteps > 1 ?
            ` ${pageVarWrite} = ${musicSeqTableName(channel, song.songIndex)}[${seqPosVar}]` :
            ` ${pageVarWrite} = ${song.channelStartPage[channel]}`;
          return isLast ? lookup : [
            ` if ${songIndexVar} <> ${song.songIndex} then goto ${nextLabel}`,
            lookup,
            ` goto _music${channel}_seqpage${tag}_done`,
            nextLabel,
          ].join('\n');
        }),
        `_music${channel}_seqpage${tag}_done`,
      ] : [` ${pageVarWrite} = ${musicSeqTableName(channel)}[${seqPosVar}]`];
      const indexPair = resolveRW(musicIndexVarName(channel));
      const indexVar = indexPair.read;
      const indexVarWrite = indexPair.write;
      // The index moves on by 1 or 2: INC is 2 bytes and 5 cycles where the batari Basic addition is 7 bytes (not possible where the
      // read and write names differ, under Superchip RAM).
      const advanceIndex = (count) => (indexVar === indexVarWrite ?
        [' asm', ...Array(count).fill(`       inc ${indexVar}`), 'end'].join('\n') : `${indexVarWrite} = ${indexVar} + ${count}`);
      const timerVar = resolveVar(musicTimerVarName(channel));
      const activeBit = activeBitByChannel[channel];
      // Only meaningful once the project actually has some instrument to
      // track at all - see musicLastAudcVarName/reserveMusicDevVars'
      // matching gate.
      const lastAudcPair = music.instrumentBytes.length ? resolveRW(musicLastAudcVarName(channel)) : null;
      const lastAudcVar = lastAudcPair ? lastAudcPair.read : null;
      const lastAudcVarWrite = lastAudcPair ? lastAudcPair.write : null;
      // The index of the instrument line the notes use (what the last INSTRUMENT_CHANGE_SENTINEL marker said).
      const instrumentVar = lastAudcVar;
      const chip = isChipChannel(channel);
      const notePlayedSetLines = instrumentVar && music.hasWatch ? notePlayedSetLinesForChannel(channel, instrumentVar) : [];
      // The notes of a channel: those with their pitch stored, and the hits (see SHORT_FORM_FLAG).
      const hasTuned = !!(instrumentVar && music.channelHasTunedNotes && music.channelHasTunedNotes[channel]);
      const hasFixed = !!(instrumentVar && music.channelHasFixedNotes && music.channelHasFixedNotes[channel]);
      // A watched instrument's note of the chip is watched, unless a marker before it says it is not (temp5 is 0 for it, see the fetch).
      const hasNoWatch = chip && !!(instrumentVar && music.channelHasNoWatchMarkers && music.channelHasNoWatchMarkers[channel]);
      // Whether a note of this channel can have a volume other than its instrument's: its marker comes right before it.
      const volumeMarkers = !!(instrumentVar && music.channelHasVolumeMarkers && music.channelHasVolumeMarkers[channel]);
      const packedVolumes = !!(instrumentVar && music.channelHasPackedVolumes && music.channelHasPackedVolumes[channel]);
      // Any note with its volume said by itself: the volume goes through temp4 (the instrument's, or the one of the note).
      const volumeOverrides = volumeMarkers || packedVolumes;
      // The volume in the high nibble of temp2 into temp4 (and the low nibble of it left in temp2, for a duration byte).
      const unpackVolumeAsm = (keepLow) => [' asm', '       lda temp2', '       lsr', '       lsr', '       lsr', '       lsr', '       sta temp4',
        ...(keepLow ? ['       lda temp2', '       and #15', '       sta temp2'] : []), 'end'];

      // Only reserved/used for a channel with at least one arpeggiating note
      // (see musicChannelHasArpeggio) - all of these describe the CURRENTLY
      // PLAYING note (reset/recomputed at note-fetch time below), not the
      // song as a whole. arpSpeedRangeVar packs speed (0-15, low nibble) and
      // range (0-5, bits 4-6) into one shared byte, same layout the duration
      // byte itself uses for these two fields (see eventsToPages) - saves a
      // dev var per arpeggio channel (a hard-capped, project-wide, only
      // 25-of-them resource). Speed comes from the shared instrument table
      // (see buildInstrumentMarkerSubroutine below) rather than a per-note
      // AUDC byte now (see musicLastAudcVarName's  comment on why AUDC
      // moved there), so it's only ever refreshed on an actual instrument
      // change, not every note - range still comes from the duration byte's
      // bits 4-6 on every fetch (see durationRead below), same as
      // before. arpBaseIntervalVar is base (0-31) | (interval << 5) - the
      // exact same layout the AUDF data byte itself uses, so it's stored
      // as-is straight from the fetched byte, no packing math needed.
      const hasArpeggio = music.channelHasArpeggio[channel];
      const hasEnvelope = music.channelHasEnvelope[channel];
      const arpSpeedRangeVar = hasArpeggio ? resolveVar(musicArpSpeedRangeVarName(channel)) : null;
      const arpCounterPhaseVar = hasArpeggio ? resolveVar(musicArpCounterPhaseVarName(channel)) : null;
      const arpBaseIntervalVar = hasArpeggio ? resolveVar(musicArpBaseIntervalVarName(channel)) : null;

      // Lets a sound effect sharing this channel (see soundfx.js's
      // soundfx_play/channnel0duration+channnel1duration) keep exclusive
      // hardware control of AUDC/AUDF/AUDV for its  full duration -
      // wraps a single register write so it's skipped whenever durationVar
      // is nonzero (a sound effect currently owns this channel), covering
      // both a note fetch happening mid-effect (buildInstrumentMarkerSubroutine's
      // AUDC write/audfRead/the fetch-time AUDV write below) AND this
      // channel simply falling silent at its  song/pattern end while an
      // effect is still playing (the "AUDV = 0" writes below) - either
      // would otherwise audibly cut the effect off early. Declared this
      // early (before audfRead, which is one of its first callers) rather
      // than down by the resume-check logic it's conceptually paired with,
      // purely because of JS's  temporal dead zone - a genuine ordering
      // bug in an earlier version of this had a caller reach it before
      // its  declaration ran. See generateSoundDurationChecks... rather,
      // see resumeCheck further below for the other half of this same
      // interleaving feature: once durationVar's effect actually ends,
      // that's what hands audio back to music (or correctly mutes it, via
      // its "!activeBit" branch, if this channel already fell silent
      // while suppressed) - so gating these writes here never needs its
      // separate mute-on-suppressed-silence handling.
      // channnel0duration/channnel1duration are only conditionally reserved
      // now (see this.channelDurationUsed's  pre-scan in
      // generators/bbasic.js's init(), which includes "music exists at
      // all" as one of its  trigger conditions - so this is always
      // safely resolvable whenever this function itself runs at all).
      const durationVar = resolveVar(`channnel${channel}duration`);
      // Only actually wraps writes in a suppression check when THIS channel
      // has some "Play sound" block that could interleave with it (see
      // channelHasSoundEffectDuration's  comment in resolveProjectMusic)
      // - durationVar would otherwise permanently read 0 for this channel
      // (nothing on it ever writes to it), making the check itself a
      // guaranteed-always-false no-op paid on every wrapped write for
      // nothing. The dev var itself still exists either way (reserved
      // whenever music exists at all, regardless of per-channel use), so
      // this only skips the wasted runtime branch, not anything that would
      // leave durationVar unresolved.
      const hasSoundEffectDuration = music.channelHasSoundEffectDuration[channel];
      // The note's volume (in temp1, which it leaves as it is) written to the channel: held to the loudest volume a "Set max sound
      // volume" block allows when the project has one.
      const volumeWrite = (tag) => !Blockly.BBasic.soundMaxVolumeUsed ? ` AUDV${channel} = temp1` : [
        ' asm', '       lda temp1',
        ...volumeLimitAsm(Blockly.BBasic.nameDB_.getName('soundVolumeCut', Blockly.Names.DEVELOPER_VARIABLE_TYPE),
            `_musicvol${channel}_${tag}`),
        `       stx AUDV${channel}`, 'end',
      ].join('\n');
      const suppressibleWrite = (tag, line) => !hasSoundEffectDuration ? [line] : [
        ` if ${durationVar} <> 0 then goto _musicsup${channel}_${tag}_skip`,
        line,
        `_musicsup${channel}_${tag}_skip`,
      ];

      // Envelope (the old single-stage Fade's full ADSR successor) is live
      // and user-facing on both the SoundFX tab AND Music-tab instruments
      // now. Unlike the old single-stage Fade attempt at this (removed
      // rather than left dead-but-reachable, since it grew per-channel
      // dispatch code enough to overflow bank 1's  hard ceiling on a
      // large project), this reuses the EXISTING SFX envelope dispatch
      // (generateEnvelopeChecks in soundfx.js) almost entirely as-is - the
      // Attack/Decay countdown is already channel-neutral there, and
      // Release only needed one small per-channel addition (a "pick
      // whichever remaining-frames source is authoritative right now"
      // read, gated per-channel so an SFX-only project pays nothing extra -
      // see generateEnvelopeChecks'  comment). The real per-channel cost
      // paid here, in the relocatable (non-bank-1) engine, is
      // buildEnvelopeMarkerSubroutine below - a fixed-size subroutine per
      // envelope-using channel, not one that grows with however many
      // configs or notes exist, same shape as buildInstrumentMarkerSubroutine
      // right above it. Per-channel gated the same way arpeggio already is,
      // so a project that never uses envelope on Music instruments pays
      // nothing extra for this at all.
      // AUDC is no longer part of the regular per-note record at all (see
      // eventsToPages'  comment) - it's applied here instead, whenever an
      // INSTRUMENT_CHANGE_SENTINEL marker (see that same comment) is
      // encountered. This is a genuine SUBROUTINE (gosub/return), not
      // inlined at each of the 3 places that peek a fresh byte (the initial
      // peek, the page-break re-peek, and the loop/sequence-advance
      // re-peek - see pageBreakCheck and the multiSeq/single-loop branches
      // below) - each of those just adds one "gosub" call right after its
      // existing peek, with NO other change needed, since this
      // subroutine's  contract is simple: given temp1 already holding a
      // freshly-peeked byte, silently consume and apply as many
      // back-to-back instrument-change markers as are actually there (only
      // ever one in practice, but looping costs nothing extra to also
      // handle the case correctly), and return with temp1 holding
      // whatever real, non-marker byte follows (a note's  AUDV, or
      // PAGE_BREAK_SENTINEL, or LOOP_SENTINEL) - exactly what every caller
      // already expects right after its  peek.
      const instrumentMarkerLabel = `_music${channel}_skipinstr`;
      const skipInstrumentMarkers = lastAudcVar ? [` gosub ${instrumentMarkerLabel}`] : [];
      const buildInstrumentMarkerSubroutine = () => !lastAudcVar ? null : [
        instrumentMarkerLabel,
        ` if temp1 <> ${INSTRUMENT_CHANGE_SENTINEL} then goto ${instrumentMarkerLabel}_done`,
        ` ${advanceIndex(1)}`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${advanceIndex(1)}`,
        // The marker holds the index of the instrument line: what the notes after it have in common (the sound type, the volume, the
        // watch, the arpeggio) is read by that index when they are played (see the note lines below). The sound type goes to AUDC
        // here, once for all of them, and the speed and range of the arpeggio to its byte.
        ` ${lastAudcVarWrite} = temp1`,
        ...(hasArpeggio ? [` ${arpSpeedRangeVar} = ${musicInstrumentArpSpeedTableName()}[temp1]`] : []),
        ` temp1 = ${musicInstrumentTableName()}[temp1]`,
        ...suppressibleWrite('audc', ` AUDC${channel} = temp1`),
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` goto ${instrumentMarkerLabel}`,
        `${instrumentMarkerLabel}_done`,
        ' return',
      ].join('\n');

      // Applies an ENVELOPE_CHANGE_SENTINEL marker (see eventsToPages'
      // comment) - same subroutine shape as buildInstrumentMarkerSubroutine
      // just above (peek-compare-consume-loop-return), gosub'd from the
      // same 3 byte-repeek sites via skipEnvelopeMarkers below. Unlike an
      // instrument change, this marker's  selector can change even when
      // the CURRENT instrument doesn't (it also depends on this note's
      // peak volume - see eventsToPages), so it's checked at every note
      // fetch rather than only on an actual instrument change. Shares its
      // channel-packed nibble (envelopeConfig) and per-channel
      // attack+decay countdown (envelopeStage{channel}) with the Sound
      // Effects side (see soundfx_play/generateEnvelopeChecks in
      // soundfx.js) - a channel only ever plays an SFX or a music note at a
      // time (see suppressibleWrite above), so there's no conflict reusing
      // them. envelopeStage{channel} can't just be set to a literal
      // attack+decay length the way soundfx_play does (it already has
      // attack/decay in scope at compile time) - this only knows the
      // marker's  runtime INDEX, so it looks its attack+decay length
      // back up from the shared _envelopeAdLen table instead - generated as
      // part of THIS engine's  relocatable payload (see
      // generateMusicDataTables above), not alongside the bank-1-fixed
      // _envelopeAd{n}/_envelopeRel{n} tables in soundfx.js, specifically so
      // it always travels to whatever bank musicEngine itself gets
      // relocated to (see resumeRead's  comment above on why a
      // musicEngine-read table can never be bank-1-fixed).
      // envelopeConfig itself is NOT a developer-var-pool name (unlike
      // envelopeStage{channel} below) - it's a real named bB variable,
      // dimmed directly onto var47 (see generateEnvelopeDims in
      // soundfx.js), so it's referenced by its  literal name here, the
      // same way soundfx_play's  generator already does, rather than
      // through resolveVar/nameDB_ (which is only for the reserved-letter
      // pool).
      // The number of the shape the channel plays is a separate variable (255 for no envelope), like the countdown.
      const flatEnvelopes = envelopeFlatOn();
      const envelopeConfigVar = hasEnvelope && !flatEnvelopes ? resolveVar(`envelopeConfig${channel}`) : null;
      const envelopeStageVar = hasEnvelope ? resolveVar(`envelopeStage${channel}`) : null;
      const envelopeMarkerLabel = `_music${channel}_skipenv`;
      const skipEnvelopeMarkers = hasEnvelope ? [` gosub ${envelopeMarkerLabel}`] : [];
      const buildEnvelopeMarkerSubroutine = () => !hasEnvelope ? null : [
        envelopeMarkerLabel,
        ` if temp1 <> ${ENVELOPE_CHANGE_SENTINEL} then goto ${envelopeMarkerLabel}_done`,
        ` ${advanceIndex(1)}`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${advanceIndex(1)}`,
        ` if temp1 <> ${NO_ENVELOPE_SENTINEL} then goto ${envelopeMarkerLabel}_on`,
        ...(flatEnvelopes ? [] : [` ${envelopeConfigVar} = ${NO_ENVELOPE_SENTINEL}`]),
        ` ${envelopeStageVar} = 0`,
        ` goto ${envelopeMarkerLabel}_applied`,
        `${envelopeMarkerLabel}_on`,
        ` ${envelopeStageVar} = _envelopeAdLen[temp1]`,
        ...(flatEnvelopes ? [] : [` ${envelopeConfigVar} = temp1`]),
        `${envelopeMarkerLabel}_applied`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` goto ${envelopeMarkerLabel}`,
        `${envelopeMarkerLabel}_done`,
        ' return',
      ].join('\n');

      // AUDF hardware only reads the low 5 bits (0-31) - every derived value
      // in arpApply below is masked (& 31) or built from an already-masked
      // one, so a base near the top/bottom of that range wraps around
      // instead of producing an out-of-range value. AUDF is a frequency
      // DIVISOR, so alt is base MINUS the interval, not plus - matching the
      // identical convention in utils/music-playback.js's
      // arpeggioPitchVariants, so the ROM's arpeggio pitch direction matches
      // the Music tab's  preview.
      // The pitch of the note: in temp3 on the chip, in temp5 on the TIA (where temp3 has the first byte of the note, with its flags).
      const pitchVar = chip ? 'temp3' : 'temp5';
      // A rest: volume 0 and pitch 0 (a rest of the chip keeps the pitch it has).
      const restLines = [
        ...suppressibleWrite('audvrest', ` AUDV${channel} = 0`),
        ...suppressibleWrite('audfrest', ` AUDF${channel} = ${chip ? 'temp3' : '0'}`),
      ];
      // A note of an arpeggio instrument: the pitch with the interval (the same layout as the pitch byte of the arpeggio, so that
      // the check of whether this is the note it already plays can compare them), then a note that begins a new cycle (not one that
      // goes on after being cut by the duration limit) writes its pitch and starts the phase and the counter again.
      const arpeggioPitchLines = hasArpeggio ? [
        ` temp2 = ${arpBaseIntervalVar}`,
        ' temp1 = temp5 & 31',
        ...tableLookupAsm(musicInstrumentArpIntervalTableName(), instrumentVar, 'temp4'),
        ' temp1 = temp1 | temp4',
        ` ${arpBaseIntervalVar} = temp1`,
        ` if temp2 = ${arpBaseIntervalVar} then goto _music${channel}_arp_samenote`,
        ' temp1 = temp1 & 31',
        ...suppressibleWrite('audf', ` AUDF${channel} = temp1`),
        // Refilled from this note's speed (already in arpSpeedRangeVar's low bits, set when the instrument last changed), not a bare 1:
        // a bare 1 counts down to the first flip in a single frame no matter the configured speed. A plain "= temp2" (not "|"/masked)
        // also resets the phase to 0 for free - temp2 is always 0-15, so the high (phase) nibble comes along zeroed.
        ` temp2 = ${arpSpeedRangeVar} & 15`,
        ` ${arpCounterPhaseVar} = temp2`,
        `_music${channel}_arp_samenote`,
      ] : [];
      // The watch of the notes of an instrument the project watches: on the TIA a flag of the first byte of the note (temp3), on the chip
      // every note unless a marker said otherwise (temp5). tag makes the labels of each copy different.
      const watchLines = (tag) => (!notePlayedSetLines.length ? [] : [
        ...(chip ? (hasNoWatch ? [` if temp5 = 0 then goto _music${channel}_nowatch${tag}`] : []) : [
          ` temp1 = temp3 & ${WATCH_FLAG}`,
          ` if temp1 = 0 then goto _music${channel}_nowatch${tag}`,
        ]),
        ...notePlayedSetLines,
        `_music${channel}_nowatch${tag}`,
      ]);
      // A note: the volume (temp4: the instrument's or the one the note says, or its line of the instrument tables), the pitch.
      const noteLines = !instrumentVar ? [] : [
        ...(volumeOverrides ? [' temp1 = temp4'] : tableLookupAsm(musicInstrumentVolumeTableName(), instrumentVar, 'temp1')),
        ...suppressibleWrite('audvfetch', volumeWrite('fetch')),
        ...(chip ? watchLines('') : []),
        ...(hasArpeggio ? arpeggioPitchLines : suppressibleWrite('audfnote', ` AUDF${channel} = ${pitchVar}`)),
      ];
      // Where the note being played starts, for the resume of a sound effect.
      const startPair = hasSoundEffectDuration ? resolveRW(musicStartVarName(channel)) : null;
      // The volume of the instrument into temp4 (until the note says another).
      const defaultVolumeLines = volumeOverrides ? tableLookupAsm(musicInstrumentVolumeTableName(), instrumentVar, 'temp4') : [];
      // A note with a volume other than its instrument's can have a marker before it: temp1 is the marker, and the note is read again after it.
      const volumeMarkerLines = volumeMarkers ? [
        ` if temp1 < ${VOLUME_MARKER_BASE} then goto _music${channel}_novol`,
        ' temp4 = temp1 & 15',
        ` ${advanceIndex(1)}`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        `_music${channel}_novol`,
      ] : [];

      // None of B/A/UB/UA/DB/DA are kept in their  dev vars (see
      // arpBaseIntervalVar's  comment) - every one is derived fresh,
      // right here, only on the rare frame a flip actually lands on it: base
      // is always the packed var's low 5 bits; the "alt" (A/UA/DA) tokens
      // subtract the packed var's  interval (bits 5-7) from that; "U"
      // tokens then halve it (one octave up); "D" tokens double and mask
      // back to 5 bits (one octave down, AUDF hardware only reads 5 bits).
      const arpApply = hasArpeggio ? (() => {
        // Each call site gets its  suppressibleWrite tag (rather than one
        // shared "arp" tag) - suppressibleWrite emits its  skip label
        // per call, and this is called once per phase per range, so a
        // shared tag would emit that same label many times over and fail to
        // assemble (duplicate label).
        const computeLines = (token, tag) => {
          const lines = [` temp1 = ${arpBaseIntervalVar} & 31`];
          if (token.endsWith('A')) {
            lines.push(` temp2 = ${arpBaseIntervalVar} / 32`, ` temp1 = temp1 - temp2`);
          }
          if (token[0] === 'U') {
            lines.push(` temp1 = temp1 / 2`);
          } else if (token[0] === 'D') {
            lines.push(` temp1 = temp1 * 2`, ` temp1 = temp1 & 31`);
          }
          return [...lines, ...suppressibleWrite(tag, ` AUDF${channel} = temp1`)];
        };
        // A per-range/phase dispatch, duplicated per range - a shared
        // flat-lookup-table version of this was tried and reverted (see git
        // history around ARPEGGIO_TOKEN_ORDER) because it broke ROM playback
        // while leaving the browser preview untouched.
        // Reads/writes temp1 for "the current phase" (rather than arpPhaseVar
        // directly - see musicArpCounterPhaseVarName's  comment, this is
        // now packed with counter into one byte) - the caller below always
        // has temp1 holding the freshly-derived plain (unshifted) new phase
        // value by the time any of this runs. The self-clamp needs a
        // goto-guarded two-line block (bB's "if...then" only conditions the
        // one statement right after "then" - a colon-chained "temp1 = 0 :
        // combined = ..." would run its second half unconditionally) since it
        // has to update both temp1 (for this dispatch pass'  phaseChecks
        // below) and arpCounterPhaseVar's  high nibble (so the clamp
        // actually persists into the NEXT flip's "combined / 16" read,
        // matching the old single persistent var's  behavior exactly).
        // A run of "is it this value" tests on one variable as assembly: the variable is loaded once, and each test is a compare and a branch
        // over a jump (which reaches any label). The labels of bB statements are written with the dot bB gives them.
        const dispatchAsm = (variable, pairs, otherwise) => [
          ' asm',
          `       lda ${variable}`,
          ...pairs.flatMap(([value, label]) => [
            `       cmp #${value}`, `       bne ${label}_nx`, `       jmp .${label}`, `${label}_nx`,
          ]),
          `       jmp .${otherwise}`,
          'end',
        ];
        const rangeBlocks = ARPEGGIO_PHASE_SEQUENCES.flatMap((sequence, rangeIndex) => {
          const phasePairs = [];
          const phaseBlocks = [];
          const rangeLabel = `_music${channel}_arp_range${rangeIndex}`;
          const resetLabel = `${rangeLabel}_phasereset`;
          const okLabel = `${rangeLabel}_phaseok`;
          sequence.forEach((token, phaseIndex) => {
            const label = `_music${channel}_arp_r${rangeIndex}p${phaseIndex}`;
            phasePairs.push([phaseIndex, label]);
            phaseBlocks.push(label, ...computeLines(token, `arpr${rangeIndex}p${phaseIndex}`), ` goto _music${channel}_arp_skip`);
          });
          return [
            rangeLabel,
            ` if temp1 > ${sequence.length - 1} then goto ${resetLabel}`,
            ` goto ${okLabel}`,
            resetLabel,
            ` temp1 = 0`,
            ` ${arpCounterPhaseVar} = ${arpCounterPhaseVar} & 15`,
            okLabel,
            ...dispatchAsm('temp1', phasePairs, `_music${channel}_arp_skip`),
            ...phaseBlocks,
          ];
        });
        // Range isn't kept in its  dev var either (see arpSpeedRangeVar's
        // comment) - extracted into temp2 right here, only on the rare
        // frame a flip actually happens, right before the dispatch that's
        // the only thing that needs it.
        const rangeDispatch = dispatchAsm('temp2',
            ARPEGGIO_PHASE_SEQUENCES.slice(0, -1).map((_, rangeIndex) => [rangeIndex, `_music${channel}_arp_range${rangeIndex}`]),
            `_music${channel}_arp_range${ARPEGGIO_PHASE_SEQUENCES.length - 1}`);
        return [
          // Suppressed (skipped entirely, counters included) for as long as
          // a sound effect sharing this channel owns its hardware output -
          // same reasoning as suppressibleWrite's other callers, just gating
          // the whole tick rather than one write, since there's nothing
          // useful to advance while this channel's  AUDF is off-limits
          // anyway. Omitted outright (see hasSoundEffectDuration/
          // suppressibleWrite's  identical gate above) when nothing on
          // this channel could ever actually set durationVar nonzero in the
          // first place - a raw check here, not routed through
          // suppressibleWrite itself, so it needed its  explicit gate to
          // stop paying for it too.
          // The counter and phase tick as assembly (about 55 bytes where the bB statements were about 110, with a multiply routine
          // call on each flip): temp3 is the speed and range byte, then temp1 the plain phase and temp2 the range for the dispatch below.
          ' asm',
          ...(hasSoundEffectDuration ? [
            `       lda ${durationVar}`,
            `       beq _music${channel}_arpa_dur`,
            `       jmp ._music${channel}_arp_skip`,
            `_music${channel}_arpa_dur`,
          ] : []),
          `       lda ${timerVar}`,
          `       bne _music${channel}_arpa_timer`,
          `       jmp ._music${channel}_arp_skip`,
          `_music${channel}_arpa_timer`,
          `       lda ${arpSpeedRangeVar}`,
          '       sta temp3',
          `       bne _music${channel}_arpa_speed`,
          `       jmp ._music${channel}_arp_skip`,
          `_music${channel}_arpa_speed`,
          `       dec ${arpCounterPhaseVar}`,
          `       lda ${arpCounterPhaseVar}`,
          '       and #15',
          `       beq _music${channel}_arpa_flip`,
          `       jmp ._music${channel}_arp_skip`,
          `_music${channel}_arpa_flip`,
          '       lda temp3',
          '       and #15',
          '       sta temp2',
          `       lda ${arpCounterPhaseVar}`,
          '       clc',
          '       adc #16',
          '       ora temp2',
          `       sta ${arpCounterPhaseVar}`,
          '       lsr',
          '       lsr',
          '       lsr',
          '       lsr',
          '       sta temp1',
          '       lda temp3',
          '       lsr',
          '       lsr',
          '       lsr',
          '       lsr',
          '       sta temp2',
          'end',
          ...rangeDispatch,
          ...rangeBlocks,
          `_music${channel}_arp_skip`,
        ];
      })() : [];

      // A page-break (see eventsToPages) only ever shows up where a new
      // record's AUDV byte would be - the peek right here, before deciding
      // whether this frame's event is a loop or a real note. Advances to
      // the next page's table and re-peeks from its start before falling
      // through to the usual loop-sentinel check below.
      const pageBreakCheck = multiPage ? [
        ` if temp1 <> ${PAGE_BREAK_SENTINEL} then goto _music${channel}_notpagebreak`,
        ` ${pageVarWrite} = ${pageVar} + 1`,
        ` ${indexVarWrite} = 0`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ...skipInstrumentMarkers,
        ...skipEnvelopeMarkers,
        `_music${channel}_notpagebreak`,
      ] : [];

      // Once every OTHER channel has also gone inactive, this is the last
      // one finishing - only then does the song as a whole actually stop
      // (clearing the shared playing bit and setting justStopped).
      // Otherwise some other channel is still playing, so only this
      // channel's  audio mutes.
      const otherChannels = allChannels.filter((other) => other !== channel);
      // Snapshots which song this was (see musicJustStoppedSongVarName's
      // comment) right alongside justStoppedBit itself, only once a "by id"/
      // "by number" song-stopped watch actually exists to read it back -
      // multiSong-gated the same way songIndexVar itself is (a single-song
      // project has nothing for this to ever distinguish).
      const justStoppedSongSet = multiSong && music.usesFilteredSongStopped ?
        [` ${resolveVar(musicJustStoppedSongVarName())} = ${songIndexVar}`] : [];
      const finishCheck = [
        ...otherChannels.map((other) =>
          ` if ${activeBitByChannel[other]} then goto _music${channel}_skip`),
        ` ${playingBit} = 0`,
        ` ${justStoppedBit} = 1`,
        ...justStoppedSongSet,
      ];

      // Plain bB two-line check, not a hand-optimized "inline"-d .asm gate
      // file - an earlier version of this used a single LDA (via a real
      // sibling .asm file, the same "inline" mechanism text12a.asm/
      // text12b.asm use) covering both the paused and active bit tests, but
      // that was only ever validated with musicEngine staying in bank 1.
      // Confirmed directly against a real project: once musicEngine is
      // relocated to another bank at all (see wrapRelocatableMusic's
      // goto-entry/return-bank1 trampoline), an "inline"-d file positioned
      // here breaks the build (DASM "Origin Reverse-indexed") even in a
      // bank with nothing else in it - almost certainly the same class of
      // local-label-scope corruption an embedded "asm ... end" block caused
      // at this exact position originally (see git history), just not fully
      // avoided by "inline"-ing a file the way it was for the bank-1-only
      // case. Two plain "if" lines cost a few more cycles than the single
      // LDA did, but work correctly relocated to any bank, which matters
      // far more for a project that actually needs music moved out of
      // bank 1 to fit at all.
      // Lets a sound effect sharing this channel (see soundfx.js's soundfx_play/channnel0duration+channnel1duration) mute music's
      // hardware output for its duration, then hand it back once that duration ends, WITHOUT any new dev var to remember what was
      // playing: the note that is due is always the last record this channel fetched (each is 2 bytes, and indexVar points right
      // after it), and its volume, AUDC and the rest of what it has in common with the notes of its instrument come from the line of
      // the instrument tables that lastAudcVar (the index of the instrument, see musicLastAudcVarName) picks. This does NOT freeze
      // anything: timerVar/indexVar keep advancing every frame regardless of whether a sound effect currently owns this channel's
      // hardware output, so by the time the effect ends, indexVar/pageVar already point at whichever note is genuinely due AT THAT
      // MOMENT, with timerVar already holding its true remaining length.
      //
      // Deliberately generated as part of THIS channel's per-frame check (which lives inside musicEngine's relocatable payload, see
      // wrapRelocatableMusic below) rather than spliced into commongamelogic, which is always fixed in bank 1: the data tables travel
      // to whatever bank musicEngine itself gets relocated to, so reading them from bank-1-fixed code would silently read the WRONG
      // bank's data once relocated (see bankJumpSuffix's comment). `if indexVar < 2` guards a fetch that has never happened yet on
      // this channel (indexVar still at its dim'd-0 default), which would otherwise wrap the read index to 254+.
      // The note being played starts where startPair says (at its markers, if it has any).
      const chipResumeLines = !startPair ? [] : [
        ...(instrumentVar ? tableLookupAsm(musicInstrumentVolumeTableName(), instrumentVar, 'temp4') : []),
        ...(volumeMarkers || hasNoWatch ? [
          ` temp5 = ${startPair.read}`,
          `_musicresume${channel}_cmark`,
          ' temp1 = temp5',
          ...pagedReadLines(tables, pageVar, 'temp1', channel),
          ` if temp1 < ${VOLUME_MARKER_BASE} then goto _musicresume${channel}_cnomark`,
          ...(hasNoWatch ? [` if temp1 = ${NOWATCH_MARKER} then goto _musicresume${channel}_cnext`] : []),
          ' temp4 = temp1 & 15',
          `_musicresume${channel}_cnext`,
          ' temp5 = temp5 + 1',
          ` goto _musicresume${channel}_cmark`,
          `_musicresume${channel}_cnomark`,
        ] : [
          ` temp1 = ${startPair.read}`,
          ...pagedReadLines(tables, pageVar, 'temp1', channel),
        ]),
        ' temp3 = temp1',
        ` if temp3 = 0 then goto _musicresume${channel}_rest`,
        ...(hasFixed ? [
          ...tableLookupAsm(musicInstrumentPitchTableName(), instrumentVar, 'temp6'),
          ` if temp6 = 255 then goto _musicresume${channel}_note`,
          ' temp3 = temp6',
        ] : []),
        ...(instrumentVar ? [
          `_musicresume${channel}_note`,
          ' temp1 = temp4',
          volumeWrite('resume'),
          ...tableLookupAsm(musicInstrumentTableName(), instrumentVar, 'temp1'),
          ` AUDC${channel} = temp1`,
          ` AUDF${channel} = temp3`,
          ` goto _musicresume${channel}_skip`,
        ] : []),
        `_musicresume${channel}_rest`,
        ` AUDV${channel} = 0`,
        ` AUDF${channel} = 0`,
      ];
      const tiaResumeLines = !startPair ? [] : [
        ` temp1 = ${startPair.read}`,
        ...pagedReadLines(tables, pageVar, 'temp1', channel),
        ...(instrumentVar ? tableLookupAsm(musicInstrumentVolumeTableName(), instrumentVar, 'temp4') : []),
        ...(volumeMarkers ? [
          ` if temp1 < ${VOLUME_MARKER_BASE} then goto _musicresume${channel}_novol`,
          ' temp4 = temp1 & 15',
          ` temp1 = ${startPair.read} + 1`,
          ...pagedReadLines(tables, pageVar, 'temp1', channel),
          `_musicresume${channel}_novol`,
        ] : []),
        ' temp3 = temp1',
        ...(hasTuned ? [` if temp3 < ${SHORT_FORM_FLAG} then goto _musicresume${channel}_tuned`] : []),
        // A rest or a hit.
        ...(hasFixed ? [
          ` temp1 = temp3 & ${REST_FLAG}`,
          ` if temp1 <> 0 then goto _musicresume${channel}_rest`,
          ...tableLookupAsm(musicInstrumentPitchTableName(), instrumentVar, 'temp5'),
          ` goto _musicresume${channel}_note`,
        ] : [` goto _musicresume${channel}_rest`]),
        ...(hasTuned ? [
          `_musicresume${channel}_tuned`,
          ' temp5 = temp3',
          ...(packedVolumes ? [
            ` temp1 = temp3 & ${TUNED_PACKED_FLAG}`,
            ` if temp1 = 0 then goto _musicresume${channel}_note`,
            ...unpackVolumeAsm(false),
          ] : []),
        ] : []),
        ...(instrumentVar ? [
          `_musicresume${channel}_note`,
          ' temp1 = temp4',
          volumeWrite('resume'),
          ...tableLookupAsm(musicInstrumentTableName(), instrumentVar, 'temp1'),
          ` AUDC${channel} = temp1`,
          ` AUDF${channel} = temp5`,
          ` goto _musicresume${channel}_skip`,
        ] : []),
        `_musicresume${channel}_rest`,
        ` AUDV${channel} = 0`,
        ` AUDF${channel} = 0`,
      ];
      const resumeCheck = !hasSoundEffectDuration ? [] : [
        ` if ${durationVar} <> 1 then goto _musicresume${channel}_skip`,
        ` if !${activeBit} then goto _musicresume${channel}_skip`,
        ...(chip ? chipResumeLines : tiaResumeLines),
        `_musicresume${channel}_skip`,
      ];

      // Hand-written 6502 for the part of channelBody that runs literally
      // every frame for every channel regardless of project shape: the
      // pause/active gate and the timer decrement. An earlier version of
      // this broke once musicEngine relocated to a non-bank-1 bank ("Unknown
      // Mnemonic 'jmp _music0_skip'") - root-caused directly against that
      // failing build's  DASM listing: bB auto-prefixes every ordinary
      // label STATEMENT (e.g. "_music0_skip", defined far below as a normal
      // bB label, not inside this asm block) with "." to make it a DASM
      // local label (confirmed straight from the listing: "_musicresume0_skip"
      // compiled to ".musicresume0_skip"), but content inside "asm...end" is
      // passed through completely unmodified - a plain "jmp _music0_skip"
      // in here was really jumping to a DIFFERENT, undefined symbol, not the
      // real (dot-prefixed) label at all. In bank 1's densely-populated
      // code that plain name may have coincidentally matched some unrelated
      // global symbol elsewhere in the project (silently jumping to the
      // wrong place rather than failing to build); a mostly-empty relocated
      // bank had nothing to coincidentally match, so DASM correctly reported
      // it as genuinely undefined instead. Fixed by referencing the SAME
      // dot-prefixed local name ("._music{channel}_skip") bB itself already
      // generates for that label, rather than avoiding the jump.
      const activeMask = `$${(1 << musicChannelActiveBit(channel)).toString(16).toUpperCase()}`;
      const bothMask = `$${((1 << musicPausedBit) | (1 << musicChannelActiveBit(channel))).toString(16).toUpperCase()}`;
      const channelBody = [
        ...resumeCheck,
        ' asm',
        // Not paused and active in one test: of the two bits only the active one may be set.
        '       lda ' + flagsVar,
        '       and #' + bothMask,
        '       cmp #' + activeMask,
        '       beq _music' + channel + '_hp_active',
        '       jmp ._music' + channel + '_skip',
        '_music' + channel + '_hp_active',
        '       dec ' + timerVar,
        // "dec" already sets Z exactly the way the very next check needs -
        // on a channel with no arpeggio, nothing runs between here and that
        // check (arpApply is a no-op array whenever !hasArpeggio - see its
        // definition), so those flags are still live and this can
        // branch straight off them instead of falling out to a separately
        // bB-compiled "if timerVar <> 0 then goto skip", which would
        // otherwise re-load timerVar from RAM a moment after this same
        // "dec" already read it. Only safe here specifically because
        // arpApply (a real run of bB-compiled comparisons when arpeggio IS
        // in use) would clobber Z before that separate check ever ran -
        // left as the original two-step form in that case, unchanged.
        ...(hasArpeggio ? [
          'end',
        ] : [
          '       beq _music' + channel + '_hp_fetch',
          '       jmp ._music' + channel + '_skip',
          '_music' + channel + '_hp_fetch',
          'end',
        ]),
        ...arpApply,
        ...(hasArpeggio ? [` if ${timerVar} <> 0 then goto _music${channel}_skip`] : []),
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ...skipInstrumentMarkers,
        ...skipEnvelopeMarkers,
        ...pageBreakCheck,
        ` if temp1 <> ${LOOP_SENTINEL} then goto _music${channel}_read`,
        // Single-pattern song (the common case, and the only case before
        // pattern reuse existed): identical to the original behavior,
        // unconditionally back to page 0 (there's only ever the one page/
        // pattern to go back to) once looping is confirmed.
        //
        // Multi-position song: LOOP_SENTINEL means "this PATTERN's  data
        // just ended", not necessarily the whole sequence - always advance
        // to the next sequence position first, and only consult the loop
        // bit (same as before) once that advance actually runs off the end
        // of the sequence. musicSeqTableName's  table turns whatever
        // sequence position that lands on into the page that position's
        // pattern data starts at - the actual reuse: several positions can
        // (and do, for a repeated pattern) resolve to the exact same page.
        ...(multiSeq ? [
          // Checked BEFORE ever touching seqPosVar - if the group currently
          // playing still owes repeats (see musicSeqRepeatVarName), this
          // just counts one off and jumps straight to the shared re-peek
          // tail below (_seqrestart), re-reading the SAME group's  start
          // page again rather than moving to the next sequence position at
          // all. Only once a group's  repeats are exhausted does this
          // fall through to the ordinary advance-or-wrap logic, completely
          // unchanged from before repeat groups existed - so a project with
          // no repeated patterns anywhere never even generates this check
          // (seqRepeatVar is null then).
          // Masked against THIS channel's  nibble only (see
          // musicSeqRepeatVarName's  comment) - temp1 holds channel 0's
          // count via a plain & mask, or channel 1's via / 16, matching
          // soundfx.js's  envelopeConfig convention exactly. The
          // decrement itself (-1 for channel 0, -16 for channel 1) only
          // ever touches THIS channel's  nibble, safe without any
          // cross-channel coordination since the other nibble's  bits
          // are far enough away to never be affected by a single-nibble
          // borrow (temp1 = 0 is checked first, so this never underflows
          // past 0 into the other nibble either).
          ...(seqRepeatVar ? [
            seqRepeatHigh ? ` temp1 = ${seqRepeatVar} / 16` : ` temp1 = ${seqRepeatVar} & 15`,
            ` if temp1 = 0 then goto _music${channel}_seqadvance`,
            seqRepeatHigh ? ` ${seqRepeatVar} = ${seqRepeatVar} - 16` : ` ${seqRepeatVar} = ${seqRepeatVar} - 1`,
            // pageVar isn't touched by hitting LOOP_SENTINEL itself - it's
            // left on whatever page the pattern's LAST page happened to be
            // (only equal to its FIRST/start page when the pattern fits in
            // one page). A repeat replays this SAME position's pattern from
            // its  start, so pageVar needs the same explicit reset the
            // advance branch below already gives it - without this, a
            // repeated pattern spanning more than one page replayed only its
            // last (partial) page instead of the whole thing, hit
            // LOOP_SENTINEL again almost immediately, and sounded like an
            // extra, garbled repeat. seqPosVar hasn't moved yet, so this is
            // the exact same lookup the advance branch's  pageVar reset
            // uses, just reached from here instead.
            ...buildPageResetLines('repeat'),
            ` goto _music${channel}_seqrestart`,
            `_music${channel}_seqadvance`,
          ] : []),
          ...chipFinishedSetLines,
          ` ${seqPosVar} = ${seqPosVar} + 1`,
          ` if ${seqPosVar} <> ${seqLenExpr} then goto _music${channel}_seqcontinue`,
          ` if ${loopBit} then goto _music${channel}_seqwrap`,
          ...suppressibleWrite('audvseqend', ` AUDV${channel} = 0`),
          ` ${activeBit} = 0`,
          ...finishCheck,
          ` goto _music${channel}_skip`,
          `_music${channel}_seqwrap`,
          ` ${seqPosVar} = 0`,
          `_music${channel}_seqcontinue`,
          // A single song still just reads its  one Seq table directly
          // (identical to before). Once there's more than one song, this
          // dispatches through _musicSongIndex first, since only ONE of
          // several songs'  Seq tables is the right one to consult for
          // whichever song is actually playing right now - only runs at a
          // pattern-transition boundary (not every frame), so the cost is
          // bounded by however many songs actually reach this point. The
          // page lookup itself is skipped entirely when pageVar is null (a
          // single-page channel - see its  comment above), and the
          // repeat-count lookup (see musicSeqRepeatTableName) rides along in
          // its  separate dispatch whenever seqRepeatVar exists - a
          // plain full overwrite (not masked), since the table already
          // stores this group's  final repeats-remaining value pre-
          // packed for BOTH nibbles (see resolveProjectMusic's
          // sequenceRepeatPacked) - but this channel's  advance can run
          // at a completely different FRAME than the other channel's
          // advance (each channel's  LOOP_SENTINEL timing depends on
          // that channel's  note durations summing to the pattern's
          // length, which routinely differs between a melody and a harmony
          // channel of the very same pattern). A full overwrite here would
          // clobber whatever repeat count the OTHER channel was still
          // counting down for a position IT hasn't reached yet - confirmed
          // as a real, reproducible bug (a later sequence chip's  advance
          // corrupting an earlier chip's still-in-progress repeat count,
          // observed as extra, uncounted repeats that got worse the more
          // sequence chips existed). Masked into temp1 first, then merged
          // into only THIS channel's  nibble (same $0F/$F0 mask
          // convention as soundfx.js's  envelopeConfig), leaving
          // whatever the other channel's  nibble currently holds alone -
          // exactly as safe as the decrement above already was.
          ...(multiSong ? [
            ...buildPageResetLines('advance'),
            ...(seqRepeatVar ? (music.combinedSeqTables ? [
              // Same combined-table read as buildPageResetLines'
              // combinedSeqTables branch - recomputed here (rather than
              // relying on temp1 still holding it from that call right
              // above) so this stays correct even if something is ever
              // spliced between the two.
              ` temp1 = ${musicSongSeqOffsetTableName()}[${songIndexVar}]`,
              ` temp1 = temp1 + ${seqPosVar}`,
              ` temp1 = ${musicCombinedSeqRepeatTableName()}[temp1]`,
              seqRepeatHigh ?
                ` ${seqRepeatVar} = (${seqRepeatVar} & $0F) | (temp1 & $F0)` :
                ` ${seqRepeatVar} = (${seqRepeatVar} & $F0) | (temp1 & $0F)`,
            ] : [
              ...music.songs.map((song, i) => {
                const isLast = i === music.songs.length - 1;
                const nextLabel = `_music${channel}_seqrepsong${song.songIndex}_next`;
                // Same totalSteps <= 1 shortcut as buildPageResetLines'
                // page lookup above - such a song's  sequenceRepeatPacked
                // is always exactly [0] (its one group can't itself have a
                // repeat count baked in beyond the first play - see
                // resolveProjectMusic), so the literal 0 this substitutes is
                // provably identical to whatever its (skipped) data
                // table would have held.
                const lookup = song.totalSteps > 1 ?
                  ` temp1 = ${musicSeqRepeatTableName(song.songIndex)}[${seqPosVar}]` :
                  ` temp1 = 0`;
                return isLast ? lookup : [
                  ` if ${songIndexVar} <> ${song.songIndex} then goto ${nextLabel}`,
                  lookup,
                  ` goto _music${channel}_seqreptable_done`,
                  nextLabel,
                ].join('\n');
              }),
              `_music${channel}_seqreptable_done`,
              seqRepeatHigh ?
                ` ${seqRepeatVar} = (${seqRepeatVar} & $0F) | (temp1 & $F0)` :
                ` ${seqRepeatVar} = (${seqRepeatVar} & $F0) | (temp1 & $0F)`,
            ]) : []),
          ] : [
            ...buildPageResetLines('advance'),
            ...(seqRepeatVar ? [
              ` temp1 = ${musicSeqRepeatTableName()}[${seqPosVar}]`,
              seqRepeatHigh ?
                ` ${seqRepeatVar} = (${seqRepeatVar} & $0F) | (temp1 & $F0)` :
                ` ${seqRepeatVar} = (${seqRepeatVar} & $F0) | (temp1 & $0F)`,
            ] : []),
          ]),
          ...(seqRepeatVar ? [`_music${channel}_seqrestart`] : []),
        ] : [
          ` if ${loopBit} then goto _music${channel}_loopreset`,
          ...suppressibleWrite('audvsingleend', ` AUDV${channel} = 0`),
          ` ${activeBit} = 0`,
          ...finishCheck,
          ` goto _music${channel}_skip`,
          `_music${channel}_loopreset`,
          ...(multiPage ? [` ${pageVarWrite} = 0`] : []),
        ]),
        ` ${indexVarWrite} = 0`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ...skipInstrumentMarkers,
        ...skipEnvelopeMarkers,
        `_music${channel}_read`,
        ...(chip ? [
          // A note of the chip is a hit (1 byte, the duration), a note with its pitch stored (the pitch and the duration) or a rest (0 and
          // the duration), with markers before it for the volume and the watch (see noteBytes): temp1 is the first byte and temp2 the next.
          ...(startPair ? [` ${startPair.write} = ${indexVar}`] : []),
          ...defaultVolumeLines,
          ...(hasNoWatch ? [' temp5 = 1'] : []),
          ...(volumeMarkers || hasNoWatch ? [
            `_music${channel}_cmark`,
            ` if temp1 < ${VOLUME_MARKER_BASE} then goto _music${channel}_cnomark`,
            ...(hasNoWatch ? [` if temp1 = ${NOWATCH_MARKER} then goto _music${channel}_cnw`] : []),
            ' temp4 = temp1 & 15',
            ` goto _music${channel}_cnext`,
            ...(hasNoWatch ? [`_music${channel}_cnw`, ' temp5 = 0'] : []),
            `_music${channel}_cnext`,
            ` ${advanceIndex(1)}`,
            ...pagedReadLines(tables, pageVar, indexVar, channel),
            ` goto _music${channel}_cmark`,
            `_music${channel}_cnomark`,
          ] : []),
          ' temp3 = temp1',
          ` if temp3 = 0 then goto _music${channel}_crest`,
          ...(hasFixed ? [
            ...tableLookupAsm(musicInstrumentPitchTableName(), instrumentVar, 'temp6'),
            ` if temp6 = 255 then goto _music${channel}_ctuned`,
            ` ${timerVar} = temp3`,
            ' temp3 = temp6',
            ` ${advanceIndex(1)}`,
            ` goto _music${channel}_cnote`,
          ] : []),
          `_music${channel}_ctuned`,
          ` ${timerVar} = temp2`,
          ` ${advanceIndex(2)}`,
          ...(instrumentVar ? [
            `_music${channel}_cnote`,
            ...noteLines,
            ` goto _music${channel}_skip`,
          ] : []),
          `_music${channel}_crest`,
          ` ${timerVar} = temp2`,
          ` ${advanceIndex(2)}`,
          ...restLines,
        ] : [
          // A note of the TIA is 1 or 2 bytes, or 3 with a volume marker, read by the last peek (see SHORT_FORM_FLAG): temp1 is its first byte
          // and temp2 the next.
          ...(startPair ? [` ${startPair.write} = ${indexVar}`] : []),
          ...defaultVolumeLines,
          ...volumeMarkerLines,
          ' temp3 = temp1',
          ...(hasTuned ? [` if temp3 < ${SHORT_FORM_FLAG} then goto _music${channel}_tuned`] : []),
          // A rest or a hit: the duration is in the low 5 bits of the first byte, or (those bits being 0) in the next byte.
          ' temp1 = temp3 & 31',
          ` if temp1 = 0 then goto _music${channel}_blong`,
          ` ${timerVar} = temp1`,
          ` ${advanceIndex(1)}`,
          ` goto _music${channel}_bdone`,
          `_music${channel}_blong`,
          ` ${timerVar} = temp2`,
          ` ${advanceIndex(2)}`,
          `_music${channel}_bdone`,
          ...(hasFixed ? [
            ` temp1 = temp3 & ${REST_FLAG}`,
            ` if temp1 <> 0 then goto _music${channel}_rest`,
            ...watchLines('b'),
            ...tableLookupAsm(musicInstrumentPitchTableName(), instrumentVar, 'temp5'),
            ` goto _music${channel}_note`,
          ] : [` goto _music${channel}_rest`]),
          // A note with its pitch stored: the pitch, the duration in the next byte (with the volume in its high nibble when the note has the
          // packed flag).
          ...(hasTuned ? [
            `_music${channel}_tuned`,
            ` ${advanceIndex(2)}`,
            ...(packedVolumes ? [
              ` temp1 = temp3 & ${TUNED_PACKED_FLAG}`,
              ` if temp1 = 0 then goto _music${channel}_notpacked`,
              ...unpackVolumeAsm(true),
              `_music${channel}_notpacked`,
            ] : []),
            ` ${timerVar} = temp2`,
            ...watchLines('t'),
            ' temp5 = temp3',
          ] : []),
          ...(instrumentVar ? [
            `_music${channel}_note`,
            ...noteLines,
            ` goto _music${channel}_skip`,
          ] : []),
          `_music${channel}_rest`,
          ...restLines,
        ]),
        `_music${channel}_skip`,
      ].join('\n');
      return {
        body: channelBody,
        subroutine: [buildPageDispatchSubroutine(channel, tables, pageVar), buildInstrumentMarkerSubroutine(),
          buildEnvelopeMarkerSubroutine()].filter(Boolean).join('\n\n') || null,
      };
    });
    const perChannelChecksBody = perChannelChecks.map(({body}) => body).join('\n\n');
    // Every channel's  page-dispatch subroutine (see
    // buildPageDispatchSubroutine's  comment for why this exists at all)
    // - null for a single-page channel, which never builds one. Placed
    // after the normal per-frame fall-through body (same reasoning as the
    // data tables just below: reached only via gosub, never meant to run on
    // its  every frame) but before the data tables themselves, so the
    // SAME "goto dataSkipLabel" already skipping over the data tables skips
    // over these too - no second skip/goto pair needed.
    const pageDispatchSubroutines = perChannelChecks.map(({subroutine}) => subroutine).filter(Boolean).join('\n\n');

    // This whole per-channel dispatch (especially with Arpeggio, which
    // can each add a substantial amount of code per channel) is spliced
    // straight into commongamelogic (see bbasic.bb.hbs) - a plain gosub'd
    // subroutine that's ALWAYS in bank 1, unlike events/backgrounds/
    // animations, which the auto-relocation system (see rom.js's
    // pickRelocationCandidate) can already move to any other bank once bank
    // 1 fills up. Wrapping it as its  relocatable unit (wrapRelocatableMusic
    // - the same entry/return-label redirect mechanism wrapRelocatableGraphics
    // uses for a background or animation, just kept in its  separate pool/
    // config key so a bank reserved for music - see rom.js's
    // musicReservedBank - never has to share space with graphics) makes this
    // movable too, without needing a whole separate relocation mechanism of
    // its. Its data tables (music.channelPages' raw
    // bytes) travel along in the SAME payload rather than staying in the
    // fixed, bank-1-only "Data tables" section - a data table can only be
    // read correctly from the same bank it's declared in (see
    // trackDataTableBank's  comment), and this is the only place they're
    // ever read from, so there's no need to duplicate them per-bank the way
    // a Data-tab table shared across several relocated events does.
    //
    // The data table can't just follow the checks directly, though - unlike
    // the checks (meant to run every frame, falling through into whatever
    // comes after once every channel's  early-exit has been checked), a
    // "data" block is raw bytes, not code: falling through into it would
    // have the CPU start executing table data as instructions. An explicit
    // jump skips over it, landing on a label placed right after - taken
    // every single frame this runs (not just when a table is actually
    // read), but that's a handful of cycles, not a real cost.
    const dataTables = this.generateMusicDataTables();
    const dataSkipLabel = '_music_update_data_skip';
    // Same banner style as the fixed section headers in bbasic.bb.hbs (e.g.
    // "Code generated by VCS Game Maker.") - added at the user's
    // explicit request, crediting the Music tab/engine's  author.
    const banner = [
      ' rem **************************************************************************',
      ' rem Music engine by AbstractPolygon - https://abstractpolygon.com/',
      ' rem **************************************************************************',
    ].join('\n');
    // The page-dispatch subroutines (see pageDispatchSubroutines'
    // comment) are gosub'd, never fallen into, so they need the exact same
    // "goto past this, land on a label right after" protection the data
    // tables already need for their, different reason (raw bytes, not
    // code) - reusing dataSkipLabel for both rather than a second skip/goto
    // pair. Needed whenever EITHER exists, not just when dataTables does -
    // a project with at least one multi-page channel but (hypothetically)
    // no data tables would otherwise leave its  subroutines completely
    // unprotected, exposed to plain fall-through execution as if they were
    // ordinary per-frame code.
    const skippable = [pageDispatchSubroutines, dataTables].filter(Boolean).join('\n\n');
    const body = skippable ?
      [perChannelChecksBody, ` goto ${dataSkipLabel}`, skippable, dataSkipLabel].join('\n\n') :
      perChannelChecksBody;
    const payload = `${banner}\n\n${body}`;
    return this.wrapRelocatableMusic('musicEngine', payload);
  };
};
