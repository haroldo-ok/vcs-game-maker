<template>
  <v-card outlined @click="handleMouse" @mousedown="handleActivate" :ripple="false">
    <v-card-text>
      <slot name="badge" />
      <div class="editor-with-sidebar">
        <div v-if="$slots.sidebar" class="editor-sidebar">
          <slot name="sidebar" />
        </div>
        <div class="proportion-wrapper">
          <div
            class="proportion-wrapper-stretcher"
            :style="{'padding-bottom': 100 / aspectRatio + '%'}"
          />
          <canvas
            ref="editor"
            class="editor-canvas"
            :class="{
              'editor-canvas-tool-pencil': toggledTool === 'pencil',
              'editor-canvas-tool-eraser': toggledTool === 'eraser',
              'editor-canvas-tool-fill': toggledTool === 'fill',
              'editor-canvas-tool-eyedropper': toggledTool === 'eyedropper',
              'editor-canvas-tool-line': toggledTool === 'line',
              'editor-canvas-tool-shape': toggledTool === 'rectangle' || toggledTool === 'oval' ||
                toggledTool === 'rect-select' || toggledTool === 'circle-select' || toggledTool === 'polygon-select',
              'editor-canvas-tool-move': toggledTool === 'move',
            }"
            @mousedown="(e) => { handleStrokeStart(); handleMouse(e); }"
            @mouseup="(e) => { strokeStart = null; handleMouse(e); }"
            @mouseenter="(e) => { handleMouse(e); handleHover(e); }"
            @mouseleave="handleMouseLeave"
            @mousemove="(e) => { handleMouse(e); handleHover(e); }"
          />
          <canvas
            v-if="columnBackdrop || rowBackdrop || rowColorsFine"
            ref="backdropOverlay"
            class="editor-canvas backdrop-canvas"
          />
          <canvas
            v-if="showGrid || selection || polygonPreview || hoverCell"
            ref="gridOverlay"
            class="grid-overlay-canvas"
          />
        </div>
        <div v-if="$slots['sidebar-right']" class="editor-sidebar">
          <slot name="sidebar-right" />
        </div>
      </div>
      <!-- A row under the canvas, lined up with it: "below" sits under the canvas, "below-sidebar" under the
           sidebar beside it. -->
      <div v-if="$slots.below" class="editor-with-sidebar editor-below">
        <div v-if="$slots['below-sidebar']" class="editor-sidebar">
          <slot name="below-sidebar" />
        </div>
        <div class="proportion-wrapper">
          <slot name="below" />
        </div>
      </div>
    </v-card-text>
    <!-- Every real call site now drives this component's tools (Eraser/
         Pencil/Undo/Redo/Export/Import/Set height) from a single toolbar
         shared across a whole tab (see GraphicEditorToolbar.vue) rather than
         a per-instance one - Clear is the one action still requested per
         card/frame, so it's the only thing left to render here. -->
    <v-card-actions v-if="showClearButton" class="pixel-editor-tools">
      <v-btn
        v-if="$slots.sidebar"
        icon
        small
        title="Clear this graphic's color data only (leaves the drawing itself untouched)"
        class="pixel-editor-clear-colors-btn"
        @click="$emit('clear-colors')"
      >
        <v-icon>mdi-invert-colors-off</v-icon>
      </v-btn>
      <div class="pixel-editor-hidden-toolbar-row">
        <slot name="toolbar-end" />
        <v-btn
          icon
          small
          title="Clear"
          @click="handleClear"
        >
          <v-icon>mdi-broom</v-icon>
        </v-btn>
      </div>
      <v-btn
        v-if="$slots['sidebar-right']"
        icon
        small
        title="Clear this graphic's background row colors only (leaves the drawing and the playfield row colors untouched)"
        class="pixel-editor-clear-colors-btn pixel-editor-clear-colors-btn-right"
        @click="$emit('clear-bk-colors')"
      >
        <v-icon>mdi-invert-colors-off</v-icon>
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
<script>
import {PixelEditor, Pencil} from '@curtishughes/pixel-editor';
import {chunk, debounce} from 'lodash';
import {saveAs} from 'file-saver';

import Bucket from '../utils/bucket-tool';
import Eyedropper from '../utils/eyedropper-tool';
import Line from '../utils/line-tool';
import Rectangle from '../utils/rectangle-tool';
import Oval from '../utils/oval-tool';
import Move from '../utils/move-tool';
import {RectangleSelect, CircleSelect, PolygonSelect} from '../utils/selection-tools';
import {isMatrixEqual} from '../utils/array';
import {getDateInfix} from '../utils/date';
import {loadImageFromFile, openFileDialog} from '../utils/file';
import {createResizedCanvas} from '../utils/image';
import {usePixelTool, useMirrorDraw, useDrawColor} from '../hooks/pixel-tool';
import {colorByteToCss} from '../utils/palette';
import {noteEdit, recordReorder} from '../hooks/reorder-history';
import {limitPixelHistory} from '../hooks/undo-limit';
import {resizePixelMatrixHeight} from '../utils/pixels';

