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
// Attack ramps 0 -> peakVolume, Decay ramps peakVolume -> sustainVolume,
// Sustain holds flat, Release ramps sustainVolume -> 0 over the LAST
// `release` frames of totalFrames (i.e. release always ends exactly on the
// sound/note's own last frame, matching the "key released" edge in the
// classic ADSR diagram).

// If attack+decay+release together don't fit within totalFrames, every
// stage is scaled down proportionally (rounded) rather than truncated -
// same spirit as the old one-stage Fade's own "a note shorter than its own
// fade length still fades for its whole duration instead of not fading at
// all" clamp, just generalized to 3 stages instead of 1. Exported
// separately (not just inlined into buildEnvelopeCurve below) because the
// ROM generator needs these exact clamped stage lengths themselves - not
// just the resulting curve - to size/index its own per-stage data tables
// (see generateEnvelopeChecks in generators/bbasic/soundfx.js).
export const clampEnvelopeStages = ({attack, decay, release, totalFrames}) => {
  const frames = Math.max(1, Math.round(Number(totalFrames) || 0));
  let a = Math.max(0, Math.round(Number(attack) || 0));
  let d = Math.max(0, Math.round(Number(decay) || 0));
  let r = Math.max(0, Math.round(Number(release) || 0));
  const stagesTotal = a + d + r;
  if (stagesTotal > frames) {
    const scale = frames / stagesTotal;
    a = Math.round(a * scale);
    d = Math.round(d * scale);
    r = Math.max(0, frames - a - d);
  }
  return {attack: a, decay: d, release: r};
};

export const buildEnvelopeCurve = ({attack, decay, sustainPercent, release, peakVolume, totalFrames}) => {
  const frames = Math.max(1, Math.round(Number(totalFrames) || 0));
  const peak = Math.max(0, Math.min(15, Math.round(Number(peakVolume) || 0)));
  const sustainVolume = Math.max(0, Math.min(peak, Math.round(peak * (Number(sustainPercent) || 0) / 100)));
  const {attack: a, decay: d, release: r} = clampEnvelopeStages({attack, decay, release, totalFrames: frames});

  const releaseStart = frames - r;
  const curve = [];
  for (let i = 0; i < frames; i++) {
    if (i < a) {
      curve.push(a === 0 ? peak : Math.round(peak * (i + 1) / a));
    } else if (i < a + d) {
      const into = i - a;
      curve.push(d === 0 ? sustainVolume : Math.round(peak - (peak - sustainVolume) * (into + 1) / d));
    } else if (i < releaseStart) {
      curve.push(sustainVolume);
    } else {
      const into = i - releaseStart;
      curve.push(r === 0 ? 0 : Math.max(0, Math.round(sustainVolume - sustainVolume * (into + 1) / r)));
    }
  }
  return curve;
};
