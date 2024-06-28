import * as Blockly from 'blockly/core';
import {GAMEOVER_ICON, GAME_ICON, START_ICON, SYSTEM_ICON, TITLE_ICON, UPDATE_ICON} from './icon';

const EVENT_OPTIONS = [
  [`${SYSTEM_ICON} ${START_ICON} System start`, `system_start`],
  [`${TITLE_ICON} ${START_ICON} Title screen start`, `title_start`],
  [`${TITLE_ICON} ${UPDATE_ICON} Title screen update`, `title_update`],
  [`${GAME_ICON} ${START_ICON} Gameplay start`, `gameplay_start`],
  [`${GAMEOVER_ICON} ${START_ICON} Gameover start`, `gameover_start`],
  [`${GAMEOVER_ICON} ${UPDATE_ICON} Gameover update`, `gameover_update`],
];

Blockly.defineBlocksWithJsonArray([
  // Block for startup code
  {
    'type': 'event_block',
    'message0': 'On %1',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'EVENT',
        'options': EVENT_OPTIONS,
      },
    ],
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Will be executed exactly one time when the ROM boots up',
  },
]);
