'use strict';

import * as Blockly from 'blockly/core';

// Distinct from subroutine.js's SUBROUTINE_COLOR (teal) so the two families
// read as related-but-different at a glance - functions return a value and
// take arguments, subroutines don't.
const FUNCTION_COLOR = 'rgb(0, 151, 167)';

const MAX_FUNCTION_ARGS = 6;

// Block for defining a native batari Basic "function" - a real,
// value-returning callable (see generators/bbasic/function.js for the exact
// "function <name> ... return <expr>" syntax this compiles to), distinct
// from this app's own subroutine_define/subroutine_call (gosub/return, no
// value). Its body isn't emitted where it's dropped on the canvas - like a
// subroutine, it's collected and spliced into its own never-fallen-into spot
// in the template, with "function_call" blocks elsewhere reaching it by
// using it directly as a value expression.
Blockly.Blocks['function_define'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Function')
        .appendField(new Blockly.FieldTextInput('myFunction'), 'NAME');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(FUNCTION_COLOR);
    this.setTooltip('Defines a named, reusable function that returns a value. Read its ' +
      'arguments with "Function argument" blocks, and end with a "Return" block. Call it ' +
      'from anywhere with a "Call function" block used as a number.');
  },
};

// Reads one of this function's own up-to-6 arguments, passed positionally by
// whichever "Call function" block invoked it (argument 1 -> the first value
// plugged into the call, and so on) - see generators/bbasic/function.js for
// why this only ever needs to emit a literal "temp1".."temp6": that's the
// real language's own fixed calling convention, not something this app
// invents.
Blockly.Blocks['function_param_get'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Function argument')
        .appendField(new Blockly.FieldDropdown(
            Array.from({length: MAX_FUNCTION_ARGS}, (_, i) => [`${i + 1}`, `${i + 1}`]),
        ), 'INDEX');
    this.setOutput(true, 'Number');
    this.setColour(FUNCTION_COLOR);
    this.setTooltip('Reads one of this function\'s own arguments - only meaningful inside ' +
      'a "Function" block\'s own body, in a position a "Call function" block actually ' +
      'plugged something into.');
  },
};

// Exits the enclosing function immediately with a value - only meaningful
// inside a "Function" block's own body (a project could still drop one
// elsewhere; it would just compile to a bare "return value" wherever that
// happens to land, same as any other misplaced statement in this app).
Blockly.Blocks['function_return'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .appendField('Return');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(FUNCTION_COLOR);
    this.setTooltip('Ends the enclosing function immediately, with this value as its ' +
      'result. A function can have several of these on different branches (e.g. inside ' +
      'an if/else), same as batari Basic\'s own "function" command.');
  },
};

/**
 * Every function name currently defined on the given workspace, deduped.
 * @param {?Blockly.Workspace} workspace
 * @return {!Array<string>}
 */
function definedFunctionNames(workspace) {
  if (!workspace) return [];
  return [...new Set(
      workspace.getBlocksByType('function_define', false)
          .map((defineBlock) => defineBlock.getFieldValue('NAME'))
          .filter(Boolean),
  )];
}

/**
 * Lists every function currently defined on the same workspace as the
 * dropdown's own block - same reasoning as subroutine.js's own
 * buildSubroutineOptions.
 * @return {!Array<!Array<string>>} Pairs of label and value.
 */
function buildFunctionOptions() {
  // eslint-disable-next-line no-invalid-this
  const block = this.getSourceBlock && this.getSourceBlock();
  const names = definedFunctionNames(block && block.workspace);
  if (!names.length) return [['No functions defined', '']];
  return names.map((name) => [name, name]);
}

// Same FieldDropdown getOptions(useCache) cache-staleness bug (and same
// fix) as subroutine.js's own setSubroutineDropdownValue - see its comment
// for the full explanation.
/**
 * @param {!Blockly.Field} field
 * @param {string} newValue
 */
function setFunctionDropdownValue(field, newValue) {
  field.getOptions();
  field.setValue(newValue);
}

/**
 * Same flyout-drag staleness problem (and same fix) as subroutine.js's own
 * fixSubroutineCallNames - see its comment for the full explanation.
 * @param {?Blockly.Workspace} workspace
 */
