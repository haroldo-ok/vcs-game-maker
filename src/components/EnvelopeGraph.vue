<template>
  <div class="envelope-graph-wrapper">
    <div class="envelope-graph" ref="container">
      <!-- Total Attack+Decay+Sustain+Release frame count - same visual
           style as the Atk/Dec/Sus/Rel stage labels below, just centered
           above the graph instead of under one specific segment, since it
           describes the envelope as a whole rather than any one stage. -->
      <span class="envelope-graph-frame-label">{{ totalUnits }} frames</span>
      <div class="envelope-graph-scale">
        <span
          v-for="tick in scaleTicks"
          v-bind:key="tick"
          class="envelope-graph-scale-tick"
          :style="{top: (100 - tick) + '%'}"
        >{{ tick }}</span>
      </div>
      <!-- Exactly two kinds of vertical line: one at each user-editable
           dot's CURRENT position (attack/decay/release-start - the
           three draggable handles below), and one above each stage
           LABEL's position (see labelXPercents/labelStyle - same
           midpoint each label itself centers on). -->
      <div class="envelope-graph-current-line" :style="{left: attackX + '%'}" />
      <div class="envelope-graph-current-line" :style="{left: decayX + '%'}" />
      <div class="envelope-graph-current-line" :style="{left: sustainEndX + '%'}" />
      <div
        v-for="x in labelXPercents"
        v-bind:key="'label' + x"
        class="envelope-graph-snap-line envelope-graph-snap-line-vertical"
        :style="{left: x + '%'}"
      />
      <svg
        class="envelope-graph-svg"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        <polyline class="envelope-graph-line" :points="polylinePoints" />
      </svg>
      <!-- Grabs the Sustain segment itself (not either endpoint dot) -
           vertical-only drag that shifts Decay End and Release Start
           TOGETHER by the same amount, keeping whatever slope/shape the
           ramp between them already had rather than pivoting around one
           fixed end the way dragging either dot alone does. Placed BEFORE
           the decay/release dots below (not after) so those dots still
           paint on top of this band and stay independently grabbable at
           their exact position, even though this band's hit area
           spans the full height underneath them. Only shown alongside them
           (sustainLength > 0) - with no Sustain segment to speak of, there's
           nothing here to grab. -->
      <div
        v-if="sustainLength > 0"
        class="envelope-graph-sustain-drag"
        :style="{left: decayX + '%', width: (sustainEndX - decayX) + '%'}"
        title="Sustain - drag vertically to shift Decay End and Release Start together"
        @mousedown="startDrag('sustainShift', $event)"
      />
      <!-- Every vertex gets a dot (matching the classic ADSR diagram's
           corners), but only the three whose position actually maps to a
           DRAGGABLE field are draggable - the start (always silence at time
           0) is a fixed reference point only; Sustain's end IS a real
           editable value now (sustainLength), but only via the dropdown
           (see SoundFXEditor.vue), not by dragging, so it stays undraggable
           here too. -->
      <div class="envelope-graph-dot envelope-graph-dot-static" :style="dotStyle(0, 0)" />
      <div
        class="envelope-graph-dot envelope-graph-dot-handle"
        :style="dotStyle(attackX, 100)"
        title="Attack - drag to change how many frames it takes to reach full volume"
        @mousedown="startDrag('attack', $event)"
      />
      <!-- decayX equals attackX whenever decay is 0 (see its
           computed) - without this guard, this dot sat exactly on top of
           the Attack dot above, reading as one oddly-thick point instead
           of a genuine vertex on the curve. Decay is still editable either
           way (see SoundFXEditor.vue's dropdown field for it) - this
           only hides the redundant on-graph handle for it. -->
      <div
        v-if="decay > 0"
        class="envelope-graph-dot envelope-graph-dot-handle"
        :style="dotStyle(decayX, decayEndPercent)"
        title="Decay/Decay End - drag horizontally to change Decay, vertically to change the Decay End level"
        @mousedown="startDrag('decaySustain', $event)"
      />
      <!-- sustainEndX equals decayX whenever sustainLength is 0 (same
           overlapping-vertex reasoning as the decaySustain dot's
           guard above, and the same condition the "Sus" label just below
           already uses) - Release is still editable either way (see
           SoundFXEditor.vue's dropdown field for it), this only hides
           the redundant on-graph handle for it. -->
      <div
        v-if="sustainLength > 0"
        class="envelope-graph-dot envelope-graph-dot-handle"
        :style="dotStyle(sustainEndX, releaseStartPercent)"
        title="Release/Release Start - drag horizontally to change Release, vertically to change the Release Start level"
        @mousedown="startDrag('release', $event)"
      />
      <!-- Always sits at the graph's  right edge (releaseX is 100% by
           construction - totalUnits is defined as the sum that includes
           release, so this dot can never actually move away from the edge
           no matter what release is set to) - a fixed reference point for
           "the sound ends here", exactly like the static dot at (0, 0)
           marks "the sound starts here". Not draggable: an earlier version
           made this one draggable too, which did nothing but visually snap
           straight back to the edge on every drag update, since its
           position can't respond to the value dragging it would produce. -->
      <div class="envelope-graph-dot envelope-graph-dot-static" :style="dotStyle(releaseX, 0)" />
      <!-- Positioned under each segment's  midpoint (not evenly spaced
           regardless of actual segment width) so a label always sits under
           the part of the curve it actually names. -->
      <span class="envelope-graph-stage-label" :style="labelStyle(0, attackX)">Atk</span>
      <span v-if="decay > 0" class="envelope-graph-stage-label" :style="labelStyle(attackX, decayX)">Dec</span>
      <span v-if="sustainLength > 0" class="envelope-graph-stage-label" :style="labelStyle(decayX, sustainEndX)">Sus</span>
      <span class="envelope-graph-stage-label" :style="labelStyle(sustainEndX, releaseX)">Rel</span>
    </div>
  </div>
