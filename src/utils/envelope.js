'use strict';

// Shared by the ROM generator (both one-shot sound effects and Music-tab
// instrument notes), the browser preview (utils/sound-preview.js,
// utils/music-playback.js), and the envelope graph (components/
// EnvelopeGraph.vue) - all three build the exact same AUDV-per-frame curve
// from the same inputs, so the picture the user drags always matches what
// actually plays, both in the browser and in the compiled ROM.
//
// AUDV is 4-bit (0-15) write-only TIA hardware, so there's no real curve at
// runtime - just a sequence of discrete volume writes, one per frame.
// Attack ramps 0 -> peakVolume, Decay ramps peakVolume -> decayEndVolume,
// Sustain ramps decayEndVolume -> releaseStartVolume over its configured
// `sustainLength` frames (NOT a flat hold - there's no single "sustain
// level" anymore, just two independently settable endpoints, so the
// in-between stage is a ramp rather than a plateau) - repeating that same
// ramp as a loop if Sustain needs to run longer than that AND the caller
// opted into `loopSustain` (see clampEnvelopeStages' comment for who does
// and doesn't). Then Release ramps releaseStartVolume -> 0 over the
// following `release` frames - i.e. Release starts the instant Sustain
// ends, NOT always anchored to the sound/note's last frame the way it
// originally was (see sustainLength's comment in blocks/soundfx.js for why
// that changed - Sustain used to have no length at all). releaseStartVolume
// is deliberately NOT clamped to decayEndVolume (or vice versa) - either
// one can be the higher of the two, letting Sustain ramp up into Release
// instead of only ever ramping down, a real reported request ("increase
// the volume at the release point above the volume set for sustain").

// If attack+decay+sustainLength+release together don't fit within
// totalFrames, every stage is scaled down proportionally (rounded) rather
// than truncated - same spirit as the old one-stage Fade's "a note
// shorter than its fade length still fades for its whole duration
// instead of not fading at all" clamp, just generalized to 4 stages instead
// of 1.
//
// The opposite case - totalFrames LONGER than the four stages combined -
// extends Sustain (never Attack/Decay/Release, which stay exactly however
// long the instrument preset set them to) to fill the gap, rather than
// leaving the curve to fall silent for whatever's left after Release
// finishes (buildEnvelopeCurve's final "else" branch below) - but ONLY when
// the caller explicitly opts in via `loopSustain` (default false, i.e. the
// silent-gap behavior is still what everything gets unless it asks
// otherwise). A real reported request, SPECIFICALLY for Music tab notes: a
// note placed in the piano roll longer than its instrument's envelope
// should hold through Sustain for as long as the note itself lasts, with
// Release still playing in full and still landing exactly on the note's
// last frame - same as a real synth holding Sustain until note-off before
// Release ever starts, regardless of how long that hold ends up needing to
// be. Confirmed NOT wanted for one-shot Sound Effects previewed/played from
// the Sound tab - those should keep playing exactly as before (silent for
// whatever's left of Duration once the envelope finishes) - so every Sound
// FX call site leaves `loopSustain` at its default false, and only the
// Music tab's note-handling call sites (generators/bbasic/music.js,
// utils/music-playback.js) pass true.
//
// Exported separately (not just inlined into buildEnvelopeCurve below)
// because the ROM generator needs these exact clamped/extended stage
// lengths themselves - not just the resulting curve - to size/index its
// per-stage data tables (see generateEnvelopeChecks in generators/bbasic/
// soundfx.js).
export const clampEnvelopeStages = ({attack, decay, sustainLength, release, totalFrames, loopSustain = false}) => {
  const frames = Math.max(1, Math.round(Number(totalFrames) || 0));
  let a = Math.max(0, Math.round(Number(attack) || 0));
  let d = Math.max(0, Math.round(Number(decay) || 0));
  let s = Math.max(0, Math.round(Number(sustainLength) || 0));
  let r = Math.max(0, Math.round(Number(release) || 0));
  const stagesTotal = a + d + s + r;
  if (stagesTotal > frames) {
    const scale = frames / stagesTotal;
    a = Math.round(a * scale);
    d = Math.round(d * scale);
    s = Math.round(s * scale);
    r = Math.max(0, frames - a - d - s);
  } else if (loopSustain && stagesTotal < frames) {
    s += frames - stagesTotal;
  }
  return {attack: a, decay: d, sustainLength: s, release: r};
};

