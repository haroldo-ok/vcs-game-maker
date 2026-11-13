'use strict';

import {planTilemap} from '../generators/bbasic/pf-tiles';

// The Playfield tab's Tiles section works on the backgrounds with these (see views/BackgroundEditor.vue): finding the tiles that repeat in
// them, and a background kept as tile numbers (background.tileMap: rows of 4 tile ids, one a column of 8 pixels; its pixels follow its tiles).

// The pixels of one cell of a background (8 columns from column * 8, the rows from cellRow * height), as rows of 8 (0 or 1); rows past the
// end are empty.
export const cellPixels = (pixels, cellRow, column, height) => Array.from({length: height}, (_, k) => {
  const row = pixels[cellRow * height + k] || [];
  return Array.from({length: 8}, (_, i) => (row[column * 8 + i] ? 1 : 0));
});

const keyOf = (rows) => rows.map((row) => row.map((value) => (value ? 1 : 0)).join('')).join('/');
const isEmpty = (rows) => rows.every((row) => row.every((value) => !value));

// The backgrounds a tile map can be made of: 32 pixels wide, all columns the same rows (a background whose columns have separate rows is left out).
export const tileableBackgrounds = (backgrounds) => (backgrounds || []).filter((background) =>
  !background.groupPfres && Array.isArray(background.pixels) && background.pixels.length && (background.pixels[0] || []).length === 32);

// The tile height (rows) with which the backgrounds take the fewest bytes, as the build picks it (generators/bbasic/pf-tiles.js).
export const bestTileHeight = (backgrounds) => {
  const plan = planTilemap(tileableBackgrounds(backgrounds).map((background) => ({id: background.id, pixels: background.pixels, fill: background.pixels.length})));
  return plan ? plan.height : null;
};

// The patterns of the given height found two times or more in all the backgrounds (not empty, not already a tile), in the order they are first
// found (background by background, top to bottom, left to right): rows of 8.
export const repeatingTiles = (backgrounds, height, tiles = []) => {
  const known = new Set(tiles.map((tile) => keyOf(cellPixels(tile.pixels || [], 0, 0, height))));
  const counts = new Map();
  const found = [];
  for (const background of tileableBackgrounds(backgrounds)) {
    const cellRows = Math.ceil(background.pixels.length / height);
    for (let cellRow = 0; cellRow < cellRows; cellRow++) {
      for (let column = 0; column < 4; column++) {
        const rows = cellPixels(background.pixels, cellRow, column, height);
        const key = keyOf(rows);
        if (isEmpty(rows) || known.has(key)) continue;
        if (!counts.has(key)) found.push({key, rows});
        counts.set(key, (counts.get(key) || 0) + 1);
      }
    }
  }
  return found.filter(({key}) => counts.get(key) >= 2).map(({rows}) => rows);
};

// The tile map of a background's pixels: each cell the id of the tile with its pixels, a new tile added (through addTile(rows) -> id) for a
// cell no tile has. Every cell has a tile, an empty one too.
export const mapOfPixels = (pixels, height, tiles, addTile) => {
  const idOf = new Map();
  tiles.forEach((tile) => {
    const key = keyOf(cellPixels(tile.pixels || [], 0, 0, height));
    if (!idOf.has(key)) idOf.set(key, tile.id);
  });
  return Array.from({length: Math.ceil(pixels.length / height)}, (_, cellRow) => [0, 1, 2, 3].map((column) => {
    const rows = cellPixels(pixels, cellRow, column, height);
    const key = keyOf(rows);
    if (!idOf.has(key)) idOf.set(key, addTile(rows));
    return idOf.get(key);
  }));
};

// The pixels of a tile map (rowCount rows of 32): each cell its tile's pixels, empty for a tile that is gone.
export const pixelsOfMap = (map, height, tiles, rowCount) => {
  const byId = new Map(tiles.map((tile) => [tile.id, tile.pixels || []]));
  return Array.from({length: rowCount}, (_, row) => {
    const cells = map[Math.floor(row / height)] || [];
    const tileRow = row % height;
    return [0, 1, 2, 3].flatMap((column) => {
      const tile = byId.get(cells[column]) || [];
      return Array.from({length: 8}, (_, i) => ((tile[tileRow] || [])[i] ? 1 : 0));
    });
  });
};

// Whether two cells' pixels are the same.
export const samePixels = (a, b) => keyOf(a) === keyOf(b);