</template>
<script>
import {defineComponent} from '@vue/composition-api';
import {ENVELOPE_STAGE_FRAME_OPTIONS, ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS,
  ENVELOPE_VOLUME_PERCENT_OPTIONS} from '../blocks/soundfx';

// Purely a visual shape indicator (straight ramp lines matching the classic
// ADSR diagram/FL Studio's Fruity Envelope Controller reference), not a
// sample-accurate plot of utils/envelope.js's  discretized AUDV-per-frame
// curve - a smooth ramp reads more clearly at this size than a coarse,
// stair-stepped one would, and the actual runtime curve is already governed
// by the same attack/decay/sustain/release numbers this draws from, so the
// two can never disagree on SHAPE, only on how many discrete steps make up
// each ramp.
//
export default defineComponent({
  props: {
    attack: {type: Number, required: true},
    decay: {type: Number, required: true},
    decayEndPercent: {type: Number, required: true},
    sustainLength: {type: Number, required: true},
    releaseStartPercent: {type: Number, required: true},
    release: {type: Number, required: true},
  },
  data() {
    return {
      dragHandle: null,
      dragStartX: 0,
      dragStartY: 0,
      dragStartValues: null,
      // 0-100%, this preset's peak volume - see the class-level comment
      // on ENVELOPE_VOLUME_PERCENT_OPTIONS in blocks/soundfx.js for why
      // Decay End/Release Start (and so this whole graph's Y axis) are a
      // percentage of that, not a raw AUDV value.
      scaleTicks: [100, 75, 50, 25, 0],
    };
  },
  computed: {
    // Sustain could always be assumed nonzero here before (a fixed visual
    // width stood in for its real, always-"however long is left"
    // length) - now that it's a real length that can genuinely be 0, all
    // four stages can be 0 at once (an instant, silent "click"). totalUnits
    // still floors at 1 for that case (so this doesn't divide by zero), but
    // releaseX itself needs its explicit 100% fallback below - dividing
    // a zero sum by that floor would otherwise land it at 0%, breaking the
    // static "sound ends here" dot's invariant (other code assumes it
    // always sits exactly at the right edge - see its template comment).
    totalUnits() {
      return Math.max(1, this.attack + this.decay + this.sustainLength + this.release);
    },
    attackX() {
      return this.attack / this.totalUnits * 100;
    },
    decayX() {
      return (this.attack + this.decay) / this.totalUnits * 100;
    },
    sustainEndX() {
      return (this.attack + this.decay + this.sustainLength) / this.totalUnits * 100;
    },
    releaseX() {
      const total = this.attack + this.decay + this.sustainLength + this.release;
      return total === 0 ? 100 : (total / this.totalUnits * 100);
    },
    // Same midpoints labelStyle itself centers each of the 4 stage labels
    // on (see the template's  labelStyle calls) - one vertical line
    // above each label, reusing that exact math rather than duplicating a
    // second copy of it.
    labelXPercents() {
      return [
        (0 + this.attackX) / 2,
        (this.attackX + this.decayX) / 2,
        (this.decayX + this.sustainEndX) / 2,
        (this.sustainEndX + this.releaseX) / 2,
      ].map((mid) => Math.max(6, Math.min(94, mid)));
    },
    // SVG y=0 is the TOP, so every level here is (100 - percent) to make
    // "100%" (peak volume) draw at the top and "0%" (silence) at the
    // bottom, matching the reference diagram's  Amplitude axis.
    polylinePoints() {
      // No flat Sustain plateau anymore - decayEndPercent and
      // releaseStartPercent are two independently settable endpoints, so
      // the straight line this draws between them already IS the Sustain
      // ramp, same as every other stage here is just a straight line
      // between its two endpoints.
      const pts = [
        [0, 100],
        [this.attackX, 0],
        [this.decayX, 100 - this.decayEndPercent],
        [this.sustainEndX, 100 - this.releaseStartPercent],
        [this.releaseX, 100],
      ];
      return pts.map(([x, y]) => `${x},${y}`).join(' ');
    },
  },
  methods: {
    dotStyle(xPercent, yPercent) {
      return {left: `${xPercent}%`, top: `${100 - yPercent}%`};
    },
    // Centers a label under its  segment's midpoint, clamped so a very
    // narrow (or zero-length, e.g. Decay/Release set to 0 frames) segment's
    // label still stays fully inside the graph instead of clipping off one
    // edge.
    labelStyle(startPercent, endPercent) {
      const mid = (startPercent + endPercent) / 2;
      return {left: `${Math.max(6, Math.min(94, mid))}%`};
    },
    // Snaps a raw value to whichever entry in `options` is numerically
    // closest - shared by every drag handler below so dragging always lands
    // on the same small, fixed value set the dropdowns themselves offer
    // (see blocks/soundfx.js's  comment on why those stay bounded), just
    // reached by dragging instead of picking from a list.
    snapTo(options, value) {
      return options.reduce((closest, option) =>
        Math.abs(option - value) < Math.abs(closest - value) ? option : closest, options[0]);
    },
    startDrag(handle, event) {
      // Without this, the browser's  default mousedown behavior (text
      // selection, or - since this card sits in a click-and-drag reorderable
      // list, see hooks/drag-reorder.js - being misread as the start of a
      // native drag gesture on some ancestor) fires alongside this custom
      // drag, which is what made dragging a dot feel like it was dragging
      // the whole card instead.
      event.preventDefault();
      event.stopPropagation();
      this.dragHandle = handle;
      this.dragStartValues = {attack: this.attack, decay: this.decay,
        decayEndPercent: this.decayEndPercent, releaseStartPercent: this.releaseStartPercent, release: this.release};
      // Only 'sustainShift' (below) actually reads this - it drags by
      // RELATIVE amount (both Decay End and Release Start shift together by
      // the same delta) rather than snapping straight to the cursor's
      // absolute position the way every other handle here does, so it needs
      // to know where the drag itself started, not just where the values
      // started.
      const container = this.$refs.container;
      const rect = container && container.getBoundingClientRect();
      this.dragStartY = rect && rect.height ? Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) /
        rect.height * 100)) : 0;
      window.addEventListener('mousemove', this.onDrag);
      window.addEventListener('mouseup', this.stopDrag);
    },
    onDrag(event) {
      const container = this.$refs.container;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      const xPercent = Math.max(0, Math.min(100, (event.clientX - rect.left) / rect.width * 100));
      const yPercent = Math.max(0, Math.min(100, 100 - (event.clientY - rect.top) / rect.height * 100));
      const totalUnits = this.totalUnits;
      const xUnits = xPercent / 100 * totalUnits;
      if (this.dragHandle === 'attack') {
        const attack = this.snapTo(ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS, xUnits);
        this.$emit('update:attack', attack);
      } else if (this.dragHandle === 'decaySustain') {
        const decay = this.snapTo(ENVELOPE_STAGE_FRAME_OPTIONS, Math.max(0, xUnits - this.attack));
        const decayEndPercent = this.snapTo(ENVELOPE_VOLUME_PERCENT_OPTIONS, yPercent);
        this.$emit('update:decay', decay);
        this.$emit('update:decayEndPercent', decayEndPercent);
      } else if (this.dragHandle === 'release') {
        // This handle sits at sustainEndX, which - unlike attack/decay's
        // handles - ISN'T measured from x=0: it's measured from the
        // FIXED right edge (releaseX is always exactly 100%, see the
        // now-static dot there), moving LEFT as Release grows. Reusing the
        // same "distance from 0" shape the other two handles use would
        // make Release move the WRONG way (and, at Release's  minimum
        // of 0 - where this handle starts out coinciding with that fixed
        // edge - never move at all): dragging left has to mean "release
        // starts earlier, so it's LONGER", not shorter. `totalUnits - xUnits`
        // is exactly that distance, measured from wherever the cursor
        // lands back to the fixed edge, using this frame's  totalUnits
        // (already stale by the time it's applied, same as every other
        // handle here - the next mousemove's  fresh totalUnits corrects
        // it, same self-correcting approximation decaySustain's  drag
        // already relies on).
        const release = this.snapTo(ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS, Math.max(0, totalUnits - xUnits));
        const releaseStartPercent = this.snapTo(ENVELOPE_VOLUME_PERCENT_OPTIONS, yPercent);
        this.$emit('update:release', release);
        this.$emit('update:releaseStartPercent', releaseStartPercent);
      } else if (this.dragHandle === 'sustainShift') {
        // Relative, not absolute - unlike every other handle here, which
        // snaps straight to wherever the cursor itself is, this one shifts
        // BOTH values by how far the cursor has moved from where the drag
        // itself started (dragStartY), preserving whatever gap the ramp
        // already had between them instead of collapsing it onto the
        // cursor's position. Each is still clamped/snapped
        // independently, so if one hits 0 or 100 first it simply stops
        // there while the other keeps moving - no attempt to keep a FIXED
        // gap once a bound is hit, the same "independent, not rigidly
        // coupled" simplicity snapTo's shared use elsewhere already accepts.
        const delta = yPercent - this.dragStartY;
        const decayEndPercent = this.snapTo(ENVELOPE_VOLUME_PERCENT_OPTIONS,
            Math.max(0, Math.min(100, this.dragStartValues.decayEndPercent + delta)));
        const releaseStartPercent = this.snapTo(ENVELOPE_VOLUME_PERCENT_OPTIONS,
            Math.max(0, Math.min(100, this.dragStartValues.releaseStartPercent + delta)));
        this.$emit('update:decayEndPercent', decayEndPercent);
        this.$emit('update:releaseStartPercent', releaseStartPercent);
      }
    },
    stopDrag() {
      this.dragHandle = null;
      window.removeEventListener('mousemove', this.onDrag);
      window.removeEventListener('mouseup', this.stopDrag);
    },
  },
  beforeDestroy() {
    window.removeEventListener('mousemove', this.onDrag);
    window.removeEventListener('mouseup', this.stopDrag);
  },
});
</script>
<style scoped>
.envelope-graph-wrapper {
  display: flex;
  width: 100%;
  gap: 4px;
  /* Bumped from 4px - the frame-count label (.envelope-graph-frame-label)
     sits absolutely positioned just above the graph's top edge, which at
     the old 4px left it overlapping SoundFXEditor.vue's Reset/Undo/Redo
     toolbar row directly above. */
  margin-top: 16px;
  /* Breathing room from whatever follows (e.g. SoundFXEditor.vue's
     Delete button row, which sits flush with zero top padding) - without
     this the graph's bottom edge and the next control below it touch
     directly, reading as an overlap even though nothing actually overlaps
     in the DOM. */
  margin-bottom: 8px;
}

