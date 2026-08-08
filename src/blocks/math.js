import * as Blockly from 'blockly/core';

// Matches a decimal integer (optionally negative), a hexadecimal value written
// as $1F or 0x1F, or a binary value written as %1010 or 0b1010.
const NUMBER_PATTERN =
  /^\s*(-?\d+|\$[0-9a-fA-F]+|0[xX][0-9a-fA-F]+|%[01]+|0[bB][01]+)\s*$/;

const validateNumber = (text) => (NUMBER_PATTERN.test(text) ? text.trim() : null);

// Override the built-in "number" block so it accepts hexadecimal ($1F or 0x1F)
// and binary (%1010 or 0b1010) values in addition to its existing decimal
// behaviour. A validated text field is used instead of the numeric field so
// those characters can be typed; decimal entry keeps working exactly as before.
Blockly.Blocks['math_number'] = {
  init: function() {
    this.jsonInit({
      'message0': '%1',
      'args0': [
        {
          'type': 'field_input',
          'name': 'NUM',
          'text': '0',
        },
      ],
      'output': 'Number',
      'colour': '%{BKY_MATH_HUE}',
      'tooltip': 'A number. Enter a decimal value, a hexadecimal value like $1F, ' +
        'or a binary value like %1010.',
      'helpUrl': '',
    });
    this.getField('NUM').setValidator(validateNumber);
  },
};

// Real, working absolute value: a statement (not a nested expression) since
// making a negative unsigned byte (its top bit set, i.e. 128-255 in two's
// complement) positive requires a branch - bBasic has no ternary or inline
// function calls to express that as a single value.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'math_abs_set',
    'message0': 'Set %1 to Absolute value of %2',
    'args0': [
      {
        'type': 'field_variable',
        'name': 'VAR',
        'variable': 'i',
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': '%{BKY_MATH_HUE}',
    'tooltip': 'Sets the variable to the absolute (always positive) value of the number.',
  },
]);
