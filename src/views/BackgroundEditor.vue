<template>
  <v-card>
    <v-card-title>Backgrounds</v-card-title>
    <v-card-text>
      <v-list>
        <v-list-item v-for="background in state.backgrounds" v-bind:key="background.id">
          <v-list-item-content>
              <v-list-item-title>
                <v-text-field label="Background name" v-model="background.name" />
              </v-list-item-title>
              <v-list-item-subtitle>
                <div class="pixel-editor-container">
                  <pixel-editor
                    :width="32"
                    :height="11"
                    v-model="background.pixels"
                    fgColor="orange"
                    @input="handleChildChange"
                  />
                </div>
              </v-list-item-subtitle>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';

import PixelEditor from '../components/PixelEditor.vue';
import {useBackgroundsStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';

export default defineComponent({
  components: {PixelEditor},
  setup() {
    const defaultBackgrounds = {
      backgrounds: [
        {
          id: 1,
          name: 'Test 1',
          pixels: playfieldToMatrix(
              'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
              'X....X...................X....X\n' +
              'X.............................X\n' +
              'X.............................X\n' +
              'X.............................X\n' +
              'X.............................X\n' +
              'X.............................X\n' +
              'X.............................X\n' +
              'X.............................X\n' +
              'X....X...................X....X\n' +
              'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
        },
      ],
    };

    const backgroundsStorage = useBackgroundsStorage();
    const state = computed({
      get() {
        try {
          return backgroundsStorage.value || defaultBackgrounds;
        } catch (e) {
          console.error('Error loading backgrounds from local storage', e);
          return defaultBackgrounds;
        }
      },

      set(newState) {
        backgroundsStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    return {state, handleChildChange};
  },
});
</script>
<style scoped>
.pixel-editor-container {
  max-width: 480px;
}
</style>
