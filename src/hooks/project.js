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
// One shared pool of animations, usable by either hardware player (Player 0
// or Player 1) - replaces the old, separate 'player0'/'player1' storage keys
// (each with its  independent animation list). See
// hooks/migrate-player-animations.js for the one-time migration that
// combines an existing project's  separate player0/player1 animations
// into this pool the first time it's read.
export const usePlayerAnimationsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('playerAnimations'));
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
// The drawn digits of every font other than Custom and Squish Custom, which are stored
// separately above: {fonts: {<font key>: {digits}}} - see scoreFontEditKey in utils/score-font.js.
// A font with no entry shows its original digits.
export const useScoreFontEditsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('scoreFontEdits'));
export const useSoundEffectsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('soundEffects'));
export const useDataTablesStorage = () =>
  withRomInvalidation(useJsonProjectStorage('dataTables'));
export const useTextStringsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('textStrings'));
export const useTextFontStorage = () =>
  withRomInvalidation(useJsonProjectStorage('textFont'));
export const useSongsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('songs'));
export const useTitleScreenStorage = () =>
  withRomInvalidation(useJsonProjectStorage('titleScreen'));

// Everything that makes up a project. Kept in one place so starting fresh and
// clearing on launch can't drift apart as new pieces are added.
// 'player0'/'player1' are kept here (even though nothing writes them anymore)
// so a fresh project also clears any legacy pre-migration remnants left over
// from an older saved project - see hooks/migrate-player-animations.js.
export const PROJECT_STORAGE_TYPES = [
  'workspace', 'backgrounds', 'player0', 'player1', 'playerAnimations', 'configuration',
  'scoreFont', 'scoreFontEdits', 'soundEffects', 'dataTables', 'textStrings', 'songs', 'titleScreen', 'spriteColorPalette',
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

// A small, separate piece of state from errorRef above, specifically for
// showError's optional highlightHtml (see utils/build-error.js) - errorRef
// itself renders through a plain <pre v-text> in App.vue (safe by default,
// since most error text flowing through it is a raw DASM error, a project's
// bBasic source, or other content this app doesn't fully control), so it
// can never render inline HTML like <b> - only THIS ref, rendered through
// a dedicated v-html element, can. Cleared automatically by every
// showError call that doesn't pass a highlight, so a stale bold line from
// an earlier, unrelated error never lingers above a later one.
const errorHighlightRef = ref('');
export const useErrorBannerHighlight = () => computed({
  get() {
    return errorHighlightRef.value;
  },
  set(value) {
    errorHighlightRef.value = value;
  },
});

// Live progress feed for the ROM build pipeline (see hooks/rom.js's
// buildRom()) - a separate store from errorRef above so a build's
// step-by-step narration (which stage is running, which bank got relocated
// and why) doesn't clobber - or get clobbered by - the single persistent
// error banner errorRef holds for the build's  final failure (still shown
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

// html: opt-in only, and only ever for a caller building the string itself
// out of known-safe pieces (e.g. plain numbers) - never for text that could
// carry along unescaped project/user data (a DASM error, a bBasic source
// snippet, a user-chosen subroutine/variable name), which
// stays through the safe, escaped default path every other call already
// uses (see App.vue's v-text vs v-html split on this same entry).
export const appendCompileLog = (text, level = 'info', html = false) => {
  compileLogRef.value = [...compileLogRef.value, {text, level, html}];
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

// App.vue's "Refresh emulator" button (a manual recovery fallback for a
// stuck/crashed emulator instance - see its comment) reloads the whole
// page, which main.js treats exactly like a genuine fresh app launch -
// including respecting "load last project" above when it's off, wiping the
// very project the user was just working on as a side effect of a button
// whose only real job is fixing the emulator preview, confirmed directly as
// a real reported bug ("clicking refresh emulator unloads the current
// project"). sessionStorage (not localStorage) - this only ever needs to
// survive the ONE reload it's set right before, then main.js clears it
// immediately after reading it, so a genuinely new browser session later
// still respects the user's real preference normally.
const SKIP_LOAD_LAST_PROJECT_CHECK_KEY = 'vcs-game-maker.skipLoadLastProjectCheckOnce';
export const markSkipLoadLastProjectCheckOnce = () => {
  try {
    sessionStorage.setItem(SKIP_LOAD_LAST_PROJECT_CHECK_KEY, 'true');
  } catch (e) {
    // A reload not honoring this is no worse than before this existed -
    // not worth failing the refresh itself over.
  }
};

// Called once, at app startup (see main.js) - consumes (clears) the flag
// the same read, so only the ONE reload it was set for is ever affected.
export const consumeSkipLoadLastProjectCheckOnce = () => {
  try {
    const shouldSkip = sessionStorage.getItem(SKIP_LOAD_LAST_PROJECT_CHECK_KEY) === 'true';
    sessionStorage.removeItem(SKIP_LOAD_LAST_PROJECT_CHECK_KEY);
    return shouldSkip;
  } catch (e) {
    return false;
  }
};

// Same "standing app preference, not part of the project itself" reasoning
// as useLoadLastProjectStorage above - these three used to live in
// configurationState (see Configuration.vue), which round-trips with
// project storage and is wiped by clearProjectStorage(), meaning switching
// projects (or starting a new one) silently reset how you like the editor
// UI to behave, not just the game itself. Stored as the raw string
// "true"/"false" (useLocalStorage doesn't JSON-encode), defaulting to
// defaultValue (false unless a caller says otherwise) when never having
// been set - false matches every one of the original three settings'
// default in configurationState; usePixelGridLabelsStorage below is the one
// exception, defaulting to true instead (see its  comment on why).
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
// others here - App.vue's  left nav-drawer is removed from the DOM
// entirely (not just closed) whenever this is on, reclaiming its layout
// space instead of leaving an empty 200px gap.
export const useHideSidebarStorage = () =>
  useBooleanAppSetting('vcs-game-maker.hideSidebar');
// Same "standing app preference" reasoning as the others here - applies a
// CSS filter across every block (workspace canvas AND the toolbox/flyout,
// see BlocklyComponent.vue's .blocklyDiv binding) rather than touching
// any block's  colour value, so it works uniformly regardless of which
// theme/category colours are actually in play.
export const useDesaturateBlocklyColorsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.desaturateBlocklyColors');
// App.vue's .dark-mode class and Vuetify's dark theme - see App.vue's comment on
// .dark-mode.
export const useDarkModeStorage = () =>
  useBooleanAppSetting('vcs-game-maker.darkMode');
// Which view the Project tab shows: the Example Projects section (true) or the
// Project Settings (false), so a page refresh stays on the same one.
export const useProjectShowExamplesStorage = () =>
  useBooleanAppSetting('vcs-game-maker.projectShowExamples');
// Same, for the Sound Banks screen, which takes the place of either of those two.
export const useProjectShowSoundBanksStorage = () =>
  useBooleanAppSetting('vcs-game-maker.projectShowSoundBanks');
export const useHideDescriptionTextStorage = () =>
  useBooleanAppSetting('vcs-game-maker.hideDescriptionText');
export const useMuteBlocklySoundsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.muteBlocklySounds');
// On by default (see public/js/gopher2600-worker.js's adaptive frame skipping): it only does
// anything once the emulator is close to falling behind.
export const useAdaptiveFrameSkipStorage = () =>
  useBooleanAppSetting('vcs-game-maker.adaptiveFrameSkip', true);
// Same "standing app preference, not a project setting" reasoning as the
// three above - the grid-snap toggle (see ActionEditor.vue's
// setupGridSnapZoomButton/toggleGridSnap) used to be page-local-only data,
// reset every time the Actions tab was left and revisited. A real reported
// request ("remember the grid snap setting on the blockly screen when
// navigating away").
export const useGridSnapStorage = () =>
  useBooleanAppSetting('vcs-game-maker.gridSnap');
// Same "standing app preference, not a project setting" reasoning as the
// others above - lets a player switch the Sound tab's  card list between
// a multi-column grid (the default) and a single full-width column, same
// choice SoundFXEditor.vue's .soundfx-list layout has gone back and
// forth on for itself in the past.
export const useSoundFxColumnsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.soundFxColumns', true);
// Same "standing app preference" reasoning as useSoundFxColumnsStorage
// above, for the Text tab's  card list (TextEditor.vue's .text-list).
export const useTextColumnsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.textColumns', true);
// Same "standing app preference" reasoning as useSoundFxColumnsStorage
// above, for the Data tab's  card list (DataEditor.vue's .data-list).
export const useDataColumnsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.dataColumns', true);
// Same "standing app preference, not a project setting" reasoning as the
// others above - a real reported correction (it started out living in
// configurationState/Project.vue's  configuration bag, meaning it reset
// to off every time you switched or started a new project, which defeats
// the point of a "always bump the version for me" habit).
export const useProjectAutoIncrementVersionStorage = () =>
  useBooleanAppSetting('vcs-game-maker.projectAutoIncrementVersion');
// Same "standing app preference, not a project setting" reasoning as the
// others above. Defaults to true so an existing project's saved filenames
// keep including the date/time stamp exactly as they always have, rather
// than silently changing shape the moment this toggle shipped.
export const useProjectIncludeDateInFilenameStorage = () =>
  useBooleanAppSetting('vcs-game-maker.projectIncludeDateInFilename', true);

// Same "standing app preference, not a project setting" reasoning as the
// others above - the desktop (Electron) build's "Test in Stella" button
// (App.vue) needs to know where the user installed Stella locally, a plain
// path string rather than a boolean, so this goes through useLocalStorage
// directly (raw string, like useLoadLastProjectStorage's "false"
// convention) rather than useBooleanAppSetting. Meaningless in the browser
// build (no filesystem access to launch anything with it), but harmless to
// keep around there too - Configuration.vue's  Stella field is only
// shown/enabled when window.electronAPI exists in the first place.
export const useStellaPathStorage = () => useLocalStorage('vcs-game-maker.stellaPath');

// Same "standing app preference, not a project setting" reasoning as the
// others above - a real reported correction. DIM scales the previews on the Sound and Music tabs
// and the emulator's output (public/index.html reads this same key), live, without a rebuild.
// The compiled ROM always keeps the full volume, so a saved project does not carry a DIM
// setting and a saved ROM is not quieter because of it.
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
// shared by PlayerEditor.vue and BackgroundEditor.vue's  PixelEditor.vue
// instances, so toggling it on either tab shows/hides the grid overlay
// everywhere, and it survives navigating away and back (Vue Router destroys
// and recreates each tab's  component on navigation - see
// hooks/collapse.js's  comment on the same lifecycle).
export const usePixelGridOverlayStorage = () =>
  useBooleanAppSetting('vcs-game-maker.pixelGridOverlay');

// Same standing-app-preference reasoning as usePixelGridOverlayStorage
// above, for the "X,Y" coordinate labels PixelEditor.vue's  grid overlay
// can additionally draw in each cell (see its  showCellIds prop) -
// currently only ever wired up on the Background tab (BackgroundEditor.vue,
// where reading off an exact X/Y matters for wiring up "Background: pixel
// at X/Y"-style blocks); PlayerEditor.vue never passes showCellIds at all,
// so this has no effect there regardless of its  stored value. Defaults
// to true (unlike every other useBooleanAppSetting caller) - showCellIds
// was hardcoded on before this toggle existed, so a default of false here
// would silently turn labels off for every existing user on their very
// first visit after this shipped, not just newly leave them off until
// explicitly turned on.
export const usePixelGridLabelsStorage = () =>
  useBooleanAppSetting('vcs-game-maker.pixelGridLabels', true);

// Which Music-tab instrument rows are muted/soloed - a view preference (see
// MusicEditor.vue's  mutedTrackIds/soloedTrackIds refs, which load these
// once at setup() time) that survives navigating away and back, same
// shape as every other localStorage-backed preference above. Plain
// load-once functions (not a reactive useLocalStorage wrapper) since
// MusicEditor.vue already wraps its ref around these and re-persists on
// every toggle itself - and generators/bbasic/music.js (the OTHER
// consumer, see isMusicTrackMuted below) only ever needs a one-shot read at
// compile time, never reactivity. Exported (rather than kept local to
// MusicEditor.vue, which is where this lived before) specifically so the
// ROM generator can honor the exact same mute/solo state the Music tab's
// preview already does, instead of silently baking in every track
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
// MusicEditor.vue's  preview (isTrackMuted) and the ROM generator (see
// flattenPatternEvents in generators/bbasic/music.js), so both agree on
// exactly the same answer for the same project state. As soon as ANY track
// in the pattern is soloed, every OTHER track is effectively muted
// regardless of its  individual mute flag, and the soloed one(s) play
// regardless of their  mute flag too (soloing a muted track still plays
// it - same convention most DAWs use, "solo" overrides "mute" rather than
// the two fighting). With nothing soloed, this just falls through to the
// track's  explicit mute flag.
export const isMusicTrackMuted = (mutedTrackIds, soloedTrackIds, song, pattern, track) => {
  const trackKey = (t) => `${song.id}:${t.id}`;
  const patternHasSoloedTrack = (pattern.tracks || []).some((t) => !!soloedTrackIds[trackKey(t)]);
  if (patternHasSoloedTrack) return !soloedTrackIds[trackKey(track)];
  return !!mutedTrackIds[trackKey(track)];
};
