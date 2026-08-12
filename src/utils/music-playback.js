'use strict';

// Plays back a Music tab pattern for previewing in the editor. Kept separate
// from utils/sound-preview.js's single-source preview: a pattern can have
// several instrument tracks sounding at once, which that module's "one
// active source at a time" design (built for the Sound tab's single "play
// this preset" button) can't represent. Reuses sound-preview.js's own
// per-AUDC waveform synthesis (buzz/div31/gatedbuzz buffers, not just a
// plain oscillator) so a buzzy/noisy instrument like a drum "Kick" actually
// sounds buzzy here too, not like a clean tone.
import {
  AUDC_APPROXIMATIONS, buildBuzzBuffer, buildDiv31Buffer, buildGatedBuzzBuffer, shiftClockFor,
  fadeTargetGain,
} from './sound-preview';
import {DEFAULT_PATTERN_STEPS, DEFAULT_TEMPO, LENGTH_UNITS_PER_STEP} from '../blocks/music';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';
import {DEFAULT_ARPEGGIO_DIVISION, DEFAULT_FADE_LENGTH} from '../blocks/soundfx';
import {useConfigurationStorage} from '../hooks/project';
import {audcHasTunableNotes} from './music-notes';

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

const SLOW_CLOCK_AUDCS = new Set(['12', '13']);
// NTSC, matching the compiled ROM's own per-frame arpeggio timer (see
// generators/bbasic/music.js) - arpeggioSpeed is a frame count there, so
// previewing it here needs the same frames-to-seconds conversion to sound
// like what the ROM will actually play.
const FRAMES_PER_SECOND = 60;
// Mirrors MAX_ARPEGGIO_SPEED_FRAMES in generators/bbasic/music.js exactly
// (duplicated for the same reason as ARPEGGIO_PHASE_SEQUENCES below) - the
// ROM has to clamp to this since it's stored in a 4-bit nibble, so the
// preview clamps too, rather than playing a slower, unclamped rate the ROM
// can never actually produce.
const MAX_ARPEGGIO_SPEED_FRAMES = 15;

// Mirrors ARPEGGIO_PHASE_SEQUENCES in generators/bbasic/music.js exactly (by
// ARPEGGIO_RANGE_* index - see blocks/soundfx.js) - duplicated here rather
// than imported, since that module already imports effectiveTempo from this
// one, and importing back would make the two modules circular.
const ARPEGGIO_PHASE_SEQUENCES = [
  ['base', 'alt'], // UP 1 OCT
  ['alt', 'base'], // DOWN 1 OCT
  ['base', 'alt', 'upBase', 'upAlt'], // UP 2 OCT
  ['base', 'alt', 'downBase', 'downAlt'], // DOWN 2 OCT
  ['base', 'alt', 'base'], // UP-DOWN 1 OCT
  ['base', 'alt', 'upBase', 'upAlt', 'upBase', 'alt'], // UP-DOWN 2 OCT
];

// AUDF hardware only reads the low 5 bits (0-31) - mirrors the exact same
// masking/derivation generateMusicChecks applies in the compiled ROM (see
// generators/bbasic/music.js): alt is base MINUS interval (AUDF is a
// frequency divisor, so subtracting is what makes alt sound higher-pitched
// than the root, matching what "arpeggio interval" implies - adding would
// make it lower, backwards), up is base halved (one octave higher), down is
// base doubled (one octave lower) - all wrapped to 5 bits the same way, so a
// pitch near the top/bottom of the range wraps around identically in this
// preview instead of the two disagreeing.
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

