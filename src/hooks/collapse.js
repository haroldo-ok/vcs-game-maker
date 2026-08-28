import {ref} from '@vue/composition-api';

// Which cards are collapsed is a per-tab view preference, so it is kept out
// of the project storage that gets saved and loaded with a project - same
// reasoning as hooks/zoom.js's useEditorZoom, including keeping the actual
// refs here so a tab remembers its collapsed cards when it is revisited
// (Vue Router destroys and recreates each tab's component on navigation,
// which would otherwise reset any state kept inside the component itself).
const keyOf = (name) => `vcs-game-maker.collapsed.${name}`;

const collapsedRefs = {};

const collapsedRefFor = (name) => {
  if (!collapsedRefs[name]) {
    let initial = {};
    try {
      initial = JSON.parse(localStorage.getItem(keyOf(name))) || {};
    } catch (e) {
      initial = {};
    }
    collapsedRefs[name] = ref(initial);
  }
  return collapsedRefs[name];
};

/**
 * Tracks which entries (by id) are shown collapsed on one editor tab,
 * remembered between visits.
 * @param {string} name Identifies the tab, e.g. "text", "player0".
 * @return {{isCollapsed: Function, toggleCollapsed: Function}}
 */
export const useCollapsedIds = (name) => {
  const stored = collapsedRefFor(name);
  const isCollapsed = (entry) => !!stored.value[entry.id];
  const toggleCollapsed = (entry) => {
    stored.value = {
      ...stored.value,
      [entry.id]: !stored.value[entry.id],
    };
    localStorage.setItem(keyOf(name), JSON.stringify(stored.value));
  };
  // For a freshly created entry - ids are reassigned starting from
  // (current max id) + 1 (see e.g. TextEditor.vue's own handleAddEntry), so
  // deleting the highest-numbered card and adding a new one reuses that same
  // id. Without this, a brand new card silently inherited whatever collapsed
  // state that old, deleted id happened to have in localStorage - a real
  // reported bug ("new text cards should start open").
  const ensureExpanded = (entry) => {
    if (!stored.value[entry.id]) return;
    const next = {...stored.value};
    delete next[entry.id];
    stored.value = next;
    localStorage.setItem(keyOf(name), JSON.stringify(stored.value));
  };
  return {isCollapsed, toggleCollapsed, ensureExpanded};
};
