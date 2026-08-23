'use strict';

import {canonicalDistanceVarName, distancePointVarName} from '../../utils/distance';
import {keypadKeyVarName} from '../../utils/keypad';

// Each of the 4 "rows" a keypad scan cycles through - SWCHA is written with
// the same 4-bit "walking zero" pattern duplicated in both nibbles (bits
// 0-3 select a column on the port 0/left keypad, bits 4-7 the identical
// column on the port 1/right keypad - confirmed straight from the
// reference keypad_test.bas this was ported from, which always writes the
// same nibble pattern twice), then the paddle-timer inputs (INPT0-5) are
// given `sleep` cycles to settle before being read - these exact sleep
// counts (472 the first row, 476 every row after) are the reference file's
// own tuned RC-discharge timings, not arbitrary.
const KEYPAD_ROUNDS = [
  {swcha: '%11101110', sleep: 472},
  {swcha: '%11011101', sleep: 476},
  {swcha: '%10111011', sleep: 476},
  {swcha: '%01110111', sleep: 476},
];
// Left/port-0 keypad reads INPT0/INPT1/INPT4 each row (accumulating into A);
// right/port-1 reads INPT2/INPT3/INPT5 (accumulating into Y). Unlike the
// reference file (which always polls both keypads and packs both results
// into one shared byte via a nibble-shift-and-OR), this keeps the two
// sides' results in two independent bytes and - see buildKeypadPollAsm
// below - only scans/reserves whichever side(s) a project's own blocks
// actually use, so a project using only "Keypad 0" blocks leaves port 1's
// SWCHA bits as inputs (SWACNT below), meaning an ordinary joystick can
// still be plugged into port 1 at the same time.
const KEYPAD_LEFT_INPTS = ['INPT0', 'INPT1', 'INPT4'];
const KEYPAD_RIGHT_INPTS = ['INPT2', 'INPT3', 'INPT5'];

// SWACNT (the SWCHA port's direction register) needs the bits for
// whichever port(s) are actually being scanned switched to output (so this
// routine's own SWCHA writes above reach the keypad's row-select lines);
// the other port's bits are left as inputs, so a normal joystick plugged
// into that port keeps working.
export const keypadSwacntMask = (useLeft, useRight) => {
  const low = useLeft ? '1111' : '0000';
  const high = useRight ? '1111' : '0000';
  return `%${high}${low}`;
};

// Builds the BODY of the "keypadpoll" subroutine (see
// registerKeypadPollSubroutine below, which wraps this with the normal
// "@keypadpoll ... return" a Blockly.BBasic.subroutines entry gets) - just
// the interior "asm ... end" block, with no entry label of its own.
//
// A first version gave this asm block its own bare "keypadpoll" label and
// spliced it as a standalone, fixed, once-only template block (following
// generateScoreBkColorAsm's own placement) instead of registering it as a
// normal subroutine, on the theory that a fixed, never-relocated position
// would sidestep the DASM local-label corruption generateDistanceChecks/
// generateMusicChecks' own comments document for an "asm ... end" block
// spliced into commongamelogic. Confirmed WRONG by an actual build: "gosub
// <name>" unconditionally compiles to "jsr .<name>" (bB always treats a
// gosub target as a DASM LOCAL label, dot-prefixed) regardless of where or
// how the definition itself was written - a bare "keypadpoll" label,
// wherever it physically sits in the file, is a plain GLOBAL symbol, not
// the ".keypadpoll" local one the call site actually jumps to, so the
// build failed outright ("Unknown Mnemonic 'jsr .keypadpoll'"). Only a
// definition written bB's own way - "@name" (exactly what
// generateSubroutineBody already wraps every Blockly.BBasic.subroutines
// entry with) - resolves correctly regardless of physical position; this
// is proven by every other existing gosub-called subroutine in this
// codebase (e.g. DISTANCE_ABS_DIFF_NAME below) already working from the
// exact same commongamelogic call-site context. So this is registered as
// an ordinary subroutine after all - its own internal step labels
// (_kp_step_N) are plain global symbols (no leading dot), not DASM locals,
// so they don't inherit the relocation-sensitive scoping problem that
// motivated avoiding the subroutine pool in the first place.
export const buildKeypadPollAsm = ({useLeft, useRight, leftVarName, rightVarName}) => {
  if (!useLeft && !useRight) return '';

  // Every branch/value pair this needs, in real hardware scan order,
  // tagged with which round (SWCHA pattern + settle time) it belongs to
  // and which accumulator (A for left/port 0, Y for right/port 1) it
  // feeds - built as plain data up front so the round-boundary setup
  // lines and sequential step labels below don't have to be hand-counted
  // separately for every left/right/both combination this can be built
  // for.
  const steps = [];
  KEYPAD_ROUNDS.forEach((round, roundIndex) => {
    const roundStart = steps.length;
    if (useLeft) {
      KEYPAD_LEFT_INPTS.forEach((inpt, i) =>
        steps.push({round: roundIndex, inpt, reg: 'A', value: roundIndex * 3 + i + 1}));
    }
    if (useRight) {
      KEYPAD_RIGHT_INPTS.forEach((inpt, i) =>
        steps.push({round: roundIndex, inpt, reg: 'Y', value: roundIndex * 3 + i + 1}));
    }
    steps[roundStart].isRoundStart = true;
  });

  // The very last step's own "no key in this row" branch falls through to
  // storing the result instead of another step - _kp_store, not a
  // numbered step label.
  const stepLabel = (index) => (index >= steps.length ? '_kp_store' : `_kp_step_${index}`);

  // This body is spliced into a Blockly.BBasic.subroutines entry (see
  // registerKeypadPollSubroutine below), which - unlike
  // generateScoreBkColorAsm's own standalone template splice - goes
  // through Blockly.BBasic.normalizeIndents (via generateSubroutineBody),
  // which rewrites EVERY line's leading whitespace to one flat INDENT,
  // wrecking the column-0-for-labels-vs-indented-for-mnemonics distinction
  // DASM requires inside a raw "asm ... end" block - confirmed directly,
  // the first version of this (hand-indented mnemonics, bare labels at
  // column 0) reproduced exactly the "Unknown Mnemonic '_kp_store'"/
  // "Unknown Mnemonic 'end'"-class failures score.js's own
  // buildDigitPokeLines documents fixing with its "@end" trick (see its
  // own comment) - every LABEL line here (including the closing "end")
  // uses that same "@" prefix so normalizeIndents' own second pass
  // (`code.replace(/^[\t ]*@\s*/gm, '')`) strips it back down to column 0,
  // regardless of what its first pass already did to it. Mnemonic lines
  // need no special handling - DASM only cares that they have SOME
  // leading whitespace, not how much, so normalizeIndents' own flat INDENT
  // is already enough.
  const lines = ['asm'];
  steps.forEach((step, index) => {
    // Step 0 needs no label of its own (control falls straight into it
    // from this subroutine's own "@keypadpoll" entry label, supplied by
    // generateSubroutineBody, and this round's own SWCHA/sleep setup
    // below) - every later step is itself some earlier step's own BMI
    // target, so it does.
    if (index > 0) lines.push(`@${stepLabel(index)}`);
    if (step.isRoundStart) {
      const round = KEYPAD_ROUNDS[step.round];
      lines.push(`LDX #${round.swcha}`, 'STX SWCHA', `sleep ${round.sleep}`);
      if (step.round === 0) {
        if (useLeft) lines.push('LDA #0');
        if (useRight) lines.push('LDY #0');
      }
    }
    lines.push(
        `LDX ${step.inpt}`,
        `BMI ${stepLabel(index + 1)}`,
        `LD${step.reg} #${step.value}`,
    );
  });
  lines.push('@_kp_store');
  if (useLeft) lines.push(`STA ${leftVarName}`);
  if (useRight) lines.push(`STY ${rightVarName}`);
  lines.push('RTS', '@end');
  return lines.join('\n');
};

