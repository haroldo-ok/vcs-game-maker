import * as Blockly from 'blockly/core';

const smalltalk = require('smalltalk');

// window.prompt() does not exist in Electron (it throws "prompt() is not supported"), so the dialog that asks for the name of a new
// variable has to be Blockly's own prompt hook pointed at a dialog of the page. (Assigning Blockly.prompt, which this file did before,
// no longer changes what the dialog does: Blockly 10 keeps the function in its dialog module and reads it from there.)
Blockly.dialog.setPrompt(function(message, defaultValue, callback) {
  smalltalk
      .prompt('Prompt', message, defaultValue)
      .then(callback)
      .catch(() => {});
});
