<template>
  <div>
    <div class="blocklyDiv" ref="blocklyDiv">
    </div>
    <xml ref="blocklyToolbox" style="display:none">
      <slot></slot>
    </xml>
  </div>
</template>

<script>
/**
 * @license
 *
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Blockly Vue Component.
 * @author samelh@google.com (Sam El-Husseini)
 */

import Blockly from 'blockly';
import {debounce} from 'lodash';

import {useBlocklyControlsHorizontalStorage} from '../hooks/project';

// Blockly's own default for a block style's colourTertiary (the outline/
// border stroke colour - see renderers/common/path_object.js's own
// "stroke: this.style.colourTertiary") - whenever a theme doesn't set one
// explicitly, which the Classic theme this app uses never does (only
// colourPrimary, a bare hue number, per category - see node_modules/
// blockly/core/theme/classic.js) - blends the block's own colour 30% of the
// way toward WHITE, producing a lighter border than the block's own fill.
// Confirmed as a real reported bug this way ("all the borders/outlines are
// now a lighter color than the block color") once Thrasos' own flat drawer
// made that border the ONLY outline a block has (Geras' light/dark bevel
// highlight used to sit visually on top of it, made the lighter border less
// noticeable). Same 0.3 blend factor, toward BLACK instead - a plain darker
// border, no bevel, on every block regardless of which category/custom
// colour it uses (this app defines plenty of block colours as raw CSS
// strings outside Classic's own named categories too - e.g. 'purple',
// SCORE_COLOR - which resolve through this exact same code path via
// Blockly's "auto_<colour>" style lookup, so patching here covers those the
// same way, with no per-block-file changes needed).
Blockly.blockRendering.ConstantProvider.prototype.generateTertiaryColour_ = function(colour) {
  return Blockly.utils.colour.blend('#000', colour, 0.3) || colour;
};

// Deliberately thinner than App.vue's global ::-webkit-scrollbar (16px) -
// the Blockly canvas is dense with blocks, so a scrollbar that size reads as
// too heavy specifically here, even though it matches the rest of the app.

// The handle's cross-axis size/offset (normally (thickness - 5) wide with a
// fixed 2.5px offset from each edge) doesn't land on the app's 12px thumb
// width no matter what scrollbarThickness is set to - and can't be fixed by
// overriding createDom_ (tried first): the Scrollbar CONSTRUCTOR itself
// re-sets svgHandle_'s width/x (and height/y for horizontal) right after
// calling createDom_, clobbering anything createDom_ set. Wrapping the whole
// constructor instead, so this runs after ALL of the original construction
// logic (not just createDom_). Static properties (scrollbarThickness,
// DEFAULT_SCROLLBAR_MARGIN) are copied across since other Blockly modules
// read them off Blockly.Scrollbar directly.
const OriginalScrollbar = Blockly.Scrollbar;
// eslint-disable-next-line require-jsdoc
function PatchedScrollbar(...args) {
  OriginalScrollbar.apply(this, args);
  const horizontal = args[1];
  const inset = 2;
  const handleSize = Blockly.Scrollbar.scrollbarThickness - inset * 2;
  const radius = handleSize / 2;
  if (horizontal) {
    this.svgHandle_.setAttribute('height', handleSize);
    this.svgHandle_.setAttribute('y', inset);
  } else {
    this.svgHandle_.setAttribute('width', handleSize);
    this.svgHandle_.setAttribute('x', inset);
  }
  this.svgHandle_.setAttribute('rx', radius);
  this.svgHandle_.setAttribute('ry', radius);
}
PatchedScrollbar.prototype = OriginalScrollbar.prototype;
Object.assign(PatchedScrollbar, OriginalScrollbar);
Blockly.Scrollbar = PatchedScrollbar;
Blockly.Scrollbar.scrollbarThickness = 13;

