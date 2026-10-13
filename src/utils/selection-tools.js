'use strict';

import {useShiftKey} from '../hooks/shift-key';

// Marquee selection tools matching @curtishughes/pixel-editor's Tool
// interface (handlePointerDown/handlePointerMove/handlePointerUp - see its
// Pencil.js), but none of these ever call editor.set() - a selection
// isn't pixel data, just a set of cell coordinates the Move tool (see
// move-tool.js) later acts on. Each one is constructed with a single
// onChange(cellsSet) callback (a Set of "x,y" string keys, matching
// PixelEditor.vue's selection storage), which it calls with the
// selection so far every time that selection changes - PixelEditor.vue
// supplies a callback that assigns a NEW Set to its reactive
// "selection" data property each time (Vue 2 can't observe Set mutations
// in place, only whole-value reassignment). Also takes a getSelection
// callback - reading the CURRENT selection live at the start of a new drag
// so a new marquee, drawn while Shift is held, can be UNIONED into it
// instead of replacing it outright, matching every other image editor's
// "Shift adds to the selection" convention.

/**
 * Drag-a-box rectangular selection.
 */
export class RectangleSelect {
  /**
   * @param {Function} onChange
   * @param {Function=} getSelection () => Set<string>|null - the CURRENT
   *     selection, read fresh at the start of every drag (see this file's
   *     top comment).
   */
  constructor(onChange, getSelection) {
    this.onChange = onChange;
    this.getSelection = getSelection;
    this.startPosition = {x: -1, y: -1};
    this.dragging = false;
    this.moved = false;
    this.baseSelection = null;
  }

  // A plain click (mousedown then mouseup with no move in between) selects
  // nothing, rather than the single cell clicked - clears whatever
  // selection was already there too (unless Shift was held, in which case
  // the existing selection is left untouched rather than wiped by a no-op
  // click), matching a plain-click-to-deselect convention most marquee-
  // select tools already have.
  /** @return {void} */
  handlePointerUp() {
    this.dragging = false;
    if (!this.moved) this.onChange(this.baseSelection);
  }

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  handlePointerDown(position) {
    this.dragging = true;
    this.moved = false;
    this.startPosition = position;
    this.baseSelection = useShiftKey().value && this.getSelection ? this.getSelection() : null;
    // Selection deliberately doesn't start until an actual drag happens
    // (see handlePointerMove) - see this class's handlePointerUp.
  }

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  handlePointerMove(position) {
    if (!this.dragging) return;
    this.moved = true;
    this.updateSelection(position);
  }

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  updateSelection(position) {
    const xStart = Math.min(this.startPosition.x, position.x);
    const yStart = Math.min(this.startPosition.y, position.y);
    const xEnd = Math.max(this.startPosition.x, position.x);
    const yEnd = Math.max(this.startPosition.y, position.y);
    const cells = new Set(this.baseSelection);
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        cells.add(`${x},${y}`);
      }
    }
    this.onChange(cells);
  }
}

/**
 * Drag-a-box elliptical selection - every cell whose center falls inside
 * the ellipse inscribed in the dragged bounding box is selected (a FILLED
 * region, unlike oval-tool.js's Oval draw tool, which only outlines it).
 */
export class CircleSelect {
  /**
   * @param {Function} onChange
   * @param {Function=} getSelection - see RectangleSelect's constructor.
   */
  constructor(onChange, getSelection) {
    this.onChange = onChange;
    this.getSelection = getSelection;
    this.startPosition = {x: -1, y: -1};
    this.dragging = false;
    this.moved = false;
    this.baseSelection = null;
  }

  // Same "a plain click selects nothing (but leaves an existing Shift-held
  // selection alone)" reasoning as RectangleSelect's handlePointerUp.
  /** @return {void} */
  handlePointerUp() {
    this.dragging = false;
    if (!this.moved) this.onChange(this.baseSelection);
  }

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  handlePointerDown(position) {
    this.dragging = true;
    this.moved = false;
    this.startPosition = position;
    this.baseSelection = useShiftKey().value && this.getSelection ? this.getSelection() : null;
    // Selection deliberately doesn't start until an actual drag happens
    // (see handlePointerMove) - see this class's handlePointerUp.
  }

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  handlePointerMove(position) {
    if (!this.dragging) return;
    this.moved = true;
    this.updateSelection(position);
  }

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  updateSelection(position) {
    const xStart = Math.min(this.startPosition.x, position.x);
    const yStart = Math.min(this.startPosition.y, position.y);
    const xEnd = Math.max(this.startPosition.x, position.x);
    const yEnd = Math.max(this.startPosition.y, position.y);
    const width = xEnd - xStart + 1;
    const height = yEnd - yStart + 1;
    const cx = xStart + (width - 1) / 2;
    const cy = yStart + (height - 1) / 2;
    const rx = width / 2;
    const ry = height / 2;

    const cells = new Set(this.baseSelection);
    for (let y = yStart; y <= yEnd; y++) {
      for (let x = xStart; x <= xEnd; x++) {
        const nx = rx ? (x - cx) / rx : 0;
        const ny = ry ? (y - cy) / ry : 0;
        // A tiny epsilon past 1.0 so a cell whose center sits exactly on
        // the ellipse's edge (common at small radii, where rx/ry are
        // only 1-2 cells) doesn't get excluded by floating-point rounding.
        if (nx * nx + ny * ny <= 1.0001) cells.add(`${x},${y}`);
      }
    }
    this.onChange(cells);
  }
}

