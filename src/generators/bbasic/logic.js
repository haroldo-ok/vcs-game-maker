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
  // If/elseif/else condition. Loops over every "IFn"/"DOn" pair the
  // block's own mutator added (n = 0, 1, 2, ... - same "keep reading until
  // the next IFn input doesn't exist" loop Blockly's own real JavaScript
  // generator uses for this block) rather than only ever reading IF0/DO0 -
  // a previous version of this only handled a single if/else, which SILENTLY
  // dropped every "else if" branch from the compiled output (the block's
  // own gear-icon mutator still let a project add as many as it wanted; they
  // just never made it into the ROM, with no build error to notice by).
  //
  // Each branch gets its own condition-check label and body label, chained
  // by "if cond then goto <body> else goto <next check, or else, or end>" -
  // the same "if X then goto Y else goto Z" shape the single-branch version
  // already used, just repeated once per branch instead of assuming there's
  // only one.
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelStart = `_if_${blockNumber}`;
    const hasElseBlock = block.getInput('ELSE') || Blockly.BBasic.STATEMENT_SUFFIX;
    const endLabel = `${labelStart}_end`;
    const elseLabel = `${labelStart}_else`;

    let branchCount = 0;
    while (block.getInput(`IF${branchCount}`)) branchCount++;

    const lines = [];
    for (let n = 0; n < branchCount; n++) {
      const conditionCode = Blockly.BBasic.valueToCode(block, `IF${n}`,
          Blockly.BBasic.ORDER_NONE) || '0';
      let branchCode = Blockly.BBasic.statementToCode(block, `DO${n}`).trim();
      if (!branchCode) branchCode = 'a = a';

      const bodyLabel = `${labelStart}_body${n}`;
      const isLast = n === branchCount - 1;
      const nextLabel = isLast ? (hasElseBlock ? elseLabel : endLabel) : `${labelStart}_check${n + 1}`;

      if (n > 0) lines.push(`@ ${labelStart}_check${n}`);
      lines.push(`  if ${conditionCode} then goto ${bodyLabel} else goto ${nextLabel}`);
      lines.push(`@ ${bodyLabel}`);
      lines.push(`${branchCode}\ngoto ${endLabel}`);
    }

    if (hasElseBlock) {
      let branchCode = Blockly.BBasic.statementToCode(block, 'ELSE');
      if (Blockly.BBasic.STATEMENT_SUFFIX) {
        branchCode = Blockly.BBasic.prefixLines(
            Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_SUFFIX,
                block), Blockly.BBasic.INDENT) + branchCode;
      }
      lines.push(`@ ${elseLabel}`, branchCode);
    }
    lines.push(`@ ${endLabel}`);

    return '\n' + lines.join('\n') + '\n';
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
