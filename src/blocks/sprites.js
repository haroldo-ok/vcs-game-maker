import * as Blockly from 'blockly/core';

import {processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {usePlayer0Storage, usePlayer1Storage} from '../hooks/project';
import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, COLOR_ICON, HEIGHT_ICON, ANIMATION_ICON, VISIBILITY_ICON, HORIZONTAL_ICON, VERTICAL_ICON, MIRROR_ICON, FRAME_ICON, PLAY_ICON, PAUSE_ICON, PRIORITY_ICON, DATA_ICON} from './icon';

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

const buildMissileBlocks = ({name, description, icon, colour}) => {
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
});

buildMissileBlocks({
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
});

buildMissileBlocks({
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
