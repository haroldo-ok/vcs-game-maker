'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {effectiveBackgroundRows, dpcPlusPfresOf} from '../../blocks/background';
import {pfRowDivisorFor, dpcPlusRowLinesFor, missileBallPfXOffset} from '../../utils/playfield-coords';
import {buildPlayfieldBoxLines} from './pf-box';
import {ensureArmProgram} from './offset-arm';
import {missileWidthsVarName, ctrlpfShadowVarName} from './sprites';

// The software box test of pf-box.js as a subroutine per player, for the blocks that need to know whether a sprite would be in
// the playfield: the position to try is put in pfboxx / pfboxy, the answer comes back in pfboxhit (1 for a hit).
//
// And, for the DPC+ kernel's Players 2 to 9 (the hardware flag only knows Player 1 for all of them), a byte per player, pfhit2 to
// pfhit9, that says each frame whether the player is in the playfield where it is.

export const PF_BOX_X = 'pfboxx';
export const PF_BOX_Y = 'pfboxy';
export const PF_BOX_HIT = 'pfboxhit';
// Lines a sweep adds to the box (and with its top bit which way to look): only in a project with the Jump block (see pf-box.js, extVar).
export const PF_BOX_EXT = 'pfboxext';
export const pfHitVarName = (player) => `pfhit${player}`;

export const pfBoxSubroutineName = (player) => `_pfbox_${player}`;

// The bytes the blocks of this project need: the three above when any block tries a position, and the hit byte of each
// extra player (2 to 9) a block asks about.
export const reservePfBoxDevVars = (reserveDevVar, boxPlayers, hitPlayers, sweep = false) => {
  if (boxPlayers && boxPlayers.size) {
    reserveDevVar(PF_BOX_X, undefined, 'x of the position the playfield box test tries');
    reserveDevVar(PF_BOX_Y, undefined, 'y of the position the playfield box test tries');
    reserveDevVar(PF_BOX_HIT, undefined, '1 when the sprite box at that position overlaps the playfield');
    if (sweep) reserveDevVar(PF_BOX_EXT, undefined, 'lines the sprite box test adds to the box (and which way it looks): 0 for a plain test');
  }
  (hitPlayers || new Set()).forEach((player) => {
    reserveDevVar(pfHitVarName(player), undefined, `${player} is in the playfield (1) or not (0), as of the end of the last frame`);
  });
};

// Measured against the hardware flag on the emulator (a sweep of y over a lit row): the lines each object covers for a given y and
// height, as the shift of y and the change of height that give the box test the same lines. The standard kernel's box is a line
// taller, and the ball and missile 0 are drawn a line higher than missile 1; under DPC+ y 0 is the picture's first line for them
// and for the players, the ball covers y to y + height - 1, missile 0 one line lower and a line shorter and missile 1 a
// line higher and a line taller. A standard kernel player's height variable is one less than its lines (7 for 8 rows), so its box is a
// line taller too; DPC+'s counts them.
export const objectBoxGeometry = (sprite, dpcPlus) => ({
  missile0: {yShift: 1, extraHeight: dpcPlus ? -1 : 1},
  missile1: {yShift: dpcPlus ? -1 : 0, extraHeight: 1},
  ball: {yShift: dpcPlus ? 0 : 1, extraHeight: dpcPlus ? 0 : 1},
}[sprite] || {yShift: 0, extraHeight: dpcPlus ? 0 : 1});

// Under DPC+ a player's left edge is one pixel further left than in the standard kernel (measured against the hardware flag on every
// column of backgrounds of 12 to 48 rows: the box starts at x - 16).
const DPC_PLUS_PLAYER_PF_X_OFFSET = 16;

