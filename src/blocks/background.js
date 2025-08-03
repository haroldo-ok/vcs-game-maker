'use strict';

import * as Blockly from 'blockly/core';

import {useBackgroundsStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';
import {BACKGROUND_ICON, COLOR_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

const BACKGROUND_PFPIXEL_OPTIONS = [
  ['Set', 'on'],
  ['Clear', 'off'],
  ['Flip', 'flip'],
];

const backgroundsStorage = useBackgroundsStorage();

export const DEFAULT_BACKGROUNDS = {
  backgrounds: [
    {
      id: 1,
      name: 'Test 1',
      pixels: playfieldToMatrix(
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
        'X....X...................X....X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X....X...................X....X\n' +
        'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
    },
  ],
};

export const processBackgroundStorageDefaults = (backgroundsStorage) => {
  const backgrounds = backgroundsStorage.value;
  if (!backgrounds || !backgrounds.backgrounds || !backgrounds.backgrounds.length) {
    return structuredClone(DEFAULT_BACKGROUNDS);
  }
  return backgrounds;
};

const buildBackgroundOptions = () => {
  try {
    const background = processBackgroundStorageDefaults(backgroundsStorage);

    return background.backgrounds.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list background options', e);
    return [[1, 'Error']];
  }
};

Blockly.defineBlocksWithJsonArray([
  // Block for selecting a background.
  {
    'type': `background_select`,
    'message0': `${BACKGROUND_ICON} Background: %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': buildBackgroundOptions(),
      },
    ],
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
    'tooltip': `Updates the background`,
  },
  // Block for the setter with an internal select
  {
    'type': `background_set_select`,
    'message0': `${BACKGROUND_ICON} Background: %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': buildBackgroundOptions(),
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Updates the background`,
  },
  // Block for the color setter.
  {
    'type': `background_set_color`,
    'message0': `${BACKGROUND_ICON} Background: set %1 ${COLOR_ICON} color to: %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Sets the background color`,
  },
  // Block for setting a playfield pixel
  {
    'type': `background_change_pixel`,
    'message0': `%1 background pixel at X %2 and Y %3`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Changes a pixel of the background`,
  },
  // Block for drawing the screen
  {
    'type': `draw_screen`,
    'message0': `Draw screen`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Draws the screen`,
  },
]);
