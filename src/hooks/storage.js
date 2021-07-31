import Vue from 'vue';
import VueCompositionApi, {computed} from '@vue/composition-api';

Vue.use(VueCompositionApi);

export const useLocalStorage = (key) => computed({
  get() {
    return localStorage.getItem(key);
  },
  set(value) {
    localStorage.setItem(key, value);
  },
});

export const useJsonLocalStorage = (key) => computed({
  get() {
    const jsonText = localStorage.getItem(key);
    return jsonText ? JSON.parse(jsonText) : null;
  },
  set(value) {
    localStorage.setItem(key, JSON.stringify(value));
  },
});
