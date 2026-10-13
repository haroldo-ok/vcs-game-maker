'use strict';

// Plays back a Music tab pattern for previewing in the editor. Kept separate
// from utils/sound-preview.js's single-source preview: a pattern can have
// several instrument tracks sounding at once, which that module's "one
// active source at a time" design (built for the Sound tab's single "play
// this preset" button) can't represent. Reuses sound-preview.js's
// per-AUDC waveform synthesis (buzz/div31/gatedbuzz buffers, not just a
// plain oscillator) so a buzzy/noisy instrument like a drum "Kick" actually
// sounds buzzy here too, not like a clean tone.
import {
  AUDC_APPROXIMATIONS, buildBuzzBuffer, buildDiv31Buffer, buildGatedBuzzBuffer, buildSquareBuffer, getAudioContext,
  peekAudioContext, shiftClockFor,
} from './sound-preview';
import {DEFAULT_PATTERN_STEPS, DEFAULT_TEMPO, LENGTH_UNITS_PER_STEP} from '../blocks/music';
import {DEFAULT_DIM_PERCENT} from '../generators/bbasic/soundfx';
import {DEFAULT_ARPEGGIO_DIVISION, DEFAULT_NOISE_PRIORITY} from '../blocks/soundfx';
import {useDimSoundFxPercentStorage, useDimSoundFxStorage} from '../hooks/project';
import {noteAudf, noteAudv, soundHasTunableNotes} from './music-notes';
import {channelUsesTia, dpcPlusFor, playDpcPlusSound} from './dpc-preview';
import {buildEnvelopeCurve} from './envelope';

// The AudioContext is shared with the Sound tab's preview (utils/sound-preview.js).

// Every note's peak gain is individually capped at 0.3 (see peakGain in
// playInstrumentHit below), but that only ever bounds ONE note by itself -
// nothing stops several simultaneously-sounding notes/tracks from SUMMING
// past 1.0 once they all reach context.destination together, which Web
// Audio hard-clips rather than gracefully compressing. In practice this is
// a genuinely RARE edge case, not a routine one: real hardware only has 2
// audio channels, and 2 channels at 0.3 peak each only ever sum to 0.6 -
// comfortably under 1.0 by itself. A single shared limiter still sits
// between every note's output and the real destination as a safety net
// for whatever rare combination (DIM off, several overlapping arpeggio
// segments, etc.) DOES push past that, but deliberately gentle - soft knee,
// a moderate ratio, and slower attack/release than a "true" limiter would
// use. An earlier, much more aggressive version of this (20:1 ratio, 0dB
// hard knee, 1ms attack) was confirmed to be the wrong tool: on this buzzy/
// square-wave source material (not smooth musical audio), driving a fast,
// high-ratio compressor hard enough to react produced its audible
// pumping/distortion, including bleeding into whatever played right after
// the transient that triggered it - reported as "popping...even on
// different channels" and continuing to glitch on the very NEXT pattern
// after a loud one, exactly the kind of carry-over a compressor's
// gain-reduction envelope recovering slowly would cause. Lazily created
// alongside audioContext itself (one per AudioContext, same lifetime), not
// per-call - every note/track routes through this SAME node.
let masterLimiter = null;
const getMasterDestination = (context) => {
  if (!masterLimiter || masterLimiter.context !== context) {
    masterLimiter = context.createDynamicsCompressor();
    masterLimiter.threshold.setValueAtTime(-0.3, context.currentTime);
    masterLimiter.knee.setValueAtTime(6, context.currentTime);
    masterLimiter.ratio.setValueAtTime(4, context.currentTime);
    masterLimiter.attack.setValueAtTime(0.01, context.currentTime);
    masterLimiter.release.setValueAtTime(0.15, context.currentTime);
    masterLimiter.connect(context.destination);
  }
  return masterLimiter;
};

// NTSC, matching the compiled ROM's  per-frame arpeggio timer (see
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

// Matches the compiled ROM's  note envelope (see generators/bbasic/
// music.js's  per-note envelope-config index) - steps through the exact
// same per-frame AUDV curve (see utils/envelope.js's buildEnvelopeCurve),
// scaled from AUDV's 0-15 range down into this preview's  0-0.3 gain
// range, rather than a continuous fade - a stepped preview actually sounds
// like what plays in game instead of smoothing over the same discrete
// jumps.
//
// Holds flat at peakGain for the whole note otherwise (no envelope) - real
// AUDV hardware writes are just as abrupt, holding at whatever level they
// were last set to with no anti-click smoothing. This used to
// hold-then-linearRampToValueAtTime(0, ...) over a chunk of the note's
// end specifically to avoid the click a hard stop produces, which made
// every note sound smoother/cleaner than the real hardware does. A REAL
// instant step (jumping from full amplitude straight to 0 in a single
// sample) turned out to be more of a harsh POP than the same kind of click
// real hardware's  output actually has, though - real hardware's analog
// output stage still has some tiny natural rolloff from the circuit itself,
// it's just far too short to sound like a fade. CLICK_GUARD_SECONDS below
// is that same idea at a scale that's actually inaudible as a fade (a
// couple milliseconds, not tens) while still rounding off the single
// hardest edge of the waveform enough to not pop.
const CLICK_GUARD_SECONDS = 0.002;
const buildGain = (context, {peakGain, peakVolume, startTime, seconds, envelope, envelopeAttack,
  envelopeDecay, envelopeDecayEnd, envelopeReleaseStart, envelopeSustainLength, envelopeRelease, dimMultiplier = 1,
  destination = getMasterDestination(context)}) => {
  const gainNode = context.createGain();
  let endValue;
  if (envelope) {
    const totalFrames = Math.max(1, Math.round(seconds * FRAMES_PER_SECOND));
    // loopSustain: true - this is the Music tab's note preview (see this
    // file's playInstrumentHit), where a note longer than its instrument's
    // envelope loops Sustain to fill the gap instead of falling silent
    // (see utils/envelope.js's comment on clampEnvelopeStages for why
    // that's Music-only, not shared with the Sound tab's previewSoundEffect
    // in utils/sound-preview.js).
    const curve = buildEnvelopeCurve({
      attack: envelopeAttack, decay: envelopeDecay, decayEndPercent: envelopeDecayEnd,
      releaseStartPercent: envelopeReleaseStart, sustainLength: envelopeSustainLength, release: envelopeRelease,
      peakVolume, totalFrames, loopSustain: true,
    });
    // Only the frames where the level changes - a held level stays put until
    // the next automation point anyway, and a long note is hundreds of frames.
    curve.forEach((step, i) => {
      if (i === 0 || step !== curve[i - 1]) {
        gainNode.gain.setValueAtTime(step / 15 * 0.3 * dimMultiplier, startTime + i / FRAMES_PER_SECOND);
      }
    });
    endValue = curve[curve.length - 1] / 15 * 0.3 * dimMultiplier;
  } else {
    gainNode.gain.setValueAtTime(peakGain * dimMultiplier, startTime);
    endValue = peakGain * dimMultiplier;
  }
  // Re-anchors at whatever level the note ends on, right at the start of the
  // guard window, so the ramp below only covers that last sliver instead of
  // linearRampToValueAtTime interpolating all the way from the previous
  // automation point (the envelope's last step, or this same note's
  // start) clear through to the end.
  if (endValue > 0 && seconds > CLICK_GUARD_SECONDS) {
    const guardStart = startTime + seconds - CLICK_GUARD_SECONDS;
    gainNode.gain.setValueAtTime(endValue, guardStart);
    gainNode.gain.linearRampToValueAtTime(0, startTime + seconds);
  }
  gainNode.connect(destination);
  return gainNode;
};

