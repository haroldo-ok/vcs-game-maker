/* eslint-disable require-jsdoc */
import * as Blockly from 'blockly/core';
import '@blockly/field-grid-dropdown';

import {
  JOYSTICK_ICON, FIRE_ICON, DIFFICULTY_BEGINNER_ICON, DIFFICULTY_ADVANCED_ICON,
  CONSOLE_SWITCH_ICON, CONSOLE_SWITCH_RESET_ICON, CONSOLE_SWITCH_SELECT_ICON,
  CONSOLE_SWITCH_COLOR_ICON, CONSOLE_SWITCH_BW_ICON,
  COLOR_ICON,
} from './icon';

const buildInputOptions = (name, difficultySwitchName) => [
  ['\u2B06 Up', `${name}up`],
  ['\u2B07 Down', `${name}down`],
  ['\u2B05 Left', `${name}left`],
  ['\u27A1 Right', `${name}right`],
  [FIRE_ICON + ' Fire', `${name}fire`],
  [DIFFICULTY_ADVANCED_ICON + ' Difficulty A', `not ${difficultySwitchName}`],
  [DIFFICULTY_BEGINNER_ICON + ' Difficulty B', `${difficultySwitchName}`],
];

const CONSOLE_SWITCH_OPTIONS = [
  [CONSOLE_SWITCH_RESET_ICON + ' Reset', 'switchreset'],
  [CONSOLE_SWITCH_SELECT_ICON + ' Select', 'switchselect'],
  [CONSOLE_SWITCH_COLOR_ICON + ' Color', 'not switchbw'],
  [CONSOLE_SWITCH_BW_ICON + ' Black/White', 'switchbw'],
];

const buildInputBlocks = ({name, description, icon, options, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': `input_${name}_get`,
      'message0': `${icon} ${description} %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
      ],
      'output': 'Boolean',
      colour,
      'tooltip': `Reads status of ${description}`,
    },
  ]);
};

buildInputBlocks({
  name: 'joy0',
  description: 'Joystick 0',
  icon: JOYSTICK_ICON,
  options: buildInputOptions('joy0', 'switchleftb'),
  colour: 'red',
});

buildInputBlocks({
  name: 'joy1',
  description: 'Joystick 1',
  icon: JOYSTICK_ICON,
  options: buildInputOptions('joy1', 'switchrightb'),
  colour: 'blue',
});

/*
const createColorElement = () => {
  const div = document.createElement('div');
  div.innerHTML = 'aaaa';
  return div;
};
*/

Blockly.defineBlocksWithJsonArray([
  // Block for console switch getter.
  {
    'type': 'input_console_switch_get',
    'message0': `${CONSOLE_SWITCH_ICON} Switch %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'SWITCH',
        'options': CONSOLE_SWITCH_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': 'Reads status of the console switches',
  },

  {
    'type': 'color_get',
    'message0': 'Color %1',
    'args0': [
      {
        'type': 'field_grid_dropdown',
        'name': 'COLOR',
        'options': [
          ['Aaaa', 'A'], ['B', 'B'], ['C', 'C'], ['D', 'D'],
          ['E', 'E'], ['F', 'F'], ['G', 'G'], ['H', 'H'],
        ],
      },
    ],
    'output': 'Number',
    'icon': COLOR_ICON,
    'colour': 'purple',
    'tooltip': 'Select a color to use.',
    'extensions': ['flag_with_text_extension'],
  },
]);

Blockly.Extensions.register('flag_with_text_extension',
    function(a) {
      function createFlagWithTextDiv(text, src) {
        const div = document.createElement('div');
        div.setAttribute('style', 'width: 75px;');
        div.setAttribute('title', text);
        const img = document.createElement('img');
        img.setAttribute('src', src);
        img.setAttribute('style', 'height: 25px; display: block; margin: auto;');
        div.appendChild(img);
        const para = document.createElement('p');
        para.innerText = text;
        para.setAttribute('style', 'text-align: center; margin: 5px;');
        div.appendChild(para);
        return div;
      }

      const canadaDiv = createFlagWithTextDiv('Canada', 'canada.png');
      const usaDiv = createFlagWithTextDiv('USA', 'usa.png');
      const mexicoDiv = createFlagWithTextDiv('Mexico', 'mexico.png');
      const options = [
        ['none', 'NONE'],
        [canadaDiv, 'CANADA'],
        [usaDiv, 'USA'],
        [mexicoDiv, 'MEXICO'],
      ];

      // eslint-disable-next-line no-invalid-this
      const b = this;
      console.log('!!', {b, a});

      b.getField('COLOR').setOptions(options);
    });
