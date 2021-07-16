import Vue from 'vue';
import VueCompositionApi, {computed} from '@vue/composition-api';

Vue.use(VueCompositionApi);

export const useLocalStorage = (key) => computed({
  get() {
    return localStorage.getItem(key);
  },
  set(value) {
    localStorage.setItem(key);
  },
});