// Stock Blockly's "Set [variable] to" flyout block starts with its VALUE
// input empty - unlike math_change (see flyoutCategoryBlocks below, in
// node_modules/blockly/core/variables.js) it doesn't get its own math_number
// shadow, so dragging it out gave no visible drop target until something was
// plugged in. Wrapped (not overwritten outright) so the button and every
// other block flyoutCategoryBlocks builds - math_change, variables_get -
// are untouched; only the variables_set entry gets a VALUE child appended
// after the fact.
const originalFlyoutCategoryBlocks = Blockly.Variables.flyoutCategoryBlocks;
Blockly.Variables.flyoutCategoryBlocks = function(workspace) {
  const xmlList = originalFlyoutCategoryBlocks.call(this, workspace);
  xmlList.forEach((element) => {
    if (element.tagName !== 'block' || element.getAttribute('type') !== 'variables_set') return;
    const value = Blockly.Xml.textToDom(
        '<value name="VALUE"><shadow type="math_number"><field name="NUM">0</field></shadow></value>');
    element.appendChild(value);
  });
  return xmlList;
};

// See Configuration.vue's "Arrange Blockly zoom controls horizontally along
// the bottom edge" switch - a live read (not cached at patch time, since
// this module only ever runs once but the setting can change any time
// afterward) of that setting. A standing app preference (see
// useBlocklyControlsHorizontalStorage's own comment in hooks/project.js),
// not part of the project itself.
const isBlocklyControlsHorizontal = () => {
  try {
    return !!useBlocklyControlsHorizontalStorage().value;
  } catch (e) {
    return false;
  }
};

// Stock Blockly (this bundled version, 6.20210701.0 - see node_modules/
// blockly/core/zoom_controls.js) only ever stacks the zoom in/out/reset
// buttons VERTICALLY, anchored to whichever corner is opposite the toolbox -
// there's no injection option for a horizontal row instead (confirmed
// directly by reading zoom_controls.js: WIDTH_/HEIGHT_ and the Y-only
// translate math in position() are hardcoded). Patched at the shared
// prototype level (same reasoning as moveDuringDrag below - no per-workspace
// hook exists for this), falling back to the ORIGINAL vertical
// implementation whenever the setting is off, so default behavior is
// byte-for-byte unchanged.
//
// getBoundingRectangle() and position() both need overriding together: the
// former is what OTHER positionable elements (the trashcan) bump themselves
// away from, so it has to report the same swapped width/height shape the
// horizontal layout actually occupies, or the trashcan could end up
// overlapping it.
//
// Only bumpDirection.UP/DOWN exist in this Blockly version (see
// positionable_helpers.js's own bumpDirection enum - no LEFT/RIGHT) - collision
// bumping is always vertical regardless of which axis the buttons themselves
// are laid out along, so that part of the original logic (verticalPosition/
// bumpDirection/bumpPositionRect) is kept completely unchanged here; only the
// WIDTH_/HEIGHT_ swap (for sizing) and the button-layout axis (X instead of Y,
// using horizontalPosition instead of verticalPosition to decide which end
// zoomOut anchors nearest, mirroring the original's own vertical version
// exactly) actually differ.
const originalZoomControlsGetBoundingRectangle = Blockly.ZoomControls.prototype.getBoundingRectangle;
Blockly.ZoomControls.prototype.getBoundingRectangle = function() {
  if (!isBlocklyControlsHorizontal()) return originalZoomControlsGetBoundingRectangle.call(this);
  let width = this.SMALL_SPACING_ + 2 * this.WIDTH_;
  if (this.zoomResetGroup_) width += this.LARGE_SPACING_ + this.WIDTH_;
  const right = this.left_ + width;
  const bottom = this.top_ + this.HEIGHT_;
  return new Blockly.utils.Rect(this.top_, bottom, this.left_, right);
};

