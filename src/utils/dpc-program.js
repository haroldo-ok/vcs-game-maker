'use strict';

// The DPC+ coprocessor program (public/bb19/includes/custom/main.c) comes in sixteen builds, because its code sits in bank 1
// next to the kernel, where every byte counts: the plain one, one with the sound engine's functions (DPC_AUDIO), one with
// the divide function of the Options tab's "Faster multiply and divide" (DPC_MATH), one with the row functions of the playfield
// box test of backgrounds with different numbers of rows (DPC_ROWS), one with the functions of the Playfield offset block (DPC_OFFSET), and the ones with these together.
const cache = {};
export const getDpcPlusProgramSiblingFile = (kernel, {audio, math, rows, offset}) => {
  if (kernel !== 'dpcplus' || (!audio && !math && !rows && !offset)) return Promise.resolve({});
  const file = `custom2_${[audio ? 'audio' : '', math ? 'math' : '', rows ? 'rows' : '', offset ? 'offset' : ''].filter(Boolean).join('_')}.bin`;
  if (!cache[file]) {
    cache[file] = fetch(`bb19/includes/custom/bin/${file}`).then((r) => r.arrayBuffer()).then((bin) =>
      // One character per byte, the way the compiler takes binary files.
      ({'custom/bin/custom2.bin': Array.from(new Uint8Array(bin), (b) => String.fromCharCode(b)).join('')}));
  }
  return cache[file];
};
