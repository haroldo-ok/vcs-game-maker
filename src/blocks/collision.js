import * as Blockly from 'blockly/core';

import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, PLAYFIELD_ICON} from './icon';
import {useConfigurationStorage} from '../hooks/project';

const options = [
  [PLAYER_ICON + ' Player 0', 'player0'],
  [PLAYER_ICON + ' Player 1', 'player1'],
  [MISSILE_ICON + ' Missile 0', 'missile0'],
  [MISSILE_ICON + ' Missile 1', 'missile1'],
  [BALL_ICON + ' Ball', 'ball'],
  [PLAYFIELD_ICON + ' Playfield', 'playfield'],
];

// The DPC+ kernel's extra sprites (Player 2 to 9) are offered too.
const collisionOptions = function() {
  const dpcPlus = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus';
  if (!dpcPlus) return options;
  const extra = Array.from({length: 8}, (_, i) => [PLAYER_ICON + ' Player ' + (i + 2), 'player' + (i + 2)]);
  return [...options.slice(0, 2), ...extra, ...options.slice(2)];
};

// The "Check bounding box collision with Playfield" / "Bounding box
// collision result" block pair (predictive software box collision, with
// per-axis sliding) was removed here for now - every design tried (full
// software prediction, TIA hardware collision, a hand-written 6502
// rewrite) ran into a serious, unresolved correctness or toolchain problem
// (screen roll, the player getting stuck in a wall, or "asm...end" blocks
// breaking compilation project-wide - see git history on this file and on
// generators/bbasic/collision.js for the full account).
Blockly.defineBlocksWithJsonArray([
  // Block for the getter.
  {
    'type': `collision_get`,
    'message0': `Collided %1 and %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR0',
        'options': collisionOptions,
      },
      {
        'type': 'field_dropdown',
        'name': 'VAR1',
        'options': collisionOptions,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': `Checks if the objects colided.`,
  },
]);

// The sprites the Jump block can move: the players, the missiles and the ball.
const jumpSpriteOptions = function() {
  return [...playerOptions(), [PLAYER_ICON + ' Missile 0', 'missile0'], [PLAYER_ICON + ' Missile 1', 'missile1'],
    [PLAYER_ICON + ' Ball', 'ball']];
};

const playerOptions = function() {
  const dpcPlus = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus';
  return Array.from({length: dpcPlus ? 10 : 2}, (_, i) => [PLAYER_ICON + ' Player ' + i, String(i)]);
};

// One-frame-delayed hardware-collision "backtrack" check - no movement
// and no extra drawscreen: bBasic's kernel already clears the
// TIA collision latches every frame as part of "drawscreen" (its version of
// CXCLR), and its "collision()" builtin already wraps reading them
// (CXP0FB/CXP1FB) - so checking collision() at the START of a frame, BEFORE
// this frame's movement blocks run, reads the result of LAST frame's
// movement and undoes it if it collided. Place this ahead of whatever
// joystick/movement blocks already move the player (e.g. from the Sprites
// category) in the same event - it only backs up and restores position, it
// never moves the player itself.
//
// The hardware flag (CXP0FB/CXP1FB) is a single combined bit with no way to tell which axis caused the overlap, so the
// generator tries the axes one at a time with the software box test of generators/bbasic/pf-box.js (checked against the
// hardware flag over every position of a solid sprite): the move is kept in the axis that is clear, so the player slides along a
// wall, and goes back to where it was only when neither is. See generators/bbasic/collision.js's top-of-file comment for the
// earlier attempts at this.
const buildCollisionCheckBlock = () => ({
  'type': 'collision_check_position',
  'message0': `${PLAYER_ICON} Undo last move for %1 if it collided with Playfield, going back %2`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': playerOptions},
    {'type': 'field_dropdown', 'name': 'FRAMES', 'options': [['1 frame', '1'], ['2 frames', '2']]},
  ],
  'previousStatement': null,
  'nextStatement': null,
  'colour': 'purple',
  'tooltip': 'Checks last frame\'s collision result between the chosen player and the ' +
    'Playfield (the hardware collision flag, or for Players 2 to 9 a software test of the ' +
    'sprite box) and, if it collided, takes back as much of that move as it needs: the ' +
    'part of it along an axis that is clear is kept, so the player slides along a wall, and ' +
    'it goes back to where it was only when neither axis is clear. Going back 2 frames puts the ' +
    'player where it was two frames ago instead of one. Place this before ' +
    'whatever block(s) actually move the player each frame - it only backs up and restores ' +
    'position, it does not move the player itself.',
});

// A jump for a player, with gravity and landing on the pixels of the playfield (see generators/bbasic/collision.js). It goes inside an if
// block (with a joystick block, say): running it makes the player jump. A project that has one also has gravity: every frame the player
// is moved up and down by the jump and by gravity, and stopped on top of a lit pixel of the playfield. The numbers are sockets, for the
// blocks of the Math category and variables, and are taken when the block runs.
const buildPlatformerBlock = () => ({
  'type': 'sprite_platformer',
  'message0': `${PLAYER_ICON} Jump %1 jump speed %2 gravity %3 max fall speed %4 multi-jump %5 up to %6 jumps`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': jumpSpriteOptions},
    {'type': 'input_value', 'name': 'SPEED', 'check': 'Number'},
    {'type': 'input_value', 'name': 'GRAVITY', 'check': 'Number'},
    {'type': 'input_value', 'name': 'MAXFALL', 'check': 'Number'},
    {'type': 'field_checkbox', 'name': 'MULTI', 'checked': false},
    {'type': 'input_value', 'name': 'MAXJUMPS', 'check': 'Number'},
  ],
  'inputsInline': true,
  'previousStatement': null,
  'nextStatement': null,
  'colour': 'purple',
  'tooltip': 'Put this in an if block (with a block like "joystick 0 fire") in the update event: each time the player presses ' +
    'the button the player jumps, when it is standing on something, or in the air if multi-jump is on and it has jumped fewer ' +
    'times than the number set here (at most 4). From the moment a project has this block the player is moved up and down like in ' +
    'a platformer, every frame, by gravity too. The jump starts at the jump speed ' +
    '(pixels a frame, 1 to 16); gravity (in eighths of a pixel a frame, 1 to 16) slows the rise and then pulls the player ' +
    'down, up to the max fall speed (pixels a frame, 1 to 16); and the player stops on top of a lit pixel of the playfield ' +
    '(and hits its head on one above). The numbers can be any Math or variable block. A player standing on a pixel does not ' +
    'move at all, so it does not jitter. Walking off an edge makes it fall, and counts as a jump used. Left and right are ' +
    'moved by the other blocks.',
});

// True while a player moved by the Jump block is jumping (going up), falling, or standing on the ground.
const buildPlatformerStateBlock = () => ({
  'type': 'sprite_platformer_state',
  'message0': `${PLAYER_ICON} %1 is %2`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': jumpSpriteOptions},
    {'type': 'field_dropdown', 'name': 'STATE', 'options': [
      ['jumping', 'jumping'], ['falling', 'falling'], ['on the ground', 'ground'],
    ]},
  ],
  'output': 'Boolean',
  'colour': 'purple',
  'tooltip': 'True while the player, moved by the "Jump" block, is jumping (going up), falling (going down) or standing on the ' +
    'ground (on a playfield pixel). Use it in an if block, to change the animation for each, for example.',
});

Blockly.defineBlocksWithJsonArray([
  buildCollisionCheckBlock(),
  buildPlatformerBlock(),
  buildPlatformerStateBlock(),
]);

// A predictive (check-BEFORE-moving) software playfield collision block
// (collision_check_playfield_move), adapted from Random Terrain's
// "Sprite With Collision Prevention" example (AtariAge), was tried here and
// removed again - real testing found it reported collisions against pixels
// the player wasn't actually near, even after fixing two earlier bugs found
// along the way (a row-height formula that didn't scale with this project's
// Superchip pfres, and a compound "&&"-plus-nested-"if" condition never
// actually proven to compile correctly). Root cause not isolated before the
// approach was abandoned in favor of adapting this app's already-working
// built-in "background collision" example blocks (hardware collision_get,
// checked one-frame-delayed - see collision_check_position above) instead of
// continuing to chase custom pfread() box math. See git history on this file
// and on generators/bbasic/collision.js for the full account.
