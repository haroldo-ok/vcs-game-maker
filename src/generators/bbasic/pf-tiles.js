'use strict';

// The playfield tilemap (DPC+, the Options tab's "Backgrounds as tiles"): every background is cut into tiles one playfield column (8 pixels)
// wide and the same number of rows tall, each different tile is stored once, and a background is a map of tile numbers (4 a row, PF1L PF2L
// PF1R PF2R). The tiles, the maps and a short description of each background go in the graphics bank (moved there after the compile, see
// moveTilesToDisplayData), and the coprocessor's program in the ROM (armprog.c, function 106) builds a background's rows in the four column
// queues from them when it is loaded; function 108 to 111 puts one tile in (the "Set playfield tile" block). The kernel, the collision, the
// offset block and the pixel blocks see the same column queues as before. (The way the Activision DPC games keep their rooms: a few band
// patterns shared by every room, a room a list of which ones.)

export const TILE_LOAD_FUNCTION = 106;
// The tile height of the Tiles section (1 to MAX_TILE_ROWS rows, 4 when not set), and its width: 8 pixels (one playfield column, as the
// build keeps every tile), or 16 or 32, a tile of the section then being 2 or 4 of the build's tiles side by side.
export const DEFAULT_TILE_ROWS = 4;
export const TILE_WIDTHS = [8, 16, 32];
export const tileSetWidth = (tileSet) => (TILE_WIDTHS.includes(Number(tileSet && tileSet.width)) ? Number(tileSet.width) : 8);
export const TILE_SET_FUNCTION = 108;
// The tallest tile (a tile is a column byte for each of its rows; the description keeps the rows in 7 bits, the eighth is the flips).
export const MAX_TILE_ROWS = 32;
export const tileSetHeight = (tileSet) => Math.max(1, Math.min(MAX_TILE_ROWS, Math.round(Number(tileSet && tileSet.height) || DEFAULT_TILE_ROWS)));
// The rows of a column queue.
const QUEUE_ROWS = 256;

// The bytes of a row (32 pixels, true lit) cut into the 4 columns of a tile row, each as drawn: its left pixel in bit 7. (The coprocessor reverses
// the bits of the PF2 columns, which the TIA draws the other way round, when it writes them: one tile does for every column.)
export const tileRowBytes = (row) => [0, 8, 16, 24].map((from) => {
  let value = 0;
  for (let i = 0; i < 8; i++) {
    if (row[from + i]) value |= 0x80 >> i;
  }
  return value;
});
// A byte with its bits the other way round (a tile row flipped left to right).
const flipByte = (value) => {
  let out = 0;
  for (let i = 0; i < 8; i++) {
    if (value & (1 << i)) out |= 0x80 >> i;
  }
  return out;
};
// With flips, a map entry with this bit set is the tile of the low 7 bits flipped left to right (armprog.c reverses its bytes the other way), so
// a background whose halves mirror each other keeps one tile for both; the map then has 128 tile numbers, not 256. The descriptor says so
// with the same bit in its rows of a tile.
export const TILE_FLIP_BIT = 0x80;
// A drawn tile (rows of 8 pixels) as its bytes.
const tileBytes = (pixels, height) => Array.from({length: height}, (_, k) => tileRowBytes([...(pixels[k] || []), ...new Array(24).fill(0)])[0]);

