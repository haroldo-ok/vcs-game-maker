'use strict';

// On the DPC+ kernel an animation loads a picture from tables of addresses instead of with a few instructions for every picture (see
// dpcPictureTables in generators/bbasic.js). The tables need the address of each picture's rows and row colors, which batari Basic only
// makes by compiling a "playerN:" or "playerNcolor:" statement, so the generator writes each statement between two labels, after the code,
// where nothing runs. Here the statement's code is cut out of the assembly and its data label becomes the name the tables use.

const START_LABEL = /^\.?(_dpcpic_[gc]_\w+?)_s\s*$/;
const END_LABEL = /^\.?(_dpcpic_[gc]_\w+?)_e\s*$/;
const DATA_REFERENCE = /LDX\s+#<(player(?:color)?L\d+_\d+)\s*$/i;

// The assembly with every picture statement replaced by a name for its data, and how many statements that was.
export const resolveDpcPictureTables = (asm) => {
  const lines = asm.split('\n');
  const out = [];
  let resolved = 0;
  for (let i = 0; i < lines.length; i++) {
    const start = START_LABEL.exec(lines[i].replace(/\r$/, ''));
    if (!start) {
      out.push(lines[i]);
      continue;
    }
    let end = i + 1;
    while (end < lines.length) {
      const stop = END_LABEL.exec(lines[end].replace(/\r$/, ''));
      if (stop && stop[1] === start[1]) break;
      end++;
    }
    if (end >= lines.length) {
      out.push(lines[i]);
      continue;
    }
    let label = null;
    for (let k = i + 1; k < end && !label; k++) {
      const reference = DATA_REFERENCE.exec(lines[k].replace(/\r$/, ''));
      if (reference) label = reference[1];
    }
    if (!label) {
      out.push(lines[i]);
      continue;
    }
    out.push(`${start[1]} = ${label}`);
    resolved++;
    // The end label is followed by the comment line batari Basic leaves for a label.
    i = end;
    if (/^\s*;;line\b/.test(lines[i + 1] || '')) i++;
  }
  return {asm: out.join('\n'), resolved};
};

// Whether any picture statement was left in the assembly.
export const hasUnresolvedPictureTables = (asm) => /^\.?_dpcpic_[gc]_\w+?_s\s*$/m.test(asm);

// A sprite statement that was cut down to one byte (see utils/dpc-share-source.js) sets the height to 1 and the next line sets the
// real one: the first store is never read.
const HEIGHT_PAIR = /\tLDA #\d+\n\tSTA (player\d+height)\n(\.L\d+ ;;line \d+;;\s+\1\s*=\s*\d+\n\n\tLDA #\d+\n\tSTA \1\n)/g;
export const trimRedundantHeightLoads = (asm) => {
  let trimmed = 0;
  const text = asm.replace(/\r\n/g, '\n').replace(HEIGHT_PAIR, (_, name, rest) => {
    trimmed++;
    return rest;
  });
  return {asm: trimmed ? text : asm, trimmed};
};
