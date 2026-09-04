import * as Blockly from 'blockly/core';

import {processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {usePlayer0Storage, usePlayer1Storage} from '../hooks/project';
import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, COLOR_ICON, HEIGHT_ICON, ANIMATION_ICON, VISIBILITY_ICON, HORIZONTAL_ICON, VERTICAL_ICON, MIRROR_ICON, FRAME_ICON, PLAY_ICON, PAUSE_ICON, PRIORITY_ICON, DATA_ICON, SEEK_ICON} from './icon';

const PRIORITY_COLOUR = '#009688';

// The generated code dispatches on the animation's position in the list
// ("if player0animation = 2 ..."), not on its id, so the option value is the
// index. Storage is read afresh on each call rather than through a cached
// computed, so renamed and added animations show up without a reload.
const buildAnimationOptions = (storageFactory) => () => {
  try {
    const player = processPlayerStorageDefaults(storageFactory());
    return player.animations.map((animation, index) =>
      [animation.name || `Unnamed ${index + 1}`, `${index}`]);
  } catch (e) {
    console.error('Failed to list animation options', e);
    return [['Error', '0']];
  }
};

// Defined programmatically because a JSON definition can only hold a fixed list
// of options, and this one has to be rebuilt each time the dropdown opens.
const buildAnimationSelectBlock = ({name, description, icon, colour, storageFactory}) => {
  // Value block: picks an animation by name and reports its number, so it can
  // be plugged into the sprite setter or anywhere else a number is wanted.
  Blockly.Blocks[`sprite_${name}_animation_select`] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} ${description} ${ANIMATION_ICON} animation`)
          .appendField(
              new Blockly.FieldDropdown(buildAnimationOptions(storageFactory)), 'VAR');
      this.setOutput(true, 'Number');
      this.setColour(colour);
      this.setTooltip(`Selects one of ${description}'s animations by name`);
    },
  };
};

const buildPlayerOptions = (name) => [
  [HORIZONTAL_ICON + ' X', `${name}x`],
  [VERTICAL_ICON + ' Y', `${name}y`],
  [COLOR_ICON + ' Color', `${name}realcolor`],
  [ANIMATION_ICON + ' Animation', `${name}animation`],
  [MIRROR_ICON + ' Horizontal flip', `__${name}size_3_`],
];

const buildMissileOptions = (name) => [
  [HORIZONTAL_ICON + ' X', `${name}x`],
  [VERTICAL_ICON + ' Y', `${name}y`],
  [HEIGHT_ICON + ' Height', `${name}height`],
];

const PLAYER_SIZE_OPTIONS = [
  ['1 copy of player and missile.', '$0'],
  ['2 close-spaced copies of player and missile.', '$1'],
  ['2 medium-spaced copies of player and missile.', '$2'],
  ['3 close-spaced copies of player and missile.', '$3'],
  ['2 wide-spaced copies of player and missile.', '$4'],
  ['Double-sized player.', '$5'],
  ['3 medium-spaced copies of player and missile.', '$6'],
  ['Quad-sized', '$7'],
];

const MISSILE_SIZE_OPTIONS = [
  ['1', '$00'],
  ['2', '$10'],
  ['4', '$20'],
  ['8', '$30'],
];

// Pixels moved per frame, each direction's own X and Y step (see
// generators/bbasic/sprites.js's own generateMissileFireChecks) - a
// bounded dropdown rather than a free-typed field, same "small fixed
// choice" reasoning MISSILE_SIZE_OPTIONS above already uses.
const MISSILE_FIRE_SPEED_OPTIONS = [
  ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'],
];

// Same 0-7 clockwise-from-Up encoding as input_joyN_direction8 (see
// blocks/input.js's own buildJoystickDirection8Block) - used for the Fire
// block's own "Default direction" dropdown (see generateMissileFireChecks'
// own trigger comment): whatever the user picks here is what actually fires
// when the Angle input evaluates to 255 ("no clear direction" - e.g. the
// joystick is centered), rather than a single hardcoded fallback, so any of
// the 8 directions can be the default, not just Up.
const MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS = [
  ['⬆ Up', '0'],
  ['↗ Up-Right', '1'],
  ['➡ Right', '2'],
  ['↘ Down-Right', '3'],
  ['⬇ Down', '4'],
  ['↙ Down-Left', '5'],
  ['⬅ Left', '6'],
  ['↖ Up-Left', '7'],
];

