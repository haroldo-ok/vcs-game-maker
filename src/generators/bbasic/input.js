'use strict';

import {canonicalDistanceVarName, distancePointVarName} from '../../utils/distance';
import {keypadKeyVarName} from '../../utils/keypad';
import {flagPoolVar, flagPoolBit} from './flag-pool';

// Each of the 4 "rows" a keypad scan cycles through - SWCHA is written with
// the same 4-bit "walking zero" pattern duplicated in both nibbles (bits
// 0-3 select a column on the port 0/left keypad, bits 4-7 the identical
// column on the port 1/right keypad - confirmed straight from the
// reference keypad_test.bas this was ported from, which always writes the
// same nibble pattern twice), then the paddle-timer inputs (INPT0-5) are
// given `sleep` cycles to settle before being read - these exact sleep
// counts (472 the first row, 476 every row after) are the reference file's
// tuned RC-discharge timings, not arbitrary.
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
// below - only scans/reserves whichever side(s) a project's  blocks
// actually use, so a project using only "Keypad 0" blocks leaves port 1's
// SWCHA bits as inputs (SWACNT below), meaning an ordinary joystick can
// still be plugged into port 1 at the same time.
const KEYPAD_LEFT_INPTS = ['INPT0', 'INPT1', 'INPT4'];
const KEYPAD_RIGHT_INPTS = ['INPT2', 'INPT3', 'INPT5'];

