'use strict';

import {planTilemap} from '../generators/bbasic/pf-tiles';

// The Playfield tab's Tiles section works on the backgrounds with these (see views/BackgroundEditor.vue): finding the tiles that repeat in
// them, and a background kept as tile numbers (background.tileMap: rows of 4 tile ids, one a column of 8 pixels; its pixels follow its tiles).
// A cell can hold a tile flipped left to right: its id less than zero (the tile -id), as the build can keep it (see pf-tiles.js TILE_FLIP_BIT).

// The pixels of one cell of a background (width columns from column * width, 8 when not given, the rows from cellRow * height), as rows of
// width (0 or 1); rows past the end are empty.
export const cellPixels = (pixels, cellRow, column, height, width = 8) => Array.from({length: height}, (_, k) => {
  const row = pixels[cellRow * height + k] || [];
  return Array.from({length: width}, (_, i) => (row[column * width + i] ? 1 : 0));
});

const keyOf = (rows) => rows.map((row) => row.map((value) => (value ? 1 : 0)).join('')).join('/');
// A tile's rows flipped left to right.
export const flipRows = (rows) => rows.map((row) => [...(row || [])].reverse());

// The backgrounds a tile map can be made of: 32 pixels wide, all columns the same rows (a background whose columns have separate rows is left out).
export const tileableBackgrounds = (backgrounds) => (backgrounds || []).filter((background) =>
  !background.groupPfres && Array.isArray(background.pixels) && background.pixels.length && (background.pixels[0] || []).length === 32);

// The tile height (rows) with which the backgrounds take the fewest bytes, as the build picks it (generators/bbasic/pf-tiles.js).
export const bestTileHeight = (backgrounds) => {
  const plan = planTilemap(tileableBackgrounds(backgrounds).map((background) => ({id: background.id, pixels: background.pixels, fill: background.pixels.length})));
  return plan ? plan.height : null;
};

// The tile map of a background's pixels: each cell the id of the tile with its pixels, or of the tile that is them flipped left to right (as
// -id), a new tile added (through addTile(rows) -> id) for a cell no tile has either way. Every cell has a tile, an empty one too.
export const mapOfPixels = (pixels, height, tiles, addTile, width = 8) => {
  const idOf = new Map();
  const add = (rows, id) => {
    const key = keyOf(rows);
    const mirror = keyOf(flipRows(rows));
    if (!idOf.has(key)) idOf.set(key, id);
    if (!idOf.has(mirror)) idOf.set(mirror, -id);
  };
  tiles.forEach((tile) => add(cellPixels(tile.pixels || [], 0, 0, height, width), tile.id));
  const columns = Array.from({length: 32 / width}, (_, column) => column);
  return Array.from({length: Math.ceil(pixels.length / height)}, (_, cellRow) => columns.map((column) => {
    const rows = cellPixels(pixels, cellRow, column, height, width);
    const key = keyOf(rows);
    if (!idOf.has(key)) add(rows, addTile(rows));
    return idOf.get(key);
  }));
};

// The pixels of a tile map (rowCount rows of 32): each cell its tile's pixels (flipped for a -id), empty for a tile that is gone; cells
// of width pixels (8 when not given).
export const pixelsOfMap = (map, height, tiles, rowCount, width = 8) => {
  const byId = new Map(tiles.map((tile) => [tile.id, tile.pixels || []]));
  return Array.from({length: rowCount}, (_, row) => {
    const cells = map[Math.floor(row / height)] || [];
    const tileRow = row % height;
    return Array.from({length: 32 / width}, (_, column) => column).flatMap((column) => {
      const id = cells[column];
      const flipped = typeof id === 'number' && id < 0;
      const tile = byId.get(flipped ? -id : id) || [];
      return Array.from({length: width}, (_, i) => ((tile[tileRow] || [])[flipped ? width - 1 - i : i] ? 1 : 0));
    });
  });
};

// Whether two cells' pixels are the same.
export const samePixels = (a, b) => keyOf(a) === keyOf(b);
