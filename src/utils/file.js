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