// SWACNT (the SWCHA port's direction register) needs the bits for
// whichever port(s) are actually being scanned switched to output (so this
// routine's  SWCHA writes above reach the keypad's row-select lines);
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
// the interior "asm ... end" block, with no entry label.
//
// A first version gave this asm block its  bare "keypadpoll" label and
// spliced it as a standalone, fixed, once-only template block (following
// generateScoreBkColorAsm's  placement) instead of registering it as a
// normal subroutine, on the theory that a fixed, never-relocated position
// would sidestep the DASM local-label corruption generateDistanceChecks/
// generateMusicChecks'  comments document for an "asm ... end" block
// spliced into commongamelogic. Confirmed WRONG by an actual build: "gosub
// <name>" unconditionally compiles to "jsr .<name>" (bB always treats a
// gosub target as a DASM LOCAL label, dot-prefixed) regardless of where or
// how the definition itself was written - a bare "keypadpoll" label,
// wherever it physically sits in the file, is a plain GLOBAL symbol, not
// the ".keypadpoll" local one the call site actually jumps to, so the
// build failed outright ("Unknown Mnemonic 'jsr .keypadpoll'"). Only a
// definition written bB's  way - "@name" (exactly what
// generateSubroutineBody already wraps every Blockly.BBasic.subroutines
// entry with) - resolves correctly regardless of physical position; this
// is proven by every other existing gosub-called subroutine in this
// codebase (e.g. DISTANCE_ABS_DIFF_NAME below) already working from the
// exact same commongamelogic call-site context. So this is registered as
// an ordinary subroutine after all - its  internal step labels
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

  // The very last step's "no key in this row" branch falls through to
  // storing the result instead of another step - _kp_store, not a
  // numbered step label.
  const stepLabel = (index) => (index >= steps.length ? '_kp_store' : `_kp_step_${index}`);

  // This body is spliced into a Blockly.BBasic.subroutines entry (see
  // registerKeypadPollSubroutine below), which - unlike
  // generateScoreBkColorAsm's  standalone template splice - goes
  // through Blockly.BBasic.normalizeIndents (via generateSubroutineBody),
  // which rewrites EVERY line's leading whitespace to one flat INDENT,
  // wrecking the column-0-for-labels-vs-indented-for-mnemonics distinction
  // DASM requires inside a raw "asm ... end" block - confirmed directly,
  // the first version of this (hand-indented mnemonics, bare labels at
  // column 0) reproduced exactly the "Unknown Mnemonic '_kp_store'"/
  // "Unknown Mnemonic 'end'"-class failures score.js's
  // buildDigitPokeLines documents fixing with its "@end" trick (see its
  // comment) - every LABEL line here (including the closing "end")
  // uses that same "@" prefix so normalizeIndents'  second pass
  // (`code.replace(/^[\t ]*@\s*/gm, '')`) strips it back down to column 0,
  // regardless of what its first pass already did to it. Mnemonic lines
  // need no special handling - DASM only cares that they have SOME
  // leading whitespace, not how much, so normalizeIndents'  flat INDENT
  // is already enough.
  const lines = ['asm'];
  steps.forEach((step, index) => {
    // Step 0 needs no label (control falls straight into it
    // from this subroutine's "@keypadpoll" entry label, supplied by
    // generateSubroutineBody, and this round's  SWCHA/sleep setup
    // below) - every later step is itself some earlier step's  BMI
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
// bbasic.js's  init(), right after reserveDevVar hands out
// leftVarName/rightVarName, rather than from a finish()-time generate*
// function the way generateDistanceChecks calls
// registerDistanceAbsDiffSubroutine. That later timing works there because
// generateDistanceChecks() happens to run (see finish()'s  call order)
// before anything downstream reads Blockly.BBasic.subroutines back out -
// this project's  keypad0Used/keypad1Used pre-scan needs the resolved
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
// subroutine.js's "this.subroutines[name] = code" pattern) rather than
// inlined at every call site: a project with several distance checks used
// to pay this same 6-line abs-difference block in full at EACH one (with
// only the operand/target variable NAMES differing, the actual logic
// identical every time) - one shared copy, called via a plain "gosub" (3
// lines per call site instead of 6, plus one copy of the shared block
// instead of one per check), same win registering the run-once bookkeeping
// and _music_play_reset as ordinary subroutines already got: a genuine
// relocatable unit too (see getSubroutineBank), not just fixed in bank 1
// forever the way this was before.
// Hand-written 6502 replacement for the bB if/goto version this used to be
// ("if temp1 < temp2 then goto ... / temp1 = temp1 - temp2 / return / ... /
// temp1 = temp2 - temp1") - same "@label for a definition, bare name for a
// reference" convention buildKeypadPollAsm
// above already established for a subroutine body (which, unlike
// generators/bbasic/background.js's  commongamelogic-spliced asm blocks,
// DOES go through generateSubroutineBody's  normalizeIndents() pass -
// see that function's  comment for exactly why the "@" trick matters
// here specifically). SEC+SBC's  carry flag afterward already says which
// operand was bigger (clear = borrowed = temp1 was smaller) - no separate
// bB-style "if temp1 < temp2" comparison needed first, unlike the bB
// version, which computes that same answer twice (once as its  explicit
// "if", a second time implicitly inside whichever subtraction it picked).
const DISTANCE_ABS_DIFF_NAME = '_distance_abs_diff';
const registerDistanceAbsDiffSubroutine = (Blockly) => {
  Blockly.BBasic.subroutines[DISTANCE_ABS_DIFF_NAME] = [
    'asm',
    'LDA temp1',
    'SEC',
    'SBC temp2',
    'BCS _distance_abs_diff_ok',
    'LDA temp2',
    'SEC',
    'SBC temp1',
    '@_distance_abs_diff_ok',
    'STA temp1',
    'RTS',
    '@end',
  ].join('\n');
};
// generateSubroutines/generateRelocatedSections still auto-append a bB
// "return" right after whatever body they're given (see subroutine.js's
// comment on why), same as for every other subroutine - but the RTS above
// already exits before that point is ever reached, so it's dead code, same
// as buildKeypadPollAsm's  explicit RTS-before-"@end" above.

// "Joystick N direction (8-way)" (see blocks/input.js) reads this one
// shared 16-entry table, indexed by up+down*2+left*4+right*8 (every
// possible up/down/left/right combination), mapping to a 0-7 clockwise-
// from-Up direction or 255 ("no clear direction" - centered, or a
// contradictory combination like Up+Down together). Built once, as plain
// data, rather than an if/elseif chain - a single indexed read is both
// less generated code AND cheaper at runtime than a 16-way branch chain
// would be.
//   index 0  (none)        -> 255   index 8  (right)        -> 2
//   index 1  (up)          -> 0     index 9  (up+right)     -> 1
//   index 2  (down)        -> 4     index 10 (down+right)   -> 3
//   index 3  (up+down)     -> 255   index 11 (invalid)      -> 255
//   index 4  (left)        -> 6     index 12 (left+right)   -> 255
//   index 5  (up+left)     -> 7     index 13 (invalid)      -> 255
//   index 6  (down+left)   -> 5     index 14 (invalid)      -> 255
//   index 7  (invalid)     -> 255   index 15 (invalid)      -> 255
const JOY_DIR8_TABLE_VALUES = [255, 0, 4, 255, 6, 7, 5, 255, 2, 1, 3, 255, 255, 255, 255, 255];
const JOY_DIR8_TABLE_NAME = '_joyDir8Table';

// The getter's  result, recomputed once per frame by
// generateJoystickDirection8Checks below (same "precompute once into a
// hidden var, the getter just reads it back" idiom as canonicalDistanceVarName/
// generateDistanceChecks) rather than indexed inline at the getter's  call
// site - a real, confirmed build failure ("Unknown Mnemonic 'ldx joy0u'",
// reproduced from an actual compile) showed this compiler's "complex
// statement" handling corrupts a data-table read whose INDEX is itself a
// compound expression (up + down*2 + left*4 + right*8) - only a single plain
// variable index compiles correctly (confirmed working precedent:
// text-scroll.js's "text_offsets[id]"). So the compound index math is
// computed into bB's  free scratch register (temp1 - same one
// generateDistanceChecks already reuses freely, safe here for the same
// reason: assigned and consumed with nothing else, not even a drawscreen, in
// between) as its  separate statement first, and the table is indexed by
// that single variable.
export const joyDir8ResultVarName = (name) => `_${name}Dir8`;

// Reserves each used joystick's  result dev var - called from bbasic.js's
// init() with a pre-scanned Set of which joysticks actually have a
// "direction (8-way)" getter block used anywhere in the project (has to be
// known before reserveDevVar hands out user variable letters, well before
// this feature's  generator would otherwise run).
export const reserveJoystickDirection8DevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  usedFor.forEach((name) =>
    reserveDevVar(joyDir8ResultVarName(name), undefined, 'this joystick\'s 8-way direction (0-7, or 255)'));
};

// Spliced into bbasic.bb.hbs right alongside generatedDataTables - a single,
// fixed bank-1 copy is enough (unlike generateTextOffsetTables'
// per-relocated-bank copies): generateJoystickDirection8Checks below (which
// is the only thing that ever reads this table) is itself always spliced
// into commongamelogic, which is always bank 1, regardless of which bank any
// particular "direction (8-way)" getter block's  USE ends up in.
export const generateJoystickDirection8Table = (Blockly) => {
  const used = Blockly.BBasic.joyDirection8UsedFor;
  if (!used || !used.size) return '';
  return ` data ${JOY_DIR8_TABLE_NAME}\n  ${JOY_DIR8_TABLE_VALUES.join(', ')}\nend`;
};

// Spliced into commongamelogic right alongside generateDistanceChecks (same
// region, same "precompute once per frame into a hidden var" reasoning) -
// one check per joystick that actually has a "direction (8-way)" getter used
// anywhere in the project.
//
// joy0up/joy0down/joy0left/joy0right (and the joy1 equivalents) are only
// valid in a BOOLEAN/branch context ("if joy0up then ...") - confirmed by a
// real, reproduced build failure ("Unknown Mnemonic 'lda joy0up'"): they
// aren't plain readable RAM bytes at all (bB backs them with a BIT test
// against SWCHA, not a loadable byte), so using one as a numeric operand in
// an arithmetic expression (this file's  earlier "up + down*2 + left*4 +
// right*8" attempt) fails outright, regardless of whether that expression
// sits inline at a table index (the very first version of this) or in its
// separate assignment statement (the version right before this one) -
// neither placement matters, since the operand itself was never valid to
// begin with. Fixed by building the same 0-15 index with four independent
// "if joyNxxx then temp1 = temp1 + <bit>" conditionals instead - each one a
// plain boolean-context read (exactly how every other joystick block in this
// codebase already reads these) added into temp1 (the same free scratch
// register generateDistanceChecks already reuses) only when true, with no
// arithmetic operand ever needing to read one of these directly. No
// multiplication anywhere either, so this needs no usesDivMul flag, unlike
// the compound-expression version this replaced.
export const generateJoystickDirection8Checks = (Blockly) => {
  const used = Blockly.BBasic.joyDirection8UsedFor;
  if (!used || !used.size) return '';
  const resolveSystemVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.VARIABLE_CATEGORY_NAME);
  const resolveDevVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lines = [];
  ['joy0', 'joy1'].forEach((name) => {
    if (!used.has(name)) return;
    const up = resolveSystemVar(`${name}up`);
    const down = resolveSystemVar(`${name}down`);
    const left = resolveSystemVar(`${name}left`);
    const right = resolveSystemVar(`${name}right`);
    const resultVar = resolveDevVar(joyDir8ResultVarName(name));
    lines.push(
        ` temp1 = 0`,
        ` if ${up} then temp1 = temp1 + 1`,
        ` if ${down} then temp1 = temp1 + 2`,
        ` if ${left} then temp1 = temp1 + 4`,
        ` if ${right} then temp1 = temp1 + 8`,
        ` ${resultVar} = ${JOY_DIR8_TABLE_NAME}[temp1]`,
    );
  });
  return lines.join('\n');
};