// The layout of one tile height: the tiles, and for each background its map, the rows of the map and the rows to fill (0: the map once);
// null when it can not be done (more than 256 different tiles, 128 with flips, or a map that runs past the 256 rows of a queue). With flips a
// tile that is another one flipped left to right is that one's number with TILE_FLIP_BIT.
const layoutFor = (backgrounds, height, fixedTiles = [], flips = false) => {
  // The tiles of the Tiles section first, each with its number (the same pixels twice keep both numbers; a background's tile takes the first).
  const tiles = fixedTiles.map((pixels) => tileBytes(pixels, height));
  const numberOf = new Map();
  tiles.forEach((bytes, number) => {
    if (!numberOf.has(bytes.join(','))) numberOf.set(bytes.join(','), number);
  });
  let flipped = false;
  const tileOf = (bytes) => {
    const key = bytes.join(',');
    const mirror = bytes.map(flipByte).join(',');
    if (flips && !numberOf.has(key) && numberOf.has(mirror)) {
      flipped = true;
      return numberOf.get(mirror) | TILE_FLIP_BIT;
    }
    if (!numberOf.has(key)) {
      numberOf.set(key, tiles.length);
      tiles.push(bytes);
    }
    return numberOf.get(key);
  };
  const maps = [];
  for (const {rows, fill, thin} of backgrounds) {
    // The rows are repeated down to the rows to fill when the map can not repeat itself (the stored rows are not whole tiles).
    const repeats = fill > rows.length && rows.length % height === 0;
    const laid = repeats || fill <= rows.length ? rows : Array.from({length: fill}, (_, i) => rows[i % rows.length]);
    const mapRows = Math.ceil(laid.length / height);
    if (mapRows * height > QUEUE_ROWS) return null;
    const map = [];
    for (let m = 0; m < mapRows; m++) {
      for (let column = 0; column < 4; column++) {
        map.push(tileOf(Array.from({length: height}, (_, k) => (laid[m * height + k] || [0, 0, 0, 0])[column])));
      }
    }
    maps.push({map, mapRows, total: repeats ? fill : 0, thin});
  }
  if (tiles.length > (flips ? 128 : 256)) return null;
  const bytes = tiles.length * height + maps.reduce((sum, {map}) => sum + map.length, 0) + maps.length * 7;
  return {height, tiles, maps, bytes, flips: flipped, flipLayout: flips};
};

// The tilemap of the backgrounds given ({id, pixels: the rows the playfield memory gets (32 pixels, true lit), fill: the rows the memory is
// filled to, more than the rows for a scrolling background, whose rows are repeated; thin: the thin rows each row of the background is cut into
// there, 1 when it does not scroll}), with the Tiles section's tiles (tileSet: {height, tiles: [{pixels: rows of 8}]}) first: their height,
// or with none drawn the tile height that takes the fewest bytes. Null when it can not be done.
export const planTilemap = (backgrounds, tileSet = null) => {
  if (!backgrounds.length) return null;
  const rowsOf = backgrounds.map(({pixels, fill, thin}) => ({rows: pixels.map(tileRowBytes), fill: Math.max(fill || 0, pixels.length), thin: thin || 1}));
  const fixed = (tileSet && tileSet.tiles) || [];
  const fixedHeight = fixed.length ? tileSetHeight(tileSet) : 0;
  let best = null;
  // (A section tile wider than a column is its columns, left to right, each a tile of the build, a column the same as one before it (or
  // its mirror image) kept once: the numbers of the build's tiles are not the wide tiles' anyway, which the block can not place.)
  const width = tileSetWidth(tileSet);
  const columnsOf = (tile) => Array.from({length: width / 8}, (_, column) => (tile.pixels || []).map((row) => (row || []).slice(column * 8, column * 8 + 8)));
  const fixedColumns = width === 8 ? fixed.map((tile) => tile.pixels || []) :
    [...new Map(fixed.flatMap(columnsOf).map((pixels) => [[pixels, pixels.map((row) => [...row].reverse())]
        .map((rows) => JSON.stringify(rows.map((row) => row.map((v) => (v ? 1 : 0))))).sort()[0], pixels])).values()];
  for (let height = 1; height <= MAX_TILE_ROWS; height++) {
    if (fixedHeight && height !== fixedHeight) continue;
    // (On a tie the layout with flips, so the "Set playfield tile" block can place a tile flipped: its number plus TILE_FLIP_BIT.)
    for (const flips of [true, false]) {
      const layout = layoutFor(rowsOf, height, fixedColumns, flips);
      if (layout && (!best || layout.bytes < best.bytes)) best = layout;
    }
  }
  if (!best) return null;
  const rawBytes = rowsOf.reduce((sum, {rows}) => sum + rows.length * 4, 0);
  return {...best, numbers: new Map(backgrounds.map(({id}, index) => [String(id), index])), rawBytes};
};

// A ROM address in the two bytes the coprocessor takes (the low byte; the high byte with the bank in its upper bits, as the sprite pointers are).
const romLow = (label) => `<${label}`;
const romHigh = (label) => `((>${label}) & $0F) | (((>${label}) / 2) & $70)`;

// The asm lines that call a function of the program in the ROM with the given operands (immediate values or addresses).
const callLines = (fn, operands) => [
  ' lda #<C_function', ' sta DF0LOW', ' lda #(>C_function) & $0F', ' sta DF0HI',
  ...[`#${fn}`, ...operands].flatMap((operand) => [` lda ${operand}`, ' sta DF0WRITE']),
  ' lda #255', ' sta CALLFUNCTION',
];

