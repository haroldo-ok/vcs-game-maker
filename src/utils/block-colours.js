'use strict';

import {useDarkModeStorage, useDesaturateBlocklyColorsStorage} from '../hooks/project';

// Colors of the blocks as the editor shows them: the Soft Blockly colors setting mutes them and Dark Mode darkens them (see
// components/BlocklyComponent.vue, which adjusts every block this way). Anything drawn to match a block's color uses adjustedBlockColour.
const clamp01 = (n) => Math.max(0, Math.min(1, n));

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(clean.substr(i, 2), 16) / 255);
};

const rgbToHex = (r, g, b) => '#' + [r, g, b]
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('');

// Standard RGB<->HSL conversion (e.g. matching the CSS Color 4 spec's
// algorithm) - h in [0,1) (not degrees), s/l in [0,1].
const rgbToHsl = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
};

const hue2rgb = (p, q, tIn) => {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

const hslToRgb = (h, s, l) => {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
};

// saturationFactor multiplies S (0.5 = Photoshop's "-50") - same slider
// Photoshop's  Hue/Saturation dialog exposes, applied to the same
// component.
export const desaturateHex = (hex, saturationFactor) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, clamp01(s * saturationFactor), l);
  return rgbToHex(r, g, b);
};

// Dark Mode's block-color treatment - see the .blocklyBlockCanvas exclusion
// rule's comment in App.vue for why blocks get this dedicated JS handling
// instead of the blanket CSS invert() every other tab uses: a plain RGB
// channel invert approximates an HSL lightness flip, but block colors
// (generateTertiaryColour_/hueToHex above) already sit at a roughly 50% HSL
// lightness by construction - too close to that transform's fixed point
// (1 - 0.5 = 0.5) to actually read as darker, confirmed as a real reported
// "blocks are too bright" once Subdued Palette's desaturation (which leaves
// lightness untouched) made that flat, washed-out midtone impossible to
// miss against the newly-darkened workspace around it. A real lightness
// reduction in HSL space instead - lightnessFactor multiplies L the same
// way desaturateHex's saturationFactor multiplies S.
export const darkenHex = (hex, lightnessFactor) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, s, clamp01(l * lightnessFactor));
  return rgbToHex(r, g, b);
};

// The color of a block (a hex string) as the blocks show it with the settings now.
export const adjustedBlockColour = (hex) => {
  let colour = hex;
  if (useDesaturateBlocklyColorsStorage().value) colour = desaturateHex(colour, 0.5);
  if (useDarkModeStorage().value) colour = darkenHex(colour, 0.5);
  return colour;
};
