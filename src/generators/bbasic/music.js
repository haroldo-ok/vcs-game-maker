'use strict';

import {chunk} from 'lodash';

import {findSongById, DEFAULT_PATTERN_STEPS, LENGTH_UNITS_PER_STEP} from '../../blocks/music';
import {processSoundEffectsStorageDefaults, DEFAULT_ARPEGGIO_DIVISION,
  FADE_LENGTH_OPTIONS, DEFAULT_FADE_LENGTH} from '../../blocks/soundfx';
import {MAX_DATA_TABLE_VALUES} from '../../blocks/data';
import {useConfigurationStorage, useSoundEffectsStorage} from '../../hooks/project';
import {effectiveTempo} from '../../utils/music-playback';
import {audcHasTunableNotes} from '../../utils/music-notes';
import {DEFAULT_DIM_PERCENT, dimVolume} from './soundfx';

const FRAMES_PER_SECOND = 60; // NTSC - matches "set tv ntsc" in bbasic.bb.hbs
// A held note's duration is stored in the low 7 bits of its own byte (see
// eventsToPages) - bit 7 is reused as the "this note fades" flag, so a
// channel with any fade in use caps a single event's hold at 127 frames
// instead of 255 (channels with no fade at all keep the full 255 range -
// see the final chunking pass in flattenSongEvents).
const MAX_EVENT_FRAMES_WITH_FADE = 127;
const MAX_EVENT_FRAMES_NO_FADE = 255;
// Only an event that ITSELF arpeggiates needs 3 more bits (see
// ARPEGGIO_PHASE_SEQUENCES) for its range/shape, cutting its own duration
// down to this - a rest or non-arpeggiating note on the very same channel
// isn't forced into this narrow cap too (see the per-event maxFrames in
// flattenSongEvents' final chunking pass, and the arpSpeedVar branch in
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
// amounts of dispatch code - not a hard format limit.
const MAX_MUSIC_PAGES = 8;

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
// when speed is too (see flattenSongEvents, which defaults arpeggioRange to
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

