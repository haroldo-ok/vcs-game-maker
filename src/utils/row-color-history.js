'use strict';

import {recordReorder} from '../hooks/reorder-history';

// Undo and redo for the colors of a graphic's rows (a background, a sprite frame, a title screen
// card's frame) changed from the color strip, Clear or Paste. Picking colors for a run of rows
// within a moment of each other is one step.

const sameColors = (a, b) => {
  if (!Array.isArray(a) || !Array.isArray(b)) return a === b;
  return a.length === b.length && a.every((color, index) => color === b[index]);
};

const copy = (colors) => (Array.isArray(colors) ? colors.slice() : colors);

/**
 * Sets the row colors of `owner` through `apply` and records the change for undo.
 * @param {!Object} owner The object holding `rowColors`.
 * @param {function(!Object, *)} apply Sets `owner`'s row colors, saves and redraws them.
 * @param {*} colors The new row colors.
 */
export const recordRowColorsChange = (owner, apply, colors) => {
  const before = copy(owner.rowColors);
  const after = copy(colors);
  apply(owner, colors);
  if (sameColors(before, after)) return;
  recordReorder({
    key: owner,
    undo: () => apply(owner, copy(before)),
    redo: () => apply(owner, copy(after)),
    isCurrent: () => sameColors(owner.rowColors, after),
  });
};
