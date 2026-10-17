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
export const collisionMoveOlderXVar = (playerNum) => `collisionOlderX${playerNum}`;
export const collisionMoveOlderYVar = (playerNum) => `collisionOlderY${playerNum}`;

// The bytes of the Jump block (sprite_platformer), for each player it is used with: the speed (in eighths of a pixel a
// frame, up while rising and down while falling), the eighths of a pixel not yet moved, and the state, one byte that the block that
// asks (sprite_platformer_state) reads bits of: bits 0 to 2 the jumps made (0 to 4), bit 3 jumping (rising), bit 4 falling, bit 5 on
// the ground, bit 6 a jump was asked for last frame, bit 7 asked for this frame (by the Jump block); and one byte for all of them, the pixels still to move this frame.
export const PLATFORMER_JUMPING_BIT = 3;
export const PLATFORMER_FALLING_BIT = 4;
export const PLATFORMER_GROUND_BIT = 5;
export const PLATFORMER_BUTTON_BIT = 6;
export const MAX_PLATFORMER_JUMPS = 4;
export const platformerSpeedVar = (playerNum) => `platSpeed${playerNum}`;
export const platformerFracVar = (playerNum) => `platFrac${playerNum}`;
export const platformerStateVar = (playerNum) => `platState${playerNum}`;
// The jump speed (high four bits) and the max fall speed (low four bits), and the gravity (high) and the jumps allowed (low), each stored as
// the number less one XOR what it starts as, so that a byte never written (0) is the starting numbers.
export const platformerLimitVar = (playerNum) => `platLimit${playerNum}`;
export const platformerParamsVar = (playerNum) => `platParams${playerNum}`;
// What the numbers start as for a player: the numbers of its first Jump block that are plain numbers, else these.
export const platformerStartsOf = (block) => {
  const starts = {jump: 5, fall: 6, gravity: 3, jumps: 2};
  if (!block) return starts;
  const constant = (input, min, max, fallback) => {
    const target = block.getInputTargetBlock(input);
    if (!target || target.type !== 'math_number') return fallback;
    return Math.max(min, Math.min(max, Math.round(Number(target.getFieldValue('NUM')) || min)));
  };
  starts.jump = constant('SPEED', 1, 16, 5);
  starts.fall = constant('MAXFALL', 1, 16, 6);
  starts.gravity = constant('GRAVITY', 1, 16, 3);
  starts.jumps = block.getFieldValue('MULTI') === 'TRUE' ? constant('MAXJUMPS', 1, MAX_PLATFORMER_JUMPS, 2) : 1;
  return starts;
};
export const PLATFORMER_COUNT_VAR = 'platCount';
export const reservePlatformerDevVars = (reserveDevVar, players) => {
  if (!players || !players.size) return;
  reserveDevVar(PLATFORMER_COUNT_VAR, undefined, 'pixels the Jump block still has to move the player this frame');
  [...players].sort().forEach((playerNum) => {
    reserveDevVar(platformerSpeedVar(playerNum), undefined, `player ${playerNum}'s jump and fall speed (eighths of a pixel a frame)`);
    reserveDevVar(platformerFracVar(playerNum), undefined, `player ${playerNum}'s eighths of a pixel not yet moved`);
    reserveDevVar(platformerLimitVar(playerNum), undefined,
        `player ${playerNum}'s jump speed (high 4 bits) and max fall speed (low 4 bits), less one, XOR their starting values`);
    reserveDevVar(platformerParamsVar(playerNum), undefined,
        `player ${playerNum}'s gravity (high 4 bits) and jumps allowed (low 4 bits), less one, XOR their starting values`);
    reserveDevVar(platformerStateVar(playerNum), undefined,
        `player ${playerNum}'s jumps made (bits 0-2), jumping (3), falling (4), on the ground (5), a jump asked for last frame (6) and this frame (7)`);
  });
};
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

  // The Jump block: it goes inside an if block, and each time it runs it sets the numbers the jump and gravity use (a number that is a
  // block is worked out now) and asks for a jump. The jump itself, with the gravity and the landing on the playfield, is done every
  // frame by generatePlatformerChecks (see below) for every player that has a Jump block.
  Blockly.BBasic['sprite_platformer'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const lim = resolveVar(platformerLimitVar(playerNum));
    const par = resolveVar(platformerParamsVar(playerNum));
    const st = resolveVar(platformerStateVar(playerNum));
    const starts = (Blockly.BBasic.platformerStarts || {})[playerNum] || platformerStartsOf(null);
    const multi = block.getFieldValue('MULTI') === 'TRUE';
    // Each number is stored less one and XOR what the player starts with, in four bits, so that a byte that was never written (0)
    // is the starting numbers.
    const nibble = (input, min, max, start, fallback) => {
      const target = block.getInputTargetBlock(input);
      if (!target) return {constant: (fallback - 1) ^ (start - 1)};
      if (target.type === 'math_number') {
        const value = Math.max(min, Math.min(max, Math.round(Number(target.getFieldValue('NUM')) || min)));
        return {constant: (value - 1) ^ (start - 1)};
      }
      const expr = Blockly.BBasic.valueToCode(block, input, Blockly.BBasic.ORDER_NONE) || String(fallback);
      return {lines: [
        `temp1 = ${expr}`,
        ...(min > 0 ? [`if temp1 < ${min} then temp1 = ${min}`] : []),
        `if temp1 > ${max} then temp1 = ${max}`,
        `temp1 = temp1 - 1`,
        `temp1 = temp1 ^ ${start - 1}`,
      ]};
    };
    const jumpSpeed = nibble('SPEED', 1, 16, starts.jump, 5);
    const maxFall = nibble('MAXFALL', 1, 16, starts.fall, 6);
    const gravity = nibble('GRAVITY', 1, 16, starts.gravity, 3);
    const maxJumps = multi ? nibble('MAXJUMPS', 1, MAX_PLATFORMER_JUMPS, starts.jumps, 2) : {constant: 0 ^ (starts.jumps - 1)};
    // One byte from two nibbles: both plain numbers is one assignment; a nibble that is a block is put in with its own few statements.
    const packByte = (variable, high, low) => {
      if (high.constant !== undefined && low.constant !== undefined) return [`${variable} = ${high.constant * 16 + low.constant}`];
      const lines = [];
      if (high.constant !== undefined) {
        lines.push(`${variable} = ${variable} & 15`, `${variable} = ${variable} | ${high.constant * 16}`);
      } else {
        lines.push(...high.lines, 'temp1 = temp1 * 16', `${variable} = ${variable} & 15`, `${variable} = ${variable} | temp1`);
      }
      if (low.constant !== undefined) {
        lines.push(`${variable} = ${variable} & 240`, `${variable} = ${variable} | ${low.constant}`);
      } else {
        lines.push(...low.lines, `${variable} = ${variable} & 240`, `${variable} = ${variable} | temp1`);
      }
      return lines;
    };
    return [
      ...packByte(lim, jumpSpeed, maxFall),
      ...packByte(par, gravity, maxJumps),
      `${st}{7} = 1`,
    ].join('\n') + '\n';
  };

  // Once a frame, after everything that moves sprites has run: the jump and gravity of each player that has a Jump block. A jump
  // asked for (bit 7 of the state byte, set by the block) that was not asked for last frame (bit 6) starts a jump, from the ground or in the
  // air with jumps left. Every move is tried first with the software box test of pf-box.js, one pixel at a time, so the player is never put
  // into a lit pixel and never has to be pushed out of one: standing on a pixel it only asks "is there ground one pixel down?" and moves
  // nothing, so there is nothing to jitter. It rises by the jump speed and gravity slows the rise by its amount each frame and then speeds
  // the fall up to the max fall speed; speeds are in eighths of a pixel, so low gravity is smooth. Walking off an edge starts a fall and counts as a
  // jump made. The code is assembly (smaller than the same in batari Basic) with the box test called from batari Basic in the middle.
  // Labels in the assembly are marked with "@"; the batari Basic ones are lines "@ name" and are reached from the assembly with a dot.
  Blockly.BBasic.generatePlatformerChecks = function() {
    const players = Blockly.BBasic.platformerJumpPlayers;
    if (!players || !players.size) return '';
    const chunks = [];
    [...players].sort().forEach((playerNum) => {
      // A player (0 to 9), a missile (missile0, missile1) or the ball.
      const player = /^\d+$/.test(playerNum) ? `player${playerNum}` : playerNum;
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const spd = resolveVar(platformerSpeedVar(playerNum));
      const frac = resolveVar(platformerFracVar(playerNum));
      const st = resolveVar(platformerStateVar(playerNum));
      const lim = resolveVar(platformerLimitVar(playerNum));
      const par = resolveVar(platformerParamsVar(playerNum));
      const cnt = resolveVar(PLATFORMER_COUNT_VAR);
      const bx = resolveVar(PF_BOX_X);
      const by = resolveVar(PF_BOX_Y);
      const hit = resolveVar(PF_BOX_HIT);
      const px = `${player}x`;
      const py = `${player}y`;
      const starts = (Blockly.BBasic.platformerStarts || {})[playerNum] || platformerStartsOf(null);
      const lab = (name) => `_plh${playerNum}_${name}`;
      const high = (start) => ['lsr', 'lsr', 'lsr', 'lsr', `eor #${start - 1}`];
      const low = (start) => ['and #15', `eor #${start - 1}`];
      const times8 = ['asl', 'asl', 'asl'];
      // Raw batari Basic: labels at the left edge, instructions indented.
      const asm = (...lines) => [' asm', ...lines.map((line) => (line[0] === '@' ? line.slice(1) : `       ${line}`)), 'end'].join('\n');
      chunks.push(
          ` rem jump and gravity of ${player}:`,
          asm(
              // The jump block asked this frame (bit 7)? And not last frame (bit 6)? Then it is a new press.
              'lda ' + st, 'tax', 'and #$3F', 'sta ' + st,
              'txa', 'and #$80', 'beq ' + lab('nojump'),
              'lda ' + st, 'ora #$40', 'sta ' + st,
              'txa', 'and #$40', 'bne ' + lab('nojump'),
              'txa', 'and #$20', 'bne ' + lab('dojump'),
              // In the air: only with jumps left.
              'lda ' + par, 'and #15', `eor #${starts.jumps - 1}`, 'clc', 'adc #1', 'sta ' + cnt,
              'txa', 'and #7', 'cmp ' + cnt, 'bcs ' + lab('nojump'),
              '@' + lab('dojump'),
              'lda ' + st, 'and #$40', 'sta ' + st,
              'txa', 'and #7', 'clc', 'adc #9', 'ora ' + st, 'sta ' + st,
              'lda ' + lim, ...high(starts.jump), 'clc', 'adc #1', ...times8, 'sta ' + spd,
              'lda #0', 'sta ' + frac, 'jmp ' + lab('move'),
              // Standing on something and not jumping: a one pixel fall that the box test turns back (landing again) when the pixel
              // under the player is lit. So nothing moves; it counts as a jump made only if it really fell.
              '@' + lab('nojump'),
              'lda ' + st, 'and #8', 'bne ' + lab('move'),
              'lda ' + st, 'and #$20', 'beq ' + lab('move'),
              'lda ' + st, 'and #$DF', 'ora #$10', 'sta ' + st,
              'and #7', 'bne ' + lab('skip'), 'inc ' + st,
              '@' + lab('skip'),
              'lda #0', 'sta ' + spd, 'sta ' + frac,
              'lda #1', 'sta ' + cnt, 'jmp ' + lab('step'),
              // The pixels to move this frame: the speed and what was left over, in eighths.
              '@' + lab('move'),
              'clc', 'lda ' + frac, 'adc ' + spd, 'tax', 'and #7', 'sta ' + frac, 'txa', 'lsr', 'lsr', 'lsr', 'sta ' + cnt,
              'lda ' + st, 'and #8', 'bne ' + lab('step'),
              'lda ' + st, 'ora #$10', 'sta ' + st,
              '@' + lab('step'),
              'lda ' + cnt, 'bne ' + lab('go'), 'jmp ' + lab('speed'),
              '@' + lab('go'),
              'dec ' + cnt,
              'lda ' + st, 'and #8', 'bne ' + lab('stepup'),
              'lda ' + py, 'cmp #255', 'beq ' + lab('land'),
              'ldx ' + py, 'inx', 'bne ' + lab('probe'),
              '@' + lab('stepup'),
              'lda ' + py, 'beq ' + lab('bump'),
              'ldx ' + py, 'dex',
              '@' + lab('probe'),
              'stx ' + by, 'lda ' + px, 'sta ' + bx,
          ),
          ` ${callPfBox(Blockly, player)}`,
          asm(
              'lda ' + hit, 'beq ' + lab('free'),
              'lda ' + st, 'and #8', 'bne ' + lab('bump'),
              // On top of a pixel: stopped, standing, the jumps made forgotten.
              '@' + lab('land'),
              'lda #0', 'sta ' + spd, 'sta ' + frac,
              'lda ' + st, 'and #$40', 'ora #$20', 'sta ' + st, 'jmp ' + lab('end'),
              // Hit its head: the rise ends and the fall starts.
              '@' + lab('bump'),
              'lda #0', 'sta ' + spd, 'sta ' + frac,
              'lda ' + st, 'and #$F7', 'ora #$10', 'sta ' + st, 'jmp ' + lab('end'),
              '@' + lab('free'),
              'lda ' + by, 'sta ' + py, 'jmp ' + lab('step'),
              // Gravity: slows the rise, then speeds up the fall to the max fall speed.
              '@' + lab('speed'),
              'lda ' + st, 'and #8', 'bne ' + lab('rising'),
              'lda ' + par, ...high(starts.gravity), 'sec', 'adc ' + spd, 'sta ' + spd,
              'lda ' + lim, ...low(starts.fall), 'clc', 'adc #1', ...times8,
              'cmp ' + spd, 'bcs ' + lab('end'), 'sta ' + spd, 'jmp ' + lab('end'),
              '@' + lab('rising'),
              'lda ' + par, ...high(starts.gravity), 'clc', 'adc #1', 'sta ' + cnt, 'cmp ' + spd, 'bcs ' + lab('top'),
              'lda ' + spd, 'sec', 'sbc ' + cnt, 'sta ' + spd, 'jmp ' + lab('end'),
              '@' + lab('top'),
              'lda #0', 'sta ' + spd,
              'lda ' + st, 'and #$F7', 'ora #$10', 'sta ' + st,
              '@' + lab('end'),
          ),
      );
    });
    return chunks.join('\n') + '\n';
  };

  // Whether a player the Jump block moves is jumping (rising), falling or on the ground: a bit of its state byte.
  Blockly.BBasic['sprite_platformer_state'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    const bit = {jumping: PLATFORMER_JUMPING_BIT, falling: PLATFORMER_FALLING_BIT, ground: PLATFORMER_GROUND_BIT}[block.getFieldValue('STATE')] ||
      PLATFORMER_GROUND_BIT;
    const state = Blockly.BBasic.nameDB_.getName(platformerStateVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [`${state}{${bit}}`, Blockly.BBasic.ORDER_ATOMIC];
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
    const lastXPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldXVar(playerNum)];
    const lastYPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldYVar(playerNum)];
    // Going back two frames puts the player where it was before the last two moves.
    const twoFrames = block.getFieldValue('FRAMES') === '2';
    const oldXPair = twoFrames ? Blockly.BBasic.superchipRwPairs[collisionMoveOlderXVar(playerNum)] : lastXPair;
    const oldYPair = twoFrames ? Blockly.BBasic.superchipRwPairs[collisionMoveOlderYVar(playerNum)] : lastYPair;
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
      ...(twoFrames ? [`${oldXPair.write} = ${lastXPair.read}`, `${oldYPair.write} = ${lastYPair.read}`] : []),
      `${lastXPair.write} = ${player}x`,
      `${lastYPair.write} = ${player}y`,
    ].join('\n') + '\n';
  };
};
