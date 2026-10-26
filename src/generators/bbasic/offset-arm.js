'use strict';

// The coprocessor program of the DPC+ kernel's Playfield offset block and playfield box test (functions 64 and 68 and up of
// public/bb19/includes/custom/main.c, built with DPC_OFFSET). The program is the compiled armprog.c (a self-contained, position independent Thumb
// routine), placed in the ROM as data in a subroutine, and the coprocessor is given the place of it (the way the sound engine is given its waveforms).
// Offset function numbers: 68 alternate, 69 left, 70 right, 71 up, 72 down, 73 alternate the other way round. The box test is function 128 and up (128 plus the height).
export const ARM_PROGRAM_SUBROUTINE = '_dpc_arm_program';
export const OFFSET_ARM_PROGRAM = '_dpc_arm_program_code';
export const OFFSET_ARM_FUNCTION = {alternate: 68, left: 69, right: 70, up: 71, down: 72, alternate_rl: 73};

// (The four bytes A5 5A C3 3C near the end are put over by the numbers of the project's rows: the increment of a line to its row, the last
// row, whether a line is held to 191 first, and whether the groups of columns have separate rows, in which case the increment and last row
// of each group are in the display memory instead, see GROUP_ROWS_TABLE_OFFSET.)
const PROGRAM_HEX = [
  'f0b5ac4bac4a1b889a181278ab4912025218ab495b18db7f',
  '8bb0d3180493a94b1a78a94ca948120600d4cae01d78a84b',
  '19782378019300784406a40f00d08de1102307220024af29',
  '11d88a189a420ed3d21a940805947f2a01d91f2205929942',
  '0dd3cb1a9a08002403927f2b09d9984b2406240e1c700bb0',
  'f0bc01bc0047002303937f231d40019bed18ff2d5fd82b00',
  '5a1e9341ed1a1f2303400693c3090293602300249843039b',
  'df08059bdb0807900993099b9f42dad8864b7b441e785b78',
  '0893079b002b44d13100019800f096f931000090280000f0',
  '91f90899814200d90100009b99425cd303980022fb009842',
  '00d9c21a0598c31a072b00d9072307200126c01aff233742',
  '44d01e009640034132001a40029812060b00120e002800d1',
  '009b380284466046049e181830180078024238d0079a002a',
  '41d00133002c04d0029a002a2bd09c422bd21c0029e0fe25',
  'a1e7029b3100002b0bd1280000f04ef9431c0093069b5819',
  'ff2800d9ff203100b1e7019800f042f9019b069a00909818',
  'ff2800d9ff20310000f038f9002808d00138a2e71e001641',
  '83403200b9e79c42d3d8013785e70298002804d000989842',
  'f7d0013bb7e79942f3d00133b3e7012455e704211b785a08',
  '0a4001390b401a4300923f4b40491a78237806780c783f49',
  '09781f2a00d91f221f2b00d91f238e4200d90e008c4200d9',
  '0c009a4202d911001a000b00a64202d9310026000c003449',
  '7944c97801211f2049420d00c01a854028000d00d5400540',
  '8020000607950500d840d5400223009a0195039005919a43',
  '012a04d0230034001e00012305933100049800f0b7f8009b',
  '0500019f012b0bd0039f002b03d1f30706d4019f04e0009b',
  '052b01d1f307f8d4049b1b1902932f402100049800f09ef8',
  '009b033b0690012b39d9009b012b2bd0002b23d101331c42',
  '26d0019a43089343002f55d13b43039f26e0c046a06d0000',
  '2e0c0000000c0040070c0000a40d0040a60d0040a70d0040',
  'a50d00405a030000a80d0040a90d004004020000009b052b',
  'dbd1043b1c42d8d0039a43009343002f00d017003b43019f',
  '06951d000740079b45401d40684000f02df8029a030e1370',
  '030c01321b06ff321b0e13708022029b92009a18030a1b06',
  '1b0e1370c022029b92009b18059a94460006000e1870029b',
  '63440293a64200d191e6069da41893e7019fa7e70f231a00',
  '012c00d16ee610326ce6c0460d4b0e4942081a4043000b40',
  '1a430c4993080b400b4992000a4013430a491a090a400a49',
  '1b010b401343094a1340094a104018437047c04655555555',
  'aaaaaaaa33333333cccccccc0f0f0f0ff0f0f0f0ff00ff00',
  '00ff00ff70b54a1cff32431882181b781478c0258022ad00',
  '92008a184919821840181278240401781806204308431202',
  '1043fff7bbff70bc02bc0847054b7b449b78002b02d0bf28',
  '00d9bf204843000a7047c04616000000a55ac33c',
].join('');

