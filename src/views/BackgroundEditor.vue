<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Backgrounds</v-card-title>
      <v-card-text>
        <editor-zoom v-model="zoom" />
        <v-list>
          <v-list-item v-for="background in state.backgrounds" v-bind:key="background.id">
            <v-list-item-content>
                <v-list-item-title>
                  <v-text-field label="Background name" v-model="background.name" @change="handleChildChange" />
                </v-list-item-title>
                <v-list-item-subtitle>
                  <v-switch
                    :input-value="!!background.rowColors"
                    label="Per-row playfield colors (pfcolors)"
                    dense
                    hide-details
                    class="row-colors-switch mt-0 pt-0"
                    @change="(val) => handleToggleRowColors(background, val)"
                  />
                  <div class="pixel-editor-container" :style="{width: editorWidth, maxWidth: editorWidth}">
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
                          class="delete-btn-inset"
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
                      :height="backgroundRows"
                      name="background"
                      v-model="background.pixels"
                      fgColor="orange"
                      :rowColors="editorRowColors(background)"
                      :allowChangingHeight="false"
                      @input="handleChildChange"
                    >
                      <template v-if="background.rowColors" v-slot:sidebar>
                        <playfield-color-strip
                          :value="background.rowColors"
                          @input="(colors) => handleRowColorsInput(background, colors)"
                        />
                      </template>
                    </pixel-editor>
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

import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import {useBackgroundsStorage, useConfigurationStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {colorByteToCss} from '../utils/palette';
import {DEFAULT_BACKGROUNDS, DEFAULT_ROW_COLOR, effectiveBackgroundRows,
  processBackgroundStorageDefaults} from '../blocks/background';

// Width of one background editor at 100% zoom.
const EDITOR_BASE_WIDTH = 480;

// A simple rectangular border, sized to whatever the current playfield
// resolution is. Used for new backgrounds instead of a fixed 11-row pattern,
// since Superchip's pfres setting can make that row count anything from 11
// to 32.
const buildDefaultBackgroundPixels = (rows, cols = 32) => {
  const matrix = new Array(rows).fill(0).map(() => new Array(cols).fill(0));
  for (let x = 0; x < cols; x++) {
    matrix[0][x] = 1;
    matrix[rows - 1][x] = 1;
  }
  for (let y = 0; y < rows; y++) {
    matrix[y][0] = 1;
    matrix[y][cols - 1] = 1;
  }
  return matrix;
};

export default defineComponent({
  components: {EditorZoom, PixelEditor, PlayfieldColorStrip},
  setup() {
    const backgroundsStorage = useBackgroundsStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('background');
    const editorWidth = computed(() => `${Math.round(EDITOR_BASE_WIDTH * zoom.value)}px`);

    // The playfield's row count is a single setting for the whole ROM (see
    // the Options tab's Superchip/pfres controls), not something each
    // background can override individually.
    const backgroundRows = computed(() =>
      effectiveBackgroundRows(configurationStorage && configurationStorage.value));
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

    // Per-row playfield colors (batari Basic pfcolors). Toggling on seeds one
    // color byte per playfield row; toggling off drops the array, which is what
    // the code generator uses to decide whether to emit a pfcolors table.
    const handleToggleRowColors = (background, enabled) => {
      if (enabled) {
        const rowCount = background.pixels.length;
        background.rowColors = new Array(rowCount).fill(DEFAULT_ROW_COLOR);
      } else {
        delete background.rowColors;
      }
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleRowColorsInput = (background, colors) => {
      background.rowColors = colors;
      handleChildChange();
      // The editors hold their own display state, so persisting isn't enough to
      // repaint the preview — force a re-render so the pixel editor receives the
      // updated row colors and recolors its canvas.
      instance.proxy.$forceUpdate();
    };

    // CSS colors passed to the pixel editor so it can tint each row. Returns
    // null when the background has no per-row colors (uniform fgColor). A pure
    // black row ($00) is nudged to near-black so the editor still counts those
    // pixels as "on" rather than reading them as the black background.
    const editorRowColors = (background) => {
      if (!background.rowColors) {
        return null;
      }
      return background.rowColors.map((byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      });
    };

    const instance = getCurrentInstance();
    const handleAddBackground = () => {
      const backgrounds = state.value.backgrounds;
      const maxId = max(backgrounds.map((o) => o.id)) || 0;
      const newBackground = {
        id: maxId + 1,
        name: `Background ${maxId + 1}`,
        pixels: buildDefaultBackgroundPixels(backgroundRows.value),
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

    return {state, handleChildChange, handleAddBackground, handleDeleteBackground,
      handleToggleRowColors, handleRowColorsInput, editorRowColors,
      zoom, editorWidth, backgroundRows};
  },
});
</script>
<style scoped>
/* max-width is set inline from the zoom factor. */

.row-colors-switch {
  margin-bottom: 4px;
}

/* Vuetify sets overflow: hidden on list-item content/subtitle (for text
   ellipsis), which clips the pixel editor card's shadow on the flush left and
   bottom edges. Let it show. */
.editor-container >>> .v-list-item__content,
.editor-container >>> .v-list-item__subtitle {
  overflow: visible;
}

.editor-container {
  position: absolute;
  overflow: auto;
  top: 3em;
  bottom: 0;
  width: 100%;
}

/* Vuetify's fab+absolute+top combo centers the button on its container's top
   edge, poking half of it out; pull it down so the whole button sits inside
   the card instead. */
.delete-btn-inset {
  top: 8px !important;
  box-shadow: none !important;
}

.add-frame-buttom {
  bottom: 8px;
}
</style>