// Schedules an oscillator's frequency to step through the current
// Arpeggio's pitch sequence (see ARPEGGIO_PHASE_SEQUENCES), one step every
// arpeggioSpeed frames, for the note's whole duration - same abrupt jump
// (not a smooth slide) as the real per-frame register write in
// generateMusicChecks. A no-op (single, steady frequency) when arpeggioSpeed
// is falsy.
const scheduleArpeggioFrequency = (oscillator, {
  audf, slowClock, arpeggioSpeed, arpeggioInterval, arpeggioRange, startTime, seconds,
}) => {
  if (!arpeggioSpeed) {
    oscillator.frequency.setValueAtTime(shiftClockFor(audf, {slowClock}) / 2, startTime);
    return;
  }
  const variants = arpeggioPitchVariants(audf, arpeggioInterval);
  const sequence = ARPEGGIO_PHASE_SEQUENCES[arpeggioRange] || ARPEGGIO_PHASE_SEQUENCES[0];
  const frequencies = sequence.map((key) => shiftClockFor(variants[key], {slowClock}) / 2);
  const flipSeconds = arpeggioSpeed / FRAMES_PER_SECOND;
  let t = startTime;
  let phase = 0;
  while (t < startTime + seconds) {
    oscillator.frequency.setValueAtTime(frequencies[phase % frequencies.length], t);
    phase++;
    t += flipSeconds;
  }
};

// Matches the compiled ROM's own fade (see fadeVar in
// generators/bbasic/music.js): the last fadeLengthFrames of the note step
// down to fadeTargetGain(peakGain) instead of a smooth ramp, same as
// utils/sound-preview.js's own one-shot fade - only THEN does the short
// releaseSeconds ramp to silence happen (from that lower target, not from
// peakGain), matching how the ROM's own hardware note-off works.
// fadeLengthFrames is this instrument's own per-preset Fade length (see
// FADE_LENGTH_OPTIONS in blocks/soundfx.js) - 0/falsy means no fade at all.
const buildGain = (context, {peakGain, startTime, seconds, releaseSeconds, fadeLengthFrames,
  destination = context.destination}) => {
  const gainNode = context.createGain();
  const releaseStart = startTime + Math.max(0, seconds - releaseSeconds);
  const fadeSeconds = (Number(fadeLengthFrames) || 0) / FRAMES_PER_SECOND;
  if (fadeSeconds > 0) {
    // Clamped to startTime (not just startTime+seconds-fadeSeconds) - a
    // note shorter than its own instrument's configured fade length fades
    // for its whole duration instead of not fading at all, matching the
    // same ">" (not exact-length) fix in the ROM's own fadeApply.
    const fadeStart = Math.max(startTime, startTime + seconds - fadeSeconds);
    const target = fadeTargetGain(peakGain);
    gainNode.gain.setValueAtTime(peakGain, startTime);
    gainNode.gain.setValueAtTime(peakGain, fadeStart);
    gainNode.gain.setValueAtTime(target, fadeStart);
    gainNode.gain.setValueAtTime(target, releaseStart);
  } else {
    gainNode.gain.setValueAtTime(peakGain, startTime);
    gainNode.gain.setValueAtTime(peakGain, releaseStart);
  }
  gainNode.gain.linearRampToValueAtTime(0, startTime + seconds);
  gainNode.connect(destination);
  return gainNode;
};

// A plain square-wave tone at an EXACT pitch - only used for genuine pitched
// notes (from a pure-tone instrument's own note grid), where audf is already
// the specific note the user picked, not derived from the instrument's AUDC
// approximation.
const playTone = (context, {
  audf, slowClock, arpeggioSpeed, arpeggioInterval, arpeggioRange, peakGain, startTime, seconds, releaseSeconds,
  fadeLengthFrames, destination,
}) => {
  const gainNode = buildGain(context, {peakGain, startTime, seconds, releaseSeconds, fadeLengthFrames, destination});
  const oscillator = context.createOscillator();
  oscillator.type = 'square';
  scheduleArpeggioFrequency(oscillator, {
    audf, slowClock, arpeggioSpeed, arpeggioInterval, arpeggioRange, startTime, seconds,
  });
  oscillator.connect(gainNode);
  oscillator.start(startTime);
  oscillator.stop(startTime + seconds);
  return oscillator;
};

