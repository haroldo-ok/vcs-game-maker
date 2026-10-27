'use strict';

import {sameColumnsLines} from './box-columns';

import {PF_BOX_X, PF_BOX_Y, PF_BOX_HIT, PF_BOX_EXT, pfHitVarName, callPfBox, callPfBoxQuick} from './pf-box-sub';
import {useConfigurationStorage} from '../../hooks/project';
import {pairKey, boxHitRef, isPlayerName} from './sprite-box-width';

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
// Set by the Undo last move block when it runs, so the check at the end of the frame knows the saved position is from this frame.

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
// For the players a "moving" check asks about: whether the player moved in the last frame, and where it was a frame before.
export const platformerMovedVar = (playerNum) => `platMoved${playerNum}`;
export const platformerPrevXVar = (playerNum) => `platPrevX${playerNum}`;
export const platformerPrevYVar = (playerNum) => `platPrevY${playerNum}`;
// For the players a "landed" check asks about: bit 0 is 1 for the one frame in which the player came down onto the ground, bit 1 says it
// was on the ground at the end of the last frame.
export const platformerLandedVar = (playerNum) => `platLanded${playerNum}`;
// For the players whose Jump block stops them at the walls to the left and right: where the player was at the end of the last frame.
export const platformerLastXVar = (playerNum) => `platLastX${playerNum}`;
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
// Which of the numbers of a player's Jump blocks (jump speed, max fall speed, gravity, jumps) change when the game runs. A number that is the same
// plain number in every Jump block of the player is a constant in the code of the jump and is kept nowhere; each of the others has a nibble (four bits)
// of the two bytes (the limit byte, then the params byte), the first in the high nibble of the limit byte.
export const PLATFORMER_FIELDS = ['jump', 'fall', 'gravity', 'jumps'];
export const platformerPlanOf = (blocks) => {
  const inputs = {jump: ['SPEED', 1, 16, 5], fall: ['MAXFALL', 1, 16, 6], gravity: ['GRAVITY', 1, 16, 3], jumps: ['MAXJUMPS', 1, MAX_PLATFORMER_JUMPS, 2]};
  const valueOf = (block, field) => {
    if (field === 'jumps' && block.getFieldValue('MULTI') !== 'TRUE') return 1;
    const [input, min, max, fallback] = inputs[field];
    const target = block.getInputTargetBlock(input);
    if (!target) return fallback;
    if (target.type !== 'math_number') return null;
    return Math.max(min, Math.min(max, Math.round(Number(target.getFieldValue('NUM')) || min)));
  };
  const plan = {slots: {}, constants: {}, bytes: [false, false]};
  let slot = 0;
  PLATFORMER_FIELDS.forEach((field) => {
    const values = blocks.map((block) => valueOf(block, field));
    if (values.every((value) => value !== null && value === values[0])) {
      plan.constants[field] = values[0];
    } else {
      plan.slots[field] = slot;
      plan.bytes[slot >> 1] = true;
      slot++;
    }
  });
  return plan;
};
const ALL_VARYING_PLAN = {slots: {jump: 0, fall: 1, gravity: 2, jumps: 3}, constants: {}, bytes: [true, true]};
export const reservePlatformerDevVars = (reserveDevVar, players, movingPlayers = new Set(), wallsPlayers = new Set(), plans = {}, landedPlayers = new Set()) => {
  if (!players || !players.size) return;
  [...players].sort().forEach((playerNum) => {
    reserveDevVar(platformerSpeedVar(playerNum), undefined, `player ${playerNum}'s jump and fall speed (eighths of a pixel a frame)`);
    reserveDevVar(platformerFracVar(playerNum), undefined, `player ${playerNum}'s eighths of a pixel not yet moved`);
    // (A player with only the blocks that read the state has no Jump block, so none of the numbers of one to keep.)
    const plan = plans[playerNum] || {bytes: [false, false]};
    if (plan.bytes[0]) {
      reserveDevVar(platformerLimitVar(playerNum), undefined,
          `player ${playerNum}'s numbers of the Platform block that change, less one, XOR their starting values: 4 bits each, the first two`);
    }
    if (plan.bytes[1]) {
      reserveDevVar(platformerParamsVar(playerNum), undefined,
          `player ${playerNum}'s numbers of the Platform block that change, less one, XOR their starting values: 4 bits each, the third and fourth`);
    }
    reserveDevVar(platformerStateVar(playerNum), undefined,
        `player ${playerNum}'s jumps made (bits 0-2), jumping (3), falling (4), on the ground (5), a jump asked for last frame (6) and this frame (7)`);
    if (wallsPlayers.has(playerNum)) {
      reserveDevVar(platformerLastXVar(playerNum), undefined, `player ${playerNum}'s x at the end of the last frame (for the walls to the left and right)`);
    }
    if (landedPlayers.has(playerNum)) {
      reserveDevVar(platformerLandedVar(playerNum), undefined,
          `bit 0: 1 for the frame player ${playerNum} landed on the ground; bit 1: it was on the ground at the end of the last frame`);
    }
    if (movingPlayers.has(playerNum)) {
      reserveDevVar(platformerMovedVar(playerNum), undefined, `1 while player ${playerNum} moved in the last frame`);
      reserveDevVar(platformerPrevXVar(playerNum), undefined, `player ${playerNum}'s x a frame ago`);
      reserveDevVar(platformerPrevYVar(playerNum), undefined, `player ${playerNum}'s y a frame ago`);
    }
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
// With virtual sprites in the project Player 1's hardware flags are shared by all of them, so Player 1 is compared by its box as well.
const isBoxedPlayer = (Blockly, name) => isExtraPlayer(name) || (name === 'player1' && !!Blockly.BBasic.player1Shared);
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
    if (block.getFieldValue('BOX') === 'TRUE' && var0 !== var1 && (var0 === 'playfield' || var1 === 'playfield')) {
      // The box test of the player (and of the other half of a wide player), as of the end of the last frame.
      const owner = var0 === 'playfield' ? var1 : var0;
      if (/^player\d$/.test(owner)) {
        const partner = widePartnerOf(Blockly, owner);
        return partner ? [`${hitVar(owner)} || ${hitVar(partner)}`, Blockly.BBasic.ORDER_LOGICAL_OR] : [hitVar(owner), Blockly.BBasic.ORDER_ATOMIC];
      }
    }
    if (var0 !== var1 && (var0 === 'playfield' || var1 === 'playfield') && (wide0 || wide1)) {
      // A wide player in the playfield: its flag, or the other half's.
      const owner = wide0 ? var0 : var1;
      const mainHit = isBoxedPlayer(Blockly, owner) ? hitVar(owner) : `collision(${owner}, playfield)`;
      return [`${mainHit} || ${hitVar(widePartnerOf(Blockly, owner))}`, Blockly.BBasic.ORDER_LOGICAL_OR];
    }
    if (var0 !== var1 && (isBoxedPlayer(Blockly, var0) || isBoxedPlayer(Blockly, var1) || wide0 || wide1)) {
      const [extra, other] = (isBoxedPlayer(Blockly, var0) || wide0) ? [var0, var1] : [var1, var0];
      // The hardware flag only knows Player 1 for all the virtual sprites; the box test says it for this one.
      if (other === 'playfield') {
        return [hitVar(extra), Blockly.BBasic.ORDER_ATOMIC];
      }
      const boxes = boxHitRef(Blockly, pairKey(extra, other));
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
    const plan = (Blockly.BBasic.platformerPlans || {})[playerNum] || ALL_VARYING_PLAN;
    const lim = plan.bytes[0] ? resolveVar(platformerLimitVar(playerNum)) : '';
    const par = plan.bytes[1] ? resolveVar(platformerParamsVar(playerNum)) : '';
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
    // One byte from two nibbles: both plain numbers is one assignment; a nibble that is a block is put in by a few statements.
    const packByte = (variable, high, low) => {
      if (high.constant !== undefined && low.constant !== undefined) return [`${variable} = ${high.constant * 16 + low.constant}`];
      // (The whole byte is written, so what it held is not read: the high nibble goes in first, the low one is put on it.)
      if (low.constant !== undefined) {
        return [...high.lines, `${variable} = temp1 * 16`, ...(low.constant ? [`${variable} = ${variable} | ${low.constant}`] : [])];
      }
      if (high.constant !== undefined) {
        return [...low.lines, `${variable} = temp1${high.constant ? ` | ${high.constant * 16}` : ''}`];
      }
      return [...high.lines, `${variable} = temp1 * 16`, ...low.lines, `${variable} = ${variable} | temp1`];
    };
    // The numbers that change go in their nibbles; a number that is always the same is in the code of the jump.
    const nibbles = [{constant: 0}, {constant: 0}, {constant: 0}, {constant: 0}];
    [['jump', jumpSpeed], ['fall', maxFall], ['gravity', gravity], ['jumps', maxJumps]].forEach(([field, value]) => {
      if (plan.slots[field] !== undefined) nibbles[plan.slots[field]] = value;
    });
    return [
      ...(plan.bytes[0] ? packByte(lim, nibbles[0], nibbles[1]) : []),
      ...(plan.bytes[1] ? packByte(par, nibbles[2], nibbles[3]) : []),
      `${st}{7} = 1`,
    ].join('\n') + '\n';
  };

  // Once a frame, after everything that moves sprites has run: the jump and gravity of each player that has a Jump block. A jump
  // asked for (bit 7 of the state byte, set by the block) that was not asked for last frame (bit 6) starts a jump, from the ground or in the
  // air with jumps left. Every move is tried first with the software box test of pf-box.js, the lines it is going to move through looked at in one go, so the player is never put
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
      const plan = (Blockly.BBasic.platformerPlans || {})[playerNum] || ALL_VARYING_PLAN;
      const lim = plan.bytes[0] ? resolveVar(platformerLimitVar(playerNum)) : '';
      const par = plan.bytes[1] ? resolveVar(platformerParamsVar(playerNum)) : '';
      // The pixels the player still has to move this frame: a scratch byte, put on the stack over the call of the box test (which uses them all).
      const cnt = 'temp3';
      const bx = resolveVar(PF_BOX_X);
      const by = resolveVar(PF_BOX_Y);
      const hit = resolveVar(PF_BOX_HIT);
      const px = `${player}x`;
      const py = `${player}y`;
      const moving = (Blockly.BBasic.platformerMovingPlayers || new Set()).has(playerNum);
      const movedVar = moving ? resolveVar(platformerMovedVar(playerNum)) : '';
      const prevX = moving ? resolveVar(platformerPrevXVar(playerNum)) : '';
      const prevY = moving ? resolveVar(platformerPrevYVar(playerNum)) : '';
      const landed = (Blockly.BBasic.platformerLandedPlayers || new Set()).has(playerNum);
      const landedVar = landed ? resolveVar(platformerLandedVar(playerNum)) : '';
      const starts = (Blockly.BBasic.platformerStarts || {})[playerNum] || platformerStartsOf(null);
      const lab = (name) => `_plh${playerNum}_${name}`;
      // The asm that leaves a number, less one, in A: from its nibble (XOR what it starts as), or the constant if it never changes.
      const minusOne = (field) => {
        const slot = plan.slots[field];
        if (slot === undefined) return [`lda #${plan.constants[field] - 1}`];
        const byte = slot < 2 ? lim : par;
        return slot % 2 === 0 ? ['lda ' + byte, 'lsr', 'lsr', 'lsr', 'lsr', `eor #${starts[field] - 1}`] : ['lda ' + byte, 'and #15', `eor #${starts[field] - 1}`];
      };
      const times8 = ['asl', 'asl', 'asl'];
      // Raw batari Basic: labels at the left edge, instructions indented.
      const asm = (...lines) => [' asm', ...lines.map((line) => (line[0] === '@' ? line.slice(1) : `       ${line}`)), 'end'].join('\n');
      // The sweep (see pf-box.js) leaves where the sprite stops against the lit row it found in the box test's y.
      const config = (useConfigurationStorage() || {}).value || {};
      const dpcPlus = config.kernel === 'dpcplus';
      const ext = resolveVar(PF_BOX_EXT);
      // Stopped at the walls to the left and right: a move in x that puts the box in a lit pixel is taken back to where the player was at the end of
      // the last frame (the box test goes in by the quick way, so a move that stays in the same columns costs little).
      const walls = (Blockly.BBasic.platformerWallsPlayers || new Set()).has(playerNum);
      // A plain player (not a missile or the ball, no second half) that the standing test can skip while it stays in the same columns.
      const sameColumnsOk = /^\d+$/.test(playerNum) && !(Blockly.BBasic.widePartners || {})[player];
      const boxOffset = dpcPlus ? 16 : 17;
      const lastX = walls ? resolveVar(platformerLastXVar(playerNum)) : '';
      if (walls) {
        // The box is only looked at when the player has moved into other playfield columns than it was in (the check is done here, in
        // assembly, so a move that keeps the columns costs next to nothing).
        chunks.push(
            ` rem walls to the left and right of ${player}:`,
            asm(
                'lda ' + px, 'cmp ' + lastX, `bne ${lab('wmoved')}`, `jmp .${lab('wallsdone')}`,
                // (No x yet, the first frame: nothing to go back to.)
                '@' + lab('wmoved'), 'lda ' + lastX, `bne ${lab('wlast')}`, `jmp .${lab('wallsdone')}`,
                '@' + lab('wlast'),
                ...(sameColumnsOk ? [
                  ...sameColumnsLines({sizeVar: `${player}size`, xA: px, xB: lastX, tmp: cnt, full: lab('wcheck'), prefix: lab('wsc'), offset: boxOffset, dpcPlus}),
                  `jmp .${lab('wallsdone')}`,
                ] : []),
                '@' + lab('wcheck'),
            ),
            ` ${bx} = ${px}`,
            ` ${by} = ${py}`,
            ` ${callPfBox(Blockly, player)}`,
            ` if ${hit} then ${px} = ${lastX}`,
            // A player standing there has had a whole test this frame: the look at the ground under it (which is also due, in the new columns) is put
            // off to the next frame, so that the two do not fall in the same frame and make it long (the count that brings the next look round is only ever moved forward, so a
            // player that keeps being tested here still gets its ground looked at).
            ` if ${st}{5} then ${frac} = ${px}`,
            ` if ${st}{5} && ${spd} < 14 then ${spd} = 14`,
            lab('wallsdone'));
      }
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
              ...minusOne('jumps'), 'clc', 'adc #1', 'sta ' + cnt,
              'txa', 'and #7', 'cmp ' + cnt, 'bcs ' + lab('nojump'),
              '@' + lab('dojump'),
              'lda ' + st, 'and #$40', 'sta ' + st,
              'txa', 'and #7', 'clc', 'adc #9', 'ora ' + st, 'sta ' + st,
              ...minusOne('jump'), 'clc', 'adc #1', ...times8, 'sta ' + spd,
              'lda #0', 'sta ' + frac, 'jmp ' + lab('move'),
              // Standing on something and not jumping: a one pixel fall that the box test turns back (landing again) when the pixel
              // under the player is lit. So nothing moves; it counts as a jump made only if it really fell.
              '@' + lab('nojump'),
              // (X still has the state byte the frame started with; bits 3 and 5 have not changed since: standing is on the ground (bit 5) and not rising (bit 3).)
              'txa', 'and #$28', 'cmp #$20', 'beq ' + lab('standing'), 'jmp ' + lab('move'), '@' + lab('standing'),
              // Standing and not moved sideways since the ground was last looked at (the x is kept in the fraction byte, which is not used
              // while standing): the ground is looked at again only every 16th frame, which saves a box test most frames.
              ...(sameColumnsOk ? [
                // (A plain player 8 pixels wide that has moved sideways but is still in the same playfield columns, (x - offset) / 4 to
                // (x - offset + 7) / 4, has the same ground under it.)
                // The x it landed at: nothing to work out.
                'lda ' + px, 'cmp ' + frac, 'bne ' + lab('stx'), 'jmp ' + lab('stand'), '@' + lab('stx'),
                ...sameColumnsLines({sizeVar: `${player}size`, xA: px, xB: frac, tmp: cnt, full: lab('fallcheck'), prefix: lab('stc'), offset: boxOffset, dpcPlus}),
              ] : ['lda ' + px, 'cmp ' + frac, 'bne ' + lab('fallcheck')]),
              '@' + lab('stand'),
              'inc ' + spd, 'lda ' + spd, 'and #15', 'beq ' + lab('fallcheck'), 'jmp ' + lab('end'),
              '@' + lab('fallcheck'),
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
              'lda ' + st, 'and #8', 'bne ' + lab('rise'),
              // Falling: the lines it falls through (all but the last of the 255 lines there are) are looked at in one go, from the top down.
              'lda ' + py, 'cmp #255', 'bne ' + lab('canfall'), 'jmp ' + lab('land'),
              '@' + lab('canfall'),
              'lda #255', 'sec', 'sbc ' + py, 'cmp ' + cnt, 'bcs ' + lab('fok'), 'sta ' + cnt,
              '@' + lab('fok'),
              'lda ' + cnt, 'sta ' + ext,
              ...(dpcPlus ? ['lda ' + py, 'sta ' + by] : ['clc', 'adc ' + py, 'sta ' + by]),
              'jmp ' + lab('setx'),
              // Rising: the lines above it, from the bottom up.
              '@' + lab('rise'),
              'lda ' + py, 'bne ' + lab('canrise'), 'jmp ' + lab('bump'),
              '@' + lab('canrise'),
              'cmp ' + cnt, 'bcs ' + lab('rok'), 'sta ' + cnt,
              '@' + lab('rok'),
              'lda ' + cnt, 'ora #$80', 'sta ' + ext,
              ...(dpcPlus ? ['lda ' + py, 'sec', 'sbc ' + cnt, 'sta ' + by] : ['lda ' + py, 'sta ' + by]),
              '@' + lab('setx'),
              'lda ' + px, 'sta ' + bx,
              'lda ' + cnt, 'pha',
          ),
          ` ${callPfBox(Blockly, player)}`,
          asm(
              'pla', 'sta ' + cnt,
              'lda ' + hit, 'bne ' + lab('dohit'),
              // Nothing lit in the way: all the lines are moved.
              'lda ' + st, 'and #8', 'bne ' + lab('moveup'),
              'lda ' + py, 'clc', 'adc ' + cnt, 'sta ' + py, 'jmp ' + lab('speed'),
              '@' + lab('moveup'),
              'lda ' + py, 'sec', 'sbc ' + cnt, 'sta ' + py, 'jmp ' + lab('speed'),
              // Against a lit row: put right against it (and never moved the wrong way, if it was inside it already).
              '@' + lab('dohit'),
              'lda ' + st, 'and #8', 'bne ' + lab('risehit'),
              // One line to move and a lit row right there: it does not move (the usual standing frame, with nothing to work out).
              'lda ' + cnt, 'cmp #1', 'bne ' + lab('fcalc'), 'jmp ' + lab('land'),
              '@' + lab('fcalc'),
              'lda ' + by,
              'cmp ' + py, 'bcs ' + lab('fset'), 'lda ' + py,
              '@' + lab('fset'),
              'sta ' + py, 'jmp ' + lab('land'),
              '@' + lab('risehit'),
              'lda ' + cnt, 'cmp #1', 'bne ' + lab('rcalc'), 'jmp ' + lab('bump'),
              '@' + lab('rcalc'),
              'lda ' + by,
              'cmp ' + py, 'bcc ' + lab('rset'), 'lda ' + py,
              '@' + lab('rset'),
              'sta ' + py, 'jmp ' + lab('bump'),
              // On top of a pixel: stopped, standing, the jumps made forgotten.
              '@' + lab('land'),
              'lda #0', 'sta ' + spd, 'lda ' + px, 'sta ' + frac,
              'lda ' + st, 'and #$40', 'ora #$20', 'sta ' + st, 'jmp ' + lab('end'),
              // Hit its head: the rise ends and the fall starts.
              '@' + lab('bump'),
              'lda #0', 'sta ' + spd, 'sta ' + frac,
              'lda ' + st, 'and #$F7', 'ora #$10', 'sta ' + st, 'jmp ' + lab('end'),
              // Gravity: slows the rise, then speeds up the fall to the max fall speed.
              '@' + lab('speed'),
              'lda ' + st, 'and #8', 'bne ' + lab('rising'),
              ...minusOne('gravity'), 'sec', 'adc ' + spd, 'sta ' + spd,
              ...minusOne('fall'), 'clc', 'adc #1', ...times8,
              'cmp ' + spd, 'bcs ' + lab('end'), 'sta ' + spd, 'jmp ' + lab('end'),
              '@' + lab('rising'),
              ...minusOne('gravity'), 'clc', 'adc #1', 'sta ' + cnt, 'cmp ' + spd, 'bcs ' + lab('top'),
              'lda ' + spd, 'sec', 'sbc ' + cnt, 'sta ' + spd, 'jmp ' + lab('end'),
              '@' + lab('top'),
              'lda #0', 'sta ' + spd,
              'lda ' + st, 'and #$F7', 'ora #$10', 'sta ' + st,
              '@' + lab('end'),
              ...(walls ? ['lda ' + px, 'sta ' + lastX] : []),
              // A "moving" check asks about this player: did x or y change since the end of the last frame?
              ...(moving ? [
                'lda ' + px, 'cmp ' + prevX, 'bne ' + lab('did'),
                'lda ' + py, 'cmp ' + prevY, 'bne ' + lab('did'),
                'lda #0', 'beq ' + lab('moved'),
                '@' + lab('did'),
                'lda #1',
                '@' + lab('moved'),
                'sta ' + movedVar, 'lda ' + px, 'sta ' + prevX, 'lda ' + py, 'sta ' + prevY,
              ] : []),
              // A "landed" check asks about this player: on the ground now, and not at the end of the last frame (bit 0 the landing, bit 1 the ground).
              ...(landed ? [
                'lda ' + st, 'and #' + (1 << PLATFORMER_GROUND_BIT), 'beq ' + lab('air'),
                'lda ' + landedVar, 'and #2', 'bne ' + lab('stood'),
                'lda #3', 'bne ' + lab('landedset'),
                '@' + lab('stood'),
                'lda #2', 'bne ' + lab('landedset'),
                '@' + lab('air'),
                'lda #0',
                '@' + lab('landedset'),
                'sta ' + landedVar,
              ] : []),
          ),
      );
    });
    return chunks.join('\n') + '\n';
  };

  // Whether a player the Jump block moves is jumping (rising), falling or on the ground: a bit of its state byte.
  Blockly.BBasic['sprite_platformer_state'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    if (block.getFieldValue('STATE') === 'moving') {
      return [Blockly.BBasic.nameDB_.getName(platformerMovedVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE), Blockly.BBasic.ORDER_ATOMIC];
    }
    if (block.getFieldValue('STATE') === 'landed') {
      return [`${Blockly.BBasic.nameDB_.getName(platformerLandedVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE)}{0}`, Blockly.BBasic.ORDER_ATOMIC];
    }
    const bit = {jumping: PLATFORMER_JUMPING_BIT, falling: PLATFORMER_FALLING_BIT, ground: PLATFORMER_GROUND_BIT}[block.getFieldValue('STATE')] ||
      PLATFORMER_GROUND_BIT;
    const state = Blockly.BBasic.nameDB_.getName(platformerStateVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [`${state}{${bit}}`, Blockly.BBasic.ORDER_ATOMIC];
  };

  // The jumps a player has made since it stood on the ground: the low three bits of its state byte.
  Blockly.BBasic['sprite_platformer_jumps'] = function(block) {
    const state = Blockly.BBasic.nameDB_.getName(platformerStateVar(block.getFieldValue('PLAYER')), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [`(${state} & 7)`, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Undo last move: this block only saves where the player is now (before this frame's blocks move it) and marks that it ran. The check
  // itself is done once a frame, after everything that moves sprites has run and before the picture is drawn (see
  // generateCollisionMoveChecks), with the box test of pf-box.js: the box is the whole of the sprite (its full width and height,
  // whatever pixels are lit in it) and a lit playfield pixel anywhere in it is a collision. A player that would be drawn in the playfield
  // goes back instead, so it is never shown there. Place this block ahead of whatever blocks move the player in the same event.
  Blockly.BBasic['collision_check_position'] = function(block) {
    const playerNum = block.getFieldValue('PLAYER');
    const player = `player${playerNum}`;
    const lastXPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldXVar(playerNum)];
    const lastYPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldYVar(playerNum)];
    // (The x is saved one more than it is, so that 0 says the block did not run: the end of the frame check works with the x it finds and puts 0 back.)
    return [
      `${lastXPair.write} = ${player}x + 1`,
      `${lastYPair.write} = ${player}y`,
    ].join('\n') + '\n';
  };

  // Once a frame, after the blocks that move sprites have run and before the Jump block moves its players (so that the sweep of the Jump block
  // starts from a position that is clear): each player the Undo last move block ran for is tested
  // with the box test. A player in a lit pixel keeps the part of its move that is clear: the move along one axis when only one axis moved,
  // else the new y with the old x, then the new x with the old y, and none of the move when neither is clear.
  Blockly.BBasic.generateCollisionMoveChecks = function() {
    const players = Blockly.BBasic.collisionMovePlayers;
    if (!players || !players.size) return '';
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const boxX = resolveVar(PF_BOX_X);
    const boxY = resolveVar(PF_BOX_Y);
    const boxHit = resolveVar(PF_BOX_HIT);
    const chunks = [];
    [...players].sort().forEach((playerNum) => {
      const player = `player${playerNum}`;
      const lastXPair = Blockly.BBasic.superchipRwPairs[collisionMoveOldXVar(playerNum)];
      const lastX = lastXPair.read;
      const lastY = Blockly.BBasic.superchipRwPairs[collisionMoveOldYVar(playerNum)].read;
      const lab = (suffix) => `_undo_end_${playerNum}_${suffix}`;
      const box = callPfBox(Blockly, player);
      const firstBox = callPfBoxQuick(Blockly, player);
      const boxOffset = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus' ? 16 : 17;
      chunks.push([
        ` rem undo last move of ${player}, looked at before it is drawn:`,
        `if ${lastX} = 0 then goto ${lab('done')}`,
        `${lastXPair.write} = ${lastX} - 1`,
        `if ${player}x = ${lastX} && ${player}y = ${lastY} then goto ${lab('done')}`,
        // A move along x that keeps the box in the same playfield columns needs no look at the pixels (the box was clear where it was): that is
        // seen here, in assembly, without a call to the box test (a call across banks is dear). Anything else, a change of y too, is looked at in full.
        ...(firstBox === box ? [`${boxX} = ${player}x`, `${boxY} = ${player}y`, box] : [
          ' asm',
          `       lda ${player}y`, `       cmp ${lastY}`, `       beq ${lab('ysame')}`, `       jmp ${lab('full')}`, lab('ysame'),
          ...sameColumnsLines({sizeVar: `${player}size`, xA: `${player}x`, xB: lastX, tmp: 'temp1', full: lab('full'), prefix: lab('sc'), offset: boxOffset,
            dpcPlus: boxOffset === 16}).map((line) => (line[0] === '@' ? line.slice(1) : `       ${line}`)),
          `       jmp .${lab('done')}`,
          lab('full'),
          'end',
          `${boxX} = ${player}x`,
          `${boxY} = ${player}y`,
          box]),
        `if ${boxHit} = 0 then goto ${lab('done')}`,
        // In a lit pixel: the move along the axis that moved is taken back; when both moved, the x only if the old x with the new y is clear.
        `if ${player}y = ${lastY} then goto ${lab('xback')}`,
        `if ${player}x = ${lastX} then ${player}y = ${lastY} : goto ${lab('done')}`,
        `${boxX} = ${lastX}`,
        `${boxY} = ${player}y`,
        box,
        `if ${boxHit} = 0 then goto ${lab('xback')}`,
        `${player}y = ${lastY}`,
        lab('xback'),
        `${player}x = ${lastX}`,
        lab('done'),
        `${lastXPair.write} = 0`,
      ].map((line) => (line.startsWith('_undo_end') || line === 'end' ? line : ` ${line.trimStart()}`)).join('\n') + '\n');
    });
    return chunks.join('\n') + '\n';
  };
};
