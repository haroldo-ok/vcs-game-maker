'use strict';

/**
 * An eyedropper matching @curtishughes/pixel-editor's Tool interface (see bucket-tool.js): a click draws nothing and
 * reports the clicked cell, so the caller can take that row's color as the drawing color.
 */
export default class Eyedropper {
  /** @param {function({x: number, y: number})} onPick */
  constructor(onPick) {
    this.onPick = onPick;
  }

  /** No-op - nothing to finish after a click. */
  handlePointerUp() {}
  /** No-op - dragging picks nothing more. */
  handlePointerMove() {}

  /** @param {{x: number, y: number}} position */
  handlePointerDown(position) {
    this.onPick({x: position.x, y: position.y});
  }
}