export default {
  props: {
    value: {type: Array, default: null},
    width: {type: Number, default: 32},
    height: {type: Number, default: 12},
    aspectRatio: {type: Number, default: 4.0 / 3},
    fgColor: {type: String, default: 'white'},
    bgColor: {type: String, default: 'black'},
    // Optional per-row CSS colors for "on" pixels (one entry per row). When
    // provided, each row's set pixels are drawn in its  color instead of
    // fgColor, so the playfield preview reflects the batari Basic pfcolors.
    rowColors: {type: Array, default: null},
    name: {type: String, default: 'image'},
    allowChangingHeight: {type: Boolean, default: true},
    // Shows a one-click "Clear" button next to the Eraser/Pencil tools -
    // opt-in (default off) since most PixelEditor uses (sprite frames, the
    // score font, ...) already have their  way to start a frame over
    // (switching frames, importing an image), and a stray "wipe everything"
    // button isn't worth the risk of a misclick there. Backgrounds are the
    // one place a whole-grid clear is actually useful by itself.
    showClearButton: {type: Boolean, default: false},
    // Draws a thin grid line around every cell, on a separate overlay
    // canvas layered on top of the real drawing canvas (see mounted()'s
    // ResizeObserver) - a pure visual aid, never part of the pixel data
    // itself.
    showGrid: {type: Boolean, default: false},
    // Labels each cell with its  column index (0-based, matching the X
    // argument every "Background: pixel at X/Y" block already uses) at the
    // cell's center - opt-in separately from showGrid since it's only
    // useful on the wide, many-columned Background canvas; a narrow sprite
    // frame has no room to render it legibly and no matching "X" concept
    // worth calling out cell by cell.
    showCellIds: {type: Boolean, default: false},
    // The column the first column of this editor is in a picture that is shown in several editors side by side (the labels count on from it).
    cellIdColumnOffset: {type: Number, default: 0},
    // One CSS color per column, drawn over the cells that are off (a preview of what shows behind
    // the picture, such as the Title tab's picture background); null leaves the cells as they are.
    columnBackdrop: {type: Array, default: null},
    // One CSS color per row, drawn over the cells that are off the same way (the background colors behind a DPC+ background).
    rowBackdrop: {type: Array, default: null},
    // Colors with a number of rows that is not the number of rows of the picture (the color rows of a DPC+ background, each one color for a part of
    // the height of the picture): one CSS color for each of them, drawn over the cells that are on (rowColorsFine) or off (rowBackdropFine) so that the
    // colors change at exactly the heights they have, in the middle of a picture row where that is where they change. Null for the usual one color a row.
    rowColorsFine: {type: Array, default: null},
    rowBackdropFine: {type: Array, default: null},
  },
  data() {
    return {
      pencil: new Pencil(this.fgColor),
      eraser: new Pencil(this.bgColor),
      fill: new Bucket(this.fgColor),
      eyedropper: new Eyedropper((cell) => this.pickColorAt(cell)),
      // No tool: the picture is left alone.
      noTool: new Eyedropper(() => {}),
      line: new Line(this.fgColor),
      rectangle: new Rectangle(this.fgColor),
      oval: new Oval(this.fgColor),
      move: new Move(() => this.selection, (sel) => {
        this.selection = sel;
      }, this.bgColor, (move) => this.handleMoveRows(move)),
      rectSelect: new RectangleSelect((sel) => {
        this.selection = sel;
      }, () => this.selection),
      circleSelect: new CircleSelect((sel) => {
        this.selection = sel;
      }, () => this.selection),
      polygonSelect: new PolygonSelect((sel) => {
        this.selection = sel;
      }, (points) => {
        this.polygonPreview = points;
      }, () => this.selection),
      // A Set of "x,y" cell keys, or null for "nothing selected" - see
      // selection-tools.js/move-tool.js. Reassigned wholesale (never
      // mutated in place) every time it changes, since Vue 2 can't observe
      // a plain Set's mutations.
      selection: null,
      // The rows (and how far) the pixels of a Move drag in progress have moved, and the moves
      // that can be undone or redone - see handleMoveRows. Plain data nothing renders from.
      rowMove: null,
      rowMoveUndo: [],
      rowMoveRedo: [],
      // See handleStrokeStart/cancelStroke - the state to roll back to if
      // the current drag leaves the canvas, or null while no button is down.
      strokeStart: null,
      // The polygon-select tool's in-progress vertex list (see its
      // onPreview callback), or null while it's not mid-polygon - without
      // rendering these as they're placed, every click looked like it did
      // nothing at all until a polygon happened to actually close.
      polygonPreview: null,
      // The cell ({x,y}) the pointer is currently hovering, or null while
      // it's outside the canvas - lets drawGridOverlay() highlight exactly
      // which pixel a click would affect right now, regardless of which
      // tool is active (draw, erase, fill, select, ...). Updated directly
      // by handleHover below, not through handleMouse's debounced tool-
      // driven path - a hover highlight that lagged behind the cursor by
      // handleMouse's 10ms debounce would feel noticeably laggy for
      // something meant to track the pointer in real time.
      hoverCell: null,
    };
  },
  computed: {
    rowBackdropKey() {
      return (this.rowBackdrop ? this.rowBackdrop.join() : '') + '|' + (this.rowColorsFine ? this.rowColorsFine.join() : '') + '|' +
        (this.rowBackdropFine ? this.rowBackdropFine.join() : '');
    },
    // Changes whenever a mirror drawing switch is flipped, so the hover
    // highlight can be redrawn with or without the mirrored cells.
    mirrorKey() {
      const mirror = useMirrorDraw();
      return `${mirror.horizontal}-${mirror.vertical}`;
    },
    // 'pencil' or 'eraser' - which tool is currently active, shared across
    // every PixelEditor.vue instance (see hooks/pixel-tool.js's comment
    // for why this moved out of per-instance data()). Read externally by
    // GraphicEditorToolbar.vue's activeTool computed to highlight the
    // right one on the shared toolbar, and set externally via setTool()
    // below - this instance no longer renders its Eraser/Pencil buttons
    // at all (see setTool's comment).
    toggledTool: {
      get() {
        return usePixelTool().value;
      },
      set(value) {
        usePixelTool().value = value;
      },
    },
  },
  mounted() {
    this.initEditor(this.value.length, this.value);

    if (this.showGrid || this.selection || this.polygonPreview || this.hoverCell) this.setupGridOverlay();
    this.setupBackdrop();
    window.addEventListener('mouseup', this.handleWindowMouseUp);
  },
  beforeDestroy() {
    window.removeEventListener('mouseup', this.handleWindowMouseUp);
    this.teardownGridOverlay();
    if (this.backdropObserver) this.backdropObserver.disconnect();
  },
  watch: {
    columnBackdrop() {
      this.$nextTick(() => this.setupBackdrop());
    },
    rowBackdropKey() {
      this.$nextTick(() => this.setupBackdrop());
    },
    mirrorKey() {
      if (this.hoverCell && this.gridResizeObserver) this.$nextTick(() => this.drawGridOverlay());
    },
    // Keeps THIS instance's underlying editor.tool object (a real
    // Pencil, colored with this instance's fgColor/bgColor - see
    // data()) in sync with the shared toggledTool (hooks/pixel-tool.js) at
    // all times, not just at construction - without this, an already-
    // mounted-but-not-currently-focused instance (e.g. a different card's
    // frame) kept whatever tool object it was built or last explicitly
    // setTool()'d with, so clicking Eraser on frame A then clicking INTO
    // frame B still drew with frame B's stale Pencil until Eraser was
    // clicked again there too - exactly the bug being fixed here.
    toggledTool(toolName, previousToolName) {
      if (this.editor) this.editor.tool = this.toolFor(toolName);
      if (this.hoverCell && this.gridResizeObserver) this.$nextTick(() => this.drawGridOverlay());
      // Leaving the selection tools and Move for a drawing tool drops the
      // selection (and a half-made polygon). Moving between the selection tools
      // and Move keeps it, since Move works on the selection. Every editor sees
      // the shared tool change, so a selection left in another frame goes too.
      const selectionTools = ['rect-select', 'circle-select', 'polygon-select', 'move'];
      if (selectionTools.includes(previousToolName) && !selectionTools.includes(toolName)) this.deselect();
    },
    // Recolor the existing pixels when the row colors change (e.g. the user
    // picks a new color in the strip) without disturbing the drawn shape.
    // logToHistory: false - same reasoning as handleMouse's recolor
    // call below: this re-expresses the CURRENT pixel matrix with new
    // display colors, not a new edit, so it shouldn't consume an undo step.
    // Left true (the default) here, TitleScreenEditor.vue was a real
    // reported case where this fired mid-drag - its @input handler
    // calls ensureRowColors() on every stroke (unlike Background/Player,
    // which only do that on frame-add/resize), and editorRowColors()
    // allocates a fresh array every render, so a fresh `rowColors` prop
    // reference here is more likely there than elsewhere - each fresh
    // reference re-pushed a history entry Rectangle/Line/Oval's
    // undo()-then-redraw preview didn't expect, leaving old preview
    // positions never actually erased (a "trail").
    rowColors() {
      if (this.editor) {
        this.setPixels(this.getPixels(), false);
      }
    },
    // The overlay canvas only exists in the DOM while showGrid, selection,
    // OR polygonPreview is truthy (see the template's  v-if) - the
    // ResizeObserver has to be (re)attached to whichever real element
    // currently exists, not created once up front. Only tears the overlay
    // down when NONE of the three is active - selection/polygonPreview also
    // draw on this same canvas (see drawGridOverlay), so a project with
    // showGrid off but an active selection (or in-progress polygon) still
    // needs it mounted.
    showGrid(value) {
      if (value || this.selection || this.polygonPreview || this.hoverCell) {
        this.$nextTick(() => this.setupGridOverlay());
      } else {
        this.teardownGridOverlay();
      }
    },
    // Same overlay-lifecycle reasoning as showGrid just above, from the
    // other direction - a selection tool can make this go from null to a
    // real Set (or back) at any time, independent of showGrid.
    selection(value) {
      if (value || this.showGrid || this.polygonPreview || this.hoverCell) {
        this.$nextTick(() => {
          if (!this.gridResizeObserver) this.setupGridOverlay();
          else this.drawGridOverlay();
        });
      } else {
        this.teardownGridOverlay();
      }
    },
    // Same overlay-lifecycle reasoning again, for the polygon tool's
    // in-progress vertex list (see PolygonSelect's onPreview callback).
    polygonPreview(value) {
      if (value || this.showGrid || this.selection || this.hoverCell) {
        this.$nextTick(() => {
          if (!this.gridResizeObserver) this.setupGridOverlay();
          else this.drawGridOverlay();
        });
      } else {
        this.teardownGridOverlay();
      }
    },
    // Same overlay-lifecycle reasoning again, for the hover highlight -
    // fires on essentially every mousemove while over the canvas (see
    // handleHover), so the common case (overlay already mounted from a
    // previous hover) takes the cheap drawGridOverlay()-only branch; only
    // the very first hover (or one starting after everything else that
    // keeps the overlay mounted has cleared) pays for a real setup.
    hoverCell(value) {
      if (value || this.showGrid || this.selection || this.polygonPreview) {
        this.$nextTick(() => {
          if (!this.gridResizeObserver) this.setupGridOverlay();
          else this.drawGridOverlay();
        });
      } else {
        this.teardownGridOverlay();
      }
    },
    // The "height" prop (used for aspectRatio's CSS sizing upstream -
    // see BackgroundEditor.vue's identical background.pixels.length-based
    // expression for both) can update slightly AHEAD of the "value" prop
    // reaching this same update, within the same Vue patch - reflowing the
    // wrapper's on-screen box to the new row count before initEditor
    // has actually resized the underlying canvas/grid to match. Normally
    // the "value" watcher below catches up in the same tick regardless,
    // but confirmed as a real reported gap (Superchip pfres changes -
    // reflowBackgroundsToHeight): the canvas was left showing its OLD
    // row count's content stretched/squished into the NEW aspect-ratio
    // box, not just briefly but persistently, whenever something about
    // that specific reflow's timing meant the "value" watcher's
    // reference-equality check didn't end up firing. This is a direct,
    // redundant safety net - if the underlying editor's row count is
    // already out of sync with this prop by the time it changes, fix it
    // here too, independent of whatever "value" does or doesn't do.
    height(newHeight) {
      if (this.editor && this.editor.height !== newHeight && this.value) {
        this.initEditor(newHeight, this.value);
      }
      this.$nextTick(() => this.drawGridOverlay());
    },
    // A different row height (the pfres a background sets) reshapes the box the canvas is stretched into.
    aspectRatio() {
      this.$nextTick(() => this.drawGridOverlay());
    },
    showCellIds() {
      this.drawGridOverlay();
    },
    // Picks up a row-count change this component DIDN'T itself just emit -
    // needed for "Set height" resizing every frame on a card together (see
    // e.g. PlayerEditor.vue's handleUnifiedSetHeight): every OTHER
    // frame's PixelEditor instance never sees that resize happen
    // locally (only the ONE frame applyHeight was actually called on does),
    // it only sees its "value" prop change out from under it once
    // PlayerEditor.vue applies the resize to its frame.pixels - and the
    // underlying PixelEditor library has no
    // built-in way to change its  row count after construction (see
    // initEditor's  comment), so without this, every other frame would
    // keep silently rendering at its OLD height/content until manually
    // reopened.
    //
    // A same-LENGTH "value" change also needs picking up - e.g. Copy/Paste
    // Frame (PlayerEditor.vue's  handlePasteFrame) pastes another
    // frame's pixels straight into this one's "value" prop with no local
    // draw stroke involved at all - confirmed as a real reported bug: when
    // the pasted frame happened to be the same height as this one, the
    // canvas kept showing its OLD content until manually reopened, even
    // though "value" (and the row-color sidebar, a separate component bound
    // directly to frame.rowColors) had already updated. Guarded on an
    // actual PIXEL mismatch against what's currently drawn (not just any
    // "value" change) so an ordinary same-height pixel edit doesn't
    // redundantly redraw itself on every stroke - that echo already matches
    // what's on screen, since it's this same instance's  just-emitted
    // change coming back through its  prop.
    value(newValue) {
      if (!this.editor || !newValue) return;
      // Ignored while a mouse button is down on the canvas: the "value"
      // coming back mid-stroke is the debounced echo of an OLDER preview
      // state, and syncing it would redraw that stale state over the live
      // preview and push an extra undo entry. Line/Rectangle/Oval undo()
      // their last entry on every move, so they then undid the wrong entry
      // and left pixels behind (timing-dependent, hence "sometimes"). The
      // editor is the source of truth until the stroke ends, and the final
      // post-stroke emit matches it.
      if (this.strokeStart) return;
      if (newValue.length !== this.editor.height) {
        this.initEditor(newValue.length, newValue);
      } else if (!isMatrixEqual(newValue, this.getPixels())) {
        this.setPixels(newValue);
      }
    },
  },
  methods: {
    // The overlay canvas is sized to its  CSS-rendered pixel dimensions
    // (not the drawing canvas's  tiny intrinsic width/height, one unit
    // per cell - see PixelEditor's  constructor) so grid lines and cell
    // labels stay crisp and legible at any zoom level, rather than being
    // stretched/blurred the same "pixelated" way the actual artwork is.
    // That means it has to be redrawn whenever its  rendered SIZE
    // changes - zooming, resizing the window, or the sidebar/toolbar
    // reflowing - which a plain mounted()-once draw can't catch by itself.
    setupGridOverlay() {
      this.teardownGridOverlay();
      const canvas = this.$refs.gridOverlay;
      if (!canvas) return;
      this.gridResizeObserver = new ResizeObserver(() => this.drawGridOverlay());
      this.gridResizeObserver.observe(canvas);
      this.drawGridOverlay();
    },

    setupBackdrop() {
      if (this.backdropObserver) {
        this.backdropObserver.disconnect();
        this.backdropObserver = null;
      }
      const canvas = this.$refs.backdropOverlay;
      if (!canvas) return;
      this.backdropObserver = new ResizeObserver(() => this.drawBackdrop());
      this.backdropObserver.observe(canvas);
      this.drawBackdrop();
    },

    // Paints each off cell in its column's backdrop color, on a canvas above the drawing.
    scheduleBackdrop() {
      if (this.backdropFrame) return;
      this.backdropFrame = requestAnimationFrame(() => {
        this.backdropFrame = 0;
        this.drawBackdrop();
      });
    },

    drawBackdrop() {
      const canvas = this.$refs.backdropOverlay;
      if (!canvas || !this.editor) return;
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (!cssWidth || !cssHeight) return;
      // Drawn on a canvas whose number of pixels is a whole number of pixels for every cell and for every row of colors in each direction, a little
      // more than the device pixels the canvas takes, and scaled down smoothly: every row is then exactly the same height as the others (a canvas of
      // any other number of pixels has some of them a pixel taller than the rest).
      const rows = this.editor.height;
      const gcd = (a, b) => (b ? gcd(b, a % b) : a);
      let heightUnit = rows;
      [this.rowColorsFine, this.rowBackdropFine].forEach((fine) => {
        if (fine && fine.length) heightUnit = heightUnit / gcd(heightUnit, fine.length) * fine.length;
      });
      canvas.width = this.width * Math.max(1, Math.ceil(Math.round(cssWidth * dpr) / this.width));
      canvas.height = heightUnit * Math.max(1, Math.ceil(Math.round(cssHeight * dpr) / heightUnit));
      const ctx = canvas.getContext('2d');
      const cellWidth = canvas.width / this.width;
      const cellHeight = canvas.height / rows;
      // The whole picture is repainted here (off cells in their backdrop color, the others as they are),
      // so the drawing underneath, scaled a little differently, can't show through between cells.
      this.editor.pixels.forEach((px) => {
        if (!px.color || px.y < 0 || px.y >= rows) return;
        const off = px.color === this.bgColor;
        const color = (off && ((this.rowBackdrop && this.rowBackdrop[px.y]) || (this.columnBackdrop && this.columnBackdrop[px.x]))) ||
          px.color;
        // Edges rounded to whole pixels, so neighbouring cells meet without gaps or overlap.
        const left = Math.round(px.x * cellWidth);
        const top = Math.round(px.y * cellHeight);
        const right = Math.round((px.x + 1) * cellWidth);
        const bottom = Math.round((px.y + 1) * cellHeight);
        const fine = off ? this.rowBackdropFine : this.rowColorsFine;
        if (fine && fine.length && (off || px.color !== this.bgColor)) {
          // Each row of colors that the cell is in, from the top of the cell to the bottom, for the part of the cell it covers.
          const count = fine.length;
          const first = Math.floor(px.y * count / rows);
          const last = Math.ceil((px.y + 1) * count / rows) - 1;
          for (let k = first; k <= last; k++) {
            const partTop = Math.max(top, Math.round(k * canvas.height / count));
            const partBottom = Math.min(bottom, Math.round((k + 1) * canvas.height / count));
            if (partBottom <= partTop) continue;
            ctx.fillStyle = fine[k];
            ctx.fillRect(left, partTop, right - left, partBottom - partTop);
          }
          return;
        }
        ctx.fillStyle = color;
        ctx.fillRect(left, top, right - left, bottom - top);
      });
    },

    teardownGridOverlay() {
      if (this.gridResizeObserver) {
        this.gridResizeObserver.disconnect();
        this.gridResizeObserver = null;
      }
    },

    drawGridOverlay() {
      const canvas = this.$refs.gridOverlay;
      if (!canvas) return;
      // devicePixelRatio-aware, same reasoning as any crisp-canvas-text
      // setup - drawing at the CSS size alone leaves grid lines/text soft
      // on a high-DPI display.
      const dpr = window.devicePixelRatio || 1;
      const cssWidth = canvas.clientWidth;
      const cssHeight = canvas.clientHeight;
      if (!cssWidth || !cssHeight) return;
      canvas.width = Math.round(cssWidth * dpr);
      canvas.height = Math.round(cssHeight * dpr);

      const ctx = canvas.getContext('2d');
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssWidth, cssHeight);

      const cols = this.width;
      const rows = this.editor ? this.editor.height : this.height;
      const cellWidth = cssWidth / cols;
      const cellHeight = cssHeight / rows;

      // Guarded on showGrid specifically - this same canvas is also used
      // to draw the selection highlight below regardless of showGrid (see
      // the template's v-if="showGrid || selection"), so a project
      // with the grid off but an active selection shouldn't also get grid
      // lines it never asked for.
      if (this.showGrid) {
        ctx.strokeStyle = 'rgba(170, 170, 170, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        for (let col = 0; col <= cols; col++) {
          // +0.5 lands the 1px line exactly on a device pixel instead of
          // straddling two (and rendering as a blurry 2px band) - the
          // standard canvas crisp-line trick.
          const x = Math.round(col * cellWidth) + 0.5;
          ctx.moveTo(x, 0);
          ctx.lineTo(x, cssHeight);
        }
        for (let row = 0; row <= rows; row++) {
          const y = Math.round(row * cellHeight) + 0.5;
          ctx.moveTo(0, y);
          ctx.lineTo(cssWidth, y);
        }
        ctx.stroke();
      }

      // A semi-transparent fill over every selected cell, plus a solid
      // border wherever a selected cell's edge borders a NON-selected one
      // (or the canvas edge) - drawing the border per-edge like this
      // (rather than one rectangle around the selection's bounding
      // box) is what makes a non-rectangular selection (CircleSelect,
      // PolygonSelect) read as its actual shape instead of a plain box.
      if (this.selection && this.selection.size) {
        ctx.fillStyle = 'rgba(33, 150, 243, 0.35)';
        this.selection.forEach((key) => {
          const [col, row] = key.split(',').map(Number);
          ctx.fillRect(col * cellWidth, row * cellHeight, cellWidth, cellHeight);
        });
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.selection.forEach((key) => {
          const [col, row] = key.split(',').map(Number);
          const x0 = col * cellWidth;
          const y0 = row * cellHeight;
          const x1 = x0 + cellWidth;
          const y1 = y0 + cellHeight;
          if (!this.selection.has(`${col},${row - 1}`)) {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x1, y0);
          }
          if (!this.selection.has(`${col},${row + 1}`)) {
            ctx.moveTo(x0, y1);
            ctx.lineTo(x1, y1);
          }
          if (!this.selection.has(`${col - 1},${row}`)) {
            ctx.moveTo(x0, y0);
            ctx.lineTo(x0, y1);
          }
          if (!this.selection.has(`${col + 1},${row}`)) {
            ctx.moveTo(x1, y0);
            ctx.lineTo(x1, y1);
          }
        });
        ctx.stroke();
      }

      // The polygon tool's in-progress vertex list (see PolygonSelect's
      // onPreview callback) - a small dot at each placed vertex's cell
      // center plus an open polyline connecting them in order, so a click
      // visibly does something immediately instead of looking like a no-op
      // until the polygon happens to close (the actual reported "doesn't
      // seem to work" bug this preview exists to fix).
      if (this.polygonPreview && this.polygonPreview.length) {
        ctx.fillStyle = 'rgba(33, 150, 243, 0.95)';
        ctx.strokeStyle = 'rgba(33, 150, 243, 0.95)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        this.polygonPreview.forEach((point, i) => {
          const x = (point.x + 0.5) * cellWidth;
          const y = (point.y + 0.5) * cellHeight;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.stroke();
        const dotRadius = Math.min(cellWidth, cellHeight) * 0.15;
        this.polygonPreview.forEach((point) => {
          const x = (point.x + 0.5) * cellWidth;
          const y = (point.y + 0.5) * cellHeight;
          ctx.beginPath();
          ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
          ctx.fill();
        });
      }

      // Hover highlight - a subtle, tool-agnostic "this is the pixel a
      // click would affect right now" cue (draw, erase, fill, select,
      // move, ...), drawn last so it always reads on top of the grid/
      // selection/polygon-preview layers above rather than getting
      // visually lost under a selection's tint. A light, neutral
      // overlay (not the selection's blue) so it never looks like an
      // actual selection - just a cursor-following highlight.
      if (this.hoverCell) {
        // With mirror drawing on, the cells a draw tool would also change get
        // the same highlight.
        this.hoverCellsWithMirrors().forEach(({x: hx, y: hy}) => {
          ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
          ctx.fillRect(hx * cellWidth, hy * cellHeight, cellWidth, cellHeight);
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
          ctx.lineWidth = 1;
          ctx.strokeRect(hx * cellWidth + 0.5, hy * cellHeight + 0.5, cellWidth - 1, cellHeight - 1);
        });
      }

      if (!this.showCellIds) return;
      // "X,Y" - matches the two arguments every "Background: pixel at X/Y"
      // block already uses, so a cell's  coordinates can be read
      // straight off the grid while wiring one up. Skipped entirely once
      // cells are too small to hold a legible label, rather than drawing
      // illegible overlapping text - a wider budget than a single number
      // would need, since "X,Y" is always at least 3 characters.
      const fontSize = Math.min(cellHeight * 0.6, cellWidth * 0.35, 12);
      if (fontSize < 5) return;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Each label is drawn in whichever of white and black reads best against the color of its cell (an "on" pixel in its row
      // color, an off one in its backdrop color or the background color), so it stays readable on black, white and every color between.
      // editor.pixels holds EVERY cell, on or off (setPixels above always writes a real color either way), so the color of a cell is
      // the one stored for it, with an off cell showing the backdrop of its row or column when it has one, as the cells are painted.
      const cellColors = new Map();
      this.editor.pixels.forEach((px) => {
        const off = px.color === this.bgColor;
        const color = (off && ((this.rowBackdrop && this.rowBackdrop[px.y]) || (this.columnBackdrop && this.columnBackdrop[px.x]))) ||
          px.color;
        cellColors.set(`${px.x},${px.y}`, color);
      });
      const labelColors = new Map();
      const labelColorFor = (cssColor) => {
        const key = cssColor || this.bgColor;
        if (!labelColors.has(key)) labelColors.set(key, this.contrastingLabelColor(key));
        return labelColors.get(key);
      };
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.fillStyle = labelColorFor(cellColors.get(`${col},${row}`));
          ctx.fillText(`${col + this.cellIdColumnOffset},${row}`, (col + 0.5) * cellWidth, (row + 0.5) * cellHeight);
        }
      }
    },

    // White or black text, whichever has the higher contrast ratio (WCAG relative luminance) against the given CSS color.
    contrastingLabelColor(cssColor) {
      const probe = document.createElement('canvas').getContext('2d', {willReadFrequently: true});
      probe.fillStyle = '#000000';
      probe.fillStyle = cssColor;
      probe.fillRect(0, 0, 1, 1);
      const [r, g, b] = probe.getImageData(0, 0, 1, 1).data;
      const linear = (channel) => {
        const v = channel / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      };
      const luminance = 0.2126 * linear(r) + 0.7152 * linear(g) + 0.0722 * linear(b);
      // Contrast with white is 1.05 / (L + 0.05), with black (L + 0.05) / 0.05.
      return 1.05 / (luminance + 0.05) > (luminance + 0.05) / 0.05 ? 'rgba(255, 255, 255, 0.95)' : 'rgba(0, 0, 0, 0.9)';
    },

    // The underlying @curtishughes/pixel-editor library only listens for
    // "mouseup" on the canvas ITSELF (see its  constructor) - it has no
    // "mouseleave" handling at all. Dragging the pointer off the canvas
    // while a button is still held (a real, easy-to-do gesture, e.g.
    // drawing right up to an edge) and releasing OUTSIDE it means the
    // canvas's "mouseup" never fires, so the library's  tool (see
    // its handlePointerDown/handlePointerUp) is left thinking the button
    // is still down - re-entering the canvas afterward, with the button
    // genuinely up, then immediately resumes drawing on the very next
    // "mousemove", with no mousedown. Confirmed as a real,
    // reproducible bug across every card that uses this component (Player
    // Sprite, Background, Score digits - anywhere PixelEditor.vue is used).
    // Forcing a synthetic "mouseup" the instant the pointer leaves the
    // canvas - passing the real mouseleave event through, since
    // PixelEditor's  mouseup(e) reads e.clientX/clientY the exact same
    // way a real mouseup event would - releases the tool's  state
    // immediately, regardless of whether the button is later released
    // inside or outside the canvas. Not debounced (unlike handleMouse
    // below, which still runs right after to resync Vue's  reactive
    // pixel state) - the release itself needs to happen synchronously, or
    // a mousemove landing before the debounce fires would still draw.
    handleMouseLeave(event) {
      // The release below is forced by leaving, and cancelStroke then rolls the drag back, so a
      // Move drag is not recorded as a finished move (see handleMoveRows).
      this.leavingCanvas = true;
      if (this.editor) this.editor.mouseup(event);
      this.leavingCanvas = false;
      this.cancelStroke();
      this.handleMouse();
      this.hoverCell = null;
    },

    // Snapshot taken the instant a mouse button goes down on the canvas
    // (before the library's mousedown listener runs the tool), so a stroke
    // that leaves the canvas can be rolled back to exactly this state - see
    // cancelStroke.
    handleStrokeStart() {
      if (!this.editor) return;
      noteEdit();
      // A new gesture ends whatever could still be redone.
      this.rowMoveRedo = [];
      this.strokeStart = {
        historyLength: this.editor.history.undoStack.length,
        redoStack: [...this.editor.history.redoStack],
        selection: this.selection,
        // The history keeps at most the app's number of undo steps (see hooks/undo-limit.js), so once it is full a stroke adds none
        // and the length alone can't tell what the stroke drew.
        pixels: this.getPixels(),
      };
    },

    // The button released somewhere other than the canvas (outside the window, say) without a
    // mouseleave having ended the stroke: abandon it the same way leaving the canvas does.
    handleWindowMouseUp(event) {
      if (!this.strokeStart || event.target === this.$refs.editor) return;
      this.handleMouseLeave(event);
    },

    // Dragging a drawing/selection tool off the canvas abandons the whole
    // stroke instead of committing whatever it had drawn so far: every
    // history entry the stroke added is rolled back (and the redo stack
    // restored, so the abandoned stroke can't be "redone" back in), and the
    // selection returns to what it was before. Tools that act on a single
    // click rather than a drag (Fill) and the click-by-click Polygon Select
    // are left alone - leaving the canvas between clicks is normal there.
    cancelStroke() {
      const start = this.strokeStart;
      this.strokeStart = null;
      if (!start || !this.editor) return;
      const dragTools = ['pencil', 'eraser', 'line', 'rectangle', 'oval', 'move',
        'rect-select', 'circle-select'];
      if (!dragTools.includes(this.toggledTool)) return;
      const history = this.editor.history;
      while (history.undoStack.length > start.historyLength) this.editor.undo();
      history.redoStack = start.redoStack;
      // Anything the rollback by history didn't take back (a full history) is put back by hand.
      if (!isMatrixEqual(start.pixels, this.getPixels())) this.setPixels(start.pixels, false);
      this.selection = start.selection;
      // A Move drag abandoned like this puts the rows' colors back too.
      if (this.rowMove) {
        this.$emit('move-rows', {rows: this.rowMove.rows, dy: 0});
        this.rowMove = null;
      }
    },

    // The hovered cell plus, when mirror drawing is on and a draw tool is
    // selected, the cells mirroring it (the same ones mirrorPixels adds).
    hoverCellsWithMirrors() {
      const cell = this.hoverCell;
      if (!cell || !this.editor) return [];
      const mirror = useMirrorDraw();
      const drawTools = ['pencil', 'eraser', 'fill', 'line', 'rectangle', 'oval'];
      if ((!mirror.horizontal && !mirror.vertical) || !drawTools.includes(this.toggledTool)) return [cell];
      const {width, height} = this.editor;
      const cells = new Map([[`${cell.x},${cell.y}`, cell]]);
      const add = (x, y) => {
        if (!cells.has(`${x},${y}`)) cells.set(`${x},${y}`, {x, y});
      };
      if (mirror.horizontal) add(width - 1 - cell.x, cell.y);
      if (mirror.vertical) add(cell.x, height - 1 - cell.y);
      if (mirror.horizontal && mirror.vertical) add(width - 1 - cell.x, height - 1 - cell.y);
      return [...cells.values()];
    },

    // Tracks the cell under the pointer for the hover highlight (see
    // drawGridOverlay's comment) - separate from handleMouse (which
    // drives the actual tool and is debounced), so the highlight tracks
    // the cursor in real time rather than lagging behind by handleMouse's
    // 10ms debounce. Same offsetX/offsetY-against-the-canvas's-
    // intrinsic-vs-rendered-size math @curtishughes/pixel-editor's
    // mousePosition() uses internally (see node_modules/@curtishughes/
    // pixel-editor/dist/PixelEditor.js) - kept in sync by hand here since
    // that library has no public API to just ask "what cell is
    // this event over."
    handleHover(event) {
      if (!this.editor) return;
      const canvas = this.$refs.editor;
      if (!canvas.clientWidth || !canvas.clientHeight) return;
      const x = Math.floor((event.offsetX * canvas.width) / canvas.clientWidth);
      const y = Math.floor((event.offsetY * canvas.height) / canvas.clientHeight);
      if (x < 0 || y < 0 || x >= this.editor.width || y >= this.editor.height) {
        this.hoverCell = null;
        return;
      }
      if (this.hoverCell && this.hoverCell.x === x && this.hoverCell.y === y) return;
      this.hoverCell = {x, y};
    },

    // The Eyedropper: the color the clicked cell is drawn in on the canvas (the background colors behind the cells that
    // are off included) becomes the color of the toolbar's swatch.
    pickColorAt(cell) {
      if (!this.editor) return;
      const backdrop = this.columnBackdrop || this.rowBackdrop ? this.$refs.backdropOverlay : null;
      const canvas = backdrop || this.$refs.editor;
      if (!canvas || !canvas.width || !canvas.height) return;
      const sample = canvas.getContext('2d').getImageData(
          Math.min(canvas.width - 1, Math.floor((cell.x + 0.5) * canvas.width / this.editor.width)),
          Math.min(canvas.height - 1, Math.floor((cell.y + 0.5) * canvas.height / this.editor.height)), 1, 1).data;
      // A pure black row is drawn near black (see the editors' editorRowColors), so the nearest color is taken.
      if (sample[3] === 0) return;
      let best = null;
      for (let byte = 0; byte < 256; byte += 2) {
        const hex = colorByteToCss(byte);
        const distance = [1, 3, 5].reduce((sum, i, channel) =>
          sum + (parseInt(hex.slice(i, i + 2), 16) - sample[channel]) ** 2, 0);
        if (!best || distance < best.distance) best = {byte, distance};
      }
      if (best) useDrawColor().value = best.byte;
    },

    // Reports that this frame was just interacted with, so a caller driving
    // a single toolbar shared across many PixelEditor instances (see
    // GraphicEditorToolbar.vue) knows which one to act on next. Passes
    // itself (not just an id) so the caller can call straight into
    // setTool/undo/redo/applyHeight/handle*Image/handleClear below without
    // needing its parallel map of ids to component instances.
    handleActivate() {
      this.$emit('activate', this);
    },

    // 'pencil'/'eraser'/'fill' -> the real tool object driving the
    // underlying PixelEditor library (see its Tool interface) -
    // shared by setTool, the toggledTool watcher above, and initEditor's
    // initialTool below so all three stay in sync with a single mapping.
    toolFor(toolName) {
      if (toolName === 'eraser') return this.eraser;
      if (toolName === 'fill') return this.fill;
      if (toolName === 'eyedropper') return this.eyedropper;
      if (toolName === 'none') return this.noTool;
      if (toolName === 'line') return this.line;
      if (toolName === 'rectangle') return this.rectangle;
      if (toolName === 'oval') return this.oval;
      if (toolName === 'move') return this.move;
      if (toolName === 'rect-select') return this.rectSelect;
      if (toolName === 'circle-select') return this.circleSelect;
      if (toolName === 'polygon-select') return this.polygonSelect;
      return this.pencil;
    },

    setTool(toolName) {
      this.toggledTool = toolName;
      this.editor.tool = this.toolFor(toolName);
    },

    // Clears whatever's currently selected, and discards an in-progress,
    // not-yet-closed polygon along with it (PolygonSelect's points
    // list is otherwise independent of "selection" - it hasn't produced a
    // real selection yet) - called by GraphicEditorToolbar.vue's Escape
    // hotkey handler.
    deselect() {
      this.selection = null;
      this.polygonSelect.cancel();
    },

    // Moving the selected pixels with the Move tool moves the colors of the rows they were on
    // too (the 'move-rows' event - see utils/row-color-move.js for the graphics that have them).
    // A finished move is remembered here so undo and redo can move the colors back and forth
    // together with the pixels: `depth` is how many entries the pixel history had once it was done.
    handleMoveRows(move) {
      if (move.end) {
        if (this.leavingCanvas) return;
        const done = this.rowMove;
        this.rowMove = null;
        if (done && done.dy !== 0 && this.editor) {
          this.rowMoveUndo.push({depth: this.editor.history.undoStack.length, rows: done.rows, dy: done.dy});
        }
        return;
      }
      this.rowMove = {rows: move.rows, dy: move.dy};
      this.$emit('move-rows', move);
    },

    undo() {
      const last = this.rowMoveUndo[this.rowMoveUndo.length - 1];
      const depth = this.editor.history.undoStack.length;
      this.editor.undo();
      // The picture is what the project keeps: undoing a stroke without telling the tab that holds it would leave the old one saved
      // (and built into the ROM) until the next stroke.
      this.$emit('input', this.getPixels());
      if (last && last.depth === depth) {
        this.rowMoveUndo.pop();
        this.rowMoveRedo.push(last);
        // The inverse of the move: the rows where its pixels ended up, moving back.
        this.$emit('move-rows', {rows: last.rows.map((row) => row + last.dy), dy: -last.dy, start: true});
      }
    },

    redo() {
      const next = this.rowMoveRedo[this.rowMoveRedo.length - 1];
      const depth = this.editor.history.undoStack.length;
      this.editor.redo();
      this.$emit('input', this.getPixels());
      if (next && next.depth === depth + 1) {
        this.rowMoveRedo.pop();
        this.rowMoveUndo.push(next);
        this.$emit('move-rows', {rows: next.rows, dy: next.dy, start: true});
      }
    },

    handleMouse: debounce(function() {
      // eslint-disable-next-line no-invalid-this
      const pixels = this.getPixels();
      // eslint-disable-next-line no-invalid-this
      if (!isMatrixEqual(this.value, pixels)) {
        // eslint-disable-next-line no-invalid-this
        this.$emit('input', pixels);
      }
      // Pixels are drawn in the pencil's fixed color; recolor them so newly
      // drawn cells adopt their row color instead of staying the draw color.
      // logToHistory: false - this recolor pass doesn't represent a new
      // edit (see setPixels' comment); left true here, it silently
      // pushed an extra history entry on every single stroke, which
      // undo()-then-redraw preview tools (Rectangle/Line/Oval) rely on
      // undo() popping exactly the ONE entry their last move pushed -
      // the extra entry meant their undo() popped this no-op recolor
      // instead, leaving the previous preview position's pixels never
      // actually erased - confirmed as the real cause of a reported
      // "drawing a rectangle leaves a trail behind" bug on any canvas
      // with row colors (e.g. Background).
      // Done even when no pixel turned on or off: drawing over a pixel that
      // is already on (a stroke crossing a mirrored one) redraws it in the
      // draw color, which has to be put back to its row color too.
      // eslint-disable-next-line no-invalid-this
      if (this.rowColors) {
        // eslint-disable-next-line no-invalid-this
        this.setPixels(pixels, false);
      }
    }, 10),

    // The color used for an "on" pixel on the given row.
    onColorForRow(y) {
      return (this.rowColors && this.rowColors[y]) || this.fgColor;
    },

    handleExportImage() {
      // Adapted from https://stackoverflow.com/a/28305948/679240

      const canvas = document.createElement('canvas');
      canvas.width = this.editor.width;
      canvas.height = this.editor.height;

      const ctx = canvas.getContext('2d');

      this.editor.pixels.forEach((px) => {
        ctx.fillStyle = px.color;
        ctx.fillRect(px.x, px.y, 1, 1);
      });

      canvas.toBlob((blob) => {
        // The file is named after the card (its name with anything a file name cannot hold made into an underscore).
        const base = String(this.name || '').replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'image';
        saveAs(blob, `${base}-${getDateInfix()}.png`);
      });
    },

    handleImportImage() {
      openFileDialog('image/*')
          .then(loadImageFromFile)
          .then((img) => {
            // Where height can be changed (sprite frames, not backgrounds or
            // the score font, which have a fixed row count - see
            // allowChangingHeight), match the imported image's  height
            // instead of squeezing it into whatever height this frame
            // already happened to be, same range as the "Set height" slider.
            const targetHeight = this.allowChangingHeight ?
              Math.min(64, Math.max(1, Math.round(img.height))) : this.editor.height;
            const canvas = createResizedCanvas(img, this.editor.width, targetHeight);

            // Adapted from https://stackoverflow.com/a/667074/679240
            // Get the CanvasPixelArray from the given coordinates and dimensions.
            const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
            const imgPixels = imageData.data;

            // Loop over each pixel
            const pixelValues = [];
            for (let i = 0, n = imgPixels.length; i < n; i += 4) {
              const r = imgPixels[i]; // red
              const g = imgPixels[i + 1]; // green
              const b = imgPixels[i + 2]; // blue
              // i+3 is alpha (the fourth element)

              pixelValues.push((r + g + b) / 3);
            }

            const pixels = chunk(pixelValues.map((v) => v > 32 ? 1 : 0), canvas.width);
            if (targetHeight !== this.editor.height) {
              // An image of another height builds the editor again, which the pixel history does not cover: undo and redo bring
              // back the picture as it was, at the height it had.
              const previousPixels = this.getPixels();
              const previousHeight = this.editor.height;
              this.initEditor(targetHeight, pixels);
              const restore = (height, matrix) => {
                this.initEditor(height, matrix);
                this.$emit('input', matrix);
              };
              recordReorder({
                undo: () => restore(previousHeight, previousPixels),
                redo: () => restore(targetHeight, pixels),
                isCurrent: () => !!this.editor && this.editor.height === targetHeight,
              });
            } else {
              this.setPixels(pixels);
            }
            this.$emit('input', pixels);
          });
    },

    // The underlying PixelEditor library is sized once at construction and
    // doesn't support changing its row count afterwards, so changing height
    // means building a fresh instance in place - rather than the full page
    // reload this used to do, which (via main.js's "start empty" reset on
    // every launch) was wiping the entire project, not just this frame.
    //
    // Carries the OLD editor's  History instance into the new one
    // (PixelEditor's  constructor takes it as an optional 4th arg,
    // defaulting to a fresh one when omitted) - confirmed as a real reported
    // bug otherwise: every resize used to build a brand new PixelEditor with
    // a brand new, empty History, silently discarding every undo entry from
    // before the resize, on top of the resize itself never being undoable
    // either. History's  undoStack/redoStack are plain {next, prev}
    // pixel-coordinate deltas with no canvas-size bounds checking
    // (PixelCollection.set() is a sparse {x+y*width: color} map, and
    // getPixels() here already skips any y past the current row count), so
    // replaying an old delta against a differently-sized editor is safe -
    // it just won't restore rows beyond whatever height is CURRENT at undo
    // time, same as any other pixel data that's currently out of view.
    initEditor(rowCount, pixelMatrix) {
      const canvas = this.$refs.editor;
      const history = this.editor ? this.editor.history : undefined;
      // Starts already matching the shared toggledTool (see
      // hooks/pixel-tool.js) instead of hardcoding Pencil - without this, a
      // freshly built/resized editor's underlying tool object silently
      // stayed Pencil even while Eraser showed selected on the shared
      // toolbar, until setTool() was called again to actually apply it.
      const initialTool = this.toolFor(this.toggledTool);
      this.editor = new PixelEditor(canvas, this.width, rowCount, initialTool, history);
      limitPixelHistory(this.editor.history);
      // Every tool draws through editor.set(), so mirror drawing hooks in here
      // (see mirrorPixels).
      const set = this.editor.set.bind(this.editor);
      // Cells outside the grid are dropped first. The editor stores cells by
      // y * width + x, so a cell past an edge (a Shift-snapped line or square
      // reaching beyond the canvas, a moved selection) lands on a cell at the
      // opposite edge or the next row instead, and Undo (which every preview
      // tool uses to erase its last preview) then leaves it behind as a stray
      // pixel.
      this.editor.set = (pixels, logToHistory = true) => {
        const {width, height} = this.editor;
        const inside = pixels.filter((pixel) =>
          pixel.x >= 0 && pixel.y >= 0 && pixel.x < width && pixel.y < height);
        const result = set(this.mirrorPixels(inside, logToHistory), logToHistory);
        if (this.columnBackdrop || this.rowBackdrop || this.rowColorsFine) this.scheduleBackdrop();
        return result;
      };
      // Not logged to the history: this is loading the image, not an edit, and as
      // an entry it made Undo (once the strokes were undone, or on its own)
      // wipe the whole graphic back to empty.
      this.setPixels(pixelMatrix, false);
      this.handleMouse();
      // Row count (this.editor.height) is what the grid overlay actually
      // draws against, not the "height" PROP (only ever a construction-time
      // default - see this method's  callers) - a height change from
      // here (Set Height, cross-frame resize, importing a differently-sized
      // image) wouldn't otherwise be caught by that prop's  watcher.
      if (this.showGrid) this.$nextTick(() => this.drawGridOverlay());
    },

    // The actual resize - called externally by whichever tab-level "Set
    // height" menu is currently driving this instance (see
    // GraphicEditorToolbar.vue), since this component no longer has a
    // height-menu popup to call it internally.
    applyHeight(newHeight, scaleContents) {
      const pixels = this.getPixels();
      if (newHeight != this.value.length) {
        const resized = resizePixelMatrixHeight(pixels, newHeight, this.editor.width, scaleContents);

        this.$emit('input', resized);
        this.initEditor(newHeight, resized);
      }
    },

    // Mirror drawing (see hooks/pixel-tool.js): adds the flipped copy of each
    // pixel a tool draws, in the same history entry so one Undo takes both
    // away. Only strokes are mirrored: not an undo/redo or recolor
    // (logToHistory false), not the Move tool (it would move the mirror image
    // too), and not a write of the whole grid (an import, flip or resize).
    mirrorPixels(pixels, logToHistory) {
      const mirror = useMirrorDraw();
      if (!logToHistory || (!mirror.horizontal && !mirror.vertical) || this.toggledTool === 'move') return pixels;
      const {width, height} = this.editor;
      if (pixels.length >= width * height) return pixels;
      // One entry per cell: a cell on the mirror line is its mirror image,
      // and a duplicate would record the wrong "previous" color for Undo.
      const cells = new Map();
      const add = (pixel) => {
        const key = pixel.y * width + pixel.x;
        if (!cells.has(key)) cells.set(key, pixel);
      };
      pixels.forEach(add);
      pixels.forEach((pixel) => {
        if (pixel.x < 0 || pixel.y < 0 || pixel.x >= width || pixel.y >= height) return;
        if (mirror.horizontal) add({...pixel, x: width - 1 - pixel.x});
        if (mirror.vertical) add({...pixel, y: height - 1 - pixel.y});
        if (mirror.horizontal && mirror.vertical) add({...pixel, x: width - 1 - pixel.x, y: height - 1 - pixel.y});
      });
      return [...cells.values()];
    },

    createEmptyPixelMatrix() {
      return new Array(this.height).fill(0).map(() => new Array(this.width).fill(0));
    },

    getPixels() {
      const pixelMatrix = this.createEmptyPixelMatrix();
      this.editor.pixels.forEach((px) => {
        // A tool can leave a pixel outside the grid (a selection moved past the
        // top or left edge, a shape dragged off it); those aren't part of the image.
        if (px.y < 0 || px.y >= pixelMatrix.length || px.x < 0 || px.x >= pixelMatrix[px.y].length) return;
        // An "on" pixel is any that isn't the background color. Comparing
        // against fgColor would misread per-row colored pixels as empty.
        pixelMatrix[px.y][px.x] = px.color !== this.bgColor ? 1 : 0;
      });
      return pixelMatrix;
    },
    // logToHistory: false for handleMouse's post-stroke recolor pass
    // below - that call re-expresses the SAME pixel matrix a tool's
    // set() just drew, only swapping which CSS color string represents
    // "on" per row, so it isn't really a separate user edit and shouldn't
    // consume its undo step. Left true (an extra history entry) for
    // every other caller, which is the existing, unchanged behavior.
    setPixels(pixelMatrix, logToHistory = true) {
      pixelMatrix = pixelMatrix || this.createEmptyPixelMatrix();
      const editorPixels = [];
      pixelMatrix.forEach((line, y) => line.forEach((bit, x) => {
        editorPixels.push({x, y, color: bit ? this.onColorForRow(y) : this.bgColor});
      }));
      this.editor.set(editorPixels, logToHistory);
    },

    // Turns every currently-selected cell off - a plain pixel-matrix edit
    // like any drawing stroke (real history entry, real 'input' emit). The
    // selection itself is left in place, matching the usual "Delete clears
    // the selected content, not the selection" behavior. A no-op with
    // nothing selected.
    deleteSelection() {
      if (!this.selection || !this.selection.size) return;
      const pixels = this.getPixels();
      this.selection.forEach((key) => {
        const [x, y] = key.split(',').map(Number);
        if (pixels[y] && x >= 0 && x < pixels[y].length) pixels[y][x] = 0;
      });
      this.setPixels(pixels);
      this.$emit('input', pixels);
    },

    // Mirrors the picture (or just the selected pixels, when a marquee is active) left-to-right: a plain
    // pixel-matrix edit like any drawing stroke (real history entry, real 'input' emit), not a separate
    // "transform" concept.
    flipHorizontal() {
      if (this.flipSelection(true)) return;
      const pixels = this.getPixels().map((row) => [...row].reverse());
      this.setPixels(pixels);
      this.$emit('input', pixels);
    },

    // Reverses the row order top-to-bottom. A caller with per-row colors (rowColors) is told with 'flip-rows' so it can turn them
    // the same way.
    flipVertical() {
      if (this.flipSelection(false)) return;
      const pixels = [...this.getPixels()].reverse();
      this.setPixels(pixels);
      this.$emit('input', pixels);
      // The whole picture turned upside down: a graphic with a color for each row turns its colors with it (the tab that holds them
      // does it, see "flip-rows").
      this.$emit('flip-rows');
    },

    // With a selection, flips only the selected pixels, within the box that surrounds the selection, and
    // the selection flips with them. Pixels that are not selected stay as they are, except where a flipped
    // pixel lands on them.
    // @return {boolean} Whether there was a selection to flip.
    flipSelection(horizontal) {
      if (!this.selection || !this.selection.size) return false;
      const pixels = this.getPixels();
      const cells = [...this.selection].map((key) => key.split(',').map(Number))
          .filter(([x, y]) => pixels[y] && x >= 0 && x < pixels[y].length);
      if (!cells.length) return false;
      const minX = Math.min(...cells.map(([x]) => x));
      const maxX = Math.max(...cells.map(([x]) => x));
      const minY = Math.min(...cells.map(([, y]) => y));
      const maxY = Math.max(...cells.map(([, y]) => y));
      const target = ([x, y]) => (horizontal ? [minX + maxX - x, y] : [x, minY + maxY - y]);
      const values = cells.map(([x, y]) => pixels[y][x]);
      cells.forEach(([x, y]) => {
        pixels[y][x] = 0;
      });
      const flipped = new Set();
      cells.forEach((cell, index) => {
        const [x, y] = target(cell);
        flipped.add(`${x},${y}`);
        if (pixels[y] && x >= 0 && x < pixels[y].length) pixels[y][x] = values[index];
      });
      this.setPixels(pixels);
      this.selection = flipped;
      this.$emit('input', pixels);
      return true;
    },

    handleClear() {
      this.setPixels(null);
      this.$emit('input', this.getPixels());
      // Separate from 'input' (an ordinary pixel edit) - lets a caller reset
      // this graphic's  color fields (row colors, a single fixed color,
      // whatever it has) alongside the pixels specifically on a real Clear
      // click, without every plain drawing stroke also wiping colors.
      this.$emit('clear');
    },
  },
};
</script>
<style scoped>
/* The root v-card has a @click handler (for canvas mouse events - see
   handleMouse), which Vuetify treats as "interactive" and paints its
   grey hover/focus overlay over on mouseover/click, the same way it does
   for the toolbar's buttons (see .pixel-editor-tools >>> .v-btn::before
   below) - except here it covers the WHOLE card (graphic and toolbar
   alike), reading as a stray, unexplained grey tint rather than a real
   button state, since this card isn't actually a single clickable control.
   ripple="false" (already set in the template) only suppresses the ripple
   animation, not this separate overlay. */
