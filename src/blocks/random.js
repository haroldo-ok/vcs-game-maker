import * as Blockly from 'blockly/core';

import {DICE_ICON} from './icon';

const RAND_OPTIONS = [
  ['0 to 1', '(rand/128)'],
  ['1 to 2', '(rand/128) + 1'],
  ['0 to 3', '(rand/64)'],
  ['1 to 4', '(rand/64) + 1'],
  ['0 to 7', '(rand/32)'],
  ['1 to 8', '(rand/32) + 1'],
  ['0 to 15', '(rand/16)'],
  ['1 to 16', '(rand/16) + 1'],
  ['0 to 31', '(rand/8)'],
  ['1 to 32', '(rand/8) + 1'],
  ['0 to 63', '(rand/4)'],
  ['1 to 64', '(rand/4) + 1'],
  ['0 to 127', '(rand/2)'],
  ['1 to 128', '(rand/2) + 1'],
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
