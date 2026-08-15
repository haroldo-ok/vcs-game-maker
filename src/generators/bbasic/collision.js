'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {effectiveBackgroundRows} from '../../blocks/background';
import {PF_COLUMN_WIDTH_PX, pfRowDivisorFor} from '../../utils/playfield-coords';

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
// snapshot/restore had no lasting effect, confirmed by tracing the actual
// generated code rather than the runtime behavior alone. Replaced by
// per-axis position reverting instead (see collision_check_position below) -
// determining which axis actually caused an overlap makes the position
// revert itself smarter (sliding along a wall instead of stopping dead),
// which is a real fix; there was never a way to make a SIZE revert stick
// given how NUSIZ is actually (re)computed, so that angle was dropped
// entirely rather than chased further.
//
// A predictive, fixed-8x8-box, per-axis software collision system (an
// alternative to the reactive check below) was also tried and removed -
// its row/column math checked out cleanly on the standard kernel, but
// caused genuine, reproducible screen roll once Superchip/a higher pfres
// was involved, even with a single instance in an otherwise near-empty
// project (confirmed directly: a zero-block build on the same project
// stayed perfectly stable). The REACTIVE version below (only ever running
// on a frame collision() already fired, not unconditionally every frame)
// was verified in Phase 0 of its own plan not to hit the same wall, even
// under a sustained "held against the wall" worst case - see git history on
// this file and on blocks/collision.js for the full account of both
// attempts.

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

  // Builds the 4-corner pfread() check for one candidate position (xExpr,
  // yExpr are bB expressions - a plain var reference for "leave this axis
  // where it currently is," or a dev var name for "as if reverted" - see the
  // two call sites in collision_check_position below). widthVar holds this
  // player's own live on-screen width (read from player{N}size's NUSIZ bits
  // - see the width lines the caller emits before this), heightConst is a
  // compile-time constant (the tallest frame across every animation this
  // player actually uses - see collisionMaxHeight in bbasic.js's own
  // pre-scan; using the max instead of a live per-frame lookup is
  // deliberately conservative, since no runtime per-frame-height table
  // exists anywhere in this codebase and this bug was about width, not
  // height). clearVar is set to 1 if every corner comes back clear, 0 if
  // any one doesn't - only ever read AFTER this whole sequence, so reusing
  // temp1/temp2 per corner for the column/row scratch is safe (each corner
  // computes and consumes its own, nothing about one corner's column/row
  // needs to survive into the next) - clearVar itself has to live in
  // temp3-temp6 (this function assumes its caller already picked one from
  // that range), never temp1/temp2, since pfread()'s own internal
  // setuppointers routine clobbers those as its own scratch space (confirmed
  // directly from public/bb19/includes/pf_drawing.asm).
  const buildCandidateCheck = (xExpr, yExpr, widthVar, heightConst, clearVar, rowDivisor, maxRow) => {
    const buildCorner = (isRight, isTop) => {
      const xLines = isRight ? [
        ` temp1 = ${xExpr} + ${widthVar} - 1`,
        ` if temp1 > 159 then temp1 = 159`,
        ` temp1 = temp1 / ${PF_COLUMN_WIDTH_PX}`,
      ] : [
        ` temp1 = ${xExpr} / ${PF_COLUMN_WIDTH_PX}`,
      ];
      // Underflow guard: player-pixel Y is an unsigned byte, so
      // yExpr - (heightConst - 1) would wrap to a large positive value
      // instead of going negative whenever the sprite is near the top of
      // the screen, which would pfread() a garbage row - potentially
      // misreading unrelated playfield data. Checked before subtracting,
      // not after, so the subtraction itself never actually underflows.
      const yLines = isTop ? [
        ` if ${yExpr} < ${heightConst - 1} then temp2 = 0 else temp2 = ${yExpr} - ${heightConst - 1}`,
        ` temp2 = temp2 / ${rowDivisor}`,
      ] : [
        ` temp2 = ${yExpr} / ${rowDivisor}`,
      ];
      // Upper-bound guard, just as required as the underflow one above: the
      // playfield's own row table only has maxRow+1 valid rows (see
      // effectiveBackgroundRows), but player-pixel Y routinely reaches well
      // past that once divided by rowDivisor (the playfield only covers the
      // TOP portion of the screen's own scanline range, not the player's
      // whole 0-159ish Y range) - an unclamped out-of-range row index makes
      // pfread's own internal pointer math compute a wild address outside
      // the actual row table, which reads (or worse, on pfpixel, writes)
      // unrelated memory - confirmed directly as the cause of a full ROM
      // lockup on first contact with the playfield, before this clamp
      // existed.
      const rowClampLine = ` if temp2 > ${maxRow} then temp2 = ${maxRow}`;
      return [...xLines, ...yLines, rowClampLine, ` if pfread(temp1, temp2) then ${clearVar} = 0`];
    };
    return [
      ` ${clearVar} = 1`,
      ...buildCorner(false, false), // bottom-left
      ...buildCorner(true, false), // bottom-right
      ...buildCorner(false, true), // top-left
      ...buildCorner(true, true), // top-right
    ];
  };

  // Reactive (not predictive) hardware-collision backtrack: checks the
  // PREVIOUS frame's collision result (already latched in CXP0FB, and
  // already cleared for this frame by the kernel's own drawscreen) - same
  // one-frame-delayed timing this block has always used, and still no
  // movement of its own (whatever moves the player is placed after this
  // block in the same event, same as before).
  //
  // Where this version differs: instead of blindly reverting both X and Y
  // together, it tests two candidate positions - "as if only X had
  // reverted" and "as if only Y had reverted" - against the player's
  // CURRENT on-screen box (current width from player{N}size, a fixed
  // conservative height - see buildCandidateCheck's own comment) using
  // pfread(), and only reverts whichever axis actually still overlaps.
  // Moving diagonally into a wall now slides along it instead of stopping
  // dead; a corner hit (or a pure animation/shape-driven overlap with no
  // position change at all) falls through to reverting both, the same
  // fallback this block has always used. This box math only ever runs on a
  // frame collision() already fired - never unconditionally every frame -
  // see this file's own top-of-file comment for why an earlier, predictive
  // version of a similar idea couldn't get away with that.
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
    const blockNumber = Blockly.BBasic.blockNumbers.next(`collision_check_position_${playerNum}`);
    const revertLabel = `_collision_check_${playerNum}_${blockNumber}_revert`;
    const revertXLabel = `_collision_check_${playerNum}_${blockNumber}_revertX`;
    const revertYLabel = `_collision_check_${playerNum}_${blockNumber}_revertY`;
    const doneLabel = `_collision_check_${playerNum}_${blockNumber}_done`;

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const rowDivisor = pfRowDivisorFor(config);
    const maxRow = effectiveBackgroundRows(config) - 1;
    const heightConst = (Blockly.BBasic.collisionMaxHeight && Blockly.BBasic.collisionMaxHeight[playerNum]) || 8;

    // temp1/5 is only ever spliced in once (see div_mul.asm's own gating in
    // generateDivMul) even though it's needed for the /5 column divide AND
    // (whenever rowDivisor isn't itself a power of 2) the row divide - both
    // read the same shared routine.
    Blockly.BBasic.usesDivMul = true;

    return [
      `if collision(${player}, playfield) then goto ${revertLabel}`,
      `goto ${doneLabel}`,
      `@ ${revertLabel}`,
      // NUSIZ's low 3 bits (see PLAYER_SIZE_OPTIONS in blocks/sprites.js):
      // $5 (double-sized) draws 16px wide, $7 (quad-sized) 32px, everything
      // else (including the multi-copy spacing modes, $1/$2/$3/$4/$6) draws
      // its base 8px graphic - approximated here as just the first (left-
      // most) copy's own 8px box for the multi-copy modes, a documented
      // limitation (see this file's own top comment) rather than modeling
      // each hardware-spaced copy's own separate box.
      ` temp3 = ${sizeVar} & 7`,
      ` temp4 = 8`,
      ` if temp3 = 5 then temp4 = 16`,
      ` if temp3 = 7 then temp4 = 32`,
      // Candidate A: as if only X had reverted (Y stays at its current,
      // already-moved value) - clear means the X move was the actual cause.
      ...buildCandidateCheck(oldX, `${player}y`, 'temp4', heightConst, 'temp5', rowDivisor, maxRow),
      // Candidate B: as if only Y had reverted (X stays current) - clear
      // means the Y move was the actual cause.
      ...buildCandidateCheck(`${player}x`, oldY, 'temp4', heightConst, 'temp6', rowDivisor, maxRow),
      ` if temp5 = 1 then goto ${revertXLabel}`,
      ` if temp6 = 1 then goto ${revertYLabel}`,
      // Neither single-axis candidate was clear on its own - a corner/
      // diagonal hit, or a pure shape-driven overlap with no position change
      // at all (in which case oldX/oldY already equal the current position,
      // so this is a harmless no-op revert) - fall through to the original,
      // always-safe behavior of reverting both.
      ` ${player}x = ${oldX}`,
      ` ${player}y = ${oldY}`,
      ` goto ${doneLabel}`,
      `@ ${revertXLabel}`,
      ` ${player}x = ${oldX}`,
      ` goto ${doneLabel}`,
      `@ ${revertYLabel}`,
      ` ${player}y = ${oldY}`,
      `@ ${doneLabel}`,
      ` ${oldX} = ${player}x`,
      ` ${oldY} = ${player}y`,
    ].join('\n') + '\n';
  };
};
