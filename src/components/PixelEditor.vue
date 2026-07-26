<template>
  <v-card @click="handleMouse" :ripple="false">
    <v-card-text>
      <div class="editor-with-sidebar">
        <div v-if="$slots.sidebar" class="editor-sidebar">
          <slot name="sidebar" />
        </div>
        <div class="proportion-wrapper">
          <div
            class="proportion-wrapper-stretcher"
            :style="{'padding-bottom': 100 / aspectRatio + '%'}"
          />
          <canvas
            ref="editor"
            class="editor-canvas"
            @mousedown="handleMouse"
            @mouseenter="handleMouse"
            @mouseleave="handleMouse"
            @mouseup="handleMouse"
            @mousemove="handleMouse"
          />
        </div>
      </div>
    </v-card-text>
    <v-card-actions class="pixel-editor-tools">
      <div class="pixel-editor-toolbar-row">
          <v-btn-toggle v-model="toggledTool" borderless>
            <v-btn
              icon
              small
              title="Eraser"
              @click="editor.tool = eraser"
            >
              <v-icon>mdi-eraser</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Pencil"
              @click="editor.tool = pencil"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
          </v-btn-toggle>
          <v-divider class="mx-1" vertical />
          <v-btn
            icon
            small
            title="Undo"
            @click="() => editor.undo()"
          >
            <v-icon>mdi-undo</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Redo"
            @click="() => editor.redo()"
          >
            <v-icon>mdi-redo</v-icon>
          </v-btn>

          <v-divider class="mx-1" vertical />

          <v-btn
            icon
            small
            title="Export to image"
            @click="() => handleExportImage()"
          >
            <v-icon>mdi-export</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Import from image"
            @click="() => handleImportImage()"
          >
            <v-icon>mdi-import</v-icon>
          </v-btn>

          <template v-if="allowChangingHeight">
            <v-divider class="mx-1" vertical />

            <div class="text-center">
              <v-menu
                v-model="heightMenuVisible"
                :close-on-content-click="false"
                offset-x
              >
                <template v-slot:activator="{ on, attrs }">
                  <v-btn
                    text
                    small
                    class="pixel-editor-height-btn"
                    title="Set height"
                    v-bind="attrs"
                    v-on="on"
                    @click="heightMenuValue = value.length"
                  >
                    <v-icon>mdi-human-male-height-variant</v-icon>
                    {{value.length}}
                  </v-btn>
                </template>

                <v-card>
                  <v-list>
                    <v-list-item>
                      <v-list-item-content>
                        <v-list-item-title>Set height for this frame</v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>

                  <v-divider></v-divider>

                  <v-list>
                    <v-list-item>
                      <v-list-item-action>

                        <v-slider
                          v-model="heightMenuValue"
                          :min="1"
                          :max="64"
                          label="Height"
                          class="align-center"
                          style="width: 400px"
                        >
                          <template v-slot:append>
                            <v-text-field
                              v-model="heightMenuValue"
                              class="mt-0 pt-0"
                              type="number"
                              style="width: 60px"
                            ></v-text-field>
                          </template>
                        </v-slider>

                      </v-list-item-action>
                    </v-list-item>
                  </v-list>

                  <v-card-actions>
                    <v-spacer></v-spacer>

                    <v-btn
                      text
                      @click="heightMenuVisible = false"
                    >
                      Cancel
                    </v-btn>
                    <v-btn
                      color="primary"
                      text
                      @click="handleSetHeight()"
                    >
                      Set height
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-menu>
            </div>
          </template>
      </div>
    </v-card-actions>
  </v-card>
</template>
<script>
import {PixelEditor, Pencil} from '@curtishughes/pixel-editor';
import {chunk, debounce} from 'lodash';
import {saveAs} from 'file-saver';

import {isMatrixEqual} from '../utils/array';
import {getDateInfix} from '../utils/date';
import {loadImageFromFile, openFileDialog} from '../utils/file';
import {createResizedCanvas} from '../utils/image';

