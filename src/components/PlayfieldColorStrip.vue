<template>
  <div class="playfield-color-strip" :class="{'playfield-color-strip-right': side === 'right'}" :title="title">
    <!-- The colors are drawn on a canvas, scaled the way the canvas of the picture is (see drawBackdrop in PixelEditor.vue), so that the edge of each
         row is exactly where the edge of the picture's row is; the swatches over it only take the clicks. -->
    <canvas ref="paint" class="strip-paint" />
    <!-- The rows only take the clicks; the colors are on the canvas. One popup for the strip, opened at the row clicked (a popup on every row was
         a component for each row of each frame: slow to draw again whenever a color changed). -->
    <div
      v-for="(colorByte, rowIndex) in shownValue"
      :key="rowIndex"
      class="row-swatch"
      :class="{'row-swatch-armed': paintColor != null, 'row-swatch-fill': fillMode}"
      :title="fillMode ?
        (paintColor != null ?
          `Click to fill the rows around row ${rowIndex + 1} that have its color with the selected quick color` :
          `Click to pick a color that fills the rows around row ${rowIndex + 1} that have its color`) :
        paintColor != null ?
        `Click to fill row ${rowIndex + 1} with the selected quick color, or drag across rows to paint several at once` :
        `Row ${rowIndex + 1} color — click to change, or drag across rows to copy this row's color onto them`"
      @click="(event) => handleRowClick(event, rowIndex, colorByte)"
      @mousedown.left="() => handleDragStart(rowIndex, colorByte)"
      @mouseenter="() => handleDragEnter(rowIndex)"
    />
    <v-menu
      v-model="menuOpen"
      :position-x="menuX"
      :position-y="menuY"
      absolute
      offset-x
      :close-on-content-click="true"
    >
      <v-card class="palette-card">
        <div v-if="quickColors.length" class="palette-grid quick-palette-grid">
          <div
            v-for="(quickByte, quickIndex) in quickColors"
            :key="`quick-${quickIndex}`"
            class="palette-swatch"
            :class="{selected: value[menuRow] === quickByte}"
            :style="{backgroundColor: cssColor(quickByte)}"
            :title="bbasicLiteral(quickByte)"
            @click="handlePick(menuRow, quickByte)"
          />
        </div>
        <v-divider v-if="quickColors.length" class="quick-palette-divider" />
        <div class="palette-grid">
          <div
            v-for="(hex, paletteIndex) in palette"
            :key="paletteIndex"
            class="palette-swatch"
            :class="{selected: (value[menuRow] >> 1) === paletteIndex}"
            :style="{backgroundColor: `#${hex}`}"
            :title="bbasicLiteral(paletteIndex << 1)"
            @click="handlePick(menuRow, paletteIndex << 1)"
          />
        </div>
      </v-card>
    </v-menu>
  </div>
</template>
<script>
import {NTSC_COLORS, PALETTE_COLUMNS, colorByteToCss, colorByteToBBasic} from '../utils/palette';
import {usePixelTool, useDrawColor, useMirrorDraw} from '../hooks/pixel-tool';
import {DEFAULT_ROW_COLOR} from '../blocks/background';

