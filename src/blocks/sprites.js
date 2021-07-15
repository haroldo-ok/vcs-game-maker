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
  // Block for adding to a Player 0 variable in place.
  {
    'type': 'sprite_player0_change',
    'message0': String.fromCodePoint(0x1F642) + ' Player 0: %{BKY_MATH_CHANGE_TITLE}',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['\u2195 X', 'player0x'],
          ['\u2195 Y', 'player0y'],
          [String.fromCodePoint(0x1F3A8) + ' Color', 'player0color'],
        ],
      },
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'red',
    'extensions': ['math_change_tooltip'],
  },
]);
