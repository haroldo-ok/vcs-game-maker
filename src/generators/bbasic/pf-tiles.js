'use strict';

// The playfield tilemap (DPC+, the Options tab's "Backgrounds as tiles"): every background is cut into tiles one playfield column (8 pixels)
// wide and the same number of rows tall, each different tile is stored once, and a background is a map of tile numbers (4 a row, PF1L PF2L
// PF1R PF2R). The tiles, the maps and a short description of each background go in the graphics bank (moved there after the compile, see
// moveTilesToDisplayData), and the coprocessor's program in the ROM (armprog.c, function 106) builds a background's rows in the four column
// queues from them when it is loaded; function 108 to 111 puts one tile in (the "Set playfield tile" block). The kernel, the collision, the
// offset block and the pixel blocks see the same column queues as before. (The way the Activision DPC games keep their rooms: a few band
// patterns shared by every room, a room a list of which ones.)

export const TILE_LOAD_FUNCTION = 106;
// The tile height of the Tiles section (1 to 8 rows, 4 when not set).
export const DEFAULT_TILE_ROWS = 4;
export const tileSetHeight = (tileSet) => Math.max(1, Math.min(8, Math.round(Number(tileSet && tileSet.height) || DEFAULT_TILE_ROWS)));
export const TILE_SET_FUNCTION = 108;
// The tallest tile the build tries (a tile is a column byte for each of its rows).
const MAX_TILE_ROWS = 8;
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
// A drawn tile (rows of 8 pixels) as its bytes.
const tileBytes = (pixels, height) => Array.from({length: height}, (_, k) => tileRowBytes([...(pixels[k] || []), ...new Array(24).fill(0)])[0]);

// The layout of one tile height: the tiles, and for each background its map, the rows of the map and the rows to fill (0: the map once);
// null when it can not be done (more than 256 different tiles, or a map that runs past the 256 rows of a queue).
const layoutFor = (backgrounds, height, fixedTiles = []) => {
  // The tiles of the Tiles section first, each with its number (the same pixels twice keep both numbers; a background's tile takes the first).
  const tiles = fixedTiles.map((pixels) => tileBytes(pixels, height));
  const numberOf = new Map();
  tiles.forEach((bytes, number) => {
    if (!numberOf.has(bytes.join(','))) numberOf.set(bytes.join(','), number);
  });
  const tileOf = (bytes) => {
    const key = bytes.join(',');
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
  if (tiles.length > 256) return null;
  const bytes = tiles.length * height + maps.reduce((sum, {map}) => sum + map.length, 0) + maps.length * 7;
  return {height, tiles, maps, bytes};
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
  for (let height = 1; height <= MAX_TILE_ROWS; height++) {
    if (fixedHeight && height !== fixedHeight) continue;
    const layout = layoutFor(rowsOf, height, fixed.map((tile) => tile.pixels || []));
    if (layout && (!best || layout.bytes < best.bytes)) best = layout;
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
      `${plan.height},${mapRows},${total}`]),
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
