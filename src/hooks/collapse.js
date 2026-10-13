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
// session - sessionStorage-backed (survives a real page reload, e.g.
// clicking "Refresh emulator", but resets on an actual new tab/browser
// session), which is exactly the point: collapseAll should only actually
// reset anything the FIRST time a tab is visited after loading the app, not
// every single time its component happens to remount from navigating away
// and back - Vue Router destroys/recreates each tab's component on every
// visit, so without this, a card the user deliberately expanded got
// silently collapsed again the moment they so much as switched tabs and
// switched back, a real reported bug ("should still be open when they
// navigate back to it the same session"). Originally a plain in-memory Set,
// which had the same problem across a real page reload - a reload reruns
// every tab's setup()/mounted() as a "first visit" all over again, silently
// re-collapsing every card on the page the user had open right before,
// confirmed as a real reported bug ("refreshing the emulator removes all
// title card graphics" - the data was never actually gone, every card was
// just showing collapsed again).
const COLLAPSE_ALL_RAN_KEY = 'vcs-game-maker.collapseAllRan';

const collapseAllRanForName = (() => {
  try {
    return new Set(JSON.parse(sessionStorage.getItem(COLLAPSE_ALL_RAN_KEY)) || []);
  } catch (e) {
    return new Set();
  }
})();

const persistCollapseAllRanForName = () => {
  try {
    sessionStorage.setItem(COLLAPSE_ALL_RAN_KEY, JSON.stringify([...collapseAllRanForName]));
  } catch (e) {
    // Losing this across a reload just brings back the old re-collapsing
    // behavior for this session - not worth failing anything over.
  }
};

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
 *     expanded) matches every existing caller's  prior behavior, so this
 *     only needs to be passed where a card should default to closed (e.g.
 *     TextFontEditor.vue's  single card).
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
  // (current max id) + 1 (see e.g. TextEditor.vue's  handleAddEntry), so
  // deleting the highest-numbered card and adding a new one reuses that same
  // id. Without this, a brand new card silently inherited whatever collapsed
  // state that old, deleted id happened to have in localStorage - a real
  // reported bug ("new text cards should start open").
  // Checks isCollapsed(entry), not stored.value[entry.id] directly - a real
  // reported bug for every defaultCollapsed=true caller (e.g. MusicEditor.vue's
  // "don't collapse the pattern editor" when adding a new pattern/song): a
  // brand new entry's id has never been written to stored.value at all, so
  // the old "stored.value[entry.id] is falsy, nothing to do" check bailed
  // out immediately - correct for a defaultCollapsed=false tab (not being in
  // the map already means expanded), but exactly backwards here, since not
  // being in the map means isCollapsed falls back to defaultCollapsed (true),
  // so there was nothing actually ensuring it open. isCollapsed(entry)
  // correctly accounts for that fallback either way, and only writes an
  // explicit "false" override when the entry would otherwise show collapsed.
  const ensureExpanded = (entry) => {
    if (!isCollapsed(entry)) return;
    const next = {...stored.value, [entry.id]: false};
    stored.value = next;
    localStorage.setItem(keyOf(name), JSON.stringify(stored.value));
  };
  // Explicitly writes a given collapsed/expanded state for an entry,
  // regardless of what it currently is - unlike ensureExpanded above, which
  // only ever forces a specific direction (open). Needed for a new/
  // duplicated entry that should start out MATCHING whatever state an
  // existing entry currently has, not unconditionally expanded - a real
  // reported case (MusicEditor.vue's new/duplicated song: "the sequencer
  // section shouldn't open, just leave sequencer and pattern editor in
  // whatever their current state is") where forcing them open with
  // ensureExpanded was one directional assumption too many.
  const setCollapsed = (entry, value) => {
    stored.value = {...stored.value, [entry.id]: !!value};
    localStorage.setItem(keyOf(name), JSON.stringify(stored.value));
  };
  // Discards every remembered per-card override, so every card falls back
  // to defaultCollapsed - unlike the rest of this hook, for a tab whose
  // cards should start collapsed the first time it's visited after loading
  // the app (see every editor tab's  call site in mounted()/setup()),
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
    persistCollapseAllRanForName();
    stored.value = {};
    localStorage.setItem(keyOf(name), JSON.stringify(stored.value));
  };
  return {isCollapsed, toggleCollapsed, ensureExpanded, setCollapsed, collapseAll};
};
