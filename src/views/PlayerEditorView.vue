<template>
  <player-editor
    :storageFactory="usePlayerAnimationsStorage"
    title="Sprite"
    fgColor="orange"
    name="player"
  />
</template>
<script>
import {defineComponent} from '@vue/composition-api';

import PlayerEditor from '../components/PlayerEditor.vue';
import {usePlayerAnimationsStorage} from '../hooks/project';

export default defineComponent({
  components: {PlayerEditor},
  setup() {
    return {usePlayerAnimationsStorage};
  },
});
</script>