export const buildEnvelopeCurve = ({attack, decay, decayEndPercent, sustainLength, releaseStartPercent, release,
  peakVolume, totalFrames, loopSustain = false}) => {
  const frames = Math.max(1, Math.round(Number(totalFrames) || 0));
  const peak = Math.max(0, Math.min(15, Math.round(Number(peakVolume) || 0)));
  const decayEndVolume = Math.max(0, Math.min(peak, Math.round(peak * (Number(decayEndPercent) || 0) / 100)));
  const releaseStartVolume =
    Math.max(0, Math.min(peak, Math.round(peak * (Number(releaseStartPercent) || 0) / 100)));
  const {attack: a, decay: d, sustainLength: s, release: r} =
    clampEnvelopeStages({attack, decay, sustainLength, release, totalFrames: frames, loopSustain});

  const releaseStart = a + d + s;
  const releaseEnd = releaseStart + r;
  const curve = [];
  for (let i = 0; i < frames; i++) {
    if (i < a) {
      curve.push(a === 0 ? peak : Math.round(peak * (i + 1) / a));
    } else if (i < a + d) {
      const into = i - a;
      curve.push(d === 0 ? decayEndVolume : Math.round(peak - (peak - decayEndVolume) * (into + 1) / d));
    } else if (i < releaseStart) {
      const into = i - a - d;
      if (s === 0) {
        curve.push(decayEndVolume);
      } else if (loopSustain) {
        // `s` here can be LONGER than this function's `sustainLength`
        // argument (clampEnvelopeStages above may have extended it to fill
        // a note longer than its envelope - see that function's comment) -
        // looping (not one long stretched-out ramp) is deliberate: a real
        // reported request, "the sustain loops should start at the end of
        // [Decay, i.e. decayEndVolume] and end at the end of [Sustain, i.e.
        // releaseStartVolume]" - repeating the SAME decayEndVolume ->
        // releaseStartVolume ramp, at its originally-configured speed,
        // rather than smearing that same ramp across however much extra
        // time ended up needing to be filled. The very last repeat can end
        // up cut short right where Release has to start (s isn't always an
        // exact multiple of loopLength) - Release still always starts from
        // its configured releaseStartVolume regardless, so this can read as
        // a small jump at that boundary rather than a perfectly smooth
        // handoff; accepted the same way every other stage here already
        // accepts coarse 4-bit AUDV rounding over perfect continuity.
        const loopLength = Math.min(s, Math.max(1, Math.round(Number(sustainLength) || 0)));
        const cyclePos = into % loopLength;
        curve.push(Math.round(decayEndVolume + (releaseStartVolume - decayEndVolume) * (cyclePos + 1) / loopLength));
      } else {
        // loopSustain is off, so clampEnvelopeStages above never extended
        // `s` past this function's `sustainLength` argument - a single
        // plain ramp across the whole (unextended) Sustain stage, exactly
        // as before `loopSustain` existed.
        curve.push(Math.round(decayEndVolume + (releaseStartVolume - decayEndVolume) * (into + 1) / s));
      }
    } else if (i < releaseEnd) {
      const into = i - releaseStart;
      curve.push(r === 0 ? 0 : Math.max(0, Math.round(releaseStartVolume - releaseStartVolume * (into + 1) / r)));
    } else {
      // Only reachable with loopSustain off AND a totalFrames longer than
      // the four configured stages combined - the note/sound stays silent
      // for whatever's left, same as before `loopSustain` (or Decay End/
      // Release Start) ever existed. Dead with loopSustain on: Sustain
      // always gets extended to make releaseEnd land exactly on frames in
      // that case (see clampEnvelopeStages' comment).
      curve.push(0);
    }
  }
  return curve;
};