.v-card::before {
  display: none;
}

.editor-canvas {
  image-rendering: optimizeSpeed;             /* Older versions of FF          */
  image-rendering: -moz-crisp-edges;          /* FF 6.0+                       */
  image-rendering: -webkit-optimize-contrast; /* Safari                        */
  image-rendering: -o-crisp-edges;            /* OS X & Windows Opera (12.02+) */
  image-rendering: pixelated;                 /* Awesome future-browsers       */
  -ms-interpolation-mode: nearest-neighbor;   /* IE                            */

  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  height: 100%;

  border: 1px solid;
}

/* Swaps the plain arrow cursor for a small pencil/eraser glyph while
   hovering the canvas, matching whichever tool is actually active
   (toggledTool - see setTool) - a plain crosshair (Vuetify's default
   hover cursor here otherwise) gave no visual confirmation of WHICH tool a
   click would use, easy to lose track of once the toolbar itself moved out
   of this component (see hideToolbar) onto a shared row elsewhere on the
   page. White fill + black outline (not the app's plain grey/black MDI
   icon color) so the glyph stays visible over both the mostly-black canvas
   backgrounds these editors usually have and any bright artwork drawn on
   them. The hotspot (the two numbers after the url()) is the pencil's
   drawing tip / the eraser's bottom-left corner, so the cursor visually
   points at the exact cell a click would affect, not just floats nearby -
   "crosshair" is the fallback for browsers that don't support custom cursor
   images at all. */
