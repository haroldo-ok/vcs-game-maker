import * as Blockly from 'blockly/core';

import {COLOR_ICON, SCORE_ICON} from './icon';

const SCORE_COLOR = '#f2691e';

// The score is six digits, numbered left to right.
const SCORE_DIGIT_OPTIONS = [...Array(6).keys()].map((n) => [`${n + 1}`, `${n + 1}`]);

const SCORE_BAR_OPTIONS = [
  ['1', 'pfscore1'],
  ['2', 'pfscore2'],
];

Blockly.defineBlocksWithJsonArray([
  // Block for the score getter.
  {
    'type': `score_get`,
    'message0': `${SCORE_ICON} Score`,
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the score`,
  },
  // Block for the score setter.
  {
    'type': `score_set`,
    'message0': `${SCORE_ICON} Score: set to: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Updates the score`,
  },
  // Block for adding to the score in place.
  {
    'type': `score_change`,
    'message0': `${SCORE_ICON} Score: change by: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'extensions': ['math_change_tooltip'],
  },
  // Block for the color getter.
  {
    'type': `score_color_get`,
    'message0': `${SCORE_ICON} Score ${COLOR_ICON} color`,
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the score's color`,
  },
  // Block for the color setter.
  {
    'type': `score_color_set`,
    'message0': `${SCORE_ICON} Score: set ${COLOR_ICON} color to: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Updates the score's color`,
  },
  // Block for adding to the score's color in place.
  {
    'type': `score_color_change`,
    'message0': `${SCORE_ICON} Score: change ${COLOR_ICON} color by: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'extensions': ['math_change_tooltip'],
  },
  // Block for a single score digit getter.
  {
    'type': `score_digit_get`,
    'message0': `${SCORE_ICON} Score digit %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIGIT',
        'options': SCORE_DIGIT_OPTIONS,
      },
    ],
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads a single score digit (0 to 9), counting from the left. ` +
      `Store it in a variable before comparing it.`,
  },
  // Block for a single score digit setter.
  {
    'type': `score_digit_set`,
    'message0': `${SCORE_ICON} Score digit %1: set to: %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIGIT',
        'options': SCORE_DIGIT_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Sets a single score digit, counting from the left, without ` +
      `changing the other digits. Use a value from 0 to 9.`,
  },
  // Block for the score bar getter.
  {
    'type': `score_bar_get`,
    'message0': `${SCORE_ICON} Score Bar %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
    ],
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the binary pattern (style) of a playfield score bar`,
  },
  // Block for the score bar setter.
  {
    'type': `score_bar_set`,
    'message0': `${SCORE_ICON} Score Bar %1: set to: %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Enables the playfield score bars (colored using the score's color), and sets a bar's ` +
      `binary pattern (style). Use %00000000 to %11111111 (each 1 bit lights up a pixel of the bar).`,
  },
  // Block for adding to a score bar in place.
  {
    'type': `score_bar_change`,
    'message0': `${SCORE_ICON} Score Bar %1: change by: %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'extensions': ['math_change_tooltip'],
  },
]);