// Rounds off the raw digital step at EVERY buffer boundary - not just a
// note's overall start/end (buildGain's CLICK_GUARD_SECONDS above), but
// each individual segment within a note too. This matters because an
// arpeggiating hit (see the while loop below) splices several DIFFERENT
// pre-rendered buffers back-to-back, each built at its phase's pitch -
// buffer A's last sample and buffer B's first sample can differ by almost
// the full waveform amplitude, an actual signal discontinuity no amount of
// smoothing on the OUTER note-level gain (buildGain) can fix, since that
// envelope stays constant/smoothly-curved straight through a flip - only
// something touching the signal at the flip itself can. Confirmed as the
// real remaining cause of a reported "popping" bug that persisted (just
// less severe) even after fixing the activeSources leak below: audible on
// every arpeggio flip, not just at a note's edges, and on a plain
// (non-arpeggio) note this also finally gives its START a fade-in to match
// the fade-out it already had - previously an instant full-volume step,
// the exact same discontinuity class as an arpeggio flip, just once per
// note instead of several times.
//
// A separate, tiny gain node per segment (not just reusing/extending
// buildGain's note-level one) so this works independently of whatever
// that outer envelope happens to be doing at this exact instant - stacking
// two ramps that both reach 0 at the same edge (e.g. this fade's
// fade-out landing exactly on a plain note's CLICK_GUARD_SECONDS
// fade-out) just compounds smoothly, not a conflict.
//
// Widened from 3ms to 6ms - still short enough that several of these in a
// row (this can fire many times per note, once per arpeggio flip, which can
// be as fast as every ~16ms) don't add up to an audible wobble in a note's
// volume, but 3ms turned out to still leave an audible click on pure tone
// (AUDC 4/5/12/13) specifically during real pattern/song preview playback
// (not an ordinary single click-to-place preview, and not the compiled ROM,
// which has no such fade at all - a real hardware register write is
// instant). A clean periodic waveform makes ANY edge discontinuity far more
// perceptually obvious than the exact same size jump is against a buzzy/
// noisy waveform's already-irregular signal (the same physical edge, just
// psychoacoustically masked for the buzzy types) - on top of that, pure
// tone's buffer (built at TIA_SAMPLE_RATE, 31440Hz, well below a real
// AudioContext's 44100/48000Hz) also needs Web Audio's automatic
// resampling to reach the real output rate, and a raw, unfiltered square
// wave's hard edges are exactly the signal shape that resampling filter
// handles worst - every edge, not just this fade's, picks up a little
// ringing, which a longer fade gives more room to average out. This fade is
// already applied uniformly to every AUDC type here, not just pure tone, so
// widening it helps all of them, pure tone most audibly.
const EDGE_FADE_SECONDS = 0.006;
const connectWithEdgeFade = (context, source, destination, segStartTime, segSeconds) => {
  const fade = Math.min(EDGE_FADE_SECONDS, segSeconds / 2);
  if (fade <= 0) {
    source.connect(destination);
    return null;
  }
  const edgeGain = context.createGain();
  edgeGain.gain.setValueAtTime(0, segStartTime);
  edgeGain.gain.linearRampToValueAtTime(1, segStartTime + fade);
  edgeGain.gain.setValueAtTime(1, segStartTime + segSeconds - fade);
  edgeGain.gain.linearRampToValueAtTime(0, segStartTime + segSeconds);
  source.connect(edgeGain);
  edgeGain.connect(destination);
  return edgeGain;
};

// Detaches a note's gain nodes from the output once every one of its sources
// has finished - otherwise each note (and each arpeggio segment) leaves its
// nodes connected for good, and the click-to-place preview alone adds a few
// per click. Listens with addEventListener so it doesn't replace the
// source's onended (pruneOnEnded's).
const disconnectWhenAllEnded = (sources, nodes) => {
  let remaining = sources.length;
  if (!remaining) {
    nodes.forEach((node) => node.disconnect());
    return;
  }
  sources.forEach((source) => source.addEventListener('ended', () => {
    remaining--;
    if (remaining === 0) nodes.forEach((node) => node.disconnect());
  }));
};

