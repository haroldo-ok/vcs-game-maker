import * as Blockly from 'blockly/core';

import {DICE_ICON} from './icon';

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
    'message0': `Random from %1 to %2`,
    'args0': [
      {
        'type': 'field_number',
        'name': 'RANGE_START',
        'value': 1,
      },
      {
        'type': 'field_number',
        'name': 'RANGE_END',
        'value': 32,
      },
    ],
    'icon': DICE_ICON,
    'colour': 'purple',
    'tooltip': `Generates a random number between the given numbers.`,
  },
]);
