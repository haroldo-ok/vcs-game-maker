import * as Blockly from 'blockly/core';
import '@blockly/field-grid-dropdown';

import {
  JOYSTICK_ICON, FIRE_ICON, DIFFICULTY_BEGINNER_ICON, DIFFICULTY_ADVANCED_ICON,
  CONSOLE_SWITCH_ICON, CONSOLE_SWITCH_RESET_ICON, CONSOLE_SWITCH_SELECT_ICON,
  CONSOLE_SWITCH_COLOR_ICON, CONSOLE_SWITCH_BW_ICON,
  PLAYER_ICON, MISSILE_ICON, BALL_ICON,
  HORIZONTAL_ICON, VERTICAL_ICON, KEYPAD_ICON,
} from './icon';
import {registerDropdownFieldSyncExtension} from './sprites';

// Every object that has an X/Y position to measure a distance between -
// unlike collision.js's  options, Playfield is left out since it has no
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

// The four diagonals are not real bB switches: the generator turns each one
// into the two straight directions it is made of (see the input_joystick_get
// generator in generators/bbasic/input.js), so their option values are only
// markers. All eight run clockwise from Up, the same order as the Fire
// block's angles.
const buildInputOptions = (name, difficultySwitchName) => [
  ['\u2B06 Up', `${name}up`],
  ['\u2197 Up-Right', `${name}upright`],
  ['\u27A1 Right', `${name}right`],
  ['\u2198 Down-Right', `${name}downright`],
  ['\u2B07 Down', `${name}down`],
  ['\u2199 Down-Left', `${name}downleft`],
  ['\u2B05 Left', `${name}left`],
  ['\u2196 Up-Left', `${name}upleft`],
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

// Same "bare 0/1, not Joystick 0/Joystick 1" reasoning as PLAYER_OPTIONS/
// MISSILE_OPTIONS in blocks/sprites.js - every combined Joystick block's
// message0 already has a static "Joystick" word right before this dropdown.
const JOYSTICK_OPTIONS = [['0', '0'], ['1', '1']];

const joystickNameFromField = (block) => `joy${block && block.getFieldValue('JOYSTICK') === '1' ? '1' : '0'}`;

// Joystick 0's Difficulty switch is switchleftb, Joystick 1's is
// switchrightb (real bB names, not something this project chose) - the one
// piece of buildInputOptions' option list that isn't a simple
// name-prefix swap, so it needs a small dedicated lookup instead of falling
// out of joystickNameFromField automatically.
const DIFFICULTY_SWITCH_NAME = {joy0: 'switchleftb', joy1: 'switchrightb'};

// Same "build VAR's options fresh every time, reading the OTHER dropdown
// off the block itself" shape as buildPlayerVarOptionsFn/
// buildMissileVarOptionsFn in blocks/sprites.js - the real option list
// (joy0up/joy0fire/... vs joy1up/joy1fire/...) depends on whichever
// joystick this block's JOYSTICK field currently holds.
const buildJoystickVarOptionsFn = () => function() {
  // eslint-disable-next-line no-invalid-this
  const name = joystickNameFromField(this.getSourceBlock());
  return buildInputOptions(name, DIFFICULTY_SWITCH_NAME[name]);
};

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'input_joystick_get',
    'message0': `${JOYSTICK_ICON} Joystick %1 %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'JOYSTICK',
        'options': JOYSTICK_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': buildJoystickVarOptionsFn(),
      },
    ],
    'inputsInline': true,
    'output': 'Boolean',
    'colour': 'red',
    'extensions': ['input_joystick_field_sync'],
    'tooltip': 'Reads status of the chosen joystick input. A diagonal (such as Up-Right) is true ' +
      'while both of its directions are pushed.',
  },
]);

registerDropdownFieldSyncExtension('input_joystick_field_sync', 'JOYSTICK',
    (value) => `joy${value === '1' ? '1' : '0'}`);

// One 0-7 direction per joystick, clockwise from Up (0=Up, 1=Up-Right,
// 2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left), or 255
// if the joystick isn't currently pushed in any single clear direction
// (centered, or a contradictory combination like Up+Down together) - see
// generators/bbasic/input.js's  comment for the full up/down/left/right
// -> direction table. Meant to plug straight into "Fire missile"'s
// Angle input (see blocks/sprites.js) - a literal Math Number (matching
// this same 0-7/255 encoding) or a variable holding a previously-computed
// angle work there too, this block is just the common "read it from
// whichever way the joystick is pushed right now" case.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'input_joystick_direction8',
    'message0': `${JOYSTICK_ICON} Joystick %1 direction (8-way)`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'JOYSTICK',
        'options': JOYSTICK_OPTIONS,
      },
    ],
    'inputsInline': true,
    'output': 'Number',
    'colour': 'red',
    'extensions': ['input_joystick_field_sync'],
    'tooltip': 'The 8-way direction the chosen joystick is currently pushed (0=Up, 1=Up-Right, ' +
      '2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left, clockwise from Up), or 255 ' +
      'if it\'s centered or pushed in a contradictory combination. Recomputed every time this is ' +
      'read.',
  },
]);

// Fire-button press-pattern detection, one combined block covering both
// joysticks (a JOYSTICK dropdown, same combined shape as input_joystick_get/
// input_joystick_direction8 above, plus a MODE dropdown picking which
// pattern - see generators/bbasic/input.js's generateJoystickButtonChecks/
// generateJoystickDoubleTapChecks for the per-frame held-duration/edge
// tracking this reads back from (joy0fire/joy1fire themselves are only ever
// valid in a boolean/branch context - see that file's  comment - so none
// of this can be computed inline at the getter's  call site). Fire-
// specific (not Up/Down/Left/Right) since "tap"/"hold"/"double-tap" only
// make sense for a single momentary button, not a direction that's
// naturally held for as long as it's pushed.
const FIRE_PATTERN_OPTIONS = [
  ['tapped', 'TAP'],
  ['held', 'HOLD'],
  ['released', 'RELEASED'],
  ['double-tapped', 'DOUBLE_TAP'],
];

// FRAMES lives in its dummy input (FRAMES_INPUT), separate from JOYSTICK's/
// MODE's, so the 'input_fire_pattern_frames_sync' extension below can hide
// the whole thing when MODE is "released" - "frames" is explicitly
// documented as ignored entirely for that pattern (see this block's
// tooltip), so there's nothing useful to show/edit there. A JS init() block
// (not the JSON-array shape most blocks in this file use) since JSON block
// definitions don't give a message/args line's auto-created dummy input a
// name to look up later - appendDummyInput() does.
Blockly.Blocks['input_joystick_fire_pattern'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(FIRE_ICON + ' Joystick')
        .appendField(new Blockly.FieldDropdown(JOYSTICK_OPTIONS), 'JOYSTICK')
        .appendField('Fire')
        .appendField(new Blockly.FieldDropdown(FIRE_PATTERN_OPTIONS), 'MODE');
    this.appendDummyInput('FRAMES_INPUT')
        .appendField(new Blockly.FieldNumber(20, 1, 255, 1), 'FRAMES')
        .appendField('frames');
    this.setInputsInline(true);
    this.setOutput(true, 'Boolean');
    this.setColour('red');
    Blockly.Extensions.apply('input_joystick_field_sync', this, false);
    Blockly.Extensions.apply('input_fire_pattern_frames_sync', this, false);
    this.setTooltip('Reads the chosen joystick\'s Fire button press pattern - "frames" means ' +
      'something different depending on which pattern is picked (60 frames = 1 second), and is ' +
      'ignored entirely for "released" (hidden for that pattern - there\'s nothing to set):\n' +
      '• tapped - true for exactly one frame, the instant Fire is released, but only if the ' +
      'press that just ended lasted no longer than "frames" (a quick press-and-release).\n' +
      '• held - true on every frame Fire has been continuously held down for at least ' +
      '"frames" so far - stays true for as long as it\'s still held past that point, not just one ' +
      'frame.\n' +
      '• released - true for exactly one frame, the instant Fire goes from held down to ' +
      'released.\n' +
      '• double-tapped - true for exactly one frame, the instant Fire is released for the ' +
      'SECOND time within "frames" of the first release. Every release starts (or restarts) its ' +
      'new window; a release that doesn\'t land inside a still-open window from an earlier release ' +
      'just opens another window instead of triggering this. Doesn\'t care how long either ' +
      'individual press was held, only the gap between the two releases.');
  },
};

// Hides FRAMES_INPUT entirely while MODE is "released" (see
// input_joystick_fire_pattern's init() comment on why) - applied once
// immediately (a fresh block's initial MODE could already be "released",
// e.g. loaded from a saved project) and again every time MODE changes.
// Registered as a VALIDATOR on the MODE field, not
// Blockly.Block.prototype.setOnChange - same reasoning as
// registerDropdownFieldSyncExtension's comment in blocks/sprites.js:
// setOnChange never fires for a block built from toolbox flyout XML (events
// disabled during that construction), so a block dragged out already set to
// "released" would show a useless FRAMES field forever; a field's local
// validator runs unconditionally from inside setValue() itself, XML load or
// live edit alike. Independent of (and applied alongside)
// 'input_joystick_field_sync' above - different field (MODE, not JOYSTICK),
// so the two validators never conflict.
Blockly.Extensions.register('input_fire_pattern_frames_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const modeField = block.getField('MODE');
  if (!modeField) return;
  const applyVisibility = (mode) => {
    // Same headless-workspace guard as updateFunctionCallArgVisibility in
    // blocks/function.js, but checked BEFORE input.setVisible() itself
    // (not just the render()/resizeContents() calls below it) - setVisible()
    // is the call that actually crashes on a headless workspace ("...
    // stopTrackingAll is not a function" - see function.js's comment for the
    // full explanation), not just the rendering that follows it. Visibility
    // is a purely visual concern the generator itself never reads, so
    // skipping it entirely on a headless workspace is always safe.
    if (!block.workspace || !block.workspace.rendered) return;
    const input = block.getInput('FRAMES_INPUT');
    if (!input) return;
    const shouldBeVisible = mode !== 'RELEASED';
    if (input.isVisible() === shouldBeVisible) return;
    input.setVisible(shouldBeVisible);
    if (typeof block.queueRender === 'function') block.queueRender();
    else if (typeof block.render === 'function') block.render();
    if (block.workspace.resizeContents) block.workspace.resizeContents();
  };
  applyVisibility(modeField.getValue());
  modeField.setValidator(function(newValue) {
    applyVisibility(newValue);
    return undefined;
  });
});

// Key values 1-12 read in the same reading order the physical Atari
// keypad's 3x4 grid is wired in - 1,2,3 / 4,5,6 / 7,8,9 / *,0,#. 0 itself is
// reserved for "no key pressed", not a selectable option here (a getter
// checks one specific key, not "any key"/"no key" - a project that needs
// that can just compare every key block to false).
const KEYPAD_KEY_OPTIONS = [
  ['1', '1'], ['2', '2'], ['3', '3'],
  ['4', '4'], ['5', '5'], ['6', '6'],
  ['7', '7'], ['8', '8'], ['9', '9'],
  ['*', '10'], ['0', '11'], ['#', '12'],
];

// Same "bare 0/1, not Keypad 0/Keypad 1" reasoning as JOYSTICK_OPTIONS
// above - every combined Keypad block's message0 already has a static
// "Keypad" word right before this dropdown.
const KEYPAD_OPTIONS = [['0', '0'], ['1', '1']];

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'input_keypad_get',
    'message0': `${KEYPAD_ICON} Keypad %1 key %2 is pressed`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'KEYPAD',
        'options': KEYPAD_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'KEY',
        'options': KEYPAD_KEY_OPTIONS,
      },
    ],
    'inputsInline': true,
    'output': 'Boolean',
    'colour': 'red',
    'extensions': ['input_keypad_field_sync'],
    'tooltip': 'Reads whether the given key is currently pressed on the chosen keypad ' +
      '(the Atari Keypad/Kids Controller peripheral) - recomputed automatically once per frame.',
  },
  // True while ANY key is held on the chosen keypad - the same underlying
  // per-frame scan value input_keypad_get's equality check reads (0 = no
  // key currently pressed - see KEYPAD_KEY_OPTIONS' comment above), just
  // compared against 0 instead of one specific key.
  {
    'type': 'input_keypad_any_pressed',
    'message0': `${KEYPAD_ICON} Any key is pressed on Keypad %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'KEYPAD',
        'options': KEYPAD_OPTIONS,
      },
    ],
    'inputsInline': true,
    'output': 'Boolean',
    'colour': 'red',
    'extensions': ['input_keypad_field_sync'],
    'tooltip': 'Reads whether any key is currently held on the chosen keypad ' +
      '(the Atari Keypad/Kids Controller peripheral) - recomputed automatically once per frame.',
  },
  // The raw scanned key ID as a Number (1-12, same numbering as
  // KEYPAD_KEY_OPTIONS above, or 0 the instant nothing is held) - lets a
  // project read/store/compare WHICH key is pressed at runtime, rather than
  // only checking one fixed key like input_keypad_get does.
  {
    'type': 'input_keypad_id_get',
    'message0': `${KEYPAD_ICON} Key ID pressed on Keypad %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'KEYPAD',
        'options': KEYPAD_OPTIONS,
      },
    ],
    'inputsInline': true,
    'output': 'Number',
    'colour': 'red',
    'extensions': ['input_keypad_field_sync'],
    'tooltip': 'The ID (1-12: 1-9, then *, 0, # - see "Keypad key is pressed"\'s dropdown ' +
      'order) of whichever key is currently held on the chosen keypad (the Atari Keypad/Kids ' +
      'Controller peripheral), or 0 the instant no key is held. Recomputed automatically once ' +
      'per frame.',
  },
]);

registerDropdownFieldSyncExtension('input_keypad_field_sync', 'KEYPAD',
    (value) => `keypad${value === '1' ? '1' : '0'}`);

// The two objects being compared are picked at design time (dropdowns, not
// runtime state), so each distinct (axis, object pair) one of these blocks
// selects can be precomputed once per frame into its  hidden variable -
// see bbasic.js's  pre-scan (distanceChecks) and generators/bbasic/
// input.js's generateDistanceChecks - instead of branching inline every
// time it's read. The result is then just a plain number, usable directly
// in both math and logic (e.g. "if Distance X < 16") contexts like any
// other value block.
//
// Blockly.Variables.allDeveloperVariables would be the normal way to
// register a hidden variable a block needs, but it invokes
// block.getDeveloperVariables as a bare function reference rather than
// block.getDeveloperVariables(), so "this" isn't the block inside it -
// unusable for a name that depends on this block's  field values (only
// fixed, field-independent names work with it). bbasic.js's  pre-scan
// builds the exact same (axis, object pair) list directly instead.
Blockly.defineBlocksWithJsonArray([
  buildDistanceBlock('x', HORIZONTAL_ICON),
  buildDistanceBlock('y', VERTICAL_ICON),
]);

// Same idea as buildDistanceBlock above, but against an arbitrary point
// instead of a second dropdown-picked object - the second operand is a
// plain "Number" input, so it can be typed in directly or fed from a
// variable/math block. Unlike the two-object version, this can't be
// deduped by (axis, object pair) content (see bbasic.js's  pre-scan
// comment on distancePointChecks for why), so each block gets its
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
    'message0': `${CONSOLE_SWITCH_ICON} Switch %1 %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'SWITCH',
        'options': CONSOLE_SWITCH_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'MODE',
        'options': [['is on', 'HELD'], ['was just switched on', 'ONCE']],
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': 'Reads status of the console switches. "is on" stays true while the switch is held; ' +
      '"was just switched on" is true for one frame each time it is switched on.',
  },
]);
