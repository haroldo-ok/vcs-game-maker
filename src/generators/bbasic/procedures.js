/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for procedure blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.BBasic.procedures');

goog.require('Blockly.BBasic');


Blockly.BBasic['procedures_defreturn'] = function(block) {
  // Define a procedure with a return value.
  const funcName = Blockly.BBasic.nameDB_.getName(
      block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
  let xfix1 = '';
  if (Blockly.BBasic.STATEMENT_PREFIX) {
    xfix1 += Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_PREFIX,
        block);
  }
  if (Blockly.BBasic.STATEMENT_SUFFIX) {
    xfix1 += Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_SUFFIX,
        block);
  }
  if (xfix1) {
    xfix1 = Blockly.BBasic.prefixLines(xfix1, Blockly.BBasic.INDENT);
  }
  let loopTrap = '';
  if (Blockly.BBasic.INFINITE_LOOP_TRAP) {
    loopTrap = Blockly.BBasic.prefixLines(
        Blockly.BBasic.injectId(Blockly.BBasic.INFINITE_LOOP_TRAP,
            block), Blockly.BBasic.INDENT);
  }
  const branch = Blockly.BBasic.statementToCode(block, 'STACK');
  let returnValue = Blockly.BBasic.valueToCode(block, 'RETURN',
      Blockly.BBasic.ORDER_NONE) || '';
  let xfix2 = '';
  if (branch && returnValue) {
    // After executing the function body, revisit this block for the return.
    xfix2 = xfix1;
  }
  if (returnValue) {
    returnValue = Blockly.BBasic.INDENT + 'return ' + returnValue + ';\n';
  }
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = Blockly.BBasic.nameDB_.getName(variables[i],
        Blockly.VARIABLE_CATEGORY_NAME);
  }
  let code = 'function ' + funcName + '(' + args.join(', ') + ') {\n' +
      xfix1 + loopTrap + branch + xfix2 + returnValue + '}';
  code = Blockly.BBasic.scrub_(block, code);
  // Add % so as not to collide with helper functions in definitions list.
  Blockly.BBasic.definitions_['%' + funcName] = code;
  return null;
};

// Defining a procedure without a return value uses the same generator as
// a procedure with a return value.
Blockly.BBasic['procedures_defnoreturn'] =
    Blockly.BBasic['procedures_defreturn'];

Blockly.BBasic['procedures_callreturn'] = function(block) {
  // Call a procedure with a return value.
  const funcName = Blockly.BBasic.nameDB_.getName(
      block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
  const args = [];
  const variables = block.getVars();
  for (let i = 0; i < variables.length; i++) {
    args[i] = Blockly.BBasic.valueToCode(block, 'ARG' + i,
        Blockly.BBasic.ORDER_NONE) || 'null';
  }
  const code = funcName + '(' + args.join(', ') + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['procedures_callnoreturn'] = function(block) {
  // Call a procedure with no return value.
  // Generated code is for a function call as a statement is the same as a
  // function call as a value, with the addition of line ending.
  const tuple = Blockly.BBasic['procedures_callreturn'](block);
  return tuple[0] + ';\n';
};

Blockly.BBasic['procedures_ifreturn'] = function(block) {
  // Conditionally return value from a procedure.
  const condition = Blockly.BBasic.valueToCode(block, 'CONDITION',
      Blockly.BBasic.ORDER_NONE) || 'false';
  let code = 'if (' + condition + ') {\n';
  if (Blockly.BBasic.STATEMENT_SUFFIX) {
    // Inject any statement suffix here since the regular one at the end
    // will not get executed if the return is triggered.
    code += Blockly.BBasic.prefixLines(
        Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_SUFFIX, block),
        Blockly.BBasic.INDENT);
  }
  if (block.hasReturnValue_) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_NONE) || 'null';
    code += Blockly.BBasic.INDENT + 'return ' + value + ';\n';
  } else {
    code += Blockly.BBasic.INDENT + 'return;\n';
  }
  code += '}\n';
  return code;
};
