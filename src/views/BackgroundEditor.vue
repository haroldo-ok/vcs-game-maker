<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Backgrounds</v-card-title>
      <v-card-text>
        <editor-zoom v-model="zoom" />
        <v-list>
          <v-list-item class="entry-list-item" v-for="background in state.backgrounds" v-bind:key="background.id">
            <v-list-item-content>
                <v-list-item-title>
                  <div class="background-id-row">
                    <v-btn
                      :title="isCollapsed(background) ? 'Expand this background' : 'Collapse this background'"
                      icon
                      small
                      class="background-collapse-btn"
                      @click="() => toggleCollapsed(background)"
                    >
                      <v-icon>{{ isCollapsed(background) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                    </v-btn>
                    <div class="background-id-badge">ID: {{ background.id }}</div>
                  </div>
                  <v-text-field label="Background name" v-model="background.name" @change="handleChildChange" />
                </v-list-item-title>
                <v-list-item-subtitle v-if="!isCollapsed(background)">
                  <div class="pixel-editor-container" :style="{width: editorWidth, maxWidth: editorWidth}">
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
                      <template v-if="pfColorsEnabled" v-slot:sidebar>
                        <playfield-color-strip
                          :value="background.rowColors"
                          @input="(colors) => handleRowColorsInput(background, colors)"
                        />
                      </template>
                      <template v-if="state.backgrounds.length > 1" v-slot:toolbar-end>
                        <v-menu top>
                          <template v-slot:activator="{ on, attrs }">
                            <v-btn
                              title="Delete this background"
                              icon
                              small
                              class="delete-icon-btn"
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
      title="Add background"
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

import {useCollapsedIds} from '../hooks/collapse';
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

    // Per-row playfield colors (batari Basic pfcolors) are an all-or-nothing,
    // project-wide setting (see the Options tab) - once it's on, every
    // background needs its own color list, since the compiled kernel always
    // draws every background's playfield from that color table.
    const pfColorsEnabled = computed(() =>
      (configurationStorage && configurationStorage.value && configurationStorage.value.enablePfColors) ?? false);

    // Fills in a missing/mismatched-length row color list so every background
    // has one whenever per-row colors are enabled, without clobbering colors
    // the user already picked. Left alone (not deleted) while the option is
    // off, so re-enabling it doesn't lose prior work.
    const ensureRowColors = (background, rows) => {
      if (!pfColorsEnabled.value) return;
      const existing = background.rowColors || [];
      if (existing.length === rows) return;
      const next = existing.slice(0, rows);
      while (next.length < rows) next.push(DEFAULT_ROW_COLOR);
      background.rowColors = next;
    };

    const state = computed({
      get() {
        try {
          const data = processBackgroundStorageDefaults(backgroundsStorage);
          data.backgrounds.forEach((background) => ensureRowColors(background, background.pixels.length));
          return data;
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

    const {isCollapsed, toggleCollapsed} = useCollapsedIds('background');

    const handleRowColorsInput = (background, colors) => {
      background.rowColors = colors;
      handleChildChange();
      // The editors hold their own display state, so persisting isn't enough to
      // repaint the preview — force a re-render so the pixel editor receives the
      // updated row colors and recolors its canvas.
      instance.proxy.$forceUpdate();
    };

    // CSS colors passed to the pixel editor so it can tint each row. Returns
    // null when per-row colors are off (uniform fgColor). A pure black row
    // ($00) is nudged to near-black so the editor still counts those pixels
    // as "on" rather than reading them as the black background.
    const editorRowColors = (background) => {
      if (!pfColorsEnabled.value || !background.rowColors) {
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
      handleRowColorsInput, editorRowColors, isCollapsed, toggleCollapsed,
      zoom, editorWidth, backgroundRows, pfColorsEnabled};
  },
});
</script>
<style scoped>
/* max-width is set inline from the zoom factor. */

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
  top: 0;
  bottom: 0;
  width: 100%;
}

/* v-list-item's own default left padding stacks on top of v-card-text's,
   pushing the graphic card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. */
.entry-list-item {
  padding-left: 0;
}

/* Same layout as the Player tabs' collapse-button-plus-badge row
   (PlayerEditor.vue's .animation-id-row). */
.background-id-row {
  display: flex;
  align-items: center;
  gap: 4px;
}

/* Same placement/style as the Player tabs' "ID: N" badge above the
   "Animation name" field (PlayerEditor.vue's .animation-id-badge). */
.background-id-badge {
  text-align: left;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

.add-frame-buttom {
  bottom: 8px;
}

/* No drop shadow on floating (absolute-positioned) buttons - delete, add, etc. */
.v-btn--absolute {
  box-shadow: none !important;
}
</style>
