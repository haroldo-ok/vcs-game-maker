import * as Blockly from 'blockly/core';

Blockly.defineBlocksWithJsonArray([ // BEGIN JSON EXTRACT
  // Block for reading from player 0.
  {
    'type': 'sprite_player0_get',
    'message0': 'Player 0 %1',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['X', 'player0x'],
          ['Y', 'player0y'],
          ['Color', 'player0color'],
        ],
      },
    ],
    'output': 'Number',
    'colour': 'red',
    'tooltip': 'Reads information about player zero',
  },
]);
