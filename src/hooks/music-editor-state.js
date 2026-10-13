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
const ACTIVE_SONG_KEY = 'vcs-game-maker.music.activeSongId';

const loadStored = (key) => {
  try {
    return JSON.parse(localStorage.getItem(key)) || {};
  } catch (e) {
    return {};
  }
};

let activePatternIdsRef = null;
let activeTrackIdsRef = null;
let activeSongIdRef = null;

/**
 * Persisted, per-song active pattern id, per-pattern active track id, and
 * the single active song id, for the Music tab.
 * @return {{activePatternIdsRef: Object, activeTrackIdsRef: Object,
 *     activeSongIdRef: Object, setActivePatternId: Function,
 *     setActiveTrackId: Function, setActiveSongId: Function}}
 */
export const useMusicEditorActiveState = () => {
  if (!activePatternIdsRef) activePatternIdsRef = ref(loadStored(ACTIVE_PATTERN_KEY));
  if (!activeTrackIdsRef) activeTrackIdsRef = ref(loadStored(ACTIVE_TRACK_KEY));
  // A plain scalar id, not a {[key]: value} map like the two above - there's
  // only ever one active song at a time (unlike a per-song pattern or
  // per-pattern track), so no outer key is needed.
  if (!activeSongIdRef) activeSongIdRef = ref(JSON.parse(localStorage.getItem(ACTIVE_SONG_KEY) || 'null'));

  const setActivePatternId = (songId, patternId) => {
    activePatternIdsRef.value = {...activePatternIdsRef.value, [songId]: patternId};
    localStorage.setItem(ACTIVE_PATTERN_KEY, JSON.stringify(activePatternIdsRef.value));
  };
  const setActiveTrackId = (patternId, trackId) => {
    activeTrackIdsRef.value = {...activeTrackIdsRef.value, [patternId]: trackId};
    localStorage.setItem(ACTIVE_TRACK_KEY, JSON.stringify(activeTrackIdsRef.value));
  };
  const setActiveSongId = (songId) => {
    activeSongIdRef.value = songId;
    localStorage.setItem(ACTIVE_SONG_KEY, JSON.stringify(songId));
  };

  return {activePatternIdsRef, activeTrackIdsRef, activeSongIdRef,
    setActivePatternId, setActiveTrackId, setActiveSongId};
};

// Which song/pattern is currently playing, if any - a plain in-memory
// module-level pair (NOT localStorage-backed, unlike activePatternIdsRef/
// activeTrackIdsRef above), same "survives remount, resets on a real page
// reload" shape as hooks/collapse.js's  collapseAllRanForName. Needed
// for the exact same "Vue Router destroys and recreates this component"
// reason those already document - WITHOUT this, playback itself kept
// going (utils/music-playback.js's  scheduling is independent of this
// component's lifecycle entirely), but leaving the Music tab and coming
// back reset these to null since they used to be plain refs created fresh
// by setup() on every mount, so the "Playing..." button state, the moving
// playhead, and the Sequence list's  chip highlight all silently went
// stale/blank - a real reported bug. Deliberately NOT persisted to
// localStorage - a genuine page reload really does stop all audio, so
// showing "still playing" after one would be actively wrong, unlike a
// same-session tab revisit.
let playingPatternIdRef = null;
let playingSongIdRef = null;

/**
 * Persisted-across-remount (but not across a real reload) refs for which
 * song/pattern is currently playing, for the Music tab.
 * @return {{playingPatternIdRef: Object, playingSongIdRef: Object}}
 */
export const usePlaybackStatusState = () => {
  if (!playingPatternIdRef) playingPatternIdRef = ref(null);
  if (!playingSongIdRef) playingSongIdRef = ref(null);
  return {playingPatternIdRef, playingSongIdRef};
};

// Clears both the in-memory refs (if the Music tab happens to already be
// mounted) and their localStorage backing, so a fresh/loaded project starts
// with no leftover pattern/track selection from whatever project was open
// before. Needed because these are keyed by song/pattern/track ID, and a
// new or freshly-loaded project's  IDs (1, 2, 3, ...) collide with
// whatever the previous project used - without this, the piano roll could
// end up referencing a pattern or track that means something completely
// different (or doesn't exist at all) in the new project, showing stale/
// wrong notes. Called from views/Project.vue's handleNewProject and
// handleLoadProject.
export const resetMusicEditorActiveState = () => {
  if (activePatternIdsRef) activePatternIdsRef.value = {};
  if (activeTrackIdsRef) activeTrackIdsRef.value = {};
  if (activeSongIdRef) activeSongIdRef.value = null;
  localStorage.removeItem(ACTIVE_PATTERN_KEY);
  localStorage.removeItem(ACTIVE_TRACK_KEY);
  localStorage.removeItem(ACTIVE_SONG_KEY);
};
