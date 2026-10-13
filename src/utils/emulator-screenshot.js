// The emulator canvas is drawn at the console's pixel size (160 wide) and
// stretched to twice that width on screen, so a screenshot is written at that
// displayed shape rather than the squashed raw size, with hard pixel edges.
// Returns null when there is no picture yet.
export const captureEmulatorScreenshot = () => {
  const source = document.querySelector('#gopher2600-target-container canvas');
  if (!source || !source.width || !source.height) return null;
  const shot = document.createElement('canvas');
  // The shape the picture has on screen (4:3 in the emulator pane); twice the width when it is not shown.
  const shown = source.getBoundingClientRect();
  shot.width = shown.width && shown.height ?
    Math.round(source.height * shown.width / shown.height) : source.width * 2;
  shot.height = source.height;
  const context = shot.getContext('2d');
  context.imageSmoothingEnabled = false;
  context.drawImage(source, 0, 0, shot.width, shot.height);
  return shot;
};