// Buffer-based waveforms (square/buzz/div31/gatedbuzz) are pure functions of
// (type, chip clock, duration, bits/stepDivider) - the same drum hit playing
// the same pitch for the same length, which a pattern does constantly (a
// Snare on every backbeat, say), was re-running the whole LFSR/step loop
// from scratch every single time instead of reusing the result. AudioBuffers
// are immutable once built and Web Audio explicitly supports handing the
// exact same one to any number of AudioBufferSourceNodes, so this just
// remembers each one it's already built. Unbounded, but keys are a small
// finite set in practice (a song only has so many distinct instrument/pitch/
// duration combinations) - nowhere near large enough to worry about memory.
const buzzBufferCache = new Map();
const MAX_CACHED_BUFFERS = 400;
const buildBufferCached = (context, approximation, chipClockHz, seconds) => {
  // Rounded for the cache key only (not the actual synthesis call below) -
  // two notes that are musically "the same" duration/pitch can still differ
  // by float noise in the 1e-10 range from how they were derived, which
  // would otherwise make this cache miss every time instead of the near-100%
  // hit rate a real song's repeated hits should get.
  const key = `${approximation.type}:${approximation.bits || ''}:${approximation.stepDivider || ''}:` +
    `${chipClockHz.toFixed(3)}:${seconds.toFixed(5)}`;
  let buffer = buzzBufferCache.get(key);
  if (!buffer) {
    if (approximation.type === 'square') {
      buffer = buildSquareBuffer(context, chipClockHz, seconds);
    } else if (approximation.type === 'div31') {
      buffer = buildDiv31Buffer(context, chipClockHz, seconds);
    } else if (approximation.type === 'gatedbuzz') {
      buffer = buildGatedBuzzBuffer(context, chipClockHz, seconds);
    } else {
      buffer = buildBuzzBuffer(context, chipClockHz, seconds, approximation.bits,
          {stepDivider: approximation.stepDivider});
    }
    // Bounded: a long editing session with many different pitches/lengths
    // would otherwise keep every buffer it ever built. Dropping the whole
    // cache just means rebuilding what is still used (buffers already in use
    // by a playing source stay alive through the source).
    if (buzzBufferCache.size >= MAX_CACHED_BUFFERS) buzzBufferCache.clear();
    buzzBufferCache.set(key, buffer);
  }
  return buffer;
};

// Synthesizes one AUDC/AUDF/AUDV instrument hit using the same per-AUDC
// waveform approximation as the Sound tab's  preview (see
// utils/sound-preview.js's AUDC_APPROXIMATIONS) - used for "Hit" steps
// (untunable instruments), where there's no chosen pitch, just the
// instrument's  characteristic sound. Returns null for a silent AUDC
// (0/11) - no sources are created.
// @param {number} [dimMultiplier] The "Dim SFX volume" percent (0-1, e.g.
//     0.25 for 25%) as a continuous gain multiplier, applied AFTER the
//     normal AUDV-to-gain conversion - deliberately NOT the same dimVolume()
//     the compiled ROM uses (generators/bbasic/soundfx.js), which rounds the
//     dimmed result back into a whole 0-15 AUDV step, since that's a real
//     hardware constraint (AUDV IS a 4-bit register) that doesn't apply to
//     this preview's continuous Web Audio gain - routing the preview
//     through that same rounding just threw away resolution for no reason
//     (e.g. a 25% dim of AUDV 3 rounds to AUDV 1, an effective ~67% cut, not
//     25%), confirmed as a real reported "not helpful" complaint.
// @return {Array<AudioNode>} Every source scheduled (usually one, but an
//     arpeggiating buffer-based hit schedules several short back-to-back
//     segments instead - see below).
const playInstrumentHit = (context, {audc, audf, audv, arpeggioSpeed, arpeggioInterval, arpeggioRange, startTime,
  seconds, envelope, envelopeAttack, envelopeDecay, envelopeDecayEnd, envelopeReleaseStart, envelopeSustainLength,
  envelopeRelease, dimMultiplier = 1, destination, dpcPlus = null}) => {
  // The DPC+ sound chip plays it, so it is rebuilt the way the chip does (see utils/dpc-preview.js).
  if (dpcPlus) {
    const {source} = playDpcPlusSound(context, {sound: dpcPlus.sound, frequency: dpcPlus.frequency, volume: audv, seconds,
      startTime, destination, loopSustain: true, dimMultiplier, arpeggioSpeed, arpeggioInterval, arpeggioRange});
    pruneOnEnded(source);
    return [source];
  }
  const approximation = AUDC_APPROXIMATIONS[`${audc}`];
  if (!approximation) return [];

  const peakGain = Math.min(1, Math.max(0, Number(audv) || 0) / 15) * 0.3;
  const gainNode = buildGain(context, {peakGain, peakVolume: audv, startTime, seconds, envelope,
    envelopeAttack, envelopeDecay, envelopeDecayEnd, envelopeReleaseStart, envelopeSustainLength, envelopeRelease,
    dimMultiplier, destination});

  const buildBuffer = (chipClockHz, segmentSeconds) =>
    buildBufferCached(context, approximation, chipClockHz, segmentSeconds);

  if (!arpeggioSpeed) {
    const source = context.createBufferSource();
    source.buffer = buildBuffer(shiftClockFor(audf, {slowClock: approximation.slowClock}), seconds);
    const edgeGain = connectWithEdgeFade(context, source, gainNode, startTime, seconds);
    source.start(startTime);
    source.stop(startTime + seconds);
    pruneOnEnded(source);
    disconnectWhenAllEnded([source], edgeGain ? [edgeGain, gainNode] : [gainNode]);
    return [source];
  }

  // A buffer is pre-rendered for one fixed clock, so it can't have its pitch
  // automated live like an oscillator - Arpeggio is previewed here instead
  // by scheduling several short buffers back-to-back, one per flip, each
  // built at that phase's  pitch (matching the compiled ROM, which has
  // no such limitation since it just writes AUDF directly every frame).
  const variants = arpeggioPitchVariants(audf, arpeggioInterval);
  const sequence = ARPEGGIO_PHASE_SEQUENCES[arpeggioRange] || ARPEGGIO_PHASE_SEQUENCES[0];
  const flipSeconds = arpeggioSpeed / FRAMES_PER_SECOND;
  const sources = [];
  const nodes = [gainNode];
  let t = startTime;
  let phase = 0;
  while (t < startTime + seconds) {
    const segmentSeconds = Math.min(flipSeconds, startTime + seconds - t);
    const chipClockHz = shiftClockFor(variants[sequence[phase % sequence.length]], {slowClock: approximation.slowClock});
    const source = context.createBufferSource();
    source.buffer = buildBuffer(chipClockHz, segmentSeconds);
    const edgeGain = connectWithEdgeFade(context, source, gainNode, t, segmentSeconds);
    if (edgeGain) nodes.push(edgeGain);
    source.start(t);
    source.stop(t + segmentSeconds);
    pruneOnEnded(source);
    sources.push(source);
    phase++;
    t += flipSeconds;
  }
  disconnectWhenAllEnded(sources, nodes);
  return sources;
};

