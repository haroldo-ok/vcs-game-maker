import Vue from 'vue';
import Vuetify from 'vuetify/lib/framework';

import DrumIcon from '../components/DrumIcon.vue';

Vue.use(Vuetify);

export default new Vuetify({
  icons: {
    values: {
      // Used as <v-icon>$drum</v-icon>: the Material Design icon font has no drum.
      drum: {component: DrumIcon},
    },
  },
});