export default {
  props: {
    value: {type: Array, default: null},
    width: {type: Number, default: 32},
    height: {type: Number, default: 12},
    aspectRatio: {type: Number, default: 4.0 / 3},
    fgColor: {type: String, default: 'white'},
    bgColor: {type: String, default: 'black'},
    // Optional per-row CSS colors for "on" pixels (one entry per row). When
    // provided, each row's set pixels are drawn in its own color instead of
    // fgColor, so the playfield preview reflects the batari Basic pfcolors.
    rowColors: {type: Array, default: null},
    name: {type: String, default: 'image'},
    allowChangingHeight: {type: Boolean, default: true},
  },
  data() {
    return {
      pencil: new Pencil(this.fgColor),
      eraser: new Pencil(this.bgColor),

      heightMenuVisible: false,
      heightMenuValue: 0,

      toggledTool: 1,
    };
  },
  mounted() {
    const canvas = this.$refs.editor;
    this.editor = new PixelEditor(canvas, this.width, this.value.length, this.pencil);
    this.setPixels(this.value);
    this.handleMouse();

    // TODO: Just for testing
    window.isMatrixEqual = isMatrixEqual;
  },
  watch: {
    // Recolor the existing pixels when the row colors change (e.g. the user
    // picks a new color in the strip) without disturbing the drawn shape.
    rowColors() {
      if (this.editor) {
        this.setPixels(this.getPixels());
      }
    },
  },
  methods: {
    handleMouse: debounce(function() {
      // eslint-disable-next-line no-invalid-this
      const pixels = this.getPixels();
      // eslint-disable-next-line no-invalid-this
      if (!isMatrixEqual(this.value, pixels)) {
        // eslint-disable-next-line no-invalid-this
        this.$emit('input', pixels);
        // Pixels are drawn in the pencil's fixed color; recolor them so newly
        // drawn cells adopt their row color instead of staying the draw color.
        // eslint-disable-next-line no-invalid-this
        if (this.rowColors) {
          // eslint-disable-next-line no-invalid-this
          this.setPixels(pixels);
        }
      }
    }, 10),

    // The color used for an "on" pixel on the given row.
    onColorForRow(y) {
      return (this.rowColors && this.rowColors[y]) || this.fgColor;
    },

    handleExportImage() {
      // Adapted from https://stackoverflow.com/a/28305948/679240

      const canvas = document.createElement('canvas');
      canvas.width = this.editor.width;
      canvas.height = this.editor.height;

      const ctx = canvas.getContext('2d');

      this.editor.pixels.forEach((px) => {
        ctx.fillStyle = px.color;
        ctx.fillRect(px.x, px.y, 1, 1);
      });

      canvas.toBlob((blob) => {
        saveAs(blob, `${this.name}-${getDateInfix()}.png`);
      });
    },

    handleImportImage() {
      openFileDialog('image/*')
          .then(loadImageFromFile)
          .then((img) => {
            const canvas = createResizedCanvas(img, this.editor.width, this.editor.height);

            // Adapted from https://stackoverflow.com/a/667074/679240
            // Get the CanvasPixelArray from the given coordinates and dimensions.
            const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const imgPixels = imageData.data;

            // Loop over each pixel
            const pixelValues = [];
            for (let i = 0, n = imgPixels.length; i < n; i += 4) {
              const r = imgPixels[i]; // red
              const g = imgPixels[i + 1]; // green
              const b = imgPixels[i + 2]; // blue
              // i+3 is alpha (the fourth element)

              pixelValues.push((r + g + b) / 3);
            }

            const pixels = chunk(pixelValues.map((v) => v > 32 ? 1 : 0), canvas.width);
            this.setPixels(pixels);
          });
    },

    handleSetHeight() {
      this.heightMenuValue = this.heightMenuValue || 0;
      this.heightMenuValue = Math.max(1, Math.min(64, this.heightMenuValue));

      const pixels = this.getPixels();
      if (this.heightMenuValue != this.value.length) {
        pixels.length = this.heightMenuValue;
        for (let rowNumber = 0; rowNumber < pixels.length; rowNumber++) {
          if (!pixels[rowNumber]) {
            pixels[rowNumber] = new Array(this.editor.width).fill(0);
          }
        }

        this.editor.height = this.heightMenuValue;

        this.setPixels(pixels);
        this.$emit('input', pixels);

        this.$router.go(0);
      }

      this.heightMenuVisible = false;
    },

    createEmptyPixelMatrix() {
      return new Array(this.height).fill(0).map(() => new Array(this.width).fill(0));
    },

    getPixels() {
      const pixelMatrix = this.createEmptyPixelMatrix();
      this.editor.pixels.forEach((px) => {
        if (px.y >= pixelMatrix.length) return;
        // An "on" pixel is any that isn't the background color. Comparing
        // against fgColor would misread per-row colored pixels as empty.
        pixelMatrix[px.y][px.x] = px.color !== this.bgColor ? 1 : 0;
      });
      return pixelMatrix;
    },
    setPixels(pixelMatrix) {
      pixelMatrix = pixelMatrix || this.createEmptyPixelMatrix();
      const editorPixels = [];
      pixelMatrix.forEach((line, y) => line.forEach((bit, x) => {
        editorPixels.push({x, y, color: bit ? this.onColorForRow(y) : this.bgColor});
      }));
      this.editor.set(editorPixels);
    },
  },
};
</script>
<style scoped>
.editor-canvas {
  image-rendering: optimizeSpeed;             /* Older versions of FF          */
  image-rendering: -moz-crisp-edges;          /* FF 6.0+                       */
  image-rendering: -webkit-optimize-contrast; /* Safari                        */
  image-rendering: -o-crisp-edges;            /* OS X & Windows Opera (12.02+) */
  image-rendering: pixelated;                 /* Awesome future-browsers       */
  -ms-interpolation-mode: nearest-neighbor;   /* IE                            */

  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  height: 100%;

  border: 1px solid;
}

