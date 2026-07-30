import * as Blockly from 'blockly/core';

// The stock trashcan icon (47px wide) reads noticeably larger than the zoom
// controls (32px wide) stacked right above it in every editor's workspace.
// Blockly has no supported option for this, so the icon is scaled down to
// match the zoom controls' width.
//
// Shrinking WIDTH_/BODY_HEIGHT_/LID_HEIGHT_ alone isn't enough: those also
// size the clip-path rects createDom() uses to window into the shared sprite
// sheet, while the <image> elements themselves keep the sprite sheet's full,
// unscaled pixel size - so a naive shrink just crops a smaller window into
// the same full-size icon instead of scaling it, chopping off part of it.
// createDom() is copied from Blockly's own source (trashcan.js) with the
// sprite <image> geometry (width/height/x/y) also multiplied by SCALE, so
// the clip window and the image it's clipping shrink together.
const SCALE = 32 / 47;
Blockly.Trashcan.prototype.WIDTH_ = Math.round(Blockly.Trashcan.prototype.WIDTH_ * SCALE);
Blockly.Trashcan.prototype.BODY_HEIGHT_ = Math.round(Blockly.Trashcan.prototype.BODY_HEIGHT_ * SCALE);
Blockly.Trashcan.prototype.LID_HEIGHT_ = Math.round(Blockly.Trashcan.prototype.LID_HEIGHT_ * SCALE);

Blockly.Trashcan.prototype.createDom = function() {
  this.svgGroup_ = Blockly.utils.dom.createSvgElement(Blockly.utils.Svg.G, {'class': 'blocklyTrash'}, null);
  const rnd = String(Math.random()).substring(2);

  const bodyClip = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.CLIPPATH, {'id': 'blocklyTrashBodyClipPath' + rnd}, this.svgGroup_);
  Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT,
      {'width': this.WIDTH_, 'height': this.BODY_HEIGHT_, 'y': this.LID_HEIGHT_},
      bodyClip);
  const body = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE,
      {
        'width': Blockly.SPRITE.width * SCALE,
        'x': -this.SPRITE_LEFT_ * SCALE,
        'height': Blockly.SPRITE.height * SCALE,
        'y': -this.SPRITE_TOP_ * SCALE,
        'clip-path': 'url(#blocklyTrashBodyClipPath' + rnd + ')',
      },
      this.svgGroup_);
  body.setAttributeNS(
      Blockly.utils.dom.XLINK_NS, 'xlink:href', this.workspace_.options.pathToMedia + Blockly.SPRITE.url);

  const lidClip = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.CLIPPATH, {'id': 'blocklyTrashLidClipPath' + rnd}, this.svgGroup_);
  Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.RECT, {'width': this.WIDTH_, 'height': this.LID_HEIGHT_}, lidClip);
  this.svgLid_ = Blockly.utils.dom.createSvgElement(
      Blockly.utils.Svg.IMAGE,
      {
        'width': Blockly.SPRITE.width * SCALE,
        'x': -this.SPRITE_LEFT_ * SCALE,
        'height': Blockly.SPRITE.height * SCALE,
        'y': -this.SPRITE_TOP_ * SCALE,
        'clip-path': 'url(#blocklyTrashLidClipPath' + rnd + ')',
      },
      this.svgGroup_);
  this.svgLid_.setAttributeNS(
      Blockly.utils.dom.XLINK_NS, 'xlink:href', this.workspace_.options.pathToMedia + Blockly.SPRITE.url);

  Blockly.browserEvents.bind(this.svgGroup_, 'mousedown', this, this.blockMouseDownWhenOpenable_);
  Blockly.browserEvents.bind(this.svgGroup_, 'mouseup', this, this.click);
  Blockly.browserEvents.bind(body, 'mouseover', this, this.mouseOver_);
  Blockly.browserEvents.bind(body, 'mouseout', this, this.mouseOut_);
  this.animateLid_();
  return this.svgGroup_;
};
