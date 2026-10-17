'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {effectiveBackgroundRows, dpcPlusPfresOf} from '../../blocks/background';
import {pfRowDivisorFor, dpcPlusRowLinesFor, missileBallPfXOffset} from '../../utils/playfield-coords';
import {buildPlayfieldBoxLines} from './pf-box';
import {missileWidthsVarName, ctrlpfShadowVarName} from './sprites';

// The software box test of pf-box.js as a subroutine per player, for the blocks that need to know whether a sprite would be in
// the playfield: the position to try is put in pfboxx / pfboxy, the answer comes back in pfboxhit (1 for a hit).
//
// And, for the DPC+ kernel's Players 2 to 9 (the hardware flag only knows Player 1 for all of them), a byte per player, pfhit2 to
// pfhit9, that says each frame whether the player is in the playfield where it is.

export const PF_BOX_X = 'pfboxx';
export const PF_BOX_Y = 'pfboxy';
export const PF_BOX_HIT = 'pfboxhit';
export const pfHitVarName = (player) => `pfhit${player}`;

export const pfBoxSubroutineName = (player) => `_pfbox_${player}`;

// The bytes the blocks of this project need: the three above when any block tries a position, and the hit byte of each
// extra player (2 to 9) a block asks about.
export const reservePfBoxDevVars = (reserveDevVar, boxPlayers, hitPlayers) => {
  if (boxPlayers && boxPlayers.size) {
    reserveDevVar(PF_BOX_X, undefined, 'x of the position the playfield box test tries');
    reserveDevVar(PF_BOX_Y, undefined, 'y of the position the playfield box test tries');
    reserveDevVar(PF_BOX_HIT, undefined, '1 when the sprite box at that position overlaps the playfield');
  }
  (hitPlayers || new Set()).forEach((player) => {
    reserveDevVar(pfHitVarName(player), undefined, `${player} is in the playfield (1) or not (0), as of the end of the last frame`);
  });
};

