<template>
  <v-menu offset-y :close-on-content-click="true">
    <template v-slot:activator="{ on, attrs }">
      <div
        class="color-swatch-picker-dot"
        :class="{'color-swatch-picker-dot-square': square}"
        :style="{backgroundColor: swatchColor}"
        :title="title"
        v-bind="attrs"
        v-on="on"
      />
    </template>
    <v-card class="palette-card">
      <v-btn v-if="allowClear" small block class="palette-clear-btn" @click="$emit('input', null)">
        {{ clearLabel }}
      </v-btn>
      <div class="palette-grid">
        <div
          v-for="(hex, paletteIndex) in palette"
          v-bind:key="paletteIndex"
          class="palette-swatch"
          :class="{selected: value === (paletteIndex << 1)}"
          :style="{backgroundColor: `#${hex}`}"
          :title="hex"
          @click="$emit('input', paletteIndex << 1)"
        />
      </div>
    </v-card>
  </v-menu>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';
import {NTSC_COLORS, colorByteToCss} from '../utils/palette';

// A single reusable swatch-button + palette-grid color picker (a TIA color
// byte, matching utils/palette.js's index<<1 convention) - the same
// interaction Configuration.vue's  Text Minikernel background color
// picker uses, generalized so anything needing one TIA color value (Sound
// tab instrument colors, etc.) doesn't have to duplicate the markup/CSS.
export default defineComponent({
  props: {
    // The current color byte, or null/undefined for "no color set" -
    // rendered via fallbackColor instead in that case.
    value: {type: Number, default: null},
    fallbackColor: {type: String, default: '#888888'},
    allowClear: {type: Boolean, default: true},
    clearLabel: {type: String, default: 'Use automatic color'},
    title: {type: String, default: 'Click to change color'},
    // Matches the Quick colors bar's .quick-color-swatch look (square
    // corners, thicker border) instead of this component's default rounded
    // dot - see .color-swatch-picker-dot-square below. A single shared prop
    // instead of every caller (Text/Score/Title tab background color
    // pickers) each hand-rolling the same deep-selector CSS override.
    square: {type: Boolean, default: false},
  },
  setup(props) {
    const swatchColor = computed(() => (props.value != null ? colorByteToCss(props.value) : props.fallbackColor));
    return {palette: NTSC_COLORS, swatchColor};
  },
});
</script>
<style scoped>
.color-swatch-picker-dot {
  width: 14px;
  height: 14px;
  border-radius: 2px;
  border: 1px solid rgba(0, 0, 0, 0.2);
  cursor: pointer;
}

.color-swatch-picker-dot:hover {
  outline: 2px solid #1976d2;
  outline-offset: -2px;
}

/* Matches the Quick colors bar's .quick-color-swatch size/border exactly
   (see components/QuickColorPalette.vue) - hover styling above already
   matches without needing an override here. */
.color-swatch-picker-dot-square {
  width: 18px;
  height: 18px;
  border-radius: 0;
  border: 1px solid rgba(0, 0, 0, 0.4);
}

.palette-card {
  padding: 4px;
}

.palette-clear-btn {
  margin: 4px 0;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: 0;
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
