import Vue from 'vue';
import VueCompositionApi, {ref, computed} from '@vue/composition-api';

Vue.use(VueCompositionApi);

export const useLocalStorage = (key) => computed({
  get() {
    return localStorage.getItem(key);
  },
  set(value) {
    localStorage.setItem(key, value);
  },
});

export const useJsonLocalStorage = (key) => {
  const counter = ref({refresh: 0});
  return computed({
    get() {
      // Just to tell the getter that it has been updated
      counter.value;
      const jsonText = localStorage.getItem(key);
      return jsonText ? JSON.parse(jsonText) : null;
    },
    set(value) {
      counter.value++;
      localStorage.setItem(key, JSON.stringify(value));
    },
  });
};
