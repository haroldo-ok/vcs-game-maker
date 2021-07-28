<template>
  <div @click="handleMouse">
    <div class="proportion-wrapper">
      <div class="proportion-wrapper-stretcher" />
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
    <button @click="editor.tool = eraser">Eraser</button>
    <button @click="editor.tool = pencil">Pencil</button>
    <button @click="() => editor.undo()">Undo</button>
    <button @click="() => editor.redo()">Redo</button>
  </div>
</template>
<script>
import {PixelEditor, Pencil} from '@curtishughes/pixel-editor';
import {debounce} from 'lodash';

export default {
  props: {
    value: {
      type: Array,
      default: null,
    },
  },
  data() {
    return {
      pencil: new Pencil('black'),
      eraser: new Pencil(),
    };
  },
  mounted() {
    const canvas = this.$refs.editor;
    this.editor = new PixelEditor(canvas, 32, 12, this.pencil);
  },
  methods: {
    handleMouse: debounce(function() {
      console.info('Mouse event');
    }, 300),
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
}

.proportion-wrapper {
  position: relative;
  max-width: 320px;
}
.proportion-wrapper-stretcher {
  width: 100%;
  padding-bottom: 75%;
}
</style>