/* 0-100%, not a raw AUDV value - Decay End/Release Start (and so this whole
   graph) are always a percentage of this preset's peak volume, matching how
   ENVELOPE_VOLUME_PERCENT_OPTIONS itself is defined (see blocks/
   soundfx.js). Sits INSIDE the graph now, just past the left border,
   overlaid on the curve/grid rather than its separate column outside
   the frame - each tick is absolutely positioned (see
   envelope-graph-scale-tick below) rather than flex "space-between" - a
   plain span's ~22px line-height meant 5 of them (110px) didn't fit
   this 90px-tall column, so "space-between" silently grew the container
   and pushed every tick below "100" progressively lower than its real
   gridline. */
.envelope-graph-scale {
  position: absolute;
  left: 6px;
  top: 0;
  /* Explicit height (matching .envelope-graph's) rather than the
     top:0/bottom:0 stretch trick other absolutely-positioned children here
     use - this element's text content gives it an intrinsic height
     that top:0/bottom:0 alone doesn't override, which was making its
     ticks' percentage "top" values resolve against the wrong (much
     taller) containing block. */
  height: 90px;
  width: 20px;
  font-size: 10px;
  text-align: left;
  pointer-events: none;
}

.envelope-graph-scale-tick {
  position: absolute;
  left: 0;
  /* Same flat grey as the x-axis stage labels (see
     .envelope-graph-stage-label below) - a real color, not opacity, so it
     doesn't also dilute the white outline below. */
  color: #666;
  /* Crisp 1px white outline at full opacity - -webkit-text-stroke draws a
     real stroke (paint-order puts it BEHIND the fill) rather than the
     softer, easy-to-miss-at-10px look stacked text-shadows gave at this
     font size. */
  -webkit-text-stroke: 3px #fff;
  paint-order: stroke fill;
  transform: translateY(-50%);
}

