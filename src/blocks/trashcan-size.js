import * as Blockly from 'blockly/core';

// The stock trashcan icon (47px wide x 60px tall, body + lid) reads
// noticeably larger than the 32x32 zoom/multiselect/grid-snap control icons
// stacked right above it in every editor's workspace. Blockly has no
// supported option for this, so the icon is scaled down to fit the same
// 32x32 footprint those other icons use.
//
// Scaled against the icon's TALLER dimension (60, not its 47-wide side) - a
// real reported case of scaling against width alone ("the blockly canvas
// trashcan icon doesn't match the size of the other icons on the canvas")
// still leaving the icon 40.85px tall (60 * 32/47) once narrowed to 32px
// wide, visibly taller than the 32-tall icons beside it. Scaling by the
// larger dimension instead caps BOTH sides within that same 32x32 box,
// matching their footprint exactly rather than just their width.
//
// Shrinking WIDTH/BODY_HEIGHT/LID_HEIGHT alone isn't enough: those also
// size the clip-path rects createDom() uses to window into the shared sprite
// sheet, while the <image> elements themselves keep the sprite sheet's full,
// unscaled pixel size - so a naive shrink just crops a smaller window into
// the same full-size icon instead of scaling it, chopping off part of it.
// createDom() is copied from Blockly's source (trashcan.js) with the sprite
// <image> geometry (width/height/x/y) also multiplied by SCALE, so the clip
// window and the image it's clipping shrink together.
const SCALE = 32 / 60;

// Blockly 8 rewrote Trashcan as a goog.module class with WIDTH/BODY_HEIGHT/
// LID_HEIGHT/SPRITE_LEFT/SPRITE_TOP as private, UNEXPORTED module-scope
// consts (node_modules/blockly/core/trashcan.js), and the sprite sheet's
// width/height/url moved from the public Blockly.SPRITE into an equally
// unexported Blockly.sprite module (node_modules/blockly/core/sprites.js) -
// none of these five are reachable at all any more, not even as instance
// properties, unlike Blockly 6 where they lived on Trashcan.prototype and
// could be read/overwritten directly. Confirmed directly against the
// installed package - every value below is copied byte-for-byte from that
// source (the sprite sheet dimensions are unchanged since Blockly 6, still
// unchanged as of the Blockly 10 TypeScript rewrite too - confirmed
// directly against the real installed package's trashcan.d.ts each time),
// and needs re-checking again if Blockly is ever upgraded further. Exported
// so BlocklyComponent.vue's Trashcan position()/getBoundingRectangle()
// overrides (which need the UNSCALED values to compute their scaled
// transform) can share the exact same numbers instead of a second,
// independently-copied set that could drift out of sync with this file's
// createDom().
export const TRASHCAN_WIDTH = 47;
export const TRASHCAN_BODY_HEIGHT = 44;
export const TRASHCAN_LID_HEIGHT = 16;
const SPRITE_WIDTH = 96;
const SPRITE_HEIGHT = 124;
const SPRITE_URL = 'sprites.png';
const SPRITE_LEFT = 0;
const SPRITE_TOP = 32;

