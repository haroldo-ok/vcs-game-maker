<template>
  <!-- @click.stop - every tab that uses this toolbar also has an outer
       "click anywhere to deselect the current card" handler (see e.g.
       PlayerEditor.vue's @click="deselectCard" on its root v-card).
       This toolbar sits OUTSIDE any card (directly in that same v-card-text),
       so without stopping it here, clicking any tool in it - confirmed
       directly with Pencil - bubbled up and deselected the very card those
       tools are supposed to be acting on. -->
  <div
    class="graphic-editor-toolbar"
    :class="{'graphic-editor-toolbar-scrolled': isScrolled}"
    :style="bleedStyle"
    @click.stop
  >
    <div class="graphic-editor-toolbar-row">
      <slot name="before-tools" />
      <v-divider class="get-outer-divider" vertical />
      <div class="get-tools">
        <template v-if="importExportFirst">
          <v-btn icon small title="Export to image (Shift+E)" :disabled="!activeEditor" @click="() => activeEditor.handleExportImage()">
            <v-icon>mdi-export</v-icon>
          </v-btn>
          <v-btn icon small title="Import from image (Shift+I)" :disabled="!activeEditor" @click="() => activeEditor.handleImportImage()">
            <v-icon>mdi-import</v-icon>
          </v-btn>
          <slot name="extra-tools" />
          <v-divider class="get-inner-divider" vertical />
        </template>
        <v-btn icon small :title="UNDO_TITLE" :disabled="!activeEditor && !hasPendingQuickColorUndo && !hasPendingCardUndo && !reorderCanUndo" @click="handleUndo">
          <v-icon>mdi-undo</v-icon>
        </v-btn>
        <v-btn icon small :title="REDO_TITLE" :disabled="!activeEditor && !reorderCanRedo" @click="handleRedo">
          <v-icon>mdi-redo</v-icon>
        </v-btn>
        <v-divider class="get-inner-divider" vertical />
        <v-menu offset-y :close-on-content-click="true">
          <template v-slot:activator="{on, attrs}">
            <div
              class="get-color-swatch"
              :class="{'get-color-swatch-empty': drawColor === null}"
              :style="{backgroundColor: drawColor === null ? 'transparent' : swatchCss(drawColor)}"
              title="Row color: what the Pencil and Fill paint onto the row color bars. Click to choose one."
              v-bind="attrs"
              v-on="on"
            />
          </template>
          <v-card class="get-palette-card">
            <div class="get-palette-grid">
              <div
                v-for="(hex, paletteIndex) in palette"
                :key="paletteIndex"
                class="get-palette-swatch"
                :class="{selected: drawColor !== null && (drawColor >> 1) === paletteIndex}"
                :style="{backgroundColor: `#${hex}`}"
                @click="drawColor = paletteIndex << 1"
              />
            </div>
          </v-card>
        </v-menu>
        <v-btn-toggle :value="activeTool" borderless>
          <v-btn
            icon
            small
            title="Move (V, hold-drag a selection to relocate it)"
            value="move"
            :disabled="!activeEditor"
            @click="toggleTool('move')"
          >
            <v-icon>mdi-cursor-move</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Eraser (E)"
            value="eraser"
            :disabled="!activeEditor"
            @click="toggleTool('eraser')"
          >
            <v-icon>mdi-eraser</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Pencil (B)"
            value="pencil"
            :disabled="!activeEditor"
            @click="toggleTool('pencil')"
          >
            <v-icon>mdi-pencil</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Fill (G)"
            value="fill"
            class="get-fill-button"
            :disabled="!activeEditor"
            @click="toggleTool('fill')"
          >
            <v-icon>mdi-format-color-fill</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Eyedropper (I) - click a row of the graphic to take its color for the swatch"
            value="eyedropper"
            :disabled="!activeEditor"
            @click="toggleTool('eyedropper')"
          >
            <v-icon>mdi-eyedropper</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Line (L)"
            value="line"
            :disabled="!activeEditor"
            @click="toggleTool('line')"
          >
            <svg class="v-icon get-shape-icon" viewBox="0 0 24 24">
              <line x1="5" y1="19" x2="19" y2="5" />
            </svg>
          </v-btn>
          <v-btn
            icon
            small
            title="Rectangle (R, hold Shift for a square)"
            value="rectangle"
            :disabled="!activeEditor"
            @click="toggleTool('rectangle')"
          >
            <svg class="v-icon get-shape-icon" viewBox="0 0 24 24">
              <rect x="3.5" y="3.5" width="17" height="17" />
            </svg>
          </v-btn>
          <v-btn
            icon
            small
            title="Oval (O, hold Shift for a circle)"
            value="oval"
            :disabled="!activeEditor"
            @click="toggleTool('oval')"
          >
            <svg class="v-icon get-shape-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9.5" />
            </svg>
          </v-btn>
        </v-btn-toggle>
        <v-divider class="get-inner-divider" vertical />
        <!-- A separate v-btn-toggle, not more buttons inside the one above -
             v-btn-toggle only expects v-btn children, so a divider can't sit
             inside it. Bound to the exact same :value/@click as the one
             above, so highlighting and selection still work identically
             across both - Vuetify doesn't care which literal component
             instance a button lives in, only that its "value" matches
             this shared activeTool. -->
        <v-btn-toggle :value="activeTool" borderless>
          <v-btn
            icon
            small
            title="Rectangle select (M, hold Shift to add to the selection)"
            value="rect-select"
            :disabled="!activeEditor"
            @click="toggleTool('rect-select')"
          >
            <svg class="v-icon get-shape-icon get-marquee-icon" viewBox="0 0 24 24">
              <rect x="3.5" y="3.5" width="17" height="17" />
            </svg>
          </v-btn>
          <v-btn
            icon
            small
            title="Circle select (C, hold Shift to add to the selection)"
            value="circle-select"
            :disabled="!activeEditor"
            @click="toggleTool('circle-select')"
          >
            <svg class="v-icon get-shape-icon get-marquee-icon" viewBox="0 0 24 24">
              <circle cx="12" cy="12" r="9.5" />
            </svg>
          </v-btn>
          <v-btn
            icon
            small
            title="Polygon select (P, click to place points, double-click to close, hold Shift to add to the selection)"
            value="polygon-select"
            :disabled="!activeEditor"
            @click="toggleTool('polygon-select')"
          >
            <svg class="v-icon get-shape-icon get-marquee-icon get-polygon-icon" viewBox="0 0 24 24">
              <path d="M4 17 L9 4 L20 9 L17 20 Z" />
            </svg>
          </v-btn>
        </v-btn-toggle>
        <v-divider class="get-inner-divider" vertical />
        <!-- Two independent on/off buttons (both on mirrors across both axes). -->
        <v-btn-toggle :value="mirrorModes" multiple borderless @change="setMirrorModes">
          <v-btn
            icon
            small
            title="Mirror draw horizontally: what you draw appears flipped on the other side (left/right)"
            value="horizontal"
            :disabled="!activeEditor"
          >
            <v-icon>mdi-reflect-horizontal</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Mirror draw vertically: what you draw appears flipped on the other side (top/bottom)"
            value="vertical"
            :disabled="!activeEditor"
          >
            <v-icon>mdi-reflect-vertical</v-icon>
          </v-btn>
        </v-btn-toggle>
        <v-btn icon small title="Flip horizontally (Shift+H) - only the selected pixels when a selection is active" :disabled="!activeEditor" @click="() => activeEditor.flipHorizontal()">
          <v-icon>mdi-flip-horizontal</v-icon>
        </v-btn>
        <v-btn icon small title="Flip vertically (Shift+V) - only the selected pixels when a selection is active" :disabled="!activeEditor" @click="() => activeEditor.flipVertical()">
          <v-icon>mdi-flip-vertical</v-icon>
        </v-btn>
        <template v-if="!importExportFirst">
          <v-divider class="get-inner-divider" vertical />
          <v-btn icon small title="Export to image (Shift+E)" :disabled="!activeEditor" @click="() => activeEditor.handleExportImage()">
            <v-icon>mdi-export</v-icon>
          </v-btn>
          <v-btn icon small title="Import from image (Shift+I)" :disabled="!activeEditor" @click="() => activeEditor.handleImportImage()">
            <v-icon>mdi-import</v-icon>
          </v-btn>
          <slot name="extra-tools" />
        </template>
      </div>
      <template v-if="$slots['after-tools']">
        <v-divider class="get-after-tools-divider" vertical />
        <slot name="after-tools" />
      </template>
    </div>
    <slot name="below-tools" />
  </div>
</template>
<script>
import {tryUndoQuickColorDeletion, usePendingQuickColorDeletion} from '../hooks/quick-color-undo';
import {tryUndoCardDeletion, usePendingCardDeletion} from '../hooks/card-delete-undo';
import {usePixelGridOverlayStorage, usePixelGridLabelsStorage} from '../hooks/project';
import {useMirrorDraw, useDrawColor} from '../hooks/pixel-tool';
import {NTSC_COLORS, colorByteToCss} from '../utils/palette';
import {REDO_TITLE, UNDO_TITLE, undoRedoKind} from '../utils/undo-hotkey';
import {canRedoReorder, canUndoReorder, settleEdits, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';

// The standard Photoshop/Aseprite-style single-letter tool shortcuts -
// see handleToolHotkey's comment for why these specific letters.
const TOOL_HOTKEYS = {
  b: 'pencil',
  e: 'eraser',
  g: 'fill',
  i: 'eyedropper',
  l: 'line',
  r: 'rectangle',
  o: 'oval',
  v: 'move',
  m: 'rect-select',
  c: 'circle-select',
  p: 'polygon-select',
};

// The single toolbar shared across every tab with a graphic editor
// (PlayerEditor/BackgroundEditor/TitleScreenEditor/ScoreFontEditor/
// TextFontEditor) - previously duplicated near-verbatim in all five (same
// markup, same CSS, same activeEditor/toggledTool/handleSetTool plumbing,
// same sticky/scroll-divider/bleed trick), which made every layout tweak a
// five-file find-and-replace. Now a single component: each tab supplies
// its zoom control/grid toggles via the "before-tools" slot (these
// differ per tab - e.g. only BackgroundEditor.vue has the "XY" pixel-
// coordinate toggle) and its "Set height" menu (if any) via
// "after-tools" (its target card/animation differs per tab, so that
// computation stays local to each one) - everything else (the actual
// Eraser/Pencil/Undo/Redo/Export/Import icons, and the sticky-header
// behavior around them) lives here once. A third slot, "extra-tools",
// sits right after the Export/Import icons for one-off tools only a
// single tab needs (currently just PlayerEditor.vue's "Import from
// Aseprite" button) without every other tab growing an unused icon too.
export default {
  props: {
    // The PixelEditor.vue instance the toolbar currently acts on - null
    // (every button disabled, no tool highlighted) until a caller resolves
    // one, however it chooses to (an explicit frame click, a $ref fallback
    // to the selected card's first frame, etc. - see each tab's
    // "effectiveFrameEditor"-style computed for that logic, which stays
    // local to each tab since "which card is selected" means something
    // different in each one).
    activeEditor: {type: Object, default: null},
    // How many pixels of ancestor padding this toolbar needs to bleed
    // through (via a negative margin) to reach its real scrolling
    // ancestor's true edge, so its scrolled-state divider spans the
    // full pane width instead of stopping at the nearest padded ancestor.
    // 16 covers one padding level (this toolbar sitting directly in a
    // tab's v-card-text - PlayerEditor/BackgroundEditor/
    // TitleScreenEditor/ScoreFontEditor); TextFontEditor.vue passes 32,
    // since its toolbar sits inside a SECOND nested v-card-text (the
    // "Text Minikernel Font" sub-card) on top of that.
    bleed: {type: Number, default: 16},
    // Puts the export/import image buttons (and the "extra-tools" slot) at the
    // left of the tool group, before undo/redo, instead of at its end.
    importExportFirst: {type: Boolean, default: false},
  },
  data() {
    return {
      UNDO_TITLE,
      REDO_TITLE,
      isScrolled: false,
      palette: NTSC_COLORS,
    };
  },
  computed: {
    drawColor: {
      get() {
        return useDrawColor().value;
      },
      set(value) {
        useDrawColor().value = value;
      },
    },
    reorderCanUndo() {
      return canUndoReorder();
    },
    reorderCanRedo() {
      return canRedoReorder();
    },
    // Reads the active editor's reactive toggledTool directly (see
    // PixelEditor.vue's comment on why that's a separate string, not
    // literally "editor.tool") - Vue tracks this cross-component property
    // access the same as any other reactive read, so this recomputes
    // correctly the instant setTool() below mutates it, with no local
    // ref/watcher of this component's needed to keep them in sync.
    activeTool() {
      return this.activeEditor ? this.activeEditor.toggledTool : null;
    },
    // Which of the two mirror-draw buttons are on (see hooks/pixel-tool.js).
    mirrorModes() {
      const mirror = useMirrorDraw();
      return [...(mirror.horizontal ? ['horizontal'] : []), ...(mirror.vertical ? ['vertical'] : [])];
    },
    bleedStyle() {
      return {
        'marginLeft': `-${this.bleed}px`,
        'marginRight': `-${this.bleed}px`,
        'paddingLeft': `${this.bleed}px`,
        'paddingRight': `${this.bleed}px`,
        // Lets what sits inside the toolbar (the Quick colors divider) reach the same full width.
        '--toolbar-bleed': `${this.bleed}px`,
      };
    },
    // Whether the Undo button below has a quick color deletion it could
    // still restore (see hooks/quick-color-undo.js) - read here (not just
    // inline in the template) so the button stays enabled even with no
    // activeEditor at all, e.g. a color deleted before any card/frame was
    // ever selected.
    hasPendingQuickColorUndo() {
      return usePendingQuickColorDeletion().value;
    },
    // Same reasoning as hasPendingQuickColorUndo above, for a deleted
    // Title Screen card (see hooks/card-delete-undo.js).
    hasPendingCardUndo() {
      return usePendingCardDeletion().value;
    },
  },
  mounted() {
    // closest() (not querySelector, which only searches DESCENDANTS) since
    // .editor-container is sometimes this component's direct ancestor
    // (PlayerEditor/BackgroundEditor/TitleScreenEditor/ScoreFontEditor) and
    // sometimes further up past an extra nested card (TextFontEditor) -
    // one call handles both without the caller needing to say which case
    // it is.
    this.scrollContainer = this.$el.closest('.editor-container');
    if (this.scrollContainer) this.scrollContainer.addEventListener('scroll', this.handleScroll);
    // Only one GraphicEditorToolbar is ever mounted at a time (each tab's
    // route unmounts the previous one - no <keep-alive> wrapping
    // <router-view> - see App.vue), so a plain window-level listener here
    // never has to worry about two tabs' hotkeys firing at once.
    window.addEventListener('keydown', this.handleToolHotkey);
    document.addEventListener('mousedown', this.handleOutsideMouseDown, true);
  },
  beforeDestroy() {
    if (this.scrollContainer) this.scrollContainer.removeEventListener('scroll', this.handleScroll);
    window.removeEventListener('keydown', this.handleToolHotkey);
    document.removeEventListener('mousedown', this.handleOutsideMouseDown, true);
  },
  methods: {
    swatchCss(byte) {
      return colorByteToCss(byte);
    },
    setMirrorModes(modes) {
      const mirror = useMirrorDraw();
      mirror.horizontal = (modes || []).includes('horizontal');
      mirror.vertical = (modes || []).includes('vertical');
    },
    // Every marquee/selection tool (Rectangle, Circle, Polygon, and the
    // selection Move acts on) deactivates when the user clicks anywhere
    // outside the active graphic's canvas - clearing the selection and
    // discarding an unfinished polygon. Clicks inside this toolbar are
    // exempt, since switching tools (e.g. Rectangle Select -> Move) has to
    // keep the selection. Capture phase, so this runs before another card's
    // mousedown handler makes it the active editor.
    handleOutsideMouseDown(event) {
      const editor = this.activeEditor;
      if (!editor || !editor.deselect) return;
      const target = event.target;
      if (this.$el && this.$el.contains(target)) return;
      const canvases = [editor.$refs.editor, editor.$refs.gridOverlay];
      if (canvases.some((canvas) => canvas && canvas.contains(target))) return;
      editor.deselect();
    },
    handleScroll(event) {
      this.isScrolled = event.target.scrollTop > 0;
    },
    // Handles every graphic-editor hotkey in one place: the
    // (B/E/G/L/R/O/V/M/C/P) tool shortcuts (see each tool button's
    // title), "'" for the pixel grid overlay, Shift+"'" for its X,Y
    // coordinate labels, "H" for Set height, Shift+H/Shift+V for Flip
    // Horizontal/Vertical, and Escape to clear the current selection - all
    // the common Photoshop/Aseprite-style single-letter bindings, since
    // users coming from those tools already reach for them without
    // thinking.
    handleToolHotkey(event) {
      // Ctrl/Cmd+Z is the toolbar's Undo button, and Ctrl/Cmd+Y its Redo
      // button.
      const history = undoRedoKind(event);
      if (history === 'undo') {
        if (!this.activeEditor && !this.hasPendingQuickColorUndo && !this.hasPendingCardUndo &&
          !this.reorderCanUndo) return;
        event.preventDefault();
        this.handleUndo();
        return;
      }
      if (history === 'redo') {
        if (!this.activeEditor && !this.reorderCanRedo) return;
        event.preventDefault();
        this.handleRedo();
        return;
      }
      // Skip the other Ctrl/Cmd/Alt combos entirely (e.g. leaves
      // browser/OS shortcuts alone) - Shift alone is deliberately NOT
      // excluded, since holding it is also how Line/Rectangle/Oval's
      // 45-degree/square/circle snap works (see hooks/shift-key.js), and
      // it's also needed for the Shift+"'" XY-labels binding below.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // Never hijack a key the user is actually typing into a real text
      // field with (e.g. a frame's Duration number field sitting right next
      // to this toolbar).
      const target = event.target;
      const tag = target && target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return;

      const key = event.key;
      if (key === '\'') {
        event.preventDefault();
        if (event.shiftKey) {
          usePixelGridLabelsStorage().value = !usePixelGridLabelsStorage().value;
        } else {
          usePixelGridOverlayStorage().value = !usePixelGridOverlayStorage().value;
        }
        return;
      }
      // Grid/XY work with no card selected at all (see above); everything
      // below acts on the currently selected card/frame, so there's nothing
      // to do without one.
      if (!this.activeEditor) return;

      // Clears any active selection (and discards an in-progress, not-yet-
      // closed polygon - see PolygonSelect's cancel()), matching every
      // other image editor's "Escape backs out of the current selection"
      // convention.
      if (key === 'Escape') {
        event.preventDefault();
        this.activeEditor.deselect();
        return;
      }

      // Delete/Backspace clears the pixels inside the current marquee
      // selection. With nothing selected, Delete is left alone, so it can open the
      // confirmation for deleting the selected card or frame (see hooks/delete-shortcut.js).
      if (key === 'Delete' || key === 'Backspace') {
        const hasSelection = this.activeEditor.selection && this.activeEditor.selection.size;
        if (key === 'Delete' && !hasSelection) return;
        event.preventDefault();
        this.activeEditor.deleteSelection();
        return;
      }

      // Shift+H/Shift+V for Flip Horizontal/Vertical (matching Aseprite's
      // bindings) - checked ahead of the plain "H" height-hotkey below,
      // since that one's deliberately NOT shift-gated.
      if (key.toLowerCase() === 'h' && event.shiftKey) {
        event.preventDefault();
        this.activeEditor.flipHorizontal();
        return;
      }
      if (key.toLowerCase() === 'v' && event.shiftKey) {
        event.preventDefault();
        this.activeEditor.flipVertical();
        return;
      }

      // Shift+E/Shift+I for Export/Import - shift-gated (not plain E/I)
      // since E alone is already the Eraser tool (see TOOL_HOTKEYS below);
      // I is free either way, but kept shift-gated to match Export's
      // binding rather than reading as a separate, inconsistent choice.
      if (key.toLowerCase() === 'e' && event.shiftKey) {
        event.preventDefault();
        this.activeEditor.handleExportImage();
        return;
      }
      if (key.toLowerCase() === 'i' && event.shiftKey) {
        event.preventDefault();
        this.activeEditor.handleImportImage();
        return;
      }

      if (key.toLowerCase() === 'h') {
        event.preventDefault();
        this.$emit('height-hotkey');
        return;
      }
      const tool = TOOL_HOTKEYS[key.toLowerCase()];
      if (!tool) return;
      event.preventDefault();
      this.setTool(tool);
    },
    setTool(tool) {
      if (this.activeEditor) this.activeEditor.setTool(tool);
    },
    // Clicking the tool that is on turns it off: no tool is active then, and the row color bars open their palette again.
    toggleTool(tool) {
      this.setTool(this.activeTool === tool ? 'none' : tool);
    },
    // Tries the pending card deletion first (see hooks/card-delete-undo.js
    // - no staleness check, unlike quick color deletion below, since
    // nothing about a deleted card ties it to any particular frame's
    // pixel undo history the way a quick color swatch does), then the
    // pending quick color deletion (see hooks/quick-color-undo.js - only
    // actually restores it if nothing's been drawn on the SAME frame that
    // was focused when it was deleted since), falling through to this
    // frame's normal pixel undo either way otherwise.
    handleUndo() {
      if (tryUndoCardDeletion()) return;
      if (tryUndoQuickColorDeletion(this.activeEditor)) return;
      // A card, frame or background dragged into a new order comes back before older edits.
      if (tryUndoReorder()) return;
      if (this.activeEditor) {
        this.activeEditor.undo();
        settleEdits();
      }
    },
    handleRedo() {
      if (tryRedoReorder()) return;
      if (this.activeEditor) this.activeEditor.redo();
    },
  },
};
</script>
<style scoped>
.get-color-swatch {
  width: 24px;
  height: 24px;
  margin: 0 6px;
  align-self: center;
  flex: 0 0 auto;
  cursor: pointer;
  border: 1px solid rgba(0, 0, 0, 0.5);
  border-radius: 3px;
}

/* Dark mode (the .dark-mode class on the app root): a light border, a dark one would vanish. */
.dark-mode .get-color-swatch {
  border-color: rgba(255, 255, 255, 0.7);
}

/* No color chosen yet: a dashed empty box. */
.get-color-swatch-empty {
  border-style: dashed;
}

.get-palette-card {
  padding: 4px;
}

.get-palette-grid {
  display: grid;
  grid-template-columns: repeat(8, 28px);
  gap: 0;
}

.get-palette-swatch {
  width: 28px;
  height: 28px;
  cursor: pointer;
}

.get-palette-swatch:hover {
  box-shadow: inset 0 0 0 2px rgba(0, 0, 0, 0.45);
}

.get-palette-swatch.selected {
  box-shadow: inset 0 0 0 2px #000;
}

/* Sticks to the top of the tab's scrolling ancestor (.editor-container
   - see mounted()'s comment) as everything below it scrolls past, same
   position: sticky pattern every consuming tab used to implement by hand.
   background so scrolled-under content doesn't show through while pinned.
   A "below-tools" slot (e.g. the Quick colors bar - see BackgroundEditor.vue/
   PlayerEditor.vue/TitleScreenEditor.vue) stacks underneath the icon row
   inside this same pinned block, so it stays pinned too without needing
   separate sticky offset math - the icon row itself moved into a nested
   flex row below so this outer element can stack children vertically. */
.graphic-editor-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
  padding-top: 4px;
  padding-bottom: 4px;
  transition: padding 0.15s ease;
}

.graphic-editor-toolbar-row {
  display: flex;
  align-items: center;
}

/* "Soft Colors" (see App.vue's desaturate-app-colors class/comment) -
   matches the darker .editor-container this bar is pinned inside of once
   that's on, instead of staying the plain white every other surface swaps
   away from. */
.desaturate-app-colors .graphic-editor-toolbar {
  background-color: #e1e1e1;
}

/* Marks where the pinned bar ends and the (actually scrolling) content
   begins underneath it, once there's actually something scrolled under it
   to separate from - matches every tab's darkened outlined-card border
   color (App.vue's shared rule), not Vuetify's fainter default divider.
   Taller once actually pinned, for a bit more visual weight/breathing room
   than the flush, unscrolled-at-the-top state needs. */
.graphic-editor-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

/* Separates the caller's "before-tools" controls (zoom, pixel grid
   toggles) from the standard tool icons - a wider gap than the inner
   dividers below since it's splitting two unrelated groups, not sub-groups
   within one. */
.get-outer-divider {
  margin: 0 6px;
}

/* gap (not per-button margins) is what actually guarantees every icon-to-
   icon/icon-to-divider spacing in this row is identical - the individual
   margin-left/right !important overrides this replaced had drifted into
   different values per button through repeated one-off "nudge this one
   button" tweaks, which is exactly what made the spacing visibly uneven
   (confirmed as a real reported bug). */
.get-tools {
  display: flex;
  align-items: center;
  gap: 4px;
}

.get-tools >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
}

