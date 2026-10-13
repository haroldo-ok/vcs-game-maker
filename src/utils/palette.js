'use strict';

// The NTSC Atari 2600 palette: one hex string per color index (0..127).
//
// The stored/emitted color BYTE is (index << 1). The 2600 ignores the low bit
// of a color register, so valid bytes are the even numbers 0..254, and a byte
// maps back to a palette entry with (byte >> 1). Keeping the byte (rather than
// the index) is convenient because that is exactly what batari Basic expects in
// a `pfcolors:` table and what the color picker block already emits.
import {useConfigurationStorage} from '../hooks/project';
import {tvStandardFor} from './tv-standard';

// The PAL palette the 6502.ts emulator displays (what a PAL60 ROM shows for the same
// color bytes), copied from the 6502.ts package by `npm run build:palettes`
// (tools/stellerator/palettes.js). PAL has no distinct hue 1 (it repeats the greys)
// and a different hue order, so the same byte is a different color than NTSC -
// the editors always show the NTSC palette and a PAL60 build swaps each color
// byte for its closest PAL match (see tvColorByte).
export const PAL_COLORS = [
  '000000', '2b2b2b', '525252', '767676', '979797', 'b6b6b6', 'd2d2d2', 'ececec',
  '000000', '2b2b2b', '525252', '767676', '979797', 'b6b6b6', 'd2d2d2', 'ececec',
  '805800', '96711a', 'ab8732', 'be9c48', 'cfaf5c', 'dfc06f', 'eed180', 'fce090',
  '445c00', '5e791a', '769332', '8cac48', 'a0c25c', 'b3d76f', 'c4ea80', 'd4fc90',
  '703400', '89511a', 'a06b32', 'b68448', 'c99a5c', 'dcaf6f', 'ecc280', 'fcd490',
  '006414', '1a8035', '329852', '48b06e', '5cc587', '6fd99e', '80ebb4', '90fcc8',
  '700014', '891a35', 'a03252', 'b6486e', 'c95c87', 'dc6f9e', 'ec80b4', 'fc90c8',
  '005c5c', '1a7676', '328e8e', '48a4a4', '5cb8b8', '6fcbcb', '80dcdc', '90ecec',
  '70005c', '841a74', '963289', 'a8489e', 'b75cb0', 'c66fc1', 'd380d1', 'e090e0',
  '003c70', '195a89', '2f75a0', '448eb6', '57a5c9', '68badc', '79ceec', '88e0fc',
  '580070', '6e1a89', '8332a0', '9648b6', 'a75cc9', 'b76fdc', 'c680ec', 'd490fc',
  '002070', '193f89', '2f5aa0', '4474b6', '578bc9', '68a1dc', '79b5ec', '88c8fc',
  '340080', '4a1a96', '5f32ab', '7248be', '835ccf', '936fdf', 'a280ee', 'b090fc',
  '000088', '1a1a9d', '3232b0', '4848c2', '5c5cd2', '6f6fe1', '8080ef', '9090fc',
  '000000', '2b2b2b', '525252', '767676', '979797', 'b6b6b6', 'd2d2d2', 'ececec',
  '000000', '2b2b2b', '525252', '767676', '979797', 'b6b6b6', 'd2d2d2', 'ececec',
];