let activeSources = [];
let stopTimer = null;

// Drops a finished source from activeSources the moment it actually ends,
// instead of leaving it there for the rest of the (possibly looping)
// playback session - without this, activeSources only ever GREW, every
// note of every pass appending to it and nothing ever removing anything
// until Stop, since a looping pattern/sequence can run for an arbitrarily
// long time (see schedulePattern's comment on trackGain needing the
// exact same "don't just keep piling up dead nodes forever" fix for the
// exact same reason). Confirmed as the real cause of a reported bug
// ("popping...occur[ring] more when patterns are played for a
// second/third/etc time"): thousands of long-dead-but-still-referenced
// AudioBufferSourceNodes (each holding onto its AudioBuffer) piling up
// over a session's worth of loop passes raises GC pressure over time,
// which - per LOOP_RESCHEDULE_LEAD_SECONDS' comment on this scheduler
// being vulnerable to main-thread jank - is exactly the kind of thing that
// makes the JS-timer-driven reschedule callbacks run late, and a late
// reschedule is audible as exactly this kind of glitch. 'ended' fires
// whether a source ran to its natural stop() time or was cut short by
// stopPatternPlayback's explicit .stop() call, so this covers both.
const pruneOnEnded = (source) => {
  source.onended = () => {
    activeSources = activeSources.filter((s) => s !== source);
  };
};

// One entry per pattern currently scheduled to play, in order - {patternId,
// startTime, endTime, unitSeconds} (all AudioContext-clock seconds/units, see
// LENGTH_UNITS_PER_STEP). playSequence knows every pattern's  slot
// upfront (schedulePattern already returns each one's length before moving
// on to the next); playPattern only ever has ONE entry at a time, replaced
// every time its loop reschedules itself. Read by getPlaybackHead below to
// drive the Music tab's  playhead/sequence-highlight UI - has no effect
// on playback itself.
let playbackTimeline = [];

// stepSeconds/LENGTH_UNITS_PER_STEP, the same conversion schedulePattern
// itself uses to place notes - shared so getPlaybackHead's callers can turn
// a playing pattern's elapsed seconds back into the same units notes are
// positioned in.
const unitSecondsForTempo = (tempo) => (30 / Math.max(1, Number(tempo) || 120)) / LENGTH_UNITS_PER_STEP;

// One persistent GainNode per currently-scheduled track (pattern id + track
// id - same key shape as MusicEditor.vue's  mutedTrackKey), routed
// between that track's  notes and the shared master limiter
// (getMasterDestination) - see schedulePattern, which creates/updates one
// of these per track instead of connecting each note straight to the
// limiter the way previewPatternNote's one-off click preview still does
// (it has no track to mute independently). Its whole reason to
// exist: a GainNode's
// .gain.value is live - setting it takes effect immediately on whatever
// audio is already flowing through it, unlike an individual note's
// gain envelope (see buildGain), which is baked in once at schedule time
// and can't be changed after the fact. setTrackMuted below is what actually
// flips it, called from MusicEditor.vue's  mute toggle.
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
  const context = peekAudioContext();
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
  // The per-track gain nodes only exist for this playback session: dropped
  // here so a long editing session doesn't keep one connected node for every
  // pattern/track ever played (the next Play makes fresh ones).
  trackMuteGains.forEach((gainNode) => gainNode.disconnect());
  trackMuteGains.clear();
};

/**
 * Where playback currently is, for the Music tab's  playhead/sequence
 * highlight - purely a UI query, reads the AudioContext clock without
 * scheduling or changing anything.
 * @return {?{patternId: number, sequenceIndex: ?number, elapsedUnits: number}}
 *     Null when nothing is currently playing (including the brief lead-in
 *     before the first note's scheduled startTime).
 */
