<template>
  <player-editor
    :storageFactory="usePlayer0Storage"
    title="Player 0"
    fgColor="red"
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
