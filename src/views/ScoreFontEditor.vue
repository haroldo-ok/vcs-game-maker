<template>
  <v-card>
    <v-card-title>Score</v-card-title>
    <v-card-text>
      <v-select
        v-model="selectedFont"
        :items="scoreFontOptions"
        label="Score font"
      />
      <p>
        Draw the ten score digits below. They are used when the score font is
        set to <strong>Custom</strong>.
      </p>
      <editor-zoom v-model="zoom" />
      <div class="digit-list">
        <div
          class="digit"
          :style="{width: digitWidth}"
          v-for="(digit, index) in state.digits"
          :key="index"
        >
          <div class="digit-label">{{ index }}</div>
          <div class="digit-editor">
            <pixel-editor
              :width="8"
              :height="8"
              :aspectRatio="PIXEL_ASPECT"
              v-model="state.digits[index]"
              fgColor="#f2691e"
              :name="'score-font-digit-' + index"
              :allowChangingHeight="false"
              @input="handleChange"
            />
          </div>
        </div>
      </div>
      <v-btn class="reset-button" color="secondary" @click="handleReset">
        <v-icon>mdi-restore</v-icon>
        <div>Reset to default digits</div>
      </v-btn>
    </v-card-text>
  </v-card>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';

import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import {useConfigurationStorage, useScoreFontStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {SCORE_FONT_NAMES} from '../generators/score-fonts';
import {
  CUSTOM_SCORE_FONT,
  DEFAULT_SCORE_FONT,
  fontToDigits,
  processScoreFontDefaults,
} from '../utils/score-font';

// Score digits are drawn with player graphics, one colour clock per pixel, and
// those 160 clocks are stretched across a 4:3 frame, so on screen each pixel
// ends up twice as wide as it is tall (measured at 1.998:1 in the emulator).
// The grid is square, so this doubles as the preview's width-to-height ratio.
const PIXEL_ASPECT = 2;

// Width of one digit editor at 100% zoom.
const DIGIT_BASE_WIDTH = 120;

const SCORE_FONT_OPTIONS = [
  {text: 'Default', value: ''},
  ...SCORE_FONT_NAMES.map((name) => ({text: name, value: name})),
  {text: 'Custom (drawn below)', value: CUSTOM_SCORE_FONT},
];

export default defineComponent({
  components: {EditorZoom, PixelEditor},
  setup() {
    const scoreFontStorage = useScoreFontStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('scorefont');
    const digitWidth = computed(() => `${Math.round(DIGIT_BASE_WIDTH * zoom.value)}px`);

    // Only this one option is owned here, so it is merged into the stored
    // configuration rather than replacing it.
    const selectedFont = computed({
      get() {
        try {
          return (configurationStorage.value || {}).scoreFont || '';
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return '';
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          scoreFont: value,
        };
      },
    });

    const state = computed({
      get() {
        try {
          return processScoreFontDefaults(scoreFontStorage);
        } catch (e) {
          console.error('Error loading the score font from local storage', e);
          return {digits: fontToDigits(DEFAULT_SCORE_FONT)};
        }
      },

      set(newState) {
        scoreFontStorage.value = newState;
      },
    });

    // The pixel editor mutates its matrix in place, so the whole object is
    // reassigned to push it back into storage.
    const handleChange = () => {
      state.value = state.value;
    };

    const handleReset = () => {
      state.value = {digits: fontToDigits(DEFAULT_SCORE_FONT)};
    };

    return {
      state,
      handleChange,
      handleReset,
      selectedFont,
      scoreFontOptions: SCORE_FONT_OPTIONS,
      PIXEL_ASPECT,
      zoom,
      digitWidth,
    };
  },
});
</script>
<style scoped>
.digit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

/* Width is set inline from the zoom factor. */

.digit-label {
  font-weight: bold;
  text-align: center;
}

.digit-editor {
  position: relative;
}

.reset-button {
  margin-top: 24px;
}
</style>
