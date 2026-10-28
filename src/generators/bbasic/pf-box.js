'use strict';

import {sameColumnsLines} from './box-columns';

// utils/playfield-coords.js has PLAYER_PF_X_OFFSET (17); it is a parameter here so this file needs nothing else.
const DEFAULT_PF_X_OFFSET = 17;

// A software box test against the playfield: does a sprite's box at a candidate position overlap a lit playfield pixel?
// The hardware collision flag only says so after the sprite was drawn there, and it never says it for the virtual sprites of
// the DPC+ kernel, so moving into a wall can only be undone after the fact (see collision_check_position). With this the
// position can be tried first.
//
// Each copy of a sprite (NUSIZ 1 to 4 and 6) is tested by itself, wrapping round the screen edge, and a 16 pixel wide player is covered out to
// the right half.
//
// The cells the box covers are read with pfread(), column by column and row by row. Measured on the emulator against the
// hardware flag with a solid sprite (standard kernel, normal, double and quad width, 1, 8 and 16 rows tall, row heights 3,
// 5, 6, 8 and 12): the sprite's left edge is at x - 17 (x - 16 when it is stretched) and a column is 4 pixels wide, so an 8
// pixel sprite covers the columns (x - 17) / 4 to (x - 10) / 4; a playfield row is D y steps tall and shares its first y
// step with the row above (with blank lines, the default, the row is lit from its second step on instead: the rows are
// (y - h) / D to (y - 1) / D), so a sprite whose bottom is at y and which is h steps tall covers the rows (y - h) / D to y / D.
// Under DPC+ a sprite's y is its top line and the rows are L lines tall from line 4 on (a row that does not have a whole
// number of lines is covered by a row more on each side), so it covers the rows (y - 4) / L to (y + h - 5) / L; the left edge
// is at the same place. The part of a box past the right edge of the screen is ignored (the hardware wraps it round to the left
// edge, which is not counted). Every column and row is brought into range before pfread() sees it (a byte that would go
// negative wraps to a big number).
//
// Returns the lines of bB code (labels are lines starting with "@ "). xVar and yVar hold the candidate position, sizeVar the
// player's size byte (NUSIZ: 5 is double and 7 quad width) and heightVar its height; the code leaves 1 in resultVar when the
// box overlaps a lit pixel, else 0.
// Scratch: temp1 to temp4 (pfread takes temp1 and temp2) and temp5, temp6.
// rowDivisor: the standard kernel's row height in y steps; blankLines: whether the kernel draws the blank lines between rows
// (the "no_blank_lines" option off); dpcPlusRows: {lowDivisor, highDivisor, exact} the rows' height in lines under DPC+ rounded
// up and rounded down, and whether that is a whole number.
// objectWidth: for a missile or the ball, a bB expression for its width code (0 to 3 for 1, 2, 4 and 8 pixels); they have no copies
// and sizeVar is not used. yShift: lines added to the y given, and extraHeight: lines added to the height, for the objects the kernel draws
// a line lower or taller than the player's box (measured against the hardware flag).
// extVar: a variable that makes the box a sweep, for a sprite that moves several lines at once (the Jump block): its low seven bits are
// lines added to the box (under DPC+ below it, from y down; with the standard kernel above it, y is the bottom), its top bit makes the
// rows be looked at from the bottom up instead of from the top down. The result is then the number of the first row with a lit pixel in
// the direction looked, plus one (0 for none), so the caller can put the sprite right against that row without trying each line. The
// variable is put back to 0 when the test is done, so a test that does not set it is a plain one.
// armRows: DPC+ only, with rows whose height is only known when the program runs (backgrounds with different numbers of rows): the rows of a line
// and the first line of a row are worked out by the coprocessor (functions 56 and 60 of custom/main.c, built with DPC_ROWS) where the 6502
// would need a loop of multiplications or divisions for each.
// partnerFrameVar: for a 16 pixel wide player, the frame byte of the sprite that shows its right half (255 while it is not shown);
// the box is twice as wide while it is shown. partnerHiddenVar: a bit that also hides it.
export const buildPlayfieldBoxLines = ({label, xVar, yVar, sizeVar, heightVar: baseHeightVar, resultVar, maxRow, rowDivisor, dpcPlusRows, dpcPlusRowSets, rowFracVar, maxRowVar,
  blankLines = true, pfXOffset = DEFAULT_PF_X_OFFSET, partnerFrameVar, partnerHiddenVar, directRead = false, objectWidth, yShift = 0, extraHeight = 0, extVar, dpcPlusScan = false, armRows = false, quickLastXVar, armBox = false, armGroups = false}) => {
  const heightVar = extraHeight ? `(${baseHeightVar} ${extraHeight < 0 ? '-' : '+'} ${Math.abs(extraHeight)})` : baseHeightVar;
  const lab = (name) => `${label}_${name}`;
  const at = (name) => `@ ${lab(name)}`;
  const rowOf = (expr, divisor) => (divisor === 1 ? `(${expr})` : `(${expr}) / ${divisor}`);
  // maxRowVar: a variable holding the last row less one that the showing background has (the backgrounds do not all have the same
  // number of rows); the last row itself is worked out into temp1 ahead of the clamps.
  const maxRowText = maxRowVar ? 'temp1' : maxRow;
  // (Reading that variable, kept in display RAM, goes through temp5, which holds the right column, so that is kept aside.)
  const maxRowPrelude = maxRowVar ? ['temp4 = temp5', `temp1 = ${maxRowVar} + 1`, 'temp5 = temp4'] : [];
  // DPC+: the kernel steps through the playfield rows by a fraction, DFxFRACINC, added every line (a byte, so a row is not a whole number of
  // lines unless 256 divides by it): the row a line is in is its line times that, divided by 256, rounded down. So a box from line y
  // to line y + height - 1 covers the rows of those two lines, as the hardware flag has it (measured on the emulator for several
  // pfres and heights: the sprite's y is its top line and the first row starts at line 0). The row of a line is worked out as an assembly
  // multiplication (the product does not fit a byte).
  // Where a sweep that found a lit row puts the sprite: right against that row (the row is in temp4, plus one), looking the way the sweep did.
  // Worked out here, where the row geometry is known, into temp2 (and put in yVar at the end for the caller to use, see below). Falling
  // (DPC+): the line the row starts on, less the height; rising: the first line below the row. (Standard kernel: the last y step above
  // the row, and the first y whose top is below it.) The shift and height of a missile or the ball are taken out (see yShift and extraHeight).
  const stepsOf = (n) => (Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0 ? Math.log2(n) : -1);
  const subtractFrom = (amount, name) => (amount === 0 ? [] : amount > 0 ?
    ['sec', `sbc #${amount}`, `bcs ${lab(`ls${name}`)}`, 'lda #0', `@${lab(`ls${name}`)}`] :
    ['clc', `adc #${-amount}`, `bcc ${lab(`ls${name}`)}`, 'lda #255', `@${lab(`ls${name}`)}`]);
  const timesConstant = (factor, name) => {
    if (factor === 1) return [];
    if (stepsOf(factor) > 0) return Array(stepsOf(factor)).fill('asl');
    return ['sta temp2', `lda #${factor}`, 'sta temp1', 'lda #0', 'ldx #8', 'lsr temp1', `@${lab(`lm${name}`)}`,
      `bcc ${lab(`lmn${name}`)}`, 'clc', 'adc temp2', `@${lab(`lmn${name}`)}`, 'ror', 'ror temp1', 'dex',
      `bne ${lab(`lm${name}`)}`, 'lda temp1'];
  };
  // The coprocessor calls: the rows of two lines (in the two variables, out in temp3 and the result), and the first line of the row in A.
  const armIncrement = rowFracVar;
  const armTwoRows = (line1Var, line2Var) => [
    'asm', 'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function) & $0F', 'sta DF0HI', 'lda #56', 'sta DF0WRITE',
    `lda ${line1Var}`, 'sta DF0WRITE', `lda ${line2Var}`, 'sta DF0WRITE', `lda ${armIncrement}`, 'sta DF0WRITE',
    'lda #255', 'sta CALLFUNCTION', 'lda #<(C_function+1)', 'sta DF0LOW', 'lda DF0DATA', 'sta temp3', 'lda DF0DATA', `sta ${resultVar}`,
    '@end',
  ];
  const armRowStart = () => [
    'sta temp1', 'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function) & $0F', 'sta DF0HI', 'lda #60', 'sta DF0WRITE',
    'lda temp1', 'sta DF0WRITE', `lda ${armIncrement}`, 'sta DF0WRITE', 'lda #255', 'sta CALLFUNCTION',
    'lda #<(C_function+1)', 'sta DF0LOW', 'lda DF0DATA',
  ];
  const landingLines = () => {
    const dpcPlus = !!dpcPlusScan;
    const incIsVar = !!(rowFracVar && (dpcPlusRowSets || []).length > 1);
    const incOperand = incIsVar ? rowFracVar : `#${dpcPlusRows ? dpcPlusRows.frac : 255}`;
    const lineShift = !incIsVar && dpcPlusRows ? stepsOf(256 / dpcPlusRows.frac) : -1;
    const tableMode = dpcPlus && !incIsVar && lineShift < 0;
    // The first line a row starts on (A holds the row), by shifts, a division or the table of rows.
    const startOfRow = (name) => {
      if (lineShift >= 0) {
        const lines = [];
        for (let i = 0; i < lineShift; i++) {
          lines.push('asl', `bcc ${lab(`lc${name}${i}`)}`, 'lda #255', `jmp ${lab(`lcd${name}`)}`, `@${lab(`lc${name}${i}`)}`);
        }
        if (lineShift) lines.push(`@${lab(`lcd${name}`)}`);
        return lines;
      }
      if (armRows && incIsVar) return armRowStart();
      return ['sta temp3', `lda ${incOperand}`, 'sta temp2', 'sec', 'sbc #1', 'sta temp1', 'lda #0', 'ldx #16',
        `@${lab(`ld${name}`)}`, 'asl temp1', 'rol temp3', 'rol', `bcs ${lab(`lds${name}`)}`, 'cmp temp2', `bcc ${lab(`ldn${name}`)}`,
        `@${lab(`lds${name}`)}`, 'sbc temp2', 'inc temp1', `@${lab(`ldn${name}`)}`, 'dex', `bne ${lab(`ld${name}`)}`,
        'lda temp3', `beq ${lab(`ldk${name}`)}`, 'lda #255', 'sta temp1', `@${lab(`ldk${name}`)}`, 'lda temp1'];
    };
    // The coprocessor with groups of columns that have separate rows answers in lines (the line, plus one): see box in armprog.c.
    const fallingDpcPlus = armGroups ? ['lda temp4', 'sec', 'sbc #1'] : tableMode ? [
      // Looks down from the line the bottom is on for the first line whose row is the one found.
      'lda temp4', 'sec', 'sbc #1', 'sta temp1',
      `lda ${yVar}`, 'clc', `adc ${baseHeightVar}`, 'sec', 'sbc #1', 'tax',
      `@${lab('lf')}`, 'inx', 'cpx #192', `bcs ${lab('lff')}`, `lda ${lab('rowtab')},x`, 'cmp temp1', `bcc ${lab('lf')}`,
      `@${lab('lff')}`, 'txa',
    ] : ['lda temp4', 'sec', 'sbc #1', ...startOfRow('f')];
    const risingDpcPlus = armGroups ? ['lda temp4', 'sec', 'sbc #1'] : tableMode ? [
      // Looks up from the line the top was on for the first line of the rows above the one found.
      `lda ${extVar}`, 'and #127', 'clc', `adc ${yVar}`, 'tax',
      `@${lab('lr')}`, 'dex', 'cpx #192', `bcs ${lab('lr')}`, `lda ${lab('rowtab')},x`, 'cmp temp4', `bcs ${lab('lr')}`,
      'inx', 'txa',
    ] : ['lda temp4', ...startOfRow('r')];
    const falling = dpcPlus ? [
      ...fallingDpcPlus, 'sec', `sbc ${baseHeightVar}`, `bcs ${lab('lf1')}`, 'lda #0', `@${lab('lf1')}`,
      ...subtractFrom(extraHeight + yShift, 'f2'),
    ] : [
      'lda temp4', 'sec', 'sbc #1', ...timesConstant(rowDivisor, 'f'),
      ...(blankLines ? [] : ['sec', 'sbc #1', `bcs ${lab('lf0')}`, 'lda #0', `@${lab('lf0')}`]),
      ...subtractFrom(yShift, 'f2'),
    ];
    const rising = dpcPlus ? [
      ...risingDpcPlus, ...subtractFrom(yShift, 'r2'),
    ] : [
      'lda temp4', ...timesConstant(rowDivisor, 'r'),
      'clc', `adc ${baseHeightVar}`, `bcs ${lab('lr1')}`,
      ...(extraHeight ? ['clc', `adc #${extraHeight}`, `bcs ${lab('lr1')}`] : []),
      `jmp ${lab('lr3')}`, `@${lab('lr1')}`, 'lda #255', `@${lab('lr3')}`,
      ...subtractFrom(yShift, 'r4'),
    ];
    return [
      // Only a sweep of more than one line works it out (the caller does not move for a single line).
      `if ${extVar} = 0 then goto ${lab('done')}`,
      `temp1 = ${extVar} & 127`,
      `if temp1 = 1 then goto ${lab('done')}`,
      `if ${extVar}{7} then goto ${lab('landrise')}`,
      'asm', ...falling, 'sta temp2', `jmp .${lab('landed')}`, '@end',
      at('landrise'),
      'asm', ...rising, 'sta temp2', '@end',
      at('landed'),
    ];
  };
  // The table of the row each line is in, for DPC+ rows that are not a power of two lines tall (its code is the line times the increment, divided
  // by 256, which takes far longer than a lookup): 192 lines are enough, rows go no further.
  const rowTableLines = (dpcPlusScan && !(rowFracVar && (dpcPlusRowSets || []).length > 1) && dpcPlusRows && stepsOf(256 / dpcPlusRows.frac) < 0) ? [
    'asm',
    // The DPC+ cartridge answers reads of the first 128 bytes of a page 0 of a bank as its registers, and an indexed read that crosses a page
    // does an extra read at the address before the page is corrected, so a table that straddles a page, or sits in the first one, can
    // trigger them (a write of the byte to a fetcher). Aligned on a page, the table is never in the first page and never crosses one.
    'align 256',
    `@${lab('rowtab')}`,
    ...Array.from({length: 12}, (_, i) => `.byte ${Array.from({length: 16}, (__, j) => Math.floor((i * 16 + j) * dpcPlusRows.frac / 256)).join(',')}`),
    '@end',
  ] : [];
  const dpcPlusRowLines = (rows) => {
    const incVar = rowFracVar && (dpcPlusRowSets || []).length > 1;
    const inc = incVar ? rowFracVar : `#${rows.frac}`;
    // A row that is a power of two lines tall is the line shifted right; else it is the product of the line and the increment, divided by 256.
    const shifts = !incVar && Number.isInteger(256 / rows.frac) && (256 / rows.frac & (256 / rows.frac - 1)) === 0 ? Math.log2(256 / rows.frac) : -1;
    const tabled = !incVar && shifts < 0;
    const rowOfLine = (lineVar, destVar, n) => (shifts >= 0 ? [
      'asm',
      `lda ${lineVar}`,
      ...Array(shifts).fill('lsr'),
      `sta ${destVar}`,
      '@end',
    ] : tabled ? [
      'asm',
      `ldx ${lineVar}`,
      'cpx #192',
      `bcc ${lab(`tab${n}`)}`,
      'ldx #191',
      `@${lab(`tab${n}`)}`,
      `lda ${lab('rowtab')},x`,
      `sta ${destVar}`,
      '@end',
    ] : [
      'asm',
      `lda ${lineVar}`,
      'sta temp2',
      `lda ${inc}`,
      'sta temp1',
      'lda #0',
      'ldx #8',
      'lsr temp1',
      `@${lab(`mul${n}`)}`,
      `bcc ${lab(`mulskip${n}`)}`,
      'clc',
      'adc temp2',
      `@${lab(`mulskip${n}`)}`,
      'ror',
      'ror temp1',
      'dex',
      `bne ${lab(`mul${n}`)}`,
      `sta ${destVar}`,
      '@end',
    ]);
    // The rows the sprite is in (a plain test, with no sweep asked for).
    const plainRows = shifts >= 0 && /^[A-Za-z_][A-Za-z0-9_]*$/.test(heightVar) ? [
      // Rows a power of two lines tall: the bottom line of the box, y + height - 1 (a box that runs past the last line stops there), and its
      // top line, each shifted down to its row.
      'asm',
      `lda ${yVar}`,
      'clc',
      `adc ${heightVar}`,
      `bcc ${lab('rowsnc')}`,
      'lda #255',
      `@${lab('rowsnc')}`,
      `beq ${lab('rowszero')}`,
      'sec',
      'sbc #1',
      `@${lab('rowszero')}`,
      ...Array(shifts).fill('lsr'),
      'sta temp3',
      `lda ${yVar}`,
      ...Array(shifts).fill('lsr'),
      `sta ${resultVar}`,
      '@end',
      ...maxRowPrelude,
      `if temp3 > ${maxRowText} then temp3 = ${maxRowText}`,
    ] : [
      // The bottom line of the box, y + height - 1 (a box that runs past the last line stops there).
      `temp3 = ${yVar} + ${heightVar}`,
      `if temp3 < ${yVar} then temp3 = 255`,
      `if temp3 > 0 then temp3 = temp3 - 1`,
      // (Labels 3 and 4, those of the sweep's rows are 1 and 2.)
      ...(armRows && incVar ? armTwoRows('temp3', yVar) : [...rowOfLine('temp3', 'temp3', 3),
        // The top row is kept in the result until the end.
        ...rowOfLine(yVar, resultVar, 4)]),
      ...maxRowPrelude,
      `if temp3 > ${maxRowText} then temp3 = ${maxRowText}`,
    ];
    if (extVar) {
      // A sweep only looks at the rows the sprite is going into (the rows it is in are known to be clear): falling, those below the one its
      // bottom line is in, down to the one its new bottom line is in; rising, those above the one its top line is in, up to the one its new top
      // line is in. The rows are kept in the result (the first) and temp3 (the last), and none is left when the second comes before the first.
      return [
        `if ${extVar} = 0 then goto ${lab('rowsplain')}`,
        `temp4 = ${extVar} & 127`,
        `if ${extVar}{7} then goto ${lab('rowsup')}`,
        `temp3 = ${yVar} + ${heightVar}`,
        `if temp3 < ${yVar} then temp3 = 255`,
        `if temp3 > 0 then temp3 = temp3 - 1`,
        `${resultVar} = temp3 + temp4`,
        `if ${resultVar} < temp3 then ${resultVar} = 255`,
        `goto ${lab('rowsgot')}`,
        at('rowsup'),
        `temp3 = ${yVar}`,
        `${resultVar} = ${yVar} + temp4`,
        `if ${resultVar} < ${yVar} then ${resultVar} = 255`,
        at('rowsgot'),
        ...(armRows && incVar ? armTwoRows('temp3', resultVar) : [...rowOfLine('temp3', 'temp3', 1), ...rowOfLine(resultVar, resultVar, 2)]),
        `if ${extVar}{7} then goto ${lab('rowsfixup')}`,
        `temp4 = temp3 + 1`,
        `temp3 = ${resultVar}`,
        `${resultVar} = temp4`,
        `goto ${lab('rowsfixed')}`,
        at('rowsfixup'),
        `if ${resultVar} = 0 then goto ${lab('rowsnone')}`,
        `temp4 = ${resultVar} - 1`,
        `${resultVar} = temp3`,
        `temp3 = temp4`,
        `goto ${lab('rowsfixed')}`,
        at('rowsnone'),
        `${resultVar} = 1`,
        `temp3 = 0`,
        at('rowsfixed'),
        ...maxRowPrelude,
        `if temp3 > ${maxRowText} then temp3 = ${maxRowText}`,
        `goto ${lab('rowsend')}`,
        at('rowsplain'),
        ...plainRows,
        at('rowsend'),
      ];
    }
    return plainRows;
  };
  // The backgrounds that set a pfres have rows of other heights: the increment is then read from the variable that holds the one of the
  // background showing (rowFracVar), so the same code serves all of them.
  const dpcPlusSets = dpcPlusRowSets && dpcPlusRowSets.length > 1 && rowFracVar;
  const rowLines = dpcPlusSets ? [
    ...dpcPlusRowLines(dpcPlusRowSets[0]),
  ] : dpcPlusRows ? dpcPlusRowLines(dpcPlusRows) : [
    // Rows: the bottom of the box is y, its top y - height. The top row is kept in the result until the end.
    // With blank lines a row is lit on all but the first of its y steps (y - 1 is the last it can start in), without them the
    // first one is shared with the row above.
    ...(blankLines ? [`if ${yVar} < 1 then goto ${lab('clear')}`, `temp3 = ${rowOf(`${yVar} - 1`, rowDivisor)}`] :
      [`temp3 = ${rowOf(yVar, rowDivisor)}`]),
    `if temp3 > ${maxRow} then temp3 = ${maxRow}`,
    `${resultVar} = 0`,
    // A sweep also covers the lines the sprite is moving through, above the box.
    ...(extVar ? [`temp1 = ${extVar} & 127`, `temp1 = temp1 + ${heightVar}`,
      `if ${yVar} > temp1 then ${resultVar} = ${rowOf(`${yVar} - temp1`, rowDivisor)}`] :
      [`if ${yVar} > ${heightVar} then ${resultVar} = ${rowOf(`${yVar} - ${heightVar}`, rowDivisor)}`]),
  ];
  // The standard kernel's playfield is 4 bytes a row (the left PF1 and PF2, then the right ones), so the cells are read straight from
  // those bytes instead of through a pfread() call each: a mask for the column (the same bit order pfread() uses) and the byte of
  // the row. Columns temp6 to temp5, rows resultVar to temp3; temp4 is left 1 when a cell is lit (a sweep: the row, plus one, of
  // the first lit cell, looking from the top row down or, with the top bit of its variable set, from the bottom row up).
  const directMasks = [
    '.byte $80,$40,$20,$10,$08,$04,$02,$01,$01,$02,$04,$08,$10,$20,$40,$80',
    '.byte $80,$40,$20,$10,$08,$04,$02,$01,$01,$02,$04,$08,$10,$20,$40,$80',
  ];
  const directColumnLines = [
    `@${lab('dr_row')}`,
    'lda temp6',
    'sta temp3',
    `@${lab('dr_col')}`,
    'lda temp3',
    'lsr',
    'lsr',
    'lsr',
    'clc',
    'adc temp1',
    'tay',
    'ldx temp3',
    `lda ${lab('dr_masks')},x`,
    'and playfield,y',
    `bne ${lab('dr_hit')}`,
    'lda temp3',
    'cmp temp5',
    `bcs ${lab('dr_nextrow')}`,
    'inc temp3',
    `jmp ${lab('dr_col')}`,
  ];
  const directReadLines = extVar ? [
    'asm',
    `lda ${extVar}`,
    `bmi ${lab('dr_up')}`,
    `lda ${resultVar}`,
    'asl',
    'asl',
    'sta temp1',
    'lda temp3',
    'asl',
    'asl',
    'sta temp2',
    `jmp ${lab('dr_go')}`,
    `@${lab('dr_up')}`,
    'lda temp3',
    'asl',
    'asl',
    'sta temp1',
    `lda ${resultVar}`,
    'asl',
    'asl',
    'sta temp2',
    `@${lab('dr_go')}`,
    'lda #0',
    'sta temp4',
    ...directColumnLines,
    `@${lab('dr_nextrow')}`,
    'lda temp1',
    'cmp temp2',
    `beq ${lab('dr_done')}`,
    `lda ${extVar}`,
    `bmi ${lab('dr_prev')}`,
    'lda temp1',
    'clc',
    'adc #4',
    'sta temp1',
    `jmp ${lab('dr_row')}`,
    `@${lab('dr_prev')}`,
    'lda temp1',
    'sec',
    'sbc #4',
    'sta temp1',
    `jmp ${lab('dr_row')}`,
    `@${lab('dr_hit')}`,
    'lda temp1',
    'lsr',
    'lsr',
    'clc',
    'adc #1',
    'sta temp4',
    `@${lab('dr_done')}`,
    `jmp ${lab('dr_end')}`,
    `@${lab('dr_masks')}`,
    ...directMasks,
    `@${lab('dr_end')}`,
    '@end',
    `if temp4 then goto ${lab('hit')}`,
  ] : [
    'asm',
    `lda ${resultVar}`,
    'asl',
    'asl',
    'sta temp1',
    'lda temp3',
    'asl',
    'asl',
    'sta temp2',
    'lda #0',
    'sta temp4',
    ...directColumnLines,
    `@${lab('dr_nextrow')}`,
    'lda temp1',
    'cmp temp2',
    `bcs ${lab('dr_done')}`,
    'clc',
    'adc #4',
    'sta temp1',
    `jmp ${lab('dr_row')}`,
    `@${lab('dr_hit')}`,
    'lda #1',
    'sta temp4',
    `@${lab('dr_done')}`,
    `jmp ${lab('dr_end')}`,
    `@${lab('dr_masks')}`,
    ...directMasks,
    `@${lab('dr_end')}`,
    '@end',
    `if temp4 then goto ${lab('hit')}`,
  ];
  // DPC+: the playfield is four columns of bytes in display RAM, a byte a row, that a data fetcher reads at a row's address (the kernel sets
  // the fetchers up every frame, so the code may point them where it likes), where the coprocessor's pfread() costs far more time for each
  // cell. A column byte holds eight columns of the picture: most significant bit first in the first and third, least significant first in the
  // second and fourth. The bytes the columns temp6 to temp5 are in are looked at one at a time, each with the mask of its columns (from
  // two small tables), and the rows resultVar to temp3 in the direction wanted.
  const dpcPlusReadRow = [
    'tya',
    'clc',
    'adc #<PF1L',
    'sta DF0LOW',
    'lda #((>PF1L)&$0F)',
    'adc temp1',
    'sta DF0HI',
    'lda DF0DATA',
    'and temp2',
  ];
  const dpcPlusScanLines = [
    'asm',
    'lda #0',
    'sta temp4',
    'lda temp6',
    'lsr',
    'lsr',
    'lsr',
    'sta temp1',
    `@${lab('sc_byte')}`,
    'lda temp1',
    'asl',
    'asl',
    'asl',
    'sta temp2',
    'lda temp6',
    'sec',
    'sbc temp2',
    `bcs ${lab('sc_lo')}`,
    'lda #0',
    `@${lab('sc_lo')}`,
    'tax',
    'lda temp5',
    'sec',
    'sbc temp2',
    'cmp #8',
    `bcc ${lab('sc_hi')}`,
    'lda #7',
    `@${lab('sc_hi')}`,
    'eor #7',
    'tay',
    'lda temp1',
    'and #1',
    `bne ${lab('sc_odd')}`,
    `lda ${lab('sc_a')},x`,
    `and ${lab('sc_c')},y`,
    `jmp ${lab('sc_mask')}`,
    `@${lab('sc_odd')}`,
    `lda ${lab('sc_c')},x`,
    `and ${lab('sc_a')},y`,
    `@${lab('sc_mask')}`,
    'sta temp2',
    ...(extVar ? [`lda ${extVar}`, `bmi ${lab('sc_up')}`] : []),
    `ldy ${resultVar}`,
    `@${lab('sc_down')}`,
    ...dpcPlusReadRow,
    `bne ${lab('sc_found')}`,
    'cpy temp3',
    `beq ${lab('sc_next')}`,
    'iny',
    `jmp ${lab('sc_down')}`,
    ...(extVar ? [
      `@${lab('sc_up')}`,
      'ldy temp3',
      `@${lab('sc_upl')}`,
      ...dpcPlusReadRow,
      `bne ${lab('sc_found')}`,
      `cpy ${resultVar}`,
      `beq ${lab('sc_next')}`,
      'dey',
      `jmp ${lab('sc_upl')}`,
    ] : []),
    `@${lab('sc_found')}`,
    ...(extVar ? [
      'iny',
      'sty temp2',
      'lda temp4',
      `beq ${lab('sc_store')}`,
      `lda ${extVar}`,
      `bmi ${lab('sc_best_up')}`,
      'lda temp2',
      'cmp temp4',
      `bcs ${lab('sc_next')}`,
      `jmp ${lab('sc_store')}`,
      `@${lab('sc_best_up')}`,
      'lda temp2',
      'cmp temp4',
      `bcc ${lab('sc_next')}`,
      `beq ${lab('sc_next')}`,
      `@${lab('sc_store')}`,
      'lda temp2',
      'sta temp4',
    ] : [
      'lda #1',
      'sta temp4',
      `jmp ${lab('sc_done')}`,
    ]),
    `@${lab('sc_next')}`,
    'lda temp5',
    'lsr',
    'lsr',
    'lsr',
    'cmp temp1',
    `beq ${lab('sc_done')}`,
    'inc temp1',
    `jmp ${lab('sc_byte')}`,
    // (Aligned so that an indexed read of either table does not cross a page: see rowTableLines.)
    'align 8',
    `@${lab('sc_a')}`,
    '.byte $FF,$7F,$3F,$1F,$0F,$07,$03,$01',
    `@${lab('sc_c')}`,
    '.byte $FF,$FE,$FC,$F8,$F0,$E0,$C0,$80',
    `@${lab('sc_done')}`,
    '@end',
    `if temp4 then goto ${lab('hit')}`,
  ];
  // The end of the test of one box: nothing hit, or a hit (a sweep also works out where the sprite stops).
  const oneTail = [
    at('clear'),
    `${resultVar} = 0`,
    `goto ${lab('done')}`,
    at('hit'),
    ...(extVar ? [`${resultVar} = 1`, `if ${extVar} then ${resultVar} = temp4`, ...landingLines()] : [`${resultVar} = 1`]),
    at('done'),
    `return`,
  ];
  // One box at xVar: the sprite itself or one of its copies.
  const oneBox = [
    // The width of the box in pixels less one, and where its left edge is: stretched sprites start one clock earlier.
    ...(objectWidth ? [
      `temp1 = ${objectWidth}`,
      `temp5 = 0 : temp6 = ${pfXOffset}`,
      `if temp1 > 0 then temp5 = 1`,
      `if temp1 > 1 then temp5 = 3`,
      `if temp1 > 2 then temp5 = 7`,
    ] : [
      // Normal, double (5) or quad (7) width.
      'asm',
      `lda ${sizeVar}`,
      'and #7',
      'ldx #7',
      `ldy #${pfXOffset}`,
      'cmp #5',
      `bne ${lab('nodbl')}`,
      'ldx #15',
      `ldy #${pfXOffset - 1}`,
      `@${lab('nodbl')}`,
      'cmp #7',
      `bne ${lab('noquad')}`,
      'ldx #31',
      `ldy #${pfXOffset - 1}`,
      `@${lab('noquad')}`,
      'stx temp5',
      'sty temp6',
      '@end',
    ]),
    // The sprite is not shown while its frame byte says 255 or (when the player's variables are shared) its hidden bit is set.
    ...(partnerFrameVar && partnerHiddenVar ? [`if ${partnerFrameVar} = 255 then goto ${lab('narrow')}`,
      `if ${partnerHiddenVar} then goto ${lab('narrow')}`, 'temp5 = temp5 + temp5 + 1', at('narrow')] :
      partnerFrameVar ? [`if ${partnerFrameVar} <> 255 then temp5 = temp5 + temp5 + 1`] : []),
    // Right edge column, left edge column (x + width fits a byte for every x on the screen, the widest box being 63 pixels). Nothing of the
    // box on the screen to the left: nothing to hit. temp5 = right column, temp6 = left column from here on.
    'asm',
    `lda ${xVar}`,
    'clc',
    'adc temp5',
    'sec',
    'sbc temp6',
    `bcs ${lab('colsr')}`,
    `jmp .${lab('clear')}`,
    `@${lab('colsr')}`,
    'lsr',
    'lsr',
    'cmp #32',
    `bcc ${lab('colsr2')}`,
    'lda #31',
    `@${lab('colsr2')}`,
    'tay',
    `lda ${xVar}`,
    'sec',
    'sbc temp6',
    `bcs ${lab('colsl')}`,
    'lda #0',
    `@${lab('colsl')}`,
    'lsr',
    'lsr',
    'cmp #32',
    `bcc ${lab('colsl2')}`,
    `jmp .${lab('clear')}`,
    `@${lab('colsl2')}`,
    'sta temp6',
    'sty temp5',
    '@end',
    ...rowLines,
    `if ${resultVar} > temp3 then goto ${lab('clear')}`,
    ...(dpcPlusScan ? dpcPlusScanLines : directRead ? directReadLines : [
      `for temp6 = temp6 to temp5`,
      `  for temp4 = ${resultVar} to temp3`,
      `    if pfread(temp6, temp4) then goto ${lab('hit')}`,
      `  next`,
      `next`,
    ]),
    ...oneTail,
  ];
  // The copies of a sprite (NUSIZ 1 to 4 and 6) are drawn 16, 32 or 64 pixels to the right of it, round the edge of the screen: a
  // copy past the right edge shows at the left edge, and counts there. Only a sprite whose box is off the screen to the right
  // counts for nothing, copies and all.
  const copyStep = (distance) => [
    `${xVar} = ${xVar} + ${distance}`,
    `if ${xVar} >= ${pfXOffset + 160} then ${xVar} = ${xVar} - 160`,
    `gosub ${lab('one')}`,
    `if ${resultVar} then goto ${lab('finish')}`,
  ];
  // A second way in for the Undo last move block (quickLastXVar is where its player was before the move): when the box keeps to the same
  // playfield columns as the box at that x, and so goes into no cell it was not in already, it is not looked at (a plain player 8 pixels wide
  // only). The columns are those of (x - offset) / 4 and (x - offset + 7) / 4; anything else goes on to the whole test.
  const quickEntry = quickLastXVar && !partnerFrameVar ? [
    at('chk'),
    'asm',
    ...sameColumnsLines({sizeVar, xA: xVar, xB: quickLastXVar, tmp: 'temp1', full: lab('chkfull'), prefix: lab('qc'), offset: pfXOffset, dpcPlus: armBox}),
    'lda #0', `sta ${resultVar}`, `jmp .${lab('chkdone')}`,
    `@${lab('chkfull')}`, `jmp .${lab('start')}`,
    '@end',
    at('chkdone'),
    'return',
  ] : [];
  // armBox: one box of a player without a partner sprite is tested by the coprocessor (function 128 and up of custom/main.c, the program of
  // offset-arm.js; the numbers of the rows are in the program): the height, x, y, the width of the sprite (in bits 5 and 6 of the sweep byte) and the sweep go to it
  // and it gives back 0, 1 or, for a sweep, the number of the first lit row plus one, and the code goes on at the hit or clear labels of the 6502 test.
  // A missile or the ball (objectWidth): kind 3 with its width less one (0, 1, 3 or 7) in the low bits, its height with the correction of its
  // geometry (extraHeight); a player whose partner sprite shows is twice as wide: a double width box one pixel to the left (the same columns),
  // or a quad one when it is stretched already.
  const partnerHiddenOperand = partnerHiddenVar ? /^(w+){(d)}$/.exec(partnerHiddenVar) : null;
  const armOne = armBox ? [
    ...(objectWidth ? [`temp1 = ${objectWidth}`] : []),
    'asm',
    'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function) & $0F', 'sta DF0HI',
    `lda ${baseHeightVar}`,
    ...(extraHeight < 0 ? ['sec', `sbc #${-extraHeight}`] : extraHeight > 0 ? ['clc', `adc #${extraHeight}`] : []),
    'and #$7F', 'ora #$80', 'sta DF0WRITE',
    ...(objectWidth ? [
      `lda ${xVar}`, 'sta DF0WRITE',
      `lda ${yVar}`, 'sta DF0WRITE',
      ...(extVar ? [`lda ${extVar}`, 'and #$9F', 'ora #$60'] : ['lda #$60']), 'sta DF0WRITE',
      // The width code 0 to 3 as the width less one (0, 1, 3, 7), in the fifth byte.
      'lda #0', 'ldx temp1', `beq ${lab('armo')}`, 'lda #1', 'cpx #2', `bcc ${lab('armo')}`, 'lda #3', 'cpx #3', `bcc ${lab('armo')}`, 'lda #7',
      `@${lab('armo')}`, 'sta DF0WRITE',
    ] : [
      // Normal width 0, double 1, quad 2 (bits 5 and 6 of the last byte), in temp1; the x in temp2.
      `lda ${sizeVar}`, 'and #7', 'ldx #0', 'cmp #5', `bne ${lab('armw5')}`, 'ldx #$20', `@${lab('armw5')}`, 'cmp #7', `bne ${lab('armw7')}`, 'ldx #$40', `@${lab('armw7')}`,
      'stx temp1', ...(partnerFrameVar ? [`lda ${xVar}`, 'sta temp2'] : []),
      ...(partnerFrameVar ? [
        `lda ${partnerFrameVar}`, 'cmp #255', `beq ${lab('armnp')}`,
        ...(partnerHiddenOperand ? [`lda ${partnerHiddenOperand[1]}`, `and #${1 << Number(partnerHiddenOperand[2])}`, `bne ${lab('armnp')}`] : []),
        'lda temp1', `bne ${lab('armpn')}`, 'lda #$20', 'sta temp1', 'dec temp2', `jmp ${lab('armnp')}`,
        `@${lab('armpn')}`, 'cmp #$20', `bne ${lab('armnp')}`, 'lda #$40', 'sta temp1',
        `@${lab('armnp')}`,
      ] : []),
      partnerFrameVar ? 'lda temp2' : `lda ${xVar}`, 'sta DF0WRITE',
      `lda ${yVar}`, 'sta DF0WRITE',
      // (temp1 is 0, $20 or $40: the mask only matters for a byte of flags.)
      ...(extVar ? [`lda ${extVar}`, 'and #$9F', 'ora temp1'] : ['lda temp1']), 'sta DF0WRITE',
    ]),
    'lda #255', 'sta CALLFUNCTION',
    'lda #<(C_function+1)', 'sta DF0LOW', 'lda DF0DATA', 'sta temp4',
    // (A hit goes on at the hit label; no hit is the clear label's work, done here without a jump to it.)
    `bne .${lab('hit')}`, `sta ${resultVar}`, `jmp .${lab('done')}`,
    '@end',
    ...oneTail,
  ] : [];
  const start = [
    `goto ${lab('start')}`,
    ...quickEntry,
    ...rowTableLines,
    at('one'),
    ...(armBox ? armOne : oneBox),
    at('start'),
    `if ${xVar} >= ${pfXOffset + 160} then ${resultVar} = 0 : goto ${lab('finish')}`,
    `gosub ${lab('one')}`,
    `if ${resultVar} then goto ${lab('finish')}`,
    // The box test used temp1, so the number of copies is read again. A sprite with one copy (the usual case) leaves at once;
    // the others jump straight to their copies.
    `temp1 = ${sizeVar} & 7`,
    `if temp1 = 0 then goto ${lab('finish')}`,
    `on temp1 goto ${lab('finish')} ${lab('copies1')} ${lab('copies2')} ${lab('copies3')} ${lab('copies4')} ${lab('finish')} ${lab('copies6')} ${lab('finish')}`,
    at('copies3'),
    ...copyStep(16),
    at('copies1'),
    ...copyStep(16),
    `goto ${lab('finish')}`,
    at('copies6'),
    ...copyStep(32),
    at('copies2'),
    ...copyStep(32),
    `goto ${lab('finish')}`,
    at('copies4'),
    ...copyStep(64),
    at('finish'),
    ...(extVar ? [`if ${extVar} = 0 then goto ${lab('keepy')}`, `if ${resultVar} then ${yVar} = temp2`, at('keepy'), `${extVar} = 0`] : []),
  ];
  // A missile or the ball has no copies.
  return objectWidth ? [
    `goto ${lab('start')}`,
    ...rowTableLines,
    at('one'),
    ...(armBox ? armOne : oneBox),
    at('start'),
    ...(yShift ? [`${yVar} = ${yVar} ${yShift < 0 ? '-' : '+'} ${Math.abs(yShift)}`] : []),
    `if ${xVar} >= ${pfXOffset + 160} then ${resultVar} = 0 : goto ${lab('finish')}`,
    `gosub ${lab('one')}`,
    at('finish'),
    ...(yShift ? [`${yVar} = ${yVar} ${yShift < 0 ? '+' : '-'} ${Math.abs(yShift)}`] : []),
    ...(extVar ? [`if ${extVar} = 0 then goto ${lab('keepy')}`, `if ${resultVar} then ${yVar} = temp2`, at('keepy'), `${extVar} = 0`] : []),
  ] : start;
};