const buildSpriteBlocks = ({name, description, icon, options=[], writeOnlyOptions=[], readOnlyOptions=[], colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': `sprite_${name}_get`,
      'message0': `${icon} ${description} %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': [...options, ...readOnlyOptions],
        },
      ],
      'output': 'Number',
      colour,
      'tooltip': `Reads information about ${description}`,
    },
    // Block for the setter.
    {
      'type': `sprite_${name}_set`,
      'message0': `${icon} ${description} %{BKY_VARIABLES_SET}`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': [...options, ...writeOnlyOptions],
        },
        {
          'type': 'input_value',
          'name': 'VALUE',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Updates information about ${description}`,
    },
    // Block for adding to a variable in place.
    {
      'type': `sprite_${name}_change`,
      'message0': `${icon} ${description} %{BKY_MATH_CHANGE_TITLE}`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
        {
          'type': 'input_value',
          'name': 'DELTA',
          'check': 'Number',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['math_change_tooltip'],
    },
  ]);
};

const buildPlayerBlocks = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for changing a player's size and quantity.
    {
      'type': `sprite_${name}_size`,
      'message0': `${icon} ${description} set width/quantity to %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'SIZE',
          'options': PLAYER_SIZE_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['math_change_tooltip'],
    },
    // Block for pausing/resuming a player's animation.
    {
      'type': `sprite_${name}_animation_playback`,
      'message0': `${icon} ${description} ${ANIMATION_ICON} animation %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'STATE',
          'options': [
            [`${PLAY_ICON} Play`, 'play'],
            [`${PAUSE_ICON} Pause`, 'pause'],
          ],
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Plays or pauses ${description}'s animation`,
    },
    // Points this player directly at a slice of the ROM's own bank 1 code
    // (plus a runtime offset) instead of one of its own defined animation
    // frames - the classic Yars' Revenge "neutral zone" trick: real batari
    // Basic sprites are just a pointer + a row count read from wherever
    // that pointer happens to be (see generators/bbasic/sprites.js's own
    // comment on player0pointer/player0height for the confirmed real
    // kernel mechanics), so pointing it at ordinary CODE instead of a
    // drawn graphic makes the sprite display those bytes as a pixel
    // pattern - genuinely arbitrary-looking, not tied to anything the
    // user has to set up first. No data table to create or pick - an
    // earlier version of this required one, specifically to guarantee a
    // real, always-present bank 1 address; generators/bbasic/sprites.js's
    // own generator now points at a fixed kernel label that's already
    // guaranteed present in every compiled ROM instead, so this block
    // works immediately with no other setup. OFFSET defaults to the frame
    // counter when left unplugged (see that generator's own comment) so
    // the pattern already shimmers on its own - it's still a real, typed
    // input if a specific offset expression is ever wanted instead.
    {
      'type': `sprite_${name}_rom_noise`,
      'message0': `${icon} ${description} display ${DATA_ICON} ROM noise, offset %1 height %2 rows`,
      'args0': [
        {
          'type': 'input_value',
          'name': 'OFFSET',
          'check': 'Number',
        },
        {
          'type': 'input_value',
          'name': 'HEIGHT',
          'check': 'Number',
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Makes ${description} display raw ROM bytes as its own graphic, instead of one ` +
        'of its normal animation frames - the same trick Yars\' Revenge used for its "neutral ' +
        'zone" static effect. Always reads from bank 1 (regardless of which bank this block ' +
        'itself ends up in). Leave "offset" unplugged for an automatically shimmering pattern ' +
        '(it defaults to the frame counter) - or plug in your own expression to control exactly ' +
        'which bytes show. This keeps overriding the player\'s graphic every frame, even over a ' +
        'normal animation frame set afterward, until the separate "stop ROM noise" block is used ' +
        '- it does NOT affect player width/quantity (NUSIZ) - a size set with the "set width/' +
        'quantity" block above still applies normally on top of this. See the separate ' +
        `"rainbow colors" block for a different color on every row of ${description} too.`,
    },
    // ROM noise (above) sets a runtime "active" flag that keeps overriding
    // this player's graphic pointer every single frame, forever, once
    // triggered - a normal "Set animation" block alone can't undo that,
    // since generateRomNoiseChecks' own per-frame override runs AFTER the
    // animation logic every frame and only ever gets set, never cleared
    // (confirmed as a real reported gap: "I want to be able to switch back
    // to using sprite graphics after using the noise block"). This just
    // clears that flag, letting the animation pointer generateAnimations
    // already reasserts every frame regardless take back over immediately -
    // no pixel/graphic changes of its own.
    {
      'type': `sprite_${name}_rom_noise_stop`,
      'message0': `${icon} ${description} stop ${DATA_ICON} ROM noise`,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Switches ${description} back to showing its normal animation frames again, ` +
        'undoing the "display ROM noise" block above - that block keeps overriding the graphic ' +
        'every frame until this one is used, even if a normal animation frame is set in the ' +
        'meantime.',
    },
    // A different color on every scanline of this player - a REAL, existing
    // batari Basic kernel feature ("playercolors"/"player1colors" kernel
    // options - see std_kernel.asm's own "ifnconst playercolors" checks),
    // not built from scratch here. Deliberately its own separate block, not
    // a checkbox on sprite_*_rom_noise: this reads ROM bytes into
    // player0color/player1color the exact same "no data table, no ROM cost"
    // way the noise block reads them into player0pointer/player1pointer
    // (see generators/bbasic/sprites.js's own ROM_NOISE_COLOR_REGISTERS
    // comment for the confirmed real register aliasing this relies on), but
    // that mechanism is entirely independent of what the player's own
    // GRAPHIC pointer is doing - it works identically whether this player
    // is showing a normal drawn animation frame OR ROM noise, so keeping it
    // separate lets either be used without the other.
    {
      'type': `sprite_${name}_rainbow_colors`,
      'message0': `${icon} ${description} rainbow colors, offset %1`,
      'args0': [
        {
          'type': 'input_value',
          'name': 'OFFSET',
          'check': 'Number',
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Gives ${description} a different color on every one of its rows, reading real ` +
        'ROM bytes the same way the "display ROM noise" block does - works with any graphic, a ' +
        'normal animation frame or ROM noise. Leave "offset" unplugged for an automatically ' +
        'shimmering pattern (it defaults to the frame counter). Turns on a real batari Basic ' +
        `kernel feature that repurposes ${name === 'player0' ? 'missile0' : 'missile1'}'s own ` +
        `hardware circuitry to do this, so ${name === 'player0' ? 'missile0' : 'missile1'} can no ` +
        'longer be used as a sprite anywhere in the project while this block is used (same ' +
        'tradeoff as the "blank lines between background rows" option)' +
        (name === 'player0' ? ', and paddle input becomes unavailable too' : '') + '.',
    },
    // Same "active flag only ever gets set, never cleared" gap as
    // sprite_${name}_rom_noise_stop above, for the rainbow-colors trigger
    // instead - see that block's own comment. One real difference: once
    // "playercolors"/"player1colors" is in kernel_options at all, the
    // KERNEL itself always reads (player0color),y every scanline - there's
    // no way to turn that back into a plain flat COLUP0/COLUP1 color at
    // runtime, so this can't fully "undo" rainbow colors the way the ROM
    // noise stop block can fully undo noise. What it DOES do: with the
    // Options tab's "Enable per-row sprite colors" toggle on, each
    // animation frame already declares its own real per-row color table
    // (see generateAnimations in generators/bbasic.js) every time that
    // frame is (re)shown - clearing this flag lets THAT take back over,
    // the same "something else already reasserts every frame" mechanism
    // the ROM noise stop block relies on. Without that toggle, this just
    // freezes the color pointer wherever it currently is.
    {
      'type': `sprite_${name}_rainbow_colors_stop`,
      'message0': `${icon} ${description} stop rainbow colors`,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Stops ${description}'s "rainbow colors" block from continuing to override its ` +
        'row colors every frame. With the Options tab\'s "Enable per-row sprite colors" toggle ' +
        `on, ${description} goes back to each animation frame's own declared colors (or the ` +
        'default color if none were set); without that toggle, the color pointer just stays ' +
        'wherever rainbow colors last left it, since batari Basic has no way to fully return to ' +
        'a single flat color once this kernel feature is active.',
    },
  ]);
};

// Same "trigger block, actual movement happens in a per-frame check" shape
// as buildMissileBlocks' own "fire" block just below - separate from it
// (not folded in) since the user wants a distinct, dedicated follow/seek
// action rather than an extension of the angle-based Fire block. One single
// block (not one per sprite name, unlike buildSpriteBlocks/buildMissileBlocks
// above) - an OBJECT dropdown covers all 5 names (both players, both
// missiles, the ball) instead, per an explicit request to combine what was
// originally 5 separate blocks into one.
const SEEK_OBJECT_OPTIONS = [
  [PLAYER_ICON + ' Player 0', 'player0'],
  [PLAYER_ICON + ' Player 1', 'player1'],
  [MISSILE_ICON + ' Missile 0', 'missile0'],
  [MISSILE_ICON + ' Missile 1', 'missile1'],
  [BALL_ICON + ' Ball', 'ball'],
];

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'object_seek_to',
    'message0': `${SEEK_ICON} Seek %1 to X %2 Y %3 at speed %4`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'SPEED',
        'check': 'Number',
      },
    ],
    'message1': 'throttle movement %1',
    'args1': [
      {
        'type': 'field_checkbox',
        'name': 'THROTTLE',
        'checked': false,
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'tooltip': 'Moves the chosen player/missile/ball automatically, a few pixels every ' +
      'frame, toward the given X/Y - each axis moves independently by up to "speed" pixels ' +
      'a frame, so it arrives diagonally when both axes have similar distances left and ' +
      'moves in a straight line once one axis catches up, stopping exactly on arrival. Its ' +
      'own Height/visibility is never touched by this block, same as "Fire missile". Every ' +
      'time this block actually runs, it immediately updates that object\'s own target/' +
      'speed, even if it\'s still moving toward a previous target - place this behind its ' +
      'own rate limiter (e.g. an "every X frames" block) if the target/speed shouldn\'t reset ' +
      'every single frame. "throttle movement", when checked AND this block is placed ' +
      'directly inside an "every X frames" block, slows the actual movement itself down to ' +
      'that same rate (one step every X frames) instead of moving every frame regardless - ' +
      'unchecked (the default), movement always happens every frame once triggered, no ' +
      'matter what wraps this block.',
  },
  // A plain boolean value (plugs into an "if", same as collision_get/
  // background_fade_active elsewhere in this codebase - a bare 'output':
  // 'Boolean' with no outputShape override, the same "classic" connector
  // every other boolean-pluggable block here already uses), true from the
  // moment a matching object_seek_to block (same OBJECT choice) actually
  // reaches its own target X/Y, until the next time that object's own Seek
  // target is set again (object_seek_to's own generator clears this bit
  // right when it (re)triggers - see generators/bbasic/sprites.js). A seek
  // that starts already at its target (nothing to actually step) never sets
  // this - there's no real arrival to report if it was already there before
  // the first check.
  {
    'type': 'object_seek_arrived',
    'message0': `${SEEK_ICON} %1 arrived at its seek target`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': 'True once a matching "Seek" block (same player/missile/ball choice) reaches its ' +
      'own target X/Y, and stays true until that object is given a new Seek target. Always false ' +
      'if no matching Seek block ever runs anywhere in the project.',
  },
]);

