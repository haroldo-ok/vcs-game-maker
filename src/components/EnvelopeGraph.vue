<template>
  <div class="envelope-graph-wrapper">
    <div class="envelope-graph-scale">
      <span
        v-for="tick in scaleTicks"
        v-bind:key="tick"
        class="envelope-graph-scale-tick"
        :style="{top: (100 - tick) + '%'}"
      >{{ tick }}</span>
    </div>
    <div class="envelope-graph" ref="container">
      <!-- Exactly two kinds of vertical line: one at each user-editable
           dot's own CURRENT position (attack/decay/release-start - the
           three draggable handles below), and one above each stage
           LABEL's own position (see labelXPercents/labelStyle - same
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
      <!-- Every vertex gets a dot (matching the classic ADSR diagram's own
           corners), but only the three whose position actually maps to an
           editable field are draggable - the start (always silence at time
           0) and the sustain-hold's own end (a fixed visual width, not a
           real editable value - see SUSTAIN_VISUAL_WIDTH) are fixed
           reference points only. -->
      <div class="envelope-graph-dot envelope-graph-dot-static" :style="dotStyle(0, 0)" />
      <div
        class="envelope-graph-dot envelope-graph-dot-handle"
        :style="dotStyle(attackX, 100)"
        title="Attack - drag to change how many frames it takes to reach full volume"
        @mousedown="startDrag('attack', $event)"
      />
      <div
        class="envelope-graph-dot envelope-graph-dot-handle"
        :style="dotStyle(decayX, sustainPercent)"
        title="Decay/Sustain - drag horizontally to change Decay, vertically to change Sustain level"
        @mousedown="startDrag('decaySustain', $event)"
      />
      <div
        class="envelope-graph-dot envelope-graph-dot-handle"
        :style="dotStyle(sustainEndX, sustainPercent)"
        title="Release - drag to change how many frames it takes to reach silence"
        @mousedown="startDrag('release', $event)"
      />
      <!-- Always sits at the graph's own right edge (releaseX is 100% by
           construction - totalUnits is defined as the sum that includes
           release, so this dot can never actually move away from the edge
           no matter what release is set to) - a fixed reference point for
           "the sound ends here", exactly like the static dot at (0, 0)
           marks "the sound starts here". Not draggable: an earlier version
           made this one draggable too, which did nothing but visually snap
           straight back to the edge on every drag update, since its own
           position can't respond to the value dragging it would produce. -->
      <div class="envelope-graph-dot envelope-graph-dot-static" :style="dotStyle(releaseX, 0)" />
      <!-- Positioned under each segment's own midpoint (not evenly spaced
           regardless of actual segment width) so a label always sits under
           the part of the curve it actually names. -->
      <span class="envelope-graph-stage-label" :style="labelStyle(0, attackX)">Atk</span>
      <span class="envelope-graph-stage-label" :style="labelStyle(attackX, decayX)">Dec</span>
      <span class="envelope-graph-stage-label" :style="labelStyle(decayX, sustainEndX)">Sus</span>
      <span class="envelope-graph-stage-label" :style="labelStyle(sustainEndX, releaseX)">Rel</span>
    </div>
  </div>
</template>
<script>
import {defineComponent} from '@vue/composition-api';
import {ENVELOPE_STAGE_FRAME_OPTIONS, ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS,
  ENVELOPE_SUSTAIN_PERCENT_OPTIONS} from '../blocks/soundfx';

// Purely a visual shape indicator (straight ramp lines matching the classic
// ADSR diagram/FL Studio's Fruity Envelope Controller reference), not a
// sample-accurate plot of utils/envelope.js's own discretized AUDV-per-frame
// curve - a smooth ramp reads more clearly at this size than a coarse,
// stair-stepped one would, and the actual runtime curve is already governed
// by the same attack/decay/sustain/release numbers this draws from, so the
// two can never disagree on SHAPE, only on how many discrete steps make up
// each ramp.
//
// Sustain has no fixed length of its own (it holds until the sound/note
// ends, whenever that is) - drawn with a fixed visual width purely so the
// plateau is visible, matching every ADSR reference diagram's own portrayal.
const SUSTAIN_VISUAL_WIDTH = 6;

