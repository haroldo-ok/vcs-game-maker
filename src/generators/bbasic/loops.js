/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for loop blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

/*
goog.provide('Blockly.BBasic.loops');

goog.require('Blockly.BBasic');
*/


export default (Blockly) => {
  Blockly.BBasic['controls_repeat_ext'] = function(block) {
  // Repeat n times.
    let repeats;
    if (block.getField('TIMES')) {
    // Internal number.
      repeats = String(Number(block.getFieldValue('TIMES')));
    } else {
    // External number.
      repeats = Blockly.BBasic.valueToCode(block, 'TIMES',
          Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    }
    let branch = Blockly.BBasic.statementToCode(block, 'DO');
    branch = Blockly.BBasic.addLoopTrap(branch, block);
    let code = '';
    /*
    const loopVar = Blockly.BBasic.nameDB_.getDistinctName(
        'count', Blockly.VARIABLE_CATEGORY_NAME);
        */
    let endVar = repeats;
    if (!repeats.match(/^\w+$/) && !Blockly.isNumber(repeats)) {
      endVar = Blockly.BBasic.nameDB_.getDistinctName(
          'repeat_end', Blockly.VARIABLE_CATEGORY_NAME);
      code += 'var ' + endVar + ' = ' + repeats + ';\n';
    }

    if (!branch.trim()) {
      branch = 'a = a';
    }

    branch = branch.replace(/\s*\n\s*/g, ' : ').trim().replace(/\s*:\s*$/g, '');
    code += 'for loopcounter = 1 to ' + endVar + ': ' +
      branch +
      ' : next\n';

    return code;
  };

  Blockly.BBasic['controls_repeat'] =
    Blockly.BBasic['controls_repeat_ext'];

  Blockly.BBasic['controls_whileUntil'] = function(block) {
  // Do while/until loop.
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelName = `_while_${blockNumber}_`;
    const startLabelName = labelName + 'start';
    const endLabelName = labelName + 'end';
    const until = block.getFieldValue('MODE') == 'UNTIL';
    let argument0 = Blockly.BBasic.valueToCode(block, 'BOOL',
      until ? Blockly.BBasic.ORDER_LOGICAL_NOT :
      Blockly.BBasic.ORDER_NONE) || 'false';
    let branch = Blockly.BBasic.statementToCode(block, 'DO');
    branch = Blockly.BBasic.addLoopTrap(branch, block); // eslint-disable-line
    if (!until) {
      argument0 = '!' + argument0; // eslint-disable-line
    }
    return '@' + startLabelName + '\n' +
      'if ' + argument0 + ' then goto ' + endLabelName + '\n' +
      branch + '\n' +
      'goto ' + startLabelName + '\n' +
      '@' + endLabelName + '\n';
  };

  Blockly.BBasic['controls_for'] = function(block) {
  // For loop.
    const variable0 = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'FROM',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argument1 = Blockly.BBasic.valueToCode(block, 'TO',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const increment = Blockly.BBasic.valueToCode(block, 'BY',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    let branch = Blockly.BBasic.statementToCode(block, 'DO');
    branch = Blockly.BBasic.addLoopTrap(branch, block);
    let code;
    if (Blockly.isNumber(argument0) && Blockly.isNumber(argument1) &&
      Blockly.isNumber(increment)) {
    // All arguments are simple numbers.
      const up = Number(argument0) <= Number(argument1);
      code = 'for (' + variable0 + ' = ' + argument0 + '; ' +
        variable0 + (up ? ' <= ' : ' >= ') + argument1 + '; ' +
        variable0;
      const step = Math.abs(Number(increment));
      if (step == 1) {
        code += up ? '++' : '--';
      } else {
        code += (up ? ' += ' : ' -= ') + step;
      }
      code += ') {\n' + branch + '}\n';
    } else {
      code = '';
      // Cache non-trivial values to variables to prevent repeated look-ups.
      let startVar = argument0;
      if (!argument0.match(/^\w+$/) && !Blockly.isNumber(argument0)) {
        startVar = Blockly.BBasic.nameDB_.getDistinctName(
            variable0 + '_start', Blockly.VARIABLE_CATEGORY_NAME);
        code += 'var ' + startVar + ' = ' + argument0 + ';\n';
      }
      let endVar = argument1;
      if (!argument1.match(/^\w+$/) && !Blockly.isNumber(argument1)) {
        endVar = Blockly.BBasic.nameDB_.getDistinctName(
            variable0 + '_end', Blockly.VARIABLE_CATEGORY_NAME);
        code += 'var ' + endVar + ' = ' + argument1 + ';\n';
      }
      // Determine loop direction at start, in case one of the bounds
      // changes during loop execution.
      const incVar = Blockly.BBasic.nameDB_.getDistinctName(
          variable0 + '_inc', Blockly.VARIABLE_CATEGORY_NAME);
      code += 'var ' + incVar + ' = ';
      if (Blockly.isNumber(increment)) {
        code += Math.abs(increment) + ';\n';
      } else {
        code += 'Math.abs(' + increment + ');\n';
      }
      code += 'if (' + startVar + ' > ' + endVar + ') {\n';
      code += Blockly.BBasic.INDENT + incVar + ' = -' + incVar + ';\n';
      code += '}\n';
      code += 'for (' + variable0 + ' = ' + startVar + '; ' +
        incVar + ' >= 0 ? ' +
        variable0 + ' <= ' + endVar + ' : ' +
        variable0 + ' >= ' + endVar + '; ' +
        variable0 + ' += ' + incVar + ') {\n' +
        branch + '}\n';
    }
    return code;
  };

  Blockly.BBasic['controls_forEach'] = function(block) {
  // For each loop.
    const variable0 = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'LIST',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '[]';
    let branch = Blockly.BBasic.statementToCode(block, 'DO');
    branch = Blockly.BBasic.addLoopTrap(branch, block);
    let code = '';
    // Cache non-trivial values to variables to prevent repeated look-ups.
    let listVar = argument0;
    if (!argument0.match(/^\w+$/)) {
      listVar = Blockly.BBasic.nameDB_.getDistinctName(
          variable0 + '_list', Blockly.VARIABLE_CATEGORY_NAME);
      code += 'var ' + listVar + ' = ' + argument0 + ';\n';
    }
    const indexVar = Blockly.BBasic.nameDB_.getDistinctName(
        variable0 + '_index', Blockly.VARIABLE_CATEGORY_NAME);
    branch = Blockly.BBasic.INDENT + variable0 + ' = ' +
      listVar + '[' + indexVar + '];\n' + branch;
    code += 'for (var ' + indexVar + ' in ' + listVar + ') {\n' + branch + '}\n';
    return code;
  };

  Blockly.BBasic['controls_flow_statements'] = function(block) {
  // Flow statements: continue, break.
    let xfix = '';
    if (Blockly.BBasic.STATEMENT_PREFIX) {
    // Automatic prefix insertion is switched off for this block.  Add manually.
      xfix += Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_PREFIX,
          block);
    }
    if (Blockly.BBasic.STATEMENT_SUFFIX) {
    // Inject any statement suffix here since the regular one at the end
    // will not get executed if the break/continue is triggered.
      xfix += Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_SUFFIX,
          block);
    }
    if (Blockly.BBasic.STATEMENT_PREFIX) {
      const loop = Blockly.Constants.Loops
          .CONTROL_FLOW_IN_LOOP_CHECK_MIXIN.getSurroundLoop(block);
      if (loop && !loop.suppressPrefixSuffix) {
      // Inject loop's statement prefix here since the regular one at the end
      // of the loop will not get executed if 'continue' is triggered.
      // In the case of 'break', a prefix is needed due to the loop's suffix.
        xfix += Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_PREFIX,
            loop);
      }
    }
    switch (block.getFieldValue('FLOW')) {
      case 'BREAK':
        return xfix + 'break;\n';
      case 'CONTINUE':
        return xfix + 'continue;\n';
    }
    throw Error('Unknown flow statement.');
  };
};
