'use strict';

import {useShiftKey} from '../hooks/shift-key';

// Same Shift-to-square constraint as rectangle-tool.js - equalizes the
// bounding box's width/height (preserving drag direction) so the oval
// becomes a circle instead of whatever aspect ratio the drag happened to be.
const squareEndpoint = (x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return {x: x0 + sx * size, y: y0 + sy * size};
};

// Traces the ellipse inscribed in [xStart,yStart]-[xEnd,yEnd]: a cell is part
// of the ellipse's body when its center is inside it (the same test the Circle
// select tool uses), and the outline is the body's cells that touch the
// outside (up, down, left or right). That gives an even, one pixel wide line
// that reaches all four sides of the box and steps evenly, where rounding
// points sampled around the edge bunched up at some angles, left bumps
// and spilled one cell past the box.
const ellipseOutline = (xStart, yStart, xEnd, yEnd, color) => {
  const width = xEnd - xStart + 1;
  const height = yEnd - yStart + 1;
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const rx = width / 2;
  const ry = height / 2;
  // A tiny allowance so a cell whose center sits exactly on the edge counts as
  // inside, whatever floating point rounding does.
  const inside = (x, y) => {
    if (x < 0 || y < 0 || x >= width || y >= height) return false;
    const nx = (x - cx) / rx;
    const ny = (y - cy) / ry;
    return nx * nx + ny * ny <= 1.0001;
  };

  const pixels = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!inside(x, y)) continue;
      if (!inside(x - 1, y) || !inside(x + 1, y) || !inside(x, y - 1) || !inside(x, y + 1)) {
        pixels.push({x: xStart + x, y: yStart + y, color});
      }
    }
  }
  return pixels;
};

/**
 * An oval/circle-outline tool matching @curtishughes/pixel-editor's Tool
 * interface (handlePointerDown/handlePointerMove/handlePointerUp - see its
 * Pencil.js). The library has no ellipse tool at all, so this is built
 * from scratch, following the same drag-a-bounding-box shape as its
 * Rectangle tool (and this app's rectangle-tool.js) - the corner
 * dragged from is one corner of the ellipse's bounding box, the corner
 * dragged to is the opposite one.
 */
export default class Oval {
  /** @param {string} color */
  constructor(color) {
    this.color = color;
    this.startPosition = {x: -1, y: -1};
    this.dragging = false;
  }

  /** @return {void} */
  handlePointerUp() {
    this.dragging = false;
  }

  /**
   * @param {{x: number, y: number}} position
   * @param {Object} editor
   * @return {void}
   */
  handlePointerDown(position, editor) {
    this.dragging = true;
    this.startPosition = position;
    editor.set([{x: position.x, y: position.y, color: this.color}]);
  }

  /**
   * @param {{x: number, y: number}} position
   * @param {Object} editor
   * @return {void}
   */
  handlePointerMove(position, editor) {
    if (!this.dragging) return;
    const endPosition = useShiftKey().value ?
      squareEndpoint(this.startPosition.x, this.startPosition.y, position.x, position.y) : position;
    const xStart = Math.min(this.startPosition.x, endPosition.x);
    const yStart = Math.min(this.startPosition.y, endPosition.y);
    const xEnd = Math.max(this.startPosition.x, endPosition.x);
    const yEnd = Math.max(this.startPosition.y, endPosition.y);

    editor.undo();
    editor.set(ellipseOutline(xStart, yStart, xEnd, yEnd, this.color));
  }
}
