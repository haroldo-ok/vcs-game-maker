'use strict';

import {ref} from '@vue/composition-api';

// Undo and redo for dragging cards (and rows, chips, frames) into a new order, and for edits that
// keep no history in the editor itself (a row's color), shared by every tab that has them. Each
// change is recorded with a way to put the previous state back and a way to redo it; the Undo and
// Redo buttons and shortcuts of the tab being shown try this first (see GraphicEditorToolbar.vue,
// DataEditor.vue, MusicEditor.vue, SoundFXEditor.vue and TextEditor.vue).
//
// A reorder only counts on the tab (route) it was made on, and only while the list still holds
// the order that reorder produced: if cards were added or deleted since, the entry is dropped
// rather than put back an order that no longer fits.
//
// Edits that have an undo of their own are noted with noteEdit(), so a reorder is undone first
// only when it is the most recent thing done on the tab. After one of those edits is undone
// (settleEdits) the reorders made before it are reachable again.

let undoEntries = [];
let redoEntries = [];
let counter = 0;
let lastEdit = 0;
const COALESCE_MS = 700;
const version = ref(0);
const currentRoute = () => window.location.hash.split('?')[0];
const route = ref(currentRoute());
window.addEventListener('hashchange', () => {
  route.value = currentRoute();
});

const changed = () => {
  version.value++;
};

const available = (entries) => entries.some((entry) => entry.route === route.value);

// Whether this tab has a reorder to undo or redo (reactive, for a button's disabled state).
export const canUndoReorder = () => {
  // eslint-disable-next-line no-unused-expressions
  version.value;
  return available(undoEntries);
};

export const canRedoReorder = () => {
  // eslint-disable-next-line no-unused-expressions
  version.value;
  return available(redoEntries);
};

/**
 * Records a reorder that has just been made.
 * @param {{undo: function(), redo: function(), isCurrent: function(): boolean, key: (*|undefined)}} entry undo puts the
 *     previous order back, redo puts the new one back, and isCurrent says whether the list still
 *     holds the order this reorder produced. Entries with the same key, recorded within a
 *     moment of each other, merge into one step.
 */
export const recordReorder = (entry) => {
  const here = currentRoute();
  const now = Date.now();
  // Changes to the same thing that follow each other quickly (painting a run of row colors) are
  // one step: the earlier one keeps its undo and takes the later one's redo.
  const last = undoEntries[undoEntries.length - 1];
  if (entry.key !== undefined && last && last.route === here && last.key === entry.key &&
      now - last.time < COALESCE_MS) {
    last.redo = entry.redo;
    last.isCurrent = entry.isCurrent;
    last.time = now;
    last.stamp = ++counter;
    redoEntries = redoEntries.filter((other) => other.route !== here);
    changed();
    return;
  }
  undoEntries.push({...entry, route: here, stamp: ++counter, time: now});
  if (undoEntries.length > 50) undoEntries.shift();
  redoEntries = redoEntries.filter((other) => other.route !== here);
  changed();
};

// Called when something with an undo of its own is edited: it is now the most recent thing, and
// whatever could have been redone no longer can be.
export const noteEdit = () => {
  lastEdit = ++counter;
  const here = currentRoute();
  if (redoEntries.some((entry) => entry.route === here)) {
    redoEntries = redoEntries.filter((entry) => entry.route !== here);
    changed();
  }
};

// Called after an edit with an undo of its own has been undone.
export const settleEdits = () => {
  lastEdit = 0;
};

const lastFor = (entries, here) => {
  for (let i = entries.length - 1; i >= 0; i--) {
    if (entries[i].route === here) return entries[i];
  }
  return null;
};

/**
 * Undoes the most recent reorder on this tab, if it is the most recent thing done.
 * @return {boolean} Whether it undid one.
 */
export const tryUndoReorder = () => {
  const entry = lastFor(undoEntries, currentRoute());
  if (!entry || entry.stamp < lastEdit) return false;
  undoEntries = undoEntries.filter((other) => other !== entry);
  if (!entry.isCurrent()) {
    changed();
    return false;
  }
  entry.undo();
  redoEntries.push(entry);
  changed();
  return true;
};

/**
 * Redoes the reorder most recently undone on this tab.
 * @return {boolean} Whether it redid one.
 */
export const tryRedoReorder = () => {
  const entry = lastFor(redoEntries, currentRoute());
  if (!entry) return false;
  redoEntries = redoEntries.filter((other) => other !== entry);
  entry.redo();
  undoEntries.push(entry);
  changed();
  return true;
};

/**
 * Whether the list holds exactly these items, in this order.
 * @param {!Array<*>} items
 * @param {!Array<*>} expected
 * @return {boolean}
 */
export const sameItems = (items, expected) =>
  Array.isArray(items) && items.length === expected.length && items.every((item, i) => item === expected[i]);
