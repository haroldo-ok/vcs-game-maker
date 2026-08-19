'use strict';

import {canonicalDistanceVarName, distancePointVarName} from '../../utils/distance';

// Shared by every "Distance" and "Distance to point" check (see
// generateDistanceChecks/generateDistancePointChecks below) - computes
// abs(temp1 - temp2) into temp1. Registered as an ordinary subroutine (see
// subroutine.js's own "this.subroutines[name] = code" pattern) rather than
// inlined at every call site: a project with several distance checks used
// to pay this same 6-line abs-difference block in full at EACH one (with
// only the operand/target variable NAMES differing, the actual logic
// identical every time) - one shared copy, called via a plain "gosub" (3
// lines per call site instead of 6, plus one copy of the shared block
// instead of one per check), same win registering the run-once bookkeeping
// and _music_play_reset as ordinary subroutines already got: a genuine
// relocatable unit too (see getSubroutineBank), not just fixed in bank 1
// forever the way this was before.
const DISTANCE_ABS_DIFF_NAME = '_distance_abs_diff';
const registerDistanceAbsDiffSubroutine = (Blockly) => {
  Blockly.BBasic.subroutines[DISTANCE_ABS_DIFF_NAME] = [
    ' if temp1 < temp2 then goto _distance_abs_diff_neg',
    ' temp1 = temp1 - temp2',
    ' return',
    '_distance_abs_diff_neg',
    ' temp1 = temp2 - temp1',
  ].join('\n');
};
// "return" is added by generateSubroutines/generateRelocatedSections
// themselves (see subroutine.js's own comment on why - it's spliced onto
// every subroutine body automatically, the same way "gosub"'s own bank
// suffix never appears on the definition side), so the body registered
// above deliberately doesn't end with one of its own - only the interior
// early "return" (right after the non-negative branch) is this function's
// own to add.