// Every object_seek_arrived block resolved to the OBJECT name(s) it actually
// watches - needed early (bbasic.js's own init(), before reserveDevVar hands
// out user variable letters) so seekArrivedFlagsVarName only gets reserved
// when at least one such watch really exists, same reasoning as
// resolveBackgroundFadeFinishedWatches in blocks/background.js. Unlike that
// one, no separate "watch key" function is needed - OBJECT's own value
// (player0/player1/missile0/missile1/ball) already is the key.
export const resolveSeekArrivedWatches = (workspace) => {
  const watched = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'object_seek_arrived' && block.isEnabled()) {
      watched.add(block.getFieldValue('OBJECT'));
    }
  });
  return watched;
};

// Missile-only (NUSIZ0/1 width/copies) - the ball has its own separate
// width mechanism (CTRLPF, see reserveCtrlpfShadowDevVar in
// generators/bbasic/sprites.js), so this is never called for it.
const buildMissileSizeBlock = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for changing a player's size and quantity.
    {
      'type': `sprite_${name}_size`,
      'message0': `${icon} ${description} set width to %1 pixels`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'SIZE',
          'options': MISSILE_SIZE_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['math_change_tooltip'],
    },
  ]);
};

// Shared by missile0/missile1/ball - see createGeneratorForFireBall in
// generators/bbasic/sprites.js for the fully name-generic trigger/per-frame
// movement this drives; nothing here is missile-specific.
const buildFireBlock = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Fires this missile from the given starting X/Y, moving at the given
    // angle/speed until it goes off-screen, where it just stops (see
    // generateMissileFireChecks) - its own Height/visibility is left
    // entirely to the existing "sprite_<name>_set" block, never touched
    // here, so it doesn't change size or disappear on its own.
    {
      'type': `sprite_${name}_fire`,
      'message0': `${icon} Fire ${description} from X %1 Y %2 at angle %3 default %4 speed %5`,
      'args0': [
        {
          'type': 'input_value',
          'name': 'X',
          'check': 'Number',
        },
        {
          'type': 'input_value',
          'name': 'Y',
          'check': 'Number',
        },
        {
          'type': 'input_value',
          'name': 'ANGLE',
          'check': 'Number',
        },
        {
          'type': 'field_dropdown',
          'name': 'DEFAULT_ANGLE',
          'options': MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'SPEED',
          'options': MISSILE_FIRE_SPEED_OPTIONS,
        },
      ],
      'message1': 'throttle movement %1',
      'args1': [
        {
          'type': 'field_checkbox',
          'name': 'THROTTLE',
          'checked': false,
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Launches ${description} from the given starting X/Y position (e.g. a paired ` +
        'player\'s own X/Y position blocks, for a traditional "fire from the player" missile), ' +
        'moving it automatically (a few pixels every frame) until it goes off-screen, where it ' +
        `simply stops moving - ${description}'s own Height/visibility is never touched by this ` +
        `block, so it never changes size or disappears on its own; use "${description}: set Height" ` +
        'yourself if you want it hidden once it stops. Angle is 0-7 ' +
        '(0=Up, 1=Up-Right, 2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left, clockwise ' +
        'from Up) - plug in a "Joystick direction (8-way)" block to fire toward wherever the ' +
        'joystick is pushed, a plain number for a fixed direction, or a variable holding an angle ' +
        'computed elsewhere. 255 (or any other value outside 0-7) means "no clear direction" (e.g. ' +
        'a centered joystick) - "default" is used instead whenever that happens, so ' +
        `${description} still fires (in whichever direction "default" picks) rather than doing ` +
        `nothing. Every time this block actually runs, it (re)launches ${description} right away, ` +
        'even if a previous shot is still in flight - resetting its position to whatever X/Y it\'s ' +
        'given at that moment. Because of that, this should be placed behind its own rate limiter ' +
        '(e.g. an "every X frames" block) rather than something that stays true every single frame ' +
        '(like "if Fire then ..." on its own), or it\'ll keep resetting the shot every frame instead ' +
        'of letting it fly. "throttle movement", when checked AND this block is placed directly ' +
        'inside an "every X frames" block, slows the actual in-flight movement down to that same ' +
        'rate (one step every X frames) instead of moving every frame regardless - unchecked (the ' +
        'default), it always moves every frame once fired, no matter what wraps this block.',
    },
  ]);
};

