'use strict';

import Vue from 'vue';
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

/**
 * Records a change that touches several fields of one or more objects, for undo and redo: every field of the targets is
 * copied before and after `change` runs, and undo and redo put those copies back (a field the object did not have is removed again).
 * Used for what has no history: clearing the row colors, pasting a whole frame, the colors of a title screen graphic.
 * @param {!Array<{owner: !Object, fields: !Array<string>}>} targets The objects and the fields of them that the change may touch.
 * @param {function()} change Makes the change.
 * @param {{key: (Object|undefined), afterChange: (function()|undefined)}=} options key: changes to the same key within a moment of
 *     each other are one step (painting a run of rows); afterChange saves and redraws once a copy has been put back.
 */
export const recordFieldsChange = (targets, change, {key, afterChange} = {}) => {
  const snapshot = () => targets.map(({owner, fields}) => fields.map((field) => (
    field in owner ? {has: true, value: structuredClone(owner[field])} : {has: false})));
  const before = snapshot();
  change();
  const after = snapshot();
  const same = () => JSON.stringify(before) === JSON.stringify(after);
  if (same()) return;
  const restore = (state) => {
    targets.forEach(({owner, fields}, i) => fields.forEach((field, j) => {
      const saved = state[i][j];
      if (saved.has) Vue.set(owner, field, structuredClone(saved.value));
      else Vue.delete(owner, field);
    }));
    if (afterChange) afterChange();
  };
  recordReorder({
    key,
    undo: () => restore(before),
    redo: () => restore(after),
    isCurrent: () => JSON.stringify(snapshot()) === JSON.stringify(after),
  });
};