const originalZoomControlsPosition = Blockly.ZoomControls.prototype.position;
Blockly.ZoomControls.prototype.position = function(metrics, savedPositions) {
  if (!isBlocklyControlsHorizontal()) return originalZoomControlsPosition.call(this, metrics, savedPositions);
  if (!this.initialized_) return;

  const cornerPosition = Blockly.uiPosition.getCornerOppositeToolbox(this.workspace_, metrics);
  let width = this.SMALL_SPACING_ + 2 * this.WIDTH_;
  if (this.zoomResetGroup_) width += this.LARGE_SPACING_ + this.WIDTH_;
  // ActionEditor.vue's own grid-snap toggle (see setupGridSnapZoomButton,
  // which sets this.gridSnapGroup_ directly rather than this file having to
  // go hunting through this.svgGroup_'s own children by index - a previous
  // version did that, and broke the moment anything about sibling order
  // assumptions was even slightly off) gets counted as a genuine 4th slot in
  // the row's own reserved width from the start, sitting FIRST (local x=0,
  // the leftmost icon in the row) with the 3 real buttons all shifted right
  // by realButtonsOffset to make room - rather than appended AFTER the 3
  // real buttons, which is what let it either overlap the trashcan or
  // render outside the row's own actual on-screen box in earlier attempts
  // at this.
  const hasGridSnap = !!this.gridSnapGroup_;
  const realButtonsOffset = hasGridSnap ? this.LARGE_SPACING_ + this.WIDTH_ : 0;
  if (hasGridSnap) width += realButtonsOffset;
  const startRect = Blockly.uiPosition.getStartPositionRect(
      cornerPosition, new Blockly.utils.Size(width, this.HEIGHT_),
      this.MARGIN_HORIZONTAL_, this.MARGIN_VERTICAL_, metrics, this.workspace_);

  // The trashcan (weight 1, positioned before zoom controls' own weight 2 -
  // see workspace_svg.js's own position-pass loop, which runs every
  // POSITIONABLE component in ascending weight order) claims this same
  // corner first, so the stock bump logic below - vertical-only, see this
  // override's own top comment - always stacks the zoom row ABOVE or BELOW
  // it rather than beside it. Read the trashcan's own already-computed
  // top_/left_/size directly instead, and sit alongside it in the SAME row
  // (vertically centered against its own height) whenever it exists, rather
  // than bumping away from it - the normal bump path below is kept purely as
  // a fallback for the (currently never exercised in this app) case where a
  // workspace has no trashcan at all.
  const trashcan = this.workspace_.trashcan;
  let positionRect;
  if (trashcan) {
    // trashcanScaledWidth_ is set by this file's own Trashcan.position
    // override below whenever it actually shrank the icon to match this row
    // - falls back to the real, unscaled width otherwise. trashcan.top_ IS
    // where its own nominal (lid+body) box starts, but the drawn trash
    // sprite itself doesn't fill that box - measured directly (drew the
    // actual sprite sheet to an offscreen canvas and scanned for the first
    // non-transparent row) rather than assumed: the lid graphic's own
    // visible pixels start about 37% of the way down the lid's own nominal
    // height, well below y=0, while the zoom icons' own sprites fill their
    // box with zero padding - aligning box-tops (this override's own
    // previous approach) therefore left the zoom row looking higher than
    // the trashcan's own visible ink. TRASHCAN_VISIBLE_TOP_FRACTION (see
    // TRASHCAN_SCALE below) encodes that measured padding as a fraction of
    // LID_HEIGHT_, so it stays correct even if LID_HEIGHT_ itself changes.
    const trashWidth = trashcan.trashcanScaledWidth_ || trashcan.WIDTH_;
    const top = trashcan.top_ + trashcan.LID_HEIGHT_ * TRASHCAN_VISIBLE_TOP_FRACTION *
      (trashcan.trashcanScaledWidth_ ? TRASHCAN_SCALE : 1);
    const left = cornerPosition.horizontal === Blockly.uiPosition.horizontalPosition.LEFT ?
      trashcan.left_ + trashWidth + this.MARGIN_HORIZONTAL_ :
      trashcan.left_ - this.MARGIN_HORIZONTAL_ - width;
    positionRect = new Blockly.utils.Rect(top, top + this.HEIGHT_, left, left + width);
  } else {
    const verticalPosition = cornerPosition.vertical;
    const bumpDirection = verticalPosition === Blockly.uiPosition.verticalPosition.TOP ?
      Blockly.uiPosition.bumpDirection.DOWN : Blockly.uiPosition.bumpDirection.UP;
    positionRect = Blockly.uiPosition.bumpPositionRect(
        startRect, this.MARGIN_VERTICAL_, bumpDirection, savedPositions);
  }

  if (cornerPosition.horizontal === Blockly.uiPosition.horizontalPosition.LEFT) {
    this.zoomInGroup_.setAttribute('transform', `translate(${realButtonsOffset}, 0)`);
    const zoomOutTranslateX = realButtonsOffset + this.SMALL_SPACING_ + this.WIDTH_;
    this.zoomOutGroup_.setAttribute('transform', `translate(${zoomOutTranslateX}, 0)`);
    if (this.zoomResetGroup_) {
      const zoomResetTranslateX = zoomOutTranslateX + this.LARGE_SPACING_ + this.WIDTH_;
      this.zoomResetGroup_.setAttribute('transform', `translate(${zoomResetTranslateX}, 0)`);
    }
  } else {
    const zoomOutTranslateX = realButtonsOffset + (this.zoomResetGroup_ ? this.LARGE_SPACING_ + this.WIDTH_ : 0);
    this.zoomOutGroup_.setAttribute('transform', `translate(${zoomOutTranslateX}, 0)`);
    const zoomInTranslateX = zoomOutTranslateX + this.SMALL_SPACING_ + this.WIDTH_;
    this.zoomInGroup_.setAttribute('transform', `translate(${zoomInTranslateX}, 0)`);
    if (this.zoomResetGroup_) {
      this.zoomResetGroup_.setAttribute('transform', `translate(${realButtonsOffset}, 0)`);
    }
  }
  if (hasGridSnap) {
    this.gridSnapGroup_.setAttribute('transform', 'translate(0, 0)');
  }

  this.top_ = positionRect.top;
  this.left_ = positionRect.left;
  this.svgGroup_.setAttribute('transform', `translate(${this.left_},${this.top_})`);
};

