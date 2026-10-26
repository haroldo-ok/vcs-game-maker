'use strict';

// The "same playfield columns" test of the box checks (undo last move, the walls and the standing check of the Jump block, the quick way in of
// the box test): a sprite whose box is in the same columns of the playfield at two x positions goes into no cell it was not in already, so
// the pixels need not be looked at again. A column is 4 pixels wide. Under DPC+ the left edge of a normal (8 pixel) box is at x - 16 and the
// columns are (x - 16) / 4 to (x - 9) / 4; a double wide sprite (NUSIZ 5, 16 pixels) has its left edge at x - 15 and its columns are
// (x - 15) / 4 to x / 4, a quad wide one (NUSIZ 7, 32 pixels) (x - 15) / 4 to (x + 16) / 4 (the same numbers as the coprocessor's box test).
// Any other copies of the sprite (NUSIZ 1 to 4 and 6) go to the whole test. The standard kernel's players are looked at as normal ones only.
//
// Returns lines of assembly (a line that starts with '@' is a label) that go to `full` unless the box at xA is in the same columns as at xB,
// and fall through when it is. `tmp` is a scratch byte. `prefix` makes the labels of the lines unique. Nothing else is changed (A and X are not
// kept). The labels are all in the one block of assembly the lines go in.
export const sameColumnsLines = ({sizeVar, xA, xB, tmp, full, prefix, offset, dpcPlus}) => {
  const lab = (name) => `${prefix}_${name}`;
  // The column of the box at xA (an edge, after `middle` worked on x) kept in tmp, and the one at xB compared with it.
  const compare = (middle, stub) => [
    `lda ${xA}`, ...middle, 'lsr', 'lsr', `sta ${tmp}`,
    `lda ${xB}`, ...middle, 'lsr', 'lsr', `cmp ${tmp}`, `bne ${lab(stub)}`,
  ];
  const sub = (n) => ['sec', `sbc #${n}`];
  // (A branch reaches only so far: each way has its stub, a jump to the whole test, right after it.)
  const way = (stub, ...checks) => [...checks.flat(), `jmp ${lab('same')}`, `@${lab(stub)}`, `jmp ${full}`];
  const normal = way('nd', compare(sub(offset), 'nd'), compare(sub(offset - 7), 'nd'));
  if (!dpcPlus) {
    return [`lda ${sizeVar}`, 'and #7', `bne ${lab('nd')}`, ...normal, `@${lab('same')}`];
  }
  return [
    `lda ${sizeVar}`, 'and #7', `beq ${lab('n')}`, 'cmp #5', `beq ${lab('d')}`, 'cmp #7', `beq ${lab('q')}`, `jmp ${full}`,
    `@${lab('n')}`, ...normal,
    `@${lab('d')}`, ...way('dd', compare(sub(15), 'dd'), [`lda ${xA}`, 'lsr', 'lsr', `sta ${tmp}`, `lda ${xB}`, 'lsr', 'lsr', `cmp ${tmp}`, `bne ${lab('dd')}`]),
    `@${lab('q')}`, ...way('qd', compare(sub(15), 'qd'), compare(['clc', 'adc #16'], 'qd')),
    `@${lab('same')}`,
  ];
};
