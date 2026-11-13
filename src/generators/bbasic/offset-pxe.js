'use strict';

// The Playfield offset block on the PXE kernel. The DPC+ kernel does it with a program of the project on the coprocessor (offset-arm.js), and the
// PXE ROM can not hold one, so the 6502 does it a cell at a time through the two functions the ARM program has: pfread (24) and pfpixel (12 sets, 13
// clears). It moves the pixels as the coprocessor's pass() and columns() do (public/bb19/includes/custom/armprog.c):
//   a row at a time (directions 0 alternate rows, 1 left, 2 right, 5 alternate the other way round): all left and all right wrap the pixel
//     that leaves a row round to its other end; with the alternate rows it goes in at the next row of the order (from the top row down), and
//     the pixel the last row of the order sends out comes in at the first;
//   a column at a time (3 up, 4 down, 6 alternate columns up and down, 7 down and up): the column turns round in the rows of the area.
// Only a cell that changes is written. The routine takes the direction, the columns x1 to x2 and the rows y1 to y2 (in order, inside the
// playfield) from the working bytes below.

// The direction, the area and the three bytes that must outlast a call of the cell routines. The loop counters are the compiler's scratch bytes
// (temp1 to temp6), which nothing else uses while the routine runs.
export const PXE_OFFSET_VARS = ['pxoDir', 'pxoX1', 'pxoX2', 'pxoY1', 'pxoY2', 'pxoCur'];

// Where they go: bytes of the Display RAM (the extended RAM from $0400, six areas of 128 bytes) that no block of the project uses, from the top down.
// The data stream pointers ($06F8 to $06FD) are never taken. Returns the address of each name that found a free byte; the others are variables.
// A fill, a copy or a data stream pointer with a start or count that is not a number can reach any later byte, so it takes its area and
// all the areas after it.
export const pxeOffsetPlacement = (blocks) => {
  const used = new Set();
  const take = (from, to) => {
    for (let at = from; at <= Math.min(to, 0x6ff); at++) used.add(at);
  };
  const base = (block, field) => 0x400 + (Number(block.getFieldValue(field)) || 0) * 128;
  const literal = (block, input) => {
    const target = block.getInputTargetBlock(input);
    return target && target.type === 'math_number' ? Math.round(Number(target.getFieldValue('NUM')) || 0) : null;
  };
  blocks.filter((block) => block.isEnabled()).forEach((block) => {
    if (/^display_ram_(set|change|get)$/.test(block.type)) {
      take(base(block, 'AREA') + (Number(block.getFieldValue('INDEX')) || 0), base(block, 'AREA') + (Number(block.getFieldValue('INDEX')) || 0));
    } else if (block.type === 'display_ram_fill') {
      const start = literal(block, 'START');
      const count = literal(block, 'COUNT');
      if (start === null || count === null) take(base(block, 'AREA'), 0x6ff);
      else take(base(block, 'AREA') + (start & 127), base(block, 'AREA') + (start & 127) + Math.max(0, count - 1));
    } else if (block.type === 'display_ram_copy') {
      const from = literal(block, 'FROM');
      const to = literal(block, 'TO');
      const count = literal(block, 'COUNT');
      if (from === null || to === null || count === null) {
        take(base(block, 'FROM_AREA'), 0x6ff);
        take(base(block, 'TO_AREA'), 0x6ff);
      } else {
        take(base(block, 'FROM_AREA') + (from & 127), base(block, 'FROM_AREA') + (from & 127) + Math.max(0, count - 1));
        take(base(block, 'TO_AREA') + (to & 127), base(block, 'TO_AREA') + (to & 127) + Math.max(0, count - 1));
      }
    } else if (block.type === 'data_stream_point') {
      take(base(block, 'AREA'), 0x6ff);
    }
  });
  take(0x6f8, 0x6fd);
  const placement = {};
  let at = 0x6ff;
  PXE_OFFSET_VARS.forEach((name) => {
    while (at >= 0x400 && used.has(at)) at--;
    if (at >= 0x400) {
      placement[name] = `$${at.toString(16).toUpperCase().padStart(4, '0')}`;
      at--;
    }
  });
  return placement;
};