/* Same gap-based spacing for the Eraser/Pencil/Fill/Line group - v-btn-
   toggle already renders its buttons as a flex row, so this reaches them
   the same way .get-tools's gap reaches its direct children. */
.get-tools >>> .v-btn-toggle {
  gap: 4px;
}

/* Deep, so the dividers a screen puts into the extra-tools slot (rendered with that screen's
   scope, not this component's) get the same spacing as the ones above. */
.get-tools >>> .get-inner-divider {
  margin: 0;
}

/* The one divider OUTSIDE .get-tools (before the "after-tools" slot, e.g.
   TitleScreenEditor.vue's "Set height" button) - kept as its class
   (rather than reusing .get-inner-divider) specifically so its margin can
   stay independent of the gap-based spacing above, since that slot's
   content isn't a direct flex child of .get-tools the gap could reach. */
.get-after-tools-divider {
  margin: 0 2px;
}

.get-tools >>> .v-btn::before {
  display: none;
}

.get-tools >>> .v-btn .v-icon {
  font-size: 19px;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

/* Disabled buttons (no activeEditor - e.g. Import/Export/Undo/Redo/Flip
   with no card/frame selected) otherwise rendered at the exact same
   rgba(0,0,0,0.38) as an ENABLED button's resting color above (that
   rule's !important wins over Vuetify's default disabled dimming),
   reading as clickable when they're not - confirmed as a real reported
   bug on Import/Export specifically. Dimmed further so a disabled icon is
   visually distinct from a merely-unhovered enabled one. */
.get-tools >>> .v-btn--disabled .v-icon {
  color: rgba(0, 0, 0, 0.18) !important;
}

/* Line/Rectangle/Oval are all plain inline SVGs, not MDI glyphs - no set
   of existing MDI icons draws all three at a guaranteed, matchable stroke
   width the way hand-built ones sharing one stroke-width can.
   stroke-width 2 on this shared 24x24 viewBox is what actually GUARANTEES
   every outline reads as the exact same thickness, rather than
   approximating it by eye per icon the way font-based icons would need.
   Sized to the same 19px as Pencil (the one icon here still a real MDI
   glyph - .get-tools >>> .v-btn .v-icon's font-size, just expressed as
   width/height since an SVG has no font-size to size itself by) so they
   match at a glance rather than looking like a different icon set.
   fill: none + stroke: currentColor is what lets the existing hover/active/
   rest color rules below (all targeting ".v-icon", a class added directly
   to these plain SVGs for exactly this reason) reach them the same way
   they reach a real MDI glyph's font color. */
/* mdi-format-color-fill's glyph sits smaller within its icon box than
   mdi-pencil's does at the same font-size, rendering visibly smaller
   alongside it - bumped up to actually match instead of just matching the
   (misleading) shared font-size. */
.get-tools >>> .get-fill-button .v-icon {
  font-size: 24px;
  transform: translateY(2px);
}

.get-tools >>> .get-shape-icon {
  width: 19px;
  height: 19px;
  fill: none;
  stroke: currentColor;
  stroke-width: 2;
  stroke-linecap: round;
  stroke-linejoin: round;
}

/* Dashed, not solid - the classic "marching ants" marquee look, so the
   three selection tools read as a distinct kind of tool from the solid-
   stroke Rectangle/Oval DRAW tools right next to them, even though two of
   the three reuse the exact same underlying shapes. */
/* A near-zero dash length, combined with .get-shape-icon's
   stroke-linecap: round (inherited, not overridden here), draws each
   "dash" as a round dot instead of a short line segment - the classic
   dotted marquee look, not a dashed one. Dot SIZE is stroke-width (a round
   cap on a near-zero-length dash is just a filled circle that wide), not
   the dasharray itself - bumped past the shared 2px .get-shape-icon
   stroke-width so the dots actually read as dots, not tiny specks. */
.get-tools >>> .get-marquee-icon {
  stroke-width: 2.5;
  stroke-dasharray: 0.1 4.5;
}

/* The polygon path's points don't reach the 24x24 viewBox's edges as
   fully as the rectangle/circle marquee icons' shapes do, reading smaller
   alongside them at the same 19px box - bumped up to actually match. */
/* stroke-width/dasharray are in the shared 24x24 viewBox's units, not
   screen px - since this icon's rendered box (23px) is larger than the
   circle/rectangle marquee icons' (19px), the SAME stroke-width value
   renders visibly thicker dots here purely from that extra scale-up.
   Scaled back down by the same ratio (19/23) so the actual ON-SCREEN dot
   size matches those other two exactly. */
.get-tools >>> .get-polygon-icon {
  width: 23px;
  height: 23px;
  stroke-width: 2.07;
  stroke-dasharray: 0.08 3.7;
}

.get-tools >>> .v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.get-tools >>> .v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

.get-tools >>> .v-btn.v-btn--active .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

.get-tools >>> .v-btn-toggle {
  background-color: transparent !important;
}
</style>
