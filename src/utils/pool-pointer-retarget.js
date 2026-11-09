// The sprites of a Sprite pool that share animation code (see poolAnimationGroups in generators/bbasic.js) run the code of the first sprite after an exchange of what
// the two sprites have. The exchange used to include the two pointers of each sprite (the picture and the colors, in playerpointers), which are written by the picture
// and color units of the first sprite at fixed addresses (the slots of the first sprite). This pass over the compiled assembly changes those writes to go to the slot of
// the sprite that runs the code: the slot address is moved on by the number of bytes in temp6 (0 for the first sprite, 2 for each place after it), which the routine of
// each sprite sets before it calls the shared code (the label _poolanim_player<N>_other marks the code). The pointers need no exchange then (about 145 cycles and
// 60 bytes for each exchange). The height the compiler stores after a picture is moved on the same way (the heights of the sprites are an array).
//
// The pass changes only the units of the first sprite (player<N>animation<i> and player<N>colortable<i>, between their _reloc_entry and _reloc_end labels), only
// the writes to its two slots (playerpointers + 2 x (N - 1) for the picture, 18 more for the colors), and only when the entry label is there. It throws when it
// is there and nothing could be changed: the code would then write the pointer of the first sprite for every sprite.

// The height the compiler stores after the picture of a unit written as statements: the heights are an array, the number of places after the first sprite is half of temp6.
const heightStore = (first) => new RegExp('^(\\s*)sta player' + first + 'height\\s*$', 'i');
const SLOT_LOW = /^(\s*)lda #<\(playerpointers\+(\d+)\)\s*$/i;
const STORE_LOW = /^\s*sta DF(\d)LOW\s*$/i;
const SLOT_HIGH = /^\s*lda #\(>\(playerpointers\+(\d+)\)\) & \$0F\s*$/i;
const STORE_HIGH = /^\s*sta DF(\d)HI\s*$/i;

// The index of the next line from i that is not empty, or -1.
const nextCode = (lines, i, end) => {
  for (let k = i; k < end; k++) if (lines[k].trim() !== '') return k;
  return -1;
};

export const retargetPoolAnimationPointers = (asm) => {
  const crlf = asm.includes('\r\n');
  const lines = asm.split('\n').map((line) => line.replace(/\r$/, ''));
  const entry = lines.map((line) => /^\._poolanim_player(\d+)_other\s*$/.exec(line)).find(Boolean);
  if (!entry) return {asm, count: 0};
  const first = Number(entry[1]);
  const slots = new Set([2 * (first - 1), 2 * (first - 1) + 18]);
  const out = [];
  let count = 0;
  let i = 0;
  let regionEnd = -1;
  while (i < lines.length) {
    const unit = new RegExp(`^\\.player${first}(?:animation|colortable)(\\d+)_reloc_entry\\s*$`).exec(lines[i]);
    if (unit) {
      const key = lines[i].trim().slice(1, -'_reloc_entry'.length);
      regionEnd = lines.findIndex((line, k) => k > i && line.trim() === `.${key}_reloc_end`);
      if (regionEnd === -1) regionEnd = i;
    }
    if (i > regionEnd) regionEnd = -1;
    const store = regionEnd !== -1 ? heightStore(first).exec(lines[i]) : null;
    if (store) {
      out.push(`${store[1]}pha`, `${store[1]}lda temp6`, `${store[1]}lsr`, `${store[1]}tax`, `${store[1]}pla`, `${store[1]}sta player${first}height,x`);
      i++;
      continue;
    }
    const low = regionEnd !== -1 ? SLOT_LOW.exec(lines[i]) : null;
    if (low && slots.has(Number(low[2]))) {
      const a = nextCode(lines, i + 1, regionEnd);
      const b = a === -1 ? -1 : nextCode(lines, a + 1, regionEnd);
      const c = b === -1 ? -1 : nextCode(lines, b + 1, regionEnd);
      const lowStore = a === -1 ? null : STORE_LOW.exec(lines[a]);
      const high = b === -1 ? null : SLOT_HIGH.exec(lines[b]);
      const highStore = c === -1 ? null : STORE_HIGH.exec(lines[c]);
      if (lowStore && high && highStore && Number(high[1]) === Number(low[2]) && lowStore[1] === highStore[1]) {
        const indent = low[1];
        out.push(lines[i], `${indent}clc`, `${indent}adc temp6`, lines[a], lines[b], `${indent}adc #0`, lines[c]);
        count++;
        i = c + 1;
        continue;
      }
    }
    out.push(lines[i]);
    i++;
  }
  if (!count) throw new Error(`Sprite pool: the pointer writes of the animation code of player ${first} were not found.`);
  return {asm: out.join(crlf ? '\r\n' : '\n'), count};
};
