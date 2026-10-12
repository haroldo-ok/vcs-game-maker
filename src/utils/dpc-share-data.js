'use strict';

// DPC+ player graphics and color rows are data blocks of the compiled assembly, one per "playerN:" and "playerNcolor:" statement,
// and each statement stores a separate copy. Frames that hold the same rows (another player with the same sprite, a frame an
// animation repeats) can share one copy: the later blocks become names for the first block's address, and the pointer
// setup code, which only refers to those names, points at the shared bytes.

const DATA_LABEL = /^(player(?:color)?L\d+_\d+)\s*$/;
const DATA_BYTE = /^\s+\.byte\b/;

// The assembly with every repeated player data block replaced by an alias of the first one, and how many bytes that saves.
export const shareIdenticalPlayerData = (asm) => {
  const lines = asm.split('\n');
  const firstLabelOf = new Map();
  const out = [];
  let saved = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = DATA_LABEL.exec(lines[i].replace(/\r$/, ''));
    if (!match) {
      out.push(lines[i]);
      continue;
    }
    // The block runs until the first line that is not a data byte.
    let end = i + 1;
    while (end < lines.length && DATA_BYTE.test(lines[end])) end++;
    const body = lines.slice(i + 1, end);
    const key = `${match[1].startsWith('playercolor') ? 'c' : 'g'}:${body.map((line) => line.trim().replace(/\s+/g, ' ')).join('|')}`;
    const first = firstLabelOf.get(key);
    if (first && body.length) {
      out.push(`${match[1]} = ${first}`);
      saved += body.length;
      i = end - 1;
    } else {
      if (body.length) firstLabelOf.set(key, match[1]);
      out.push(lines[i]);
    }
  }
  return {asm: out.join('\n'), saved};
};
