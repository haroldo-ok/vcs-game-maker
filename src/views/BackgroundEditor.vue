<template>
  <v-card>
    <v-card-title>Backgrounds</v-card-title>
    <v-card-text>
      <div class="pixel-editor-container">
        <pixel-editor />
      </div>
    </v-card-text>
  </v-card>
</template>
<script>
import {defineComponent} from '@vue/composition-api';

import PixelEditor from '../components/PixelEditor.vue';

export default defineComponent({
  components: {PixelEditor},
  setup() {
  },
});
</script>
<style scoped>
.pixel-editor-container {
  max-width: 320px;
}
</style>
