<template>
  <v-card @click="handleMouse" :ripple="false">
    <v-card-text>
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
    </v-card-text>
    <v-card-actions>
      <v-col>
        <v-row>
          <v-btn-toggle v-model="toggledTool">
            <v-btn
              title="Eraser"
              @click="editor.tool = eraser"
            >
              <v-icon>mdi-eraser</v-icon>
            </v-btn>
            <v-btn
              title="Pencil"
              @click="editor.tool = pencil"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
          </v-btn-toggle>
          <v-divider class="mx-4" vertical />
          <v-btn
            title="Undo"
            @click="() => editor.undo()"
          >
            <v-icon>mdi-undo</v-icon>
          </v-btn>
          <v-btn
            title="Redo"
            @click="() => editor.redo()"
          >
            <v-icon>mdi-redo</v-icon>
          </v-btn>

        </v-row>
        <v-row>
          <v-btn
            title="Export to image"
            @click="() => handleExportImage()"
          >
            <v-icon>mdi-export</v-icon>
          </v-btn>
          <v-btn
            title="Import from image"
            @click="() => handleImportImage()"
          >
            <v-icon>mdi-import</v-icon>
          </v-btn>

          <template>
            <div class="text-center">
              <v-menu
                v-model="heightMenuVisible"
                :close-on-content-click="false"
                offset-x
              >
                <template v-slot:activator="{ on, attrs }">
                  <v-btn
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
        </v-row>
      </v-col>
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
    name: {type: String, default: 'image'},
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
  methods: {
    handleMouse: debounce(function() {
      // eslint-disable-next-line no-invalid-this
      const pixels = this.getPixels();
      // eslint-disable-next-line no-invalid-this
      if (!isMatrixEqual(this.value, pixels)) {
        // eslint-disable-next-line no-invalid-this
        this.$emit('input', pixels);
      }
    }, 300),

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
      console.log('heightMenuValue', this.heightMenuValue);
      console.log('editor.height', this.editor.height);
      if (this.heightMenuValue < this.value.length) {
        pixels.length = this.heightMenuValue;
        this.editor.height = this.heightMenuValue;

        const canvas = this.$refs.editor;
        this.editor = new PixelEditor(canvas, this.width, this.heightMenuValue, this.pencil);

        this.setPixels(pixels);
      }

      this.heightMenuVisible = false;
    },

    createEmptyPixelMatrix() {
      return new Array(this.height).fill(0).map(() => new Array(this.width).fill(0));
    },

    getPixels() {
      const pixelMatrix = this.createEmptyPixelMatrix();
      this.editor.pixels.forEach((px) => {
        pixelMatrix[px.y][px.x] = px.color == this.fgColor ? 1 : 0;
      });
      return pixelMatrix;
    },
    setPixels(pixelMatrix) {
      pixelMatrix = pixelMatrix || this.createEmptyPixelMatrix();
      const editorPixels = [];
      pixelMatrix.forEach((line, y) => line.forEach((bit, x) => {
        editorPixels.push({x, y, color: bit ? this.fgColor : this.bgColor});
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

.proportion-wrapper {
  position: relative;
}
.proportion-wrapper-stretcher {
  width: 100%;
}
</style>
