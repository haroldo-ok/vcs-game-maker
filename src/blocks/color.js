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

const NTSC_COLORS = [
  '000000', '131313', '373737', '5f5f5f', '7a7a7a', 'a1a1a1', 'c5c5c5', 'ededed',
  '0d0000', '342100', '594502', '806c04', '9b8706', 'c2af0b', 'e7d32b', 'fffa50',
  '300000', '570500', '7b2a01', 'a15103', 'bc6c09', 'e4942d', 'fcb852', 'fee078',
  '450000', '6c0000', '901003', 'b6392b', 'd15445', 'f87c6c', 'fca090', 'fdc8b8',
  '490002', '6f0029', '93004e', 'ba2875', 'd54390', 'fa6bb7', 'fb90dc', 'fcb8ff',
  '3a0049', '620070', '850094', 'ab22bb', 'c63ed6', 'ee65fd', 'fb89ff', 'fcb2ff',
  '1c017d', '4301a4', '6602c8', '8e29f0', 'a844fe', 'cf6bfe', 'f38fff', 'fcb7ff',
  '000196', '1a02bc', '3f13e0', '673afe', '8253fe', 'a97bfe', 'cd9fff', 'f5c7ff',
  '00018d', '0006b3', '1529d8', '3f51fe', '5a6bfe', '8192fe', 'a6b6ff', 'cedeff',
  '999165', '001f8c', '0642b0', '226ad7', '3c85f2', '62acff', '87d0ff', 'aef8ff',
  '010f25', '05364c', '0e5a70', '1b8298', '2f9db3', '52c4da', '75e8fe', '99ffff',
  '022000', '0a4702', '146b26', '1f934e', '30ae69', '52d590', '73f9b4', '95ffdb',
  '032700', '0c4e02', '167203', '269a0c', '3ab523', '5ddc4a', '80ff6e', 'a2ff95',
  '032200', '0b4a01', '176e03', '379506', '4fb009', '75d81a', '99fc3a', 'bdff5f',
  '011300', '0d3a01', '2f5f02', '568605', '70a108', '98c80c', 'bced23', 'e2ff47',
  '090000', '302400', '554802', '7c6f04', '978a06', 'bfb20b', 'e3d628', 'fffd4d',
];

const colorToDataURL = (color) => {
  const canvas = window.document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.toDataURL();
};

const NTSC_COLOR_OPTIONS = NTSC_COLORS.map((color, idx) => ([
  {
    src: colorToDataURL(`#${color}`),
    width: 16,
    height: 16,
  },
  `${idx}`,
]));

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
    'message0': `${COLOR_ICON} Color %1`,
    'args0': [
      {
        'type': 'field_grid_dropdown',
        'name': 'COLOR',
        'columns': 8,
        'options': NTSC_COLOR_OPTIONS,
      },
    ],
    'output': 'Number',
    'icon': COLOR_ICON,
    'colour': 'purple',
    'tooltip': 'Select a color to use.',
  },
]);
