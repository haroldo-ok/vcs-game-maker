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
            title="Copy"
            @click="() => editor.redo()"
          >
            <v-icon>mdi-content-copy</v-icon>
          </v-btn>
          <v-btn
            title="Paste"
            @click="() => editor.redo()"
          >
            <v-icon>mdi-content-paste</v-icon>
          </v-btn>

        </v-row>
      </v-col>
    </v-card-actions>
  </v-card>
</template>
<script>
import {PixelEditor, Pencil} from '@curtishughes/pixel-editor';
import {debounce} from 'lodash';

import {isMatrixEqual} from '../utils/array';

export default {
  props: {
    value: {type: Array, default: null},
    width: {type: Number, default: 32},
    height: {type: Number, default: 12},
    aspectRatio: {type: Number, default: 4.0 / 3},
    fgColor: {type: String, default: 'white'},
    bgColor: {type: String, default: 'black'},
  },
  data() {
    return {
      pencil: new Pencil(this.fgColor),
      eraser: new Pencil(this.bgColor),
      toggledTool: 1,
    };
  },
  mounted() {
    const canvas = this.$refs.editor;
    this.editor = new PixelEditor(canvas, this.width, this.height, this.pencil);
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