// Shared by missile0/missile1/ball, same as buildFireBlock above - reverses
// whichever direction this object was last fired at (see sprite_*_fire)
// by a flat 180 degrees (e.g. angle 2/Right becomes 6/Left) so it heads back
// the way it came. Deliberately just that one thing, no built-in screen-edge
// or collision detection of its own (confirmed with the user: no "gravity"/
// physics, just the direction flip) - place this behind whatever collision
// check (e.g. collision_get) or screen-edge check the user's own project
// already needs, same "trigger block, no detection built in" shape as
// sprite_*_fire itself leaving throttling/rate-limiting up to the user.
const buildBounceBlock = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    {
      'type': `sprite_${name}_bounce`,
      'message0': `${icon} Bounce ${description}`,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Reverses ${description}'s currently fired direction (see "Fire ${description}") ` +
        'by 180 degrees, so it heads back the way it came - e.g. Right becomes Left, Up-Right ' +
        'becomes Down-Left. Just the direction flip, nothing else: place this behind whatever ' +
        `check decides ${description} should bounce (a collision block, a screen-edge X/Y ` +
        `comparison, etc.) - it doesn't detect anything on its own. Has no effect if ${description} ` +
        'hasn\'t been fired (or has already gone off-screen and stopped) - reversing a "no ' +
        'direction" state is harmless, but does nothing useful.',
    },
  ]);
};

