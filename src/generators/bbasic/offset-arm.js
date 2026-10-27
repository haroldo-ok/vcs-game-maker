'use strict';

// The coprocessor program of the DPC+ kernel's Playfield offset block and playfield box test (functions 64 and 68 and up of
// public/bb19/includes/custom/main.c, built with DPC_OFFSET). The program is the compiled armprog.c (a self-contained, position independent Thumb
// routine), placed in the ROM as data in a subroutine, and the coprocessor is given the place of it (the way the sound engine is given its waveforms).
// Offset function numbers: 68 alternate, 69 left, 70 right, 71 up, 72 down, 73 alternate the other way round, 74 alternate columns up and down, 75 alternate columns down and up. The box test is function 128 and up (128 plus the height).
export const ARM_PROGRAM_SUBROUTINE = '_dpc_arm_program';
export const OFFSET_ARM_PROGRAM = '_dpc_arm_program_code';
export const OFFSET_ARM_FUNCTION = {alternate: 68, left: 69, right: 70, up: 71, down: 72, alternate_rl: 73, alternate_ud: 74, alternate_du: 75};

// (The four bytes A5 5A C3 3C near the end are put over by the numbers of the project's rows: the increment of a line to its row, the last
// row, whether a line is held to 191 first, and whether the groups of columns have separate rows, in which case the increment and last row
// of each group are in the display memory instead, see GROUP_ROWS_TABLE_OFFSET.)
const PROGRAM_HEX = [
  'f0b5c14bc14a1b889a181278c04912025218c0495b18db7f',
  '8bb0d3180093be4b1a78be4cbe48120600d4cae01d78bd4b',
  '19782378029300784406a40f00d0dfe1102307220024af29',
  '11d88a189a420ed3d21a940805947f2a01d91f2205929942',
  '0dd3cb1a9a08002404927f2b09d9ad4b2406240e1c700bb0',
  'f0bc01bc0047002304937f231d40029bed18ff2d5fd82b00',
  '5a1e9341ed1a1f2303400693c3090393602300249843049b',
  'df08059bdb0807900993099b9f42dad89b4b7b441e785b78',
  '0893079b002b44d13100029800f0e8f931000190280000f0',
  'e3f90899814200d90100019b99425cd304980022fb009842',
  '00d9c21a0598c31a072b00d9072307200126c01aff233742',
  '44d01e009640034132001a40039812060b00120e002800d1',
  '019b380284466046009e181830180078024238d0079a002a',
  '41d00133002c04d0039a002a2bd09c422bd21c0029e0fe25',
  'a1e7039b3100002b0bd1280000f0a0f9431c0193069b5819',
  'ff2800d9ff203100b1e7029800f094f9029b069a01909818',
  'ff2800d9ff20310000f08af9002808d00138a2e71e001641',
  '83403200b9e79c42d3d8013785e70398002804d001989842',
  'f7d0013bb7e79942f3d00133b3e7012455e704221b785e08',
  '1640013a134057491e43544b1a78237804780d7854490978',
  '1f2a00d91f221f2b00d91f238c4200d90c008d4200d90d00',
  '9a4202d911001a000b00ac4202d921002c000d0001211f20',
  '49420f00c01a874038000f00d74007400797052e4bd9063e',
  '73425e41414b414a76421e40944633002100634400980393',
  '00f012f929000490009800f00df90600009b1f19049b0193',
  '049b0293a54204d00098611c00f000f902900298039b7040',
  '1840019b5e40079b70401840019b584000f0c6f8030e3b70',
  '030c7a1c1b06ff321b0e137080239b00fa18030a1b061b0e',
  '1370c02300069b00fb18000e18700137a54200d1dfe6019e',
  '029b0134cbe71e487844c078802000060700d840d7400223',
  '32000297049005919a43012a04d02b0025001c0001230593',
  '2100009800f0bcf8029b0700012e25d0049b002e1ed1e207',
  '20d4029b1ee0c046a06d00002e0c0000000c0040070c0000',
  'a40d0040a60d0040a70d0040a50d0040fe030000a80d0040',
  'a90d004055555555f8010000052e01d1e207ded43b400193',
  '009b5b1903932900009800f089f8f31e0690012b24d9012e',
  '13d0002e0cd101231d420ed0029a43089343019a002a40d1',
  '019a1343049a0fe0052ef3d101231d42f0d0049a43009343',
  '019a002a01d0049a0192019a1343029a06971f0002400192',
  '079b47401f40784000f02ef8039a030e1370030c01321b06',
  'ff321b0e13708022039b92009a18030a1b061b0e1370c022',
  '039b92009b18059a94460006000e1870039b63440393ac42',
  '00d140e6069fad18a9e7029a0192bbe70f231a00012c00d1',
  '1ce610321ae6c0460d4b0e4942081a4043000b401a430c49',
  '93080b400b4992000a4013430a491a090a400a491b010b40',
  '1343094a1340094a104018437047c04655555555aaaaaaaa',
  '33333333cccccccc0f0f0f0ff0f0f0f0ff00ff0000ff00ff',
  '70b54a1cff32431882181b781478c0258022ad0092008a18',
  '49198218401812782404017818062043084312021043fff7',
  'bbff70bc02bc0847054b7b449b78002b02d0bf2800d9bf20',
  '4843000a7047c04616000000a55ac33c',
].join('');

