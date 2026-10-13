'use strict';

// How long an animation frame lasts is a whole number of video frames, and never less than one.
export const MIN_FRAME_DURATION = 1;

/**
 * @param {*} value A duration typed into a field, or read from a saved project.
 * @return {number} A whole number, at least MIN_FRAME_DURATION.
 */
export const clampFrameDuration = (value) => Math.max(MIN_FRAME_DURATION, Math.round(Number(value)) || MIN_FRAME_DURATION);
