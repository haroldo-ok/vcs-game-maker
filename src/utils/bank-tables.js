// Places the tables the standard kernel reads (the playfield color scroll tables and the tables of a span of hues for the rainbow blocks) in the bank the kernel runs from.
//
// The kernel reads a table with `lda (pointer),y`, and a read whose index crosses a page takes a cycle more, which the kernel's timing has no room for. So a table has to
// lie in one page, and the color scroll tables also have to start at least `before` bytes into it: their pointer is the address of the table less `before`, and a pointer in the
// page before the table would make every read cross. What a table of the first kind has to do is only to end in the page it starts in.
//
// The assembler places them, from where each one falls, and a rainbow table that fits is put where a scroll table would have left a gap (the bytes up to `before` in front of
// it, or the end of the page when it would not fit there and goes on to the next one) instead of zeros. The flags `rbfill<N>` (SET each pass of the assembler) say which
// rainbow tables are already placed.

// One rainbow table as lines of assembly: its label and its bytes, 16 to a line (a long line is cut by the compiler).
export const rainbowTableAsm = (name, values) => {
  const rows = [];
  for (let i = 0; i < values.length; i += 16) rows.push(` .byte ${values.slice(i, i + 16).map((value) => `$${value.toString(16).toUpperCase().padStart(2, '0')}`).join(', ')}`);
  return [name, ...rows];
};

/**
 * @param {{groups: !Array<!Array<string>>, tableBytes: number, before: number, items: !Array<{name: string, length: number, lines: !Array<string>}>}} plan
 *   groups: the lines of each scroll table (label and bytes), all tableBytes long; before: how far into a page one has to start (0: anywhere);
 *   items: the rainbow tables, each with its length.
 * @return {string} A block of assembly (` asm` ... `end`), or '' when there is nothing to place.
 */
export const placeKernelTables = ({groups, tableBytes, before, items}) => {
  if (!groups.length && !items.length) return '';
  // The longest first: they are the hardest to fit in a gap.
  const rainbow = items.map((item, index) => ({...item, flag: `rbfill${index}`})).sort((a, b) => b.length - a.length);
  const lines = [' asm', ...rainbow.map(({flag}) => `${flag} SET 0`)];
  // A rainbow table put at the current place when it is not placed yet and `room` (an expression) says it fits.
  // (A table with a minimum offset (its pointer is aimed below it) is only put where the current place is at least that far into the page.)
  const fill = (room) => rainbow.flatMap((item) => [` if ${item.flag} == 0`, ` if ${item.length} <= (${room})`, ...(item.minOffset ? [` if (<*) >= ${item.minOffset}`] : []),
    ...item.lines, `${item.flag} SET 1`, ...(item.minOffset ? [' endif'] : []), ' endif', ' endif']);
  groups.forEach((group) => {
    // A table that would cross a page goes to the next one; what is left of this page may hold rainbow tables.
    lines.push(` if (<*) > ${256 - tableBytes}`, ...fill('256-(<*)'), ` if (<*) > ${256 - tableBytes}`, ' align 256', ' endif', ' endif');
    if (before > 0) {
      // A table that starts less than `before` bytes into its page is moved to that place; the bytes up to it may hold rainbow tables too, the rest is zeros.
      lines.push(` if (<*) < ${before}`, ...fill(`${before}-(<*)`), ` if (<*) < ${before}`, ` repeat (${before}-(<*))`, ' .byte 0', ' repend', ' endif', ' endif');
    }
    lines.push(...group);
  });
  // What is left of the rainbow tables goes after, each one in a page.
  rainbow.forEach((item) => {
    lines.push(` if ${item.flag} == 0`, ` if (<*) > ${256 - item.length}`, ' align 256', ' endif',
        ...(item.minOffset ? [` if (<*) < ${item.minOffset}`, ` repeat (${item.minOffset}-(<*))`, ' .byte 0', ' repend', ' endif'] : []), ...item.lines, `${item.flag} SET 1`, ' endif');
  });
  lines.push('end');
  return lines.join('\n') + '\n';
};
