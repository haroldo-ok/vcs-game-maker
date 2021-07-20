import * as Blockly from 'blockly/core';

import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, PLAYFIELD_ICON} from './icon';

const options = [
  [PLAYER_ICON + ' Player 0', 'player0'],
  [PLAYER_ICON + ' Player 1', 'player1'],
  [MISSILE_ICON + ' Missile 0', 'missile0'],
  [MISSILE_ICON + ' Missile 1', 'missile1'],
  [BALL_ICON + ' Ball', 'ball'],
  [PLAYFIELD_ICON + ' Playfield', 'playfield'],
];

Blockly.defineBlocksWithJsonArray([
  // Block for the getter.
  {
    'type': `collision_get`,
    'message0': `Collided %1 and %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR0',
        options,
      },
      {
        'type': 'field_dropdown',
        'name': 'VAR1',
        options,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': `Checks if the objects colided.`,
  },
]);
