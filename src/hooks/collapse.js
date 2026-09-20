import {ref} from '@vue/composition-api';

// Which cards are collapsed is a per-tab view preference, so it is kept out
// of the project storage that gets saved and loaded with a project - same
// reasoning as hooks/zoom.js's useEditorZoom, including keeping the actual
// refs here so a tab remembers its collapsed cards when it is revisited
// (Vue Router destroys and recreates each tab's component on navigation,
// which would otherwise reset any state kept inside the component itself).
const keyOf = (name) => `vcs-game-maker.collapsed.${name}`;

const collapsedRefs = {};

// Which tab names have already had collapseAll actually run once this
// session (a plain in-memory Set, not persisted - resets naturally on a
// real page reload, unlike collapsedRefs' own localStorage-backed state,
// which is exactly the point: collapseAll should only actually reset
// anything the FIRST time a tab is visited after loading the app, not
// every single time its component happens to remount from navigating away
// and back - Vue Router destroys/recreates each tab's component on every
// visit, so without this, a card the user deliberately expanded got
// silently collapsed again the moment they so much as switched tabs and
// switched back, a real reported bug ("should still be open when they
// navigate back to it the same session").
const collapseAllRanForName = new Set();

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
 * @param {boolean=} defaultCollapsed Whether an entry with no stored
 *     preference yet (never toggled before) starts collapsed - false (start
 *     expanded) matches every existing caller's own prior behavior, so this
 *     only needs to be passed where a card should default to closed (e.g.
 *     TextFontEditor.vue's own single card).
 * @return {{isCollapsed: Function, toggleCollapsed: Function}}
 */
export const useCollapsedIds = (name, defaultCollapsed = false) => {
  const stored = collapsedRefFor(name);
  const isCollapsed = (entry) => entry.id in stored.value ? !!stored.value[entry.id] : defaultCollapsed;
  const toggleCollapsed = (entry) => {
    stored.value = {
      ...stored.value,
      [entry.id]: !isCollapsed(entry),
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
  // Discards every remembered per-card override, so every card falls back
  // to defaultCollapsed - unlike the rest of this hook, for a tab whose
  // cards should start collapsed the first time it's visited after loading
  // the app (see every editor tab's own call site in mounted()/setup()),
  // rather than remembering whichever ones a previous visit left expanded.
  // Only actually does anything the FIRST time it's called for this name
  // in the current session (see collapseAllRanForName above) - every
  // subsequent call (the tab's component remounting because the user
  // navigated away and back) is a deliberate no-op, so a card they've
  // since expanded stays exactly as they left it instead of being wiped
  // back to collapsed on every single revisit.
  const collapseAll = () => {
    if (collapseAllRanForName.has(name)) return;
    collapseAllRanForName.add(name);
    stored.value = {};
    localStorage.setItem(keyOf(name), JSON.stringify(stored.value));
  };
  return {isCollapsed, toggleCollapsed, ensureExpanded, collapseAll};
};
