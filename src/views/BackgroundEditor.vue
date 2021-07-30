<template>
  <v-card>
    <v-card-title>Backgrounds</v-card-title>
    <v-card-text>
      <v-list>
        <v-list-item v-for="background in backgrounds" v-bind:key="background.id">
          <v-list-item-content>
              <v-list-item-title>
                <v-text-field label="Background name" v-model="background.name" />
              </v-list-item-title>
              <v-list-item-subtitle>
                <div class="pixel-editor-container">
                  <pixel-editor v-model="background.pixels" />
                </div>
              </v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>
<script>
import {defineComponent, ref} from '@vue/composition-api';

import PixelEditor from '../components/PixelEditor.vue';

export default defineComponent({
  components: {PixelEditor},
  setup() {
    const backgrounds = ref([
      {
        id: 1,
        name: 'Test 1',
        pixels: null,
      },
      {
        id: 2,
        name: 'Test 2',
        pixels: null,
      },
    ]);
    const pixels = ref(null);
    return {pixels, backgrounds};
  },
});
</script>
<style scoped>
.pixel-editor-container {
  max-width: 480px;
}
</style>
