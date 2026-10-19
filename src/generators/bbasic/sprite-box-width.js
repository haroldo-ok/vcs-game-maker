'use strict';

// The comparison of the boxes of two sprites, for the blocks that ask whether two objects collide where the hardware flags cannot
// say (a virtual sprite of the DPC+ kernel, or a 16 pixel wide player that is two sprites). The answer of each pair is a byte,
// set once a frame after everything that moves sprites has run, so a block reads the result of the last frame like it does the
// hardware flags.
//
// A player's box: 8 pixels wide, 16 and 32 at double and quad width, twice that for a 16 pixel wide player while the sprite that
// shows its right half is there. A player with copies (NUSIZ 1 to 4 and 6) has the box of each copy as well, 16, 32 or 64
// pixels to the right, round the edge of the screen when that is past it. A player whose box is off the screen to the
// right (x of 177 or more) has no boxes at all. The missiles and the ball have one box, 2 pixels wide.

import {flagPoolVar, flagPoolBit} from './flag-pool';

const RIGHT_EDGE_X = 177;

export const boxWidthVarName = (player) => `${player}boxw`;
export const boxCopyCountVarName = (player) => `${player}boxn`;
export const boxCopyXVarName = (player, copy) => `${player}boxc${copy}`;
export const isPlayerName = (name) => /^player\d$/.test(name);
export const pairKey = (first, second) => [first, second].sort().join('|');
// The answers of the pairs are bits of shared bytes (eight pairs to a byte, see flag-pool.js): the pairs in the order of boxPairOrder.
const BOX_HIT_BITS_PER_BYTE = 8;
export const boxHitFamily = (index) => `boxHitFlags${Math.floor(index / BOX_HIT_BITS_PER_BYTE)}`;
// The families the plan needs for the pairs: [{family, bits}].
export const boxHitFamilies = (pairOrder) => (pairOrder || []).reduce((families, key, index) => {
  const family = boxHitFamily(index);
  let entry = families.find((candidate) => candidate.family === family);
  if (!entry) families.push(entry = {family, bits: []});
  entry.bits.push(index % BOX_HIT_BITS_PER_BYTE);
  return families;
}, []);
// A pair's bit, as batari Basic writes it: "variable{bit}".
export const boxHitRef = (Blockly, key) => {
  const index = (Blockly.BBasic.boxPairOrder || []).indexOf(key);
  const family = boxHitFamily(index);
  return `${Blockly.BBasic.nameDB_.getName(flagPoolVar(family), Blockly.Names.DEVELOPER_VARIABLE_TYPE)}` +
    `{${flagPoolBit(family, index % BOX_HIT_BITS_PER_BYTE)}}`;
};

export const reserveBoxDevVars = (reserveDevVar, players, pairs, fixedPlayers = new Set(), pairOrder = []) => {
  (players || new Set()).forEach((player) => {
    if (fixedPlayers.has(player)) return;
    reserveDevVar(boxWidthVarName(player), undefined, `how many pixels wide the box of ${player} is`);
    reserveDevVar(boxCopyCountVarName(player), undefined, `how many copies of ${player} (0 to 2) have a box besides the sprite itself`);
    reserveDevVar(boxCopyXVarName(player, 1), undefined, `x of the first copy of ${player}`);
    reserveDevVar(boxCopyXVarName(player, 2), undefined, `x of the second copy of ${player}`);
  });
  boxHitFamilies(pairOrder).forEach(({family}) => {
    reserveDevVar(flagPoolVar(family), undefined, 'a bit for each pair of sprites a "Collided" block compares by their boxes: they overlap (1) or not (0), as of the end of the last frame');
  });
};

// Where the boxes of an object are: [{x, on}] with the variable (or number) holding each x, the width of each box, and the
// variable that says how many copies there are (none for the missiles and the ball).
const boxesOf = (Blockly, name) => {
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  if (isPlayerName(name) && (Blockly.BBasic.boxFixedPlayers || new Set()).has(name)) {
    // A box that is always 8 pixels wide with no copies.
    return {xs: [`${name}x`], count: null, width: 8, y: `${name}y`, height: `${name}height`};
  }
  if (isPlayerName(name)) {
    return {
      xs: [`${name}x`, resolveVar(boxCopyXVarName(name, 1)), resolveVar(boxCopyXVarName(name, 2))],
      count: resolveVar(boxCopyCountVarName(name)),
      width: resolveVar(boxWidthVarName(name)),
      y: `${name}y`, height: `${name}height`,
    };
  }
  return {xs: [`${name}x`], count: null, width: 2, y: `${name}y`, height: `${name}height`};
};