export default (Blockly) => {
  const createGeneratorForJoystick = (name) => {
    Blockly.BBasic[`input_${name}_get`] = function(block) {
      // Variable getter.
      const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
          Blockly.VARIABLE_CATEGORY_NAME);
      return [code, Blockly.BBasic.ORDER_ATOMIC];
    };
  };

  ['joy0', 'joy1'].forEach(createGeneratorForJoystick);

  Blockly.BBasic['input_console_switch_get'] = function(block) {
    // Variable getter.
    const switchName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('SWITCH'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [switchName, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Distance between any two objects (Player 0/1, Missile 0/1, Ball), one
  // axis at a time - a plain number, recomputed once per frame (see
  // generateDistanceChecks below) into the same hidden variable bbasic.js's
  // own pre-scan registered for this exact (axis, object pair), so reading
  // it here is free regardless of how many "Distance" blocks a project has.
  // Routed through nameDB_.getName (same bucket bbasic.js used to dim it)
  // rather than the raw canonical string, so this always matches whatever
  // name actually got dimmed.
  const getDistanceVarName = (axis, block) => Blockly.BBasic.nameDB_.getName(
      canonicalDistanceVarName(axis, block.getFieldValue('VAR0'), block.getFieldValue('VAR1')),
      Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  Blockly.BBasic['distance_x_get'] = function(block) {
    return [getDistanceVarName('x', block), Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['distance_y_get'] = function(block) {
    return [getDistanceVarName('y', block), Blockly.BBasic.ORDER_ATOMIC];
  };

  // Spliced into commongamelogic (see bbasic.js/bbasic.bb.hbs), once per
  // unique (axis, object pair) collected by bbasic.js's own pre-scan (see
  // its init() - distanceChecks is keyed by canonicalDistanceVarName so a
  // pair picked by more than one "Distance" block is only computed once).
  //
  // Every relevant object's coordinate variable follows the same
  // "<name>x"/"<name>y" naming (player0x, missile1y, ballx, etc), so the
  // stored object names just need the axis letter appended. Coordinates are
  // unsigned bytes, so a plain subtraction underflows (wraps around to a
  // huge value) whenever the first operand is smaller - has to branch on
  // which object is further along the axis and subtract the smaller from
  // the larger. "if X then A : B" only conditions A, not B, so this can't be
  // collapsed onto fewer lines with a trailing goto - every branch needs its
  // own line, same as generateSoundFadeChecks.
  //
  // An "asm ... end" block (SEC+SBC's carry flag already says which operand
  // was smaller, so a BCS-guarded EOR/CLC/ADC two's-complement negate can
  // compute the same result in one flat sequence) was tried here and
  // reverted - see generateMusicChecks' own comment on the exact same
  // finding: any "asm ... end" block spliced into this per-frame code path
  // corrupts DASM's local-label scoping in this toolchain, regardless of
  // what it contains.
  //
  // Each check is now a 3-line call into the shared DISTANCE_ABS_DIFF_NAME
  // subroutine (see its own comment at the top of this file) instead of its
  // own fully inlined 6-line abs-difference block - a project with several
  // distance checks used to pay the full 6 lines EVERY time, despite the
  // logic being identical every single time (only the operand/target
  // variable names ever differed). Called with a bank suffix hardcoded to
  // "from bank 1" (bankJumpSuffix's first argument) rather than
  // Blockly.BBasic.getCurrentBank() - this whole function's own output is
  // always spliced into commongamelogic (see bbasic.bb.hbs), which is
  // always bank 1 itself, unlike a subroutine or event body's own code
  // (which getCurrentBank() resolves per wherever THAT unit itself ends up),
  // so the caller's bank here is always simply 1, not something that varies.
  Blockly.BBasic.generateDistanceChecks = function() {
    const checks = this.distanceChecks;
    if (!checks || !checks.size) return '';
    registerDistanceAbsDiffSubroutine(Blockly);
    const suffix = Blockly.BBasic.bankJumpSuffix(1, Blockly.BBasic.getSubroutineBank(DISTANCE_ABS_DIFF_NAME));
    const lines = [];
    checks.forEach(({axis, obj0, obj1}, rawVarName) => {
      const varName = Blockly.BBasic.nameDB_.getName(rawVarName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const coord0 = `${obj0}${axis}`;
      const coord1 = `${obj1}${axis}`;
      lines.push(
          ` temp1 = ${coord0}`,
          ` temp2 = ${coord1}`,
          ` gosub ${DISTANCE_ABS_DIFF_NAME}${suffix}`,
          ` ${varName} = temp1`,
      );
    });
    return lines.join('\n');
  };

  // Same idea as getDistanceVarName above, for "Distance to point" blocks -
  // looked up by this block's own id in bbasic.js's distancePointChecks
  // pre-scan (each instance gets its own hidden variable; see that pre-scan's
  // own comment for why these can't share one the way two-object distance
  // checks do).
  const getDistancePointVarName = (axis, block) => {
    const entry = Blockly.BBasic.distancePointChecks && Blockly.BBasic.distancePointChecks.get(block.id);
    return Blockly.BBasic.nameDB_.getName(
        distancePointVarName(axis, entry.index), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  };

  Blockly.BBasic['distance_x_to_point_get'] = function(block) {
    return [getDistancePointVarName('x', block), Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['distance_y_to_point_get'] = function(block) {
    return [getDistancePointVarName('y', block), Blockly.BBasic.ORDER_ATOMIC];
  };

  // Same idea/placement as generateDistanceChecks above, once per "Distance
  // to point" block instance (see the distancePointChecks pre-scan in
  // bbasic.js). The POINT input is an arbitrary expression - possibly
  // something with a side effect each time it's evaluated (e.g. "Random"),
  // not just a plain variable read like the two-object version's coordinate
  // vars - so it's captured into temp2 exactly ONCE up front (temp1 is the
  // shared DISTANCE_ABS_DIFF_NAME subroutine's own other input - see this
  // file's own top comment - so POINT's value has to sit somewhere that
  // survives the coord0 assignment right after it) rather than reading
  // pointCode back more than once, the same reasoning random_between_set's
  // own whitening formula captures "rand" into a temp once instead of
  // inlining it three times (see generators/bbasic/random.js). Safe here
  // for the same reason it is there: this runs as plain sequential
  // statements with no drawscreen in between.
  Blockly.BBasic.generateDistancePointChecks = function() {
    const checks = this.distancePointChecks;
    if (!checks || !checks.size) return '';
    registerDistanceAbsDiffSubroutine(Blockly);
    const suffix = Blockly.BBasic.bankJumpSuffix(1, Blockly.BBasic.getSubroutineBank(DISTANCE_ABS_DIFF_NAME));
    const lines = [];
    checks.forEach(({axis, obj0, index, block}) => {
      const varName = Blockly.BBasic.nameDB_.getName(
          distancePointVarName(axis, index), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const coord0 = `${obj0}${axis}`;
      const pointCode = Blockly.BBasic.valueToCode(block, 'POINT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      lines.push(
          ` temp2 = ${pointCode}`,
          ` temp1 = ${coord0}`,
          ` gosub ${DISTANCE_ABS_DIFF_NAME}${suffix}`,
          ` ${varName} = temp1`,
      );
    });
    return lines.join('\n');
  };
};

