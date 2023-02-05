'use strict';

import * as Blockly from 'blockly/core';

import {useBackgroundsStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';
import {BACKGROUND_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

const backgroundsStorage = useBackgroundsStorage();

const buildBackgroundOptions = () => {
  try {
    // TODO: Share this constant with BackgroundEditor.vue
    const defaultBackgrounds = {
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

    const background = backgroundsStorage.value || defaultBackgrounds;

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
]);
