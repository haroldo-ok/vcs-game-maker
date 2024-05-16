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
