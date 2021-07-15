import * as Blockly from 'blockly/core';

const PLAYER_ICON = String.fromCodePoint(0x1F642);
const MISSILE_ICON = String.fromCodePoint(0x1F680);
const COLOR_ICON = String.fromCodePoint(0x1F3A8);
const HEIGHT_ICON = String.fromCodePoint(0x1F4CF);

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

buildSpriteBlocks({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
  options: buildPlayerOptions('player0'),
});

buildSpriteBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
  options: buildPlayerOptions('player1'),
});

buildSpriteBlocks({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
  options: buildMissileOptions('missile0'),
});
