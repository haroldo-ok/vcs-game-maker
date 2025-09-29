'use strict';

import * as Blockly from 'blockly/core';

import {useBackgroundsStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';
import {BACKGROUND_ICON, COLOR_ICON, CHECKBOX_CHECKED_ICON, CHECKBOX_CLEAR_ICON, FLIP_ICON, BACKGROUND_PFSCROLL_LEFT_ICON, BACKGROUND_PFSCROLL_RIGHT_ICON, BACKGROUND_PFSCROLL_UP_ICON, BACKGROUND_PFSCROLL_DOWN_ICON, BACKGROUND_PFSCROLL_DOWN2X_ICON, BACKGROUND_PFSCROLL_UP2X_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

const BACKGROUND_PFPIXEL_OPTIONS = [
  [`${CHECKBOX_CHECKED_ICON} Set`, 'on'],
  [`${CHECKBOX_CLEAR_ICON} Clear`, 'off'],
  [`${FLIP_ICON} Flip`, 'flip'],
];

const BACKGROUND_LINE_DIRECTION_OPTIONS = [
  [`Horizontal`, 'pfhline'],
  [`Vertical`, 'pfvline'],
];

const BACKGROUND_PFSCROLL_OPTIONS = [
  [`${BACKGROUND_PFSCROLL_LEFT_ICON} Left`, 'left'],
  [`${BACKGROUND_PFSCROLL_RIGHT_ICON} Right`, 'right'],
  [`${BACKGROUND_PFSCROLL_UP_ICON} Up`, 'up'],
  [`${BACKGROUND_PFSCROLL_DOWN_ICON} Down`, 'down'],
  [`${BACKGROUND_PFSCROLL_UP2X_ICON} Up (2x)`, 'upup'],
  [`${BACKGROUND_PFSCROLL_DOWN2X_ICON} Down (2x)`, 'downdown'],
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
    'message0': `${BACKGROUND_ICON} Background: %1 pixel at X %2 and Y %3`,
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
  // Block for drawing an horizontal/vertical line
  {
    'type': `background_change_hv_line`,
    'message0': `${BACKGROUND_ICON} Background:  %1 %2 %3 pixels at X %4 and Y %5`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIRECTION',
        'options': BACKGROUND_LINE_DIRECTION_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'LENGTH',
        'check': 'Number',
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
  // Block for scrolling the background
  {
    'type': `background_scroll`,
    'message0': `${BACKGROUND_ICON} Background: scroll %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIRECTION',
        'options': BACKGROUND_PFSCROLL_OPTIONS,
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Scrolls the background on a certain direction`,
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
