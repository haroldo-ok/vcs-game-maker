import * as Blockly from 'blockly/core';

// DPC+'s 256-byte variable stack: push a variable to put its value aside, pull it back later. That lets different
// screens or subroutines reuse the same variables without losing what they held. Other kernels have no such
// stack, so there these blocks do nothing.
Blockly.Blocks['variables_push'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('push')
        .appendField(new Blockly.FieldVariable('item'), 'VAR')
        .appendField('onto the stack');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('variable_blocks');
    this.setTooltip('DPC+ only: puts the variable\'s value on the 256-byte stack, so the variable can be used for ' +
      'something else. Pull it back later, in the opposite order: the last variable pushed is the first one pulled.');
  },
};

Blockly.Blocks['variables_pull'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('pull')
        .appendField(new Blockly.FieldVariable('item'), 'VAR')
        .appendField('from the stack');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('variable_blocks');
    this.setTooltip('DPC+ only: takes the last value pushed onto the stack and puts it back in the variable. ' +
      'Variables are pulled in the opposite order they were pushed.');
  },
};

Blockly.Blocks['variables_stack_position'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('set the stack position to')
        .appendField(new Blockly.FieldNumber(255, 0, 255, 1), 'POSITION');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setStyle('variable_blocks');
    this.setTooltip('DPC+ only: moves the stack pointer to one of the stack\'s 256 places (0 is the top, 255 the ' +
      'bottom) so values can be saved and restored in any order, not just last-in first-out. It has to be a ' +
      'number: a variable is not allowed. Each push moves the pointer one place toward the top, each pull one ' +
      'place toward the bottom.');
  },
};
