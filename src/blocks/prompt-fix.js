import * as Blockly from 'blockly/core';

Blockly.prompt = function(message, defaultValue, callback) {
  callback(prompt(message + 'ABC-AAAA!!!', defaultValue));
};
