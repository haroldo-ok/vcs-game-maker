/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for list blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

goog.provide('Blockly.BBasic.lists');

goog.require('Blockly.BBasic');


Blockly.BBasic['lists_create_empty'] = function(block) {
  // Create an empty list.
  return ['[]', Blockly.BBasic.ORDER_ATOMIC];
};

Blockly.BBasic['lists_create_with'] = function(block) {
  // Create a list with any number of elements of any type.
  const elements = new Array(block.itemCount_);
  for (let i = 0; i < block.itemCount_; i++) {
    elements[i] = Blockly.BBasic.valueToCode(block, 'ADD' + i,
        Blockly.BBasic.ORDER_NONE) || 'null';
  }
  const code = '[' + elements.join(', ') + ']';
  return [code, Blockly.BBasic.ORDER_ATOMIC];
};

Blockly.BBasic['lists_repeat'] = function(block) {
  // Create a list with one element repeated.
  const functionName = Blockly.BBasic.provideFunction_(
      'listsRepeat',
      ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
          '(value, n) {',
      '  var array = [];',
      '  for (var i = 0; i < n; i++) {',
      '    array[i] = value;',
      '  }',
      '  return array;',
      '}']);
  const element = Blockly.BBasic.valueToCode(block, 'ITEM',
      Blockly.BBasic.ORDER_NONE) || 'null';
  const repeatCount = Blockly.BBasic.valueToCode(block, 'NUM',
      Blockly.BBasic.ORDER_NONE) || '0';
  const code = functionName + '(' + element + ', ' + repeatCount + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['lists_length'] = function(block) {
  // String or array length.
  const list = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_MEMBER) || '[]';
  return [list + '.length', Blockly.BBasic.ORDER_MEMBER];
};

Blockly.BBasic['lists_isEmpty'] = function(block) {
  // Is the string null or array empty?
  const list = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_MEMBER) || '[]';
  return ['!' + list + '.length', Blockly.BBasic.ORDER_LOGICAL_NOT];
};

