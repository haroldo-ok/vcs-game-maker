'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {OFFSET_ARM_FUNCTION, buildOffsetArmCall, ensureArmProgram} from './offset-arm';
import {fireObjectName} from '../../utils/fire-object';
import {effectiveBackgroundRows, backgroundDataRows, backgroundFadeTimerVarName, backgroundFadePaceVarName,
  backgroundFadeTargetVarName, fadeFlagsVarName, FADE_STEPS, rowFadeStartColor, multicolorFadeVarName,
  backgroundFadeFinishedBit, fadeActiveBit, backgroundFadeWatchKey,
  backgroundGetPixelXVarName, backgroundGetPixelYVarName,
  collisionPixelColumnVarName, collisionPixelRowVarName, areaClearLeftVarName,
  backgroundScrollRowVarName, backgroundScrollRowMaxVarName, backgroundScrollSubRowVarName,
  backgroundScrollEdgeFlagsVarName, BACKGROUND_SCROLL_EDGE_BITS, backgroundScrollStartVarName,
  backgroundTransitionVarName, backgroundTransitionCountVarName, backgroundScrollActiveVarName, backgroundColorBgVarName,
  BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME, backgroundColorOffsetVarName, dpcPlusPfresOf} from '../../blocks/background';
import {pfRowDivisorFor as exactRowDivisorFor, playerPfXOffset, missileBallPfXOffset} from '../../utils/playfield-coords';

// batari Basic can only multiply and divide by whole numbers, and with DPC+ a row is not always a whole number of
// y steps (28 rows of 6.857 lines), so those blocks use the nearest whole number of steps.
const pfRowDivisorFor = (config) => Math.max(1, Math.round(exactRowDivisorFor(config)));
import {ctrlpfShadowVarName, spriteScrollFlagsVarName, spriteScrollActiveBit,
  missileBounceStageVarName,
  DIRECTION16_STEPS, backgroundRainbowActiveBit, backgroundRainbowOffsetVarName,
  backgroundColorTableLoVarName, backgroundColorTableHiVarName,
  romNoiseFlagsVarName} from './sprites';

// FADE_STEPS (4) is fixed rather than user-choosable - see its  comment
// in blocks/background.js. floor(14 / 4) = 3, rounded down to the nearest
// even number and floored at 2 (see the old per-instance version of this
// same computation for the general formula) - always comes out to 2, the
// finest brightness step this hardware can do, so it's just a literal here
// rather than restating the general formula for a single fixed input.
const FADE_INCREMENT = 2;

// Walks up from a block through plain parent connections (not just statement
// nesting - background_get_pixel can sit inside an "if" condition socket, a
// value input) looking for an enclosing function_define. Module-scope (not
// inside the default export closure below) so generators/bbasic.js's
// early pre-scan can use it too, ahead of reserveDevVar handing out letters.
// Shared with generators/bbasic/collision.js's grid-snap revert (see
// its comment) - module-scope and exported so both files agree on the
// exact same sprite<->playfield-pixel X offset rather than each guessing
// their.
export const spriteXOffset = (width) => (width === 'SINGLE' ? 17 : 16);

// DPC+: how many times a Background scroll block has to run for one step of the picture: the playfield rows are cut `fine` lines thick (see
// generateBackgrounds) and a block moves two lines a time (four for the "2x" directions), rounded to a power of two.
const DPC_PLUS_SCROLL_LINES = {up: 1, down: 1, upup: 2, downdown: 2};
export const dpcPlusScrollDivider = (direction, fine) =>
  Math.max(1, 2 ** Math.round(Math.log2(Math.max(1, fine / ((DPC_PLUS_SCROLL_LINES[direction] || 1) * 2)))));

const isInsideFunctionDefine = (block) => {
  let ancestor = block.getParent();
  while (ancestor) {
    if (ancestor.type === 'function_define') return true;
    ancestor = ancestor.getParent();
  }
  return false;
};

// Whether a background_get_pixel block's  X or Y argument is a bare,
// always-space-free value once generated - an unplugged socket falls back
// to the literal '0', and a bare math_number/variables_get block's
// generated code is always a single token - everything else (arithmetic,
// another getter block, etc.) is conservatively treated as possibly
// producing a whitespace-containing expression, matching this block's
// generator's real isSimple check (background_get_pixel below) without
// running actual codegen this early (see reserveDevVar's "known before
// any generator runs" pre-scan timing constraint) - erring toward "still
// reserve it" for anything this can't positively classify as simple, never
// the other way around.
const argumentIsSimple = (block, inputName) => {
  const target = block.getInputTargetBlock(inputName);
  return !target || target.type === 'math_number' || target.type === 'variables_get';
};

// Whether background_get_pixel's  X/Y scratch dev vars
// (backgroundGetPixelXVarName/YVarName) are genuinely needed for this
// specific block instance - both the "inside a function" nesting AND at
// least one non-simple argument have to hold, matching exactly what the
// generator itself falls back to these vars for (see its  useDevVars/
// isSimple checks) rather than the coarser "inside a function at all" check
// generators/bbasic.js's  pre-scan used to make do with.
export const backgroundGetPixelDevVarsNeeded = (block) =>
  isInsideFunctionDefine(block) && (!argumentIsSimple(block, 'X') || !argumentIsSimple(block, 'Y'));

// Per-register label tag for generateBackgroundFadeChecks below - has to be
// distinct per register (unlike a shared "bg" for everything) now that
// scorecolor/TextColor share this same check-generating function alongside
// COLUBK/COLUPF, or two registers'  labels would collide into the exact
// same names and only the first would ever compile correctly.
const FADE_LABEL_TAG_BY_VAR = {
  COLUBK: 'bg', COLUPF: 'pf', scorecolor: 'score', TextColor: 'text',
  player0realcolor: 'p0', player1realcolor: 'p1',
};

// Shared by every "Background [Set/Clear/Flip] line from X/Y to X/Y" block
// (background_draw_line) - a runtime implementation of Bresenham's line
// algorithm, needed because (unlike background_change_hv_line's
// straight horizontal/vertical runs, which are always axis-aligned and so
// can compile straight to a single pfhline/pfvline macro call) an arbitrary
// line's  endpoints can be variables, not fixed numbers known at compile
// time - there's no way to know in advance how many pixels it needs, or
// which ones, without actually running the algorithm.
//
// One subroutine PER OPERATION ACTUALLY USED (Set/Clear/Flip - see
// BACKGROUND_LINE_SUBROUTINE_NAMES below), not one shared routine with a
// runtime dispatch - a project using only "Set" line blocks (the common
// case) gets exactly one copy, no dispatch branching, and no separate
// "which operation" variable to track at all; only a project that mixes
// Set/Clear/Flip line blocks pays for more than one copy of this routine.
// Still only ONE copy PER operation regardless of how many line blocks use
// it (see registerKeypadPollSubroutine's  identical "one shared copy,
// called via gosub" reasoning in generators/bbasic/input.js).
//
// The "err" term is tracked with a fixed +128 bias throughout (comparing
// against 128 instead of 0) rather than as a true signed value - this
// codebase's "dim"'d variables are plain unsigned bytes, and while
// ADD/SUBTRACT wrap correctly for negative values via ordinary two's-
// complement arithmetic, an UNSIGNED ">"/"<" comparison on a wrapped
// negative value reads it as a huge positive number instead, which would
// send the algorithm the wrong way at exactly the values where a plain sign
// check matters most. Biasing keeps every comparison safely within 0-255
// with no wraparound, as long as neither operand's  true magnitude ever
// approaches ~127 - true for every coordinate range this app's
// playfield editor (32 pixels wide, well under 127 tall even with Superchip
// RAM's  largest pfres) can ever produce.
//
// 7 dedicated dev vars: the current point (x1,y1), target point (x2,y2),
// distances (dx,dy), and the error accumulator - down from an earlier design
// that also had a loop counter and a runtime operation selector (9 vars).
// The loop counter turned out to be redundant: since x1 (low branch) or y1
// (high branch) already walks toward the target by exactly 1 every
// iteration, checking "have I just plotted the target point?" right after
// each plot is an equally valid stop condition, using state this routine
// already has to track anyway - see the "goto"-based loop below instead of
// the earlier "for/next" one. The operation selector is gone because the
// operation is now baked into which subroutine gets called (see above)
// instead of being read at runtime.
//
// An even earlier version tried to save vars a different way - keeping
// x1/y1/x2/y2/dx/dy in the shared temp1-temp6 scratch registers instead
// (the same ones background_change_pixel/background_change_hv_line use) -
// that was wrong, and a real reported bug (a couple of pixels drawn, then
// nothing, instead of a continuous line): pfpixel's implementation
// (public/bb19/includes/pf_drawing.asm's  setuppointers) uses temp1 AND
// temp2 as ITS internal scratch while computing the byte/row address -
// "stx temp2" / "sta temp1" - clobbering whatever this routine had stored
// there the instant the FIRST pfpixel call happened. background_change_pixel
// gets away with temp1/temp2 only because it uses them for one single,
// immediate call and never reads them again - safe for a one-shot hand-off,
// not for state that has to survive across a whole loop of repeated pfpixel
// calls. temp1/temp2 are still used here, but only as that same kind of
// momentary hand-off, immediately before each individual plot - x1/y1
// themselves live in their  dedicated vars.
export const BACKGROUND_LINE_SUBROUTINE_NAMES = {
  on: '_bgDrawLineOn', off: '_bgDrawLineOff', flip: '_bgDrawLineFlip',
};
// operations: a Set/array of which of 'on'/'off'/'flip' to actually build a
// subroutine for (see backgroundLineOperationsUsed's  pre-scan in
// generators/bbasic.js) - an operation nothing ever uses gets no subroutine
// at all, not even an unused/dead one.
export const registerBackgroundLineSubroutine = (Blockly, names, operations) => {
  const {x1, y1, x2, y2, dx, dy, err} = names;
  // Every label DEFINITION needs an "@ " prefix (goto/gosub REFERENCES to it
  // stay bare) - Blockly.BBasic.normalizeIndents (run on every generated
  // subroutine body, and on the whole program's  top-level code too -
  // see finish()'s  call) blindly indents every line, which breaks a
  // plain label's  required column-0 placement; "@ " is stripped back
  // out afterward, restoring it. Same convention controls_if's "@
  // ${bodyLabel}" already uses for its  goto targets (see logic.js) -
  // this isn't specific to raw "asm...end" blocks the way it might look
  // from titlescreen.js's  comments, it's universal to every label
  // Blockly.BBasic ever generates. Confirmed as a real, reproduced build
  // failure without it ("Unknown keyword: _lineDrawLow" - the indented
  // label was read as an attempted statement/command instead).
  operations.forEach((operation) => {
    // Every internal label is tagged with the operation (e.g. "_lineDrawLowOn"
    // vs "_lineDrawLowOff") - these are real, global assembly labels once
    // compiled, not scoped to this one subroutine, so a project using more
    // than one operation (e.g. both "Set" and "Clear" line blocks) would
    // otherwise get a duplicate-label build error the moment a second one of
    // these subroutines was registered with the exact same internal label
    // names as the first.
    const tag = operation.charAt(0).toUpperCase() + operation.slice(1);
    const plot = [
      `temp1 = ${x1.read}`,
      `temp2 = ${y1.read}`,
      `pfpixel temp1 temp2 ${operation}`,
    ].join('\n');

    Blockly.BBasic.subroutines[BACKGROUND_LINE_SUBROUTINE_NAMES[operation]] = [
      `if ${x2.read} >= ${x1.read} then ${dx.write} = ${x2.read} - ${x1.read} else ${dx.write} = ${x1.read} - ${x2.read}`,
      `if ${y2.read} >= ${y1.read} then ${dy.write} = ${y2.read} - ${y1.read} else ${dy.write} = ${y1.read} - ${y2.read}`,
      `if ${dx.read} < ${dy.read} then goto _lineDrawHigh${tag}`,
      '',
      `@ _lineDrawLow${tag}`,
      `${err.write} = 128 + ${dy.read} + ${dy.read} - ${dx.read}`,
      `@ _lineLowLoop${tag}`,
      plot,
      `if ${x1.read} = ${x2.read} then return`,
      `if ${err.read} <= 128 then goto _lineSkipYLow${tag}`,
      `if ${y1.read} < ${y2.read} then ${y1.write} = ${y1.read} + 1 else ${y1.write} = ${y1.read} - 1`,
      `${err.write} = ${err.read} - ${dx.read} - ${dx.read}`,
      `@ _lineSkipYLow${tag}`,
      `${err.write} = ${err.read} + ${dy.read} + ${dy.read}`,
      `if ${x1.read} < ${x2.read} then ${x1.write} = ${x1.read} + 1 else ${x1.write} = ${x1.read} - 1`,
      `goto _lineLowLoop${tag}`,
      '',
      `@ _lineDrawHigh${tag}`,
      `${err.write} = 128 + ${dx.read} + ${dx.read} - ${dy.read}`,
      `@ _lineHighLoop${tag}`,
      plot,
      `if ${y1.read} = ${y2.read} then return`,
      `if ${err.read} <= 128 then goto _lineSkipXHigh${tag}`,
      `if ${x1.read} < ${x2.read} then ${x1.write} = ${x1.read} + 1 else ${x1.write} = ${x1.read} - 1`,
      `${err.write} = ${err.read} - ${dy.read} - ${dy.read}`,
      `@ _lineSkipXHigh${tag}`,
      `${err.write} = ${err.read} + ${dx.read} + ${dx.read}`,
      `if ${y1.read} < ${y2.read} then ${y1.write} = ${y1.read} + 1 else ${y1.write} = ${y1.read} - 1`,
      `goto _lineHighLoop${tag}`,
    ].join('\n');
  });
};

// screen_shake's frame countdown lives in the low 7 bits of "shakescreen" itself (see
// generateShakeScreenChecks below): the kernel only looks at bit 7 of that byte, so the
// rest of it is free, and a separate countdown variable is not needed. That limits a shake
// to 127 frames.
export const SHAKE_SCREEN_MAX_FRAMES = 127;

// Unlike every other feature in this file, this ALSO has to reserve the
// literal bareword "shakescreen" itself, not just a private canonical dev
// var - std_kernel.asm reads/gates on that exact symbol directly ("ifconst
// shakescreen"/"bit shakescreen" - see generateShakeScreenChecks'
// comment), and nothing in 2600basic.h ever pre-declares it the way
// player0frame/newbackground/etc. are (confirmed by grepping the bundled
// bB compiler's  includes - this feature is genuinely undocumented,
// bB itself expects the USER's  program to dim it). Emitting "dim
// shakescreen = <letter>" both reserves the real RAM byte the kernel reads
// every frame AND satisfies "ifconst shakescreen" by itself, the same way
// "rand16" (see its  reserveDevVar call site in generators/bbasic.js)
// already relies on a plain, never-colliding literal name passing through
// nameDB_.getName() completely unchanged - no separate "const shakescreen
// = 1" needed (or wanted: that would declare it as a compile-time constant
// instead of a RAM variable, breaking the runtime "bit shakescreen" read).
// DPC+ with a color for each row: a color given by a Playfield set background (or playfield) color block replaces the row colors of the
// background, and has to stay when another background is loaded: a byte says that a color was set (see generateBackgroundColorOverride).
export const BG_COLOR_OVERRIDE_VARS = {COLUBK: 'bgoverridebk', COLUPF: 'bgoverridepf'};
export const reserveBackgroundColorOverrideDevVars = (reserveDevVar, background, playfield) => {
  if (background) reserveDevVar(BG_COLOR_OVERRIDE_VARS.COLUBK, undefined, 'a background color was set by a block, over the row colors');
  if (playfield) reserveDevVar(BG_COLOR_OVERRIDE_VARS.COLUPF, undefined, 'a playfield color was set by a block, over the row colors');
};

// The area of a "Playfield offset" block as the bytes of eight columns it covers, when its left and right edges are plain numbers that start and end
// a byte (0, 8, 16 or 24 and 7, 15, 23 or 31); otherwise null (the edges are worked out when the game runs).
export const offsetByteRange = (block) => {
  const column = (name) => {
    const target = block.getInputTargetBlock(name);
    if (!target || target.type !== 'math_number') return null;
    const value = Math.round(Number(target.getFieldValue('NUM')));
    return Number.isFinite(value) ? Math.max(0, Math.min(31, value)) : null;
  };
  const a = column('X1');
  const b = column('X2');
  if (a === null || b === null) return null;
  const [x1, x2] = a <= b ? [a, b] : [b, a];
  return x1 % 8 === 0 && x2 % 8 === 7 ? {byte1: x1 >> 3, byte2: x2 >> 3} : null;
};

// The bytes the area form of "Playfield offset" uses (see buildAreaOffsetBody): the left and right edge, each as the byte of the row it is in
// and the bit of it, a mask of the columns of the area for each of the four bytes, and the pixel that goes in at the next row.
export const OFFSET_AREA_VARS = {
  b1: 'offsetb1', m1: 'offsetm1', b2: 'offsetb2', m2: 'offsetm2', pixel: 'offsetpixel',
  mask: ['offsetmask0', 'offsetmask1', 'offsetmask2', 'offsetmask3'],
};
// The bytes the Playfield offset block of the coprocessor needs while its blocks run: the left and right column. The bytes the box test uses for
// the position it tries are only used when the end of the frame runs, so they do the job when the project has them. Returns the names (null for the ones to reserve here).
export const offsetArmSharedVars = ({boxTest}) => ({b1: boxTest ? 'pfboxx' : null, b2: boxTest ? 'pfboxy' : null});
export const reserveOffsetAreaDevVars = (reserveDevVar, used, coprocessor = false, shared = {}) => {
  if (coprocessor) {
    if (!shared.b1) reserveDevVar(OFFSET_AREA_VARS.b1, undefined, 'Playfield offset (coprocessor): the left column');
    if (!shared.b2) reserveDevVar(OFFSET_AREA_VARS.b2, undefined, 'Playfield offset (coprocessor): the right column');
    return;
  }
  if (!used) return;
  const {b1, m1, b2, m2, pixel, mask} = OFFSET_AREA_VARS;
  reserveDevVar(b1, undefined, 'Playfield offset area: the left column, then its byte of the row');
  reserveDevVar(m1, undefined, 'Playfield offset area: the bit of the left column in its byte');
  reserveDevVar(b2, undefined, 'Playfield offset area: the right column, then its byte of the row');
  reserveDevVar(m2, undefined, 'Playfield offset area: the bit of the right column in its byte');
  reserveDevVar(pixel, undefined, 'Playfield offset area: the pixel that goes in at the next row');
  mask.forEach((name, i) => reserveDevVar(name, undefined, `Playfield offset area: the columns of the area in byte ${i} of a row`));
};
export const reserveShakeScreenDevVar = (reserveDevVar, used) => {
  if (!used) return;
  reserveDevVar('shakescreen', undefined,
      'literal name the standard kernel checks for/reads every frame to drive screen shake ' +
      '(bit 7), also holding the frames left in the shake (bits 0-6)');
};