buildSpriteBlocks({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
  options: buildPlayerOptions('player0'),
  writeOnlyOptions: [
    [VISIBILITY_ICON + ' Visibility', 'player0visibility'],
  ],
  readOnlyOptions: [
    [FRAME_ICON + ' Frame', 'player0frame'],
  ],
});

buildPlayerBlocks({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
});

buildAnimationSelectBlock({
  name: 'player0',
  description: 'Player 0',
  icon: PLAYER_ICON,
  colour: 'red',
  storageFactory: usePlayer0Storage,
});

buildSpriteBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
  options: buildPlayerOptions('player1'),
  writeOnlyOptions: [
    [VISIBILITY_ICON + ' Visibility', 'player1visibility'],
  ],
  readOnlyOptions: [
    [FRAME_ICON + ' Frame', 'player1frame'],
  ],
});

buildPlayerBlocks({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
});

buildAnimationSelectBlock({
  name: 'player1',
  description: 'Player 1',
  icon: PLAYER_ICON,
  colour: 'blue',
  storageFactory: usePlayer1Storage,
});

buildSpriteBlocks({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
  options: buildMissileOptions('missile0'),
  writeOnlyOptions: [
    [HEIGHT_ICON + ' Width', 'missile0width'],
  ],
});

buildMissileSizeBlock({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
});

