'use strict';

// Names of the hidden bytes each player's collision-check block backs up its
// pre-move position into (see bbasic.js's own pre-scan, which pushes these
// into defvars only for whichever player actually uses the block, and this
// file's own generator, which reads the position back out of them the
// following frame). Shared as functions (not inline template literals) so
// both places agree on the exact same name.
export const collisionMoveOldXVar = (playerNum) => `collisionOldX${playerNum}`;
export const collisionMoveOldYVar = (playerNum) => `collisionOldY${playerNum}`;
// player{N}size packs this player's own NUSIZ (copies/width) bits together
// with its reflect flag (see generateVisibility/generateAnimation in
// generators/bbasic/sprites.js) - snapshotting it alongside X/Y and
// reverting it too on a collision is what actually fixes a sprite getting
// stuck overlapping a playfield pixel: confirmed directly as a real gap
// otherwise - reverting ONLY position assumes the sprite's own SHAPE never
// changes frame to frame, but an animation-driven width change (e.g. a
// wider frame of a multi-copy/double-wide sprite) can itself be what
// caused this frame's collision, with X/Y never having moved at all. The
// position revert alone put the sprite back at a spot that was only ever
// validated against its PREVIOUS (narrower) width - never actually tested
// against the new one - so it could still collide right there too,
// leaving the sprite visibly stuck since this block only ever reverts
// once per frame, not in a retry loop.
export const collisionMoveOldSizeVar = (playerNum) => `collisionOldSize${playerNum}`;
// player{N}frame (see generateAnimations in generators/bbasic.js) selects
// which pose's pixels are actually drawn, and each pose can have a
// completely different lit-pixel footprint - a wider/taller pose can newly
// overlap a playfield pixel while the sprite sits perfectly still, with
// X/Y/NUSIZ never having changed at all, so reverting those alone can't fix
// every case. Reverting the frame too (tried, in more than one form) was
// rejected on purpose - the user confirmed even a conditional freeze was
// unwanted, so the animation is left to keep playing unconditionally,
// accepting that a wide enough pose can still show a brief visual overlap
// while the sprite is held against a wall.
//
// A predictive, fixed-8x8-box, per-axis software collision system (an
// alternative to the reactive check below) was also tried and removed -
// its row/column math checked out cleanly on the standard kernel, but
// caused genuine, reproducible screen roll once Superchip/a higher pfres
// was involved, even with a single instance in an otherwise near-empty
// project (confirmed directly: a zero-block build on the same project
// stayed perfectly stable). Root cause not pinned down before this was
// pulled - see git history on this file and on blocks/collision.js for
// the account, if picking this back up.

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
  // own drawscreen), reverts to the position AND size from before that move
  // if it collided (see collisionMoveOldSizeVar's own comment for why size
  // has to revert too, not just X/Y), then saves the now-known-good
  // position/size for next time. No movement of its own - whatever moves
  // the player is placed after this block in the same event, and runs
  // naturally after "drawscreen" as part of the user's own generated code,
  // so no special splice-point timing is needed here (unlike the
  // asm-minikernel version this replaces). "if X then goto label" is used
  // instead of "if X then A : B" for the revert,
  // since bBasic's "if X then A : B" only conditions A, not B - each branch
  // needs its own line/label, same reasoning as math_abs_set. Labels are
  // suffixed with a per-instance number (see blockNumbers) in case this
  // block is ever placed more than once for the same player.
  Blockly.BBasic['collision_check_position'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    const player = `player${playerNum}`;
    const sizeVar = `${player}size`;
    // Routed through nameDB_.getName (same bucket bbasic.js dimmed these
    // with) rather than the raw canonical string, so this always matches
    // whatever name actually got dimmed - same reasoning as the Distance
    // blocks' own getter (generators/bbasic/input.js).
    const oldX = Blockly.BBasic.nameDB_.getName(
        collisionMoveOldXVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const oldY = Blockly.BBasic.nameDB_.getName(
        collisionMoveOldYVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    // Snapshotted/reverted right alongside X/Y (see collisionMoveOldSizeVar's
    // own comment for why) - without this, a sprite whose own width grew via
    // an animation-driven size change (not a position move) could still
    // collide at the reverted X/Y too, since that position was only ever
    // validated against its PREVIOUS, narrower width.
    const oldSize = Blockly.BBasic.nameDB_.getName(
        collisionMoveOldSizeVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const blockNumber = Blockly.BBasic.blockNumbers.next(`collision_check_position_${playerNum}`);
    const revertLabel = `_collision_check_${playerNum}_${blockNumber}_revert`;
    const doneLabel = `_collision_check_${playerNum}_${blockNumber}_done`;
    return [
      `if collision(${player}, playfield) then goto ${revertLabel}`,
      `goto ${doneLabel}`,
      `@ ${revertLabel}`,
      `${player}x = ${oldX}`,
      `${player}y = ${oldY}`,
      `${sizeVar} = ${oldSize}`,
      `@ ${doneLabel}`,
      `${oldX} = ${player}x`,
      `${oldY} = ${player}y`,
      `${oldSize} = ${sizeVar}`,
    ].join('\n') + '\n';
  };
};
