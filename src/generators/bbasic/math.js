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


export default (Blockly) => {
  Blockly.BBasic['math_number'] = function(block) {
  // Numeric value. Accepts decimal, hexadecimal written as $1F or 0x1F, and
  // binary written as %1010 or 0b1010.
    const raw = String(block.getFieldValue('NUM')).trim();
    let code;
    let negative = false;
    if (/^\$[0-9a-fA-F]+$/.test(raw)) {
      code = raw;
    } else if (/^0[xX][0-9a-fA-F]+$/.test(raw)) {
      code = '$' + raw.slice(2);
    } else if (/^%[01]+$/.test(raw)) {
      code = raw;
    } else if (/^0[bB][01]+$/.test(raw)) {
      code = '%' + raw.slice(2);
    } else {
      code = Number(raw);
      negative = code < 0;
    }
    const order = negative ? Blockly.BBasic.ORDER_UNARY_NEGATION :
              Blockly.BBasic.ORDER_ATOMIC;
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
      // Real batari Basic bitwise operators (confirmed against the real
      // command reference) - unlike POWER, these need no special handling,
      // batari Basic supports them as plain infix operators the same as
      // +/-/*//.
      'BITAND': [' & ', Blockly.BBasic.ORDER_BITWISE_AND],
      'BITOR': [' | ', Blockly.BBasic.ORDER_BITWISE_OR],
      'BITXOR': [' ^ ', Blockly.BBasic.ORDER_BITWISE_XOR],
      // Same "% " infix operator the separate (never toolboxed - see
      // blocks/math.js) stock math_modulo block's own generator already
      // uses below.
      'MODULO': [' % ', Blockly.BBasic.ORDER_MODULUS],
    };
    const op = block.getFieldValue('OP');
    // "*"/"/" by a compile-time constant power of 2 gets optimized into a
    // shift by the real toolchain, but any other multiply/divide (a runtime
    // variable divisor, or a non-power-of-2 constant) compiles to "jsr
    // mul8"/"jsr div8" - a shared routine that isn't bundled by default in
    // real batari Basic (a .bas file has to "include div_mul.asm" itself to
    // get it). Since Blockly projects can't add that by hand, flag any
    // multiply/divide use here so generateConfiguration() can always pull it
    // in (see Blockly.BBasic.usesDivMul below) - whether THIS specific one
    // would have needed it isn't known until the real compiler decides, and
    // the routine is a few bytes, so it's simplest to include it whenever
    // either operator appears at all rather than replicate that decision.
    if (op === 'MULTIPLY' || op === 'DIVIDE') Blockly.BBasic.usesDivMul = true;
    const tuple = OPERATORS[op];
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

  // Real functions (sqrt, log, sin, ...) that JS's Math object has, but 6502
  // batari Basic - integer-only, no floating point, no trig - fundamentally
  // doesn't. Each maps to a JS function computing the same result in
  // degrees-in/degrees-out terms (matching this block's own field labels),
  // used ONLY to constant-fold a literal argument at compile time (see
  // math_single below) - never emitted as runtime bB code, since there's no
  // way to compute any of these from a runtime value on this platform.
  const MATH_SINGLE_FUNCTIONS = {
    'ABS': Math.abs,
    'ROOT': Math.sqrt,
    'LN': Math.log,
    'EXP': Math.exp,
    'POW10': (n) => Math.pow(10, n),
    'ROUND': Math.round,
    'ROUNDUP': Math.ceil,
    'ROUNDDOWN': Math.floor,
    'SIN': (n) => Math.sin(n / 180 * Math.PI),
    'COS': (n) => Math.cos(n / 180 * Math.PI),
    'TAN': (n) => Math.tan(n / 180 * Math.PI),
    'LOG10': (n) => Math.log(n) / Math.log(10),
    'ASIN': (n) => Math.asin(n) / Math.PI * 180,
    'ACOS': (n) => Math.acos(n) / Math.PI * 180,
    'ATAN': (n) => Math.atan(n) / Math.PI * 180,
  };

  Blockly.BBasic['math_single'] = function(block) {
  // Math operators with single operand.
    const operator = block.getFieldValue('OP');
    if (operator == 'NEG') {
    // Negation is a special case given its different operator precedence.
      let arg = Blockly.BBasic.valueToCode(block, 'NUM',
          Blockly.BBasic.ORDER_UNARY_NEGATION) || '0';
      if (arg[0] == '-') {
      // --3 is not legal in JS.
        arg = ' ' + arg;
      }
      return ['-' + arg, Blockly.BBasic.ORDER_UNARY_NEGATION];
    }
    // Every other operator here (ABS/ROOT/LN/EXP/POW10/ROUND/ROUNDUP/
    // ROUNDDOWN/SIN/COS/TAN/LOG10/ASIN/ACOS/ATAN) has no batari Basic
    // equivalent to compute it from a RUNTIME value - there's no floating
    // point or trig on this platform. If the plugged-in value happens to be
    // a plain literal number, though, the whole thing is really just a
    // compile-time constant - fold it in JS and emit the (rounded, since bB
    // integers only) result directly, same as typing that number in by
    // hand. A rounding operator (ROUND/ROUNDUP/ROUNDDOWN) on an
    // already-integer literal is a no-op fold, which is fine.
    const rawArg = Blockly.BBasic.valueToCode(block, 'NUM', Blockly.BBasic.ORDER_NONE);
    const literalMatch = rawArg && /^\s*-?\d+\s*$/.exec(rawArg);
    if (literalMatch) {
      const result = Math.round(MATH_SINGLE_FUNCTIONS[operator](Number(literalMatch[0])));
      return [`${result}`, Blockly.BBasic.ORDER_ATOMIC];
    }
    const fixSuggestion = operator === 'ABS' ?
      ' Use the "Set [Variable] to Absolute value of [Value]" block instead - ' +
        'it can compute the absolute value of a variable or runtime expression.' :
      ' Only a plain typed-in number works here - runtime variables and computed values aren\'t supported.';
    throw new Error(`The "${operator}" math block can't run on this hardware for anything but a plain ` +
      `typed-in number (no floating point or trig on the 2600).${fixSuggestion}`);
  };

  Blockly.BBasic['math_abs_set'] = function(block) {
  // Player coordinates and other bBasic values are unsigned bytes, so a
  // negative number only exists as its two's-complement wraparound (128-255
  // represents -128..-1) - making that positive needs a branch, which is
  // why this is a statement (see blocks/math.js) instead of a nested
  // expression like the rest of the Math category.
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const value = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const blockNumber = Blockly.BBasic.blockNumbers.next('math_abs_set');
    const doneLabel = `_math_abs_set_${blockNumber}_done`;
    return [
      `${varName} = ${value}`,
      `if ${varName} < 128 then goto ${doneLabel}`,
      `${varName} = 0 - ${varName}`,
      `@ ${doneLabel}`,
    ].join('\n') + '\n';
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
  // Add to a variable in place. Unlike JS, a bB variable is always a plain
  // byte - there's no "undefined"/non-number case to guard against, so this
  // is a plain addition (the stock Blockly JS generator's "typeof x ==
  // 'number' ? x : 0" ternary has no bB equivalent and doesn't need one).
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ADDITION) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    return `${varName} = ${varName} + ${argument0}\n`;
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
};
