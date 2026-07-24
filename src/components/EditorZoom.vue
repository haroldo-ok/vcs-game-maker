<template>
  <div class="editor-zoom">
    <v-btn
      icon
      small
      title="Zoom out"
      :disabled="!canZoomOut"
      @click="step(-1)"
    >
      <v-icon>mdi-magnify-minus-outline</v-icon>
    </v-btn>
    <span class="editor-zoom-label">{{ Math.round(value * 100) }}%</span>
    <v-btn
      icon
      small
      title="Zoom in"
      :disabled="!canZoomIn"
      @click="step(1)"
    >
      <v-icon>mdi-magnify-plus-outline</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {defineComponent} from '@vue/composition-api';

import {ZOOM_LEVELS, stepZoom} from '../hooks/zoom';

export default defineComponent({
  props: {
    value: {type: Number, default: 1},
  },
  computed: {
    canZoomIn() {
      return this.value < ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    },
    canZoomOut() {
      return this.value > ZOOM_LEVELS[0];
    },
  },
  methods: {
    step(direction) {
      this.$emit('input', stepZoom(this.value, direction));
    },
  },
});
</script>
<style scoped>
.editor-zoom {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.editor-zoom-label {
  min-width: 4em;
  text-align: center;
  font-variant-numeric: tabular-nums;
}
</style>
