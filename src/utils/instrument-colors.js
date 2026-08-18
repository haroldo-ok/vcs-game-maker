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

// A single shared canvas 2d context, reused rather than created per call -
// it's only ever used to lean on the browser's own CSS color parser (fillStyle
// normalizes ANY valid CSS color string - hsl(...), rgb(...), #hex, named
// colors - down to a plain #rrggbb/rgba(...) string), not for drawing
// anything.
let sharedColorCtx = null;
const normalizeColor = (cssColor) => {
  if (typeof document === 'undefined') return null;
  if (!sharedColorCtx) sharedColorCtx = document.createElement('canvas').getContext('2d');
  sharedColorCtx.fillStyle = '#000';
  sharedColorCtx.fillStyle = cssColor;
  const normalized = sharedColorCtx.fillStyle;
  const hexMatch = normalized.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (hexMatch) return hexMatch.slice(1).map((hex) => parseInt(hex, 16));
  const rgbMatch = normalized.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  return rgbMatch ? rgbMatch.slice(1).map(Number) : null;
};

/**
 * Blends a CSS color toward white by the given percent (e.g. 45 means "45%
 * of this color, 55% white") - a color-mix(in srgb, color X%, white)
 * replacement that works in Electron's bundled Chromium (22.x ships
 * Chromium 108; color-mix() only landed in Chromium 111, so the CSS
 * function silently produces an invalid value there - confirmed as the
 * cause of the Music tab's sequence-chip resize handle rendering blank/
 * white on desktop exports specifically, never reproducing in a normal
 * browser). Reuses normalizeColor's own canvas-based parser, so this works
 * uniformly whether cssColor is hsl(...) (auto-assigned) or rgb(...)/hex (a
 * user's own pick), same reasoning color-mix was originally chosen for.
 * @param {string} cssColor Any valid CSS color string.
 * @param {number} colorPercent 0-100, how much of cssColor to keep.
 * @return {string} An rgb(...) string, or cssColor unchanged if it couldn't
 *     be parsed.
 */
export const mixColorWithWhite = (cssColor, colorPercent) => {
  const rgb = normalizeColor(cssColor);
  if (!rgb) return cssColor;
  const ratio = colorPercent / 100;
  const blend = (channel) => Math.round(channel * ratio + 255 * (1 - ratio));
  return `rgb(${blend(rgb[0])}, ${blend(rgb[1])}, ${blend(rgb[2])})`;
};

/**
 * Fades a CSS color toward transparent by the given percent (e.g. 35 means
 * "35% opaque") - a color-mix(in srgb, color X%, transparent) replacement,
 * same Electron/Chromium-108 compatibility reasoning as mixColorWithWhite
 * above. Unlike a plain opacity change on the element, this stays a single
 * color value, safe to use as one stop inside a larger multi-color
 * gradient without fading the gradient's other stops too.
 * @param {string} cssColor Any valid CSS color string.
 * @param {number} colorPercent 0-100, the resulting alpha (as a percent).
 * @return {string} An rgba(...) string, or cssColor unchanged if it
 *     couldn't be parsed.
 */
export const mixColorWithTransparent = (cssColor, colorPercent) => {
  const rgb = normalizeColor(cssColor);
  if (!rgb) return cssColor;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${colorPercent / 100})`;
};

/**
 * Whether a CSS color (auto-assigned hsl(...) or a user-picked TIA color -
 * see instrumentColorFor above) reads as light enough that white text on top
 * of it would be hard to read - used to pick dark text instead wherever an
 * instrument's own color is used as a chip/background fill (e.g. the Music
 * tab's collapsed instrument summary chips).
 * @param {string} cssColor Any valid CSS color string.
 * @return {boolean} True if dark text should be used on top of this color.
 */
export const isLightColor = (cssColor) => {
  const rgb = normalizeColor(cssColor);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  // Perceptual (not straight-average) luminance weights - matches how the
  // eye actually weighs red/green/blue brightness, same coefficients as the
  // standard ITU-R BT.601 luma formula.
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return luminance > 0.6;
};
