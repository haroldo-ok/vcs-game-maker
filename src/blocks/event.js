import * as Blockly from 'blockly/core';
import {START_ICON, SYSTEM_ICON} from './icon';

const EVENT_OPTIONS = [
  [`${SYSTEM_ICON} ${START_ICON} System start`, `system_start`],
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
