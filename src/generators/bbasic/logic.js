/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for logic blocks.
 * @author q.neutron@gmail.com (Quynh Neutron)
 */
'use strict';

/*
goog.provide('Blockly.BBasic.logic');

goog.require('Blockly.BBasic');
*/

export default (Blockly) => {
  Blockly.BBasic['controls_if'] = function(block) {
  // If/elseif/else condition.
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelStart = `_if_${blockNumber}`;

    let code = ''; let branchCode;

    const conditionCode = Blockly.BBasic.valueToCode(block, 'IF0',
        Blockly.BBasic.ORDER_NONE) || '0';
    const hasElseBlock = block.getInput('ELSE') || Blockly.BBasic.STATEMENT_SUFFIX;

    branchCode = Blockly.BBasic.statementToCode(block, 'DO0').trim();
    if (!branchCode.trim()) {
      branchCode = 'a = a';
    }
    code += [`  if ${conditionCode} then goto ${labelStart} else goto ${labelStart}_end`,
      `@ ${labelStart}`,
      branchCode +
      (hasElseBlock ? `\ngoto ${labelStart}_else_end` : ''),
      `@ ${labelStart}_end`,
    ].join('\n');

    if (hasElseBlock) {
      branchCode = Blockly.BBasic.statementToCode(block, 'ELSE');
      if (Blockly.BBasic.STATEMENT_SUFFIX) {
        branchCode = Blockly.BBasic.prefixLines(
            Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_SUFFIX,
                block), Blockly.BBasic.INDENT) + branchCode;
      }
      code += '\n' + branchCode +
        `@ ${labelStart}_else_end`;
    }
    return '\n' + code + '\n';
  };

  Blockly.BBasic['controls_ifelse'] = Blockly.BBasic['controls_if'];

  Blockly.BBasic['logic_compare'] = function(block) {
  // Comparison operator.
    const OPERATORS = {
      'EQ': '=',
      'NEQ': '<>',
      'LT': '<',
      'LTE': '<=',
      'GT': '>',
      'GTE': '>=',
    };
    const operator = OPERATORS[block.getFieldValue('OP')];
    const order = (operator == '==' || operator == '!=') ?
      Blockly.BBasic.ORDER_EQUALITY : Blockly.BBasic.ORDER_RELATIONAL;
    const argument0 = Blockly.BBasic.valueToCode(block, 'A', order) || '0';
    const argument1 = Blockly.BBasic.valueToCode(block, 'B', order) || '0';
    const code = argument0 + ' ' + operator + ' ' + argument1;
    return [code, order];
  };

  Blockly.BBasic['logic_operation'] = function(block) {
  // Operations 'and', 'or'.
    const operator = (block.getFieldValue('OP') == 'AND') ? '&&' : '||';
    const order = (operator == '&&') ? Blockly.BBasic.ORDER_LOGICAL_AND :
      Blockly.BBasic.ORDER_LOGICAL_OR;
    let argument0 = Blockly.BBasic.valueToCode(block, 'A', order);
    let argument1 = Blockly.BBasic.valueToCode(block, 'B', order);
    if (!argument0 && !argument1) {
    // If there are no arguments, then the return value is false.
      argument0 = 'false';
      argument1 = 'false';
    } else {
    // Single missing arguments have no effect on the return value.
      const defaultArgument = (operator == '&&') ? 'true' : 'false';
      if (!argument0) {
        argument0 = defaultArgument;
      }
      if (!argument1) {
        argument1 = defaultArgument;
      }
    }
    const code = argument0 + ' ' + operator + ' ' + argument1;
    return [code, order];
  };

  Blockly.BBasic['logic_negate'] = function(block) {
  // Negation.
    const order = Blockly.BBasic.ORDER_LOGICAL_NOT;
    const argument0 = Blockly.BBasic.valueToCode(block, 'BOOL', order) ||
      'true';
    const code = '!' + argument0;
    return [code, order];
  };

  Blockly.BBasic['logic_boolean'] = function(block) {
  // Boolean values true and false.
    const code = (block.getFieldValue('BOOL') == 'TRUE') ? 'true' : 'false';
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['logic_null'] = function(block) {
  // Null data type.
    return ['null', Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['logic_ternary'] = function(block) {
  // Ternary operator.
    const valueIf = Blockly.BBasic.valueToCode(block, 'IF',
        Blockly.BBasic.ORDER_CONDITIONAL) || 'false';
    const valueThen = Blockly.BBasic.valueToCode(block, 'THEN',
        Blockly.BBasic.ORDER_CONDITIONAL) || 'null';
    const valueElse = Blockly.BBasic.valueToCode(block, 'ELSE',
        Blockly.BBasic.ORDER_CONDITIONAL) || 'null';
    const code = valueIf + ' ? ' + valueThen + ' : ' + valueElse;
    return [code, Blockly.BBasic.ORDER_CONDITIONAL];
  };
};
