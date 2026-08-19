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
    'output': 'Number',
    'icon': DICE_ICON,
    'colour': 'purple',
    'tooltip': `Generates a random number between the given numbers.`,
  },
]);

// Reseeds the kernel's own random number generator - "rand" always starts
// from the exact same fixed byte ($A2, see 2600basic.h) on every power-on,
// so without this, every playthrough's own "random" sequence starts
// identically. Also seeds "rand16" whenever the Options tab's own "Use
// 16-bit random number generator" toggle is on (see
// generators/bbasic/random.js) - rand16 is itself just another plain byte
// that starts at 0 every boot (nothing in the kernel initializes it), so
// leaving it unseeded would still make the COMBINED sequence deterministic
// even with a fresh "rand" seed. Its own generator clamps the plugged-in
// value to a real byte (0-255) and, when rand16 is on, seeds it with that
// same byte XORed against 255 rather than the identical value "rand" gets -
// seeding both with the exact same byte would only ever reach 256 of
// rand16's own 65,536 possible combined starting states, since the two
// would always start in lockstep.
Blockly.defineBlocksWithJsonArray([
  {
    'type': `random_seed_set`,
    'message0': `Set random seed to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'SEED',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'icon': DICE_ICON,
    'colour': 'purple',
    'tooltip': `Reseeds the random number generator, so "Random" blocks stop producing the exact same ` +
      `sequence every time the game starts. Clamped to a real byte (0-255) regardless of what's plugged in. ` +
      `A good spot for this is somewhere the value naturally differs between playthroughs, e.g. how many ` +
      `frames the title screen has been showing when the player presses Fire.`,
  },
]);
