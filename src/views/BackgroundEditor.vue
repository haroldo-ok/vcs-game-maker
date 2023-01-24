<template>
  <div>
    <v-card class="editor-container">
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

    <v-btn
      class="add-frame-buttom"
      color="primary"
      title="Add animation frame"
      dark
      absolute
      right
      fab
      @click="handleAddBackground"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance} from '@vue/composition-api';
import {max} from 'lodash';

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

    const instance = getCurrentInstance();
    const handleAddBackground = () => {
      const backgrounds = state.value.backgrounds;
      const maxId = max(backgrounds.map((o) => o.id)) || 0;
      const newBackground = {
        id: maxId+1,
        duration: 10,
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
      };

      state.value.backgrounds.push(newBackground);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    return {state, handleChildChange, handleAddBackground};
  },
});
</script>
<style scoped>
.pixel-editor-container {
  max-width: 480px;
}

.editor-container {
  position: absolute;
  overflow: auto;
  top: 3em;
  bottom: 0;
  width: 100%;
}

.add-frame-buttom {
  bottom: 8px;
}
</style>