export const getPlaybackHead = () => {
  const context = peekAudioContext();
  if (!context || !playbackTimeline.length) return null;
  const now = context.currentTime;
  const segment = playbackTimeline.find(({startTime, endTime}) => now >= startTime && now < endTime);
  if (!segment) return null;
  return {
    patternId: segment.patternId,
    // Which step of the song's  Sequence list this segment came from -
    // only set during playSequence (see its  timeline.push); undefined
    // for a lone pattern preview (playPattern), which isn't part of any
    // sequence. Lets the Sequence list highlight the exact chip currently
    // sounding rather than every chip sharing this pattern's id (see
    // isSequenceStepPlaying in MusicEditor.vue).
    sequenceIndex: segment.sequenceIndex,
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
 *     AUDF - a real chosen pitch for a tunable instrument, or the
 *     instrument's  preset AUDF for an untunable one's "Hit". Also the
 *     instrument's  Arpeggio settings (arpeggio/arpeggioDivision/
 *     arpeggioInterval/arpeggioRange - same fields playPattern/playSequence
 *     read off the sound effect itself) and tempo (the owning pattern's
 *     effective BPM - see effectiveTempo - defaulting to DEFAULT_TEMPO for a
 *     call site with no pattern, e.g. the Sound tab's Play
 *     button), so a placed note previews arpeggio exactly like it'll
 *     actually play back, not as a single static pitch.
 */
export const previewPatternNote = ({audc, audf, audv, arpeggio, arpeggioDivision, arpeggioInterval, arpeggioRange,
  soundEffect = null, midi = null, tia = false, tempo = DEFAULT_TEMPO}) => {
  const context = getAudioContext();
  // Same "Dim SFX volume" Options-tab setting applied everywhere else this
  // note could be heard (pattern/song playback, the compiled ROM) - without
  // this, a click-to-place preview would sound louder than the note
  // actually plays back everywhere else. A continuous gain multiplier here
  // (see playInstrumentHit's dimMultiplier comment), not dimVolume()'s
  // AUDV-rounded version - that rounding is a real compiled-ROM hardware
  // constraint that doesn't apply to this preview's Web Audio gain.
  const dimMultiplier = useDimSoundFxStorage().value ?
    (Number(useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value) || 0) / 100 : 1;
  // Same 50ms lead-in playPattern/playSequence already schedule their
  // startTime at (see their comment on this), not context.currentTime
  // directly - without it, buildGain/connectWithEdgeFade's fade-in ramps
  // get scheduled at (or behind) the audio clock's current instant, so the
  // engine has no room left to actually render them before output starts
  // and the ramp collapses into the exact instant jump it exists to avoid -
  // confirmed as the real remaining cause of a reported "popping" that
  // only happened on this instant single-note preview (click-to-place/
  // drag), never during pattern/song playback, which already had this lead-in.
  const startTime = context.currentTime + 0.05;
  const seconds = 0.18;

  // Same tempo-relative-to-frames conversion playPattern/playSequence use
  // for the exact same fields (see their  comment on arpeggioSpeed) - a
  // standalone note preview has no pattern of its  to read a real tempo
  // from, so tempo defaults to DEFAULT_TEMPO instead.
  const stepSeconds = 30 / tempo;
  const arpeggioSpeed = arpeggio ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(
      (stepSeconds / (Number(arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)) * FRAMES_PER_SECOND,
  ))) : 0;
  const resolvedArpeggioInterval = arpeggio ? Number(arpeggioInterval) || 0 : 0;
  const resolvedArpeggioRange = arpeggio ? Number(arpeggioRange) || 0 : 0;

  playInstrumentHit(context, {
    audc, audf, audv, startTime, seconds, dimMultiplier, dpcPlus: soundEffect && !tia ? dpcPlusFor(soundEffect, midi) : null,
    arpeggioSpeed, arpeggioInterval: resolvedArpeggioInterval, arpeggioRange: resolvedArpeggioRange,
  });
};

/**
 * A pattern's  Tempo field is only used when its "use this pattern's tempo"
 * checkbox is checked (see the checkbox next to the pattern's Tempo field on
 * the Music tab) - otherwise it follows its song's top-level Tempo.
 * @param {Object} song The pattern's  song.
 * @param {Object} pattern The pattern to resolve a tempo for.
 * @return {number} The BPM to actually play this pattern at.
 */
export const effectiveTempo = (song, pattern) =>
  Math.max(1, Number(pattern.useOwnTempo ? pattern.tempo : song.tempo) || 120);

// How long to wait before forcibly stopping every scheduled source, in
// real wall-clock milliseconds from right now. totalSeconds only measures
// the duration FROM startTime (an AudioContext timestamp already 50ms in
// the future - see playPattern/playSequence's  startTime), not from
// "now" - using context.currentTime again here (rather than assuming
// startTime's 50ms lead-in is still exactly 50ms away) accounts for both
// that lead-in and however long the synchronous scheduling work itself
// took, so the last note always gets its  full 100ms grace period
// instead of losing most of it to an unaccounted-for head start.
const STOP_TIMER_GRACE_MS = 100;
const stopTimerDelayMs = (context, startTime, totalSeconds) =>
  Math.max(0, (startTime + totalSeconds - context.currentTime) * 1000) + STOP_TIMER_GRACE_MS;

