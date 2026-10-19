'use strict';

// The Squish score fonts on the DPC+ kernel: digits 5 lines tall instead of 8, so the score row is 3 lines shorter.
//
// The kernel draws the score in a loop of 8 lines (LDY #7 counts them), and the picture ends when the timer it started runs out.
// Squish runs the loop 5 times (LDY #4), and the 3 lines it saves go to the picture: the timer is raised to a value that ends the
// picture right (only some do, see WORKING_KERNEL_TIMERS), and what that gives the picture short of the 3 lines is waited out
// after the score, so the frame keeps its 262 lines. The coprocessor copies each digit's 8 bytes reversed into display memory (the
// kernel draws them from the first byte), so the table has the 5 rows of a Squish digit as its last 5 bytes (see
// buildScoreFontOverride's dpcPlus argument in score-font.js).

// The values of KERNEL_LINES the kernel ends its picture right with (measured on the emulator, a frame of the same length with each): 192,
// 195, 197, 200 and the stock 211, 214 and so on, each a line or two more picture; below 192 only 188, 185, 183, 178 and 173 (every
// value from 168 to 191 was tried: 194 and 168 and the others do not end the picture right, the frame comes out hundreds of lines long).
export const WORKING_KERNEL_TIMERS = [240, 238, 235, 233, 230, 228, 226, 223, 221, 219, 216, 214, 211, 209, 207, 204, 202, 200, 197,
  195, 192, 188, 185, 183, 178, 173];
export const SQUISH_LINES_SAVED = 3;

// A timer's picture is (timer * 64 / 76) lines, so a higher one gives the picture floor(difference * 64 / 76) lines more.
const gainOf = (from, to) => Math.floor((to - from) * 64 / 76);

// The timer to use with Squish in place of `timer` (one of WORKING_KERNEL_TIMERS), and how many lines to wait after the score.
export const squishKernelTimer = (timer) => {
  let best = {timer, waits: SQUISH_LINES_SAVED};
  WORKING_KERNEL_TIMERS.forEach((candidate) => {
    const gain = gainOf(timer, candidate);
    if (candidate > timer && gain <= SQUISH_LINES_SAVED && gain > SQUISH_LINES_SAVED - best.waits) {
      best = {timer: candidate, waits: SQUISH_LINES_SAVED - gain};
    }
  });
  return best;
};

const SCORE_LINES = /^(\s*)LDY #7\s*$/im;
const VDELP_FROM_Y = /^(\s*)STY VDELP0\s*$/im;
const LOOP_END = /^(\s*bpl scoreloop.*)$/im;
const KERNEL_TIMER = /KERNEL_LINES = (178\*76\/64|\d+)/;

// The lines that clear what the last score line left (the digits in the player registers, the second score bar's pattern) and
// wait out the lines the shorter loop did not give back to the picture.
export const squishWaitLines = (waits) => [
  '     ldx #0', '     stx GRP0', '     stx GRP1', '     stx GRP0',
  '    ifconst pfscore', '     stx PF1', '    endif',
  ...Array(waits).fill('     sta WSYNC'),
];

// The kernel with the 5 line score loop. forText: the Text Minikernel's hook already clears the registers and is where the waits go
// (see withDpcPlusTextHook), so only the loop count changes.
export const withDpcPlusSquishKernel = (kernel, waits, forText = false) => {
  if (!SCORE_LINES.test(kernel)) throw new Error('The DPC+ kernel has no score line count to shorten for a Squish font');
  // Y was also what the score code puts in VDELP0 (7 sets its first bit, the delay of the sprites that draw the digits), so X, which
  // holds 3 there, is stored instead.
  if (!VDELP_FROM_Y.test(kernel)) throw new Error('The DPC+ kernel has no VDELP0 write to keep for a Squish font');
  const shorter = kernel.replace(SCORE_LINES, '$1LDY #4').replace(VDELP_FROM_Y, '$1STx VDELP0');
  if (forText) return shorter;
  if (!LOOP_END.test(shorter)) throw new Error('The DPC+ kernel has no score loop to follow with the lines Squish saves');
  return shorter.replace(LOOP_END, (match) => [match, ...squishWaitLines(waits)].join('\n'));
};

// The header with the timer a Squish build uses.
export const withDpcPlusSquishHeader = (header, timer) => {
  if (!KERNEL_TIMER.test(header)) throw new Error('The DPC+ header has no screen height to give the Squish lines to');
  return header.replace(KERNEL_TIMER, `KERNEL_LINES = ${timer}`);
};

const fetchText = (path) => fetch(path).then((response) => response.text());

// The kernel and header files of a build with a Squish score font and no Text Minikernel (that one builds the kernel itself, see
// text-minikernel-files.js), on top of the ones the build already changed.
export const getDpcPlusSquishSiblingFiles = async (siblingFiles) => {
  const kernel = siblingFiles['DPCplus_kernel.asm'] || await fetchText('bb19/includes/DPCplus_kernel.asm');
  const header = siblingFiles['DPCplusbB.h'] || await fetchText('bb19/includes/DPCplusbB.h');
  const stock = /KERNEL_LINES = 178\*76\/64/.test(header) ? 211 : Number((/KERNEL_LINES = (\d+)/.exec(header) || [])[1]) || 211;
  const {timer, waits} = squishKernelTimer(stock);
  return {
    'DPCplus_kernel.asm': withDpcPlusSquishKernel(kernel, waits),
    'DPCplusbB.h': withDpcPlusSquishHeader(header, timer),
  };
};
