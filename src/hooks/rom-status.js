'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// Whether the emulator's ROM is behind the current project. Kept in its own
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
// previously-compiled ROM (window.Javatari.compiledResult) is still valid
// and downloadable even after the project's own edits make it stale, right
// up until a real page reload clears Javatari's own in-memory state (see
// handleRefreshEmulator's own comment on why that's the one thing that
// actually loses it).
const hasCompiledRom = ref(false);

export const useHasCompiledRom = () => hasCompiledRom;

export const markRomUpToDate = () => {
  romOutdated.value = false;
  hasCompiledRom.value = true;
};
