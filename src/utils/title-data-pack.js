'use strict';

// The data of the Titlescreen Kernel (the pictures and row colors of the cards) is stored in tables that must not cross a page, and each
// one is written as "if the table would cross a page, align 256". Stored in the order of the cards, the padding that leaves can come to
// a few hundred bytes of a bank that is nearly full. This puts the tables in another order: each time, the biggest one that still fits in
// the rest of the page goes next, and a page is only left unfinished when none fits. The data starts on a page boundary, so the order
// worked out here is the one the assembler gets.
//
// The data really starts where the code before it ends, and the first table that does not fit in what is left of that page starts the
// next page: the rest of that page (up to 255 bytes) is padding. The last tables of the order, the small ones, are therefore offered to
// that gap first: each is written there when the assembler finds it fits (the assembler works out where it is), and in its place at
// the end of the data otherwise.

const BYTE_LINE = /^\s*(?:BYTE|\.byte)\s+(.*)$/i;
const CONDITIONAL = /^\s*if >\. != >\[\.\+\(?(\w+)\)?\]\s*$/i;
const PAGE_ALIGN = /^\s*align 256\s*$/i;
const SYMBOL = /^\s*(\w+)\s*=\s*(\d+)\s*$/;

// The most tables (and bytes of them, and bytes in one) that are offered to the gap before the first page of the data.
const MAX_GAP_TABLES = 24;
const MAX_GAP_BYTES = 256;
const MAX_GAP_TABLE_BYTES = 200;
const LABEL_LINE = /^(\w+)\s*(?:;.*)?$/;

// The first label a table defines (a line that is only a name).
const labelOf = (chunk) => {
  for (const line of chunk.lines.slice(3)) {
    const match = LABEL_LINE.exec(line.trim());
    if (match && !/^(?:BYTE|endif|align)$/i.test(match[1])) return match[1];
  }
  return null;
};

const bytesOf = (line) => {
  const match = BYTE_LINE.exec(line.replace(/;.*/, ''));
  return match ? match[1].split(',').length : 0;
};

// The text of the data files of the cards, put in the order that leaves the least padding. The text is returned as it was when it holds
// anything this does not know how to move.
export const packTitleData = (text) => {
  const lines = text.split('\n');
  const symbols = {};
  const head = [];
  const tables = [];
  const pages = [];
  // Data that is not a table of a card (the sprites of the Player card come after the last table) has no page to stay in, and goes after
  // the tables, so that it does not weigh on the table it followed.
  const footer = [];
  let current = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const symbol = SYMBOL.exec(line);
    if (symbol) symbols[symbol[1]] = Number(symbol[2]);
    const conditional = CONDITIONAL.exec(line);
    if (conditional) {
      // (The three lines "if", "align 256" and "endif" start a table.)
      if (!PAGE_ALIGN.test(lines[i + 1] || '') || !/^\s*endif\s*$/i.test(lines[i + 2] || '') || !(conditional[1] in symbols)) return text;
      current = {lines: [], need: symbols[conditional[1]], bytes: 0, after: 0};
      tables.push(current);
      current.lines.push(line, lines[i + 1], lines[i + 2]);
      i += 2;
      continue;
    }
    if (PAGE_ALIGN.test(line)) {
      current = {lines: [line], bytes: 0};
      pages.push(current);
      continue;
    }
    if (!current) {
      head.push(line);
      continue;
    }
    const ownerMatch = /^(\w+)\s*(?:;.*)?$/.exec(line.trim());
    if (current.need !== undefined && ownerMatch && /^bmp_player\d/.test(ownerMatch[1])) {
      current = {lines: [], bytes: 0};
      footer.push(current);
    }
    // (A zero byte before the label of a table of row colors comes after the test, so the table starts one byte later.)
    current.lines.push(line);
    current.bytes += bytesOf(line);
  }
  if (!tables.length) return text;
  // The lines that follow a table up to the next one go with it, so the symbols of a card that are set after a table stay defined before
  // the tests that use them: the head holds every "name = number" line, wherever it was.
  const definitions = [];
  const keep = (chunk) => {
    chunk.lines = chunk.lines.filter((line) => {
      if (!SYMBOL.test(line)) return true;
      definitions.push(line);
      return false;
    });
  };
  [...tables, ...pages, ...footer].forEach(keep);
  const headKept = head.filter((line) => {
    if (!SYMBOL.test(line)) return true;
    definitions.push(line);
    return false;
  });
  // Padding is worked out from the start of the data, which is on a page boundary. The pages that start on one go first.
  let position = 0;
  pages.forEach((chunk) => {
    position = ((position + 255) & ~255) + chunk.bytes;
  });
  position += headKept.reduce((sum, line) => sum + bytesOf(line), 0);
  const ordered = [];
  const remaining = [...tables];
  const fits = (chunk) => (position & 255) + chunk.need <= 255;
  while (remaining.length) {
    let next = remaining.filter(fits).sort((a, b) => b.need - a.need)[0];
    if (!next) {
      next = remaining.slice().sort((a, b) => b.need - a.need)[0];
      position += (256 - (position & 255)) & 255;
    }
    remaining.splice(remaining.indexOf(next), 1);
    ordered.push(next);
    position += next.bytes;
  }
  // The tail of the order (the tables that fill what the others leave) is what goes to the gap: the plan for the rest is not disturbed.
  const gapCandidates = [];
  let gapBytes = 0;
  for (let i = ordered.length - 1; i >= 0 && gapCandidates.length < MAX_GAP_TABLES; i--) {
    const chunk = ordered[i];
    const label = labelOf(chunk);
    if (!label || chunk.need > MAX_GAP_TABLE_BYTES || gapBytes + chunk.bytes > MAX_GAP_BYTES) break;
    gapBytes += chunk.bytes;
    gapCandidates.unshift(chunk);
  }
  const inGap = new Set(gapCandidates);
  // (The biggest first: the gap is filled by the first that fits, then what is left of it by the next.)
  const gapOrder = gapCandidates.slice().sort((a, b) => b.need - a.need);
  const out = [...definitions];
  // (The flags are SET again at the start of every pass of the assembler: a plain symbol stays defined from the pass before, and
  // the table would then be written in neither place.)
  gapCandidates.forEach((chunk) => out.push(`${labelOf(chunk)}_ingap SET 0`));
  gapOrder.forEach((chunk) => {
    const flag = `${labelOf(chunk)}_ingap`;
    out.push(` if ((. & $FF) + ${chunk.need}) < $100`, ...chunk.lines.slice(3), `${flag} SET 1`, ' endif');
  });
  pages.forEach((chunk) => out.push(...chunk.lines));
  out.push(...headKept);
  ordered.filter((chunk) => !inGap.has(chunk)).forEach((chunk) => out.push(...chunk.lines));
  gapCandidates.forEach((chunk) => out.push(` if ${labelOf(chunk)}_ingap == 0`, ...chunk.lines, ' endif'));
  footer.forEach((chunk) => out.push(...chunk.lines));
  return out.join(String.fromCharCode(10));
};
