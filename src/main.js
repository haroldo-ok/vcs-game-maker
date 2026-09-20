import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

Vue.use(VueCompositionApi);

import App from './App.vue';
import vuetify from './plugins/vuetify';
import router from './router';
import {clearProjectStorage, useLoadLastProjectStorage} from './hooks/project';
import {migrateLegacyPlayerAnimationsInLocalStorage} from './hooks/migrate-player-animations';
import {migrateLegacyPlayerBlocksInLocalStorage} from './hooks/migrate-player-blocks';
import './registerServiceWorker';

// Combines an existing project's own separate legacy Player 0/Player 1
// animation storage into the single shared pool this app now uses - see
// that function's own comment for why this has to run before the app is
// created, same timing reasoning as the loadLastProject check just below.
migrateLegacyPlayerAnimationsInLocalStorage();

// Rewrites any old sprite_player0_*/sprite_player1_* blocks left over from
// before Player 0/1 shared one combined block type - see that function's
// own comment for the full reasoning, same "run before anything else reads
// the workspace" timing as the animation migration just above.
migrateLegacyPlayerBlocksInLocalStorage();

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
