import * as Blockly from 'blockly/core';

import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, PLAYFIELD_ICON} from './icon';

const options = [
  [PLAYER_ICON + ' Player 0', 'player0'],
  [PLAYER_ICON + ' Player 1', 'player1'],
  [MISSILE_ICON + ' Missile 0', 'missile0'],
  [MISSILE_ICON + ' Missile 1', 'missile1'],
  [BALL_ICON + ' Ball', 'ball'],
  [PLAYFIELD_ICON + ' Playfield', 'playfield'],
];

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
        options,
      },
      {
        'type': 'field_dropdown',
        'name': 'VAR1',
        options,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': `Checks if the objects colided.`,
  },
]);

const playerOptions = [
  [PLAYER_ICON + ' Player 0', '0'],
  [PLAYER_ICON + ' Player 1', '1'],
];

// One-frame-delayed hardware-collision "backtrack" check - no movement of
// its own, and no extra drawscreen: bBasic's own kernel already clears the
// TIA collision latches every frame as part of "drawscreen" (its version of
// CXCLR), and its "collision()" builtin already wraps reading them
// (CXP0FB/CXP1FB) - so checking collision() at the START of a frame, BEFORE
// this frame's own movement blocks run, reads the result of LAST frame's
// movement and undoes it if it collided. Place this ahead of whatever
// joystick/movement blocks already move the player (e.g. from the Sprites
// category) in the same event - it only backs up and restores position, it
// never moves the player itself.
//
// CXP0FB/CXP1FB is a single combined bit with no way to tell which axis
// caused an overlap directly from hardware - but once a collision fires,
// this block checks, in software (pfread against the player's current
// on-screen box), whether reverting just X or just Y alone would clear it,
// and only reverts that axis - so moving diagonally into a wall slides along
// it instead of stopping dead. A corner hit (or an overlap caused purely by
// an animation frame getting wider/taller with no position change at all)
// falls back to reverting both, same as always - see
// generators/bbasic/collision.js's own comment for the full account,
// including why this checks only runs on a frame a collision already fired
// (not every frame - that was tried, predictively, and caused screen roll).
const buildCollisionCheckBlock = () => ({
  'type': 'collision_check_position',
  'message0': `${PLAYER_ICON} Undo %1's last move if it collided with Playfield`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': playerOptions},
  ],
  'previousStatement': null,
  'nextStatement': null,
  'colour': 'purple',
  'tooltip': 'Checks last frame\'s collision result between the chosen player and the ' +
    'Playfield (using real TIA hardware collision detection) and reverts to the position ' +
    'from before that move - only on whichever axis (X, Y, or both) actually caused the ' +
    'overlap, so moving diagonally into a wall slides along it instead of stopping dead. ' +
    'Place this before whatever block(s) actually move the player each frame - it only backs ' +
    'up and restores position, it does not move the player itself.',
});

Blockly.defineBlocksWithJsonArray([
  buildCollisionCheckBlock(),
]);