/**
 * Click-to-place-vertices polygon (lasso) selection - each click adds a
 * point; double-clicking (two clicks on the same cell within 500ms - the
 * Tool interface never gets a raw "dblclick" DOM event to key off of, so
 * this is tracked by hand) closes the shape and fills it via a standard
 * ray-casting point-in-polygon test. Previously also closed on a click near
 * the first point, which made every click double as a potential (silent)
 * close - removed so a click always just adds another vertex, with
 * double-click as the one, unambiguous close gesture. No live preview of
 * the points placed so far either (this class's onPreview callback
 * below), every click looked like it did nothing at all until a polygon
 * happened to close.
 */
export class PolygonSelect {
  /**
   * @param {Function} onChange (Set<string>) => void - the finished
   *     selection, once the polygon closes.
   * @param {Function=} onPreview (Array<{x,y}>|null) => void - the
   *     in-progress vertex list after every click, or null once the
   *     polygon closes/resets, so the caller can draw a live preview of
   *     the points placed so far.
   * @param {Function=} getSelection () => Set<string>|null - the CURRENT
   *     selection, read once at the FIRST point of a new polygon (whether
   *     Shift was held at that moment decides whether this polygon adds to
   *     it or replaces it - see this file's top comment).
   */
  constructor(onChange, onPreview, getSelection) {
    this.onChange = onChange;
    this.onPreview = onPreview;
    this.getSelection = getSelection;
    this.points = [];
    this.lastClick = null;
    this.lastClickTime = 0;
    this.baseSelection = null;
  }

  /** @return {void} */
  handlePointerUp() {}
  /** @return {void} */
  handlePointerMove() {}

  /**
   * @param {{x: number, y: number}} position
   * @return {void}
   */
  handlePointerDown(position) {
    const now = Date.now();
    const isDoubleClick = this.lastClick && this.lastClick.x === position.x &&
      this.lastClick.y === position.y && (now - this.lastClickTime) < 500;
    this.lastClick = position;
    this.lastClickTime = now;

    if (isDoubleClick && this.points.length >= 3) {
      this.closePolygon();
      return;
    }
    if (this.points.length === 0) {
      this.baseSelection = useShiftKey().value && this.getSelection ? this.getSelection() : null;
    }
    this.points.push({x: position.x, y: position.y});
    if (this.onPreview) this.onPreview([...this.points]);
  }

  /** @return {void} */
  closePolygon() {
    const cells = cellsInPolygon(this.points);
    if (this.baseSelection) {
      this.baseSelection.forEach((key) => cells.add(key));
    }
    this.onChange(cells);
    this.points = [];
    this.lastClick = null;
    this.baseSelection = null;
    if (this.onPreview) this.onPreview(null);
  }

  /**
   * Discards any in-progress polygon (points placed so far) without
   * selecting anything - used when the Escape key cancels the whole
   * selection, see PixelEditor.vue's escape handler.
   * @return {void}
   */
  cancel() {
    this.points = [];
    this.lastClick = null;
    this.baseSelection = null;
    if (this.onPreview) this.onPreview(null);
  }
}

// Ray-casting point-in-polygon test, sampled at each cell's center
// (x+0.5, y+0.5) rather than its corner, so a polygon edge running exactly
// along a cell boundary doesn't leave that row/column's inclusion
// ambiguous.
const pointInPolygon = (px, py, points) => {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const xi = points[i].x;
    const yi = points[i].y;
    const xj = points[j].x;
    const yj = points[j].y;
    const intersects = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersects) inside = !inside;
  }
  return inside;
};

const cellsInPolygon = (points) => {
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const xMin = Math.min(...xs);
  const xMax = Math.max(...xs);
  const yMin = Math.min(...ys);
  const yMax = Math.max(...ys);
  const cells = new Set();
  for (let y = yMin; y <= yMax; y++) {
    for (let x = xMin; x <= xMax; x++) {
      if (pointInPolygon(x + 0.5, y + 0.5, points)) cells.add(`${x},${y}`);
    }
  }
  return cells;
};
