'use strict';

import * as Blockly from 'blockly/core';

import {BACKGROUND_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

Blockly.defineBlocksWithJsonArray([
  // Block for selecting a background.
  {
    'type': `background_select`,
    'message0': `${BACKGROUND_ICON} Background`,
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Selects a background`,
  },
  // Block for the setter.
  {
    'type': `background_set`,
    'message0': `${BACKGROUND_ICON} Background: set to: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Updates the score`,
  },
  // Block for adding to a variable in place.
  {
    'type': `background_change`,
    'message0': `${BACKGROUND_ICON} Background: change by: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'extensions': ['math_change_tooltip'],
  },
]);
