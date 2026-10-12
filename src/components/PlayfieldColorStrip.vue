<template>
  <div class="playfield-color-strip" :class="{'playfield-color-strip-right': side === 'right'}" :title="title">
    <v-menu
      v-for="(colorByte, rowIndex) in value"
      :key="rowIndex"
      offset-x
      :close-on-content-click="true"
    >
      <template v-slot:activator="{ on, attrs }">
        <div
          class="row-swatch"
          :class="{'row-swatch-armed': paintColor != null, 'row-swatch-fill': fillMode}"
          :style="{backgroundColor: cssColor(colorByte)}"
          :title="fillMode ?
            (paintColor != null ?
              `Click to fill the rows around row ${rowIndex + 1} that have its color with the selected quick color` :
              `Click to pick a color that fills the rows around row ${rowIndex + 1} that have its color`) :
            paintColor != null ?
            `Click to fill row ${rowIndex + 1} with the selected quick color, or drag across rows to paint several at once` :
            `Row ${rowIndex + 1} color — click to change, or drag across rows to copy this row's color onto them`"
          v-bind="attrs"
          v-on="eyedropperMode ? {click: () => handleTake(colorByte)} :
            paintColor != null ? {click: () => handlePick(rowIndex, paintColor)} : on"
          @mousedown.left="() => handleDragStart(rowIndex, colorByte)"
          @mouseenter="() => handleDragEnter(rowIndex)"
        />
      </template>

      <v-card class="palette-card">
        <div v-if="quickColors.length" class="palette-grid quick-palette-grid">
          <div
            v-for="(quickByte, quickIndex) in quickColors"
            :key="`quick-${quickIndex}`"
            class="palette-swatch"
            :class="{selected: colorByte === quickByte}"
            :style="{backgroundColor: cssColor(quickByte)}"
            :title="bbasicLiteral(quickByte)"
            @click="handlePick(rowIndex, quickByte)"
          />
        </div>
        <v-divider v-if="quickColors.length" class="quick-palette-divider" />
        <div class="palette-grid">
          <div
            v-for="(hex, paletteIndex) in palette"
            :key="paletteIndex"
            class="palette-swatch"
            :class="{selected: (colorByte >> 1) === paletteIndex}"
            :style="{backgroundColor: `#${hex}`}"
            :title="bbasicLiteral(paletteIndex << 1)"
            @click="handlePick(rowIndex, paletteIndex << 1)"
          />
        </div>
      </v-card>
    </v-menu>
  </div>
</template>
<script>
import {NTSC_COLORS, PALETTE_COLUMNS, colorByteToCss, colorByteToBBasic} from '../utils/palette';
import {usePixelTool, useDrawColor} from '../hooks/pixel-tool';

