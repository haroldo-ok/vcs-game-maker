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
import {WORKING_KERNEL_TIMERS, squishKernelTimer, withDpcPlusSquishKernel} from '../../utils/dpc-squish';

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
// waits: lines to wait out after the score (a Squish font's, see dpc-squish.js).
const withDpcPlusTextHook = (kernel, waits = 0) => {
  const lines = kernel.split('\n');
  const at = lines.findIndex((line) => /^\s*bpl scoreloop/.test(line));
  if (at < 0) throw new Error('The DPC+ kernel has no score loop to add the Text Minikernel to');
  // The last line of the score loop leaves the digits in the player registers and the second score bar's pattern in PF1, which would
  // show on the next line until the text kernel clears them: cleared as soon as the loop ends (an ldx, as an immediate lda can read a
  // data fetcher with fast fetch on).
  lines.splice(at + 1, 0, '     ldx #0', '     stx GRP0', '     stx GRP1', '     stx GRP0', '    ifconst pfscore', '     stx PF1', '    endif',
      ...Array(waits).fill('     sta WSYNC'),
      'dpchiddentext', '    ifconst dpchidescore',
      '     sta WSYNC', '    endif', ...DPC_PLUS_TEXT_HOOK);
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
const DPC_PLUS_TEXT_ROW_LINES = 14;
const DPC_PLUS_TEXT_ROW2_LINES = 17;
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

const squishTimerOf = (withRow2, withCursor, hideScore, squish) => {
  const timer = dpcPlusTextKernelTimer(withRow2, withCursor, hideScore);
  return squish && !hideScore ? squishKernelTimer(timer) : {timer, waits: 0};
};

const withDpcPlusTextScreenHeight = (header, withRow2, withCursor, hideScore, squish) => {
  const patched = header.replace(/KERNEL_LINES = 178\*76\/64/,
      `KERNEL_LINES = ${squishTimerOf(withRow2, withCursor, hideScore, squish).timer}`);
  if (patched === header) throw new Error('The DPC+ header has no screen height to shorten for the Text Minikernel');
  return patched;
};

const dpcPlusFilesPromises = {};
export const getDpcPlusTextMinikernelSiblingFiles = (withRow2 = false, withCursor = false, hideScore = false, squish = false) => {
  const key = `${withRow2 ? 'row2' : 'row1'}${withCursor ? 'cursor' : ''}${hideScore ? 'hidden' : ''}${squish && !hideScore ? 'squish' : ''}`;
  if (!dpcPlusFilesPromises[key]) {
    dpcPlusFilesPromises[key] = Promise.all([
      fetchText('bb19/text-minikernel/text12DPCplus.asm'),
      fetchText('bb19/includes/DPCplus_kernel.asm'),
      fetchText('bb19/includes/DPCplusbB.h'),
    ]).then(([text, kernel, header]) => ({
      'text12DPCplus.asm': text,
      'DPCplus_kernel.asm': squish && !hideScore ?
        withDpcPlusSquishKernel(withDpcPlusTextHook(kernel, squishTimerOf(withRow2, withCursor, hideScore, squish).waits), 0, true) :
        withDpcPlusTextHook(kernel),
      'DPCplusbB.h': withDpcPlusTextScreenHeight(header, withRow2, withCursor, hideScore, squish),
    }));
  }
  return dpcPlusFilesPromises[key];
};
