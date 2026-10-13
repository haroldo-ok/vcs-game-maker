'use strict';

// Moving selected pixels up or down with the Move tool (PixelEditor.vue's 'move-rows' event) takes
// the colors of the rows they were on along with them, on the graphics that have a color for each
// row (backgrounds with row colors, sprite frames, title screen cards).

/**
 * The row colors after the colors of `rows` have moved `dy` rows (down is positive). Each of those
 * rows' color goes to the row `dy` below it, and the colors it lands on go to the rows it left,
 * in order, so no color is lost - moving a block of rows down one row shifts the colors down one
 * and the color that was below the block ends up on top of it.
 * @param {!Array<*>} base The row colors before the move.
 * @param {!Array<number>} rows The rows the moved pixels were on.
 * @param {number} dy How many rows they moved.
 * @return {!Array<*>} A new array of row colors.
 */
export const rowColorsAfterMove = (base, rows, dy) => {
  const next = base.slice();
  if (!dy) return next;
  const sources = [...new Set(rows)].filter((row) => row >= 0 && row < base.length).sort((a, b) => a - b);
  // A row whose destination is off the end stays where it is (its pixels are dropped).
  const moving = sources.filter((row) => row + dy >= 0 && row + dy < base.length);
  const sourceSet = new Set(moving);
  const destinations = moving.map((row) => row + dy);
  const destinationSet = new Set(destinations);
  const displaced = destinations.filter((row) => !sourceSet.has(row));
  const vacated = moving.filter((row) => !destinationSet.has(row));
  moving.forEach((row) => {
    next[row + dy] = base[row];
  });
  displaced.sort((a, b) => a - b);
  vacated.sort((a, b) => a - b);
  vacated.forEach((row, index) => {
    if (index < displaced.length) next[row] = base[displaced[index]];
  });
  return next;
};

// The colors a graphic had when its current Move drag started: every tick of a drag works out
// the colors from those, not from the previous tick, so dragging back and forth leaves nothing
// behind. Keyed by the graphic's object (a background, a frame) so a drag in one editor can't
// disturb another's.
const dragStarts = new WeakMap();

/**
 * Applies a 'move-rows' event from PixelEditor.vue to a graphic's row colors.
 * @param {!Object} owner The object holding `rowColors` (a background, a frame).
 * @param {{rows: !Array<number>, dy: number, start: (boolean|undefined)}} move The event: `start`
 *     on the first event of a drag (or of an undo/redo), which takes a fresh copy of the colors.
 * @return {?Array<*>} The new row colors, or null when the graphic has none.
 */
export const rowColorsForMove = (owner, move) => {
  if (!owner || !Array.isArray(owner.rowColors) || !owner.rowColors.length) return null;
  if (move.start || !dragStarts.has(owner)) dragStarts.set(owner, owner.rowColors.slice());
  return rowColorsAfterMove(dragStarts.get(owner), move.rows, move.dy);
};
