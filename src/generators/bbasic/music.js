'use strict';

import {chunk} from 'lodash';

import {findSongById, processSongsStorageDefaults, DEFAULT_PATTERN_STEPS, LENGTH_UNITS_PER_STEP} from '../../blocks/music';
import {functionCallDiscardVarName} from '../../blocks/function';
import {processSoundEffectsStorageDefaults, DEFAULT_ARPEGGIO_DIVISION} from '../../blocks/soundfx';
import {MAX_DATA_TABLE_VALUES} from '../../blocks/data';
import {useConfigurationStorage, useDimSoundFxPercentStorage, useDimSoundFxStorage,
  useSoundEffectsStorage, useSongsStorage, loadMutedMusicTrackIds, loadSoloedMusicTrackIds,
  isMusicTrackMuted} from '../../hooks/project';
import {effectiveTempo} from '../../utils/music-playback';
import {audcHasTunableNotes, noteAudv} from '../../utils/music-notes';
import {clampEnvelopeStages} from '../../utils/envelope';
import {DEFAULT_DIM_PERCENT, dimVolume, registerEnvelopeConfig, NO_ENVELOPE_SENTINEL,
  getEnvelopeConfigs} from './soundfx';

const FRAMES_PER_SECOND = 60; // NTSC - matches "set tv ntsc" in bbasic.bb.hbs
// A held note's duration is stored in the low 7 bits of its own byte (see
// eventsToPages) - bit 7 is reused as the "this note has an envelope" flag,
// so a channel with any envelope in use caps a single event's hold at 127
// frames instead of 255 (channels with no envelope at all keep the full 255
// range - see the final chunking pass in flattenPatternEvents).
const MAX_EVENT_FRAMES_WITH_ENVELOPE = 127;
const MAX_EVENT_FRAMES_NO_ENVELOPE = 255;
// Only an event that ITSELF arpeggiates needs 3 more bits (see
// ARPEGGIO_PHASE_SEQUENCES) for its range/shape, cutting its own duration
// down to this - a rest or non-arpeggiating note on the very same channel
// isn't forced into this narrow cap too (see the per-event maxFrames in
// flattenPatternEvents' final chunking pass, and the arpSpeedVar branch in
// generateMusicChecks' durationRead), since its duration byte doesn't need
// to carry any range bits at all.
const MAX_EVENT_FRAMES_WITH_ARPEGGIO = 15;
const ENVELOPE_BIT = 0x80;
const ARPEGGIO_RANGE_BITS_SHIFT = 4;
// Same numeric limit as MAX_EVENT_FRAMES_WITH_ARPEGGIO (both are bounded by
// a 4-bit nibble), but a separate name since they bound conceptually
// different things - one a note's held duration, the other how many frames
// between arpeggio flips.
const MAX_ARPEGGIO_SPEED_FRAMES = 15;
// AUDV is 0-15 (now up to 0-239 once a "note played" watch index is packed
// into its own spare high nibble - see eventsToPages/
// MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS), so 255 in that byte position is
// still unambiguous as "end of song's data, loop back to the start" - same
// convention the reference bB file this format is based on uses for its own
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
// table (see musicInstrumentTableName/resolveProjectMusic's own
// instrumentBytes) - apply it, then keep reading for the real note that
// follows" (see generateMusicChecks). Safely below PAGE_BREAK_SENTINEL/
// LOOP_SENTINEL and above the highest a real AUDV byte can ever legitimately
// reach (15 | (14 << 4) = 239, see MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS's own
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
// actual instrument change), a note's own envelope config also depends on
// its own peak volume (AUDV), which can differ note-to-note even on the
// same instrument - so this marker is emitted whenever the SELECTOR
// (config index, or "off") changes, not just on an instrument change,
// though in practice most consecutive notes share both. One value below
// INSTRUMENT_CHANGE_SENTINEL, still safely above the highest real AUDV byte
// (239).
const ENVELOPE_CHANGE_SENTINEL = 252;
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
// rather than imported from utils/music-playback.js's own copy (which
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
export const musicIndexVarName = (channel) => `_musicCh${channel}Index`;
export const musicTimerVarName = (channel) => `_musicCh${channel}Timer`;
// This channel's own CURRENT instrument byte (AUDC|arpeggioSpeed<<4) - kept
// up to date only at an actual INSTRUMENT_CHANGE_SENTINEL marker (see
// generateMusicChecks), not on every note fetch, now that AUDC is no longer
// part of the regular per-note record at all (see eventsToPages' own
// comment on why). Needed specifically for the music/sound-effect
// interleaving feature's own resume logic: restoring AUDC once a sound
// effect's own hold on this channel ends used to just re-read the last-
// fetched record's own AUDC byte at a fixed offset from indexVar, which
// only worked because every record always had exactly one - a record with
// no AUDC byte of its own at all has no such offset to re-read, so this
// dev var is what resumeCheck copies from instead.
export const musicLastAudcVarName = (channel) => `_musicCh${channel}LastAudc`;
// Only reserved/used for a channel whose data spans more than one page (see
// eventsToPages/MAX_DATA_TABLE_VALUES) - which table (of that channel's own
// set) is currently being read.
export const musicPageVarName = (channel) => `_musicCh${channel}Page`;
// Only reserved/used for a song whose own sequence references more than one
// pattern (see resolveProjectMusic) - which position in the SONG's own
// sequence this channel is currently playing through. Each DISTINCT pattern
// is only ever encoded once (see channelPages/patternStartPage in
// resolveProjectMusic), so a pattern repeated at several sequence positions
// needs this to know which page to jump BACK to once the current one's data
// runs out - musicPageVarName alone can't tell "which occurrence" apart,
// since the same pattern (and so the same starting page) can be reached from
// more than one sequence position.
export const musicSeqPosVarName = (channel) => `_musicCh${channel}SeqPos`;
// Only reserved/used for a project where some included song's own Sequence
// list actually repeats a pattern several times in a row (see
// resolveProjectMusic's own groups/sequenceRepeatCount, and blocks/music.js's
// {id, patternId, count} shape a resized Sequence chip produces) - how many
// MORE times, after the one currently playing, a channel should replay the
// pattern at its current sequence position before actually advancing to the
// next one. Counting this down at the runtime pattern-transition point (see
// generateMusicChecks) rather than storing one flat sequence-table entry per
// real repeat (an earlier version of this) is what lets a resized-to-
// repeat-8-times chip cost a fixed couple bytes of ROM instead of 8.
//
// ONE SHARED byte for every channel, not one per channel - channel 0's own
// count lives in the low nibble, channel 1's in the high nibble, same
// packed-nibble convention soundfx.js's own envelopeConfig already uses
// for its own per-channel envelope-config index (see soundfx_play/
// generateEnvelopeChecks there). Each channel only ever reads/writes its
// OWN nibble (via & $0F / / 16, masking the other nibble off before writing
// - see generateMusicChecks), never the other channel's, so this is safe
// without any cross-channel coordination despite being one shared var - a
// genuinely different situation from seqPosVar/pageVar, which track state
// that would need actual synchronization to safely share (not attempted
// here). The cost of packing: a repeat count is capped at 16 total plays
// (a 4-bit nibble only reaches 15 repeats-remaining) - well past any
// realistic use, and still adjustable per group independently either way.
export const musicSeqRepeatVarName = () => '_musicRep';
export const MAX_SEQ_REPEAT_COUNT = 16;
// One shared byte (not a var per flag/channel) holding every boolean the
// music player needs project-wide - dev vars are a hard-capped, only
// 25-of-them, project-wide resource, and this used to cost 3 vars
// (playing/loop/justStopped) plus 1 more PER CHANNEL (active) on its own.
// Bit layout (see musicPlayingBit/musicLoopBit/musicJustStoppedBit/
// musicChannelActiveBit below), each bit read/written individually via bB's
// own var{n} bit syntax (already used elsewhere, e.g. sprites.js's
// CTRLPF{2}) so setting one flag never disturbs the others.
export const musicFlagsVarName = () => '_musicFlags';
export const musicPlayingBit = 0;
export const musicLoopBit = 1;
export const musicJustStoppedBit = 2;
// Channels 0/1 get bits 3/4 - independent per channel (unlike the shared
// playing bit) since two channels almost never run out of data at the same
// time (e.g. one full of short rests, the other one long sustained note).
// Gating each channel's own per-frame processing on the shared "playing"
// bit alone meant whichever channel finished first would freeze every OTHER
// channel's audio at whatever it happened to be at that instant, instead of
// letting it reach its own natural end and mute itself.
export const musicChannelActiveBit = (channel) => 3 + Number(channel);
// Shared across every channel (like playing/loop/justStopped, unlike the
// per-channel active bits above) - set by music_pause_song, cleared by
// music_unpause_song, checked first thing in generateMusicChecks' own
// per-channel body, before even the active-bit check, so a paused channel's
// timer never decrements and its data table is never advanced while set -
// the exact note playing at the moment of the pause just keeps sounding,
// unchanged, until unpaused. Bit 5 (not 3+channel) so it stays clear of the
// per-channel active bits even if a couple more channels are ever added.
export const musicPausedBit = 5;
// Overflow byte(s) for resolveMusicEventFlags below, only reserved once a
// project's own distinct one-shot music event watches (sequence-chip-
// finished AND note-played-by-instrument, sharing one pool - see that
// function's own comment) exceed the 2 spare bits (6-7, right above/below)
// musicFlagsVarName's own byte still has free. byteIndex picks which
// overflow byte (0 = the first 8 slots past the initial 2, 1 = the next 8,
// ...) - unlike the single fixed overflow byte this used to be split into
// (one for chip-finished, a separate one/two for note-played), a project
// mixing both watch types now only pays for as many TOTAL overflow bytes as
// its TOTAL watch count actually needs, not one set per feature.
export const musicEventFlagsOverflowVarName = (byteIndex) => `_musicEvtFlags${byteIndex}`;
const MUSIC_FLAGS_SPARE_BITS = [6, 7];

// Resolves every one-shot music event watch a project's own blocks
// reference - music_sequence_chip_finished (fires for ANY chip, no
// selection), music_sequence_chip_finished_by_id (one specific song+chip
// pair), music_sequence_chip_finished_current_song (one chip id, checked
// against EVERY song that happens to have a chip with that id, but only the
// one actually playing at the time ever fires it), AND
// music_note_played/_by_id (one watched instrument each, see
// notePlayedIndexById/resolveNotePlayedInstruments) - into ONE shared
// flag-bit assignment, reusing musicFlagsVarName's own 2 spare bits (see
// MUSIC_FLAGS_SPARE_BITS above - bits 0-5 are already claimed, see
// musicPlayingBit and friends) before ever reserving a new dev var. Sharing
// one pool across every watch TYPE (rather than each type exclusively
// owning its own separate spare-bit/overflow allocation, which is how this
// worked before note-played existed) means a project using, say, one
// chip-finished watch and one note-played watch together still costs
// nothing beyond musicFlagsVarName - previously the second watch TYPE
// would always cost a whole new dev var of its own, even with spare bits
// sitting unused right next to it. Only once TOTAL distinct watches (of
// either type, combined) exceed 2 does this start assigning bits in
// musicEventFlagsOverflowVarName's own byte(s) instead (each still only
// reserved, via bbasic.js's own reserveDevVar, when actually needed).
//
// Every CHIP_ID field is a project-author-facing id (see the "ID: N" badge
// inside each Sequence chip in MusicEditor.vue), not the runtime sequence
// position generateMusicChecks actually tracks (seqPosVar) -
// resolveProjectMusic's own "groups" drops the chip's own id entirely (see
// its own comment) since nothing at runtime needs it, so this resolves each
// watch back to its own compile-time INDEX within a song's own (raw,
// storage-level, not yet resolveProjectMusic-processed) sequence array here,
// once, rather than needing any runtime lookup. A stale/deleted chip
// reference (findSongById fails, or the id doesn't match any current chip in
// ANY relevant song) is silently dropped - that watch's own flag is never
// reserved, so the event block's own generator (generateChipFinishedCheck
// below) falls through as a permanent no-op for it, matching how a dangling
// reference is already handled elsewhere in this file (e.g. resolvedSongs'
// own stale-dropdown filter). A note-played watch whose own instrument id
// never actually got assigned an index (stale reference, or nothing
// currently watches it) is likewise just absent from notePlayedFlags -
// music_note_played's own generator handles that the same "permanent no-op"
// way.
//
// Multiple event-block instances targeting the exact same watch (same
// song+chipId pair, same chipId for the current-song variant, or same
// instrument id for note-played) share one bit (deduped by key/id), same
// "don't reserve twice for the same thing" reasoning as
// collisionMovePlayers' own Set.
export const resolveMusicEventFlags = (workspace, music, notePlayedIndexById = new Map()) => {
  // !!music gates this exactly like every other watch below already is
  // (each pairs/byChipId entry only resolves once resolvedSong is truthy) -
  // without it, a project with a "When a sequence chip has finished
  // playing" block AND "Mute all in-game audio" both on would still claim
  // a flag bit here, but bbasic.js's own musicFlagsVarName reservation is
  // gated behind this.projectMusic (null when muted), so nothing would
  // ever actually declare that dev var - confirmed as a real compile
  // failure (DASM: "Unknown Mnemonic" on the raw, never-aliased
  // "_musicFlags" name leaking straight into the assembly).
  const usesGeneral = !!music && workspace.getAllBlocks(false)
      .some((block) => block.type === 'music_sequence_chip_finished');

  // Lowest-numbered channel a song actually uses is treated as the sole
  // source of truth for any watch tied to that song - a song's two channels
  // can advance past the same sequence position on different FRAMES
  // (confirmed elsewhere this file - note-duration sums differ per channel),
  // so setting a watch's flag from every channel the way the general
  // (unselective) flag above does would risk firing a specific watch twice,
  // a few frames apart, for one logical "chip finished" moment. One
  // well-defined channel avoids that entirely, at the cost of that watch's
  // own timing following that one channel's own note data specifically.
  const primaryChannelFor = (resolvedSong) => String(Math.min(...[...resolvedSong.channelsUsed]));

  // "Chip ID" (both here and on the block's own field/tooltip) is the
  // chip's own CURRENT POSITION in the Sequence list (1 = first), matching
  // the "ID: N" badge MusicEditor.vue now shows on each chip - deliberately
  // NOT a permanent identity: reordering, inserting, or deleting chips
  // changes which chip a given number refers to, at the user's own explicit
  // request (an earlier version of this used each chip's own separate,
  // permanent id field instead, which stayed pointed at the same chip
  // regardless of reordering - reverted in favor of this simpler
  // "number = current position" mental model). Out-of-range (chip deleted,
  // or the number was never valid) resolves to -1, same as a not-found
  // lookup always has.
  const chipIdToSeqIndex = (rawSong, chipId) => {
    const sequence = (rawSong && rawSong.sequence) || [];
    return chipId >= 1 && chipId <= sequence.length ? chipId - 1 : -1;
  };

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
  // meaningful WITHIN one song's own Sequence list, not project-wide), each
  // its own {songIndex, seqIndex, primaryChannel} occurrence sharing ONE
  // flag bit. At runtime only whichever song is actually playing can
  // ever satisfy any one occurrence's own songIndexVar gate, so this never
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

// The packed nibble baked into each note's own AUDV byte (see eventsToPages)
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

// Resolves every "note played by instrument" watch a project's own blocks
// reference - music_note_played (dropdown) and music_note_played_by_id
// (typed ID) - into one shared index-per-instrument assignment, used ONLY
// to bake each watched instrument's own compile-time-known index straight
// into every one of its own note events' AUDV byte (see eventsToPages),
// read back and compared once per new note fetched (see
// generateMusicChecks). This index is NOT also this watch's own runtime
// flag-bit position any more (an earlier version of this had it double as
// both, since nothing else competed for those bits) - see
// resolveMusicEventFlags' own notePlayed map for that now, which pools
// flag-bit assignment together with sequence-chip-finished's own watches
// instead of each feature exclusively owning a separate byte. Called
// BEFORE resolveProjectMusic (which needs the returned index map to
// actually pack the bytes), unlike resolveMusicEventFlags, which needs
// resolveProjectMusic's own result first.
//
// Each distinct instrument (deduped by id, watched by either block type
// with no distinction between them - both mean "this instrument") gets the
// next index in 1..MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS, in first-seen order.
export const resolveNotePlayedInstruments = (workspace) => {
  // Same "Mute all in-game audio" check resolveProjectMusic itself makes -
  // duplicated (rather than passed in) since this has to run BEFORE
  // resolveProjectMusic even exists (see this function's own comment above
  // for why). Without this, a muted project with any music_note_played/
  // _by_id block would still assign watch indices here, harmlessly on its
  // own (nothing reads them without real music to pack), but
  // resolveMusicEventFlags would then also still claim flag bits for them
  // (it has no way to tell "assigned an index" apart from "worth a real
  // flag" otherwise) - same class of bug resolveMusicEventFlags' own
  // usesGeneral check exists to avoid for sequence-chip-finished.
  const configurationStorage = useConfigurationStorage();
  if (((configurationStorage && configurationStorage.value) || {}).muteAllAudio) return new Map();

  const seenIds = [];
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'music_note_played') seenIds.push(`${block.getFieldValue('INSTRUMENT')}`);
    if (block.type === 'music_note_played_by_id') seenIds.push(`${block.getFieldValue('INSTRUMENT_ID')}`);
  });
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
export const musicArpSpeedRangeVarName = (channel) => `_musicCh${channel}ArpSpeedRange`;
// Counter (frame countdown, 0-MAX_ARPEGGIO_SPEED_FRAMES) and phase (which
// note in the cycle, 0 - the longest ARPEGGIO_PHASE_SEQUENCES entry has 6
// steps) used to be two separate dev vars - counter fits a nibble exactly
// (0-15), phase comfortably fits the other one (0-5) - packed into one
// shared byte the same way arpSpeedRangeVar/arpBaseIntervalVar already pack
// their own two fields each. Counter in the LOW nibble (every frame this
// channel arpeggiates, it's decremented and compared - see arpApply's own
// hot-path checks, which only need a cheap "& 15"/no-shift-at-all), phase in
// the HIGH nibble (only touched on the rare frame a flip actually happens,
// so it can afford the "/16"/"*16" a nibble in that position needs).
export const musicArpCounterPhaseVarName = (channel) => `_musicCh${channel}ArpCounterPhase`;
// Base (0-31) and interval (0-7) merged into one shared byte - base |
// (interval << 5) - the exact same layout the AUDF data byte itself already
// uses (see eventsToPages), so this is literally just stored as-is straight
// from the fetched byte, no packing math needed at fetch time at all. Alt
// (base - interval) is no longer cached in its own dev var either - every
// place that used to read the base or alt dev var directly now derives
// whichever it needs from this one, only on the rare frame a flip actually
// lands on it (see arpApply's computeLines).
export const musicArpBaseIntervalVarName = (channel) => `_musicCh${channel}ArpBaseInterval`;
const musicDataTableName = (channel, page) => `_musicCh${channel}Data${page}`;
// The shared instrument lookup table (see resolveProjectMusic's own
// instrumentBytes build pass and eventsToPages' own INSTRUMENT_CHANGE_SENTINEL
// marker) - one AUDC|arpeggioSpeed<<4 byte per distinct instrument, indexed
// in the same stable order instrumentBytes itself uses. Project-wide, not
// per-channel or per-song, since an instrument's own byte value means the
// same thing regardless of which channel or song plays it.
const musicInstrumentTableName = () => '_musicInstruments';
// One entry per position in a song's own sequence (see resolveProjectMusic)
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
// (beyond the one about to start) that position's own pattern repeats before
// the sequence actually moves on (see musicSeqRepeatVarName). Only
// generated/read at all once music.hasRepeats is true. ONE shared table (not
// per-channel) - see musicSeqRepeatVarName's own comment for why the packed
// byte it stores doesn't need to vary by channel.
const musicSeqRepeatTableName = (songIndex) =>
  songIndex === undefined ? '_musicSeqRep' : `_musicSong${songIndex}SeqRep`;