// Property/method names below (svgGroup, svgLid, workspace,
// blockMouseDownWhenOpenable, mouseOver, mouseOut, animateLid) match
// Blockly 10's Trashcan class exactly - confirmed directly against the
// installed package's trashcan.d.ts, which still lists every one of these
// as real (TypeScript-only "private", not a true runtime-private #field)
// instance properties/methods, just without the trailing underscore
// Blockly 6/8's Closure-style naming convention used. "click" was already
// unprefixed even back then - Blockly's public API for programmatically
// triggering a click on the trashcan, not a renamed internal.
Blockly.Trashcan.prototype.createDom = function() {
  this.svgGroup = Blockly.utils.dom.createSvgElement(Blockly.utils.Svg.G, {'class': 'blocklyTrash'}, null);
  const rnd = String(Math.random()).substring(2);

  const bodyClip = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.CLIPPATH, {'id': 'blocklyTrashBodyClipPath' + rnd}, this.svgGroup);
  Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT,
      {
        'width': TRASHCAN_WIDTH * SCALE,
        'height': TRASHCAN_BODY_HEIGHT * SCALE,
        'y': TRASHCAN_LID_HEIGHT * SCALE,
      },
      bodyClip);
  const body = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE,
      {
        'width': SPRITE_WIDTH * SCALE,
        'x': -SPRITE_LEFT * SCALE,
        'height': SPRITE_HEIGHT * SCALE,
        'y': -SPRITE_TOP * SCALE,
        'clip-path': 'url(#blocklyTrashBodyClipPath' + rnd + ')',
      },
      this.svgGroup);
  body.setAttributeNS(
      Blockly.utils.dom.XLINK_NS, 'xlink:href', this.workspace.options.pathToMedia + SPRITE_URL);

  const lidClip = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.CLIPPATH, {'id': 'blocklyTrashLidClipPath' + rnd}, this.svgGroup);
  Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT, {'width': TRASHCAN_WIDTH * SCALE, 'height': TRASHCAN_LID_HEIGHT * SCALE}, lidClip);
  this.svgLid = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE,
      {
        'width': SPRITE_WIDTH * SCALE,
        'x': -SPRITE_LEFT * SCALE,
        'height': SPRITE_HEIGHT * SCALE,
        'y': -SPRITE_TOP * SCALE,
        'clip-path': 'url(#blocklyTrashLidClipPath' + rnd + ')',
      },
      this.svgGroup);
  this.svgLid.setAttributeNS(
      Blockly.utils.dom.XLINK_NS, 'xlink:href', this.workspace.options.pathToMedia + SPRITE_URL);

  Blockly.browserEvents.bind(this.svgGroup, 'mousedown', this, this.blockMouseDownWhenOpenable);
  Blockly.browserEvents.bind(this.svgGroup, 'mouseup', this, this.click);
  Blockly.browserEvents.bind(body, 'mouseover', this, this.mouseOver);
  Blockly.browserEvents.bind(body, 'mouseout', this, this.mouseOut);
  this.animateLid();
  return this.svgGroup;
};

// Blockly's zoom controls (zoom_controls.js) are a hardcoded 32x32 - not
// reachable as an exported constant any more than trashcan.js's
// WIDTH/BODY_HEIGHT/LID_HEIGHT are (see those three above), so copied here
// by hand the same way, for the centering math just below.
const ZOOM_WIDTH = 32;

// Blockly's stock position() (trashcan.js) computes "left"/"top" from the
// UNSCALED TRASHCAN_WIDTH (47) - it has no idea createDom() above then
// visually shrinks the icon to TRASHCAN_WIDTH * SCALE, so the icon ends up
// positioned as if it still occupied the full 47-wide box. Confirmed
// directly (not assumed) that Blockly's corner-anchoring computes every
// same-corner icon's RIGHT edge the same way regardless of its width
// (only "left" depends on width: left = right edge - width) - before any
// correction, the trashcan's stock-computed right edge (left + 47) landed
// on the exact same screen x as the zoom controls' right edge, confirmed by
// live measurement. So the 32-wide zoom controls and this 47-wide trashcan
// box are already right-edge-aligned by construction; what's actually
// misaligned is the SCALED icon sitting inside that 47-wide box, flush to
// the box's left edge (confirmed as a real reported case, "move it
// horizontally so it's in line with the zoom controls" - not glued to the
// box's center). Recentres the icon within the 32-wide column the zoom
// controls occupy instead: since the two share a right edge (this.left +
// TRASHCAN_WIDTH === zoom controls' right edge, per the live measurement
// above), the zoom column's center sits at this.left + TRASHCAN_WIDTH
// - ZOOM_WIDTH / 2 - shifting the icon's left edge by that same distance,
// minus half the scaled icon's width, centers it there instead of
// leaving it flush to the unscaled box's left edge. Done after Blockly's
// position() runs, rather than reimplementing its whole corner/margin/
// bump-rect algorithm just to swap one constant.
const originalTrashcanPosition = Blockly.Trashcan.prototype.position;
Blockly.Trashcan.prototype.position = function(...args) {
  originalTrashcanPosition.apply(this, args);
  if (!this.svgGroup) return;
  const scaledWidth = TRASHCAN_WIDTH * SCALE;
  this.left += (TRASHCAN_WIDTH - ZOOM_WIDTH / 2) - scaledWidth / 2;
  this.svgGroup.setAttribute('transform', `translate(${this.left},${this.top})`);
};
