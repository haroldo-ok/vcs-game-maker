import {ref} from '@vue/composition-api';

// Which pattern and instrument are being edited on the Music tab is a
// per-tab view preference, so it's kept out of the project storage that
// gets saved and loaded with a project - same reasoning (and the same
// module-level-ref-survives-remount technique) as hooks/collapse.js's
// useCollapsedIds: Vue Router destroys and recreates the Music tab's
// component on navigation, which would otherwise reset this every time the
// tab is left and revisited.
const ACTIVE_PATTERN_KEY = 'vcs-game-maker.music.activePatternIds';
const ACTIVE_TRACK_KEY = 'vcs-game-maker.music.activeTrackIds';

const loadStored = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    return {};
  }
};

let activePatternIdsRef = null;
let activeTrackIdsRef = null;

/**
 * Persisted, per-song active pattern id and per-pattern active track id for
 * the Music tab.
 * @return {{activePatternIdsRef: Object, activeTrackIdsRef: Object,
 *     setActivePatternId: Function, setActiveTrackId: Function}}
 */
export const useMusicEditorActiveState = () => {
  if (!activePatternIdsRef) activePatternIdsRef = ref(loadStored(ACTIVE_PATTERN_KEY));
  if (!activeTrackIdsRef) activeTrackIdsRef = ref(loadStored(ACTIVE_TRACK_KEY));

  const setActivePatternId = (songId, patternId) => {
    activePatternIdsRef.value = {...activePatternIdsRef.value, [songId]: patternId};
    localStorage.setItem(ACTIVE_PATTERN_KEY, JSON.stringify(activePatternIdsRef.value));
  };
  const setActiveTrackId = (patternId, trackId) => {
    activeTrackIdsRef.value = {...activeTrackIdsRef.value, [patternId]: trackId};
    localStorage.setItem(ACTIVE_TRACK_KEY, JSON.stringify(activeTrackIdsRef.value));
  };

  return {activePatternIdsRef, activeTrackIdsRef, setActivePatternId, setActiveTrackId};
};
