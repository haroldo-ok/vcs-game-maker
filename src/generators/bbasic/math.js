/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for math blocks.
 * @author q.neutron@gmail.com (Quynh Neutron)
 */
'use strict';

/*
goog.provide('Blockly.BBasic.math');

goog.require('Blockly.BBasic');
*/


Blockly.BBasic['math_number'] = function(block) {
  // Numeric value.
  const code = Number(block.getFieldValue('NUM'));
  const order = code >= 0 ? Blockly.BBasic.ORDER_ATOMIC :
              Blockly.BBasic.ORDER_UNARY_NEGATION;
  return [code, order];
};

Blockly.BBasic['math_arithmetic'] = function(block) {
  // Basic arithmetic operators, and power.
  const OPERATORS = {
    'ADD': [' + ', Blockly.BBasic.ORDER_ADDITION],
    'MINUS': [' - ', Blockly.BBasic.ORDER_SUBTRACTION],
    'MULTIPLY': [' * ', Blockly.BBasic.ORDER_MULTIPLICATION],
    'DIVIDE': [' / ', Blockly.BBasic.ORDER_DIVISION],
    'POWER': [null, Blockly.BBasic.ORDER_NONE], // Handle power separately.
  };
  const tuple = OPERATORS[block.getFieldValue('OP')];
  const operator = tuple[0];
  const order = tuple[1];
  const argument0 = Blockly.BBasic.valueToCode(block, 'A', order) || '0';
  const argument1 = Blockly.BBasic.valueToCode(block, 'B', order) || '0';
  let code;
  // Power in JavaScript requires a special case since it has no operator.
  if (!operator) {
    code = 'Math.pow(' + argument0 + ', ' + argument1 + ')';
    return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
  }
  code = argument0 + operator + argument1;
  return [code, order];
};

Blockly.BBasic['math_single'] = function(block) {
  // Math operators with single operand.
  const operator = block.getFieldValue('OP');
  let code;
  let arg;
  if (operator == 'NEG') {
    // Negation is a special case given its different operator precedence.
    arg = Blockly.BBasic.valueToCode(block, 'NUM',
        Blockly.BBasic.ORDER_UNARY_NEGATION) || '0';
    if (arg[0] == '-') {
      // --3 is not legal in JS.
      arg = ' ' + arg;
    }
    code = '-' + arg;
    return [code, Blockly.BBasic.ORDER_UNARY_NEGATION];
  }
  if (operator == 'SIN' || operator == 'COS' || operator == 'TAN') {
    arg = Blockly.BBasic.valueToCode(block, 'NUM',
        Blockly.BBasic.ORDER_DIVISION) || '0';
  } else {
    arg = Blockly.BBasic.valueToCode(block, 'NUM',
        Blockly.BBasic.ORDER_NONE) || '0';
  }
  // First, handle cases which generate values that don't need parentheses
  // wrapping the code.
  switch (operator) {
    case 'ABS':
      code = 'Math.abs(' + arg + ')';
      break;
    case 'ROOT':
      code = 'Math.sqrt(' + arg + ')';
      break;
    case 'LN':
      code = 'Math.log(' + arg + ')';
      break;
    case 'EXP':
      code = 'Math.exp(' + arg + ')';
      break;
    case 'POW10':
      code = 'Math.pow(10,' + arg + ')';
      break;
    case 'ROUND':
      code = 'Math.round(' + arg + ')';
      break;
    case 'ROUNDUP':
      code = 'Math.ceil(' + arg + ')';
      break;
    case 'ROUNDDOWN':
      code = 'Math.floor(' + arg + ')';
      break;
    case 'SIN':
      code = 'Math.sin(' + arg + ' / 180 * Math.PI)';
      break;
    case 'COS':
      code = 'Math.cos(' + arg + ' / 180 * Math.PI)';
      break;
    case 'TAN':
      code = 'Math.tan(' + arg + ' / 180 * Math.PI)';
      break;
  }
  if (code) {
    return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
  }
  // Second, handle cases which generate values that may need parentheses
  // wrapping the code.
  switch (operator) {
    case 'LOG10':
      code = 'Math.log(' + arg + ') / Math.log(10)';
      break;
    case 'ASIN':
      code = 'Math.asin(' + arg + ') / Math.PI * 180';
      break;
    case 'ACOS':
      code = 'Math.acos(' + arg + ') / Math.PI * 180';
      break;
    case 'ATAN':
      code = 'Math.atan(' + arg + ') / Math.PI * 180';
      break;
    default:
      throw Error('Unknown math operator: ' + operator);
  }
  return [code, Blockly.BBasic.ORDER_DIVISION];
};