// Spliced into commongamelogic (see bbasic.bb.hbs) once, unconditionally -
// unlike every per-object check elsewhere in this codebase (Fire/Bounce/
// Seek), there's only ever one screen, so no per-name loop or label-
// uniquing is needed here.
//
// Drives the standard kernel's  undocumented "shakescreen" hook (see
// std_kernel.asm's "ifconst shakescreen"/"doshakescreen" - confirmed by
// reading that file directly, since this feature was never actually
// documented anywhere in the bB community): every frame, the kernel checks
// bit 7 of the runtime "shakescreen" variable - clear (0-127) inserts one
// extra scanline wait at a fixed point in the frame, shifting that whole
// frame's picture down by one scanline; set (128-255) draws normally. Held
// at a constant value, that's just a static one-line offset, not a
// vibration - screen_shake's  block is a self-contained "for N frames"
// effect (confirmed with the user), so this alternates shakescreen between
// 0 and 128 every other frame (using bit 0 of the countdown itself, READ
// BEFORE decrementing it, as the parity signal, rather than a second dev
// var) for as long as framesVar is still counting down, and settles back
// to 128 (off) the instant it hits zero so the picture doesn't stay
// shifted after the effect ends. Reading the parity before the decrement
// (rather than after) matters at the boundary: a 1-frame shake has to
// actually show one shaken frame, not silently do nothing because its only
// countdown value (1, odd) got consumed by the decrement before ever being
// tested.
export const generateShakeScreenChecks = (Blockly) => {
  if (!Blockly.BBasic.screenShakeUsed) return '';
  const shakeVar = Blockly.BBasic.nameDB_.getName('shakescreen', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  // One byte holds both things: bits 0-6 are the frames left, bit 7 is the kernel's flag
  // (set draws normally, clear shifts the picture down a scanline). Each frame it reads
  // the frames left (f), and with none left sets the byte to 128 (normal). Otherwise it
  // stores f-1 with bit 7 set when f-1 is odd, which is the same as the old "shake on the
  // frames where the countdown was odd, read before the decrement" (a 1-frame shake still
  // shows one shaken frame). Hand-written 6502 in the same format as the other asm
  // splices in commongamelogic: one leading space on "asm", labels in the first column.
  return [
    ' asm',
    '       lda ' + shakeVar,
    '       and #$7F',
    '       beq _shakescreenasm_off',
    '       sec',
    '       sbc #1',
    '       sta temp1',
    '       lsr',
    '       lda temp1',
    '       bcc _shakescreenasm_store',
    '       ora #$80',
    '_shakescreenasm_store',
    '       sta ' + shakeVar,
    '       jmp _shakescreenasm_done',
    '_shakescreenasm_off',
    '       lda #$80',
    '       sta ' + shakeVar,
    '_shakescreenasm_done',
    'end',
  ].join('\n') + '\n';
};

export default (Blockly) => {
  // A compile-time constant, not runtime state - the playfield's vertical
  // resolution is a single fixed ROM-wide setting (see effectiveBackgroundRows'
  // comment in blocks/background.js: pfres itself when Superchip RAM is
  // on, else the standard kernel's fixed 11-row default), so this can just
  // splice in the literal number directly rather than needing a hidden
  // per-frame variable the way the Distance blocks do.
  Blockly.BBasic[`background_get_resolution`] = function(block) {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // The backgrounds do not all have the same number of rows under DPC+ when they set a pfres.
    if (Blockly.BBasic.dpcPlusRowMaxVar) return [`${Blockly.BBasic.dpcPlusRowMaxVar} + 1`, Blockly.BBasic.ORDER_ADDITION];
    const rows = effectiveBackgroundRows(config);
    return [`${rows}`, Blockly.BBasic.ORDER_ATOMIC];
  };


  // Playfield-pixel <-> sprite coordinate conversions, from real batari
  // Basic's  documented formulas, cross-checked directly against a real
  // working example program (a Superchip pfres=32 project using "z =
  // (player0y - 14) / 3" to track its player's playfield row):
  // - The playfield only uses its 32 CENTER pixels of the 40 across the
  //   160-color-clock-wide screen (4 blank on each side), each 4 color
  //   clocks wide - so X always scales by a flat 4, regardless of
  //   pfres/Superchip (confirmed by the reference documentation directly;
  //   the example program doesn't touch X at all).
  // - X also has a fixed offset to the first usable playfield pixel's
  //   leftmost color clock: 17 for a single-wide sprite, 16 for a
  //   double/quad-wide one (their  left edges start 1 color clock
  //   earlier at 2x/4x pixel width) - see the WIDTH dropdown.
  // - Y scales by pfRowDivisorFor(config) - 8 for the standard (non-
  //   Superchip) kernel's  implicit pfres=12 (96/12, matching the docs'
  //   "8 scanlines tall" and player0y's documented 1-88 range: 11
  //   VISIBLE rows * 8 = 88), and floor(96/pfres) once Superchip's  pfres
  //   is active - floor(96/32) = 3 for the pfres=32 Superchip example above,
  //   an exact match for that program's  divisor. See pfRowDivisorFor's
  //   comment in utils/playfield-coords.js for why this can't just
  //   divide by effectiveBackgroundRows(config) directly (that's the
  //   VISIBLE row count, 11 by default - one less than the kernel's
  //   true pfres=12 - only Superchip's  pfres has no such gap). The +1
  //   offset (player Y is measured from a sprite's  BOTTOM row, whose
  //   first usable value is 1, not 0) is independent of pfres and applies
  //   either way - the example's "14" isn't that offset, just its
  //   unrelated arbitrary starting position for that demo.
  // Y's divisor is a real per-project value, not always a power of 2, so
  // (unlike X's fixed /4, always a shift) it needs usesDivMul/div_mul.asm -
  // set unconditionally on both blocks for simplicity, same as
  // emitColorFadeTrigger above does even for its  power-of-2 case.
  // The sprite y of the playfield row in `source`: the first line whose row is that one (ceil(row * 256 / increment), at most 255), halved,
  // and one more.
  const spriteYOfRow = (increment, source, selectLines = []) => {
    const id = Blockly.BBasic.blockNumbers.next('rowsconv');
    const lab = (name) => `_rowsconv_${id}_${name}`;
    // (With groups of columns that have separate rows the increment is in temp1 already, put there by the lines of the group.)
    return [`temp2 = ${source}`, ...selectLines, 'asm',
      'lda temp2', 'sta temp3', increment === null ? 'lda temp1' : typeof increment === 'string' ? `lda ${increment}` : `lda #${increment}`, 'sta temp2', 'sec', 'sbc #1', 'sta temp1', 'lda #0', 'ldx #16',
      `@${lab('l')}`, 'asl temp1', 'rol temp3', 'rol', `bcs ${lab('t')}`, 'cmp temp2', `bcc ${lab('n')}`,
      `@${lab('t')}`, 'sbc temp2', 'inc temp1', `@${lab('n')}`, 'dex', `bne ${lab('l')}`,
      'lda temp3', `beq ${lab('k')}`, 'lda #255', 'sta temp1', `@${lab('k')}`, 'lda temp1',
      'lsr', 'clc', 'adc #1', 'sta temp4', '@end', 'temp4'].join('\n');
  };

  // Under DPC+ with groups of columns that have separate rows (see backgroundGroupPfres), the lines that put the row increment of the group
  // of the block's column input (the first group while it is empty) in the temp variable `into`; null without groups.
  const groupIncrementLines = (block, into) => {
    const vars = Blockly.BBasic.dpcPlusGroupFracVars;
    if (!vars) return null;
    const column = Blockly.BBasic.valueToCode(block, 'COLUMN', Blockly.BBasic.ORDER_DIVISION);
    const other = into === 'temp1' ? 'temp3' : 'temp1';
    return [`${into} = ${vars[0]}`, ...(column ? [`${other} = (${column}) / 8`,
      `if ${other} = 1 then ${into} = ${vars[1]}`, `if ${other} = 2 then ${into} = ${vars[2]}`, `if ${other} > 2 then ${into} = ${vars[3]}`] : [])];
  };

  Blockly.BBasic[`background_pixel_to_sprite`] = function(block) {
    const axis = block.getFieldValue('AXIS');
    if (axis === 'Y') {
      const y = Blockly.BBasic.valueToCode(block, 'COORD', Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
      const configurationStorage = useConfigurationStorage();
      const config = (configurationStorage && configurationStorage.value) || {};
      const groups = groupIncrementLines(block, 'temp1');
      if (groups) return [spriteYOfRow(null, y, groups), Blockly.BBasic.ORDER_ATOMIC];
      const increment = Blockly.BBasic.exactRowIncrement(config, 2);
      if (increment !== null) return [spriteYOfRow(increment, y), Blockly.BBasic.ORDER_ATOMIC];
      Blockly.BBasic.usesDivMul = true;
      return [`${Blockly.BBasic.rowDivisorText(config)} * ${y} + 1`, Blockly.BBasic.ORDER_ADDITION];
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
      const groups = groupIncrementLines(block, 'temp3');
      if (groups) return [[...groups, ...Blockly.BBasic.rowOfLineCode(config, 'temp4', y, 1, 2, 'temp3'), 'temp4'].join('\n'), Blockly.BBasic.ORDER_ATOMIC];
      const increment = Blockly.BBasic.exactRowIncrement(config, 2);
      if (increment !== null) return [[...Blockly.BBasic.rowOfLineCode(config, 'temp4', y, 1, 2), 'temp4'].join('\n'), Blockly.BBasic.ORDER_ATOMIC];
      Blockly.BBasic.usesDivMul = true;
      return [`(${y} - 1) / ${Blockly.BBasic.rowDivisorText(config)}`, Blockly.BBasic.ORDER_DIVISION];
    }
    const x = Blockly.BBasic.valueToCode(block, 'COORD', Blockly.BBasic.ORDER_SUBTRACTION) || '0';
    const xOffset = spriteXOffset(block.getFieldValue('WIDTH'));
    return [`(${x} - ${xOffset}) / 4`, Blockly.BBasic.ORDER_DIVISION];
  };

  // background_collision_pixel's  per-sprite X/Y system vars, plus each
  // one's "is this sprite currently stretched to double/quad width" runtime
  // test - see blocks/background.js's  comment on this block for why
  // width has to be auto-detected rather than asked for. Player 0/Missile 0
  // and Player 1/Missile 1 each share ONE real bB variable
  // (player0size/player1size - confirmed readable, see generators/bbasic/
  // sprites.js's  sprite_player_size generator, which reads it as a
  // source operand) covering both that player's  stretch (bits 0/2, mask
  // $05) and that missile's  width (bits 4-5, mask $30 - see sprites.js's
  // sprite_..._set generator, which writes missile width into THIS same
  // var, never a separate one). Ball width lives in the SAME bit positions
  // ($30) of sprites.js's  CTRLPF RAM shadow instead of the real
  // (unsafe-to-read-back) CTRLPF register - see ctrlpfShadowVarName's
  // comment there. Not a static map - ball's  entry needs nameDB_ to
  // resolve the shadow var's real letter, so this has to be a function.
  const spriteCollisionCoords = (sprite) => {
    const pfConfig = (useConfigurationStorage() || {}).value;
    const missileOffset = missileBallPfXOffset(pfConfig);
    const playerOffset = playerPfXOffset(pfConfig);
    if (sprite === 'ball') {
      const shadowVar = Blockly.BBasic.nameDB_.getName(
          ctrlpfShadowVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      return {x: 'ballx', y: 'bally', stretched: `${shadowVar} & $30 <> 0`, sizeBits: shadowVar, heightVar: 'ballheight',
        pfXOffset: missileOffset};
    }
    // Under DPC+ a player's y is its top scanline and its height counts scanlines, like a missile's, so the
    // collision rows come from both.
    const configurationStorage = useConfigurationStorage();
    const dpcPlus = !!(configurationStorage && configurationStorage.value && configurationStorage.value.kernel === 'dpcplus');
    const byName = {
      player0: {x: 'player0x', y: 'player0y', stretched: 'player0size & $05 = $05', pfXOffset: playerOffset,
        ...(dpcPlus ? {heightVar: 'player0height'} : {})},
      player1: {x: 'player1x', y: 'player1y', stretched: 'player1size & $05 = $05', pfXOffset: playerOffset,
        ...(dpcPlus ? {heightVar: 'player1height'} : {})},
      missile0: {x: 'missile0x', y: 'missile0y', stretched: 'player0size & $30 <> 0', sizeBits: 'player0size',
        heightVar: 'missile0height', pfXOffset: missileOffset},
      missile1: {x: 'missile1x', y: 'missile1y', stretched: 'player1size & $30 <> 0', sizeBits: 'player1size',
        heightVar: 'missile1height', pfXOffset: missileOffset},
    };
    return byName[sprite];
  };

  // The row-counting y of a sprite's top edge. A player's (and every object's
  // on the standard kernel) y is one past its top row; under DPC+ a missile's
  // or the ball's y is its top scanline itself.
  const topYText = (coords, config) =>
    (coords.heightVar && config.kernel === 'dpcplus') ? coords.y : `${coords.y} - 1`;

  // Given a sprite that just registered a hardware Playfield collision,
  // works out which exact playfield column/row it's touching - see this
  // block's  tooltip in blocks/background.js, and the top-of-file safety
  // reasoning in generators/bbasic/collision.js (this exact "software
  // pfread()-based pixel-precise collision" territory has caused real bugs
  // here before: a ROM lockup from an out-of-range playfield index, and a
  // separate hard crash on contact). Every value handed to pfread() below is
  // first clamped into its valid range (0-31 for column, 0-maxRow for row) -
  // bB bytes are unsigned, so a division that would otherwise go negative
  // just wraps to a large positive value instead, which these clamps catch
  // exactly the same way as a genuinely too-large one.
  //
  // A single division doesn't always land exactly on the pixel that was
  // actually touched (see ChipOff's  account, quoted directly to the
  // user, of why it re-checks with pfread and nudges by one column) - this
  // generalizes that to both axes with a small, bounded (at most 4 pfread
  // calls, no loops) escalating check: exact cell, then nudged column alone,
  // then nudged row alone, then - only if neither single-axis nudge found a
  // lit pixel - the diagonal (both nudged) combination, trusted without a
  // further re-check (matching ChipOff's "trust the final nudge, don't
  // re-verify" behavior for its  last fallback step). "Moving right"/
  // "moving down" pick which way each axis nudges - see blocks/background.js's
  // comment on why direction is a plain user-supplied input here, not
  // auto-tracked previous-frame position.
  Blockly.BBasic['background_collision_pixel'] = function(block) {
    const sprite = block.getFieldValue('SPRITE');
    const coords = spriteCollisionCoords(sprite);
    const movingRight = Blockly.BBasic.valueToCode(block, 'MOVING_RIGHT', Blockly.BBasic.ORDER_LOGICAL_AND) || '0';
    const movingDown = Blockly.BBasic.valueToCode(block, 'MOVING_DOWN', Blockly.BBasic.ORDER_LOGICAL_AND) || '0';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // Groups of columns with separate rows: the row comes from the increment of the group the column is in, and the rows past the last
    // of a group are empty, so the last row looked at is the tallest there can be.
    const groupRows = !!Blockly.BBasic.dpcPlusGroupFracVars;
    const maxRow = groupRows ? '191' : Blockly.BBasic.maxRowText(config);
    // Under DPC+ a missile's or the ball's y counts lines, not the two-line steps of a player's.
    const rowDivisor = Blockly.BBasic.rowDivisorText(config, !!coords.heightVar);
    Blockly.BBasic.usesDivMul = true;

    const col = Blockly.BBasic.superchipRwPairs[collisionPixelColumnVarName()];
    const row = Blockly.BBasic.superchipRwPairs[collisionPixelRowVarName()];
    // Scratch for the neighbor checks: temp3/temp4 survive pfread (which only
    // overwrites temp1/temp2), so no variables are needed for them.
    const col2 = {read: 'temp3', write: 'temp3'};
    const row2 = {read: 'temp4', write: 'temp4'};

    const id = Blockly.BBasic.blockNumbers.next('collisionPixel');
    const useCol2Label = `_collision_pixel_${id}_usecol2`;
    const useRow2Label = `_collision_pixel_${id}_userow2`;
    const colRightLabel = `_collision_pixel_${id}_colright`;
    const afterColLabel = `_collision_pixel_${id}_aftercol`;
    const rowDownLabel = `_collision_pixel_${id}_rowdown`;
    const afterRowLabel = `_collision_pixel_${id}_afterrow`;
    const doneLabel = `_collision_pixel_${id}_done`;

    return [
      // Exact column/row, clamped before anything ever reads them.
      `${col.write} = (${coords.x} - ${coords.pfXOffset}) / 4`,
      `if ${coords.stretched} then ${col.write} = (${coords.x} - ${coords.pfXOffset - 1}) / 4`,
      `if ${col.read} > 31 then ${col.write} = 31`,
      ...(groupRows ? Blockly.BBasic.rowOfLineCode(config, row.write, coords.y, 1, coords.heightVar ? 1 : 2, Blockly.BBasic.groupIncrementAsm(col.read)) :
        coords.heightVar ? Blockly.BBasic.rowOfLineCode(config, row.write, topYText(coords, config), rowDivisor) : [`${row.write} = (${topYText(coords, config)}) / ${rowDivisor}`]),
      `if ${row.read} > ${maxRow} then ${row.write} = ${maxRow}`,
      // Exact cell.
      `if pfread(${col.read}, ${row.read}) then goto ${doneLabel}`,
      // Nudged column alone.
      `${col2.write} = ${col.read}`,
      `if ${movingRight} then goto ${colRightLabel}`,
      `if ${col2.read} > 0 then ${col2.write} = ${col2.read} - 1`,
      `goto ${afterColLabel}`,
      `@ ${colRightLabel}`,
      `if ${col2.read} < 31 then ${col2.write} = ${col2.read} + 1`,
      `@ ${afterColLabel}`,
      `if pfread(${col2.read}, ${row.read}) then goto ${useCol2Label}`,
      // Nudged row alone.
      `${row2.write} = ${row.read}`,
      `if ${movingDown} then goto ${rowDownLabel}`,
      `if ${row2.read} > 0 then ${row2.write} = ${row2.read} - 1`,
      `goto ${afterRowLabel}`,
      `@ ${rowDownLabel}`,
      `if ${row2.read} < ${maxRow} then ${row2.write} = ${row2.read} + 1`,
      `@ ${afterRowLabel}`,
      `if pfread(${col.read}, ${row2.read}) then goto ${useRow2Label}`,
      // Neither single-axis nudge found it - diagonal fallback, trusted
      // without a further re-check.
      `${col.write} = ${col2.read}`,
      `${row.write} = ${row2.read}`,
      `goto ${doneLabel}`,
      `@ ${useCol2Label}`,
      `${col.write} = ${col2.read}`,
      `goto ${doneLabel}`,
      `@ ${useRow2Label}`,
      `${row.write} = ${row2.read}`,
      `@ ${doneLabel}`,
    ].join('\n') + '\n';
  };

  // The direction version of the block above. The sprite's direction (0-7 clockwise
  // from Up, or 0-15 when it comes from a Fire block set to 16 directions;
  // anything else for none) says which playfield cells to look at. The work is
  // done by one shared routine per sprite (see buildFindPixelBody) instead of
  // being copied into every block.
  const findPixelSubroutineName = (sprite, is16) => `_findpixel_${sprite}_${is16 ? 16 : 8}`;

  // Looks at the cells the sprite touches and the ones just ahead of it, and
  // keeps the first lit one. A ball or missile can be wider than one pixel and
  // taller than one row unit, so it can touch up to 2 columns and 2 rows: those
  // (up to) 4 cells come first, then the cells straight above or below it (both
  // columns), then the cells beside it in the direction it is moving (both
  // rows), then the diagonal one. So a pixel directly above, directly beside or
  // a little below and to the side of a sprite moving at an angle is found
  // without needing anything else lit around it.
  // Input: temp5 = direction. Result: the collision column/row variables.
  // Scratch: temp3 = horizontal step, then the column beside the sprite; temp4 =
  // the sprite's right column; temp5 = the sprite's bottom row; temp6 = vertical
  // step, then the row above or below (all of temp3-temp6 survive pfread, which
  // only overwrites temp1/temp2).
  const buildFindPixelBody = ({sprite, is16, maxRow, rowDivisor, topY, col, row, groupRows}) => {
    const coords = spriteCollisionCoords(sprite);
    const label = (part) => `_fp_${sprite}_${is16 ? 16 : 8}_${part}`;
    const lab = (part) => `@ ${label(part)}`;
    const widthBits = coords.sizeBits || null;
    const steps = is16 ? DIRECTION16_STEPS : [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    // The direction's horizontal step (0 none, 1 right, 2 left) and vertical step
    // (0 none, 1 down, 2 up) come from two small tables read by index: a chain of
    // compares ran up to 2 per direction (about 30 of them for 16 directions) every
    // time the routine was called. A direction outside the table has no step.
    const stepCode = (step) => (step > 0 ? 1 : step < 0 ? 2 : 0);
    const lines = [
      'asm',
      'lda #0',
      'sta temp3',
      'sta temp6',
      'ldx temp5',
      `cpx #${steps.length}`,
      'bcs ' + label('dirskip'),
      'lda ' + label('xtab') + ',x',
      'sta temp3',
      'lda ' + label('ytab') + ',x',
      'sta temp6',
      'jmp ' + label('dirskip'),
      // (Aligned so that an indexed read of a table does not cross a page: see rowTableLines in pf-box.js.)
      'align 16',
      `@${label('xtab')}`,
      `.byte ${steps.map(([xStep]) => stepCode(xStep)).join(',')}`,
      `@${label('ytab')}`,
      `.byte ${steps.map(([, yStep]) => stepCode(yStep)).join(',')}`,
      `@${label('dirskip')}`,
      '@end',
    ];
    lines.push(
        `${col.write} = (${coords.x} - ${coords.pfXOffset}) / 4`,
        ...(widthBits ? [] : [`if ${coords.stretched} then ${col.write} = (${coords.x} - ${coords.pfXOffset - 1}) / 4`]),
        `if ${col.read} > 31 then ${col.write} = 31`,
        `temp4 = ${col.read}`);
    if (widthBits) {
      // The right-hand column: the sprite is 1, 2, 4 or 8 pixels wide.
      lines.push(
          `temp5 = ${widthBits} & 48`,
          `temp4 = ${coords.x} - ${coords.pfXOffset}`,
          `if temp5 = 16 then temp4 = temp4 + 1`,
          `if temp5 = 32 then temp4 = temp4 + 3`,
          `if temp5 = 48 then temp4 = temp4 + 7`,
          `temp4 = temp4 / 4`,
          `if temp4 > 31 then temp4 = 31`);
    }
    lines.push(
        ...(groupRows ? Blockly.BBasic.rowOfLineCode(useConfigurationStorage().value || {}, row.write, coords.y, 1, coords.heightVar ? 1 : 2,
            Blockly.BBasic.groupIncrementAsm(col.read)) :
          coords.heightVar ? Blockly.BBasic.rowOfLineCode(useConfigurationStorage().value || {}, row.write, topY, rowDivisor) : [`${row.write} = (${topY}) / ${rowDivisor}`]),
        `if ${row.read} > ${maxRow} then ${row.write} = ${maxRow}`,
        // The bottom row: a sprite more than one row unit tall can reach into the next row.
        `temp5 = ${row.read}`,
        ...(coords.heightVar ? [
          // One row unit taller than the height says, for the same reason.
          `if ${coords.heightVar} = 0 then goto ${label('nobottom')}`,
          ...Blockly.BBasic.rowOfLineCode(useConfigurationStorage().value || {}, 'temp5', `${coords.y} + ${coords.heightVar} - 1`, rowDivisor, 1,
              groupRows ? Blockly.BBasic.groupIncrementAsm(col.read) : null),
          lab('nobottom'),
          `if temp5 > ${maxRow} then temp5 = ${maxRow}`,
          `if temp5 < ${row.read} then temp5 = ${row.read}`,
        ] : []),
        // The column beside the sprite, ahead of it.
        `if temp3 = 1 then goto ${label('cright')}`,
        `if temp3 = 2 then goto ${label('cleft')}`,
        `temp3 = ${col.read}`,
        `goto ${label('cdone')}`,
        lab('cright'),
        `temp3 = temp4`,
        `if temp3 < 31 then temp3 = temp3 + 1`,
        `goto ${label('cdone')}`,
        lab('cleft'),
        `temp3 = ${col.read}`,
        `if temp3 > 0 then temp3 = temp3 - 1`,
        lab('cdone'),
        // The row above or below, ahead of it.
        `if temp6 = 1 then goto ${label('rdown')}`,
        `if temp6 = 2 then goto ${label('rup')}`,
        `temp6 = ${row.read}`,
        `goto ${label('rdone')}`,
        lab('rdown'),
        `temp6 = temp5`,
        `if temp6 < ${maxRow} then temp6 = temp6 + 1`,
        `goto ${label('rdone')}`,
        lab('rup'),
        `temp6 = ${row.read}`,
        `if temp6 > 0 then temp6 = temp6 - 1`,
        lab('rdone'),
        // The cells the sprite touches (left/right column, top/bottom row).
        `if pfread(${col.read}, ${row.read}) then goto ${label('done')}`,
        `if pfread(temp4, ${row.read}) then goto ${label('hit_r')}`,
        `if pfread(${col.read}, temp5) then goto ${label('hit_b')}`,
        `if pfread(temp4, temp5) then goto ${label('hit_rb')}`,
        // The cells above or below it.
        `if pfread(${col.read}, temp6) then goto ${label('hit_v')}`,
        `if pfread(temp4, temp6) then goto ${label('hit_rv')}`,
        // The cells beside it.
        `if pfread(temp3, ${row.read}) then goto ${label('hit_e')}`,
        `if pfread(temp3, temp5) then goto ${label('hit_eb')}`,
        // Nothing lit: the diagonal cell ahead.
        `${col.write} = temp3`,
        `${row.write} = temp6`,
        `goto ${label('done')}`,
        lab('hit_r'),
        `${col.write} = temp4`,
        `goto ${label('done')}`,
        lab('hit_b'),
        `${row.write} = temp5`,
        `goto ${label('done')}`,
        lab('hit_rb'),
        `${col.write} = temp4`,
        `${row.write} = temp5`,
        `goto ${label('done')}`,
        lab('hit_v'),
        `${row.write} = temp6`,
        `goto ${label('done')}`,
        lab('hit_rv'),
        `${col.write} = temp4`,
        `${row.write} = temp6`,
        `goto ${label('done')}`,
        lab('hit_e'),
        `${col.write} = temp3`,
        `goto ${label('done')}`,
        lab('hit_eb'),
        `${col.write} = temp3`,
        `${row.write} = temp5`,
        lab('done'));
    return lines.join('\n');
  };

  Blockly.BBasic['background_collision_pixel_direction'] = function(block) {
    const sprite = block.getFieldValue('SPRITE');
    const direction = Blockly.BBasic.valueToCode(block, 'DIRECTION', Blockly.BBasic.ORDER_NONE) || '255';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const maxRow = Blockly.BBasic.dpcPlusGroupFracVars ? '191' : Blockly.BBasic.maxRowText(config);
    // Under DPC+ a missile's or the ball's y counts lines, not the two-line steps of a player's.
    const rowDivisor = Blockly.BBasic.rowDivisorText(config, !!spriteCollisionCoords(sprite).heightVar);
    Blockly.BBasic.usesDivMul = true;

    const col = Blockly.BBasic.superchipRwPairs[collisionPixelColumnVarName()];
    const row = Blockly.BBasic.superchipRwPairs[collisionPixelRowVarName()];
    const id = Blockly.BBasic.blockNumbers.next('collisionPixel');
    const label = (name) => `_collision_pixel_${id}_${name}`;

    // Bounce turns a fired object around the moment it hits, so a Fire angle
    // read after it points away from what was hit. For that case, use the
    // heading from before the bounce while the bounce is still settling.
    const dirBlock = block.getInputTargetBlock('DIRECTION');
    const bounceLines = [];
    // A Fire angle from a Fire block set to 16 directions counts 0-15, not 0-7.
    let is16 = false;
    if (dirBlock && dirBlock.type === 'sprite_fire_angle_get') {
      const field = dirBlock.getFieldValue('MISSILE');
      const fired = fireObjectName(field);
      is16 = (Blockly.BBasic.missileFire16UsedFor || new Set()).has(fired);
      const stage = Blockly.BBasic.superchipRwPairs[missileBounceStageVarName(fired)];
      if (stage) {
        bounceLines.push(
            `temp6 = ${stage.read} & 48`,
            `if temp6 = 0 then goto ${label('nobounce')}`,
            `temp5 = ${stage.read} & 15`,
            `@ ${label('nobounce')}`);
      }
    }

    const name = findPixelSubroutineName(sprite, is16);
    if (!Blockly.BBasic.subroutines[name]) {
      Blockly.BBasic.subroutines[name] = buildFindPixelBody({sprite, is16, maxRow, rowDivisor, topY: topYText(spriteCollisionCoords(sprite), config), col, row,
        groupRows: !!Blockly.BBasic.dpcPlusGroupFracVars});
    }
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name));
    return [
      `temp5 = ${direction}`,
      ...bounceLines,
      `gosub ${name}${suffix}`,
    ].join('\n') + '\n';
  };

  Blockly.BBasic['background_rainbow_colors'] = function(block) {
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const offsetPair = Blockly.BBasic.superchipRwPairs[backgroundRainbowOffsetVarName()];
    const flagsVar = resolveVar(romNoiseFlagsVarName());
    const offset = Blockly.BBasic.valueToCode(block, 'OFFSET', Blockly.BBasic.ORDER_ASSIGNMENT) ||
      'framecounter';
    const simple = !!(Blockly.BBasic.rainbowSimpleOffset || {}).background;
    return (simple ? '' : `${offsetPair.write} = ${offset}\n`) + `${flagsVar}{${backgroundRainbowActiveBit()}} = 1\n`;
  };

  Blockly.BBasic['background_rainbow_colors_stop'] = function(block) {
    const resolve = (name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const pairs = Blockly.BBasic.superchipRwPairs;
    const flagsVar = resolve(romNoiseFlagsVarName());
    // Points the kernel back at the loaded background's row color table. The top
    // row's color comes back by itself on the next frame.
    return `${flagsVar}{${backgroundRainbowActiveBit()}} = 0\n` +
      (Blockly.BBasic.usePlayfieldRowColors() ?
        `pfcolortable = ${pairs[backgroundColorTableLoVarName()].read}\n` +
        `aux2 = ${pairs[backgroundColorTableHiVarName()].read}\n` : '');
  };

  Blockly.BBasic['background_collision_pixel_column'] = function(block) {
    const pair = Blockly.BBasic.superchipRwPairs[collisionPixelColumnVarName()];
    return [pair ? pair.read : '0', Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['background_collision_pixel_row'] = function(block) {
    const pair = Blockly.BBasic.superchipRwPairs[collisionPixelRowVarName()];
    return [pair ? pair.read : '0', Blockly.BBasic.ORDER_ATOMIC];
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
    // score bars if enabled, and the Text Minikernel's "sta COLUBK"),
    // so both are tracked and restored each frame from a shadow variable,
    // just like COLUP0/COLUP1 are.
    const targetVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
      rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
    const varName = Blockly.BBasic.nameDB_.getName(
        targetVar, Blockly.VARIABLE_CATEGORY_NAME);
    // The DPC+ kernel takes the background and playfield colors from color tables, not the color registers, so a
    // fixed color also has to go into its table (a table holds literal values only, a changing one is not possible).
    const dpcPlusConfig = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    const fixedColor = /^\s*(\$[0-9A-Fa-f]{1,2}|\d+)\s*$/.test(argument0);
    if (dpcPlusConfig.kernel === 'dpcplus' && fixedColor) {
      if (rawVar === 'COLUBK' && !dpcPlusConfig.enableDpcPlusBkColors) {
        return `${varName} = ${argument0}\n bkcolors:\n  ${argument0.trim()}\n@end\n`;
      }
      if (rawVar === 'COLUPF' && !Blockly.BBasic.dpcPlusPfColorsOn(dpcPlusConfig)) {
        return `${varName} = ${argument0}\n pfcolors:\n  ${argument0.trim()}\n@end\n`;
      }
      // With a color for each row (the Options tab's per-row background or playfield colors) the kernel reads the table row by row, so the
      // color is put in every row of it.
      const rows = Array(Math.max(1, dpcPlusPfresOf(dpcPlusConfig))).fill(`  ${argument0.trim()}`).join('\n');
      // (The color is kept to put back after the next background is loaded, which sets the rows from the colors of that background: see generateBackgroundColorOverride.)
      const perRow = (rawVar === 'COLUBK' && dpcPlusConfig.enableDpcPlusBkColors) ||
        (rawVar === 'COLUPF' && Blockly.BBasic.dpcPlusPfColorsOn(dpcPlusConfig));
      if (perRow && (rawVar === 'COLUBK' || rawVar === 'COLUPF')) {
        Blockly.BBasic.bgColorOverrides[rawVar].add(argument0.trim());
        const flag = Blockly.BBasic.nameDB_.getName(BG_COLOR_OVERRIDE_VARS[rawVar], Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        return `${varName} = ${argument0}\n${flag} = 1\n ${rawVar === 'COLUBK' ? 'bkcolors' : 'pfcolors'}:\n${rows}\n@end\n`;
      }
    }
    return varName + ' = ' + argument0 + '\n';
  };

  // DPC+ with a color for each row: after a background is loaded (which gives the color table the colors of that background), the color a
  // block set, if one did, goes in every row again. The color is the one the live variable holds, picked from the fixed colors the blocks gave.
  Blockly.BBasic.generateBackgroundColorOverride = function() {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    const sets = Blockly.BBasic.bgColorOverrides || {};
    const rows = Math.max(1, dpcPlusPfresOf(config));
    const parts = [];
    [['COLUBK', 'bkcolors', 'backgroundrealcolor'], ['COLUPF', 'pfcolors', 'playfieldrealcolor']].forEach(([key, table, realVar]) => {
      const colors = [...(sets[key] || [])];
      if (!colors.length) return;
      const flag = Blockly.BBasic.nameDB_.getName(BG_COLOR_OVERRIDE_VARS[key], Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const real = Blockly.BBasic.nameDB_.getName(realVar, Blockly.VARIABLE_CATEGORY_NAME);
      parts.push(` if ${flag} = 0 then goto _bgov_${key}_done`);
      colors.forEach((color, i) => parts.push(` if ${real} = ${color} then goto _bgov_${key}_${i}`));
      parts.push(` goto _bgov_${key}_done`);
      colors.forEach((color, i) => parts.push(`_bgov_${key}_${i}`, ` ${table}:`, ...Array(rows).fill(`  ${color}`), 'end', ` goto _bgov_${key}_done`));
      parts.push(`_bgov_${key}_done`);
    });
    return parts.length ? `${parts.join('\n')}\n` : '';
  };

  Blockly.BBasic[`background_get_color`] = function(block) {
    // Same COLUPF/COLUBK -> playfieldrealcolor/backgroundrealcolor mapping
    // as background_set_color's  setter above - reads the live shadow
    // variable both blocks share, not the hardware register directly
    // (which the score/text drawing routines overwrite every frame - see
    // that setter's  comment).
    const rawVar = block.getFieldValue('VAR');
    const targetVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
      rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
    const varName = Blockly.BBasic.nameDB_.getName(
        targetVar, Blockly.VARIABLE_CATEGORY_NAME);
    return [varName, Blockly.BBasic.ORDER_ATOMIC];
  };

  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  // The real color variable a fade register's rawVar actually writes to -
  // shared by emitColorFadeTrigger and generateBackgroundFadeChecks'
  // checksForVar below, which used to duplicate this same resolution.
  // COLUBK/COLUPF need a separate shadow variable (see background_set_color's
  // comment above) since the score/text drawing routines overwrite the
  // real register every frame - scorecolor/TextColor have no such override,
  // so the real variable doubles as its  shadow. player0realcolor/
  // player1realcolor have no separate shadow alias either (nothing renames
  // them the way COLUBK/COLUPF rename to backgroundrealcolor/
  // playfieldrealcolor), but - unlike scorecolor/TextColor - they're still
  // app-internal dev vars needing nameDB_ resolution (sprite_${name}_get/set
  // already resolve this same VAR through nameDB_/VARIABLE_CATEGORY_NAME -
  // see generators/bbasic/sprites.js), so they're grouped with COLUBK/COLUPF
  // here, not scorecolor/TextColor.
  const resolveFadeColorVar = (rawVar) => {
    const needsNameDbResolution = rawVar === 'COLUPF' || rawVar === 'COLUBK' ||
      rawVar === 'player0realcolor' || rawVar === 'player1realcolor';
    const targetShadowVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
      rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
    // scorecolor/TextColor are real batari Basic identifiers already
    // (score.js's  score_color_get/set and text-minikernel.js's
    // TextColor blocks both reference them as plain literals, never through
    // nameDB_) - only COLUBK/COLUPF's shadow vars and player0realcolor/
    // player1realcolor are app-internal dev vars that actually need letter
    // resolution.
    return needsNameDbResolution ?
      Blockly.BBasic.nameDB_.getName(targetShadowVar, Blockly.VARIABLE_CATEGORY_NAME) : targetShadowVar;
  };

  // Fires a fade trigger once - stores the target color and this fade's
  // pace (this fade's total requested duration, divided across FADE_STEPS
  // installments - "over roughly this many frames" is the OVERALL fade
  // time, not a per-step delay), then sets the "active" bit
  // (generateBackgroundFadeChecks below reads that bit every frame from
  // then on and does the actual stepping; see backgroundFadeTimerVarName's
  // comment in blocks/background.js for why this is a one-shot trigger
  // rather than a "call every frame yourself" block).
  //
  // The actual RESET (timer/pace/active all snapping back to a fresh fade)
  // is skipped only when this exact request is already fully accounted for -
  // either a fade toward this target is actively in progress right now
  // (activeBit), or the real color already sits at the target (nothing left
  // to do) - rather than unconditional, because a "Fade to color" block
  // placed in a per-frame event (title_update, say) calls this every single
  // frame for the SAME target color: unconditionally re-priming the timer
  // every time that happens meant the per-frame step
  // (generateBackgroundFadeChecks, which runs earlier in commongamelogic, so
  // its  progress got immediately overwritten right after) could never
  // actually count down to 0 - a real reported bug ("fade finished never
  // seems to trigger"; the fade itself never finishes, since it's
  // perpetually reset before it can), same class of bug (and same fix) as
  // buildTextScrollSetupLines' "same message, don't re-reset" guard in
  // text-scroll.js.
  //
  // Checking only targetVar (not the real color too, as this now does) was
  // confirmed as a real, separate reported bug: a "Fade to color" placed in
  // a one-shot event (Title screen start) that re-runs every time that
  // screen is re-entered, preceded by its "Set color" block resetting
  // the real color back to its starting value each time - targetVar still
  // held the PREVIOUS visit's already-reached target, so the guard kept
  // treating the fresh request as a no-op repeat and never restarted the
  // fade, even though the real color had genuinely just been reset away
  // from it. Comparing the real color too fixes this without needing to
  // know which kind of event the block was placed in: once a fade truly
  // settles (or was never running), the real color equals the target, so a
  // later request for that SAME target only re-arms when something has
  // since moved the real color away from it again.
  //
  // color is captured into temp1 exactly once, before either comparison,
  // rather than embedded directly into each "if" and the assignment - it
  // can be an arbitrary expression (not necessarily side-effect-free, e.g.
  // a Random block), and evaluating it more than once could disagree with
  // itself between the guard checks and the actual reset (same reasoning
  // random_between_set's "rand" capture uses in generators/bbasic/
  // random.js).
  //
  // Shared by background_fade_to below and score.js's  score_fade_to /
  // text-minikernel.js's  text_minikernel_fade_to - the trigger body is
  // identical regardless of which register it targets, only rawVar (and so
  // which dev vars/bit/color variable it resolves to) differs.
  Blockly.BBasic.emitColorFadeTrigger = function(rawVar, color, frames) {
    const colorVar = resolveFadeColorVar(rawVar);
    const timerVar = resolveVar(backgroundFadeTimerVarName(rawVar));
    const constantPace = (Blockly.BBasic.fadeConstantPace || {})[rawVar];
    const paceVar = constantPace === undefined ? resolveVar(backgroundFadePaceVarName(rawVar)) : null;
    const targetVar = resolveVar(backgroundFadeTargetVarName(rawVar));
    const activeBit = `${resolveVar(fadeFlagsVarName(rawVar))}{${fadeActiveBit(rawVar)}}`;
    // frames/FADE_STEPS is still a genuine runtime division (frames isn't
    // known at compile time) - needs the shared div8 routine UNLESS the
    // divisor is a compile-time constant power of 2, in which case the
    // real compiler optimizes it into a plain shift instead (see
    // generateDivMul's  comment in generators/bbasic.js) - which is
    // exactly why FADE_STEPS is fixed at 4 rather than a user choice (see
    // its  comment in blocks/background.js): a shift never needs
    // div_mul.asm's  same-bank "jsr", so this division stays safe no
    // matter which bank this trigger's  code ends up in, unlike a
    // non-power-of-2 divisor would if this block ever landed in a
    // relocated event.
    if (constantPace === undefined) Blockly.BBasic.usesDivMul = true;

    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const resetLabel = `_bgfade_${blockNumber}_reset`;
    const paceReadyLabel = `_bgfade_${blockNumber}_paceready`;
    const skipLabel = `_bgfade_${blockNumber}_skip`;

    // Guards frames < FADE_STEPS the same way the old inline version did:
    // the division alone would floor to 0, which would otherwise underflow
    // the very next decrement (in the per-frame check) into a huge wrapped
    // byte instead of counting down from 0 the way a signed timer would.
    return [
      `temp1 = ${color}`,
      `if ${targetVar} <> temp1 then goto ${resetLabel}`,
      `if ${activeBit} then goto ${skipLabel}`,
      `if ${colorVar} = temp1 then goto ${skipLabel}`,
      `@ ${resetLabel}`,
      `${targetVar} = temp1`,
      ...(constantPace === undefined ? [
        `${paceVar} = (${frames}) / ${FADE_STEPS}`,
        `if ${paceVar} <> 0 then goto ${paceReadyLabel}`,
        ` ${paceVar} = 1`,
        `@ ${paceReadyLabel}`,
        `${timerVar} = ${paceVar}`,
      ] : [`${timerVar} = ${constantPace}`]),
      `${activeBit} = 1`,
      `@ ${skipLabel}`,
    ].join('\n') + '\n';
  };

  Blockly.BBasic[`background_fade_to`] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    // With per-row colors on for this register, every row fades to the color through tables built ahead of time (see
    // generateRowFadeChecks): the color has to be a constant, from the color picker block.
    const kind = Blockly.BBasic.multicolorFadeKindOf ? Blockly.BBasic.multicolorFadeKindOf(block) : null;
    if (kind) {
      const fade = Blockly.BBasic.multicolorFade[kind];
      const toIndex = fade.to.indexOf(rowFadeStartColor(block));
      const target = block.getInputTargetBlock('VALUE');
      if (!target || target.type !== 'color_get' || toIndex < 0) {
        return 'rem Fading per-row colors needs a color from the color picker block\n';
      }
      const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
      const paceVar = resolveVar(multicolorFadeVarName(kind, 'Pace'));
      const paceReadyLabel = `_mcfade_${Blockly.BBasic.blockNumbers.next()}_paceready`;
      const flags = resolveVar(fadeFlagsVarName(rawVar));
      Blockly.BBasic.usesDivMul = true;
      return [
        `${paceVar} = (${frames}) / ${FADE_STEPS}`,
        `if ${paceVar} <> 0 then goto ${paceReadyLabel}`,
        ` ${paceVar} = 1`,
        `@ ${paceReadyLabel}`,
        `${resolveVar(multicolorFadeVarName(kind, 'Start'))} = ${fade.from.length + toIndex}`,
        `${resolveVar(multicolorFadeVarName(kind, 'Timer'))} = ${paceVar}`,
        `${resolveVar(multicolorFadeVarName(kind, 'Step'))} = 0`,
        `${flags}{${fadeActiveBit(rawVar)}} = 1`,
      ].join('\n') + '\n';
    }
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    return Blockly.BBasic.emitColorFadeTrigger(rawVar, color, frames);
  };

  // Trigger for "Fade playfield (or background) rows from color to row colors" - only
  // starts the fade (the per-frame steps are in generateRowFadeChecks in
  // generators/bbasic.js). Does nothing without per-row colors for those rows.
  Blockly.BBasic[`background_fade_rows_from`] = function(block) {
    const kind = block.getFieldValue('VAR') === 'COLUBK' ? 'bk' : 'pf';
    const startColors = ((Blockly.BBasic.multicolorFade || {})[kind] || {from: []}).from;
    const startIndex = startColors.indexOf(rowFadeStartColor(block));
    if (startIndex < 0) return 'rem Row fade needs per-row colors enabled for those rows (Options tab)\n';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    const paceVar = resolveVar(multicolorFadeVarName(kind, 'Pace'));
    const paceReadyLabel = `_rowfade_${Blockly.BBasic.blockNumbers.next()}_paceready`;
    Blockly.BBasic.usesDivMul = true;
    return [
      `${paceVar} = (${frames}) / ${FADE_STEPS}`,
      `if ${paceVar} <> 0 then goto ${paceReadyLabel}`,
      ` ${paceVar} = 1`,
      `@ ${paceReadyLabel}`,
      `${resolveVar(multicolorFadeVarName(kind, 'Start'))} = ${startIndex}`,
      `${resolveVar(multicolorFadeVarName(kind, 'Timer'))} = ${paceVar}`,
      `${resolveVar(multicolorFadeVarName(kind, 'Step'))} = 0`,
    ].join('\n') + '\n';
  };

  // Spliced into commongamelogic (see bbasic.bb.hbs), right after the
  // Sound FX fade checks and before the Music tab's  per-frame checks -
  // same reasoning as generateEnvelopeChecks in generators/bbasic/
  // soundfx.js: this runs unconditionally every single frame regardless of
  // where the user's  background_fade_to trigger sits in their code, so
  // a fade keeps advancing even after a triggering "if" condition (e.g.
  // "if joystick fire") goes false again on the very next frame.
  //
  // One check per register actually used by ANY background_fade_to block
  // in the project (backgroundFadeVarsUsed, resolved once up front in
  // generators/bbasic.js - see that file's  comment) - a project that
  // only ever fades COLUBK never pays for a COLUPF check at all.
  //
  // temp1/temp2 are the compiler's  shared scratch registers, safe to
  // hold a value in across several statements here for the same reason as
  // score.js's  buildDigitPokeLines comment: only ever clobbered by
  // drawscreen, which can't run in the middle of this function's
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
  // "turning greyscale" for most of its  duration before finally
  // becoming the right color at the end. Ramping the STARTING hue instead
  // means the color shown throughout is always a real, saturated color
  // (just not yet the target one) until the final step swaps it in.
  //
  // Direction (up or down) is decided FRESH on every step by comparing the
  // color's  CURRENT brightness against the target's, so one active
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
  // 6502's  carry flag from CMP directly answers ">="/"<" without a
  // separate bB-style comparison-then-branch pair for each - real cycle
  // savings, not just fewer bB statements. temp2/temp3 are safe scratch
  // here for the same reason the bB version already relies on temp2 being
  // safe (see this whole function's  top comment): this runs directly in
  // commongamelogic, never inside a user Function body, so there's no
  // argument-passing collision risk (see function_param_get's  comment
  // in generators/bbasic/function.js for where THAT risk actually applies).
  //
  // Register discipline other branches below can rely on (confirmed
  // directly against 6502 semantics, not a guess): CMP/BCC/BCS/BEQ/BNE never
  // modify the accumulator, so falling through a branch that wasn't taken
  // leaves A holding whatever the immediately preceding CMP compared -
  // exploited below to skip a handful of redundant reloads.
  //
  // Every label is a plain global DASM symbol (no leading dot, matching
  // this file's  existing "_bgfadechk_<tag>_*" convention) - safe here
  // specifically BECAUSE this whole check is spliced into commongamelogic,
  // which is fixed, always-bank-1 content, never relocated the way
  // generators/bbasic/music.js's  relocatable musicEngine unit can be
  // (see that file's  comment on the real, confirmed "DASM Origin
  // Reverse-indexed" build failure a raw asm block hit ONLY once relocated
  // to a non-bank-1 position - this check's  fixed position sidesteps
  // that class of bug entirely, not just avoids repeating the mistake).
  // Without flagsVar the fade is active for as long as the color is not the target (no flag byte is kept): the title screen
  // graphics' fades use this.
  const buildFadeCheckAsm = ({colorVar, targetVar, timerVar, paceVar, flagsVar, activeBit, finishedBit, tag, isWatched}) => {
    const activeMask = flagsVar ? 1 << activeBit : 0;
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
    // confirmed directly as a real build failure (both bg and pf's
    // "beq skip" - the one spanning the ENTIRE block - measured 147 bytes,
    // 20 over the limit). JMP has no such range limit, so any branch whose
    // target ISN'T a handful of instructions away goes through here instead:
    // the ordinary short-range branch on the INVERTED condition jumps past a
    // single "jmp target" when NOT taken, so the net effect is identical to
    // a plain branch, just 1-2 cycles costlier on each path - a small,
    // fixed price for not having to hand-verify every branch's  distance
    // stays under 128 bytes as this function's  body inevitably grows or
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
    // version's  comment on why hue switches to the TARGET's here,
    // unlike reprime, which keeps the CURRENT hue) - one shared copy of it,
    // not duplicated per direction.
    const landedLines = [
      '       lda ' + targetVar,
      '       and #$F0',
      '       ora temp2',
      '       sta ' + colorVar,
      ...(flagsVar ? [
        '       lda ' + flagsVar,
        '       and #' + (255 - activeMask),
        '       sta ' + flagsVar,
        // "sta" never touches A - still holds the masked value from the line
        // just above, so isWatched's "ora finishedMask" can build on it
        // directly instead of a redundant "lda flagsVar" reload.
        ...(isWatched ? [
          '       ora #' + finishedMask,
          '       sta ' + flagsVar,
        ] : []),
      ] : []),
      '       jmp ' + done,
    ];

    return [
      ' asm',
      // Same "sta never touches A" reuse as landedLines/already below -
      // isWatched's  clear leaves A already holding flagsVar (post-mask),
      // so the activeMask test right after builds on it directly instead of
      // a redundant reload. finishedMask/activeMask are disjoint bits, so
      // "(flags & ~finishedMask) & activeMask" is exactly "flags &
      // activeMask" either way.
      ...(!flagsVar ? [
        '       lda ' + colorVar,
        '       cmp ' + targetVar,
        ...farBeq(skip),
      ] : [
        ...(isWatched ? [
          '       lda ' + flagsVar,
          '       and #' + (255 - finishedMask),
          '       sta ' + flagsVar,
          '       and #' + activeMask,
        ] : [
          '       lda ' + flagsVar,
          '       and #' + activeMask,
        ]),
        ...farBeq(skip),
      ]),
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
      // function's "Register discipline" comment.
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
      // Keeps the CURRENT hue (colorVar's  high nibble), only the
      // brightness nibble changes this step - see the bB version's
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
      ...(flagsVar ? [
        '       lda ' + flagsVar,
        '       and #' + (255 - activeMask),
        '       sta ' + flagsVar,
        // Same "sta never touches A" reuse as landedLines above.
        ...(isWatched ? [
          '       ora #' + finishedMask,
          '       sta ' + flagsVar,
        ] : []),
      ] : []),
      done,
      skip,
      'end',
    ].join('\n');
  };

  Blockly.BBasic.buildFadeCheckAsm = buildFadeCheckAsm;

  Blockly.BBasic.generateBackgroundFadeChecks = function() {
    const fadeVarsUsed = this.backgroundFadeVarsUsed || new Set();
    if (!fadeVarsUsed.size) return '';
    const watches = this.backgroundFadeFinishedWatches || new Set();

    const checksForVar = (rawVar) => {
      const colorVarName = resolveFadeColorVar(rawVar);
      const timerVar = resolveVar(backgroundFadeTimerVarName(rawVar));
      // A fixed pace is loaded as a constant (an immediate operand) rather than read from a variable.
      const constantPace = (this.fadeConstantPace || {})[rawVar];
      const paceVar = constantPace === undefined ? resolveVar(backgroundFadePaceVarName(rawVar)) : `#${constantPace}`;
      const targetVar = resolveVar(backgroundFadeTargetVarName(rawVar));
      const tag = FADE_LABEL_TAG_BY_VAR[rawVar] || rawVar;

      // Every register (background/playfield, score/text, AND player) routes
      // through a hand-written asm version instead (see buildFadeCheckAsm's
      // comment) - real cycle savings over the bB if/goto chain this
      // used to be. buildFadeCheckAsm itself doesn't care whether
      // colorVarName came from a resolved dev var (COLUBK/COLUPF/player0/
      // player1's  shadow vars) or a bare literal identifier (scorecolor/
      // TextColor) - either way it's already just a plain string by the time
      // it gets here.
      const fadeAsm = buildFadeCheckAsm({
        colorVar: colorVarName,
        targetVar,
        timerVar,
        paceVar,
        flagsVar: resolveVar(fadeFlagsVarName(rawVar)),
        activeBit: fadeActiveBit(rawVar),
        finishedBit: backgroundFadeFinishedBit(rawVar),
        tag,
        isWatched: watches.has(backgroundFadeWatchKey(rawVar)),
      });
      // Under DPC+ a player is colored by a table that is loaded again when bit 7 of its size variable is clear, and a
      // missile has a separate color register (COLUM0/COLUM1): when a step of the fade changes the color, the table is
      // chosen again and the missile takes the player's color.
      const missileColor = {player0realcolor: 'COLUM0', player1realcolor: 'COLUM1'}[rawVar];
      const configurationStorage = useConfigurationStorage();
      const config = (configurationStorage && configurationStorage.value) || {};
      if (!missileColor || config.kernel !== 'dpcplus') return fadeAsm;
      const sizeVar = rawVar.replace('realcolor', 'size');
      const same = `_bgfadeasm_${tag}_same`;
      return [` temp1 = ${colorVarName}`, ...[fadeAsm].flat(), ` if temp1 = ${colorVarName} then goto ${same}`,
        ` ${sizeVar}{7} = 0`, ` ${missileColor} = ${colorVarName}`, same];
    };

    return [...fadeVarsUsed].map(checksForVar).flat().join('\n');
  };

  // One-time Setup-section initialization (see bbasic.bb.hbs's
  // generatedBackgroundFadeSetup splice, right alongside
  // generatedCtrlpfShadowSetup/generatedKeypadSetup) - every fade's
  // targetVar (see emitColorFadeTrigger's "if targetVar = requested
  // color then skip the reset" guard) needs to start at a value NO real
  // requested color can ever equal, or that guard's very first real trigger
  // could spuriously match on whatever targetVar happens to already hold.
  // Confirmed as a real, reported bug: zeroed RAM (this codebase's  dev
  // vars have no other default) leaves targetVar starting at plain 0, and 0
  // is itself a perfectly ordinary, plausible requested color (pure black -
  // hue 0, luminance 0) - a project's very first "fade to black" call would
  // see targetVar(0) already "equal" to the requested color(0) and skip the
  // reset entirely, never actually starting the fade. 255 is guaranteed
  // safe: every real color byte a "Color" picker can ever produce is even
  // (the 2600 ignores a color register's  low bit - see
  // utils/palette.js's "byte is (index << 1)" comment), so an odd
  // sentinel can never collide with a genuine request.
  Blockly.BBasic.generateBackgroundFadeSetup = function() {
    const fadeVarsUsed = this.backgroundFadeVarsUsed || new Set();
    if (!fadeVarsUsed.size) return '';
    return [...fadeVarsUsed]
        .map((rawVar) => ` ${resolveVar(backgroundFadeTargetVarName(rawVar))} = 255`)
        .join('\n');
  };

  // Shared by background_fade_finished below and score.js's
  // score_fade_finished / text-minikernel.js's
  // text_minikernel_fade_finished - the check-and-clear body is identical
  // regardless of which register it targets, only rawVar (and so which dev
  // vars/bit it resolves to) differs. Mirrors emitColorFadeTrigger's
  // "shared trigger body, per-register rawVar" split above.
  Blockly.BBasic.emitFadeFinishedWatch = function(block, rawVar) {
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const watches = Blockly.BBasic.backgroundFadeFinishedWatches || new Set();
    // No matching fade block was ever found to have set this watch's
    // flag in the first place (see resolveBackgroundFadeFinishedWatches -
    // this can only happen if the watch itself vanished between the
    // pre-scan and here, which shouldn't occur in practice, but matches
    // this codebase's "silently no-op on a dangling reference" -
    // resolveMusicEventFlags is the shipped instance of the exact same
    // handling).
    if (!watches.has(backgroundFadeWatchKey(rawVar))) return '';
    const flagBit = `${resolveVar(fadeFlagsVarName(rawVar))}{${backgroundFadeFinishedBit(rawVar)}}`;
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
    const activeBit = `${resolveVar(fadeFlagsVarName(rawVar))}{${fadeActiveBit(rawVar)}}`;
    return [activeBit, Blockly.BBasic.ORDER_ATOMIC];
  };

  // "Background area from X Y to X Y is clear": the corners go into temp3-temp6
  // (x1, y1, x2, y2), a shared subroutine scans the rectangle one pixel at a
  // time, and the answer (1 = every pixel is off) comes back in temp3. temp3-temp6
  // survive pfread, which only overwrites temp1/temp2; the left column the scan
  // restarts from on each row is the one variable it needs. Corners may be in
  // either order and are clamped to the playfield.
  const AREA_CLEAR_SUBROUTINE = '_background_area_clear';
  const buildAreaClearBody = (maxRow, left) => {
    const lab = (part) => `@ _areaclear_${part}`;
    const label = (part) => `_areaclear_${part}`;
    return [
      `if temp3 <= temp5 then goto ${label('xok')}`,
      `temp1 = temp3`,
      `temp3 = temp5`,
      `temp5 = temp1`,
      lab('xok'),
      `if temp4 <= temp6 then goto ${label('yok')}`,
      `temp1 = temp4`,
      `temp4 = temp6`,
      `temp6 = temp1`,
      lab('yok'),
      `if temp5 > 31 then temp5 = 31`,
      `if temp6 > ${maxRow} then temp6 = ${maxRow}`,
      `if temp3 > temp5 then goto ${label('clear')}`,
      `if temp4 > temp6 then goto ${label('clear')}`,
      `${left.write} = temp3`,
      lab('row'),
      `temp3 = ${left.read}`,
      lab('col'),
      `if pfread(temp3, temp4) then goto ${label('lit')}`,
      `temp3 = temp3 + 1`,
      `if temp3 <= temp5 then goto ${label('col')}`,
      `temp4 = temp4 + 1`,
      `if temp4 <= temp6 then goto ${label('row')}`,
      lab('clear'),
      `temp3 = 1`,
      `goto ${label('end')}`,
      lab('lit'),
      `temp3 = 0`,
      lab('end'),
    ].join('\n');
  };

  Blockly.BBasic['background_area_clear'] = function(block) {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const maxRow = Blockly.BBasic.maxRowText(config);
    const left = Blockly.BBasic.superchipRwPairs[areaClearLeftVarName()];
    if (!left) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const arg = (name) => Blockly.BBasic.valueToCode(block, name, Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const x1 = arg('X1');
    const y1 = arg('Y1');
    const x2 = arg('X2');
    const y2 = arg('Y2');
    if (!Blockly.BBasic.subroutines[AREA_CLEAR_SUBROUTINE]) {
      Blockly.BBasic.subroutines[AREA_CLEAR_SUBROUTINE] = buildAreaClearBody(maxRow, left);
    }
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(AREA_CLEAR_SUBROUTINE));
    // The lines before the last one are hoisted in front of whatever uses the
    // value (see scrub_ in generators/bbasic.js).
    return [
      `temp3 = ${x1}\ntemp4 = ${y1}\ntemp5 = ${x2}\ntemp6 = ${y2}\ngosub ${AREA_CLEAR_SUBROUTINE}${suffix}\ntemp3`,
      Blockly.BBasic.ORDER_ATOMIC,
    ];
  };

  // "Playfield offset": moves the pixels of the playfield (or of an area of it, whole bytes wide) by one pixel column or
  // row, wrapping inside the area. A row is four bytes of eight pixels; the first and third have their left pixel in
  // bit 7 and the second and fourth in bit 0 (the same order pfscroll and pfpixel use), so a shift sideways is a
  // rotate through the carry from one byte to the next. The standard kernel's rows are four bytes at `playfield`; DPC+
  // keeps each of the four columns in display RAM at dffraclow/dffrachi, one byte a row, read and written through a
  // data fetcher. The rows to move go in temp3 (first) and temp4 (last).
  const leftIsHigh = (byte) => byte % 2 === 0;
  // "Alternate columns up and down" moves every other column up and the ones between down. The first column of the playfield is a
  // bit 7 in the first byte of a row and the columns of the second byte run the other way round, so the even columns are $AA in the
  // first and third bytes and $55 in the second and fourth; "alternate columns down and up" is the other columns. This is the mask of
  // the columns of a byte that go up.
  const isAlternateColumns = (direction) => direction === 'alternate_ud' || direction === 'alternate_du';
  const upColumnsMask = (direction, byte) => ((byte % 2 === 0) === (direction === 'alternate_ud') ? 0xAA : 0x55);
  const offsetSubroutineName = (direction, byte1, byte2, dpcPlus, superchip) =>
    `_background_offset_${direction}_${byte1}${byte2}${dpcPlus ? 'd' : superchip ? 's' : ''}`;

  const buildOffsetBody = ({direction: requested, byte1, byte2, dpcPlus, superchip}) => {
    const label = offsetSubroutineName(requested, byte1, byte2, dpcPlus, superchip);
    // "Alternate rows right and left" is the alternating routine with the rows turned the other way round (the odd rows go left).
    const flip = requested === 'alternate_rl';
    const direction = flip ? 'alternate' : requested;
    const br = (mnemonic) => (flip ? (mnemonic === 'bne' ? 'beq' : 'bne') : mnemonic);
    const lab = (name) => `${label}_${name}`;
    const at = (name) => `@${lab(name)}`;
    const bytes = Array.from({length: byte2 - byte1 + 1}, (_, i) => byte1 + i);
    // Where a byte of the row lives while it is rotated: the playfield itself (indexed by X, four bytes a row) or, with
    // DPC+, the scratch variables temp1 to temp4 (one per column, loaded from and written back to the display RAM).
    // The first and last row are in temp3 and temp4 (standard kernel) or temp5 and temp6 (DPC+).
    const scratch = (byte) => `temp${byte - byte1 + 1}`;
    const readAddr = (byte) => (dpcPlus ? scratch(byte) : `playfield+${byte},x`);
    const rotate = (op, byte) => {
      if (dpcPlus) return [`${op} ${scratch(byte)}`];
      if (superchip) return [`lda playfield+${byte},x`, op, `sta playfield-128+${byte},x`];
      return [`${op} playfield+${byte},x`];
    };
    // One pixel left or right with the pixel that leaves going to the next row: the carry flows through the bytes of
    // the row as it did for a single row, but it starts as the pixel that came out of the previous row (kept in Y, or
    // X with DPC+) and the pixel this row loses is kept for the next. Left, it is the left pixel that leaves and the
    // right end is where the new one comes in; right, the other way round.
    const carryReg = dpcPlus ? 'x' : 'y';
    const keepExit = dpcPlus ? ['pha'] : ['sta temp6'];
    const takeExit = dpcPlus ? ['pla', 'tax'] : ['ldy temp6'];
    const leftLines = () => [
      `lda ${readAddr(byte1)}`, leftIsHigh(byte1) ? 'asl' : 'lsr', 'lda #0', 'rol', ...keepExit, `t${carryReg}a`, 'lsr',
      ...[...bytes].reverse().flatMap((byte) => rotate(leftIsHigh(byte) ? 'rol' : 'ror', byte)), ...takeExit,
    ];
    const rightLines = () => [
      `lda ${readAddr(byte2)}`, leftIsHigh(byte2) ? 'lsr' : 'asl', 'lda #0', 'rol', ...keepExit, `t${carryReg}a`, 'lsr',
      ...bytes.flatMap((byte) => rotate(leftIsHigh(byte) ? 'ror' : 'rol', byte)), ...takeExit,
    ];
    // The pixel that leaves a row, as 0 or 1 in the carry register, from the playfield byte `load` loads.
    const exitLeft = (load) => [load, leftIsHigh(byte1) ? 'asl' : 'lsr', 'lda #0', 'rol', `ta${carryReg}`];
    const exitRight = (load) => [load, leftIsHigh(byte2) ? 'lsr' : 'asl', 'lda #0', 'rol', `ta${carryReg}`];
    // DPC+: where the fetchers point for a row, from the row in `row` (an address) or in Y.
    const pointFetchers = (row, fetchersOf) => [
      row ? `lda ${row}` : 'tya', 'clc', 'adc #<PF1L',
      ...bytes.flatMap((byte) => fetchersOf(byte).map((fetcher) => `sta ${fetcher}LOW`)),
      'lda #0', `adc #((>PF1L)&$0F)+${byte1}`,
      ...bytes.flatMap((byte, i) => [
        ...(i ? ['adc #1'] : []), ...fetchersOf(byte).map((fetcher) => `sta ${fetcher}HI`)]),
    ];
    // DPC+: DF0 pointed at the byte of a column in a row (row is an address) and read.
    const peek = (byte, row) => [
      `lda ${row}`, 'clc', 'adc #<PF1L', 'sta DF0LOW', 'lda #0', `adc #((>PF1L)&$0F)+${byte}`, 'sta DF0HI', 'lda DF0DATA'];
    const writerOf = (byte) => (byte - byte1 < 3 ? `DF${4 + byte - byte1}` : null);
    const lines = ['asm'];
    const horizontal = direction === 'alternate' || direction === 'left' || direction === 'right';
    if (isAlternateColumns(direction)) {
      // Alternate columns up and down, a byte at a time: the columns that go up take the byte of the row below and the others the row above
      // (the first and last row take each other's). temp5 and temp6 are the last and first row times four, temp1 the first row's byte (the
      // one the last row takes) and temp2 the row above, as it was.
      lines.push('lda temp4', 'asl', 'asl', 'sta temp5', 'lda temp3', 'asl', 'asl', 'sta temp6');
      bytes.forEach((byte) => {
        const up = upColumnsMask(direction, byte);
        const write = superchip ? `playfield-128+${byte},x` : `playfield+${byte},x`;
        const name = (part) => lab(`${part}${byte}`);
        lines.push('ldx temp5', `lda playfield+${byte},x`, 'sta temp2', 'ldx temp6', `lda playfield+${byte},x`, 'sta temp1',
            at(`loop${byte}`), 'cpx temp5', `beq ${name('last')}`, `lda playfield+${byte + 4},x`, `jmp ${name('got')}`,
            at(`last${byte}`), 'lda temp1',
            at(`got${byte}`), `and #$${up.toString(16).toUpperCase()}`, 'sta temp3', 'lda temp2', `and #$${(255 - up).toString(16).toUpperCase()}`,
            'ora temp3', 'sta temp4', `lda playfield+${byte},x`, 'sta temp2', 'lda temp4', `sta ${write}`,
            'cpx temp5', `beq ${name('done')}`, 'inx', 'inx', 'inx', 'inx', `jmp ${name('loop')}`, at(`done${byte}`));
      });
    } else if (horizontal && !dpcPlus) {
      // X is the row times four. Right and alternate go down the rows, left goes up; Y starts as the pixel the first
      // row to be moved takes in, which is the one the last row to be moved loses.
      const down = direction !== 'left';
      if (direction === 'left') {
        lines.push('lda temp3', 'asl', 'asl', 'sta temp5', 'tax', ...exitLeft(`lda playfield+${byte1},x`),
            'lda temp4', 'asl', 'asl', 'tax');
      } else {
        lines.push('lda temp4', 'asl', 'asl', 'sta temp5', 'tax');
        if (direction === 'right') {
          lines.push(...exitRight(`lda playfield+${byte2},x`));
        } else {
          lines.push('lda temp4', 'and #1', `${br('bne')} ${lab('initr')}`, ...exitLeft(`lda playfield+${byte1},x`), `jmp ${lab('initd')}`,
              at('initr'), ...exitRight(`lda playfield+${byte2},x`), at('initd'));
        }
        lines.push('lda temp3', 'asl', 'asl', 'tax');
      }
      lines.push(at('row'));
      if (direction === 'alternate') {
        lines.push('txa', 'and #4', `${br('bne')} ${lab('right')}`, ...leftLines(), `jmp ${lab('next')}`, at('right'), ...rightLines());
      } else {
        lines.push(...(direction === 'left' ? leftLines() : rightLines()));
      }
      lines.push(at('next'), 'cpx temp5', `beq ${lab('done')}`,
          ...(down ? ['inx', 'inx', 'inx', 'inx'] : ['dex', 'dex', 'dex', 'dex']), `jmp ${lab('row')}`, at('done'));
    } else if (horizontal && direction !== 'left') {
      // DPC+ down the rows: DF0 to DF3 read the columns and DF4 to DF6 write the first three of them, so a row costs
      // no pointer set (a fourth column's fetcher is pointed at its row again). The kernel sets the fetchers
      // every frame, so the code may use them freely. X carries the pixel from row to row.
      if (direction === 'right') {
        lines.push(...peek(byte2, 'temp6'), leftIsHigh(byte2) ? 'lsr' : 'asl', 'lda #0', 'rol', 'tax');
      } else {
        lines.push('lda temp6', 'and #1', `${br('bne')} ${lab('initr')}`, ...peek(byte1, 'temp6'), leftIsHigh(byte1) ? 'asl' : 'lsr',
            `jmp ${lab('initd')}`, at('initr'), ...peek(byte2, 'temp6'), leftIsHigh(byte2) ? 'lsr' : 'asl', at('initd'),
            'lda #0', 'rol', 'tax');
      }
      lines.push(...pointFetchers('temp5', (byte) => [`DF${byte}`, ...(writerOf(byte) ? [writerOf(byte)] : [])]),
          'ldy temp5', at('row'),
          ...bytes.flatMap((byte) => [`lda DF${byte}DATA`, `sta ${scratch(byte)}`]));
      if (direction === 'alternate') {
        lines.push('tya', 'and #1', `${br('bne')} ${lab('right')}`, ...leftLines(), `jmp ${lab('write')}`, at('right'), ...rightLines());
      } else {
        lines.push(...rightLines());
      }
      lines.push(at('write'));
      bytes.forEach((byte) => {
        if (writerOf(byte)) {
          lines.push(`lda ${scratch(byte)}`, `sta ${writerOf(byte)}WRITE`);
        } else {
          // The fourth column: its fetcher has moved on, so it is pointed at the row again (it ends up where it reads next).
          lines.push('tya', 'clc', 'adc #<PF1L', `sta DF${byte}LOW`, 'lda #0', `adc #((>PF1L)&$0F)+${byte}`, `sta DF${byte}HI`,
              `lda ${scratch(byte)}`, `sta DF${byte}WRITE`);
        }
      });
      lines.push('cpy temp6', `beq ${lab('done')}`, 'iny', `jmp ${lab('row')}`, at('done'));
    } else if (horizontal) {
      // DPC+ ring left, up the rows (a fetcher only counts down the screen, so the fetchers are pointed at each row
      // to read it and again to write it back).
      const fetchersOf = (byte) => [`DF${byte}`];
      lines.push(...peek(byte1, 'temp5'), leftIsHigh(byte1) ? 'asl' : 'lsr', 'lda #0', 'rol', 'tax', 'ldy temp6', at('row'),
          ...pointFetchers(null, fetchersOf), ...bytes.flatMap((byte) => [`lda DF${byte}DATA`, `sta ${scratch(byte)}`]),
          ...leftLines(), ...pointFetchers(null, fetchersOf),
          ...bytes.flatMap((byte) => [`lda ${scratch(byte)}`, `sta DF${byte}WRITE`]),
          'cpy temp5', `beq ${lab('done')}`, 'dey', `jmp ${lab('row')}`, at('done'));
    } else if (!dpcPlus) {
      // Up or down: the bytes of the first row to leave are kept in temp1 to temp4, the rows move one place in a
      // single pass over the area (X is the row times four) and the kept row goes in at the other end.
      const up = direction === 'up';
      const write = (byte) => (superchip ? `playfield-128+${byte},x` : `playfield+${byte},x`);
      const step = up ? ['inx', 'inx', 'inx', 'inx'] : ['dex', 'dex', 'dex', 'dex'];
      lines.push(
          up ? 'lda temp4' : 'lda temp3', 'asl', 'asl', 'sta temp5',
          up ? 'lda temp3' : 'lda temp4', 'asl', 'asl', 'tax',
          ...bytes.flatMap((byte) => [`lda playfield+${byte},x`, `sta ${scratch(byte)}`]),
          'cpx temp5', `beq ${lab('end')}`,
          at('loop'),
          ...bytes.flatMap((byte) => [`lda playfield+${byte + (up ? 4 : -4)},x`, `sta ${write(byte)}`]),
          ...step, 'cpx temp5', `bne ${lab('loop')}`,
          at('end'),
          ...bytes.flatMap((byte) => [`lda ${scratch(byte)}`, `sta ${write(byte)}`]));
    } else {
      // Up or down, a column at a time (temp3): DF0 reads the column and DF1, started on the same row, writes it
      // back, so the rows stream through. Up, the writer is a row behind the reader; down, the row read last time
      // (kept in X) goes in as the next is read.
      const up = direction === 'up';
      const pointBoth = (row) => [
        `lda ${row}`, 'clc', 'adc #<PF1L', 'sta DF0LOW', 'sta DF1LOW',
        'lda temp3', 'adc #(>PF1L)&$0F', 'sta DF0HI', 'sta DF1HI',
      ];
      lines.push(`lda #${byte1}`, 'sta temp3', at('col'));
      if (up) {
        // Row r takes row r+1 and the last row takes the first.
        lines.push(...pointBoth('temp5'), 'lda DF0DATA', 'sta temp1', 'lda temp6', 'sec', 'sbc temp5', 'tay', `beq ${lab('end')}`,
            at('loop'), 'lda DF0DATA', 'sta DF1WRITE', 'dey', `bne ${lab('loop')}`,
            at('end'), 'lda temp1', 'sta DF1WRITE');
      } else {
        // Row r takes row r-1 and the first row takes the last.
        lines.push(...pointBoth('temp6'), 'lda DF0DATA', 'tax', ...pointBoth('temp5'), 'lda temp6', 'sec', 'sbc temp5', 'tay', 'iny',
            at('loop'), 'lda DF0DATA', 'stx DF1WRITE', 'tax', 'dey', `bne ${lab('loop')}`);
      }
      lines.push('inc temp3', 'lda temp3', `cmp #${byte2 + 1}`, `beq ${lab('done')}`, `jmp ${lab('col')}`, at('done'));
    }
    lines.push('@end');
    return lines.join('\n');
  };

  // The first part of the area form: from the two columns (in offsetb1 and offsetb2) it works out the edges and the masks (see below). It is a
  // subroutine, called once before the routine of the direction, so that the routines of several directions share it.
  const AREA_OFFSET_SETUP = '_background_offset_area_setup';
  const buildAreaSetupBody = ({v}) => {
    const lab = (name) => `${AREA_OFFSET_SETUP}_${name}`;
    const at = (name) => `@${lab(name)}`;
    const leftIsHigh = (byte) => byte % 2 === 0;
    const allBytes = [0, 1, 2, 3];
    // The byte (0 to 3) and the bit of a column, and the masks of the columns the area has in each byte.
    const edge = (column, byteVar, bitVar, n) => [
      `lda ${column}`, 'and #7', 'tay', `lda ${column}`, 'lsr', 'lsr', 'lsr', `sta ${byteVar}`, 'and #1', `bne ${lab(`odd${n}`)}`,
      `lda ${lab('msb')},y`, `jmp ${lab(`bit${n}`)}`, at(`odd${n}`), `lda ${lab('lsb')},y`, at(`bit${n}`), `sta ${bitVar}`,
    ];
    // Columns from the left edge to the end of the byte, then from the start of the byte to the right edge.
    const fromLeft = (byte) => (leftIsHigh(byte) ?
      [`lda ${v.m1}`, 'asl', 'sec', 'sbc #1'] : [`lda ${v.m1}`, 'eor #$FF', 'clc', 'adc #1']);
    const toRight = (byte) => (leftIsHigh(byte) ?
      [`lda ${v.m2}`, 'eor #$FF', 'clc', 'adc #1'] : [`lda ${v.m2}`, 'asl', 'sec', 'sbc #1']);
    const maskOf = (byte) => [
      `lda #${byte}`, `cmp ${v.b1}`, `bcc ${lab(`out${byte}`)}`,
      `lda ${v.b2}`, `cmp #${byte}`, `bcc ${lab(`out${byte}`)}`,
      'lda #$FF', `ldx ${v.b1}`, `cpx #${byte}`, `bne ${lab(`left${byte}`)}`, ...fromLeft(byte), at(`left${byte}`), `sta ${v.mask[byte]}`,
      `ldx ${v.b2}`, `cpx #${byte}`, `bne ${lab(`in${byte}`)}`, ...toRight(byte), `and ${v.mask[byte]}`, `sta ${v.mask[byte]}`,
      `jmp ${lab(`in${byte}`)}`,
      at(`out${byte}`), 'lda #0', `sta ${v.mask[byte]}`, at(`in${byte}`),
    ];
    return ['asm', ...[
      `jmp ${lab('start')}`,
      // (Aligned so that an indexed read does not cross a page: see rowTableLines in pf-box.js.)
      'align 8',
      at('msb'), '.byte $80,$40,$20,$10,$08,$04,$02,$01',
      at('lsb'), '.byte $01,$02,$04,$08,$10,$20,$40,$80',
      at('start'),
      `lda ${v.b1}`, 'cmp #32', `bcc ${lab('clamp1')}`, 'lda #31', at('clamp1'), `sta ${v.b1}`,
      `lda ${v.b2}`, 'cmp #32', `bcc ${lab('clamp2')}`, 'lda #31', at('clamp2'), `sta ${v.b2}`,
      `lda ${v.b1}`, `cmp ${v.b2}`, `bcc ${lab('ordered')}`, `beq ${lab('ordered')}`,
      'tax', `lda ${v.b2}`, `sta ${v.b1}`, `stx ${v.b2}`, at('ordered'),
      ...edge(v.b1, v.b1, v.m1, 1), ...edge(v.b2, v.b2, v.m2, 2),
      ...allBytes.flatMap(maskOf),
    ], '@end'].join('\n');
  };

  // The area form of "Playfield offset": the columns are any of 0 to 31 and are worked out when the game runs (they can be a variable), so the
  // edges of the area are handled with masks. A row is four bytes of eight columns, most significant bit first in the first and third and
  // least significant first in the second and fourth. The routine finds, from the two columns, the byte and the bit of each edge and a mask
  // for each byte of the columns the area has in it; a byte is shifted whole, then only the bits inside the mask are kept and the rest are
  // put back as they were. The pixel that leaves the area on one side is kept and goes in at the other end, of the next row (as for the whole
  // playfield), put in by hand because the shift only brings in a zero. The variables it uses (see reserveOffsetAreaDevVars) hold the edges
  // (offsetb1 and offsetb2 are the columns when it is called), the masks and the pixel on its way to the next row.
  const buildAreaOffsetBody = ({direction: requested, dpcPlus, superchip, v}) => {
    const label = `_background_offset_${requested}_area${dpcPlus ? 'd' : superchip ? 's' : ''}`;
    const flip = requested === 'alternate_rl';
    const direction = flip ? 'alternate' : requested;
    const br = (mnemonic) => (flip ? (mnemonic === 'bne' ? 'beq' : 'bne') : mnemonic);
    const lab = (name) => `${label}_${name}`;
    const at = (name) => `@${lab(name)}`;
    let unique = 0;
    const fresh = (name) => lab(`${name}${unique++}`);
    const leftIsHigh = (byte) => byte % 2 === 0;
    const allBytes = [0, 1, 2, 3];
    // The left or right rotate of the byte in the accumulator, the carry coming from the neighbour. Left, the leftmost pixel of the byte
    // leaves it and the neighbour's goes in at its right.
    const rotate = (byte, toLeft) => (leftIsHigh(byte) === toLeft ? 'rol' : 'ror');
    const order = (toLeft) => (toLeft ? [3, 2, 1, 0] : [0, 1, 2, 3]);
    const lines = ['asm'];
    const horizontal = direction === 'alternate' || direction === 'left' || direction === 'right';
    if (!dpcPlus) {
      const read = (byte) => `playfield+${byte},x`;
      const writeBase = superchip ? 'playfield-128' : 'playfield';
      const write = (byte) => `${writeBase}+${byte},x`;
      // The standard kernel: X is the row times four. The pixel that leaves goes to temp6 until the row is done.
      // The pixel on its way to the next row is kept as a mask, $FF for a lit pixel and 0 for none (so that it can be merged in with xors).
      const exitPixel = (which) => ['txa', 'clc', `adc ${which === 1 ? v.b1 : v.b2}`, 'tay', 'lda playfield,y',
        `and ${which === 1 ? v.m1 : v.m2}`, 'cmp #1', 'lda #0', 'adc #$FF', 'eor #$FF'];
      // A byte of the row: the rotated byte where the mask has bits and the byte as it was elsewhere (old ^ ((old ^ new) & mask)).
      const chain = (toLeft) => ['clc', ...order(toLeft).flatMap((byte) => [
        `lda ${read(byte)}`, 'sta temp1', rotate(byte, toLeft), 'eor temp1', `and ${v.mask[byte]}`, 'eor temp1', `sta ${write(byte)}`])];
      const entry = (which) => {
        const byteVar = which === 1 ? v.b1 : v.b2;
        const bitVar = which === 1 ? v.m1 : v.m2;
        return ['txa', 'clc', `adc ${byteVar}`, 'tay', `lda ${v.pixel}`, 'eor playfield,y', `and ${bitVar}`, 'eor playfield,y', `sta ${writeBase},y`];
      };
      const row = (toLeft) => [...exitPixel(toLeft ? 1 : 2), 'sta temp6', ...chain(toLeft), ...entry(toLeft ? 2 : 1),
        'lda temp6', `sta ${v.pixel}`];
      if (isAlternateColumns(direction)) {
        // Alternate columns up and down, a byte at a time (see buildOffsetBody): the new byte is only used in the columns of the area, which
        // are in the byte's mask. temp5 and temp6 are the last and first row times four.
        lines.push('lda temp4', 'asl', 'asl', 'sta temp5', 'lda temp3', 'asl', 'asl', 'sta temp6');
        allBytes.forEach((byte) => {
          const up = upColumnsMask(direction, byte);
          const name = (part) => lab(`${part}${byte}`);
          lines.push(`lda ${v.mask[byte]}`, `bne ${name('go')}`, `jmp ${name('done')}`, at(`go${byte}`),
              'ldx temp5', `lda ${read(byte)}`, 'sta temp2', 'ldx temp6', `lda ${read(byte)}`, 'sta temp1',
              at(`loop${byte}`), 'cpx temp5', `beq ${name('last')}`, `lda playfield+${byte + 4},x`, `jmp ${name('got')}`,
              at(`last${byte}`), 'lda temp1',
              at(`got${byte}`), `and #$${up.toString(16).toUpperCase()}`, 'sta temp3', 'lda temp2', `and #$${(255 - up).toString(16).toUpperCase()}`,
              'ora temp3', `eor ${read(byte)}`, `and ${v.mask[byte]}`, `eor ${read(byte)}`, 'sta temp4', `lda ${read(byte)}`, 'sta temp2',
              'lda temp4', `sta ${write(byte)}`, 'cpx temp5', `bne ${name('more')}`, `jmp ${name('done')}`,
              at(`more${byte}`), 'inx', 'inx', 'inx', 'inx', `jmp ${name('loop')}`, at(`done${byte}`));
        });
      } else if (horizontal) {
        const down = direction !== 'left';
        if (direction === 'left') {
          lines.push('lda temp3', 'asl', 'asl', 'sta temp5', 'tax', ...exitPixel(1), `sta ${v.pixel}`, 'lda temp4', 'asl', 'asl', 'tax');
        } else {
          lines.push('lda temp4', 'asl', 'asl', 'sta temp5', 'tax');
          if (direction === 'right') {
            lines.push(...exitPixel(2));
          } else {
            lines.push('lda temp4', 'and #1', `${br('bne')} ${lab('initr')}`, ...exitPixel(1), `jmp ${lab('initd')}`, at('initr'), ...exitPixel(2),
                at('initd'));
          }
          lines.push(`sta ${v.pixel}`, 'lda temp3', 'asl', 'asl', 'tax');
        }
        lines.push(at('row'));
        if (direction === 'alternate') {
          lines.push('txa', 'and #4', `${br('beq')} ${lab('leftrow')}`, `jmp ${lab('rightrow')}`, at('leftrow'), ...row(true), `jmp ${lab('next')}`,
              at('rightrow'), ...row(false));
        } else {
          lines.push(...row(direction === 'left'));
        }
        lines.push(at('next'), 'cpx temp5', `bne ${lab('more')}`, `jmp ${lab('done')}`, at('more'),
            ...(down ? ['inx', 'inx', 'inx', 'inx'] : ['dex', 'dex', 'dex', 'dex']), `jmp ${lab('row')}`, at('done'));
      } else {
        // Up or down: the row that leaves is kept in temp1 to temp4, the rows move one place in a single pass over the area, and the kept row goes
        // in at the other end. A byte is only touched in the columns of its mask.
        const up = direction === 'up';
        const merge = (source, kept, byte) => {
          const skip = fresh('skipbyte');
          return [`lda ${v.mask[byte]}`, `beq ${skip}`, kept ? `lda ${kept}` : `lda ${source}`, `eor ${read(byte)}`, `and ${v.mask[byte]}`,
            `eor ${read(byte)}`, `sta ${write(byte)}`, `@${skip}`];
        };
        const step = up ? ['inx', 'inx', 'inx', 'inx'] : ['dex', 'dex', 'dex', 'dex'];
        lines.push(
            up ? 'lda temp4' : 'lda temp3', 'asl', 'asl', 'sta temp5',
            up ? 'lda temp3' : 'lda temp4', 'asl', 'asl', 'tax',
            ...allBytes.flatMap((byte) => [`lda ${read(byte)}`, `sta temp${byte + 1}`]),
            'cpx temp5', `bne ${lab('go')}`, `jmp ${lab('end')}`, at('go'),
            at('loop'),
            ...allBytes.flatMap((byte) => merge(`playfield+${byte + (up ? 4 : -4)},x`, null, byte)),
            ...step, 'cpx temp5', `beq ${lab('end')}`, `jmp ${lab('loop')}`,
            at('end'),
            ...allBytes.flatMap((byte) => merge(null, `temp${byte + 1}`, byte)));
      }
    } else {
      // DPC+: each of the four columns is in display RAM at dffraclow/dffrachi, one byte a row, read and written through the data fetchers.
      // The bytes of a row are loaded into temp1 to temp4; the pixel on its way to the next row is in a variable, and the pixel that leaves
      // goes on the stack. The first and last row are in temp5 and temp6, and Y is the row.
      const rotateRow = (toLeft) => {
        const noEntry = fresh('noentry');
        const [exitByte, exitBit, entryByte, entryBit] = toLeft ? [v.b1, v.m1, v.b2, v.m2] : [v.b2, v.m2, v.b1, v.m1];
        return [
          `ldx ${exitByte}`, 'lda temp1,x', `and ${exitBit}`, 'cmp #1', 'lda #0', 'rol', 'pha',
          'clc', ...order(toLeft).flatMap((byte) => [
            `lda ${v.mask[byte]}`, 'eor #$FF', `and temp${byte + 1}`, 'pha', `lda temp${byte + 1}`, rotate(byte, toLeft),
            `and ${v.mask[byte]}`, `sta temp${byte + 1}`, 'pla', `ora temp${byte + 1}`, `sta temp${byte + 1}`]),
          `ldx ${entryByte}`, `lda ${entryBit}`, 'eor #$FF', 'and temp1,x', 'sta temp1,x', `lda ${v.pixel}`, `beq ${noEntry}`,
          'lda temp1,x', `ora ${entryBit}`, 'sta temp1,x', `@${noEntry}`, 'pla', `sta ${v.pixel}`,
        ];
      };
      // DF0 pointed at the byte of a column in a row (row is an address) and read, the pixel the area loses at an edge going in the pixel variable.
      const peekPixel = (row, which) => [
        `lda ${row}`, 'clc', 'adc #<PF1L', 'sta DF0LOW', 'lda #0', 'adc #((>PF1L)&$0F)', 'clc', `adc ${which === 1 ? v.b1 : v.b2}`, 'sta DF0HI',
        'lda DF0DATA', `and ${which === 1 ? v.m1 : v.m2}`, 'cmp #1', 'lda #0', 'rol', `sta ${v.pixel}`,
      ];
      const pointFetchers = (row, fetchersOf) => [
        row ? `lda ${row}` : 'tya', 'clc', 'adc #<PF1L',
        ...allBytes.flatMap((byte) => fetchersOf(byte).map((fetcher) => `sta ${fetcher}LOW`)),
        'lda #0', 'adc #((>PF1L)&$0F)',
        ...allBytes.flatMap((byte, i) => [
          ...(i ? ['adc #1'] : []), ...fetchersOf(byte).map((fetcher) => `sta ${fetcher}HI`)]),
      ];
      const writerOf = (byte) => (byte < 3 ? `DF${4 + byte}` : null);
      if (horizontal && direction !== 'left') {
        // Down the rows: DF0 to DF3 read the columns and DF4 to DF6 write the first three, so a row costs no pointer set.
        if (direction === 'right') {
          lines.push(...peekPixel('temp6', 2));
        } else {
          lines.push('lda temp6', 'and #1', `${br('beq')} ${lab('initl')}`, ...peekPixel('temp6', 2), `jmp ${lab('initd')}`, at('initl'),
              ...peekPixel('temp6', 1), at('initd'));
        }
        lines.push(...pointFetchers('temp5', (byte) => [`DF${byte}`, ...(writerOf(byte) ? [writerOf(byte)] : [])]),
            'ldy temp5', at('row'),
            ...allBytes.flatMap((byte) => [`lda DF${byte}DATA`, `sta temp${byte + 1}`]));
        if (direction === 'alternate') {
          lines.push('tya', 'and #1', `${br('beq')} ${lab('leftrow')}`, `jmp ${lab('rightrow')}`, at('leftrow'), ...rotateRow(true),
              `jmp ${lab('write')}`, at('rightrow'), ...rotateRow(false));
        } else {
          lines.push(...rotateRow(false));
        }
        lines.push(at('write'));
        allBytes.forEach((byte) => {
          if (writerOf(byte)) {
            lines.push(`lda temp${byte + 1}`, `sta ${writerOf(byte)}WRITE`);
          } else {
            lines.push('tya', 'clc', 'adc #<PF1L', `sta DF${byte}LOW`, 'lda #0', `adc #((>PF1L)&$0F)+${byte}`, `sta DF${byte}HI`,
                `lda temp${byte + 1}`, `sta DF${byte}WRITE`);
          }
        });
        lines.push('cpy temp6', `bne ${lab('more')}`, `jmp ${lab('done')}`, at('more'), 'iny', `jmp ${lab('row')}`, at('done'));
      } else if (horizontal) {
        // Up the rows (a fetcher only counts down the screen, so the fetchers are pointed at each row to read it and again to write it back).
        const fetchersOf = (byte) => [`DF${byte}`];
        lines.push(...peekPixel('temp5', 1), 'ldy temp6', at('row'),
            ...pointFetchers(null, fetchersOf), ...allBytes.flatMap((byte) => [`lda DF${byte}DATA`, `sta temp${byte + 1}`]),
            ...rotateRow(true), ...pointFetchers(null, fetchersOf),
            ...allBytes.flatMap((byte) => [`lda temp${byte + 1}`, `sta DF${byte}WRITE`]),
            'cpy temp5', `bne ${lab('more')}`, `jmp ${lab('done')}`, at('more'), 'dey', `jmp ${lab('row')}`, at('done'));
      } else {
        // Up or down, a column at a time (temp3): DF0 reads the column, DF1 writes it and (up) DF2 reads the byte that is being replaced, all
        // started on the same row, so the rows stream through; temp4 is the mask of the column.
        const up = direction === 'up';
        const pointAll = (row, fetchers) => [
          `lda ${row}`, 'clc', 'adc #<PF1L', ...fetchers.map((f) => `sta ${f}LOW`),
          'lda temp3', 'adc #(>PF1L)&$0F', ...fetchers.map((f) => `sta ${f}HI`),
        ];
        lines.push('lda #0', 'sta temp3', at('col'),
            'lda temp3', `beq ${lab('m0')}`, 'cmp #1', `beq ${lab('m1')}`, 'cmp #2', `beq ${lab('m2')}`, `lda ${v.mask[3]}`, `jmp ${lab('m')}`,
            at('m0'), `lda ${v.mask[0]}`, `jmp ${lab('m')}`, at('m1'), `lda ${v.mask[1]}`, `jmp ${lab('m')}`, at('m2'), `lda ${v.mask[2]}`,
            at('m'), 'sta temp4', `bne ${lab('work')}`, `jmp ${lab('next')}`, at('work'));
        if (up) {
          // Row r takes row r+1 and the last row takes the first.
          lines.push(...pointAll('temp5', ['DF0', 'DF1', 'DF2']), 'lda DF0DATA', 'sta temp1', 'lda temp6', 'sec', 'sbc temp5', 'tay',
              `beq ${lab('end')}`,
              at('loop'), 'lda DF0DATA', 'and temp4', 'sta temp2', 'lda temp4', 'eor #$FF', 'and DF2DATA', 'ora temp2', 'sta DF1WRITE',
              'dey', `bne ${lab('loop')}`,
              at('end'), 'lda temp1', 'and temp4', 'sta temp2', 'lda temp4', 'eor #$FF', 'and DF2DATA', 'ora temp2', 'sta DF1WRITE');
        } else {
          // Row r takes row r-1 and the first row takes the last.
          lines.push(...pointAll('temp6', ['DF0', 'DF1']), 'lda DF0DATA', 'tax', ...pointAll('temp5', ['DF0', 'DF1']), 'lda temp6', 'sec',
              'sbc temp5', 'tay', 'iny',
              at('loop'), 'lda DF0DATA', 'sta temp2', 'txa', 'and temp4', 'sta temp1', 'lda temp4', 'eor #$FF', 'and temp2', 'ora temp1',
              'sta DF1WRITE', 'lda temp2', 'tax', 'dey', `bne ${lab('loop')}`);
        }
        lines.push(at('next'), 'inc temp3', 'lda temp3', 'cmp #4', `beq ${lab('done')}`, `jmp ${lab('col')}`, at('done'));
      }
    }
    lines.push('@end');
    return lines.join('\n');
  };

  Blockly.BBasic['background_offset'] = function(block) {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    const dpcPlus = config.kernel === 'dpcplus';
    const superchip = !dpcPlus && !!config.enableSuperchip;
    const direction = block.getFieldValue('DIRECTION');
    const whole = block.getFieldValue('WHOLE') === 'TRUE';
    // (With groups of columns that have separate rows the coprocessor keeps each group to the rows it has, see offset in armprog.c.)
    const groupRows = dpcPlus && !!Blockly.BBasic.dpcPlusGroupFracVars;
    const maxRow = groupRows ? '191' : Blockly.BBasic.maxRowText(config);
    const arg = (name) => Blockly.BBasic.valueToCode(block, name, Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    // The first and last row go in temp3 and temp4 (standard kernel) or temp5 and temp6 (DPC+, whose temp1 to temp4 hold a row).
    const [first, last] = dpcPlus ? ['temp5', 'temp6'] : ['temp3', 'temp4'];
    const rowLines = [
      whole ? `${first} = 0\n${last} = ${maxRow}` : `${first} = ${arg('Y1')}\n${last} = ${arg('Y2')}`,
      ...(whole ? [] : [
        `if ${first} > ${last} then temp1 = ${first} : ${first} = ${last} : ${last} = temp1`,
        `if ${last} > ${maxRow} then ${last} = ${maxRow}`,
        `if ${first} > ${maxRow} then ${first} = ${maxRow}`,
      ]),
    ];
    // Under DPC+ the coprocessor does it (see offset-arm.js): the columns and the function number in bytes, the rows in temp5 and temp6.
    if (dpcPlus) {
      // The columns and the rows go to the coprocessor as they are, and it keeps them inside the playfield and puts them in order itself
      // (see offset-arm.js): no work for the 6502 beyond writing the bytes, in the block itself (no subroutine to call). A number that is
      // plain is written as it is; the others are worked out first, in a byte of their own.
      const plain = (text) => (/^[0-9]+$/.test(String(text).trim()) ? String(Number(text)) : null);
      const resolveArm = (canonicalName) => Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const shared = Blockly.BBasic.offsetArmShared || {};
      const setups = [];
      const operandOf = (text, byte) => {
        const number = plain(text);
        if (number !== null) return `#${number}`;
        setups.push(`${byte} = ${text}`);
        return byte;
      };
      const x1 = whole ? '#0' : operandOf(arg('X1'), resolveArm(shared.b1 || OFFSET_AREA_VARS.b1));
      const x2 = whole ? '#31' : operandOf(arg('X2'), resolveArm(shared.b2 || OFFSET_AREA_VARS.b2));
      const last = plain(maxRow) !== null ? `#${maxRow}` : maxRow;
      const y1 = whole ? '#0' : operandOf(arg('Y1'), 'temp5');
      const y2 = whole ? last : operandOf(arg('Y2'), 'temp6');
      ensureArmProgram(Blockly, groupRows ? {inc: 0, maxRow: 0, clamp: true, groups: true} : undefined);
      return [...setups, buildOffsetArmCall({fn: OFFSET_ARM_FUNCTION[direction], x1, x2, y1, y2, last})].join('\n') + '\n';
    }
    // The whole playfield, or an area whose edges are plain numbers that are whole bytes of eight columns, goes by the routine that moves whole
    // bytes (a good deal faster than the one that works the edges out when the game runs, below).
    const bytes = whole ? {byte1: 0, byte2: 3} : offsetByteRange(block);
    if (bytes) {
      const {byte1, byte2} = bytes;
      const name = offsetSubroutineName(direction, byte1, byte2, dpcPlus, superchip);
      if (!Blockly.BBasic.subroutines[name]) {
        Blockly.BBasic.subroutines[name] = buildOffsetBody({direction, byte1, byte2, dpcPlus, superchip});
      }
      const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name));
      return [...rowLines, `gosub ${name}${suffix}`].join('\n') + '\n';
    }
    const resolve = (canonicalName) => Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const v = {
      b1: resolve(OFFSET_AREA_VARS.b1), m1: resolve(OFFSET_AREA_VARS.m1), b2: resolve(OFFSET_AREA_VARS.b2), m2: resolve(OFFSET_AREA_VARS.m2),
      pixel: resolve(OFFSET_AREA_VARS.pixel), mask: OFFSET_AREA_VARS.mask.map(resolve),
    };
    const name = `_background_offset_${direction}_area${dpcPlus ? 'd' : superchip ? 's' : ''}`;
    if (!Blockly.BBasic.subroutines[name]) {
      Blockly.BBasic.subroutines[name] = buildAreaOffsetBody({direction, dpcPlus, superchip, v});
    }
    if (!Blockly.BBasic.subroutines[AREA_OFFSET_SETUP]) Blockly.BBasic.subroutines[AREA_OFFSET_SETUP] = buildAreaSetupBody({v});
    const suffixOf = (subroutine) => Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(subroutine));
    // The columns first (they can be any blocks) and the masks worked out from them, then the rows.
    return [`${v.b1} = ${arg('X1')}`, `${v.b2} = ${arg('X2')}`, `gosub ${AREA_OFFSET_SETUP}${suffixOf(AREA_OFFSET_SETUP)}`, ...rowLines,
      `gosub ${name}${suffixOf(name)}`].join('\n') + '\n';
  };

  Blockly.BBasic[`background_get_pixel`] = function(block) {
    // Block for getting a playfield pixel
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    // pfread()'s  arguments can't contain an operator - bB's parser
    // expects a bare variable or literal there, not an expression.
    // Confirmed directly: plugging a Math block (e.g. "xCycle - 1") into X
    // or Y generated "pfread(xCycle - 1, ...)" and failed to compile with
    // "Unknown keyword: -". A non-trivial expression is computed into a
    // scratch var first instead, on its  line ahead of wherever this
    // value actually gets used. There's no way for a plain value-block
    // generator to inject setup statements before the line that consumes
    // its return value, so those lines are encoded as a newline-joined
    // preamble in front of the real "pfread(...)" expression here - this
    // block's  tooltip already documents it as if-only, and controls_if
    // (see its  comment) is what actually splits this back out and
    // hoists the preamble onto its  line(s) before the "if". A bare
    // identifier or number literal never contains whitespace in this
    // codebase's  generated code, so testing for it is a safe, cheap
    // way to tell a simple value apart from a compound expression without
    // needing to parse it.
    //
    // temp1/temp2 (bB's  free scratch registers, obliterated by the
    // kernel and reused this way throughout this codebase) are the
    // ordinary, zero-cost choice here - EXCEPT when this block sits inside
    // a function_define's  body, where temp1-temp6 are ALSO bB's fixed
    // argument-passing convention (see generators/bbasic/function.js's
    // comment): overwriting temp1/temp2 there could silently clobber that
    // function's  live parameter(s) out from under it. Confirmed
    // directly as a real bug (a project's  custom function calling this
    // went from "won't compile" to "resets the console the moment it
    // runs" from exactly that). Only THAT case falls back to
    // backgroundGetPixelXVarName/backgroundGetPixelYVarName's
    // dedicated dev vars instead - reserved (see reserveMusicDevVars's
    // sibling in bbasic.js) only for a project that actually has this
    // block nested inside a function at all, so the common case (used
    // directly in a plain "if", not inside a function) costs nothing extra.
    const useDevVars = isInsideFunctionDefine(block);
    const isSimple = (code) => !/\s/.test(code);
    const preamble = [];
    let readX = argumentX;
    let readY = argumentY;
    // backgroundGetPixelXVarName/YVarName now route through reserveDevVarRW
    // (generators/bbasic.js's  init()) when useDevVars is true - .write
    // for the capture line just below, .read for the actual pfread(...)
    // call further down.
    if (!isSimple(argumentX)) {
      if (useDevVars) {
        const pair = Blockly.BBasic.superchipRwPairs[backgroundGetPixelXVarName()];
        preamble.push(`${pair.write} = ${argumentX}`);
        readX = pair.read;
      } else if (!isSimple(argumentY)) {
        // Both are compound: working out Y (a division, say) can put the answer in temp1 out, so X waits in temp5.
        readX = 'temp1';
        preamble.push(`temp5 = ${argumentX}`);
      } else {
        readX = 'temp1';
        preamble.push(`${readX} = ${argumentX}`);
      }
    }
    if (!isSimple(argumentY)) {
      if (useDevVars) {
        const pair = Blockly.BBasic.superchipRwPairs[backgroundGetPixelYVarName()];
        preamble.push(`${pair.write} = ${argumentY}`);
        readY = pair.read;
      } else {
        readY = 'temp2';
        preamble.push(`${readY} = ${argumentY}`);
        if (!isSimple(argumentX)) preamble.push('temp1 = temp5');
      }
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
    // block's "(rand / 8) + 1", which has spaces in it) gets split into
    // several garbage tokens instead of read as one expression, confirmed
    // directly as a real build failure ("Syntax Error ''" from a
    // malformed "LDA #(" with nothing after it). Assigning to temp1/temp2
    // first and passing THOSE (always a single plain token) sidesteps the
    // whitespace-splitting entirely, regardless of how complex the
    // plugged-in X/Y expression is.
    // A compound X or Y (a division, say, goes through a routine that uses temp1 and temp2) is worked out into temp5 and temp6 first: the
    // second one could otherwise put the first one's answer out of temp1.
    const isSimple = (code) => !/\s/.test(code);
    if (isSimple(argumentX) && isSimple(argumentY)) {
      return `temp1 = ${argumentX}\n` +
        `temp2 = ${argumentY}\n` +
        `pfpixel temp1 temp2 ${operation}\n`;
    }
    return `temp5 = ${argumentX}\n` +
      `temp6 = ${argumentY}\n` +
      `temp1 = temp5\n` +
      `temp2 = temp6\n` +
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
    // need their  separate scratch vars rather than reusing it).
    // A compound number (a division goes through a routine that uses temp1 and temp2) is worked out into temp4 to temp6 first, so that
    // working out the next one cannot put the answer of the one before out.
    const isSimple = (code) => !/\s/.test(code);
    if (isSimple(argumentX) && isSimple(argumentY) && isSimple(argumentLineLength)) {
      return `temp2 = ${argumentX}\n` +
        `temp3 = ${argumentY}\n` +
        `temp1 = ${argumentLineLength} + ${direction == 'pfhline' ? 'temp2' : 'temp3'} - 1\n` +
        `${direction} temp2 temp3 temp1 ${operation}\n`;
    }
    return `temp4 = ${argumentX}\n` +
      `temp5 = ${argumentY}\n` +
      `temp6 = ${argumentLineLength}\n` +
      `temp2 = temp4\n` +
      `temp3 = temp5\n` +
      `temp1 = temp6 + ${direction == 'pfhline' ? 'temp2' : 'temp3'} - 1\n` +
      `${direction} temp2 temp3 temp1 ${operation}\n`;
  };

  Blockly.BBasic[`background_draw_line`] = function(block) {
    // Block for drawing an arbitrary (diagonal) line between two points -
    // see registerBackgroundLineSubroutine's  comment for the runtime
    // Bresenham's-line-algorithm this gosubs into, and for why X1/Y1/X2/Y2
    // need their  dedicated vars rather than temp1-temp4 (pfpixel's
    // implementation clobbers temp1/temp2 internally). OPERATION picks
    // which of the (up to 3) pre-built subroutines to gosub directly - a
    // compile-time choice fixed per block instance, not a runtime value.
    const operation = block.getFieldValue('OPERATION');
    const argumentX1 = Blockly.BBasic.valueToCode(block, 'X1', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY1 = Blockly.BBasic.valueToCode(block, 'Y1', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentX2 = Blockly.BBasic.valueToCode(block, 'X2', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY2 = Blockly.BBasic.valueToCode(block, 'Y2', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const names = Blockly.BBasic.backgroundLineVarNames;
    const subroutineName = BACKGROUND_LINE_SUBROUTINE_NAMES[operation];
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(subroutineName));
    return `${names.x1.write} = ${argumentX1}\n` +
      `${names.y1.write} = ${argumentY1}\n` +
      `${names.x2.write} = ${argumentX2}\n` +
      `${names.y2.write} = ${argumentY2}\n` +
      `gosub ${subroutineName}${suffix}\n`;
  };

  Blockly.BBasic[`background_clear`] = function(block) {
    // Block for clearing every playfield pixel
    return `pfclear\n`;
  };

  // Up/Down/Up (2x)/Down (2x) update backgroundScrollRow (see
  // backgroundScrollRowVarName's comment in blocks/background.js)
  // whenever ANY background_scroll/background_scroll_position block OR any
  // sprite_scroll_with_playfield_set/_get block is used anywhere in the
  // project (backgroundScrollUsed, set by bbasic.js's pre-scan) - not
  // just when THIS block's STOPATEDGE is checked - so a getter, or a
  // DIFFERENT scroll block that does check STOPATEDGE, always sees an
  // accurate position regardless of which specific block last moved it.
  // Left/Right never touch it (no edge concept - see this block's
  // tooltip) - so a sprite flagged to follow scroll only ever moves along
  // with Up/Down/Up (2x)/Down (2x), never Left/Right.
  const BACKGROUND_SCROLL_ROW_DELTA = {up: -1, down: 1, upup: -2, downdown: 2};

  // The block that scrolls only the colors runs the same code as Background scroll with its colors-only mode on.
  Blockly.BBasic['background_scroll_colors'] = function(block) {
    const fields = {DIRECTION: block.getFieldValue('DIRECTION'), STOPATEDGE: block.getFieldValue('STOPATEDGE'),
      COLORS: 'FALSE', COLORS_ONLY: 'TRUE', PFCOLORS: block.getFieldValue('PFCOLORS'), BKCOLORS: block.getFieldValue('BKCOLORS')};
    return Blockly.BBasic['background_scroll']({id: block.id, getFieldValue: (name) => fields[name]});
  };

  Blockly.BBasic[`background_scroll`] = function(block) {
    const direction = block.getFieldValue('DIRECTION');
    const delta = BACKGROUND_SCROLL_ROW_DELTA[direction];
    // DPC+'s pfscroll takes the number of rows to move (255 is one row the other way) rather than a direction, only
    // moves vertically, and the first value after it picks which columns of data (0-3), playfield colors (4) and
    // background colors (6) go with it.
    const dpcPlusConfig = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    if (dpcPlusConfig.kernel === 'dpcplus') {
      const DPC_PLUS_SCROLL_VALUE = {up: 1, down: 255, upup: 2, downdown: 254};
      if (!(direction in DPC_PLUS_SCROLL_VALUE)) return ' rem Left/Right scrolling is not available with the DPC+ kernel\n';
      const scroll = Blockly.BBasic.dpcPlusScroll;
      // The standard kernel's pfscroll moves two lines per call (four for the "2x" directions).
      const lineCount = Math.abs(BACKGROUND_SCROLL_ROW_DELTA[direction] || 1) * 2;
      // The sprites that "scroll with the playfield" move by the lines the picture moved: a DPC+ sprite's y counts lines from
      // the top, so the picture moving up (scrolling "down") takes y down.
      const spriteScrollUsedFor = Blockly.BBasic.spriteScrollUsedFor || new Set();
      const nudgeSprites = (lines) => {
        if (!spriteScrollUsedFor.size) return [];
        const flagsVar = Blockly.BBasic.nameDB_.getName(spriteScrollFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        return [...spriteScrollUsedFor].map((name) =>
          ` if ${flagsVar}{${spriteScrollActiveBit(name)}} then ${name}y = ${name}y ${delta > 0 ? '-' : '+'} ${lines}`);
      };
      const colorsOnlyBlock = block.getFieldValue('COLORS_ONLY') === 'TRUE';
      if (!scroll) {
        return ` pfscroll ${DPC_PLUS_SCROLL_VALUE[direction]}${colorsOnlyBlock ? ' 4 4' : ''}\n` +
          (colorsOnlyBlock ? '' : nudgeSprites(Math.abs(BACKGROUND_SCROLL_ROW_DELTA[direction])).map((line) => line + '\n').join(''));
      }
      // The playfield rows are cut thinner (see generateBackgrounds), so a step moves `fine` lines. The
      // standard kernel moves two lines per frame (four for the "2x" directions), so a step is taken every
      // fine / lines frames, or several steps every frame when the rows are single lines.
      const colorsOnly = block.getFieldValue('COLORS_ONLY') === 'TRUE';
      // The playfield colors and the background colors scroll separately: a block moves the kinds it has checked.
      const pfMove = scroll.pfColors && (colorsOnly ? block.getFieldValue('PFCOLORS') !== 'FALSE' : block.getFieldValue('COLORS') === 'TRUE');
      const bkMove = scroll.bkColors && (colorsOnly ? block.getFieldValue('BKCOLORS') !== 'FALSE' : block.getFieldValue('BKCOLORS') === 'TRUE');
      // The playfield columns are queues 0-3, the playfield colors queue 4 and the background colors queue 6.
      // A colors-only block moves each kind by a position kept for that kind; with the picture, they follow the picture's.
      // Each kind of color queue has a single position variable for every block that moves it (a Background scroll colors block
      // anywhere in the project gives it one): a queue moved by two kinds of block, each wrapping by a separate position, would
      // drift out of the part of the playfield memory that holds the picture and show the unfilled row at the seam.
      const colorOnlyUsed = Blockly.BBasic.dpcPlusColorOnlyScrollUsed || {};
      const separate = {pf: !!pfMove && !!colorOnlyUsed.pf, bk: !!bkMove && !!colorOnlyUsed.bk};
      const colorSequences = [[pfMove, false, '_dpcColorScrollOffset'], [bkMove, true, '_dpcBkColorScrollOffset']]
          .filter(([move, bk]) => move && (colorsOnly || separate[bk ? 'bk' : 'pf']))
          .map(([, bk, offsetName]) => ({queueSets: Blockly.BBasic.dpcPlusScrollQueues(dpcPlusConfig, !bk, bk, true), offsetName}));
      const sequences = colorsOnly ? colorSequences : [
        {queueSets: Blockly.BBasic.dpcPlusScrollQueues(dpcPlusConfig, !!pfMove && !separate.pf, !!bkMove && !separate.bk, false),
          offsetName: '_dpcScrollOffset', main: true},
        ...colorSequences];
      if (!sequences.length || sequences.some(({queueSets}) => !queueSets.length)) {
        return ' rem Scrolling colors only needs playfield or background colors (Options tab)\n';
      }
      // With backgrounds of different heights a background's rows are in a variable, which its load sets.
      const rowsVar = Blockly.BBasic.dpcPlusScrollRowsVar;
      const rows = scroll.rows;
      const rowsText = rowsVar || rows;
      const stepRows = Math.max(1, Math.round(lineCount / scroll.fine));
      const divider = dpcPlusScrollDivider(direction, scroll.fine);
      const value = delta > 0 ? 256 - stepRows : stepRows;
      // The playfield holds the background repeated over and over (see tileForDpcPlusScroll in
      // generators/bbasic.js), the view starts one background-height in, and the offset variable follows how far
      // it has moved, between 1 and one background-height. Moving past either end shows the same picture as
      // a whole background-height further along, so the view jumps by that much and never runs out of picture.
      const uid = Blockly.BBasic.blockNumbers.next('dpcscroll');
      // A step is taken every `divider` times the block runs, counted by a byte kept for it (the frame counter would never match when the
      // block only runs on some frames, like inside "Every 2 frames").
      const counterName = (Blockly.BBasic.dpcPlusScrollCounters || {})[block.id];
      const counter = counterName ? Blockly.BBasic.nameDB_.getName(counterName, Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
      const lines = divider > 1 && counter ? [` ${counter} = ${counter} + 1`, ` temp1 = ${counter} & ${divider - 1}`,
        ` if temp1 <> 0 then goto _dpcscroll_${uid}_done`] : [];
      sequences.forEach(({queueSets, offsetName, main}, sequenceIndex) => {
        const offset = Blockly.BBasic.nameDB_.getName(offsetName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        const scrollLines = (amount) => queueSets.map((queues) => ` pfscroll ${amount}${queues}`);
        const stepDone = `_dpcscroll_${uid}_${sequenceIndex}_done`;
        // A background too tall to wrap (see init in generators/bbasic.js) always stops at its ends: the offset is how many rows
        // the top of the view is down the picture, from 0 to the rows that do not fit on screen.
        if (scroll.noWrap) {
          const limit = rowsVar || scroll.limit;
          if (delta > 0) {
            lines.push(` if ${offset} < ${stepRows} then goto ${stepDone}`);
          } else if (rowsVar) {
            lines.push(` if ${rowsVar} < ${stepRows} then goto ${stepDone}`, ` temp1 = ${rowsVar} - ${stepRows}`,
                ` if ${offset} > temp1 then goto ${stepDone}`);
          } else if (scroll.limit < stepRows) {
            lines.push(` goto ${stepDone}`);
          } else {
            lines.push(` if ${offset} > ${limit - stepRows} then goto ${stepDone}`);
          }
          lines.push(...scrollLines(value));
          if (main) lines.push(...nudgeSprites(stepRows * scroll.fine));
          lines.push(` ${offset} = ${offset} ${delta > 0 ? '-' : '+'} ${stepRows}`, `@ ${stepDone}`);
          return;
        }
        // Stopping at the edge: the view is about to run past either end of the background.
        if (block.getFieldValue('STOPATEDGE') === 'TRUE') {
          if (delta > 0) lines.push(` if ${offset} <= ${stepRows} then goto ${stepDone}`);
          else if (rowsVar) lines.push(` temp1 = ${rowsVar} - ${stepRows}`, ` if ${offset} > temp1 then goto ${stepDone}`);
          else lines.push(` if ${offset} > ${rows - stepRows} then goto ${stepDone}`);
        }
        lines.push(...scrollLines(value));
        if (main) lines.push(...nudgeSprites(stepRows * scroll.fine));
        if (delta > 0) {
          lines.push(` if ${offset} > ${stepRows} then ${offset} = ${offset} - ${stepRows} : goto ${stepDone}`,
              ` ${offset} = ${offset} + ${rowsText}`, ` ${offset} = ${offset} - ${stepRows}`, ...scrollLines(rowsText));
        } else {
          // The jump back is the number of rows the other way round (256 less them).
          const back = rowsVar ? 'temp1' : 256 - rows;
          lines.push(...(rowsVar ? [` temp1 = ${rowsVar} - ${stepRows}`] : []),
              ` if ${offset} <= ${rowsVar ? 'temp1' : rows - stepRows} then ${offset} = ${offset} + ${stepRows} : goto ${stepDone}`,
              ` ${offset} = ${offset} + ${stepRows}`, ` ${offset} = ${offset} - ${rowsText}`,
              ...(rowsVar ? [` temp1 = 255 - ${rowsVar}`, ' temp1 = temp1 + 1'] : []), ...scrollLines(back));
        }
        lines.push(`@ ${stepDone}`);
      });
      lines.push(`@ _dpcscroll_${uid}_done`);
      return lines.join('\n') + '\n';
    }
    // "scroll playfield colors": the row colors move with the pixels (see
    // buildBackgroundColorScroll in generators/bbasic.js). Only for the
    // directions that move rows.
    const colorsOn = delta != null && (block.getFieldValue('COLORS') === 'TRUE' || block.getFieldValue('COLORS_ONLY') === 'TRUE') &&
      !!Blockly.BBasic.backgroundColorScrollUsed;
    // Without tracking nothing is taller than the screen, so pfscroll rotates the
    // rows in place and the colors rotate the same way. The rotation is noticed
    // by the same thing pfscroll itself goes by: playfieldpos is reset to the
    // row height when "up" has moved a whole row, and to 1 when "down" has.
    const colorRotationLines = (uid, everyCall, stopAtEdgeToo) => {
      const resolve = (name) =>
        Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
      const rows = backgroundDataRows(config);
      const offset = resolve(backgroundColorOffsetVarName());
      const skip = `_bgcolorscroll_${uid}_skip`;
      const up = delta < 0;
      return [
        ...(stopAtEdgeToo ? [up ? ` if ${offset} >= ${rows - 1} then goto ${skip}` : ` if ${offset} = 0 then goto ${skip}`] : []),
        ...(everyCall ? [] : [` if playfieldpos <> ${up ? pfRowDivisorFor(config) : 1} then goto ${skip}`]),
        // The routine moves the offset a row and sets the colors (see buildBackgroundColorScroll).
        Blockly.BBasic.backgroundColorRotateLines(up),
        `@ ${skip}`,
      ];
    };
    // "colors only": the color rows step one row per block, and the pixels stay put.
    if (block.getFieldValue('COLORS_ONLY') === 'TRUE') {
      // The standard kernel has only the playfield colors.
      if (block.getFieldValue('PFCOLORS') === 'FALSE') return '';
      if (!colorsOn) return ' rem Scrolling colors only needs per-row playfield colors (Options tab) and Up/Down\n';
      return colorRotationLines(Blockly.BBasic.blockNumbers.next('bgscroll'), true,
          block.getFieldValue('STOPATEDGE') === 'TRUE').join('\n') + '\n';
    }
    if (!Blockly.BBasic.backgroundScrollTracking || delta == null) {
      if (!colorsOn) return `pfscroll ${direction}\n`;
      return [` pfscroll ${direction}`, ...colorRotationLines(Blockly.BBasic.blockNumbers.next('bgscroll'))].join('\n') + '\n';
    }

    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const rowVar = resolveVar(backgroundScrollRowVarName());
    const maxVar = resolveVar(backgroundScrollRowMaxVarName());
    const stopAtEdge = block.getFieldValue('STOPATEDGE') === 'TRUE';
    const uid = Blockly.BBasic.blockNumbers.next('bgscroll');
    const doneLabel = `_bgscroll_${uid}_done`;
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const rowHeight = pfRowDivisorFor(config);
    // rowVar tracks the live window's top row index into the full
    // background, in the natural sense its name suggests - "down"/"down
    // (2x)" increase it (reveal more of the background below), "up"/"up
    // (2x)" decrease it (reveal more above), bounded at 0 and maxVar
    // (pixels.length-visibleRows).
    const lines = [];
    const overflowUsed = (Blockly.BBasic.backgroundScrollOverflowBackgrounds || []).length > 0;
    const spriteScrollUsedFor = Blockly.BBasic.spriteScrollUsedFor || new Set();
    const nudgeSprites = () => {
      if (!spriteScrollUsedFor.size) return;
      const flagsVar = resolveVar(spriteScrollFlagsVarName());
      spriteScrollUsedFor.forEach((name) => {
        const bit = spriteScrollActiveBit(name);
        lines.push(` if ${flagsVar}{${bit}} then ${name}y = ${name}y ${delta < 0 ? '-' : '+'} 1`);
      });
    };

    // Sets the "reached top/bottom" flag when a row-step lands on that edge
    // - only for an edge some "When background scroll reaches" block watches.
    // condition is the bB test (an "if" body, without the "if"/"then").
    const edgeWatches = Blockly.BBasic.backgroundScrollEdgeWatches || new Set();
    const edgeFlag = (edge) =>
      `${resolveVar(backgroundScrollEdgeFlagsVarName())}{${BACKGROUND_SCROLL_EDGE_BITS[edge]}}`;
    const setEdgeFlag = (edge, condition) => {
      if (edgeWatches.has(edge)) lines.push(` if ${condition} then ${edgeFlag(edge)} = 1`);
    };

    if (!overflowUsed) {
      // No background in the project is taller than the visible window -
      // stock pfscroll's rotate-in-place is already correct and simplest.
      if (stopAtEdge) {
        lines.push(delta < 0 ?
          ` if ${rowVar} <= 0 then goto ${doneLabel}` :
          ` if ${rowVar} >= ${maxVar} then goto ${doneLabel}`);
      }
      lines.push(` pfscroll ${direction}`);
      if (colorsOn) lines.push(...colorRotationLines(uid));
      // Real pfscroll moves by ONE SCANLINE per call, not one logical
      // playfield row (confirmed directly against pf_scrolling.asm - it
      // only actually rotates a row once the kernel's internal
      // "playfieldpos" accumulator reaches the configured row height,
      // rowHeight above) - subRowVar is this block's parallel accumulator
      // (not a read of that internal kernel counter, which resets
      // ambiguously on both "just completed a row" and "the very first call
      // ever" alike, making it unsafe to read back directly - see
      // backgroundScrollSubRowVarName's comment in blocks/background.js) so
      // rowVar only advances once a row has genuinely completed, not on
      // every single scanline step. A real reported bug otherwise ("stop at
      // edge" triggering ~rowHeight times too early, since rowVar used to
      // advance a full step on every raw call).
      const subRowVar = resolveVar(backgroundScrollSubRowVarName());
      lines.push(` ${subRowVar} = ${subRowVar} + ${Math.abs(delta)}`);
      lines.push(` if ${subRowVar} < ${rowHeight} then goto ${doneLabel}`);
      lines.push(` ${subRowVar} = ${subRowVar} - ${rowHeight}`);
      lines.push(` ${rowVar} = ${rowVar} ${delta < 0 ? '-' : '+'} 1`);
      if (delta > 0) setEdgeFlag('bottom', `${rowVar} >= ${maxVar}`);
      else setEdgeFlag('top', `${rowVar} = 0`);
      // Nudges every sprite currently flagged (a RUNTIME bit, checked here
      // every call, not a compile-time decision - see sprite_scroll_with_
      // playfield_set's generator in generators/bbasic/sprites.js) to
      // follow this same row move, one "if flag then nudge" line per NAME
      // that has a "set/is scrolling with playfield" block anywhere in the
      // project. Only runs once a row has actually completed (see above),
      // matching rowVar's cadence - a flagged sprite tracks real rows
      // scrolled, not raw scanline steps.
      nudgeSprites();
    } else {
      // Some background in the project IS taller than the visible window.
      // Real pfscroll still rotates the live window (cheap, and it keeps the
      // kernel's fine scroll position), and only the ONE row it leaves stale
      // is then overwritten from the background's table - see
      // backgroundScrollPacking's comment in blocks/background.js. The row
      // variable is packed (low bits = top row, high bits = which background
      // is showing), the patch inputs live in scratch temp3/temp5, and the
      // furthest scroll row is fetched from ROM by the shared subroutine
      // (temp5 = 254 -> temp6) whenever it's needed, so nothing else is
      // reserved. temp4 is scratch for the unpacked row.
      //
      // Which pfscroll direction advances the background is fixed by the
      // hardware (traced through pf_scrolling.asm): pfscroll "up" rotates
      // every row toward slot 0, leaving the BOTTOM slot stale and needing
      // the window's top row to INCREASE; "down" is the mirror image. The
      // block's direction is the way the background moves on the screen, as
      // with a background that fits the screen: Up moves it up (further into
      // the background, so the row increases) and Down moves it down (back
      // towards its top).
      const mechDirection = direction;
      const step = Math.abs(delta);
      const visibleRows = backgroundDataRows(config);
      const forward = delta < 0;
      const {rowMask} = Blockly.BBasic.backgroundScrollPacking;
      const gosubPatch = ` gosub ${BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME}${Blockly.BBasic.bankJumpSuffix(
          Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME))}`;
      // temp6 = the active background's furthest scroll row (row count minus
      // visible rows); leaves temp3/temp4 alone.
      const loadMax = () => {
        lines.push(' temp5 = 254');
        lines.push(gosubPatch);
      };
      // Stop-at-edge blocks only the call that would complete a row-step
      // past the limit (pfscroll's wrap threshold: forward wraps once
      // playfieldpos is <= step, backward once it is > rowHeight - step), so
      // fine scrolling still runs right up to the last position and the
      // picture settles cleanly on the edge instead of stopping mid-row.
      // The cheap playfieldpos test goes first, so every call that can't
      // wrap skips the row/maximum work (forward: a whole gosub for the
      // maximum) and only the wrapping call pays for it. Going forward that
      // call leaves the maximum in temp6 for the bottom-row math below
      // (nothing in between touches temp6, pfscroll included).
      const edgeCheckedLabel = `_bgscroll_${uid}_edgeok`;
      // A Playfield transition under way: only the scroll that moves the way it comes in does anything, and each row-step brings in a row of
      // the new background (modes 252 and 253 of the scroll patch); when it has filled the window the new background is the one showing.
      if (Blockly.BBasic.backgroundTransitionUsed) {
        const trVar = resolveVar(backgroundTransitionVarName());
        const normalLabel = `_bgscroll_${uid}_normal`;
        lines.push(` if ${trVar} = 0 then goto ${normalLabel}`);
        lines.push(forward ? ` if ${trVar} >= 128 then goto ${doneLabel}` : ` if ${trVar} < 128 then goto ${doneLabel}`);
        lines.push(` pfscroll ${mechDirection}`);
        lines.push(forward ? ` if playfieldpos <> ${rowHeight} then goto ${doneLabel}` : ` if playfieldpos <> 1 then goto ${doneLabel}`);
        Blockly.BBasic.backgroundScrollStepUsed = true;
        nudgeSprites();
        lines.push(` temp5 = ${forward ? 252 : 253}`, gosubPatch, ` if temp6 = 0 then goto ${doneLabel}`);
        // The new background is showing: its row colors take over.
        if (colorsOn) {
          const colorBg = resolveVar(backgroundColorBgVarName());
          const colorOffset = resolveVar(backgroundColorOffsetVarName());
          const packing = Blockly.BBasic.backgroundScrollPacking;
          lines.push(` ${colorBg} = ${packing.packed ? `${rowVar} / ${packing.indexStep}` : resolveVar(backgroundScrollActiveVarName())}`,
              ` ${colorOffset} = ${rowVar} & ${rowMask}`, Blockly.BBasic.backgroundColorScrollApplyLines());
        }
        lines.push(` goto ${doneLabel}`, `@ ${normalLabel}`);
      }
      if (stopAtEdge) {
        if (forward) {
          lines.push(` if playfieldpos > ${step} then goto ${edgeCheckedLabel}`);
          loadMax();
          lines.push(` temp4 = ${rowVar} & ${rowMask}`);
          lines.push(` if temp4 >= temp6 then goto ${doneLabel}`);
        } else {
          lines.push(` if playfieldpos <= ${rowHeight - step} then goto ${edgeCheckedLabel}`);
          lines.push(` temp4 = ${rowVar} & ${rowMask}`);
          lines.push(` if temp4 <= 0 then goto ${doneLabel}`);
        }
        lines.push(`@ ${edgeCheckedLabel}`);
      }
      lines.push(` pfscroll ${mechDirection}`);
      // A row-step completed exactly when pfscroll wrapped playfieldpos:
      // forward it resets to rowHeight (a non-wrapping step always leaves it
      // lower), backward it resets to 1 (a non-wrapping step always leaves it
      // higher).
      lines.push(forward ?
        ` if playfieldpos <> ${rowHeight} then goto ${doneLabel}` :
        ` if playfieldpos <> 1 then goto ${doneLabel}`);
      // The rest of the row-step is one call of the scroll patch (modes 240 to 247, see generateBackgroundScrollPatch): the row
      // moves by one (round the background, or stopping at the edge: the pre-check above saw to it that it can), the playfield colors
      // follow when ticked, and the row that has come into view is copied into the window. Bit 0 of the mode is "forward", bit 1 "colors",
      // bit 2 "stop at the edge". It leaves temp6 as the furthest row (stop at the edge) or the number of rows (without), for the edge watch.
      Blockly.BBasic.backgroundScrollStepUsed = true;
      nudgeSprites();
      lines.push(` temp5 = ${240 + (forward ? 1 : 0) + (colorsOn ? 2 : 0) + (stopAtEdge ? 4 : 0)}`);
      lines.push(gosubPatch);
      // Edge flags, from the row just stored.
      if (forward && edgeWatches.has('bottom')) {
        lines.push(` temp4 = ${rowVar} & ${rowMask}`);
        if (!stopAtEdge) lines.push(` temp4 = temp4 + ${visibleRows}`);
        setEdgeFlag('bottom', 'temp4 = temp6');
      } else if (!forward && edgeWatches.has('top')) {
        lines.push(` temp4 = ${rowVar} & ${rowMask}`);
        setEdgeFlag('top', 'temp4 = 0');
      }
    }
    // "@ label" (not a bare label), same reasoning as collision_check_
    // position/object_bounce's labels elsewhere in this codebase - this
    // whole block can end up nested inside an "if...then" body (e.g. an
    // "every X frames" wrapper), where a bare label comes out indented and
    // bB only recognizes a label at column 0 unless it's "@"-prefixed.
    lines.push(`@ ${doneLabel}`);
    return lines.join('\n') + '\n';
  };

  // Runs its blocks once when background_scroll lands on the chosen edge (see
  // setEdgeFlag in background_scroll above) - the same flag-then-clear shape
  // as emitFadeFinishedWatch.
  Blockly.BBasic[`background_scroll_edge_reached`] = function(block) {
    const edge = block.getFieldValue('EDGE');
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const watches = Blockly.BBasic.backgroundScrollEdgeWatches || new Set();
    if (!watches.has(edge)) return '';
    const flag = `${resolveVar(backgroundScrollEdgeFlagsVarName())}{${BACKGROUND_SCROLL_EDGE_BITS[edge]}}`;
    const labelEnd = `_bgscrolledge_${Blockly.BBasic.blockNumbers.next()}_end`;
    return '\n' + [
      `if !${flag} then goto ${labelEnd}`,
      `${flag} = 0`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') + '\n';
  };

  // Jumps the scroll to a chosen row. The row (+1, 0 = none) is parked in the
  // pending-start variable, which the full-load mode of bgscrollpatch consumes
  // - so a background switch still pending this frame (the load happens at
  // the start of the next frame, from "newbackground") picks it up instead of
  // resetting to the top. With no switch pending the load runs right here.
  // Does nothing without a background taller than the window, where there is
  // no position to set.
  Blockly.BBasic[`background_scroll_set_row`] = function(block) {
    if (!Blockly.BBasic.backgroundScrollStartUsed) return '';
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const row = Blockly.BBasic.valueToCode(block, 'ROW', Blockly.BBasic.ORDER_ADDITION) || '0';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const doneLabel = `_bgscroll_${Blockly.BBasic.blockNumbers.next('bgscroll')}_setrow_done`;
    const gosubPatch = ` gosub ${BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME}${Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME))}`;
    return [
      ` ${resolveVar(backgroundScrollStartVarName())} = ${row} + 1`,
      ' if newbackground <> 0 then goto ' + doneLabel,
      ` playfieldpos = ${pfRowDivisorFor(config)}`,
      ' temp5 = 255',
      gosubPatch,
      // The playfield colors follow to the new row.
      ...(Blockly.BBasic.backgroundColorScrollUsed ? [
        ` ${resolveVar(backgroundColorOffsetVarName())} = ${resolveVar(backgroundScrollRowVarName())} & ${
          Blockly.BBasic.backgroundScrollPacking.rowMask}`,
        Blockly.BBasic.backgroundColorScrollApplyLines(),
      ] : []),
      `@ ${doneLabel}`,
    ].join('\n') + '\n';
  };

  // Starts a Playfield transition: the Playfield scroll blocks then bring the chosen background in a row at a time (see background_scroll).
  Blockly.BBasic[`background_transition`] = function(block) {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    if (config.kernel === 'dpcplus') return ' rem Playfield transitions are not available with the DPC+ kernel\n';
    if (!Blockly.BBasic.backgroundTransitionUsed || !(Blockly.BBasic.backgroundScrollOverflowBackgrounds || []).length) return '';
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const id = Number(block.getFieldValue('VAR'));
    const index = Blockly.BBasic.getIncludedBackgrounds().findIndex((background) => Number(background.id) === id);
    if (index < 0) return '';
    const fromTop = block.getFieldValue('DIRECTION') === 'down';
    return ` ${resolveVar(backgroundTransitionVarName())} = ${index + 1 + (fromTop ? 128 : 0)}\n` +
      ` ${resolveVar(backgroundTransitionCountVarName())} = 0\n`;
  };

  Blockly.BBasic[`background_scroll_position`] = function(block) {
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const rowVar = resolveVar(backgroundScrollRowVarName());
    // In overflow mode the variable also carries the active background's
    // index in its high bits - see backgroundScrollPacking.
    const packing = Blockly.BBasic.backgroundScrollPacking;
    return [packing && packing.packed ? `(${rowVar} & ${packing.rowMask})` : rowVar,
      Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`draw_screen`] = function(block) {
    // Draw screen.
    return 'COLUP1 = player1color\n' +
      'COLUP0 = player0color\n' +
      'drawscreen\n';
  };

  // (Re)starts the countdown generateShakeScreenChecks counts down every
  // frame - just the countdown, same "trigger sets state, a separate
  // generate*Checks does the per-frame work" split as every other
  // multi-frame effect in this codebase. The countdown is the low 7 bits of "shakescreen"
  // (bit 7 stays clear, which the per-frame check turns into the right value before the
  // kernel ever reads it), so it is limited to SHAKE_SCREEN_MAX_FRAMES.
  Blockly.BBasic[`screen_shake`] = function(block) {
    const shakeVar = Blockly.BBasic.nameDB_.getName('shakescreen', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const frames = (Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_ASSIGNMENT) || '0').trim();
    if (/^\d+$/.test(frames)) {
      return `${shakeVar} = ${Math.min(Number(frames), SHAKE_SCREEN_MAX_FRAMES)}\n`;
    }
    return `temp1 = ${frames}\n` +
      `if temp1 > ${SHAKE_SCREEN_MAX_FRAMES} then temp1 = ${SHAKE_SCREEN_MAX_FRAMES}\n` +
      `${shakeVar} = temp1\n`;
  };

  // DPC+ only - see this block's own definition in blocks/background.js for
  // why nothing else sets DFxFRACINC automatically. The real formula
  // (confirmed against two real DPC+ example programs' own numbers) is
  // FRACINC = round(256/scanlines) - but 256 itself doesn't fit an 8-bit
  // byte, so that can only be computed exactly at compile time, when
  // SCANLINES is a literal typed-in number (the common case, matching how
  // every real DPC+ example hand-picks a fixed FRACINC value rather than
  // computing one from a variable). resolveTableIdLiteral in generators/
  // bbasic/data.js is the precedent for this "read a literal math_number
  // directly, fall back to a real runtime expression otherwise" split.
  //
  // When SCANLINES is a runtime variable/expression instead, 256 can't be
  // represented, so this falls back to 255/scanlines - off by exactly 1
  // from the true value whenever scanlines evenly divides 256 (e.g. 8
  // scanlines: true value 32, this gives 31), otherwise exact. A single
  // scanline off out of 200-ish is not visually meaningful for a coarse,
  // trig-free row-height setting - same tolerance this codebase already
  // accepts for DIRECTION16_STEPS' own coarse approximation.
  Blockly.BBasic[`background_set_dpc_plus_row_height`] = function(block) {
    const target = block.getInputTargetBlock('SCANLINES');
    const literal = target && target.type === 'math_number' ? Number(target.getFieldValue('NUM')) : null;
    let fracInc;
    // valueToCode is only ever called once below - calling it twice would
    // generate the connected block's own code twice, a real risk for
    // anything more than a bare literal/variable.
    const setupLines = [];
    if (literal && literal > 0) {
      fracInc = `${Math.max(1, Math.min(255, Math.round(256 / literal)))}`;
    } else {
      const scanlines = Blockly.BBasic.valueToCode(block, 'SCANLINES', Blockly.BBasic.ORDER_ASSIGNMENT) || '8';
      // temp1 is bB's own always-available scratch byte (not a reserved
      // dev var) - safe here since this is a one-shot trigger, not a
      // per-frame check, so nothing else could be mid-use of it in the
      // same statement sequence.
      setupLines.push(` temp1 = 255 / ${scanlines}`, ` if temp1 = 0 then temp1 = 1`);
      fracInc = 'temp1';
    }
    // Per-row playfield/background color resolution (DF4/DF6FRACINC) is
    // kept in lockstep with pixel-data resolution (DF0-3FRACINC) here
    // rather than exposed as its own separate setting, for Phase 1
    // simplicity - real DPC+ projects CAN run color at a different (often
    // finer) rate than pixel data (confirmed via real examples setting
    // DF4/DF6FRACINC=255 while DF0-3 used 128), but that's a follow-up, not
    // required for basic per-row color support to work.
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const colorLines = [];
    // The color tables are read at half the rate of the playfield rows, so their increment is doubled.
    let colorFracInc = Math.min(255, fracInc * 2);
    if (fracInc === 'temp1') {
      setupLines.push(' temp2 = 255', ' if temp1 < 128 then temp2 = temp1 + temp1');
      colorFracInc = 'temp2';
    }
    if (Blockly.BBasic.dpcPlusPfColorsOn(config)) colorLines.push(` DF4FRACINC = ${colorFracInc}`);
    if (config.enableDpcPlusBkColors) colorLines.push(` DF6FRACINC = ${colorFracInc}`);
    return [
      ...setupLines,
      ` DF0FRACINC = ${fracInc}`,
      ` DF1FRACINC = ${fracInc}`,
      ` DF2FRACINC = ${fracInc}`,
      ` DF3FRACINC = ${fracInc}`,
      ...colorLines,
    ].join('\n') + '\n';
  };
};

