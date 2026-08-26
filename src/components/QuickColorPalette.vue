<template>
  <div>
    <v-divider class="quick-color-divider" />
    <div class="quick-color-label-row">
      <v-btn
        icon
        x-small
        :title="collapsed ? 'Show quick colors' : 'Hide quick colors'"
        class="quick-color-collapse-btn"
        @click="toggleCollapsed"
      >
        <v-icon small>{{ collapsed ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
      <div class="quick-color-section-label">Quick colors</div>
    </div>
    <div v-if="!collapsed" class="quick-color-palette">
      <div
        v-for="(byte, quickIndex) in palette"
        :key="`quickcolor-${quickIndex}`"
        class="quick-color-swatch"
        :class="{
          'quick-color-swatch-selected': value === byte,
          'quick-color-swatch-delete-armed': isAltHeld && hoveredByte === byte,
        }"
        :style="{backgroundColor: cssColor(byte)}"
        :title="`${bbasicLiteral(byte)} — click to select for painting row colors, alt-click to remove`"
        @click="(event) => handleClickSwatch(byte, event)"
        @mouseenter="hoveredByte = byte"
        @mouseleave="hoveredByte = null"
      >
        <v-icon v-if="isAltHeld && hoveredByte === byte" small class="quick-color-delete-icon">
          mdi-close
        </v-icon>
      </div>
      <v-menu offset-y :close-on-content-click="true">
        <template v-slot:activator="{ on, attrs }">
          <v-btn
            icon
            small
            title="Add a quick color"
            class="quick-color-add-btn"
            v-bind="attrs"
            v-on="on"
          >
            <v-icon small>mdi-plus</v-icon>
          </v-btn>
        </template>
        <v-card class="palette-card">
          <div class="palette-grid">
            <div
              v-for="(hex, paletteIndex) in ntscPalette"
              :key="paletteIndex"
              class="palette-swatch"
              :style="{backgroundColor: `#${hex}`}"
              :title="bbasicLiteral(paletteIndex << 1)"
              @click="handleAddColor(paletteIndex << 1)"
            />
          </div>
        </v-card>
      </v-menu>
    </div>
  </div>
</template>
<script>
import {computed, defineComponent, onMounted, onUnmounted, ref} from '@vue/composition-api';

import {useCollapsedIds} from '../hooks/collapse';
import {useColorPaletteStorage} from '../hooks/project';
import {colorByteToBBasic, colorByteToCss, NTSC_COLORS} from '../utils/palette';

// A single "entry" for useCollapsedIds' own per-list-item convention -
// there's only ever one Quick colors section per tab, not a list of them.
// A fixed id (not per-instance) so the collapsed state - and the palette
// data itself, via useColorPaletteStorage below - stays in sync across
// every tab this component is used on (Player 0, Player 1, Backgrounds),
// the same "one shared feature, not per-tab state" reasoning that already
// applies to the underlying color list.
const COLLAPSE_ENTRY = {id: 'quick-colors'};

// Reusable "Quick colors" bar - a curated shortlist of color bytes for fast
// reuse while picking row colors, shown under a divider with its own
// collapsible header (matching MusicEditor's own Sequence section). Backed
// by shared project storage (useColorPaletteStorage), so a color added on
// one tab (e.g. Player 0) is immediately available on every other tab this
// component appears on (Player 1, Backgrounds) too.
//
// v-model is the currently "armed" color byte (or null) - a plain click
// selects/deselects a swatch here; the PARENT is expected to pass that
// value into its own PlayfieldColorStrip instance(s) as activeQuickColor,
// so a plain click on a row swatch there paints this color directly. Armed
// state is local to this component instance (not shared storage) - it's a
// live "tool selection", not project data, so it resets per-tab rather
// than following the user from Player 0 to Player 1 to Backgrounds.
export default defineComponent({
  name: 'QuickColorPalette',
  props: {
    value: {type: Number, default: null},
  },
  setup(props, {emit}) {
    const paletteStorage = useColorPaletteStorage();
    const palette = computed(() => paletteStorage.value || []);
    const handleAddColor = (byte) => {
      if (palette.value.includes(byte)) return;
      paletteStorage.value = [...palette.value, byte];
    };
    const handleRemoveColor = (byte) => {
      paletteStorage.value = palette.value.filter((existing) => existing !== byte);
      if (props.value === byte) emit('input', null);
    };

    const {isCollapsed, toggleCollapsed: toggleCollapsedEntry} = useCollapsedIds('player-quick-colors');
    const collapsed = computed(() => isCollapsed(COLLAPSE_ENTRY));
    const toggleCollapsed = () => toggleCollapsedEntry(COLLAPSE_ENTRY);

    // Tracks whether Alt is currently physically held down, purely for this
    // bar's own hover feedback - CSS alone can't observe a keyboard
    // modifier's live state, only :hover, so this needs real key listeners.
    // Window-level (not scoped to the swatches themselves) since a key can
    // be pressed or released while the mouse sits still over a swatch,
    // which a per-element keydown/keyup could never observe (elements
    // aren't normally focused/don't receive key events at all). The blur
    // listener guards against alt-tabbing away (or any other action that
    // steals focus) while Alt is physically held - the keyup this browser
    // tab would otherwise wait for never arrives in that case, which would
    // otherwise leave this stuck reading "held" indefinitely.
    const isAltHeld = ref(false);
    const handleWindowKeydown = (event) => {
      if (event.key === 'Alt') isAltHeld.value = true;
    };
    const handleWindowKeyup = (event) => {
      if (event.key === 'Alt') isAltHeld.value = false;
    };
    const handleWindowBlur = () => {
      isAltHeld.value = false;
    };
    onMounted(() => {
      window.addEventListener('keydown', handleWindowKeydown);
      window.addEventListener('keyup', handleWindowKeyup);
      window.addEventListener('blur', handleWindowBlur);
    });
    onUnmounted(() => {
      window.removeEventListener('keydown', handleWindowKeydown);
      window.removeEventListener('keyup', handleWindowKeyup);
      window.removeEventListener('blur', handleWindowBlur);
    });

    const hoveredByte = ref(null);

    const handleClickSwatch = (byte, event) => {
      if (event.altKey) {
        handleRemoveColor(byte);
        return;
      }
      emit('input', props.value === byte ? null : byte);
    };

    return {
      palette, handleAddColor, handleRemoveColor,
      collapsed, toggleCollapsed,
      isAltHeld, hoveredByte, handleClickSwatch,
      ntscPalette: NTSC_COLORS, cssColor: colorByteToCss, bbasicLiteral: colorByteToBBasic,
    };
  },
});
</script>
<style scoped>
.quick-color-divider {
  margin: 8px 0;
}

.quick-color-label-row {
  display: flex;
  align-items: center;
  gap: 2px;
}

.quick-color-collapse-btn {
  margin-left: -4px;
  margin-top: -6px;
  min-width: 0;
  height: 16px !important;
  width: 16px !important;
}

.quick-color-section-label {
  font-size: 12px;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 4px;
}

.quick-color-palette {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

.quick-color-swatch {
  width: 18px;
  height: 18px;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.4);
  display: flex;
  align-items: center;
  justify-content: center;
}

.quick-color-swatch:hover {
  outline: 2px solid #1976d2;
  outline-offset: -2px;
}

/* The currently-armed color - a visibly bolder/thicker outline than the
   plain hover outline above, so "this one's armed for painting" reads as a
   distinctly stronger state than "the mouse just happens to be over it".
   White-then-black double ring (matching PlayfieldColorStrip's own
   .palette-swatch.selected) instead of a solid color outline, so it stays
   visible against a quick color that's itself close to white or black. */
.quick-color-swatch-selected {
  outline: 3px solid #ffffff;
  outline-offset: -3px;
  box-shadow: 0 0 0 1px #000;
}

/* Hovering a swatch while Alt is held previews the alt-click-to-delete
   action about to happen - a red outline plus the "X" icon (see
   .quick-color-delete-icon below) rather than just the plain hover ring,
   so it's unambiguous this click removes the color instead of selecting
   it. */
.quick-color-swatch-delete-armed {
  outline: 2px solid red;
  outline-offset: -2px;
  cursor: not-allowed;
}

.quick-color-delete-icon {
  color: red !important;
  /* A dark swatch would otherwise swallow a plain red icon - the shadow
     keeps the "X" readable against any quick color, light or dark. */
  filter: drop-shadow(0 0 1px white) drop-shadow(0 0 1px white);
}

.quick-color-add-btn {
  width: 20px !important;
  height: 20px !important;
}

/* Same popup grid style as PlayfieldColorStrip's own .palette-card/
   .palette-grid/.palette-swatch - duplicated rather than imported since
   this one lives in a plain v-menu here, not that component. */
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
</style>