// Schedules one pattern's note events starting at startTime (an AudioContext
// timestamp), returning how many seconds it takes - shared by playPattern
// (a single pattern) and playSequence (patterns chained back-to-back) so a
// pattern's  scheduling logic only lives in one place. Each note event is
// {step, midi, audf, length} - BOTH step and length are in
// LENGTH_UNITS_PER_STEP units (not whole steps), so a note can both start at
// and be held for any sub-step slice (see the subdivision dropdown on the
// Music tab), not just whole-step boundaries/durations. Untunable
// instruments (see utils/music-notes.js) only ever have "hit" events,
// played via their  AUDC's waveform approximation rather than a chosen
// pitch.
const schedulePattern = (context, pattern, soundEffects, startTime, tempo, isTrackMuted = () => false,
    startUnits = 0) => {
  // Two steps per beat (each step is an eighth note), not one step per beat -
  // one-step-per-beat played everything at exactly half the expected speed
  // for a given BPM, confirmed as "roughly 2x slower than it should be".
  const stepSeconds = 30 / tempo;
  const unitSeconds = stepSeconds / LENGTH_UNITS_PER_STEP;
  const stepCount = pattern.stepCount || DEFAULT_PATTERN_STEPS;

  // Same app-wide "Dim SFX volume" setting the compiled ROM applies (see
  // flattenPatternEvents in generators/bbasic/music.js) - read fresh each call
  // rather than cached, for the same reason as everywhere else this hook is
  // used (a computed() over localStorage would keep serving a stale value).
  const dimSoundFx = useDimSoundFxStorage();
  const dimSoundFxPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT);

  let maxEndUnits = stepCount * LENGTH_UNITS_PER_STEP;

  // Every track's notes, grouped by channel - mirrors flattenPatternEvents'
  // notesByChannel in generators/bbasic/music.js, so a note overlapping
  // another note on the same channel previews with the exact same
  // Priority-based win/lose outcome the compiled ROM actually plays,
  // instead of both tracks' audio just layering on top of each other the
  // way independent Web Audio destinations otherwise would. canPlaceNoteAt
  // in MusicEditor.vue lets any instrument, tunable or noise, land on top
  // of another track's note sharing the same channel, so any note here can
  // reach the overlap branch below.
  const notesByChannel = {};
  pattern.tracks.forEach((track) => {
    const soundEffect = soundEffects.find(({id}) => id == track.soundEffectId);
    if (!soundEffect) return;
    // Every track's notes are scheduled regardless of its CURRENT mute
    // state - muting only sets this gain node to 0 rather than skipping
    // scheduling entirely, so toggling mute mid-playback (see
    // setTrackMuted) can actually make an already-scheduled track audible
    // again, not just silence one that wasn't muted yet when this ran.
    //
    // Reused across every repeat/chip that schedules this same pattern+
    // track, rather than a fresh createGain() each call - a long song calls
    // this once per repeat of every chip, and a discarded-but-still-
    // connected GainNode isn't freed until every source feeding it has
    // finished AND it's no longer referenced, so constantly abandoning one
    // for a brand new one left a steadily growing number of live nodes in
    // the graph for the browser to keep rendering, worse the further into a
    // song playback got - confirmed as a real, worsening-over-time drain,
    // not just a theoretical one.
    const trackKey = trackMuteKey(pattern, track);
    let trackGain = trackMuteGains.get(trackKey);
    if (!trackGain) {
      trackGain = context.createGain();
      trackGain.connect(getMasterDestination(context));
      trackMuteGains.set(trackKey, trackGain);
    }
    trackGain.gain.value = isTrackMuted(pattern, track) ? 0 : 1;
    // Whether THIS note gets its  chosen pitch or the instrument's fixed
    // hit-audf is decided from the instrument's  CURRENT Sound type
    // (audc), not from whatever was true when the note was originally
    // placed (note.midi) - otherwise changing an instrument's Sound type
    // after placing notes for it leaves them playing back with a stale
    // pitch. This is deliberately NOT what picks the waveform/synthesis
    // function below - playInstrumentHit always makes that call itself from
    // AUDC_APPROXIMATIONS, since several tunable Sound types (e.g. AUDC 1's
    // "buzzy tones") still need the buffer-based buzzy synthesis, not a
    // plain square oscillator.
    const tiaTrack = channelUsesTia(track.channel);
    const isTunable = soundHasTunableNotes(soundEffect, tiaTrack);
    // Same "always on for every note this instrument plays" rule as the
    // compiled ROM (see soundfx.js/generators/bbasic/music.js) - not
    // something set per-note. arpeggioDivision is tempo-relative (e.g. 8 =
    // "flip every 1/8 step"), converted to actual frames using this
    // pattern's  tempo, same formula as generators/bbasic/music.js's
    // flattenPatternEvents so the preview's flip rate matches the compiled ROM.
    const arpeggioSpeed = soundEffect.arpeggio ? Math.max(1, Math.min(MAX_ARPEGGIO_SPEED_FRAMES, Math.round(
        (stepSeconds / (Number(soundEffect.arpeggioDivision) || DEFAULT_ARPEGGIO_DIVISION)) * FRAMES_PER_SECOND,
    ))) : 0;
    const arpeggioInterval = soundEffect.arpeggio ? Number(soundEffect.arpeggioInterval) || 0 : 0;
    const arpeggioRange = soundEffect.arpeggio ? Number(soundEffect.arpeggioRange) || 0 : 0;
    const channel = Number(track.channel) || 0;
    if (!notesByChannel[channel]) notesByChannel[channel] = [];

    (track.notes || []).forEach((note) => {
      // Notes that have already fully finished by startUnits (see
      // handleSeekToStep in MusicEditor.vue - clicking the piano roll's
      // step ruler seeks playback there) are skipped entirely - a still-
      // scheduled note that's only PARTWAY through at startUnits is instead
      // clipped by schedule() below.
      if (note.step + note.length <= startUnits) return;
      maxEndUnits = Math.max(maxEndUnits, note.step + note.length);
      const audf = isTunable && note.midi !== 'hit' ? noteAudf(note, soundEffect, tiaTrack) : soundEffect.audf;
      // Per-note override (see the Music tab's  piano-roll volume row),
      // falling back to the instrument's  preset. DIM is applied as a
      // continuous gain multiplier (see playInstrumentHit's
      // dimMultiplier comment) rather than pre-rounding audv through
      // dimVolume() - that rounding is a real compiled-ROM AUDV-is-a-4-bit-
      // register constraint that doesn't apply to this preview's
      // continuous Web Audio gain.
      const audv = noteAudv(note, soundEffect);
      const dimMultiplier = dimSoundFx.value ? (Number(dimSoundFxPercent.value) || 0) / 100 : 1;
      notesByChannel[channel].push({
        startUnits: note.step, endUnits: note.step + note.length,
        priority: Number(soundEffect.priority) || DEFAULT_NOISE_PRIORITY,
        trackGain, audc: soundEffect.audc, audf, audv, dimMultiplier, arpeggioSpeed, arpeggioInterval, arpeggioRange,
        dpcPlus: tiaTrack ? null : dpcPlusFor(soundEffect, note.midi),
        envelope: !!soundEffect.envelope,
        envelopeAttack: soundEffect.envelopeAttack,
        envelopeDecay: soundEffect.envelopeDecay,
        envelopeDecayEnd: soundEffect.envelopeDecayEnd,
        envelopeReleaseStart: soundEffect.envelopeReleaseStart,
        envelopeSustainLength: soundEffect.envelopeSustainLength,
        envelopeRelease: soundEffect.envelopeRelease,
      });
    });
  });

  // Actually schedules one surviving [segStartUnits, segEndUnits) slice of
  // a note - a note that's never interrupted schedules its  one full
  // span; one that gets cut short by a higher (or equal, later-starting)
  // Priority note schedules only the piece before the interruption, plus a
  // second call for whatever's left over once the interruption ends (see
  // the overlap resolution below).
  const schedule = (note, segStartUnits, segEndUnits) => {
    const audibleStartUnits = Math.max(segStartUnits, startUnits);
    if (audibleStartUnits >= segEndUnits) return;
    activeSources.push(...playInstrumentHit(context, {
      audc: note.audc, audf: note.audf, audv: note.audv, dimMultiplier: note.dimMultiplier,
      arpeggioSpeed: note.arpeggioSpeed, arpeggioInterval: note.arpeggioInterval, arpeggioRange: note.arpeggioRange,
      startTime: startTime + (audibleStartUnits - startUnits) * unitSeconds,
      seconds: (segEndUnits - audibleStartUnits) * unitSeconds,
      envelope: note.envelope, envelopeAttack: note.envelopeAttack, envelopeDecay: note.envelopeDecay,
      envelopeDecayEnd: note.envelopeDecayEnd, envelopeReleaseStart: note.envelopeReleaseStart,
      envelopeSustainLength: note.envelopeSustainLength, envelopeRelease: note.envelopeRelease,
      destination: note.trackGain, dpcPlus: note.dpcPlus,
    }));
  };

  Object.values(notesByChannel).forEach((notes) => {
    notes.sort((a, b) => a.startUnits - b.startUnits);
    // The note (if any) still sounding, not yet fully scheduled - same
    // "cut short, schedule the interrupter, then resume whatever's left"
    // idea as flattenPatternEvents'  openNote, just scheduling real
    // audio segments here instead of building byte-stream events.
    let open = null;
    notes.forEach((note) => {
      const overlapsOpen = open && note.startUnits < open.endUnits;
      if (overlapsOpen && note.priority < open.priority) {
        // Lower Priority than what's already sounding - dropped entirely,
        // the open note keeps playing straight through unchanged.
        return;
      }
      if (overlapsOpen) {
        schedule(open, open.startUnits, note.startUnits);
        schedule(note, note.startUnits, note.endUnits);
        open = open.endUnits > note.endUnits ? {...open, startUnits: note.endUnits} : null;
        return;
      }
      if (open) schedule(open, open.startUnits, open.endUnits);
      open = note;
    });
    if (open) schedule(open, open.startUnits, open.endUnits);
  });

  return Math.max(0, maxEndUnits - startUnits) * unitSeconds;
};