// Fire-button press-pattern tracking (tap/hold/released/double-tap - see
// blocks/input.js's  comment on why these are Fire-only). Four dev vars
// per joystick that actually uses ANY of these blocks, all reserved
// together (same "reserve the whole bundle even if only one block needs
// part of it" simplification reserveMissileFireDevVars/reserveSeekDevVars
// already use) rather than trying to gate each one individually:
//   held             - frames Fire has been continuously down (0 while up),
//                       saturates at 255 rather than wrapping so "held for
//                       N frames or more" stays true indefinitely past N,
//                       however long Fire is actually held.
//   prev             - was Fire down last frame (0/1) - internal only, not
//                       exposed to any block; lets generateJoystickButtonChecks
//                       detect the down-to-up transition.
//   justReleased     - 1 for exactly the frame Fire is released, else 0 -
//                       read directly by "Fire released", and by "Fire
//                       tapped"'s  inline comparison against
//                       lastPressFrames below.
//   lastPressFrames  - a snapshot of "held" taken the instant a release is
//                       detected (meaningless any other frame) - "Fire
//                       tapped" compares this against its  MAX_FRAMES
//                       field inline, so any number of tap blocks with
//                       different thresholds can share these same four vars
//                       with no per-instance state of their  needed.
export const joyButtonHeldVarName = (name) => `_${name}FireHeld`;
// Only two variables per joystick. "Was it down last frame" is just "Held is not
// 0" (Held counts the frames of the current press and drops to 0 on release).
// "Released this exact frame" is bit 7 of LastPressFrames: on the release frame
// LastPressFrames holds 128 + how long the press lasted (capped at 127), and
// the next frame clears the bit.
export const joyButtonLastPressFramesVarName = (name) => `_${name}FireLastPressFrames`;
export const JOY_BUTTON_JUST_RELEASED_BIT = 7;

