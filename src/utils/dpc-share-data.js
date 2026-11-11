'use strict';

// DPC+ player graphics and color rows are data blocks of the compiled assembly, one per "playerN:" and "playerNcolor:" statement,
// and each statement stores a separate copy. Frames that hold the same rows (another player with the same sprite, a frame an
// animation repeats) can share one copy: the later blocks become names for the first block's address, and the pointer
// setup code, which only refers to those names, points at the shared bytes.
// A block whose bytes are found together in a longer block (its start, its end or anywhere in it: a sprite of one color is a run of the same
// byte, a frame that is the top or the bottom of another one) is a name for the place in that block too ("label = other + offset"): the rows
// are read from the address the name gives for the height of the sprite, so the bytes after them do not matter. The bytes are compared as
// numbers ($0E and %00001110 are the same byte); a block with a byte that is not a plain number is only shared when its text is the same.

const DATA_LABEL = /^(player(?:color)?L\d+_\d+)\s*$/;
const DATA_BYTE = /^\s+\.byte\b/;

// The bytes of a block's ".byte" lines as numbers, or null when one is not a plain number.
const byteValues = (body) => {
  const values = [];
  for (const line of body) {
    const items = line.trim().replace(/^\.byte\s+/i, '').split(',').map((item) => item.trim());
    for (const item of items) {
      let value = null;
      if (/^\$[0-9a-f]+$/i.test(item)) value = parseInt(item.slice(1), 16);
      else if (/^%[01]+$/.test(item)) value = parseInt(item.slice(1), 2);
      else if (/^\d+$/.test(item)) value = parseInt(item, 10);
      if (value === null || value > 255) return null;
      values.push(value);
    }
  }
  return values;
};

// Where the bytes of `inner` are in `outer`, or -1.
const indexOfBytes = (outer, inner) => {
  if (!inner.length || inner.length > outer.length) return -1;
  for (let start = 0; start + inner.length <= outer.length; start++) {
    let k = 0;
    while (k < inner.length && outer[start + k] === inner[k]) k++;
    if (k === inner.length) return start;
  }
  return -1;
};

// The assembly with every player data block that another one holds replaced by a name for that place, and how many bytes that saves.
export const shareIdenticalPlayerData = (asm) => {
  const lines = asm.split('\n');
  // The blocks: the label's line, the line after the last byte, the label, the bytes (null when not all are plain numbers) and the text of the body.
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const match = DATA_LABEL.exec(lines[i].replace(/\r$/, ''));
    if (!match) continue;
    let end = i + 1;
    while (end < lines.length && DATA_BYTE.test(lines[end])) end++;
    const body = lines.slice(i + 1, end);
    if (body.length) {
      blocks.push({at: i, end, label: match[1], values: byteValues(body), text: `${match[1].startsWith('playercolor') ? 'c' : 'g'}:${body.map((line) => line.trim().replace(/\s+/g, ' ')).join('|')}`, size: body.length});
    }
    i = end - 1;
  }
  // The longest blocks are kept first, and each one after is looked for in the ones kept (the first of identical blocks is the one kept, as before).
  const order = blocks.map((block, n) => n).sort((a, b) => (blocks[b].values ? blocks[b].values.length : 0) - (blocks[a].values ? blocks[a].values.length : 0) || a - b);
  const kept = [];
  const keptText = new Map();
  const aliasOf = new Map();
  let saved = 0;
  order.forEach((n) => {
    const block = blocks[n];
    const same = keptText.get(block.text);
    if (same) {
      aliasOf.set(n, same);
      saved += block.size;
      return;
    }
    if (block.values) {
      for (const other of kept) {
        if (!other.values) continue;
        const offset = indexOfBytes(other.values, block.values);
        if (offset >= 0) {
          aliasOf.set(n, offset ? `${other.label}+${offset}` : other.label);
          saved += block.size;
          return;
        }
      }
    }
    kept.push(block);
    keptText.set(block.text, block.label);
  });
  if (!aliasOf.size) return {asm, saved: 0};
  const out = [];
  let next = 0;
  blocks.forEach((block, n) => {
    if (!aliasOf.has(n)) return;
    out.push(...lines.slice(next, block.at), `${block.label} = ${aliasOf.get(n)}`);
    next = block.end;
  });
  out.push(...lines.slice(next));
  return {asm: out.join('\n'), saved};
};
