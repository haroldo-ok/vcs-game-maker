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

let filesPromise = null;
export const getTextMinikernelSiblingFiles = () => {
  if (!filesPromise) {
    filesPromise = Promise.all([
      fetchText('bb19/text-minikernel/text12a.asm'),
      fetchText('bb19/text-minikernel/text12b.asm'),
      getExtendedScoreGraphics(),
    ]).then(([text12a, text12b, scoreGraphics]) => ({
      'text12a.asm': text12a,
      'text12b.asm': text12b,
      'score_graphics.asm': scoreGraphics,
    }));
  }
  return filesPromise;
};
