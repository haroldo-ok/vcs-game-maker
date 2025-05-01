<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Backgrounds</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item v-for="background in state.backgrounds" v-bind:key="background.id">
            <v-list-item-content>
                <v-list-item-title>
                  <v-text-field label="Background name" v-model="background.name" @input="handleChildChange" />
                </v-list-item-title>
                <v-list-item-subtitle>
                  <div class="pixel-editor-container">
                    <v-menu
                        v-if="state.backgrounds.length > 1"
                        top
                      >
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn
                          color="red"
                          title="Delete this background"
                          fab
                          small
                          absolute
                          top
                          right
                          v-bind="attrs"
                          v-on="on"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </template>

                      <v-card>
                        <v-card-title>Delete this background?</v-card-title>
                        <v-list>
                          <v-list-item @click="handleDeleteBackground(background)">
                            <v-list-item-icon>
                              <v-icon>mdi-check</v-icon>
                            </v-list-item-icon>
                            <v-list-item-title>Yes, delete</v-list-item-title>
                          </v-list-item>
                          <v-list-item>
                            <v-list-item-icon>
                              <v-icon>mdi-cancel</v-icon>
                            </v-list-item-icon>
                            <v-list-item-title>No, don't delete</v-list-item-title>
                          </v-list-item>
                        </v-list>
                      </v-card>
                    </v-menu>
                    <pixel-editor
                      :width="32"
                      :height="11"
                      name="background"
                      v-model="background.pixels"
                      fgColor="orange"
                      :allowChangingHeight="false"
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
import {DEFAULT_BACKGROUNDS, processBackgroundStorageDefaults} from '../blocks/background';

export default defineComponent({
  components: {PixelEditor},
  setup() {
    const backgroundsStorage = useBackgroundsStorage();
    const state = computed({
      get() {
        try {
          return processBackgroundStorageDefaults(backgroundsStorage);
        } catch (e) {
          console.error('Error loading backgrounds from local storage', e);
          return DEFAULT_BACKGROUNDS;
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
        id: maxId + 1,
        name: `Background ${maxId + 1}`,
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

    const handleDeleteBackground = (background) => {
      state.value.backgrounds = state.value.backgrounds.filter(({id}) => id != background.id);
      console.info('Deleted ', background);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    return {state, handleChildChange, handleAddBackground, handleDeleteBackground};
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