// Reserves the three dev vars above - called from bbasic.js's init() with a
// pre-scanned Set of which joysticks actually have a tap/hold/released/
// double-tap block used anywhere in the project (has to be known before
// reserveDevVar hands out user variable letters, well before this feature's
// generator would otherwise run).
export const reserveJoystickButtonDevVars = (reserveDevVar, usedFor, needsReleaseFor, reserveDevVarRW) => {
  if (!usedFor || !usedFor.size) return;
  usedFor.forEach((name) => {
    // A read/write pair (Superchip RAM's separate pool): only assigned, added to and
    // compared, so it leaves one of the ordinary variables free.
    reserveDevVarRW(joyButtonHeldVarName(name),
        'this joystick\'s Fire button: frames continuously held (saturates at 255)');
    // Only for tapped/released/double-tapped (see joyButtonNeedsReleaseFor in
    // bbasic.js): a joystick only checked with "held" skips this variable.
    if (needsReleaseFor && needsReleaseFor.has(name)) {
      reserveDevVar(joyButtonLastPressFramesVarName(name), undefined,
          'this joystick Fire button: how long the press that just ended lasted (low bits), released this frame (bit 7)');
    }
  });
};

// "Switch ... was just switched on": the console switches in the order their two flag bits are given in
// (the switch's value in the Switch block's dropdown). The family keeps, for each used switch, a bit for
// "was on last frame" and one for "went on this frame".
export const SWITCH_EDGE_FAMILY = 'switchEdgeFlags';
const SWITCH_EDGE_SWITCHES = ['switchreset', 'switchselect', 'not switchbw', 'switchbw'];
export const switchEdgeFlagsVarName = () => flagPoolVar(SWITCH_EDGE_FAMILY);
export const switchEdgeIndex = (value) => SWITCH_EDGE_SWITCHES.indexOf(value);
const switchEdgePrevBit = (value) => flagPoolBit(SWITCH_EDGE_FAMILY, switchEdgeIndex(value) * 2);
export const switchEdgeJustBit = (value) => flagPoolBit(SWITCH_EDGE_FAMILY, switchEdgeIndex(value) * 2 + 1);
// The pool bits (see planFlagPool) for the switches used with "was just switched on".
export const switchEdgeOwnBits = (usedFor) => [...(usedFor || [])]
    .filter((value) => switchEdgeIndex(value) >= 0)
    .flatMap((value) => [switchEdgeIndex(value) * 2, switchEdgeIndex(value) * 2 + 1]);

export const reserveSwitchEdgeDevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(switchEdgeFlagsVarName(), undefined, 'console switches: on last frame / just switched on');
};

