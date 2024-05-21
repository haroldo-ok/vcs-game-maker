import * as Blockly from 'blockly/core';

import {SOUND_ICON} from './icon';

/*
0 No sound (silent).
1 Buzzy tones.
2 Carries distortion 1 downward into a rumble.
3 Flangy wavering tones, like a UFO.
4 Pure tone.
5 Same as 4.
6 Between pure tone and buzzy tone (Adventure death uses this).
7 Reedy tones, much brighter, down to Enduro car rumble.
8 White noise/explosions/lightning, jet/spacecraft engine.
9 Same as 7.
10 Same as 6.
11 Same as 0.
12 Pure tone, goes much lower in pitch than 4 & 5.
13 Same as 12.
14 Electronic tones, mostly lows, extends to rumble.
15 Electronic tones, mostly lows, extends to rumble.
*/

const AUDC_OPTIONS = [
  ['0 No sound (silent).', '0'],
  ['1 Buzzy tones.', '1'],
  ['2 Carries distortion 1 downward into a rumble.', '2'],
  ['3 Flangy wavering tones, like a UFO.', '3'],
  ['4 Pure tone.', '4'],
  ['6 Between pure tone and buzzy tone.', '6'],
  ['7 Reedy tones, much brighter, down to Enduro car rumble.', '7'],
  ['8 White noise/explosions/lightning, jet/spacecraft engine.', '8'],
  ['12 Pure tone, goes much lower in pitch than 4 & 5.', '12'],
  ['14 Electronic tones, mostly lows, extends to rumble.', '14'],
  ['15 Electronic tones, mostly lows, extends to rumble.', '15'],
];

const CHANNEL_OPTIONS = [
  ['channel 0', '0'],
  ['channel 1', '1'],
];

Blockly.defineBlocksWithJsonArray([
  // Block for the getter.
  {
    'type': `simple_sound_set`,
    'message0': `${SOUND_ICON} Play sound %1`,
    'message1': `with frequency %1, volume %2 and duration %3 on %4`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'AUDC',
        'options': AUDC_OPTIONS,
      },
    ],
    'args1': [
      {
        'type': 'field_number',
        'name': 'AUDF',
        'value': 31,
      },
      {
        'type': 'field_number',
        'name': 'AUDV',
        'value': 15,
      },
      {
        'type': 'field_number',
        'name': 'DURATION',
        'value': 20,
      },
      {
        'type': 'field_dropdown',
        'name': 'CHANNEL',
        'options': CHANNEL_OPTIONS,
      },
    ],
    'inputsInline': false,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(156, 39, 176)',
    'tooltip': `Starts playing a simple sound.`,
  },
]);
