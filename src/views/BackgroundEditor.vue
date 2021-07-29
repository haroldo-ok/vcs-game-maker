<template>
  <v-card>
    <v-card-title>Backgrounds</v-card-title>
    <v-card-text>
      <div class="pixel-editor-container">
        <pixel-editor v-model="pixels" />
      </div>
    </v-card-text>
  </v-card>
</template>
<script>
import {defineComponent, ref} from '@vue/composition-api';

import PixelEditor from '../components/PixelEditor.vue';

export default defineComponent({
  components: {PixelEditor},
  setup() {
    const pixels = ref(null);
    return {pixels};
  },
});
</script>
<style scoped>
.pixel-editor-container {
  max-width: 320px;
}
</style>