.editor-canvas-tool-pencil {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='white' stroke='black' stroke-width='1' d='M20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18,2.9 17.35,2.9 16.96,3.29L15.12,5.12L18.87,8.87M3,17.25V21H6.75L17.81,9.93L14.06,6.18L3,17.25Z'/></svg>") 3 21, crosshair;
}

.editor-canvas-tool-eraser {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='white' stroke='black' stroke-width='1' d='M16.24,3.56L21.19,8.5C21.97,9.29 21.97,10.55 21.19,11.34L12,20.53C10.44,22.09 7.91,22.09 6.34,20.53L2.81,17C2.03,16.21 2.03,14.95 2.81,14.16L13.75,3.56C14.54,2.78 15.8,2.78 16.24,3.56M4.22,15.58L7.76,19.11C8.54,19.9 9.8,19.9 10.59,19.11L14.54,15.16L9.42,10.04L4.22,15.58Z'/></svg>") 4 16, crosshair;
}

/* Hotspot at the bucket's spout (matching the pencil/eraser cursors'
   "point at the exact cell a click would affect" reasoning above). */
.editor-canvas-tool-eyedropper {
  cursor: crosshair;
}

.editor-canvas-tool-fill {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='white' stroke='black' stroke-width='1' d='M19,11.5C19,11.5 17,13.67 17,15A2,2 0 0,0 19,17A2,2 0 0,0 21,15C21,13.67 19,11.5 19,11.5M5.21,10L10,5.21L14.79,10M16.56,8.94L7.62,0L6.21,1.41L8.59,3.79L3.44,8.94C2.85,9.5 2.85,10.47 3.44,11.06L8.94,16.56C9.23,16.85 9.62,17 10,17C10.38,17 10.77,16.85 11.06,16.56L16.56,11.06C17.15,10.47 17.15,9.5 16.56,8.94Z'/></svg>") 4 20, crosshair;
}

