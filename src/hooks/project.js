import {computed, ref} from '@vue/composition-api';
import {useJsonLocalStorage, useLocalStorage} from '../hooks/storage';
import {markRomOutdated} from '../hooks/rom-status';

const keyOf = (type) =>`vcs-game-maker.${type}`;

// The graphics, score font and options are compiled into the ROM, but unlike
// the action blocks nothing regenerates the code when they change. Flag the ROM
// stale whenever one is written so the "Update ROM" button reflects the edit.
const withRomInvalidation = (storage) => computed({
  get() {
    return storage.value;
  },
  set(value) {
    storage.value = value;
    markRomOutdated();
  },
});

export const useProjectStorage = (type) => useLocalStorage(keyOf(type));
export const useJsonProjectStorage = (type) => useJsonLocalStorage(keyOf(type));

export const useWorkspaceStorage = () => useProjectStorage('workspace');
export const useBackgroundsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('backgrounds'));
export const usePlayer0Storage = () =>
  withRomInvalidation(useJsonProjectStorage('player0'));
export const usePlayer1Storage = () =>
  withRomInvalidation(useJsonProjectStorage('player1'));
// A pure editor convenience (see components/QuickColorPalette.vue) - a
// curated shortlist of color bytes for fast reuse while picking row
// colors, shared across every tab that shows a Quick colors bar (Player 0,
// Player 1, Backgrounds), never itself read by code generation, so unlike
// every storage above it deliberately isn't wrapped in withRomInvalidation:
// adding/removing a swatch here shouldn't mark the ROM stale. Storage key
// ("spriteColorPalette") predates this becoming a shared, cross-tab
// feature - kept as-is rather than renamed, so an existing project's
// already-saved quick colors aren't silently dropped.
export const useColorPaletteStorage = () => useJsonProjectStorage('spriteColorPalette');
export const useConfigurationStorage = () =>
  withRomInvalidation(useJsonProjectStorage('configuration'));
export const useScoreFontStorage = () =>
  withRomInvalidation(useJsonProjectStorage('scoreFont'));
export const useSquishCustomScoreFontStorage = () =>
  withRomInvalidation(useJsonProjectStorage('squishCustomScoreFont'));
export const useSoundEffectsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('soundEffects'));
export const useDataTablesStorage = () =>
  withRomInvalidation(useJsonProjectStorage('dataTables'));
export const useTextStringsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('textStrings'));
export const useSongsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('songs'));

// Everything that makes up a project. Kept in one place so starting fresh and
// clearing on launch can't drift apart as new pieces are added.
export const PROJECT_STORAGE_TYPES = [
  'workspace', 'backgrounds', 'player0', 'player1', 'configuration', 'scoreFont', 'soundEffects',
  'dataTables', 'textStrings', 'songs',
];

/**
 * Discards the stored project, leaving the empty/default one behind.
 */
export const clearProjectStorage = () => {
  PROJECT_STORAGE_TYPES.forEach((type) => localStorage.removeItem(keyOf(type)));
};

const errorRef = ref('');
export const useErrorStorage = () => computed({
  get() {
    return errorRef.value;
  },
  set(value) {
    errorRef.value = value;
  },
});

// Live progress feed for the ROM build pipeline (see hooks/rom.js's
// buildRom()) - a separate store from errorRef above so a build's own
// step-by-step narration (which stage is running, which bank got relocated
// and why) doesn't clobber - or get clobbered by - the single persistent
// error banner errorRef holds for the build's own final failure (still shown
// in red; see App.vue). Kept as a plain array of {text, level} entries so
// each line can be colored independently ('error' red, anything else black).
const compileLogRef = ref([]);
export const useCompileLog = () => computed({
  get() {
    return compileLogRef.value;
  },
  set(value) {
    compileLogRef.value = value;
  },
});

export const clearCompileLog = () => {
  compileLogRef.value = [];
};

export const appendCompileLog = (text, level = 'info') => {
  compileLogRef.value = [...compileLogRef.value, {text, level}];
};

// Whether to restore the last saved project on startup, or always start from
// the empty/default one instead - a standing app preference, not part of the
// project itself (see PROJECT_STORAGE_TYPES above), so it has to survive
// clearProjectStorage() and be readable before deciding whether to call it.
// Stored as the raw string "false" (useLocalStorage doesn't JSON-encode) -
// anything else, including never having been set, means "load" (the default).
const LOAD_LAST_PROJECT_KEY = 'vcs-game-maker.loadLastProject';
export const useLoadLastProjectStorage = () => {
  const raw = useLocalStorage(LOAD_LAST_PROJECT_KEY);
  return computed({
    get() {
      return raw.value !== 'false';
    },
    set(value) {
      raw.value = value ? 'true' : 'false';
    },
  });
};

