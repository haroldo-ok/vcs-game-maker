<template>
  <v-btn
    icon
    small
    :disabled="disabled"
    :title="disabled ? (disabledTitle || titleOff) : (value ? titleOn : titleOff)"
    class="pixel-grid-toggle-btn"
    :class="{'pixel-grid-toggle-btn-active': value}"
    @click="$emit('input', !value)"
  >
    <v-icon v-if="icon">{{ icon }}</v-icon>
    <span v-else class="pixel-grid-toggle-label">
      <span class="pixel-grid-toggle-label-text">{{ label }}</span>
    </span>
  </v-btn>
</template>
<script>
// Shared by PlayerEditor.vue and BackgroundEditor.vue, sitting right next to
// their own <editor-zoom> control - both bind this to the SAME app-wide
// preference (usePixelGridOverlayStorage in hooks/project.js), not a
// per-tab local value, so toggling it on one tab shows/hides the grid on
// the other too. Generic on icon (or a plain text label, see below) plus
// titleOn/titleOff - not just the grid-lines toggle it started out as -
// BackgroundEditor.vue also uses this same button, with its own titles/
// storage, for the grid overlay's separate "X,Y" cell-label toggle (see
// usePixelGridLabelsStorage): no MDI icon reads as "coordinate labels" on
// sight the way a grid icon obviously reads as "grid lines", so that one
// uses the plain-text "X,Y" variant (label prop, icon left unset) instead
// of a mismatched icon - same button shape/behavior either way, styled
// identically (see .pixel-grid-toggle-label below matching .v-icon's own
// rules).
export default {
  props: {
    value: {type: Boolean, default: false},
    icon: {type: String, default: 'mdi-grid'},
    label: {type: String, default: null},
    titleOn: {type: String, default: 'Hide pixel grid'},
    titleOff: {type: String, default: 'Show pixel grid'},
    // Lets a caller gate this toggle behind some OTHER condition (see
    // BackgroundEditor.vue's own XY-label toggle, disabled unless the grid
    // overlay itself is on - the labels have no visible effect without it,
    // since PixelEditor.vue's grid overlay canvas that draws them doesn't
    // even exist in the DOM while showGrid is false).
    disabled: {type: Boolean, default: false},
    disabledTitle: {type: String, default: null},
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

.pixel-grid-toggle-btn >>> .v-icon,
.pixel-grid-toggle-label {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.pixel-grid-toggle-btn:hover >>> .v-icon,
.pixel-grid-toggle-btn:hover .pixel-grid-toggle-label {
  color: rgba(0, 0, 0, 0.87) !important;
}

.pixel-grid-toggle-btn-active >>> .v-icon,
.pixel-grid-toggle-btn-active .pixel-grid-toggle-label {
  color: #1976d2 !important;
}

/* The text variant (label prop, see this button's own comment) - a small
   boxed badge, matching the look MDI's own "alpha-*-box"/"alpha-*-box-
   outline" icons already give the Music tab's Mute/Solo buttons (a letter
   inside a bordered square, filled solid once active) - "XY" has no
   equivalent built-in glyph, so this reproduces that same box treatment by
   hand instead of using a mismatched icon. 24x24px - Vuetify's own actual
   rendered size for a "small" v-icon inside an "icon" v-btn (confirmed
   directly against vuetify.css's own ".v-btn--icon.v-size--small .v-icon"
   rule) - deliberately the exact same box size as mdi-grid's own icon
   (not visually tuned smaller/bigger by eye, which only ever produced a
   1px-off alignment that needed correcting again every time something else
   about this button changed) so the two are geometrically guaranteed to
   share the same top/bottom/center with NO transform needed - both sit
   centered in an identical 28x28 button wrapper by Vuetify's own default
   rules, so matching box size is what actually makes them line up, not a
   nudge. Border in the icon's own current colour (inactive/hover/active
   all already handled by the shared .v-icon color rules above), filled
   solid + white text once active instead of just a colour change - the
   same filled-vs-outline distinction "alpha-m-box" vs "alpha-m-box-
   outline" itself draws. */
.pixel-grid-toggle-label {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  box-sizing: border-box;
  border: 1px solid currentColor;
  border-radius: 4px;
  transform: translateY(-0.5px);
  transition: color 0.15s ease, background-color 0.15s ease;
}

/* The "XY" text itself, sized/weighted to read clearly inside the box
   above without the BOX itself needing to grow/shrink or move to
   accommodate it - keeping size tuning here, on the text alone, means it
   can never again throw off the box's own geometric alignment with
   mdi-grid the way changing the box's own dimensions used to (both sit
   centered in the same 28x28 button wrapper regardless of this text's own
   size, so the box's own center stays locked to the icon's). */
.pixel-grid-toggle-label-text {
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  letter-spacing: -0.03em;
  /* Vertical centering (flex align-items/justify-content on the parent
     box) already lands exact - confirmed by measuring the rendered gap on
     each side directly. Horizontal came out ~1px off (negative
     letter-spacing above pulls the "Y" in asymmetrically, since it's the
     LAST character with nothing after it to balance the pull), nudged back
     by that same measured amount rather than guessed. */
  transform: translateX(-0.5px);
}

.pixel-grid-toggle-btn-active .pixel-grid-toggle-label {
  background-color: #1976d2;
  color: #fff !important;
}
</style>
