'use strict';

// Names of the hidden bytes each player's collision-check block backs up its
// pre-move position into (see bbasic.js's own pre-scan, which pushes these
// into defvars only for whichever player actually uses the block, and this
// file's own generator, which reads the position back out of them the
// following frame). Shared as functions (not inline template literals) so
// both places agree on the exact same name.
export const collisionMoveOldXVar = (playerNum) => `collisionOldX${playerNum}`;
export const collisionMoveOldYVar = (playerNum) => `collisionOldY${playerNum}`;

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

  // One-frame-delayed hardware-collision backtrack (see blocks/collision.js's
  // own comment on why this checks X and Y together, and doesn't use an
  // extra drawscreen): checks the PREVIOUS frame's collision result (already
  // latched in CXP0FB, and already cleared for this frame by the kernel's
  // own drawscreen), reverts to the position from before that move if it
  // collided, then saves the now-known-good position for next time. No
  // movement of its own - whatever moves the player is placed after this
  // block in the same event, and runs naturally after "drawscreen" as part
  // of the user's own generated code, so no special splice-point timing is
  // needed here (unlike the asm-minikernel version this replaces). "if X
  // then goto label" is used instead of "if X then A : B" for the revert,
  // since bBasic's "if X then A : B" only conditions A, not B - each branch
  // needs its own line/label, same reasoning as math_abs_set. Labels are
  // suffixed with a per-instance number (see blockNumbers) in case this
  // block is ever placed more than once for the same player.
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