// Same "standing app preference, not part of the project itself" reasoning
// as useLoadLastProjectStorage above - these three used to live in
// configurationState (see Configuration.vue), which round-trips with
// project storage and is wiped by clearProjectStorage(), meaning switching
// projects (or starting a new one) silently reset how you like the editor
// UI to behave, not just the game itself. Stored as the raw string
// "true"/"false" (useLocalStorage doesn't JSON-encode), defaulting to
// defaultValue (false unless a caller says otherwise) when never having
// been set - false matches every one of the original three settings' own
// default in configurationState; usePixelGridLabelsStorage below is the one
// exception, defaulting to true instead (see its own comment on why).
const useBooleanAppSetting = (key, defaultValue = false) => {
  const raw = useLocalStorage(key);
  return computed({
    get() {
      return raw.value == null ? defaultValue : raw.value === 'true';
    },
    set(value) {
      raw.value = value ? 'true' : 'false';
    },
  });
};

// Same "standing app preference, not a project setting" reasoning as the
// others here - App.vue's own left nav-drawer is removed from the DOM
// entirely (not just closed) whenever this is on, reclaiming its layout
// space instead of leaving an empty 200px gap.
export const useHideSidebarStorage = () =>
  useBooleanAppSetting('vcs-game-maker.hideSidebar');
export const useBlocklyControlsHorizontalStorage = () =>
  useBooleanAppSetting('vcs-game-maker.blocklyControlsHorizontal');
// Same "standing app preference" reasoning as the others here - applies a
// CSS filter across every block (workspace canvas AND the toolbox/flyout,
// see BlocklyComponent.vue's own .blocklyDiv binding) rather than touching
// any block's own colour value, so it works uniformly regardless of which
// theme/category colours are actually in play.
export const useDesaturateBlocklyColorsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.desaturateBlocklyColors');
export const useHideDescriptionTextStorage = () =>
  useBooleanAppSetting('vcs-game-maker.hideDescriptionText');
export const useMuteBlocklySoundsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.muteBlocklySounds');
// Same "standing app preference, not a project setting" reasoning as the
// three above - the grid-snap toggle (see ActionEditor.vue's own
// setupGridSnapZoomButton/toggleGridSnap) used to be page-local-only data,
// reset every time the Actions tab was left and revisited. A real reported
// request ("remember the grid snap setting on the blockly screen when
// navigating away").
export const useGridSnapStorage = () =>
  useBooleanAppSetting('vcs-game-maker.gridSnap');
// Same "standing app preference, not a project setting" reasoning as the
// others above - lets a player switch the Sound tab's own card list between
// a multi-column grid (the default) and a single full-width column, same
// choice SoundFXEditor.vue's own .soundfx-list layout has gone back and
// forth on for itself in the past.
export const useSoundFxColumnsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.soundFxColumns', true);
// Same "standing app preference" reasoning as useSoundFxColumnsStorage
// above, for the Text tab's own card list (TextEditor.vue's .text-list).
export const useTextColumnsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.textColumns', true);
// Same "standing app preference, not a project setting" reasoning as the
// others above - a real reported correction (it started out living in
// configurationState/Project.vue's own configuration bag, meaning it reset
// to off every time you switched or started a new project, which defeats
// the point of a "always bump the version for me" habit).
export const useProjectAutoIncrementVersionStorage = () =>
  useBooleanAppSetting('vcs-game-maker.projectAutoIncrementVersion');

// Same "standing app preference, not a project setting" reasoning as the
// others above - the desktop (Electron) build's own "Test in Stella" button
// (App.vue) needs to know where the user installed Stella locally, a plain
// path string rather than a boolean, so this goes through useLocalStorage
// directly (raw string, like useLoadLastProjectStorage's own "false"
// convention) rather than useBooleanAppSetting. Meaningless in the browser
// build (no filesystem access to launch anything with it), but harmless to
// keep around there too - Configuration.vue's own Stella field is only
// shown/enabled when window.electronAPI exists in the first place.
export const useStellaPathStorage = () => useLocalStorage('vcs-game-maker.stellaPath');

// Same "standing app preference, not a project setting" reasoning as the
// others above - a real reported correction. Unlike those, DIM also gets
// read by the real bBasic generators (generators/bbasic/music.js,
// soundfx.js, sound.js) and baked into the compiled ROM's own audio
// behavior - moving it here means a saved .vcsgm project no longer carries
// its own DIM setting; opening it elsewhere (or after changing this
// yourself) compiles using whoever's local app-wide preference is current,
// not whatever the project was originally authored/tested with. Confirmed
// as the intended tradeoff (asked directly) rather than an oversight.
export const useDimSoundFxStorage = () =>
  useBooleanAppSetting('vcs-game-maker.dimSoundFx');