// The same built with GROUPS (see armprog.c): for a project with groups of columns that have separate rows.
const PROGRAM_HEX_GROUPS = [
  'f0b58f4b8f4a1b889a1812788e49120252188e495b18db7f',
  '91b0d31806938c4b19788c488c4a090600d41de11d788b4b',
  '19780378089310784406a40f00d07be1072310220024af29',
  '11d8cb1893420ed39b1a9c080b947f2b01d91f230b939142',
  '10d38a1a9308002409937f2a0cd97b4b2406240e1c7011b0',
  'f0bc01bc00471f230f22dfe7002309937f231d40089bef18',
  'ff2f00d985e03b005a1e9341ff1a1f2303400d93c3090793',
  '60239f2200249843099bdb0805930b9bdb080f93069bd200',
  '9b18059a9b180e900a93059b0f9a9342cdd8634a7a441578',
  '5378d278002a62d10c930e9b002b62d12900089800f042fa',
  '29000600380000f03dfa0c9a824200d90200b24200d286e0',
  '059b09980021db00984200d9c11a0b98c31a072b00d90723',
  '0720c31a0c93ff2305989c46fe3b18425dd0604688406346',
  '01000c9803410b401b0607981b0e11000c93002800d13100',
  '0598000284466046069b0818181800780c9b03425ed00e9b',
  '002b66d03d4a7a44d2784b1c002a0bd0079a002a00d01900',
  'ff200023984239d80133ff2b00d9ff23002c04d0079a002a',
  '3bd09c423bd21c0039e0fe277be70a9b1d781b7998e7079b',
  '2900002b0ad1380000f0dcf90d9b461cd819ff2800d9ff20',
  '290094e7089800f0d1f9089b0d9a06009818ff2800d9ff20',
  '290000f0c7f9002815d0013885e760460841634601000c98',
  '8340a0e7c218520816006e43360ab14201d9531cbae71000',
  'b8e79c42c3d8059b013305930a9b01330a9352e7079b002b',
  '03d08e42f3d0013991e78a42efd001318de7012417e7c046',
  'a06d00002e0c0000000c0040070c0000a40d0040a60d0040',
  'a70d0040a50d0040b80400001e04000004241b7859082140',
  '013c234019430791354b1f78354b047815781e78344b1b78',
  '1f2f00d91f271f2c00d91f249d4200d91d009e4200d91e00',
  'a74202d93b0027001c00b54202d92b0035001e00294b7b44',
  'db78002b2fd0079b033b012b2bd8264a9446069b63440893',
  '00230593059b3a009f4200d21a00059b0733a34200d92300',
  '089909789a420cd8a9420ad300200290b14200d931000191',
  '00950799069800f077f8059b08330593089b01330893059b',
  '202bdbd1abe6114b7b44db783a0002930196230000950799',
  '069800f061f89ee60f231a00012c00d180e6032c00d09ae6',
  '024b14221b7879e6a50d0040a80d0040a90d0040d6020000',
  'fc0400006c0200000d4b0e4942081a4043000b401a430c49',
  '93080b400b4992000a4013430a491a090a400a491b010b40',
  '1343094a1340094a104018437047c04655555555aaaaaaaa',
  '33333333cccccccc0f0f0f0ff0f0f0f0ff00ff0000ff00ff',
  '70b54a1cff32431882181b781478c0258022ad0092008a18',
  '49198218401812782404017818062043084312021043fff7',
  'bbff70bc02bc0847f0b589b001910121070049421f200c00',
  'c01a844020000c00d44004408020000607940400d840d440',
  '0223019a0f9d0294049006919a43012a04d02b000e9d0e93',
  '0123069338000e99fff7beff019b0600029c012b0dd0049c',
  '002b04d10e9bdb0707d4029c05e0019b052b02d10e9bdb07',
  'f7d47b190393344029003800fff7a4ff019b033b0590012b',
  '20d9019b012b12d0002b0ad101331d420dd0029a43089343',
  '002c5ad12343049c0de0019b052bf4d1043b1d42f1d0049a',
  '43009343002c00d014002343029c05961e000440109a079b',
  '002a1ad0254bfb5c9d4240d90023244aba5c954202d8ff22',
  '12041343214aba5c954202d8ff22120213431f4aba5c9542',
  '01d8ff221343079a1340464033405840fff72eff039a030e',
  '1370030c01321b06ff321b0e13708022039b92009a18030a',
  '1b061b0e1370c022039b92009b18069a94460006000e1870',
  '039b634403930e9b9d4207d0059ead188ee7029ca2e7ff23',
  '1b06bce709b0f0bc01bc0047fc040000fd040000fe040000',
  'ff040000054b7b449b78002b02d0bf2800d9bf204843000a',
  '7047c04616000000a55ac33c',
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