// Registers "keypadpoll" into Blockly.BBasic.subroutines - called from
// bbasic.js's own init(), right after reserveDevVar hands out
// leftVarName/rightVarName, rather than from a finish()-time generate*
// function the way generateDistanceChecks calls
// registerDistanceAbsDiffSubroutine. That later timing works there because
// generateDistanceChecks() happens to run (see finish()'s own call order)
// before anything downstream reads Blockly.BBasic.subroutines back out -
// this project's own keypad0Used/keypad1Used pre-scan needs the resolved
// var names anyway (nameDB_ already assigns them inside reserveDevVar), so
// registering immediately, right there, sidesteps needing to reason about
// exactly how early is early enough at all.
export const registerKeypadPollSubroutine = (Blockly, {useLeft, useRight, leftVarName, rightVarName}) => {
  const body = buildKeypadPollAsm({useLeft, useRight, leftVarName, rightVarName});
  if (body) Blockly.BBasic.subroutines.keypadpoll = body;
};

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

  // "Keypad N: key X is pressed" - a plain equality check against the
  // hidden byte generateKeypadPollAsm's own poll routine writes each frame
  // (see keypadKeyVarName) - routed through nameDB_.getName the same way
  // getDistanceVarName below is, so this always matches whatever letter/
  // varN bbasic.js's own pre-scan actually reserved for it. Same shape/
  // order as logic_compare's own "EQ" case, since that's exactly what this
  // is.
  const createGeneratorForKeypad = (port) => {
    Blockly.BBasic[`input_keypad${port}_get`] = function(block) {
      const varName = Blockly.BBasic.nameDB_.getName(
          keypadKeyVarName(port), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const key = block.getFieldValue('KEY');
      return [`${varName} = ${key}`, Blockly.BBasic.ORDER_EQUALITY];
    };
  };

  ['0', '1'].forEach(createGeneratorForKeypad);

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

  // The single line that calls the poll routine (registered into
  // Blockly.BBasic.subroutines by registerKeypadPollSubroutine, called from
  // bbasic.js's own init() - see that function's own comment for why it
  // has to be registered that early) once per frame - spliced into
  // commongamelogic (see bbasic.bb.hbs), which is always bank 1, same
  // reasoning as generateDistanceChecks' own gosub for why the bank suffix
  // still has to be computed via getSubroutineBank rather than assumed
  // empty: "keypadpoll" is an ordinary subroutine now (see
  // registerKeypadPollSubroutine's own comment on why a hand-rolled
  // fixed-position splice couldn't work here), so it can, in principle,
  // end up relocated to another bank like any other.
  Blockly.BBasic.generateKeypadPollCall = function() {
    if (!this.keypad0Used && !this.keypad1Used) return '';
    const suffix = Blockly.BBasic.bankJumpSuffix(1, Blockly.BBasic.getSubroutineBank('keypadpoll'));
    return ` gosub keypadpoll${suffix}`;
  };

  // SWACNT (SWCHA's own direction register) has to be set to output for
  // whichever port(s) are scanned before the very first poll runs - a
  // one-time Setup-section line (see bbasic.bb.hbs's own
  // generatedKeypadSetup splice, right alongside generatedTextMinikernelDefaults),
  // not something commongamelogic needs to redo every frame.
  Blockly.BBasic.generateKeypadSetup = function() {
    if (!this.keypad0Used && !this.keypad1Used) return '';
    return ` SWACNT = ${keypadSwacntMask(this.keypad0Used, this.keypad1Used)}`;
  };
};