// Synthesizes one AUDC/AUDF/AUDV instrument hit using the same per-AUDC
// waveform approximation as the Sound tab's own preview (see
// utils/sound-preview.js's AUDC_APPROXIMATIONS) - used for "Hit" steps
// (untunable instruments), where there's no chosen pitch, just the
// instrument's own characteristic sound. Returns null for a silent AUDC
// (0/11) - no sources are created.
// @return {Array<AudioNode>} Every source scheduled (usually one, but an
//     arpeggiating buffer-based hit schedules several short back-to-back
//     segments instead - see below).
const playInstrumentHit = (context, {audc, audf, audv, arpeggioSpeed, arpeggioInterval, arpeggioRange, startTime,
  seconds, releaseSeconds, fadeLengthFrames, destination}) => {
  const approximation = AUDC_APPROXIMATIONS[`${audc}`];
  if (!approximation) return [];

  const peakGain = Math.min(1, Math.max(0, Number(audv) || 0) / 15) * 0.3;
  const gainNode = buildGain(context, {peakGain, startTime, seconds, releaseSeconds, fadeLengthFrames, destination});

  if (approximation.type === 'square') {
    const source = context.createOscillator();
    source.type = 'square';
    scheduleArpeggioFrequency(source, {
      audf, slowClock: approximation.slowClock, arpeggioSpeed, arpeggioInterval, arpeggioRange, startTime, seconds,
    });
    source.connect(gainNode);
    source.start(startTime);
    source.stop(startTime + seconds);
    return [source];
  }

  const buildBuffer = (chipClockHz, segmentSeconds) => {
    if (approximation.type === 'div31') return buildDiv31Buffer(context, chipClockHz, segmentSeconds);
    if (approximation.type === 'gatedbuzz') return buildGatedBuzzBuffer(context, chipClockHz, segmentSeconds);
    return buildBuzzBuffer(context, chipClockHz, segmentSeconds, approximation.bits,
        {stepDivider: approximation.stepDivider});
  };

  if (!arpeggioSpeed) {
    const source = context.createBufferSource();
    source.buffer = buildBuffer(shiftClockFor(audf, {slowClock: approximation.slowClock}), seconds);
    source.connect(gainNode);
    source.start(startTime);
    source.stop(startTime + seconds);
    return [source];
  }

  // A buffer is pre-rendered for one fixed clock, so it can't have its pitch
  // automated live like an oscillator - Arpeggio is previewed here instead
  // by scheduling several short buffers back-to-back, one per flip, each
  // built at that phase's own pitch (matching the compiled ROM, which has
  // no such limitation since it just writes AUDF directly every frame).
  const variants = arpeggioPitchVariants(audf, arpeggioInterval);
  const sequence = ARPEGGIO_PHASE_SEQUENCES[arpeggioRange] || ARPEGGIO_PHASE_SEQUENCES[0];
  const flipSeconds = arpeggioSpeed / FRAMES_PER_SECOND;
  const sources = [];
  let t = startTime;
  let phase = 0;
  while (t < startTime + seconds) {
    const segmentSeconds = Math.min(flipSeconds, startTime + seconds - t);
    const chipClockHz = shiftClockFor(variants[sequence[phase % sequence.length]], {slowClock: approximation.slowClock});
    const source = context.createBufferSource();
    source.buffer = buildBuffer(chipClockHz, segmentSeconds);
    source.connect(gainNode);
    source.start(t);
    source.stop(t + segmentSeconds);
    sources.push(source);
    phase++;
    t += flipSeconds;
  }
  return sources;
};

let activeSources = [];
let stopTimer = null;

// One entry per pattern currently scheduled to play, in order - {patternId,
// startTime, endTime, unitSeconds} (all AudioContext-clock seconds/units, see
// LENGTH_UNITS_PER_STEP). playSequence knows every pattern's own slot
// upfront (schedulePattern already returns each one's length before moving
// on to the next); playPattern only ever has ONE entry at a time, replaced
// every time its loop reschedules itself. Read by getPlaybackHead below to
// drive the Music tab's own playhead/sequence-highlight UI - has no effect
// on playback itself.
let playbackTimeline = [];

