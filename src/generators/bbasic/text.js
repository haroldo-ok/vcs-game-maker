/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for text blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.BBasic.texts');

goog.require('Blockly.BBasic');


Blockly.BBasic['text'] = function(block) {
  // Text value.
  const code = Blockly.BBasic.quote_(block.getFieldValue('TEXT'));
  return [code, Blockly.BBasic.ORDER_ATOMIC];
};

Blockly.BBasic['text_multiline'] = function(block) {
  // Text value.
  const code = Blockly.BBasic.multiline_quote_(block.getFieldValue('TEXT'));
  const order = code.indexOf('+') != -1 ? Blockly.BBasic.ORDER_ADDITION :
      Blockly.BBasic.ORDER_ATOMIC;
  return [code, order];
};

/**
 * Enclose the provided value in 'String(...)' function.
 * Leave string literals alone.
 * @param {string} value Code evaluating to a value.
 * @return {[string, number]} Array containing code evaluating to a string and
 *    the order of the returned code.
 * @private
 */
Blockly.BBasic.text.forceString_ = function(value) {
  if (Blockly.BBasic.text.forceString_.strRegExp.test(value)) {
    return [value, Blockly.BBasic.ORDER_ATOMIC];
  }
  return ['String(' + value + ')', Blockly.BBasic.ORDER_FUNCTION_CALL];
};

/**
 * Regular expression to detect a single-quoted string literal.
 */
Blockly.BBasic.text.forceString_.strRegExp = /^\s*'([^']|\\')*'\s*$/;

Blockly.BBasic['text_join'] = function(block) {
  // Create a string made up of any number of elements of any type.
  let code; let element; let element0; let element1; let codeAndOrder;
  switch (block.itemCount_) {
    case 0:
      return ['\'\'', Blockly.BBasic.ORDER_ATOMIC];
    case 1:
      element = Blockly.BBasic.valueToCode(block, 'ADD0',
          Blockly.BBasic.ORDER_NONE) || '\'\'';
      codeAndOrder = Blockly.BBasic.text.forceString_(element);
      return codeAndOrder;
    case 2:
      element0 = Blockly.BBasic.valueToCode(block, 'ADD0',
          Blockly.BBasic.ORDER_NONE) || '\'\'';
      element1 = Blockly.BBasic.valueToCode(block, 'ADD1',
          Blockly.BBasic.ORDER_NONE) || '\'\'';
      code = Blockly.BBasic.text.forceString_(element0)[0] +
          ' + ' + Blockly.BBasic.text.forceString_(element1)[0];
      return [code, Blockly.BBasic.ORDER_ADDITION];
    default:
      const elements = new Array(block.itemCount_);
      for (let i = 0; i < block.itemCount_; i++) {
        elements[i] = Blockly.BBasic.valueToCode(block, 'ADD' + i,
            Blockly.BBasic.ORDER_NONE) || '\'\'';
      }
      code = '[' + elements.join(',') + '].join(\'\')';
      return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
  }
};

Blockly.BBasic['text_append'] = function(block) {
  // Append to a variable in place.
  const varName = Blockly.BBasic.nameDB_.getName(
      block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
  const value = Blockly.BBasic.valueToCode(block, 'TEXT',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const code = varName + ' += ' +
      Blockly.BBasic.text.forceString_(value)[0] + ';\n';
  return code;
};

Blockly.BBasic['text_length'] = function(block) {
  // String or array length.
  const text = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_MEMBER) || '\'\'';
  return [text + '.length', Blockly.BBasic.ORDER_MEMBER];
};

Blockly.BBasic['text_isEmpty'] = function(block) {
  // Is the string null or array empty?
  const text = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_MEMBER) || '\'\'';
  return ['!' + text + '.length', Blockly.BBasic.ORDER_LOGICAL_NOT];
};