// Percent (0-100), not boolean - same raw-string localStorage mechanism as
// useBooleanAppSetting above, parsed as a number instead. defaultValue is
// passed in by each caller (DEFAULT_DIM_PERCENT lives in generators/bbasic/
// soundfx.js, which this hooks file doesn't otherwise depend on) rather than
// duplicated here.
export const useDimSoundFxPercentStorage = (defaultValue) => {
  const raw = useLocalStorage('vcs-game-maker.dimSoundFxPercent');
  return computed({
    get() {
      const parsed = parseFloat(raw.value);
      return Number.isFinite(parsed) ? parsed : defaultValue;
    },
    set(value) {
      raw.value = String(value);
    },
  });
};

// A standing app preference, not a project setting or per-tab local state -
// shared by PlayerEditor.vue and BackgroundEditor.vue's own PixelEditor.vue
// instances, so toggling it on either tab shows/hides the grid overlay
// everywhere, and it survives navigating away and back (Vue Router destroys
// and recreates each tab's own component on navigation - see
// hooks/collapse.js's own comment on the same lifecycle).
export const usePixelGridOverlayStorage = () =>
  useBooleanAppSetting('vcs-game-maker.pixelGridOverlay');

// Same standing-app-preference reasoning as usePixelGridOverlayStorage
// above, for the "X,Y" coordinate labels PixelEditor.vue's own grid overlay
// can additionally draw in each cell (see its own showCellIds prop) -
// currently only ever wired up on the Background tab (BackgroundEditor.vue,
// where reading off an exact X/Y matters for wiring up "Background: pixel
// at X/Y"-style blocks); PlayerEditor.vue never passes showCellIds at all,
// so this has no effect there regardless of its own stored value. Defaults
// to true (unlike every other useBooleanAppSetting caller) - showCellIds
// was hardcoded on before this toggle existed, so a default of false here
// would silently turn labels off for every existing user on their very
// first visit after this shipped, not just newly leave them off until
// explicitly turned on.
export const usePixelGridLabelsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.pixelGridLabels', true);

// Which Music-tab instrument rows are muted/soloed - a view preference (see
// MusicEditor.vue's own mutedTrackIds/soloedTrackIds refs, which load these
// once at setup() time) that survives navigating away and back, same
// shape as every other localStorage-backed preference above. Plain
// load-once functions (not a reactive useLocalStorage wrapper) since
// MusicEditor.vue already wraps its OWN ref around these and re-persists on
// every toggle itself - and generators/bbasic/music.js (the OTHER
// consumer, see isMusicTrackMuted below) only ever needs a one-shot read at
// compile time, never reactivity. Exported (rather than kept local to
// MusicEditor.vue, which is where this lived before) specifically so the
// ROM generator can honor the exact same mute/solo state the Music tab's
// own preview already does, instead of silently baking in every track
// regardless of what's muted/soloed on screen.
export const MUTED_MUSIC_TRACKS_KEY = 'vcs-game-maker.muted.music-tracks';
export const loadMutedMusicTrackIds = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(MUTED_MUSIC_TRACKS_KEY));
    return (stored && typeof stored === 'object') ? stored : {};
  } catch (e) {
    return {};
  }
};

export const SOLOED_MUSIC_TRACKS_KEY = 'vcs-game-maker.soloed.music-tracks';
export const loadSoloedMusicTrackIds = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(SOLOED_MUSIC_TRACKS_KEY));
    return (stored && typeof stored === 'object') ? stored : {};
  } catch (e) {
    return {};
  }
};

// A track's REAL, effective muted state - single source of truth shared by
// MusicEditor.vue's own preview (isTrackMuted) and the ROM generator (see
// flattenPatternEvents in generators/bbasic/music.js), so both agree on
// exactly the same answer for the same project state. As soon as ANY track
// in the pattern is soloed, every OTHER track is effectively muted
// regardless of its own individual mute flag, and the soloed one(s) play
// regardless of their own mute flag too (soloing a muted track still plays
// it - same convention most DAWs use, "solo" overrides "mute" rather than
// the two fighting). With nothing soloed, this just falls through to the
// track's own explicit mute flag.
export const isMusicTrackMuted = (mutedTrackIds, soloedTrackIds, song, pattern, track) => {
  const trackKey = (t) => `${song.id}:${t.id}`;
  const patternHasSoloedTrack = (pattern.tracks || []).some((t) => !!soloedTrackIds[trackKey(t)]);
  if (patternHasSoloedTrack) return !soloedTrackIds[trackKey(track)];
  return !!mutedTrackIds[trackKey(track)];
};