function fixFunctionCallNames(workspace) {
  const names = definedFunctionNames(workspace);
  if (!names.length) return;
  workspace.getBlocksByType('function_call', false).forEach((callBlock) => {
    const current = callBlock.getFieldValue('NAME');
    if (names.includes(current)) return;
    const field = callBlock.getField('NAME');
    if (field) setFunctionDropdownValue(field, names[0]);
  });
}

/**
 * Same rename-cascade need (and same fix) as subroutine.js's own
 * cascadeSubroutineRename - see its comment for the full explanation.
 * @param {?Blockly.Workspace} workspace
 * @param {!Blockly.Events.Abstract} event
 */
function cascadeFunctionRename(workspace, event) {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) return;
  if (event.element !== 'field' || event.name !== 'NAME') return;
  if (!event.oldValue || !event.newValue || event.oldValue === event.newValue) return;
  const changedBlock = workspace.getBlockById(event.blockId);
  if (!changedBlock || changedBlock.type !== 'function_define') return;
  workspace.getBlocksByType('function_call', false).forEach((callBlock) => {
    if (callBlock.getFieldValue('NAME') !== event.oldValue) return;
    const field = callBlock.getField('NAME');
    if (field) setFunctionDropdownValue(field, event.newValue);
  });
}

/**
 * @param {?Blockly.Workspace} workspace
 */
function ensureFunctionCallListener(workspace) {
  if (!workspace || workspace.isFlyout || workspace.functionCallListener_) return;
  workspace.functionCallListener_ = true;
  workspace.addChangeListener((event) => {
    cascadeFunctionRename(workspace, event);
    fixFunctionCallNames(workspace);
  });
  // Same saved-project load-order gap (and same fix) as subroutine.js's own
  // ensureSubroutineCallListener - see its comment for the full explanation.
  setTimeout(() => fixFunctionCallNames(workspace), 0);
}

// Shared by function_call and function_call_statement below - the dropdown
// and up to MAX_FUNCTION_ARGS argument inputs are identical either way, only
// how the block connects to its surroundings (a value vs. a statement)
// differs.
const appendFunctionCallFields = (block) => {
  block.appendDummyInput()
      .appendField('Call function')
      .appendField(new Blockly.FieldDropdown(buildFunctionOptions), 'NAME');
  for (let i = 1; i <= MAX_FUNCTION_ARGS; i++) {
    block.appendValueInput(`ARG${i}`).setCheck('Number');
  }
  block.setInputsInline(true);
  block.setColour(FUNCTION_COLOR);
  if (block.workspace) ensureFunctionCallListener(block.workspace);
};

// Block for calling a function defined with "function_define" - used as a
// NUMBER, not a statement (see generators/bbasic/function.js: this compiles
// straight to "name(arg1, arg2, ...)", batari Basic's own real function-call
// syntax, usable anywhere a number can go). Up to MAX_FUNCTION_ARGS value
// inputs, each optional - only the ones actually connected are passed (see
// the generator), matching the real language's own "extra/missing arguments
// aren't checked" behavior rather than silently inventing zeros for unfilled
// slots. See function_call_statement below for a version that drops straight
// into an event's own statement stack instead, for a function whose return
// value doesn't matter at a particular call site.
Blockly.Blocks['function_call'] = {
  init: function() {
    appendFunctionCallFields(this);
    this.setOutput(true, 'Number');
    this.setTooltip('Calls a function defined with a "Function" block and returns its ' +
      'result - plug in as many of the argument slots as that function actually reads ' +
      '(up to 6), matching them left to right against its own "Function argument" blocks.');
  },
};

// Same call as function_call above, but a standalone STATEMENT - drops
// straight into an event's own statement stack rather than needing to be
// plugged into a value input, for calling a function purely for its side
// effects (e.g. it sets some variables along the way) when the caller
// doesn't care what it returns. The real returned value is simply discarded
// (see generators/bbasic/function.js) rather than left unread in some
// awkward way batari Basic itself doesn't actually support - the language's
// own function calls are still real value expressions under the hood, this
// block just doesn't ask for anywhere to put the result.
Blockly.Blocks['function_call_statement'] = {
  init: function() {
    appendFunctionCallFields(this);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Calls a function defined with a "Function" block, without needing to ' +
      'be plugged into anything - use this when you don\'t care what the function returns, ' +
      'just that it runs.');
  },
};

export {MAX_FUNCTION_ARGS};
