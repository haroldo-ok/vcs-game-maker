'use strict';

import {colorByteToCss} from './palette';

// Deterministic (not truly random per-render, which would make the color
// jump around every time the app re-renders) but effectively arbitrary hue
// per sound effect, so each one gets a consistent, distinct default color
// (used by the Music tab's note grid) without maintaining a hand-picked
// palette, until the user sets one explicitly on the Sound tab. Steps around
// the hue circle by the golden angle (~137.5deg) per id - the standard
// trick for spreading SEQUENTIAL integers (sound effect ids are 1, 2, 3,
// ...) into well-separated hues; a plain string/character hash instead put
// id 1 and id 2 only ~1deg apart (both read as the same yellow), since
// their digits' char codes are nearly identical.
const GOLDEN_ANGLE_DEGREES = 137.508;
export const autoInstrumentColor = (soundEffectId) => {
  const hue = ((Number(soundEffectId) || 0) * GOLDEN_ANGLE_DEGREES) % 360;
  return `hsl(${hue}, 65%, 45%)`;
};

/**
 * A sound effect's own chosen color (see the color picker on its Sound tab
 * card), falling back to an automatically assigned one if it hasn't set one.
 * @param {Object} soundEffect The sound effect (from blocks/soundfx.js) to
 *     get a display color for, or null/undefined.
 * @return {string} A CSS color.
 */
export const instrumentColorFor = (soundEffect) => {
  if (soundEffect && soundEffect.color != null) {
    return colorByteToCss(soundEffect.color);
  }
  return autoInstrumentColor(soundEffect && soundEffect.id);
};
