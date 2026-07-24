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

export const markRomUpToDate = () => {
  romOutdated.value = false;
};