.envelope-graph {
  position: relative;
  flex: 1 1 auto;
  height: 90px;
  margin-bottom: 16px;
  /* Same repeating-linear-gradient grid technique MusicEditor.vue's
     piano roll uses for its time-division lines (see sliceGridImage) -
     reused here so the two read as the same visual language. Horizontal
     only (vertical snap lines are real, reactive divs below - see
     snapGridXPercents - since Attack/Decay/Release's snap positions
     shift as the shape changes, unlike Sustain's fixed 0/25/50/75/100%). */
  background-image: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.06) 0,
    rgba(0, 0, 0, 0.06) 1px, transparent 1px, transparent 25%);
  /* Same frame as MusicEditor.vue's .piano-roll-scroll (the piano
     roll's outer border) - matches App.vue's darkened card-border color
     rather than Vuetify's lighter default, so this reads as the same kind
     of "framed panel" the piano roll already establishes. */
  border: 1px solid rgba(0, 0, 0, 0.24);
  border-radius: 2px;
  overflow: visible;
}

.envelope-graph-svg {
  width: 100%;
  height: 100%;
  display: block;
  /* Positioned (not just static/in-flow) so its  stacking is decided by
     DOM order against .envelope-graph-scale, same as every other
     absolutely-positioned sibling here - without this, a static element
     always paints BELOW any positioned sibling regardless of source order,
     which was putting the curve behind the y-axis text even after removing
     that text's z-index. */
  position: relative;
}

