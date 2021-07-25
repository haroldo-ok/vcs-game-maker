import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

const generatedBasic = ref('');

export const useGeneratedBasic = () => generatedBasic;
