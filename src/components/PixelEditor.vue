<template>
  <v-card outlined @click="handleMouse" :ripple="false">
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
            @mousedown="handleMouse"
            @mouseenter="handleMouse"
            @mouseleave="handleMouseLeave"
            @mouseup="handleMouse"
            @mousemove="handleMouse"
          />
          <canvas
            v-if="showGrid"
            ref="gridOverlay"
            class="grid-overlay-canvas"
          />
        </div>
      </div>
    </v-card-text>
    <v-card-actions class="pixel-editor-tools">
      <div class="pixel-editor-toolbar-row">
          <v-btn-toggle v-model="toggledTool" borderless>
            <v-btn
              icon
              small
              title="Eraser"
              value="eraser"
              @click="editor.tool = eraser"
            >
              <v-icon>mdi-eraser</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Pencil"
              value="pencil"
              @click="editor.tool = pencil"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn
              v-if="showClearButton"
              icon
              small
              title="Clear"
              value="clear"
              @click="handleClear"
            >
              <v-icon>mdi-delete-sweep</v-icon>
            </v-btn>
          </v-btn-toggle>
          <v-divider class="pixel-editor-toolbar-divider" vertical />
          <v-btn
            icon
            small
            title="Undo"
            @click="() => editor.undo()"
          >
            <v-icon>mdi-undo</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Redo"
            @click="() => editor.redo()"
          >
            <v-icon>mdi-redo</v-icon>
          </v-btn>

          <v-divider class="pixel-editor-toolbar-divider" vertical />

          <v-btn
            icon
            small
            title="Export to image"
            @click="() => handleExportImage()"
          >
            <v-icon>mdi-export</v-icon>
          </v-btn>
          <v-btn
            icon
            small
            title="Import from image"
            @click="() => handleImportImage()"
          >
            <v-icon>mdi-import</v-icon>
          </v-btn>

          <template v-if="allowChangingHeight">
            <v-divider class="pixel-editor-toolbar-divider" vertical />

            <div class="text-center">
              <v-menu
                v-model="heightMenuVisible"
                :close-on-content-click="false"
                offset-x
              >
                <template v-slot:activator="{ on, attrs }">
                  <v-btn
                    text
                    small
                    class="pixel-editor-height-btn"
                    title="Set height"
                    v-bind="attrs"
                    v-on="on"
                    @click="heightMenuValue = value.length; heightMenuScaleContents = false; heightMenuApplyToAllFrames = false"
                  >
                    <v-icon>mdi-human-male-height-variant</v-icon>
                  </v-btn>
                </template>

                <v-card>
                  <v-list>
                    <v-list-item>
                      <v-list-item-content>
                        <v-list-item-title>Set height for this frame</v-list-item-title>
                      </v-list-item-content>
                    </v-list-item>
                  </v-list>

                  <v-divider></v-divider>

                  <v-list>
                    <v-list-item>
                      <v-list-item-action>

                        <v-slider
                          v-model="heightMenuValue"
                          :min="1"
                          :max="64"
                          label="Height"
                          class="align-center"
                          style="width: 400px"
                        >
                          <template v-slot:append>
                            <v-text-field
                              v-model="heightMenuValue"
                              class="mt-0 pt-0"
                              type="number"
                              style="width: 60px"
                            ></v-text-field>
                          </template>
                        </v-slider>

                      </v-list-item-action>
                    </v-list-item>
                  </v-list>

                  <!-- A plain div, not another v-list-item like the slider
                       above it - v-list-item's own padding (meant for a
                       list of separate, evenly-spaced rows) left a wide gap
                       above this AND visually separated the checkbox from
                       its own label, when the two are really one small,
                       single control that belongs right under the slider
                       it modifies. -->
                  <div class="pixel-editor-scale-checkbox">
                    <v-checkbox
                      v-model="heightMenuScaleContents"
                      label="Scale existing contents (nearest neighbor)"
                      hide-details
                      dense
                    />
                    <v-checkbox
                      v-if="allowApplyToAllFrames"
                      v-model="heightMenuApplyToAllFrames"
                      label="Apply to every frame in this animation"
                      hide-details
                      dense
                    />
                  </div>

                  <v-card-actions>
                    <v-spacer></v-spacer>

                    <v-btn
                      text
                      @click="heightMenuVisible = false"
                    >
                      Cancel
                    </v-btn>
                    <v-btn
                      color="primary"
                      text
                      @click="handleSetHeight()"
                    >
                      Set height
                    </v-btn>
                  </v-card-actions>
                </v-card>
              </v-menu>
            </div>
          </template>
          <v-spacer />
          <slot name="toolbar-end" />
      </div>
    </v-card-actions>
  </v-card>