export const reservePxeOffsetDevVars = (reserveDevVar, used, placement) => {
  if (!used) return;
  PXE_OFFSET_VARS.filter((name) => !placement[name]).forEach((name) => reserveDevVar(name, undefined, 'Playfield offset (PXE): working byte'));
};

export const PXE_OFFSET_ROUTINE = '_background_offset_pxe';

// vars: the names of the working bytes (PXE_OFFSET_VARS).
export const buildPxeOffsetBody = (vars, maxRowText, maxColumn = 31) => {
  const maxRow = Number(maxRowText) || 0;
  const v = {...vars, pxoR: 'temp3', pxoK: 'temp4', pxoC: 'temp5', pxoY: 'temp6', pxoPin: 'temp1', pxoFirst: 'temp2', pxoTmp: vars.pxoCur};
  // A branch that can reach any distance (a branch only goes 127 bytes): the opposite branch over a jump.
  let farCount = 0;
  const opposite = {beq: 'bne', bne: 'beq', bcs: 'bcc', bcc: 'bcs', bmi: 'bpl', bpl: 'bmi'};
  const far = (branch, target) => {
    farCount++;
    return [`${opposite[branch]} _pxo_far${farCount}`, `jmp ${target}`, `@_pxo_far${farCount}`];
  };
  // The cell next to the loop's cell (offset +1 or -1, in the column when rows is false, else in the row), read.
  const rdNext = (loopVar, other, plus, byColumn) => [
    `lda ${loopVar}`, plus ? 'clc' : 'sec', plus ? 'adc #1' : 'sbc #1',
    ...(byColumn ? [`sta ${v.pxoY}`, `lda ${other}`, `sta ${v.pxoC}`] : [`sta ${v.pxoC}`, `lda ${other}`, `sta ${v.pxoY}`]),
    'jsr _pxo_rd',
  ];
  // One line (a row when byColumn is false, a column when true) turned one cell along, from `lo` to `hi`: `plus` takes the cell after (the
  // pixels move towards lower cells), else the one before. `fixed` is the row (or column) of the line; the pixel `incoming` is put in at the
  // end the pixels come to, and the pixel that went out at the other end is left in pxoFirst.
  const line = (name, loopVar, fixed, lo, hi, plus, byColumn, incoming) => {
    const from = plus ? lo : hi;
    const to = plus ? hi : lo;
    const at = (cell, value) => (byColumn ?
      [`lda ${cell}`, `sta ${v.pxoY}`, `lda ${fixed}`, `sta ${v.pxoC}`, ...value, 'jsr _pxo_wr'] :
      [`lda ${cell}`, `sta ${v.pxoC}`, `lda ${fixed}`, `sta ${v.pxoY}`, ...value, 'jsr _pxo_wr']);
    return [
      // the cell that goes out, read (and the one being looked at)
      ...(byColumn ? [`lda ${from}`, `sta ${v.pxoY}`, `lda ${fixed}`, `sta ${v.pxoC}`] : [`lda ${from}`, `sta ${v.pxoC}`, `lda ${fixed}`, `sta ${v.pxoY}`]),
      'jsr _pxo_rd', `sta ${v.pxoFirst}`, `sta ${v.pxoCur}`, `lda ${from}`, `sta ${loopVar}`,
      `@_pxo_${name}_loop`, `lda ${loopVar}`, `cmp ${to}`, `beq _pxo_${name}_done`,
      // (the cell differs from the one it takes, so it takes the opposite of what it had)
      ...rdNext(loopVar, fixed, plus, byColumn), `cmp ${v.pxoCur}`, `beq _pxo_${name}_same`,
      `lda ${v.pxoCur}`, 'eor #1', `sta ${v.pxoCur}`, ...at(loopVar, [`lda ${v.pxoCur}`]),
      `@_pxo_${name}_same`, `lda ${loopVar}`, plus ? 'clc' : 'sec', plus ? 'adc #1' : 'sbc #1', `sta ${loopVar}`, `jmp _pxo_${name}_loop`,
      `@_pxo_${name}_done`,
      // the last cell takes the pixel that comes in, unless it is the one it has
      `lda ${incoming}`, `cmp ${v.pxoCur}`, `beq _pxo_${name}_fin`,
      ...at(to, [`lda ${incoming}`]),
      `@_pxo_${name}_fin`,
    ];
  };
  // A column turned round in the rows y1 to y2 (up: the row takes the one below, the last the first), pxoK the column.
  const column = (name, up) => line(name, v.pxoR, v.pxoK, v.pxoY1, v.pxoY2, up, true, v.pxoFirst);
  const rowLine = (name, left) => line(name, v.pxoK, v.pxoR, v.pxoX1, v.pxoX2, left, false, v.pxoPin);
  return [
    'asm',
    'jmp _pxo_main',
    // A: 1 when the cell (pxoC, pxoY) is lit (pfread answers 0 then)
    '@_pxo_rd',
    'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function)', 'sta DF0HI', 'lda #24', 'sta DF0WRITE',
    `lda ${v.pxoC}`, 'sta DF0WRITE', `lda ${v.pxoY}`, 'sta DF0WRITE', 'lda #255', 'sta CALLFUNCTION', 'lda DF0DATA',
    'beq _pxo_lit', 'lda #0', 'rts', '@_pxo_lit', 'lda #1', 'rts',
    // the cell (pxoC, pxoY) set when A is 1, cleared when it is 0
    '@_pxo_wr',
    'beq _pxo_clear', 'ldx #12', 'jmp _pxo_go', '@_pxo_clear', 'ldx #13', '@_pxo_go',
    'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function)', 'sta DF0HI', 'stx DF0WRITE', 'stx DF0WRITE',
    `lda ${v.pxoY}`, 'sta DF0WRITE', `lda ${v.pxoC}`, 'sta DF0WRITE', 'lda #255', 'sta CALLFUNCTION', 'rts',
    // A is a row: A comes back 1 when that row moves left (direction 1; direction 0 on the even rows; direction 5 on the odd ones)
    '@_pxo_isleft',
    `sta ${v.pxoTmp}`, `lda ${v.pxoDir}`, 'cmp #1', 'beq _pxo_yes', 'cmp #0', 'bne _pxo_chk5',
    `lda ${v.pxoTmp}`, 'and #1', 'beq _pxo_yes', 'jmp _pxo_no',
    '@_pxo_chk5', 'cmp #5', 'bne _pxo_no', `lda ${v.pxoTmp}`, 'and #1', 'bne _pxo_yes',
    '@_pxo_no', 'lda #0', 'rts', '@_pxo_yes', 'lda #1', 'rts',
    '@_pxo_main',
    // the corners in order, inside the playfield
    ...[['pxoX1', 'pxoX2'], ['pxoY1', 'pxoY2']].flatMap(([a, b], i) => [
      `lda ${v[a]}`, `cmp ${v[b]}`, `bcc _pxo_ord${i}`, `beq _pxo_ord${i}`, 'sta temp1', `lda ${v[b]}`, `sta ${v[a]}`, 'lda temp1', `sta ${v[b]}`,
      `@_pxo_ord${i}`]),
    ...['pxoX1', 'pxoX2', 'pxoY1', 'pxoY2'].flatMap((name, i) => [
      `lda ${v[name]}`, `cmp #${i < 2 ? maxColumn + 1 : maxRow + 1}`, `bcc _pxo_clamp${i}`, `lda #${i < 2 ? maxColumn : maxRow}`, `sta ${v[name]}`, `@_pxo_clamp${i}`]),
    `lda ${v.pxoDir}`, 'cmp #3', ...far('beq', '_pxo_colmode'), 'cmp #4', ...far('beq', '_pxo_colmode'), 'cmp #6', ...far('bcs', '_pxo_colmode'),
    // rows: direction 1 goes from the bottom row up, the others from the top row down
    `lda ${v.pxoDir}`, 'cmp #1', 'bne _pxo_asc',
    `lda ${v.pxoY2}`, `sta ${v.pxoR}`, `lda ${v.pxoY1}`, 'jmp _pxo_init',
    '@_pxo_asc',
    `lda ${v.pxoY1}`, `sta ${v.pxoR}`, `lda ${v.pxoY2}`,
    '@_pxo_init',
    // the pixel that comes in first is the one the last row of the order sends out
    `sta ${v.pxoY}`, 'jsr _pxo_isleft', 'beq _pxo_pinr',
    `lda ${v.pxoX1}`, `sta ${v.pxoC}`, 'jmp _pxo_pinread', '@_pxo_pinr', `lda ${v.pxoX2}`, `sta ${v.pxoC}`,
    '@_pxo_pinread', 'jsr _pxo_rd', `sta ${v.pxoPin}`,
    '@_pxo_row',
    // all left and all right: the pixel that comes in is the one this row sends out (it wraps round the row)
    `lda ${v.pxoDir}`, 'cmp #1', 'beq _pxo_wrapl', 'cmp #2', 'bne _pxo_nowrap',
    `lda ${v.pxoX2}`, 'jmp _pxo_wrapc', '@_pxo_wrapl', `lda ${v.pxoX1}`,
    '@_pxo_wrapc', `sta ${v.pxoC}`, `lda ${v.pxoR}`, `sta ${v.pxoY}`, 'jsr _pxo_rd', `sta ${v.pxoPin}`,
    '@_pxo_nowrap',
    `lda ${v.pxoR}`, 'jsr _pxo_isleft', ...far('beq', '_pxo_rightrow'),
    ...rowLine('l', true),
    'jmp _pxo_rowdone',
    '@_pxo_rightrow',
    ...rowLine('r', false),
    '@_pxo_rowdone',
    // the pixel that went out of this row comes in at the next
    `lda ${v.pxoFirst}`, `sta ${v.pxoPin}`,
    `lda ${v.pxoDir}`, 'cmp #1', 'bne _pxo_down1', `lda ${v.pxoR}`, `cmp ${v.pxoY1}`, ...far('beq', '_pxo_end'), `dec ${v.pxoR}`, 'jmp _pxo_row',
    '@_pxo_down1', `lda ${v.pxoR}`, `cmp ${v.pxoY2}`, ...far('beq', '_pxo_end'), `inc ${v.pxoR}`, 'jmp _pxo_row',
    // columns: dir 3 all up, 4 all down, 6 the even columns up and the odd ones down, 7 the other way round
    '@_pxo_colmode',
    `lda ${v.pxoX1}`, `sta ${v.pxoK}`,
    '@_pxo_col',
    `lda ${v.pxoDir}`, 'cmp #3', ...far('beq', '_pxo_up'), 'cmp #4', ...far('beq', '_pxo_down'),
    // 6: the even columns go up; 7: the odd ones
    `lda ${v.pxoK}`, 'and #1', `sta ${v.pxoTmp}`, `lda ${v.pxoDir}`, 'sec', 'sbc #6', `cmp ${v.pxoTmp}`, ...far('beq', '_pxo_up'), 'jmp _pxo_down',
    '@_pxo_up',
    ...column('u', true),
    'jmp _pxo_nextcol',
    '@_pxo_down',
    ...column('d', false),
    '@_pxo_nextcol',
    `lda ${v.pxoK}`, `cmp ${v.pxoX2}`, ...far('beq', '_pxo_end'), 'clc', 'adc #1', `sta ${v.pxoK}`, 'jmp _pxo_col',
    '@_pxo_end',
    '@end',
  ];
};