export const generateBoxChecks = (Blockly) => {
  const players = Blockly.BBasic.boxWidthPlayers;
  const pairs = Blockly.BBasic.boxPairs;
  if ((!players || !players.size) && (!pairs || !pairs.size)) return '';
  const partners = Blockly.BBasic.widePartners || {};
  const lines = [];
  [...(players || [])].sort().filter((player) => !(Blockly.BBasic.boxFixedPlayers || new Set()).has(player)).forEach((player) => {
    const [width, count, first, second] = [boxWidthVarName(player), boxCopyCountVarName(player), boxCopyXVarName(player, 1),
      boxCopyXVarName(player, 2)].map((name) =>
      Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE));
    const id = Blockly.BBasic.blockNumbers.next(`box_${player}`);
    const done = `_box_${player}_${id}_done`;
    lines.push(` rem boxes of ${player}:`,
        ` temp1 = ${player}size & 7`,
        ` ${width} = 8`,
        ` if temp1 = 5 then ${width} = 16`,
        ` if temp1 = 7 then ${width} = 32`);
    if (partners[player] && (Blockly.BBasic.sharedPartnerVars || {})[partners[player]]) {
      lines.push(` if ${partners[player]}frame = 255 then goto ${done}_narrow`, ` if ${partners[player]}size{6} then goto ${done}_narrow`,
          ` ${width} = ${width} + ${width}`, `${done}_narrow`);
    } else if (partners[player]) lines.push(` if ${partners[player]}frame <> 255 then ${width} = ${width} + ${width}`);
    // Kept so that x + width fits a byte for every x on the screen.
    lines.push(` if ${width} > 90 then ${width} = 90`,
        ` ${count} = 0`,
        ` if ${player}x >= ${RIGHT_EDGE_X} then goto ${done}`,
        ` if temp1 = 1 then ${count} = 1 : ${first} = ${player}x + 16`,
        ` if temp1 = 2 then ${count} = 1 : ${first} = ${player}x + 32`,
        ` if temp1 = 3 then ${count} = 2 : ${first} = ${player}x + 16 : ${second} = ${player}x + 32`,
        ` if temp1 = 4 then ${count} = 1 : ${first} = ${player}x + 64`,
        ` if temp1 = 6 then ${count} = 2 : ${first} = ${player}x + 32 : ${second} = ${player}x + 64`,
        ` if ${count} = 0 then goto ${done}`,
        ` if ${first} >= ${RIGHT_EDGE_X} then ${first} = ${first} - 160`,
        ` if ${count} = 2 && ${second} >= ${RIGHT_EDGE_X} then ${second} = ${second} - 160`,
        `${done}`);
  });
  [...(pairs || [])].sort().forEach((key) => {
    const [first, second] = key.split('|');
    const hit = boxHitRef(Blockly, key);
    const id = Blockly.BBasic.blockNumbers.next(`boxpair`);
    const done = `_boxpair_${id}_done`;
    const a = boxesOf(Blockly, first);
    const b = boxesOf(Blockly, second);
    lines.push(` rem ${first} and ${second} boxes:`,
        ` ${hit} = 0`,
        ` if (${a.y} + ${a.height}) < ${b.y} then goto ${done}`,
        ` if ${a.y} > (${b.y} + ${b.height}) then goto ${done}`);
    a.xs.forEach((ax, i) => b.xs.forEach((bx, j) => {
      const skip = `_boxpair_${id}_${i}_${j}`;
      lines.push(...(i && a.count ? [` if ${a.count} < ${i} then goto ${skip}`] : []),
          ...(j && b.count ? [` if ${b.count} < ${j} then goto ${skip}`] : []),
          ` if (${ax} + ${a.width}) >= ${bx} && ${ax} <= (${bx} + ${b.width}) then ${hit} = 1 : goto ${done}`,
          skip);
    }));
    lines.push(done);
  });
  return lines.join('\n') + '\n';
};