// The NTSC palette the preview emulator (6502.ts) draws. Every swatch, color
// picker and pixel editor in the app shows these, so a color looks the same
// there as on the emulator screen, and it is what a PAL60 color is matched
// against, so a PAL60 ROM looks like the NTSC one in the emulator. Generated
// the same way as PAL_COLORS.
export const NTSC_COLORS = [
  '000000', '4a4a4a', '6f6f6f', '8e8e8e', 'aaaaaa', 'c0c0c0', 'd6d6d6', 'ececec',
  '484800', '69690f', '86861d', 'a2a22a', 'bbbb35', 'd2d240', 'e8e84a', 'fcfc54',
  '7c2c00', '904811', 'a26221', 'b47a30', 'c3903d', 'd2a44a', 'dfb755', 'ecc860',
  '901c00', 'a33915', 'b55328', 'c66c3a', 'd5824a', 'e39759', 'f0aa67', 'fcbc74',
  '940000', 'a71a1a', 'b83232', 'c84848', 'd65c5c', 'e46f6f', 'f08080', 'fc9090',
  '840064', '97197a', 'a8308f', 'b846a2', 'c659b3', 'd46cc3', 'e07cd2', 'ec8ce0',
  '500084', '68199a', '7d30ad', '9246c0', 'a459d0', 'b56ce0', 'c57cee', 'd48cfc',
  '140090', '331aa3', '4e32b5', '6848c6', '7f5cd5', '956fe3', 'a980f0', 'bc90fc',
  '000094', '181aa7', '2d32b8', '4248c8', '545cd6', '656fe4', '7580f0', '8490fc',
  '001c88', '183b9d', '2d57b0', '4272c2', '548ad2', '65a0e1', '75b5ef', '84c8fc',
  '003064', '185080', '2d6d98', '4288b0', '54a0c5', '65b7d9', '75cceb', '84e0fc',
  '004030', '18624e', '2d8169', '429e82', '54b899', '65d1ae', '75e7c2', '84fcd4',
  '004400', '1a661a', '328432', '48a048', '5cba5c', '6fd26f', '80e880', '90fc90',
  '143c00', '355f18', '527e2d', '6e9c42', '87b754', '9ed065', 'b4e775', 'c8fc84',
  '303800', '505916', '6d762b', '88923e', 'a0ab4f', 'b7c25f', 'ccd86e', 'e0ec7c',
  '482c00', '694d14', '866a26', 'a28638', 'bb9f47', 'd2b656', 'e8cc63', 'fce070',
];

// sRGB hex -> CIE L*a*b*, so "closest color" tracks perceived difference.
const toLab = (hex) => {
  const [r, g, b] = [0, 2, 4].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f((0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047);
  const fy = f(0.2126729 * r + 0.7151522 * g + 0.0721750 * b);
  const fz = f((0.0193339 * r + 0.1191920 * g + 0.9503041 * b) / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};

// For each NTSC palette index, the PAL palette index that looks closest to it.
let palIndexForNtsc = null;
const nearestPalIndexes = () => {
  if (!palIndexForNtsc) {
    const pal = PAL_COLORS.map(toLab);
    palIndexForNtsc = NTSC_COLORS.map((hex) => {
      const [l, a, b] = toLab(hex);
      let best = 0;
      let bestDistance = Infinity;
      pal.forEach(([pl, pa, pb], index) => {
        const distance = (l - pl) ** 2 + (a - pa) ** 2 + (b - pb) ** 2;
        if (distance < bestDistance) {
          best = index;
          bestDistance = distance;
        }
      });
      return best;
    });
  }
  return palIndexForNtsc;
};

// The color byte to put in the ROM for an (NTSC-palette) color byte chosen in
// the editors: itself for NTSC, or the byte whose PAL color looks closest for a
// PAL60 project - the same byte is a different color on PAL, so without this
// every color would shift. Only for colors fixed at build time; a color the game
// computes while running (a fade, rainbow colors) steps through the PAL
// palette's hues and brightness.
export const tvColorByte = (byte) =>
  (tvStandardFor(useConfigurationStorage().value) === 'pal60' ?
    nearestPalIndexes()[(byte >> 1) & 0x7f] << 1 :
    byte & 0xfe);

// Number of columns the palette is laid out in (matches the color picker block).
export const PALETTE_COLUMNS = 8;

// A color byte -> "#rrggbb" for display in the DOM.
export const colorByteToCss = (byte) =>
  `#${NTSC_COLORS[(byte >> 1) & 0x7f]}`;

// A color byte -> batari Basic literal, e.g. 14 -> "$0E".
export const colorByteToBBasic = (byte) =>
  '$' + (byte & 0xfe).toString(16).toUpperCase().padStart(2, '0');

// colorByteToBBasic for a color going into the generated program - see
// tvColorByte.
export const colorByteToBuildBBasic = (byte) => colorByteToBBasic(tvColorByte(byte));
