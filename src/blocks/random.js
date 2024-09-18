import * as Blockly from 'blockly/core';

import {DICE_ICON} from './icon';

const RAND_OPTIONS = [
  ['1 to 32', '(rand/8) + 1'],
  ['0 to 63', '(rand/4)'],
];

Blockly.defineBlocksWithJsonArray([
  // Block for the getter.
  {
    'type': `random_get`,
    'message0': `Random 1 .. 255`,
    'args0': [],
    'output': 'Number',
    'icon': DICE_ICON,
    'colour': 'purple',
    'tooltip': `Generates a random number between 1 and 255.`,
  },
]);

Blockly.defineBlocksWithJsonArray([
  // Block for the getter.
  {
    'type': `random_range_get`,
    'message0': `Random %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'RAND_CODE',
        'options': RAND_OPTIONS,
      },
    ],
    'icon': DICE_ICON,
    'colour': 'purple',
    'tooltip': `Generates a random number between the given numbers.`,
  },
]);
