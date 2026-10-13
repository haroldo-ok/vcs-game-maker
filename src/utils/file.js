export const openFileDialog = (accept) => new Promise((resolve, reject) => {
  // Adapted from https://stackoverflow.com/a/72664569/679240

  const input = document.createElement('input');
  input.type = 'file';
  input.setAttribute('accept', accept);
  input.onchange = function(event) {
    resolve(this.files[0]);
  };
  input.click();
});

// Same as openFileDialog above, but lets the user pick more than one file at
// once (e.g. PlayerEditor.vue's "Import animation frames") - resolves
// with a plain array (not the native FileList this.files itself is), so
// every caller can use ordinary Array methods (map/sort/etc.) on it directly
// without an Array.from().
export const openFileDialogMultiple = (accept) => new Promise((resolve, reject) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.setAttribute('accept', accept);
  input.onchange = function(event) {
    resolve(Array.from(this.files));
  };
  input.click();
});

// Orders a batch of imported image files into animation/card frame order -
// by the number embedded in each filename (e.g. "walk1.png"/"walk2.png",
// "frame_03.png") when EVERY file in the batch has one, since that's a much
// more reliable signal of the intended frame order than however the OS/
// browser's file picker happened to report them. Falls back to plain
// selection order (the array as given) the moment even one filename has no
// extractable number at all - a partial/inconsistent numbering scheme is
// more likely to produce a confusing, wrong-looking order than just trusting
// the order the user actually clicked them in. Shared by PlayerEditor.vue's
// 's "Import animation frames" and TitleScreenEditor.vue's "Import
// card frames".
const trailingNumberInFilename = (filename) => {
  const match = filename.match(/(\d+)(?!.*\d)/);
  return match ? parseInt(match[1], 10) : null;
};
export const sortImportedAnimationFrameFiles = (files) => {
  const numbers = files.map((file) => trailingNumberInFilename(file.name));
  if (numbers.some((n) => n === null)) return files;
  return files
      .map((file, i) => ({file, number: numbers[i]}))
      .sort((a, b) => a.number - b.number)
      .map(({file}) => file);
};

export const loadImageFromFile = (file) => new Promise((resolve, reject) => {
  // Adapted from https://stackoverflow.com/a/33112602/679240
  const reader = new FileReader();
  // load to image to get it's width/height
  const img = new Image();
  img.onload = function() {
    resolve(img);
  };
  img.onerror = reject;
  // this is to setup loading the image
  reader.onloadend = () => {
    img.src = reader.result;
  };
  // this is to read the file
  reader.readAsDataURL(file);
});

// Strips characters Windows/macOS/Linux all disallow (or treat specially) in a
// filename, and collapses whitespace to single underscores - a title like
// "My Cool Game!" becomes "My_Cool_Game", safe to use as a filename as it is.
export const sanitizeForFilename = (text) =>
  String(text).trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');
