<template>
  <v-btn
    icon
    small
    :title="value ? 'Hide pixel grid' : 'Show pixel grid'"
    class="pixel-grid-toggle-btn"
    :class="{'pixel-grid-toggle-btn-active': value}"
    @click="$emit('input', !value)"
  >
    <v-icon>mdi-grid</v-icon>
  </v-btn>
</template>
<script>
// Shared by PlayerEditor.vue and BackgroundEditor.vue, sitting right next to
// their own <editor-zoom> control - both bind this to the SAME app-wide
// preference (usePixelGridOverlayStorage in hooks/project.js), not a
// per-tab local value, so toggling it on one tab shows/hides the grid on
// the other too.
export default {
  props: {
    value: {type: Boolean, default: false},
  },
};
</script>
<style scoped>
/* Same flat-icon, fade-in-on-hover/blue-when-active color pattern as every
   other icon button in the app (e.g. Project.vue's own
   .project-flat-icon-btn) - transparent background, no ripple overlay,
   faint grey at rest, near-black on hover, and the app's own blue while the
   grid overlay is actually on (a genuine toggle state, unlike those other
   buttons' own transient "press" flash). */
.pixel-grid-toggle-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  margin-left: 4px;
}

.pixel-grid-toggle-btn::before {
  display: none;
}

.pixel-grid-toggle-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.pixel-grid-toggle-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.pixel-grid-toggle-btn-active >>> .v-icon {
  color: #1976d2 !important;
}
</style>