// Prototype alternative to the per-song musicSeqTableName/
// musicSeqRepeatTableName split above, only used once
// music.combinedSeqTables is true (see resolveProjectMusic - gated on the
// combined table actually fitting in MAX_DATA_TABLE_VALUES). Every song's
// own sequenceStartPage/sequenceRepeatPacked array is concatenated back to
// back into ONE table (per channel, for Seq; project-wide, for SeqRep, same
// "not per-channel" reasoning as musicSeqRepeatTableName itself) instead of
// one small table per song - see musicSongSeqOffsetTableName for how a
// specific song's own slice within it is found. Collapses the O(songs)
// "if songIndexVar <> X then goto next" dispatch chain generateMusicChecks
// used to need at every page/repeat lookup down to a single indexed table
// read, at the cost of one small per-song offset table shared by both.
const musicCombinedSeqTableName = (channel) => `_musicCh${channel}SeqAll`;
const musicCombinedSeqRepeatTableName = () => '_musicSeqRepAll';
// One entry per song (in songIndex order) - that song's own start offset
// within EVERY combined table above (musicCombinedSeqTableName for each
// channel, and musicCombinedSeqRepeatTableName) - all built by concatenating
// the same per-song arrays in the same songIndex order, so one offset table
// locates a song's own slice in all of them at once. Read once per
// pattern-transition dispatch point (not once per song), then just added to
// seqPosVar to get the final index - see generateMusicChecks' own
// combinedSeqIndexLines.
const musicSongSeqOffsetTableName = () => '_musicSongSeqOffset';

// Name of the subroutine (see buildMusicPlayResetBody/RUN_ONCE_EDGE_RESET_NAME's
// own comment in bbasic.js for the identical reasoning) a "Play song" call
// gosubs into, instead of each inlining its own full copy of the per-channel
// reset - a project with more than one "Play song" block used to duplicate
// this whole block once per call site, which on an already content-heavy
// project was enough by itself to push bank space that had otherwise fit
// into overflowing (confirmed directly: a project that compiled fine with
// one "Play song" block failed with two, referencing the exact same song,
// content otherwise unchanged). Registered into Blockly.BBasic.subroutines
// by bbasic.js's init() (see its own RUN_ONCE_EDGE_RESET_NAME registration,
// right next to this one) so it's relocatable exactly like a user-defined
// subroutine, rather than only ever inline at each call site.
//
// Only used when the project references exactly ONE song (see
// registerMusicPlayResetSubroutine) - once there's more than one, EACH
// song needs its own dedicated reset (see musicPlaySongResetName below)
// since which song a "Play song" block starts is no longer always the same
// one, so there's nothing left to usefully share under one name.
export const MUSIC_PLAY_RESET_NAME = '_music_play_reset';

// Per-song equivalent of MUSIC_PLAY_RESET_NAME above, used once a project
// references more than one song - every included song gets its OWN reset
// subroutine (always, regardless of how many "Play song" blocks target it),
// since a shared name no longer makes sense when different call sites can
// target different songs.
export const musicPlaySongResetName = (songIndex) => `_music_play_song${songIndex}_reset`;

// Subroutine "Play song by ID" (see blocks/music.js) gosubs into once a
// project has more than one song - an if-chain comparing the runtime ID
// (written into musicPlayByIdArgVarName's own scratch var by the call site,
// since bB subroutines don't take parameters) against each included song's
// own literal storage ID, gosub-ing into that song's own
// musicPlaySongResetName subroutine (reusing it, not duplicating its body)
// and returning. No match silently falls through and returns - a no-op,
// rather than erroring, the same leniency subroutine_call's own stale-value
// fallback already uses elsewhere.
export const MUSIC_PLAY_BY_ID_NAME = '_music_play_by_id';
export const musicPlayByIdArgVarName = () => '_musicPlayByIdArg';
// Which song is currently active (that song's own 0-based songIndex, see
// resolveProjectMusic) - set by every song's own reset subroutine. Only
// read back at the (relatively rare) moment a channel's sequence position
// advances, to pick which song's own Seq table (see musicSeqTableName) to
// consult - see generateMusicChecks' own seqTableLookup comment.
export const musicSongIndexVarName = () => '_musicSongIndex';
// Snapshots musicSongIndexVarName's own value at the exact moment a song
// naturally finishes (see generateMusicChecks' own finishCheck, right
// alongside where it sets musicJustStoppedBit) - lets music_song_stopped_by_
// id/_by_number (see their own generators below) tell WHICH song just
// stopped apart from "a song, some song, stopped", without needing a
// dedicated pooled bit per watched song the way music_sequence_chip_
// finished_by_id does (that system exists because MULTIPLE chip-finished
// watches can be genuinely simultaneous/overlapping; only one song is ever
// playing - and so ever stopping - at a time, so one shared "which song"
// byte is enough. Stays correctly matched to musicJustStoppedBit even if
// left unconsumed for a while - see the two "by" blocks' own comments - a
// later real stop always overwrites both together. Only reserved once the
// project actually has a music_song_stopped_by_id/_by_number block AND more
// than one song (see usesFilteredSongStopped/multiSong in
// reserveMusicDevVars) - a single-song project has nothing to distinguish.
export const musicJustStoppedSongVarName = () => '_musicJustStoppedSong';
// Current song's own sequence.length - replaces the literal constant the
// single-song version of generateMusicChecks' wrap check still uses
// directly, since that number now varies by whichever song is playing. Set
// by every song's own reset subroutine.
export const musicSeqLenVarName = () => '_musicSeqLen';

// Builds a song's own reset subroutine body: resets every channel THAT SONG
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
  const flagsVar = resolveVar(musicFlagsVarName());
  // song.totalSteps (real repeats included) is what actually determines
  // whether any position-tracking is needed at all - song.sequenceLength
  // alone (now a GROUP count, see resolveProjectMusic) would wrongly skip
  // it for a song with only one group that still repeats several times.
  const multiSeq = song.totalSteps > 1;
  return Object.entries(music.channelPages).map(([channel, pages]) => {
    const pageReset = pages.length > 1 ? `${resolveVar(musicPageVarName(channel))} = 0\n` : '';
    const seqReset = multiSeq ? `${resolveVar(musicSeqPosVarName(channel))} = 0\n` : '';
    // The first group's own repeat count, already packed for both channels
    // (see resolveProjectMusic's own sequenceRepeatPacked) - a plain full
    // overwrite, not a masked per-nibble update, since this is a fresh
    // reset (nothing worth preserving from whatever the shared byte held
    // before).
    const seqRepeatReset = multiSeq && music.hasRepeats ?
      `${resolveVar(musicSeqRepeatVarName())} = ${song.sequenceRepeatPacked[0] || 0}\n` : '';
    // Phase 0, counter 1 packed into one byte (see musicArpCounterPhaseVarName's
    // own comment - counter in the low nibble) - a plain "= 1" already leaves
    // the high (phase) nibble zeroed too, same as the old two-statement
    // version did.
    const arpReset = music.channelHasArpeggio[channel] ?
      `${resolveVar(musicArpCounterPhaseVarName(channel))} = 1\n` :
      '';
    return `${resolveVar(musicIndexVarName(channel))} = 0\n${pageReset}${seqReset}${seqRepeatReset}${arpReset}` +
      `${resolveVar(musicTimerVarName(channel))} = 1\n` +
      `${flagsVar}{${musicChannelActiveBit(channel)}} = 1\n`;
  }).join('');
};

// Multi-song version of buildMusicPlayResetBody above - see its own comment
// for why every channel the project uses (not just this song's own) needs
// visiting here, and why pageVar/seqPos are reset unconditionally (this
// song's own start page in the combined per-channel table is rarely 0 once
// an earlier song's pages already occupy the front of it, unlike the
// single-song case where it always was) rather than only when "needed" the
// way the single-song version still optimizes for.
const buildMusicPlaySongResetBody = (Blockly, song, music) => {
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const flagsVar = resolveVar(musicFlagsVarName());
  const lines = music.channels.map((channel) => {
    if (!song.channelsUsed.has(Number(channel))) {
      return `${flagsVar}{${musicChannelActiveBit(channel)}} = 0\n`;
    }
    // Phase 0, counter 1 packed into one byte - see buildMusicPlayResetBody's
    // own identical line.
    const arpReset = music.channelHasArpeggio[channel] ?
      `${resolveVar(musicArpCounterPhaseVarName(channel))} = 1\n` :
      '';
    // Already packed for both channels (see resolveProjectMusic's own
    // sequenceRepeatPacked) - a plain full overwrite, not a masked
    // per-nibble update, same reasoning as buildMusicPlayResetBody's own
    // identical line.
    const seqRepeatReset = music.hasRepeats ?
      `${resolveVar(musicSeqRepeatVarName())} = ${song.sequenceRepeatPacked[0] || 0}\n` : '';
    // pageVar only actually exists (see generateMusicChecks' own comment)
    // once this channel's own combined data spans more than one page -
    // writing to it otherwise would reference a dev var that was never
    // reserved at all.
    const pageReset = music.channelPages[channel].length > 1 ?
      `${resolveVar(musicPageVarName(channel))} = ${song.channelStartPage[channel]}\n` : '';
    return `${resolveVar(musicIndexVarName(channel))} = 0\n` +
      pageReset +
      `${resolveVar(musicSeqPosVarName(channel))} = 0\n` +
      seqRepeatReset +
      arpReset +
      `${resolveVar(musicTimerVarName(channel))} = 1\n` +
      `${flagsVar}{${musicChannelActiveBit(channel)}} = 1\n`;
  }).join('');
  return `${resolveVar(musicSongIndexVarName())} = ${song.songIndex}\n` +
    `${resolveVar(musicSeqLenVarName())} = ${Math.max(1, song.sequenceLength)}\n` +
    lines;
};

// Builds MUSIC_PLAY_BY_ID_NAME's own if-chain body (see its own comment).
// getSubroutineBank (not getCurrentBank) is used for the "from" bank here
// since this body is built directly from bbasic.js's init(), not walked via
// a block's own generator (which is what normally keeps currentEventName -
// and so getCurrentBank - accurate) - MUSIC_PLAY_BY_ID_NAME's own resolved
// bank IS this code's own bank, known directly without it.
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
// above - mirrors RUN_ONCE_EDGE_RESET_NAME's own registration (see its
// comment) for why this happens in init() rather than left until this
// block's own generator runs: getSubroutineBank/generateRelocatedSections
// need every subroutine name known up front, same as any user-defined one.
//
// singleSongShared (see musicPlayResetShared in bbasic.js's init()) only
// matters for the ONE-song case below: whether MUSIC_PLAY_RESET_NAME is
// worth registering at all depends on how many "Play song" call sites
// target that one song (a single call site is cheaper left inline - see
// buildMusicPlayResetBody's own comment). The 2+-song case is unconditional
// - always registered once there's more than one song to choose between,
// regardless of how many call sites exist, since "Play song by ID" alone
// (even a single call site) can still need to dispatch among every song in
// storage (see resolveProjectMusic's own usesSongById comment).
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
// The old single-stage Fade's own runtime lookup tables/dispatch code
// (previously here) were removed along with the rest of its code
// generation - see generateMusicChecks' own comment on its ADSR Envelope
// successor. Still fully implemented in git history.

// Every channel actually used by at least one note anywhere in the song -
// only those need a data table + dev vars; an unused channel costs nothing.
export const musicChannelsUsedBySong = (song) => {
  const channels = new Set();
  (song.patterns || []).forEach((pattern) => {
    (pattern.tracks || []).forEach((track) => {
      if ((track.notes || []).length) channels.add(Number(track.channel) || 0);
    });
  });
  return channels;
};

