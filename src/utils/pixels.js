export const playfieldToMatrix = (text) => text.trim().split('\n')
    .map((line) => line.trim().split('').map((ch) => ch === 'X' ? 1 : 0));

export const matrixToPlayfield = (matrix) => matrix
    .map((line) => line.map((pixel) => pixel ? 'X' : '.').join(''))
    .join('\n').trim();

// Nearest-neighbor row scaling - maps each row of the NEW height back to
// whichever row of the OLD pixels it's closest to. Only ever resamples
// ROWS (height), never columns/width - every caller of this (frame resize
// in PixelEditor.vue/PlayerEditor.vue) only ever changes a sprite's row
// count, its column count is fixed.
// When imported frames replace a graphic's frames, they can keep the colors the old frames had: frame N takes
// frame N's row colors and picture background box (its blocks and color), the last old frame's for any frame
// past the old count. A frame of another height gets the row colors cut or padded with their last color.
export const carryOverFrameColors = (oldFrames, newFrames) => newFrames.map((frame, index) => {
  const source = oldFrames[Math.min(index, oldFrames.length - 1)];
  if (!source) return frame;
  const carried = {...frame};
  if (source.rowColors && source.rowColors.length) {
    const height = frame.pixels.length;
    carried.rowColors = Array.from({length: height},
        (_, row) => source.rowColors[Math.min(row, source.rowColors.length - 1)]);
  }
  ['pf1', 'pf2', 'background'].forEach((field) => {
    if (source[field] !== undefined) carried[field] = source[field];
  });
  return carried;
});

export const scalePixelMatrixHeight = (pixels, newHeight, width) => {
  const oldHeight = pixels.length;
  if (!oldHeight) return new Array(newHeight).fill(0).map(() => new Array(width).fill(0));
  return new Array(newHeight).fill(0).map((_, newY) => {
    const oldY = Math.min(oldHeight - 1, Math.floor((newY + 0.5) * oldHeight / newHeight));
    return pixels[oldY].slice();
  });
};

// The per-row colors that go with a scaled pixel matrix: the same
// nearest-neighbor mapping as scalePixelMatrixHeight, so every scaled row
// keeps the color of the row it was copied from. oldHeight is the row count
// of the pixels before scaling (rowColors can be shorter or missing).
export const scaleRowColors = (rowColors, oldHeight, newHeight) => {
  if (!rowColors || !oldHeight) return rowColors;
  return new Array(newHeight).fill(0).map((_, newY) =>
    rowColors[Math.min(oldHeight - 1, Math.floor((newY + 0.5) * oldHeight / newHeight))]);
};

// Shared by every "resize this pixel matrix to a new height" call site
// (PixelEditor.vue's  single-frame resize, and PlayerEditor.vue's
// "apply to every frame in this animation" option) so the two never drift
// apart on what "resize" actually means. scaleContents picks between the
// two available strategies: nearest-neighbor resampling the existing
// content to fit (scalePixelMatrixHeight above), or the plain default -
// crop extra rows off the bottom, or pad new blank rows on - which every
// frame resize used before scaling was ever an option, and stays the
// default (see PixelEditor.vue's "off by default" reasoning) so an
// occasional resize doesn't silently start distorting artwork the user
// only meant to crop or extend.
export const resizePixelMatrixHeight = (pixels, newHeight, width, scaleContents) => {
  if (scaleContents) return scalePixelMatrixHeight(pixels, newHeight, width);
  const resized = pixels.slice(0, newHeight);
  for (let rowNumber = 0; rowNumber < newHeight; rowNumber++) {
    if (!resized[rowNumber]) resized[rowNumber] = new Array(width).fill(0);
  }
  return resized;
};
