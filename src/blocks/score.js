import * as Blockly from 'blockly/core';

import {COLOR_ICON, SCORE_ICON} from './icon';

const SCORE_COLOR = '#f2691e';

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
]);
