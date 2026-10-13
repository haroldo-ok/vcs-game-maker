'use strict';

// The DPC+ coprocessor program (public/bb19/includes/custom/main.c) comes in four builds, because its code sits in bank 1
// next to the kernel, where every byte counts: the plain one, one with the sound engine's functions (DPC_AUDIO), one with
// the divide function of the Options tab's "Faster multiply and divide" (DPC_MATH), and one with both.
const cache = {};
export const getDpcPlusProgramSiblingFile = (kernel, {audio, math}) => {
  if (kernel !== 'dpcplus' || (!audio && !math)) return Promise.resolve({});
  const file = `custom2_${[audio ? 'audio' : '', math ? 'math' : ''].filter(Boolean).join('_')}.bin`;
  if (!cache[file]) {
    cache[file] = fetch(`bb19/includes/custom/bin/${file}`).then((r) => r.arrayBuffer()).then((bin) =>
      // One character per byte, the way the compiler takes binary files.
      ({'custom/bin/custom2.bin': Array.from(new Uint8Array(bin), (b) => String.fromCharCode(b)).join('')}));
  }
  return cache[file];
};
