import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

Vue.use(VueCompositionApi);

import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import {clearProjectStorage, useLoadLastProjectStorage} from './hooks/project';
import './registerServiceWorker';

// Whether to restore the last saved project on startup is a user preference
// (see the Options tab) rather than always-on - when disabled, every launch
// starts from the empty/default project instead. Done before the app is
// created so nothing has read the old project yet.
if (!useLoadLastProjectStorage().value) {
  clearProjectStorage();
}

Vue.config.productionTip = false;
// Add unimported components to ignore list to prevent warnings.
Vue.config.ignoredElements = ['field', 'block', 'category', 'xml', 'mutation', 'value', 'sep'];

new Vue({
  vuetify,
  router,
  render: (h) => h(App),
}).$mount('#app');
