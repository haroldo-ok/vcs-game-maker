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
// once (e.g. PlayerEditor.vue's own "Import animation frames") - resolves
// with a plain array (not the native FileList this.files itself is), so
// every caller can use ordinary Array methods (map/sort/etc.) on it directly
// without an Array.from() of their own.
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
