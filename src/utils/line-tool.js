'use strict';

import {useShiftKey} from '../hooks/shift-key';

// Bresenham line plot, matching @curtishughes/pixel-editor's internal
// getLine/getLineWithColor (see its tools/Line.js) byte-for-byte - not
// imported from there since that helper isn't part of the package's
// declared public API (only PixelEditor/History/PixelCollection/the tool
// classes/types are - see its index.js), so reaching into dist/utils
// directly would be relying on an internal path a dependency update could
// move or remove without warning.
const plotLine = (x0, y0, x1, y1, color) => {
  const points = [];
  const dx = x1 - x0;
  const dy = y1 - y0;
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  let eps = 0;
  const sx = dx > 0 ? 1 : -1;
  const sy = dy > 0 ? 1 : -1;
  if (adx > ady) {
    for (let x = x0, y = y0; sx < 0 ? x >= x1 : x <= x1; x += sx) {
      points.push({x, y, color});
      eps += ady;
      if (eps << 1 >= adx) { // eslint-disable-line no-bitwise
        y += sy;
        eps -= adx;
      }
    }
  } else {
    for (let x = x0, y = y0; sy < 0 ? y >= y1 : y <= y1; y += sy) {
      points.push({x, y, color});
      eps += adx;
      if (eps << 1 >= ady) { // eslint-disable-line no-bitwise
        x += sx;
        eps -= ady;
      }
    }
  }
  return points;
};

// Snaps (x1, y1) to whichever multiple of 45 degrees around (x0, y0) it's
// closest to, at the same distance the unsnapped point was - so holding
// Shift constrains the line to a perfect horizontal/vertical/diagonal
// instead of whatever exact angle the pointer happens to be at.
const snapEndpoint = (x0, y0, x1, y1) => {
  const dx = x1 - x0;
  const dy = y1 - y0;
  if (!dx && !dy) return {x: x1, y: y1};
  const step = Math.PI / 4;
  const angle = Math.round(Math.atan2(dy, dx) / step) * step;
  const length = Math.max(Math.abs(dx), Math.abs(dy));
  return {
    x: x0 + Math.round(Math.cos(angle) * length),
    y: y0 + Math.round(Math.sin(angle) * length),
  };
};

/**
 * A straight-line tool matching @curtishughes/pixel-editor's Tool interface
 * (handlePointerDown/handlePointerMove/handlePointerUp - see its
 * Pencil.js) - built as a standalone replacement for the library's
 * Line tool (rather than using that one directly) specifically to add the
 * Shift-to-snap-to-45-degrees behavior, which needs live keyboard state
 * (see hooks/shift-key.js) the library's tool interface has no way to pass
 * through by itself.
 */
export default class Line {
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

  // Same "undo the previous preview, redraw the full line to the new
  // endpoint" approach as the library's Line tool - each move replaces
  // the last preview rather than accumulating one, so dragging shows a
  // single live line instead of a trail of every intermediate position.
  /**
   * @param {{x: number, y: number}} position
   * @param {Object} editor
   * @return {void}
   */
  handlePointerMove(position, editor) {
    if (!this.dragging) return;
    const endPosition = useShiftKey().value ?
      snapEndpoint(this.startPosition.x, this.startPosition.y, position.x, position.y) : position;
    const line = plotLine(this.startPosition.x, this.startPosition.y, endPosition.x, endPosition.y, this.color);
    editor.undo();
    editor.set(line);
  }
}
