import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

Vue.use(VueCompositionApi);

import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import {clearProjectStorage} from './hooks/project';
import './registerServiceWorker';

// A genuinely new session (a new tab/window, or a freshly launched desktop
// app) starts from the empty/default project - the previous session's work
// is only otherwise kept by exporting it from the Project tab. But a plain
// refresh of an already-open tab should keep whatever project was open, not
// wipe it.
//
// sessionStorage is what tells those two cases apart: unlike localStorage
// (where the actual project lives), it's cleared whenever the tab/window is
// actually closed (or the desktop app's process restarts), but - unlike an
// in-memory flag - survives a plain reload within the same tab/window. Done
// before the app is created so nothing has read the old project yet.
const SESSION_ACTIVE_KEY = 'vcs-game-maker.session-active';
if (!sessionStorage.getItem(SESSION_ACTIVE_KEY)) {
  clearProjectStorage();
  sessionStorage.setItem(SESSION_ACTIVE_KEY, '1');
}

Vue.config.productionTip = false;
// Add unimported components to ignore list to prevent warnings.
Vue.config.ignoredElements = ['field', 'block', 'category', 'xml', 'mutation', 'value', 'sep'];

new Vue({
  vuetify,
  router,
  render: (h) => h(App),
}).$mount('#app');
