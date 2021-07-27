<template>
  <v-card>
    <v-card-title>Backgrounds</v-card-title>
    <v-card-text>
      <pixel-editor />
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