// The subroutine of a player, made the first time a block asks for it. Returns the lines that call it (the caller sets
// pfboxx and pfboxy first).
export const callPfBox = (Blockly, player) => {
  const name = pfBoxSubroutineName(player);
  if (!Blockly.BBasic.subroutines[name]) {
    const config = (useConfigurationStorage() || {}).value || {};
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const dpcPlus = config.kernel === 'dpcplus';
    // A missile or the ball: its width comes from the byte the blocks keep it in (1 pixel while no block sets one), it has no copies,
    // and its column is a little different.
    const widthVar = (canonicalName, used) => (used ? resolveVar(canonicalName) : null);
    const objectBox = {
      missile0: () => ({objectWidth: widthVar(missileWidthsVarName(), Blockly.BBasic.missileWidthUsed) ?
        `(${widthVar(missileWidthsVarName(), true)} & $30) / 16` : '0'}),
      missile1: () => ({objectWidth: widthVar(missileWidthsVarName(), Blockly.BBasic.missileWidthUsed) ?
        `${widthVar(missileWidthsVarName(), true)} / 64` : '0'}),
      ball: () => ({objectWidth: widthVar(ctrlpfShadowVarName(), Blockly.BBasic.ctrlpfShadowUsed) ?
        `(${widthVar(ctrlpfShadowVarName(), true)} & $30) / 16` : '0'}),
    }[player];
    const objectOptions = objectBox ? {...objectBox(), pfXOffset: missileBallPfXOffset(config)} : {};
    const rowLines = dpcPlusRowLinesFor(config);
    const rowDivisor = Math.max(1, Math.round(pfRowDivisorFor(config)));
    const rowsOf = (lines, frac) => ({lowDivisor: Math.max(1, Math.ceil(lines)), highDivisor: Math.max(1, Math.floor(lines)),
      exact: Number.isInteger(lines) && lines >= 2, frac});
    // Backgrounds that set a pfres have rows of other heights: the test has the lines for each height, and picks the ones of the
    // background showing by the row height variable (see init), with its last row from a variable too.
    const geometries = Blockly.BBasic.dpcPlusGeometries || [];
    const rowSets = [];
    geometries.forEach(({lines, frac}) => {
      if (!rowSets.some((rows) => rows.frac === frac)) rowSets.push(rowsOf(lines, frac));
    });
    const varying = dpcPlus && rowSets.length > 1 && !!Blockly.BBasic.dpcPlusRowFracVar && !!Blockly.BBasic.dpcPlusRowMaxVar;
    const geometry = dpcPlus ?
      {maxRow: Math.max(0, dpcPlusPfresOf(config) - 1), dpcPlusRows: rowsOf(rowLines),
        ...(varying ? {dpcPlusRowSets: rowSets, rowFracVar: Blockly.BBasic.dpcPlusRowFracVar, maxRowVar: Blockly.BBasic.dpcPlusRowMaxVar} : {})} :
      {maxRow: Math.max(0, effectiveBackgroundRows(config) - 1), rowDivisor};
    // Dividing by a row height that is not a power of two goes through the divide routine.
    const divisors = dpcPlus ? (varying ? rowSets : [geometry.dpcPlusRows]).flatMap((rows) => [rows.lowDivisor, rows.highDivisor]) : [rowDivisor];
    if (divisors.some((divisor) => divisor & (divisor - 1))) Blockly.BBasic.usesDivMul = true;
    Blockly.BBasic.subroutines[name] = buildPlayfieldBoxLines({
      label: name,
      xVar: resolveVar(PF_BOX_X),
      yVar: resolveVar(PF_BOX_Y),
      sizeVar: `${player}size`,
      ...objectOptions,
      heightVar: `${player}height`,
      resultVar: resolveVar(PF_BOX_HIT),
      partnerFrameVar: (Blockly.BBasic.widePartners || {})[player] ? `${Blockly.BBasic.widePartners[player]}frame` : undefined,
      partnerHiddenVar: (Blockly.BBasic.sharedPartnerVars || {})[(Blockly.BBasic.widePartners || {})[player]] ?
        `${Blockly.BBasic.widePartners[player]}size{6}` : undefined,
      directRead: !dpcPlus,
      blankLines: Blockly.BBasic.effectiveShowBlankLines ? !!Blockly.BBasic.effectiveShowBlankLines() : true,
      ...geometry,
    }).join('\n');
  }
  return `gosub ${name}${Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name))}`;
};

// Once a frame, after everything that moves sprites has run: where each extra player a block asks about is, in the playfield
// or not.
export const generatePfHitChecks = (Blockly) => {
  const players = Blockly.BBasic.pfHitExtras;
  if (!players || !players.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lines = [];
  [...players].sort().forEach((player) => {
    // The sprite showing the right half of a wide player is not there while the frame byte says 255.
    const isPartner = Object.values(Blockly.BBasic.widePartners || {}).includes(player);
    const id = isPartner ? Blockly.BBasic.blockNumbers.next(`pfhit_${player}`) : 0;
    lines.push(` rem ${player} in the playfield:`,
        ...(isPartner ? [` ${resolveVar(pfHitVarName(player))} = 0`, ` if ${player}frame = 255 then goto _pfhit_${player}_${id}_done`,
          ...((Blockly.BBasic.sharedPartnerVars || {})[player] ? [` if ${player}size{6} then goto _pfhit_${player}_${id}_done`] : [])] : []),
        ` ${resolveVar(PF_BOX_X)} = ${player}x`,
        ` ${resolveVar(PF_BOX_Y)} = ${player}y`,
        ` ${callPfBox(Blockly, player)}`,
        ` ${resolveVar(pfHitVarName(player))} = ${resolveVar(PF_BOX_HIT)}`,
        ...(isPartner ? [`_pfhit_${player}_${id}_done`] : []));
  });
  return lines.join('\n') + '\n';
};
