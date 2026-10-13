'use strict';

// DPC+ keeps 4K of display RAM: the kernel's fixed buffers (each sprite's graphics and colors, the playfield columns, the color rows, the
// score digits), the stack, and what is left. The symbols give where each one starts, so each is as long as the distance to the next.
const REGIONS = [
  ['C_function', 'Coprocessor call area'],
  ['CcodeData', 'Coprocessor code copy'],
  ['playerpointers', 'Sprite pointers'],
  ['P1GFX', 'Player 1 graphics'],
  ['P1COLOR', 'Player 1 colors'],
  ['P0GFX', 'Player 0 graphics'],
  ['P0COLOR', 'Player 0 colors'],
  ['PF1L', 'Playfield columns'],
  ['PFCOLS', 'Playfield row colors'],
  ['JUMPTABLELO', 'Kernel tables'],
  ['scoredata', 'Score digits and colors'],
  ['BKCOLS', 'Background row colors'],
  ['STACKbegin', 'Stack'],
];

// The display RAM's items, in address order, as {name, bytes}, and how many bytes are free; undefined without the symbols.
export const dpcPlusRamUsage = (symbolmap) => {
  if (!symbolmap || symbolmap.USERSTACK === undefined) return undefined;
  const address = (name) => symbolmap[name] & 0x0FFF;
  const names = [...REGIONS.map(([symbol]) => symbol), 'USERSTACK'];
  if (names.some((symbol) => symbolmap[symbol] === undefined)) return undefined;
  const items = [
    // What sits ahead of the call area: the fetcher and function tables the coprocessor keeps in the same RAM.
    {name: 'Coprocessor tables', bytes: address('C_function')},
    ...REGIONS.map(([symbol, name], i) => ({name, bytes: address(names[i + 1]) - address(symbol)})),
  ];
  return {items, free: 0x1000 - address('USERSTACK')};
};
