import DEFAULT_INCLUDES from 'batari-basic/src/fsContents';

import {SCORE_FONTS} from '../generators/score-fonts';
import {useScoreFontStorage} from '../hooks/project';

const SCORE_GRAPHICS = 'score_graphics.asm';

export const CUSTOM_SCORE_FONT = 'custom';
export const DIGIT_COUNT = 10;
export const DIGIT_WIDTH = 8;
export const DIGIT_HEIGHT = 8;
const DIGIT_BYTES = DIGIT_COUNT * DIGIT_HEIGHT;

// The bundled compiler writes every include into its virtual filesystem on each
// build, and its score_graphics.asm has no font support at all: it always holds
// the default digits inline. Swapping those digits here is what actually
// changes the font, since "const font" alone is inert in that toolchain.
//
// Kept as the untouched original so repeated swaps never compound.
const PRISTINE = DEFAULT_INCLUDES[SCORE_GRAPHICS];

const DIGITS_START = 'scoretable';
// The digits run from the scoretable label to the trailing ORG block.
const DIGITS_END = 'ifconst ROM2k';

// The digits the bundled compiler ships with, read back out of the include so
// the editor always seeds from exactly what a default build produces.
export const DEFAULT_SCORE_FONT =
  (PRISTINE.match(/%[01]{8}/g) || []).slice(0, DIGIT_BYTES);

/**
 * Converts a font's assembly bytes into one pixel matrix per digit.
 *
 * batari Basic stores score digits bottom-up, the same way it stores sprites,
 * so the rows are flipped to give the editor its usual top-down view.
 * @param {!Array<string>} bytes Eighty "%00111100" style rows.
 * @return {!Array<!Array<!Array<number>>>} Ten 8x8 matrices.
 */
export const fontToDigits = (bytes) => {
  const digits = [];
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const rows = bytes.slice(i * DIGIT_HEIGHT, (i + 1) * DIGIT_HEIGHT)
        .map((byte) => byte.replace('%', '').split('').map(Number));
    digits.push(rows.reverse());
  }
  return digits;
};

/**
 * Inverse of fontToDigits.
 * @param {!Array<!Array<!Array<number>>>} digits Ten 8x8 matrices.
 * @return {!Array<string>} Eighty "%00111100" style rows.
 */
export const digitsToFont = (digits) => digits
    .map((rows) => rows.slice().reverse()
        .map((row) => '%' + row.map((pixel) => pixel ? 1 : 0).join('')))
    .reduce((all, rows) => all.concat(rows), []);

/**
 * Fills in a usable custom font, seeded from the default digits.
 * @param {*} storage Score font storage, or its value.
 * @return {{digits: !Array<!Array<!Array<number>>>}} Custom font state.
 */
export const processScoreFontDefaults = (storage) => {
  const stored = storage && ('value' in storage ? storage.value : storage);
  const digits = stored && stored.digits;
  if (!Array.isArray(digits) || digits.length !== DIGIT_COUNT) {
    return {digits: fontToDigits(DEFAULT_SCORE_FONT)};
  }
  return {digits};
};

const customFontBytes = () => {
  try {
    return digitsToFont(processScoreFontDefaults(useScoreFontStorage()).digits);
  } catch (e) {
    console.error('Error loading the custom score font', e);
    return null;
  }
};

/**
 * Points the compiler's score digits at the given batari Basic font.
 * @param {string} font Font name, "custom", or a falsy value for the default.
 */
export const applyScoreFont = (font) => {
  const digits = font === CUSTOM_SCORE_FONT ?
    customFontBytes() : (font && SCORE_FONTS[font]);
  if (!digits || digits.length !== DIGIT_BYTES) {
    DEFAULT_INCLUDES[SCORE_GRAPHICS] = PRISTINE;
    return;
  }

  const headerEnd = PRISTINE.indexOf(DIGITS_START) + DIGITS_START.length;
  const footerAt = PRISTINE.indexOf(DIGITS_END, headerEnd);
  if (headerEnd < DIGITS_START.length || footerAt < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    DEFAULT_INCLUDES[SCORE_GRAPHICS] = PRISTINE;
    return;
  }
  const footerStart = PRISTINE.lastIndexOf('\n', footerAt);

  DEFAULT_INCLUDES[SCORE_GRAPHICS] = PRISTINE.slice(0, headerEnd) + '\n\n' +
    digits.map((byte) => '       .byte ' + byte).join('\n') + '\n' +
    PRISTINE.slice(footerStart);
};
