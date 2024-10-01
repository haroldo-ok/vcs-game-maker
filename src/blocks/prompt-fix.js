import * as Blockly from 'blockly/core';

const smalltalk = require('smalltalk');

Blockly.prompt = function(message, defaultValue, callback) {
  smalltalk
      .prompt('Prompt', message, defaultValue)
      .then(callback)
      .catch(() => {});
};
