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

const getSharedRef = (key, readInitial) => {
  if (!refsByKey.has(key)) {
    refsByKey.set(key, ref(readInitial()));
  }
  return refsByKey.get(key);
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
  });
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