// Where an Undo last move block keeps the x its player had before the move (see collisionMoveOldXVar in collision.js), for the quick way in.
const undoQuickLastX = (Blockly, player) => {
  const number = /^player(\d)$/.exec(player);
  if (!number) return undefined;
  const pair = Blockly.BBasic.collisionMovePlayers && Blockly.BBasic.collisionMovePlayers.has(number[1]) ?
    (Blockly.BBasic.superchipRwPairs || {})[`collisionOldX${number[1]}`] : null;
  if (pair) return pair.read;
  // A Jump block that stops its player at the walls keeps the x the player had at the end of the last frame (platformerLastXVar in collision.js).
  return Blockly.BBasic.platformerWallsPlayers && Blockly.BBasic.platformerWallsPlayers.has(number[1]) ?
    Blockly.BBasic.nameDB_.getName(`platLastX${number[1]}`, Blockly.Names.DEVELOPER_VARIABLE_TYPE) : undefined;
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
        `(${widthVar(missileWidthsVarName(), true)} & $30) / 16` : '0', ...objectBoxGeometry('missile0', dpcPlus)}),
      missile1: () => ({objectWidth: widthVar(missileWidthsVarName(), Blockly.BBasic.missileWidthUsed) ?
        `${widthVar(missileWidthsVarName(), true)} / 64` : '0', ...objectBoxGeometry('missile1', dpcPlus)}),
      ball: () => ({objectWidth: widthVar(ctrlpfShadowVarName(), Blockly.BBasic.ctrlpfShadowUsed) ?
        `(${widthVar(ctrlpfShadowVarName(), true)} & $30) / 16` : '0', ...objectBoxGeometry('ball', dpcPlus)}),
    }[player];
    const objectOptions = objectBox ? {...objectBox(), pfXOffset: missileBallPfXOffset(config)} : {...objectBoxGeometry(player, dpcPlus), ...(dpcPlus ? {pfXOffset: DPC_PLUS_PLAYER_PF_X_OFFSET} : {})};
    const rowLines = dpcPlusRowLinesFor(config);
    const rowDivisor = Math.max(1, Math.round(pfRowDivisorFor(config)));
    const rowsOf = (lines, frac = Math.min(255, Math.round(256 / lines))) => ({lowDivisor: Math.max(1, Math.ceil(lines)), highDivisor: Math.max(1, Math.floor(lines)),
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
    // (DPC+ works out its rows with shifts, a table or a multiplication, never the divide routine.)
    const divisors = dpcPlus ? [] : [rowDivisor];
    if (divisors.some((divisor) => divisor & (divisor - 1))) Blockly.BBasic.usesDivMul = true;
    if (dpcPlus && varying) Blockly.BBasic.pfBoxArmRows = true;
    // A player under DPC+ with one row height for the whole game is tested by the coprocessor (see armBox in pf-box.js).
    // (With groups of columns that have separate rows it is the coprocessor that knows the rows of each group, from the table the load of a
    // background puts in the display memory, see buildGroupRowsLoad in offset-arm.js; a missile, the ball or a wide player's partner are not.)
    const groupRows = dpcPlus && !!Blockly.BBasic.dpcPlusGroupFracVars;
    const armPlayer = dpcPlus && (!varying || groupRows) && (groupRows ? (!!objectBox || /^player\d$/.test(player)) :
      !objectBox && /^player\d$/.test(player) && !(Blockly.BBasic.widePartners || {})[player]);
    const frac = geometry.dpcPlusRows ? geometry.dpcPlusRows.frac : 0;
    const shiftRows = frac > 0 && Number.isInteger(256 / frac) && ((256 / frac) & (256 / frac - 1)) === 0;
    let armBox = false;
    if (armPlayer && (frac > 0 || groupRows)) {
      armBox = true;
      ensureArmProgram(Blockly, {inc: frac, maxRow: geometry.maxRow, clamp: groupRows || !shiftRows, groups: groupRows});
      Blockly.BBasic.pfBoxArm = true;
    }
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
      quickLastXVar: undoQuickLastX(Blockly, player),
      armBox,
      armGroups: armBox && groupRows,
      dpcPlusScan: dpcPlus,
      armRows: dpcPlus && varying,
      extVar: Blockly.BBasic.pfBoxSweep ? resolveVar(PF_BOX_EXT) : undefined,
      blankLines: Blockly.BBasic.effectiveShowBlankLines ? !!Blockly.BBasic.effectiveShowBlankLines() : true,
      ...geometry,
    }).join('\n');
  }
  return `gosub ${name}${Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name))}`;
};

// The same, going in by the quick way (see quickEntry in pf-box.js): a move that stays in the columns of the old x answers "clear" at once.
export const callPfBoxQuick = (Blockly, player) => {
  const call = callPfBox(Blockly, player);
  return undoQuickLastX(Blockly, player) ? call.replace(/^gosub (\S+)/, 'gosub $1_chk') : call;
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
