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

/* Matches PixelGridToggle.vue's own icon button - v-btn only shows
   "cursor: pointer" while enabled, so a zoomed-all-the-way-in/out button
   (canZoomIn/canZoomOut false) still correctly falls back to the default
   cursor instead of a misleading hand on a button that can't be clicked.
   "!important" because Vuetify's own .v-btn rules (loaded after this
   component's scoped style in the final bundle) set their own "cursor"
   value with matching or higher specificity otherwise - same reasoning
   every other Vuetify-button-state override in this app already needs it
   for (see e.g. Project.vue's own flat-icon-btn color states).
   Also targets the v-icon glyph explicitly, not just the button itself -
   the icon fills almost the entire clickable area, so it's what the
   mouse is actually over for most of the hover; "cursor" is inherited by
   default, but the MDI icon font's own base rules were still winning
   there specifically, leaving the arrow cursor showing even with the
   button's own cursor already fixed above. */
.editor-zoom >>> .v-btn:not(.v-btn--disabled),
.editor-zoom >>> .v-btn:not(.v-btn--disabled) .v-icon {
  cursor: pointer !important;
}
</style>
