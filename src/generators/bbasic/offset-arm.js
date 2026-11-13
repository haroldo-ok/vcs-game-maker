'use strict';

// The coprocessor program of the DPC+ kernel's Playfield offset block and playfield box test (functions 64 and 68 and up of
// public/bb19/includes/custom/main.c, built with DPC_OFFSET). The program is the compiled armprog.c (a self-contained, position independent Thumb
// routine), placed in the ROM as data in a subroutine, and the coprocessor is given the place of it (the way the sound engine is given its waveforms).
// Offset function numbers: 68 alternate, 69 left, 70 right, 71 up, 72 down, 73 alternate the other way round, 74 alternate columns up and down, 75 alternate columns down and up. The box test is function 128 and up (128 plus the height).
export const ARM_PROGRAM_SUBROUTINE = '_dpc_arm_program';
export const OFFSET_ARM_PROGRAM = '_dpc_arm_program_code';
export const OFFSET_ARM_FUNCTION = {alternate: 68, left: 69, right: 70, up: 71, down: 72, alternate_rl: 73, alternate_ud: 74, alternate_du: 75};

// The program is one of the files of public/bb19/includes/custom/prog, each made from armprog.c for the set of its functions a project needs: the letters of its
// name are o (the Playfield offset block), b (the playfield box test), c (the circle block), p (the pixel finding and the bounce of the ball and the missiles),
// f (the movement of an object a Fire block launched with the playfield check on), and a (the DPC+ sound engine: the waveform rebuild and the volume mix, functions 104 and 105) in that order, then g when the groups of columns have separate rows. Built with arm-none-eabi-gcc 10.3 as
// `-c -Os -mcpu=arm7tdmi -mthumb -fPIC` with -DNOOFFSET, -DNOBOX, -DNOCIRCLE, -DNOPIX, -DNOFIRE and -DNOAUDIO for the sets it does not have and -DGROUPS, linked with a script that
// puts .text.entry first, and turned into a binary with objcopy. Only the functions of a project are in its ROM.
// The generated code only has a line that names the file and the numbers of the project's rows (see fillArmProgram, which is run on the code before it is compiled).
// The four bytes A5 5A C3 3C near the end of a program that has a box test, an offset or a circle are put over by those numbers: the increment of a line to its row, the last
// row, whether a line is held to 191 first, and whether the groups of columns have separate rows, in which case the increment and last row
// of each group are in the display memory instead, see GROUP_ROWS_TABLE_OFFSET.
export const armProgramKey = (rows, features = 'ob') => `${['o', 'b', 'c', 'p', 'f', 'a', 't'].filter((f) => features.includes(f)).join('')}${rows && rows.groups ? 'g' : ''}`;
const ARM_PROGRAM_LINE = /^[ \t]*;ARM_PROGRAM (\S+) (\d+) (\d+) (\d) (\d)[ \t\r]*$/m;

// The subroutine that holds the program (only data; never called). rows: the numbers of the project's rows for the box test (see above).
export const buildArmProgramBody = (rows, features = 'ob') => [
  'asm',
  ' align 4',
  '@' + OFFSET_ARM_PROGRAM,
  `;ARM_PROGRAM ${armProgramKey(rows, features)} ${rows ? rows.inc : 0} ${rows ? rows.maxRow : 0} ${rows && rows.clamp ? 1 : 0} ${rows && rows.groups ? 1 : 0}`,
  '@end',
].join('\n');

// Makes the subroutine of the program, once; the box test gives the numbers of its rows, which replace the plain ones if the offset was first, and each
// block that needs functions of it asks for its letters (see above). What was asked for stays asked for when another block asks again.
const armProgramState = new WeakMap();
export const ensureArmProgram = (Blockly, rows, features = '') => {
  const subroutines = Blockly.BBasic.subroutines;
  const state = armProgramState.get(subroutines) || {rows: undefined, features: ''};
  const wanted = {rows: rows || state.rows, features: ['o', 'b', 'c', 'p', 'f', 'a', 't'].filter((f) => features.includes(f) || state.features.includes(f)).join('')};
  if (subroutines[ARM_PROGRAM_SUBROUTINE] && wanted.rows === state.rows && wanted.features === state.features) return;
  armProgramState.set(subroutines, wanted);
  subroutines[ARM_PROGRAM_SUBROUTINE] = buildArmProgramBody(wanted.rows, wanted.features);
};

// The bytes of each program, fetched once.
const programFiles = {};
const loadProgram = (key) => {
  if (!programFiles[key]) {
    programFiles[key] = fetch(`bb19/includes/custom/prog/${key}.bin`).then((r) => {
      if (!r.ok) throw new Error(`The coprocessor program ${key} was not found.`);
      return r.arrayBuffer();
    }).then((buffer) => Array.from(new Uint8Array(buffer)));
  }
  return programFiles[key];
};

// The generated code with the line of the program put over by its bytes.
export const fillArmProgram = async (code) => {
  const match = ARM_PROGRAM_LINE.exec(code);
  if (!match) return code;
  const [line, key, inc, maxRow, clamp, groups] = match;
  const bytes = [...await loadProgram(key)];
  const at = bytes.findIndex((value, i) => value === 0xA5 && bytes[i + 1] === 0x5A && bytes[i + 2] === 0xC3 && bytes[i + 3] === 0x3C);
  if (at >= 0) bytes.splice(at, 4, Number(inc), Number(maxRow), Number(clamp), Number(groups));
  const lines = [];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push(' .byte ' + bytes.slice(i, i + 16).map((value) => '$' + value.toString(16).padStart(2, '0')).join(','));
  }
  return code.replace(line, lines.join('\n'));
};

