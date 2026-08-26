import * as Blockly from 'blockly/core';

import {BIT_ICON} from './icon';

export const BIT_OPTIONS = [...Array(8).keys()].map((n) => [`${n}`, `${n}`]);

// Built-in batari Basic variables worth reading/writing directly - plain
// names, unlike the user's own variables, which are listed by id. Shared
// between the per-bit blocks below (BUILT_IN_VARIABLES) and
// system_variable_get further down (SYSTEM_VARIABLE_OPTIONS, same list,
// already in dropdown-option [label, value] shape) - reading the WHOLE
// byte only makes sense for the built-in names, not the user's own
// variables (those already have a plain Blockly "variables_get" block for
// that), so this doesn't reuse variableOptions()'s combined list below.
export const SYSTEM_VARIABLE_OPTIONS = [
  'player0size',
  'player1size',
  'player0frame',
  'player1frame',
  'framecounter',
  // "repeatcounter" (the "Repeat X times" block's own for-loop variable -
  // see REPEAT_COUNTER_VAR_NAME in generators/bbasic/loops.js) deliberately
  // isn't listed here - unlike every name above (all unconditionally
  // dimmed/real hardware registers), it's only ever declared for a project
  // that actually has a "Repeat" block somewhere, so exposing it in this
  // generic "read a built-in variable" picker would let a project with none
  // reference an undeclared symbol and fail to compile.
  'CTRLPF',
  'NUSIZ0',
  'NUSIZ1',
  'SWCHA',
  'SWCHB',
].map((name) => [name, name]);
const BUILT_IN_VARIABLES = SYSTEM_VARIABLE_OPTIONS;

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

// The VAR field stores the variable's ID (see variableOptions), so a rename
// elsewhere doesn't break the reference - but FieldDropdown only re-runs its
// options generator (and so only re-reads the variable's current name) when
// its cache is invalidated, which a plain rename never does on its own: the
// field keeps showing whatever label was cached from the last time its
// dropdown opened, stale until the user happens to click it again.
// getOptions() (no cache arg) has to run BEFORE setValue(), same gotcha
// documented in subroutine.js's own setSubroutineDropdownValue - setValue's
// validation reads the cache, so a rename without a preceding fresh
// getOptions() call would just re-validate against the same stale label.
/**
 * @param {!Blockly.Field} field
 * @param {string} value
 */
function refreshVariableDropdownValue(field, value) {
  field.getOptions();
  field.setValue(value);
}

/**
 * @param {?Blockly.Workspace} workspace
 */
function ensureBitVariableRenameListener(workspace) {
  if (!workspace || workspace.isFlyout || workspace.bitVariableRenameListener_) return;
  workspace.bitVariableRenameListener_ = true;
  workspace.addChangeListener((event) => {
    if (event.type !== Blockly.Events.VAR_RENAME) return;
    [...workspace.getBlocksByType('bit_get', false), ...workspace.getBlocksByType('bit_set', false)]
        .forEach((block) => {
          const field = block.getField('VAR');
          if (field && field.getValue() === event.varId) {
            refreshVariableDropdownValue(field, event.varId);
          }
        });
  });
}

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
    if (this.workspace) ensureBitVariableRenameListener(this.workspace);
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
    if (this.workspace) ensureBitVariableRenameListener(this.workspace);
  },
  // See bit_get.
  getVarModels: function() {
    const variable = selectedVariable(this);
    return variable ? [variable] : [];
  },
};

// Reads any of the built-in batari Basic variables (see
// SYSTEM_VARIABLE_OPTIONS above) as a whole byte, not one bit at a time
// like bit_get.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'system_variable_get',
    'message0': `${BIT_ICON} %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SYSTEM_VARIABLE_OPTIONS,
      },
    ],
    'output': 'Number',
    'colour': 'purple',
    'tooltip': 'Reads the current value of a built-in batari Basic variable, e.g. ' +
      '"framecounter" (how many frames have passed since power-on) - useful anywhere a ' +
      'real, changing value is needed, like seeding the random number generator.',
  },
]);
