import * as Blockly from 'blockly/core';

const options = [
  ['Player 0', 'player0'],
  ['Player 1', 'player1'],
  ['Missile 0', 'missile0'],
  ['Missile 1', 'missile1'],
  ['Ball', 'ball'],
  ['Playfield', 'playfield'],
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