// Once per frame, before the game's code runs: sets each switch's "just switched on" bit for the one
// frame it goes from off to on.
export const generateSwitchEdgeChecks = (Blockly) => {
  const used = Blockly.BBasic.switchEdgeUsedFor;
  if (!used || !used.size) return '';
  const flagsVar = Blockly.BBasic.nameDB_.getName(switchEdgeFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lines = [];
  [...used].filter((value) => switchEdgeIndex(value) >= 0).forEach((value) => {
    const key = `_switchedge${switchEdgeIndex(value)}`;
    const pressed = Blockly.BBasic.nameDB_.getName(value, Blockly.VARIABLE_CATEGORY_NAME);
    const prev = `${flagsVar}{${switchEdgePrevBit(value)}}`;
    const just = `${flagsVar}{${switchEdgeJustBit(value)}}`;
    lines.push(
        ` if ${pressed} then goto ${key}_on`,
        ` ${prev} = 0`,
        ` ${just} = 0`,
        ` goto ${key}_done`,
        `${key}_on`,
        ` ${just} = 0`,
        ` if !${prev} then ${just} = 1`,
        ` ${prev} = 1`,
        `${key}_done`);
  });
  return lines.join('\n');
};

// Spliced into commongamelogic right alongside generateJoystickDirection8Checks
// (same region, same "precompute per-frame input state into hidden vars"
// reasoning) - one check per joystick that actually has a tap/hold/released/
// double-tap block used anywhere. Structured as one flat down/up branch (via
// goto, not nested "if...then") for the same reason generateJoystickDirection8Checks
// and every other per-frame check in this codebase already is: "if X then A"
// only conditions the single statement right after "then". joyNfire is only
// ever tested in a branch ("if joyNfire then goto ..."), never read as a
// plain numeric/assignable value, for the same reason generateJoystickDirection8Checks'
// comment documents (a real, reproduced build failure using one as a
// plain operand).
export const generateJoystickButtonChecks = (Blockly) => {
  const used = Blockly.BBasic.joyButtonUsedFor;
  if (!used || !used.size) return '';
  const resolveSystemVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.VARIABLE_CATEGORY_NAME);
  const resolveDevVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lines = [];
  ['joy0', 'joy1'].forEach((name) => {
    if (!used.has(name)) return;
    const fireVar = resolveSystemVar(`${name}fire`);
    const held = Blockly.BBasic.superchipRwPairs[joyButtonHeldVarName(name)];
    if (!(Blockly.BBasic.joyButtonNeedsReleaseFor && Blockly.BBasic.joyButtonNeedsReleaseFor.has(name))) {
      // Only "held" is checked: count the frames Fire has been down, nothing more.
      lines.push(
          ` if ${fireVar} then goto _${name}btn_down`,
          ` ${held.write} = 0`,
          ` goto _${name}btn_done`,
          `_${name}btn_down`,
          ` if ${held.read} <> 255 then ${held.write} = ${held.read} + 1`,
          `_${name}btn_done`,
      );
      return;
    }
    const lastPressFramesVar = resolveDevVar(joyButtonLastPressFramesVarName(name));
    const justReleasedVar = `${lastPressFramesVar}{${JOY_BUTTON_JUST_RELEASED_BIT}}`;
    lines.push(
        ` if ${fireVar} then goto _${name}btn_down`,
        // A bit-indexed read ("VAR{n}") is only ever used bare or negated
        // ("if X{n} then"/"if !X{n} then") throughout the rest of this
        // codebase's  generated output - never compared with "= 0"/"= 1"
        // the way a plain variable read is. Confirmed as a real reported
        // build failure ("Unknown keyword: 0") once this was the only place
        // doing that: real batari Basic's  grammar doesn't accept a
        // bit-read as the left side of a "=" comparison, only as a bare
        // boolean.
        ` if ${held.read} = 0 then goto _${name}btn_up_done`,
        // Was down last frame, up now - the release transition.
        ` ${lastPressFramesVar} = ${held.read}`,
        ` if ${lastPressFramesVar} > 127 then ${lastPressFramesVar} = 127`,
        ` ${justReleasedVar} = 1`,
        ` ${held.write} = 0`,
        ` goto _${name}btn_done`,
        `_${name}btn_up_done`,
        // Already up last frame too - nothing changed.
        ` ${justReleasedVar} = 0`,
        ` goto _${name}btn_done`,
        `_${name}btn_down`,
        ` ${justReleasedVar} = 0`,
        ` if ${held.read} <> 255 then ${held.write} = ${held.read} + 1`,
        `_${name}btn_done`,
    );
  });
  return lines.join('\n');
};

// One result + one countdown timer dev var PER "Fire double-tapped" block
// instance (not shared per-joystick the way held/prev/justReleased/
// lastPressFrames above are) - same "each instance gets its  hidden
// state" reasoning distancePointChecks already uses (see that pre-scan's
// comment in bbasic.js), needed here specifically because different
// double-tap blocks on the same joystick can each have their  WINDOW
// field value, so the countdown itself can't be shared the way a plain
// comparison-only value (like "Fire held") can.
export const joyDoubleTapResultVarName = (index) => `joyDoubleTap${index}`;
export const joyDoubleTapTimerVarName = (index) => `joyDoubleTap${index}Timer`;

// Reserves the two dev vars above for every "Fire double-tapped" block
// instance bbasic.js's  pre-scan (joyDoubleTapChecks) found - same early
// "before reserveDevVar hands out user variable letters" timing as
// reserveJoystickButtonDevVars.
export const reserveJoystickDoubleTapDevVars = (reserveDevVar, checks) => {
  if (!checks || !checks.size) return;
  checks.forEach(({index}) => {
    reserveDevVar(joyDoubleTapResultVarName(index), undefined,
        'this "Fire double-tapped" block\'s result (0/1, true for one frame)');
    reserveDevVar(joyDoubleTapTimerVarName(index), undefined,
        'this "Fire double-tapped" block\'s window countdown');
  });
};