// The address of the program: main.c has a number in its stub (0x7E57A4D1) that stands for it, and once the ROM is assembled the
// number is replaced by the place of the program (a Thumb address; the label of the data is a bank coded address of the 6502, turned
// into where the coprocessor sees the ROM the way the sound engine's waveforms are).
const ADDRESS_MAGIC = [0xD1, 0xA4, 0x57, 0x7E];
export const patchArmProgramAddress = (result) => {
  const symbols = result && result.symbolmap;
  const label = symbols && (symbols[OFFSET_ARM_PROGRAM] !== undefined ? symbols[OFFSET_ARM_PROGRAM] : symbols[`0.${OFFSET_ARM_PROGRAM}`]);
  if (label === undefined) return false;
  const hi = (label >> 8) & 0xFF;
  const address = 0xC00 + ((((hi & 0x0F) | ((hi >> 1) & 0x70))) << 8) + (label & 0xFF);
  const rom = result.output;
  let at = -1;
  for (let i = 0xC00; i < 0x1C00 && at < 0; i++) {
    if (ADDRESS_MAGIC.every((byte, k) => rom[i + k] === byte)) at = i;
  }
  if (at < 0) return false;
  const word = address | 1;
  for (let k = 0; k < 4; k++) rom[at + k] = (word >>> (8 * k)) & 0xFF;
  return true;
};

// The lines of a Playfield offset block: the coprocessor is given the place of the program, then the function number (the direction), the
// columns and the rows as they are, and the last row of the playfield (the program keeps them inside the playfield and puts them in
// order). Each of x1, x2, y1, y2 and last is an operand of lda: '#' and a number, or the name of a byte. About 55 cycles with plain numbers.
export const buildOffsetArmCall = ({fn, x1, x2, y1, y2, last}) => [
  'asm',
  'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function) & $0F', 'sta DF0HI',
  ...[`#${fn}`, x1, x2, y1, y2, last].flatMap((operand) => [`lda ${operand}`, 'sta DF0WRITE']),
  'lda #255', 'sta CALLFUNCTION',
  '@end',
].join('\n');

// With groups of columns that have separate rows (see backgroundGroupPfres), the coprocessor reads the row increments and the last rows of
// the four groups from eight bytes in the display memory, put there when a background is loaded: the last bytes of the playfield row colors (a
// background of more than 248 rows with row colors in a project with groups would write over them).
export const GROUP_ROWS_TABLE = 'PFCOLS+248';
export const buildGroupRowsLoad = (increments, lastRows) => [
  ' asm',
  ` lda #<(${GROUP_ROWS_TABLE})`, ' sta DF6LOW', ` lda #(>(${GROUP_ROWS_TABLE})) & $0F`, ' sta DF6HI',
  ...[...increments, ...lastRows].flatMap((value) => [` lda #${value}`, ' sta DF6WRITE']),
  'end',
].join('\n');

// The lines of a Playfield circle block: the coprocessor is given the place of the program, then the function (96 plus 0 set, 1 clear, 2 flip), the
// center column and row, the radius, the padding of the left, right, top and bottom, and the last row of the playfield. Each operand is an operand of lda.
export const OFFSET_ARM_CIRCLE_FUNCTION = {on: 96, off: 97, flip: 98};
export const buildCircleArmCall = ({operation, cx, cy, radius, padLeft, padRight, padTop, padBottom, last}) => [
  'asm',
  'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function) & $0F', 'sta DF0HI',
  ...[`#${OFFSET_ARM_CIRCLE_FUNCTION[operation]}`, cx, cy, radius, padLeft, padRight, padTop, padBottom, last].flatMap((operand) => [`lda ${operand}`, 'sta DF0WRITE']),
  'lda #255', 'sta CALLFUNCTION',
  '@end',
].join('\n');

// The ball's and the missiles' pixel finding and bounce (functions 99 and 100 of armprog.c): each argument is the lines that leave the byte in A, written
// after the function number in order; then the call, and the first `read` bytes it gives back go to temp3, temp4 (and temp5, temp6).
export const ARM_FIND_PIXEL_FUNCTION = {find: 99, bounce: 100, fire: 101};
// after: the places (names of bytes, '' for none) the bytes it gives back, from the first, are stored in.
export const buildPixArmCall = ({fn, args, read = 0, after = [], tail = []}) => [
  'asm',
  'lda #<C_function', 'sta DF0LOW', 'lda #(>C_function) & $0F', 'sta DF0HI',
  `lda #${fn}`, 'sta DF0WRITE',
  ...args.flatMap((lines) => [...lines, 'sta DF0WRITE']),
  'lda #255', 'sta CALLFUNCTION',
  ...Array.from({length: read}, (_, i) => i).flatMap((i) => [`lda #<(C_function+${i + 1})`, 'sta DF0LOW', 'lda DF0DATA', `sta temp${i + 3}`]),
  ...after.flatMap((place, i) => (place ? [`lda #<(C_function+${i + 1})`, 'sta DF0LOW', 'lda DF0DATA', `sta ${place}`] : [])),
  ...tail,
  '@end',
].join('\n');
