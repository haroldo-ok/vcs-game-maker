<template>
  <player-editor
    :storageFactory="usePlayer1Storage"
    title="Player 1"
    fgColor="blue"
  />
</template>
<script>
import {defineComponent} from '@vue/composition-api';

import PlayerEditor from '../components/PlayerEditor.vue';
import {usePlayer1Storage} from '../hooks/project';

export default defineComponent({
  components: {PlayerEditor},
  setup() {
    return {usePlayer1Storage};
  },
});
</script>
