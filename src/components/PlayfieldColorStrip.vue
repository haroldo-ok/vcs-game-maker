<template>
  <div class="playfield-color-strip">
    <v-menu
      v-for="(colorByte, rowIndex) in value"
      :key="rowIndex"
      offset-x
      :close-on-content-click="true"
    >
      <template v-slot:activator="{ on, attrs }">
        <div
          class="row-swatch"
          :class="{'row-swatch-armed': activeQuickColor != null}"
          :style="{backgroundColor: cssColor(colorByte)}"
          :title="activeQuickColor != null ?
            `Click to fill row ${rowIndex + 1} with the selected quick color` :
            `Row ${rowIndex + 1} color — click to change`"
          v-bind="attrs"
          v-on="activeQuickColor != null ? {click: () => handlePick(rowIndex, activeQuickColor)} : on"
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

export default {
  name: 'PlayfieldColorStrip',
  props: {
    // One color byte (0..254, even) per playfield row, top to bottom.
    value: {type: Array, default: () => []},
    // Optional curated shortlist of color bytes (see PlayerEditor.vue's own
    // "quick colors" palette) shown above the full palette grid in every
    // row's popup, for fast reuse without hunting through all 128 colors.
    // Empty by default so BackgroundEditor's own use of this component
    // (which has no such shortlist) renders exactly as before.
    quickColors: {type: Array, default: () => []},
    // A color byte the user has "armed" from the quick colors bar (see
    // PlayerEditor.vue's own selectedQuickColor), or null. While set, a
    // plain click on a row swatch fills that row with THIS color directly
    // instead of opening the row's own popup - a faster paint-bucket-style
    // workflow than picking from the popup every single row.
    activeQuickColor: {type: Number, default: null},
  },
  data() {
    return {
      palette: NTSC_COLORS,
      paletteColumns: PALETTE_COLUMNS,
    };
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
      next[rowIndex] = colorByte;
      this.$emit('input', next);
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

.palette-card {
  padding: 4px;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(8, 18px);
  gap: 1px;
}

.quick-palette-divider {
  margin: 4px 0;
}

.palette-swatch {
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.palette-swatch:hover {
  outline: 2px solid #1976d2;
  outline-offset: -2px;
}

.palette-swatch.selected {
  outline: 2px solid #ffffff;
  outline-offset: -2px;
  box-shadow: 0 0 0 1px #000;
}
</style>
