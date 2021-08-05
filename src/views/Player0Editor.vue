<template>
  <v-card>
    <v-card-title>Player 0</v-card-title>
    <v-card-text>
      <v-list>
        <v-list-item v-for="animation in animationData.animations" v-bind:key="animation.id">
          <v-list-item-content>
              <v-list-item-title>
                <v-text-field label="Animation name" v-model="animation.name" />
              </v-list-item-title>
              <v-list>
                <v-list-item v-for="frame in animation.frames" v-bind:key="frame.id">
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
                      fgColor="red"
                    />
                  </div>
                </v-list-item>
              </v-list>
          </v-list-item-content>
        </v-list-item>
      </v-list>
    </v-card-text>
  </v-card>
</template>
<script>
import {defineComponent, ref} from '@vue/composition-api';

import PixelEditor from '../components/PixelEditor.vue';
import {playfieldToMatrix} from '../utils/pixels';

export default defineComponent({
  components: {PixelEditor},
  setup() {
    const animationData = ref({
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
    });

    return {animationData};
  },
});
</script>
