'use strict';

// 16 pixel wide sprites (DPC+ only). The hardware sprites are 8 pixels wide, so a wide animation is drawn by two of them
// side by side: the player itself shows the left half and a second sprite, a Player 2 to 9 picked automatically (see
// resolveWidePartners in generators/bbasic.js), shows the right half and follows the player's frame, position, size and
// flip. An animation is wide when its `wide` flag is set; its frames then have rows of 16 pixels.
export const HALF_WIDTH = 8;
export const WIDE_WIDTH = 16;

export const isWideAnimation = (animation) => !!(animation && animation.wide);
export const widthOfAnimation = (animation) => (isWideAnimation(animation) ? WIDE_WIDTH : HALF_WIDTH);

// The left and the right 8 pixels of a row of a wide frame (a short row is taken as empty on its right).
export const splitWideRow = (row) => ({
  left: Array.from({length: HALF_WIDTH}, (_, i) => row[i] || 0),
  right: Array.from({length: HALF_WIDTH}, (_, i) => row[HALF_WIDTH + i] || 0),
});

// A frame's rows made `width` pixels wide: wider rows get empty pixels on their right, narrower ones lose theirs.
export const resizeRowsToWidth = (pixels, width) => pixels.map((row) =>
  Array.from({length: width}, (_, i) => row[i] || 0));

// Turns an animation wide or narrow again, in place. Returns true if it changed.
export const setAnimationWide = (animation, wide) => {
  if (!animation || isWideAnimation(animation) === !!wide) return false;
  animation.wide = !!wide;
  const width = widthOfAnimation(animation);
  (animation.frames || []).forEach((frame) => {
    frame.pixels = resizeRowsToWidth(frame.pixels, width);
  });
  return true;
};

// A batari Basic sprite file (.spr): "player0:" followed by rows of %0101... up to "end", optionally "player0color:" with
// $hex colors. The rows are made 8 or 16 pixels wide (the widest row). DPC+ draws a sprite one scanline per row while
// the Sprites tab's rows are two scanlines each, so each pair of rows becomes one (a pixel is on if either was).
// Returns {pixels, width} or null when the file has no sprite rows.
export const parseSpriteFile = (text) => {
  const lines = String(text || '').split(/\r?\n/).map((line) => line.trim());
  const start = lines.findIndex((line) => /^player\d*:/i.test(line));
  if (start < 0) return null;
  const rows = [];
  for (let i = start + 1; i < lines.length && !/^end\b/i.test(lines[i]); i++) {
    if (/^%[01]+$/.test(lines[i])) rows.push(Array.from(lines[i].slice(1), (c) => Number(c)));
  }
  if (!rows.length) return null;
  const width = rows.some((row) => row.length > HALF_WIDTH) ? WIDE_WIDTH : HALF_WIDTH;
  const padded = resizeRowsToWidth(rows, width);
  const pixels = [];
  for (let i = 0; i < padded.length; i += 2) {
    const next = padded[i + 1] || padded[i];
    pixels.push(padded[i].map((on, x) => (on || next[x] ? 1 : 0)));
  }
  return {pixels, width};
};
