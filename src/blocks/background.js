'use strict';

import * as Blockly from 'blockly/core';

import {SCORE_ICON} from './icon';

const SCORE_COLOR = '#f2691e';

Blockly.defineBlocksWithJsonArray([
  // Block for selecting a background.
  {
    'type': `background_select`,
    'message0': `${SCORE_ICON} Background`,
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Selects a background`,
  },
  // Block for the setter.
  {
    'type': `background_set`,
    'message0': `${SCORE_ICON} Background: set to: %1`,
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
    'type': `background_change`,
    'message0': `${SCORE_ICON} Background: change by: %1`,
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
