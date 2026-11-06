'use strict';

// The Text Minikernel's  text12a.asm/text12b.asm, and the extended
// score_graphics.asm bundled with it (adds the fontstyle-based font
// selection text12a.asm reads to shrink the score row so text fits
// underneath it - the stock score_graphics.asm doesn't have this, and it's
// also offered on its  as the "Squish" score font option - see
// utils/score-font.js/SQUISH_SCORE_FONT - independent of whether the Text
// Minikernel itself is in use). Fetched once and cached; hooks/rom.js places
// these as siblings of the compiled source throughout the whole compile
// pipeline (see compileBatariBasicToAsm in hooks/bb-compiler.js), the same
// relationship they'd have as real files next to a .bas file on disk -
// confirmed against the real local toolchain to be exactly what "inline
// text12a.asm"/"inline text12b.asm" need.
import {WORKING_KERNEL_TIMERS, SQUISH_LINES_SAVED, withDpcPlusSquishKernel} from '../../utils/dpc-squish';

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
// fetch this same content by itself: once to parse the built-in glyph
// shapes for a fresh Text Font Editor (getDefaultTextFont), and again to
// build a byte-for-byte override splicing the user's  edited glyphs in
// (buildTextFontOverride) - both need the real pristine bytes as their
// starting point, the same way score font's  buildScoreFontOverride
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

