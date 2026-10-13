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

import {joyButtonLastPressFramesVarName} from './input';

// The joysticks whose "Fire tapped" a condition block contains.
const tappedJoysticksIn = (condition) => {
  const found = new Set();
  if (!condition) return found;
  condition.getDescendants(false).forEach((child) => {
    if (child.type !== 'input_joystick_fire_pattern') return;
    const mode = child.getFieldValue('MODE');
    if (mode === 'HOLD' || mode === 'RELEASED' || mode === 'DOUBLE_TAP') return;
    found.add(`joy${child.getFieldValue('JOYSTICK') === '1' ? '1' : '0'}`);
  });
  return found;
};

// Splits a condition at every top-level occurrence of a separator (one that is
// not inside parentheses or braces), e.g. "a > 1 && b" at "&&".
const splitTopLevel = (text, separator) => {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '(' || c === '{') depth++;
    else if (c === ')' || c === '}') depth--;
    else if (depth === 0 && text.startsWith(separator, i)) {
      parts.push(text.slice(start, i));
      start = i + separator.length;
      i += separator.length - 1;
    }
  }
  parts.push(text.slice(start));
  return parts.map((part) => part.trim());
};

const COMPARISON_INVERSES = {'=': '<>', '<>': '=', '<': '>=', '>': '<=', '<=': '>', '>=': '<'};
const BARE_CONDITION = '[A-Za-z_]\\w*(\\{\\d\\})?|collision\\([\\w ,]*\\)';

// The opposite of one condition without && or ||: a comparison flips its
// operator, "!x" drops the "!", and a bare variable, bit, console switch,
// joystick direction or collision gets one. Null for anything else.
const invertAtom = (atom) => {
  let depth = 0;
  let found = null;
  for (let i = 0; i < atom.length; i++) {
    const c = atom[i];
    if (c === '(' || c === '{') depth++;
    else if (c === ')' || c === '}') depth--;
    else if (depth === 0 && (c === '<' || c === '>' || c === '=')) {
      const pair = atom.slice(i, i + 2);
      const op = (pair === '<>' || pair === '<=' || pair === '>=') ? pair : c;
      if (found) return null;
      found = {op, index: i};
      i += op.length - 1;
    }
  }
  if (found) {
    const left = atom.slice(0, found.index).trim();
    const right = atom.slice(found.index + found.op.length).trim();
    if (!left || !right) return null;
    return `${left} ${COMPARISON_INVERSES[found.op]} ${right}`;
  }
  const negated = atom.match(new RegExp(`^!\\s*(${BARE_CONDITION})$`));
  if (negated) return negated[1];
  // The older spelling of a negated console switch (see finish() in bbasic.js).
  const oldNegated = atom.match(/^not_(switch\w+)$/);
  if (oldNegated) return oldNegated[1];
  if (new RegExp(`^(${BARE_CONDITION})$`).test(atom) && atom !== 'true' && atom !== 'false') return `!${atom}`;
  return null;
};

// The opposite of a whole condition, by De Morgan's law for a chain of
// atoms joined by only && or only ||; null when it is not one of those
// (mixed && and ||, a constant, anything unrecognized), in which case the
// caller keeps the longer jump-over form.
export const invertCondition = (condition) => {
  const orTerms = splitTopLevel(condition, '||');
  const andTerms = splitTopLevel(condition, '&&');
  if (orTerms.length > 1 && andTerms.length > 1) return null;
  const terms = orTerms.length > 1 ? orTerms : andTerms;
  const inverted = terms.map(invertAtom);
  if (inverted.some((term) => term === null)) return null;
  return inverted.join(orTerms.length > 1 ? ' && ' : ' || ');
};

