import {computed} from '@vue/composition-api';
import {useLocalStorage} from './storage';

// How many steps back undo remembers, app-wide: every history in the app (the pixel editors, the tables, sounds and patterns, the order
// of the cards, the Actions tab's blocks) keeps at most this many. Undoing a step takes one off the count of steps that can still be
// undone and adds one to the count that can be redone; redoing does the opposite. A standing app preference (see the Options tab's VCSGM
// options), not part of the project.
export const DEFAULT_UNDO_LIMIT = 99;
export const MIN_UNDO_LIMIT = 1;
export const MAX_UNDO_LIMIT = 999;

const UNDO_LIMIT_KEY = 'vcs-game-maker.undoLimit';

const clampLimit = (value) => {
  const number = Math.round(Number(value));
  if (!Number.isFinite(number)) return DEFAULT_UNDO_LIMIT;
  return Math.min(MAX_UNDO_LIMIT, Math.max(MIN_UNDO_LIMIT, number));
};

export const useUndoLimitStorage = () => {
  const raw = useLocalStorage(UNDO_LIMIT_KEY);
  return computed({
    get() {
      return raw.value === null || raw.value === undefined || raw.value === '' ? DEFAULT_UNDO_LIMIT : clampLimit(raw.value);
    },
    set(value) {
      raw.value = String(clampLimit(value));
    },
  });
};

let limit = null;
// The number of steps back to remember right now (reactive: reading it in a computed or a watcher follows the setting).
export const getUndoLimit = () => {
  if (!limit) limit = useUndoLimitStorage();
  return limit.value;
};

// Drops the oldest entries of a history (an array, oldest first) that has more than the limit. Returns the same array.
export const trimHistory = (history) => {
  const excess = history.length - getUndoLimit();
  if (excess > 0) history.splice(0, excess);
  return history;
};

// The history of a pixel editor (the one of the pixel editor package): it holds the number of steps back the app remembers, however
// many the package would keep by itself. Its undo list is cut to the limit whenever a step is added to it, by a stroke or by a redo.
export const limitPixelHistory = (history) => {
  if (!history || history.limitedByApp) return history;
  history.limitedByApp = true;
  history.maxLength = Number.MAX_SAFE_INTEGER;
  ['push', 'next'].forEach((name) => {
    const original = history[name].bind(history);
    history[name] = (...args) => {
      const result = original(...args);
      history.undoStack = newestSteps(history.undoStack);
      return result;
    };
  });
  return history;
};

// The same for a copy: the newest entries of a list, at most the limit.
export const newestSteps = (history) => history.slice(-getUndoLimit());
