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
const copyLines = (id, labels, parts, period, rows, pxe) => {
  const lines = [];
  const call = (label, labelOffset, fetcher) => lines.push(
      `\tlda #<(${label}+${labelOffset})`, '\tsta PARAMETER',
      pxe ? `\tlda #>(${label}+${labelOffset})` :
        `\tlda #((>(${label}+${labelOffset})) & $0f) | (((>(${label}+${labelOffset})) / 2) & $70)`, '\tsta PARAMETER',
      `\tlda #${fetcher}`, '\tsta PARAMETER', `\tlda #${rows}`, '\tsta PARAMETER', '\tlda #1', '\tsta CALLFUNCTION');
  const destination = (symbol, fetcher) => lines.push(
      '\tclc', `\tlda #<${symbol}`, '\tadc temp4', `\tsta DF0LOW+${fetcher}`,
      pxe ? `\tlda #>${symbol}` : `\tlda #(>${symbol}) & $0F`, '\tadc temp5', `\tsta DF0HI+${fetcher}`);
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

// PXE keeps each playfield column in a buffer of 256 rows that a write fills from the column's write offset on (wrapping past the end),
// so the playfield is loaded again with `jsr pfsetupN` at each repeat's offset rather than by the coprocessor's copy, last repeat first
// (the one past the end writes a whole period and wraps onto the top rows, which the first repeat then writes back).
const pxeExpansionLines = (id, labels, parts, period, repeats, remainder, columns) => {
  const allColumns = Array.from({length: columns}, (_, column) => column);
  const lines = [];
  const loop = `_dpctile_${id}_loop`;
  const colorParts = parts.replace('p', '');
  const repeat = (rows) => [
    ...(parts.includes('p') ? [
      ...allColumns.flatMap((column) => ['\tlda temp4', `\tsta PF_WRITE_OFFSET_${column}`]),
      `\tldy #${period}`, `\tlda #<${labels.p}`, `\tldx #>${labels.p}`, `\tjsr ${labels.pfsetup}`] : []),
    ...(colorParts ? copyLines(id, labels, colorParts, period, rows, true) : []),
  ];
  lines.push('\tlda #0', '\tsta temp5');
  if (remainder > 0) lines.push(`\tlda #${(repeats * period) & 255}`, '\tsta temp4', ...repeat(remainder));
  if (repeats > 1) {
    lines.push(`\tlda #${(repeats - 1) * period}`, '\tsta temp4', `\tlda #${repeats - 1}`, '\tsta temp6', loop, ...repeat(period),
        '\tsec', '\tlda temp4', `\tsbc #${period}`, '\tsta temp4', '\tdec temp6', `\tbne ${loop}`);
  }
  if (parts.includes('p')) lines.push('\tlda #0', ...allColumns.map((column) => `\tsta PF_WRITE_OFFSET_${column}`));
  return lines;
};

// The code that fills the playfield up to `total` rows from the `period` rows already loaded.
const expansionLines = (id, labels, parts, period, total, pxe, columns) => {
  const repeats = Math.floor(total / period);
  const remainder = total - repeats * period;
  if (pxe) return pxeExpansionLines(id, labels, parts, period, repeats, remainder, columns);
  const lines = [`\tlda #${period}`, '\tsta temp4', '\tlda #0', '\tsta temp5'];
  const advance = [
    '\tclc', '\tlda temp4', `\tadc #${period}`, '\tsta temp4', '\tlda temp5', '\tadc #0', '\tsta temp5'];
  if (repeats > 1) {
    const loop = `_dpctile_${id}_loop`;
    const done = `_dpctile_${id}_done`;
    lines.push(`\tlda #${repeats - 1}`, '\tsta temp6', loop,
        ...copyLines(id, labels, parts, period, period, pxe), ...advance, '\tdec temp6', `\tbeq ${done}`, `\tjmp ${loop}`, done);
  }
  if (remainder > 0) lines.push(...copyLines(id, labels, parts, period, remainder, pxe));
  return lines;
};

// (On PXE the ROM addresses in the parameters are plain 16 bit ones.)
// The assembly with the code that fills in the repeats added after every marker; the statements that load the first repeat must
// have been compiled just before it.
export const expandDpcPlusTiles = (asm, pxe = false, columns = 4) => {
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
      pfsetup: pxe ? lastLabel(lines, index, /^\s*jsr\s+(pfsetup\d+)\s*$/i) : 'unused',
      c: lastLabel(lines, index, /LDA\s+#<(playfieldcolorL\w+)\s*$/i),
      b: lastLabel(lines, index, /LDA\s+#<(backgroundcolorL\w+)\s*$/i),
    };
    if (parts.split('').some((part) => !labels[part])) return;
    if (pxe && parts.includes('p') && !labels.pfsetup) return;
    out.push(...expansionLines(id, labels, parts, Number(period), Number(total), pxe, columns));
    expanded++;
  });
  return {asm: out.join('\n'), expanded};
};