// Flattens a song's whole pattern sequence into one absolute-frame-timed
// event list per channel: {audv, audc, audf, frames}, including explicit
// {0,0,0,frames} rest/gap events so playback timing stays correct across
// silent stretches too. Mirrors utils/music-playback.js's own
// schedulePattern (identical tempo/step-to-seconds math) so ROM playback
// matches what the Music tab's own browser preview plays, just quantized to
// whole NTSC frames instead of continuous AudioContext seconds. Applies the
// Options tab's "Dim SFX volume" setting to every note's own AUDV, the same
// way soundfx_play does for one-shot sound effects (see soundfx.js) - so
// turning that on/off affects music playback consistently with everything
// else on the channel.
export const flattenSongEvents = (song, soundEffects, config = {}) => {
  const channels = musicChannelsUsedBySong(song);
  const perChannel = {};
  channels.forEach((channel) => {
    perChannel[channel] = [];
  });
  const channelCursorFrames = {};

  // Merges into the previous event when it holds the exact same register
  // values, fade flag, AND arpeggio speed/interval/range (e.g. two adjacent
  // rests either side of a pattern boundary) - same audio, fewer bytes. Left
  // un-chunked here on purpose: chunking to the per-channel frame-per-byte
  // limit only happens once, in a final pass below (see the final chunking
  // pass), so a long merged run always splits into the fewest possible
  // events instead of inheriting whatever chunk boundaries its original
  // pieces happened to have.
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

  (song.sequence || []).forEach((patternId) => {
    const pattern = (song.patterns || []).find(({id}) => `${id}` === `${patternId}`);
    if (!pattern) return;

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
      const patternStartFrames = channelCursorFrames[channel] || 0;
      let cursorFrames = patternStartFrames;

      notes.forEach((note) => {
        const startFrames = patternStartFrames + Math.round(note.startUnits * framesPerUnit);
        const lengthFrames = Math.max(1, Math.round(note.lengthUnits * framesPerUnit));
        if (startFrames > cursorFrames) {
          pushEvent(channel, 0, 0, 0, startFrames - cursorFrames);
          cursorFrames = startFrames;
        }
        pushEvent(channel, note.audv, note.audc, note.audf, lengthFrames, note.fade, note.arpeggioSpeed,
            note.arpeggioInterval, note.arpeggioRange, note.fadeLength);
        cursorFrames += lengthFrames;
      });

      // Fill any remaining silence to the end of this pattern, even a
      // channel with no notes in it, so the NEXT pattern in the sequence
      // still starts at the right absolute time for every channel.
      const patternEndFrames = patternStartFrames + patternTotalFrames;
      if (patternEndFrames > cursorFrames) {
        pushEvent(channel, 0, 0, 0, patternEndFrames - cursorFrames);
        cursorFrames = patternEndFrames;
      }
      channelCursorFrames[channel] = cursorFrames;
    });
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

// Finds the single song referenced across every music_play_song block in the
// project (there can only be one right now - see blocks/music.js) and builds
// its per-channel data pages (see eventsToPages - a channel needing more
// than one data table's worth of bytes spans several). Returns null if no
// music_play_song block exists. Throws a clear compile error if more than
// one distinct song is referenced, or if a channel's data would need more
// than MAX_MUSIC_PAGES tables (a sanity guard, not a real format limit).
export const resolveProjectMusic = (workspace) => {
  // Same "no song configured" path a project with zero music_play_song
  // blocks already takes (see the empty songIds.size check below) - every
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

  const songIds = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'music_play_song') songIds.add(block.getFieldValue('SONG'));
  });
  if (!songIds.size) return null;
  if (songIds.size > 1) {
    throw new Error('Only one song can be used for playback per project currently - ' +
      'every "Play song" block must reference the same song.');
  }
  const [songId] = songIds;
  const song = findSongById(songId);
  if (!song) return null;

  const soundEffects = processSoundEffectsStorageDefaults(useSoundEffectsStorage()).soundEffects;
  const config = (configurationStorage && configurationStorage.value) || {};
  const perChannel = flattenSongEvents(song, soundEffects, config);
  const channelPages = {};
  const channelHasFade = {};
  const channelHasArpeggio = {};
  Object.entries(perChannel).forEach(([channel, events]) => {
    const pages = eventsToPages(events);
    if (pages.length > MAX_MUSIC_PAGES) {
      throw new Error(`Song "${song.name || songId}" needs ${pages.length} data tables on channel ` +
        `${channel}, but only ${MAX_MUSIC_PAGES} are supported per channel currently - try a shorter song.`);
    }
    channelPages[channel] = pages;
    channelHasFade[channel] = musicChannelHasFade(events);
    channelHasArpeggio[channel] = musicChannelHasArpeggio(events);
  });
  return {songId, channelPages, channelHasFade, channelHasArpeggio};
};

