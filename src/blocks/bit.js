import * as Blockly from 'blockly/core';

import {BIT_ICON} from './icon';

const BIT_OPTIONS = [...Array(8).keys()].map((n) => [`${n}`, `${n}`]);

// Built-in batari Basic variables that are worth addressing bit by bit. These
// are plain names, unlike the user's own variables, which are listed by id.
const BUILT_IN_VARIABLES = [
  'player0size',
  'player1size',
  'player0frame',
  'player1frame',
  'framecounter',
  'CTRLPF',
  'NUSIZ0',
  'NUSIZ1',
  'SWCHA',
  'SWCHB',
].map((name) => [name, name]);

// A block in the toolbox flyout belongs to the flyout's own workspace, which
// has no variables of its own.
const workspaceOf = (field) => {
  const block = field.getSourceBlock();
  if (!block || !block.workspace) return null;
  const workspace = block.workspace;
  return workspace.isFlyout ? workspace.targetWorkspace : workspace;
};

/**
 * Lists the variables offered by the bit blocks' dropdown. Blockly calls this
 * with `this` bound to the field, and re-evaluates it every time the dropdown
 * opens, so variables the user creates later show up without the block needing
 * to be rebuilt.
 * @return {!Array<!Array<string>>} Pairs of label and value.
 */
function variableOptions() {
  // eslint-disable-next-line no-invalid-this
  const workspace = workspaceOf(this);
  const userVariables = workspace ?
    workspace.getAllVariables().map((variable) => [variable.name, variable.getId()]) :
    [];
  return [...userVariables, ...BUILT_IN_VARIABLES];
}

const buildVariableField = () => new Blockly.FieldDropdown(variableOptions);

// Resolves the selection to one of the user's variables, or null when a
// built-in batari Basic name is selected.
const selectedVariable = (block) => {
  const value = block.getFieldValue('VAR');
  return block.workspace && block.workspace.getVariableById ?
    block.workspace.getVariableById(value) : null;
};

Blockly.Blocks['bit_get'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BIT_ICON} bit`)
        .appendField(new Blockly.FieldDropdown(BIT_OPTIONS), 'BIT')
        .appendField('of')
        .appendField(buildVariableField(), 'VAR');
    this.setOutput(true, 'Boolean');
    this.setColour('purple');
    this.setTooltip('Checks if a single bit of a variable is set (1) or clear (0).');
  },
  // The dropdown is not a variable field, so without this Blockly treats the
  // variable as unused: it would be dropped when the workspace is serialised,
  // never get declared, and not be tracked on rename or delete.
  getVarModels: function() {
    const variable = selectedVariable(this);
    return variable ? [variable] : [];
  },
};

Blockly.Blocks['bit_set'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck(['Boolean', 'Number'])
        .appendField(`${BIT_ICON} set bit`)
        .appendField(new Blockly.FieldDropdown(BIT_OPTIONS), 'BIT')
        .appendField('of')
        .appendField(buildVariableField(), 'VAR')
        .appendField('to');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('purple');
    this.setTooltip('Sets a single bit of a variable. Accepts true/false or 1/0.');
  },
  // See bit_get.
  getVarModels: function() {
    const variable = selectedVariable(this);
    return variable ? [variable] : [];
  },
};
