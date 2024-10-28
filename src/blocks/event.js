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

const STATE_OPTIONS = [
  [`${TITLE_ICON} Title screen`, 'title'],
  [`${GAME_ICON} Gameplay`, 'gameplay'],
  [`${GAMEOVER_ICON} Gameover`, 'gameover'],
];

const FRAME_OPTIONS = [...Array(8).keys()]
    .map((n) => Math.pow(2, n))
    .map((n) => [`${n}`, `${n - 1}`]);

Blockly.defineBlocksWithJsonArray([
  // Block for events
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
    'tooltip': 'Will be executed when a given event happens',
  },

  // Block for changing game state
  {
    'type': 'event_change_state',
    'message0': 'Change state to %1',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'STATE',
        'options': STATE_OPTIONS,
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Change game state to a given one',
  },

  // Block for even/odd frames
  {
    'type': 'event_frame_even_odd',
    'message0': 'On even frames',
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO_EVEN',
    }],
    'message2': 'On odd frames',
    'message3': '%1',
    'args3': [{
      'type': 'input_statement',
      'name': 'DO_ODD',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Change game state to a given one',
  },

  // Block for executing every "n" frames
  {
    'type': 'event_frame_every_n',
    'message0': 'Every %1 frames, plus %2',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'MASK',
        'options': FRAME_OPTIONS,
      },
      {
        'type': 'field_number',
        'name': 'DELTA',
        'value': 0,
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
    'tooltip': 'Execute code every few frames',
  },

]);