/* Hotspot at the line's drawing end (the endpoint that tracks the pointer
   while dragging), same reasoning as the other tool cursors above. */
.editor-canvas-tool-line {
  cursor: url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'><path fill='white' stroke='black' stroke-width='1' d='M19.5,3.09L20.91,4.5L4.5,20.91L3.09,19.5L19.5,3.09Z'/></svg>") 20 4, crosshair;
}

/* Rectangle/Oval both drag out a bounding box from a corner rather than
   tracking a single drawing tip the way Pencil/Line do, so a plain
   crosshair (no custom glyph/hotspot) already communicates the gesture
   correctly by itself. */
.editor-canvas-tool-shape {
  cursor: crosshair;
}

/* Move drags whatever's currently selected, wherever the pointer lands -
   the standard "move" cursor communicates that at a glance, no custom
   glyph needed. */
.editor-canvas-tool-move {
  cursor: move;
}

/* Layered directly on top of .editor-canvas (same inset/height) - drawn at
   its CSS-rendered resolution rather than the tiny one-unit-per-cell
   intrinsic size .editor-canvas uses (see drawGridOverlay's comment),
   so no border (would double up with .editor-canvas's) and no
   pointer-events (drawing/erasing has to keep reaching the real canvas
   underneath, not get intercepted by this purely visual layer). */