</template>
<script>
import {PixelEditor, Pencil} from '@curtishughes/pixel-editor';
import {chunk, debounce} from 'lodash';
import {saveAs} from 'file-saver';

import {isMatrixEqual} from '../utils/array';
import {getDateInfix} from '../utils/date';
import {loadImageFromFile, openFileDialog} from '../utils/file';
import {createResizedCanvas} from '../utils/image';
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
    // provided, each row's set pixels are drawn in its own color instead of
    // fgColor, so the playfield preview reflects the batari Basic pfcolors.
    rowColors: {type: Array, default: null},
    name: {type: String, default: 'image'},
    allowChangingHeight: {type: Boolean, default: true},
    // Shows a one-click "Clear" button next to the Eraser/Pencil tools -
    // opt-in (default off) since most PixelEditor uses (sprite frames, the
    // score font, ...) already have their own way to start a frame over
    // (switching frames, importing an image), and a stray "wipe everything"
    // button isn't worth the risk of a misclick there. Backgrounds are the
    // one place a whole-grid clear is actually useful on its own.
    showClearButton: {type: Boolean, default: false},
    // Shows a second "Set height" checkbox that applies the SAME resize
    // (and the "scale existing contents" choice above it) to every other
    // frame in this sprite's own animation, not just this one - opt-in
    // (default off, see allowApplyToAllFrames' own gating below) since
    // only a frame that's actually PART of an animation (a player sprite)
    // has other frames to apply anything to at all; a background or the
    // score font (allowChangingHeight itself is already false for both)
    // never shows this regardless.
    allowApplyToAllFrames: {type: Boolean, default: false},
    // Draws a thin grid line around every cell, on a separate overlay
    // canvas layered on top of the real drawing canvas (see mounted()'s own
    // ResizeObserver) - a pure visual aid, never part of the pixel data
    // itself.
    showGrid: {type: Boolean, default: false},
    // Labels each cell with its own column index (0-based, matching the X
    // argument every "Background: pixel at X/Y" block already uses) at the
    // cell's center - opt-in separately from showGrid since it's only
    // useful on the wide, many-columned Background canvas; a narrow sprite
    // frame has no room to render it legibly and no matching "X" concept
    // worth calling out cell by cell.
    showCellIds: {type: Boolean, default: false},
  },
  data() {
    return {
      pencil: new Pencil(this.fgColor),
      eraser: new Pencil(this.bgColor),

      heightMenuVisible: false,
      heightMenuValue: 0,
      // Off by default (reset every time the popup opens - see the
      // activator's own click handler) - the existing truncate/pad
      // behavior (see handleSetHeight) is what every frame resize has
      // always done, so a first-time or occasional resize doesn't silently
      // start distorting artwork the user only meant to crop or extend.
      heightMenuScaleContents: false,
      // Off by default, same reasoning and same activator reset as
      // heightMenuScaleContents above - a resize should only ever touch
      // every other frame in the animation when the user explicitly asks
      // for that, not as a lingering choice from the last time this popup
      // happened to be open (possibly on a totally different frame).
      heightMenuApplyToAllFrames: false,

      // String values (see the Eraser/Pencil/Clear v-btn "value" props),
      // not index-based - Clear sits last in the group (after Pencil) so it
      // can be repositioned without touching Eraser's/Pencil's own values,
      // but it isn't a real drawing tool, so it's excluded here and reset
      // back to whichever tool was actually active after every click (see
      // handleClear) rather than staying lit up as if selected.
      toggledTool: 'pencil',
    };
  },
  mounted() {
    this.initEditor(this.value.length, this.value);

    // TODO: Just for testing
    window.isMatrixEqual = isMatrixEqual;

    if (this.showGrid) this.setupGridOverlay();
  },
  beforeDestroy() {
    this.teardownGridOverlay();
  },
  watch: {
    // Recolor the existing pixels when the row colors change (e.g. the user
    // picks a new color in the strip) without disturbing the drawn shape.
    rowColors() {
      if (this.editor) {
        this.setPixels(this.getPixels());
      }
    },
    // The overlay canvas only exists in the DOM while showGrid is true (see
    // the template's own v-if) - the ResizeObserver has to be (re)attached
    // to whichever real element currently exists, not created once up
    // front.
    showGrid(value) {
      if (value) {
        this.$nextTick(() => this.setupGridOverlay());
      } else {
        this.teardownGridOverlay();
      }
    },
    // Extra coverage alongside initEditor's own redraw call (see its
    // comment) for the one case that changes row count WITHOUT going
    // through initEditor synchronously in the same tick: the Background
    // tab's own resolution setting (Superchip pfres), which passes a new
    // "height" prop value the moment it changes, slightly ahead of
    // reflowBackgroundsToHeight's own pixel-matrix update reaching this
    // component's "value" prop and triggering initEditor from there.
    height() {
      this.$nextTick(() => this.drawGridOverlay());
    },
    showCellIds() {
      this.drawGridOverlay();
    },
    // Picks up a row-count change this component DIDN'T itself just emit -
    // needed for "Apply to every frame in this animation" (see
    // handleSetHeight's own resize-all-frames event): every OTHER frame's
    // own PixelEditor instance never sees that resize happen locally (only
    // the ONE frame the popup was actually open on does, via
    // handleSetHeight's own initEditor call), it only sees its "value" prop
    // change out from under it once PlayerEditor.vue applies the resize to
    // its frame.pixels - and the underlying PixelEditor library has no
    // built-in way to change its own row count after construction (see
    // initEditor's own comment), so without this, every other frame would
    // keep silently rendering at its OLD height/content until manually
    // reopened. Guarded on an actual length mismatch (not just any "value"
    // change) so this doesn't also fire - and redundantly reinitialize,
    // discarding the in-progress draw - on every ordinary pixel edit,
    // which updates "value" just as often but never changes its length.
    value(newValue) {
      if (this.editor && newValue && newValue.length !== this.editor.height) {
        this.initEditor(newValue.length, newValue);
      }
    },
  },
  methods: {
    // The overlay canvas is sized to its own CSS-rendered pixel dimensions
    // (not the drawing canvas's own tiny intrinsic width/height, one unit
    // per cell - see PixelEditor's own constructor) so grid lines and cell
    // labels stay crisp and legible at any zoom level, rather than being
    // stretched/blurred the same "pixelated" way the actual artwork is.
    // That means it has to be redrawn whenever its own rendered SIZE
    // changes - zooming, resizing the window, or the sidebar/toolbar
    // reflowing - which a plain mounted()-once draw can't catch on its own.
    setupGridOverlay() {
      this.teardownGridOverlay();
      const canvas = this.$refs.gridOverlay;
      if (!canvas) return;
      this.gridResizeObserver = new ResizeObserver(() => this.drawGridOverlay());
      this.gridResizeObserver.observe(canvas);
      this.drawGridOverlay();
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

      if (!this.showCellIds) return;
      // "X,Y" - matches the two arguments every "Background: pixel at X/Y"
      // block already uses, so a cell's own coordinates can be read
      // straight off the grid while wiring one up. Skipped entirely once
      // cells are too small to hold a legible label, rather than drawing
      // illegible overlapping text - a wider budget than a single number
      // would need, since "X,Y" is always at least 3 characters.
      const fontSize = Math.min(cellHeight * 0.6, cellWidth * 0.35, 12);
      if (fontSize < 5) return;
      ctx.font = `${fontSize}px sans-serif`;
      ctx.fillStyle = 'rgba(140, 140, 140, 0.85)';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          ctx.fillText(`${col},${row}`, (col + 0.5) * cellWidth, (row + 0.5) * cellHeight);
        }
      }
    },

    // The underlying @curtishughes/pixel-editor library only listens for
    // "mouseup" on the canvas ITSELF (see its own constructor) - it has no
    // "mouseleave" handling at all. Dragging the pointer off the canvas
    // while a button is still held (a real, easy-to-do gesture, e.g.
    // drawing right up to an edge) and releasing OUTSIDE it means the
    // canvas's own "mouseup" never fires, so the library's own tool (see
    // its handlePointerDown/handlePointerUp) is left thinking the button
    // is still down - re-entering the canvas afterward, with the button
    // genuinely up, then immediately resumes drawing on the very next
    // "mousemove", with no mousedown of its own. Confirmed as a real,
    // reproducible bug across every card that uses this component (Player
    // Sprite, Background, Score digits - anywhere PixelEditor.vue is used).
    // Forcing a synthetic "mouseup" the instant the pointer leaves the
    // canvas - passing the real mouseleave event through, since
    // PixelEditor's own mouseup(e) reads e.clientX/clientY the exact same
    // way a real mouseup event would - releases the tool's own state
    // immediately, regardless of whether the button is later released
    // inside or outside the canvas. Not debounced (unlike handleMouse
    // below, which still runs right after to resync Vue's own reactive
    // pixel state) - the release itself needs to happen synchronously, or
    // a mousemove landing before the debounce fires would still draw.
    handleMouseLeave(event) {
      if (this.editor) this.editor.mouseup(event);
      this.handleMouse();
    },

    handleMouse: debounce(function() {
      // eslint-disable-next-line no-invalid-this
      const pixels = this.getPixels();
      // eslint-disable-next-line no-invalid-this
      if (!isMatrixEqual(this.value, pixels)) {
        // eslint-disable-next-line no-invalid-this
        this.$emit('input', pixels);
        // Pixels are drawn in the pencil's fixed color; recolor them so newly
        // drawn cells adopt their row color instead of staying the draw color.
        // eslint-disable-next-line no-invalid-this
        if (this.rowColors) {
          // eslint-disable-next-line no-invalid-this
          this.setPixels(pixels);
        }
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
        saveAs(blob, `${this.name}-${getDateInfix()}.png`);
      });
    },

    handleImportImage() {
      openFileDialog('image/*')
          .then(loadImageFromFile)
          .then((img) => {
            // Where height can be changed (sprite frames, not backgrounds or
            // the score font, which have a fixed row count - see
            // allowChangingHeight), match the imported image's own height
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
              this.initEditor(targetHeight, pixels);
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
    initEditor(rowCount, pixelMatrix) {
      const canvas = this.$refs.editor;
      this.editor = new PixelEditor(canvas, this.width, rowCount, this.pencil);
      this.setPixels(pixelMatrix);
      this.handleMouse();
      // Row count (this.editor.height) is what the grid overlay actually
      // draws against, not the "height" PROP (only ever a construction-time
      // default - see this method's own callers) - a height change from
      // here (Set Height, cross-frame resize, importing a differently-sized
      // image) wouldn't otherwise be caught by that prop's own watcher.
      if (this.showGrid) this.$nextTick(() => this.drawGridOverlay());
    },

    handleSetHeight() {
      this.heightMenuValue = this.heightMenuValue || 0;
      this.heightMenuValue = Math.max(1, Math.min(64, this.heightMenuValue));

      const pixels = this.getPixels();
      if (this.heightMenuValue != this.value.length) {
        const resized = resizePixelMatrixHeight(
            pixels, this.heightMenuValue, this.editor.width, this.heightMenuScaleContents);

        this.$emit('input', resized);
        this.initEditor(this.heightMenuValue, resized);
      }

      // Every OTHER frame in this sprite's own animation - this component
      // has no idea what those are (it only ever sees its own one frame's
      // pixels), so the actual resizing happens one level up, in
      // PlayerEditor.vue's own handler for this event; this only reports
      // what the user asked for (the same height/scale choice this frame
      // itself just used, above) and lets that handler decide who "every
      // other frame" actually is.
      if (this.allowApplyToAllFrames && this.heightMenuApplyToAllFrames) {
        this.$emit('resize-all-frames', {height: this.heightMenuValue, scaleContents: this.heightMenuScaleContents});
      }

      this.heightMenuVisible = false;
    },

    createEmptyPixelMatrix() {
      return new Array(this.height).fill(0).map(() => new Array(this.width).fill(0));
    },

    getPixels() {
      const pixelMatrix = this.createEmptyPixelMatrix();
      this.editor.pixels.forEach((px) => {
        if (px.y >= pixelMatrix.length) return;
        // An "on" pixel is any that isn't the background color. Comparing
        // against fgColor would misread per-row colored pixels as empty.
        pixelMatrix[px.y][px.x] = px.color !== this.bgColor ? 1 : 0;
      });
      return pixelMatrix;
    },
    setPixels(pixelMatrix) {
      pixelMatrix = pixelMatrix || this.createEmptyPixelMatrix();
      const editorPixels = [];
      pixelMatrix.forEach((line, y) => line.forEach((bit, x) => {
        editorPixels.push({x, y, color: bit ? this.onColorForRow(y) : this.bgColor});
      }));
      this.editor.set(editorPixels);
    },

    handleClear() {
      const previousTool = this.editor.tool === this.eraser ? 'eraser' : 'pencil';
      this.setPixels(null);
      this.$emit('input', this.getPixels());
      // v-btn-toggle lights up whichever child's value was just clicked -
      // without this, Clear itself would stay visually "selected" even
      // though it isn't a real drawing tool (editor.tool is untouched).
      this.$nextTick(() => {
        this.toggledTool = previousTool;
      });
    },
  },
};
</script>
<style scoped>
/* The root v-card has a @click handler (for canvas mouse events - see
   handleMouse), which Vuetify treats as "interactive" and paints its own
   grey hover/focus overlay over on mouseover/click, the same way it does
   for the toolbar's own buttons (see .pixel-editor-tools >>> .v-btn::before
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

/* Layered directly on top of .editor-canvas (same inset/height) - drawn at
   its own CSS-rendered resolution rather than the tiny one-unit-per-cell
   intrinsic size .editor-canvas uses (see drawGridOverlay's own comment),
   so no border of its own (would double up with .editor-canvas's) and no
   pointer-events (drawing/erasing has to keep reaching the real canvas
   underneath, not get intercepted by this purely visual layer). */
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

.pixel-editor-tools {
  padding-top: 0;
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
   larger than the icon itself. No horizontal margin (an earlier version had
   "0 1px") - at 200% zoom, the Score tab's own digit cards (narrower than
   Player/Background's, since they're sized off DIGIT_BASE_WIDTH rather than
   a full sprite frame) were just barely too narrow for the full button row
   (eraser/clear/pencil, undo/redo, export/import) to fit without wrapping -
   reclaiming the 2px/button this margin cost (see .pixel-editor-toolbar-
   divider's own matching trim below) was enough to close that gap. */
.pixel-editor-tools >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
}

/* Tighter than Vuetify's own "mx-1" (4px each side) - see .pixel-editor-
   tools >>> .v-btn's own comment on why every bit of width matters here. */
.pixel-editor-tools >>> .pixel-editor-toolbar-divider {
  margin: 0 2px;
}

/* Vuetify paints its own grey hover/focus overlay here, which is the box we
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

/* The selected drawing tool, which previously read as the pressed grey box. */
.pixel-editor-tools >>> .v-btn.v-btn--active .v-icon {
  color: #1976d2 !important;
}

/* This one also shows the height next to its icon, so it needs the extra room. */
.pixel-editor-tools >>> .v-btn.pixel-editor-height-btn {
  width: auto;
  min-width: 0;
  padding: 0 2px;
  font-size: 0.75rem;
  color: rgba(0, 0, 0, 0.55);
}

.pixel-editor-tools >>> .v-btn.pixel-editor-height-btn .v-icon {
  font-size: 16px;
  margin-top: -1px;
}

.pixel-editor-tools >>> .v-btn.pixel-editor-height-btn:hover {
  color: rgba(0, 0, 0, 0.87);
}

/* Pulled up close to the slider's own list-item above (a larger negative
   top margin - confirmed the first attempt at this still left a visible
   gap). left: 16px matches v-list-item's own default horizontal padding
   (the slider row above still has that padding, being a real v-list-item;
   this row is a plain div specifically to avoid v-list-item's much larger
   VERTICAL padding, but still needs the same LEFT inset to actually line
   up with it) - confirmed as a real bug leaving that out entirely: with
   zero padding of its own, this row sat flush against the card's edge,
   further left than the slider above it, not aligned with it. */
.pixel-editor-scale-checkbox {
  margin-top: -30px;
  padding-left: 16px;
}

/* A plain flex row instead of Vuetify's v-row/v-col: their grid negative
   margins are meant for full-width layouts and wrap prematurely in this
   narrow, fixed-width card even when the buttons would otherwise fit. */
.pixel-editor-toolbar-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  /* v-card-actions is itself a flex container, so without this the row (its
     one flex-item child) shrinks to fit its own icons instead of spanning
     the full card width - leaving the "toolbar-end" slot's v-spacer nothing
     to actually expand into. */
  width: 100%;
  padding: 0 8px;
}

.pixel-editor-tools >>> .v-btn-toggle {
  background-color: transparent !important;
}
</style>