/* Vuetify's default v-card-text padding leaves a wide gap between the canvas
   and the toolbar below it; tighten it to a consistent 8px. */
.v-card >>> .v-card__text {
  padding-bottom: 8px;
}

.pixel-editor-tools {
  padding-top: 0;
}

/* Lays the optional color sidebar beside the canvas. align-items: stretch makes
   the sidebar exactly as tall as the canvas, so its rows line up 1:1. */
.editor-with-sidebar {
  display: flex;
  align-items: stretch;
}

.editor-sidebar {
  flex: 0 0 auto;
  display: flex;
}

.proportion-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
.proportion-wrapper-stretcher {
  width: 100%;
}

/* Flat icon buttons: no grey box, no elevation, and a hit area only a little
   larger than the icon itself. */
.pixel-editor-tools >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0 1px;
}

/* Vuetify paints its own grey hover/focus overlay here, which is the box we
   are removing; the states below replace it. */
.pixel-editor-tools >>> .v-btn::before {
  display: none;
}

/* Vuetify makes button icons inherit the button colour at a higher
   specificity, so these need to be forced. */
.pixel-editor-tools >>> .v-btn .v-icon {
  font-size: 19px;
  color: rgba(0, 0, 0, 0.55) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.pixel-editor-tools >>> .v-btn:hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.pixel-editor-tools >>> .v-btn:active .v-icon {
  transform: scale(0.82);
}

/* The selected drawing tool, which previously read as the pressed grey box. */
.pixel-editor-tools >>> .v-btn.v-btn--active .v-icon {
  color: #1976d2 !important;
}

/* This one also shows the height next to its icon, so it needs the extra room. */
.pixel-editor-tools >>> .v-btn.pixel-editor-height-btn {
  width: auto;
  min-width: 0;
  padding: 0 2px;
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.55);
}

.pixel-editor-tools >>> .v-btn.pixel-editor-height-btn .v-icon {
  font-size: 16px;
}

.pixel-editor-tools >>> .v-btn.pixel-editor-height-btn:hover {
  color: rgba(0, 0, 0, 0.87);
}

/* A plain flex row instead of Vuetify's v-row/v-col: their grid negative
   margins are meant for full-width layouts and wrap prematurely in this
   narrow, fixed-width card even when the buttons would otherwise fit. */
.pixel-editor-toolbar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  padding: 0 8px;
}

.pixel-editor-tools >>> .v-btn-toggle {
  background-color: transparent !important;
}
</style>