// Flattens ONE pattern into an absolute-frame-timed event list per channel:
// {audv, audc, audf, frames}, including explicit {0,0,0,frames} rest/gap
// events so playback timing stays correct across silent stretches too.
// Mirrors utils/music-playback.js's own schedulePattern (identical
// tempo/step-to-seconds math) so ROM playback matches what the Music tab's
// own browser preview plays, just quantized to whole NTSC frames instead of
// continuous AudioContext seconds. Applies the Options tab's "Dim SFX
// volume" setting to every note's own AUDV, the same way soundfx_play does
// for one-shot sound effects (see soundfx.js) - so turning that on/off
// affects music playback consistently with everything else on the channel.
//
// Scoped to a single pattern (rather than a song's whole sequence, an
// earlier version of this) so resolveProjectMusic can encode each DISTINCT
// pattern's data exactly once, no matter how many times - or from how many
// different sequence positions - it's actually played (see its own comment).
// A pattern's own encoded data is therefore always the same regardless of
// where in a sequence it's referenced, which is exactly what makes reusing
// it safe.
const flattenPatternEvents = (song, pattern, channels, soundEffects, config = {}, notePlayedIndexById = new Map(),
    channelHasEnvelopeOverride = null) => {
  const perChannel = {};
  channels.forEach((channel) => {
    perChannel[channel] = [];
  });

  // A muted (or, with something else soloed, effectively-muted) track is
  // treated exactly like it was never placed at all - its own notes never
  // enter perChannel, the same as if the user had deleted them - so the
  // compiled ROM matches whatever the Music tab's own preview already
  // plays, instead of always baking in every track regardless of its
  // mute/solo state (see isMusicTrackMuted's own comment in
  // hooks/project.js, the single shared formula MusicEditor.vue's own
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
  // field matches exactly - each placed note is its own distinct attack the
  // user put on the piano roll, not a continuation of whatever happened to
  // precede it. Merging two adjacent same-pitch notes from the SAME
  // instrument used to collapse them into a single held note: harmless for
  // raw TIA audio (no discontinuity either way without an envelope), but it
  // silently dropped one of the two notes' own "note played" watch firings
  // (see resolveNotePlayedInstruments) and any timing a project's own logic
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
      arpeggioRange = 0, notePlayedIndex = 0, envelopeAttack = 0, envelopeDecay = 0, envelopeSustain = 0,
      envelopeRelease = 0) => {
    if (frames <= 0) return;
    const events = perChannel[channel];
    const prev = events[events.length - 1];
    if (prev && !(prev.audv > 0 && Number(audv) > 0) &&
      prev.audv === audv && prev.audc === audc && prev.audf === audf && prev.envelope === envelope &&
      prev.arpeggioSpeed === arpeggioSpeed && prev.arpeggioInterval === arpeggioInterval &&
      prev.arpeggioRange === arpeggioRange && prev.notePlayedIndex === notePlayedIndex &&
      prev.envelopeAttack === envelopeAttack && prev.envelopeDecay === envelopeDecay &&
      prev.envelopeSustain === envelopeSustain && prev.envelopeRelease === envelopeRelease) {
      prev.frames += frames;
    } else {
      events.push({audv, audc, audf, frames, envelope, arpeggioSpeed, arpeggioInterval, arpeggioRange,
        notePlayedIndex, envelopeAttack, envelopeDecay, envelopeSustain, envelopeRelease});
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
    const channel = Number(track.channel) || 0;
    if (!notesByChannel[channel]) return;
    if (isMusicTrackMuted(mutedTrackIds, soloedTrackIds, song, pattern, track)) return;
    const soundEffect = soundEffects.find(({id}) => `${id}` === `${track.soundEffectId}`);
    if (!soundEffect) return;
    // arpeggioDivision is tempo-relative (e.g. 8 = "flip every 1/8 step" -
    // see blocks/soundfx.js), converted here into this note's own actual
    // frame count using the framesPerUnit already computed above for this
    // pattern - so the flip rate follows whichever tempo (song or pattern)
    // is actually in effect where this note plays, instead of a fixed
    // frame count. Clamped to what the duration byte's nibble can hold.
    const arpeggioSpeed = soundEffect.arpeggio ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES,
        Math.round((framesPerUnit * LENGTH_UNITS_PER_STEP) /
          (Number(soundEffect.arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)))) : 0;
    const arpeggioInterval = soundEffect.arpeggio ? Number(soundEffect.arpeggioInterval) || 0 : 0;
    const arpeggioRange = soundEffect.arpeggio ? Number(soundEffect.arpeggioRange) || 0 : 0;
    // Whether a note plays as a real chosen pitch or the instrument's own
    // fixed hit-audf is decided from the instrument's CURRENT Sound type
    // (audc), not from whatever was true when the note was placed
    // (note.midi) - notes never store sound-type-dependent data of their
    // own, they always follow the instrument's live settings, even if
    // those change after the note was placed.
    const isTunable = audcHasTunableNotes(soundEffect.audc);
    // 0 (the "no watched instrument" sentinel - see
    // resolveNotePlayedInstruments) for an instrument nothing actually
    // watches; same value every note on this track packs into its own AUDV
    // byte's spare nibble either way, computed once per track since it
    // depends only on the instrument, never on the individual note.
    const notePlayedIndex = notePlayedIndexById.get(`${soundEffect.id}`) || 0;
    (track.notes || []).forEach((note) => {
      const audf = !isTunable || note.midi === 'hit' ? soundEffect.audf : note.audf;
      // Per-note override (see the Music tab's own piano-roll volume row),
      // falling back to the instrument's own preset - same DIM-scaling as
      // before, just applied to whichever value is actually in effect for
      // THIS note (an earlier version of this computed audv once per
      // TRACK, applying the exact same value to every note on it).
      // App-wide preference (see useDimSoundFxStorage's own comment in
      // hooks/project.js), not part of this project's own saved
      // configuration.
      const audv = useDimSoundFxStorage().value ?
        dimVolume(noteAudv(note, soundEffect), useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value) :
        noteAudv(note, soundEffect);
      notesByChannel[channel].push({
        startUnits: note.step,
        lengthUnits: note.length,
        audv,
        audc: soundEffect.audc,
        audf,
        envelope: !!soundEffect.envelope,
        envelopeAttack: soundEffect.envelopeAttack,
        envelopeDecay: soundEffect.envelopeDecay,
        envelopeSustain: soundEffect.envelopeSustain,
        envelopeRelease: soundEffect.envelopeRelease,
        arpeggioSpeed,
        arpeggioInterval,
        arpeggioRange,
        notePlayedIndex,
      });
    });
  });

  channels.forEach((channel) => {
    const notes = notesByChannel[channel].slice().sort((a, b) => a.startUnits - b.startUnits);
    let cursorFrames = 0;

    notes.forEach((note) => {
      const startFrames = Math.round(note.startUnits * framesPerUnit);
      const lengthFrames = Math.max(1, Math.round(note.lengthUnits * framesPerUnit));
      if (startFrames > cursorFrames) {
        pushEvent(channel, 0, 0, 0, startFrames - cursorFrames);
        cursorFrames = startFrames;
      }
      // The envelope's own numeric shape (attack/decay/sustain/release)
      // travels through as plain compile-time fields here - never written
      // to the byte stream directly (see eventsToPages' own comment on why
      // a 4th envelopeConfigIndex byte was tried and reverted), only used
      // there to register this shape (scoped to this event's own length and
      // peak volume) into the shared envelope-config pool and emit an
      // ENVELOPE_CHANGE_SENTINEL marker when it actually changes.
      pushEvent(channel, note.audv, note.audc, note.audf, lengthFrames, note.envelope, note.arpeggioSpeed,
          note.arpeggioInterval, note.arpeggioRange, note.notePlayedIndex, note.envelopeAttack, note.envelopeDecay,
          note.envelopeSustain, note.envelopeRelease);
      cursorFrames += lengthFrames;
    });

    // Fill any remaining silence to the end of THIS pattern, even a channel
    // with no notes in it at all - every pattern a channel is silent in
    // still needs its own (all-rest) data, so every channel's data for a
    // given sequence position always spans the exact same number of frames,
    // keeping every channel in lockstep at each pattern boundary regardless
    // of which channels actually have notes in which patterns.
    if (patternTotalFrames > cursorFrames) {
      pushEvent(channel, 0, 0, 0, patternTotalFrames - cursorFrames);
      cursorFrames = patternTotalFrames;
    }
  });

  // A duration byte can only hold so many bits of actual frame count - fewer
  // the more flags/fields it also has to carry (see MAX_EVENT_FRAMES_WITH_*)
  // - expand each (now fully merged) event into consecutive max-length
  // events, done as this one final pass so a long merged run gets the fewest
  // possible chunks. Only the LAST chunk of a note that got split keeps the
  // envelope flag - a long held note split into several chunks should only
  // apply its envelope once, right before it actually ends, not at every
  // chunk boundary. Arpeggio speed/interval/range, unlike envelope, carry
  // through every chunk unchanged - they describe the whole note, not just
  // its tail.
  const chunked = {};
  Object.entries(perChannel).forEach(([channel, events]) => {
    // Reader side (generateMusicChecks) masks off the duration byte's bit 7
    // based on channelHasEnvelope[channel] - OR'd across EVERY pattern on
    // this channel (see resolveProjectMusic, ~line 1381), not just this one
    // pattern. Chunking here MUST cap to the same MAX_EVENT_FRAMES_WITH_ENVELOPE
    // limit whenever the reader will apply that mask, even if THIS pattern
    // alone has no enveloped notes - otherwise a long rest/note in an
    // envelope-free pattern can write a duration byte with bit 7 legitimately
    // part of the frame count, which the reader then silently strips,
    // truncating that note's duration by up to 128 frames and desyncing this
    // channel's timing (reported as "missing notes"). channelHasEnvelopeOverride
    // is null only when this function is called before that global flag is
    // known yet (see the pre-pass in resolveProjectMusic that computes it) -
    // in that case falling back to this pattern's own local scope is safe,
    // since that pre-pass only cares whether ANY event.envelope is true, which
    // chunking preserves regardless of maxFrames.
    const hasEnvelope = channelHasEnvelopeOverride ? channelHasEnvelopeOverride[channel] :
      events.some((event) => event.envelope);
    chunked[channel] = [];
    events.forEach(({audv, audc, audf, frames, envelope, arpeggioSpeed, arpeggioInterval, arpeggioRange,
      notePlayedIndex, envelopeAttack, envelopeDecay, envelopeSustain, envelopeRelease}) => {
      // Only THIS event's own arpeggio use caps it to 15 frames - a rest or
      // non-arpeggiating note on the same channel isn't dragged down to that
      // cap too (see generateMusicChecks' durationRead, which branches on
      // this same event's arpSpeedVar - already known by the time duration
      // is read - to decide how many bits its own duration byte carries).
      const maxFrames = arpeggioSpeed > 0 ? MAX_EVENT_FRAMES_WITH_ARPEGGIO :
        (hasEnvelope ? MAX_EVENT_FRAMES_WITH_ENVELOPE : MAX_EVENT_FRAMES_NO_ENVELOPE);
      let remaining = frames;
      while (remaining > 0) {
        const chunkFrames = Math.min(remaining, maxFrames);
        remaining -= chunkFrames;
        // notePlayedIndex carries through every chunk unchanged, same as
        // arpeggio's own fields - a "note played" watch on an instrument
        // whose own note is long enough to split into several chunks (past
        // MAX_EVENT_FRAMES_NO_ENVELOPE/_WITH_ENVELOPE/_WITH_ARPEGGIO) fires
        // once per CHUNK, not once for the whole held note, since each chunk
        // is its own independently-fetched event at runtime with no concept
        // of "this is a continuation" - an accepted rare-case quirk rather
        // than spending another bit tracking it.
        const isFinalChunk = remaining === 0;
        chunked[channel].push({
          audv, audc, audf, frames: chunkFrames, envelope: envelope && isFinalChunk,
          arpeggioSpeed, arpeggioInterval, arpeggioRange, notePlayedIndex,
          envelopeAttack: isFinalChunk ? envelopeAttack : 0,
          envelopeDecay: isFinalChunk ? envelopeDecay : 0,
          envelopeSustain: isFinalChunk ? envelopeSustain : 0,
          envelopeRelease: isFinalChunk ? envelopeRelease : 0,
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

// Converts one channel's event list into the raw byte pages for its data
// tables: 3 bytes/event - AUDV, AUDF, duration-in-frames - plus a 4th on a
// channel that has ANY enveloped note anywhere (see hasEnvelope below),
// since the other three are already fully packed with nothing left to spare
// for a per-note envelope-config reference. AUDC is NOT part of the regular
// record at all any more (see the INSTRUMENT_CHANGE_SENTINEL marker below for where it
// actually lives now) - it doesn't vary per note in the first place (it
// comes straight from the note's own track/instrument, never the note
// itself), so repeating it in every single record was pure waste: a real
// project's own music engine payload measured over 4x the size of its data
// tables combined, entirely from this kind of per-note duplication of
// values that don't actually change per note.
//
// Two of the 3 always-present bytes still carry a little more than their
// own hardware register needs, in spare bits the TIA never reads, at zero
// extra cost per event:
// - Duration bit 7: this note has an envelope (see ENVELOPE_BIT/generateMusicChecks).
// - Duration bits 6-4: arpeggio range/shape, an index into
//   ARPEGGIO_PHASE_SEQUENCES (0 when not arpeggiating - harmless, since
//   arpeggioSpeed 0 already means the reader ignores this note's arpeggio
//   fields entirely).
// - AUDF bits 7-5 (hardware only reads 4-0): arpeggio interval, the fixed
//   AUDF bump to the "other" pitch.
// - AUDV bits 7-4 (hardware only reads 3-0): this note's own "note played"
//   watch index (see resolveNotePlayedInstruments) - 0 means no instrument
//   playing this note is currently watched. Capped at 14, not the full
//   nibble's 15, specifically so this byte can never reach 253/254/255 (see
//   MAX_WATCHED_NOTE_PLAYED_INSTRUMENTS's own comment) and collide with
//   INSTRUMENT_CHANGE_SENTINEL/PAGE_BREAK_SENTINEL/LOOP_SENTINEL below.
// There is no 4th byte: every record is a fixed 3 bytes regardless of
// envelope use (see eventsToPages' own comment on why a config-index 4th
// byte was tried and reverted). Only the ENVELOPE_BIT flag survives - the
// runtime doesn't yet apply an envelope shape to music notes at all, it
// just knows a note WAS authored with one on. arpeggioSpeed itself (0
// meaning "not arpeggiating") is folded into the instrument byte a marker
// carries - see below - exactly like AUDC, since it's the same kind of
// per-track constant, never per-note.
//
// getInstrumentIndex (see resolveProjectMusic's own build pass, ALWAYS
// called first, project-wide, before this function ever runs for any
// channel - see its own comment on why that ordering matters) resolves an
// AUDC|arpeggioSpeed<<4 byte to its stable index in the shared instrument
// table. Whenever an AUDIBLE event's (audv > 0 - see the same reasoning in
// that build pass) own instrument differs from the last one THIS pass
// itself wrote, a 2-byte marker (INSTRUMENT_CHANGE_SENTINEL, index) is
// inserted right before it. Reset per pattern (lastInstrument starts null
// on every call, never carried in from a caller) rather than tracked
// globally across patterns - a pattern can be reached from many different
// points in a song's own sequence (see resolveProjectMusic/
// generateMusicChecks' own sequenceStartPage), so assuming continuity from
// "whatever pattern happened to be encoded right before this one" would be
// wrong the instant actual playback order differs from encoding order.
// Every pattern's own first audible note is therefore always preceded by
// an explicit marker, guaranteeing correct playback no matter which
// sequence position jumps straight to it.
//
// A single "data" table can only hold MAX_DATA_TABLE_VALUES bytes, so
// events (and now markers) are split across multiple pages/tables as
// needed - never splitting a single item's own bytes across a page
// boundary, since the reader always reads one whole item at a time. Every
// page but the last is terminated by PAGE_BREAK_SENTINEL alone (advance to
// the next page and keep reading); the last page is terminated by
// LOOP_SENTINEL alone (loop back to page 0) - neither is padded out to a
// full record, the reader checks for them before trying to read the rest
// of an item (see generateMusicChecks below).
const eventsToPages = (events, getInstrumentIndex) => {
  // Fixed 3 bytes/event, regardless of envelope use - a 4th byte (this
  // note's own envelopeConfigIndex) was tried here and reverted: NOTHING in
  // the runtime reader below (durationReadPlain/durationRead/audfRead/etc.)
  // ever accounts for a variable record size - every read advances indexVar
  // by exactly 1 per byte it ITSELF reads, with no conditional extra skip
  // for a 4th byte. Emitting one anyway (gated on hasEnvelope, the same
  // shape the old Fade feature originally used) silently desynced every
  // read after the first enveloped event on that channel - confirmed
  // directly as real, audible pitch/timing corruption once a project
  // actually had a music instrument with its envelope on (the OLD Fade
  // feature had this exact same latent bug, just never exercised, since it
  // was permanently forced off - see blocks/soundfx.js's own git history).
  // The ENVELOPE_BIT flag alone is still safe to keep (see below) - it
  // costs no extra byte, just repurposes a spare bit already in the
  // duration byte - only the config-INDEX needed its own byte, which is
  // what actually broke this. Re-add a 4th byte only alongside whatever
  // future work actually reads it back at runtime, updating every affected
  // read site in the same change.
  const MARKER_SIZE = 2;

  const items = [];
  let lastInstrumentByte = null;
  // NO_ENVELOPE_SENTINEL (never a real config index) as the initial value
  // guarantees this pattern's own FIRST event always gets an explicit
  // envelope marker, same reasoning as lastInstrumentByte's own null start:
  // a pattern can be reached from many different sequence positions (see
  // the instrument-marker comment above), so nothing here can assume what
  // envelopeConfig was left holding by whatever played immediately before
  // it. Tracked for EVERY event, not just audible ones (unlike the
  // instrument marker, which only matters for AUDC/arpeggio - irrelevant
  // during a rest): a stale envelopeConfig/envelopeStage{channel} left
  // pointing at a previous note's config would otherwise keep being read by
  // the per-frame check (generateEnvelopeChecks in soundfx.js) all through
  // a following rest or non-enveloped note, spuriously writing to AUDV.
  let lastEnvelopeSelector = NO_ENVELOPE_SENTINEL;
  events.forEach((event) => {
    const {audv, audc, arpeggioSpeed, frames, envelope, envelopeAttack, envelopeDecay, envelopeSustain,
      envelopeRelease} = event;
    if (Number(audv) > 0) {
      const instrumentByte = Number(audc) | (arpeggioSpeed << 4);
      if (instrumentByte !== lastInstrumentByte) {
        items.push({marker: true, instrument: true, index: getInstrumentIndex(instrumentByte)});
        lastInstrumentByte = instrumentByte;
      }
    }
    const envelopeSelector = envelope ? registerEnvelopeConfig({
      ...clampEnvelopeStages({attack: envelopeAttack, decay: envelopeDecay, release: envelopeRelease,
        totalFrames: frames}),
      sustainPercent: envelopeSustain, peakVolume: Number(audv),
    }) : NO_ENVELOPE_SENTINEL;
    if (envelopeSelector !== lastEnvelopeSelector) {
      items.push({marker: true, instrument: false, index: envelopeSelector});
      lastEnvelopeSelector = envelopeSelector;
    }
    items.push({marker: false, event});
  });

  const RECORD_SIZE = 3;
  const pages = [];
  let current = [];
  let currentSize = 0;
  items.forEach((item) => {
    const size = item.marker ? MARKER_SIZE : RECORD_SIZE;
    // +size for the item about to be added, +1 reserved for this page's
    // own terminator byte.
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
      const {audv, audf, frames, envelope, arpeggioInterval, arpeggioRange, notePlayedIndex} = item.event;
      bytes.push(
          Number(audv) | ((notePlayedIndex || 0) << 4),
          Number(audf) | (arpeggioInterval << 5),
          frames | (envelope ? ENVELOPE_BIT : 0) | (arpeggioRange << ARPEGGIO_RANGE_BITS_SHIFT),
      );
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
// Each DISTINCT pattern any included song's own sequence references is
// flattened and paged exactly once (see flattenPatternEvents), no matter how
// many times - or from how many different positions, in how many different
// songs' own sequences - it's actually played; repeats are handled purely by
// a lookup, not by storing the same bytes again (see each song's own
// channelStartPage/sequenceStartPage below, and generateMusicChecks' own
// loop-reset comment). A second song's own distinct patterns are simply MORE
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
  // number's own dynamic SONG_ID - kept as its own flag (not folded into
  // usesSongById itself) since that one ALSO gates the actual "Play song by
  // ID" dispatch subroutine and its scratch arg var (see
  // registerMusicPlayResetSubroutine and musicPlayByIdArgVarName's own
  // reservation below), neither of which this purely-read-only check needs -
  // widening usesSongById itself would reserve both for a project that only
  // ever uses this block, never actually plays a song by dynamic ID.
  const usesSongPlayingByNumber = workspace.getAllBlocks(false)
      .some((block) => block.type === 'music_song_playing_by_number');
  const needsEverySong = usesSongById || usesSongPlayingByNumber;
  // Whether this project's own "When song has stopped playing" watches ever
  // need to filter by which specific song stopped (music_song_stopped_by_id/
  // _by_number), rather than firing for whichever song happens to stop -
  // gates musicJustStoppedSongVarName's own reservation below (see its own
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

  // A stale/unmatched dropdown value (see findSongById), or a song whose own
  // sequence is empty (nothing to ever actually play), is silently dropped
  // rather than compiled in as a dead entry.
  const resolvedSongs = songRefs
      .map((id) => ({id, song: findSongById(id)}))
      .filter(({song}) => song && (song.sequence || []).length > 0);
  if (!resolvedSongs.length) return null;

  // Union of every channel ANY included song actually uses - drives dev var
  // reservation for the whole project (see bbasic.js's init()), the same
  // resource a single song's own channels used to drive alone.
  const channels = new Set();
  resolvedSongs.forEach(({song}) => musicChannelsUsedBySong(song).forEach((channel) => channels.add(channel)));

  // Which channels each WATCHED instrument (see resolveNotePlayedInstruments)
  // is actually assigned to on any track, across every included song's every
  // pattern - lets generateMusicChecks skip a channel's own dispatch
  // entirely for an instrument that channel could never play (e.g. a
  // melody-only instrument never assigned to the drum channel), instead of
  // emitting - and running, on literally every note fetch - a comparison
  // against an index that channel will never see. Harmless if slightly
  // over-inclusive (an empty track still counts): this is a dispatch-size/
  // cycle optimization only, never a correctness requirement, since the
  // watch's own flag bit (see resolveMusicEventFlags' own notePlayed map)
  // only ever actually gets set when temp1's packed nibble genuinely
  // matches.
  const notePlayedChannelsById = new Map();
  if (notePlayedIndexById.size) {
    resolvedSongs.forEach(({song}) => {
      (song.patterns || []).forEach((pattern) => {
        (pattern.tracks || []).forEach((track) => {
          const id = `${track.soundEffectId}`;
          if (!notePlayedIndexById.has(id)) return;
          const channel = Number(track.channel) || 0;
          if (!notePlayedChannelsById.has(id)) notePlayedChannelsById.set(id, new Set());
          notePlayedChannelsById.get(id).add(channel);
        });
      });
    });
  }

  // Every distinct AUDC|arpeggioSpeed<<4 "instrument" byte actually used by
  // any AUDIBLE note (audv > 0 - a rest's own placeholder audc=0 would
  // otherwise falsely register as its own distinct "instrument") in any
  // pattern any included song's sequence actually references, deduplicated
  // project-wide (not per-channel/per-pattern) into one small shared lookup
  // table - see musicInstrumentTableName/generateMusicChecks' own
  // INSTRUMENT_CHANGE_SENTINEL handling for where this gets used. Assigned
  // index in first-seen order, walked here in its own pass (calling
  // flattenPatternEvents a second time - it's pure, so this is safe, just
  // some repeated compile-time work) SPECIFICALLY so every table index is
  // already known and stable before eventsToPages below ever needs to
  // reference one - a table built up lazily DURING that same pass could
  // assign a different index to the same instrument depending on which
  // channel or pattern happened to encode it first, silently corrupting
  // playback for whichever channel didn't "win" that race.
  const instrumentBytes = [];
  const instrumentIndexByByte = new Map();
  const getInstrumentIndex = (byte) => {
    if (instrumentIndexByByte.has(byte)) return instrumentIndexByByte.get(byte);
    const index = instrumentBytes.length;
    instrumentBytes.push(byte);
    instrumentIndexByByte.set(byte, index);
    return index;
  };
  resolvedSongs.forEach(({song}) => {
    const distinctPatternIds = [...new Set((song.sequence || []).map((group) => `${group.patternId}`))];
    distinctPatternIds.forEach((patternId) => {
      const pattern = (song.patterns || []).find(({id: pid}) => `${pid}` === patternId);
      if (!pattern) return;
      const perChannel = flattenPatternEvents(song, pattern, channels, soundEffects, config, notePlayedIndexById);
      Object.values(perChannel).forEach((events) => {
        events.forEach(({audv, audc, arpeggioSpeed}) => {
          if (Number(audv) > 0) getInstrumentIndex(Number(audc) | (arpeggioSpeed << 4));
        });
      });
    });
  });

  // Whether ANY pattern, from ANY included song, ever plays an enveloped
  // note on this channel - needed BEFORE the real encoding pass below runs
  // (not derived incrementally as it goes), because generateMusicChecks'
  // own duration-byte read (see its own hasEnvelope comment) masks off bit 7
  // per CHANNEL, project-wide, not per pattern. Passing this precomputed,
  // already-global flag into flattenPatternEvents (as channelHasEnvelopeOverride)
  // makes its own duration-byte chunking use the exact same scope the reader
  // will use - previously it recomputed a PATTERN-local hasEnvelope instead
  // (see flattenPatternEvents' own now-updated comment), so a channel mixing
  // one enveloped pattern with another, ordinary pattern could legitimately
  // write a long rest/note's duration byte with bit 7 set as part of the raw
  // frame count in the ordinary pattern, which the reader then silently
  // stripped 128 frames from - cutting that note/rest short and reported as
  // "missing notes", including on channels/notes that never enabled envelope
  // themselves at all. Computed the same way channelHasEnvelope itself is
  // (musicChannelHasEnvelope on flattenPatternEvents' own un-chunked-scope-
  // agnostic output - envelope presence survives chunking regardless of
  // maxFrames, see flattenPatternEvents' own isFinalChunk handling), just
  // run as its own pre-pass, mirroring instrumentBytes' pre-pass just above.
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

  const channelPages = {};
  const channelHasEnvelope = {};
  const channelHasArpeggio = {};
  // Parallel to channelPages[channel] - which song's own songId contributed
  // each page (patterns aren't shared across songs, so every page in the
  // combined array belongs to exactly one song, even once several songs'
  // own pages are concatenated together here). Purely for the Generated
  // Code tab's own "rem" labels on each data table (see songLabel/
  // generateMusicDataTables below) - nothing here reads it back at runtime.
  const channelPageSongIds = {};
  channels.forEach((channel) => {
    channelPages[channel] = [];
    channelHasEnvelope[channel] = false;
    channelHasArpeggio[channel] = false;
    channelPageSongIds[channel] = [];
  });

  const songs = resolvedSongs.map(({id, song}, songIndex) => {
    // song.sequence is already stored as {id, patternId, count} groups (see
    // DEFAULT_SONGS/normalizeSequenceGroups in blocks/music.js - a resized
    // Sequence chip repeating a pattern several times in a row is one group
    // with count > 1, not one entry per repeat) - kept as groups all the way
    // through to the compiled ROM's own runtime sequence table too now (see
    // sequenceStartPage/sequenceRepeatCount below and generateMusicChecks'
    // own repeat-count handling), rather than expanded back into one raw
    // entry per real repeat the way an earlier version of this function did:
    // storing one page byte plus one repeat-count byte per GROUP costs a
    // fixed 2 bytes regardless of how many times it repeats, instead of one
    // byte per actual repeat.
    const groups = (song.sequence || []).map((group) => ({
      patternId: group.patternId,
      // Capped at MAX_SEQ_REPEAT_COUNT (16), not 255 - see
      // musicSeqRepeatVarName's own comment on why the runtime repeat
      // counter is packed into a 4-bit nibble.
      count: Math.max(1, Math.min(MAX_SEQ_REPEAT_COUNT, Math.round(Number(group.count) || 1))),
    }));
    // Every DISTINCT pattern THIS song's sequence references, in the order
    // each is first seen - a Set (not sorted/deduped some other way) so
    // groups[0]'s own pattern always ends up first, which is what lets
    // channelStartPage below resolve without a separate lookup.
    const distinctPatternIds = [...new Set(groups.map(({patternId}) => `${patternId}`))];
    // patternStartPage[channel][patternId] = which page (an index into the
    // COMBINED channelPages array, spanning every included song) that
    // pattern's own data starts at - built up as each of THIS song's own
    // distinct patterns is paged below, then used for channelStartPage/
    // sequenceStartPage afterwards.
    const patternStartPage = {};
    channels.forEach((channel) => {
      patternStartPage[channel] = {};
    });

    distinctPatternIds.forEach((patternId) => {
      const pattern = (song.patterns || []).find(({id: pid}) => `${pid}` === patternId);
      if (!pattern) return;
      const perChannel = flattenPatternEvents(song, pattern, channels, soundEffects, config, notePlayedIndexById,
          channelHasEnvelopeGlobal);
      Object.entries(perChannel).forEach(([channel, events]) => {
        const pages = eventsToPages(events, getInstrumentIndex);
        patternStartPage[channel][patternId] = channelPages[channel].length;
        channelPages[channel].push(...pages);
        pages.forEach(() => channelPageSongIds[channel].push(id));
        if (musicChannelHasEnvelope(events)) channelHasEnvelope[channel] = true;
        if (musicChannelHasArpeggio(events)) channelHasArpeggio[channel] = true;
        if (channelPages[channel].length > MAX_MUSIC_PAGES) {
          throw new Error(`Combined music data needs ${channelPages[channel].length} data tables on ` +
            `channel ${channel} (summed across every song used for playback), but only ${MAX_MUSIC_PAGES} ` +
            'are supported per channel currently - try shorter/simpler songs, or fewer of them.');
        }
      });
    });

    // This song's own start page in the COMBINED per-channel table - still
    // always groups[0]'s own pattern, same as the single-song version of
    // this same comment, just no longer always page 0 once an earlier
    // song's own pages already occupy the front of that table.
    const channelStartPage = {};
    channels.forEach((channel) => {
      channelStartPage[channel] = patternStartPage[channel][`${groups[0] && groups[0].patternId}`] ?? 0;
    });

    // One lookup per GROUP (not per distinct pattern, and - now - not per
    // real repeat either) - several positions referencing the same pattern
    // all resolve to that one pattern's own (single) start page, which is
    // exactly how the same bytes end up read from more than one place in
    // the sequence without ever being stored more than once.
    const sequenceStartPage = {};
    channels.forEach((channel) => {
      sequenceStartPage[channel] = groups.map(({patternId}) => patternStartPage[channel][`${patternId}`] ?? 0);
    });
    // Parallel to sequenceStartPage above, same one-entry-per-group shape,
    // but ONE shared table (not per-channel) - how many total times that
    // group's own pattern plays before the sequence moves on (see
    // musicSeqRepeatVarName/generateMusicChecks), pre-packed into the SAME
    // nibble layout the runtime var itself uses (channel 0's own
    // repeats-remaining count in the low nibble, channel 1's in the high
    // nibble - both the SAME number, since a group's own repeat count
    // doesn't actually vary by channel, just stored redundantly in both
    // nibbles so each channel's own masked read/write never has to know or
    // care whether the other channel is even in use).
    const sequenceRepeatPacked = groups.map(({count}) => {
      const repeatsLeft = count - 1;
      return repeatsLeft + repeatsLeft * 16;
    });

    return {
      songId: id,
      songIndex,
      channelsUsed: musicChannelsUsedBySong(song),
      channelStartPage,
      sequenceStartPage,
      sequenceRepeatPacked,
      // Now the number of GROUPS (Sequence chips), not the number of real
      // repeats summed together - see generateMusicChecks' own multiSeq,
      // which needs the real repeat-inclusive total instead, computed
      // separately below as totalSteps.
      sequenceLength: groups.length,
      totalSteps: groups.reduce((sum, {count}) => sum + count, 0),
    };
  });

  // Prototype: one cumulative offset per song (songSeqOffset[i] = sum of
  // every earlier song's own sequenceLength) - where that song's own slice
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
  // single "data" block's own MAX_DATA_TABLE_VALUES limit - a project with
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
    usesSongById,
    usesFilteredSongStopped,
    songSeqOffset,
    combinedSeqTables,
    notePlayedChannelsById,
    // The shared instrument lookup table (see its own build pass above) -
    // one AUDC|arpeggioSpeed<<4 byte per distinct instrument actually used,
    // in stable index order. Empty (never emitted as a real "data" table -
    // see generateMusicDataTables) for a project with no audible notes at
    // all.
    instrumentBytes,
    // True as soon as ANY included song has ANY group repeating more than
    // once - gates whether musicSeqRepeatVarName/musicSeqRepeatTableName are
    // reserved/generated at all (see bbasic.js's dev-var reservation and
    // generateMusicChecks/generateMusicDataTables below), so a project with
    // no repeated patterns pays nothing extra for this feature.
    hasRepeats: songs.some((song) => song.sequenceRepeatPacked.some((packed) => packed > 0)),
  };
};

// Reserves every dev var the music player's own generated code (see
// generateMusicChecks below) actually needs, called once from bbasic.js's
// own init() - moved here (rather than left inline there) so every "does
// this project actually need this specific var" decision lives right next
// to the rest of this file's own music-generation logic instead of split
// across two files. Pure bookkeeping, no runtime behavior change from
// however bbasic.js called this same sequence of reserveDevVar calls
// before this was extracted.
//
// reserveDevVar itself stays a callback (not imported) since it closes over
// bbasic.js's own nameDB_/routeDevVar state, which this file has no access
// to and shouldn't need to.
// @param {function(string): string} reserveDevVar
// @param {?Object} music this.projectMusic - a no-op if null (nothing here
//     is worth reserving without real music to play).
// @param {{general: ?Object, pairs: Map, byChipId: Map, notePlayed: Map}} musicEventFlags
//     this.musicEventFlags (see resolveMusicEventFlags).
export const reserveMusicDevVars = (reserveDevVar, music, musicEventFlags) => {
  if (!music) return;
  const multiSong = music.songs.length > 1;
  // totalSteps (real repeats included), not sequenceLength (now a GROUP
  // count - see resolveProjectMusic above) - see buildMusicPlayResetBody's
  // own comment for why those two differ.
  const multiSeq = multiSong || music.songs[0].totalSteps > 1;
  for (const channel of Object.keys(music.channelPages)) {
    reserveDevVar(musicIndexVarName(channel), undefined, 'this channel\'s own position within its current pattern');
    reserveDevVar(musicTimerVarName(channel), undefined, 'this channel\'s own frames-left-on-current-note countdown');
    // Only reserved once this channel actually plays some real (audible)
    // note - a channel with nothing but rests, or no data at all, never
    // hits an INSTRUMENT_CHANGE_SENTINEL marker and so never needs this
    // (see musicLastAudcVarName's own comment).
    if (music.instrumentBytes.length) {
      reserveDevVar(musicLastAudcVarName(channel), undefined, 'this channel\'s own last-played AUDC value');
    }
    // Only reserved for a channel with at least one arpeggiating note (see
    // musicChannelHasArpeggio/channelHasArpeggio) - per-channel gated so a
    // project that never touches arpeggio anywhere pays nothing extra for
    // it, same reasoning as musicLastAudcVarName just above.
    if (music.channelHasArpeggio[channel]) {
      reserveDevVar(musicArpSpeedRangeVarName(channel), undefined, 'this channel\'s arpeggio: speed/range packed byte');
      reserveDevVar(musicArpCounterPhaseVarName(channel), undefined,
          'this channel\'s arpeggio: frame countdown/cycle position packed byte');
      reserveDevVar(musicArpBaseIntervalVarName(channel), undefined, 'this channel\'s arpeggio: base note\'s own pitch');
    }
    // Only reserved when this channel's own combined data spans more than
    // one page - see generateMusicChecks' own comment on pageVar for why a
    // single-page channel has no use for it at all, even once the song has
    // more than one sequence position (confirmed directly as a real, pure
    // waste in an earlier version of this: a whole dev var reserved and
    // written to on every pattern transition for a value nothing
    // downstream ever read back).
    if (music.channelPages[channel].length > 1) {
      reserveDevVar(musicPageVarName(channel), undefined, 'this channel\'s own current data-table page');
    }
    if (multiSeq) {
      reserveDevVar(musicSeqPosVarName(channel), undefined, 'this channel\'s own position within the song sequence');
    }
  }
  // Only reserved once the project actually has a repeated pattern
  // somewhere (see musicSeqRepeatVarName's own comment) - a project with
  // none pays nothing extra for this feature. ONE shared var for every
  // channel (not per-channel - see musicSeqRepeatVarName's own comment on
  // the packed-nibble layout), reserved once here regardless of how many
  // channels the project actually uses.
  if (multiSeq && music.hasRepeats) {
    reserveDevVar(musicSeqRepeatVarName(), undefined, 'shared packed-nibble repeat counters, all channels');
  }
  // One shared byte for playing/loop/justStopped plus every channel's own
  // active flag (see musicFlagsVarName's comment) - used to cost 3 vars
  // plus 1 more per channel on its own.
  reserveDevVar(musicFlagsVarName(), undefined, 'shared playing/loop/stopped/per-channel-active bit-flags byte');
  // Only reserved once this project's own music event watches (sequence-
  // chip-finished AND note-played-by-instrument, sharing one pool - see
  // resolveMusicEventFlags' own comment) actually need it beyond
  // musicFlagsVarName's own 2 free spare bits - exactly as many overflow
  // bytes as musicEventFlags.overflowByteCount says, no more.
  for (let i = 0; i < musicEventFlags.overflowByteCount; i++) {
    reserveDevVar(musicEventFlagsOverflowVarName(i), undefined, 'extra music-event watch bits, once musicFlagsVarName\'s own spares run out');
  }
  // Only needed once the project references more than one song (see
  // musicSongIndexVarName/musicSeqLenVarName's own comments) - a
  // single-song project keeps using a literal constant instead, same as it
  // always has, zero extra dev-var cost.
  if (multiSong) {
    reserveDevVar(musicSongIndexVarName(), undefined, 'which song is currently selected');
    reserveDevVar(musicSeqLenVarName(), undefined, 'that song\'s own sequence length');
    // Only "Play song by ID" actually reads/writes this scratch var (see
    // its own comment) - no need to reserve it for a project that only
    // ever uses the fixed-dropdown "Play song" block.
    if (music.usesSongById) {
      reserveDevVar(musicPlayByIdArgVarName(), undefined, '"Play song by ID" own runtime song-id argument');
    }
    // Only "When song [name]/[id] has stopped playing" actually reads/writes
    // this - the plain "When song has stopped playing" (no song specified)
    // never needs to know WHICH song stopped, so a project using only that
    // one pays nothing extra for it.
    if (music.usesFilteredSongStopped) {
      reserveDevVar(musicJustStoppedSongVarName(), undefined,
          'which song (its own songIndex) most recently stopped, for the "by id"/"by number" song-stopped watches');
    }
  }
};

export default (Blockly) => {
  // A dev-var canonical name only becomes an actual bBasic letter once
  // nameDB_.getName() resolves it - reserved once in bbasic.js's own
  // pre-scan (before letters are handed out), then re-resolved here at every
  // call site, exactly like collisionMoveOldXVar/canonicalDistanceVarName.
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

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
      // (see music_play_song_by_id's own comment in blocks/music.js for why
      // its SONG_ID isn't even read in this case). The per-channel reset is
      // shared as its own subroutine (see MUSIC_PLAY_RESET_NAME) once the
      // project has more than one "Play song" call site targeting this one
      // song - a single call site is cheaper left plain inline, since a
      // real subroutine call costs its own "gosub"/"return" overhead the
      // shared copy doesn't recoup until a second site exists to share it
      // with.
      resetCode = Blockly.BBasic.subroutines[MUSIC_PLAY_RESET_NAME] ?
        `gosub ${MUSIC_PLAY_RESET_NAME}${Blockly.BBasic.bankJumpSuffix(
            Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(MUSIC_PLAY_RESET_NAME))}\n` :
        buildMusicPlayResetBody(Blockly, music.songs[0], music);
    } else if (block.type === 'music_play_song_by_id') {
      // A genuine runtime value (see its own comment in blocks/music.js) -
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
      // known at compile time, so it gosubs straight into that song's own
      // reset subroutine, no runtime dispatch needed. Falls back to the
      // first included song if the dropdown's own value doesn't match any
      // (a stale/unsnapped value - see subroutine_call's own identical
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
  // alone (see musicFlagsVarName's own comment) can't answer that on its
  // own once a project has more than one song, since it just means "some
  // song is playing," not which one. On a single-song project there's only
  // ever one possible song for it to mean, so this is just musicPlayingBit
  // directly - same "nothing to distinguish" shortcut music_song_stopped_by_
  // id's own generator already takes. Otherwise ANDed with a comparison
  // against musicSongIndexVarName - set by every song's own reset
  // subroutine (see its own comment) and left untouched by Stop/Pause, so it
  // still correctly names the last song actually played even after that
  // song stops (musicPlayingBit alone rules that stale case out). A stale
  // dropdown (song deleted, or never actually included - e.g. only ever
  // referenced here, never by an actual "Play song" block) has no runtime
  // songIndex to compare against at all, so it permanently reads false,
  // same leniency generateMusicEventCheck's own "target is null" case uses
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
  // CURRENTLY LOADED, compares THAT song's own real id against the runtime
  // value.
  //
  // Unlike music_song_stopped_by_number (an event-watch STATEMENT, free to
  // "goto" straight into an if-chain), this is a plain VALUE block - a
  // value block can't inject a preceding "goto" of its own (same
  // constraint data_get_bit_by_id's own dynamic path hits, see its comment
  // in generators/bbasic/data.js), so the dispatch instead builds its
  // result into a var across several ordinary "if...then" lines, newline-
  // joined ahead of that var's own name as the real value - same preamble
  // convention background_get_pixel/data_get_bit_by_id already use, which
  // controls_if already knows how to hoist in front of an "if". Reuses
  // functionCallDiscardVarName's own scratch var (see musicSongPlayingByNumberUsed's
  // own comment in generators/bbasic.js) rather than a dedicated one - same
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
    // (generators/bbasic.js's own init()) - every occurrence below except
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
    // Also clears paused - same reasoning as generatePlaySong's own reset:
    // a later Play shouldn't inherit a stale paused state from before Stop.
    return muteLines + `${flagsVar}{${musicPlayingBit}} = 0\n${flagsVar}{${musicPausedBit}} = 0\n`;
  };

  // Just the one shared bit - see musicPausedBit's own comment and
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
  // reaching its own natural end) - same one-shot-flag shape as
  // event_run_once in generators/bbasic/event.js, except the flag is set
  // elsewhere rather than by this block itself, and gets cleared here so it
  // only fires once per stop rather than every frame after. Shared by both
  // music_song_stopped and music_song_stopped_by_id below - identical
  // behavior, the latter just also carries a SONG dropdown for readability
  // (see its own comment in blocks/music.js for why it's a separate block
  // rather than an added field on this one). Used directly for the plain
  // music_song_stopped block (fires for ANY song), and as the fallback for
  // music_song_stopped_by_id/_by_number on a single-song project (see their
  // own comments below) - nothing to filter by there either way.
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

  // Filters generateSongStopped's own shared flag by WHICH song actually
  // stopped (see musicJustStoppedSongVarName's own comment) - previously
  // shared generateSongStopped verbatim with every OTHER song-stopped
  // block, firing for whichever song happened to stop regardless of this
  // one's own SONG dropdown, a real reported bug. Target is known at
  // COMPILE time here (a fixed dropdown), so this only needs one constant
  // comparison, unlike music_song_stopped_by_number below.
  Blockly.BBasic['music_song_stopped_by_id'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    // Nothing to filter by on a single-song project - there's only ever
    // one possible song to have stopped, same reasoning as
    // musicJustStoppedSongVarName's own multiSong reservation gate.
    if (music.songs.length <= 1) return generateSongStopped(block);
    const songId = Number(block.getFieldValue('SONG'));
    const target = music.songs.find((s) => s.songId === songId);
    // A stale dropdown (song deleted, or never actually included by
    // resolveProjectMusic - e.g. nothing ever plays it) has no runtime
    // songIndex to match against at all - permanently no-ops, same leniency
    // generateMusicEventCheck's own "target is null" case already uses
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
      // some OTHER watch (a different song's own by-id/by-number block, or
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
  // just stopped, compares THAT song's own real id against the runtime
  // value - the same "if songIndexVar = N then check id N" shape
  // buildMusicPlayByIdBody already uses for the opposite (id -> index)
  // direction, and the same "if A then if B then C" nested-single-line-if
  // batari Basic syntax already used elsewhere (e.g. real bB reference code:
  // "if joy0left then if player0x > 1 then gosub move_left").
  Blockly.BBasic['music_song_stopped_by_number'] = function(block) {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    if (music.songs.length <= 1) return generateSongStopped(block);
    // Same ORDER_NONE as music_play_song_by_id's own identical SONG_ID
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
      // own chance to see it.
      `goto ${labelEnd}`,
      `@ ${labelMatch}`,
      `${flagBit} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };

  // Same one-shot check-and-clear shape as generateSongStopped above (the
  // flag itself is set elsewhere - see resolveMusicEventFlags' own comment
  // and generateMusicChecks' chipFinishedSetLines), just
  // reusable across both music_sequence_chip_finished (general.varName/bit)
  // and music_sequence_chip_finished_by_id (one pair's own varName/bit) -
  // target is null whenever this specific block instance's own flag was
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
  // the file's own never-fallen-into trailing section).
  // Labels each generated music data table with the same explanation this
  // file's own comments already give the JS side, for anyone reading the
  // Generated Code tab directly - purely a "rem" comment line ahead of each
  // "data" block, no effect on the compiled ROM.
  const songLabel = (songId) => {
    const song = findSongById(songId);
    return song && song.name ? song.name : `Song ${songId}`;
  };

  Blockly.BBasic.generateMusicDataTables = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    // Configuration.vue's own "Show detailed comments" toggle (default on) -
    // same flag generators/bbasic.js's own dev-var "; description" comments
    // read, applied here to every data table's own explanatory "rem" line
    // too, not just variables.
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const showComments = config.showVariableComments ?? true;
    const tableComment = (text) => showComments ? ` rem ${text}\n` : '';
    const eventTables = Object.entries(music.channelPages).map(([channel, pages]) => pages.map((bytes, page) => {
      const rows = chunk(bytes, 16).map((row) => '  ' + row.join(', '));
      const pageNote = pages.length > 1 ? `, page ${page}` : '';
      // Every page belongs to exactly one song (see channelPageSongIds' own
      // comment) - falls back to no song mention at all if that mapping is
      // somehow missing for this page, rather than a misleading guess.
      const songId = (music.channelPageSongIds && music.channelPageSongIds[channel] || [])[page];
      const songNote = songId != null ? ` for ${songLabel(songId)}` : '';
      return tableComment(`Channel ${channel}${songNote} note data${pageNote} (AUDV, AUDF, duration per note - ` +
        `instrument changes are interleaved as their own 2-byte markers, see the instrument table below)`) +
        ` data ${musicDataTableName(channel, page)}\n${rows.join('\n')}\nend`;
    }).join('\n\n')).join('\n\n');
    // See musicInstrumentTableName's own comment - one AUDC|arpeggioSpeed<<4
    // byte per distinct instrument, in instrumentBytes' own stable index
    // order. Empty (this whole table omitted) for a project with no audible
    // notes anywhere.
    const instrumentTable = music.instrumentBytes.length ?
      tableComment(`Shared instrument table (AUDC|arpeggioSpeed<<4 per instrument) - indexed by an ` +
        `INSTRUMENT_CHANGE_SENTINEL marker in the note data above`) +
      ` data ${musicInstrumentTableName()}\n${chunk(music.instrumentBytes, 16).map((row) => '  ' + row.join(', ')).join('\n')}\nend` :
      '';
    // One small lookup table per channel - see generateMusicChecks' own
    // loop-reset for the one place these are ever read. Single-song project:
    // only generated for a song with any real repetition at all (totalSteps,
    // not sequenceLength - see buildMusicPlayResetBody's own comment on why
    // those two differ now that a single GROUP can itself repeat more than
    // once), reproducing the exact table name/behavior a project with only
    // one song has always had. Multi-song project: EVERY included song gets
    // its own table (see musicSeqTableName/buildMusicPlaySongResetBody's own
    // comments for why every song needs one once there's more than one to
    // dispatch between, even a trivial one-entry table for a song with only
    // one pattern of its own).
    //
    // A parallel repeat-count table (musicSeqRepeatTableName) rides along
    // once per SONG (not once per channel - see its own comment on why the
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
      // Prototype: one combined table per channel (every song's own
      // sequenceStartPage[channel] concatenated in songIndex order) plus one
      // shared offset table, instead of a whole separate table per song -
      // see musicSongSeqOffsetTableName's own comment for why this replaces
      // generateMusicChecks' old O(songs) if-chain dispatch with a single
      // indexed read.
      const offsetRows = chunk(music.songSeqOffset, 16).map((row) => '  ' + row.join(', '));
      const offsetTable = tableComment('Each song\'s own starting offset into the combined sequence tables below') +
        ` data ${musicSongSeqOffsetTableName()}\n${offsetRows.join('\n')}\nend`;
      const pageTables = Object.keys(music.channelPages).map((channel) => {
        const combined = music.songs.flatMap((song) => song.sequenceStartPage[channel]);
        const rows = chunk(combined, 16).map((row) => '  ' + row.join(', '));
        return tableComment(`Channel ${channel} sequence order for every song combined (see the offset table above ` +
          `for where each song's own slice starts)`) + ` data ${musicCombinedSeqTableName(channel)}\n` +
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
      // for that one song instead of reading one back (see their own
      // matching comments), same "why store a whole table for a single,
      // already-known byte" reasoning the single-song branch above already
      // applies via its own totalSteps > 1 check.
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
    // Attack+decay frame length per registered envelope config (shared with
    // one-shot Sound Effects - see registerEnvelopeConfig in soundfx.js),
    // indexed by an ENVELOPE_CHANGE_SENTINEL marker's own runtime byte (see
    // buildEnvelopeMarkerSubroutine below). Generated HERE - as part of
    // musicEngine's own relocatable payload - rather than alongside
    // _envelopeAd{n}/_envelopeRel{n} (see buildEnvelopeDataTables in
    // soundfx.js, itself now folded into generateEnvelopeChecks' own
    // separate relocatable payload, wrapRelocatableGraphics('soundfxEnvelopeChecks', ...)
    // - the two units can land in DIFFERENT banks from each other, so each
    // has to carry its own copy of whatever data its own code reads): this
    // table is read by musicEngine's own code specifically, which can get
    // relocated independently, so it has to travel WITH that code instead
    // (see resumeRead's own comment just below on this exact class of bug -
    // a table and the code reading it must always share a bank, with no tag
    // needed when they do).
    const anyChannelHasEnvelope = Object.values(music.channelHasEnvelope || {}).some(Boolean);
    const envelopeAdLenTable = anyChannelHasEnvelope ? (() => {
      const configs = getEnvelopeConfigs();
      const rows = chunk(configs.map(({attackDecayLength}) => attackDecayLength), 16)
          .map((row) => '  ' + row.join(', '));
      return tableComment('Attack+decay frame length per envelope config, indexed by an ' +
        'ENVELOPE_CHANGE_SENTINEL marker\'s own byte - see buildEnvelopeMarkerSubroutine') +
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
  // 3-byte record itself (see eventsToPages' own comment on why one was
  // tried there and reverted). Instead, each note's own config index (it
  // can change note-to-note, since it depends on this note's own peak
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
  // ARPEGGIO_PHASE_SEQUENCES), and the AUDF spare bits (this note's own
  // arpeggio interval) are used once to derive 6 pitch variants - base
  // (B), base+interval (A), and each of those one octave up (UB/UA, halved)
  // and one octave down (DB/DA, doubled) - stored so the per-frame apply
  // step below never has to recompute them. arpCounterPhaseVar (counter and
  // phase packed into one shared byte - see musicArpCounterPhaseVarName's
  // own comment) resets on every fetch so a new note's arpeggio always
  // starts clean (in phase, full counter) rather than inheriting where the
  // previous note's cycle left off. Then, every frame (not just on a fetch)
  // that arpSpeedVar is nonzero, the counter ticks down and advances phase
  // once it reaches zero (refilling from arpSpeedVar, wrapping back to phase
  // 0 once past arpRangeVar's own sequence length), and AUDF is set to whichever
  // of the 6 precomputed variants that range/phase combination calls for -
  // same "compute once at fetch time, apply every frame" shape as fade.
  // Builds the bB lines for "read tables[pageVar][index] into temp1" -
  // dispatches to the right physical table based on which page is
  // currently active, since bB can't index a table by a computed/variable
  // table name. A single-page channel (the common case) skips the dispatch
  // chain entirely and reads directly, at zero extra cost. Never advances
  // indexVar itself - callers do that separately once they've decided
  // whether this read was a peek or a real consume.
  // A multi-page channel's own page-select dispatch chain (4 lines per page
  // beyond the first) used to be inlined FRESH at every single call site
  // below - and there were up to 9 of them per channel (durationRead,
  // audcRead [since removed - see eventsToPages' own comment], audfRead,
  // the loop-reset peek, 3x resumeRead via buildPageDispatchSubroutine's
  // own 3 offsets, the main peek, and the final read) - confirmed as the
  // single largest contributor to
  // musicEngine's own compiled size on a real project (its per-channel
  // dispatch measured over 22KB of source, more than 4x its data tables'
  // own size), and the direct cause of a real "Origin Reverse-indexed"
  // build failure once a project's musicEngine payload genuinely didn't fit
  // in its own reserved bank even with EVERY other relocatable unit already
  // evicted elsewhere. Factored into ONE physical copy per channel instead,
  // reached via gosub from every call site rather than re-expanded inline
  // each time - the exact same dispatch logic, just paid for once per
  // channel instead of up to 9 times. Only actually built (see
  // buildPageDispatchSubroutine below) when tables.length > 1 - a
  // single-page channel's own pagedReadLines call stays exactly as
  // lightweight (and inline) as it always was, since there's no dispatch to
  // share in the first place.
  const pageDispatchLabel = (channel) => `_musicpr${channel}_dispatch`;
  const buildPageDispatchSubroutine = (channel, tables, pageVar) => {
    if (tables.length <= 1) return null;
    const doneLabel = `_musicpr${channel}_done`;
    const lines = [pageDispatchLabel(channel)];
    tables.forEach((table, page) => {
      const isLast = page === tables.length - 1;
      if (!isLast) {
        const nextLabel = `_musicpr${channel}_p${page + 1}`;
        lines.push(` if ${pageVar} <> ${page} then goto ${nextLabel}`);
        lines.push(` temp1 = ${table}[temp1]`);
        lines.push(` goto ${doneLabel}`);
        lines.push(nextLabel);
      } else {
        lines.push(` temp1 = ${table}[temp1]`);
      }
    });
    lines.push(doneLabel);
    lines.push(' return');
    return lines.join('\n');
  };
  // indexExpr is read into temp1 first (skipped when it's already temp1
  // itself - resumeRead's own call already computes its offset read
  // straight into temp1, see its own comment) so the shared subroutine
  // always has exactly one calling convention (read temp1, page-select off
  // pageVar, leave the result in temp1) regardless of which named dev var
  // (or temp1 itself) a given call site's own index actually lives in.
  const pagedReadLines = (tables, pageVar, indexExpr, channel) => {
    if (tables.length === 1) {
      return [` temp1 = ${tables[0]}[${indexExpr}]`];
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
    // Resolved once upfront so each channel's own stop branch can check
    // every OTHER channel's active bit too (see the finishCheck below) -
    // the shared playing/justStopped bits only get cleared/set once every
    // channel has independently reached its own end, not just the first
    // one to.
    const activeBitByChannel = Object.fromEntries(
        allChannels.map((channel) => [channel, `${flagsVar}{${musicChannelActiveBit(channel)}}`]));
    // A single song's own sequence.length is the same for every channel
    // (it's a property of the whole song, not of any one channel's own
    // data) - see musicSeqPosVarName's own comment for why this only matters
    // at all once there's more than one position to actually move between.
    // Once the project has more than one SONG, the exact same "more than one
    // position to track" problem also covers "more than one song's own
    // position to track" - both reuse the identical seqPos/Seq-table
    // dispatch machinery below (see buildMusicPlaySongResetBody's own
    // comment), so multiSong alone is enough to force it on, even for a
    // project where every individual song only has one pattern of its own.
    const multiSong = music.songs.length > 1;
    const singleSong = multiSong ? null : music.songs[0];
    // totalSteps (real repeats included), not sequenceLength (now a GROUP
    // count - see resolveProjectMusic) - a single-group song that still
    // repeats its own one pattern several times needs position/repeat
    // tracking exactly as much as a song with several distinct groups does.
    const multiSeq = multiSong || singleSong.totalSteps > 1;
    // The wrap check below compares against a literal constant for a single
    // song (exactly as before - that number never changes at runtime), or
    // the shared musicSeqLenVarName dev var once more than one song can set
    // it to something different.
    const seqLenExpr = multiSong ? resolveVar(musicSeqLenVarName()) : `${singleSong.sequenceLength}`;
    const songIndexVar = multiSong ? resolveVar(musicSongIndexVarName()) : null;
    // Every watched instrument's own "set my flag if temp1's own packed
    // nibble is my index" line (see resolveNotePlayedInstruments for the
    // index, resolveMusicEventFlags for the flag bit), scoped to just THIS
    // channel (see notePlayedChannelsById's own comment in
    // resolveProjectMusic) - an
    // instrument only ever assigned to tracks on channel 0 gets no
    // comparison at all generated into channel 1's own dispatch, since
    // channel 1 could never fetch a note packing that index anyway. Unlike
    // chipFinishedSetLines below, there's no song/sequence-position
    // dependency here, only channel - so this is a plain filter, not a
    // dispatch chain.
    //
    // Masks + compares against the nibble still in its OWN original
    // position ((temp1 & $F0) = index*16) instead of dividing temp1 down
    // to a plain 0-14 value first (an earlier version of this did
    // "temp2 = temp1 / 16" then "if temp2 = index") - a masked compare
    // needs no division at all, avoiding pulling in the shared div_mul.asm
    // routine just for this (see seqRepeatVar's own identical "&"/"|"
    // nibble-masking above, which likewise never needs it, unlike an
    // actual "/16" division). index*16 is computed here at COMPILE time
    // (index is a fixed per-watch constant), so this is one plain masked
    // byte compare per watched instrument, no runtime multiply either.
    const notePlayedInstruments = Blockly.BBasic.notePlayedInstruments || new Map();
    const notePlayedFlags = (Blockly.BBasic.musicEventFlags && Blockly.BBasic.musicEventFlags.notePlayed) ||
      new Map();
    const notePlayedSetLinesForChannel = (channel) => [...notePlayedInstruments.entries()]
        .filter(([id]) => (music.notePlayedChannelsById.get(id) || new Set()).has(Number(channel)))
        .map(([id, index]) => {
          const target = notePlayedFlags.get(id);
          if (!target) return null;
          return ` if (temp1 & $F0) = ${index * 16} then ${resolveVar(target.varName)}{${target.bit}} = 1`;
        })
        .filter(Boolean);
    const perChannelChecks = allChannels.map((channel) => {
      const notePlayedSetLines = notePlayedSetLinesForChannel(channel);
      const pages = music.channelPages[channel];
      const tables = pages.map((_, page) => musicDataTableName(channel, page));
      const multiPage = tables.length > 1;
      // Only reserved/used at all when there's actually more than one page
      // to dispatch across - a channel whose own distinct patterns all
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
      const pageVar = multiPage ? resolveVar(musicPageVarName(channel)) : null;
      const seqPosVar = multiSeq ? resolveVar(musicSeqPosVarName(channel)) : null;
      // Emitted right before seqPosVar's own advance below (the exact point
      // where seqPosVar still holds the position that just exhausted its
      // repeats) - see resolveMusicEventFlags' own comment for the full
      // bit-allocation scheme this reads from. The general ("any chip")
      // flag is set from every channel unconditionally; each specific pair
      // only from its own resolved primary channel, gated on songIndexVar
      // too once the project has more than one song (two different songs'
      // own sequences can share the same numeric position, so seqPosVar
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
        // its own (the original version of this) - a project with several
        // chip-finished watches on the same song used to pay for that same
        // songIndexVar check once per watch; grouping first means it only
        // pays for it once per DISTINCT song referenced. seqPosVar alone
        // still disambiguates within a song's own guard, same as before -
        // two different songs' own sequences can share the same numeric
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
      // for every channel - channel 0's own count lives in the low nibble,
      // channel 1's in the high nibble (see musicSeqRepeatVarName's own
      // comment) - seqRepeatHigh picks which nibble THIS channel's own
      // reads/writes below mask against.
      const seqRepeatVar = multiSeq && music.hasRepeats ? resolveVar(musicSeqRepeatVarName()) : null;
      const seqRepeatHigh = channel === '1';
      // Only channel 1's own high-nibble read (seqRepeatVar / 16) actually
      // needs division - channel 0's low-nibble read is a plain & mask.
      if (seqRepeatVar && seqRepeatHigh) Blockly.BBasic.usesDivMul = true;
      // Resets pageVar back to THIS sequence position's own start page -
      // used by both the advance branch below (a fresh position always
      // needs its own start page looked up) and the repeat-restart branch
      // (same position replayed from its own start again, see its own
      // comment). seqPosVar hasn't moved in either case, so both read the
      // identical table row - but both branches can appear in the SAME
      // channel's output at once (a project can have both multi-page
      // patterns and repeats), so each call site needs its own labels
      // (tag distinguishes them) rather than sharing one fixed label set,
      // which would emit a duplicate DASM label whenever both are present.
      // A no-op array whenever pageVar doesn't even exist (every pattern on
      // this channel fits in a single page).
      // Prototype: music.combinedSeqTables replaces the whole per-song
      // if-chain below with a single indexed read into
      // musicCombinedSeqTableName's own table - see its own comment. temp1
      // is safe to reuse here (immediately consumed, same convention as
      // pagedReadLines/the repeat-count masking below).
      const buildPageResetLines = (tag) => !pageVar ? [] : music.combinedSeqTables ? [
        ` temp1 = ${musicSongSeqOffsetTableName()}[${songIndexVar}]`,
        ` temp1 = temp1 + ${seqPosVar}`,
        ` ${pageVar} = ${musicCombinedSeqTableName(channel)}[temp1]`,
      ] : multiSong ? [
        ...music.songs.map((song, i) => {
          const isLast = i === music.songs.length - 1;
          const nextLabel = `_music${channel}_seqpage${tag}_song${song.songIndex}_next`;
          // A song with only one sequence position ever (totalSteps <= 1,
          // no groups beyond the first, no repeats - see resolveProjectMusic)
          // has a fixed, compile-time-known page for that position: the
          // same channelStartPage every one of its own sequenceStartPage
          // entries already resolves to (there's only ever the one entry).
          // No need for a whole dedicated data table (see
          // generateMusicDataTables' own matching skip) just to hold that
          // single already-known byte - a plain literal assignment costs
          // fewer bytes AND no indexed table read at runtime.
          const lookup = song.totalSteps > 1 ?
            ` ${pageVar} = ${musicSeqTableName(channel, song.songIndex)}[${seqPosVar}]` :
            ` ${pageVar} = ${song.channelStartPage[channel]}`;
          return isLast ? lookup : [
            ` if ${songIndexVar} <> ${song.songIndex} then goto ${nextLabel}`,
            lookup,
            ` goto _music${channel}_seqpage${tag}_done`,
            nextLabel,
          ].join('\n');
        }),
        `_music${channel}_seqpage${tag}_done`,
      ] : [` ${pageVar} = ${musicSeqTableName(channel)}[${seqPosVar}]`];
      const indexVar = resolveVar(musicIndexVarName(channel));
      const timerVar = resolveVar(musicTimerVarName(channel));
      const activeBit = activeBitByChannel[channel];
      // Only meaningful once the project actually has some instrument to
      // track at all - see musicLastAudcVarName/reserveMusicDevVars' own
      // matching gate.
      const lastAudcVar = music.instrumentBytes.length ? resolveVar(musicLastAudcVarName(channel)) : null;

      // Only reserved/used for a channel with at least one arpeggiating note
      // (see musicChannelHasArpeggio) - all of these describe the CURRENTLY
      // PLAYING note (reset/recomputed at note-fetch time below), not the
      // song as a whole. arpSpeedRangeVar packs speed (0-15, low nibble) and
      // range (0-5, bits 4-6) into one shared byte, same layout the duration
      // byte itself uses for these two fields (see eventsToPages) - saves a
      // dev var per arpeggio channel (a hard-capped, project-wide, only
      // 25-of-them resource). Speed comes from the shared instrument table
      // (see buildInstrumentMarkerSubroutine below) rather than a per-note
      // AUDC byte now (see musicLastAudcVarName's own comment on why AUDC
      // moved there), so it's only ever refreshed on an actual instrument
      // change, not every note - range still comes from the duration byte's
      // own bits 4-6 on every fetch (see durationRead below), same as
      // before. arpBaseIntervalVar is base (0-31) | (interval << 5) - the
      // exact same layout the AUDF data byte itself uses, so it's stored
      // as-is straight from the fetched byte, no packing math needed.
      const hasArpeggio = music.channelHasArpeggio[channel];
      const hasEnvelope = music.channelHasEnvelope[channel];
      if (hasArpeggio) Blockly.BBasic.usesDivMul = true;
      // Channel 1's own envelope-config nibble pack (see
      // buildEnvelopeMarkerSubroutine below) needs a genuine runtime
      // multiply-by-16 - the config index isn't known until the marker's
      // own byte is actually read, unlike soundfx_play's equivalent (which
      // already knows its own configIndex at compile time, so never needs
      // this). Channel 0 packs into the low nibble instead (plain add, no
      // multiply needed), same asymmetry soundfx.js's own packing already
      // has.
      if (hasEnvelope && channel === '1') Blockly.BBasic.usesDivMul = true;
      const arpSpeedRangeVar = hasArpeggio ? resolveVar(musicArpSpeedRangeVarName(channel)) : null;
      const arpCounterPhaseVar = hasArpeggio ? resolveVar(musicArpCounterPhaseVarName(channel)) : null;
      const arpBaseIntervalVar = hasArpeggio ? resolveVar(musicArpBaseIntervalVarName(channel)) : null;

      // Lets a sound effect sharing this channel (see soundfx.js's
      // soundfx_play/channnel0duration+channnel1duration) keep exclusive
      // hardware control of AUDC/AUDF/AUDV for its own full duration -
      // wraps a single register write so it's skipped whenever durationVar
      // is nonzero (a sound effect currently owns this channel), covering
      // both a note fetch happening mid-effect (buildInstrumentMarkerSubroutine's
      // own AUDC write/audfRead/the fetch-time AUDV write below) AND this
      // channel simply falling silent at its own song/pattern end while an
      // effect is still playing (the "AUDV = 0" writes below) - either
      // would otherwise audibly cut the effect off early. Declared this
      // early (before audfRead, which is one of its first callers) rather
      // than down by the resume-check logic it's conceptually paired with,
      // purely because of JS's own temporal dead zone - a genuine ordering
      // bug in an earlier version of this had a caller reach it before
      // its own declaration ran. See generateSoundDurationChecks... rather,
      // see resumeCheck further below for the other half of this same
      // interleaving feature: once durationVar's effect actually ends,
      // that's what hands audio back to music (or correctly mutes it, via
      // its own "!activeBit" branch, if this channel already fell silent
      // while suppressed) - so gating these writes here never needs its
      // own separate mute-on-suppressed-silence handling.
      // channnel0duration/channnel1duration are only conditionally reserved
      // now (see this.channelDurationUsed's own pre-scan in
      // generators/bbasic.js's init(), which includes "music exists at
      // all" as one of its own trigger conditions - so this is always
      // safely resolvable whenever this function itself runs at all).
      const durationVar = resolveVar(`channnel${channel}duration`);
      const suppressibleWrite = (tag, line) => [
        ` if ${durationVar} <> 0 then goto _musicsup${channel}_${tag}_skip`,
        line,
        `_musicsup${channel}_${tag}_skip`,
      ];

      // Envelope (the old single-stage Fade's full ADSR successor) is live
      // and user-facing on both the SoundFX tab AND Music-tab instruments
      // now. Unlike the old single-stage Fade attempt at this (removed
      // rather than left dead-but-reachable, since it grew per-channel
      // dispatch code enough to overflow bank 1's own hard ceiling on a
      // large project), this reuses the EXISTING SFX envelope dispatch
      // (generateEnvelopeChecks in soundfx.js) almost entirely as-is - the
      // Attack/Decay countdown is already channel-neutral there, and
      // Release only needed one small per-channel addition (a "pick
      // whichever remaining-frames source is authoritative right now"
      // read, gated per-channel so an SFX-only project pays nothing extra -
      // see generateEnvelopeChecks' own comment). The real per-channel cost
      // paid here, in the relocatable (non-bank-1) engine, is
      // buildEnvelopeMarkerSubroutine below - a fixed-size subroutine per
      // envelope-using channel, not one that grows with however many
      // configs or notes exist, same shape as buildInstrumentMarkerSubroutine
      // right above it. Per-channel gated the same way arpeggio already is,
      // so a project that never uses envelope on Music instruments pays
      // nothing extra for this at all.
      // Plain, full-width duration read - also reused as-is for a REST on an
      // arpeggio channel (see the rest/note branch spliced into channelBody
      // below), since a rest's own duration byte is never packed with range
      // bits either way (see flattenPatternEvents' own per-event maxFrames,
      // which only narrows an event that ITSELF has arpeggioSpeed > 0 - a
      // rest always has arpeggioSpeed 0, regardless of whether this channel's
      // CURRENTLY SELECTED instrument happens to arpeggio).
      // On a channel with any enveloped note, bit 7 of this same byte is
      // ENVELOPE_BIT (see eventsToPages) - masked off here (& 127) before
      // it ever reaches timerVar, or a set flag would add 128 frames to the
      // note's actual held duration, corrupting playback timing for every
      // note read afterward. A channel with no envelope in use never has
      // this bit set on any of its own bytes (see flattenPatternEvents'
      // channel-wide maxFrames cap), so skipping the mask there is safe and
      // keeps the full 0-255 duration range available on channels that
      // don't need the bit at all.
      const durationReadPlain = [
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${indexVar} = ${indexVar} + 1`,
        hasEnvelope ? ` ${timerVar} = temp1 & 127` : ` ${timerVar} = temp1`,
      ];
      // arpSpeedRangeVar's speed nibble was already set (if this channel's
      // instrument actually arpeggios) moments ago, by
      // buildInstrumentMarkerSubroutine - the low nibble is cleared first,
      // then the new range bits added in - NOT a blind add - since range is
      // refreshed here every note while the speed nibble only changes on an
      // instrument change, so a stale high nibble left over from a previous,
      // larger range would otherwise accumulate instead of being replaced.
      // Only reached at all for a genuine (non-rest) note - see channelBody's
      // own rest/note branch, which routes a rest to durationReadPlain
      // instead, since arpSpeedRangeVar reflects the channel's CURRENTLY
      // SELECTED instrument (persistent across rests, only refreshed on an
      // actual instrument change), not whether THIS SPECIFIC event was
      // itself packed with range bits.
      const durationRead = hasArpeggio ? [
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${indexVar} = ${indexVar} + 1`,
        ` if ${arpSpeedRangeVar} = 0 then goto _music${channel}_dur_noarp`,
        ` ${timerVar} = temp1 & 15`,
        ` temp2 = temp1 & 112`,
        ` ${arpSpeedRangeVar} = ${arpSpeedRangeVar} & 15`,
        ` ${arpSpeedRangeVar} = ${arpSpeedRangeVar} + temp2`,
        ` goto _music${channel}_dur_done`,
        `_music${channel}_dur_noarp`,
        hasEnvelope ? ` ${timerVar} = temp1 & 127` : ` ${timerVar} = temp1`,
        `_music${channel}_dur_done`,
      ] : durationReadPlain;

      // AUDC is no longer part of the regular per-note record at all (see
      // eventsToPages' own comment) - it's applied here instead, whenever an
      // INSTRUMENT_CHANGE_SENTINEL marker (see that same comment) is
      // encountered. This is a genuine SUBROUTINE (gosub/return), not
      // inlined at each of the 3 places that peek a fresh byte (the initial
      // peek, the page-break re-peek, and the loop/sequence-advance
      // re-peek - see pageBreakCheck and the multiSeq/single-loop branches
      // below) - each of those just adds one "gosub" call right after its
      // own existing peek, with NO other change needed, since this
      // subroutine's own contract is simple: given temp1 already holding a
      // freshly-peeked byte, silently consume and apply as many
      // back-to-back instrument-change markers as are actually there (only
      // ever one in practice, but looping costs nothing extra to also
      // handle the case correctly), and return with temp1 holding
      // whatever real, non-marker byte follows (a note's own AUDV, or
      // PAGE_BREAK_SENTINEL, or LOOP_SENTINEL) - exactly what every caller
      // already expects right after its own peek.
      const instrumentMarkerLabel = `_music${channel}_skipinstr`;
      const skipInstrumentMarkers = lastAudcVar ? [` gosub ${instrumentMarkerLabel}`] : [];
      const buildInstrumentMarkerSubroutine = () => !lastAudcVar ? null : [
        instrumentMarkerLabel,
        ` if temp1 <> ${INSTRUMENT_CHANGE_SENTINEL} then goto ${instrumentMarkerLabel}_done`,
        ` ${indexVar} = ${indexVar} + 1`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${indexVar} = ${indexVar} + 1`,
        ` temp1 = ${musicInstrumentTableName()}[temp1]`,
        ` ${lastAudcVar} = temp1`,
        // This instrument's own arpeggio speed lives in the SAME shared byte
        // (see instrumentBytes' own comment: AUDC | (arpeggioSpeed << 4)) -
        // extracted into arpSpeedRangeVar's low nibble here, the one place
        // an instrument change is actually detected, rather than re-read
        // every note. Its high nibble (range) is left untouched here - that
        // gets refreshed separately, every note, by durationRead below.
        ...(hasArpeggio ? [
          ` temp2 = temp1 / 16`,
          ` ${arpSpeedRangeVar} = ${arpSpeedRangeVar} & 112`,
          ` ${arpSpeedRangeVar} = ${arpSpeedRangeVar} + temp2`,
        ] : []),
        ...suppressibleWrite('audc', ` AUDC${channel} = temp1`),
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` goto ${instrumentMarkerLabel}`,
        `${instrumentMarkerLabel}_done`,
        ' return',
      ].join('\n');

      // Applies an ENVELOPE_CHANGE_SENTINEL marker (see eventsToPages' own
      // comment) - same subroutine shape as buildInstrumentMarkerSubroutine
      // just above (peek-compare-consume-loop-return), gosub'd from the
      // same 3 byte-repeek sites via skipEnvelopeMarkers below. Unlike an
      // instrument change, this marker's own selector can change even when
      // the CURRENT instrument doesn't (it also depends on this note's own
      // peak volume - see eventsToPages), so it's checked at every note
      // fetch rather than only on an actual instrument change. Shares its
      // own channel-packed nibble (envelopeConfig) and per-channel
      // attack+decay countdown (envelopeStage{channel}) with the Sound
      // Effects side (see soundfx_play/generateEnvelopeChecks in
      // soundfx.js) - a channel only ever plays an SFX or a music note at a
      // time (see suppressibleWrite above), so there's no conflict reusing
      // them. envelopeStage{channel} can't just be set to a literal
      // attack+decay length the way soundfx_play does (it already has
      // attack/decay in scope at compile time) - this only knows the
      // marker's own runtime INDEX, so it looks its attack+decay length
      // back up from the shared _envelopeAdLen table instead - generated as
      // part of THIS engine's own relocatable payload (see
      // generateMusicDataTables above), not alongside the bank-1-fixed
      // _envelopeAd{n}/_envelopeRel{n} tables in soundfx.js, specifically so
      // it always travels to whatever bank musicEngine itself gets
      // relocated to (see resumeRead's own comment above on why a
      // musicEngine-read table can never be bank-1-fixed).
      // envelopeConfig itself is NOT a developer-var-pool name (unlike
      // envelopeStage{channel} below) - it's a real named bB variable,
      // dimmed directly onto var47 (see generateEnvelopeDims in
      // soundfx.js), so it's referenced by its own literal name here, the
      // same way soundfx_play's own generator already does, rather than
      // through resolveVar/nameDB_ (which is only for the reserved-letter
      // pool).
      const envelopeConfigVar = 'envelopeConfig';
      const envelopeStageVar = hasEnvelope ? resolveVar(`envelopeStage${channel}`) : null;
      const envelopeMarkerLabel = `_music${channel}_skipenv`;
      const skipEnvelopeMarkers = hasEnvelope ? [` gosub ${envelopeMarkerLabel}`] : [];
      const buildEnvelopeMarkerSubroutine = () => !hasEnvelope ? null : [
        envelopeMarkerLabel,
        ` if temp1 <> ${ENVELOPE_CHANGE_SENTINEL} then goto ${envelopeMarkerLabel}_done`,
        ` ${indexVar} = ${indexVar} + 1`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${indexVar} = ${indexVar} + 1`,
        ` if temp1 <> ${NO_ENVELOPE_SENTINEL} then goto ${envelopeMarkerLabel}_on`,
        // "Off": both the sentinel value packed in and 0 are compile-time
        // constants here, so no runtime multiply is needed even on channel
        // 1 - only the "real config" branch below needs one.
        channel === '1' ?
          ` ${envelopeConfigVar} = ${envelopeConfigVar} & 15` :
          ` ${envelopeConfigVar} = ${envelopeConfigVar} & 240`,
        channel === '1' ?
          ` ${envelopeConfigVar} = ${envelopeConfigVar} + ${NO_ENVELOPE_SENTINEL * 16}` :
          ` ${envelopeConfigVar} = ${envelopeConfigVar} + ${NO_ENVELOPE_SENTINEL}`,
        ` ${envelopeStageVar} = 0`,
        ` goto ${envelopeMarkerLabel}_applied`,
        `${envelopeMarkerLabel}_on`,
        ` ${envelopeStageVar} = _envelopeAdLen[temp1]`,
        ...(channel === '1' ? [
          ` temp2 = temp1 * 16`,
          ` ${envelopeConfigVar} = ${envelopeConfigVar} & 15`,
          ` ${envelopeConfigVar} = ${envelopeConfigVar} + temp2`,
        ] : [
          ` ${envelopeConfigVar} = ${envelopeConfigVar} & 240`,
          ` ${envelopeConfigVar} = ${envelopeConfigVar} + temp1`,
        ]),
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
      // identical convention in utils/music-playback.js's own
      // arpeggioPitchVariants, so the ROM's arpeggio pitch direction matches
      // the Music tab's own preview.
      // Plain AUDF read - also reused as-is for a REST on an arpeggio
      // channel (see channelBody's own rest/note branch below): a rest is
      // always AUDF 0 with no interval, so there's nothing for the "same
      // note vs. continuation chunk" comparison below to usefully do for it,
      // and arpSpeedRangeVar (which durationRead - the arpeggio-aware
      // variant - would otherwise consult) needs to keep reflecting the
      // channel's own currently-selected instrument, not get reset by a
      // rest that never triggers its own instrument-change marker.
      // Own suppressibleWrite tag ("audfplain", not "audf") - unlike the old
      // single if/else shape, this and audfRead's own arpeggio-branch write
      // below can BOTH end up present in the same channel's generated code
      // at once now (reached via different runtime branches - see
      // channelBody's rest/note split - rather than one replacing the other
      // at code-generation time), so they need distinct tags: suppressibleWrite
      // emits its own skip label per call, and two calls sharing one tag
      // would emit that same label twice and fail to assemble.
      const audfReadPlain = [
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${indexVar} = ${indexVar} + 1`,
        ...suppressibleWrite('audfplain', ` AUDF${channel} = temp1`),
      ];
      const audfRead = hasArpeggio ? [
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ` ${indexVar} = ${indexVar} + 1`,
        // A long held note gets split into several data-table chunks purely
        // because of arpeggio's own duration cap (see
        // MAX_EVENT_FRAMES_WITH_ARPEGGIO) - each chunk re-fetches as if it
        // were a new note. Comparing this fetch's base|interval byte
        // (already exactly arpBaseIntervalVar's own packed layout, see its
        // comment) against the previous one (saved into temp2 before it's
        // overwritten, no extra dev var needed) tells a genuine new note
        // apart from an internal continuation chunk of the same held note:
        // identical byte means "still the same note, let phase/counter keep
        // running uninterrupted"; a different byte means a real new note, so
        // reset to a clean phase 0. Everything below the branch (the AUDF
        // write included) only runs for a genuine new note - a continuation
        // chunk keeps whatever pitch its own in-progress arpeggio cycle was
        // already playing, rather than being stomped back to plain base
        // every ~15 frames (see MAX_EVENT_FRAMES_WITH_ARPEGGIO).
        ` temp2 = ${arpBaseIntervalVar}`,
        ` ${arpBaseIntervalVar} = temp1`,
        ` if temp2 = ${arpBaseIntervalVar} then goto _music${channel}_arp_samenote`,
        ` temp1 = temp1 & 31`,
        ...suppressibleWrite('audf', ` AUDF${channel} = temp1`),
        // Refilled from this note's own speed nibble (already sitting in
        // arpSpeedRangeVar's low bits, set by buildInstrumentMarkerSubroutine
        // whenever the instrument last changed), not a bare 1 - a bare 1
        // counts down to the first flip in a single frame no matter the
        // configured speed, so every note's very first flip would land far
        // sooner than every flip after it. This makes the first flip wait
        // exactly as long as every other one. A plain "= temp2" (not
        // "|"/masked) also resets phase to 0 for free - temp2 is always
        // 0-15, so the high (phase) nibble comes along already zeroed.
        ` temp2 = ${arpSpeedRangeVar} & 15`,
        ` ${arpCounterPhaseVar} = temp2`,
        `_music${channel}_arp_samenote`,
      ] : audfReadPlain;

      // None of B/A/UB/UA/DB/DA are kept in their own dev vars (see
      // arpBaseIntervalVar's own comment) - every one is derived fresh,
      // right here, only on the rare frame a flip actually lands on it: base
      // is always the packed var's low 5 bits; the "alt" (A/UA/DA) tokens
      // subtract the packed var's own interval (bits 5-7) from that; "U"
      // tokens then halve it (one octave up); "D" tokens double and mask
      // back to 5 bits (one octave down, AUDF hardware only reads 5 bits).
      const arpApply = hasArpeggio ? (() => {
        // Each call site gets its own suppressibleWrite tag (rather than one
        // shared "arp" tag) - suppressibleWrite emits its own skip label
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
        // directly - see musicArpCounterPhaseVarName's own comment, this is
        // now packed with counter into one byte) - the caller below always
        // has temp1 holding the freshly-derived plain (unshifted) new phase
        // value by the time any of this runs. The self-clamp needs a
        // goto-guarded two-line block (bB's "if...then" only conditions the
        // one statement right after "then" - a colon-chained "temp1 = 0 :
        // combined = ..." would run its second half unconditionally) since it
        // has to update both temp1 (for this dispatch pass' own phaseChecks
        // below) and arpCounterPhaseVar's own high nibble (so the clamp
        // actually persists into the NEXT flip's "combined / 16" read,
        // matching the old single persistent var's own behavior exactly).
        const rangeBlocks = ARPEGGIO_PHASE_SEQUENCES.flatMap((sequence, rangeIndex) => {
          const phaseChecks = [];
          const phaseBlocks = [];
          const rangeLabel = `_music${channel}_arp_range${rangeIndex}`;
          const resetLabel = `${rangeLabel}_phasereset`;
          const okLabel = `${rangeLabel}_phaseok`;
          sequence.forEach((token, phaseIndex) => {
            const label = `_music${channel}_arp_r${rangeIndex}p${phaseIndex}`;
            phaseChecks.push(` if temp1 = ${phaseIndex} then goto ${label}`);
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
            ...phaseChecks,
            ` goto _music${channel}_arp_skip`,
            ...phaseBlocks,
          ];
        });
        // Range isn't kept in its own dev var either (see arpSpeedRangeVar's
        // own comment) - extracted into temp2 right here, only on the rare
        // frame a flip actually happens, right before the dispatch that's
        // the only thing that needs it.
        const rangeDispatch = ARPEGGIO_PHASE_SEQUENCES.map((_, rangeIndex) =>
          rangeIndex === ARPEGGIO_PHASE_SEQUENCES.length - 1 ?
            ` goto _music${channel}_arp_range${rangeIndex}` :
            ` if temp2 = ${rangeIndex} then goto _music${channel}_arp_range${rangeIndex}`);
        return [
          // Suppressed (skipped entirely, counters included) for as long as
          // a sound effect sharing this channel owns its hardware output -
          // same reasoning as suppressibleWrite's other callers, just gating
          // the whole tick rather than one write, since there's nothing
          // useful to advance while this channel's own AUDF is off-limits
          // anyway.
          ` if ${durationVar} <> 0 then goto _music${channel}_arp_skip`,
          // Only reaches the range/phase dispatch (which writes AUDF) on the
          // exact frame the flip actually happens - on every other frame
          // it's skipped outright rather than redundantly re-writing AUDF to
          // the same value it already holds (TIA keeps whatever was last
          // written, so there's nothing to refresh). Skipped outright once
          // the timer's already at 0 too - that's the exact condition about
          // to trigger a brand new fetch a few lines below, which sets this
          // channel's real AUDF for the note that's actually about to be
          // heard; a flip landing on that same frame would otherwise tick
          // the OLD (dying) note's counter/phase one last time and write ITS
          // stale AUDF moments before the fetch's own write reaches it too -
          // an audible, out-of-place pitch blip right at the note boundary.
          ` if ${timerVar} = 0 then goto _music${channel}_arp_skip`,
          ` if ${arpSpeedRangeVar} = 0 then goto _music${channel}_arp_skip`,
          // Counter lives in the low nibble (see musicArpCounterPhaseVarName's
          // own comment) - a plain "-1" on the whole packed byte only ever
          // touches that nibble here, since counter is never 0 going into
          // this decrement (refilled to a nonzero value the instant it
          // reaches 0, right below), so it never borrows into phase's own
          // high nibble.
          ` ${arpCounterPhaseVar} = ${arpCounterPhaseVar} - 1`,
          ` temp1 = ${arpCounterPhaseVar} & 15`,
          ` if temp1 <> 0 then goto _music${channel}_arp_skip`,
          // Refilled from this note's own speed nibble (see audfRead's own
          // identical reasoning) - computed before phase, so temp2 (the new
          // counter) survives untouched while temp1 works out the new
          // (shifted) phase byte just below.
          ` temp2 = ${arpSpeedRangeVar} & 15`,
          ` temp1 = ${arpCounterPhaseVar} / 16`,
          ` temp1 = temp1 + 1`,
          ` temp1 = temp1 * 16`,
          ` ${arpCounterPhaseVar} = temp1 + temp2`,
          // Re-derived as the plain (unshifted) value for rangeBlocks' own
          // phaseChecks below, which compare it directly against each
          // sequence's own 0-based phase index.
          ` temp1 = ${arpCounterPhaseVar} / 16`,
          ` temp2 = ${arpSpeedRangeVar} / 16`,
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
        ` ${pageVar} = ${pageVar} + 1`,
        ` ${indexVar} = 0`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ...skipInstrumentMarkers,
        ...skipEnvelopeMarkers,
        `_music${channel}_notpagebreak`,
      ] : [];

      // Once every OTHER channel has also gone inactive, this is the last
      // one finishing - only then does the song as a whole actually stop
      // (clearing the shared playing bit and setting justStopped).
      // Otherwise some other channel is still playing, so only this
      // channel's own audio mutes.
      const otherChannels = allChannels.filter((other) => other !== channel);
      // Snapshots which song this was (see musicJustStoppedSongVarName's own
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
      // relocated to another bank at all (see wrapRelocatableMusic's own
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
      // Lets a sound effect sharing this channel (see soundfx.js's
      // soundfx_play/channnel0duration+channnel1duration) mute music's own
      // hardware output for its own duration, then hand it back once that
      // duration ends, WITHOUT any new dev var to remember what was playing:
      // AUDV/AUDC/AUDF for whichever note is CURRENTLY due are always
      // exactly the last bytes this channel fetched from its own data table
      // (see the AUDV/audfRead reads below - each is always followed by
      // "indexVar += 1", so right after a fetch, indexVar points 1 past the
      // AUDF byte just read: AUDV is indexVar-3, AUDF is indexVar-2). Those
      // bytes are read-only ROM, so re-reading them costs nothing extra to
      // keep around - built fresh here on every check (this per-channel
      // block already has tables/pageVar/indexVar/pagedReadLines in scope)
      // rather than cached in any new dev var. AUDC is different: it isn't
      // part of the regular per-note record at all any more (see
      // eventsToPages' own comment), so there's no fixed offset to re-read
      // it FROM - lastAudcVar (see its own comment) is what this restores
      // it from instead, a plain dev-var copy rather than another table
      // read. This does NOT freeze anything: timerVar/indexVar keep
      // advancing every frame regardless of whether a sound effect
      // currently owns this channel's hardware output, so by the time the
      // effect ends, indexVar/pageVar already point at whichever note is
      // genuinely due AT THAT MOMENT (not the one that was playing when the
      // effect started), with timerVar already holding its own true
      // remaining length - a note that finished partway through the
      // interruption is never replayed (indexVar has already moved past
      // it), and a still-active note resumes with whatever's left of its
      // own duration, not a fresh restart.
      //
      // Deliberately generated as part of THIS channel's own per-frame
      // check (which lives inside musicEngine's own relocatable payload,
      // see wrapRelocatableMusic below) rather than spliced into
      // commongamelogic (bbasic.bb.hbs), which is always fixed in bank 1 -
      // musicEngine's own data tables travel to whatever bank musicEngine
      // itself gets relocated to (see wrapRelocatableMusic's own comment),
      // so reading them from bank-1-fixed code would silently read the
      // WRONG bank's data once relocated (see bankJumpSuffix's own comment
      // on this exact class of mistake). Running from here instead means
      // this is always in the same bank as its own tables, automatically,
      // with no bank tag needed - exactly like every other table read this
      // same function already does. Runs BEFORE the ordinary paused/active
      // early-exits below (a sound effect can end on a frame this channel
      // would otherwise skip entirely, e.g. mid-note with plenty of timerVar
      // left) - checked independently of them, so it never depends on this
      // frame's own fetch/advance logic actually running at all. `if
      // indexVar < 3` guards a fetch that's never actually happened yet on
      // this channel (indexVar still at its dim'd-0 default) - only
      // reachable at all if activeBit is somehow set before this channel's
      // very first real fetch, which shouldn't happen, but costs one cheap
      // comparison to rule out for certain rather than risk an 8-bit
      // underflow wrapping the read index to 253+ (now genuinely reachable
      // math - see INSTRUMENT_CHANGE_SENTINEL's own value - not just a
      // theoretical concern this guard was already cheap insurance against).
      const resumeRead = (offset, targetVar) => [
        ` temp1 = ${indexVar} - ${offset}`,
        ...pagedReadLines(tables, pageVar, 'temp1', channel),
        ` ${targetVar} = temp1`,
      ];
      const resumeCheck = [
        ` if ${durationVar} <> 1 then goto _musicresume${channel}_skip`,
        ` if !${activeBit} then goto _musicresume${channel}_skip`,
        ` if ${indexVar} < 3 then goto _musicresume${channel}_skip`,
        ...resumeRead(3, `AUDV${channel}`),
        ...(lastAudcVar ? [` AUDC${channel} = ${lastAudcVar}`] : []),
        ...resumeRead(2, `AUDF${channel}`),
        `_musicresume${channel}_skip`,
      ];

      // Hand-written 6502 for the part of channelBody that runs literally
      // every frame for every channel regardless of project shape: the
      // pause/active gate and the timer decrement. An earlier version of
      // this broke once musicEngine relocated to a non-bank-1 bank ("Unknown
      // Mnemonic 'jmp _music0_skip'") - root-caused directly against that
      // failing build's own DASM listing: bB auto-prefixes every ordinary
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
      const pausedMask = `$${(1 << musicPausedBit).toString(16).toUpperCase()}`;
      const activeMask = `$${(1 << musicChannelActiveBit(channel)).toString(16).toUpperCase()}`;
      const channelBody = [
        ...resumeCheck,
        ' asm',
        '       lda ' + flagsVar,
        '       and #' + pausedMask,
        '       beq _music' + channel + '_hp_notpaused',
        '       jmp ._music' + channel + '_skip',
        '_music' + channel + '_hp_notpaused',
        '       lda ' + flagsVar,
        '       and #' + activeMask,
        '       bne _music' + channel + '_hp_active',
        '       jmp ._music' + channel + '_skip',
        '_music' + channel + '_hp_active',
        '       dec ' + timerVar,
        'end',
        ...arpApply,
        ` if ${timerVar} <> 0 then goto _music${channel}_skip`,
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
        // Multi-position song: LOOP_SENTINEL means "this PATTERN's own data
        // just ended", not necessarily the whole sequence - always advance
        // to the next sequence position first, and only consult the loop
        // bit (same as before) once that advance actually runs off the end
        // of the sequence. musicSeqTableName's own table turns whatever
        // sequence position that lands on into the page that position's own
        // pattern data starts at - the actual reuse: several positions can
        // (and do, for a repeated pattern) resolve to the exact same page.
        ...(multiSeq ? [
          // Checked BEFORE ever touching seqPosVar - if the group currently
          // playing still owes repeats (see musicSeqRepeatVarName), this
          // just counts one off and jumps straight to the shared re-peek
          // tail below (_seqrestart), re-reading the SAME group's own start
          // page again rather than moving to the next sequence position at
          // all. Only once a group's own repeats are exhausted does this
          // fall through to the ordinary advance-or-wrap logic, completely
          // unchanged from before repeat groups existed - so a project with
          // no repeated patterns anywhere never even generates this check
          // (seqRepeatVar is null then).
          // Masked against THIS channel's own nibble only (see
          // musicSeqRepeatVarName's own comment) - temp1 holds channel 0's
          // count via a plain & mask, or channel 1's via / 16, matching
          // soundfx.js's own envelopeConfig convention exactly. The
          // decrement itself (-1 for channel 0, -16 for channel 1) only
          // ever touches THIS channel's own nibble, safe without any
          // cross-channel coordination since the other nibble's own bits
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
            // its own start, so pageVar needs the same explicit reset the
            // advance branch below already gives it - without this, a
            // repeated pattern spanning more than one page replayed only its
            // own last (partial) page instead of the whole thing, hit
            // LOOP_SENTINEL again almost immediately, and sounded like an
            // extra, garbled repeat. seqPosVar hasn't moved yet, so this is
            // the exact same lookup the advance branch's own pageVar reset
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
          // A single song still just reads its own one Seq table directly
          // (identical to before). Once there's more than one song, this
          // dispatches through _musicSongIndex first, since only ONE of
          // several songs' own Seq tables is the right one to consult for
          // whichever song is actually playing right now - only runs at a
          // pattern-transition boundary (not every frame), so the cost is
          // bounded by however many songs actually reach this point. The
          // page lookup itself is skipped entirely when pageVar is null (a
          // single-page channel - see its own comment above), and the
          // repeat-count lookup (see musicSeqRepeatTableName) rides along in
          // its own separate dispatch whenever seqRepeatVar exists - a
          // plain full overwrite (not masked), since the table already
          // stores this group's own final repeats-remaining value pre-
          // packed for BOTH nibbles (see resolveProjectMusic's own
          // sequenceRepeatPacked) - but this channel's own advance can run
          // at a completely different FRAME than the other channel's own
          // advance (each channel's own LOOP_SENTINEL timing depends on
          // that channel's own note durations summing to the pattern's
          // length, which routinely differs between a melody and a harmony
          // channel of the very same pattern). A full overwrite here would
          // clobber whatever repeat count the OTHER channel was still
          // counting down for a position IT hasn't reached yet - confirmed
          // as a real, reproducible bug (a later sequence chip's own advance
          // corrupting an earlier chip's still-in-progress repeat count,
          // observed as extra, uncounted repeats that got worse the more
          // sequence chips existed). Masked into temp1 first, then merged
          // into only THIS channel's own nibble (same $0F/$F0 mask
          // convention as soundfx.js's own envelopeConfig), leaving
          // whatever the other channel's own nibble currently holds alone -
          // exactly as safe as the decrement above already was.
          ...(multiSong ? [
            ...buildPageResetLines('advance'),
            ...(seqRepeatVar ? (music.combinedSeqTables ? [
              // Same combined-table read as buildPageResetLines' own
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
                // Same totalSteps <= 1 shortcut as buildPageResetLines' own
                // page lookup above - such a song's own sequenceRepeatPacked
                // is always exactly [0] (its one group can't itself have a
                // repeat count baked in beyond the first play - see
                // resolveProjectMusic), so the literal 0 this substitutes is
                // provably identical to whatever its own (skipped) data
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
          ...(multiPage ? [` ${pageVar} = 0`] : []),
        ]),
        ` ${indexVar} = 0`,
        ...pagedReadLines(tables, pageVar, indexVar, channel),
        ...skipInstrumentMarkers,
        ...skipEnvelopeMarkers,
        `_music${channel}_read`,
        ` ${indexVar} = ${indexVar} + 1`,
        ...suppressibleWrite('audvfetch', ` AUDV${channel} = temp1`),
        // Every watched "note played" instrument's own set-flag check (see
        // notePlayedSetLines above, including why this is a masked compare
        // rather than a division) - temp1 still holds the just-fetched AUDV
        // byte unmodified here (audfRead below reuses temp1 for its own
        // read right after, so this has to run before that). AUDC is no
        // longer read here at all - see skipInstrumentMarkers/
        // buildInstrumentMarkerSubroutine's own comment.
        ...notePlayedSetLines,
        // A rest (AUDV byte, still in temp1 here, exactly 0) always uses the
        // plain, full-width AUDF/duration read, even on an arpeggio channel
        // whose CURRENTLY SELECTED instrument does arpeggio - a rest never
        // triggers its own instrument-change marker, so arpSpeedRangeVar
        // just keeps reflecting whatever instrument was last actually
        // played, not "is THIS event itself arpeggiating" (which is what
        // audfRead/durationRead's own arpeggio branches actually need to
        // know - see flattenPatternEvents' own per-event maxFrames, which
        // only narrows an event that ITSELF has arpeggioSpeed > 0, never a
        // rest). Read once, one path or the other, never both - indexVar
        // only ever advances past exactly one AUDF byte and one duration
        // byte per fetch either way.
        ...(hasArpeggio ? [
          ` if temp1 <> 0 then goto _music${channel}_notrest`,
          ...audfReadPlain,
          ...durationReadPlain,
          ` goto _music${channel}_read_done`,
          `_music${channel}_notrest`,
          ...audfRead,
          ...durationRead,
          `_music${channel}_read_done`,
        ] : [
          ...audfRead,
          ...durationRead,
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
    // Every channel's own page-dispatch subroutine (see
    // buildPageDispatchSubroutine's own comment for why this exists at all)
    // - null for a single-page channel, which never builds one. Placed
    // after the normal per-frame fall-through body (same reasoning as the
    // data tables just below: reached only via gosub, never meant to run on
    // its own every frame) but before the data tables themselves, so the
    // SAME "goto dataSkipLabel" already skipping over the data tables skips
    // over these too - no second skip/goto pair needed.
    const pageDispatchSubroutines = perChannelChecks.map(({subroutine}) => subroutine).filter(Boolean).join('\n\n');

    // This whole per-channel dispatch (especially with Arpeggio, which
    // can each add a substantial amount of code per channel) is spliced
    // straight into commongamelogic (see bbasic.bb.hbs) - a plain gosub'd
    // subroutine that's ALWAYS in bank 1, unlike events/backgrounds/
    // animations, which the auto-relocation system (see rom.js's
    // pickRelocationCandidate) can already move to any other bank once bank
    // 1 fills up. Wrapping it as its own relocatable unit (wrapRelocatableMusic
    // - the same entry/return-label redirect mechanism wrapRelocatableGraphics
    // uses for a background or animation, just kept in its own separate pool/
    // config key so a bank reserved for music - see rom.js's
    // musicReservedBank - never has to share space with graphics) makes this
    // movable too, without needing a whole separate relocation mechanism of
    // its own. Its own data tables (music.channelPages' raw
    // bytes) travel along in the SAME payload rather than staying in the
    // fixed, bank-1-only "Data tables" section - a data table can only be
    // read correctly from the same bank it's declared in (see
    // trackDataTableBank's own comment), and this is the only place they're
    // ever read from, so there's no need to duplicate them per-bank the way
    // a Data-tab table shared across several relocated events does.
    //
    // The data table can't just follow the checks directly, though - unlike
    // the checks (meant to run every frame, falling through into whatever
    // comes after once every channel's own early-exit has been checked), a
    // "data" block is raw bytes, not code: falling through into it would
    // have the CPU start executing table data as instructions. An explicit
    // jump skips over it, landing on a label placed right after - taken
    // every single frame this runs (not just when a table is actually
    // read), but that's a handful of cycles, not a real cost.
    const dataTables = this.generateMusicDataTables();
    const dataSkipLabel = '_music_update_data_skip';
    // Same banner style as the fixed section headers in bbasic.bb.hbs (e.g.
    // "Code generated by VCS Game Maker.") - added at the user's own
    // explicit request, crediting the Music tab/engine's own author.
    const banner = [
      ' rem **************************************************************************',
      ' rem Music engine by AbstractPolygon - https://abstractpolygon.com/',
      ' rem **************************************************************************',
    ].join('\n');
    // The page-dispatch subroutines (see pageDispatchSubroutines' own
    // comment) are gosub'd, never fallen into, so they need the exact same
    // "goto past this, land on a label right after" protection the data
    // tables already need for their own, different reason (raw bytes, not
    // code) - reusing dataSkipLabel for both rather than a second skip/goto
    // pair. Needed whenever EITHER exists, not just when dataTables does -
    // a project with at least one multi-page channel but (hypothetically)
    // no data tables would otherwise leave its own subroutines completely
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
