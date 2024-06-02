import * as Blockly from 'blockly/core';

import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, COLOR_ICON, HEIGHT_ICON} from './icon';

const buildPlayerOptions = (name) => [
  ['\u2195 X', `${name}x`],
  ['\u2195 Y', `${name}y`],
  [COLOR_ICON + ' Color', `${name}color`],
];

const buildMissileOptions = (name) => [
  ['\u2195 X', `${name}x`],
  ['\u2195 Y', `${name}y`],
  [HEIGHT_ICON + ' Height', `${name}height`],
];

const PLAYER_SIZE_OPTIONS = [
  ['1 copy of player and missile.', '$0'],
  ['2 close-spaced copies of player and missile.', '$1'],
  ['2 medium-spaced copies of player and missile.', '$2'],
  ['3 close-spaced copies of player and missile.', '$3'],
  ['2 wide-spaced copies of player and missile.', '$4'],
  ['Double-sized player.', '$5'],
  ['3 medium-spaced copies of player and missile.', '$6'],
  ['Quad-sized', '$7'],
];

const buildSpriteBlocks = ({name, description, icon, options, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': `sprite_${name}_get`,
      'message0': `${icon} ${description} %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
      ],
      'output': 'Number',
      colour,
      'tooltip': `Reads information about ${description}`,
    },
    // Block for the setter.
    {
      'type': `sprite_${name}_set`,
      'message0': `${icon} ${description}: %{BKY_VARIABLES_SET}`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
        {
          'type': 'input_value',
          'name': 'VALUE',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Updates information about ${description}`,
    },
    // Block for adding to a variable in place.
    {
      'type': `sprite_${name}_change`,
      'message0': `${icon} ${description}: %{BKY_MATH_CHANGE_TITLE}`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
        {
          'type': 'input_value',
          'name': 'DELTA',
          'check': 'Number',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['math_change_tooltip'],
    },
  ]);
};

const buildPlayerBlocks = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for changing a player's size and quantity.
    {
      'type': `sprite_${name}_size`,
      'message0': `${icon} ${description} change width/quantity to %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'SIZE',
          'options': PLAYER_SIZE_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['math_change_tooltip'],
    },
  ]);
};

buildSpriteBlocks({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
  options: buildPlayerOptions('player0'),
});

buildPlayerBlocks({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
});

buildSpriteBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
  options: buildPlayerOptions('player1'),
});

buildPlayerBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
});

buildSpriteBlocks({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
  options: buildMissileOptions('missile0'),
});

buildSpriteBlocks({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
  options: buildMissileOptions('missile1'),
});

buildSpriteBlocks({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
  options: buildMissileOptions('ball'),
});
