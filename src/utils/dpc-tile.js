'use strict';

// A DPC+ background that scrolls is laid out over the 255 rows the playfield memory takes (see tileForDpcPlusScroll in
// generators/bbasic.js), the picture repeating over and over. Only one repeat is kept in the ROM: the generated code stores
// the rows of a single repeat and leaves a marker label, and here the assembly after each marker gets the code that has the coprocessor
// copy the same ROM rows into the rest of the playfield, playfield color and background color memory at load time.
//
// The marker is "_dpctile_<id>_<rows in a repeat>_<rows to fill>_<which of p (playfield), c (playfield colors), b (background colors)>".

export const dpcTileMarker = (id, period, total, parts) => `_dpctile_${id}_${period}_${total}_${parts}`;

const MARKER_LINE = /^\.?(_dpctile_(\d+)_(\d+)_(\d+)_([pcb]+))\s*$/;

// The label the last statement of a kind named in the lines before the marker, or null.
const lastLabel = (lines, end, pattern) => {
  for (let i = end - 1; i >= 0; i--) {
    const match = pattern.exec(lines[i]);
    if (match) return match[1];
  }
  return null;
};

// The copy of one set of rows: `rows` rows from each source, at `offset` rows past where the statements put the first repeat.
const copyLines = (id, labels, parts, period, rows) => {
  const lines = [];
  const call = (label, labelOffset, fetcher) => lines.push(
      `\tlda #<(${label}+${labelOffset})`, '\tsta PARAMETER',
      `\tlda #((>(${label}+${labelOffset})) & $0f) | (((>(${label}+${labelOffset})) / 2) & $70)`, '\tsta PARAMETER',
      `\tlda #${fetcher}`, '\tsta PARAMETER', `\tlda #${rows}`, '\tsta PARAMETER', '\tlda #1', '\tsta CALLFUNCTION');
  const destination = (symbol, fetcher) => lines.push(
      '\tclc', `\tlda #<${symbol}`, '\tadc temp4', `\tsta DF0LOW+${fetcher}`,
      `\tlda #(>${symbol}) & $0F`, '\tadc temp5', `\tsta DF0HI+${fetcher}`);
  if (parts.includes('p')) {
    // The four playfield columns come one after the other in the data, the last fetcher's first.
    ['PF1L', 'PF2L', 'PF1R', 'PF2R'].forEach((symbol, fetcher) => {
      destination(symbol, fetcher);
      call(labels.p, (3 - fetcher) * period, fetcher);
    });
  }
  if (parts.includes('c')) {
    destination('PFCOLS', 0);
    call(labels.c, 0, 0);
  }
  if (parts.includes('b')) {
    destination('BKCOLS', 0);
    call(labels.b, 0, 0);
  }
  return lines;
};

// The code that fills the playfield up to `total` rows from the `period` rows already loaded.
const expansionLines = (id, labels, parts, period, total) => {
  const repeats = Math.floor(total / period);
  const remainder = total - repeats * period;
  const lines = [`\tlda #${period}`, '\tsta temp4', '\tlda #0', '\tsta temp5'];
  const advance = [
    '\tclc', '\tlda temp4', `\tadc #${period}`, '\tsta temp4', '\tlda temp5', '\tadc #0', '\tsta temp5'];
  if (repeats > 1) {
    const loop = `_dpctile_${id}_loop`;
    const done = `_dpctile_${id}_done`;
    lines.push(`\tlda #${repeats - 1}`, '\tsta temp6', loop,
        ...copyLines(id, labels, parts, period, period), ...advance, '\tdec temp6', `\tbeq ${done}`, `\tjmp ${loop}`, done);
  }
  if (remainder > 0) lines.push(...copyLines(id, labels, parts, period, remainder));
  return lines;
};

// The assembly with the code that fills in the repeats added after every marker; the statements that load the first repeat must
// have been compiled just before it.
export const expandDpcPlusTiles = (asm) => {
  const lines = asm.split('\n');
  const out = [];
  let expanded = 0;
  lines.forEach((line, index) => {
    out.push(line);
    const match = MARKER_LINE.exec(line.replace(/\r$/, ''));
    if (!match) return;
    const [, , id, period, total, parts] = match;
    const labels = {
      p: lastLabel(lines, index, /LDA\s+#<(PF_data\d+)\s*$/i),
      c: lastLabel(lines, index, /LDA\s+#<(playfieldcolorL\w+)\s*$/i),
      b: lastLabel(lines, index, /LDA\s+#<(backgroundcolorL\w+)\s*$/i),
    };
    if (parts.split('').some((part) => !labels[part])) return;
    out.push(...expansionLines(id, labels, parts, Number(period), Number(total)));
    expanded++;
  });
  return {asm: out.join('\n'), expanded};
};