export default defineComponent({
  props: {
    attack: {type: Number, required: true},
    decay: {type: Number, required: true},
    sustainPercent: {type: Number, required: true},
    release: {type: Number, required: true},
  },
  data() {
    return {
      dragHandle: null,
      dragStartX: 0,
      dragStartY: 0,
      dragStartValues: null,
      // 0-100%, this preset's own peak volume - see the class-level comment
      // on ENVELOPE_SUSTAIN_PERCENT_OPTIONS in blocks/soundfx.js for why
      // Sustain (and so this whole graph's own Y axis) is a percentage of
      // that, not a raw AUDV value.
      scaleTicks: [100, 75, 50, 25, 0],
    };
  },
  computed: {
    totalUnits() {
      return Math.max(1, this.attack + this.decay + SUSTAIN_VISUAL_WIDTH + this.release);
    },
    attackX() {
      return this.attack / this.totalUnits * 100;
    },
    decayX() {
      return (this.attack + this.decay) / this.totalUnits * 100;
    },
    sustainEndX() {
      return (this.attack + this.decay + SUSTAIN_VISUAL_WIDTH) / this.totalUnits * 100;
    },
    releaseX() {
      return (this.attack + this.decay + SUSTAIN_VISUAL_WIDTH + this.release) / this.totalUnits * 100;
    },
    // Same midpoints labelStyle itself centers each of the 4 stage labels
    // on (see the template's own labelStyle calls) - one vertical line
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
    // bottom, matching the reference diagram's own Amplitude axis.
    polylinePoints() {
      const pts = [
        [0, 100],
        [this.attackX, 0],
        [this.decayX, 100 - this.sustainPercent],
        [this.sustainEndX, 100 - this.sustainPercent],
        [this.releaseX, 100],
      ];
      return pts.map(([x, y]) => `${x},${y}`).join(' ');
    },
  },
  methods: {
    dotStyle(xPercent, yPercent) {
      return {left: `${xPercent}%`, top: `${100 - yPercent}%`};
    },
    // Centers a label under its own segment's midpoint, clamped so a very
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
    // (see blocks/soundfx.js's own comment on why those stay bounded), just
    // reached by dragging instead of picking from a list.
    snapTo(options, value) {
      return options.reduce((closest, option) =>
        Math.abs(option - value) < Math.abs(closest - value) ? option : closest, options[0]);
    },
    startDrag(handle, event) {
      // Without this, the browser's own default mousedown behavior (text
      // selection, or - since this card sits in a click-and-drag reorderable
      // list, see hooks/drag-reorder.js - being misread as the start of a
      // native drag gesture on some ancestor) fires alongside this custom
      // drag, which is what made dragging a dot feel like it was dragging
      // the whole card instead.
      event.preventDefault();
      event.stopPropagation();
      this.dragHandle = handle;
      this.dragStartValues = {attack: this.attack, decay: this.decay,
        sustainPercent: this.sustainPercent, release: this.release};
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
        const sustainPercent = this.snapTo(ENVELOPE_SUSTAIN_PERCENT_OPTIONS, yPercent);
        this.$emit('update:decay', decay);
        this.$emit('update:sustainPercent', sustainPercent);
      } else if (this.dragHandle === 'release') {
        // This handle sits at sustainEndX, which - unlike attack/decay's
        // own handles - ISN'T measured from x=0: it's measured from the
        // FIXED right edge (releaseX is always exactly 100%, see the
        // now-static dot there), moving LEFT as Release grows. Reusing the
        // same "distance from 0" shape the other two handles use would
        // make Release move the WRONG way (and, at Release's own minimum
        // of 0 - where this handle starts out coinciding with that fixed
        // edge - never move at all): dragging left has to mean "release
        // starts earlier, so it's LONGER", not shorter. `totalUnits - xUnits`
        // is exactly that distance, measured from wherever the cursor
        // lands back to the fixed edge, using this frame's own totalUnits
        // (already stale by the time it's applied, same as every other
        // handle here - the next mousemove's own fresh totalUnits corrects
        // it, same self-correcting approximation decaySustain's own drag
        // already relies on).
        const release = this.snapTo(ENVELOPE_ATTACK_RELEASE_FRAME_OPTIONS, Math.max(0, totalUnits - xUnits));
        this.$emit('update:release', release);
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
  margin-top: 8px;
  /* Breathing room from whatever follows (e.g. SoundFXEditor.vue's own
     Delete button row, which sits flush with zero top padding) - without
     this the graph's own bottom edge and the next control below it touch
     directly, reading as an overlap even though nothing actually overlaps
     in the DOM. */
  margin-bottom: 8px;
}

/* 0-100%, not a raw AUDV value - Sustain (and so this whole graph) is
   always a percentage of this preset's own peak volume, matching how
   ENVELOPE_SUSTAIN_PERCENT_OPTIONS itself is defined (see blocks/
   soundfx.js). Right-aligned digits. Each tick is absolutely positioned
   (see envelope-graph-scale-tick below) rather than flex "space-between" -
   a plain span's own ~22px line-height meant 5 of them (110px) didn't fit
   this 90px-tall column, so "space-between" silently grew the container
   and pushed every tick below "100" progressively lower than its real
   gridline. */
.envelope-graph-scale {
  position: relative;
  font-size: 10px;
  opacity: 0.6;
  text-align: right;
  /* Matches .envelope-graph's own height below, so each tick's own "top"
     percent (0-100) lines up with that graph's identical 0-100% gridlines. */
  height: 90px;
}

.envelope-graph-scale-tick {
  position: absolute;
  right: 0;
  transform: translateY(-50%);
}

.envelope-graph {
  position: relative;
  flex: 1 1 auto;
  height: 90px;
  margin-bottom: 16px;
  /* Same repeating-linear-gradient grid technique MusicEditor.vue's own
     piano roll uses for its own time-division lines (see sliceGridImage) -
     reused here so the two read as the same visual language. Horizontal
     only (vertical snap lines are real, reactive divs below - see
     snapGridXPercents - since Attack/Decay/Release's own snap positions
     shift as the shape changes, unlike Sustain's fixed 0/25/50/75/100%). */
  background-image: repeating-linear-gradient(to bottom, rgba(0, 0, 0, 0.06) 0,
    rgba(0, 0, 0, 0.06) 1px, transparent 1px, transparent 25%);
  /* Same frame as MusicEditor.vue's own .piano-roll-scroll (the piano
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
}

.envelope-graph-snap-line-vertical {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  background: rgba(0, 0, 0, 0.1);
}

/* One per draggable dot (Attack/Decay/Release-start), at its own CURRENT
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
     undraggable at exactly that value. Static dots never have their own
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
  opacity: 0.6;
  white-space: nowrap;
}
</style>
