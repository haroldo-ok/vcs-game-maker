'use strict';

import {chunk} from 'lodash';

import {findSongById, processSongsStorageDefaults, DEFAULT_PATTERN_STEPS, LENGTH_UNITS_PER_STEP} from '../../blocks/music';
import {processSoundEffectsStorageDefaults, DEFAULT_ARPEGGIO_DIVISION,
  FADE_LENGTH_OPTIONS, DEFAULT_FADE_LENGTH} from '../../blocks/soundfx';
import {MAX_DATA_TABLE_VALUES} from '../../blocks/data';
import {useConfigurationStorage, useSoundEffectsStorage, useSongsStorage} from '../../hooks/project';
import {effectiveTempo} from '../../utils/music-playback';
import {audcHasTunableNotes} from '../../utils/music-notes';
import {DEFAULT_DIM_PERCENT, dimVolume} from './soundfx';

const FRAMES_PER_SECOND = 60; // NTSC - matches "set tv ntsc" in bbasic.bb.hbs
// A held note's duration is stored in the low 7 bits of its own byte (see
// eventsToPages) - bit 7 is reused as the "this note fades" flag, so a
// channel with any fade in use caps a single event's hold at 127 frames
// instead of 255 (channels with no fade at all keep the full 255 range -
// see the final chunking pass in flattenPatternEvents).
const MAX_EVENT_FRAMES_WITH_FADE = 127;
const MAX_EVENT_FRAMES_NO_FADE = 255;
// Only an event that ITSELF arpeggiates needs 3 more bits (see
// ARPEGGIO_PHASE_SEQUENCES) for its range/shape, cutting its own duration
// down to this - a rest or non-arpeggiating note on the very same channel
// isn't forced into this narrow cap too (see the per-event maxFrames in
// flattenPatternEvents' final chunking pass, and the arpSpeedVar branch in
// generateMusicChecks' durationRead), since its duration byte doesn't need
// to carry any range bits at all.
const MAX_EVENT_FRAMES_WITH_ARPEGGIO = 15;
const FADE_BIT = 0x80;
const ARPEGGIO_RANGE_BITS_SHIFT = 4;
// Same numeric limit as MAX_EVENT_FRAMES_WITH_ARPEGGIO (both are bounded by
// a 4-bit nibble), but a separate name since they bound conceptually
// different things - one a note's held duration, the other how many frames
// between arpeggio flips.
const MAX_ARPEGGIO_SPEED_FRAMES = 15;
// AUDV is 0-15, so 255 in that byte position is unambiguous as "end of
// song's data, loop back to the start" - same convention the reference bB
// file this format is based on uses for its own background music channel.
const LOOP_SENTINEL = 255;
// A single "data" table can only hold MAX_DATA_TABLE_VALUES bytes (a real
// batari Basic limit - the index is a single byte). A channel needing more
// than that spans several tables ("pages") instead - this sentinel, also in
// the AUDV position, means "end of this page, not the whole song - advance
// to the next page's table and keep reading" (see generateMusicChecks).
const PAGE_BREAK_SENTINEL = 254;
// A generous ceiling on how many pages one channel can spread across, purely
// as a sanity guard against a pathologically long song generating enormous
// amounts of dispatch code - not a hard format limit. Applies to the SUM of
// pages across every song included for playback (see resolveProjectMusic),
// not one song alone, now that a project can reference more than one -
// raised from the original single-song value of 8 since that budget is now
// shared project-wide.
const MAX_MUSIC_PAGES = 16;

