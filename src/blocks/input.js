import * as Blockly from 'blockly/core';

import {JOYSTICK_ICON, FIRE_ICON, PLAYER_ICON} from './icon';

const buildInputOptions = (name, difficultySwitchName) => [
  ['\u2B06 Up', `${name}up`],
  ['\u2B07 Down', `${name}down`],
  ['\u2B05 Left', `${name}left`],
  ['\u27A1 Right', `${name}right`],
  [FIRE_ICON + ' Fire', `${name}fire`],
  [PLAYER_ICON + ' Difficulty B', `${difficultySwitchName}`],
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