// stepSeconds/LENGTH_UNITS_PER_STEP, the same conversion schedulePattern
// itself uses to place notes - shared so getPlaybackHead's callers can turn
// a playing pattern's elapsed seconds back into the same units notes are
// positioned in.
const unitSecondsForTempo = (tempo) => (30 / Math.max(1, Number(tempo) || 120)) / LENGTH_UNITS_PER_STEP;

// One persistent GainNode per currently-scheduled track (pattern id + track
// id - same key shape as MusicEditor.vue's own mutedTrackKey), routed
// between that track's own notes and context.destination - see
// schedulePattern, which creates/updates one of these per track instead of
// connecting straight to context.destination the way previewPatternNote's
// one-off click preview still does. Its whole reason to exist: a GainNode's
// own .gain.value is live - setting it takes effect immediately on whatever
// audio is already flowing through it, unlike an individual note's own
// gain envelope (see buildGain), which is baked in once at schedule time
// and can't be changed after the fact. setTrackMuted below is what actually
// flips it, called from MusicEditor.vue's own mute toggle.
const trackMuteGains = new Map();
const trackMuteKey = (pattern, track) => `${pattern.id}:${track.id}`;

/**
 * Live-mutes/unmutes a track that's currently mid-playback, without
 * interrupting or rescheduling anything - notes already playing when this
 * is called are affected immediately, same as the compiled ROM has no
 * concept of at all (this is a Music tab preview-only feature). A no-op if
 * this track isn't part of anything currently scheduled (nothing to find in
 * trackMuteGains yet - the next time it IS scheduled, schedulePattern reads
 * the current mute state fresh anyway).
 * @param {Object} pattern The pattern the track belongs to.
 * @param {Object} track The track to mute/unmute.
 * @param {boolean} muted Whether it should be silent from now on.
 */
export const setTrackMuted = (pattern, track, muted) => {
  const gainNode = trackMuteGains.get(trackMuteKey(pattern, track));
  if (gainNode) gainNode.gain.value = muted ? 0 : 1;
};

/** Stops whatever pattern playback is currently in progress, if any. */
export const stopPatternPlayback = () => {
  if (stopTimer) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }
  const context = audioContext;
  const now = context ? context.currentTime : 0;
  activeSources.forEach((source) => {
    try {
      source.stop(now);
    } catch (e) {
      // Already stopped/never started - nothing left to do.
    }
  });
  activeSources = [];
  playbackTimeline = [];
};

/**
 * Where playback currently is, for the Music tab's own playhead/sequence
 * highlight - purely a UI query, reads the AudioContext clock without
 * scheduling or changing anything.
 * @return {?{patternId: number, elapsedUnits: number}} Null when nothing is
 *     currently playing (including the brief lead-in before the first note's
 *     scheduled startTime).
 */
export const getPlaybackHead = () => {
  if (!audioContext || !playbackTimeline.length) return null;
  const now = audioContext.currentTime;
  const segment = playbackTimeline.find(({startTime, endTime}) => now >= startTime && now < endTime);
  if (!segment) return null;
  return {
    patternId: segment.patternId,
    // segment.startUnits (0 unless this pass was itself seeked - see
    // handleSeekToStep) is added back in so this always reads as an
    // absolute position within the pattern, matching note.step, not just
    // how far into THIS particular playback pass we are.
    elapsedUnits: segment.startUnits + (now - segment.startTime) / segment.unitSeconds,
  };
};

/**
 * Plays a single note immediately, for instant feedback when placing a note
 * in the piano roll - independent of any in-progress pattern playback.
 * @param {Object} sound The instrument's AUDC/AUDV plus the specific note's
 *     own AUDF - a real chosen pitch for a tunable instrument, or the
 *     instrument's own preset AUDF for an untunable one's "Hit". Also the
 *     instrument's own Arpeggio settings (arpeggio/arpeggioDivision/
 *     arpeggioInterval/arpeggioRange - same fields playPattern/playSequence
 *     read off the sound effect itself) and tempo (the owning pattern's own
 *     effective BPM - see effectiveTempo - defaulting to DEFAULT_TEMPO for a
 *     call site with no pattern of its own, e.g. the Sound tab's Play
 *     button), so a placed note previews arpeggio exactly like it'll
 *     actually play back, not as a single static pitch.
 */