// The load of one background (bB lines).
export const tileLoadLines = (plan, id) => {
  const label = `_pftile_desc${plan.numbers.get(String(id))}`;
  return [' asm', ...callLines(TILE_LOAD_FUNCTION, [`#${romLow(label)}`, `#${romHigh(label)}`]), 'end'];
};

// The tile number at a background's column (0 to 3) and tile row, or null.
export const tileAt = (plan, id, column, tileRow) => {
  const index = plan.numbers.get(String(id));
  if (index === undefined) return null;
  const {map, mapRows} = plan.maps[index];
  return tileRow >= 0 && tileRow < mapRows && column >= 0 && column < 4 ? map[tileRow * 4 + column] : null;
};

// The lines between these two labels are moved into the graphics bank after the compile (labels, as the compiler leaves out comments in asm blocks).
const DATA_BEGIN = '_pftile_data';
const DATA_END = '_pftile_data_end';

// The data (bB lines, labels at the start of a line, the rest after a space), to be put where nothing runs into it; moved after the compile.
export const tileDataLines = (plan) => {
  const byteLines = (values) => {
    const out = [];
    for (let i = 0; i < values.length; i += 16) out.push(` .byte ${values.slice(i, i + 16).join(',')}`);
    return out;
  };
  return [
    ' asm',
    DATA_BEGIN,
    '_pftile_tiles',
    ...byteLines(plan.tiles.flat()),
    ...plan.maps.flatMap(({map}, index) => [`_pftile_map${index}`, ...byteLines(map)]),
    ...plan.maps.flatMap(({mapRows, total}, index) => [`_pftile_desc${index}`,
      ` .byte ${romLow(`_pftile_map${index}`)},${romHigh(`_pftile_map${index}`)},${romLow('_pftile_tiles')},${romHigh('_pftile_tiles')},` +
      `${plan.height | (plan.flipLayout ? TILE_FLIP_BIT : 0)},${mapRows},${total}`]),
    DATA_END,
    'end',
  ];
};

// The assembly with the tiles moved into the graphics bank, just before the end of what the compiler put there (the line that tells the bytes
// left in it). Unchanged when there are none; null when the place was not found.
export const moveTilesToDisplayData = (asm) => {
  const lines = asm.split('\n');
  const begin = lines.findIndex((line) => line.trim() === DATA_BEGIN);
  if (begin < 0) return asm;
  const end = lines.findIndex((line, index) => index > begin && line.trim() === DATA_END);
  if (end < 0) return null;
  const data = lines.slice(begin, end);
  const rest = [...lines.slice(0, begin), ...lines.slice(end + 1)];
  const echo = rest.findIndex((line) => /DPC_graphics_end\s*-\s*\*/.test(line));
  // (The echo is inside "if ECHOFIRST ... endif": the data goes before the "if".)
  const at = echo > 0 && /^\s*if\s+ECHOFIRST/i.test(rest[echo - 1]) ? echo - 1 : echo;
  if (at < 0) return null;
  return [...rest.slice(0, at), ...data, ...rest.slice(at)].join('\n');
};

// The text of a subroutine without the tile data (which goes in the graphics bank, not in the subroutine's bank), for its size estimate.
export const withoutTileData = (text) => {
  const begin = text.indexOf(`@${DATA_BEGIN}\n`);
  const end = text.indexOf(`@${DATA_END}`);
  return begin >= 0 && end > begin ? text.slice(0, begin) + text.slice(end) : text;
};

// ---- The standard kernel ----------------------------------------------------------------------------------------------------------------
// The standard kernel has no coprocessor: the 6502 builds a background from its tiles as it loads, into the playfield memory (4 bytes a row).
// To keep that a plain copy, a tile is kept as the byte it is in that memory: the second and fourth bytes of a row draw their bits the other
// way round, so a tile is kept for the column it is in (the same pixels in a first and a second column are two tiles; a background whose
// right half mirrors its left keeps one tile for both, as a mirrored column's byte is the same). The tiles are kept as planes: the first byte
// of every tile, then the second byte of every tile, and so on, so the byte of a tile is read with the tile's number as the index.
// The routine: _pftile_std (temp1 and temp2 the map of the background, temp6 its rows) and _pftile_stdset (the Set playfield tile block:
// temp1 the column, temp2 the row, temp3 the tile). Its size, for the build to weigh the tiles against the rows (bytes, about).
export const STANDARD_TILE_CODE_BYTES = 110;
// What each background's load takes: the tiles' call (about) and the "playfield:" statement's copy (about).
export const STANDARD_TILE_CALL_BYTES = 14;
export const STANDARD_PLAYFIELD_COPY_BYTES = 16;
export const STANDARD_TILE_LOAD_NAME = '_pftile_std';
// The tall scroll's row routine (standardScrollTileRowLines) and its use in the scroll routine, about.
export const STANDARD_SCROLL_TILE_CODE_BYTES = 110;