/**
 * Plays back one pattern in isolation.
 * @param {Object} song The pattern's  song (only used to resolve its
 *     tempo when the pattern follows the song's - see effectiveTempo).
 * @param {Object} pattern The pattern to play.
 * @param {Array<Object>} soundEffects Stored Sound tab presets.
 * @param {{onDone: Function, isTrackMuted: Function}} callbacks
 *     onDone is called once playback finishes (never, while
 *     song.patternPreviewLoop is set - only stopPatternPlayback ends it
 *     then); isTrackMuted(pattern, track) skips a muted instrument's
 *     notes entirely (a Music tab view preference, not something the
 *     compiled ROM has any concept of).
 *     startUnits (default 0) seeks the first pass to start partway through
 *     the pattern instead of from its  beginning - see handleSeekToStep
 *     in MusicEditor.vue. Only the first pass; a looping pattern's later
 *     passes always restart from 0, same as clicking Play normally would.
 *     Whether to loop is read live off song.patternPreviewLoop (one shared
 *     preference for every pattern in the song, not stored per pattern -
 *     see its  comment in blocks/music.js) on every single pass (not
 *     captured once up front), same as its notes already were - so toggling
 *     Loop mid-playback (see handleToggleLoopPattern in MusicEditor.vue)
 *     takes effect on the very next pass, rather than only after Stop/Play
 *     again.
 */
export const playPattern = (song, pattern, soundEffects, {onDone, isTrackMuted, startUnits = 0} = {}) => {
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
  // previous pass's  tail can still be genuinely playing during that
  // early-scheduling window, and Stop needs to still catch it.
  // Widened from an original 0.2s - confirmed as a real cause of dropped
  // notes: this is JS-timer-scheduled (see the setTimeout below), so if the
  // main thread is busy long enough when it's due to fire (e.g. several
  // Music tab pattern cards expanded at once, each with its  large piano
  // roll re-rendering), it can run late. A short note's entire start-to-end
  // window can fall entirely in the past by the time a late-running call
  // like that finally executes, so it never audibly plays at all - a long
  // note surviving the exact same delay just fine, since most of its
  // duration is still ahead of it either way. A wider margin doesn't fix
  // main-thread jank itself, just gives this scheduler more room to
  // tolerate it before a short note's window is at risk.
  const LOOP_RESCHEDULE_LEAD_SECONDS = 0.5;
  const scheduleOnce = (startTime, passStartUnits) => {
    const tempo = effectiveTempo(song, pattern);
    const totalSeconds = schedulePattern(context, pattern, soundEffects, startTime, tempo, isTrackMuted,
        passStartUnits);
    const endTime = startTime + totalSeconds;
    // Appended, not replaced - the NEXT pass is scheduled
    // LOOP_RESCHEDULE_LEAD_SECONDS before the CURRENT one's  endTime (see
    // the comment above), so there's a real window where this pass is still
    // genuinely playing but a plain replace would already have thrown its
    // timeline entry away. getPlaybackHead's  find() only ever matches
    // whichever entry now actually falls within, so keeping the old one
    // around a little longer costs nothing - it just stops that window from
    // reporting no current segment at all, which fell back to showing the
    // ARMED marker (wherever playback was originally seeked FROM) for that
    // whole window, read as the playhead flashing back to the old position
    // right before every loop. Pruned to just the current pass once a loop
    // actually completes, so this can't grow across a long-running loop.
    // Pruned against real current time, not this new pass's  startTime -
    // the immediately-preceding pass's endTime EQUALS this pass's startTime
    // exactly (back-to-back, no gap), so comparing against startTime would
    // drop it right away, before the lead window it's specifically meant to
    // survive has even elapsed.
    playbackTimeline = playbackTimeline.filter(({endTime: prevEndTime}) => prevEndTime > context.currentTime);
    playbackTimeline.push({
      patternId: pattern.id, startTime, endTime, unitSeconds: unitSecondsForTempo(tempo), startUnits: passStartUnits,
    });
    // Always scheduled near this pass's  end, regardless of whether
    // song.patternPreviewLoop happens to be on or off right now - the
    // ACTUAL decision (loop again, or stop) is only made once this callback
    // fires, reading it fresh at that point. A pass that STARTED as
    // non-looping used to never check again before calling onDone, so
    // turning Loop ON partway through it did nothing until Play was clicked
    // again - confirmed directly as a real bug, the mirror image of the
    // (already working) loop-ON-to-OFF direction, which happened to work
    // already only because that direction's  decision was already
    // re-checked here on every pass.
    const delayMs = Math.max(0, (endTime - LOOP_RESCHEDULE_LEAD_SECONDS - context.currentTime) * 1000);
    stopTimer = window.setTimeout(() => {
      if (song.patternPreviewLoop) {
        scheduleOnce(endTime, 0);
      } else {
        stopTimer = window.setTimeout(() => {
          stopTimer = null;
          activeSources = [];
          if (onDone) onDone();
        }, stopTimerDelayMs(context, endTime, 0));
      }
    }, delayMs);
  };
  scheduleOnce(context.currentTime + 0.05, Math.max(0, startUnits));
};

