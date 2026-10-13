'use strict';

import {useShiftKey} from '../hooks/shift-key';

// If Shift is held while dragging, the drag distance shrinks to a square
// (equal width/height) on whichever axis moved further, keeping the same
// direction (up/down, left/right) the drag was already going - same
// "constrain to the larger axis, preserve direction" approach line-tool.js
// uses for its 45-degree snap.
const squareEndpoint = (x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const size = Math.max(Math.abs(dx), Math.abs(dy));
  const sx = dx < 0 ? -1 : 1;
  const sy = dy < 0 ? -1 : 1;
  return {x: x0 + sx * size, y: y0 + sy * size};
};

/**
 * A rectangle-outline tool matching @curtishughes/pixel-editor's Tool
 * interface (handlePointerDown/handlePointerMove/handlePointerUp - see its
 * Pencil.js). The library ships its Rectangle tool (tools/
 * Rectangle.js), but it has no way to see keyboard state for a Shift-to-
 * square constraint (same reasoning as line-tool.js not reusing the
 * library's Line), so this is a standalone equivalent with that added.
 */
export default class Rectangle {
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

    const pixels = [];
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        if (x === xStart || x === xEnd || y === yStart || y === yEnd) {
          pixels.push({x, y, color: this.color});
        }
      }
    }
    editor.undo();
    editor.set(pixels);
  }
}
