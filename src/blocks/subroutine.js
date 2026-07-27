'use strict';

import * as Blockly from 'blockly/core';

const SUBROUTINE_COLOR = 'rgb(39, 176, 176)';

// Block for defining a named, reusable subroutine (bBasic gosub/return) -
// its body isn't emitted where it's dropped on the canvas (see
// generators/bbasic/subroutine.js): like an event, it's collected and
// spliced into its own safe, never-fallen-into spot in the template, with
// "subroutine_call" blocks elsewhere reaching it via a bank-tagged "gosub".
Blockly.Blocks['subroutine_define'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Subroutine')
        .appendField(new Blockly.FieldTextInput('mySubroutine'), 'NAME');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SUBROUTINE_COLOR);
    this.setTooltip('Defines a named, reusable block of code. Call it from anywhere ' +
      'with a "Call" block.');
  },
};

/**
 * Lists every subroutine currently defined on the same workspace as the
 * dropdown's own block, so renamed/added/deleted subroutines show up the next
 * time the dropdown opens - no separate storage needed, since the definition
 * blocks living on the canvas already are the source of truth. Blockly calls
 * this with `this` bound to the field.
 * @return {!Array<!Array<string>>} Pairs of label and value.
 */
function buildSubroutineOptions() {
  // eslint-disable-next-line no-invalid-this
  const block = this.getSourceBlock && this.getSourceBlock();
  const workspace = block && block.workspace;
  if (!workspace) return [['No subroutines defined', '']];
  const names = [...new Set(
      workspace.getBlocksByType('subroutine_define', false)
          .map((defineBlock) => defineBlock.getFieldValue('NAME'))
          .filter(Boolean),
  )];
  if (!names.length) return [['No subroutines defined', '']];
  return names.map((name) => [name, name]);
}

// Block for calling a named subroutine defined with "subroutine_define".
Blockly.Blocks['subroutine_call'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Call')
        .appendField(new Blockly.FieldDropdown(buildSubroutineOptions), 'NAME');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SUBROUTINE_COLOR);
    this.setTooltip('Runs a subroutine defined with a "Subroutine" block, then continues ' +
      'after this block once it finishes.');
  },
};