export const previewPatternNote = ({audc, audf, audv, arpeggio, arpeggioDivision, arpeggioInterval, arpeggioRange,
  tempo = DEFAULT_TEMPO}) => {
  const context = getAudioContext();
  const approximation = AUDC_APPROXIMATIONS[`${audc}`];
  // Same "Dim SFX volume" Options-tab setting applied everywhere else this
  // note could be heard (pattern/song playback, the compiled ROM) - without
  // this, a click-to-place preview would sound louder than the note
  // actually plays back everywhere else.
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const dimmedAudv = config.dimSoundFx ?
    dimVolume(audv, config.dimSoundFxPercent ?? DEFAULT_DIM_PERCENT) : audv;
  const peakGain = Math.min(1, Math.max(0, Number(dimmedAudv) || 0) / 15) * 0.3;
  const startTime = context.currentTime;
  const seconds = 0.18;
  const releaseSeconds = 0.05;

  // Same tempo-relative-to-frames conversion playPattern/playSequence use
  // for the exact same fields (see their own comment on arpeggioSpeed) - a
  // standalone note preview has no pattern of its own to read a real tempo
  // from, so tempo defaults to DEFAULT_TEMPO instead.
  const stepSeconds = 30 / tempo;
  const arpeggioSpeed = arpeggio ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(
      (stepSeconds / (Number(arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)) * FRAMES_PER_SECOND,
  ))) : 0;
  const resolvedArpeggioInterval = arpeggio ? Number(arpeggioInterval) || 0 : 0;
  const resolvedArpeggioRange = arpeggio ? Number(arpeggioRange) || 0 : 0;

  if (approximation && approximation.type === 'square') {
    const slowClock = SLOW_CLOCK_AUDCS.has(`${audc}`);
    playTone(context, {
      audf,
      slowClock,
      peakGain,
      startTime,
      seconds,
      releaseSeconds,
      arpeggioSpeed,
      arpeggioInterval: resolvedArpeggioInterval,
      arpeggioRange: resolvedArpeggioRange,
    });
  } else {
    playInstrumentHit(context, {
      audc, audf, audv: dimmedAudv, startTime, seconds, releaseSeconds,
      arpeggioSpeed, arpeggioInterval: resolvedArpeggioInterval, arpeggioRange: resolvedArpeggioRange,
    });
  }
};

/**
 * A pattern's own Tempo field is only used when its "use own tempo"
 * checkbox is checked (see the checkbox next to the pattern's Tempo field on
 * the Music tab) - otherwise it follows its song's top-level Tempo.
 * @param {Object} song The pattern's own song.
 * @param {Object} pattern The pattern to resolve a tempo for.
 * @return {number} The BPM to actually play this pattern at.
 */
export const effectiveTempo = (song, pattern) =>
  Math.max(1, Number(pattern.useOwnTempo ? pattern.tempo : song.tempo) || 120);

// How long to wait before forcibly stopping every scheduled source, in
// real wall-clock milliseconds from right now. totalSeconds only measures
// the duration FROM startTime (an AudioContext timestamp already 50ms in
// the future - see playPattern/playSequence's own startTime), not from
// "now" - using context.currentTime again here (rather than assuming
// startTime's 50ms lead-in is still exactly 50ms away) accounts for both
// that lead-in and however long the synchronous scheduling work itself
// took, so the last note always gets its own full 100ms grace period
// instead of losing most of it to an unaccounted-for head start.
const STOP_TIMER_GRACE_MS = 100;
const stopTimerDelayMs = (context, startTime, totalSeconds) =>
  Math.max(0, (startTime + totalSeconds - context.currentTime) * 1000) + STOP_TIMER_GRACE_MS;