Blockly.BBasic['math_constant'] = function(block) {
  // Constants: PI, E, the Golden Ratio, sqrt(2), 1/sqrt(2), INFINITY.
  const CONSTANTS = {
    'PI': ['Math.PI', Blockly.BBasic.ORDER_MEMBER],
    'E': ['Math.E', Blockly.BBasic.ORDER_MEMBER],
    'GOLDEN_RATIO':
        ['(1 + Math.sqrt(5)) / 2', Blockly.BBasic.ORDER_DIVISION],
    'SQRT2': ['Math.SQRT2', Blockly.BBasic.ORDER_MEMBER],
    'SQRT1_2': ['Math.SQRT1_2', Blockly.BBasic.ORDER_MEMBER],
    'INFINITY': ['Infinity', Blockly.BBasic.ORDER_ATOMIC],
  };
  return CONSTANTS[block.getFieldValue('CONSTANT')];
};

Blockly.BBasic['math_number_property'] = function(block) {
  // Check if a number is even, odd, prime, whole, positive, or negative
  // or if it is divisible by certain number. Returns true or false.
  const numberToCheck = Blockly.BBasic.valueToCode(block, 'NUMBER_TO_CHECK',
      Blockly.BBasic.ORDER_MODULUS) || '0';
  const dropdownProperty = block.getFieldValue('PROPERTY');
  let code;
  if (dropdownProperty == 'PRIME') {
    // Prime is a special case as it is not a one-liner test.
    const functionName = Blockly.BBasic.provideFunction_(
        'mathIsPrime',
        ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ + '(n) {',
          '  // https://en.wikipedia.org/wiki/Primality_test#Naive_methods',
          '  if (n == 2 || n == 3) {',
          '    return true;',
          '  }',
          '  // False if n is NaN, negative, is 1, or not whole.',
          '  // And false if n is divisible by 2 or 3.',
          '  if (isNaN(n) || n <= 1 || n % 1 != 0 || n % 2 == 0 ||' +
            ' n % 3 == 0) {',
          '    return false;',
          '  }',
          '  // Check all the numbers of form 6k +/- 1, up to sqrt(n).',
          '  for (var x = 6; x <= Math.sqrt(n) + 1; x += 6) {',
          '    if (n % (x - 1) == 0 || n % (x + 1) == 0) {',
          '      return false;',
          '    }',
          '  }',
          '  return true;',
          '}']);
    code = functionName + '(' + numberToCheck + ')';
    return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
  }
  switch (dropdownProperty) {
    case 'EVEN':
      code = numberToCheck + ' % 2 == 0';
      break;
    case 'ODD':
      code = numberToCheck + ' % 2 == 1';
      break;
    case 'WHOLE':
      code = numberToCheck + ' % 1 == 0';
      break;
    case 'POSITIVE':
      code = numberToCheck + ' > 0';
      break;
    case 'NEGATIVE':
      code = numberToCheck + ' < 0';
      break;
    case 'DIVISIBLE_BY':
      const divisor = Blockly.BBasic.valueToCode(block, 'DIVISOR',
          Blockly.BBasic.ORDER_MODULUS) || '0';
      code = numberToCheck + ' % ' + divisor + ' == 0';
      break;
  }
  return [code, Blockly.BBasic.ORDER_EQUALITY];
};

Blockly.BBasic['math_change'] = function(block) {
  // Add to a variable in place.
  const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
      Blockly.BBasic.ORDER_ADDITION) || '0';
  const varName = Blockly.BBasic.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  return varName + ' = (typeof ' + varName + ' == \'number\' ? ' + varName +
      ' : 0) + ' + argument0 + ';\n';
};

// Rounding functions have a single operand.
Blockly.BBasic['math_round'] = Blockly.BBasic['math_single'];
// Trigonometry functions have a single operand.
Blockly.BBasic['math_trig'] = Blockly.BBasic['math_single'];