.backdrop-canvas {
  /* Same box as the drawing canvas (including its border), so cells line up exactly. */
  image-rendering: auto;
  pointer-events: none;
  border-color: transparent;
  width: 100%;
  height: 100%;
}

.grid-overlay-canvas {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
  height: 100%;
  width: 100%;
  pointer-events: none;
}

/* Vuetify's default v-card-text padding leaves a wide gap between the canvas
   and the toolbar below it; tighten it to a consistent 8px. */
.v-card >>> .v-card__text {
  padding-bottom: 8px;
}

/* v-card-actions' default left/right padding (8px) doesn't match
   v-card-text's above (16px) - left as-is, the two rows' left edges land at
   different x positions, throwing off the toolbar row/clear-colors button's
   centering under the canvas/sidebar above them (confirmed as a real
   reported bug, visible once a caller has a color sidebar). Matched to
   v-card-text's left/right here (bottom bumped to the same 8px for a
   consistent gutter all around) so every tab using this component gets the
   same alignment without each caller redeclaring it - a caller nesting this
   inside its already-padded card (e.g. BackgroundEditor.vue's
   .background-card) can zero this left/right padding back out locally to
   avoid doubling up. */
.pixel-editor-tools {
  padding: 0 16px 8px 16px;
}

/* Lays the optional color sidebar beside the canvas. align-items: stretch makes
   the sidebar exactly as tall as the canvas, so its rows line up 1:1. */
