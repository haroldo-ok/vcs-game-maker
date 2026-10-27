import Vue from 'vue';
import VueCompositionApi, {computed, ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// localStorage itself isn't observable by Vue - reading it inside a computed's
// getter registers no reactive dependency, so nothing ever re-renders when it
// changes from elsewhere (e.g. a different tab/component writing the same
// key, or another handler in the same component reassigning the whole
// object). Every value that survives a write and is only picked up again
// after a full remount (navigating away and back, or a page reload) is this
// bug. The fix is to keep the actual reactive source in a Vue ref, one per
// key, shared by every caller; localStorage becomes a persistence
// side-channel that ref is synced to, not the thing Vue watches.
const refsByKey = new Map();
// The keys that hold JSON (their ref holds the parsed value), for putting stored text back (restoreStorageKeys).
const jsonKeys = new Set();

const getSharedRef = (key, readInitial, json = false) => {
  if (json) jsonKeys.add(key);
  if (!refsByKey.has(key)) {
    refsByKey.set(key, ref(readInitial()));
  }
  return refsByKey.get(key);
};

// The text of these keys as they are now (what is held in memory first, which can be ahead of localStorage for a moment), null for a key
// with nothing in it.
export const snapshotStorageKeys = (keys) => {
  const snapshot = {};
  keys.forEach((key) => {
    const shared = refsByKey.get(key);
    if (shared) {
      const value = shared.value;
      snapshot[key] = value === null || value === undefined ? null : (jsonKeys.has(key) ? JSON.stringify(value) : value);
    } else {
      snapshot[key] = localStorage.getItem(key);
    }
  });
  return snapshot;
};

// Puts the text of a snapshot back, in memory and in localStorage.
export const restoreStorageKeys = (snapshot) => {
  Object.keys(snapshot).forEach((key) => {
    const text = snapshot[key];
    if (text === null) localStorage.removeItem(key);
    else localStorage.setItem(key, text);
    const shared = refsByKey.get(key);
    if (shared) shared.value = text === null ? null : (jsonKeys.has(key) ? JSON.parse(text) : text);
  });
};

export const storageKeysMatch = (snapshot) => {
  const now = snapshotStorageKeys(Object.keys(snapshot));
  return Object.keys(snapshot).every((key) => now[key] === snapshot[key]);
};

export const useLocalStorage = (key) => {
  const state = getSharedRef(key, () => localStorage.getItem(key));
  return computed({
    get() {
      return state.value;
    },
    set(value) {
      localStorage.setItem(key, value);
      state.value = value;
    },
  });
};

export const useJsonLocalStorage = (key) => {
  const state = getSharedRef(key, () => {
    const jsonText = localStorage.getItem(key);
    return jsonText ? JSON.parse(jsonText) : null;
  }, true);
  return computed({
    get() {
      return state.value;
    },
    set(value) {
      localStorage.setItem(key, JSON.stringify(value));
      state.value = value;
    },
  });
};
