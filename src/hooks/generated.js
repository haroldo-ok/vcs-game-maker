import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

const generatedBasic = ref('');

export const useGeneratedBasic = () => generatedBasic;

// The code is built only when something needs it (the Generated tab, a ROM build): building it takes over a second for a big project, and
// doing that after every edit made the next drag start late. `stale` says the blocks (or the graphics the code bakes in) changed since it was
// built; the builder (hooks/rom.js sets it, to avoid an import cycle) makes it from the stored project.
const generatedStale = ref(true);
let builder = null;

export const markGeneratedStale = () => {
  generatedStale.value = true;
};

export const markGeneratedFresh = () => {
  generatedStale.value = false;
};

export const setGeneratedCodeBuilder = (fn) => {
  builder = fn;
};

// Builds the code if the project changed since it was last built.
export const ensureGeneratedCode = () => {
  if (!generatedStale.value || !builder) return;
  generatedBasic.value = builder();
  generatedStale.value = false;
};
