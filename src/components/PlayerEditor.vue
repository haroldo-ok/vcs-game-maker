<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>{{ title }}</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item v-for="animation in state.animations" v-bind:key="animation.id">
            <v-list-item-content>
                <v-list-item-title>
                  <v-text-field label="Animation name" v-model="animation.name" />
                </v-list-item-title>
                <v-list>
                  <v-list-item
                    v-for="frame in animation.frames"
                    v-bind:key="frame.id"
                    class="pixel-editor-parent-container"
                  >
                    <div class="pixel-editor-container">
                      <v-text-field
                        label="Duration"
                        v-model.number="frame.duration"
                        hide-details
                        type="number"
                      />
                      <pixel-editor
                        :width="8"
                        :height="8"
                        :aspectRatio="160/192"
                        v-model="frame.pixels"
                        :fgColor="fgColor"
                        @input="handleChildChange"
                      />
                    </div>
                  </v-list-item>
                </v-list>
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
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';

import PixelEditor from '../components/PixelEditor.vue';
import {playfieldToMatrix} from '../utils/pixels';

export default defineComponent({
  components: {PixelEditor},
  props: ['storageFactory', 'title', 'fgColor'],
  setup(props) {
    const defaultAnimationData = {
      animations: [
        {
          id: 1,
          name: 'Example1',
          frames: [
            {
              id: 1,
              duration: 10,
              pixels: playfieldToMatrix(
                  '...XXX..\n' +
                  '...XXX..\n' +
                  '...XXX..\n' +
                  '..X.X...\n' +
                  '..XXXXX.\n' +
                  '....X.X.\n' +
                  '...X.X..\n' +
                  '..X...X.'),
            },
            {
              id: 2,
              duration: 10,
              pixels: playfieldToMatrix(
                  '...XXX..\n' +
                  '...XXX..\n' +
                  '...XXX..\n' +
                  '....X.X.\n' +
                  '..XXXXX.\n' +
                  '..X.X...\n' +
                  '...X.X..\n' +
                  '...X.X..'),
            },
          ],
        },
      ],
    };

    const playerStorage = props.storageFactory();
    const state = computed({
      get() {
        try {
          return playerStorage.value || defaultAnimationData;
        } catch (e) {
          console.error('Error loading player 0 from local storage', e);
          return defaultAnimationData;
        }
      },

      set(newState) {
        playerStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    return {state, handleChildChange, props};
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 3em;
  bottom: 0;
  width: 100%;
}

.pixel-editor-parent-container {
  display: inline-block;
}

.add-frame-buttom {
  bottom: 8px;
}
</style>