export default {
  name: 'PlayfieldColorStrip',
  props: {
    // One color byte (0..254, even) per playfield row, top to bottom.
    value: {type: Array, default: () => []},
    // Optional curated shortlist of color bytes (see PlayerEditor.vue's
    // "quick colors" palette) shown above the full palette grid in every
    // row's popup, for fast reuse without hunting through all 128 colors.
    // Empty by default so BackgroundEditor's  use of this component
    // (which has no such shortlist) renders exactly as before.
    quickColors: {type: Array, default: () => []},
    // A color byte the user has "armed" from the quick colors bar (see
    // PlayerEditor.vue's  selectedQuickColor), or null. While set, a
    // plain click on a row swatch fills that row with THIS color directly
    // instead of opening the row's  popup - a faster paint-bucket-style
    // workflow than picking from the popup every single row.
    activeQuickColor: {type: Number, default: null},
    // Hover text for the whole strip, when there is more than one beside the picture.
    title: {type: String, default: undefined},
    // Which side of the picture the strip is on; the gap to the picture is on that side.
    side: {type: String, default: 'left'},
  },
  computed: {
    // With the graphic editor's Fill tool selected, picking a color for a row fills the whole run of
    // neighboring rows that have the same color, like Fill does on the picture.
    fillMode() {
      return usePixelTool().value === 'fill';
    },
    // The Eyedropper takes a row's color for the toolbar's swatch.
    eyedropperMode() {
      return usePixelTool().value === 'eyedropper';
    },
    // The color a click paints a row with: with the Pencil or Fill selected, the toolbar's swatch color, else the armed quick color.
    paintColor() {
      const swatch = useDrawColor().value;
      if (['pencil', 'fill'].includes(usePixelTool().value) && swatch !== null) return swatch;
      return this.activeQuickColor;
    },
  },
  data() {
    return {
      palette: NTSC_COLORS,
      paletteColumns: PALETTE_COLUMNS,
      // Click-and-drag row painting: mousedown on a row remembers which
      // color to spread (the armed quick color if one's selected, else
      // that row's  current color) without picking anything yet - a
      // plain click still opens the popup/paints just that one row via the
      // existing click handler below, since a real cross-element drag
      // never fires a native "click" event at all (only mousedown+mouseup
      // on the SAME element does), so the two behaviors don't collide.
      // Every row entered afterward, while the button is still down, gets
      // painted with that same remembered color.
      isDragPainting: false,
      dragColor: null,
    };
  },
  mounted() {
    // Not just a per-swatch mouseup (the drag can end anywhere - outside
    // the strip entirely, e.g. if the pointer leaves it before the button
    // is released) - a window-level listener is the only way to reliably
    // know the drag is over regardless of where the release happens.
    window.addEventListener('mouseup', this.handleDragEnd);
  },
  beforeDestroy() {
    window.removeEventListener('mouseup', this.handleDragEnd);
  },
  methods: {
    cssColor(byte) {
      return colorByteToCss(byte);
    },
    bbasicLiteral(byte) {
      return colorByteToBBasic(byte);
    },
    handlePick(rowIndex, colorByte) {
      const next = this.value.slice();
      if (this.fillMode) {
        const target = this.value[rowIndex];
        if (target === colorByte) return;
        let first = rowIndex;
        let last = rowIndex;
        while (first > 0 && this.value[first - 1] === target) first--;
        while (last < this.value.length - 1 && this.value[last + 1] === target) last++;
        for (let row = first; row <= last; row++) next[row] = colorByte;
      } else {
        next[rowIndex] = colorByte;
      }
      this.$emit('input', next);
    },
    handleTake(colorByte) {
      useDrawColor().value = colorByte;
    },
    handleDragStart(rowIndex, colorByte) {
      // Without a color to paint with, Fill is a click that opens the color popup: a drag across rows doesn't paint them.
      if (this.fillMode && this.paintColor == null) return;
      this.isDragPainting = true;
      if (this.eyedropperMode) return;
      this.dragColor = this.paintColor != null ? this.paintColor : colorByte;
    },
    handleDragEnter(rowIndex) {
      if (!this.isDragPainting) return;
      this.handlePick(rowIndex, this.dragColor);
    },
    handleDragEnd() {
      this.isDragPainting = false;
    },
  },
};
</script>
<style scoped>
.playfield-color-strip {
  display: flex;
  flex-direction: column;
  width: 22px;
  height: 100%;
  flex: 0 0 auto;
  margin-right: 4px;
  border: 1px solid rgba(0, 0, 0, 0.4);
}

.playfield-color-strip-right {
  margin-right: 0;
  margin-left: 4px;
}

.row-swatch {
  flex: 1 1 0;
  min-height: 0;
  cursor: pointer;
  border-bottom: 1px solid rgba(0, 0, 0, 0.25);
}

.row-swatch:last-child {
  border-bottom: none;
}

.row-swatch:hover {
  outline: 2px solid #1976d2;
  outline-offset: -2px;
}

/* A quick color is armed (see activeQuickColor) - a plain click here paints
   it directly rather than opening the popup, so the cursor reflects that
   "apply, don't pick" behavior. */
.row-swatch-armed {
  cursor: cell;
}

/* The Fill tool is selected: the same paint bucket cursor the picture's Fill tool has. */
.row-swatch.row-swatch-fill {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='white' stroke='black' stroke-width='1' d='M19,11.5C19,11.5 17,13.67 17,15A2,2 0 0,0 19,17A2,2 0 0,0 21,15C21,13.67 19,11.5 19,11.5M5.21,10L10,5.21L14.79,10M16.56,8.94L7.62,0L6.21,1.41L8.59,3.79L3.44,8.94C2.85,9.5 2.85,10.47 3.44,11.06L8.94,16.56C9.23,16.85 9.62,17 10,17C10.38,17 10.77,16.85 11.06,16.56L16.56,11.06C17.15,10.47 17.15,9.5 16.56,8.94Z'/></svg>") 4 20, crosshair;
}

.palette-card {
  padding: 4px;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: 0;
}

.quick-palette-divider {
  margin: 4px 0;
}

/* The same swatch the color blocks' picker shows (see App.vue's .fieldGridDropDownContainer
   rules): 28 pixel squares with no gap, the selected one marked with a black inset frame. */
.palette-swatch {
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.palette-swatch:hover {
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.palette-swatch.selected {
  box-shadow: inset 0 0 0 2px #000;
}
</style>