// Canonical (pre-letter-assignment) names for this feature's hidden
// variables - passed through nameDB_.getName(..., DEVELOPER_VARIABLE_TYPE)
// both when reserving a letter (see bbasic.js's pre-scan) and again at every
// generation call site below, matching the established convention (see
// collisionMoveOldXVar/canonicalDistanceVarName).
export const musicIndexVarName = (channel) => `_musicCh${channel}Index`;
export const musicTimerVarName = (channel) => `_musicCh${channel}Timer`;
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
// packed-nibble convention soundfx.js's own soundFadeVolumes already uses
// for its own per-channel fade targets (see soundfx_play/
// generateSoundFadeChecks there). Each channel only ever reads/writes its
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
// Only reserved/used for a channel that actually has at least one faded
// note (see musicChannelHasFade) - see generateMusicChecks' own comment on
// fadeVar for its packed bit layout (target volume, fade-length index, and
// whether the current note fades at all, merged into one var). Re-reading
// all three straight from the data table every frame instead (no dev var at
// all) was tried and reverted - it traded this one RAM byte for enough
// EXTRA generated code (three more table reads, each with its own
// multi-page dispatch, every frame a note's actually fading) to overflow
// bank 1's own hard 4096-byte ceiling (see utils/rom-capacity.js) on a
// project with much music content - a bad trade, since that unrelocatable
// per-frame code space is the tighter of the two limits here, not dev vars.
export const musicFadeVarName = (channel) => `_musicCh${channel}Fade`;
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
export const musicArpCounterVarName = (channel) => `_musicCh${channel}ArpCounter`;
export const musicArpPhaseVarName = (channel) => `_musicCh${channel}ArpPhase`;
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
    const arpReset = music.channelHasArpeggio[channel] ?
      `${resolveVar(musicArpPhaseVarName(channel))} = 0\n${resolveVar(musicArpCounterVarName(channel))} = 1\n` :
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
    const arpReset = music.channelHasArpeggio[channel] ?
      `${resolveVar(musicArpPhaseVarName(channel))} = 0\n${resolveVar(musicArpCounterVarName(channel))} = 1\n` :
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
// Fade and Arpeggio's own runtime lookup tables/dispatch code (previously
// here) were removed along with the rest of their code generation - see
// generateMusicChecks' own comment. Still fully implemented in git history.

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
const flattenPatternEvents = (song, pattern, channels, soundEffects, config = {}) => {
  const perChannel = {};
  channels.forEach((channel) => {
    perChannel[channel] = [];
  });

  // Merges into the previous event when it holds the exact same register
  // values, fade flag, AND arpeggio speed/interval/range (e.g. two adjacent
  // rests) - same audio, fewer bytes. Left un-chunked here on purpose:
  // chunking to the per-channel frame-per-byte limit only happens once, in a
  // final pass below (see the final chunking pass), so a long merged run
  // always splits into the fewest possible events instead of inheriting
  // whatever chunk boundaries its original pieces happened to have.
  const pushEvent = (channel, audv, audc, audf, frames, fade = false, arpeggioSpeed = 0, arpeggioInterval = 0,
      arpeggioRange = 0, fadeLength = DEFAULT_FADE_LENGTH) => {
    if (frames <= 0) return;
    const events = perChannel[channel];
    const prev = events[events.length - 1];
    if (prev && prev.audv === audv && prev.audc === audc && prev.audf === audf && prev.fade === fade &&
      prev.arpeggioSpeed === arpeggioSpeed && prev.arpeggioInterval === arpeggioInterval &&
      prev.arpeggioRange === arpeggioRange && prev.fadeLength === fadeLength) {
      prev.frames += frames;
    } else {
      events.push({audv, audc, audf, frames, fade, arpeggioSpeed, arpeggioInterval, arpeggioRange, fadeLength});
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
    const soundEffect = soundEffects.find(({id}) => `${id}` === `${track.soundEffectId}`);
    if (!soundEffect) return;
    const audv = config.dimSoundFx ?
      dimVolume(soundEffect.audv, config.dimSoundFxPercent ?? DEFAULT_DIM_PERCENT) : soundEffect.audv;
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
    (track.notes || []).forEach((note) => {
      const audf = !isTunable || note.midi === 'hit' ? soundEffect.audf : note.audf;
      notesByChannel[channel].push({
        startUnits: note.step,
        lengthUnits: note.length,
        audv,
        audc: soundEffect.audc,
        audf,
        fade: !!soundEffect.fade,
        arpeggioSpeed,
        arpeggioInterval,
        arpeggioRange,
        fadeLength: soundEffect.fade ?
          (FADE_LENGTH_OPTIONS.includes(Number(soundEffect.fadeLength)) ?
            Number(soundEffect.fadeLength) : DEFAULT_FADE_LENGTH) :
          DEFAULT_FADE_LENGTH,
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
      pushEvent(channel, note.audv, note.audc, note.audf, lengthFrames, note.fade, note.arpeggioSpeed,
          note.arpeggioInterval, note.arpeggioRange, note.fadeLength);
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
  // fade flag - a long held note split into several chunks should only dip
  // in volume once, right before it actually ends, not at every chunk
  // boundary. Arpeggio speed/interval/range, unlike fade, carry through
  // every chunk unchanged - they describe the whole note, not just its tail.
  const chunked = {};
  Object.entries(perChannel).forEach(([channel, events]) => {
    const hasFade = events.some((event) => event.fade);
    chunked[channel] = [];
    events.forEach(({audv, audc, audf, frames, fade, arpeggioSpeed, arpeggioInterval, arpeggioRange, fadeLength}) => {
      // Only THIS event's own arpeggio use caps it to 15 frames - a rest or
      // non-arpeggiating note on the same channel isn't dragged down to that
      // cap too (see generateMusicChecks' durationRead, which branches on
      // this same event's arpSpeedVar - already known by the time duration
      // is read - to decide how many bits its own duration byte carries).
      const maxFrames = arpeggioSpeed > 0 ? MAX_EVENT_FRAMES_WITH_ARPEGGIO :
        (hasFade ? MAX_EVENT_FRAMES_WITH_FADE : MAX_EVENT_FRAMES_NO_FADE);
      let remaining = frames;
      while (remaining > 0) {
        const chunkFrames = Math.min(remaining, maxFrames);
        remaining -= chunkFrames;
        chunked[channel].push({
          audv, audc, audf, frames: chunkFrames, fade: fade && remaining === 0,
          arpeggioSpeed, arpeggioInterval, arpeggioRange, fadeLength,
        });
      }
    });
  });
  return chunked;
};

// True if any note played on this channel has Fade enabled on its Sound tab
// preset - only such a channel needs the fade bit/dev vars/per-frame check
// at all (see resolveProjectMusic/generateMusicChecks).
export const musicChannelHasFade = (events) => events.some((event) => event.fade);

// True if any note played on this channel has Arpeggio enabled on its Sound
// tab preset - only such a channel needs the arpeggio nibble/bits/dev
// vars/per-frame check at all (see resolveProjectMusic/generateMusicChecks).
export const musicChannelHasArpeggio = (events) => events.some((event) => event.arpeggioSpeed > 0);

// Converts one channel's event list into the raw byte pages for its data
// tables: 4 bytes/event - AUDV, AUDC, AUDF, duration-in-frames - plus a 5th
// on a channel that has ANY faded note anywhere (see hasFade below), since
// the other four are already fully packed with nothing left to spare for a
// per-instrument fade length. Three of the 4 always-present bytes carry a
// little more than their own hardware register needs, in spare bits the TIA
// never reads, at zero extra cost per event:
// - Duration bit 7: this note fades (see FADE_BIT/generateMusicChecks).
// - Duration bits 6-4: arpeggio range/shape, an index into
//   ARPEGGIO_PHASE_SEQUENCES (0 when not arpeggiating - harmless, since
//   arpeggioSpeed 0 already means the reader ignores this note's arpeggio
//   fields entirely).
// - AUDC bits 7-4 (hardware only reads 3-0): arpeggio speed, frames between
//   each pitch flip - 0 means no arpeggio.
// - AUDF bits 7-5 (hardware only reads 4-0): arpeggio interval, the fixed
//   AUDF bump to the "other" pitch.
// The optional 5th byte is an index into FADE_LENGTH_OPTIONS (0-4, always
// fits in 3 bits) - stored for every event on a fade-using channel, not
// just the actually-fading ones, so every record on that channel is the
// same fixed width and the reader never has to guess how many bytes to
// read (see pagedReadLines/generateMusicChecks).
//
// A single "data" table can only hold MAX_DATA_TABLE_VALUES bytes, so events
// are split across multiple pages/tables as needed - never splitting a
// single event's own record across a page boundary, since the reader always
// reads one whole record at a time. Every page but the last is terminated by
// PAGE_BREAK_SENTINEL alone (advance to the next page and keep reading); the
// last page is terminated by LOOP_SENTINEL alone (loop back to page 0) -
// neither is padded out to a full record, the reader checks for them before
// trying to read the rest of a record (see generateMusicChecks below).
const eventsToPages = (events) => {
  const hasFade = events.some((event) => event.fade);
  const recordSize = hasFade ? 5 : 4;
  const pages = [];
  let current = [];
  events.forEach((event) => {
    // +recordSize for the event about to be added, +1 reserved for this
    // page's own terminator byte.
    if (current.length * recordSize + recordSize + 1 > MAX_DATA_TABLE_VALUES) {
      pages.push(current);
      current = [];
    }
    current.push(event);
  });
  pages.push(current);

  return pages.map((pageEvents, pageIndex) => {
    const bytes = [];
    pageEvents.forEach(({audv, audc, audf, frames, fade, arpeggioSpeed, arpeggioInterval, arpeggioRange,
      fadeLength}) => {
      bytes.push(
          audv,
          Number(audc) | (arpeggioSpeed << 4),
          Number(audf) | (arpeggioInterval << 5),
          frames | (fade ? FADE_BIT : 0) | (arpeggioRange << ARPEGGIO_RANGE_BITS_SHIFT),
      );
      if (hasFade) {
        bytes.push(Math.max(0, FADE_LENGTH_OPTIONS.indexOf(fadeLength)));
      }
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
export const resolveProjectMusic = (workspace) => {
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
  const referencedIds = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'music_play_song') referencedIds.add(`${block.getFieldValue('SONG')}`);
  });
  const songRefs = usesSongById ?
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

  const channelPages = {};
  const channelHasFade = {};
  const channelHasArpeggio = {};
  channels.forEach((channel) => {
    channelPages[channel] = [];
    channelHasFade[channel] = false;
    channelHasArpeggio[channel] = false;
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
      const perChannel = flattenPatternEvents(song, pattern, channels, soundEffects, config);
      Object.entries(perChannel).forEach(([channel, events]) => {
        const pages = eventsToPages(events);
        patternStartPage[channel][patternId] = channelPages[channel].length;
        channelPages[channel].push(...pages);
        if (musicChannelHasFade(events)) channelHasFade[channel] = true;
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

  return {
    songs,
    channels: [...channels],
    channelPages,
    channelHasFade,
    channelHasArpeggio,
    usesSongById,
    // True as soon as ANY included song has ANY group repeating more than
    // once - gates whether musicSeqRepeatVarName/musicSeqRepeatTableName are
    // reserved/generated at all (see bbasic.js's dev-var reservation and
    // generateMusicChecks/generateMusicDataTables below), so a project with
    // no repeated patterns pays nothing extra for this feature.
    hasRepeats: songs.some((song) => song.sequenceRepeatPacked.some((packed) => packed > 0)),
  };
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
  // rather than an added field on this one).
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
  Blockly.BBasic['music_song_stopped_by_id'] = generateSongStopped;
  Blockly.BBasic['music_song_stopped_by_number'] = generateSongStopped;

  // Data tables holding each used channel's AUDV/AUDC/AUDF/duration event
  // stream - spliced alongside generatedDataTables in bbasic.bb.hbs (a "data"
  // block is a read-only ROM table, not executable code, so it has to live in
  // the file's own never-fallen-into trailing section).
  Blockly.BBasic.generateMusicDataTables = function() {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return '';
    const eventTables = Object.entries(music.channelPages).map(([channel, pages]) => pages.map((bytes, page) => {
      const rows = chunk(bytes, 16).map((row) => '  ' + row.join(', '));
      return ` data ${musicDataTableName(channel, page)}\n${rows.join('\n')}\nend`;
    }).join('\n\n')).join('\n\n');
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
          return ` data ${musicSeqTableName(channel)}\n${rows.join('\n')}\nend`;
        }).join('\n\n');
        const repeatTable = music.hasRepeats ? (() => {
          const repeatRows = chunk(song.sequenceRepeatPacked, 16).map((row) => '  ' + row.join(', '));
          return `\n\n data ${musicSeqRepeatTableName()}\n${repeatRows.join('\n')}\nend`;
        })() : '';
        seqTables = pageTables + repeatTable;
      } else {
        seqTables = '';
      }
    } else {
      seqTables = music.songs.map((song) => {
        const pageTables = Object.keys(music.channelPages).map((channel) => {
          const rows = chunk(song.sequenceStartPage[channel], 16).map((row) => '  ' + row.join(', '));
          return ` data ${musicSeqTableName(channel, song.songIndex)}\n${rows.join('\n')}\nend`;
        }).join('\n\n');
        const repeatTable = music.hasRepeats ? (() => {
          const repeatRows = chunk(song.sequenceRepeatPacked, 16).map((row) => '  ' + row.join(', '));
          return `\n\n data ${musicSeqRepeatTableName(song.songIndex)}\n${repeatRows.join('\n')}\nend`;
        })() : '';
        return pageTables + repeatTable;
      }).join('\n\n');
    }
    return [eventTables, seqTables].filter(Boolean).join('\n\n');
  };

  // Spliced into commongamelogic (see bbasic.bb.hbs), the same per-frame slot
  // as generateSoundFadeChecks: decrements each used channel's timer, and on
  // reaching 0, reads the next 4-byte event. If the peeked AUDV byte is
  // LOOP_SENTINEL (end of the song's data), either loops back to index 0
  // (musicLoop set) or mutes the channel and marks the song stopped
  // (musicLoop clear - see music_song_stopped). Everything is gated behind
  // musicPlaying so a stopped song's channels stay silent and untouched
  // until the next music_play_song. Goto-based rather than "if X then A : B"
  // for the same reason as generateSoundFadeChecks - "if ... then" only
  // conditions the single statement right after "then".
  //
  // A channel with any faded note (see musicChannelHasFade) also masks bit 7
  // off the duration byte it just read (that bit is the "this note fades"
  // flag - see eventsToBytes) into its own fadeVar, and - if set - computes
  // a fade target (a quarter of whatever AUDV this note just started at,
  // same formula as soundfx_play's own Fade) into fadeVar's own low bits.
  // Then, every frame (not just on a fetch), if the timer reaches that
  // note's own configured fade length (an index into FADE_LENGTH_OPTIONS,
  // also packed into fadeVar) and fadeVar says this note is fading, AUDV
  // drops to that stored target - the exact same shape as
  // generateSoundFadeChecks, just against this channel's own timer instead
  // of channnel0duration/channnel1duration (which represent something
  // different for one-shot sound effects - see the comment on music-in-ROM's
  // design). This costs zero extra data bytes per faded note beyond the
  // fixed per-event fade-length byte (see eventsToPages) - re-reading all of
  // this straight from the data table instead of caching it in fadeVar was
  // tried and reverted (see musicFadeVarName's own comment) - it cost more
  // in generated per-frame code than the one dev var it saved was worth.
  // A channel with any arpeggiating note (see musicChannelHasArpeggio) masks
  // its spare bits off the AUDC/AUDF/duration bytes it just read (see
  // eventsToBytes) at fetch time: the AUDC nibble becomes arpSpeedVar (0 =
  // no arpeggio), the duration bits 6-4 become arpRangeVar (an index into
  // ARPEGGIO_PHASE_SEQUENCES), and the AUDF spare bits (this note's own
  // arpeggio interval) are used once to derive 6 pitch variants - base
  // (B), base+interval (A), and each of those one octave up (UB/UA, halved)
  // and one octave down (DB/DA, doubled) - stored so the per-frame apply
  // step below never has to recompute them. arpCounterVar/arpPhaseVar reset
  // on every fetch so a new note's arpeggio always starts clean (in phase,
  // full counter) rather than inheriting where the previous note's cycle
  // left off. Then, every frame (not just on a fetch) that arpSpeedVar is
  // nonzero, the counter ticks down and advances arpPhaseVar once it
  // reaches zero (refilling from arpSpeedVar, wrapping back to phase 0 once
  // past arpRangeVar's own sequence length), and AUDF is set to whichever
  // of the 6 precomputed variants that range/phase combination calls for -
  // same "compute once at fetch time, apply every frame" shape as fade.
  // Builds the bB lines for "read tables[pageVar][index] into temp1" -
  // dispatches to the right physical table based on which page is
  // currently active, since bB can't index a table by a computed/variable
  // table name. A single-page channel (the common case) skips the dispatch
  // chain entirely and reads directly, at zero extra cost. Never advances
  // indexVar itself - callers do that separately once they've decided
  // whether this read was a peek or a real consume.
  const pagedReadLines = (tables, pageVar, indexVar, uniqueId) => {
    if (tables.length === 1) {
      return [` temp1 = ${tables[0]}[${indexVar}]`];
    }
    const doneLabel = `_musicpr${uniqueId}_done`;
    const lines = [];
    tables.forEach((table, page) => {
      const isLast = page === tables.length - 1;
      if (!isLast) {
        const nextLabel = `_musicpr${uniqueId}_p${page + 1}`;
        lines.push(` if ${pageVar} <> ${page} then goto ${nextLabel}`);
        lines.push(` temp1 = ${table}[${indexVar}]`);
        lines.push(` goto ${doneLabel}`);
        lines.push(nextLabel);
      } else {
        lines.push(` temp1 = ${table}[${indexVar}]`);
      }
    });
    lines.push(doneLabel);
    return lines;
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
    const perChannelChecks = allChannels.map((channel) => {
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
      const buildPageResetLines = (tag) => !pageVar ? [] : multiSong ? [
        ...music.songs.map((song, i) => {
          const isLast = i === music.songs.length - 1;
          const nextLabel = `_music${channel}_seqpage${tag}_song${song.songIndex}_next`;
          const lookup = ` ${pageVar} = ${musicSeqTableName(channel, song.songIndex)}[${seqPosVar}]`;
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

      // Fade and Arpeggio are both hidden/forced off everywhere right now
      // (see processSoundEffectsStorageDefaults in blocks/soundfx.js) - their
      // whole code generation path (fadeApply/arpApply, the extra duration/
      // fade-length parsing, the arpeggio pitch math) was removed here rather
      // than left dead-but-reachable, specifically to simplify this
      // per-channel dispatch enough to hand-optimize its core gate/fetch
      // logic (see the "asm" block below) without fighting through
      // conditionally-spliced Fade/Arpeggio code in the middle of it. Both
      // remain fully implemented in git history if they need to come back.
      const durationRead = [
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}dur`),
        ` ${indexVar} = ${indexVar} + 1`,
        ` ${timerVar} = temp1`,
      ];

      const audcRead = [
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}audc`),
        ` ${indexVar} = ${indexVar} + 1`,
        ` AUDC${channel} = temp1`,
      ];

      const audfRead = [
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}audf`),
        ` ${indexVar} = ${indexVar} + 1`,
        ` AUDF${channel} = temp1`,
      ];

      // A page-break (see eventsToPages) only ever shows up where a new
      // record's AUDV byte would be - the peek right here, before deciding
      // whether this frame's event is a loop or a real note. Advances to
      // the next page's table and re-peeks from its start before falling
      // through to the usual loop-sentinel check below.
      const pageBreakCheck = multiPage ? [
        ` if temp1 <> ${PAGE_BREAK_SENTINEL} then goto _music${channel}_notpagebreak`,
        ` ${pageVar} = ${pageVar} + 1`,
        ` ${indexVar} = 0`,
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}pgpeek`),
        `_music${channel}_notpagebreak`,
      ] : [];

      // Once every OTHER channel has also gone inactive, this is the last
      // one finishing - only then does the song as a whole actually stop
      // (clearing the shared playing bit and setting justStopped).
      // Otherwise some other channel is still playing, so only this
      // channel's own audio mutes.
      const otherChannels = allChannels.filter((other) => other !== channel);
      const finishCheck = [
        ...otherChannels.map((other) =>
          ` if ${activeBitByChannel[other]} then goto _music${channel}_skip`),
        ` ${playingBit} = 0`,
        ` ${justStoppedBit} = 1`,
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
      return [
        ` if ${flagsVar}{${musicPausedBit}} then goto _music${channel}_skip`,
        ` if !${activeBit} then goto _music${channel}_skip`,
        ` ${timerVar} = ${timerVar} - 1`,
        ` if ${timerVar} <> 0 then goto _music${channel}_skip`,
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}peek`),
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
          // soundfx.js's own soundFadeVolumes convention exactly. The
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
          ` ${seqPosVar} = ${seqPosVar} + 1`,
          ` if ${seqPosVar} <> ${seqLenExpr} then goto _music${channel}_seqcontinue`,
          ` if ${loopBit} then goto _music${channel}_seqwrap`,
          ` AUDV${channel} = 0`,
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
          // convention as soundfx.js's own soundFadeVolumes), leaving
          // whatever the other channel's own nibble currently holds alone -
          // exactly as safe as the decrement above already was.
          ...(multiSong ? [
            ...buildPageResetLines('advance'),
            ...(seqRepeatVar ? [
              ...music.songs.map((song, i) => {
                const isLast = i === music.songs.length - 1;
                const nextLabel = `_music${channel}_seqrepsong${song.songIndex}_next`;
                const lookup = ` temp1 = ${musicSeqRepeatTableName(song.songIndex)}[${seqPosVar}]`;
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
            ] : []),
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
          ` AUDV${channel} = 0`,
          ` ${activeBit} = 0`,
          ...finishCheck,
          ` goto _music${channel}_skip`,
          `_music${channel}_loopreset`,
          ...(multiPage ? [` ${pageVar} = 0`] : []),
        ]),
        ` ${indexVar} = 0`,
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}looppeek`),
        `_music${channel}_read`,
        ` ${indexVar} = ${indexVar} + 1`,
        ` AUDV${channel} = temp1`,
        ...audcRead,
        ...audfRead,
        ...durationRead,
        `_music${channel}_skip`,
      ].join('\n');
    }).join('\n\n');

    // This whole per-channel dispatch (especially with Fade/Arpeggio, which
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
    const payload = dataTables ?
      [perChannelChecks, ` goto ${dataSkipLabel}`, dataTables, dataSkipLabel].join('\n\n') :
      perChannelChecks;
    return this.wrapRelocatableMusic('musicEngine', payload);
  };
};
