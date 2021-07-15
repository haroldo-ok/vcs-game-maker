import * as Blockly from 'blockly/core';

Blockly.defineBlocksWithJsonArray([ // BEGIN JSON EXTRACT
  // Block for Player 0 getter.
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
  // Block for Player 0 setter.
  {
    'type': 'sprite_player0_set',
    'message0': 'Player 0: %{BKY_VARIABLES_SET}',
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
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'red',
    'tooltip': 'Updates information about player zero',
  },
]);
