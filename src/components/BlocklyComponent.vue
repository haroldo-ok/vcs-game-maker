<template>
  <div>
    <div class="blocklyDiv" :class="{'blocklyDiv-desaturated': desaturateBlocklyColors}" ref="blocklyDiv">
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

import {useBlocklyControlsHorizontalStorage, useDesaturateBlocklyColorsStorage} from '../hooks/project';

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

// Options tab's own "Desaturate Blockly block colors" toggle (see
// useDesaturateBlocklyColorsStorage in hooks/project.js) - -50% saturation,
// applied in real HSL space (matching Photoshop's own Hue/Saturation
// adjustment, which scales S the same way) - NOT a CSS filter:
// filter: saturate() operates on non-linear sRGB via a fixed luminance
// matrix, a different algorithm that visibly darkened blues in particular
// instead of just muting them, confirmed as a real reported mismatch
// against Photoshop's own result at the same "50%".
const clamp01 = (n) => Math.max(0, Math.min(1, n));

const hexToRgb = (hex) => {
  const clean = hex.replace('#', '');
  return [0, 2, 4].map((i) => parseInt(clean.substr(i, 2), 16) / 255);
};

const rgbToHex = (r, g, b) => '#' + [r, g, b]
    .map((v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0'))
    .join('');

// Standard RGB<->HSL conversion (e.g. matching the CSS Color 4 spec's own
// algorithm) - h in [0,1) (not degrees), s/l in [0,1].
const rgbToHsl = (r, g, b) => {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h / 6, s, l];
};

const hue2rgb = (p, q, tIn) => {
  let t = tIn;
  if (t < 0) t += 1;
  if (t > 1) t -= 1;
  if (t < 1 / 6) return p + (q - p) * 6 * t;
  if (t < 1 / 2) return q;
  if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
  return p;
};

const hslToRgb = (h, s, l) => {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
};

// saturationFactor multiplies S (0.5 = Photoshop's "-50") - same slider
// Photoshop's own Hue/Saturation dialog exposes, applied to the same
// component.
const desaturateHex = (hex, saturationFactor) => {
  const [h, s, l] = rgbToHsl(...hexToRgb(hex));
  const [r, g, b] = hslToRgb(h, clamp01(s * saturationFactor), l);
  return rgbToHex(r, g, b);
};

// Blockly.utils.parseBlockColour is the single funnel every block's own
// colour - a Classic-theme hue NUMBER (see generateTertiaryColour_'s own
// comment above) or a raw hex/CSS colour name string alike - resolves
// through on its way to becoming colourPrimary (see renderers/common/
// constants.js's own validatedBlockStyle_), so patching THIS one function
// covers every block regardless of which of those two forms defined its
// colour, with no per-block-file changes needed - and colourSecondary/
// colourTertiary (generateSecondaryColour_/generateTertiaryColour_ above)
// both derive FROM colourPrimary, so they pick up the same desaturated
// base automatically too, with no separate patch of their own required.
// Read live (not cached) on every call, same "just check the stored value
// directly, no reactive binding needed" pattern isBlocklyControlsHorizontal
// below already uses - this only ever actually runs while a workspace is
// being (re)injected, once per tab visit, so there's no live-toggle-
// mid-session case to handle here.
//
// Guarded (isDesaturationPatch) against re-wrapping itself - the 'blockly'
// module instance persists across this FILE's own dev-server hot-reloads,
// but this file's own module-level code (this patch included) re-executes
// on every one of them; without the guard, each edit-triggered reload
// wrapped whatever the PREVIOUS reload had already wrapped, compounding the
// desaturation further with every single edit made during a dev session -
// confirmed as the actual cause of a real reported "the colors just
// changed, they looked right and now don't" mid-session, with no code
// change of the actual 0.5 factor involved at all.
if (!Blockly.utils.parseBlockColour.isDesaturationPatch) {
  const originalParseBlockColour = Blockly.utils.parseBlockColour;
  Blockly.utils.parseBlockColour = function(colour) {
    const result = originalParseBlockColour.call(this, colour);
    if (useDesaturateBlocklyColorsStorage().value) {
      result.hex = desaturateHex(result.hex, 0.5);
    }
    return result;
  };
  Blockly.utils.parseBlockColour.isDesaturationPatch = true;
}

// Same reasoning/guard as the parseBlockColour patch just above, for the
// TOOLBOX CATEGORY labels ("Logic", "Loops", "Math", etc) - confirmed
// directly that these resolve their own colour through an entirely
// SEPARATE function (ToolboxCategory.prototype.parseColour_, not
// Blockly.utils.parseBlockColour), so without this, "Soft Blockly colors"
// left every category label in the toolbox sidebar still fully saturated
// even with every actual block already muted.
if (!Blockly.ToolboxCategory.prototype.parseColour_.isDesaturationPatch) {
  const originalParseColour = Blockly.ToolboxCategory.prototype.parseColour_;
  Blockly.ToolboxCategory.prototype.parseColour_ = function(colourValue) {
    const hex = originalParseColour.call(this, colourValue);
    return hex && useDesaturateBlocklyColorsStorage().value ? desaturateHex(hex, 0.5) : hex;
  };
  Blockly.ToolboxCategory.prototype.parseColour_.isDesaturationPatch = true;
}

// Keeps the toolbox flyout (the drawer of draggable block previews a
// clicked category opens) open across a zoom - confirmed directly that
// WorkspaceSvg.prototype.setScale (the function EVERY zoom path - the +/-
// buttons, Ctrl+wheel, zoom-to-fit, zoom-reset - ultimately calls)
// unconditionally calls Blockly.hideChaff(false) itself, and that false
// (not true - see hideChaff's own "onlyClosePopups" parameter) is
// specifically what tells the flyout to close itself, not just dismiss
// unrelated popups like tooltips/context menus. A real reported
// annoyance: picking a category, then zooming to get a better look before
// dragging a block in, closed the very drawer you were about to drag from.
//
// Temporarily swaps out Blockly.hideChaff for the duration of setScale's
// own (synchronous) call, forcing it to behave as if onlyClosePopups were
// always true - deliberately NOT a permanent override of hideChaff
// itself, which would also leave the flyout open on every OTHER
// hideChaff(false) call site too (e.g. clicking empty canvas), well
// beyond what was actually asked for ("when zooming").
if (!Blockly.WorkspaceSvg.prototype.setScale.isKeepFlyoutOpenPatch) {
  const originalSetScale = Blockly.WorkspaceSvg.prototype.setScale;
  Blockly.WorkspaceSvg.prototype.setScale = function(newScale) {
    const originalHideChaff = Blockly.hideChaff;
    Blockly.hideChaff = () => originalHideChaff(true);
    try {
      originalSetScale.call(this, newScale);
    } finally {
      Blockly.hideChaff = originalHideChaff;
    }
  };
  Blockly.WorkspaceSvg.prototype.setScale.isKeepFlyoutOpenPatch = true;
}

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

// Module-scope (not component data) - same reasoning as every other
// "survive remount" ref elsewhere in this app (e.g. BackgroundEditor.vue's
// own copiedBackgroundData): Vue Router destroys and recreates this
// component every time its tab is left and revisited, so a plain instance
// property would reset right back to nothing on every visit. Only ever
// read/written imperatively (see mounted()/beforeDestroy() below), never
// bound in a template, so a plain object is enough - no reactivity needed.
let savedScrollState = null;

export default {
  name: 'BlocklyComponent',
  props: ['options', 'value'],
  data() {
    return {
      workspace: null,
      lastSavedWorkspace: null,
    };
  },
  computed: {
    // Only the block TEXT (see .blocklyDiv-desaturated's own CSS comment
    // for why emoji glyphs specifically need this, unlike ordinary block
    // fill colours - see Blockly.utils.parseBlockColour's own patch above)
    // needs a live, reactive binding here - block fill colour itself is
    // desaturated once, up front, at colour-resolution time, with no
    // per-render reactivity needed since a workspace is never re-injected
    // without a full remount anyway.
    desaturateBlocklyColors() {
      return useDesaturateBlocklyColorsStorage().value;
    },
  },
  mounted() {
    const options = this.$props.options || {};
    if (!options.toolbox) {
      options.toolbox = this.$refs['blocklyToolbox'];
    }

    this.workspace = Blockly.inject(this.$refs['blocklyDiv'], options);
    this.workspace.addChangeListener(debounce(() => this.handleChange()));
    this.loadWorkspace(this.value);

    // IBM Plex Mono (--blockly-font-family, see App.vue, and
    // ActionEditor.vue's own matching "normal 11px" fontStyle) loads
    // asynchronously via a <link> in public/index.html, same as any web
    // font - browsers fetch that stylesheet eagerly, but LAZILY defer
    // actually downloading the font FILE it references until something on
    // the page needs to render text in it. If Blockly.inject() above is the
    // very first thing that needs it, every block's initial text
    // measurement (which sizes its shape) runs against the fallback
    // ("monospace") font instead - the font then swaps in visually once it
    // finishes loading, but Blockly never re-measures existing blocks on
    // its own, so they stay the WRONG size until something forces a
    // re-render.
    //
    // document.fonts.ready (tried first) is NOT the right signal for this:
    // it resolves once every font ALREADY SCHEDULED to load has finished -
    // but if the lazy download above hasn't been scheduled yet at the
    // moment this code runs (a real race - confirmed as why that first
    // attempt still needed a page refresh), it can resolve before the real
    // font ever starts loading, let alone finishes. document.fonts.load()
    // instead actively requests this exact font (deduped by the browser if
    // it's already loading/cached) and its own returned promise only
    // resolves once THAT specific load genuinely completes - a real signal,
    // not an ambient one. Once it resolves, re-rendering every block
    // re-runs Blockly's own text measurement (a live DOM
    // getComputedTextLength() call, not something Blockly caches across
    // renders) against the now-correct font.
    if (document.fonts && document.fonts.load) {
      document.fonts.load('normal 11px "IBM Plex Mono"').catch(() => {}).then(() => {
        if (!this.workspace) return;
        this.workspace.getAllBlocks(false).forEach((block) => block.render());
        // The toolbox flyout is a genuinely separate sub-workspace (its own
        // blocks, its own earlier text measurement race) - getAllBlocks
        // above only walks the MAIN workspace, so a category open at the
        // moment the font finishes loading still stayed the wrong size
        // until it was closed and reopened, a real reported recurrence of
        // this same bug. getFlyout() returns null whenever no category is
        // currently open (nothing to fix yet - the flyout measures fresh,
        // correctly, the next time one IS opened, by which point the font
        // load below has long since resolved).
        const flyout = this.workspace.getFlyout && this.workspace.getFlyout();
        const flyoutWorkspace = flyout && flyout.getWorkspace && flyout.getWorkspace();
        if (flyoutWorkspace) {
          flyoutWorkspace.getAllBlocks(false).forEach((block) => block.render());
        }
      });
    }

    // Applied synchronously, right here - BEFORE the browser ever paints
    // this mount's own first frame - rather than from inside the resize-
    // settle pass below. An earlier version restored it there instead
    // (reasoning: scroll(x, y) is a raw pixel translate, not something that
    // depends on the container's own size the way the scrollbar's THUMB
    // position does - see resizeWorkspace's own comment just below for the
    // actual thing that settle pass exists for), which was confirmed as a
    // real, reported bug: the workspace visibly rendered at Blockly's own
    // default scroll position for a moment, then visibly JUMPED to the
    // saved one about 100ms later. Restoring it here instead means this
    // mount's very first paint already shows the right place - no jump to
    // see at all.
    if (savedScrollState) {
      this.workspace.setScale(savedScrollState.scale);
      this.workspace.scroll(savedScrollState.scrollX, savedScrollState.scrollY);
    }

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
    // Captured here (not just read live from this.workspace whenever
    // mounted() next needs it) since the workspace itself - along with
    // scrollX/scrollY/scale - is torn down entirely once this component is
    // destroyed; this is the last point they're still readable.
    if (this.workspace) {
      savedScrollState = {
        scrollX: this.workspace.scrollX,
        scrollY: this.workspace.scrollY,
        scale: this.workspace.scale,
      };
    }
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

/* Options tab's own "Desaturate Blockly block colors" toggle, the text/
   emoji half - see Blockly.utils.parseBlockColour's own patch above for
   the block FILL colour half. Emoji icon characters embedded in a block's
   own message string (see blocks/icon.js - MISSILE_ICON, COLOR_ICON, etc)
   render as native colour-emoji glyphs via the OS/browser's own emoji
   font, entirely outside Blockly's SVG fill/theme system - there's no
   "colour" value to desaturate in HSL the way a block's own fill has, so
   this is a plain CSS filter instead, scoped to just the text elements
   (same .blocklyText/.blocklyFlyoutLabelText classes App.vue's own font-
   family override already targets, for the same "block canvas AND
   toolbox/flyout both" reach) rather than the whole canvas - a filter
   across the ENTIRE .blocklyDiv was tried first and reverted (see this
   component's own git history): saturate() uses a different algorithm
   than Photoshop's HSL-based slider (see parseBlockColour's own comment),
   and applying it to block fills a SECOND time on top of the already-
   desaturated HSL fills double-muted them. >>> pierces this component's
   own scoped CSS boundary - Blockly injects its SVG text nodes into
   .blocklyDiv at runtime, so they never carry this component's own scope
   attribute the way template-authored elements do. */
.blocklyDiv-desaturated >>> .blocklyText,
.blocklyDiv-desaturated >>> .blocklyFlyoutLabelText {
  filter: saturate(50%);
}
</style>