Blockly.BBasic['lists_indexOf'] = function(block) {
  // Find an item in the list.
  const operator = block.getFieldValue('END') == 'FIRST' ?
      'indexOf' : 'lastIndexOf';
  const item = Blockly.BBasic.valueToCode(block, 'FIND',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const list = Blockly.BBasic.valueToCode(block, 'VALUE',
      Blockly.BBasic.ORDER_MEMBER) || '[]';
  const code = list + '.' + operator + '(' + item + ')';
  if (block.workspace.options.oneBasedIndex) {
    return [code + ' + 1', Blockly.BBasic.ORDER_ADDITION];
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['lists_getIndex'] = function(block) {
  // Get element at index.
  // Note: Until January 2013 this block did not have MODE or WHERE inputs.
  const mode = block.getFieldValue('MODE') || 'GET';
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  const listOrder = (where == 'RANDOM') ? Blockly.BBasic.ORDER_NONE :
      Blockly.BBasic.ORDER_MEMBER;
  const list = Blockly.BBasic.valueToCode(block, 'VALUE', listOrder) || '[]';

  let at;
  switch (where) {
    case ('FIRST'):
      if (mode == 'GET') {
        const code = list + '[0]';
        return [code, Blockly.BBasic.ORDER_MEMBER];
      } else if (mode == 'GET_REMOVE') {
        const code = list + '.shift()';
        return [code, Blockly.BBasic.ORDER_MEMBER];
      } else if (mode == 'REMOVE') {
        return list + '.shift();\n';
      }
      break;
    case ('LAST'):
      if (mode == 'GET') {
        const code = list + '.slice(-1)[0]';
        return [code, Blockly.BBasic.ORDER_MEMBER];
      } else if (mode == 'GET_REMOVE') {
        const code = list + '.pop()';
        return [code, Blockly.BBasic.ORDER_MEMBER];
      } else if (mode == 'REMOVE') {
        return list + '.pop();\n';
      }
      break;
    case ('FROM_START'):
      at = Blockly.BBasic.getAdjusted(block, 'AT');
      if (mode == 'GET') {
        const code = list + '[' + at + ']';
        return [code, Blockly.BBasic.ORDER_MEMBER];
      } else if (mode == 'GET_REMOVE') {
        const code = list + '.splice(' + at + ', 1)[0]';
        return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
      } else if (mode == 'REMOVE') {
        return list + '.splice(' + at + ', 1);\n';
      }
      break;
    case ('FROM_END'):
      at = Blockly.BBasic.getAdjusted(block, 'AT', 1, true);
      if (mode == 'GET') {
        const code = list + '.slice(' + at + ')[0]';
        return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
      } else if (mode == 'GET_REMOVE') {
        const code = list + '.splice(' + at + ', 1)[0]';
        return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
      } else if (mode == 'REMOVE') {
        return list + '.splice(' + at + ', 1);';
      }
      break;
    case ('RANDOM'):
      const functionName = Blockly.BBasic.provideFunction_(
          'listsGetRandomItem',
          ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
              '(list, remove) {',
          '  var x = Math.floor(Math.random() * list.length);',
          '  if (remove) {',
          '    return list.splice(x, 1)[0];',
          '  } else {',
          '    return list[x];',
          '  }',
          '}']);
      const code = functionName + '(' + list + ', ' + (mode != 'GET') + ')';
      if (mode == 'GET' || mode == 'GET_REMOVE') {
        return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
      } else if (mode == 'REMOVE') {
        return code + ';\n';
      }
      break;
  }
  throw Error('Unhandled combination (lists_getIndex).');
};

Blockly.BBasic['lists_setIndex'] = function(block) {
  // Set element at index.
  // Note: Until February 2013 this block did not have MODE or WHERE inputs.
  let list = Blockly.BBasic.valueToCode(block, 'LIST',
      Blockly.BBasic.ORDER_MEMBER) || '[]';
  const mode = block.getFieldValue('MODE') || 'GET';
  const where = block.getFieldValue('WHERE') || 'FROM_START';
  const value = Blockly.BBasic.valueToCode(block, 'TO',
      Blockly.BBasic.ORDER_ASSIGNMENT) || 'null';
  // Cache non-trivial values to variables to prevent repeated look-ups.
  // Closure, which accesses and modifies 'list'.
  // eslint-disable-next-line require-jsdoc
  function cacheList() {
    if (list.match(/^\w+$/)) {
      return '';
    }
    const listVar = Blockly.BBasic.nameDB_.getDistinctName(
        'tmpList', Blockly.VARIABLE_CATEGORY_NAME);
    const code = 'var ' + listVar + ' = ' + list + ';\n';
    list = listVar;
    return code;
  }

  let code;
  let at;
  switch (where) {
    case ('FIRST'):
      if (mode == 'SET') {
        return list + '[0] = ' + value + ';\n';
      } else if (mode == 'INSERT') {
        return list + '.unshift(' + value + ');\n';
      }
      break;
    case ('LAST'):
      if (mode == 'SET') {
        code = cacheList();
        code += list + '[' + list + '.length - 1] = ' + value + ';\n';
        return code;
      } else if (mode == 'INSERT') {
        return list + '.push(' + value + ');\n';
      }
      break;
    case ('FROM_START'):
      at = Blockly.BBasic.getAdjusted(block, 'AT');
      if (mode == 'SET') {
        return list + '[' + at + '] = ' + value + ';\n';
      } else if (mode == 'INSERT') {
        return list + '.splice(' + at + ', 0, ' + value + ');\n';
      }
      break;
    case ('FROM_END'):
      at = Blockly.BBasic.getAdjusted(block, 'AT', 1, false,
          Blockly.BBasic.ORDER_SUBTRACTION);
      code = cacheList();
      if (mode == 'SET') {
        code += list + '[' + list + '.length - ' + at + '] = ' + value + ';\n';
        return code;
      } else if (mode == 'INSERT') {
        code += list + '.splice(' + list + '.length - ' + at + ', 0, ' + value +
            ');\n';
        return code;
      }
      break;
    case ('RANDOM'):
      code = cacheList();
      const xVar = Blockly.BBasic.nameDB_.getDistinctName(
          'tmpX', Blockly.VARIABLE_CATEGORY_NAME);
      code += 'var ' + xVar + ' = Math.floor(Math.random() * ' + list +
          '.length);\n';
      if (mode == 'SET') {
        code += list + '[' + xVar + '] = ' + value + ';\n';
        return code;
      } else if (mode == 'INSERT') {
        code += list + '.splice(' + xVar + ', 0, ' + value + ');\n';
        return code;
      }
      break;
  }
  throw Error('Unhandled combination (lists_setIndex).');
};

/**
 * Returns an expression calculating the index into a list.
 * @param {string} listName Name of the list, used to calculate length.
 * @param {string} where The method of indexing, selected by dropdown in Blockly
 * @param {string=} optAt The optional offset when indexing from start/end.
 * @return {string|undefined} Index expression.
 * @private
 */
Blockly.BBasic.lists.getIndex_ = function(listName, where, optAt) {
  if (where == 'FIRST') {
    return '0';
  } else if (where == 'FROM_END') {
    return listName + '.length - 1 - ' + optAt;
  } else if (where == 'LAST') {
    return listName + '.length - 1';
  } else {
    return optAt;
  }
};

Blockly.BBasic['lists_getSublist'] = function(block) {
  // Get sublist.
  const list = Blockly.BBasic.valueToCode(block, 'LIST',
      Blockly.BBasic.ORDER_MEMBER) || '[]';
  const where1 = block.getFieldValue('WHERE1');
  const where2 = block.getFieldValue('WHERE2');

  let code;
  let at1;
  let at2;
  if (where1 == 'FIRST' && where2 == 'LAST') {
    code = list + '.slice(0)';
  } else if (list.match(/^\w+$/) ||
      (where1 != 'FROM_END' && where2 == 'FROM_START')) {
    // If the list is a variable or doesn't require a call for length, don't
    // generate a helper function.
    switch (where1) {
      case 'FROM_START':
        at1 = Blockly.BBasic.getAdjusted(block, 'AT1');
        break;
      case 'FROM_END':
        at1 = Blockly.BBasic.getAdjusted(block, 'AT1', 1, false,
            Blockly.BBasic.ORDER_SUBTRACTION);
        at1 = list + '.length - ' + at1;
        break;
      case 'FIRST':
        at1 = '0';
        break;
      default:
        throw Error('Unhandled option (lists_getSublist).');
    }
    switch (where2) {
      case 'FROM_START':
        at2 = Blockly.BBasic.getAdjusted(block, 'AT2', 1);
        break;
      case 'FROM_END':
        at2 = Blockly.BBasic.getAdjusted(block, 'AT2', 0, false,
            Blockly.BBasic.ORDER_SUBTRACTION);
        at2 = list + '.length - ' + at2;
        break;
      case 'LAST':
        at2 = list + '.length';
        break;
      default:
        throw Error('Unhandled option (lists_getSublist).');
    }
    code = list + '.slice(' + at1 + ', ' + at2 + ')';
  } else {
    at1 = Blockly.BBasic.getAdjusted(block, 'AT1');
    at2 = Blockly.BBasic.getAdjusted(block, 'AT2');
    const getIndex_ = Blockly.BBasic.lists.getIndex_;
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
    code = functionName + '(' + list +
        // The value for 'FROM_END' and 'FROM_START' depends on `at` so we
        // pass it.
        ((where1 == 'FROM_END' || where1 == 'FROM_START') ? ', ' + at1 : '') +
        ((where2 == 'FROM_END' || where2 == 'FROM_START') ? ', ' + at2 : '') +
        ')';
  }
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['lists_sort'] = function(block) {
  // Block for sorting a list.
  const list = Blockly.BBasic.valueToCode(block, 'LIST',
      Blockly.BBasic.ORDER_FUNCTION_CALL) || '[]';
  const direction = block.getFieldValue('DIRECTION') === '1' ? 1 : -1;
  const type = block.getFieldValue('TYPE');
  const getCompareFunctionName = Blockly.BBasic.provideFunction_(
      'listsGetSortCompare',
      ['function ' + Blockly.BBasic.FUNCTION_NAME_PLACEHOLDER_ +
          '(type, direction) {',
      '  var compareFuncs = {',
      '    "NUMERIC": function(a, b) {',
      '        return Number(a) - Number(b); },',
      '    "TEXT": function(a, b) {',
      '        return a.toString() > b.toString() ? 1 : -1; },',
      '    "IGNORE_CASE": function(a, b) {',
      '        return a.toString().toLowerCase() > ' +
          'b.toString().toLowerCase() ? 1 : -1; },',
      '  };',
      '  var compare = compareFuncs[type];',
      '  return function(a, b) { return compare(a, b) * direction; }',
      '}']);
  return [list + '.slice().sort(' +
      getCompareFunctionName + '("' + type + '", ' + direction + '))',
  Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['lists_split'] = function(block) {
  // Block for splitting text into a list, or joining a list into text.
  let input = Blockly.BBasic.valueToCode(block, 'INPUT',
      Blockly.BBasic.ORDER_MEMBER);
  const delimiter = Blockly.BBasic.valueToCode(block, 'DELIM',
      Blockly.BBasic.ORDER_NONE) || '\'\'';
  const mode = block.getFieldValue('MODE');

  let functionName;
  if (mode == 'SPLIT') {
    if (!input) {
      input = '\'\'';
    }
    functionName = 'split';
  } else if (mode == 'JOIN') {
    if (!input) {
      input = '[]';
    }
    functionName = 'join';
  } else {
    throw Error('Unknown mode: ' + mode);
  }
  const code = input + '.' + functionName + '(' + delimiter + ')';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};

Blockly.BBasic['lists_reverse'] = function(block) {
  // Block for reversing a list.
  const list = Blockly.BBasic.valueToCode(block, 'LIST',
      Blockly.BBasic.ORDER_FUNCTION_CALL) || '[]';
  const code = list + '.slice().reverse()';
  return [code, Blockly.BBasic.ORDER_FUNCTION_CALL];
};
