'use strict';

// A range of colors for the rainbow blocks (the player "rainbow colors" and the playfield one): only colors inside the range are shown. A block gives it as the
// first and last color value (0 to 255: "colors from 0 to 15" is the shades of gray, 16 to 31 the shades of gold); the ramp steps through the values of the range
// two at a time (the TIA ignores the lowest bit of a color, so 0 and 1 are the same color), one value a row. A block of an older project may have a span of hues
// instead (see rainbowRangeOf): one hue a row at one brightness, which is worked out as it was.
//
// The rainbow does not make colors, it aims the color pointer of the player (or of the playfield rows) at memory that holds bytes (see
// generateRainbowColorChecks in sprites.js). With a span the pointer is aimed at a small table of colors instead: a ramp of the hues of the span, one hue a
// row, a fixed brightness. The "offset" of the block only chooses which row of the ramp the sprite starts at, so the table repeats every `span` rows and
// is only as long as the tallest rainbow sprite plus the span (a row of a DPC+ or PXE sprite is two lines). It is made when the ROM is built, nothing is worked out per frame except the start row.
//
//   standard kernel: the table is ROM data in the main bank, the pointer is its address plus the start row (16 bits).
//   DPC+ players:    the coprocessor reads colors from the cartridge's data, so the table is declared as a color table ("player1color:") each frame the rainbow runs
//                    (which also points the player at it) and the start row is added to that pointer. The DPC+ playfield rainbow loads its own rows.
//
// The hue is the high 4 bits of a color byte (0 gray, 1 gold, 2 orange ... 15 light orange); a span can go round (from 14 to 2 is 14, 15, 0, 1, 2).

import {rainbowTableAsm} from '../../utils/bank-tables';

export const HUE_ANY = '-1';
export const RAINBOW_LUMINANCE = 10;
// The rows of a table when the pre-scan in bbasic.js has not set them (it sets them to the tallest sprite there is: the table is that long plus the span).
export const RAINBOW_MIN_ROWS = 64;
export const RAINBOW_MAX_ROWS = RAINBOW_MIN_ROWS;
// The standard kernel reads a playfield row's color with the index (4 x the row) from `skip` on (132 - 4 x the rows the playfield has, less a row for the blank lines)
// to 124 (the last line reads index 124), and the start row moves it up by 4 x the phase: the table has only those bytes, and the pointer is aimed `skip` bytes below its
// start. (Before, the table began at index 0 and its first `skip` bytes were never read.) The rows of a table are the highest index it holds plus the margin of one.
export const RAINBOW_PLAYFIELD_TOP = 126;
export const RAINBOW_PLAYFIELD_ROWS = RAINBOW_PLAYFIELD_TOP;

export const HUE_NAMES = ['gray', 'gold', 'orange', 'red-orange', 'pink', 'purple', 'purple-blue', 'blue', 'blue', 'light blue', 'turquoise', 'green-blue', 'green',
  'yellow-green', 'orange-green', 'light orange'];

// The dropdown lists of the two fields of a block: any hue (no span), or one of the 16 hues.
export const hueOptions = () => [['any hue', HUE_ANY], ...HUE_NAMES.map((name, hue) => [`${hue.toString(16).toUpperCase()} ${name}`, String(hue)])];

// The span a block asks for as {first, span}, or null for every hue (a field that is "any hue", or a span of all 16).
// The most values a ramp has: its table (the rows of the sprite or of the playfield plus the ramp) has to stay in one page of the bank. A wider range is sampled
// (every colorStep-th color value of it).
export const RAINBOW_MAX_STEPS = 32;

// A color value of the range from the block plugged into the input: a Color block or a Number block (a constant, since the table is made when the ROM is built).
// The default when nothing is plugged in; null for any other block.
export const rainbowRangeValue = (block, name, fallback) => {
  const target = block.getInputTargetBlock(name);
  if (!target) return fallback;
  if (target.type === 'math_number') return Number(target.getFieldValue('NUM'));
  if (target.type === 'color_get') return Number(target.getFieldValue('COLOR'));
  return null;
};

// Whether both ends of the range are blocks that the table can be made from (the build warns of the ones that are not).
export const rainbowRangeIsConstant = (block) => rainbowRangeValue(block, 'COLORFROM', 0) !== null && rainbowRangeValue(block, 'COLORTO', 255) !== null;