.envelope-graph-snap-line-vertical {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(0, 0, 0, 0.1);
}

/* One per draggable dot (Attack/Decay/Release-start), at its  CURRENT
   position - stronger than the snap grid above so it reads as "this dot is
   here" rather than "you could snap here". */
.envelope-graph-current-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(25, 118, 210, 0.35);
  pointer-events: none;
}

.envelope-graph-line {
  fill: none;
  stroke: #1976d2;
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

/* Invisible hit area over the Sustain segment, spanning its full height
   (not just a thin strip around the line itself) so it's easy to grab
   without needing to land precisely on a diagonal line - see this
   element's template comment for why it's a vertical-only drag rather
   than a third positioned dot. ns-resize (not grab/grabbing like the dots)
   communicates up-front that this only moves vertically, before the user
   even starts dragging. */
.envelope-graph-sustain-drag {
  position: absolute;
  top: 0;
  bottom: 0;
  cursor: ns-resize;
}

.envelope-graph-sustain-drag:hover {
  background: rgba(25, 118, 210, 0.08);
}

.envelope-graph-dot {
  position: absolute;
  width: 8px;
  height: 8px;
  margin-left: -4px;
  margin-top: -4px;
  border-radius: 50%;
}

.envelope-graph-dot-static {
  background: white;
  border: 2px solid #1976d2;
  /* A static dot can end up sitting at the exact same position as a
     draggable one (e.g. the fixed release-end dot coincides with the
     draggable release-start dot whenever Release is 0) - without this, the
     static dot (painted on top, since it's later in the DOM) swallows the
     mousedown meant for the handle underneath it, making that handle
     undraggable at exactly that value. Static dots never have their
     listeners, so this is always safe. */
  pointer-events: none;
}

.envelope-graph-dot-handle {
  width: 10px;
  height: 10px;
  margin-left: -5px;
  margin-top: -5px;
  background: #1976d2;
  border: 2px solid white;
  cursor: grab;
}

.envelope-graph-dot-handle:active {
  cursor: grabbing;
}

.envelope-graph-stage-label {
  position: absolute;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 2px;
  font-size: 11px;
  /* Flat grey (was opacity: 0.6) - same visual result, but a real color
     the y-axis ticks can match exactly (see .envelope-graph-scale-tick's
     comment for why they use color instead of opacity). */
  color: #666;
  white-space: nowrap;
}

/* Same look as .envelope-graph-stage-label above, just anchored to the
   graph's top edge (bottom: 100%, margin-bottom) and centered (left: 50%)
   instead of sitting under one specific segment. */
.envelope-graph-frame-label {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  margin-bottom: 2px;
  font-size: 11px;
  color: #666;
  white-space: nowrap;
}
</style>
