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

// Override the built-in arithmetic block to add batari Basic's own real
// bitwise operators (AND/OR/XOR - "&"/"|"/"^", confirmed against the real
// command reference) alongside the stock +/-/×/÷/^ options. Hand-written
// JSON (matching Blockly's own stock math_arithmetic definition, just with
// three extra OPERATOR options and plain ASCII symbols instead of the
// stock block's %{BKY_...} localized ones - this app has no localization
// elsewhere either) rather than patching the registered block after the
// fact, so the extra options show up from the very first time this block
// is used, not just after some other code path happens to touch it.
// "math_op_tooltip" is the SAME extension the stock block already uses
// (see node_modules/blockly/blocks/math.js) - it reads
// Blockly.Constants.Math.TOOLTIPS_BY_OP for each OP value's own tooltip,
// so the three new ops get their own entries added to that same shared
// map below, rather than needing a whole new extension.
Blockly.Blocks['math_arithmetic'] = {
  init: function() {
    this.jsonInit({
      'message0': '%1 %2 %3',
      'args0': [
        {
          'type': 'input_value',
          'name': 'A',
          'check': 'Number',
        },
        {
          'type': 'field_dropdown',
          'name': 'OP',
          'options': [
            ['+', 'ADD'],
            ['-', 'MINUS'],
            ['×', 'MULTIPLY'],
            ['÷', 'DIVIDE'],
            ['^ (power)', 'POWER'],
            ['& (bitwise AND)', 'BITAND'],
            ['| (bitwise OR)', 'BITOR'],
            ['^ (bitwise XOR)', 'BITXOR'],
          ],
        },
        {
          'type': 'input_value',
          'name': 'B',
          'check': 'Number',
        },
      ],
      'inputsInline': true,
      'output': 'Number',
      'style': 'math_blocks',
      'extensions': ['math_op_tooltip'],
    });
  },
};

// Real Blockly.Msg entries (referenced below via the same "%{BKY_...}"
// syntax every OTHER entry in this shared lookup table already uses) -
// NOT plain literal strings: Blockly.Extensions.buildTooltipForDropdown
// (the "math_op_tooltip" extension both this block and the stock one use)
// runs every value in this table through Blockly.utils.checkMessageReferences,
// which does "message.match(/%{BKY_...}/ig).length" with no null guard -
// String.prototype.match() returns null (not an empty array) when nothing
// matches, so a plain literal tooltip with no "%{BKY_...}" in it crashed
// the whole app on load ("Cannot read properties of null (reading
// 'length')"), confirmed as a real, reproducible bug this way.
Blockly.Msg['MATH_ARITHMETIC_TOOLTIP_BITAND'] =
  'Bitwise AND: each bit of the result is 1 only where BOTH numbers have a 1 bit.';
Blockly.Msg['MATH_ARITHMETIC_TOOLTIP_BITOR'] =
  'Bitwise OR: each bit of the result is 1 where EITHER number has a 1 bit.';
Blockly.Msg['MATH_ARITHMETIC_TOOLTIP_BITXOR'] =
  'Bitwise XOR: each bit of the result is 1 where the two numbers\' bits DIFFER.';
Blockly.Constants.Math.TOOLTIPS_BY_OP['BITAND'] = '%{BKY_MATH_ARITHMETIC_TOOLTIP_BITAND}';
Blockly.Constants.Math.TOOLTIPS_BY_OP['BITOR'] = '%{BKY_MATH_ARITHMETIC_TOOLTIP_BITOR}';
Blockly.Constants.Math.TOOLTIPS_BY_OP['BITXOR'] = '%{BKY_MATH_ARITHMETIC_TOOLTIP_BITXOR}';

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