.editor-with-sidebar {
  display: flex;
  align-items: stretch;
}

.editor-sidebar {
  flex: 0 0 auto;
  display: flex;
}

.proportion-wrapper {
  position: relative;
  flex: 1 1 auto;
  min-width: 0;
}
.proportion-wrapper-stretcher {
  width: 100%;
}

/* Flat icon buttons: no grey box, no elevation, and a hit area only a little
   larger than the icon itself. */
.pixel-editor-tools >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
}

/* Vuetify paints its  grey hover/focus overlay here, which is the box we
   are removing; the states below replace it. */
.pixel-editor-tools >>> .v-btn::before {
  display: none;
}

/* Vuetify makes button icons inherit the button colour at a higher
   specificity, so these need to be forced. */
.pixel-editor-tools >>> .v-btn .v-icon {
  font-size: 19px;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.pixel-editor-tools >>> .v-btn:hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.pixel-editor-tools >>> .v-btn:active .v-icon {
  transform: scale(0.82);
}

/* Sits under the color sidebar, not the canvas. Width matched to
   PlayfieldColorStrip.vue's 22px strip (not the generic 26px icon-
   button width above) so the icon centers under the swatches themselves;
   margin-right reproduces the strip's 4px gap to the canvas, so the
   toolbar row beside it still starts exactly where the canvas does. */
.pixel-editor-clear-colors-btn {
  flex: 0 0 22px;
  width: 22px !important;
  margin-right: 4px !important;
}

/* The same under the strip on the right of the canvas (the background row colors): the gap is on its left. */
.pixel-editor-clear-colors-btn-right {
  margin-right: 0 !important;
  margin-left: 4px !important;
}

/* The Clear button - centered as one group with the "toolbar-end" slot's
   Copy/Paste (when a caller supplies them) under the graphic. */
.pixel-editor-hidden-toolbar-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 1 1 auto;
  min-width: 0;
}
</style>
