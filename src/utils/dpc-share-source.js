'use strict';

// Frames that hold the same rows on the DPC+ kernel (a sprite another player has as well, the blank flipped copies, a frame an animation
// repeats) are stored once. batari Basic keeps a copy for every "playerN:" and "playerNcolor:" statement, and counts every byte of them
// while it compiles (a project with a lot of sprite data stops there with a misleading message about banksw.asm), so the copies are
// cut out of the source itself: a repeat becomes a one byte statement, its height is set by hand, and labels left after the statements
// tell the assembly step (aliasSharedPlayerData below) which first copy each repeat is a name for.

const OPEN = /^\s*(player\d+)(color)?:\s*$/;
const END = /^\s*end\s*$/;
const MIN_ROWS = 4;
const sourceMarker = (group) => `_dpcsrc_${group}`;
const repeatMarker = (group, index) => `_dpcdup_${group}_${index}`;

// The source with every repeated sprite statement cut down to one byte, and how many bytes that saves.
export const shareDpcPlusPlayerSource = (code) => {
  const lines = code.split('\n');
  const blocks = [];
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i].replace(/\r$/, ''));
    if (!open) continue;
    let end = i + 1;
    while (end < lines.length && !END.test(lines[end])) end++;
    if (end >= lines.length) break;
    const body = lines.slice(i + 1, end);
    blocks.push({start: i, end, player: open[1], color: !!open[2], body});
    i = end;
  }
  const groups = new Map();
  blocks.forEach((block, index) => {
    if (block.body.length < MIN_ROWS) return;
    const key = `${block.color ? 'c' : 'g'}:${block.body.map((line) => line.trim()).join('|')}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(index);
  });
  const sourceMarkers = new Map();
  const repeatMarkers = new Map();
  let groupNumber = 0;
  let saved = 0;
  groups.forEach((indexes) => {
    if (indexes.length < 2) return;
    const group = groupNumber++;
    sourceMarkers.set(indexes[0], sourceMarker(group));
    indexes.slice(1).forEach((blockIndex, n) => {
      repeatMarkers.set(blockIndex, repeatMarker(group, n));
      saved += blocks[blockIndex].body.length - 1;
    });
  });
  if (!saved) return {code, saved: 0};
  const out = [];
  let position = 0;
  blocks.forEach((block, index) => {
    out.push(...lines.slice(position, block.start));
    if (repeatMarkers.has(index)) {
      out.push(lines[block.start], block.color ? '  $00' : '  %00000000', 'end');
      if (!block.color) out.push(` ${block.player}height = ${block.body.length}`);
      out.push(repeatMarkers.get(index));
    } else {
      out.push(...lines.slice(block.start, block.end + 1));
      if (sourceMarkers.has(index)) out.push(sourceMarkers.get(index));
    }
    position = block.end + 1;
  });
  out.push(...lines.slice(position));
  return {code: out.join('\n'), saved};
};

const MARKER_LINE = /^\.?(_dpcsrc_(\d+)|_dpcdup_(\d+)_(\d+))\s*$/;
const DATA_REFERENCE = /LDX\s+#<(player(?:color)?L\d+_\d+)\s*$/i;
const DATA_LABEL = /^(player(?:color)?L\d+_\d+)\s*$/;
const DATA_BYTE = /^\s+\.byte\b/;

// The assembly with each repeat's data replaced by a name for the first copy's address.
export const aliasSharedPlayerData = (asm) => {
  const lines = asm.split('\n');
  const first = new Map();
  const repeats = [];
  lines.forEach((line, index) => {
    const match = MARKER_LINE.exec(line.replace(/\r$/, ''));
    if (!match) return;
    // The statement's code comes just before its marker, and points at its data by label.
    let label = null;
    for (let i = index - 1; i >= Math.max(0, index - 80) && !label; i--) {
      const reference = DATA_REFERENCE.exec(lines[i].replace(/\r$/, ''));
      if (reference) label = reference[1];
    }
    if (!label) return;
    if (match[2] !== undefined) first.set(match[2], label);
    else repeats.push({group: match[3], label});
  });
  const aliases = new Map();
  repeats.forEach(({group, label}) => {
    if (first.has(group)) aliases.set(label, first.get(group));
  });
  if (!aliases.size) return {asm, aliased: 0};
  const out = [];
  let aliased = 0;
  for (let i = 0; i < lines.length; i++) {
    const match = DATA_LABEL.exec(lines[i].replace(/\r$/, ''));
    if (match && aliases.has(match[1])) {
      let end = i + 1;
      while (end < lines.length && DATA_BYTE.test(lines[end])) end++;
      out.push(`${match[1]} = ${aliases.get(match[1])}`);
      aliased++;
      i = end - 1;
    } else {
      out.push(lines[i]);
    }
  }
  return {asm: out.join('\n'), aliased};
};