/**
 * Plays back a song's full pattern sequence, one pattern after another in
 * the order set on the Sequence (play order) list - each pattern uses its
 * effective tempo/step count as it plays.
 * @param {Object} song The song whose sequence to play.
 * @param {Array<Object>} soundEffects Stored Sound tab presets.
 * @param {{onDone: Function, isTrackMuted: Function, startIndex: number}} callbacks
 *     Called once playback finishes (never, while song.loop is set - see its
 *     comment in blocks/music.js); isTrackMuted(pattern, track) skips a
 *     muted instrument's  notes entirely (see playPattern). Whether to
 *     loop is read live off song.loop on every pass, same reasoning as
 *     playPattern's  song.patternPreviewLoop - see its comment. startIndex (default
 *     0) skips straight to that Sequence GROUP (see blocks/music.js's
 *     {id, patternId, count} shape) on the first pass instead of starting
 *     from the beginning - see handleSequenceChipClick in MusicEditor.vue,
 *     which uses this to jump playback to whichever chip was clicked while
 *     the song is already playing. Only the first pass; a looping song's
 *     later passes always restart at group 0, same as clicking Play
 *     normally would (matches playPattern's  startUnits).
 */
export const playSequence = (song, soundEffects, {onDone, isTrackMuted, startIndex = 0} = {}) => {
  stopPatternPlayback();
  const context = getAudioContext();

  // Mirrors playPattern's  self-rescheduling loop (see its comment for
  // the full reasoning), but at CHIP granularity instead of whole-sequence
  // granularity: only the one chip-repeat about to play is scheduled now,
  // with the next one armed via a timer that re-reads song.sequence live
  // right before it fires. The original version scheduled every chip for
  // an entire pass upfront in one synchronous walk of song.sequence, so
  // adding/removing/reordering chips mid-playback had no effect until the
  // whole sequence looped back around to the start (confirmed directly as
  // a real bug) - re-reading per chip instead means an edit takes effect
  // on the very next chip transition, same as a pattern/note edit already
  // does within schedulePattern itself.
  // Widened from an original 0.2s - confirmed as a real cause of dropped
  // notes: this is JS-timer-scheduled (see the setTimeout below), so if the
  // main thread is busy long enough when it's due to fire (e.g. several
  // Music tab pattern cards expanded at once, each with its  large piano
  // roll re-rendering), it can run late. A short note's entire start-to-end
  // window can fall entirely in the past by the time a late-running call
  // like that finally executes, so it never audibly plays at all - a long
  // note surviving the exact same delay just fine, since most of its
  // duration is still ahead of it either way. A wider margin doesn't fix
  // main-thread jank itself, just gives this scheduler more room to
  // tolerate it before a short note's window is at risk.
  const LOOP_RESCHEDULE_LEAD_SECONDS = 0.5;
  const scheduleGroup = (startTime, sequenceIndex, repIndex) => {
    const sequence = song.sequence || [];
    if (sequenceIndex >= sequence.length) {
      // End of one full pass - same "decide fresh, right at the boundary"
      // reasoning as playPattern's  song.patternPreviewLoop check, so
      // toggling Loop either direction mid-playback takes effect on the
      // very next boundary rather than only sometimes.
      if (song.loop) {
        scheduleGroup(startTime, 0, 0);
      } else {
        stopTimer = window.setTimeout(() => {
          stopTimer = null;
          activeSources = [];
          if (onDone) onDone();
        }, stopTimerDelayMs(context, startTime, 0));
      }
      return;
    }
    const group = sequence[sequenceIndex];
    const pattern = song.patterns.find(({id}) => id == group.patternId);
    if (!pattern) {
      // Stale/deleted pattern reference - skip straight to the next chip
      // rather than stalling playback on it.
      scheduleGroup(startTime, sequenceIndex + 1, 0);
      return;
    }
    const tempo = effectiveTempo(song, pattern);
    // Re-derived from the live group on every repeat (not captured once for
    // all of a chip's repeats), so editing a chip's  repeat count
    // mid-playback is picked up the same way any other sequence edit is.
    const repeatCount = Math.max(1, Math.round(Number(group.count) || 1));
    const segmentSeconds = schedulePattern(context, pattern, soundEffects, startTime, tempo, isTrackMuted);
    const endTime = startTime + segmentSeconds;
    // Same "keep the previous entry around a little past its  end"
    // reasoning as playPattern's  comment - appended/filtered on every
    // chip transition now, not just once per whole pass.
    playbackTimeline = [
      ...playbackTimeline.filter(({endTime: prevEndTime}) => prevEndTime > context.currentTime),
      {
        patternId: pattern.id, sequenceIndex, startTime, endTime,
        unitSeconds: unitSecondsForTempo(tempo), startUnits: 0,
      },
    ];
    const nextRepIndex = repIndex + 1;
    const [nextSequenceIndex, nextRepStart] = nextRepIndex < repeatCount ?
      [sequenceIndex, nextRepIndex] : [sequenceIndex + 1, 0];
    const delayMs = Math.max(0, (endTime - LOOP_RESCHEDULE_LEAD_SECONDS - context.currentTime) * 1000);
    stopTimer = window.setTimeout(() => {
      scheduleGroup(endTime, nextSequenceIndex, nextRepStart);
    }, delayMs);
  };
  scheduleGroup(context.currentTime + 0.05, Math.max(0, startIndex), 0);
};
