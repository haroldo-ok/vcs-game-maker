import * as Blockly from 'blockly/core';
const Dialogs = require('dialogs');

// eslint-disable-next-line new-cap
const dialogs = Dialogs();

Blockly.prompt = function(message, defaultValue, callback) {
  dialogs.prompt(message, defaultValue, callback);
};
