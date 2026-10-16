'use strict';

import {buildEnvelopeCurve} from './envelope';

// A staircase volume: the volume envelope played in steps instead of gliding. Each stretch of a few frames holds one level (the level the
// envelope reaches at the end of the stretch), and the levels are rounded to multiples of a step. The hum of Yars' Revenge climbs 2, 4, 6 ...
// 14 with 8 frames on each: an Attack of 56 frames with a staircase of step 2, held 8 frames.

export const STAIRCASE_FRAME_OPTIONS = [1, 2, 3, 4, 6, 8, 16, 32];
export const DEFAULT_STAIRCASE_STEP = 2;
export const DEFAULT_STAIRCASE_FRAMES = 8;
export const MAX_STAIRCASE_STEP = 15;
// One entry for each frame, read through an 8-bit index.
export const MAX_STAIRCASE_FRAMES = 255;

// The curve (the volume of each frame) in steps.
export const applyStaircase = (curve, step, every) => {
  const levelStep = Math.max(1, Math.min(MAX_STAIRCASE_STEP, Math.round(Number(step) || 1)));
  const hold = Math.max(1, Math.round(Number(every) || 1));
  return curve.map((_, frame) => {
    const stretchStart = Math.floor(frame / hold) * hold;
    const level = curve[Math.min(curve.length - 1, stretchStart + hold - 1)];
    return Math.max(0, Math.min(15, Math.round(level / levelStep) * levelStep));
  });
};

// The volume of each frame of a sound whose envelope has a staircase, null for any other. loopSustain: as for a note of the Music tab (see
// buildEnvelopeCurve).
export const buildVolumeStaircase = (soundEffect, {loopSustain = false} = {}) => {
  if (!soundEffect || !soundEffect.envelope || !soundEffect.staircase) return null;
  const frames = Math.max(0, Math.min(MAX_STAIRCASE_FRAMES, Math.round(Number(soundEffect.duration) || 0)));
  if (frames <= 0) return null;
  const curve = buildEnvelopeCurve({
    attack: soundEffect.envelopeAttack, decay: soundEffect.envelopeDecay, decayEndPercent: soundEffect.envelopeDecayEnd,
    releaseStartPercent: soundEffect.envelopeReleaseStart, sustainLength: soundEffect.envelopeSustainLength,
    release: soundEffect.envelopeRelease, peakVolume: Number(soundEffect.audv) || 0, totalFrames: frames, loopSustain,
  });
  return applyStaircase(curve, soundEffect.staircaseStep, soundEffect.staircaseFrames);
};