// Schedules one pattern's note events starting at startTime (an AudioContext
// timestamp), returning how many seconds it takes - shared by playPattern
// (a single pattern) and playSequence (patterns chained back-to-back) so a
// pattern's own scheduling logic only lives in one place. Each note event is
// {step, midi, audf, length} - BOTH step and length are in
// LENGTH_UNITS_PER_STEP units (not whole steps), so a note can both start at
// and be held for any sub-step slice (see the subdivision dropdown on the
// Music tab), not just whole-step boundaries/durations. Untunable
// instruments (see utils/music-notes.js) only ever have "hit" events,
// played via their own AUDC's waveform approximation rather than a chosen
// pitch.
const schedulePattern = (context, pattern, soundEffects, startTime, tempo, isTrackMuted = () => false,
    startUnits = 0) => {
  // Two steps per beat (each step is an eighth note), not one step per beat -
  // one-step-per-beat played everything at exactly half the expected speed
  // for a given BPM, confirmed as "roughly 2x slower than it should be".
  const stepSeconds = 30 / tempo;
  const unitSeconds = stepSeconds / LENGTH_UNITS_PER_STEP;
  const stepCount = pattern.stepCount || DEFAULT_PATTERN_STEPS;

  // Same "Dim SFX volume" Options-tab setting the compiled ROM applies (see
  // flattenPatternEvents in generators/bbasic/music.js) - read fresh each call
  // rather than cached, for the same reason as everywhere else this hook is
  // used (a computed() over localStorage would keep serving a stale value).
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};

  let maxEndUnits = stepCount * LENGTH_UNITS_PER_STEP;
  pattern.tracks.forEach((track) => {
    const soundEffect = soundEffects.find(({id}) => id == track.soundEffectId);
    if (!soundEffect) return;
    // Every track's notes are scheduled regardless of its CURRENT mute
    // state - muting only sets this gain node to 0 rather than skipping
    // scheduling entirely, so toggling mute mid-playback (see
    // setTrackMuted) can actually make an already-scheduled track audible
    // again, not just silence one that wasn't muted yet when this ran.
    const trackGain = context.createGain();
    trackGain.gain.value = isTrackMuted(pattern, track) ? 0 : 1;
    trackGain.connect(context.destination);
    trackMuteGains.set(trackMuteKey(pattern, track), trackGain);
    // Whether THIS note gets its own chosen pitch or the instrument's fixed
    // hit-audf is decided from the instrument's own CURRENT Sound type
    // (audc), not from whatever was true when the note was originally
    // placed (note.midi) - otherwise changing an instrument's Sound type
    // after placing notes for it leaves them playing back with a stale
    // pitch. This is deliberately NOT what picks the waveform/synthesis
    // function below - playInstrumentHit always makes that call itself from
    // AUDC_APPROXIMATIONS, since several tunable Sound types (e.g. AUDC 1's
    // "buzzy tones") still need the buffer-based buzzy synthesis, not a
    // plain square oscillator.
    const isTunable = audcHasTunableNotes(soundEffect.audc);
    const audv = config.dimSoundFx ?
      dimVolume(soundEffect.audv, config.dimSoundFxPercent ?? DEFAULT_DIM_PERCENT) : soundEffect.audv;
    // Same "always on for every note this instrument plays" rule as the
    // compiled ROM (see soundfx.js/generators/bbasic/music.js) - not
    // something set per-note. arpeggioDivision is tempo-relative (e.g. 8 =
    // "flip every 1/8 step"), converted to actual frames using this
    // pattern's own tempo, same formula as generators/bbasic/music.js's
    // flattenPatternEvents so the preview's flip rate matches the compiled ROM.
    const arpeggioSpeed = soundEffect.arpeggio ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(
        (stepSeconds / (Number(soundEffect.arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)) * FRAMES_PER_SECOND,
    ))) : 0;
    const arpeggioInterval = soundEffect.arpeggio ? Number(soundEffect.arpeggioInterval) || 0 : 0;
    const arpeggioRange = soundEffect.arpeggio ? Number(soundEffect.arpeggioRange) || 0 : 0;

    (track.notes || []).forEach((note) => {
      // Notes that have already fully finished by startUnits (see
      // handleSeekToStep in MusicEditor.vue - clicking the piano roll's
      // step ruler seeks playback there) are skipped entirely; one that's
      // already PARTWAY through at startUnits starts audibly right away
      // (clipped to whatever's left of it), rather than either replaying
      // its already-passed beginning or waiting for its original start time
      // that's now in the past.
      if (note.step + note.length <= startUnits) return;
      const audibleStartUnits = Math.max(note.step, startUnits);
      const noteStart = startTime + (audibleStartUnits - startUnits) * unitSeconds;
      const heldSeconds = (note.step + note.length - audibleStartUnits) * unitSeconds;
      const releaseSeconds = Math.min(heldSeconds * 0.2, 0.08);
      const audf = isTunable && note.midi !== 'hit' ? note.audf : soundEffect.audf;

      activeSources.push(...playInstrumentHit(context, {
        audc: soundEffect.audc,
        audf,
        audv,
        arpeggioSpeed,
        arpeggioInterval,
        arpeggioRange,
        startTime: noteStart,
        seconds: heldSeconds,
        releaseSeconds,
        fadeLengthFrames: soundEffect.fade ? (Number(soundEffect.fadeLength) || DEFAULT_FADE_LENGTH) : 0,
        destination: trackGain,
      }));
      maxEndUnits = Math.max(maxEndUnits, note.step + note.length);
    });
  });

  return Math.max(0, maxEndUnits - startUnits) * unitSeconds;
};

