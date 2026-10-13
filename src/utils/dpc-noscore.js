'use strict';

// With the score hidden ("noscore") the DPC+ kernel still spends the score's scanlines on nothing: after the picture it waits out
// 11 lines, and the picture itself is 178 lines. This gives them to the picture, so the playfield runs on down to its last row.
// The kernel ends its picture when the timer it started runs out, and only some starting values end it right (measured on the
// emulator: 211, 214, 216, 219, 221, 223, 226, 228, 230, 233, 235, 238 and 240, each a line or two more picture; 233 is the one
// that draws the last playfield row whole), and the frame has to stay 262 lines: the wait is dropped, and the rest of what the
// taller picture takes comes out of the overscan timer, where the game's code runs (8 of its 39 steps).
const NOSCORE_KERNEL_TIMER = 233;
const NOSCORE_OVERSCAN_STEPS_LESS = 8;
const NOSCORE_WAIT = /(ifconst noscore\r?\n)\s*ldx #10\r?\nnoscoreloop\r?\n\s*sta WSYNC\r?\n\s*dex\r?\n\s*bpl noscoreloop\r?\n(\s*rts)/;
const KERNEL_TIMER = /KERNEL_LINES = 178\*76\/64/;
const OVERSCAN_TIMER = /OVERSCAN_LINES = 128\+33\*76\/64/;

const fetchText = (path) => fetch(path).then((response) => response.text());

export const withDpcPlusNoScoreKernel = (kernel) => {
  if (!NOSCORE_WAIT.test(kernel)) throw new Error('The DPC+ kernel has no score wait to give to the picture');
  return kernel.replace(NOSCORE_WAIT, '$1$2');
};

export const withDpcPlusNoScoreHeader = (header) => {
  if (!KERNEL_TIMER.test(header)) throw new Error('The DPC+ header has no screen height to give the score lines to');
  if (!OVERSCAN_TIMER.test(header)) throw new Error('The DPC+ header has no overscan time to give the score lines to');
  return header.replace(KERNEL_TIMER, `KERNEL_LINES = ${NOSCORE_KERNEL_TIMER}`)
      .replace(OVERSCAN_TIMER, `OVERSCAN_LINES = 128+33*76/64-${NOSCORE_OVERSCAN_STEPS_LESS}`);
};

// The kernel and header files of a build whose score is hidden (on top of the ones the build already changed).
export const getDpcPlusNoScoreSiblingFiles = async (siblingFiles) => {
  const kernel = siblingFiles['DPCplus_kernel.asm'] || await fetchText('bb19/includes/DPCplus_kernel.asm');
  const header = siblingFiles['DPCplusbB.h'] || await fetchText('bb19/includes/DPCplusbB.h');
  return {
    'DPCplus_kernel.asm': withDpcPlusNoScoreKernel(kernel),
    'DPCplusbB.h': withDpcPlusNoScoreHeader(header),
  };
};
