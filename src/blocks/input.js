import * as Blockly from 'blockly/core';
import '@blockly/field-grid-dropdown';

import {
  JOYSTICK_ICON, FIRE_ICON, DIFFICULTY_BEGINNER_ICON, DIFFICULTY_ADVANCED_ICON,
  CONSOLE_SWITCH_ICON, CONSOLE_SWITCH_RESET_ICON, CONSOLE_SWITCH_SELECT_ICON,
  CONSOLE_SWITCH_COLOR_ICON, CONSOLE_SWITCH_BW_ICON,
  PLAYER_ICON, MISSILE_ICON, BALL_ICON,
  HORIZONTAL_ICON, VERTICAL_ICON,
} from './icon';

// Every object that has an X/Y position to measure a distance between -
// unlike collision.js's own options, Playfield is left out since it has no
// single coordinate.
const DISTANCE_OBJECT_OPTIONS = [
  [PLAYER_ICON + ' Player 0', 'player0'],
  [PLAYER_ICON + ' Player 1', 'player1'],
  [MISSILE_ICON + ' Missile 0', 'missile0'],
  [MISSILE_ICON + ' Missile 1', 'missile1'],
  [BALL_ICON + ' Ball', 'ball'],
];

const buildDistanceBlock = (axis, icon) => ({
  'type': `distance_${axis}_get`,
  'message0': `${icon} Distance ${axis.toUpperCase()} between %1 and %2`,
  'args0': [
    {
      'type': 'field_dropdown',
      'name': 'VAR0',
      'options': DISTANCE_OBJECT_OPTIONS,
    },
    {
      'type': 'field_dropdown',
      'name': 'VAR1',
      'options': DISTANCE_OBJECT_OPTIONS,
    },
  ],
  'output': 'Number',
  'colour': 'purple',
  'tooltip': `The ${axis.toUpperCase()}-axis distance between the two chosen objects - ` +
    'always a positive number regardless of which one is further ' +
    `${axis === 'x' ? 'left' : 'up'}. Recomputed automatically once per frame.`,
});

const buildInputOptions = (name, difficultySwitchName) => [
  ['\u2B06 Up', `${name}up`],
  ['\u2B07 Down', `${name}down`],
  ['\u2B05 Left', `${name}left`],
  ['\u27A1 Right', `${name}right`],
  [FIRE_ICON + ' Fire', `${name}fire`],
  [DIFFICULTY_ADVANCED_ICON + ' Difficulty A', `not ${difficultySwitchName}`],
  [DIFFICULTY_BEGINNER_ICON + ' Difficulty B', `${difficultySwitchName}`],
];

const CONSOLE_SWITCH_OPTIONS = [
  [CONSOLE_SWITCH_RESET_ICON + ' Reset', 'switchreset'],
  [CONSOLE_SWITCH_SELECT_ICON + ' Select', 'switchselect'],
  [CONSOLE_SWITCH_COLOR_ICON + ' Color', 'not switchbw'],
  [CONSOLE_SWITCH_BW_ICON + ' Black/White', 'switchbw'],
];

const buildInputBlocks = ({name, description, icon, options, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': `input_${name}_get`,
      'message0': `${icon} ${description} %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
      ],
      'output': 'Boolean',
      colour,
      'tooltip': `Reads status of ${description}`,
    },
  ]);
};

buildInputBlocks({
  name: 'joy0',
  description: 'Joystick 0',
  icon: JOYSTICK_ICON,
  options: buildInputOptions('joy0', 'switchleftb'),
  colour: 'red',
});

buildInputBlocks({
  name: 'joy1',
  description: 'Joystick 1',
  icon: JOYSTICK_ICON,
  options: buildInputOptions('joy1', 'switchrightb'),
  colour: 'blue',
});

// The two objects being compared are picked at design time (dropdowns, not
// runtime state), so each distinct (axis, object pair) one of these blocks
// selects can be precomputed once per frame into its own hidden variable -
// see bbasic.js's own pre-scan (distanceChecks) and generators/bbasic/
// input.js's generateDistanceChecks - instead of branching inline every
// time it's read. The result is then just a plain number, usable directly
// in both math and logic (e.g. "if Distance X < 16") contexts like any
// other value block.
//
// Blockly.Variables.allDeveloperVariables would be the normal way to
// register a hidden variable a block needs, but it invokes
// block.getDeveloperVariables as a bare function reference rather than
// block.getDeveloperVariables(), so "this" isn't the block inside it -
// unusable for a name that depends on this block's own field values (only
// fixed, field-independent names work with it). bbasic.js's own pre-scan
// builds the exact same (axis, object pair) list directly instead.
Blockly.defineBlocksWithJsonArray([
  buildDistanceBlock('x', HORIZONTAL_ICON),
  buildDistanceBlock('y', VERTICAL_ICON),
]);

// Same idea as buildDistanceBlock above, but against an arbitrary point
// instead of a second dropdown-picked object - the second operand is a
// plain "Number" input, so it can be typed in directly or fed from a
// variable/math block. Unlike the two-object version, this can't be
// deduped by (axis, object pair) content (see bbasic.js's own pre-scan
// comment on distancePointChecks for why), so each block gets its own
// hidden per-frame variable instead.
const buildDistanceToPointBlock = (axis, icon) => ({
  'type': `distance_${axis}_to_point_get`,
  'message0': `${icon} Distance ${axis.toUpperCase()} between %1 and %2`,
  'args0': [
    {
      'type': 'field_dropdown',
      'name': 'VAR0',
      'options': DISTANCE_OBJECT_OPTIONS,
    },
    {
      'type': 'input_value',
      'name': 'POINT',
      'check': 'Number',
    },
  ],
  'inputsInline': true,
  'output': 'Number',
  'colour': 'purple',
  'tooltip': `The ${axis.toUpperCase()}-axis distance between the chosen object and an arbitrary ${axis.toUpperCase()} ` +
    'position (typed in directly, or from a variable/math block) - always a positive number regardless of ' +
    `which is further ${axis === 'x' ? 'left' : 'up'}. Recomputed automatically once per frame.`,
});

Blockly.defineBlocksWithJsonArray([
  buildDistanceToPointBlock('x', HORIZONTAL_ICON),
  buildDistanceToPointBlock('y', VERTICAL_ICON),
]);

Blockly.defineBlocksWithJsonArray([
  // Block for console switch getter.
  {
    'type': 'input_console_switch_get',
    'message0': `${CONSOLE_SWITCH_ICON} Switch %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'SWITCH',
        'options': CONSOLE_SWITCH_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': 'Reads status of the console switches',
  },
]);
