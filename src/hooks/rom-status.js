'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// Whether the emulator's ROM is behind the current project. Kept in its
// module, free of other project imports, so the storage layer can flag the ROM
// stale without creating an import cycle with the builder.
const romOutdated = ref(true);

export const useRomOutdated = () => romOutdated;

export const markRomOutdated = () => {
  romOutdated.value = true;
};

// Whether a ROM has EVER been successfully compiled this page load - unlike
// romOutdated (which flips back to true the moment the project changes
// again), this stays true once set: the "Save ROM" button (App.vue) reads
// this to disable itself only until the first successful build, since a
// previously-compiled ROM (see compiledRomBytes below) is still valid and
// downloadable even after the project's edits make it stale, right up
// until a real page reload clears it (see handleRefreshEmulator's comment
// on why that's the one thing that actually loses it).
const hasCompiledRom = ref(false);

export const useHasCompiledRom = () => hasCompiledRom;

// The last successfully assembled ROM (an assembleBatariBasic() result:
// {output: Uint8Array, ...}) - used by "Save ROM"/"Test in Stella" in
// App.vue. Kept here rather than as a global on the emulator object, unlike
// the Javatari-era `Javatari.compiledResult` stash this replaces.
const compiledRomBytes = ref(null);

export const useCompiledRomBytes = () => compiledRomBytes;

export const setCompiledRomBytes = (result) => {
  compiledRomBytes.value = result;
};

// Forgets every compiled/loaded ROM - for a new or imported project, whose
// ROM (kept for recovery, "Save ROM" and "Test in Stella") belongs to the
// project it replaces. Doesn't touch the emulator itself; see
// clearEmulatorRom in hooks/emulator.js.
export const clearLoadedRom = () => {
  lastLoadedRomBytes.value = null;
  lastLoadedTvSpec.value = 'NTSC';
  lastBuildScreenshot.value = null;
  compiledRomBytes.value = null;
  hasCompiledRom.value = false;
  romOutdated.value = true;
  try {
    sessionStorage.removeItem(LAST_LOADED_ROM_KEY);
    sessionStorage.removeItem(LAST_LOADED_TV_SPEC_KEY);
  } catch (e) {
    // Nothing stored to remove.
  }
};

export const markRomUpToDate = () => {
  romOutdated.value = false;
  hasCompiledRom.value = true;
};

// sessionStorage key backing recordLoadedRomForRecovery below - deliberately
// sessionStorage, not localStorage: this is a cache of compiled BYTES tied to
// this tab's current session, not project data, and clearing it on an actual
// tab close (rather than it lingering indefinitely) is the right lifetime for
// that.
const LAST_LOADED_ROM_KEY = 'vcsgm-last-loaded-rom';
const LAST_LOADED_TV_SPEC_KEY = 'vcsgm-last-loaded-tv-spec';

// What the emulator canvas is CURRENTLY showing, independent of whether that
// came from a real "Update ROM" build or a one-off Title Screen preview build
// (hooks/rom.js's buildRomInner vs buildTitleScreenPreviewRom) - unlike
// compiledRomBytes above, which is deliberately real-build-only (Save
// ROM/Test in Stella must never offer a synthetic preview program). Restored
// from sessionStorage immediately below at module load, so it already has
// the right value before either the 'gopher2600-ready' listener (hooks/
// emulator.js) or a real page reload's first render can run.
const lastLoadedRomBytes = ref(null);

// A PNG data URL of what the last real build showed once it had been running
// for a moment (see buildRom in hooks/rom.js), taken ahead of time so saving a
// project doesn't have to build one. Null until that picture exists.
const lastBuildScreenshot = ref(null);

export const useLastBuildScreenshot = () => lastBuildScreenshot;

export const useLastLoadedRomBytes = () => lastLoadedRomBytes;

// The gopher2600 television spec ("NTSC"/"PAL"/"PAL60") the loaded ROM was
// built for - kept next to the bytes so a recovery reload hands the emulator
// the same spec, not whatever the Options tab says by then.
const lastLoadedTvSpec = ref('NTSC');

export const useLastLoadedTvSpec = () => lastLoadedTvSpec;

// Call right after ANY successful gopher2600.loadRom(...) - both call sites
// in hooks/rom.js. Persists to sessionStorage so a real page reload (see
// App.vue's handleRefreshEmulator - the only thing that actually clears
// module state like this ref) still has something to hand the emulator once
// gopher2600.wasm finishes reinitializing, instead of coming back up blank
// until the user manually rebuilds.
export const recordLoadedRomForRecovery = (output, tvSpec = 'NTSC') => {
  lastLoadedRomBytes.value = output;
  lastLoadedTvSpec.value = tvSpec;
  try {
    sessionStorage.setItem(LAST_LOADED_TV_SPEC_KEY, tvSpec);
    let binary = '';
    for (let i = 0; i < output.length; i++) binary += String.fromCharCode(output[i]);
    sessionStorage.setItem(LAST_LOADED_ROM_KEY, btoa(binary));
  } catch (e) {
    // sessionStorage can throw (private browsing quota, etc.) - losing the
    // reload-recovery convenience isn't worth failing the build over.
  }
};

(() => {
  try {
    const stored = sessionStorage.getItem(LAST_LOADED_ROM_KEY);
    if (!stored) return;
    const binary = atob(stored);
    const output = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) output[i] = binary.charCodeAt(i);
    lastLoadedRomBytes.value = output;
    lastLoadedTvSpec.value = sessionStorage.getItem(LAST_LOADED_TV_SPEC_KEY) || 'NTSC';
  } catch (e) {
    // Corrupt/unreadable entry - fall through with nothing to restore.
  }
})();