// Spliced into commongamelogic right after generateJoystickButtonChecks (has
// to run AFTER it every frame - this reads justReleasedVar, which that
// function is what actually computes each frame). One check per "Fire
// double-tapped" block instance: on every release, if this instance's
// timer is still counting down from an EARLIER release, that's the second
// tap - fire the result (for one frame) and clear the timer; otherwise this
// is the first tap of a potential pair, so (re)start the timer at this
// instance's  WINDOW. Any frame that isn't a release just counts the
// timer down toward 0 (once it reaches 0, the window has expired, and the
// next release starts a fresh one instead of completing a pair).
export const generateJoystickDoubleTapChecks = (Blockly) => {
  const checks = Blockly.BBasic.joyDoubleTapChecks;
  if (!checks || !checks.size) return '';
  const resolveDevVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lines = [];
  checks.forEach(({name, window, index}) => {
    const justReleasedVar = `${resolveDevVar(joyButtonLastPressFramesVarName(name))}{${JOY_BUTTON_JUST_RELEASED_BIT}}`;
    const resultVar = resolveDevVar(joyDoubleTapResultVarName(index));
    const timerVar = resolveDevVar(joyDoubleTapTimerVarName(index));
    const tag = `dt${index}`;
    lines.push(
        ` ${resultVar} = 0`,
        ` if ${justReleasedVar} = 0 then goto _${tag}_decr`,
        ` if ${timerVar} = 0 then goto _${tag}_first`,
        ` ${resultVar} = 1`,
        ` ${timerVar} = 0`,
        ` goto _${tag}_done`,
        `_${tag}_first`,
        ` ${timerVar} = ${window}`,
        ` goto _${tag}_done`,
        `_${tag}_decr`,
        ` if ${timerVar} = 0 then goto _${tag}_done`,
        ` ${timerVar} = ${timerVar} - 1`,
        `_${tag}_done`,
    );
  });
  return lines.join('\n');
};

// Both combined Joystick 0/1 blocks (see blocks/input.js) read their
// JOYSTICK field (0/1) at compile time to know which - matching
// playerNameFromField/missileNameFromField's shape in
// generators/bbasic/sprites.js.
const joystickNameFromBlock = (block) => `joy${block && block.getFieldValue('JOYSTICK') === '1' ? '1' : '0'}`;