export default (Blockly) => {
  // A dev-var canonical name only becomes an actual bBasic letter once
  // nameDB_.getName() resolves it - reserved once in bbasic.js's own
  // pre-scan (before letters are handed out), then re-resolved here at every
  // call site, exactly like collisionMoveOldXVar/canonicalDistanceVarName.
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  // Shared by both music_play_song and music_play_song_by_id below -
  // identical behavior either way (see the latter's own comment in
  // blocks/music.js for why its SONG_ID isn't even read here).
  const generatePlaySong = (block) => {
    const music = Blockly.BBasic.projectMusic;
    if (!music) return 'rem Song not found\n';
    const loop = block.getFieldValue('LOOP') === 'TRUE' ? 1 : 0;
    const flagsVar = resolveVar(musicFlagsVarName());
    const resetLines = Object.entries(music.channelPages).map(([channel, pages]) => {
      const pageReset = pages.length > 1 ? `${resolveVar(musicPageVarName(channel))} = 0\n` : '';
      // arpPhaseVar/arpCounterVar are only ever initialized here, at song
      // start, not on every note-fetch - see the comment in audcRead's
      // generation for why.
      const arpReset = music.channelHasArpeggio[channel] ?
        `${resolveVar(musicArpPhaseVarName(channel))} = 0\n${resolveVar(musicArpCounterVarName(channel))} = 1\n` :
        '';
      return `${resolveVar(musicIndexVarName(channel))} = 0\n${pageReset}${arpReset}` +
        `${resolveVar(musicTimerVarName(channel))} = 1\n` +
        `${flagsVar}{${musicChannelActiveBit(channel)}} = 1\n`;
    }).join('');
    return resetLines +
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
    return Object.entries(music.channelPages).map(([channel, pages]) => pages.map((bytes, page) => {
      const rows = chunk(bytes, 16).map((row) => '  ' + row.join(', '));
      return ` data ${musicDataTableName(channel, page)}\n${rows.join('\n')}\nend`;
    }).join('\n\n')).join('\n\n');
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
    // Reset fresh every generation (matches relocatableGraphicsUnits' own
    // reasoning in init()) - hooks/rom.js reads this after regenerateCode()
    // and merges it into the compiler's siblingFiles, the same mechanism
    // "inline text12a.asm" uses (see text-minikernel-files.js). EXPERIMENT:
    // testing whether inlining a real sibling .asm file at this same
    // mid-per-channel-dispatch position avoids the DASM local-label-scope
    // corruption a plain "asm ... end" block caused here (see the gate
    // check's own comment below).
    Blockly.BBasic.musicGateAsmFiles = {};
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
    const perChannelChecks = allChannels.map((channel) => {
      const pages = music.channelPages[channel];
      const tables = pages.map((_, page) => musicDataTableName(channel, page));
      const multiPage = tables.length > 1;
      const pageVar = multiPage ? resolveVar(musicPageVarName(channel)) : null;
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

      // A single LDA covering both the paused and active bit tests -
      // "inline"-d in from a real sibling .asm file (the exact same
      // mechanism text12a.asm/text12b.asm use), not a plain bB "if X{bit}
      // then goto" pair. Confirmed working: an embedded "asm ... end" block
      // tried at this same position first corrupted DASM's local-label
      // scoping for the rest of the file, but "inline"-ing a real file here
      // doesn't.
      const gateFile = `_musicgate${channel}.asm`;
      const gateFailLabel = `_music${channel}_gatefail`;
      const gateOkLabel = `_music${channel}_gateok`;
      Blockly.BBasic.musicGateAsmFiles[gateFile] = [
        ` lda ${flagsVar}`,
        ` and #${1 << musicPausedBit}`,
        ` bne ${gateFailLabel}`,
        ` lda ${flagsVar}`,
        ` and #${1 << musicChannelActiveBit(channel)}`,
        ` bne ${gateOkLabel}`,
        `${gateFailLabel}`,
        ` lda #0`,
        ` sta temp5`,
        ` jmp _music${channel}_gatedone`,
        `${gateOkLabel}`,
        ` lda #1`,
        ` sta temp5`,
        `_music${channel}_gatedone`,
      ].join('\n');

      return [
        ` inline ${gateFile}`,
        ` if temp5 = 0 then goto _music${channel}_skip`,
        ` ${timerVar} = ${timerVar} - 1`,
        ` if ${timerVar} <> 0 then goto _music${channel}_skip`,
        ...pagedReadLines(tables, pageVar, indexVar, `${channel}peek`),
        ...pageBreakCheck,
        ` if temp1 <> ${LOOP_SENTINEL} then goto _music${channel}_read`,
        ` if ${loopBit} then goto _music${channel}_loopreset`,
        ` AUDV${channel} = 0`,
        ` ${activeBit} = 0`,
        ...finishCheck,
        ` goto _music${channel}_skip`,
        `_music${channel}_loopreset`,
        ...(multiPage ? [` ${pageVar} = 0`] : []),
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
    // 1 fills up. Wrapping it as its own relocatable unit (the exact same
    // mechanism wrapRelocatableGraphics already uses for a background or
    // animation - "graphics" is a misnomer here, but the entry/return-label
    // redirect it builds works identically for any relocatable payload)
    // makes this movable too, without needing a whole separate relocation
    // mechanism of its own. Its own data tables (music.channelPages' raw
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
    return this.wrapRelocatableGraphics('musicUpdate', payload);
  };
};
