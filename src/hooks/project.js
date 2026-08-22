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
// false (never having been set) - matching every one of these three
// settings' own original default in configurationState.
const useBooleanAppSetting = (key) => {
  const raw = useLocalStorage(key);
  return computed({
    get() {
      return raw.value === 'true';
    },
    set(value) {
      raw.value = value ? 'true' : 'false';
    },
  });
};

export const useBlocklyControlsHorizontalStorage = () =>
  useBooleanAppSetting('vcs-game-maker.blocklyControlsHorizontal');
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
// others above - a real reported correction (it started out living in
// configurationState/Project.vue's own configuration bag, meaning it reset
// to off every time you switched or started a new project, which defeats
// the point of a "always bump the version for me" habit).
export const useProjectAutoIncrementVersionStorage = () =>
  useBooleanAppSetting('vcs-game-maker.projectAutoIncrementVersion');

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
