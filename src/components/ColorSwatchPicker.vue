<template>
  <v-menu offset-y :close-on-content-click="true">
    <template v-slot:activator="{ on, attrs }">
      <div
        class="color-swatch-picker-dot"
        :style="{backgroundColor: swatchColor}"
        :title="title"
        v-bind="attrs"
        v-on="on"
      />
    </template>
    <v-card class="palette-card">
      <v-btn v-if="allowClear" text small block @click="$emit('input', null)">
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
// interaction Configuration.vue's own Text Minikernel background color
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

.palette-card {
  padding: 4px;
}

.palette-grid {
  display: grid;
  grid-template-columns: repeat(8, 18px);
  gap: 1px;
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
