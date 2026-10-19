'use strict';

// The coprocessor program of the DPC+ kernel's Playfield offset block and playfield box test (functions 64 and 68 and up of
// public/bb19/includes/custom/main.c, built with DPC_OFFSET). The program is the compiled armprog.c (a self-contained, position independent Thumb
// routine), placed in the ROM as data in a subroutine, and the coprocessor is given the place of it (the way the sound engine is given its waveforms).
// Offset function numbers: 68 alternate, 69 left, 70 right, 71 up, 72 down, 73 alternate the other way round. The box test is function 128 and up (128 plus the height).
export const OFFSET_ARM_SUBROUTINE = '_background_offset_arm';
export const ARM_PROGRAM_SUBROUTINE = '_dpc_arm_program';
export const OFFSET_ARM_PROGRAM = '_dpc_arm_program_code';
export const OFFSET_ARM_FUNCTION = {alternate: 68, left: 69, right: 70, up: 71, down: 72, alternate_rl: 73};

// (The four bytes A5 5A C3 3C near the end are put over by the numbers of the project's rows: the increment of a line to its row, the last
// row, and whether a line is held to 191 first.)
const PROGRAM_HEX = [
  'f0b5a24ba24a1b889a181278a14912025218a1495b18db7f',
  '89b0d31804939f4b18789f499f4a000600d4bfe01f789e4b',
  '1b78087812785406a40f00d074e1102607219a4c7c446578',
  '0595af2b08d90022954b1206120e1a7009b0f0bc01bc0047',
  '59180391b142f2d3b34266d39b1b990801917f2bebd87f23',
  '1f403f18ff2f5fd83b00591e8b41ff1ad309110000936023',
  '9943029156d100f097f90400380000f093f9059d854200d9',
  '0500a542cfd3039b9e1bb3089c467f2e01d91f239c46019b',
  'd8086346db080693009b0394002b00d003950022ff26069b',
  '9842b9d8019f0021c3009f4200d9f91a6746fb1a072b00d9',
  '07230727fb1a063f384241d037008f403100194139400302',
  '314007930591039b079f0499df19cf193f780599394238d0',
  '0299002940d00133002a04d0009900292bd09a422bd21a00',
  '29e0002301939ae7fe27a1e71f25009b1540002b09d13800',
  '00f03af9ed19441c2800ff2d9fd9ff209de7451900f030f9',
  '04002800ff2d00d9ff2000f029f9002800d168e7013890e7',
  '37000f4131009940bce79a42d3d80130a1e70099002903d0',
  '9c42f8d0013bb7e79d42f4d00133b3e7012251e704241b78',
  '58082040013c2340184300903a4b1b7809781b0409020b43',
  '7f2114781c43e709da0c5b03db0e0f400c409a4202d91100',
  '1a000b00a74202d9390027000c0001211f2049420d00c01a',
  '854028000d00d54005408020000607950500d840d5400223',
  '009a0195039005919a43012a04d023003c001f0001230593',
  '3900049800f0b0f8009b0500019e012b0bd0039e002b03d1',
  'fb0706d4019e04e0009b052b01d1fb07f8d4049b1b190293',
  '2e402100049800f097f8009b033b0690012b32d9009b012b',
  '24d0002b1cd101331c421fd0019a43089343002e4ed13343',
  '039e1fe0a06d00002e0c0000000c0040070c0000a40d0040',
  'a60d0040a70d0040a50d0040a4030000009b052be2d1043b',
  '1c42dfd0039a43009343002e00d016003343019e06951d00',
  '0640079b45401d40684000f02df8029a030e1370030c0132',
  '1b06ff321b0e13708022029b92009a18030a1b061b0e1370',
  'c022029b92009b18059a94460006000e1870029b63440293',
  'a74200d19ce6069da4189ae7019eaee70f263100012c00d1',
  '87e6103185e6c0460d4b0e4942081a4043000b401a430c49',
  '93080b400b4992000a4013430a491a090a400a491b010b40',
  '1343094a1340094a104018437047c04655555555aaaaaaaa',
  '33333333cccccccc0f0f0f0ff0f0f0f0ff00ff0000ff00ff',
  '70b54a1cff32431882181b781478c0258022ad0092008a18',
  '49198218401812782404017818062043084312021043fff7',
  'bbff70bc02bc0847064b7b449b78002b02d0bf2800d9bf20',
  '034b7b441b785843000a70471e0000000e000000a55ac33c',
].join('');

export const offsetArmProgramBytes = (rows) => {
  const bytes = PROGRAM_HEX.match(/../g).map((hex) => parseInt(hex, 16));
  if (rows) {
    const at = bytes.findIndex((value, i) => value === 0xA5 && bytes[i + 1] === 0x5A && bytes[i + 2] === 0xC3 && bytes[i + 3] === 0x3C);
    bytes.splice(at, 4, rows.inc, rows.maxRow, rows.clamp ? 1 : 0, 0);
  }
  return bytes;
};

// The subroutine that holds the program (only data; never called). rows: the numbers of the project's rows for the box test (see above).
export const buildArmProgramBody = (rows) => {
  const bytes = offsetArmProgramBytes(rows);
  const lines = ['asm', ' align 4', '@' + OFFSET_ARM_PROGRAM];
  for (let i = 0; i < bytes.length; i += 16) {
    lines.push(' .byte ' + bytes.slice(i, i + 16).map((value) => '$' + value.toString(16).padStart(2, '0')).join(','));
  }
  lines.push('@end');
  return lines.join('\n');
};

// Makes the subroutine of the program, once; the box test gives the numbers of its rows, which replace the plain ones if the offset was first.
export const ensureArmProgram = (Blockly, rows) => {
  const subroutines = Blockly.BBasic.subroutines;
  if (!subroutines[ARM_PROGRAM_SUBROUTINE] || rows) subroutines[ARM_PROGRAM_SUBROUTINE] = buildArmProgramBody(rows);
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

// The subroutine every Playfield offset block calls: the columns are in the two column bytes, the rows in temp5 and temp6 and the function
// number in the third byte. It keeps the columns inside the playfield, gives the coprocessor the place of the program, then the direction,
// the columns and the rows packed in three bytes (x1 5 bits, x2 5, y1 7, y2 7; the program puts them in order).
export const buildOffsetArmBody = ({b1, b2, fn}) => [
  'asm',
  ` lda ${b1}`, ' cmp #32', ' bcc _bgoffarm_c1', ' lda #31', '@_bgoffarm_c1', ` sta ${b1}`,
  ` lda ${b2}`, ' cmp #32', ' bcc _bgoffarm_c2', ' lda #31', '@_bgoffarm_c2', ` sta ${b2}`,
  ' lda #<C_function', ' sta DF0LOW', ' lda #(>C_function) & $0F', ' sta DF0HI',
  ` lda ${fn}`, ' sta DF0WRITE',
  // x1 * 8 | x2 / 4
  ` lda ${b1}`, ' asl', ' asl', ' asl', ' sta temp1', ` lda ${b2}`, ' lsr', ' lsr', ' ora temp1', ' sta DF0WRITE',
  // (x2 & 3) * 64 | y1 / 2
  ` lda ${b2}`, ' asl', ' asl', ' asl', ' asl', ' asl', ' asl', ' sta temp1', ' lda temp5', ' lsr', ' ora temp1', ' sta DF0WRITE',
  // (y1 & 1) * 128 | y2
  ' lda temp5', ' lsr', ' lda #0', ' ror', ' ora temp6', ' sta DF0WRITE',
  ' lda #255', ' sta CALLFUNCTION',
  ' RETURN',
  '@end',
].join('\n');
