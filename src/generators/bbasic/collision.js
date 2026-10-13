'use strict';

import {PF_BOX_X, PF_BOX_Y, PF_BOX_HIT, pfHitVarName, callPfBox} from './pf-box-sub';
import {pairKey, boxHitVarName, isPlayerName} from './sprite-box-width';

// Names of the hidden bytes each player's collision-check block backs up its
// pre-move position into (see bbasic.js's pre-scan, which pushes these
// into defvars only for whichever player actually uses the block, and this
// file's generator, which reads the position back out of them the
// following frame). Shared as functions (not inline template literals) so
// both places agree on the exact same name.
export const collisionMoveOldXVar = (playerNum) => `collisionOldX${playerNum}`;
export const collisionMoveOldYVar = (playerNum) => `collisionOldY${playerNum}`;
// A collisionMoveOldSizeVar (snapshotting/reverting player{N}size alongside
// X/Y) used to exist here - removed after confirming it never actually
// worked: player{N}size (NUSIZ) is a value the user's animation/size-
// changing blocks re-derive from player{N}animation/player{N}frame every
// frame, which this block never touched, so whatever code ran after it (or
// the very same animation logic that widened the sprite in the first place)
// just overwrote the "reverted" size again before drawscreen ever ran - the
// snapshot/restore had no lasting effect. There was never a way to make a
// SIZE revert stick given how NUSIZ is actually (re)computed, so that angle
// was dropped entirely rather than chased further.
//
// Earlier versions of an axis-aware, software pfread()-based version of this block were reverted, after a ROM lockup (an
// out-of-range playfield row index from the box math), a hard crash on contact and a screen roll (see git history on this
// file). This one is built on pf-box.js, whose box math is clamped before pfread() sees it and was checked against the hardware
// collision flag for every position of a solid sprite (standard kernel: normal, double and quad width, rows of 3 to 12
// steps), and sets a one-byte answer instead of branching in place. The block keeps the part of the move that is clear
// (sliding along a wall) and takes back the rest.

// The DPC+ kernel's hardware collision only knows Player 0, Player 1 (which stands for all the virtual sprites,
// Player 1 to 9, together), the missiles, the ball and the playfield. Collisions with Players 2 to 9 are the hardware
// check against Player 1 narrowed down by comparing bounding boxes, the way the batari Basic DPC+ collision example
// does. Two virtual sprites never collide in hardware at all, so for those it is the boxes alone.
//
// A 16 pixel wide player is two sprites, the second one (a virtual sprite, or Player 1 on the standard kernel) no block names. The
// hardware flags see it only as that sprite, so a wide player is compared by its box, which is as wide as both halves (see
// sprite-box-width.js), and for the playfield it is the player's flag or the answer for the other half.
const isExtraPlayer = (name) => /^player[2-9]$/.test(name);
const widePartnerOf = (Blockly, name) => (Blockly.BBasic.widePartners || {})[name];