// The same built with GROUPS (see armprog.c): for a project with groups of columns that have separate rows.
const PROGRAM_HEX_GROUPS = [
  'f0b58f4b8f4a1b889a1812788e49120252188e495b18db7f',
  '91b0d31806938c4b19788c488c4a090600d41de11d788b4b',
  '19780378089310784406a40f00d094e1072310220024af29',
  '11d8cb1893420ed39b1a9c080b947f2b01d91f230b939142',
  '10d38a1a9308002409937f2a0cd97b4b2406240e1c7011b0',
  'f0bc01bc00471f230f22dfe7002309937f231d40089bef18',
  'ff2f00d985e03b005a1e9341ff1a1f2303400d93c3090793',
  '60239f2200249843099bdb0805930b9bdb080f93069bd200',
  '9b18059a9b180e900a93059b0f9a9342cdd8634a7a441578',
  '5378d278002a62d10c930e9b002b62d12900089800f0b8fa',
  '29000600380000f0b3fa0c9a824200d90200b24200d286e0',
  '059b09980021db00984200d9c11a0b98c31a072b00d90723',
  '0720c31a0c93ff2305989c46fe3b18425dd0604688406346',
  '01000c9803410b401b0607981b0e11000c93002800d13100',
  '0598000284466046069b4018181800780c9b03425ed00e9b',
  '002b66d03d4a7a44d2784b1c002a0bd0079a002a00d01900',
  'ff200023984239d80133ff2b00d9ff23002c04d0079a002a',
  '3bd09c423bd21c0039e0fe277be70a9b1d781b7998e7079b',
  '2900002b0ad1380000f052fa0d9b461cd819ff2800d9ff20',
  '290094e7089800f047fa089b0d9a06009818ff2800d9ff20',
  '290000f03dfa002815d0013885e760460841634601000c98',
  '8340a0e7c218520816006e43360ab14201d9531cbae71000',
  'b8e79c42c3d8059b013305930a9b01330a9352e7079b002b',
  '03d08e42f3d0013991e78a42efd001318de7012417e7c046',
  'a06d00002e0c0000000c0040070c0000a40d0040a60d0040',
  'a70d0040a50d0040a40500000a05000004211b785e080e40',
  '01390b401e43434b1f78434b057814781a78424b1b781f2f',
  '00d91f271f2d00d91f259c4200d91c0005929a4200d90593',
  'af4202d93b002f001d00059b9c4202d92300059c0593364b',
  '7b44db78002b3ad0f31e012b01d9052e41d9324a9446069b',
  '6344089300230793079b3a009f4200d21a00079b0733ab42',
  '00d92b00089909789a420dd8a1420bd30598814200d90100',
  '052e0fd9019100943100069800f04cf9079b08330793089b',
  '01330893079b202bdad1a8e6002001910290310000940698',
  '00f07cf8ece7052e09d9059b3a00019331002b0000940698',
  '00f02ef993e6124b7b44db780293059b3a00019331002b00',
  '0094069800f062f885e60f231a00012c00d167e6032c00d0',
  '81e6034b14221b7860e6c046a50d0040a80d0040a90d0040',
  'c0030000fc040000280300000d4b0e4942081a4043000b40',
  '1a430c4993080b400b4992000a4013430a491a090a400a49',
  '1b010b401343094a1340094a104018437047c04655555555',
  'aaaaaaaa33333333cccccccc0f0f0f0ff0f0f0f0ff00ff00',
  '00ff00ff70b54a1cff32431882181b781478c0258022ad00',
  '92008a184919821840181278240401781806204308431202',
  '1043fff7bbff70bc02bc0847f0b589b00191012107004942',
  '1f200c00c01a844020000c00d44004408020000607940400',
  'd840d4400223019a0f9d0294049006919a43012a04d02b00',
  '0e9d0e930123069338000e99fff7beff019b0600029c012b',
  '0dd0049c002b04d10e9bdb0707d4029c05e0019b052b02d1',
  '0e9bdb07f7d47b190393344029003800fff7a4ff019b033b',
  '0590012b20d9019b012b12d0002b0ad101331d420dd0029a',
  '43089343002c5ad12343049c0de0019b052bf4d1043b1d42',
  'f1d0049a43009343002c00d014002343029c05961e000440',
  '109a079b002a1ad0254bfb5c9d4240d90023244aba5c9542',
  '02d8ff2212041343214aba5c954202d8ff22120213431f4a',
  'ba5c954201d8ff221343079a1340464033405840fff72eff',
  '039a030e1370030c01321b06ff321b0e13708022039b9200',
  '9a18030a1b061b0e1370c022039b92009b18069a94460006',
  '000e1870039b634403930e9b9d4207d0059ead188ee7029c',
  'a2e7ff231b06bce709b0f0bc01bc0047fc040000fd040000',
  'fe040000ff0400000639f0b50700484241412a4884464942',
  '014087b0614402911f21cb1a20390800d14098400c9d0140',
  '059138002900fff70dff0d9904903800fff708ff0400049b',
  '7e190193049b03930d9b9d4204d03800691cfff7fbfe0390',
  '0398029b60401840019b5c40059b60401840019b5840fff7',
  'c1fe030e3370030c721c1b06ff321b0e137080239b00f218',
  '030a1b061b0e1370c02300069b00f318000e18700d9b0136',
  '9d4203d0019c039b0135cae707b0f0bc01bc004755555555',
  '054b7b449b78002b02d0bf2800d9bf204843000a7047c046',
  '16000000a55ac33c',
].join('');

export const offsetArmProgramBytes = (rows) => {
  const bytes = (rows && rows.groups ? PROGRAM_HEX_GROUPS : PROGRAM_HEX).match(/../g).map((hex) => parseInt(hex, 16));
  const at = bytes.findIndex((value, i) => value === 0xA5 && bytes[i + 1] === 0x5A && bytes[i + 2] === 0xC3 && bytes[i + 3] === 0x3C);
  bytes.splice(at, 4, rows ? rows.inc : 0, rows ? rows.maxRow : 0, rows && rows.clamp ? 1 : 0, rows && rows.groups ? 1 : 0);
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
