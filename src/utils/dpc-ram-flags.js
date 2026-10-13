'use strict';

// DPC+ keeps 4K of display RAM that the 6502 only reaches through the coprocessor's data fetchers, and the last 256 bytes of it
// (page $0F) lie past the end of the stack, free in every build. A byte kept there needs no variable slot. The price is cycles: a
// read or write goes through a fetcher (set its address, then read DFxDATA or write DFxWRITE; each access moves the address on by
// one), which is fine for a flag looked at once a frame and no use for anything the kernel needs.
//
// The "Run once" flags live there. Two fetchers do the work, so a byte is read through DF0 and written back through DF1 without the
// address being set again in between. The kernel sets every fetcher up again when it draws, and the flags are only used between
// frames, where fast fetch is off (so the immediate loads below are safe).
const PAGE = '$0F';

// Both fetchers pointing at the flag byte at this offset.
const aim = (offset) => [`lda #${offset}`, 'sta DF0LOW', 'sta DF1LOW', `lda #${PAGE}`, 'sta DF0HI', 'sta DF1HI'];

// A "Run once" block's entry: marks its instance touched this frame and fired, leaving whether it had fired already in temp2
// (non-zero: it had, so the block's blocks are skipped). Ends in an asm block the caller follows with the jump.
export const runOnceEnterLines = (offset, touchedBit, firedBit) => [
  'asm',
  ...aim(offset),
  'lda DF0DATA',
  `ora #${1 << touchedBit}`,
  'sta temp1',
  `and #${1 << firedBit}`,
  'sta temp2',
  'lda temp1',
  `ora #${1 << firedBit}`,
  'sta DF1WRITE',
  '@end',
];

// The per-frame reset body, as the lines of an asm block (see generateRunOnceEdgeReset): for each of the count bytes, a fired bit
// stays only if its touched bit is set, and the touched bits clear for the next frame to mark again.
export const runOnceResetLines = (count) => [
  'asm',
  ...aim(0),
  ...Array.from({length: count}).flatMap(() => [
    'lda DF0DATA',
    'sta temp2',
    'and #$0F',
    'sta temp1',
    'lda temp2',
    'lsr',
    'lsr',
    'lsr',
    'lsr',
    'and temp1',
    'asl',
    'asl',
    'asl',
    'asl',
    'sta DF1WRITE',
  ]),
  '@end',
];

// Clears both bits of the first pairs instances (the ones a title screen and the gameplay take turns with).
export const runOnceClearLines = (pairs) => {
  const bytes = [];
  for (let byte = 0; byte * 4 < pairs; byte++) {
    const used = Math.min(4, pairs - byte * 4);
    const mask = ((1 << used) - 1) * 0x11;
    bytes.push(['lda DF0DATA', `and #${(~mask) & 0xFF}`, 'sta DF1WRITE']);
  }
  return ['asm', ...aim(0), ...bytes.flat(), '@end'];
};

// Zeroes the flag bytes when the program starts (display RAM holds whatever it did at power-on).
export const runOnceStartupLines = (count) => [
  'asm',
  'lda #0',
  'sta DF1LOW',
  `lda #${PAGE}`,
  'sta DF1HI',
  'lda #0',
  ...Array.from({length: count}).map(() => 'sta DF1WRITE'),
  '@end',
];