// DPC+: the Text Minikernel uses a single dedicated file, and the kernel needs a hook that calls it after the score
// (the project's copy of DPCplus_kernel.asm takes the place of the stock one, see the Text Minikernel's user's
// guide). The stock kernel the app ships gets the hook added to it, so it keeps everything newer than the
// customized kernel the minikernel's zip comes with.
const DPC_PLUS_TEXT_HOOK = [
  '    ifconst textbank',
  '        ;; disable fast fetch',
  '        lda #255',
  '        sta FASTFETCH',
  '        lda #>(textkernel-1)',
  '        pha',
  '        lda #<(textkernel-1)',
  '        pha',
  '        pha ; *** save A (the text kernel does not use it)',
  '        pha ; *** save X (nor this)',
  '        ldx #textbank',
  '        jmp BS_jsr',
  'posttextkernel',
  '        ;; enable fast fetch',
  '        lda #0',
  '        sta.w FASTFETCH',
  '    endif',
  '',
];
// waits: lines to wait out after the score; afterWaits: lines to wait out after the text (a Squish font's, see dpc-squish.js: the lines its
// shorter digits save go below the text, which so starts that much higher).
const withDpcPlusTextHook = (kernel, waits = 0, afterWaits = 0) => {
  const lines = kernel.split('\n');
  const at = lines.findIndex((line) => /^\s*bpl scoreloop/.test(line));
  if (at < 0) throw new Error('The DPC+ kernel has no score loop to add the Text Minikernel to');
  // The last line of the score loop leaves the digits in the player registers and the second score bar's pattern in PF1, which would
  // show on the next line until the text kernel clears them: cleared as soon as the loop ends (an ldx, as an immediate lda can read a
  // data fetcher with fast fetch on).
  lines.splice(at + 1, 0, '     ldx #0', '     stx GRP0', '     stx GRP1', '     stx GRP0', '    ifconst pfscore', '     stx PF1', '    endif',
      ...Array(waits).fill('     sta WSYNC'),
      'dpchiddentext', '    ifconst dpchidescore',
      '     sta WSYNC', '    endif', ...DPC_PLUS_TEXT_HOOK, ...Array(afterWaits).fill('     sta WSYNC'));
  // A project that hides the score under the text skips the score's loop (its digits are not drawn at all, so
  // none show over the picture) and jumps to the text kernel, with the wait above in the line the loop would take.
  const loopAt = lines.findIndex((line) => /^scoreloop\s*$/.test(line));
  if (loopAt < 0) throw new Error('The DPC+ kernel has no score loop to skip for a hidden score');
  lines.splice(loopAt, 0, '    ifconst dpchidescore', '     jmp dpchiddentext', '    endif');
  // The kernel leaves its picture partway into a line, and the score code's first writes clear the playfield, which
  // cut that last line short. A hidden score waits for the line to end first (that line is the one the picture gets
  // back by the loop it does not run).
  const clearAt = lines.findIndex((line, index) => /^\s*stx COLUP1\s*$/i.test(line) && /^\s*ldx #0\s*$/i.test(lines[index + 1]));
  if (clearAt < 0) throw new Error('The DPC+ kernel has no score setup to line up with the end of the picture');
  lines.splice(clearAt + 1, 0, '    ifconst dpchidescore', '     sta WSYNC', '    endif');
  return lines.join('\n');
};

// The text is drawn after the kernel's score, in time the frame has no room for, so the main screen is made
// shorter by what it takes: 14 lines for the one row, 17 more for the second row (measured by the length of the frame) and 6 for the scroll
// cursor's extra scanlines.
const DPC_PLUS_KERNEL_LINES = 178;
// The text kernel reads the first row straight from the message table now (2 lines less than it took), and the text sits TEXT_UP lines higher: the picture
// is made that much shorter and the lines are waited out below the text (see DPC_PLUS_TEXT_WAITS), so the frame keeps its length.
const DPC_PLUS_TEXT_UP = 2;
const DPC_PLUS_TEXT_ROW_LINES = 14 + DPC_PLUS_TEXT_UP;
const DPC_PLUS_TEXT_ROW2_LINES = 17;
// The lines waited out below the text so that the frame is 262 lines (measured on the length of the frame, by the number of rows and whether the score shows: the
// timers of the picture only come in steps, which is what these make up for).
const dpcPlusTextWaits = (withRow2, hideScore) => (hideScore ? (withRow2 ? 6 : 2) : (withRow2 ? 3 : 1));
const DPC_PLUS_TEXT_CURSOR_LINES = 6;
// The kernel ends its picture by checking the timer it started, and only some starting values end it right (192, 178
// and 173 were measured to work, 194 and 168 do not; the stock 211 works too), so the screen height is the tallest
// of those that is not taller than wanted.
const DPC_PLUS_WORKING_KERNEL_TIMERS = WORKING_KERNEL_TIMERS;
// A hidden score is not drawn: of the 8 lines of its loop 7 are cut, and 1 is waited out where the digits were, so the frame keeps
// its 262 lines while the picture gets 6 more (measured: with the timers of the list above the frame is 255 lines at the
// shortest picture and grows a line with each line of picture).
const DPC_PLUS_HIDDEN_SCORE_LINES = 7;
// The timer for the screen the text leaves: the tallest one of the working timers that is not more than a quarter of a step above the height wanted
// (a step, 64 cycles, is 0.84 of a line).
const dpcPlusTextKernelTimer = (withRow2, withCursor, hideScore) => {
  const wanted = DPC_PLUS_KERNEL_LINES - DPC_PLUS_TEXT_ROW_LINES - (withRow2 ? DPC_PLUS_TEXT_ROW2_LINES : 0) -
    (withCursor ? DPC_PLUS_TEXT_CURSOR_LINES : 0) + (hideScore ? DPC_PLUS_HIDDEN_SCORE_LINES : 0);
  const steps = wanted * 76 / 64;
  return DPC_PLUS_WORKING_KERNEL_TIMERS.find((timer) => timer <= steps + 0.25) || DPC_PLUS_WORKING_KERNEL_TIMERS.slice(-1)[0];
};
// How many lines tall the main screen is with the text on.
export const dpcPlusTextScreenLines = (withRow2, withCursor, hideScore = false) =>
  dpcPlusTextKernelTimer(withRow2, withCursor, hideScore) * 64 / 76;

// With the Text Minikernel a Squish score font does not give its 3 saved lines to the picture: the text starts those lines higher and the
// lines are waited out below it, so the frame keeps its length.
const squishTimerOf = (withRow2, withCursor, hideScore) => ({timer: dpcPlusTextKernelTimer(withRow2, withCursor, hideScore), waits: 0});

const withDpcPlusTextScreenHeight = (header, withRow2, withCursor, hideScore, squish) => {
  const patched = header.replace(/KERNEL_LINES = 178\*76\/64/,
      `KERNEL_LINES = ${squishTimerOf(withRow2, withCursor, hideScore).timer}`);
  if (patched === header) throw new Error('The DPC+ header has no screen height to shorten for the Text Minikernel');
  return patched;
};

// The colors of the 5 glyph rows of a line of text (the Text tab), or null for one color on all of them (TextColor): only when they are not all the same.
export const textLineColorsOf = (config) => {
  const colors = config && config.textLineColors;
  if (!Array.isArray(colors) || colors.length !== 5 || new Set(colors).size < 2) return null;
  return colors.map((byte) => Math.min(254, Math.max(0, Math.round(Number(byte) || 0) & 254)));
};

// The same for the standard kernel's text12b.asm: each of its 5 glyph rows loads TextColor (3 cycles, at cycle 56 to 62 of the line before the one it colors) and
// puts it in COLUP1, then COLUP0 on the next line; an absolute load of 4 cycles from a table in the ROM takes the 1 cycle more the line has room for.
export const withTextLineColors12b = (text, colors) => {
  let row = 0;
  const patched = text.replace(/^    ldy TextColor( +;.*)?$/gm, () => `    ldy.w TextLineColors+${row++}   ; 4   the color of this glyph row`);
  if (row !== 5) throw new Error('The text kernel does not have the 5 places that set the color of a line of text');
  return `${patched}\nTextLineColors\n    .byte ${colors.join(',')}\n`;
};

// Each of the 5 glyph rows of the DPC+ text kernel sets the color of its second scanline from TextColor (a zero page load of 3 cycles, at cycle 56 of the
// line before): with line colors it reads a byte of a table in the ROM instead, an absolute load of 4 cycles, which the line has room for.
const withDpcPlusTextLineColors = (text, colors) => {
  let row = 0;
  const patched = text.replace(/    ldy TextColor           ; 3     \(56\) line 2 shows the text in its color/g,
      () => `    ldy.w TextLineColors+${row++}   ; 4     (56) line 2 shows the text in the color of this glyph row`);
  if (row !== 5) throw new Error('The DPC+ text kernel does not have the 5 places that set the color of a line of text');
  return `${patched}\nTextLineColors\n    .byte ${colors.join(',')}\n`;
};

const dpcPlusFilesPromises = {};
export const getDpcPlusTextMinikernelSiblingFiles = (withRow2 = false, withCursor = false, hideScore = false, squish = false, lineColors = null) => {
  const key = `${withRow2 ? 'row2' : 'row1'}${withCursor ? 'cursor' : ''}${hideScore ? 'hidden' : ''}${squish && !hideScore ? 'squish' : ''}` +
    `${lineColors ? 'lines' + lineColors.join('_') : ''}`;
  if (!dpcPlusFilesPromises[key]) {
    dpcPlusFilesPromises[key] = Promise.all([
      fetchText('bb19/text-minikernel/text12DPCplus.asm'),
      fetchText('bb19/includes/DPCplus_kernel.asm'),
      fetchText('bb19/includes/DPCplusbB.h'),
    ]).then(([text, kernel, header]) => ({
      'text12DPCplus.asm': lineColors ? withDpcPlusTextLineColors(text, lineColors) : text,
      'DPCplus_kernel.asm': squish && !hideScore ?
        withDpcPlusSquishKernel(withDpcPlusTextHook(kernel, 0, SQUISH_LINES_SAVED + dpcPlusTextWaits(withRow2, hideScore)), 0, true) :
        withDpcPlusTextHook(kernel, 0, dpcPlusTextWaits(withRow2, hideScore)),
      'DPCplusbB.h': withDpcPlusTextScreenHeight(header, withRow2, withCursor, hideScore, squish),
    }));
  }
  return dpcPlusFilesPromises[key];
};
