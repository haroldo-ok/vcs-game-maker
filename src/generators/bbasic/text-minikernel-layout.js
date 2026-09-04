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
// at maxWidth if there's no space to break on), producing at most 2 lines -
// matching a plain, non-wrapping message's own single-row behavior for
// anything that already fits on one line. Exported (not local to
// text-minikernel.js) so getStaticMessageLayout below can size each entry
// by its own real line count, not just "1 or 2".
export const splitMessageLines = (text, maxWidth) => {
  const raw = String(text || '');
  if (raw.includes('\n')) return raw.split('\n').map((line) => line.toUpperCase());
  const upper = raw.toUpperCase();
  if (upper.length <= maxWidth) return [upper];
  const window = upper.slice(0, maxWidth + 1);
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace <= 0) return [upper.slice(0, maxWidth), upper.slice(maxWidth).trimStart()];
  return [upper.slice(0, lastSpace), upper.slice(lastSpace + 1)];
};

// Every Text tab entry's own byte offset (and row count - always 1 for a
// non-wrapping entry; for a "Wrap to line 2" entry, however many lines its
// own text actually splits into via splitMessageLines above) within the
// STATIC region of the "data text_strings" table (see generateTextMinikernel
// in text-minikernel.js) - position 0 is the reserved blank guard row,
// always exactly TEXT_MESSAGE_LENGTH bytes. Only the first two of a
// wrapping entry's own rows are ever drawn at once (see text12b.asm's own
// "textkernel2ndrow" block, which always reads row 2 from TextIndex+
// TEXT_MESSAGE_LENGTH, with no separate pointer of its own) - "Scroll text
// lines up/down" (see generators/bbasic/text-minikernel.js) moves TextIndex
// by a whole row at a time to bring the rest into view.
export const getStaticMessageLayout = () => {
  const entries = listTextStrings();
  const maxWidth = resolveTextMaxDisplayWidth();
  const layout = [{offset: 0, lineCount: 1}];
  let offset = TEXT_MESSAGE_LENGTH;
  entries.forEach(({text, wrapToLine2}) => {
    const lineCount = wrapToLine2 ? Math.max(1, splitMessageLines(text, maxWidth).length) : 1;
    layout.push({offset, lineCount});
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
