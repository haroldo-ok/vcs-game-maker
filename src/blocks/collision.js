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

Blockly.defineBlocksWithJsonArray([
  buildCollisionCheckBlock(),
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