export default (Blockly) => {
  Blockly.BBasic['controls_if'] = function(block) {
  // If/elseif/else condition. Loops over every "IFn"/"DOn" pair the
  // block's  mutator added (n = 0, 1, 2, ... - same "keep reading until
  // the next IFn input doesn't exist" loop Blockly's  real JavaScript
  // generator uses for this block) rather than only ever reading IF0/DO0 -
  // a previous version of this only handled a single if/else, which SILENTLY
  // dropped every "else if" branch from the compiled output (the block's
  // gear-icon mutator still let a project add as many as it wanted; they
  // just never made it into the ROM, with no build error to notice by).
  //
  // Each branch gets its  condition-check label and body label, chained
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
    // Set once a branch's condition is literally "true": nothing after it can
    // ever run, so the remaining branches and the else are generated (so any
    // bookkeeping they do still happens) but left out of the output.
    let alwaysTaken = false;
    for (let n = 0; n < branchCount; n++) {
      const finalCondition = (Blockly.BBasic.valueToCode(block, `IF${n}`,
          Blockly.BBasic.ORDER_NONE) || '0').trim();
      // A condition value block (e.g. a Data table lookup by runtime id,
      // background_get_pixel, ...) can smuggle setup statements ahead of its
      // real expression as a newline-joined preamble, hoisted onto
      // Blockly.BBasic.pendingPreambleLines by Blockly.BBasic.scrub_ itself
      // (see its  top comment) the instant valueToCode above resolves -
      // drained HERE, immediately, rather than left for whatever statement
      // happens to run next. Left for later was confirmed as a real
      // reported bug ("wrong sprite graphics and xy"): statementToCode below
      // resolves this branch's  BODY, whose first statement (if it also
      // needed a preamble-emitting value, as makeScene's  body reliably
      // does) would drain the queue itself first - stealing the CONDITION's
      // preamble along with its, and positioning both AFTER the "if"
      // line instead of before it. That left the "if" comparing a stale
      // leftover value from whatever dispatch call happened to run before
      // this one, while the real dispatch for THIS condition ended up
      // duplicated inside the branch body next to the one that legitimately
      // belonged there.
      const conditionPreamble = Blockly.BBasic.pendingPreambleLines;
      Blockly.BBasic.pendingPreambleLines = [];
      const branchCode = Blockly.BBasic.statementToCode(block, `DO${n}`).trim();
      if (alwaysTaken || finalCondition === 'false') continue;

      const isLast = n === branchCount - 1;
      const nextLabel = isLast ? (hasElseBlock ? elseLabel : endLabel) : `${labelStart}_check${n + 1}`;
      // Whatever follows this branch's body has to be jumped over, except when
      // the body is the last thing before the end label.
      const jumpsOverRest = !isLast || hasElseBlock;

      if (n > 0) lines.push(`@ ${labelStart}_check${n}`);
      conditionPreamble.forEach((line) => lines.push(`  ${line}`));
      if (finalCondition === 'true') {
        alwaysTaken = true;
      } else {
        // "if <opposite condition> then goto <next>" followed straight by the
        // body costs one branch and one jump; "if <condition> then goto body
        // else goto next" costs a branch and three jumps (about 9 more bytes
        // and several more cycles for every if block).
        const inverse = invertCondition(finalCondition);
        if (inverse !== null) {
          lines.push(`  if ${inverse} then goto ${nextLabel}`);
        } else {
          const bodyLabel = `${labelStart}_body${n}`;
          lines.push(`  if ${finalCondition} then goto ${bodyLabel} else goto ${nextLabel}`);
          lines.push(`@ ${bodyLabel}`);
        }
      }
      // The tap has been acted on: clear the joystick's press timer so the same tap cannot trigger
      // again, e.g. when this branch changes the game state and the new state's code looks at it.
      tappedJoysticksIn(block.getInputTargetBlock(`IF${n}`)).forEach((joy) => {
        if (finalCondition === 'true') return;
        lines.push(`  ${Blockly.BBasic.nameDB_.getName(joyButtonLastPressFramesVarName(joy),
            Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = 0`);
      });
      if (branchCode) lines.push(branchCode);
      if (jumpsOverRest && !alwaysTaken) lines.push(`goto ${endLabel}`);
    }

    // Always generated, even when it can never run (see alwaysTaken above).
    if (hasElseBlock) {
      let branchCode = Blockly.BBasic.statementToCode(block, 'ELSE');
      if (Blockly.BBasic.STATEMENT_SUFFIX) {
        branchCode = Blockly.BBasic.prefixLines(
            Blockly.BBasic.injectId(Blockly.BBasic.STATEMENT_SUFFIX,
                block), Blockly.BBasic.INDENT) + branchCode;
      }
      if (!alwaysTaken) lines.push(`@ ${elseLabel}`, branchCode);
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