// The standard kernel's tall scroll (generateBackgroundScrollPatch in bbasic.js) with the backgrounds kept as tiles: a routine that puts one
// row of a background into the playfield memory (bgtilerow: A the row, X where it goes (the slot times four, X is four more after), Y the
// background; temp1 to temp4 are used), and the data, the planes and the maps (bgtile_mapN, which bgscroll_lo and bgscroll_hi point at).
// Labels start with @, as the scroll routine's do.
export const standardScrollTileRowLines = (plan, writeBase) => {
  const count = plan.tiles.length;
  const height = plan.height;
  return [
    '@bgtilerow',
    'pha',
    'lda bgscroll_lo,y', 'sta temp1', 'lda bgscroll_hi,y', 'sta temp2',
    'lda #<bgtile_planes', 'sta temp3', 'lda #>bgtile_planes', 'sta temp4',
    'pla',
    // the row of tiles (times four, the map's row) in Y and the row in the tile in A
    'ldy #0',
    '@bgtilerowdiv',
    `cmp #${height}`, 'bcc bgtilerowplane', `sbc #${height}`, 'iny', 'iny', 'iny', 'iny', 'jmp bgtilerowdiv',
    // the plane of that row of the tiles
    '@bgtilerowplane',
    'cmp #0', 'beq bgtilerowcols',
    '@bgtilerowadd',
    'pha', 'lda temp3', 'clc', `adc #${count}`, 'sta temp3', 'bcc bgtilerownoinc', 'inc temp4', '@bgtilerownoinc',
    'pla', 'sec', 'sbc #1', 'bne bgtilerowadd',
    // each column: the tile of the map, its byte in the plane
    '@bgtilerowcols',
    ...[0, 1, 2, 3].flatMap(() => ['tya', 'pha', 'lda (temp1),y', 'tay', 'lda (temp3),y', `sta ${writeBase},x`, 'inx', 'pla', 'tay', 'iny']),
    'rts',
  ];
};
export const standardScrollTileDataLines = (plan) => {
  const byteLines = (values) => {
    const out = [];
    for (let i = 0; i < values.length; i += 16) out.push(`.byte ${values.slice(i, i + 16).join(',')}`);
    return out;
  };
  return [
    'asm',
    '@bgtile_planes',
    ...byteLines(Array.from({length: plan.height}, (_, k) => plan.tiles.map((tile) => tile[k])).flat()),
    ...plan.maps.flatMap(({map}, index) => [`@bgtile_map${index}`, ...byteLines(map)]),
    '@end',
  ];
};

// The tiles of the backgrounds given ({id, pixels: the rows the playfield memory gets}) for the standard kernel, at the height with the fewest
// bytes; null when it can not be done (more than 255 different tiles).
export const planStandardTilemap = (backgrounds) => {
  if (!backgrounds.length) return null;
  const rowsOf = backgrounds.map(({pixels}) => ({
    rows: pixels.map((row) => {
      const bytes = tileRowBytes(row);
      return [bytes[0], flipByte(bytes[1]), bytes[2], flipByte(bytes[3])];
    }),
    fill: pixels.length,
    thin: 1,
  }));
  let best = null;
  for (let height = 1; height <= MAX_TILE_ROWS; height++) {
    const layout = layoutFor(rowsOf, height, [], false);
    if (layout && layout.tiles.length <= 255 && (!best || layout.bytes < best.bytes)) best = layout;
  }
  if (!best) return null;
  // (No descriptions: the map's address is given to the routine.)
  const bytes = best.tiles.length * best.height + best.maps.reduce((sum, {map}) => sum + map.length, 0);
  return {...best, bytes, standard: true, rows: backgrounds.map(({pixels}) => pixels.length),
    numbers: new Map(backgrounds.map(({id}, index) => [String(id), index])),
    rawBytes: rowsOf.reduce((sum, {rows}) => sum + rows.length * 4, 0)};
};

