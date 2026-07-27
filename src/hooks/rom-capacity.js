'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// How much ROM space the last successful build had left, or null before the
// first build. Kept in its own module, mirroring rom-status.js, so the
// storage layer can read it without an import cycle with the builder.
const romCapacity = ref(null);

export const useRomCapacity = () => romCapacity;

export const setRomCapacity = (value) => {
  romCapacity.value = value;
};