Blockly.BBasic['math_on_list'] = function(block) {
  // Math functions for lists.
  const func = block.getFieldValue('OP');
  let list; let code; let functionName;
  switch (func) {
    case 'SUM':
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_MEMBER) || '[]';
      code = list + '.reduce(function(x, y) {return x + y;})';
      break;
    case 'MIN':
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = 'Math.min.apply(null, ' + list + ')';
      break;
    case 'MAX':
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = 'Math.max.apply(null, ' + list + ')';
      break;
    case 'AVERAGE':
      // mathMean([null,null,1,3]) == 2.0.
      functionName = Blockly.BBasic.provideFunction_(
          'mathMean',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(myList) {',
          '  return myList.reduce(function(x, y) {return x + y;}) / ' +
                  'myList.length;',
          '}']);
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = functionName + '(' + list + ')';
      break;
    case 'MEDIAN':
      // mathMedian([null,null,1,3]) == 2.0.
      functionName = Blockly.BBasic.provideFunction_(
          'mathMedian',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(myList) {',
          '  var localList = myList.filter(function (x) ' +
              '{return typeof x == \'number\';});',
          '  if (!localList.length) return null;',
          '  localList.sort(function(a, b) {return b - a;});',
          '  if (localList.length % 2 == 0) {',
          '    return (localList[localList.length / 2 - 1] + ' +
              'localList[localList.length / 2]) / 2;',
          '  } else {',
          '    return localList[(localList.length - 1) / 2];',
          '  }',
          '}']);
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = functionName + '(' + list + ')';
      break;
    case 'MODE':
      // As a list of numbers can contain more than one mode,
      // the returned result is provided as an array.
      // Mode of [3, 'x', 'x', 1, 1, 2, '3'] -> ['x', 1].
      functionName = Blockly.BBasic.provideFunction_(
          'mathModes',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(values) {',
          '  var modes = [];',
          '  var counts = [];',
          '  var maxCount = 0;',
          '  for (var i = 0; i < values.length; i++) {',
          '    var value = values[i];',
          '    var found = false;',
          '    var thisCount;',
          '    for (var j = 0; j < counts.length; j++) {',
          '      if (counts[j][0] === value) {',
          '        thisCount = ++counts[j][1];',
          '        found = true;',
          '        break;',
          '      }',
          '    }',
          '    if (!found) {',
          '      counts.push([value, 1]);',
          '      thisCount = 1;',
          '    }',
          '    maxCount = Math.max(thisCount, maxCount);',
          '  }',
          '  for (var j = 0; j < counts.length; j++) {',
          '    if (counts[j][1] == maxCount) {',
          '        modes.push(counts[j][0]);',
          '    }',
          '  }',
          '  return modes;',
          '}']);
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = functionName + '(' + list + ')';
      break;
    case 'STD_DEV':
      functionName = Blockly.BBasic.provideFunction_(
          'mathStandardDeviation',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(numbers) {',
          '  var n = numbers.length;',
          '  if (!n) return null;',
          '  var mean = numbers.reduce(function(x, y) {return x + y;}) / n;',
          '  var variance = 0;',
          '  for (var j = 0; j < n; j++) {',
          '    variance += Math.pow(numbers[j] - mean, 2);',
          '  }',
          '  variance = variance / n;',
          '  return Math.sqrt(variance);',
          '}']);
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = functionName + '(' + list + ')';
      break;
    case 'RANDOM':
      functionName = Blockly.BBasic.provideFunction_(
          'mathRandomList',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(list) {',
          '  var x = Math.floor(Math.random() * list.length);',
          '  return list[x];',
          '}']);
      list = Blockly.BBasic.valueToCode(block, 'LIST',
          Blockly.BBasic.ORDER_NONE) || '[]';
      code = functionName + '(' + list + ')';
      break;
    default:
      throw Error('Unknown operator: ' + func);
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['math_modulo'] = function(block) {
  // Remainder computation.
  const argument0 = Blockly.BBasic.valueToCode(block, 'DIVIDEND',
      Blockly.BBasic.ORDER_MODULUS) || '0';
  const argument1 = Blockly.BBasic.valueToCode(block, 'DIVISOR',
      Blockly.BBasic.ORDER_MODULUS) || '0';
  const code = argument0 + ' % ' + argument1;
  return [code, Blockly.BBasic.ORDER_MODULUS];
};

Blockly.BBasic['math_constrain'] = function(block) {
  // Constrain a number between two limits.
  const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_NONE) || '0';
  const argument1 = Blockly.BBasic.valueToCode(block, 'LOW',
      Blockly.BBasic.ORDER_NONE) || '0';
  const argument2 = Blockly.BBasic.valueToCode(block, 'HIGH',
      Blockly.BBasic.ORDER_NONE) || 'Infinity';
  const code = 'Math.min(Math.max(' + argument0 + ', ' + argument1 + '), ' +
      argument2 + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['math_random_int'] = function(block) {
  // Random integer between [X] and [Y].
  const argument0 = Blockly.BBasic.valueToCode(block, 'FROM',
      Blockly.BBasic.ORDER_NONE) || '0';
  const argument1 = Blockly.BBasic.valueToCode(block, 'TO',
      Blockly.BBasic.ORDER_NONE) || '0';
  const functionName = Blockly.BBasic.provideFunction_(
      'mathRandomInt',
      ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
          '(a, b) {',
      '  if (a > b) {',
      '    // Swap a and b to ensure a is smaller.',
      '    var c = a;',
      '    a = b;',
      '    b = c;',
      '  }',
      '  return Math.floor(Math.random() * (b - a + 1) + a);',
      '}']);
  const code = functionName + '(' + argument0 + ', ' + argument1 + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['math_random_float'] = function(block) {
  // Random fraction between 0 and 1.
  return ['Math.random()', Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['math_atan2'] = function(block) {
  // Arctangent of point (X, Y) in degrees from -180 to 180.
  const argument0 = Blockly.BBasic.valueToCode(block, 'X',
      Blockly.BBasic.ORDER_NONE) || '0';
  const argument1 = Blockly.BBasic.valueToCode(block, 'Y',
      Blockly.BBasic.ORDER_NONE) || '0';
  return ['Math.atan2(' + argument1 + ', ' + argument0 + ') / Math.PI * 180',
    Blockly.BBasic.ORDER_DIVISION];
};