/**
 * Plays back one pattern in isolation.
 * @param {Object} song The pattern's own song (only used to resolve its
 *     tempo when the pattern follows the song's - see effectiveTempo).
 * @param {Object} pattern The pattern to play.
 * @param {Array<Object>} soundEffects Stored Sound tab presets.
 * @param {{onDone: Function, isTrackMuted: Function, loop: boolean}} callbacks
 *     onDone is called once playback finishes (never, if loop is set - only
 *     stopPatternPlayback ends it then); isTrackMuted(pattern, track) skips a
 *     muted instrument's own notes entirely (a Music tab view preference,
 *     not something the compiled ROM has any concept of).
 *     startUnits (default 0) seeks the first pass to start partway through
 *     the pattern instead of from its own beginning - see handleSeekToStep
 *     in MusicEditor.vue. Only the first pass; a looping pattern's later
 *     passes always restart from 0, same as clicking Play normally would.
 */
export const playPattern = (song, pattern, soundEffects, {onDone, isTrackMuted, loop, startUnits = 0} = {}) => {
  stopPatternPlayback();
  const context = getAudioContext();

  // Re-schedules itself from scratch every pass instead of one long
  // upfront loop, so a Length/note edit made mid-loop is picked up on the
  // very next pass rather than only after manually restarting playback.
  // stopPatternPlayback (called again by any later playPattern/playSequence,
  // or directly to just stop) clears this same stopTimer, which is what
  // actually ends the loop - there's no separate "still looping" flag to
  // fall out of sync with it.
  //
  // The next pass's audio is scheduled to start at the EXACT end of this
  // one (startTime + totalSeconds), and the JS callback that does that
  // scheduling fires a little BEFORE that moment (not after it, the way the
  // non-looping stopTimerDelayMs path does for onDone) - Web Audio nodes
  // scheduled for a future startTime play exactly then regardless of how
  // early the synchronous scheduling call itself ran, so this closes what
  // would otherwise be an audible gap every time the loop repeats.
  // activeSources is intentionally NOT reset between passes here (only
  // stopPatternPlayback and the final non-looping pass clear it) - the
  // previous pass's own tail can still be genuinely playing during that
  // early-scheduling window, and Stop needs to still catch it.
  const LOOP_RESCHEDULE_LEAD_SECONDS = 0.2;
  const scheduleOnce = (startTime, passStartUnits) => {
    const tempo = effectiveTempo(song, pattern);
    const totalSeconds = schedulePattern(context, pattern, soundEffects, startTime, tempo, isTrackMuted,
        passStartUnits);
    const endTime = startTime + totalSeconds;
    // Appended, not replaced - the NEXT pass is scheduled
    // LOOP_RESCHEDULE_LEAD_SECONDS before the CURRENT one's own endTime (see
    // the comment above), so there's a real window where this pass is still
    // genuinely playing but a plain replace would already have thrown its
    // timeline entry away. getPlaybackHead's own find() only ever matches
    // whichever entry now actually falls within, so keeping the old one
    // around a little longer costs nothing - it just stops that window from
    // reporting no current segment at all, which fell back to showing the
    // ARMED marker (wherever playback was originally seeked FROM) for that
    // whole window, read as the playhead flashing back to the old position
    // right before every loop. Pruned to just the current pass once a loop
    // actually completes, so this can't grow across a long-running loop.
    // Pruned against real current time, not this new pass's own startTime -
    // the immediately-preceding pass's endTime EQUALS this pass's startTime
    // exactly (back-to-back, no gap), so comparing against startTime would
    // drop it right away, before the lead window it's specifically meant to
    // survive has even elapsed.
    playbackTimeline = playbackTimeline.filter(({endTime: prevEndTime}) => prevEndTime > context.currentTime);
    playbackTimeline.push({
      patternId: pattern.id, startTime, endTime, unitSeconds: unitSecondsForTempo(tempo), startUnits: passStartUnits,
    });
    if (loop) {
      const delayMs = Math.max(0, (endTime - LOOP_RESCHEDULE_LEAD_SECONDS - context.currentTime) * 1000);
      stopTimer = window.setTimeout(() => scheduleOnce(endTime, 0), delayMs);
    } else {
      stopTimer = window.setTimeout(() => {
        stopTimer = null;
        activeSources = [];
        if (onDone) onDone();
      }, stopTimerDelayMs(context, startTime, totalSeconds));
    }
  };
  scheduleOnce(context.currentTime + 0.05, Math.max(0, startUnits));
};