export default (Blockly) => {
  const hitVar = (player) =>
    Blockly.BBasic.nameDB_.getName(pfHitVarName(player), Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  Blockly.BBasic[`collision_get`] = function(block) {
    const var0 = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR0'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const var1 = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR1'),
        Blockly.VARIABLE_CATEGORY_NAME);

    const wide0 = widePartnerOf(Blockly, var0);
    const wide1 = widePartnerOf(Blockly, var1);
    if (var0 !== var1 && (var0 === 'playfield' || var1 === 'playfield') && (wide0 || wide1)) {
      // A wide player in the playfield: its flag, or the other half's.
      const owner = wide0 ? var0 : var1;
      const mainHit = isExtraPlayer(owner) ? hitVar(owner) : `collision(${owner}, playfield)`;
      return [`${mainHit} || ${hitVar(widePartnerOf(Blockly, owner))}`, Blockly.BBasic.ORDER_LOGICAL_OR];
    }
    if (var0 !== var1 && (isExtraPlayer(var0) || isExtraPlayer(var1) || wide0 || wide1)) {
      const [extra, other] = (isExtraPlayer(var0) || wide0) ? [var0, var1] : [var1, var0];
      // The hardware flag only knows Player 1 for all the virtual sprites; the box test says it for this one.
      if (other === 'playfield') {
        return [hitVar(extra), Blockly.BBasic.ORDER_ATOMIC];
      }
      const boxes = Blockly.BBasic.nameDB_.getName(boxHitVarName(pairKey(extra, other)), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      // Another player has no hardware collision with these, only the boxes can tell.
      if (isPlayerName(other)) return [boxes, Blockly.BBasic.ORDER_ATOMIC];
      // A missile or the ball: the hardware flag of the sprite the box stands for (both halves of a wide Player 0), narrowed by it.
      const flags = (extra === 'player0' && widePartnerOf(Blockly, extra)) ?
        `(collision(${other}, player0) || collision(${other}, player1))` :
        `collision(${other}, ${extra === 'player0' ? 'player0' : 'player1'})`;
      return [`${flags} && ${boxes}`, Blockly.BBasic.ORDER_LOGICAL_AND];
    }
    const code = var0 === var1 ? 'true' :
      `collision(${var0}, ${var1})`;

    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  // One-frame-delayed hardware-collision "backtrack" check - no movement of
  // its, and no extra drawscreen: bBasic's kernel already clears the
  // TIA collision latches every frame as part of "drawscreen" (its version of
  // CXCLR), and its "collision()" builtin already wraps reading them
  // (CXP0FB/CXP1FB) - so checking collision() at the START of a frame, BEFORE
  // this frame's movement blocks run, reads the result of LAST frame's
  // movement and undoes it if it collided. Place this ahead of whatever
  // joystick/movement blocks already move the player (e.g. from the Sprites
  // category) in the same event - it only backs up and restores position, it
  // never moves the player itself.
  //
  // This checks X and Y together (both revert if either axis collided), not
  // separately - CXP0FB/CXP1FB is a single combined bit with no way to tell
  // which axis caused an overlap directly from hardware, and every software
  // attempt at doing that separately has broken in a real, different way
  // each time it's been tried (see this file's top-of-file comment for
  // the account) - stops dead at a wall instead of sliding along it, but
  // it's the one version of this that's actually held up.
  Blockly.BBasic['collision_check_position'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    const player = `player${playerNum}`;
    // collisionMoveOldXVar/YVar now route through reserveDevVarRW
    // (generators/bbasic.js's init()) - a plain lookup here, already
    // reserved during init(), same "already reserved by the time any
    // generator runs" timing as every other reserveDevVarRW consumer (see
    // its comment there).
    const oldXPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldXVar(playerNum)];
    const oldYPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldYVar(playerNum)];
    const blockNumber = Blockly.BBasic.blockNumbers.next(`collision_check_position_${playerNum}`);
    const revertLabel = `_collision_check_${playerNum}_${blockNumber}_revert`;
    const doneLabel = `_collision_check_${playerNum}_${blockNumber}_done`;
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const boxX = resolveVar(PF_BOX_X);
    const boxY = resolveVar(PF_BOX_Y);
    const boxHit = resolveVar(PF_BOX_HIT);
    const tryYLabel = `_collision_check_${playerNum}_${blockNumber}_tryy`;
    const bothLabel = `_collision_check_${playerNum}_${blockNumber}_both`;
    const box = callPfBox(Blockly, player);
    return [
      // Players 2 to 9 have no hardware collision: the box test of the last frame says it for them.
      isExtraPlayer(player) ?
        `if ${resolveVar(pfHitVarName(player))} then goto ${revertLabel}` :
        `if collision(${player}, playfield) then goto ${revertLabel}`,
      // The right half of a wide player went into it.
      ...(widePartnerOf(Blockly, player) ?
        [`if ${resolveVar(pfHitVarName(widePartnerOf(Blockly, player)))} then goto ${revertLabel}`] : []),
      `goto ${doneLabel}`,
      `@ ${revertLabel}`,
      // Went into the playfield. Keeps the part of the move that is clear: first the new y with the old x (it slides along a
      // wall to the side), then the new x with the old y (along a floor), and when neither is, none of the move.
      `${boxX} = ${oldXPair.read}`,
      `${boxY} = ${player}y`,
      box,
      `if ${boxHit} then goto ${tryYLabel}`,
      `${player}x = ${oldXPair.read}`,
      `goto ${doneLabel}`,
      `@ ${tryYLabel}`,
      `${boxX} = ${player}x`,
      `${boxY} = ${oldYPair.read}`,
      box,
      `if ${boxHit} then goto ${bothLabel}`,
      `${player}y = ${oldYPair.read}`,
      `goto ${doneLabel}`,
      `@ ${bothLabel}`,
      `${player}x = ${oldXPair.read}`,
      `${player}y = ${oldYPair.read}`,
      `@ ${doneLabel}`,
      `${oldXPair.write} = ${player}x`,
      `${oldYPair.write} = ${player}y`,
    ].join('\n') + '\n';
  };
};