export const rainbowRangeOf = (block) => {
  const hueFrom = Number(block.getFieldValue('HUEFROM'));
  const hueTo = Number(block.getFieldValue('HUETO'));
  if (hueFrom >= 0 && hueFrom <= 15 && hueTo >= 0 && hueTo <= 15) {
    // A span of hues, kept by a block of an older project.
    const span = ((hueTo - hueFrom + 16) % 16) + 1;
    return span >= 16 ? null : {first: hueFrom, span};
  }
  const from = rainbowRangeValue(block, 'COLORFROM', 0);
  const to = rainbowRangeValue(block, 'COLORTO', 255);
  if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
  const first = Math.max(0, Math.min(255, Math.round(from))) & 254;
  const last = Math.max(0, Math.min(255, Math.round(to))) & 254;
  const steps = ((last - first + 256) % 256) / 2 + 1;
  if (steps >= 128) return null;
  const colorStep = 2 * Math.ceil(steps / RAINBOW_MAX_STEPS);
  return {first, span: Math.floor(((steps - 1) * 2) / colorStep) + 1, colorStep};
};

// (A span that is for the playfield rows has `rows` and `stride` set: the standard kernel reads the color of the next row 4 bytes on in its table, up to
// about index 125, so every color is repeated 4 times in the table and the start row moves in steps of 4.)
// (A range made from color values has a colorStep, one made from a span of hues does not.)
const rainbowKind = (range) => (range.colorStep ? `_rainbowcolors_${range.first}_${range.colorStep}_${range.span}` : `_rainbowhues_${range.first}_${range.span}`);
export const sameRainbowRange = (a, b) => rainbowKind(a) === rainbowKind(b);
export const rainbowTableName = (range) => `${rainbowKind(range)}_${range.rows || RAINBOW_MAX_ROWS}_${range.stride || 1}${range.skip ? `_s${range.skip}` : ''}`;
// The address the pointer is aimed at: `skip` bytes below the start of the table, so that the index the kernel reads lands on the byte for that row.
export const rainbowTableAddress = (range) => (range.skip ? `(${rainbowTableName(range)}-${range.skip})` : rainbowTableName(range));
export const rainbowTableLength = (range) => (range.rows || RAINBOW_MAX_ROWS) + range.span * (range.stride || 1) - 1;
export const rainbowColor = (range, row) => {
  const step = Math.floor(row / (range.stride || 1)) % range.span;
  return range.colorStep ? (range.first + range.colorStep * step) & 255 : ((range.first + step) % 16) * 16 + RAINBOW_LUMINANCE;
};
export const rainbowTableValues = (range) => Array.from({length: rainbowTableLength(range)}, (_, row) => rainbowColor(range, row + (range.skip || 0)));

// The tables the project needs as items for placeKernelTables (utils/bank-tables.js), once each (ranges: the {first, span, rows, stride} of each).
export const rainbowTableItems = (ranges) => [...new Map(ranges.map((range) => [rainbowTableName(range), range])).values()].map((range) => ({
  name: rainbowTableName(range),
  length: rainbowTableLength(range),
  // (A table the pointer is aimed below has to start at least that far into its page: see placeKernelTables.)
  minOffset: range.skip || 0,
  lines: rainbowTableAsm(rainbowTableName(range), rainbowTableValues(range)),
}));

// The lines (bB statements) that leave the start row of the ramp in `into`: the offset taken modulo the span, by subtracting the span times a power of two
// while that fits (a fixed number of steps, no loop that depends on the number).
export const rainbowPhaseLines = (offsetExpression, span, into = 'temp1', stride = 1) => {
  const lines = [` ${into} = ${offsetExpression}`];
  let steps = 0;
  while ((span << (steps + 1)) <= 255) steps++;
  for (let k = steps; k >= 0; k--) lines.push(` if ${into} >= ${span << k} then ${into} = ${into} - ${span << k}`);
  if (stride > 1) lines.push(` ${into} = ${into} * ${stride}`);
  return lines;
};

// The same start row, in assembly: `load` (a "lda ..." line) loads the offset, and the offset is taken modulo the span by the same fixed steps (a compare and a
// subtract of the span times a power of two, the carry from the compare being the one the subtract needs), then multiplied by the stride when that is a power of
// two. The result is left in the accumulator. `id` makes the labels of the steps different from other uses in the same asm block. Null when the stride is not a
// power of two (the caller then uses rainbowPhaseLines).
export const rainbowPhaseAsm = (load, span, stride, id) => {
  if (stride > 1 && (stride & (stride - 1)) !== 0) return null;
  const lines = [`  ${load}`];
  let steps = 0;
  while ((span << (steps + 1)) <= 255) steps++;
  for (let k = steps; k >= 0; k--) lines.push(`  cmp #${span << k}`, `  bcc .${id}_s${k}`, `  sbc #${span << k}`, `.${id}_s${k}`);
  for (let shift = 1; shift < stride; shift <<= 1) lines.push('  asl');
  return lines;
};