export default (Blockly) => {
  Blockly.BBasic['input_joystick_get'] = function(block) {
    const varName = block.getFieldValue('VAR');
    const getName = (name) => Blockly.BBasic.nameDB_.getName(name, Blockly.VARIABLE_CATEGORY_NAME);
    // A diagonal is the two straight directions it is made of, both pushed.
    const diagonal = /^(joy[01])(up|down)(left|right)$/.exec(varName);
    if (diagonal) {
      const [, joystick, vertical, horizontal] = diagonal;
      return [`${getName(joystick + vertical)} && ${getName(joystick + horizontal)}`,
        Blockly.BBasic.ORDER_LOGICAL_AND];
    }
    // Variable getter.
    return [getName(varName), Blockly.BBasic.ORDER_ATOMIC];
  };

  // "Joystick [0/1] direction (8-way)" - just reads back whatever
  // generateJoystickDirection8Checks already precomputed into this
  // joystick's result dev var this frame (see that function's
  // comment for why the actual table lookup can't happen inline here).
  Blockly.BBasic['input_joystick_direction8'] = function(block) {
    const resultVar = Blockly.BBasic.nameDB_.getName(
        joyDir8ResultVarName(joystickNameFromBlock(block)), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [resultVar, Blockly.BBasic.ORDER_ATOMIC];
  };

  // "Joystick [0/1] Fire [tapped/held/released/double-tapped]" - one
  // combined block covering both joysticks and every pattern (see
  // blocks/input.js's JOYSTICK/MODE dropdown comments), dispatching on
  // those fields at compile time (this.getFieldValue, same as e.g.
  // input_console_switch_get's  SWITCH dropdown just reading a different
  // system var per option - here the CODE shape itself differs per mode,
  // not just which var gets read). All four modes just read back (or, for
  // tap, inline-compare) whatever generateJoystickButtonChecks already
  // precomputed into this joystick's  shared button-state dev vars this
  // frame (see that function's  comment). "tapped" needs no per-instance
  // state of its  even though several tapped-mode blocks on the same
  // joystick can each have a different FRAMES value - it's a pure
  // comparison against the shared lastPressFrames snapshot, so every
  // instance can safely read the same two vars with its  compile-time
  // threshold plugged in. Composed the exact same way logic_operation's
  // "&&" case is (see logic.js) - both sides are ORDER_EQUALITY/
  // ORDER_RELATIONAL, both strictly tighter-binding than ORDER_LOGICAL_AND,
  // so no parentheses are needed around either side. "double-tapped" is the
  // one mode that DOES need per-instance state (its  window can differ
  // per block) - looked up by this block's  id in bbasic.js's
  // joyDoubleTapChecks pre-scan, same lookup-by-block.id shape
  // getDistancePointVarName below already uses for "Distance to point".
  Blockly.BBasic['input_joystick_fire_pattern'] = function(block) {
    const name = joystickNameFromBlock(block);
    const mode = block.getFieldValue('MODE');
    const frames = Math.max(1, Math.min(255, Math.round(Number(block.getFieldValue('FRAMES')) || 20)));
    if (mode === 'RELEASED') {
      const flagsVar = Blockly.BBasic.nameDB_.getName(
          joyButtonLastPressFramesVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      // Bare, not "= 1" - a bit-indexed read ("VAR{n}") already evaluates
      // as a boolean on its  throughout the rest of this codebase (see
      // generateJoystickButtonChecks'  identical fix), comparing it
      // against 1 isn't valid real batari Basic syntax for a bit read -
      // confirmed as a real reported build failure ("Unknown keyword: 0")
      // once a project actually plugged this block into an "if".
      return [`${flagsVar}{${JOY_BUTTON_JUST_RELEASED_BIT}}`, Blockly.BBasic.ORDER_ATOMIC];
    }
    if (mode === 'HOLD') {
      const held = Blockly.BBasic.superchipRwPairs[joyButtonHeldVarName(name)];
      return [`${held.read} >= ${frames}`, Blockly.BBasic.ORDER_RELATIONAL];
    }
    if (mode === 'DOUBLE_TAP') {
      const entry = Blockly.BBasic.joyDoubleTapChecks && Blockly.BBasic.joyDoubleTapChecks.get(block.id);
      const resultVar = Blockly.BBasic.nameDB_.getName(
          joyDoubleTapResultVarName(entry.index), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      return [`${resultVar} = 1`, Blockly.BBasic.ORDER_EQUALITY];
    }
    // TAP (also the fallback for a stale/unrecognized MODE value). Same
    // bare-bit-read fix as RELEASED above - "{n} && ..." not "{n} = 1 &&
    // ...".
    const lastPressFramesVar = Blockly.BBasic.nameDB_.getName(
        joyButtonLastPressFramesVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    // On the release frame the variable holds 128 + the press length (capped at
    // 127), so "released and no longer than N frames" is one comparison.
    return [`${lastPressFramesVar}{${JOY_BUTTON_JUST_RELEASED_BIT}} && ${lastPressFramesVar} <= ${128 + Math.min(frames, 127)}`,
      Blockly.BBasic.ORDER_LOGICAL_AND];
  };

  // Both combined Keypad 0/1 blocks (see blocks/input.js) read their
  // KEYPAD field (0/1) at compile time to know which port.
  const keypadPortFromBlock = (block) => (block && block.getFieldValue('KEYPAD') === '1' ? '1' : '0');

  // "Keypad [0/1]: key X is pressed" - a plain equality check against the
  // hidden byte generateKeypadPollAsm's poll routine writes each frame
  // (see keypadKeyVarName) - routed through nameDB_.getName the same way
  // getDistanceVarName below is, so this always matches whatever letter/
  // varN bbasic.js's pre-scan actually reserved for it. Same shape/
  // order as logic_compare's "EQ" case, since that's exactly what this
  // is.
  Blockly.BBasic['input_keypad_get'] = function(block) {
    const varName = Blockly.BBasic.nameDB_.getName(
        keypadKeyVarName(keypadPortFromBlock(block)), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const key = block.getFieldValue('KEY');
    return [`${varName} = ${key}`, Blockly.BBasic.ORDER_EQUALITY];
  };

  // "Any key is pressed" - same poll byte, compared against 0 (no key
  // currently held - see KEYPAD_KEY_OPTIONS' comment in blocks/input.js)
  // instead of one specific key.
  Blockly.BBasic['input_keypad_any_pressed'] = function(block) {
    const varName = Blockly.BBasic.nameDB_.getName(
        keypadKeyVarName(keypadPortFromBlock(block)), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [`${varName} <> 0`, Blockly.BBasic.ORDER_EQUALITY];
  };

  // "Key ID pressed" - the poll byte itself, exposed as a plain Number
  // rather than compared against anything.
  Blockly.BBasic['input_keypad_id_get'] = function(block) {
    const varName = Blockly.BBasic.nameDB_.getName(
        keypadKeyVarName(keypadPortFromBlock(block)), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [varName, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['input_console_switch_get'] = function(block) {
    if (block.getFieldValue('MODE') === 'ONCE' && switchEdgeIndex(block.getFieldValue('SWITCH')) >= 0) {
      // True for the one frame after the switch went from off to on (see generateSwitchEdgeChecks).
      const flagsVar = Blockly.BBasic.nameDB_.getName(switchEdgeFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      return [`${flagsVar}{${switchEdgeJustBit(block.getFieldValue('SWITCH'))}}`, Blockly.BBasic.ORDER_ATOMIC];
    }
    // Variable getter.
    const switchName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('SWITCH'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [switchName, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Distance between any two objects (Player 0/1, Missile 0/1, Ball), one
  // axis at a time - a plain number, recomputed once per frame (see
  // generateDistanceChecks below) into the same hidden variable bbasic.js's
  // pre-scan registered for this exact (axis, object pair), so reading
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
  // unique (axis, object pair) collected by bbasic.js's  pre-scan (see
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
  // line, same as generateEnvelopeChecks.
  //
  // An "asm ... end" block (SEC+SBC's carry flag already says which operand
  // was smaller, so a BCS-guarded EOR/CLC/ADC two's-complement negate can
  // compute the same result in one flat sequence) was tried here and
  // reverted - see generateMusicChecks'  comment on the exact same
  // finding: any "asm ... end" block spliced into this per-frame code path
  // corrupts DASM's local-label scoping in this toolchain, regardless of
  // what it contains.
  //
  // Each check is now a 3-line call into the shared DISTANCE_ABS_DIFF_NAME
  // subroutine (see its  comment at the top of this file) instead of its
  // fully inlined 6-line abs-difference block - a project with several
  // distance checks used to pay the full 6 lines EVERY time, despite the
  // logic being identical every single time (only the operand/target
  // variable names ever differed). Called with a bank suffix hardcoded to
  // "from bank 1" (bankJumpSuffix's first argument) rather than
  // Blockly.BBasic.getCurrentBank() - this whole function's  output is
  // always spliced into commongamelogic (see bbasic.bb.hbs), which is
  // always bank 1 itself, unlike a subroutine or event body's  code
  // (which getCurrentBank() resolves per wherever THAT unit itself ends up),
  // so the caller's bank here is always simply 1, not something that varies.
  Blockly.BBasic.generateDistanceChecks = function() {
    const checks = this.distanceChecks;
    if (!checks || !checks.size) return '';
    registerDistanceAbsDiffSubroutine(Blockly);
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(DISTANCE_ABS_DIFF_NAME));
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
  // looked up by this block's  id in bbasic.js's distancePointChecks
  // pre-scan (each instance gets its  hidden variable; see that pre-scan's
  // comment for why these can't share one the way two-object distance
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
  // shared DISTANCE_ABS_DIFF_NAME subroutine's  other input - see this
  // file's  top comment - so POINT's value has to sit somewhere that
  // survives the coord0 assignment right after it) rather than reading
  // pointCode back more than once, the same reasoning random_between_set's
  // whitening formula captures "rand" into a temp once instead of
  // inlining it three times (see generators/bbasic/random.js). Safe here
  // for the same reason it is there: this runs as plain sequential
  // statements with no drawscreen in between.
  Blockly.BBasic.generateDistancePointChecks = function() {
    const checks = this.distancePointChecks;
    if (!checks || !checks.size) return '';
    registerDistanceAbsDiffSubroutine(Blockly);
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(DISTANCE_ABS_DIFF_NAME));
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
  // bbasic.js's  init() - see that function's  comment for why it
  // has to be registered that early) once per frame - spliced into
  // commongamelogic (see bbasic.bb.hbs), which is always bank 1, same
  // reasoning as generateDistanceChecks'  gosub for why the bank suffix
  // still has to be computed via getSubroutineBank rather than assumed
  // empty: "keypadpoll" is an ordinary subroutine now (see
  // registerKeypadPollSubroutine's  comment on why a hand-rolled
  // fixed-position splice couldn't work here), so it can, in principle,
  // end up relocated to another bank like any other.
  Blockly.BBasic.generateKeypadPollCall = function() {
    if (!this.keypad0Used && !this.keypad1Used) return '';
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank('keypadpoll'));
    return ` gosub keypadpoll${suffix}`;
  };

  // SWACNT (SWCHA's  direction register) has to be set to output for
  // whichever port(s) are scanned before the very first poll runs - a
  // one-time Setup-section line (see bbasic.bb.hbs's
  // generatedKeypadSetup splice, right alongside generatedTextMinikernelDefaults),
  // not something commongamelogic needs to redo every frame.
  Blockly.BBasic.generateKeypadSetup = function() {
    if (!this.keypad0Used && !this.keypad1Used) return '';
    return ` SWACNT = ${keypadSwacntMask(this.keypad0Used, this.keypad1Used)}`;
  };
};

