'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {effectiveBackgroundRows, backgroundFadeTimerVarName, backgroundFadePaceVarName,
  backgroundFadeTargetVarName, fadeFlagsVarName, FADE_STEPS,
  backgroundFadeFinishedBit, fadeActiveBit, backgroundFadeWatchKey,
  backgroundGetPixelXVarName, backgroundGetPixelYVarName} from '../../blocks/background';
import {pfRowDivisorFor} from '../../utils/playfield-coords';

// FADE_STEPS (4) is fixed rather than user-choosable - see its own comment
// in blocks/background.js. floor(14 / 4) = 3, rounded down to the nearest
// even number and floored at 2 (see the old per-instance version of this
// same computation for the general formula) - always comes out to 2, the
// finest brightness step this hardware can do, so it's just a literal here
// rather than restating the general formula for a single fixed input.
const FADE_INCREMENT = 2;

// Walks up from a block through plain parent connections (not just statement
// nesting - background_get_pixel can sit inside an "if" condition socket, a
// value input) looking for an enclosing function_define. Module-scope (not
// inside the default export closure below) so generators/bbasic.js's own
// early pre-scan can use it too, ahead of reserveDevVar handing out letters.
const isInsideFunctionDefine = (block) => {
  let ancestor = block.getParent();
  while (ancestor) {
    if (ancestor.type === 'function_define') return true;
    ancestor = ancestor.getParent();
  }
  return false;
};

// Whether a background_get_pixel block's own X or Y argument is a bare,
// always-space-free value once generated - an unplugged socket falls back
// to the literal '0', and a bare math_number/variables_get block's own
// generated code is always a single token - everything else (arithmetic,
// another getter block, etc.) is conservatively treated as possibly
// producing a whitespace-containing expression, matching this block's own
// generator's real isSimple check (background_get_pixel below) without
// running actual codegen this early (see reserveDevVar's own "known before
// any generator runs" pre-scan timing constraint) - erring toward "still
// reserve it" for anything this can't positively classify as simple, never
// the other way around.
const argumentIsSimple = (block, inputName) => {
  const target = block.getInputTargetBlock(inputName);
  return !target || target.type === 'math_number' || target.type === 'variables_get';
};

// Whether background_get_pixel's own X/Y scratch dev vars
// (backgroundGetPixelXVarName/YVarName) are genuinely needed for this
// specific block instance - both the "inside a function" nesting AND at
// least one non-simple argument have to hold, matching exactly what the
// generator itself falls back to these vars for (see its own useDevVars/
// isSimple checks) rather than the coarser "inside a function at all" check
// generators/bbasic.js's own pre-scan used to make do with.
export const backgroundGetPixelDevVarsNeeded = (block) =>
  isInsideFunctionDefine(block) && (!argumentIsSimple(block, 'X') || !argumentIsSimple(block, 'Y'));

// Per-register label tag for generateBackgroundFadeChecks below - has to be
// distinct per register (unlike a shared "bg" for everything) now that
// scorecolor/TextColor share this same check-generating function alongside
// COLUBK/COLUPF, or two registers' own labels would collide into the exact
// same names and only the first would ever compile correctly.
const FADE_LABEL_TAG_BY_VAR = {COLUBK: 'bg', COLUPF: 'pf', scorecolor: 'score', TextColor: 'text'};

