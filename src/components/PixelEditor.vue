<template>
  <div>
    <canvas ref="editor" class="editor-canvas" />
    <button @click="editor.tool = eraser">Eraser</button>
    <button @click="editor.tool = pencil">Pencil</button>
    <button @click="() => editor.undo()">Undo</button>
    <button @click="() => editor.redo()">Redo</button>
  </div>
</template>
<script>
import {PixelEditor, Pencil} from '@curtishughes/pixel-editor';

export default {
  data() {
    return {
      pencil: new Pencil('black'),
      eraser: new Pencil(),
    };
  },
  mounted() {
    const canvas = this.$refs.editor;
    this.editor = new PixelEditor(canvas, 64, 64, this.pencil);
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
}
</style>
