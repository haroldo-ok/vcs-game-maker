import * as Blockly from 'blockly/core';

import {SCORE_ICON} from './icon';

const SCORE_COLOR = '#f2691e';

Blockly.defineBlocksWithJsonArray([
  // Block for the getter.
  {
    'type': `score_get`,
    'message0': `${SCORE_ICON} Score`,
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the score`,
  },
  // Block for the setter.
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
  // Block for adding to a variable in place.
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
]);