export default (Blockly) => {
  // A compile-time constant, not runtime state - the playfield's vertical
  // resolution is a single fixed ROM-wide setting (see effectiveBackgroundRows'
  // own comment in blocks/background.js: pfres itself when Superchip RAM is
  // on, else the standard kernel's fixed 11-row default), so this can just
  // splice in the literal number directly rather than needing a hidden
  // per-frame variable the way the Distance blocks do.
  Blockly.BBasic[`background_get_resolution`] = function(block) {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const rows = effectiveBackgroundRows(config);
    return [`${rows}`, Blockly.BBasic.ORDER_ATOMIC];
  };


  // Playfield-pixel <-> sprite coordinate conversions, from real batari
  // Basic's own documented formulas, cross-checked directly against a real
  // working example program (a Superchip pfres=32 project using "z =
  // (player0y - 14) / 3" to track its player's playfield row):
  // - The playfield only uses its 32 CENTER pixels of the 40 across the
  //   160-color-clock-wide screen (4 blank on each side), each 4 color
  //   clocks wide - so X always scales by a flat 4, regardless of
  //   pfres/Superchip (confirmed by the reference documentation directly;
  //   the example program doesn't touch X at all).
  // - X also has a fixed offset to the first usable playfield pixel's own
  //   leftmost color clock: 17 for a single-wide sprite, 16 for a
  //   double/quad-wide one (their own left edges start 1 color clock
  //   earlier at 2x/4x pixel width) - see the WIDTH dropdown.
  // - Y scales by pfRowDivisorFor(config) - 8 for the standard (non-
  //   Superchip) kernel's own implicit pfres=12 (96/12, matching the docs'
  //   own "8 scanlines tall" and player0y's documented 1-88 range: 11
  //   VISIBLE rows * 8 = 88), and round(96/pfres) once Superchip's own pfres
  //   is active - round(96/32) = 3 for the pfres=32 Superchip example above,
  //   an exact match for that program's own divisor. See pfRowDivisorFor's
  //   own comment in utils/playfield-coords.js for why this can't just
  //   divide by effectiveBackgroundRows(config) directly (that's the
  //   VISIBLE row count, 11 by default - one less than the kernel's own
  //   true pfres=12 - only Superchip's own pfres has no such gap). The +1
  //   offset (player Y is measured from a sprite's own BOTTOM row, whose
  //   first usable value is 1, not 0) is independent of pfres and applies
  //   either way - the example's own "14" isn't that offset, just its own
  //   unrelated arbitrary starting position for that demo.
  // Y's divisor is a real per-project value, not always a power of 2, so
  // (unlike X's fixed /4, always a shift) it needs usesDivMul/div_mul.asm -
  // set unconditionally on both blocks for simplicity, same as
  // emitColorFadeTrigger above does even for its own power-of-2 case.
  const spriteXOffset = (width) => (width === 'SINGLE' ? 17 : 16);

  Blockly.BBasic[`background_pixel_to_sprite`] = function(block) {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'Y') {
      const y = Blockly.BBasic.valueToCode(block, 'COORD', Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
      const configurationStorage = useConfigurationStorage();
      const config = (configurationStorage && configurationStorage.value) || {};
      Blockly.BBasic.usesDivMul = true;
      return [`${pfRowDivisorFor(config)} * ${y} + 1`, Blockly.BBasic.ORDER_ADDITION];
    }
    const x = Blockly.BBasic.valueToCode(block, 'COORD', Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
    const xOffset = spriteXOffset(block.getFieldValue('WIDTH'));
    return [`4 * ${x} + ${xOffset}`, Blockly.BBasic.ORDER_ADDITION];
  };

  Blockly.BBasic[`background_sprite_to_pixel`] = function(block) {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'Y') {
      const y = Blockly.BBasic.valueToCode(block, 'COORD', Blockly.BBasic.ORDER_SUBTRACTION) || '0';
      const configurationStorage = useConfigurationStorage();
      const config = (configurationStorage && configurationStorage.value) || {};
      Blockly.BBasic.usesDivMul = true;
      return [`(${y} - 1) / ${pfRowDivisorFor(config)}`, Blockly.BBasic.ORDER_DIVISION];
    }
    const x = Blockly.BBasic.valueToCode(block, 'COORD', Blockly.BBasic.ORDER_SUBTRACTION) || '0';
    const xOffset = spriteXOffset(block.getFieldValue('WIDTH'));
    return [`(${x} - ${xOffset}) / 4`, Blockly.BBasic.ORDER_DIVISION];
  };

  Blockly.BBasic[`background_select`] = function(block) {
    const code = block.getFieldValue('VAR') || 0;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_set`] = function(block) {
    // Score setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return 'newbackground = ' + argument0 + '\n';
  };

  Blockly.BBasic[`background_set_select`] = function(block) {
    // Score setter.
    const argument0 = block.getFieldValue('VAR') || 0;
    return 'newbackground = ' + argument0 + '\n';
  };

  Blockly.BBasic[`background_set_color`] = function(block) {
    // Background/playfield color setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const rawVar = block.getFieldValue('VAR');
    // COLUPF and COLUBK are both overwritten every frame by the score/text
    // drawing routines (the standard kernel's score digits, the playfield
    // score bars if enabled, and the Text Minikernel's own "sta COLUBK"),
    // so both are tracked and restored each frame from a shadow variable,
    // just like COLUP0/COLUP1 are.
    const targetVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
      rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
    const varName = Blockly.BBasic.nameDB_.getName(
        targetVar, Blockly.VARIABLE_CATEGORY_NAME);
    return varName + ' = ' + argument0 + '\n';
  };

  Blockly.BBasic[`background_get_color`] = function(block) {
    // Same COLUPF/COLUBK -> playfieldrealcolor/backgroundrealcolor mapping
    // as background_set_color's own setter above - reads the live shadow
    // variable both blocks share, not the hardware register directly
    // (which the score/text drawing routines overwrite every frame - see
    // that setter's own comment).
    const rawVar = block.getFieldValue('VAR');
    const targetVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
      rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
    const varName = Blockly.BBasic.nameDB_.getName(
        targetVar, Blockly.VARIABLE_CATEGORY_NAME);
    return [varName, Blockly.BBasic.ORDER_ATOMIC];
  };

  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  // Fires a fade trigger once - stores the target color and this fade's own
  // pace (this fade's total requested duration, divided across FADE_STEPS
  // installments - "over roughly this many frames" is the OVERALL fade
  // time, not a per-step delay), then sets the "active" bit
  // (generateBackgroundFadeChecks below reads that bit every frame from
  // then on and does the actual stepping; see backgroundFadeTimerVarName's
  // own comment in blocks/background.js for why this is a one-shot trigger
  // rather than a "call every frame yourself" block). Retriggering an
  // already-active fade (e.g. the user's own code calls this again before
  // the previous one finished) simply overwrites the target/pace and
  // re-primes the timer - the new fade just continues from wherever the
  // color currently is, same as a fresh trigger would.
  //
  // Shared by background_fade_to below and score.js's own score_fade_to /
  // text-minikernel.js's own text_minikernel_fade_to - the trigger body is
  // identical regardless of which register it targets, only rawVar (and so
  // which dev vars/bit it resolves to) differs.
  Blockly.BBasic.emitColorFadeTrigger = function(rawVar, color, frames) {
    const timerVar = resolveVar(backgroundFadeTimerVarName(rawVar));
    const paceVar = resolveVar(backgroundFadePaceVarName(rawVar));
    const targetVar = resolveVar(backgroundFadeTargetVarName(rawVar));
    const activeBit = `${resolveVar(fadeFlagsVarName())}{${fadeActiveBit(rawVar)}}`;
    // frames/FADE_STEPS is still a genuine runtime division (frames isn't
    // known at compile time) - needs the shared div8 routine UNLESS the
    // divisor is a compile-time constant power of 2, in which case the
    // real compiler optimizes it into a plain shift instead (see
    // generateDivMul's own comment in generators/bbasic.js) - which is
    // exactly why FADE_STEPS is fixed at 4 rather than a user choice (see
    // its own comment in blocks/background.js): a shift never needs
    // div_mul.asm's own same-bank "jsr", so this division stays safe no
    // matter which bank this trigger's own code ends up in, unlike a
    // non-power-of-2 divisor would if this block ever landed in a
    // relocated event.
    Blockly.BBasic.usesDivMul = true;

    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const paceReadyLabel = `_bgfade_${blockNumber}_paceready`;

    // Guards frames < FADE_STEPS the same way the old inline version did:
    // the division alone would floor to 0, which would otherwise underflow
    // the very next decrement (in the per-frame check) into a huge wrapped
    // byte instead of counting down from 0 the way a signed timer would.
    return [
      `${targetVar} = ${color}`,
      `${paceVar} = (${frames}) / ${FADE_STEPS}`,
      `if ${paceVar} <> 0 then goto ${paceReadyLabel}`,
      ` ${paceVar} = 1`,
      `@ ${paceReadyLabel}`,
      `${timerVar} = ${paceVar}`,
      `${activeBit} = 1`,
    ].join('\n') + '\n';
  };

  Blockly.BBasic[`background_fade_to`] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    return Blockly.BBasic.emitColorFadeTrigger(rawVar, color, frames);
  };

  // Spliced into commongamelogic (see bbasic.bb.hbs), right after the
  // Sound FX fade checks and before the Music tab's own per-frame checks -
  // same reasoning as generateEnvelopeChecks in generators/bbasic/
  // soundfx.js: this runs unconditionally every single frame regardless of
  // where the user's own background_fade_to trigger sits in their code, so
  // a fade keeps advancing even after a triggering "if" condition (e.g.
  // "if joystick fire") goes false again on the very next frame.
  //
  // One check per register actually used by ANY background_fade_to block
  // in the project (backgroundFadeVarsUsed, resolved once up front in
  // generators/bbasic.js - see that file's own comment) - a project that
  // only ever fades COLUBK never pays for a COLUPF check at all.
  //
  // temp1/temp2 are the compiler's own shared scratch registers, safe to
  // hold a value in across several statements here for the same reason as
  // score.js's own buildDigitPokeLines comment: only ever clobbered by
  // drawscreen, which can't run in the middle of this function's own
  // generated lines.
  //
  // Hue stays on whatever it already was for the ENTIRE ramp, only
  // snapping to the target's hue on the exact step that lands brightness
  // on the target (or immediately, if brightness already matched the
  // target from the start - nothing to ramp at all). This was a deliberate
  // choice, not an oversight: the other order (snap hue to the target
  // immediately, ramp brightness afterward) was tried first and confirmed
  // to look worse in practice - many hues on this hardware render as
  // washed-out/grey at anything below full brightness, so ramping the
  // TARGET hue through low-to-mid brightness looked like the fade was
  // "turning greyscale" for most of its own duration before finally
  // becoming the right color at the end. Ramping the STARTING hue instead
  // means the color shown throughout is always a real, saturated color
  // (just not yet the target one) until the final step swaps it in.
  //
  // Direction (up or down) is decided FRESH on every step by comparing the
  // color's own CURRENT brightness against the target's, so one active
  // fade naturally reverses if retriggered toward a new target on the
  // other side of the current brightness - no separate "fade up"/"fade
  // down" state to keep in sync with reality.
  // Hand-written 6502 replacement for the bB if/goto chain checksForVar
  // below used to build for every fadeable register - COLUBK/COLUPF
  // (background/playfield) AND scorecolor/TextColor (score/text) all route
  // through this now. Not a mechanical translation: every
  // "(x & $0E)" the bB version recomputes from memory on each of its many
  // uses is instead loaded/masked ONCE into the accumulator and kept there
  // (or cached into temp2/temp3) across the branches that need it, and
  // 6502's own carry flag from CMP directly answers ">="/"<" without a
  // separate bB-style comparison-then-branch pair for each - real cycle
  // savings, not just fewer bB statements. temp2/temp3 are safe scratch
  // here for the same reason the bB version already relies on temp2 being
  // safe (see this whole function's own top comment): this runs directly in
  // commongamelogic, never inside a user Function body, so there's no
  // argument-passing collision risk (see function_param_get's own comment
  // in generators/bbasic/function.js for where THAT risk actually applies).
  //
  // Register discipline other branches below can rely on (confirmed
  // directly against 6502 semantics, not a guess): CMP/BCC/BCS/BEQ/BNE never
  // modify the accumulator, so falling through a branch that wasn't taken
  // leaves A holding whatever the immediately preceding CMP compared -
  // exploited below to skip a handful of redundant reloads.
  //
  // Every label is a plain global DASM symbol (no leading dot, matching
  // this file's own existing "_bgfadechk_<tag>_*" convention) - safe here
  // specifically BECAUSE this whole check is spliced into commongamelogic,
  // which is fixed, always-bank-1 content, never relocated the way
  // generators/bbasic/music.js's own relocatable musicEngine unit can be
  // (see that file's own comment on the real, confirmed "DASM Origin
  // Reverse-indexed" build failure a raw asm block hit ONLY once relocated
  // to a non-bank-1 position - this check's own fixed position sidesteps
  // that class of bug entirely, not just avoids repeating the mistake).
  const buildFadeCheckAsm = ({colorVar, targetVar, timerVar, paceVar, flagsVar, activeBit, finishedBit, tag, isWatched}) => {
    const activeMask = 1 << activeBit;
    const finishedMask = isWatched ? (1 << finishedBit) : 0;
    const done = `_bgfadeasm_${tag}_done`;
    const skip = `_bgfadeasm_${tag}_skip`;
    const checkDir = `_bgfadeasm_${tag}_checkdir`;
    const up = `_bgfadeasm_${tag}_up`;
    const upAfter = `_bgfadeasm_${tag}_upafter`;
    const downSub = `_bgfadeasm_${tag}_downsub`;
    const downClamp = `_bgfadeasm_${tag}_downclamp`;
    const downAfter = `_bgfadeasm_${tag}_downafter`;
    const reprime = `_bgfadeasm_${tag}_reprime`;
    const already = `_bgfadeasm_${tag}_already`;
    // 6502 relative branches (BEQ/BNE/BCC/BCS/...) only reach +/-127 bytes -
    // this whole state machine is bigger than that, so a plain "beq skip"/
    // "beq already" etc. can land "Branch out of range" once assembled,
    // confirmed directly as a real build failure (both bg and pf's own
    // "beq skip" - the one spanning the ENTIRE block - measured 147 bytes,
    // 20 over the limit). JMP has no such range limit, so any branch whose
    // target ISN'T a handful of instructions away goes through here instead:
    // the ordinary short-range branch on the INVERTED condition jumps past a
    // single "jmp target" when NOT taken, so the net effect is identical to
    // a plain branch, just 1-2 cycles costlier on each path - a small,
    // fixed price for not having to hand-verify every branch's own distance
    // stays under 128 bytes as this function's own body inevitably grows or
    // shrinks with future changes.
    let farBranchCounter = 0;
    const farBeq = (target) => {
      const near = `_bgfadeasm_${tag}_n${farBranchCounter++}`;
      return [`       bne ${near}`, `       jmp ${target}`, near];
    };
    const farBne = (target) => {
      const near = `_bgfadeasm_${tag}_n${farBranchCounter++}`;
      return [`       beq ${near}`, `       jmp ${target}`, near];
    };
    const farBcc = (target) => {
      const near = `_bgfadeasm_${tag}_n${farBranchCounter++}`;
      return [`       bcs ${near}`, `       jmp ${target}`, near];
    };

    // "Landed exactly on target" is reached from both the up and down
    // branches, and does the exact same thing either way (see the bB
    // version's own comment on why hue switches to the TARGET's here,
    // unlike reprime, which keeps the CURRENT hue) - one shared copy of it,
    // not duplicated per direction.
    const landedLines = [
      '       lda ' + targetVar,
      '       and #$F0',
      '       ora temp2',
      '       sta ' + colorVar,
      '       lda ' + flagsVar,
      '       and #' + (255 - activeMask),
      '       sta ' + flagsVar,
      ...(isWatched ? [
        '       lda ' + flagsVar,
        '       ora #' + finishedMask,
        '       sta ' + flagsVar,
      ] : []),
      '       jmp ' + done,
    ];

    return [
      ' asm',
      ...(isWatched ? [
        '       lda ' + flagsVar,
        '       and #' + (255 - finishedMask),
        '       sta ' + flagsVar,
      ] : []),
      '       lda ' + flagsVar,
      '       and #' + activeMask,
      ...farBeq(skip),
      '       lda ' + targetVar,
      '       and #$0E',
      '       sta temp3',
      '       lda ' + colorVar,
      '       and #$0E',
      '       sta temp2',
      '       cmp temp3',
      ...farBeq(already),
      '       lda ' + timerVar,
      '       beq ' + checkDir,
      '       dec ' + timerVar,
      '       jmp ' + done,
      checkDir,
      '       lda temp2',
      '       cmp temp3',
      ...farBcc(up),
      // DOWN - A already holds temp2 (current brightness) here, straight
      // from the "cmp temp3" just above (CMP never touches A) - see this
      // function's own "Register discipline" comment.
      '       cmp #' + FADE_INCREMENT,
      '       bcs ' + downSub,
      '       lda #0',
      '       jmp ' + downClamp,
      downSub,
      '       sec',
      '       sbc #' + FADE_INCREMENT,
      downClamp,
      '       cmp temp3',
      '       bcs ' + downAfter,
      '       lda temp3',
      downAfter,
      '       sta temp2',
      '       cmp temp3',
      ...farBne(reprime),
      ...landedLines,
      up,
      // A already holds temp2 (current brightness) here too, straight from
      // the "cmp temp3"/"bcc up" branch above.
      '       clc',
      '       adc #' + FADE_INCREMENT,
      '       cmp temp3',
      '       beq ' + upAfter,
      '       bcc ' + upAfter,
      '       lda temp3',
      upAfter,
      '       sta temp2',
      '       cmp temp3',
      ...farBne(reprime),
      ...landedLines,
      reprime,
      // Keeps the CURRENT hue (colorVar's own high nibble), only the
      // brightness nibble changes this step - see the bB version's own
      // comment on why this differs from the "landed" case above.
      '       lda ' + colorVar,
      '       and #$F0',
      '       ora temp2',
      '       sta ' + colorVar,
      '       lda ' + paceVar,
      '       sta ' + timerVar,
      '       jmp ' + done,
      already,
      '       lda ' + targetVar,
      '       and #$F0',
      '       ora temp2',
      '       sta ' + colorVar,
      '       lda ' + flagsVar,
      '       and #' + (255 - activeMask),
      '       sta ' + flagsVar,
      done,
      skip,
      'end',
    ].join('\n');
  };

  Blockly.BBasic.generateBackgroundFadeChecks = function() {
    const fadeVarsUsed = this.backgroundFadeVarsUsed || new Set();
    if (!fadeVarsUsed.size) return '';
    const watches = this.backgroundFadeFinishedWatches || new Set();

    const checksForVar = (rawVar) => {
      // COLUBK/COLUPF need a separate shadow variable (see background_set_
      // color's own comment above) since the score/text drawing routines
      // overwrite the real register every frame - scorecolor/TextColor have
      // no such override, so the real variable doubles as its own shadow.
      const isShadowedRegister = rawVar === 'COLUPF' || rawVar === 'COLUBK';
      const targetShadowVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
        rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
      // scorecolor/TextColor are real batari Basic identifiers already
      // (score.js's own score_color_get/set and text-minikernel.js's own
      // TextColor blocks both reference them as plain literals, never
      // through nameDB_) - only COLUBK/COLUPF's own shadow vars are
      // app-internal dev vars that actually need letter resolution.
      const colorVarName = isShadowedRegister ?
        Blockly.BBasic.nameDB_.getName(targetShadowVar, Blockly.VARIABLE_CATEGORY_NAME) : targetShadowVar;
      const timerVar = resolveVar(backgroundFadeTimerVarName(rawVar));
      const paceVar = resolveVar(backgroundFadePaceVarName(rawVar));
      const targetVar = resolveVar(backgroundFadeTargetVarName(rawVar));
      const tag = FADE_LABEL_TAG_BY_VAR[rawVar] || rawVar;

      // Every register (background/playfield AND score/text) routes through
      // a hand-written asm version instead (see buildFadeCheckAsm's own
      // comment) - real cycle savings over the bB if/goto chain this used to
      // be. buildFadeCheckAsm itself doesn't care whether colorVarName came
      // from a resolved dev var (COLUBK/COLUPF's own shadow vars) or a bare
      // literal identifier (scorecolor/TextColor) - either way it's already
      // just a plain string by the time it gets here.
      return buildFadeCheckAsm({
        colorVar: colorVarName,
        targetVar,
        timerVar,
        paceVar,
        flagsVar: resolveVar(fadeFlagsVarName()),
        activeBit: fadeActiveBit(rawVar),
        finishedBit: backgroundFadeFinishedBit(rawVar),
        tag,
        isWatched: watches.has(backgroundFadeWatchKey(rawVar)),
      });
    };

    return [...fadeVarsUsed].map(checksForVar).flat().join('\n');
  };

  // Shared by background_fade_finished below and score.js's own
  // score_fade_finished / text-minikernel.js's own
  // text_minikernel_fade_finished - the check-and-clear body is identical
  // regardless of which register it targets, only rawVar (and so which dev
  // vars/bit it resolves to) differs. Mirrors emitColorFadeTrigger's own
  // "shared trigger body, per-register rawVar" split above.
  Blockly.BBasic.emitFadeFinishedWatch = function(block, rawVar) {
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const watches = Blockly.BBasic.backgroundFadeFinishedWatches || new Set();
    // No matching fade block was ever found to have set this watch's own
    // flag in the first place (see resolveBackgroundFadeFinishedWatches -
    // this can only happen if the watch itself vanished between the
    // pre-scan and here, which shouldn't occur in practice, but matches
    // this codebase's own "silently no-op on a dangling reference" -
    // resolveMusicEventFlags is the shipped instance of the exact same
    // handling).
    if (!watches.has(backgroundFadeWatchKey(rawVar))) return '';
    const flagBit = `${resolveVar(fadeFlagsVarName())}{${backgroundFadeFinishedBit(rawVar)}}`;
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_bgfadefin_${blockNumber}_end`;
    return '\n' +
    [
      `if !${flagBit} then goto ${labelEnd}`,
      `${flagBit} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };

  Blockly.BBasic[`background_fade_finished`] = function(block) {
    return Blockly.BBasic.emitFadeFinishedWatch(block, block.getFieldValue('VAR'));
  };

  // Plain boolean read of the active bit - unlike background_fade_finished
  // above, this doesn't check watches.has(...) first: hasBackgroundFadeActiveChecks
  // (see blocks/background.js) already guarantees the shared flags byte is
  // reserved whenever any background_fade_active block exists, regardless
  // of whether that register has a matching background_fade_to block, so
  // the bit is always safe to read here even if it will only ever hold 0.
  Blockly.BBasic[`background_fade_active`] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    const activeBit = `${resolveVar(fadeFlagsVarName())}{${fadeActiveBit(rawVar)}}`;
    return [activeBit, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_get_pixel`] = function(block) {
    // Block for getting a playfield pixel
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    // pfread()'s own arguments can't contain an operator - bB's parser
    // expects a bare variable or literal there, not an expression.
    // Confirmed directly: plugging a Math block (e.g. "xCycle - 1") into X
    // or Y generated "pfread(xCycle - 1, ...)" and failed to compile with
    // "Unknown keyword: -". A non-trivial expression is computed into a
    // scratch var first instead, on its own line ahead of wherever this
    // value actually gets used. There's no way for a plain value-block
    // generator to inject setup statements before the line that consumes
    // its return value, so those lines are encoded as a newline-joined
    // preamble in front of the real "pfread(...)" expression here - this
    // block's own tooltip already documents it as if-only, and controls_if
    // (see its own comment) is what actually splits this back out and
    // hoists the preamble onto its own line(s) before the "if". A bare
    // identifier or number literal never contains whitespace in this
    // codebase's own generated code, so testing for it is a safe, cheap
    // way to tell a simple value apart from a compound expression without
    // needing to parse it.
    //
    // temp1/temp2 (bB's own free scratch registers, obliterated by the
    // kernel and reused this way throughout this codebase) are the
    // ordinary, zero-cost choice here - EXCEPT when this block sits inside
    // a function_define's own body, where temp1-temp6 are ALSO bB's fixed
    // argument-passing convention (see generators/bbasic/function.js's own
    // comment): overwriting temp1/temp2 there could silently clobber that
    // function's own live parameter(s) out from under it. Confirmed
    // directly as a real bug (a project's own custom function calling this
    // went from "won't compile" to "resets the console the moment it
    // runs" from exactly that). Only THAT case falls back to
    // backgroundGetPixelXVarName/backgroundGetPixelYVarName's own
    // dedicated dev vars instead - reserved (see reserveMusicDevVars's own
    // sibling in bbasic.js) only for a project that actually has this
    // block nested inside a function at all, so the common case (used
    // directly in a plain "if", not inside a function) costs nothing extra.
    const useDevVars = isInsideFunctionDefine(block);
    const isSimple = (code) => !/\s/.test(code);
    const preamble = [];
    let readX = argumentX;
    let readY = argumentY;
    if (!isSimple(argumentX)) {
      readX = useDevVars ? resolveVar(backgroundGetPixelXVarName()) : 'temp1';
      preamble.push(`${readX} = ${argumentX}`);
    }
    if (!isSimple(argumentY)) {
      readY = useDevVars ? resolveVar(backgroundGetPixelYVarName()) : 'temp2';
      preamble.push(`${readY} = ${argumentY}`);
    }

    const code = `pfread(${readX}, ${readY})`;
    return [preamble.length ? `${preamble.join('\n')}\n${code}` : code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_change_pixel`] = function(block) {
    // Block for setting a playfield pixel
    const operation = block.getFieldValue('OPERATION');
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    // "pfpixel X Y OPERATION" is a whitespace-separated positional macro,
    // not a real function call - a multi-token argument (e.g. a Random
    // block's own "(rand / 8) + 1", which has spaces in it) gets split into
    // several garbage tokens instead of read as one expression, confirmed
    // directly as a real build failure ("Syntax Error ''" from a
    // malformed "LDA #(" with nothing after it). Assigning to temp1/temp2
    // first and passing THOSE (always a single plain token) sidesteps the
    // whitespace-splitting entirely, regardless of how complex the
    // plugged-in X/Y expression is.
    return `temp1 = ${argumentX}\n` +
      `temp2 = ${argumentY}\n` +
      `pfpixel temp1 temp2 ${operation}\n`;
  };

  Blockly.BBasic[`background_change_hv_line`] = function(block) {
    // Block for drawing an horizontal/vertical line
    const direction = block.getFieldValue('DIRECTION');
    const operation = block.getFieldValue('OPERATION');
    const argumentLineLength = Blockly.BBasic.valueToCode(block, 'LENGTH',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '2';
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    // Same "pfhline/pfvline X Y LENGTH OPERATION" whitespace-splitting risk
    // as background_change_pixel above, for both X and Y (temp2/temp3 -
    // temp1 is already used for the length calculation just below, so X/Y
    // need their own separate scratch vars rather than reusing it).
    return `temp2 = ${argumentX}\n` +
      `temp3 = ${argumentY}\n` +
      `temp1 = ${argumentLineLength} + ${direction == 'pfhline' ? 'temp2' : 'temp3'} - 1\n` +
      `${direction} temp2 temp3 temp1 ${operation}\n`;
  };

  Blockly.BBasic[`background_clear`] = function(block) {
    // Block for clearing every playfield pixel
    return `pfclear\n`;
  };

  Blockly.BBasic[`background_scroll`] = function(block) {
    // Block for scrolling the background on a certain direction
    const direction = block.getFieldValue('DIRECTION');

    return `pfscroll ${direction}\n`;
  };

  Blockly.BBasic[`draw_screen`] = function(block) {
    // Draw screen.
    return 'COLUP1 = player1color\n' +
      'COLUP0 = player0color\n' +
      'drawscreen\n';
  };
};