// The stock trashcan (WIDTH_ 47, BODY_HEIGHT_ 44 + LID_HEIGHT_ 16 = 60 tall -
// see node_modules/blockly/core/trashcan.js) is visibly taller than the
// 32px-square zoom buttons it now sits beside in a row (see the
// ZoomControls.position override above) - shrunk here to match ZoomControls'
// own HEIGHT_ exactly, only when horizontal mode is on, by appending a plain
// SVG "scale(...)" after trashcan's own real translate (SVG applies
// transforms right-to-left, so this scales around the group's own local
// origin FIRST, then places that already-shrunk icon at left_/top_ - the
// same anchor point the unscaled version would have used, so top_/left_
// still mean what every other reader of them - this file's own
// ZoomControls.position override included - expects).
//
// getClientRect (the actual drag-and-drop hit-test, a different method from
// getBoundingRectangle - see its own use in dragged_connection_manager.js)
// is deliberately left unpatched: it derives its own base rect from
// svgGroup_.getBoundingClientRect(), which already reflects this scale
// automatically, then pads it by a few constants for a generous drop
// hotspot - shrinking those pad constants too would be extra risk for a
// purely cosmetic fix, since a slightly oversized (rather than undersized)
// drop target is the safe direction to be wrong in.
const TRASHCAN_SCALE = Blockly.ZoomControls.prototype.HEIGHT_ /
  (Blockly.Trashcan.prototype.BODY_HEIGHT_ + Blockly.Trashcan.prototype.LID_HEIGHT_);

