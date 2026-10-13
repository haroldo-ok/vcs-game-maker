'use strict';

// Lock and Unlock: a sprite (the child) locked to another (the parent) follows the parent's position, an offset away, every
// frame until it is unlocked. A sword in a player's hand is a separate sprite locked to the player.
//
// A locked child keeps three bytes: which parent (1 + its place in LOCK_SPRITES, 0 when it is free) and the offsets in x and
// y (a byte, a negative offset wraps round: 256 - 3 is 3 to the left). Once a frame the checks below (generateLockChecks)
// put the child at the parent's position plus the offsets, after everything that moves sprites has run. When the parent is a
// player that faces left (its flip bit is set) the child is put on the other side of it, as far from the parent's right edge
// as it was from the left one, and flipped too, so the sword stays in the same hand.

// Every sprite a lock can have for a child or a parent, as their blocks name them.
export const LOCK_SPRITES = ['player0', 'player1', 'player2', 'player3', 'player4', 'player5', 'player6', 'player7', 'player8',
  'player9', 'missile0', 'missile1', 'ball'];

export const lockParentVarName = (child) => `${child}lockparent`;
export const lockXVarName = (child) => `${child}lockx`;
export const lockYVarName = (child) => `${child}locky`;

const xVarOf = (name) => `${name}x`;
const yVarOf = (name) => (name === 'ball' ? 'bally' : `${name}y`);
const isPlayer = (name) => /^player\d$/.test(name);

// The three bytes of each child any Lock or Unlock block names (children: a Set of sprite names).
export const reserveLockDevVars = (reserveDevVar, children) => {
  if (!children || !children.size) return;
  children.forEach((child) => {
    reserveDevVar(lockParentVarName(child), undefined, `${child} is locked to this sprite (1 + its number, 0 when free)`);
    reserveDevVar(lockXVarName(child), undefined, `${child}'s x offset from the sprite it is locked to`);
    reserveDevVar(lockYVarName(child), undefined, `${child}'s y offset from the sprite it is locked to`);
  });
};

// An offset as the byte it is kept in: a plain number is worked out here (a negative one wraps), an expression is left to
// the 8 bit arithmetic of the 6502 (0 - 3 is 253).
const offsetCode = (code) => {
  const literal = /^\s*\(?\s*(-?\d+)\s*\)?\s*$/.exec(code || '');
  return literal ? String(((Number(literal[1]) % 256) + 256) % 256) : code;
};

export default (Blockly) => {
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  Blockly.BBasic['sprite_lock'] = function(block) {
    const child = block.getFieldValue('CHILD');
    const parent = block.getFieldValue('PARENT');
    if (child === parent || !LOCK_SPRITES.includes(parent)) return '';
    const x = offsetCode(Blockly.BBasic.valueToCode(block, 'X', Blockly.BBasic.ORDER_ASSIGNMENT) || '0');
    const y = offsetCode(Blockly.BBasic.valueToCode(block, 'Y', Blockly.BBasic.ORDER_ASSIGNMENT) || '0');
    return `${resolveVar(lockXVarName(child))} = ${x}\n` +
      `${resolveVar(lockYVarName(child))} = ${y}\n` +
      `${resolveVar(lockParentVarName(child))} = ${LOCK_SPRITES.indexOf(parent) + 1}\n`;
  };

  Blockly.BBasic['sprite_unlock'] = function(block) {
    const child = block.getFieldValue('CHILD');
    return `${resolveVar(lockParentVarName(child))} = 0\n`;
  };
};

// The width of a sprite in pixels into temp var `target`, scratch `temp` (a player's from its size byte: 5 is double and
// 7 quad width; a missile or the ball are taken as 1).
const widthLines = (name, target) => (isPlayer(name) ?
  [`temp5 = ${name}size & 7`, `${target} = 8`, `if temp5 = 5 then ${target} = 16`, `if temp5 = 7 then ${target} = 32`] :
  [`${target} = 1`]);

// Once a frame, every locked child at its parent's place. parentsOf: a Map from each child to the Set of parents some Lock block
// of the project gives it (what the pre-scan in bbasic.js found).
export const generateLockChecks = (Blockly) => {
  const parentsOf = Blockly.BBasic.lockedBy;
  if (!parentsOf || !parentsOf.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lines = [];
  parentsOf.forEach((parents, child) => {
    const parentVar = resolveVar(lockParentVarName(child));
    const offsetX = resolveVar(lockXVarName(child));
    const offsetY = resolveVar(lockYVarName(child));
    const id = Blockly.BBasic.blockNumbers.next(`lock_${child}`);
    const label = (name) => `_lock_${child}_${id}_${name}`;
    lines.push(` rem ${child} locked to another sprite:`, ` if ${parentVar} = 0 then goto ${label('done')}`);
    const used = [...parents].filter((parent) => parent !== child && LOCK_SPRITES.includes(parent));
    used.forEach((parent) => lines.push(` if ${parentVar} = ${LOCK_SPRITES.indexOf(parent) + 1} then goto ${label(parent)}`));
    lines.push(` goto ${label('done')}`);
    used.forEach((parent) => {
      lines.push(label(parent));
      if (isPlayer(parent)) {
        lines.push(` if !${parent}size{3} then goto ${label(parent + 'plain')}`,
            // The parent faces left: as far from its right edge as the offset was from its left edge.
            ...widthLines(parent, 'temp3').map((line) => ' ' + line),
            ...widthLines(child, 'temp4').map((line) => ' ' + line),
            ` temp3 = temp3 - temp4`,
            ` temp3 = temp3 - ${offsetX}`,
            ` ${xVarOf(child)} = ${xVarOf(parent)} + temp3`,
            ...(isPlayer(child) ? [` ${child}size{3} = 1`] : []),
            ` goto ${label(parent + 'y')}`,
            label(parent + 'plain'),
            ` ${xVarOf(child)} = ${xVarOf(parent)} + ${offsetX}`,
            ...(isPlayer(child) ? [` ${child}size{3} = 0`] : []),
            label(parent + 'y'));
      } else {
        lines.push(` ${xVarOf(child)} = ${xVarOf(parent)} + ${offsetX}`);
      }
      lines.push(` ${yVarOf(child)} = ${yVarOf(parent)} + ${offsetY}`, ` goto ${label('done')}`);
    });
    lines.push(label('done'));
  });
  return lines.join('\n') + '\n';
};
