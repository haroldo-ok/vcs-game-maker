import * as Blockly from 'blockly/core';

import {processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {usePlayer0Storage, usePlayer1Storage} from '../hooks/project';
import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, COLOR_ICON, HEIGHT_ICON, ANIMATION_ICON, VISIBILITY_ICON, HORIZONTAL_ICON, VERTICAL_ICON, MIRROR_ICON, FRAME_ICON, PLAY_ICON, PAUSE_ICON} from './icon';

// The generated code dispatches on the animation's position in the list
// ("if player0animation = 2 ..."), not on its id, so the option value is the
// index. Storage is read afresh on each call rather than through a cached
// computed, so renamed and added animations show up without a reload.
const buildAnimationOptions = (storageFactory) => () => {
  try {
    const player = processPlayerStorageDefaults(storageFactory());
    return player.animations.map((animation, index) =>
      [animation.name || `Unnamed ${index + 1}`, `${index}`]);
  } catch (e) {
    console.error('Failed to list animation options', e);
    return [['Error', '0']];
  }
};

// Defined programmatically because a JSON definition can only hold a fixed list
// of options, and this one has to be rebuilt each time the dropdown opens.
const buildAnimationSelectBlock = ({name, description, icon, colour, storageFactory}) => {
  // Value block: picks an animation by name and reports its number, so it can
  // be plugged into the sprite setter or anywhere else a number is wanted.
  Blockly.Blocks[`sprite_${name}_animation_select`] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} ${description} ${ANIMATION_ICON} Animation:`)
          .appendField(
              new Blockly.FieldDropdown(buildAnimationOptions(storageFactory)), 'VAR');
      this.setOutput(true, 'Number');
      this.setColour(colour);
      this.setTooltip(`Selects one of ${description}'s animations by name`);
    },
  };
};

const buildPlayerOptions = (name) => [
  [HORIZONTAL_ICON + ' X', `${name}x`],
  [VERTICAL_ICON + ' Y', `${name}y`],
  [COLOR_ICON + ' Color', `${name}realcolor`],
  [ANIMATION_ICON + ' Animation', `${name}animation`],
  [MIRROR_ICON + ' Horizontal flip', `__${name}size_3_`],
];

const buildMissileOptions = (name) => [
  [HORIZONTAL_ICON + ' X', `${name}x`],
  [VERTICAL_ICON + ' Y', `${name}y`],
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

const MISSILE_SIZE_OPTIONS = [
  ['1', '$00'],
  ['2', '$10'],
  ['4', '$20'],
  ['8', '$30'],
];

const buildSpriteBlocks = ({name, description, icon, options=[], writeOnlyOptions=[], readOnlyOptions=[], colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': `sprite_${name}_get`,
      'message0': `${icon} ${description} %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': [...options, ...readOnlyOptions],
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
          'options': [...options, ...writeOnlyOptions],
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
      'message0': `${icon} ${description} set width/quantity to %1`,
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
    // Block for pausing/resuming a player's animation.
    {
      'type': `sprite_${name}_animation_playback`,
      'message0': `${icon} ${description} ${ANIMATION_ICON} animation %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'STATE',
          'options': [
            [`${PLAY_ICON} Play`, 'play'],
            [`${PAUSE_ICON} Pause`, 'pause'],
          ],
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Plays or pauses ${description}'s animation`,
    },
  ]);
};

const buildMissileBlocks = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for changing a player's size and quantity.
    {
      'type': `sprite_${name}_size`,
      'message0': `${icon} ${description} set width to %1 pixels`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'SIZE',
          'options': MISSILE_SIZE_OPTIONS,
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
  writeOnlyOptions: [
    [VISIBILITY_ICON + ' Visibility', 'player0visibility'],
  ],
  readOnlyOptions: [
    [FRAME_ICON + ' Frame', 'player0frame'],
  ],
});

buildPlayerBlocks({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
});

buildAnimationSelectBlock({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
  storageFactory: usePlayer0Storage,
});

buildSpriteBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
  options: buildPlayerOptions('player1'),
  writeOnlyOptions: [
    [VISIBILITY_ICON + ' Visibility', 'player1visibility'],
  ],
  readOnlyOptions: [
    [FRAME_ICON + ' Frame', 'player1frame'],
  ],
});

buildPlayerBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
});

buildAnimationSelectBlock({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
  storageFactory: usePlayer1Storage,
});

buildSpriteBlocks({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
  options: buildMissileOptions('missile0'),
});

buildMissileBlocks({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
});

buildSpriteBlocks({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
  options: buildMissileOptions('missile1'),
});

buildMissileBlocks({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
});

buildSpriteBlocks({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
  options: buildMissileOptions('ball'),
  writeOnlyOptions: [
    [HEIGHT_ICON + ' Width', 'ballwidth'],
  ],
});