// Measured directly against the real sprite sheet (media/sprites.png, via
// the ZoomControls.position override's own trashcan.top_ comment above) -
// drew it to an offscreen canvas and scanned for the first non-transparent
// row within the lid's own clip region: its visible pixels start about 37%
// of the way down the lid's own nominal height. Expressed as a fraction of
// LID_HEIGHT_ (rather than a flat pixel count) so it stays correct if
// LID_HEIGHT_ itself ever changes.
const TRASHCAN_VISIBLE_TOP_FRACTION = 0.371;

const originalTrashcanPosition = Blockly.Trashcan.prototype.position;
Blockly.Trashcan.prototype.position = function(metrics, savedPositions) {
  originalTrashcanPosition.call(this, metrics, savedPositions);
  if (!isBlocklyControlsHorizontal() || !this.svgGroup_) {
    this.trashcanScaledWidth_ = null;
    this.trashcanScaledHeight_ = null;
    return;
  }
  this.trashcanScaledWidth_ = this.WIDTH_ * TRASHCAN_SCALE;
  this.trashcanScaledHeight_ = (this.BODY_HEIGHT_ + this.LID_HEIGHT_) * TRASHCAN_SCALE;
  this.trashcanScaledLidHeight_ = this.LID_HEIGHT_ * TRASHCAN_SCALE;
  this.trashcanScaledBodyHeight_ = this.BODY_HEIGHT_ * TRASHCAN_SCALE;
  this.svgGroup_.setAttribute('transform',
      `translate(${this.left_},${this.top_}) scale(${TRASHCAN_SCALE})`);
};

const originalTrashcanGetBoundingRectangle = Blockly.Trashcan.prototype.getBoundingRectangle;
Blockly.Trashcan.prototype.getBoundingRectangle = function() {
  if (!this.trashcanScaledWidth_) return originalTrashcanGetBoundingRectangle.call(this);
  const bottom = this.top_ + this.trashcanScaledHeight_;
  const right = this.left_ + this.trashcanScaledWidth_;
  return new Blockly.utils.Rect(this.top_, bottom, this.left_, right);
};

// Live-snap-while-dragging: stock Blockly only ever snaps a block to the
// grid once, at the very END of a drag (BlockSvg.prototype.snapToGrid,
// reached via BlockDragger's own endDrag flow) - moveDuringDrag (called on
// every single mousemove, with the block's live workspace-coordinate
// target position) never consults the grid at all, so a dragged block's
// on-screen position never visibly snaps until you let go, even with grid
// snap turned on. Patched once here, at the shared prototype level (there's
// no per-workspace hook Blockly itself offers for this - confirmed via its
// own docs at https://docs.blockly.com/guides/configure/grid/, which only
// documents the injection-time "snap" option, nothing for drag-time
// behaviour) - rounds the live position to the nearest grid vertex on every
// move too, using the exact same half-spacing formula
// BlockSvg.prototype.snapToGrid itself uses (see node_modules/blockly/core/
// block_svg.js), so what's shown while dragging always agrees with where
// the block will actually land.
const originalMoveDuringDrag = Blockly.BlockSvg.prototype.moveDuringDrag;
Blockly.BlockSvg.prototype.moveDuringDrag = function(newLoc) {
  const grid = this.workspace && this.workspace.getGrid && this.workspace.getGrid();
  if (grid && grid.shouldSnap()) {
    const spacing = grid.getSpacing();
    const half = spacing / 2;
    newLoc = new Blockly.utils.Coordinate(
        Math.round((newLoc.x - half) / spacing) * spacing + half,
        Math.round((newLoc.y - half) / spacing) * spacing + half);
  }
  originalMoveDuringDrag.call(this, newLoc);
};

// No wheel-behavior patch needed here (an earlier version of this had one,
// for a since-reverted shift-to-zoom scheme) - Ctrl+wheel to zoom, plain
// wheel to scroll vertically, is already stock Blockly's own default
// onMouseWheel_ behavior (node_modules/blockly/core/workspace_svg.js: zooms
// when canWheelZoom && e.ctrlKey, otherwise scrolls). The only reason plain
// wheel used to always zoom regardless of Ctrl was that this app never set
// a "move" option at all, leaving wheel-scrolling off entirely (see
// ActionEditor.vue's own "move: {wheel: true}" option, which is the actual
// fix) - once that's on, stock Blockly's own logic already does exactly
// what's wanted with no override needed.

