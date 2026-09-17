'use strict';

// The Text Minikernel's own static-region byte layout - shared between
// generators/bbasic/text-minikernel.js (which reads/writes this region
// directly) and generators/bbasic/text-scroll.js (whose own scroll append
// region starts right after it - see staticMessageRegionEnd below). Split
// into its own file rather than living in text-minikernel.js itself (which
// already imports FROM text-scroll.js for the scroll-related helpers its
// own "Show text" generators call) specifically to avoid a circular import
// between the two - text-scroll.js needs this same layout too, and a
// module cycle is easy to get wrong across a bundler even when (as here)
// every use is safely deferred to inside a function body.
import {TEXT_MESSAGE_LENGTH, listTextStrings, resolveTextMaxDisplayWidth} from '../../blocks/text-strings';

// Splits a "Wrap to line 2" message's text into its own separate rows - one
// row per explicit line break (the Text tab's own multi-line field), each
// used verbatim (no further auto-wrap within it - encodeTextMessage's own
// truncation still caps any one line at maxWidth, same as a plain message).
// Only when the text has NO explicit break at all does this fall back to
// ordinary word-wrap (breaking at the last space that still fits, or hard
// at maxWidth if there's no space to break on) - repeated until the whole
// remainder fits, so a message needing 3+ lines (revealed via "Scroll text
// lines up/down", not just "Wrap to line 2"'s own 2-line display) gets a
// real row per wrapped line instead of everything past the first break
// getting dumped, unwrapped, into one oversized final line - a real
// reported gap ("auto line-break works without scrolling, not with it").
// Exported (not local to text-minikernel.js) so getStaticMessageLayout below
// can size each entry by its own real line count, not just "1 or 2".
export const splitMessageLines = (text, maxWidth) => {
  const raw = String(text || '');
  if (raw.includes('\n')) return raw.split('\n').map((line) => line.toUpperCase());
  let remaining = raw.toUpperCase();
  const lines = [];
  while (remaining.length > maxWidth) {
    const window = remaining.slice(0, maxWidth + 1);
    const lastSpace = window.lastIndexOf(' ');
    if (lastSpace <= 0) {
      lines.push(remaining.slice(0, maxWidth));
      remaining = remaining.slice(maxWidth).trimStart();
    } else {
      lines.push(remaining.slice(0, lastSpace));
      remaining = remaining.slice(lastSpace + 1);
    }
  }
  lines.push(remaining);
  return lines;
};

// Every Text tab entry's own byte offset, row count, and "Wrap to line 2"
// flag within the STATIC region of the "data text_strings" table (see
// generateTextMinikernel in text-minikernel.js) - position 0 is the reserved
// blank guard row, always exactly TEXT_MESSAGE_LENGTH bytes. Row count comes
// from splitMessageLines UNCONDITIONALLY now, regardless of "Wrap to line
// 2" - a message longer than maxWidth always gets split into real, separate
// rows (an explicit line break always splits, and even a plain overlong
// message word-wraps into a second row) rather than silently truncating
// its overflow the moment "Wrap to line 2" happens to be off. That toggle's
// own remaining, narrower job (see namedMessageWrapToLine2's own comment in
// text-minikernel.js) is only "does row 2 draw automatically, alongside row
// 1, with no scrolling needed" - "Scroll text lines up/down" can reveal a
// message's 2nd+ rows one at a time either way, moving TextIndex a whole row
// at a time (only the FIRST row is ever on screen for a non-wrapping entry,
// same as text12b.asm's own "textkernel2ndrow" block only ever draws row 2
// from TextIndex+TEXT_MESSAGE_LENGTH when told to).
export const getStaticMessageLayout = () => {
  const entries = listTextStrings();
  const maxWidth = resolveTextMaxDisplayWidth();
  const layout = [{offset: 0, lineCount: 1, wrapToLine2: false}];
  let offset = TEXT_MESSAGE_LENGTH;
  entries.forEach(({text, wrapToLine2}) => {
    const lineCount = Math.max(1, splitMessageLines(text, maxWidth).length);
    layout.push({offset, lineCount, wrapToLine2: !!wrapToLine2});
    offset += lineCount * TEXT_MESSAGE_LENGTH;
  });
  return layout;
};

// The first byte offset PAST the static region - where free-typed messages
// (registerFreeTypedMessage in text-minikernel.js) and the scroll append
// region (getNamedScrollLayout in text-scroll.js) both start.
export const staticMessageRegionEnd = () => {
  const layout = getStaticMessageLayout();
  const last = layout[layout.length - 1];
  return last.offset + last.lineCount * TEXT_MESSAGE_LENGTH;
};