// How often a drag that paints rows sends its colors to the editor (the picture follows), in milliseconds.
const DRAG_SEND_MS = 120;

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
    // The color a row has until it is painted, and the Eraser paints it back to: white for the playfield, black for the background behind it.
    defaultColor: {type: Number, default: DEFAULT_ROW_COLOR},
  },
  computed: {
    // The colors shown: while a drag paints rows, the list kept by the strip (the editor gets it every so often and at the end, see handleDragEnter).
    shownValue() {
      return this.dragValue || this.value;
    },
    valueKey() {
      return Array.isArray(this.shownValue) ? this.shownValue.join() : String(this.shownValue);
    },
    // With the graphic editor's Fill tool selected, picking a color for a row fills the whole run of
    // neighboring rows that have the same color, like Fill does on the picture.
    fillMode() {
      return usePixelTool().value === 'fill';
    },
    // The Eyedropper takes a row's color for the toolbar's swatch.
    eyedropperMode() {
      return usePixelTool().value === 'eyedropper';
    },
    // The color a click paints a row with: white with the Eraser, the toolbar's swatch color with the Pencil or Fill, else the armed quick color.
    paintColor() {
      // The Eraser puts a row back to white, whatever the swatch holds.
      if (usePixelTool().value === 'eraser') return this.defaultColor;
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
      // The colors of a drag that paints rows, until it ends (null when none).
      dragValue: null,
      // The popup of the strip: open, at which row, where on the screen.
      menuOpen: false,
      menuRow: 0,
      menuX: 0,
      menuY: 0,
    };
  },
  watch: {
    // (The colors as text: an editor that passes a new list with the same colors on each render does not repaint the strip each time.)
    valueKey() {
      this.$nextTick(() => this.paint());
    },
  },
  mounted() {
    this.paint();
    this.resizeObserver = new ResizeObserver(() => this.paint());
    this.resizeObserver.observe(this.$el);
    // Not just a per-swatch mouseup (the drag can end anywhere - outside
    // the strip entirely, e.g. if the pointer leaves it before the button
    // is released) - a window-level listener is the only way to reliably
    // know the drag is over regardless of where the release happens.
    window.addEventListener('mouseup', this.handleDragEnd);
  },
  beforeDestroy() {
    window.removeEventListener('mouseup', this.handleDragEnd);
    if (this.resizeObserver) this.resizeObserver.disconnect();
  },
  methods: {
    // Paints the row colors: a canvas of a whole number of pixels for every row, a little more than the device pixels it covers, scaled down smoothly
    // (the same as the picture's backdrop canvas), with a faint line at the end of each row but the last.
    paint() {
      const canvas = this.$refs.paint;
      if (!canvas) return;
      const colors = this.shownValue;
      const rows = colors.length;
      const dpr = window.devicePixelRatio || 1;
      const cssHeight = canvas.clientHeight;
      if (!rows || !cssHeight) return;
      canvas.width = 1;
      canvas.height = rows * Math.max(2, Math.ceil(Math.round(cssHeight * dpr) / rows));
      const ctx = canvas.getContext('2d');
      const rowHeight = canvas.height / rows;
      colors.forEach((colorByte, row) => {
        ctx.fillStyle = this.cssColor(colorByte);
        ctx.fillRect(0, Math.round(row * rowHeight), 1, Math.round((row + 1) * rowHeight) - Math.round(row * rowHeight));
        if (row < rows - 1) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.25)';
          ctx.fillRect(0, Math.round((row + 1) * rowHeight) - 1, 1, 1);
        }
      });
    },
    cssColor(byte) {
      return colorByteToCss(byte);
    },
    bbasicLiteral(byte) {
      return colorByteToBBasic(byte);
    },
    // Paints a row, or with Fill the run of rows of its color, and with vertical mirror drawing on (the toolbar's button) the row the same distance
    // from the other end of the strip, or its run, too. (The horizontal one has nothing to do here: a strip has one color for each row.)
    // During a drag the rows are painted in the drag's list and the editor gets it every so often (sending it for each row drew the whole tab
    // again each time: slow, and two rows in one moment started from the same list, one of them lost); otherwise the list is sent at once.
    handlePick(rowIndex, colorByte) {
      const current = this.dragValue || this.value;
      const next = current.slice();
      const mirror = useMirrorDraw().vertical;
      const paintFrom = (start) => {
        if (this.fillMode) {
          const target = current[start];
          let first = start;
          let last = start;
          while (first > 0 && current[first - 1] === target) first--;
          while (last < current.length - 1 && current[last + 1] === target) last++;
          for (let row = first; row <= last; row++) next[row] = colorByte;
        } else {
          next[start] = colorByte;
        }
      };
      if (this.fillMode && current[rowIndex] === colorByte) return;
      paintFrom(rowIndex);
      if (mirror) paintFrom(current.length - 1 - rowIndex);
      if (this.dragValue) {
        this.dragValue = next;
        this.scheduleDragSend();
        return;
      }
      this.$emit('input', next);
    },
    // The drag's colors to the editor, at most every DRAG_SEND_MS while it lasts.
    scheduleDragSend() {
      if (this.dragSendTimer) return;
      this.dragSendTimer = setTimeout(() => {
        this.dragSendTimer = null;
        if (this.dragValue) this.$emit('input', this.dragValue.slice());
      }, DRAG_SEND_MS);
    },
    // A click on a row: the Eyedropper takes its color, a color to paint with paints it, else the popup opens beside it.
    handleRowClick(event, rowIndex, colorByte) {
      if (this.eyedropperMode) {
        this.handleTake(colorByte);
        return;
      }
      if (this.paintColor != null) {
        // (A drag that started here painted it already.)
        if (!this.paintedOnPress) this.handlePick(rowIndex, this.paintColor);
        this.paintedOnPress = false;
        return;
      }
      const rect = event.currentTarget.getBoundingClientRect();
      this.menuRow = rowIndex;
      this.menuX = rect.right;
      this.menuY = rect.top;
      this.menuOpen = true;
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
      this.dragValue = this.value.slice();
      // (The row the drag starts on is painted too, with a color to paint with; its click then does nothing more.)
      this.paintedOnPress = false;
      if (this.paintColor != null) {
        this.handlePick(rowIndex, this.dragColor);
        this.paintedOnPress = true;
      }
    },
    handleDragEnter(rowIndex) {
      if (!this.isDragPainting || this.eyedropperMode) return;
      this.handlePick(rowIndex, this.dragColor);
    },
    handleDragEnd() {
      if (!this.isDragPainting) return;
      this.isDragPainting = false;
      if (this.dragSendTimer) {
        clearTimeout(this.dragSendTimer);
        this.dragSendTimer = null;
      }
      const painted = this.dragValue;
      this.dragValue = null;
      if (painted && painted.some((color, row) => color !== this.value[row])) this.$emit('input', painted);
    },
  },
};
</script>
<style scoped>
.playfield-color-strip {
  position: relative;
  display: flex;
  flex-direction: column;
  width: 22px;
  height: 100%;
  flex: 0 0 auto;
  margin-right: 4px;
  /* Only the sides are borders: the lines above and below are shadows outside the strip, so the swatches fill exactly the height of the picture
     beside it (a border there made every swatch a little lower and shorter than its row). */
  border: 1px solid rgba(0, 0, 0, 0.4);
  border-top: none;
  border-bottom: none;
  box-shadow: 0 -1px 0 rgba(0, 0, 0, 0.4), 0 1px 0 rgba(0, 0, 0, 0.4);
}

.playfield-color-strip-right {
  margin-right: 0;
  margin-left: 4px;
}

.strip-paint {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  image-rendering: auto;
  pointer-events: none;
}

.row-swatch {
  position: relative;
  flex: 1 1 0;
  min-height: 0;
  cursor: pointer;
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
