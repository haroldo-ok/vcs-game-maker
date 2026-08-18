'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {effectiveBackgroundRows, backgroundFadeTimerVarName, backgroundFadePaceVarName,
  backgroundFadeTargetVarName, backgroundFadeFlagsVarName, FADE_STEPS,
  backgroundFadeFinishedBit, backgroundFadeActiveBit, backgroundFadeWatchKey} from '../../blocks/background';

// FADE_STEPS (4) is fixed rather than user-choosable - see its own comment
// in blocks/background.js. floor(14 / 4) = 3, rounded down to the nearest
// even number and floored at 2 (see the old per-instance version of this
// same computation for the general formula) - always comes out to 2, the
// finest brightness step this hardware can do, so it's just a literal here
// rather than restating the general formula for a single fixed input.
const FADE_INCREMENT = 2;

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

  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  // Fires background_fade_to's trigger once - stores the target color and
  // this fade's own pace (this fade's total requested duration, divided
  // across FADE_STEPS installments - "over roughly this many frames" is
  // the OVERALL fade time, not a per-step delay), then sets the "active"
  // bit (generateBackgroundFadeChecks below reads that bit every frame
  // from then on and does the actual stepping; see backgroundFadeTimerVarName's
  // own comment in blocks/background.js for why this is a one-shot
  // trigger rather than a "call every frame yourself" block). Retriggering
  // an already-active fade (e.g. the user's own code calls this again
  // before the previous one finished) simply overwrites the target/pace
  // and re-primes the timer - the new fade just continues from wherever
  // the color currently is, same as a fresh trigger would.
  Blockly.BBasic[`background_fade_to`] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    const timerVar = resolveVar(backgroundFadeTimerVarName(rawVar));
    const paceVar = resolveVar(backgroundFadePaceVarName(rawVar));
    const targetVar = resolveVar(backgroundFadeTargetVarName(rawVar));
    const activeBit = `${resolveVar(backgroundFadeFlagsVarName())}{${backgroundFadeActiveBit(rawVar)}}`;
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
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

  // Spliced into commongamelogic (see bbasic.bb.hbs), right after the
  // Sound FX fade checks and before the Music tab's own per-frame checks -
  // same reasoning as generateSoundFadeChecks in generators/bbasic/
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
  Blockly.BBasic.generateBackgroundFadeChecks = function() {
    const fadeVarsUsed = this.backgroundFadeVarsUsed || new Set();
    if (!fadeVarsUsed.size) return '';
    const watches = this.backgroundFadeFinishedWatches || new Set();

    const checksForVar = (rawVar) => {
      const targetShadowVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' : 'backgroundrealcolor';
      const colorVarName = Blockly.BBasic.nameDB_.getName(targetShadowVar, Blockly.VARIABLE_CATEGORY_NAME);
      const timerVar = resolveVar(backgroundFadeTimerVarName(rawVar));
      const paceVar = resolveVar(backgroundFadePaceVarName(rawVar));
      const targetVar = resolveVar(backgroundFadeTargetVarName(rawVar));
      const activeBit = `${resolveVar(backgroundFadeFlagsVarName())}{${backgroundFadeActiveBit(rawVar)}}`;

      const tag = rawVar === 'COLUPF' ? 'pf' : 'bg';
      const skipLabel = `_bgfadechk_${tag}_skip`;
      const upLabel = `_bgfadechk_${tag}_up`;
      const downClampedLabel = `_bgfadechk_${tag}_downclamped`;
      const upClampedLabel = `_bgfadechk_${tag}_upclamped`;
      // Shared by both directions (see the "reprime" block's own comment
      // below for why the two used to be separate, byte-for-byte identical
      // copies of the same 3 lines, and no longer are).
      const reprimeLabel = `_bgfadechk_${tag}_reprime`;
      const alreadyLabel = `_bgfadechk_${tag}_already`;
      const doneLabel = `_bgfadechk_${tag}_done`;
      const decrementLabel = `_bgfadechk_${tag}_decrement`;

      // Only emitted for a direction (up/brightening or down/dimming) a
      // background_fade_finished block actually watches on this register
      // (see resolveBackgroundFadeFinishedWatches) - a project with no
      // such watch never pays for the extra bit-set at all. Spliced in
      // only where a step just landed EXACTLY on the target while moving
      // that direction (see below) - not the separate "already there"
      // branch, matching background_fade_finished's own tooltip: a fade
      // that starts already at its target never fires this, since there's
      // no real completion event to report, and no direction was ever
      // actually taken.
      const finishedLinesFor = (direction) => watches.has(backgroundFadeWatchKey(rawVar, direction)) ?
        [` ${resolveVar(backgroundFadeFlagsVarName())}{${backgroundFadeFinishedBit(rawVar, direction)}} = 1`] :
        [];

      // Every conditional below is a plain "if X then goto label" (or a
      // full if/then/else) - NEVER a bare "if X then Y = Z" with no else -
      // this whole function is itself spliced unconditionally into
      // commongamelogic, so the "bare conditional assignment breaks once
      // nested inside another if" bug the old inline version hit can't
      // recur here, but the goto/label form is kept anyway for consistency
      // with the rest of this generator's own established, proven-safe
      // shape.
      //
      // Labels here are BARE (no "@" prefix) and start at column 0 with NO
      // leading whitespace; every other line below keeps exactly one
      // leading space - matching generateSoundFadeChecks in generators/
      // bbasic/soundfx.js and generateMusicChecks in this folder's music.js
      // line for line, since all three are in the same boat: this
      // function's own output is spliced directly into bbasic.bb.hbs's
      // commongamelogic rather than going through the normal per-block
      // generator pipeline, so nothing downstream reformats it the way
      // Blockly.BBasic.normalizeIndents() does for every ordinary block's
      // own output (see its own comment in generators/bbasic.js) - whatever
      // whitespace is written here is exactly what the compiler sees.
      // Deviating from that proven shape - first by using "@ label" here at
      // all (a real, separate compile error: "unrecognized character @"),
      // then by flattening every line, labels and statements alike, to
      // column 0 - was directly implicated in a real "Unknown keyword:
      // !flagByte{bit}" compile error from an earlier version of this;
      // restored to mirror the two proven-working functions exactly rather
      // than guess further at which part of the deviation actually mattered.
      //
      // The up and down branches below don't reconverge onto one shared
      // "apply" point the way an earlier version of this did - each ends
      // its own step, clamp, color-write, and finished/reprime check
      // separately, so each can fire its OWN direction's finished bit
      // rather than needing some extra piece of state to remember which
      // direction was actually taken by the time a shared point is reached.
      return [
        ` if !${activeBit} then goto ${skipLabel}`,
        ` if (${colorVarName} & $0E) = (${targetVar} & $0E) then goto ${alreadyLabel}`,
        ` if ${timerVar} <> 0 then goto ${decrementLabel}`,
        ` if (${colorVarName} & $0E) < (${targetVar} & $0E) then goto ${upLabel}`,
        // Currently brighter than the target - step DOWN (fading out). A
        // plain "current - increment" can underflow an 8-bit byte
        // (wrapping to a huge value instead of going negative) if the
        // current brightness is smaller than the increment itself -
        // guarded with its own if/else so the subtraction only ever runs
        // once confirmed safe; otherwise this step lands on 0 directly, no
        // wraparound possible.
        ` if (${colorVarName} & $0E) < ${FADE_INCREMENT} then temp2 = 0 else ` +
          `temp2 = (${colorVarName} & $0E) - ${FADE_INCREMENT}`,
        // "if X then goto Y" only SKIPS the very next line when X is true -
        // it doesn't "run" label Y's own action. So this reads as: while
        // still above the target (temp2 >= target, not yet overshot), jump
        // OVER the clamp line, leaving the gradual step as computed; only
        // once a step has dropped AT OR BELOW the target (an actual
        // overshoot) does execution fall through into the clamp.
        ` if temp2 >= (${targetVar} & $0E) then goto ${downClampedLabel}`,
        ` temp2 = (${targetVar} & $0E)`,
        `${downClampedLabel}`,
        // A step size that doesn't evenly divide the remaining distance
        // can overshoot past the target on its last jump - already clamped
        // back to the target's own exact brightness above (rather than
        // left overshot), both because that's the visually correct
        // "arrived" value, and because an overshot temp2 could otherwise
        // exceed 14 (or wrap below 0) and bleed into the hue nibble once
        // merged here.
        ` if temp2 <> (${targetVar} & $0E) then goto ${reprimeLabel}`,
        // Landed exactly on the target this step - this fade is done, so
        // THIS is the one moment hue switches over to the target's own
        // (see this function's own comment above for why).
        ` ${colorVarName} = (${targetVar} & $F0) | temp2`,
        ` ${activeBit} = 0`,
        ...finishedLinesFor('down'),
        ` goto ${doneLabel}`,
        `${upLabel}`,
        // Currently dimmer than the target - step UP (fading in). No
        // underflow/overflow risk here: brightness tops out at 14 and
        // increment at 14, so the sum can never exceed 28, well inside an
        // 8-bit byte.
        ` temp2 = (${colorVarName} & $0E) + ${FADE_INCREMENT}`,
        // Mirror of the DOWN branch's own comment above, opposite
        // direction: while still below the target (temp2 <= target, not
        // yet overshot), skip the clamp; only an actual overshoot (stepped
        // AT OR PAST the target) falls through into it.
        ` if temp2 <= (${targetVar} & $0E) then goto ${upClampedLabel}`,
        ` temp2 = (${targetVar} & $0E)`,
        `${upClampedLabel}`,
        ` if temp2 <> (${targetVar} & $0E) then goto ${reprimeLabel}`,
        ` ${colorVarName} = (${targetVar} & $F0) | temp2`,
        ` ${activeBit} = 0`,
        ...finishedLinesFor('up'),
        ` goto ${doneLabel}`,
        // Still approaching (either direction - both branches above jump
        // here the same way once they're not yet done) - keep the CURRENT
        // hue (not the target's), only the brightness nibble actually
        // changes this step. One shared copy instead of one per direction:
        // the two used to be separate, byte-for-byte identical blocks (down
        // and up only ever diverge in their own clamp/landed logic above,
        // never in what "still approaching" does), so this is pure
        // duplication removed, not a behavior change.
        `${reprimeLabel}`,
        ` ${colorVarName} = (${colorVarName} & $F0) | temp2`,
        ` ${timerVar} = ${paceVar}`,
        ` goto ${doneLabel}`,
        `${decrementLabel}`,
        ` ${timerVar} = ${timerVar} - 1`,
        ` goto ${doneLabel}`,
        // Reached when this fade's brightness already matched the target
        // the moment it was (re)checked - nothing left to ramp, so (same
        // reasoning as the two "landed exactly on target" branches above)
        // hue switches to the target's own right away. No "finished" event
        // fires here (see finishedLinesFor's own comment) - there's no
        // real completion to report for a fade that never had to move.
        `${alreadyLabel}`,
        ` ${colorVarName} = (${targetVar} & $F0) | (${colorVarName} & $0E)`,
        ` ${activeBit} = 0`,
        `${doneLabel}`,
        `${skipLabel}`,
      ];
    };

    return [...fadeVarsUsed].map(checksForVar).flat().join('\n');
  };

  Blockly.BBasic[`background_fade_finished`] = function(block) {
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const rawVar = block.getFieldValue('VAR');
    const direction = block.getFieldValue('DIRECTION');
    const watches = Blockly.BBasic.backgroundFadeFinishedWatches || new Set();
    // No matching fade block was ever found to have set this watch's own
    // flag in the first place (see resolveBackgroundFadeFinishedWatches -
    // this can only happen if the watch itself vanished between the
    // pre-scan and here, which shouldn't occur in practice, but matches
    // this codebase's own "silently no-op on a dangling reference" -
    // resolveMusicEventFlags is the shipped instance of the exact same
    // handling).
    if (!watches.has(backgroundFadeWatchKey(rawVar, direction))) return '';
    const flagBit = `${resolveVar(backgroundFadeFlagsVarName())}{${backgroundFadeFinishedBit(rawVar, direction)}}`;
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

  // Plain boolean read of the active bit - unlike background_fade_finished
  // above, this doesn't check watches.has(...) first: hasBackgroundFadeActiveChecks
  // (see blocks/background.js) already guarantees the shared flags byte is
  // reserved whenever any background_fade_active block exists, regardless
  // of whether that register has a matching background_fade_to block, so
  // the bit is always safe to read here even if it will only ever hold 0.
  Blockly.BBasic[`background_fade_active`] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    const activeBit = `${resolveVar(backgroundFadeFlagsVarName())}{${backgroundFadeActiveBit(rawVar)}}`;
    return [activeBit, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_get_pixel`] = function(block) {
    // Block for getting a playfield pixel
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    const code = `pfread(${argumentX}, ${argumentY})`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_change_pixel`] = function(block) {
    // Block for setting a playfield pixel
    const operation = block.getFieldValue('OPERATION');
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    return `pfpixel ${argumentX} ${argumentY} ${operation}\n`;
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

    return `temp1 = ${argumentLineLength} + ${direction == 'pfhline' ? argumentX : argumentY} - 1\n` +
      `${direction} ${argumentX} ${argumentY} temp1 ${operation}\n`;
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