buildFireBlock({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
});

buildBounceBlock({
  name: 'missile0',
  description: 'Missile 0',
  icon: MISSILE_ICON,
  colour: 'red',
});

buildSpriteBlocks({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
  options: buildMissileOptions('missile1'),
  writeOnlyOptions: [
    [HEIGHT_ICON + ' Width', 'missile1width'],
  ],
});

buildMissileSizeBlock({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
});

buildFireBlock({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
});

buildBounceBlock({
  name: 'missile1',
  description: 'Missile 1',
  icon: MISSILE_ICON,
  colour: 'blue',
});

buildSpriteBlocks({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
  options: buildMissileOptions('ball'),
  writeOnlyOptions: [
    [HEIGHT_ICON + ' Width', 'ballwidth'],
  ],
});

buildFireBlock({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
});

buildBounceBlock({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
});

// The Atari 2600 only has one priority switch for the whole screen: it can't
// be set per-sprite, only for all players/missiles/ball against the
// playfield at once.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'sprite_priority_set',
    'message0': `${PRIORITY_ICON} Sprite priority %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VALUE',
        'options': [
          ['Sprites above playfield (default)', '0'],
          ['Playfield above sprites', '1'],
        ],
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': PRIORITY_COLOUR,
    'tooltip': `Chooses whether the playfield and ball are drawn in front of, or behind, all ` +
      `players and missiles. This is a single switch for the whole screen - it can't be set ` +
      `per-sprite - but it can be changed at any time during the game.`,
  },
]);
