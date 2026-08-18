'use strict';

// Names of the hidden bytes each player's collision-check block backs up its
// pre-move position into (see bbasic.js's own pre-scan, which pushes these
// into defvars only for whichever player actually uses the block, and this
// file's own generator, which reads the position back out of them the
// following frame). Shared as functions (not inline template literals) so
// both places agree on the exact same name.
export const collisionMoveOldXVar = (playerNum) => `collisionOldX${playerNum}`;
export const collisionMoveOldYVar = (playerNum) => `collisionOldY${playerNum}`;
// A collisionMoveOldSizeVar (snapshotting/reverting player{N}size alongside
// X/Y) used to exist here - removed after confirming it never actually
// worked: player{N}size (NUSIZ) is a value the user's own animation/size-
// changing blocks re-derive from player{N}animation/player{N}frame every
// frame, which this block never touched, so whatever code ran after it (or
// the very same animation logic that widened the sprite in the first place)
// just overwrote the "reverted" size again before drawscreen ever ran - the
// snapshot/restore had no lasting effect. There was never a way to make a
// SIZE revert stick given how NUSIZ is actually (re)computed, so that angle
// was dropped entirely rather than chased further.
//
// A reactive, software pfread()-based axis-aware version of this block (only
// reverting whichever of X/Y actually still overlapped the playfield, so a
// diagonal move into a wall could slide along it) was also tried here and
// fully reverted, after it caused two separate real bugs on an actual
// project: a ROM lockup (an out-of-range playfield row index from the box
// math, since fixed but apparently not the only issue) and, afterward, a
// hard crash on contact that persisted even after that fix. Given this
// exact class of collision code has now broken in more than one way across
// more than one attempt (see the even earlier predictive, run-every-frame
// version's own screen-roll failure, previously reverted too - git history
// on this file has the full account of both), this block is back to the
// simple, originally-shipped behavior below: revert X and Y together,
// unconditionally, on any collision - it stops a diagonal move dead at a
// wall instead of sliding along it, but it's the one version of this that's
// actually held up.

export default (Blockly) => {
  Blockly.BBasic[`collision_get`] = function(block) {
    const var0 = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR0'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const var1 = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR1'),
        Blockly.VARIABLE_CATEGORY_NAME);

    const code = var0 === var1 ? 'true' :
      `collision(${var0}, ${var1})`;

    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

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
  // This checks X and Y together (both revert if either axis collided), not
  // separately - CXP0FB/CXP1FB is a single combined bit with no way to tell
  // which axis caused an overlap directly from hardware, and every software
  // attempt at doing that separately has broken in a real, different way
  // each time it's been tried (see this file's own top-of-file comment for
  // the account) - stops dead at a wall instead of sliding along it, but
  // it's the one version of this that's actually held up.
  Blockly.BBasic['collision_check_position'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    const player = `player${playerNum}`;
    // Routed through nameDB_.getName (same bucket bbasic.js dimmed these
    // with) rather than the raw canonical string, so this always matches
    // whatever name actually got dimmed - same reasoning as the Distance
    // blocks' own getter (generators/bbasic/input.js).
    const oldX = Blockly.BBasic.nameDB_.getName(
        collisionMoveOldXVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const oldY = Blockly.BBasic.nameDB_.getName(
        collisionMoveOldYVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const blockNumber = Blockly.BBasic.blockNumbers.next(`collision_check_position_${playerNum}`);
    const revertLabel = `_collision_check_${playerNum}_${blockNumber}_revert`;
    const doneLabel = `_collision_check_${playerNum}_${blockNumber}_done`;
    return [
      `if collision(${player}, playfield) then goto ${revertLabel}`,
      `goto ${doneLabel}`,
      `@ ${revertLabel}`,
      `${player}x = ${oldX}`,
      `${player}y = ${oldY}`,
      `@ ${doneLabel}`,
      `${oldX} = ${player}x`,
      `${oldY} = ${player}y`,
    ].join('\n') + '\n';
  };
};
