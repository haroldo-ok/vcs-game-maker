'use strict';

// The Text Minikernel's own text12a.asm/text12b.asm, and the extended
// score_graphics.asm bundled with it (adds the fontstyle-based font
// selection text12a.asm reads to shrink the score row so text fits
// underneath it - the stock score_graphics.asm doesn't have this, and it's
// also offered on its own as the "Squish" score font option - see
// utils/score-font.js/SQUISH_SCORE_FONT - independent of whether the Text
// Minikernel itself is in use). Fetched once and cached; hooks/rom.js places
// these as siblings of the compiled source throughout the whole compile
// pipeline (see compileBatariBasicToAsm in hooks/bb-compiler.js), the same
// relationship they'd have as real files next to a .bas file on disk -
// confirmed against the real local toolchain to be exactly what "inline
// text12a.asm"/"inline text12b.asm" need.
const fetchText = (path) => fetch(path).then((r) => r.text());

let scoreGraphicsPromise = null;
export const getExtendedScoreGraphics = () => {
  if (!scoreGraphicsPromise) {
    scoreGraphicsPromise = fetchText('bb19/text-minikernel/score_graphics_extended.asm');
  }
  return scoreGraphicsPromise;
};

// The pristine, unmodified text12b.asm - fetched once and cached, same
// reasoning as getExtendedScoreGraphics above. Exposed separately (not just
// folded into getTextMinikernelSiblingFiles below) so utils/text-font.js can
// fetch this same content on its own: once to parse the built-in glyph
// shapes for a fresh Text Font Editor (getDefaultTextFont), and again to
// build a byte-for-byte override splicing the user's own edited glyphs in
// (buildTextFontOverride) - both need the real pristine bytes as their
// starting point, the same way score font's own buildScoreFontOverride
// starts from getPristineScoreGraphics (utils/score-font.js).
let pristineText12bPromise = null;
export const getPristineText12b = () => {
  if (!pristineText12bPromise) {
    pristineText12bPromise = fetchText('bb19/text-minikernel/text12b.asm');
  }
  return pristineText12bPromise;
};

let filesPromise = null;
export const getTextMinikernelSiblingFiles = () => {
  if (!filesPromise) {
    filesPromise = Promise.all([
      fetchText('bb19/text-minikernel/text12a.asm'),
      getPristineText12b(),
      getExtendedScoreGraphics(),
    ]).then(([text12a, text12b, scoreGraphics]) => ({
      'text12a.asm': text12a,
      'text12b.asm': text12b,
      'score_graphics.asm': scoreGraphics,
    }));
  }
  return filesPromise;
};
