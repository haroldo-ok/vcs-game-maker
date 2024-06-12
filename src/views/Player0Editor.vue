<template>
  <player-editor
    :storageFactory="usePlayer0Storage"
    title="Player 0"
    fgColor="red"
    name="player0"
  />
</template>
<script>
import {defineComponent} from '@vue/composition-api';

import PlayerEditor from '../components/PlayerEditor.vue';
import {usePlayer0Storage} from '../hooks/project';

export default defineComponent({
  components: {PlayerEditor},
  setup() {
    return {usePlayer0Storage};
  },
});
</script>