/**
 * Plays back a song's full pattern sequence, one pattern after another in
 * the order set on the Sequence (play order) list - each pattern uses its
 * own effective tempo/step count as it plays.
 * @param {Object} song The song whose sequence to play.
 * @param {Array<Object>} soundEffects Stored Sound tab presets.
 * @param {{onDone: Function, isTrackMuted: Function}} callbacks Called once
 *     playback finishes; isTrackMuted(pattern, track) skips a muted
 *     instrument's own notes entirely (see playPattern).
 */
export const playSequence = (song, soundEffects, {onDone, isTrackMuted} = {}) => {
  stopPatternPlayback();
  const context = getAudioContext();
  const startTime = context.currentTime + 0.05;

  let cursorSeconds = 0;
  const timeline = [];
  (song.sequence || []).forEach((patternId) => {
    const pattern = song.patterns.find(({id}) => id == patternId);
    if (!pattern) return;
    const tempo = effectiveTempo(song, pattern);
    const segmentStart = startTime + cursorSeconds;
    const segmentSeconds = schedulePattern(context, pattern, soundEffects, segmentStart, tempo, isTrackMuted);
    timeline.push({
      patternId: pattern.id, startTime: segmentStart, endTime: segmentStart + segmentSeconds,
      unitSeconds: unitSecondsForTempo(tempo), startUnits: 0,
    });
    cursorSeconds += segmentSeconds;
  });
  playbackTimeline = timeline;

  stopTimer = window.setTimeout(() => {
    stopTimer = null;
    activeSources = [];
    if (onDone) onDone();
  }, stopTimerDelayMs(context, startTime, cursorSeconds));
};
