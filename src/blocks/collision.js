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
    'message0': `Collided %1 and %2 %3 use box`,
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
      {
        'type': 'field_checkbox',
        'name': 'BOX',
        'checked': false,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'tooltip': `Checks if the objects colided. With "use box" ticked, a player and the Playfield are tested with the whole box of the ` +
      `player (its full width and height, whatever pixels are lit in it) instead of the hardware flag; the answer is as of the end of the last frame.`,
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

// Undo last move: place it ahead of the blocks that move the player in an event. It saves where the player is; once the blocks have run
// (and before the Jump block moves its players) the player's box, its full width and height whatever pixels are lit in it, is tested against
// the playfield with the software box test of generators/bbasic/pf-box.js. A box in a lit pixel takes back as much of the move as it needs: the
// move along the axis that moved, or when both moved the x only if the old x with the new y is clear, else both. So the player is never drawn
// in the playfield. The frames setting is from the older version of the block, which read the hardware collision flag a frame late.
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
  'tooltip': 'Tests the whole box of the chosen player (its full width and height, whatever pixels are lit in it) ' +
    'against the Playfield after the blocks that move it have run. If the box would be in a lit pixel, takes back ' +
    'as much of the move as it needs: the part of it along an axis that is clear is kept, so the player ' +
    'slides along a wall. Place this before whatever block(s) move the player each frame - it only backs up ' +
    'and restores position, it does not move the player itself. The frames setting is kept for older projects ' +
    'and has no effect.',
});

// A jump for a player, with gravity and landing on the pixels of the playfield (see generators/bbasic/collision.js). It goes inside an if
// block (with a joystick block, say): running it makes the player jump. A project that has one also has gravity: every frame the player
// is moved up and down by the jump and by gravity, and stopped on top of a lit pixel of the playfield. The numbers are sockets, for the
// blocks of the Math category and variables, and are taken when the block runs.
const buildPlatformerBlock = () => ({
  'type': 'sprite_platformer',
  'message0': `${PLAYER_ICON} Platform %1 jump speed %2 gravity %3 max fall speed %4 allow %5 multi-jump up to %6 jumps %7 stop at walls left and right`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': jumpSpriteOptions},
    {'type': 'input_value', 'name': 'SPEED', 'check': 'Number'},
    {'type': 'input_value', 'name': 'GRAVITY', 'check': 'Number'},
    {'type': 'input_value', 'name': 'MAXFALL', 'check': 'Number'},
    {'type': 'field_checkbox', 'name': 'MULTI', 'checked': false},
    {'type': 'input_value', 'name': 'MAXJUMPS', 'check': 'Number'},
    {'type': 'field_checkbox', 'name': 'WALLS', 'checked': false},
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
    'moved by the other blocks; with "stop at walls left and right" ticked, a move to the left or right that would put the player (its ' +
    'whole box) in a lit pixel of the playfield is taken back, so the player stops against a wall. (Not needed with an "Undo last move" ' +
    'block for the same player, which does that already.)',
});

// True while a player moved by the Jump block is jumping (going up), falling, standing on the ground, or moving (its x or y changed in the last frame).
const buildPlatformerStateBlock = () => ({
  'type': 'sprite_platformer_state',
  'message0': `${PLAYER_ICON} %1 is %2`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': jumpSpriteOptions},
    {'type': 'field_dropdown', 'name': 'STATE', 'options': [
      ['jumping', 'jumping'], ['falling', 'falling'], ['on the ground', 'ground'], ['moving', 'moving'],
    ]},
  ],
  'output': 'Boolean',
  'colour': 'purple',
  'tooltip': 'True while the player, moved by the "Platform" block, is jumping (going up), falling (going down), standing on the ' +
    'ground (on a playfield pixel), or moving (its x or y was different a frame ago, in any direction). Use it in an if block, to change the ' +
    'animation for each, for example.',
});

// The number of jumps a player moved by the Jump block has made since it last stood on the ground (a number for the comparison blocks).
const buildPlatformerJumpsBlock = () => ({
  'type': 'sprite_platformer_jumps',
  'message0': `${PLAYER_ICON} %1 jumps made`,
  'args0': [
    {'type': 'field_dropdown', 'name': 'PLAYER', 'options': jumpSpriteOptions},
  ],
  'output': 'Number',
  'colour': 'purple',
  'tooltip': 'How many jumps the player, moved by the "Platform" block, has made since it last stood on the ground: 0 on the ground, 1 after ' +
    'the first jump, 2 after a second one in the air (with multi-jump on), up to 4. Walking off an edge counts as a jump used. Use it with a ' +
    'comparison block in an if block, for example "jumps made = 2".',
});

Blockly.defineBlocksWithJsonArray([
  buildCollisionCheckBlock(),
  buildPlatformerBlock(),
  buildPlatformerStateBlock(),
  buildPlatformerJumpsBlock(),
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

// "Sprite overlap starts / stops": true for the one frame in which the sprite begins to overlap one of the ticked sprites, or the last
// of them stops overlapping it (see generators/bbasic/sprite-overlap.js).
const OVERLAP_TARGETS = [
  ...Array.from({length: 10}, (_, i) => [PLAYER_ICON + i, 'player' + i]),
  [MISSILE_ICON + '0', 'missile0'], [MISSILE_ICON + '1', 'missile1'], [BALL_ICON, 'ball'],
];
Blockly.Blocks['sprite_overlap_event'] = {
  init: function() {
    const dpcPlus = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus';
    this.appendDummyInput()
        .appendField('Sprite')
        .appendField(new Blockly.FieldDropdown(() => collisionOptions().filter((option) => option[1] !== 'playfield')), 'VAR0')
        .appendField(new Blockly.FieldDropdown([['overlap starts', 'starts'], ['overlap stops', 'stops']]), 'MODE')
        .appendField('with');
    const targets = this.appendDummyInput();
    OVERLAP_TARGETS.forEach(([label, name]) => {
      const extraPlayer = /^player[2-9]$/.test(name);
      const checkbox = new Blockly.FieldCheckbox('FALSE');
      const text = new Blockly.FieldLabel(label);
      targets.appendField(text, `L_${name}`).appendField(checkbox, `T_${name}`);
      if (extraPlayer && !dpcPlus) {
        text.setVisible(false);
        checkbox.setVisible(false);
      }
    });
    this.setOutput(true, 'Boolean');
    this.setColour('purple');
    this.setTooltip('True for the one frame in which the sprite begins to overlap one of the ticked sprites (overlap starts), or the last of ' +
      'them stops overlapping it (overlap stops). Overlap is the boxes of the two sprites touching, as of the end of the last frame. ' +
      'Each block takes two bits of memory, shared with the other blocks of its kind.');
  },
};