// The load of one background on the standard kernel (bB lines): the map's address and the rows, and a call of the routine (gosubSuffix: the
// bank tag of the call).
export const standardTileLoadLines = (plan, id, gosubSuffix) => {
  const index = plan.numbers.get(String(id));
  return [
    ` temp6 = ${plan.rows[index]}`,
    ' asm',
    ` lda #<_pftile_map${index}`, ' sta temp1', ` lda #>_pftile_map${index}`, ' sta temp2',
    'end',
    ` gosub ${STANDARD_TILE_LOAD_NAME}${gosubSuffix}`,
  ];
};

// The routine and the data, as the body of a subroutine (bB lines: statements after a space, labels at the start of a line). writeBase: where
// the playfield memory is written (with Superchip its write port); rows: the rows of the playfield memory (the Set playfield tile block stops
// there).
export const standardTileRoutineLines = (plan, writeBase, rows) => {
  const count = plan.tiles.length;
  const height = plan.height;
  const byteLines = (values) => {
    const out = [];
    for (let i = 0; i < values.length; i += 16) out.push(` .byte ${values.slice(i, i + 16).join(',')}`);
    return out;
  };
  const column = (c) => [` ldy #${c}`, ' lda (temp1),y', ' tay', ' lda (temp3),y', ` sta ${writeBase}+${c},x`];
  return [
    // A background: each row of the playfield memory takes, for each column, the byte of its tile in the plane of its row in the tile.
    ' asm',
    ' lda #<_pftile_planes', ' sta temp3', ' lda #>_pftile_planes', ' sta temp4', ' lda #0', ' sta temp5', ' ldx #0',
    '_pftile_std_row',
    ...[0, 1, 2, 3].flatMap(column),
    ' inx', ' inx', ' inx', ' inx',
    ' dec temp6', ' beq _pftile_std_done',
    ' inc temp5', ' lda temp5', ` cmp #${height}`, ' bcc _pftile_std_plane',
    // The next row of tiles: the first plane again, and the map's next row.
    ' lda #0', ' sta temp5', ' lda #<_pftile_planes', ' sta temp3', ' lda #>_pftile_planes', ' sta temp4',
    ' lda temp1', ' clc', ' adc #4', ' sta temp1', ' bcc _pftile_std_row', ' inc temp2', ' jmp _pftile_std_row',
    // The next row in the tiles: the next plane.
    '_pftile_std_plane',
    ' lda temp3', ' clc', ` adc #${count}`, ' sta temp3', ' bcc _pftile_std_row', ' inc temp4', ' jmp _pftile_std_row',
    '_pftile_std_done',
    'end',
    ' return',
    // One tile (the Set playfield tile block): temp1 the column (0 to 3), temp2 a row of the tile (the tile starts at the row less its place in
    // the tile), temp3 the tile; the rows past the playfield memory are left alone.
    '_pftile_stdset',
    ' asm',
    ' lda temp2',
    '_pftile_stdset_mod',
    ` cmp #${height}`, ' bcc _pftile_stdset_modded', ` sbc #${height}`, ' jmp _pftile_stdset_mod',
    '_pftile_stdset_modded',
    ' sta temp4', ' lda temp2', ' sec', ' sbc temp4', ' sta temp2',
    ' asl', ' asl', ' clc', ' adc temp1', ' tax',
    ' lda #<_pftile_planes', ' sta temp4', ' lda #>_pftile_planes', ' sta temp5', ` lda #${height}`, ' sta temp6',
    '_pftile_stdset_loop',
    ' lda temp2', ` cmp #${rows}`, ' bcs _pftile_stdset_done',
    ' ldy temp3', ' lda (temp4),y', ` sta ${writeBase},x`,
    ' inx', ' inx', ' inx', ' inx', ' inc temp2',
    ' lda temp4', ' clc', ` adc #${count}`, ' sta temp4', ' bcc _pftile_stdset_next', ' inc temp5',
    '_pftile_stdset_next',
    ' dec temp6', ' bne _pftile_stdset_loop',
    '_pftile_stdset_done',
    'end',
    ' return',
    // The data: the planes, then the map of each background (4 tile numbers a row).
    ' asm',
    '_pftile_planes',
    ...byteLines(Array.from({length: height}, (_, k) => plan.tiles.map((tile) => tile[k])).flat()),
    ...plan.maps.flatMap(({map}, index) => [`_pftile_map${index}`, ...byteLines(map)]),
    'end',
  ];
};
