'use strict';

// utils/playfield-coords.js has PLAYER_PF_X_OFFSET (17); it is a parameter here so this file needs nothing else.
const DEFAULT_PF_X_OFFSET = 17;
// Where the first playfield row starts under DPC+, in scanlines of the picture (measured: the sprites' y 0 is that line).
const DPC_PLUS_FIRST_ROW_LINE = 4;

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
// partnerFrameVar: for a 16 pixel wide player, the frame byte of the sprite that shows its right half (255 while it is not shown);
// the box is twice as wide while it is shown. partnerHiddenVar: a bit that also hides it.
export const buildPlayfieldBoxLines = ({label, xVar, yVar, sizeVar, heightVar, resultVar, maxRow, rowDivisor, dpcPlusRows, dpcPlusRowSets, rowFracVar, maxRowVar,
  blankLines = true, pfXOffset = DEFAULT_PF_X_OFFSET, partnerFrameVar, partnerHiddenVar}) => {
  const lab = (name) => `${label}_${name}`;
  const at = (name) => `@ ${lab(name)}`;
  const rowOf = (expr, divisor) => (divisor === 1 ? `(${expr})` : `(${expr}) / ${divisor}`);
  // maxRowVar: a variable holding the last row less one that the showing background has (the backgrounds do not all have the same
  // number of rows); the last row itself is worked out into temp1 ahead of the clamps.
  const maxRowText = maxRowVar ? 'temp1' : maxRow;
  const maxRowPrelude = maxRowVar ? [`temp1 = ${maxRowVar} + 1`] : [];
  const dpcPlusRowLines = (rows) => [
    ...maxRowPrelude,
    // The bottom row: the last line of the box, y + height - 1, less where the first row starts.
    `temp3 = ${yVar} + ${heightVar}`,
    `if temp3 < ${yVar} then temp3 = 255`,
    `if temp3 < ${DPC_PLUS_FIRST_ROW_LINE + 1} then goto ${lab('clear')}`,
    `temp3 = ${rowOf(`temp3 - ${DPC_PLUS_FIRST_ROW_LINE + 1}`, rows.highDivisor)}`,
    `if temp3 > ${maxRowText} then temp3 = ${maxRowText}`,
    // The top row is kept in the result until the end.
    `${resultVar} = 0`,
    // A row whose number of lines is whole is lit on all but its last line: a box starting below the lit lines is below it.
    ...(rows.exact ? [
      `if ${yVar} >= ${DPC_PLUS_FIRST_ROW_LINE - 1} then ${resultVar} = ${rowOf(`${yVar} - ${DPC_PLUS_FIRST_ROW_LINE - 1}`,
          rows.lowDivisor)}`,
    ] : [
      `if ${yVar} >= ${DPC_PLUS_FIRST_ROW_LINE} then ${resultVar} = ${rowOf(`${yVar} - ${DPC_PLUS_FIRST_ROW_LINE}`,
          rows.lowDivisor)}`,
    ]),
  ];
  // The backgrounds that set a pfres have rows of other heights: each height has its lines, and the
  // one of the background showing (rowFracVar tells which) is jumped to.
  const dpcPlusSets = dpcPlusRowSets && dpcPlusRowSets.length > 1 && rowFracVar;
  const rowLines = dpcPlusSets ? [
    ...dpcPlusRowSets.slice(0, -1).map((rows, i) => `if ${rowFracVar} = ${rows.frac} then goto ${lab(`rows${i}`)}`),
    ...dpcPlusRowLines(dpcPlusRowSets[dpcPlusRowSets.length - 1]),
    `goto ${lab('rowsdone')}`,
    ...dpcPlusRowSets.slice(0, -1).flatMap((rows, i) => [at(`rows${i}`), ...dpcPlusRowLines(rows), `goto ${lab('rowsdone')}`]),
    at('rowsdone'),
  ] : dpcPlusRows ? dpcPlusRowLines(dpcPlusRows) : [
    // Rows: the bottom of the box is y, its top y - height. The top row is kept in the result until the end.
    // With blank lines a row is lit on all but the first of its y steps (y - 1 is the last it can start in), without them the
    // first one is shared with the row above.
    ...(blankLines ? [`if ${yVar} < 1 then goto ${lab('clear')}`, `temp3 = ${rowOf(`${yVar} - 1`, rowDivisor)}`] :
      [`temp3 = ${rowOf(yVar, rowDivisor)}`]),
    `if temp3 > ${maxRow} then temp3 = ${maxRow}`,
    `${resultVar} = 0`,
    `if ${yVar} > ${heightVar} then ${resultVar} = ${rowOf(`${yVar} - ${heightVar}`, rowDivisor)}`,
  ];
  // One box at xVar: the sprite itself or one of its copies.
  const oneBox = [
    // The width of the box in pixels less one, and where its left edge is: stretched sprites start one clock earlier.
    `temp5 = 7 : temp6 = ${pfXOffset}`,
    `if ${sizeVar} & 7 = 5 then temp5 = 15 : temp6 = ${pfXOffset - 1}`,
    `if ${sizeVar} & 7 = 7 then temp5 = 31 : temp6 = ${pfXOffset - 1}`,
    // The sprite is not shown while its frame byte says 255 or (when the player's variables are shared) its hidden bit is set.
    ...(partnerFrameVar && partnerHiddenVar ? [`if ${partnerFrameVar} = 255 then goto ${lab('narrow')}`,
      `if ${partnerHiddenVar} then goto ${lab('narrow')}`, 'temp5 = temp5 + temp5 + 1', at('narrow')] :
      partnerFrameVar ? [`if ${partnerFrameVar} <> 255 then temp5 = temp5 + temp5 + 1`] : []),
    // Kept so that x + width fits a byte for every x on the screen.
    `if temp5 > 95 then temp5 = 95`,
    // Right edge column, left edge column. Nothing of the box on the screen to the left: nothing to hit.
    `temp3 = ${xVar} + temp5`,
    `if temp3 < temp6 then goto ${lab('clear')}`,
    `temp3 = temp3 - temp6`,
    `temp3 = temp3 / 4`,
    `if temp3 > 31 then temp3 = 31`,
    `temp4 = 0`,
    `if ${xVar} >= temp6 then temp4 = (${xVar} - temp6) / 4`,
    `if temp4 > 31 then goto ${lab('clear')}`,
    // temp5 = right column, temp6 = left column from here on.
    `temp5 = temp3 : temp6 = temp4`,
    ...rowLines,
    `if ${resultVar} > temp3 then goto ${lab('clear')}`,
    `for temp6 = temp6 to temp5`,
    `  for temp4 = ${resultVar} to temp3`,
    `    if pfread(temp6, temp4) then goto ${lab('hit')}`,
    `  next`,
    `next`,
    at('clear'),
    `${resultVar} = 0`,
    `goto ${lab('done')}`,
    at('hit'),
    `${resultVar} = 1`,
    at('done'),
    `return`,
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
  return [
    `goto ${lab('start')}`,
    at('one'),
    ...oneBox,
    at('start'),
    `if ${xVar} >= ${pfXOffset + 160} then ${resultVar} = 0 : goto ${lab('finish')}`,
    `gosub ${lab('one')}`,
    `if ${resultVar} then goto ${lab('finish')}`,
    `if ${sizeVar} & 7 = 1 then goto ${lab('copies1')}`,
    `if ${sizeVar} & 7 = 2 then goto ${lab('copies2')}`,
    `if ${sizeVar} & 7 = 3 then goto ${lab('copies3')}`,
    `if ${sizeVar} & 7 = 4 then goto ${lab('copies4')}`,
    `if ${sizeVar} & 7 = 6 then goto ${lab('copies6')}`,
    `goto ${lab('finish')}`,
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
  ];
};
