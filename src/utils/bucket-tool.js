'use strict';

/**
 * A paint bucket tool matching @curtishughes/pixel-editor's Tool interface
 * (handlePointerDown/handlePointerMove/handlePointerUp - see its
 * Pencil.js) - the library ships Pencil/Line/Rectangle but no flood fill, so
 * this fills the gap the same way a caller would build any other custom
 * tool for it: a plain class with that same shape, constructed with a fixed
 * paint color like `new Pencil(color)`.
 */
export default class Bucket {
  /** @param {string} color */
  constructor(color) {
    this.color = color;
  }

  /** No-op - a fill has nothing left to do once the click that triggered it ends. */
  handlePointerUp() {}
  /** No-op - unlike Pencil, a fill doesn't paint again as the pointer drags. */
  handlePointerMove() {}

  // A single click fills every cell 4-connected to the clicked one that
  // shares its exact starting color - the standard flood-fill span. Editor
  // cells are never actually "empty" here (PixelEditor.vue's setPixels
  // always writes a real color, fgColor/rowColor or bgColor, never leaves a
  // cell unset - see its comment), so comparing against the clicked
  // cell's color (rather than any special "background" sentinel) is
  // exactly right whether the click starts on drawn art or blank canvas.
  /**
   * @param {{x: number, y: number}} position
   * @param {Object} editor
   * @return {void}
   */
  handlePointerDown(position, editor) {
    const targetColor = editor.get(position.x, position.y).color;
    if (targetColor === this.color) return;

    const width = editor.width;
    const height = editor.height;
    const visited = new Set();
    const fillPixels = [];
    const stack = [[position.x, position.y]];

    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= width || y >= height) continue;
      const key = x + y * width;
      if (visited.has(key)) continue;
      visited.add(key);
      if (editor.get(x, y).color !== targetColor) continue;

      fillPixels.push({x, y, color: this.color});
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    if (fillPixels.length) editor.set(fillPixels);
  }
}