Blockly.BBasic['text_indexOf'] = function(block) {
  // Search the text for a substring.
  const operator = block.getFieldValue('END') == 'FIRST' ?
      'indexOf' : 'lastIndexOf';
  const substring = Blockly.BBasic.valueToCode(block, 'FIND',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const text = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_MEMBER) || '\'\'';
  const code = text + '.' + operator + '(' + substring + ')';
  // Adjust index if using one-based indices.
  if (block.workspace.options.oneBasedIndex) {
    return [code + ' + 1', Blockly.BBasic.ORDER_ADDITION];
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_charAt'] = function(block) {
  // Get letter at index.
  // Note: Until January 2013 this block did not have the WHERE input.
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  const textOrder = (where == 'RANDOM') ? Blockly.BBasic.ORDER_NONE :
      Blockly.BBasic.ORDER_MEMBER;
  const text = Blockly.BBasic.valueToCode(block, 'VALUE',
      textOrder) || '\'\'';

  let code; let at;
  switch (where) {
    case 'FIRST':
      code = text + '.charAt(0)';
      return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
    case 'LAST':
      code = text + '.slice(-1)';
      return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
    case 'FROM_START':
      at = Blockly.BBasic.getAdjusted(block, 'AT');
      // Adjust index if using one-based indices.
      code = text + '.charAt(' + at + ')';
      return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
    case 'FROM_END':
      at = Blockly.BBasic.getAdjusted(block, 'AT', 1, true);
      code = text + '.slice(' + at + ').charAt(0)';
      return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
    case 'RANDOM':
      const functionName = Blockly.BBasic.provideFunction_(
          'textRandomLetter',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(text) {',
          '  var x = Math.floor(Math.random() * text.length);',
          '  return text[x];',
          '}']);
      code = functionName + '(' + text + ')';
      return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
  }
  throw Error('Unhandled option (text_charAt).');
};

/**
 * Returns an expression calculating the index into a string.
 * @param {string} stringName Name of the string, used to calculate length.
 * @param {string} where The method of indexing, selected by dropdown in Blockly
 * @param {string=} optAt The optional offset when indexing from start/end.
 * @return {string|undefined} Index expression.
 * @private
 */
Blockly.BBasic.text.getIndex_ = function(stringName, where, optAt) {
  if (where == 'FIRST') {
    return '0';
  } else if (where == 'FROM_END') {
    return stringName + '.length - 1 - ' + optAt;
  } else if (where == 'LAST') {
    return stringName + '.length - 1';
  } else {
    return optAt;
  }
};

Blockly.BBasic['text_getSubstring'] = function(block) {
  // Get substring.
  const where1 = block.getFieldValue('WHERE1');
  const where2 = block.getFieldValue('WHERE2');
  const requiresLengthCall = (where1 != 'FROM_END' && where1 != 'LAST' &&
      where2 != 'FROM_END' && where2 != 'LAST');
  const textOrder = requiresLengthCall ? Blockly.BBasic.ORDER_MEMBER :
      Blockly.BBasic.ORDER_NONE;
  const text = Blockly.BBasic.valueToCode(block, 'STRING',
      textOrder) || '\'\'';

  let code; let at1; let at2;
  if (where1 == 'FIRST' && where2 == 'LAST') {
    code = text;
    return [code, Blockly.BBasic.ORDER_NONE];
  } else if (text.match(/^'?\w+'?$/) || requiresLengthCall) {
    // If the text is a variable or literal or doesn't require a call for
    // length, don't generate a helper function.
    switch (where1) {
      case 'FROM_START':
        at1 = Blockly.BBasic.getAdjusted(block, 'AT1');
        break;
      case 'FROM_END':
        at1 = Blockly.BBasic.getAdjusted(block, 'AT1', 1, false,
            Blockly.BBasic.ORDER_SUBTRACTION);
        at1 = text + '.length - ' + at1;
        break;
      case 'FIRST':
        at1 = '0';
        break;
      default:
        throw Error('Unhandled option (text_getSubstring).');
    }
    switch (where2) {
      case 'FROM_START':
        at2 = Blockly.BBasic.getAdjusted(block, 'AT2', 1);
        break;
      case 'FROM_END':
        at2 = Blockly.BBasic.getAdjusted(block, 'AT2', 0, false,
            Blockly.BBasic.ORDER_SUBTRACTION);
        at2 = text + '.length - ' + at2;
        break;
      case 'LAST':
        at2 = text + '.length';
        break;
      default:
        throw Error('Unhandled option (text_getSubstring).');
    }
    code = text + '.slice(' + at1 + ', ' + at2 + ')';
  } else {
    at1 = Blockly.BBasic.getAdjusted(block, 'AT1');
    at2 = Blockly.BBasic.getAdjusted(block, 'AT2');
    const getIndex_ = Blockly.BBasic.text.getIndex_;
    const wherePascalCase = {'FIRST': 'First', 'LAST': 'Last',
      'FROM_START': 'FromStart', 'FROM_END': 'FromEnd'};
    const functionName = Blockly.BBasic.provideFunction_(
        'subsequence' + wherePascalCase[where1] + wherePascalCase[where2],
        ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
        '(sequence' +
        // The value for 'FROM_END' and'FROM_START' depends on `at` so
        // we add it as a parameter.
        ((where1 == 'FROM_END' || where1 == 'FROM_START') ? ', at1' : '') +
        ((where2 == 'FROM_END' || where2 == 'FROM_START') ? ', at2' : '') +
        ') {',
        '  var start = ' + getIndex_('sequence', where1, 'at1') + ';',
        '  var end = ' + getIndex_('sequence', where2, 'at2') + ' + 1;',
        '  return sequence.slice(start, end);',
        '}']);
    code = functionName + '(' + text +
        // The value for 'FROM_END' and 'FROM_START' depends on `at` so we
        // pass it.
        ((where1 == 'FROM_END' || where1 == 'FROM_START') ? ', ' + at1 : '') +
        ((where2 == 'FROM_END' || where2 == 'FROM_START') ? ', ' + at2 : '') +
        ')';
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_changeCase'] = function(block) {
  // Change capitalization.
  const OPERATORS = {
    'UPPERCASE': '.toUpperCase()',
    'LOWERCASE': '.toLowerCase()',
    'TITLECASE': null,
  };
  const operator = OPERATORS[block.getFieldValue('CASE')];
  const textOrder = operator ? Blockly.BBasic.ORDER_MEMBER :
      Blockly.BBasic.ORDER_NONE;
  const text = Blockly.BBasic.valueToCode(block, 'TEXT',
      textOrder) || '\'\'';

  let code;
  if (operator) {
    // Upper and lower case are functions built into JavaScript.
    code = text + operator;
  } else {
    // Title case is not a native JavaScript function.  Define one.
    const functionName = Blockly.BBasic.provideFunction_(
        'textToTitleCase',
        ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
            '(str) {',
        '  return str.replace(/\\S+/g,',
        '      function(txt) {return txt[0].toUpperCase() + ' +
            'txt.substring(1).toLowerCase();});',
        '}']);
    code = functionName + '(' + text + ')';
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_trim'] = function(block) {
  // Trim spaces.
  const OPERATORS = {
    'LEFT': '.replace(/^[\\s\\xa0]+/, \'\')',
    'RIGHT': '.replace(/[\\s\\xa0]+$/, \'\')',
    'BOTH': '.trim()',
  };
  const operator = OPERATORS[block.getFieldValue('MODE')];
  const text = Blockly.BBasic.valueToCode(block, 'TEXT',
      Blockly.BBasic.ORDER_MEMBER) || '\'\'';
  return [text + operator, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_print'] = function(block) {
  // Print statement.
  const msg = Blockly.BBasic.valueToCode(block, 'TEXT',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  return 'window.alert(' + msg + ');\n';
};

Blockly.BBasic['text_prompt_ext'] = function(block) {
  // Prompt function.
  let msg;
  if (block.getField('TEXT')) {
    // Internal message.
    msg = Blockly.BBasic.quote_(block.getFieldValue('TEXT'));
  } else {
    // External message.
    msg = Blockly.BBasic.valueToCode(block, 'TEXT',
        Blockly.BBasic.ORDER_NONE) || '\'\'';
  }
  let code = 'window.prompt(' + msg + ')';
  const toNumber = block.getFieldValue('TYPE') == 'NUMBER';
  if (toNumber) {
    code = 'Number(' + code + ')';
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_prompt'] = Blockly.BBasic['text_prompt_ext'];

Blockly.BBasic['text_count'] = function(block) {
  const text = Blockly.BBasic.valueToCode(block, 'TEXT',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const sub = Blockly.BBasic.valueToCode(block, 'SUB',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const functionName = Blockly.BBasic.provideFunction_(
      'textCount',
      ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
          '(haystack, needle) {',
      '  if (needle.length === 0) {',
      '    return haystack.length + 1;',
      '  } else {',
      '    return haystack.split(needle).length - 1;',
      '  }',
      '}']);
  const code = functionName + '(' + text + ', ' + sub + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_replace'] = function(block) {
  const text = Blockly.BBasic.valueToCode(block, 'TEXT',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const from = Blockly.BBasic.valueToCode(block, 'FROM',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const to = Blockly.BBasic.valueToCode(block, 'TO',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  // The regex escaping code below is taken from the implementation of
  // goog.string.regExpEscape.
  const functionName = Blockly.BBasic.provideFunction_(
      'textReplace',
      ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
          '(haystack, needle, replacement) {',
      '  needle = ' +
           'needle.replace(/([-()\\[\\]{}+?*.$\\^|,:#<!\\\\])/g,"\\\\$1")',
      '                 .replace(/\\x08/g,"\\\\x08");',
      '  return haystack.replace(new RegExp(needle, \'g\'), replacement);',
      '}']);
  const code = functionName + '(' + text + ', ' + from + ', ' + to + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['text_reverse'] = function(block) {
  const text = Blockly.BBasic.valueToCode(block, 'TEXT',
      Blockly.BBasic.ORDER_MEMBER) || '\'\'';
  const code = text + '.split(\'\').reverse().join(\'\')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};