export default {
  name: 'BlocklyComponent',
  props: ['options', 'value'],
  data() {
    return {
      workspace: null,
      lastSavedWorkspace: null,
    };
  },
  mounted() {
    const options = this.$props.options || {};
    if (!options.toolbox) {
      options.toolbox = this.$refs['blocklyToolbox'];
    }

    this.workspace = Blockly.inject(this.$refs['blocklyDiv'], options);
    this.workspace.addChangeListener(debounce(() => this.handleChange()));
    this.loadWorkspace(this.value);

    // Keep the Blockly SVG sized to its container. The surrounding layout can
    // resize the container after inject (Blockly only reflows on window
    // resize), which would otherwise leave the SVG mis-sized and its zoom and
    // trashcan controls anchored off-screen.
    //
    // The scrollbar specifically needs its own extra settle-and-recompute
    // pass: ResizeObserver can fire mid-reflow (e.g. while a sibling panel's
    // resize is still being applied across a couple of frames), and
    // Blockly.svgResize()/workspace.resize() then caches the scrollbar's
    // position from that in-between size instead of the final one - the SVG
    // itself keeps tracking the container correctly (CSS does that on its
    // own), so only the scrollbar (positioned from Blockly's own cached
    // metrics, not live CSS) ends up visibly drawn in the wrong place versus
    // where it actually receives clicks.
    const resizeWorkspace = () => {
      Blockly.svgResize(this.workspace);
      if (this.workspace.scrollbar) this.workspace.scrollbar.resize();
    };
    this.resizeObserver = new ResizeObserver(() => {
      resizeWorkspace();
      clearTimeout(this.resizeSettleTimer);
      this.resizeSettleTimer = setTimeout(resizeWorkspace, 100);
    });
    this.resizeObserver.observe(this.$refs['blocklyDiv']);
  },
  beforeDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    clearTimeout(this.resizeSettleTimer);
  },
  methods: {
    setSoundsEnabled(enabled) {
      const audioMgr = this.workspace.getAudioManager();
      if (enabled) {
        const pathToMedia = (this.$props.options || {}).media || 'media/';
        audioMgr.load(
            [pathToMedia + 'click.mp3', pathToMedia + 'click.wav', pathToMedia + 'click.ogg'], 'click');
        audioMgr.load(
            [pathToMedia + 'disconnect.wav', pathToMedia + 'disconnect.mp3', pathToMedia + 'disconnect.ogg'],
            'disconnect');
        audioMgr.load(
            [pathToMedia + 'delete.mp3', pathToMedia + 'delete.ogg', pathToMedia + 'delete.wav'], 'delete');
      } else {
        audioMgr.SOUNDS_ = {};
      }
    },
    loadWorkspace(value) {
      const xml = Blockly.Xml.textToDom(value && value !== 'null' ?
          value : '<xml xmlns="https://developers.google.com/blockly/xml"/>');
      Blockly.Xml.domToWorkspace(this.workspace, xml);
    },
    handleChange() {
      const xml = Blockly.Xml.workspaceToDom(this.workspace);
      const text = Blockly.Xml.domToPrettyText(xml);
      this.lastSavedWorkspace = text;
      this.$emit('input', text, {
        workspace: this.workspace,
      });
    },
  },
  watch: {
    value(newVal, oldVal) {
      if (newVal !== this.lastSavedWorkspace) {
        this.loadWorkspace(newVal);
      }
    },
    'options.sounds'(newVal) {
      if (this.workspace) {
        this.setSoundsEnabled(newVal);
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.blocklyDiv {
  height: 100%;
  width: 100%;
  text-align: left;
}
</style>
