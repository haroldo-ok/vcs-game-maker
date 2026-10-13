'use strict';

/**
 * Drags the CURRENT selection's pixels around the canvas - a Tool matching
 * @curtishughes/pixel-editor's interface (handlePointerDown/
 * handlePointerMove/handlePointerUp - see its Pencil.js), but reading a
 * live selection (a Set of "x,y" keys, see selection-tools.js) rather than
 * a fixed color. A click that doesn't land on an already-selected cell is a
 * no-op - there's nothing to drag from empty space, unlike Pencil/Fill/etc.
 * which always act on wherever was clicked.
 */
export default class Move {
  /**
   * @param {Function} getSelection () => Set<string>|null - the CURRENT
   *     selection, read fresh on every pointerdown (not captured once at
   *     construction, since the selection tools reassign it live).
   * @param {Function} setSelection (Set<string>) => void - moves the
   *     selection itself to follow the dragged pixels, so the visual
   *     highlight (and a second drag, without re-selecting) tracks
   *     wherever the content actually ended up.
   * @param {string} bgColor - what a vacated cell becomes once its pixel
   *     has moved away from it.
   * @param {Function=} onRowsMove ({rows, dy, start, end}) => void - told which rows the
   *     dragged pixels came from and how many rows they have moved (down is positive), so a
   *     graphic with a color for each row can move those rows' colors with them. `start` marks
   *     the first report of a drag and `end` its release.
   */
  constructor(getSelection, setSelection, bgColor, onRowsMove) {
    this.getSelection = getSelection;
    this.setSelection = setSelection;
    this.bgColor = bgColor;
    this.onRowsMove = onRowsMove;
    this.dragging = false;
  }

  /** @return {void} */
  handlePointerUp() {
    if (this.dragging && this.onRowsMove) this.onRowsMove({end: true});
    this.dragging = false;
  }

  /**
   * @param {{x: number, y: number}} position
   * @param {Object} editor
   * @return {void}
   */
  handlePointerDown(position, editor) {
    const selection = this.getSelection();
    if (!selection || !selection.has(`${position.x},${position.y}`)) return;
    this.dragging = true;
    this.startPosition = position;
    // Captured once, up front - every subsequent move re-derives BOTH the
    // "clear" and "draw" pixel sets from this same original snapshot (never
    // from wherever the selection/content currently sits mid-drag), so
    // dragging back and forth can't accumulate rounding/overlap artifacts.
    // Filtered to actually-drawn cells only (color !== bgColor) - a
    // marquee selection (especially CircleSelect/PolygonSelect) usually
    // covers plenty of empty background cells alongside the real content,
    // and dragging those along used to stamp bgColor over whatever the
    // destination already had - confirmed as a real reported bug (moving a
    // small shape wiped out unrelated pixels it merely passed near).
    this.snapshot = [...selection].map((key) => {
      const [x, y] = key.split(',').map(Number);
      return {x, y, color: editor.get(x, y).color};
    }).filter((cell) => cell.color !== this.bgColor);
    this.lastDelta = {dx: 0, dy: 0};
    this.firstMove = true;
    this.rows = [...new Set(this.snapshot.map((cell) => cell.y))];
    this.reportedRows = false;
  }

  /**
   * @param {number} x
   * @param {number} y
   * @param {Object} editor
   * @return {boolean}
   */
  inBounds(x, y, editor) {
    return x >= 0 && y >= 0 && x < editor.width && y < editor.height;
  }

  /**
   * @param {{x: number, y: number}} position
   * @param {Object} editor
   * @return {void}
   */
  handlePointerMove(position, editor) {
    if (!this.dragging) return;
    const dx = position.x - this.startPosition.x;
    const dy = position.y - this.startPosition.y;
    if (dx === this.lastDelta.dx && dy === this.lastDelta.dy) return;

    // Vacate wherever the LAST move tick left the content (or the
    // original spot, on the very first tick) before redrawing at the new
    // position - two passes (clear whole old footprint, then draw the
    // whole new one) rather than trying to diff cell-by-cell, so an
    // overlapping old/new region always ends up with the new content
    // winning regardless of iteration order.
    const clearPixels = this.snapshot
        .map((cell) => ({x: cell.x + this.lastDelta.dx, y: cell.y + this.lastDelta.dy, color: this.bgColor}))
        .filter((cell) => this.inBounds(cell.x, cell.y, editor));
    if (clearPixels.length) editor.set(clearPixels);

    const drawPixels = this.snapshot
        .map((cell) => ({x: cell.x + dx, y: cell.y + dy, color: cell.color}))
        .filter((cell) => this.inBounds(cell.x, cell.y, editor));
    if (drawPixels.length) editor.set(drawPixels);

    // Squashes the clear+draw pair above into one history entry, same
    // "keep a whole drag gesture to a single undo step" reasoning as
    // Pencil.js's handlePointerMove - and, from the SECOND tick
    // onward, squashes that combined entry into the PREVIOUS tick's
    // (already-squashed) entry too, so the entire drag - however many
    // ticks it took - undoes in one step. Skipped on the very first tick
    // (only the clear+draw pair squash still runs there) since there's no
    // prior entry from THIS gesture yet to merge into - handlePointerDown
    // doesn't push one the way Pencil's does.
    editor.history.squash();
    if (!this.firstMove) editor.history.squash();
    this.firstMove = false;

    this.lastDelta = {dx, dy};
    if (this.onRowsMove && (dy !== 0 || this.reportedRows)) {
      this.onRowsMove({rows: this.rows, dy, start: !this.reportedRows});
      this.reportedRows = true;
    }
    const movedSelection = new Set(
        this.snapshot
            .map((cell) => ({x: cell.x + dx, y: cell.y + dy}))
            .filter((cell) => this.inBounds(cell.x, cell.y, editor))
            .map((cell) => `${cell.x},${cell.y}`),
    );
    this.setSelection(movedSelection);
  }
}
