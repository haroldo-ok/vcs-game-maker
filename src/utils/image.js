export const createResizedCanvas = (img, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);

  return canvas;
};

// Same as createResizedCanvas above, but draws from a sub-rectangle of img
// (sx/sy/sw/sh) instead of the whole thing - used to pull one frame's
// region out of a sprite-strip image (see PlayerEditor.vue's Aseprite
// import) rather than resizing the entire strip.
export const createCroppedResizedCanvas = (img, sx, sy, sw, sh, width, height) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);

  return canvas;
};
