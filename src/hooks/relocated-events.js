'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

Vue.use(VueCompositionApi);

// Which events (if any) the automatic bank allocator moved out of bank 1
// during the last successful build. A relocation decision fails silently if
// wrong (see the bank-targeting feasibility notes), so this exists purely to
// give the user visibility into what the tool did, not to let them control
// it directly.
const autoRelocatedEvents = ref([]);

export const useAutoRelocatedEvents = () => autoRelocatedEvents;

export const setAutoRelocatedEvents = (eventNames) => {
  autoRelocatedEvents.value = eventNames;
};
