/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Helper functions for generating JavaScript for blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

import {superchipOn} from '../utils/superchip';
import Blockly from 'blockly/core';
import templateText from 'raw-loader!./bbasic.bb.hbs';
import Handlebars from 'handlebars';
import {sumBy, chunk} from 'lodash';

import {appendCompileLog, useBackgroundsStorage, useConfigurationStorage, useDataTablesStorage,
  usePlayerAnimationsStorage, useSongsStorage, useTitleScreenStorage} from '../hooks/project';
import {useRomCapacity} from '../hooks/rom-capacity';
import {processSongsStorageDefaults} from '../blocks/music';
import {getRelocationBanks} from '../hooks/relocation-banks';
import {DEFAULT_ROW_COLOR, processBackgroundStorageDefaults,
  backgroundFadeTimerVarName, backgroundFadePaceVarName, backgroundFadeTargetVarName,
  fadeFlagsVarName, fadeActiveBit, backgroundFadeFinishedBit, backgroundFadeWatchKey, FADE_FLAGS_REGISTER_GROUPS,
  backgroundGetPixelXVarName, backgroundGetPixelYVarName,
  collisionPixelColumnVarName, collisionPixelRowVarName, areaClearLeftVarName,
  resolveBackgroundFadeFinishedWatches, hasBackgroundFadeActiveChecks,
  backgroundScrollEdgeFlagsVarName, backgroundScrollStartVarName,
  backgroundScrollRowVarName, backgroundScrollRowMaxVarName,
  backgroundScrollPacking, backgroundScrollActiveVarName, backgroundScrollSubRowVarName,
  backgroundsWithOverflowRows, backgroundDataRows, effectiveBackgroundRows, backgroundPfresOf, dpcPlusPfresOf,
  BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME, resolveUsedBackgroundIds,
  ROW_FADE_IDLE_STEP, rowFadeStartColor, multicolorFadeVarName,
  backgroundColorBgVarName, backgroundColorOffsetVarName, BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME, FADE_STEPS} from '../blocks/background';
import {chooseSpill, applySpill, remainingUses} from './bbasic/spill';
import {functionCallDiscardVarName, functionCallArgVarName, functionParamVarName,
  MAX_FUNCTION_ARGS} from '../blocks/function';
import {dataTableSymbolName, processDataTablesStorageDefaults} from '../blocks/data';
import {matrixToPlayfield} from '../utils/pixels';
import {colorByteToBuildBBasic} from '../utils/palette';
import {CUSTOM_SCORE_FONT, SQUISH_SCORE_FONT, SQUISH_CUSTOM_SCORE_FONT,
  customScoreFontUsesExtraGlyphs, secondaryScoreFontName} from '../utils/score-font';
import {canonicalDistanceVarName, distancePointVarName} from '../utils/distance';
import {superchipRwFreeCount, pfRowDivisorFor, dpcPlusRowLinesFor, backgroundRowLinesFor} from '../utils/playfield-coords';
import {DPCPLUS_FIXED_VARIABLE_SLOTS, DPCPLUS_MOVED_FIXED_SLOT_COUNT, dpcPlusFixedSlotsMoved} from '../utils/fixed-vars';
import {fireObjectFieldValue} from '../utils/fire-object';
import {bbTvSetting} from '../utils/tv-standard';
import {keypadKeyVarName} from '../utils/keypad';
import {clampFrameDuration} from '../utils/duration';
import {isWideAnimation, splitWideRow} from '../utils/wide-sprite';
import {registerTitleScreenSubroutine, resolveTitlePlayerSlots, TITLE_KERNEL_ENDED_FAMILY, titleKernelEndedVar,
  titleKernelEndedBit, TITLE_CARD_HOLD_FAMILY, titleCardHoldVar, TITLE_BG_OVERRIDE_FAMILY,
  titleBgOverrideVar, titleBgOverrideBit, titleCardHoldBit, TITLE_CARD_ONCE_FAMILY, titleCardOnceVar,
  TITLE_CARD_REVERSE_FAMILY, titleCardReverseVar, titleCardReverseBit,
  TITLE_ANIMATE_FAMILY, titleAnimateVar,
  TITLE_CARD_FINISHED_FAMILY, titleCardFinishedVar, titleCardFinishedBit, titleCardFinishedLatchBit,
  titleCardOnceBit, TITLE_PLAYER_ONCE_FAMILY, titlePlayerOnceVar, titlePlayerOnceBit} from './bbasic/titlescreen';
import {resolveAnimatedTitleScreenCardRefs, resolveAllTitleScreenCardRefs, resolveFrameBoxCardRefs, resolvePlayOnceCardRefs, titleCardFrameCounterVarName, processTitleScreenStorageDefaults,
  titleCardScrollOffsetVarName, resolveTitleScreenCardsNeedingIndexRefs,
  titleCardIndexVarName, titleCardColorIndexVarName, resolveColorSplitCardRefs,
  titleCardColorPageVarName, resolveColorPageCardRefs,
  titleScrollEdgeFlagSlots, planTitleRowFade, setTitleRowFadePlans, padTitleCardFrames, TITLE_SCREEN_KERNEL_TYPES, titleCardColorVarName, titleCardFadeTargetVarName, titleCardFadeTimerVarName, titleCardFadePaceVarName,
  TITLE_BG_COLOR_VAR_NAME, titleCardBoxColorVarName, titleCardBoxPf1VarName,
  titleCardBoxPf2VarName, titlePlayerIndexVarName, titlePlayerFrameVarName} from '../blocks/titlescreen';
import {registerKeypadPollSubroutine, generateJoystickDirection8Table,
  reserveJoystickDirection8DevVars, generateJoystickDirection8Checks,
  reserveJoystickButtonDevVars, reserveJoystickDoubleTapDevVars,
  generateJoystickButtonChecks, generateJoystickDoubleTapChecks, SWITCH_EDGE_FAMILY, switchEdgeOwnBits,
  reserveSwitchEdgeDevVars, generateSwitchEdgeChecks} from './bbasic/input';
import {collisionMoveOldXVar, collisionMoveOldYVar, collisionMoveOlderXVar, collisionMoveOlderYVar} from './bbasic/collision';
import {scoreBkColorVarName, generateScanlinesDebugScoreCode} from './bbasic/score';
import {processPlayerAnimationsStorageDefaults, generateRomNoiseChecks, generatePlayerHeightLimitChecks,
  reservePlayerHeightLimitDevVars, generateRainbowColorChecks,
  generateRainbowColorGraphics, rainbowColorNeedsPlayerColors, rainbowColorNeedsPlayer1Colors,
  reserveRomNoiseDevVars, reserveRainbowColorDevVars, reserveBackgroundRainbowDevVars,
  ROM_NOISE_FLAGS_FAMILY, MISSILE_FIRE_FLAGS_FAMILY, FIRE_OFFSCREEN_FLAGS_FAMILY, fireOffscreenFlagsVarName, SEEK_FLAGS_FAMILY, SEEK_ARRIVED_FLAGS_FAMILY,
  SPRITE_SCROLL_FLAGS_FAMILY, SPRITE_HIDDEN_FLAGS_FAMILY, hasHiddenFlag, hiddenFlagRef, INERTIA_ACCEL_FLAGS_FAMILY, INERTIA_DECEL_FLAGS_FAMILY,
  romNoiseOwnBit, rainbowColorOwnBit, BACKGROUND_RAINBOW_OWN_BIT, BACKGROUND_RAINBOW_LOADED_BIT, backgroundRainbowLoadedBit, romNoiseFlagsVarName, missileFireOwnBit, spriteOwnBit,
  backgroundColorTableLoVarName, backgroundColorTableHiVarName,
  missileFireDirVarName, generateMissileFireChecks, generateBounceStageChecks, reserveMissileFireDevVars, reserveMissileBounceDevVars,
  generateSeekChecks, reserveSeekDevVars, reserveSeekArrivedDevVars,
  reserveCtrlpfShadowDevVar, generateCtrlpfShadowSetup, missileWidthsVarName, reserveMissileWidthsDevVar, reserveDpcPlusShownDevVars, ctrlpfShadowVarName, resolveUsedPlayerAnimations,
  resolvePlayerAnimationFinishedWatches,
  generateInertiaChecks, reserveInertiaDevVars, reserveSpriteScrollDevVars, reserveSpriteHiddenDevVars, reserveSizeSetDevVars, sizeSetVarName, ROM_NOISE_EXTRA_FAMILY, isRomNoiseExtra, romNoiseExtraOwnBit,
  playerNameOfValue} from './bbasic/sprites';
import {resolveSeekArrivedWatches} from '../blocks/sprites';
import spriteLock, {reserveLockDevVars, generateLockChecks} from './bbasic/sprite-lock';
import {reservePfBoxDevVars, generatePfHitChecks} from './bbasic/pf-box-sub';
import {reserveBoxDevVars, generateBoxChecks, pairKey, isPlayerName} from './bbasic/sprite-box-width';
import {planFlagPool} from './bbasic/flag-pool';
import {resolveProjectMusic, MUSIC_PLAY_RESET_NAME, MUSIC_PLAY_BY_ID_NAME,
  musicPlayByIdArgVarName, musicPlaySongResetName,
  registerMusicPlayResetSubroutine, resolveMusicEventFlags,
  resolveNotePlayedInstruments, reserveMusicDevVars, setMusicDpcPlusPlan} from './bbasic/music';
import {reserveTextScrollDevVars, generateTextScrollAdvance, generateTextOffsetTables, resolveTextScrollConstants,
  setTextScrollConstants} from './bbasic/text-scroll';
import {generateTextStaticOffsetTables, generateTextRow2OffsetsTable, textLinesBaseVarName, textLinesMaxVarName,
  textRow2ColorVarName, textScrollCursorColorVarName, textEndIconColorVarName} from './bbasic/text-minikernel';

const handlebarsTemplate = Handlebars.compile(templateText);

// The app's  bookkeeping variables, and the letters they're aliased to on
// the standard (non-Superchip) kernel. Without Superchip RAM, batari Basic's
// playfield buffer physically occupies the same zero-page bytes as var0-var43
// (playfieldbase = var0's address), so those "var" slots aren't safe to use -
// only 26 single letters are available, and these 12 claim most of them.
//
// With Superchip enabled, the playfield buffer moves to the separate SARA
// chip RAM page instead, freeing var0-var43 (plus var44-var47, which are
// always free). Moving these system variables into var0-11 there instead of
// letters frees all 26 letters for user variables - see generateSystemDims
// and the letter pool below. var12-var43 (still unused even then) is where
// every OTHER dev/user variable goes first instead, before falling back to
// the letter pool - see SUPERCHIP_VAR_START and generateSuperchipVarDims.
//
// "loopcounter" (the "Repeat X times" block's  for-loop variable) and
// channnel0duration/channnel1duration (the sound-effect-duration/AUDV-auto-
// silence timers) used to live here too, unconditionally - both moved out to
// normal conditionally-reserved dev vars instead (see REPEAT_COUNTER_VAR_NAME
// in generators/bbasic/loops.js, reserved only when this.repeatLoopUsed, and
// this.channelDurationUsed's  pre-scan in init(), which also gates
// generateChannelDurationChecks below), since unlike every entry actually
// left here, neither is needed by every project: a project with zero
// "Repeat" blocks, or zero "Play sound" blocks and no music, was paying for
// these letters (or Superchip var0-14 slots) for nothing. Every var still
// listed below IS genuinely unconditional - each one gets written by a
// plain, unconditional line in the fixed per-frame template
// (bbasic.bb.hbs) itself, not by a block the user may or may not have used
// (confirmed directly for each: player0realcolor/player1realcolor/
// player0size/player1size restore COLUP0/COLUP1/NUSIZ0/NUSIZ1 every frame
// regardless, since the standard kernel's  score-digit drawing hijacks
// those same registers; framecounter increments every frame as a general-
// purpose fallback several OTHER features default to; player0frame/
// player1frame/player0animation/player1animation/newbackground are real
// batari Basic kernel identifiers the standard kernel itself requires to
// exist for ANY sprite/background to render at all).
// Third element of each entry is a very short description of why it's
// reserved - kept as real data (not just a JS comment) so generateSystemDims
// below can also emit it as a "rem" line right above the matching "dim" in
// the actual generated bBasic code, not just here in this source file.
// Listed in ascending letter order (l through z) - not grouped by feature the
// way an earlier version of this was - so the generated "dim" lines (see
// generateSystemDims below, which maps this array in order) and the ROM
// capacity display's "System reserved" list (hooks/rom.js's
// computeVariableUsage, same array/same order) both read as a straight a-z
// sequence, and a Superchip build's  var0-var11 numbering (also this
// array's  position, see generateSystemDims/backgroundRealColorRawTarget)
// follows that exact same order. Every other lookup here (findIndex by name)
// already adapts automatically to whatever order this array declares, so
// reordering it is safe by itself - nothing hardcodes a specific index.
export const SYSTEM_VARIABLES = [
  ['backgroundrealcolor', 'l', 'restores COLUBK every frame (score routine clobbers it)'],
  ['playfieldrealcolor', 'm', 'restores COLUPF every frame (score routine clobbers it)'],
  ['framecounter', 'n', 'free-running frame counter, default fallback for several features'],
  ['player1animation', 'o', 'which animation is currently playing on player1'],
  ['player0animation', 'p', 'which animation is currently playing on player0'],
  ['player1realcolor', 'q', 'restores COLUP1 every frame (score routine clobbers it)'],
  ['player0realcolor', 'r', 'restores COLUP0 every frame (score routine clobbers it)'],
  ['player1size', 's', 'restores NUSIZ1 every frame (score routine clobbers it)'],
  ['player0size', 't', 'restores NUSIZ0 every frame (score routine clobbers it)'],
  ['player0frame', 'x', 'real bB kernel var: which graphic frame player0 shows'],
  ['player1frame', 'y', 'real bB kernel var: which graphic frame player1 shows'],
  ['newbackground', 'z', 'real bB kernel var: which background is currently selected'],
];

// System variables a build can do without when nothing but the fixed template touches them. The value is the
// colour a "const" takes in the variable's place (null: the variable simply isn't declared). Which ones
// qualify is worked out by workspaceToCode below, from the generated code of a first pass.
const OMITTABLE_SYSTEM_VARIABLES = {
  framecounter: null,
  backgroundrealcolor: 0xC4,
  playfieldrealcolor: 0x0E,
  player1animation: null,
  player0animation: null,
  player1realcolor: 0x80,
  player0realcolor: 0x40,
};
// Marks the template lines that give a system variable its starting value, so they can be told apart from a
// block that writes the same value.
const SYSTEM_DEFAULT_MARKER = '; system default';

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const SYSTEM_VARIABLE_LETTERS = SYSTEM_VARIABLES.map(([, letter]) => letter);

// Letters left over for user-created variables when Superchip is off (the
// system variables above claim the rest). All 26 are available when
// Superchip is on, since the system variables move into var0-14 instead.
export const USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP =
  ALL_LETTERS.filter((letter) => !SYSTEM_VARIABLE_LETTERS.includes(letter));

// Where every dev/user variable (routeDevVar in init(), below) goes first,
// ahead of the letter pool, once Superchip is enabled (see
// generateSuperchipVarDims) - var0-var11 are SYSTEM_VARIABLES' (12
// entries, above), var44-var47 are always free regardless of Superchip (see
// text-minikernel.js/soundfx.js/score.js's  fixed dims there), so
// var12-var43 (32 slots) is free, unused RAM on every Superchip project
// today - confirmed via a project-wide grep, nothing else in this codebase
// references any of these slots. Once this fills up, routeDevVar falls back
// to the letter pool exactly as it always did, so a Superchip project's real
// total budget is 32 + 26 = 58 slots, not a hard 32-slot ceiling.
export const SUPERCHIP_VAR_START = 12;

// The blocks whose generated code reads the display memory into a scratch byte (see readScratchNames in init()), and how many extra
// scratch bytes a statement with many such reads can be given.
const READ_SCRATCH_BLOCK_TYPES = ['display_ram_get', 'data_stream_read'];
const MAX_EXTRA_READ_SCRATCH = 6;

// The Variables blocks a user variable may be used by and still live in the display memory (see displayRamEligibleNames in init()),
// and how many bytes of it there are for them: six areas of 128.
const DISPLAY_RAM_VARIABLE_BLOCK_TYPES = ['variables_get', 'variables_set', 'math_change'];
// How many uses of the variables spilled beyond the ones that have to be (see chooseSpill) the code may have: a few when the last
// build was nearly full, many when it left room.
const spillUseBudget = () => {
  // A build that keeps overflowing has no room for variables that did not have to move.
  if (Blockly.BBasic.spillTight) return 60;
  const capacity = useRomCapacity().value;
  return capacity && capacity.total && capacity.total.freeBytes > SPILL_ROOM_BYTES ? 2000 : 300;
};
const SPILL_ROOM_BYTES = 3000;
const DISPLAY_RAM_VAR_CAPACITY = 768;
export const SUPERCHIP_VAR_END = 43;

// DPC+'s own always-on bonus RAM pool - 9 plain zero-page bytes (var0-var8),
// declared unconditionally by the real compiler's DPCplusbB.h include
// (public/bb19/includes/DPCplusbB.h:157-165) purely because DPC+'s own
// kernel needs less zero-page RAM for itself than the standard kernel does,
// leaving these free. Completely unrelated to Superchip RAM (a different
// chip, a different address space, and mutually exclusive with DPC+ in
// practice - see Configuration.vue's own enableSuperchip=false-on-DPC+
// logic) - this pool exists on every DPC+ build regardless of any toggle,
// the same way SYSTEM_VARIABLES' own dims always exist regardless of
// Superchip, just routed through routeDevVar's competitive pool instead.
export const DPCPLUS_VAR_COUNT = 9;

// The DPC+ kernel keeps a block of memory for each of its virtual sprites (player1 up to player9): x, y, height and
// NUSIZ. Unless a Player 2 to 9 block is used this app only uses player1, so "set dpcspritemax 1" tells the kernel to
// leave the others alone and their bytes become variable slots, taken once the letters and var0-var8 are used up.
// Four bytes for each virtual sprite that is off (its x, y, height and NUSIZ). The Text Minikernel keeps its four fixed variables in the
// last ones, so those are left out when it is in use (reserveFixed).
// The Titlescreen Kernel works in the same memory (titlescreen/dpcfix.asm points its pointers and scratch bytes there): aux2,
// aux4, aux5 and aux6 are the x bytes of players 2, 4, 5 and 6, the pointers are players 2 and 3's y bytes and players 2 to 5's
// heights, and the score pointers are twelve bytes from player 6's height (through players 7 to 9's heights, _NUSIZ1 and NUSIZ2 to NUSIZ8).
// A project with a title screen leaves those bytes alone (titleKernel).
const DPCPLUS_TITLE_KERNEL_BYTES = ['player2x', 'player4x', 'player5x', 'player6x', 'player2y', 'player3y',
  ...[2, 3, 4, 5, 6, 7, 8, 9].map((n) => `player${n}height`), ...[2, 3, 4, 5, 6, 7, 8].map((n) => `NUSIZ${n}`)];
export const dpcPlusFreedSpriteRam = (spriteMax, reserveFixed = true, titleKernel = false) => [2, 3, 4, 5, 6, 7, 8, 9]
    .filter((n) => n > spriteMax)
    .flatMap((n) => [`player${n}x`, `player${n}y`, `player${n}height`, `NUSIZ${n}`])
    .filter((name) => !reserveFixed || !DPCPLUS_FIXED_VARIABLE_SLOTS.includes(name))
    .filter((name) => !titleKernel || !DPCPLUS_TITLE_KERNEL_BYTES.includes(name));
export const DPCPLUS_FREED_SPRITE_RAM = dpcPlusFreedSpriteRam(1);

// text12b.asm (see generators/bbasic/text-minikernel.js) uses the bare
// single-letter symbol "B" as its  scratch byte ("sta B" / "ldx B",
// confirmed 5 times in its always-active text-drawing routine, once per
// displayed row, never gated behind "extendedtxt") - assuming, like a
// hand-written batari Basic program would, that it's free to borrow. DASM
// resolves that "B" to the exact same address as this app's  lowercase
// "b" (2600basic.h defines single-letter variables case-insensitively), so
// any user variable this app assigns to "b" gets silently overwritten every
// frame the Text Minikernel draws - confirmed by direct RAM inspection: a
// second movement-axis speed variable landing on "b" turned to garbage every
// other frame with the Text Minikernel active, and stayed correct with it
// disabled, all else unchanged. Reserved here as a normal-looking user
// variable letter never actually is when the Text Minikernel is active -
// same reasoning as aux1/aux2 being off-limits for pfcolors above.
const TEXT_MINIKERNEL_RESERVED_LETTERS = ['b'];

// The "Run once" block bookkeeping (see event_run_once/
// generateRunOnceEdgeReset) used to be spliced directly into
// commongamelogic, always bank 1, with nowhere to go even when every other
// relocatable unit had room elsewhere - confirmed directly as the cause of
// otherwise-unexplained "gave up after 64 relocation attempts" failures
// that went away the instant "Run once" blocks were removed, independent of
// what was wrapped inside them. Registering it as an ordinary entry in
// Blockly.BBasic.subroutines (see init()) instead lets the exact same
// relocation machinery (getSubroutineBank/generateRelocatedSections/
// pickRelocationCandidate in hooks/rom.js) move it like any user-defined
// subroutine.
const RUN_ONCE_EDGE_RESET_NAME = '_run_once_edge_reset';
// The color fade routines (hand-written state machines, the biggest block of fixed per-frame code) run as an
// ordinary subroutine the same way, so a project that does not fit in bank 1 can move them out of it.
// How many digits the score has: the Score tab's choice, except that the cycle score (the remaining CPU cycles shown as the score)
// always has all six.
const scoreDigitsOf = (config) => config.enableCycleScore ? 6 : config.scoreDigits;
const BG_FADE_CHECKS_NAME = '_bg_fade_checks';
const ROW_FADE_CHECKS_NAME = '_row_fade_checks';
const BACKGROUND_LOAD_NAME = '_background_load';
// The routines were written to be spliced in as they are; as a subroutine the code goes through
// normalizeIndents, which wants labels marked with "@" and the closing "end" as "@end".
const asSubroutineBody = (code) => code.split('\n').map((line) => {
  const text = line.trim();
  if (text === '') return '';
  if (text === 'asm') return 'asm';
  if (text === 'end') return '@end';
  return /^[ ]/.test(line) ? text : '@' + text;
}).join('\n');
// Where the DPC+ kernel keeps the arguments of a Data table lookup by a runtime id (see reserveDevVarRW in init()).
const DPCPLUS_SCRATCH_ARGS = {tableLookupArg1: 'temp5', tableLookupArg2: 'temp6', tableLookupArg3: 'temp4'};

/**
 * JavaScript code generator.
 * @type {!Blockly.Generator}
 */
Blockly.BBasic = new Blockly.Generator('BBasic');

/**
 * List of illegal variable names.
 * This is not intended to be a security feature.  Blockly is 100% client-side,
 * so bypassing this list is trivial.  This is intended to prevent users from
 * accidentally clobbering a built-in object or function.
 * @private
 */
Blockly.BBasic.addReservedWords(
    // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Lexical_grammar#Keywords
    'break,case,catch,class,const,continue,debugger,default,delete,do,else,export,extends,finally,for,function,if,import,in,instanceof,new,return,super,switch,this,throw,try,typeof,var,void,while,with,yield,' +
    'enum,' +
    'implements,interface,let,package,private,protected,public,static,' +
    'await,' +
    'null,true,false,' +
    // Magic variable.
    'arguments,' +
    // Reserved for the internal "Run once" edge-reset subroutine (see
    // RUN_ONCE_EDGE_RESET_NAME), the shared music "Play song" reset
    // subroutine (see MUSIC_PLAY_RESET_NAME), and the "Play song by ID"
    // dispatch subroutine/scratch var (see MUSIC_PLAY_BY_ID_NAME/
    // musicPlayByIdArgVarName) - keeps a user subroutine/variable literally
    // named any of these from colliding with them. Per-song reset names (see
    // musicPlaySongResetName in bbasic/music.js) are only known once
    // this.projectMusic is resolved, so those are reserved separately, in
    // init() below.
    `${RUN_ONCE_EDGE_RESET_NAME},${MUSIC_PLAY_RESET_NAME},${MUSIC_PLAY_BY_ID_NAME},${musicPlayByIdArgVarName()},` +
    // temp1-temp6 (2600basic.h's  fixed scratch registers - see
    // public/bb19/includes/2600basic.h) - a user variable named e.g. "temp2"
    // wasn't being renamed away from that collision the way a JS-keyword-
    // named one already was above, so nameDB_.getName() handed it back
    // completely unchanged, and the generated code ended up declaring a NEW
    // "dim temp2 = ..." on top of 2600basic.h's  pre-existing
    // "temp2 = $9D" - two different addresses for the same symbol name,
    // which DASM reports as "EQU: Value mismatch" (confirmed directly: a
    // project with Blockly variables literally named temp/temp2/temp3
    // failed to assemble with exactly that error).
    // Deliberately NOT extended to every other pseudo-register 2600basic.h
    // defines (player0x, score, var0-47, single letters, etc.) - an earlier,
    // broader version of this list did exactly that and immediately broke
    // EVERY sprite/score/background block in the app instead: those blocks
    // pass their  already-known-safe register name through this SAME
    // nameDB_.getName(name, VARIABLE_CATEGORY_NAME) call (see e.g.
    // generators/bbasic/sprites.js), so reserving "player0x" made
    // getDistinctName rename that call's  output to "player0x2" - a
    // symbol nothing ever declares - on every single build, not just when a
    // user variable happened to collide with it. Confirmed directly as a
    // real regression (a working project failed with "Unknown Mnemonic
    // player0x2"/"missile1y2"/etc. throughout) before being reverted back to
    // just temp1-6, the one addition actually confirmed safe (never itself
    // passed through nameDB_ elsewhere - it's always spliced in as a raw
    // literal, e.g. generators/bbasic/bit.js).
    'temp1,temp2,temp3,temp4,temp5,temp6,' +
    // Everything in the current environment (835 items in Chrome, 104 in
    // Node). Blockly.utils.global (the cross-environment "window in a
    // browser, global in Node" indirection this used to read) was removed
    // entirely somewhere between Blockly 8 and 10 - confirmed directly
    // against the installed package, no file/declaration for it exists at
    // all any more. globalThis is the standard JS language feature that
    // makes that indirection unnecessary in the first place (landed in
    // every environment this app actually runs in well before Blockly
    // dropped its version of it), so this needs no Blockly API at all.
    Object.getOwnPropertyNames(globalThis).join(','));

/**
 * Order of operation ENUMs.
 * https://developer.mozilla.org/en/JavaScript/Reference/Operators/Operator_Precedence
 */
Blockly.BBasic.ORDER_ATOMIC = 0; // 0 "" ...
Blockly.BBasic.ORDER_NEW = 1.1; // new
Blockly.BBasic.ORDER_MEMBER = 1.2; // . []
Blockly.BBasic.ORDER_FUNCTION_CALL = 2; // ()
Blockly.BBasic.ORDER_INCREMENT = 3; // ++
Blockly.BBasic.ORDER_DECREMENT = 3; // --
Blockly.BBasic.ORDER_BITWISE_NOT = 4.1; // ~
Blockly.BBasic.ORDER_UNARY_PLUS = 4.2; // +
Blockly.BBasic.ORDER_UNARY_NEGATION = 4.3; // -
Blockly.BBasic.ORDER_LOGICAL_NOT = 4.4; // !
Blockly.BBasic.ORDER_TYPEOF = 4.5; // typeof
Blockly.BBasic.ORDER_VOID = 4.6; // void
Blockly.BBasic.ORDER_DELETE = 4.7; // delete
Blockly.BBasic.ORDER_AWAIT = 4.8; // await
Blockly.BBasic.ORDER_EXPONENTIATION = 5.0; // **
Blockly.BBasic.ORDER_MULTIPLICATION = 5.1; // *
Blockly.BBasic.ORDER_DIVISION = 5.2; // /
Blockly.BBasic.ORDER_MODULUS = 5.3; // %
Blockly.BBasic.ORDER_SUBTRACTION = 6.1; // -
Blockly.BBasic.ORDER_ADDITION = 6.2; // +
Blockly.BBasic.ORDER_BITWISE_SHIFT = 7; // << >> >>>
Blockly.BBasic.ORDER_RELATIONAL = 8; // < <= > >=
Blockly.BBasic.ORDER_IN = 8; // in
Blockly.BBasic.ORDER_INSTANCEOF = 8; // instanceof
Blockly.BBasic.ORDER_EQUALITY = 9; // == != === !==
Blockly.BBasic.ORDER_BITWISE_AND = 10; // &
Blockly.BBasic.ORDER_BITWISE_XOR = 11; // ^
Blockly.BBasic.ORDER_BITWISE_OR = 12; // |
Blockly.BBasic.ORDER_LOGICAL_AND = 13; // &&
Blockly.BBasic.ORDER_LOGICAL_OR = 14; // ||
Blockly.BBasic.ORDER_CONDITIONAL = 15; // ?:
Blockly.BBasic.ORDER_ASSIGNMENT = 16; // = += -= **= *= /= %= <<= >>= ...
Blockly.BBasic.ORDER_YIELD = 17; // yield
Blockly.BBasic.ORDER_COMMA = 18; // ,
Blockly.BBasic.ORDER_NONE = 99; // (...)

/**
 * List of outer-inner pairings that do NOT require parentheses.
 * @type {!Array<!Array<number>>}
 */
Blockly.BBasic.ORDER_OVERRIDES = [
  // (foo()).bar -> foo().bar
  // (foo())[0] -> foo()[0]
  [Blockly.BBasic.ORDER_FUNCTION_CALL, Blockly.BBasic.ORDER_MEMBER],
  // (foo())() -> foo()()
  [Blockly.BBasic.ORDER_FUNCTION_CALL, Blockly.BBasic.ORDER_FUNCTION_CALL],
  // (foo.bar).baz -> foo.bar.baz
  // (foo.bar)[0] -> foo.bar[0]
  // (foo[0]).bar -> foo[0].bar
  // (foo[0])[1] -> foo[0][1]
  [Blockly.BBasic.ORDER_MEMBER, Blockly.BBasic.ORDER_MEMBER],
  // (foo.bar)() -> foo.bar()
  // (foo[0])() -> foo[0]()
  [Blockly.BBasic.ORDER_MEMBER, Blockly.BBasic.ORDER_FUNCTION_CALL],

  // !(!foo) -> !!foo
  [Blockly.BBasic.ORDER_LOGICAL_NOT, Blockly.BBasic.ORDER_LOGICAL_NOT],
  // a * (b * c) -> a * b * c
  [Blockly.BBasic.ORDER_MULTIPLICATION, Blockly.BBasic.ORDER_MULTIPLICATION],
  // a + (b + c) -> a + b + c
  [Blockly.BBasic.ORDER_ADDITION, Blockly.BBasic.ORDER_ADDITION],
  // a && (b && c) -> a && b && c
  [Blockly.BBasic.ORDER_LOGICAL_AND, Blockly.BBasic.ORDER_LOGICAL_AND],
  // a || (b || c) -> a || b || c
  [Blockly.BBasic.ORDER_LOGICAL_OR, Blockly.BBasic.ORDER_LOGICAL_OR],
];

/**
 * Whether the init method has been called.
 * @type {?boolean}
 */
Blockly.BBasic.isInitialized = false;

/**
 * Initialise the database of variable names.
 * @param {!Blockly.Workspace} workspace Workspace to generate code from.
 */
Blockly.BBasic.init = function(workspace) {
  // Call Blockly.Generator's init.
  Object.getPrototypeOf(this).init.call(this);

  // Every DISTINCT envelope shape actually used anywhere in the project -
  // see registerEnvelopeConfig/resetEnvelopeConfigs in
  // generators/bbasic/soundfx.js for why this pool lives there (module-level
  // state, not on this Generator instance). MUST run before
  // resolveProjectMusic below - that call already registers every Music-tab
  // instrument's  envelope configs as a side effect of paging its note
  // data (see eventsToPages in generators/bbasic/music.js), and a stray
  // reset AFTER it (an earlier version of this had the reset much further
  // down, still inside this same init()) would silently wipe every config
  // Music just registered before any soundfx_play block ever got a chance
  // to re-add them - confirmed directly as a real bug: a project with
  // envelope enabled ONLY on a Music instrument (no matching "Play sound"
  // block anywhere) generated data correctly (both the note markers baking
  // in the RIGHT config index, and this channel's  _envelopeAdLen table)
  // but the per-frame dispatch that actually reads them
  // (generateEnvelopeChecks in soundfx.js) silently emitted nothing at all,
  // since by the time it ran the pool it reads from had already gone
  // back to empty.
  resetEnvelopeConfigs();

  // textMinikernelUsed/textMessages (see generators/bbasic/text-minikernel.js)
  // are set as a side effect of generating each Text block's code, but
  // nothing else ever clears them - without this reset, once any project
  // used a Text block even once in this session, every later build (even of
  // a workspace with no Text blocks at all) would keep emitting "const
  // textbank"/"const fontstyle"/the TextIndex dim and the text12a.asm/
  // text12b.asm inline forever, since this Generator instance is a shared
  // singleton reused across every workspaceToCode() call.
  this.textMinikernelUsed = false;
  this.textMessages = [];
  // Same reset reasoning as textMessages above, for free-typed "Show text:
  // <literal>" messages specifically (see registerFreeTypedMessage in
  // generators/bbasic/text-minikernel.js, which lazily does
  // `freeTypedMessages = freeTypedMessages || []` - that only ever CREATES
  // the array if missing, it never clears an existing one). Without this,
  // once any project used a free-typed Show Text block even once this
  // session, every later build would keep carrying that message (and every
  // other one ever seen this session, deduplicated by content but never
  // dropped) as an extra row in the Text Minikernel's  data table
  // forever - even after the block generating it was deleted - silently
  // inflating that table's size on every single build until the page was
  // hard-reloaded.
  this.freeTypedMessages = [];
  // Same reset reasoning as freeTypedMessages just below - ensureTextRow2Pairs
  // (generators/bbasic/text-minikernel.js) caches its  one-time-per-build
  // computation here; without resetting it, a later build would keep
  // reusing a stale set of offsets (and never even recompute them if the
  // Text tab's  entries changed).
  this.textRow2PairOffsets = null;
  // Same reset reasoning as freeTypedMessages above, for free-typed "Show
  // text (scrolling): <literal>" messages (see registerFreeTypedScrollMessage
  // in generators/bbasic/text-scroll.js).
  this.freeTypedScrollMessages = [];
  // Same reset reasoning as textMinikernelUsed above - see math.js's
  // math_arithmetic handler, which sets this as a side effect.
  this.usesDivMul = false;

  // Normally textMinikernelUsed only becomes true as a side effect of a Text
  // block's  generator running, which happens well after user variable
  // letters are assigned below - too late to keep user variables away from
  // TEXT_MINIKERNEL_RESERVED_LETTERS. A quick pre-scan (block types only, no
  // code generation) determines this early enough to matter, and is
  // harmless to redo: every text_minikernel_* block's  generator sets the
  // same flag again later regardless.
  if (workspace.getAllBlocks(false).some((block) => block.type.startsWith('text_minikernel_'))) {
    this.textMinikernelUsed = true;
  }

  // Whether the project actually uses any block that can make a message
  // scroll, or that reads/controls in-progress scroll state - as opposed to
  // plain, always-static "Show text"/"Show text ID"/"Show text [literal]"
  // blocks, which (per text-scroll.js's  maxOffsetExpr===0 fast path)
  // never touch the scroll dev vars at all. Gates reserveTextScrollDevVars
  // below AND generateTextScrollAdvance's  per-frame splice (see its
  // comment in text-scroll.js) - a project using only plain, static
  // Show-text blocks has no use for ANY of the 6 scroll dev vars, and used
  // to reserve all 6 anyway just because the Text Minikernel was active at
  // all, a real reported bug ("why are text scroll variables reserved when
  // there are no text scroll blocks in the project").
  const TEXT_SCROLL_BLOCK_TYPES = ['text_minikernel_show_named_scroll', 'text_minikernel_show_scroll',
    'text_minikernel_show_by_id_scroll', 'text_minikernel_scroll_control', 'text_minikernel_scroll_at'];
  this.textScrollUsed = workspace.getAllBlocks(false).some((block) => TEXT_SCROLL_BLOCK_TYPES.includes(block.type));
  // When every scrolling message uses the same speed and the same pause, those are compiled in as numbers
  // instead of kept in two variables.
  this.textScrollConstants = resolveTextScrollConstants(workspace);
  setTextScrollConstants(this.textScrollConstants);

  // Same early block-type pre-scan reasoning as textScrollUsed just above,
  // for "Scroll text lines up/down"'s  _textLinesBase/_textLinesMax dev
  // vars (see setTextLinesRangeCode's  comment in generators/bbasic/
  // text-minikernel.js) - a project using only plain "Show text" blocks
  // (even ones with "Wrap to line 2" on) has no use for either, since
  // nothing ever reads them without one of these two blocks present.
  const TEXT_LINE_SCROLL_BLOCK_TYPES = ['text_minikernel_line_scroll_up', 'text_minikernel_line_scroll_down',
    'text_minikernel_end_icon_visible'];
  // The "more below" scroll cursor (see text12b.asm's "textScrollCursor"
  // ifconst block) reads _textLinesMax/TextRow2Active directly in
  // hand-written asm, for WHATEVER message is currently shown - not just
  // ones a "Scroll text lines" block happens to act on - so it needs this
  // same tracking kept live from every "Show text" call too, same as if
  // such a block existed (see needsTextRow2ActiveDim's  comment in
  // generators/bbasic/text-minikernel.js for the TextRow2Active half of
  // this).
  // Whether any "Text: set color" block actually targets row 2 (its ROW
  // dropdown set to "2" or "both") - unlike isTextRow2Used() (which checks
  // Text tab data), this is a real block-field pre-scan, since row 1 is
  // that dropdown's  default and the common case doesn't touch row 2's
  // var at all. Used below to reserve _textRow2Color only when something
  // could actually write to it - a project using only row-1 color blocks
  // (or none at all) pays nothing for it.
  this.textRow2ColorBlockUsed = workspace.getAllBlocks(false).some((block) =>
    block.type === 'text_minikernel_set_color' && block.getFieldValue('ROW') === '2');
  // "Show text row 1/2" (text_minikernel_show_row) always compiles in a real
  // 2-row entry, regardless of which single row it's actually setting (see
  // registerFreeTypedRowMessage's  comment in generators/bbasic/
  // text-minikernel.js) - a real block-type pre-scan, since (unlike "Wrap to
  // line 2") nothing on the Text tab itself reflects this block's
  // existence. Folded into isTextRow2Used() below so a project using ONLY
  // this block (no Text tab entry ever wraps) still gets the real
  // textkernel2ndrow row-2-drawing kernel feature turned on.
  // Same "always compiles in a real 2-row entry" reasoning as
  // text_minikernel_show_row just above, for its named-dropdown and
  // runtime-id counterparts (text_minikernel_show_named_row/
  // text_minikernel_show_by_id_row) - any of the three needs TextRow2Active
  // real and dimmed.
  const TEXT_SHOW_ROW_BLOCK_TYPES = ['text_minikernel_show_row', 'text_minikernel_show_named_row',
    'text_minikernel_show_by_id_row'];
  this.textRowSetUsed = workspace.getAllBlocks(false).some((block) => TEXT_SHOW_ROW_BLOCK_TYPES.includes(block.type));
  // The blocks that can show a Text tab entry that wraps (see isTextRow2Used): the ones picking an entry by name
  // and the ones picking one by a number worked out while the game runs.
  this.textEntryShowBlocks = workspace.getAllBlocks(false).filter((block) =>
    block.type === 'text_minikernel_show_named' || block.type === 'text_minikernel_show_by_id');
  // Whether a "Show text row ID" block's  ROW dropdown is specifically
  // set to "2" - unlike ROW=1 (which reuses text_static_offsets[id]
  // unmodified, since an entry's row 1 already IS its  first line), ROW=2
  // needs its  separate, purpose-built text_row2_offsets[id] table (see
  // generateTextRow2OffsetsTable's  comment in generators/bbasic/
  // text-minikernel.js) - a project using only ROW=1 by-id blocks never
  // pays for that second, parallel copy of every Text tab entry's  first
  // line.
  this.textShowByIdRow2Used = workspace.getAllBlocks(false).some((block) =>
    block.type === 'text_minikernel_show_by_id_row' && block.getFieldValue('ROW') === '2');
  const textScrollCursorConfig = (useConfigurationStorage().value || {});
  this.textScrollCursorUsed = !!textScrollCursorConfig.enableTextScrollCursor;
  this.textLineScrollUsed =
    workspace.getAllBlocks(false).some((block) => TEXT_LINE_SCROLL_BLOCK_TYPES.includes(block.type)) ||
    this.textScrollCursorUsed;

  // Same early block-type pre-scan reasoning as textScrollUsed just above,
  // for "Show text with ID"/"Scroll text ID"'s  captured-argument var
  // (see functionCallDiscardVarName's  comment in blocks/function.js -
  // this reuses that shared var rather than a dedicated one) -
  // has to be known before reserveDevVar hands out user variable letters.
  this.textShowByIdUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'text_minikernel_show_by_id' || block.type === 'text_minikernel_show_by_id_scroll');

  // Same early block-type pre-scan reasoning as textMinikernelUsed just
  // above, for sprite_player_rom_noise (Player 0/1 share this combined
  // block type - see PLAYER_OPTIONS' comment in blocks/sprites.js; see
  // reserveRomNoiseDevVars'  comment in generators/bbasic/sprites.js) -
  // has to be known before reserveDevVar hands out user variable letters
  // below, well before either block's  generator would otherwise run.
  this.romNoiseUsedFor = new Set();
  this.dpcPlusNoiseRows = {};
  // DPC+ players that have a "Player set Height" block (see playerHeightLimitVarName).
  this.playerHeightLimitUsedFor = new Set();
  if ((useConfigurationStorage().value || {}).kernel === 'dpcplus') {
    workspace.getAllBlocks(false).forEach((block) => {
      const match = block.type === 'sprite_player_set' && block.isEnabled() &&
        /^player(\d)height$/.exec(block.getFieldValue('VAR') || '');
      if (match) this.playerHeightLimitUsedFor.add(`player${match[1]}`);
    });
  }
  // Same reasoning, for the separate sprite_*_rainbow_colors block (see
  // ROM_NOISE_COLOR_REGISTERS' comment in generators/bbasic/sprites.js)
  // - pre-scanned here too (not just read when its  generator runs) so
  // generateConfiguration's "set kernel_options" line (built well
  // before any block generator runs) knows whether to include
  // "playercolors"/"player1colors".
  this.rainbowColorUsedFor = new Set();
  // An offset that is a plain number, a variable or left empty (the frame
  // counter) can be read where it is used, so the block needs no variable to hold it.
  // Anything else (an expression, a random number) keeps one.
  // Per target: null when a variable is needed, else how to read the offset.
  const simpleOffset = (blocks) => {
    if (!blocks.length) return null;
    const plans = blocks.map((block) => {
      const target = block.getInputTargetBlock('OFFSET');
      if (!target) return {kind: 'framecounter'};
      if (target.type === 'math_number') return {kind: 'number', value: Math.round(Number(target.getFieldValue('NUM')) || 0)};
      if (target.type === 'variables_get') return {kind: 'variable', id: target.getFieldValue('VAR')};
      return null;
    });
    const first = JSON.stringify(plans[0]);
    return plans.every((plan) => plan && JSON.stringify(plan) === first) ? plans[0] : null;
  };
  this.rainbowSimpleOffset = {
    background: simpleOffset(workspace.getAllBlocks(false).filter((block) =>
      block.type === 'background_rainbow_colors' && block.isEnabled())),
    player0: simpleOffset(workspace.getAllBlocks(false).filter((block) =>
      block.type === 'sprite_player_rainbow_colors' && block.isEnabled() && block.getFieldValue('PLAYER') === '0')),
    player1: simpleOffset(workspace.getAllBlocks(false).filter((block) =>
      block.type === 'sprite_player_rainbow_colors' && block.isEnabled() && block.getFieldValue('PLAYER') === '1')),
  };
  this.backgroundRainbowUsed = workspace.getAllBlocks(false).some((block) =>
    (block.type === 'background_rainbow_colors' || block.type === 'background_rainbow_colors_stop') &&
    block.isEnabled());
  dpcPlusBackgroundRainbow = this.backgroundRainbowUsed;
  // isEnabled() (not just block.type) - a disabled block's  generator
  // never runs (Blockly's blockToCode skips disabled blocks, so the trigger
  // that would set the shared active bit never emits), but this pre-scan
  // used to count it anyway - forcing kernel_options ("playercolors"/
  // "player1colors"), the pfcolors table, and the blank-lines override on
  // for a feature that was actually inert, a real reported bug ("the
  // rainbow block is being exported even when disabled").
  // sprite_player_rom_noise/rainbow_colors (and their _stop counterparts)
  // are single combined block types now (Player 0/Player 1 share them, see
  // PLAYER_OPTIONS' comment in blocks/sprites.js), so which player a
  // given block counts for comes from its  PLAYER field, not the block
  // type string - same pattern seekUsedFor below already uses for
  // object_seek_to's  OBJECT dropdown.
  // Players 2 to 9 (DPC+ only).
  workspace.getAllBlocks(false).forEach((block) => {
    if ((block.type === 'sprite_player_rom_noise' || block.type === 'sprite_player_rom_noise_stop') && block.isEnabled() &&
      (useConfigurationStorage().value || {}).kernel === 'dpcplus' && /^[2-9]$/.test(block.getFieldValue('PLAYER'))) {
      this.romNoiseUsedFor.add(`player${block.getFieldValue('PLAYER')}`);
    }
  });
  ['player0', 'player1'].forEach((name) => {
    const player = name === 'player1' ? '1' : '0';
    if (workspace.getAllBlocks(false).some((block) =>
      (block.type === 'sprite_player_rom_noise' || block.type === 'sprite_player_rom_noise_stop') &&
      block.getFieldValue('PLAYER') === player && block.isEnabled())) {
      this.romNoiseUsedFor.add(name);
    }
    // A player whose ROM noise blocks all give the same plain number as the height needs no byte for it: the number is
    // built in (the same idea as a Fire block with one speed).
    this.romNoiseConstHeight = {};
    const noiseHeights = {};
    workspace.getAllBlocks(false).forEach((block) => {
      if (block.type !== 'sprite_player_rom_noise' || !block.isEnabled()) return;
      const owner = `player${block.getFieldValue('PLAYER')}`;
      const heightBlock = block.getInputTargetBlock('HEIGHT');
      const value = !heightBlock ? 8 : heightBlock.type === 'math_number' ? Number(heightBlock.getFieldValue('NUM')) : NaN;
      (noiseHeights[owner] = noiseHeights[owner] || []).push(value);
    });
    Object.keys(noiseHeights).forEach((owner) => {
      const values = noiseHeights[owner];
      if (values.every((value) => Number.isInteger(value) && value >= 0 && value <= 255 && value === values[0])) {
        this.romNoiseConstHeight[owner] = values[0];
      }
    });
    // Under DPC+ a player's y marks its top edge, so a player with ROM noise needs its noise height (not its
    // graphic's) to put its bottom where the standard kernel does. Only a plain number is known ahead of time.
    workspace.getAllBlocks(false).forEach((block) => {
      if (block.type !== 'sprite_player_rom_noise' || !block.isEnabled() || block.getFieldValue('PLAYER') !== player) return;
      const heightBlock = block.getInputTargetBlock('HEIGHT');
      const rows = heightBlock && heightBlock.type === 'math_number' ? Number(heightBlock.getFieldValue('NUM')) : 0;
      if (rows > 0) this.dpcPlusNoiseRows[name] = Math.max(this.dpcPlusNoiseRows[name] || 0, rows);
    });
    if (workspace.getAllBlocks(false).some((block) =>
      (block.type === 'sprite_player_rainbow_colors' || block.type === 'sprite_player_rainbow_colors_stop') &&
      block.getFieldValue('PLAYER') === player && block.isEnabled())) {
      this.rainbowColorUsedFor.add(name);
    }
  });

  // Missile 0/1 share the combined sprite_missile_fire block type (see
  // MISSILE_OPTIONS' comment in blocks/sprites.js), so which object a
  // Fire block counts for comes from its  MISSILE field for those two
  // names, and for the Ball too (the Fire block's dropdown has a Ball entry).
  // object_bounce (one block, OBJECT
  // dropdown covers all 5 names - see its  comment in blocks/sprites.js)
  // counts too for missile0/missile1/ball specifically, not just Fire - it
  // reads/writes the exact same dirVar (see its  generator's comment),
  // so a project using Bounce without ever placing a matching Fire block
  // still needs dirVar reserved. Never true for player0/player1 here -
  // Players have no dirVar/Fire concept at all, regardless of whether they
  // have their  object_bounce block (that's gated by inertiaUsedFor
  // instead - see missileBounceUsedFor's  pre-scan below).
  // The Fire block's dropdown value for each object it can fire.
  const fireOrBounceBlockMatchesName = (block, name) => {
    if (block.type === 'object_bounce') return block.getFieldValue('OBJECT') === name;
    return (block.type === 'sprite_missile_fire' || block.type === 'sprite_fire_angle_get') &&
      block.getFieldValue('MISSILE') === fireObjectFieldValue(name);
  };

  // Same early block-type pre-scan reasoning as romNoiseUsedFor above, for
  // sprite_missile_fire (see reserveMissileFireDevVars'
  // comment in generators/bbasic/sprites.js) - has to be known before
  // reserveDevVar hands out user variable letters below. The matching
  // bounce block counts too, not just fire - it reads/writes the exact same
  // dirVar (see its  generator's comment), so a project using Bounce
  // without ever placing a matching Fire block still needs dirVar reserved.
  // Every object a Fire block names: the missiles and ball, and any player.
  const fireObjectNames = ['missile0', 'missile1', 'ball'];
  workspace.getAllBlocks(false).forEach((block) => {
    const player = block.type === 'sprite_missile_fire' && /^player[0-9]$/.test(block.getFieldValue('MISSILE'));
    if (player && !fireObjectNames.includes(block.getFieldValue('MISSILE'))) fireObjectNames.push(block.getFieldValue('MISSILE'));
  });
  this.missileFireUsedFor = new Set();
  // The objects a "has gone off screen" block asks about (only ones a Fire block launches have anything to report).
  this.fireOffscreenUsedFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'object_fire_offscreen' && block.isEnabled()) this.fireOffscreenUsedFor.add(block.getFieldValue('OBJECT'));
  });
  fireObjectNames.forEach((name) => {
    if (workspace.getAllBlocks(false).some((block) =>
      fireOrBounceBlockMatchesName(block, name) && block.isEnabled())) {
      this.missileFireUsedFor.add(name);
    }
  });
  this.fireOffscreenUsedFor = new Set([...this.fireOffscreenUsedFor].filter((name) => this.missileFireUsedFor.has(name)));

  // Whether ANY Fire block for this object has the "16 directions" checkbox
  // on (see generateMissileFireChecks' comment in generators/bbasic/
  // sprites.js for the two dispatch tables this picks between) - a
  // compile-time, per-OBJECT decision, same reasoning as every other "used
  // for" pre-scan here: the per-frame movement check is only ever spliced
  // in once per object, not once per block, so if any one Fire block for a
  // given missile/ball wants the finer 16-step angle scale, that object's
  // whole dispatch table has to be built for it - a project mixing an
  // 8-way Fire and a 16-way Fire on the SAME object would have the second
  // one silently reinterpreted on the 16-way scale too, since dirVar itself
  // has no room to record which scale produced it.
  this.missileFire16UsedFor = new Set();
  fireObjectNames.forEach((name) => {
    if (workspace.getAllBlocks(false).some((block) =>
      block.type === 'sprite_missile_fire' && block.isEnabled() && block.getFieldValue('DIRECTIONS16') === 'TRUE' &&
      block.getFieldValue('MISSILE') === fireObjectFieldValue(name))) {
      this.missileFire16UsedFor.add(name);
    }
  });

  // Objects whose Fire blocks all use the same plain number for the speed: that
  // speed is a constant, so no variable is needed to hold it.
  this.missileFireConstSpeed = new Map();
  fireObjectNames.forEach((name) => {
    // A "Set fired speed" block changes it while the object moves, so it needs its variable.
    if (workspace.getAllBlocks(false).some((block) =>
      block.type === 'sprite_fire_speed_set' && block.isEnabled() &&
      block.getFieldValue('MISSILE') === fireObjectFieldValue(name))) return;
    const blocks = workspace.getAllBlocks(false).filter((block) =>
      block.type === 'sprite_missile_fire' && block.isEnabled() &&
      block.getFieldValue('MISSILE') === fireObjectFieldValue(name));
    if (!blocks.length) return;
    const values = blocks.map((block) => {
      const target = block.getInputTargetBlock('SPEED');
      if (!target || target.type !== 'math_number') return null;
      const value = Math.round(Number(target.getFieldValue('NUM')));
      return Number.isFinite(value) ? Math.max(0, Math.min(7, value)) : null;
    });
    if (values.every((value) => value !== null && value === values[0])) {
      this.missileFireConstSpeed.set(name, values[0]);
    }
  });

  // Which objects have a Fire block with "throttle movement" ticked: only those
  // need the countdown variables.
  this.missileFireThrottleUsedFor = new Set();
  fireObjectNames.forEach((name) => {
    if (workspace.getAllBlocks(false).some((block) =>
      block.type === 'sprite_missile_fire' && block.isEnabled() && block.getFieldValue('THROTTLE') === 'TRUE' &&
      block.getFieldValue('MISSILE') === fireObjectFieldValue(name))) {
      this.missileFireThrottleUsedFor.add(name);
    }
  });

  // Which objects have a Fire block with "check playfield while moving" on:
  // that object's per-frame movement is built as one-pixel sub-steps with a
  // playfield check after each (see generateMissileFireChecks).
  this.missileFirePfCheckUsedFor = new Set();
  fireObjectNames.forEach((name) => {
    if (workspace.getAllBlocks(false).some((block) =>
      block.type === 'sprite_missile_fire' && block.isEnabled() && block.getFieldValue('PFCHECK') === 'TRUE' &&
      block.getFieldValue('MISSILE') === fireObjectFieldValue(name))) {
      this.missileFirePfCheckUsedFor.add(name);
    }
  });

  // Same early block-type pre-scan reasoning as missileFireUsedFor above,
  // for object_bounce's  Combat-style stage/frame state (see
  // missileBounceStageVarName's  comment in generators/bbasic/sprites.js)
  // - narrower than missileFireUsedFor above (Bounce actually placed, not
  // just dirVar being needed), since this extra state is only ever touched
  // by Bounce's  generator. Unlike missileFireUsedFor, this covers all
  // 5 names (object_bounce works for Player 0/1 too, via Inertia's
  // velocity - see its  generator).
  this.missileBounceUsedFor = new Set();
  // Bounce blocks ticked "off screen edges" need none of that stage state and
  // are tracked separately: a fired missile/ball that has one keeps moving
  // off-screen so the block can bounce it (see generateMissileFireChecks).
  this.missileEdgeBounceUsedFor = new Set();
  const bouncedNames = new Set(['player0', 'player1', 'missile0', 'missile1', 'ball']);
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'object_bounce') bouncedNames.add(block.getFieldValue('OBJECT'));
  });
  [...bouncedNames].forEach((name) => {
    const bounceBlocks = workspace.getAllBlocks(false).filter((block) =>
      block.type === 'object_bounce' && block.isEnabled() && block.getFieldValue('OBJECT') === name);
    if (bounceBlocks.some((block) => block.getFieldValue('EDGES') !== 'TRUE')) {
      this.missileBounceUsedFor.add(name);
    }
    if (bounceBlocks.some((block) => block.getFieldValue('EDGES') === 'TRUE')) {
      this.missileEdgeBounceUsedFor.add(name);
    }
  });

  // Same early block-type pre-scan reasoning as missileFireUsedFor above,
  // for screen_shake's  dev var (see SHAKE_SCREEN_MAX_FRAMES's
  // comment in generators/bbasic/background.js) - a single boolean, not
  // a per-name Set, since there's only ever one screen. Also read directly
  // by generateConfiguration() further down to gate emitting "const
  // shakescreen = 1", the standard kernel's  switch for this feature.
  this.screenShakeUsed = workspace.getAllBlocks(false).some((block) =>
    block.type === 'screen_shake' && block.isEnabled());

  // Same early block-type pre-scan reasoning as missileFireUsedFor above,
  // for object_seek_to (see reserveSeekDevVars'  comment in
  // generators/bbasic/sprites.js) - a single block type (an OBJECT dropdown
  // picks the sprite name, unlike Fire's one-block-per-missile shape), so
  // this reads that field directly rather than matching one block type per
  // name.
  this.seekUsedFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'object_seek_to' && block.isEnabled()) {
      this.seekUsedFor.add(block.getFieldValue('OBJECT'));
    }
  });

  // The players whose position a playfield collision block tries (the Undo last move block), and the extra players (2 to 9) some
  // block asks whether they are in the playfield: those get a byte each frame (see generators/bbasic/pf-box-sub.js).
  this.pfBoxPlayers = new Set();
  this.pfHitExtras = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (!block.isEnabled()) return;
    if (block.type === 'collision_check_position') {
      const player = `player${block.getFieldValue('PLAYER')}`;
      this.pfBoxPlayers.add(player);
      if (/^player[2-9]$/.test(player)) this.pfHitExtras.add(player);
    } else if (block.type === 'collision_get') {
      const names = [block.getFieldValue('VAR0'), block.getFieldValue('VAR1')];
      if (names.includes('playfield')) {
        names.filter((name) => /^player[2-9]$/.test(name)).forEach((name) => this.pfHitExtras.add(name));
      }
    }
  });
  this.pfHitExtras.forEach((player) => this.pfBoxPlayers.add(player));

  // The sprites a Lock or an Unlock block makes a child (see generators/bbasic/sprite-lock.js), and for each child the parents the
  // Lock blocks give it.
  this.lockChildren = new Set();
  this.lockedBy = new Map();
  workspace.getAllBlocks(false).forEach((block) => {
    if (!block.isEnabled() || (block.type !== 'sprite_lock' && block.type !== 'sprite_unlock')) return;
    const child = block.getFieldValue('CHILD');
    this.lockChildren.add(child);
    if (block.type === 'sprite_lock' && block.getFieldValue('PARENT') !== child) {
      if (!this.lockedBy.has(child)) this.lockedBy.set(child, new Set());
      this.lockedBy.get(child).add(block.getFieldValue('PARENT'));
    }
  });

  // Same shape as seekUsedFor above, for sprite_scroll_with_playfield_set/
  // _get (see reserveSpriteScrollDevVars' comment in generators/bbasic/
  // sprites.js) - both block types share one OBJECT dropdown, so either one
  // counts toward a name being "in use."
  // The standard kernel's players that a visibility block names (set or get): each has a hidden flag, see
  // SPRITE_HIDDEN_FLAGS_FAMILY in generators/bbasic/sprites.js.
  this.spriteHiddenUsedFor = new Set();
  if ((useConfigurationStorage().value || {}).kernel !== 'dpcplus') {
    workspace.getAllBlocks(false).forEach((block) => {
      const named = block.type === 'sprite_player_set' ? /^(player[01])visibility$/.exec(block.getFieldValue('VAR') || '') :
        block.type === 'sprite_player_get' ? /^__(player[01])visible_$/.exec(block.getFieldValue('VAR') || '') : null;
      if (named) this.spriteHiddenUsedFor.add(named[1]);
    });
  }
  this.spriteScrollUsedFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if ((block.type === 'sprite_scroll_with_playfield_set' ||
        block.type === 'sprite_scroll_with_playfield_get') && block.isEnabled()) {
      this.spriteScrollUsedFor.add(block.getFieldValue('OBJECT'));
    }
  });

  // Every object_seek_arrived watch (see resolveSeekArrivedWatches's
  // comment in blocks/sprites.js) - needed this early so
  // seekArrivedFlagsVarName only gets reserved when at least one such watch
  // really exists, same reasoning as backgroundFadeFinishedWatches above.
  this.seekArrivedWatches = resolveSeekArrivedWatches(workspace);

  // Same early block-type pre-scan reasoning as seekUsedFor above, for
  // sprite_inertia_accelerate/sprite_inertia_decelerate (see
  // reserveInertiaDevVars'  comment in generators/bbasic/sprites.js).
  // inertiaUsedFor is the union of both (velocityX/Y are needed whenever
  // EITHER targets a sprite); inertiaAccelUsedFor/inertiaDecelUsedFor are
  // narrower, gating only their  feature-specific vars - same
  // "general + narrower" shape missileFireUsedFor/missileBounceUsedFor
  // already use.
  // inertiaAccel16UsedFor - same reasoning as missileFire16UsedFor above,
  // just read directly off the single sprite_inertia_accelerate block type's
  // DIRECTIONS16 field (no per-name block type to match, unlike Fire).
  // inertiaFineUsedFor - names where EITHER sprite_inertia_accelerate's or
  // sprite_inertia_decelerate's "Fine" checkbox is on (see both blocks'
  // tooltips in blocks/sprites.js) - velocity becomes a genuine 16-bit
  // signed fixed-point pair (whole-pixel byte + fractional byte) for a name
  // in this set, so it's a per-NAME property shared by both blocks, not
  // independently toggleable per block-instance (position stepping in
  // generateInertiaChecks below has to know, for the whole sprite, whether
  // velocity is plain-integer or fixed-point).
  this.inertiaUsedFor = new Set();
  this.inertiaAccelUsedFor = new Set();
  this.inertiaAccel16UsedFor = new Set();
  this.inertiaDecelUsedFor = new Set();
  this.inertiaFineUsedFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (!block.isEnabled()) return;
    if (block.type === 'sprite_inertia_accelerate') {
      const name = block.getFieldValue('OBJECT');
      this.inertiaUsedFor.add(name);
      this.inertiaAccelUsedFor.add(name);
      if (block.getFieldValue('DIRECTIONS16') === 'TRUE') this.inertiaAccel16UsedFor.add(name);
      if (block.getFieldValue('FINE') === 'TRUE') this.inertiaFineUsedFor.add(name);
    }
    if (block.type === 'sprite_inertia_decelerate') {
      const name = block.getFieldValue('OBJECT');
      this.inertiaUsedFor.add(name);
      this.inertiaDecelUsedFor.add(name);
      if (block.getFieldValue('FINE') === 'TRUE') this.inertiaFineUsedFor.add(name);
    }
  });

  // Same early block-type pre-scan reasoning as above, for CTRLPF's  RAM
  // shadow (see reserveCtrlpfShadowDevVar's  comment in generators/
  // bbasic/sprites.js) - sprite_priority_set is its  dedicated block
  // type, but ball width is just one VAR choice on the generic
  // sprite_ball_set setter. VAR is a plain field_dropdown (see blocks/
  // sprites.js's  buildSpriteBlocks), not a Blockly variable field, so
  // its value IS the literal name string already ('ballwidth') - comparing
  // it directly here, exactly like the generator's `varName === 'ballwidth'`
  // check does after resolving it through nameDB_. Two wrong approaches
  // tried and ruled out first: workspace.getVariableById(fieldValue) always
  // returned nothing (fieldValue was never a variable ID to begin with, so
  // this pre-scan silently never found ball width in use); routing through
  // this.nameDB_.getName(...) crashed instead, since nameDB_ isn't
  // constructed yet this early in init() (it's set up further down, well
  // after this pre-scan section runs).
  // Missile widths live in a separate byte (see missileWidthsVarName), reserved only when a block sets one.
  this.missileWidthUsed = workspace.getAllBlocks(false).some((block) => block.isEnabled() &&
    (block.type === 'sprite_missile_size' ||
     (block.type === 'sprite_missile_set' && /^missile[01]width$/.test(block.getFieldValue('VAR') || ''))));
  this.ctrlpfShadowUsed = workspace.getAllBlocks(false).some((block) => {
    if (!block.isEnabled()) return false;
    if (block.type === 'sprite_priority_set') return true;
    if (block.type === 'sprite_ball_set') return block.getFieldValue('VAR') === 'ballwidth';
    // background_collision_pixel reads ball width back off this same shadow
    // (see spriteCollisionCoords'  comment in generators/bbasic/
    // background.js - the real CTRLPF register can't be read back safely)
    // whenever it targets Ball, even if no other block in the project ever
    // touches ball width/priority itself.
    if (block.type === 'background_collision_pixel' || block.type === 'background_collision_pixel_direction') {
      return block.getFieldValue('SPRITE') === 'ball';
    }
    return false;
  });

  // background_collision_pixel's  result/scratch vars (see generators/
  // bbasic/background.js) - reserved whenever any enabled instance exists
  // anywhere in the project, regardless of which SPRITE it targets (unlike
  // ctrlpfShadowUsed just above, which only cares about the Ball case).
  this.collisionPixelUsed = workspace.getAllBlocks(false).some((block) =>
    (block.type === 'background_collision_pixel' || block.type === 'background_collision_pixel_direction') &&
    block.isEnabled());

  // Same early block-type pre-scan reasoning as the ones above - see
  // controls_repeat_ext's  comment in generators/bbasic/loops.js for
  // why a "repeat" block whose count is a complex expression needs its
  // dedicated, properly-declared variable (REPEAT_BOUND_VAR_NAME below),
  // not a shared scratch register like temp1 - has to be known before
  // reserveDevVar hands out user variable letters below, well before that
  // block's  generator would otherwise run.
  this.repeatLoopUsed = workspace.getAllBlocks(false).some((block) =>
    (block.type === 'controls_repeat_ext' || block.type === 'controls_repeat') && block.isEnabled());
  // Same pre-scan, but specifically for whether REPEAT_BOUND_VAR_NAME
  // itself is needed - repeatBoundVarNeeded (generators/bbasic/loops.js)
  // mirrors controls_repeat_ext's  generator to tell a plain-literal/
  // bare-variable count (never needs the var) apart from a genuinely
  // complex one (the only case that does), so a project whose every
  // "Repeat" block uses a simple count doesn't reserve this at all.
  this.repeatBoundVarUsed = workspace.getAllBlocks(false).some((block) =>
    (block.type === 'controls_repeat_ext' || block.type === 'controls_repeat') && block.isEnabled() &&
    repeatBoundVarNeeded(block, Blockly));

  // Same early pre-scan reasoning as repeatLoopUsed just above, for
  // WAIT_FRAMES_COUNTER_VAR_NAME (see its  comment in
  // generators/bbasic/loops.js) - "Wait N frames" needs its  dedicated
  // loop counter, not the shared "repeatcounter" a "repeat" block's
  // "for" loop uses, so the two can be safely nested.
  this.waitFramesUsed = workspace.getAllBlocks(false).some((block) =>
    block.type === 'wait_frames' && block.isEnabled());

  // Whether a "Score set background color" block (score_bk_color_set) is
  // used anywhere - when it is, scorebkcolor can never safely alias onto
  // backgroundrealcolor (see scoreBkColorNeedsOwnVar's  comment just
  // below for why that aliasing exists at all), no matter what the Score
  // tab's  picker says: writing through the alias would overwrite
  // backgroundrealcolor itself, visibly recoloring the WHOLE screen instead
  // of just the score row. Confirmed as a real reported bug - a project
  // using this block, with the picker left at its  default ("Use
  // background color"), had every "Score set background color" call
  // silently repaint the entire background instead.
  this.usesScoreBkColorSetter = workspace.getAllBlocks(false)
      .some((block) => block.type === 'score_bk_color_set' && block.isEnabled());

  // Whether scorebkcolor (the Score tab's  background color picker - see
  // views/ScoreFontEditor.vue and generators/bbasic/score.js's
  // generateScoreBkColorRuntimeDims) needs its  dedicated dev var -
  // whenever the Text Minikernel is active AND either the picker isn't set
  // to "Use background color", or a "Score set background color" block is
  // used (see usesScoreBkColorSetter just above) - either one means
  // scorebkcolor can't just alias onto the existing backgroundrealcolor
  // system variable, needing nothing reserved here. Same early-pre-scan
  // reasoning as textMinikernelUsed itself: needed before variable letters
  // are handed out below.
  {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // DPC+ draws the score row's background from a one-shot "minikernel" routine (see
    // generateDpcPlusBankPreamble), which only needs a byte of RAM when a block changes the color.
    this.scoreBkColorNeedsOwnVar = config.kernel === 'dpcplus' ? this.usesScoreBkColorSetter :
      this.isTextMinikernelActive() &&
      (this.usesScoreBkColorSetter || !this.scoreBkColorIsBackground(config.scoreBkColor));
  }

  // Collects every distinct (axis, object pair) a "Distance" getter block
  // picks (see blocks/input.js), keyed by the same canonical name its
  // getDeveloperVariables and getter generator use (generators/bbasic/
  // input.js), so generateDistanceChecks can compute each unique pair
  // exactly once per frame regardless of how many blocks reference it.
  this.distanceChecks = new Map();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'distance_x_get' && block.type !== 'distance_y_get') return;
    const axis = block.type === 'distance_x_get' ? 'x' : 'y';
    const obj0 = block.getFieldValue('VAR0');
    const obj1 = block.getFieldValue('VAR1');
    this.distanceChecks.set(canonicalDistanceVarName(axis, obj0, obj1), {axis, obj0, obj1});
  });

  // Whether any "Keypad 0/1: key X is pressed" getter block is actually on
  // the canvas (see blocks/input.js) - has to be known before reserveDevVar
  // hands out user variable letters below, same early-pre-scan reasoning as
  // textMinikernelUsed/repeatLoopUsed above. Kept as two independent flags
  // (not one "keypadUsed"), not "isEnabled()"-filtered like romNoiseUsedFor
  // above (a keypad getter block, unlike those, is a plain value block with
  // no "stop" counterpart to be inconsistent with - a disabled one simply
  // never gets read, same as any other unused variable) - see
  // generators/bbasic/input.js's buildKeypadPollAsm/keypadSwacntMask for why
  // scanning only the port(s) actually in use matters (leaves the other
  // port's SWCHA bits as inputs, so an ordinary joystick can still be
  // plugged into it).
  // "Any key is pressed"/"Key ID pressed" (see blocks/input.js's
  // buildKeypadAnyPressedBlock/buildKeypadIdBlock) both read the exact same
  // per-frame poll byte as "key X is pressed" above, just compared/exposed
  // differently - included in this same used-scan so using ONLY one of
  // these newer blocks (with no "key X is pressed" block anywhere) still
  // reserves the poll byte and runs the scan.
  const KEYPAD_BLOCK_TYPES = ['input_keypad_get', 'input_keypad_any_pressed', 'input_keypad_id_get'];
  this.keypad0Used = workspace.getAllBlocks(false).some((block) =>
    KEYPAD_BLOCK_TYPES.includes(block.type) && block.getFieldValue('KEYPAD') !== '1');
  this.keypad1Used = workspace.getAllBlocks(false).some((block) =>
    KEYPAD_BLOCK_TYPES.includes(block.type) && block.getFieldValue('KEYPAD') === '1');

  // Which OPERATION(s) "Background [Set/Clear/Flip] line from X/Y to X/Y"
  // actually uses, project-wide - a real block-field pre-scan, since (unlike
  // the fixed straight runs background_change_hv_line can pre-flatten at
  // compile time) an arbitrary line's  endpoints can be variables, so
  // this needs a real runtime Bresenham's-line-algorithm subroutine (see
  // registerBackgroundLineSubroutine in generators/bbasic/background.js) -
  // one PER operation actually used (a project using only "Set" line blocks
  // never pays for a "Clear"/"Flip" copy), and a project using none of this
  // block at all pays nothing for its  dev vars either.
  this.backgroundLineOperationsUsed = new Set(
      workspace.getAllBlocks(false)
          .filter((block) => block.type === 'background_draw_line')
          .map((block) => block.getFieldValue('OPERATION')));
  this.backgroundLineUsed = this.backgroundLineOperationsUsed.size > 0;

  // Whether any "Draw title screen" block exists at all - has to be known
  // before reserveDevVar hands out user variable letters below (see
  // titleScreenSelectedIdVarName's  reservation further down), same
  // pattern as keypad0Used/keypad1Used just above.
  this.titleScreenDrawUsed = workspace.getAllBlocks(false).some((block) => block.type === 'titlescreen_draw');
  // Whether any block sets or changes where a sprite is (or fires a missile or ball from a spot).
  this.spritePositionBlocksUsed = workspace.getAllBlocks(false).some((block) => block.isEnabled() &&
    ((/^sprite_(player|missile|ball)_(set|change)$/.test(block.type) &&
      /^(player[01]|missile[01]|ball)[xy]$/.test(block.getFieldValue('VAR') || '')) ||
     block.type === 'sprite_missile_fire'));
  // Which title screen graphics the color and frame blocks target, and whether the background color block is
  // used: they only matter when the kernel is in use at all.
  const enabledBlocks = (type) => workspace.getAllBlocks(false).filter((block) => block.type === type && block.isEnabled());
  // A block can still name a graphic that was deleted afterwards: that reference gets no variables or bits.
  const existingCards = new Set(resolveAllTitleScreenCardRefs());
  const targets = (type) => enabledBlocks(type).map((block) => block.getFieldValue('CARD'))
      .filter((ref) => ref && existingCards.has(ref));
  // Graphics a "Fade title screen graphic color" block names: each keeps its color in a byte, a target and a timer, and the
  // frames a step takes in a separate byte unless every fade of it has the same constant time.
  // Only a fade block that is part of some event or routine counts (a loose one, or one under a disabled block, makes no code and so
  // needs no tables, variables or subroutine).
  const GENERATED_ROOTS = ['event_block', 'event_comment', 'subroutine_define', 'function_define'];
  const fadeBlocks = enabledBlocks('titlescreen_card_color_fade').filter((block) => !block.getInheritedDisabled() &&
    GENERATED_ROOTS.includes(block.getRootBlock().type) && existingCards.has(block.getFieldValue('CARD')));
  const fadedRefs = this.titleScreenDrawUsed ? [...new Set(fadeBlocks.map((block) => block.getFieldValue('CARD')))] : [];
  const cardOf = (ref) => processTitleScreenStorageDefaults(useTitleScreenStorage()).screens.flatMap((screen) =>
    (screen.cards || []).map((card) => ({card, ref: `${screen.id}:${card.id}`}))).find((entry) => entry.ref === ref);
  // A multicolor (48x2) graphic fades through color lists made ahead of time toward a color picked on the block, so that has to
  // be a color from the color picker and the frames a number typed in: its plan (see planTitleRowFade) has the lists.
  this.titleRowFadePlans = {};
  fadedRefs.forEach((ref) => {
    const entry = cardOf(ref);
    if (!entry || entry.card.type !== '48x2' || this.titleRowFadePlans[ref]) return;
    const block = fadeBlocks.find((candidate) => candidate.getFieldValue('CARD') === ref);
    const colorBlock = block && block.getInputTargetBlock('VALUE');
    const framesBlock = block && block.getInputTargetBlock('FRAMES');
    if (!colorBlock || colorBlock.type !== 'color_get' || !framesBlock || framesBlock.type !== 'math_number') return;
    const {paddedFrames} = padTitleCardFrames(entry.card, TITLE_SCREEN_KERNEL_TYPES['48x2']);
    const plan = planTitleRowFade(paddedFrames[0].colorRows, Number(colorBlock.getFieldValue('COLOR')) & 0xff);
    this.titleRowFadePlans[ref] = {...plan, target: Number(colorBlock.getFieldValue('COLOR')) & 0xff,
      pace: Math.max(1, Math.floor(Number(framesBlock.getFieldValue('NUM')) / plan.stepCount))};
  });
  setTitleRowFadePlans(this.titleRowFadePlans);
  this.titleFadeRefs = new Set(fadedRefs.filter((ref) => !this.titleRowFadePlans[ref] && (cardOf(ref) || {card: {}}).card.type === '48x1'));
  this.titleFadeConstantPace = {};
  this.titleFadeRefs.forEach((ref) => {
    const paces = fadeBlocks.filter((block) => block.getFieldValue('CARD') === ref).map((block) => {
      const frames = block.getInputTargetBlock('FRAMES');
      return frames && frames.type === 'math_number' ? Math.max(1, Math.floor(Number(frames.getFieldValue('NUM')) / FADE_STEPS)) : null;
    });
    if (paces.every((pace) => pace !== null && pace === paces[0])) this.titleFadeConstantPace[ref] = paces[0];
  });
  this.titleCardColorRefs = new Set(this.titleScreenDrawUsed ?
    [...targets('titlescreen_card_color_set'), ...this.titleFadeRefs] : []);
  // The Player sprites card's players: one that plays several frames by itself needs a frame counter, and
  // one that plays by itself or is set by a block needs a byte for the kernel's bmp_playerN_index.
  this.titlePlayerSlots = this.titleScreenDrawUsed ? resolveTitlePlayerSlots() : null;
  const playerFrameBlocks = workspace.getAllBlocks(false).filter((block) =>
    block.type === 'titlescreen_player_frame_set' && block.isEnabled());
  this.titlePlayerIndexUsed = [0, 1].map((playerIndex) => !!this.titlePlayerSlots &&
    (this.titlePlayerSlots[playerIndex].frameCount > 1 ||
     playerFrameBlocks.some((block) => Number(block.getFieldValue('PLAYER')) === playerIndex)));
  // Graphics whose frames have different picture backgrounds need those bytes in RAM as well.
  this.titleFrameBoxRefs = new Set(this.titleScreenDrawUsed ? resolveFrameBoxCardRefs() : []);
  this.titleBoxRefs = new Set(this.titleScreenDrawUsed ? [...targets('titlescreen_box_set'),
    ...targets('titlescreen_box_color_set'), ...this.titleFrameBoxRefs] : []);
  // A block can still name a graphic that has since been deleted (or no longer has several frames): such a
  // reference gets no flag bits, variables or code.
  const liveAnimatedCards = new Set(this.titleScreenDrawUsed ? resolveAnimatedTitleScreenCardRefs() : []);
  const liveCardRefs = (refs) => [...new Set(refs.filter((ref) => ref && liveAnimatedCards.has(ref)))];
  this.titleCardHoldRefs = this.titleScreenDrawUsed ? liveCardRefs(enabledBlocks('titlescreen_card_frame_set')
      .filter((block) => block.getFieldValue('HOLD') === 'TRUE')
      .map((block) => block.getFieldValue('CARD'))) : [];
  // Graphics and Player sprites that a block sets to "play once" need a bit that stops their frame counter.
  // That includes the graphics whose "Play animation once" switch is on.
  this.titleCardOnceRefs = this.titleScreenDrawUsed ? liveCardRefs([
    ...[...enabledBlocks('titlescreen_card_frame_set'), ...enabledBlocks('titlescreen_card_animate')]
        .filter((block) => block.getFieldValue('PLAYBACK') === 'once')
        .map((block) => block.getFieldValue('CARD')),
    ...resolvePlayOnceCardRefs(),
  ]) : [];
  // The "Animate title screen graphic" blocks, each a trigger with ran/ran-last-frame bits of its kind.
  this.titleAnimateBlockIds = this.titleScreenDrawUsed ?
    enabledBlocks('titlescreen_card_animate').filter((block) => liveAnimatedCards.has(block.getFieldValue('CARD')))
        .map((block) => block.id) : [];
  // Graphics an "Animate title screen graphic ... in reverse" block can play backwards.
  this.titleCardReverseRefs = this.titleScreenDrawUsed ?
    liveCardRefs(enabledBlocks('titlescreen_card_animate').filter((block) => block.getFieldValue('DIRECTION') === 'reverse')
        .map((block) => block.getFieldValue('CARD'))) : [];
  // Graphics a "When title screen graphic animation finishes" block watches.
  this.titleCardFinishedRefs = this.titleScreenDrawUsed ?
    liveCardRefs(enabledBlocks('titlescreen_animation_finished').map((block) => block.getFieldValue('CARD'))) : [];
  if (this.titlePlayerSlots) {
    [0, 1].forEach((playerIndex) => {
      this.titlePlayerSlots[playerIndex].once = this.titlePlayerSlots[playerIndex].frameCount > 1 &&
        playerFrameBlocks.some((block) => Number(block.getFieldValue('PLAYER')) === playerIndex &&
          block.getFieldValue('PLAYBACK') === 'once');
    });
  }
  this.titleBgUsed = this.titleScreenDrawUsed &&
    (enabledBlocks('titlescreen_bg_set').length > 0 || enabledBlocks('titlescreen_bg_reset').length > 0);
  // "End title screen" needs its flag bit only when the kernel is in use at all.
  this.titleEndUsed = this.titleScreenDrawUsed &&
    workspace.getAllBlocks(false).some((block) => block.type === 'titlescreen_end' && block.isEnabled());

  // Same idea, for "Joystick N direction (8-way)" getter blocks (see
  // joyDir8ResultVarName's  comment in generators/bbasic/input.js for why
  // this has to be precomputed once per frame rather than read inline) -
  // has to be known before reserveDevVar hands out user variable letters
  // below.
  this.joyDirection8UsedFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'input_joystick_direction8') return;
    this.joyDirection8UsedFor.add(`joy${block.getFieldValue('JOYSTICK') === '1' ? '1' : '0'}`);
  });

  // Same idea, for the combined "Fire [tapped/held/released/double-tapped]"
  // block (see generators/bbasic/input.js's  reserveJoystickButtonDevVars
  // comment) - one block type, any MODE counts, since all four modes read
  // from the same shared held/prev/justReleased/lastPressFrames dev vars for
  // a given joystick.
  //
  // isEnabled() (not just block.type) - same bug class, and same fix, as
  // romNoiseUsedFor/rainbowColorUsedFor's  comment above: a disabled Fire-
  // pattern block's  generator never runs, but this pre-scan used to
  // count it anyway, forcing the whole "_joyNbtn_..." held/released state
  // machine (generateJoystickButtonChecks in generators/bbasic/input.js) and
  // its dev-var reservations into the build for a feature that was actually
  // inert - a real reported build failure ("Unknown keyword: 0") once that
  // dead weight combined with the rest of a real project's  variable/bank
  // budget.
  this.joyButtonUsedFor = new Set();
  // The console switches read with "was just switched on" (the Switch block's dropdown values).
  this.switchEdgeUsedFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'input_console_switch_get' && block.isEnabled() && block.getFieldValue('MODE') === 'ONCE') {
      this.switchEdgeUsedFor.add(block.getFieldValue('SWITCH'));
    }
  });
  // Which of those need the "how long the press that just ended lasted" variable
  // as well: everything but "held" (tapped, released and double-tapped all read
  // the release it records). A joystick only checked with "held" needs just the
  // frames-held count.
  this.joyButtonNeedsReleaseFor = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'input_joystick_fire_pattern' || !block.isEnabled()) return;
    const joystick = `joy${block.getFieldValue('JOYSTICK') === '1' ? '1' : '0'}`;
    this.joyButtonUsedFor.add(joystick);
    if (block.getFieldValue('MODE') !== 'HOLD') this.joyButtonNeedsReleaseFor.add(joystick);
  });

  // Same idea as distancePointChecks below, for MODE="DOUBLE_TAP" instances
  // of that same combined block (see generators/bbasic/input.js's
  // joyDoubleTapResultVarName/joyDoubleTapTimerVarName comment) - each
  // instance gets its  hidden result+timer pair rather than sharing one,
  // since different instances on the same joystick can each have their
  // FRAMES field value. Same isEnabled() fix as joyButtonUsedFor just above.
  this.joyDoubleTapChecks = new Map();
  let joyDoubleTapIndex = 0;
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'input_joystick_fire_pattern') return;
    if (!block.isEnabled()) return;
    if (block.getFieldValue('MODE') !== 'DOUBLE_TAP') return;
    joyDoubleTapIndex++;
    const name = `joy${block.getFieldValue('JOYSTICK') === '1' ? '1' : '0'}`;
    const window = Math.max(1, Math.min(255, Math.round(Number(block.getFieldValue('FRAMES')) || 20)));
    this.joyDoubleTapChecks.set(block.id, {name, window, index: joyDoubleTapIndex});
  });

  // Same idea, for "Background get pixel" blocks'  X/Y scratch dev vars
  // (see generators/bbasic/background.js's  background_get_pixel and its
  // backgroundGetPixelXVarName/backgroundGetPixelYVarName comment) - this
  // block normally uses bB's free temp1/temp2 scratch registers at no dev-
  // var cost at all, UNLESS it's nested inside a function_define block's
  // body AND at least one of its  X/Y arguments is a non-simple
  // expression (temp1-temp6 are ALSO bB's fixed argument-passing convention,
  // so only THAT combination could otherwise silently clobber a function's
  // live parameter) - backgroundGetPixelDevVarsNeeded mirrors the
  // generator's  useDevVars/isSimple checks exactly, rather than the
  // coarser "nested in a function at all" check this used to make do with.
  this.backgroundGetPixelUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'background_get_pixel' && backgroundGetPixelDevVarsNeeded(block));

  // Same idea, for function_call_statement's  discarded-return-value
  // scratch var (see generators/bbasic/function.js's  comment on
  // functionCallDiscardVarName) - only reserved for a project that actually
  // calls a function as a bare statement at all.
  this.functionCallStatementUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'function_call_statement');

  // data_get_bit_by_id's  dynamic-TABLE_ID path (see generators/bbasic/
  // data.js) reuses that exact same discarded-return-value var, rather than
  // reserving a second dedicated one - both hold nothing but a
  // just-returned function value, written and immediately consumed on the
  // very next line, so sharing one slot between them is safe (see that
  // generator's  comment). Kept as its  flag (not folded into
  // functionCallStatementUsed above) since ONLY functionCallDiscardVarName
  // itself is shared - the _fnCallArgN vars function_call_statement also
  // reserves below are its, unrelated to this path, and reserving
  // those too for a project that only uses data_get_bit_by_id dynamically
  // would be the opposite of using fewer variables.
  this.dataBitDispatchByIdUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'data_get_bit_by_id' && block.getInputTargetBlock('TABLE_ID'));

  // Same idea, for data_get_element_by_id's  dynamic-TABLE_ID path (see
  // generators/bbasic/data.js's  registerDataDispatchCallWrapper) - ALSO
  // reuses functionCallDiscardVarName for its  result now that it's
  // routed through a bank-tagged "gosub" wrapper instead of a bare function
  // call, same reasoning as dataBitDispatchByIdUsed just above.
  this.dataElementDispatchByIdUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'data_get_element_by_id' && block.getInputTargetBlock('TABLE_ID'));

  // Same idea again, for music_song_playing_by_number's  dynamic-SONG_ID
  // dispatch (see generators/bbasic/music.js) - also reuses
  // functionCallDiscardVarName rather than a dedicated var, same
  // reasoning as dataBitDispatchByIdUsed just above.
  this.musicSongPlayingByNumberUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'music_song_playing_by_number');

  // Same idea, for function_param_get's  snapshot vars (see
  // functionParamVarName's  comment in blocks/function.js and
  // generators/bbasic/function.js's function_define generator) - every
  // distinct argument index (1-6) any function_param_get block anywhere on
  // the workspace reads, regardless of which function_define it's actually
  // nested under (function_define's  generator only emits a snapshot
  // assignment for the indices ITS body reads, so reserving the union
  // here just needs to cover every index that could possibly need one,
  // exactly like every OTHER dev var reservation here - unlike that
  // per-function emission, reserveDevVar's  pool is global, not
  // per-function).
  this.functionParamIndicesUsed = new Set(workspace.getAllBlocks(false)
      .filter((block) => block.type === 'function_param_get')
      .map((block) => Number(block.getFieldValue('INDEX'))));

  // Same idea as distanceChecks above, for "Distance to point" blocks (see
  // blocks/input.js's distance_x_to_point_get/distance_y_to_point_get) -
  // the second operand there is an arbitrary value input (typed literal,
  // variable, math block, even "Random"), not one of the dropdown-picked
  // objects distanceChecks dedupes by content, so it can't be canonicalized
  // the same way: two blocks that look identical could still read a
  // variable that changes independently, or re-roll a fresh random number,
  // so collapsing them into one shared computation would be wrong. Each
  // block instance gets its  hidden variable instead, numbered in
  // workspace order (keyed by block.id here only for this pre-scan's
  // bookkeeping - the block reference itself is kept so
  // generateDistancePointChecks can generate its POINT input's code later,
  // once nameDB_ is fully set up, rather than here).
  this.distancePointChecks = new Map();
  let distancePointIndex = 0;
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'distance_x_to_point_get' && block.type !== 'distance_y_to_point_get') return;
    const axis = block.type === 'distance_x_to_point_get' ? 'x' : 'y';
    distancePointIndex++;
    this.distancePointChecks.set(block.id, {axis, obj0: block.getFieldValue('VAR0'), index: distancePointIndex, block});
  });

  // Which players use the hardware-collision backtrack block (see
  // blocks/collision.js) - each one needs its  pair of hidden bytes to
  // hold the position from before its last move, so this is decided before
  // variable letters are handed out below, same reason as the pre-scans
  // above.
  this.collisionMovePlayers = new Set();
  // The players whose block goes back two frames, which keep the position from before that too.
  this.collisionMoveTwoFramePlayers = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'collision_check_position') {
      this.collisionMovePlayers.add(block.getFieldValue('PLAYER'));
      if (block.getFieldValue('FRAMES') === '2') this.collisionMoveTwoFramePlayers.add(block.getFieldValue('PLAYER'));
    }
  });

  // The tallest frame across every animation in the shared player-animation
  // pool (see processPlayerAnimationsStorageDefaults's comment in
  // generators/bbasic/sprites.js - Player 0 and Player 1 draw from the same
  // animation list, so one conservative constant covers both, rather than
  // needing a live per-frame height lookup that doesn't exist anywhere in
  // this codebase). Only computed when collision_check_position is actually
  // in use - see generators/bbasic/collision.js's box-collision math,
  // which needs a compile-time height constant for its top/bottom corner
  // checks.
  this.collisionMaxHeight = 8;
  if (this.collisionMovePlayers.size) {
    const playerAnimationsStorage = usePlayerAnimationsStorage();
    const playerData = processPlayerAnimationsStorageDefaults(playerAnimationsStorage);
    (playerData.animations || []).forEach((animation) => {
      (animation.frames || []).forEach((frame) => {
        const height = (frame.pixels || []).length;
        if (height > this.collisionMaxHeight) this.collisionMaxHeight = height;
      });
    });
  }

  // Every "fade finished" watch (background_fade_finished in blocks/
  // background.js) resolved to the (register, direction) pairs it actually
  // watches - see resolveBackgroundFadeFinishedWatches's  comment.
  // Needed this early so fadeFlagsVarName below only gets
  // reserved when at least one such watch really exists.
  this.backgroundFadeFinishedWatches = resolveBackgroundFadeFinishedWatches(workspace);

  // Every "note played by instrument" watch (music_note_played/_by_id in
  // blocks/music.js) resolved to its  small packed index - needed even
  // earlier than this.projectMusic below, since resolveProjectMusic itself
  // needs this map to actually bake each watched instrument's  index
  // into its notes' AUDV bytes (see eventsToPages in generators/bbasic/
  // music.js). Pure workspace scan, no dependency on this.projectMusic the
  // way resolveMusicEventFlags below has.
  this.notePlayedInstruments = resolveNotePlayedInstruments(workspace);

  // Which animation indices each player's  blocks can actually reach at
  // runtime (see resolveUsedPlayerAnimations'  comment) - read by
  // generateAnimations below to skip compiling an animation nothing in the
  // project ever selects.
  this.usedPlayerAnimations = resolveUsedPlayerAnimations(workspace);

  // DPC+ only: the Player 2 to 9 blocks in use. The kernel keeps memory for every virtual sprite up to
  // "dpcspritemax", so that is the highest one used (and the rest of them stay free for variables).
  this.dpcPlusExtraPlayers = [];
  this.widePartners = {};
  Blockly.BBasic.dpcPlusPlayerColors = {};
  Blockly.BBasic.dpcPlusPlayerFades = {};
  if ((useConfigurationStorage().value || {}).kernel === 'dpcplus') {
    const extra = new Set();
    workspace.getAllBlocks(false).forEach((block) => {
      if (!block.isEnabled() || !block.getField) return;
      const player = block.getField('PLAYER') ? Number(block.getFieldValue('PLAYER')) : NaN;
      if (player >= 2 && player <= 9) extra.add(player);
      // Seek and Inertia pick their sprite by name.
      const object = block.getField('OBJECT') && /^player([2-9])$/.exec(block.getFieldValue('OBJECT'));
      if (object) extra.add(Number(object[1]));
      const fired = block.type === 'sprite_missile_fire' && /^player([2-9])$/.exec(block.getFieldValue('MISSILE'));
      if (fired) extra.add(Number(fired[1]));
      // Lock and Unlock name their sprites too.
      if (block.type === 'sprite_lock' || block.type === 'sprite_unlock') {
        ['CHILD', 'PARENT'].forEach((fieldName) => {
          const locked = block.getField(fieldName) && /^player([2-9])$/.exec(block.getFieldValue(fieldName));
          if (locked) extra.add(Number(locked[1]));
        });
      }
      // Collided ... and ... picks its two objects by name as well.
      ['VAR0', 'VAR1'].forEach((fieldName) => {
        const collided = block.type === 'collision_get' && /^player([2-9])$/.exec(block.getFieldValue(fieldName));
        if (collided) extra.add(Number(collided[1]));
      });
    });
    // A player with a 16 pixel wide animation gets a Player 2 to 9 no block uses as the sprite that shows the right half.
    this.widePartners = resolveWidePartners(this.usedPlayerAnimations, extra, true, playersUsedByBlocks(workspace));
    Object.values(this.widePartners).forEach((partner) => extra.add(Number(partner.slice(6))));
    this.dpcPlusExtraPlayers = [...extra].sort((a, b) => a - b);
    // A project that uses players 2 to 9 but never Player 1 does not want Player 1's first frame on the screen.
    this.dpcPlusHidePlayer1 = this.dpcPlusExtraPlayers.length > 0 && !playersUsedByBlocks(workspace).has('player1');
  } else {
    this.dpcPlusHidePlayer1 = false;
    this.widePartners = resolveWidePartners(this.usedPlayerAnimations, new Set(), false, playersUsedByBlocks(workspace));
  }
  // The virtual sprites the Options tab turns on (dpcPlusSpriteMax) stay on even when no block uses them.
  const configuredSprites = (useConfigurationStorage().value || {}).dpcPlusSpriteMax;
  const sprites = configuredSprites === undefined || configuredSprites === null ? 9 : Number(configuredSprites) || 1;
  this.dpcPlusSpriteMax = Math.max(1, Math.min(9, sprites), ...this.dpcPlusExtraPlayers);

  // Which backgrounds anything can switch to (see resolveUsedBackgroundIds'
  // comment), so generateBackgrounds can leave the others out of the ROM.
  this.usedBackgroundIds = resolveUsedBackgroundIds(workspace);

  // Every player a sprite_player_animation_finished watch block actually
  // exists for, read by processAnimation (this file's generateAnimations
  // below) to decide whether a non-looping animation's "finished" bit is
  // worth setting at all - see resolvePlayerAnimationFinishedWatches'
  // comment in generators/bbasic/sprites.js.
  this.playerAnimationFinishedWatches = resolvePlayerAnimationFinishedWatches(workspace);

  // Resolves every song the project references and builds their combined
  // per-channel data ahead of time (see generators/bbasic/music.js) - needed
  // this early so its hidden index/timer variables can be reserved below,
  // before nameDB_ hands out letters, same reasoning as the pre-scans above.
  // Stored on the instance (not module-level state) since this Generator is
  // a shared singleton reused across every workspaceToCode() call - same
  // reasoning as textMinikernelUsed above.
  // Under DPC+ the sounds are played by the DPC+ music chip (see generators/bbasic/dpcplus-audio.js). The plan
  // collects the waveforms and pitches as the generators below ask for them.
  {
    const soundConfig = useConfigurationStorage().value || {};
    const chipOn = soundConfig.kernel === 'dpcplus' && soundConfig.enableDpcPlusAudio !== false && !soundConfig.muteAllAudio;
    const chipChannels = chipOn ? collectChipChannels(workspace, processSongsStorageDefaults(useSongsStorage()).songs) : [];
    this.dpcAudioPlan = chipChannels.length ? createDpcPlusAudioPlan(soundConfig, chipChannels) : null;
    this.dpcAudioFiles = {};
    setMusicDpcPlusPlan(this.dpcAudioPlan);
  }
  this.projectMusic = resolveProjectMusic(workspace, this.notePlayedInstruments);

  // Reset fresh every compile - same reasoning as playerAnimAsmFiles's
  // reset in generateAnimations (see its comment): these are only ever SET
  // by generators/bbasic/titlescreen.js's "Draw title screen" block
  // generator, so a project that HAD one and then removed it would
  // otherwise leave hooks/rom.js's  titleScreenUsedKernelKeys check
  // permanently truthy from a previous compile, still fetching/including
  // Titlescreen Kernel files a project no longer uses at all.
  this.titleScreenUsedKernelKeys = undefined;
  this.titleScreenHasScoreCard = false;
  this.titleScreenAsmFiles = {};
  // Same "reset every compile" reasoning as the two lines just above, for
  // the exact same "HAD one, then removed it" gap - this one is only ever
  // SET by registerTitleScreenSubroutine (generators/bbasic/titlescreen.js),
  // itself only called a few hundred lines below when titleScreenDrawUsed
  // is true. Left unreset, a compile with NO "Draw title screen" block at
  // all (titleScreenDrawUsed false, so the dev vars this text references -
  // titleCardFrame_X_Y - never get reserved/dim'd THIS time either) still
  // spliced in a PREVIOUS compile's leftover animation-tick code referencing
  // those now-undeclared vars - confirmed as a real reported bug: DASM
  // failing on "Unknown Mnemonic 'inc titleCardFrame_1_1'" for a project
  // whose current build has no Draw title screen block active at all.
  this.titleScreenAnimationChecks = '';

  // Whether channnel0duration/channnel1duration (see SYSTEM_VARIABLES'
  // comment) are needed at all - two block types ever WRITE them:
  // soundfx_play (see soundfx.js's  generator, a Sound-tab-preset
  // reference) and simple_sound_set (see generators/bbasic/sound.js's
  // generator, the freeform "Play sound" block that sets AUDC/AUDF/AUDV
  // directly) - confirmed as a real bug: simple_sound_set was missing here,
  // so a project using ONLY that block (no soundfx_play, no music) never
  // got channnel0duration/channnel1duration reserved/dim'd at all, and the
  // generator's  reference to it fell through to DASM as a bare unknown
  // symbol ("Unknown Mnemonic 'sta channnel0duration'"). Music's
  // generated code READS them unconditionally too, whenever music exists at
  // all (see generators/bbasic/music.js's  comments on "soundfx_play/
  // channnel0duration+channnel1duration" - a sound effect sharing a channel
  // with music needs to keep exclusive hardware control for its
  // duration), so any one of the three alone already needs both vars to
  // exist. A project using none of them pays nothing - see
  // generateChannelDurationChecks below, which reuses this same flag to
  // skip the per-frame decrement entirely, not just the dev vars.
  // Only the channels something actually uses get a duration variable: a
  // sound block names its channel (a fixed Ch0/Ch1 dropdown), and music
  // lists the channels its tracks play on.
  this.channelDurationChannels = new Set();
  // With every sound muted (the Options tab), those blocks write nothing, so they need no duration byte.
  const soundsMuted = !!((useConfigurationStorage().value || {}).muteAllAudio);
  workspace.getAllBlocks(false).forEach((block) => {
    if (!soundsMuted && (block.type === 'soundfx_play' || block.type === 'simple_sound_set') && block.isEnabled()) {
      this.channelDurationChannels.add(this.normalizeChannel(block.getFieldValue('CHANNEL')));
    }
  });
  if (this.projectMusic) this.projectMusic.channels.forEach((channel) => this.channelDurationChannels.add(`${channel}`));
  this.channelDurationUsed = this.channelDurationChannels.size > 0;
  // A project with no sound has nothing for the chip to play.
  if (!this.channelDurationUsed) this.dpcAudioPlan = null;

  // Every one-shot music event watch - "sequence chip finished"
  // (music_sequence_chip_finished/_by_id) AND "note played by instrument"
  // (music_note_played/_by_id), pooled into ONE shared flag-bit assignment
  // (see resolveMusicEventFlags'  comment for why sharing the pool
  // matters) - needed this early (same reasoning as this.projectMusic just
  // above) since it may need to reserve a new dev var (see
  // musicEventFlagsOverflowVarName's  comment - only past the first 2
  // distinct watches, which reuse musicFlagsVarName's  spare bits
  // instead) before nameDB_ hands out letters below.
  this.musicEventFlags = resolveMusicEventFlags(workspace, this.projectMusic, this.notePlayedInstruments);

  // Once there's more than one song, each gets its  dedicated reset
  // subroutine name (see musicPlaySongResetName in bbasic/music.js) that
  // isn't known until this.projectMusic is resolved above, unlike every
  // OTHER reserved word this app defines (see addReservedWords right below
  // Blockly.BBasic's  creation) - reserved here instead, the moment
  // they're known, for the same reason those are: keeps a user subroutine
  // literally named one of these from colliding with it.
  if (this.projectMusic && this.projectMusic.songs.length > 1) {
    Blockly.BBasic.addReservedWords(
        this.projectMusic.songs.map((song) => musicPlaySongResetName(song.songIndex)).join(','));
  }

  // Run-once blocks (see blocks/event.js's event_run_once) fire once per
  // activation of whatever condition contains them (e.g. once each time an
  // enclosing "if BGScene = 2" becomes true, again next time it does), not
  // just once ever - which needs two bits of persistent state per instance,
  // not one: "fired" (already ran for the CURRENT activation) and "touched"
  // (this instance's gated code ran at all THIS frame). See
  // generateRunOnceEdgeReset below for how the two combine to detect a
  // fresh activation without the block itself ever seeing its  gate's
  // condition go false - and for why one bit alone can't do this safely (a
  // single shared frame-parity bit was considered and rejected: it only
  // detects the gate going false for an ODD number of frames, silently
  // failing to re-fire after an even-length gap).
  //
  // Both bits per instance share ONE byte (not two separate byte arrays):
  // low nibble bits 0-3 are 4 instances' "touched" bits, high nibble
  // bits 4-7 the same 4 instances' "fired" bits (instance p within its byte
  // uses bit p for touched, bit p+4 for fired) - 4 instances per byte
  // instead of 8, but only ONE letter spent per 4 instances instead of one
  // letter per 8 EACH for two separate arrays (same total bit count, fewer
  // letters for any count that isn't a multiple of 8 - see
  // generateRunOnceEdgeReset's nibble-mask comment for why this specific
  // split, rather than interleaving the two bits per instance, is what
  // keeps the per-frame reset a couple of plain nibble operations instead
  // of needing to unpack every instance separately). Counted here, before
  // variable letters are handed out below, for the same reason as the text
  // minikernel pre-scan above: by the time a run_once block's  generator
  // runs (see generators/bbasic/event.js), its flag byte's letter would
  // already need to be decided. runOnceGroupCounters is what that generator
  // increments, one per instance, to assign each block its  byte+pair.
  // An instance in the events that run while the title screen does and one that only gameplay can run
  // never overlap, so they take the same bit pairs (the instance numbers count from 0 in each group);
  // the pairs they share are cleared as each side starts (see generateGameEvent).
  this.runOnceCounter = 0;
  this.runOnceGroupCounters = {title: 0, other: 0};
  const runOnceBlocks = workspace.getAllBlocks(false).filter((block) => block.type === 'event_run_once');
  const runOnceTitlePhase = titlePhaseBlocks(workspace);
  this.runOnceTitleBlocks = new Set(runOnceTitlePhase ? runOnceBlocks.filter((block) => runOnceTitlePhase.includes(block)) : []);
  const runOnceTitleCount = this.runOnceTitleBlocks.size;
  const runOnceOtherCount = runOnceBlocks.length - runOnceTitleCount;
  this.runOnceSharedPairs = Math.min(runOnceTitleCount, runOnceOtherCount);
  const runOnceByteCount = Math.ceil(Math.max(runOnceTitleCount, runOnceOtherCount) / 4);
  // DPC+: the flag bytes live in display RAM (see utils/dpc-ram-flags.js) and take no variable slot at all.
  this.runOnceRamBytes = (useConfigurationStorage().value || {}).kernel === 'dpcplus' ? runOnceByteCount : 0;
  const runOnceByteNames = this.runOnceRamBytes ? [] : [...Array(runOnceByteCount).keys()].map((i) => `RunOnceFlags${i}`);

  // Whether MUSIC_PLAY_RESET_NAME (see registerMusicPlayResetSubroutine
  // below) is actually worth registering as its  subroutine - a real
  // subroutine call costs its "gosub"/"return" overhead beyond the
  // reset code itself, so sharing one copy across call sites only pays for
  // itself once there are at least two - with exactly one "Play song"/"Play
  // song by ID" block in the whole project, the OLD plain-inline behavior is
  // actually smaller, not just simpler. Confirmed directly as a real
  // regression: a project with a single "Play song" block that compiled
  // fine before this subroutine existed started failing after, from that
  // same small overhead alone, on a project already down to its last few
  // free bytes.
  this.musicPlayResetShared = workspace.getAllBlocks(false)
      .filter((block) => block.type === 'music_play_song' || block.type === 'music_play_song_by_id')
      .length >= 2;

  if (!this.nameDB_) {
    this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_);
  } else {
    this.nameDB_.reset();
  }

  this.nameDB_.setVariableMap(workspace.getVariableMap());
  this.nameDB_.populateVariables(workspace);
  this.nameDB_.populateProcedures(workspace);

  const defvars = [];

  // Every dev/user variable below is handed to routeDevVar (or reserveDevVar,
  // which just adds the nameDB_.getName step) instead of pushed into defvars
  // directly. With Superchip off, this is a no-op wrapper - everything still
  // goes straight into defvars, letter-assigned exactly as it always was.
  //
  // With Superchip on, var15-var43 (29 slots - see SUPERCHIP_VAR_START's
  // comment) is free, unused RAM that nothing in this codebase claims today,
  // sitting right alongside var0-var14 (already used by SYSTEM_VARIABLES) and
  // the 26-letter pool (already fully free once Superchip moves the standard
  // kernel's playfield buffer off zero-page). Filling var15-var43 FIRST, in
  // the same priority order these categories were always reserved in below,
  // and only overflowing into the 26-letter pool once that's full, means a
  // Superchip project's real total budget becomes 29 + 26 = 55 slots instead
  // of just 26 - strictly more headroom than routing everything through the
  // letter pool alone (the old Superchip behavior) OR routing everything
  // through var15-43 alone (this feature's  first pass, music-only) would
  // give by itself. This is why routeDevVar checks superchipVars.length
  // itself on every call, rather than deciding once up front which pool a
  // whole category goes to - the split only actually matters once a project
  // is large enough to fill 29 slots, which nothing here needs to special-
  // case since routeDevVar and the existing "too many variables" check below
  // already fall through to the letter pool exactly as before once that
  // happens.
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const superchipVarBudget = SUPERCHIP_VAR_END - SUPERCHIP_VAR_START + 1;
  const dpcPlusVarBudget = config.kernel === 'dpcplus' ?
    DPCPLUS_VAR_COUNT - (dpcPlusFixedSlotsMoved(this.dpcPlusSpriteMax) && this.isTextMinikernelActive() ?
      DPCPLUS_MOVED_FIXED_SLOT_COUNT : 0) : 0;
  this.superchipVars = [];
  this.dpcPlusVars = [];
  // Reserving the SAME canonical dev var twice (e.g. ROM noise and rainbow
  // colors both reserve romNoiseFlagsVarName's shared flags byte - see
  // generators/bbasic/sprites.js's "one shared flags byte" comment) has
  // to be a no-op the second time: routeDevVar used to push unconditionally
  // on every call, so using both features together bound the same symbol
  // name to two different letters/slots - a real DASM "EQU: Value mismatch"
  // build failure (the same symbol assigned two different addresses),
  // confirmed by testing rom noise + rainbow colors together and finding
  // that removing either one alone fixed the build.
  const routedDevVarNames = new Set();
  // Very short "why does this variable exist" text, keyed by the FINAL
  // routed name (not the canonical one reserveDevVar was called with) -
  // looked up again wherever the actual "dim" lines get emitted (below, and
  // in generateSuperchipVarDims) to prepend a matching "rem" line in the
  // real generated bBasic code, not just here in this source file. Only the
  // FIRST reservation of a given name's  description sticks (matches
  // routeDevVar's "first call wins" dedup below) - a shared var reserved
  // from two different call sites (e.g. romNoiseFlagsVarName) keeps
  // whichever description arrived first, which is fine since either one
  // correctly explains that shared byte.
  this.devVarDescriptions = {};
  const routeDevVar = (name, description) => {
    if (description && !(name in this.devVarDescriptions)) {
      this.devVarDescriptions[name] = description;
    }
    if (routedDevVarNames.has(name)) return name;
    routedDevVarNames.add(name);
    if (superchipOn(config) && this.superchipVars.length < superchipVarBudget) {
      this.superchipVars.push(name);
    } else if (this.dpcPlusVars.length < dpcPlusVarBudget) {
      this.dpcPlusVars.push(name);
    } else {
      defvars.push(name);
    }
    return name;
  };
  const reserveDevVar = (canonicalName, type = Blockly.Names.DEVELOPER_VARIABLE_TYPE, description) =>
    routeDevVar(this.nameDB_.getName(canonicalName, type), description);

  // The Title Screen's variables (see the reservations further down) only matter while the title
  // screen runs, which never overlaps the gameplay loop, so each one shares the slot of a variable
  // that only gameplay uses instead of taking a slot just for itself (see findGameplayOnlyVariables).
  // They are named here and given their slot after the user variables have theirs.
  const pendingTitleVars = [];
  const reserveTitleDevVar = (canonicalName, type, description) => {
    const name = this.nameDB_.getName(canonicalName, type || Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    if (description && !(name in this.devVarDescriptions)) this.devVarDescriptions[name] = description;
    if (!pendingTitleVars.includes(name)) pendingTitleVars.push(name);
    return name;
  };

  // Superchip RAM's  separate read/write pool (r000-r127/w000-w127 - see
  // superchipRwFreeCount's  comment in utils/playfield-coords.js) - a
  // completely different, unrelated pool from superchipVars/defvars above
  // (the "48 bytes freed from the old RAM playfield," var0-var47). Reads
  // and writes for r00N/w00N live at genuinely DIFFERENT physical
  // addresses (a real SARA hardware quirk, confirmed directly against the
  // reference batari Basic documentation and a real compile), so nothing
  // here can go through "dim"/nameDB_ at all - every call site touching a
  // var reserved here gets back a {read, write} pair of literal symbol
  // text instead of one shared name, and has to pick whichever side
  // matches its  position (assignment target vs everything else).
  //
  // Internal-only, by design (not exposed to the user as a variable
  // target anywhere): only ever called for system-reserved/block-required
  // vars whose generator has been individually checked against the
  // real usage guidelines these variables come with (safe: plain add/
  // subtract, plain non-16-bit multiply/divide, a function-call result
  // assigned to the write side, the read side used as a function argument
  // or in a plain "if" comparison; NOT safe: a for/next loop counter, an
  // on...goto/gosub target, fixed-point math, 16-bit multiply/divide, or
  // anything else that would need an actual "dim" alias) - reserveDevVarRW
  // itself has no way to verify a given var's  USAGE fits those rules,
  // only that a slot is available, so that check has to happen once, by
  // hand, at each call site before it's ever routed here.
  //
  // Falls back to the ordinary reserveDevVar pool automatically whenever
  // this one isn't available (Superchip off, pfres too high, or already
  // full) - returning the SAME symbol for both .read and .write in that
  // case, so every caller can destructure {read, write} unconditionally
  // without needing to know which pool it actually landed in.
  const superchipRwCapacity = superchipRwFreeCount(config);
  this.superchipRwUsed = 0;
  this.superchipRwAvailable = superchipRwCapacity;
  this.superchipRwAssignments = [];
  const routedRwPairs = {};
  // Exposed directly (not just captured in this closure) so a generator
  // function - which runs LATER, once per block, well after every
  // reserveDevVarRW call here in init() has already run - can look up the
  // {read, write} pair a canonical name landed on, the same way
  // nameDB_.getName re-resolves an ALREADY-reserved dim'd name elsewhere
  // in this codebase. reserveDevVarRW itself must already have been called
  // (from HERE, during init) for a given canonicalName before any
  // generator tries to read it back this way - unlike the ordinary
  // reserveDevVar/nameDB_ pool, there's no lazy/on-demand path.
  this.superchipRwPairs = routedRwPairs;
  const reserveDevVarRW = (canonicalName, description) => {
    if (description && !(canonicalName in this.devVarDescriptions)) {
      this.devVarDescriptions[canonicalName] = description;
    }
    if (routedRwPairs[canonicalName]) return routedRwPairs[canonicalName];
    // DPC+ has no spare variables to speak of, and the arguments of a Data table lookup by a runtime id are written
    // and read back within a few statements, so they use the compiler's scratch bytes instead of variables.
    const scratch = config.kernel === 'dpcplus' && DPCPLUS_SCRATCH_ARGS[canonicalName];
    if (scratch) {
      routedRwPairs[canonicalName] = {read: scratch, write: scratch};
      return routedRwPairs[canonicalName];
    }
    if (this.superchipRwUsed < superchipRwCapacity) {
      const index = this.superchipRwUsed;
      this.superchipRwUsed += 1;
      const digits = String(index).padStart(3, '0');
      const pair = {read: `r${digits}`, write: `w${digits}`};
      routedRwPairs[canonicalName] = pair;
      this.superchipRwAssignments.push(
          {name: canonicalName, slot: `r${digits}/w${digits}`, description, isUserVariable: false});
      return pair;
    }
    const symbol = reserveDevVar(canonicalName, undefined, description);
    const pair = {read: symbol, write: symbol};
    routedRwPairs[canonicalName] = pair;
    return pair;
  };

  // Add developer variables (not created or named by the user).
  const devVarList = Blockly.Variables.allDeveloperVariables(workspace);
  for (let i = 0; i < devVarList.length; i++) {
    reserveDevVar(devVarList[i]);
  }

  // Same developer-variable bucket as above, for the hidden per-pair bytes
  // "Distance" blocks need (see the distanceChecks pre-scan above and
  // generators/bbasic/input.js's generateDistanceChecks) - routed through
  // nameDB_.getName here (rather than left as the raw canonical string) so
  // its  getter/check generators, which look the same name up again
  // later, are guaranteed to agree on whatever nameDB_ actually assigns.
  for (const varName of this.distanceChecks.keys()) {
    reserveDevVar(varName, undefined, '"Distance" block\'s hidden result byte');
  }

  // Same bucket again, for "Distance to point" blocks'  per-instance
  // hidden bytes (see the distancePointChecks pre-scan above and
  // generators/bbasic/input.js's generateDistancePointChecks).
  for (const {axis, index} of this.distancePointChecks.values()) {
    reserveDevVar(distancePointVarName(axis, index), undefined, '"Distance to point" block\'s hidden result byte');
  }

  // Same bucket again, for the keypad poll routine's  result byte(s)
  // (see the keypad0Used/keypad1Used pre-scan above and
  // generators/bbasic/input.js's generateKeypadPollAsm) - only whichever
  // side(s) are actually used get one.
  // Resolved names captured on "this" (not just reserved) - registering
  // the poll subroutine's  body needs them, but has to wait until
  // "this.subroutines = {}" below runs first (see that assignment's
  // comment on why registering any earlier here would just get wiped out).
  if (this.keypad0Used) this.keypadLeftVarName = reserveDevVar(keypadKeyVarName('0'), undefined, 'keypad 0 poll result');
  if (this.keypad1Used) this.keypadRightVarName = reserveDevVar(keypadKeyVarName('1'), undefined, 'keypad 1 poll result');

  // Same bucket again, for the shared background line-drawing subroutine's
  // working variables (see registerBackgroundLineSubroutine in
  // generators/bbasic/background.js) - resolved names captured on "this"
  // (not just reserved) for the same reason as keypadLeftVarName/
  // keypadRightVarName just above: registering the subroutine's  body
  // needs them, but has to wait until "this.subroutines = {}" below runs
  // first. 7 vars: the current point/target point/distances/error term -
  // no separate loop counter (the current point already walking toward the
  // target IS the loop's  stop condition) or operation selector (the
  // operation is baked into which of the - up to 3 - subroutines gets
  // called, not read at runtime). An earlier version tried to keep the
  // current point/target point/distances in the shared temp1-temp6 scratch
  // registers instead of dedicated vars entirely, which was wrong (see
  // registerBackgroundLineSubroutine's  comment for the real, reported
  // bug this caused: pfpixel's  implementation clobbers temp1/temp2
  // internally, corrupting them the instant the first pixel was plotted).
  if (this.backgroundLineUsed) {
    this.backgroundLineVarNames = {
      // Read/write pairs: only plain adds, subtracts and comparisons touch these,
      // so they fit Superchip RAM's separate pool (see reserveDevVarRW) and
      // leave seven of the ordinary variables free.
      x1: reserveDevVarRW('lineX1', 'background line: current X position'),
      y1: reserveDevVarRW('lineY1', 'background line: current Y position'),
      x2: reserveDevVarRW('lineX2', 'background line: end X position'),
      y2: reserveDevVarRW('lineY2', 'background line: end Y position'),
      dx: reserveDevVarRW('lineDX', 'background line: X distance'),
      dy: reserveDevVarRW('lineDY', 'background line: Y distance'),
      err: reserveDevVarRW('lineErr', 'background line: Bresenham error term'),
    };
  }

  // Which Title Screen page a "Draw title screen" block wants drawn next -
  // written right before that block's  gosub into the one shared
  // Titlescreen Kernel subroutine every page compiles into (see
  // registerTitleScreenSubroutine in generators/bbasic/titlescreen.js),
  // which reads it back at runtime to choose which page's  layout/color
  // to draw. Captured on "this" for the same reason keypadLeftVarName/
  // keypadRightVarName are: registerTitleScreenSubroutine needs it, but has
  // to run AFTER "this.subroutines = {}" resets below.
  if (this.titleScreenDrawUsed) {
    // The page number only matters with more than one page: the shared routine
    // draws the only page there is without reading it (see buildDriverAsm in
    // generators/bbasic/titlescreen.js), so a project with one page skips the variable.
    if (processTitleScreenStorageDefaults(useTitleScreenStorage()).screens.length > 1) {
      this.titleScreenSelectedIdVarName = reserveTitleDevVar(
          'titleScreenSelectedId', undefined, 'Which Title Screen page to draw next');
    }

    // Every animated Title Screen card (more than one frame - see
    // isCardAnimated's comment in blocks/titlescreen.js) needs a
    // duration-tick counter dev var reserved here, by "screenId:cardId" ref
    // (not by resolved kernel slot key, which registerTitleScreenSubroutine
    // doesn't compute until later - see titleCardFrameCounterVarName's
    // comment). Cards also targeted by a "Set title screen scroll position"
    // block get a second, scroll-offset var too - titleScreenScrollTargetRefs
    // is stashed here (not just used locally) so registerTitleScreenSubroutine
    // and titlescreen_scroll_set's generator (both run later) know which
    // refs actually got one, without re-scanning the workspace themselves.
    this.titleScreenScrollTargetRefs = new Set(workspace.getAllBlocks(false)
        .filter((block) => block.type === 'titlescreen_scroll_set' || block.type === 'titlescreen_scroll_by')
        .map((block) => block.getFieldValue('CARD')).filter((ref) => existingCards.has(ref)));
    // Which "ref|edge" a "When title screen scroll reaches" block watches -
    // "Scroll title screen graphic" only sets the flags something watches.
    this.titleScrollEdgeWatches = new Set(workspace.getAllBlocks(false)
        .filter((block) => block.type === 'titlescreen_scroll_edge_reached' &&
          existingCards.has(block.getFieldValue('CARD')))
        .map((block) => `${block.getFieldValue('CARD')}|${block.getFieldValue('EDGE')}`));
    // One bit per watched card edge, packed eight to a byte.
    this.titleScrollEdgeSlots = titleScrollEdgeFlagSlots(this.titleScrollEdgeWatches);
    new Set([...this.titleScrollEdgeSlots.values()].map((slot) => slot.varName)).forEach((varName) => {
      reserveTitleDevVar(varName, undefined, 'title screen scroll reached an edge, a bit for each "When title screen scroll reaches" block');
    });
    resolveAnimatedTitleScreenCardRefs().forEach((ref) => {
      reserveTitleDevVar(titleCardFrameCounterVarName(ref), undefined,
          'title screen card animation: duration-tick counter');
      if (this.titleScreenScrollTargetRefs.has(ref)) {
        reserveTitleDevVar(titleCardScrollOffsetVarName(ref), undefined,
            'title screen card animation: scroll offset within the current frame');
      }
    });
    // bmp_KEY_index (buildCardDataAsm in generators/bbasic/titlescreen.js) is
    // aliased to this real dev var's resolved address instead of being a
    // raw asm byte, so a runtime write to it actually lands in RAM - see
    // titleCardIndexVarName's comment. Reserved by ref, same timing
    // reasoning as the counter/scroll-offset vars just above.
    // Some of these bytes (the picture's frame offset and the row color list's offset and page of an animated graphic that does not
    // scroll) are worked out from the graphic's frame counter just before its page is drawn (see titlescreen_draw), so they only
    // matter while that page shows. The ones of graphics on different pages can be the same byte: the first page's graphics' bytes
    // are shared with the second's, and so on, one byte for each of the most any page needs.
    const animatedRefs = new Set(resolveAnimatedTitleScreenCardRefs());
    const derivedCandidates = [];
    const addDerived = (refs, nameOf, rank, allowed) => refs.forEach((ref) => {
      if (animatedRefs.has(ref) && !this.titleScreenScrollTargetRefs.has(ref) && allowed(ref)) {
        derivedCandidates.push({name: nameOf(ref), page: ref.split(':')[0], rank});
      }
    });
    addDerived(resolveTitleScreenCardsNeedingIndexRefs(), titleCardIndexVarName, 0, () => true);
    addDerived(resolveColorSplitCardRefs(), titleCardColorIndexVarName, 1, (ref) => !this.titleRowFadePlans[ref]);
    addDerived(resolveColorPageCardRefs(), titleCardColorPageVarName, 2, () => true);
    const derivedByPage = new Map();
    derivedCandidates.sort((a, b) => a.rank - b.rank || (a.name < b.name ? -1 : 1)).forEach((candidate) => {
      if (!derivedByPage.has(candidate.page)) derivedByPage.set(candidate.page, []);
      derivedByPage.get(candidate.page).push(candidate.name);
    });
    const derivedSlots = [];
    derivedByPage.forEach((names) => names.forEach((name, index) => {
      (derivedSlots[index] = derivedSlots[index] || []).push(name);
    }));
    this.titleDerivedVars = new Set();
    const derivedAliasOf = {};
    derivedSlots.filter((group) => group.length > 1).forEach((group) => {
      group.forEach((name) => this.titleDerivedVars.add(name));
      group.slice(1).forEach((name) => {
        derivedAliasOf[name] = group[0];
      });
    });
    this.titleAliasPairs = [];
    const reserveCardVar = (canonicalName, description) => {
      if (!derivedAliasOf[canonicalName]) {
        reserveTitleDevVar(canonicalName, undefined, description);
        return;
      }
      const name = this.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      if (!(name in this.devVarDescriptions)) this.devVarDescriptions[name] = description;
      this.titleAliasPairs.push({alias: name,
        rep: this.nameDB_.getName(derivedAliasOf[canonicalName], Blockly.Names.DEVELOPER_VARIABLE_TYPE)});
    };
    resolveTitleScreenCardsNeedingIndexRefs().forEach((ref) => {
      reserveCardVar(titleCardIndexVarName(ref), 'title screen card: bmp_KEY_index storage (frame/scroll offset)');
    });
    // An animation that repeats a picture under different colors keeps its row color list's frame offset in a
    // separate byte (titleCardColorSplit).
    resolveColorSplitCardRefs().forEach((ref) => {
      reserveCardVar(titleCardColorIndexVarName(ref), 'title screen card: bmp_KEY_colorindex storage (row color list frame offset)');
    });
    resolveColorPageCardRefs().forEach((ref) => {
      reserveCardVar(titleCardColorPageVarName(ref), 'title screen card: bmp_KEY_colorpage storage (page of its row color lists)');
    });
    this.titleCardColorRefs.forEach((ref) => {
      reserveTitleDevVar(titleCardColorVarName(ref), undefined,
          'title screen graphic: its color ("Set title screen graphic color" block)');
    });
    // A multicolor graphic's fade is the step it is on (its color list offset, which the kernel reads) and a timer.
    Object.keys(this.titleRowFadePlans).forEach((ref) => {
      reserveTitleDevVar(titleCardFadeTimerVarName(ref), undefined, 'title screen graphic color fade: frames until the next step');
    });
    this.titleFadeRefs.forEach((ref) => {
      reserveTitleDevVar(titleCardFadeTargetVarName(ref), undefined, 'title screen graphic color fade: the color it fades to');
      reserveTitleDevVar(titleCardFadeTimerVarName(ref), undefined, 'title screen graphic color fade: frames until the next step');
      if (this.titleFadeConstantPace[ref] === undefined) {
        reserveTitleDevVar(titleCardFadePaceVarName(ref), undefined, 'title screen graphic color fade: frames a step takes');
      }
    });
    [0, 1].forEach((playerIndex) => {
      if (this.titlePlayerIndexUsed[playerIndex]) {
        reserveTitleDevVar(titlePlayerIndexVarName(playerIndex), undefined,
            `title screen Player ${playerIndex} sprite: its frame (bmp_player${playerIndex}_index)`);
      }
      if (this.titlePlayerSlots && this.titlePlayerSlots[playerIndex].frameCount > 1) {
        reserveTitleDevVar(titlePlayerFrameVarName(playerIndex), undefined,
            `title screen Player ${playerIndex} sprite: duration-tick counter`);
      }
    });
    this.titleBoxRefs.forEach((ref) => {
      reserveTitleDevVar(titleCardBoxPf1VarName(ref), undefined, 'title screen picture background: playfield blocks 1-8 (PF1)');
      reserveTitleDevVar(titleCardBoxPf2VarName(ref), undefined, 'title screen picture background: playfield blocks 9-16 (PF2)');
      reserveTitleDevVar(titleCardBoxColorVarName(ref), undefined, 'title screen picture background: its color');
    });
    if (this.titleBgUsed) {
      reserveTitleDevVar(TITLE_BG_COLOR_VAR_NAME, undefined,
          'title screen: the background color the kernel draws ("Set title screen background color" block)');
    }
  }

  // Same bucket again, for "Background get pixel" blocks'  X/Y scratch
  // storage (see the backgroundGetPixelUsed pre-scan above and
  // generators/bbasic/background.js's  background_get_pixel). Routed
  // through reserveDevVarRW - background_get_pixel's  generator only
  // ever does a plain write (readX = argumentX) followed by a plain read,
  // used as a pfread(...) argument (explicitly the manual's  endorsed
  // "read variables as function arguments" pattern) - confirmed by hand
  // against the actual generator, no other use site touches either var
  // (background_change_pixel, the sibling setter block, uses temp1/temp2
  // instead, never these).
  if (this.backgroundGetPixelUsed) {
    reserveDevVarRW(backgroundGetPixelXVarName(), '"get pixel" X arg, when used inside a Function');
    reserveDevVarRW(backgroundGetPixelYVarName(), '"get pixel" Y arg, when used inside a Function');
  }

  // Same bucket again, for "Find playfield pixel collided with" blocks'
  // result (column/row) and scratch (nudged-candidate) vars (see the
  // collisionPixelUsed pre-scan above and generators/bbasic/background.js's
  // background_collision_pixel).
  // "Background area ... is clear" (see background_area_clear's generator): the
  // one variable its scan needs.
  if (workspace.getAllBlocks(false).some((block) =>
    block.type === 'background_area_clear' && block.isEnabled() && !block.getInheritedDisabled())) {
    reserveDevVarRW(areaClearLeftVarName(), 'area clear check: the left column each row restarts from');
  }

  if (this.collisionPixelUsed) {
    reserveDevVarRW(collisionPixelColumnVarName(), 'playfield collision column result');
    reserveDevVarRW(collisionPixelRowVarName(), 'playfield collision row result');
  }

  // Same bucket again, for function_call_statement's  discarded-return-
  // value scratch var (see the functionCallStatementUsed pre-scan above and
  // generators/bbasic/function.js's  function_call_statement) - also
  // reserved for the dataBitDispatchByIdUsed/musicSongPlayingByNumberUsed/
  // textShowByIdUsed cases (see their  pre-scan comments above), which
  // each reuse this same var (a value captured once, then read back a few
  // times immediately after, never held across another nested Function
  // call - see functionCallDiscardVarName's  comment) rather than adding
  // one.
  // These three groups go through reserveDevVarRW (Superchip's  r/w
  // pool, falling back to the ordinary reserveDevVar pool automatically
  // when that one isn't available - see its  comment) rather than
  // reserveDevVar directly: every use of each is either a plain
  // assignment/function-call-result on the write side, or a plain
  // reference/function-argument/if-comparison on the read side - checked
  // by hand against the real usage guidelines these variables come with
  // (see reserveDevVarRW's  comment for the full list) - never a
  // for/next counter, an on...goto target, or fixed-point/16-bit math.
  if (this.functionCallStatementUsed || this.dataBitDispatchByIdUsed ||
      this.dataElementDispatchByIdUsed ||
      this.musicSongPlayingByNumberUsed || this.textShowByIdUsed) {
    reserveDevVarRW(functionCallDiscardVarName(),
        'a just-called Function\'s return value (bare statement call, a Data table element/bit ' +
        'lookup by a runtime table id, or "Song ID is playing"), or "Show text with ID"/"Scroll ' +
        'text ID"\'s captured argument - each writes it once and reads it back immediately ' +
        'after, never across another Function call');
  }
  // Same bucket again, for the Data table dispatch wrappers'  shared
  // argument slots (see registerDataDispatchCallWrapper/
  // registerDataBitDispatchCallWrapper in generators/bbasic/data.js) - the
  // "table id"/"index" args are shared by BOTH the element and bit lookup,
  // since only one such call is ever in flight at a time (same "written
  // once, read back immediately, never held across another nested call"
  // lifetime functionCallDiscardVarName's  comment documents); the "bit"
  // arg only exists for data_get_bit_by_id's  dynamic path.
  if (this.dataElementDispatchByIdUsed || this.dataBitDispatchByIdUsed) {
    reserveDevVarRW(dataDispatchArg1VarName(), 'a Data table element/bit lookup by runtime id: the table id argument');
    reserveDevVarRW(dataDispatchArg2VarName(), 'a Data table element/bit lookup by runtime id: the index argument');
  }
  if (this.dataBitDispatchByIdUsed) {
    reserveDevVarRW(dataBitDispatchArg3VarName(), 'a Data table bit lookup by runtime id: the bit-index argument');
  }
  // Only as many argument slots as a call can fill or a Function can read: a call hands over the arguments its blocks connect, and a
  // Function reads the ones its Function argument blocks name (a slot nobody reads or fills costs a variable, and a store in every call).
  this.functionCallArgCount = 0;
  if (this.functionCallStatementUsed) {
    const connected = workspace.getBlocksByType('function_call', false).concat(workspace.getBlocksByType('function_call_statement', false))
        .map((block) => Math.max(0, ...Array.from({length: MAX_FUNCTION_ARGS}, (_, i) => i + 1)
            .filter((i) => block.getInputTargetBlock(`ARG${i}`))));
    this.functionCallArgCount = Math.max(0, ...connected, ...(this.functionParamIndicesUsed || []));
    for (let i = 1; i <= this.functionCallArgCount; i++) {
      reserveDevVarRW(functionCallArgVarName(i), `calling a Function as a bare statement passes argument ${i} through here`);
    }
  }

  // Same bucket again, for function_param_get's  snapshot vars (see the
  // functionParamIndicesUsed pre-scan above and generators/bbasic/
  // function.js's function_define/function_param_get generators).
  this.functionParamIndicesUsed.forEach((i) => {
    reserveDevVarRW(functionParamVarName(i),
        `a Function's argument ${i}, snapshotted at entry so a later nested Function call can't clobber it`);
  });

  // Same bucket again, for the collision-check backtrack bytes (see the
  // collisionMovePlayers pre-scan above and generators/bbasic/collision.js).
  // Routed through reserveDevVarRW - collision_check_position's
  // generator only ever does plain "player0x = oldX" (read) and
  // "oldX = player0x" (write) statements, confirmed by hand against the
  // actual generator - no raw inline asm, no in-place dec/inc/rol, no
  // bit-indexed access anywhere near either var.
  for (const playerNum of this.collisionMovePlayers) {
    reserveDevVarRW(collisionMoveOldXVar(playerNum), 'collision-move\'s "undo" X for this player');
    reserveDevVarRW(collisionMoveOldYVar(playerNum), 'collision-move\'s "undo" Y for this player');
  }
  for (const playerNum of this.collisionMoveTwoFramePlayers) {
    reserveDevVarRW(collisionMoveOlderXVar(playerNum), 'the undo X from two frames ago for this player');
    reserveDevVarRW(collisionMoveOlderYVar(playerNum), 'the undo Y from two frames ago for this player');
  }

  // Same bucket again, for every dev var the music player's  generated
  // code needs (see the projectMusic pre-scan above) - every "does this
  // project actually need this specific var" decision lives in
  // generators/bbasic/music.js's  reserveMusicDevVars now, right next to
  // the rest of that file's music-generation logic, rather than duplicated
  // here. A no-op when this.projectMusic is null (nothing here is worth
  // reserving without real music to play).
  reserveMusicDevVars(reserveDevVar, reserveDevVarRW, this.projectMusic, this.musicEventFlags);

  // Same bucket again, for scorebkcolor's  dev var (see the
  // scoreBkColorNeedsOwnVar pre-scan above and generators/bbasic/score.js's
  // generateScoreBkColorRuntimeDims).
  if (this.scoreBkColorNeedsOwnVar) {
    reserveDevVar(scoreBkColorVarName(), undefined, 'score row\'s background color');
  }

  // Same bucket again, for the Text Minikernel's  per-character
  // scrolling feature (see generators/bbasic/text-scroll.js) - a no-op
  // unless textScrollUsed's  early pre-scan (above) found a genuine
  // scroll-related block on the canvas, same reasoning as
  // scoreBkColorNeedsOwnVar just above. Gated on textScrollUsed, not plain
  // textMinikernelUsed - a project using only plain, static "Show text"
  // blocks needs none of these.
  reserveTextScrollDevVars(reserveDevVar, this.textScrollUsed, this.textScrollConstants);
  // The text on a Title Screen page returns from the text kernel to the title kernel's bank by hand (see posttextkernel in text12a.asm):
  // this byte says the call came from there.
  if (this.isTitleTextUsed()) {
    reserveDevVar('titleTextFlag', undefined, 'the text kernel was called by the Title Screen kernel: it returns to that bank');
  }

  // Same bucket again, for "Scroll text lines up/down"'s  valid-range
  // tracking (see setTextLinesRangeCode's  comment in generators/bbasic/
  // text-minikernel.js) - a no-op unless textLineScrollUsed's  early
  // pre-scan (above) found one of those two blocks on the canvas.
  if (this.textLineScrollUsed) {
    reserveDevVar(textLinesBaseVarName(), undefined,
        'currently shown message: lowest TextIndex "Scroll text lines up" can reach');
    reserveDevVar(textLinesMaxVarName(), undefined,
        'currently shown message: highest TextIndex "Scroll text lines down" can reach');
  }

  // Same bucket again, for row 2's  color (settable via the merged
  // "Text: set color" block's  ROW dropdown - row 1 is the default, so
  // this only needs reserving when something actually targets row 2, see
  // textRow2ColorBlockUsed's  pre-scan above) and the scroll cursor's
  // color ("Text: set scroll cursor color") - see textRow2ColorVarName/
  // textScrollCursorColorVarName's  comment in generators/bbasic/
  // text-minikernel.js for why these need real dev vars, unlike TextColor.
  if (this.isTextRow2Used() || this.textRow2ColorBlockUsed) {
    reserveDevVar(textRow2ColorVarName(), undefined,
        'wrapped messages: row 2\'s color ("Text: set color" block\'s ROW dropdown)');
  }
  if (this.textScrollCursorUsed) {
    // The scroll cursor's  runtime show/hide flag ("Text scroll cursor
    // show or hide" block) rides in this same var's  bit 0 rather than
    // needing a reservation - see TEXT_SCROLL_CURSOR_HIDDEN_BIT's
    // comment in generators/bbasic/text-minikernel.js.
    reserveDevVar(textScrollCursorColorVarName(), undefined,
        'the blinking scroll cursor\'s color ("Text: set scroll cursor color" block)');
    reserveDevVar(textEndIconColorVarName(), undefined,
        'the "end of message" icon\'s color ("Text: set end icon color" block)');
  }

  // Same bucket again, for the ROM noise feature's  per-player state (see
  // reserveRomNoiseDevVars'  comment in generators/bbasic/sprites.js) - a
  // no-op unless romNoiseUsedFor's  early pre-scan (above) found it used.
  // Share the small single-bit flag bytes of the sprite features (see
  // generators/bbasic/flag-pool.js): each family lists the bit numbers it
  // actually uses, and gets a run of bits inside one of a few pooled bytes
  // instead of a separate byte. The fade, music and scroll-edge flags (read as
  // whole bytes by assembly) and Run once are not part of this.
  const ownBits = (set, bitOf) => [...(set || [])].map(bitOf).filter((bit) => bit !== undefined);
  planFlagPool([
    {family: ROM_NOISE_FLAGS_FAMILY, bits: [
      ...ownBits([...this.romNoiseUsedFor].filter((name) => !isRomNoiseExtra(name)), romNoiseOwnBit),
      ...ownBits(this.rainbowColorUsedFor, rainbowColorOwnBit),
      ...(this.backgroundRainbowUsed ? [BACKGROUND_RAINBOW_OWN_BIT] : []),
      ...(this.backgroundRainbowUsed && (useConfigurationStorage().value || {}).kernel === 'dpcplus' ?
        [BACKGROUND_RAINBOW_LOADED_BIT] : []),
    ]},
    {family: ROM_NOISE_EXTRA_FAMILY, bits: ownBits([...this.romNoiseUsedFor].filter(isRomNoiseExtra), romNoiseExtraOwnBit)},
    {family: MISSILE_FIRE_FLAGS_FAMILY, bits: ownBits(this.missileFireUsedFor, missileFireOwnBit)},
    {family: FIRE_OFFSCREEN_FLAGS_FAMILY, bits: ownBits(this.fireOffscreenUsedFor, missileFireOwnBit)},
    {family: SEEK_FLAGS_FAMILY, bits: ownBits(this.seekUsedFor, spriteOwnBit)},
    {family: SEEK_ARRIVED_FLAGS_FAMILY, bits: ownBits(this.seekArrivedWatches, spriteOwnBit)},
    {family: SPRITE_SCROLL_FLAGS_FAMILY, bits: ownBits(this.spriteScrollUsedFor, spriteOwnBit)},
    {family: SPRITE_HIDDEN_FLAGS_FAMILY, bits: ownBits(this.spriteHiddenUsedFor, spriteOwnBit)},
    {family: INERTIA_ACCEL_FLAGS_FAMILY, bits: ownBits(this.inertiaAccelUsedFor, spriteOwnBit)},
    {family: INERTIA_DECEL_FLAGS_FAMILY, bits: ownBits(this.inertiaDecelUsedFor, spriteOwnBit)},
    {family: TITLE_KERNEL_ENDED_FAMILY, bits: this.titleEndUsed ? [0] : []},
    {family: TITLE_CARD_HOLD_FAMILY, bits: this.titleCardHoldRefs.map((_, index) => index)},
    {family: TITLE_CARD_ONCE_FAMILY, bits: this.titleCardOnceRefs.map((_, index) => index)},
    {family: TITLE_ANIMATE_FAMILY, bits: this.titleAnimateBlockIds.flatMap((_, index) => [index * 2, index * 2 + 1])},
    {family: TITLE_CARD_REVERSE_FAMILY, bits: this.titleCardReverseRefs.map((_, index) => index)},
    {family: TITLE_CARD_FINISHED_FAMILY, bits: this.titleCardFinishedRefs.flatMap((_, index) => [index * 2, index * 2 + 1])},
    {family: TITLE_PLAYER_ONCE_FAMILY, bits: [0, 1].filter((i) => this.titlePlayerSlots && this.titlePlayerSlots[i].once)},
    {family: TITLE_BG_OVERRIDE_FAMILY, bits: this.titleBgUsed ? [0] : []},
    {family: SWITCH_EDGE_FAMILY, bits: switchEdgeOwnBits(this.switchEdgeUsedFor)},
  ]);
  reserveSwitchEdgeDevVars(reserveDevVar, this.switchEdgeUsedFor);
  if (this.titleCardOnceRefs.length) {
    reserveDevVar(titleCardOnceVar(), undefined, 'title screen graphics set to play once by "Set title screen graphic frame"');
  }
  if (this.titlePlayerSlots && [0, 1].some((i) => this.titlePlayerSlots[i].once)) {
    reserveDevVar(titlePlayerOnceVar(), undefined, 'title screen Player sprites set to play once');
  }
  if (this.titleAnimateBlockIds.length) {
    reserveDevVar(titleAnimateVar(), undefined, 'title screen "Animate graphic" blocks: ran this frame / ran last frame');
  }
  if (this.titleCardReverseRefs.length) {
    reserveDevVar(titleCardReverseVar(), undefined, 'title screen graphics playing in reverse');
  }
  if (this.titleCardFinishedRefs.length) {
    reserveDevVar(titleCardFinishedVar(), undefined, 'title screen graphics whose animation a block waits to finish');
  }
  if (this.titleCardHoldRefs.length) {
    reserveDevVar(titleCardHoldVar(), undefined, 'title screen graphics held on a frame by "Set title screen graphic frame"');
  }
  if (this.titleBgUsed) {
    reserveDevVar(titleBgOverrideVar(), undefined, 'title screen: "Set title screen background color" is in effect');
  }
  if (this.titleEndUsed) {
    reserveDevVar(titleKernelEndedVar(), undefined, 'Title screen update: "End title screen" has stopped the kernel');
  }

  reserveRomNoiseDevVars(reserveDevVar, this.romNoiseUsedFor, this.romNoiseConstHeight);
  reservePlayerHeightLimitDevVars(reserveDevVar, this.playerHeightLimitUsedFor);

  // Same bucket again, for the separate rainbow-colors block's  per-
  // player state - a no-op unless rainbowColorUsedFor's  early pre-scan
  // (above) found it used.
  reserveRainbowColorDevVars(reserveDevVar, reserveDevVarRW, this.rainbowColorUsedFor, this.rainbowSimpleOffset);
  reserveBackgroundRainbowDevVars(reserveDevVar, reserveDevVarRW, this.backgroundRainbowUsed, this.rainbowSimpleOffset);

  // Same bucket again, for "Fire missile"'s  per-missile fired-direction/
  // speed state (see reserveMissileFireDevVars'  comment in generators/
  // bbasic/sprites.js) - a no-op unless missileFireUsedFor's  early
  // pre-scan (above) found it used.
  reserveMissileFireDevVars(reserveDevVar, reserveDevVarRW, this.missileFireUsedFor, this.missileFire16UsedFor,
      this.missileFirePfCheckUsedFor, this.missileFireThrottleUsedFor, this.missileFireConstSpeed);
  if (this.fireOffscreenUsedFor.size) {
    reserveDevVar(fireOffscreenFlagsVarName(), undefined, 'shared byte of the fired objects that went off the screen (a bit each)');
  }

  // Same bucket again, for "Bounce"'s Combat-style stage/original-
  // direction/last-frame state (see reserveMissileBounceDevVars' comment
  // in generators/bbasic/sprites.js) - a no-op unless missileBounceUsedFor's
  // early pre-scan (above) found it used. inertiaUsedFor is passed
  // alongside so the velocity-reflection snapshot vars are only reserved
  // for a sprite that has BOTH Bounce and Inertia in use. Routed through
  // reserveDevVarRW (the Superchip r/w pool - see its comment above) rather
  // than the ordinary lettered pool: every bounce var's actual usage is
  // plain comparisons/assignments/arithmetic-operand reads, the same safe
  // shape background_collision_pixel's col2/row2 already use successfully
  // (generators/bbasic/background.js) - confirmed by hand against the
  // generator below before making this change.
  reserveMissileBounceDevVars(reserveDevVarRW, this.missileBounceUsedFor, this.inertiaUsedFor, this.missileFireUsedFor,
      this.inertiaFineUsedFor);

  // Same bucket again, for "Shake screen"'s  countdown (see
  // reserveShakeScreenDevVar's  comment in generators/bbasic/
  // background.js) - a no-op unless screenShakeUsed's  early pre-scan
  // (above) found it used.
  reserveShakeScreenDevVar(reserveDevVar, this.screenShakeUsed);

  // Same bucket again, for "Seek to"'s  per-sprite target/speed state
  // (see reserveSeekDevVars'  comment in generators/bbasic/sprites.js) -
  // a no-op unless seekUsedFor's  early pre-scan (above) found it used.
  reserveSeekDevVars(reserveDevVar, reserveDevVarRW, this.seekUsedFor);
  reserveLockDevVars(reserveDevVar, this.lockChildren);
  // The right half of a wide player is in the playfield too when the player is asked about, and a block that compares the boxes
  // of two sprites needs how wide each box is (see generators/bbasic/collision.js).
  this.boxWidthPlayers = new Set();
  this.boxPairs = new Set();
  const addPartnerOf = (owner) => {
    if (this.widePartners[owner]) {
      this.pfHitExtras.add(this.widePartners[owner]);
      this.pfBoxPlayers.add(this.widePartners[owner]);
    }
  };
  workspace.getAllBlocks(false).forEach((block) => {
    if (!block.isEnabled()) return;
    if (block.type === 'collision_check_position') {
      addPartnerOf(`player${block.getFieldValue('PLAYER')}`);
    } else if (block.type === 'collision_get') {
      const names = [block.getFieldValue('VAR0'), block.getFieldValue('VAR1')];
      if (names.includes('playfield')) {
        names.forEach(addPartnerOf);
      } else if (names[0] !== names[1] && names.some((name) => this.widePartners[name] || /^player[2-9]$/.test(name))) {
        names.filter(isPlayerName).forEach((name) => this.boxWidthPlayers.add(name));
        this.boxPairs.add(pairKey(names[0], names[1]));
      }
    }
  });
  reservePfBoxDevVars(reserveDevVar, this.pfBoxPlayers, this.pfHitExtras);
  reserveBoxDevVars(reserveDevVar, this.boxWidthPlayers, this.boxPairs);

  // The players a "set width/quantity" block is used for: their animations leave the size alone after it ran (see processAnimation).
  this.sizeSetPlayers = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.isEnabled() && block.type === 'sprite_player_size') {
      this.sizeSetPlayers.add(playerNameOfValue(block.getFieldValue('PLAYER')));
    }
  });
  reserveSizeSetDevVars(reserveDevVar, this.sizeSetPlayers);

  // Same bucket again, for "When ... arrives"'s  shared finished-bit byte
  // (see reserveSeekArrivedDevVars'  comment in generators/bbasic/
  // sprites.js) - a no-op unless seekArrivedWatches'  early pre-scan
  // (above) found a real watch.
  reserveSeekArrivedDevVars(reserveDevVar, this.seekArrivedWatches);

  // Same bucket again, for "Accelerate"/"Decelerate"'s  per-sprite
  // velocity/rate/max-speed state (see reserveInertiaDevVars'  comment in
  // generators/bbasic/sprites.js) - a no-op unless inertiaUsedFor's
  // early pre-scan (above) found it used.
  reserveInertiaDevVars(reserveDevVar, this.inertiaUsedFor, this.inertiaAccelUsedFor, this.inertiaDecelUsedFor,
      this.inertiaAccel16UsedFor, this.inertiaFineUsedFor);

  // Same bucket again, for CTRLPF's  RAM shadow (see
  // reserveCtrlpfShadowDevVar's  comment in generators/bbasic/sprites.js)
  // - a no-op unless ctrlpfShadowUsed's  early pre-scan (above) found it
  // used.
  reserveCtrlpfShadowDevVar(reserveDevVar, this.ctrlpfShadowUsed);
  reserveMissileWidthsDevVar(reserveDevVar, this.missileWidthUsed);
  // The sprites that show the right half of a wide player use that player's animation, frame and color variables.
  this.sharedPartnerVars = {};
  if ((useConfigurationStorage().value || {}).kernel === 'dpcplus') {
    const omittedSystem = this.omittedSystemVars || new Set();
    Object.entries(this.widePartners || {}).forEach(([owner, partner]) => {
      const kept = ['animation', 'frame', 'realcolor'].every((part) => !omittedSystem.has(`${owner}${part}`));
      if (kept) this.sharedPartnerVars[partner] = owner;
    });
  }
  reserveDpcPlusShownDevVars(reserveDevVar, (useConfigurationStorage().value || {}).kernel === 'dpcplus',
      this.dpcPlusExtraPlayers, new Set(Object.keys(this.sharedPartnerVars).map((partner) => Number(partner.slice(6)))));

  // Same bucket again, for "Joystick N direction (8-way)"'s  per-frame
  // result (see joyDir8ResultVarName's  comment in generators/bbasic/
  // input.js) - a no-op unless joyDirection8UsedFor's  early pre-scan
  // (above) found it used.
  reserveJoystickDirection8DevVars(reserveDevVar, this.joyDirection8UsedFor);

  // Same bucket again, for the Fire tap/hold/released/double-tap blocks'
  // shared per-joystick state (see reserveJoystickButtonDevVars'
  // comment in generators/bbasic/input.js) - a no-op unless joyButtonUsedFor's
  // early pre-scan (above) found any of them used.
  reserveJoystickButtonDevVars(reserveDevVar, this.joyButtonUsedFor, this.joyButtonNeedsReleaseFor, reserveDevVarRW);

  // Same bucket again, for each "Fire double-tapped" block's  per-
  // instance result+timer pair (see reserveJoystickDoubleTapDevVars'
  // comment in generators/bbasic/input.js) - a no-op unless
  // joyDoubleTapChecks'  early pre-scan (above) found any such blocks.
  reserveJoystickDoubleTapDevVars(reserveDevVar, this.joyDoubleTapChecks);

  // Same bucket again, for "repeat" loops whose count is a complex
  // expression (see REPEAT_BOUND_VAR_NAME's  comment) - a no-op unless
  // repeatBoundVarUsed's  early pre-scan (above) found a repeat block
  // whose count genuinely needs it, not just any repeat block at all.
  if (this.repeatBoundVarUsed) {
    reserveDevVar(REPEAT_BOUND_VAR_NAME, undefined, '"Repeat X times" bound, when X is a complex expression');
  }
  // Same bucket again, for the "repeat" block's  for-loop variable
  // itself (see REPEAT_COUNTER_VAR_NAME's  comment in
  // generators/bbasic/loops.js) - used to live in SYSTEM_VARIABLES,
  // unconditionally, as the literal identifier "loopcounter"; moved here
  // instead so a project with zero "Repeat" blocks doesn't pay for it.
  if (this.repeatLoopUsed) {
    reserveDevVar(REPEAT_COUNTER_VAR_NAME, undefined, '"Repeat X times" for-loop counter');
  }

  // Same bucket again, for "Wait N frames"' dedicated loop counter (see
  // WAIT_FRAMES_COUNTER_VAR_NAME's  comment) - a no-op unless
  // waitFramesUsed's  early pre-scan (above) found one at all.
  if (this.waitFramesUsed) {
    reserveDevVar(WAIT_FRAMES_COUNTER_VAR_NAME, undefined, '"Wait N frames" for-loop counter');
  }

  // Same bucket again, for channnel0duration/channnel1duration (see
  // SYSTEM_VARIABLES' comment and this.channelDurationUsed's
  // pre-scan above) - a no-op unless a "Play sound" block or music is
  // actually present anywhere in the project.
  if (this.channelDurationUsed) {
    ['0', '1', '2', '3'].forEach((channel) => {
      if (this.channelDurationChannels.has(channel)) {
        reserveDevVar(`channnel${channel}duration`, undefined, `frames left before AUDV${channel} auto-silences`);
      }
    });
  }

  // What the sound registers of the chip's channels become under DPC+ (see generators/bbasic/dpcplus-audio.js).
  if (this.dpcAudioPlan) {
    const labels = {dpcAudc: 'waveform (AUDC)', dpcAudv: 'volume (AUDV)'};
    dpcAudioVars(this.dpcAudioPlan.channels).forEach((name) =>
      reserveDevVar(name, undefined, `channel ${name.slice(-1)} ${labels[name.slice(0, -1)]}`));
  }

  // Each channel's  attack+decay frame countdown (see
  // generators/bbasic/soundfx.js's  registerEnvelopeConfig/
  // generateEnvelopeChecks) - a plain byte, not packed into the shared
  // envelopeConfig nibble pair (var47), since it needs the full 0-32 range
  // (up to ENVELOPE_STAGE_FRAME_OPTIONS' max of 16 frames each for
  // attack AND decay) rather than a 4-bit index. Reserved independently per
  // channel - soundEffectChannelHasEnvelope checks that SPECIFIC channel's
  // soundfx_play blocks (CHANNEL is a fixed field, known at compile
  // time), same as projectMusic's  channelHasEnvelope already does for
  // Music tracks - a project using envelope only on one channel doesn't pay
  // for the other, and a Sound tab preset with Envelope on that's never
  // actually triggered anywhere costs nothing at all.
  // Stashed on "this" (not just a local) so generateEnvelopeChecks below can
  // read the exact same per-channel decision later and skip building (and
  // so skip resolving) that channel's  dispatch section entirely when
  // it's false - envelopeStageNUsed has to stay in lockstep with whether
  // that var was actually reserved, or a channel this skips reserving for
  // would still get referenced by unconditionally-generated asm, and DASM
  // would fail on an undeclared symbol.
  this.envelopeStage0Used =
    soundEffectChannelHasEnvelope(workspace, '0') || !!(this.projectMusic && this.projectMusic.channelHasEnvelope[0]);
  this.envelopeStage1Used =
    soundEffectChannelHasEnvelope(workspace, '1') || !!(this.projectMusic && this.projectMusic.channelHasEnvelope[1]);
  // The chip's second and third voices (channels 2 and 3) have an envelope countdown each.
  [2, 3].forEach((channel) => {
    this[`envelopeStage${channel}Used`] = !!this.dpcAudioPlan && this.dpcAudioPlan.isChannel(channel) && (
      soundEffectChannelHasEnvelope(workspace, `${channel}`) ||
      !!(this.projectMusic && this.projectMusic.channelHasEnvelope[channel]));
    if (this[`envelopeStage${channel}Used`]) {
      reserveDevVar(`envelopeStage${channel}`, undefined, `channel ${channel}'s attack+decay frame countdown`);
    }
  });
  if (this.envelopeStage0Used) {
    reserveDevVar('envelopeStage0', undefined, 'channel 0\'s attack+decay frame countdown');
  }
  if (this.envelopeStage1Used) {
    reserveDevVar('envelopeStage1', undefined, 'channel 1\'s attack+decay frame countdown');
  }
  // DPC+ has no spare fixed bytes (the virtual sprites' memory is only free while those sprites are not used),
  // so there the shared envelope byte is an ordinary variable.
  if (config.kernel === 'dpcplus' && (this.envelopeStage0Used || this.envelopeStage1Used)) {
    reserveDevVar('envelopeConfig', undefined, 'both channels\' envelope-config index, packed one nibble each');
  }
  // The same for channels 2 and 3 (low and high nibble).
  if (this.envelopeStage2Used || this.envelopeStage3Used) {
    reserveDevVar('envelopeConfigB', undefined, 'channel 2 and 3 envelope-config index, packed one nibble each');
  }

  // "rand16" is a real batari Basic feature (see std_routines.asm's
  // "ifconst rand16" check), not an app invention - simply DIMming a
  // variable with this EXACT name switches the standard kernel's randomize
  // routine from an 8-bit-period LFSR to a 16-bit-period one, widening
  // "rand"'s  cycle length before it starts visibly repeating. "rand"
  // itself (see random_get/random_range_get in generators/bbasic/random.js)
  // is read completely unchanged either way - a project-wide kernel
  // behavior switch, not a per-block choice, so it's a single Options tab
  // toggle (Configuration.vue's "Use 16-bit random number generator", under
  // Kernel Optimization) rather than a per-Random-block checkbox (an
  // earlier version of this had one there instead, reverted at the user's
  // request in favor of one setting for the whole project). Routed
  // through the normal reserveDevVar pool (confirmed directly against
  // Blockly's  Names class: a simple, never-colliding name like this
  // passes through nameDB_.getName() completely unchanged, so the emitted
  // "dim rand16 = ..." line keeps the exact literal symbol name
  // "ifconst rand16" checks for) rather than a hand-picked fixed slot like
  // var44-47 - that 4-byte pool is already tightly booked between
  // envelopeConfig, TextIndex, and TextDataPtr's  high byte (see their
  // comments), so claiming one more of those slots here risked a real
  // collision that the dynamic pool's  dedup logic doesn't have. Only
  // reserved while the toggle is actually on, so a project that doesn't
  // need the wider period never pays the variable's cost.
  // (Not under DPC+: its chip has a 32-bit random number generator, so the option is hidden there and ignored here.)
  if (config.enableRand16 && config.kernel !== 'dpcplus') {
    reserveDevVar('rand16', undefined, 'literal name the standard kernel checks for to widen the RNG period');
  }

  // The DPC+ Text Minikernel's four extra scratch bytes (text12DPCplus.asm picks var5-var8 unless these exist, which
  // could collide with the project's variables).
  if (this.textMinikernelUsed && config.kernel === 'dpcplus') {
    ['textoffset8', 'textoffset9', 'textoffset10', 'textoffset11'].forEach((name) =>
      reserveDevVar(name, undefined, 'scratch byte the DPC+ text kernel reads the message through'));
  }

  // A secondary score font (see buildScoreFontOverride in utils/score-font.js): the standard kernel's score code reads the low
  // byte of the table in use from this one variable (see std_overscan.asm), which "Score set font to" changes. Not yet for DPC+.
  this.scoreFontsEnabled = !config.enableCycleScore && !config.enableScanlinesDebug && config.kernel !== 'dpcplus' &&
    secondaryScoreFontName(config.scoreFont, config.secondaryScoreFont) !== null;
  if (this.scoreFontsEnabled) {
    reserveDevVar('scorefontlow', undefined, 'low byte of the score font table in use (primary or secondary)');
  }

  // Same bucket again, for background_fade_to's  per-register state
  // (see blocks/background.js's  comment on backgroundFadeTimerVarName
  // and its neighbors) - only reserved for a register (COLUBK/COLUPF) some
  // fade block in the project actually targets, and only the ONE set of
  // vars that register needs, however many fade blocks target it. Stored
  // on the instance (not a local) so generateBackgroundFadeChecks, which
  // runs later during the final generation pass, knows which registers to
  // emit a per-frame check for.
  // score_fade_to/text_minikernel_fade_to/sprite_player_fade_to (Score/Text/
  // Player tab equivalents of background_fade_to - see generators/bbasic/
  // score.js, generators/bbasic/text-minikernel.js, and generators/bbasic/
  // sprites.js) share this exact same mechanism, just always targeting
  // their  fixed register (score_fade_to/text_minikernel_fade_to) or a
  // Player 0/1-only dropdown (sprite_player_fade_to) rather than offering
  // background_fade_to's  Background/Playfield choice.
  // Multicolor fades: with per-row playfield colors on (and, on DPC+, per-row background colors), "Fade color to" fades every row
  // to the color through row color tables built ahead of time (see generateRowFadeChecks), like "Fade playfield rows from color".
  // The registers it takes over do not get the single color fade's variables and per-frame check.
  const multicolorConfig = (useConfigurationStorage().value) || {};
  const multicolorPlayfield = this.usePlayfieldRowColors() || dpcPlusPfColorsOn(multicolorConfig);
  const multicolorBackground = multicolorConfig.kernel === 'dpcplus' && !!multicolorConfig.enableDpcPlusBkColors;
  const multicolorKindOf = (block) => {
    if (block.type !== 'background_fade_to') return null;
    const rawVar = block.getFieldValue('VAR');
    if (rawVar === 'COLUPF' && multicolorPlayfield) return 'pf';
    if (rawVar === 'COLUBK' && multicolorBackground) return 'bk';
    return null;
  };
  this.multicolorFade = {pf: {from: [], to: []}, bk: {from: [], to: []}, registers: new Set()};
  const multicolorTargets = {pf: new Set(), bk: new Set()};
  workspace.getAllBlocks(false).forEach((block) => {
    const kind = multicolorKindOf(block);
    if (!kind) return;
    this.multicolorFade.registers.add(block.getFieldValue('VAR'));
    const target = block.getInputTargetBlock('VALUE');
    if (target && target.type === 'color_get') multicolorTargets[kind].add(rowFadeStartColor(block));
  });
  this.multicolorFade.pf.to = [...multicolorTargets.pf].sort((a, b) => a - b);
  this.multicolorFade.bk.to = [...multicolorTargets.bk].sort((a, b) => a - b);
  this.multicolorFadeKindOf = multicolorKindOf;
  this.backgroundFadeVarsUsed = new Set();
  // A register whose fade blocks all ask for the same number of frames needs no variable for the pace: it is a
  // constant (undefined for a register where the blocks differ or a number is worked out while the game runs).
  const fadePaces = new Map();
  workspace.getAllBlocks(false).forEach((block) => {
    let rawVar = null;
    if (block.type === 'background_fade_to' && multicolorKindOf(block)) {
      return;
    } else if (block.type === 'background_fade_to' || block.type === 'sprite_player_fade_to') {
      rawVar = block.getFieldValue('VAR');
    } else if (block.type === 'score_fade_to') {
      rawVar = 'scorecolor';
    } else if (block.type === 'text_minikernel_fade_to') {
      rawVar = 'TextColor';
    }
    if (rawVar === null) return;
    this.backgroundFadeVarsUsed.add(rawVar);
    const frames = block.getInputTargetBlock('FRAMES');
    const pace = frames && frames.type === 'math_number' ?
      Math.max(1, Math.floor(Math.round(Number(frames.getFieldValue('NUM'))) / 4)) : null;
    fadePaces.set(rawVar, [...(fadePaces.get(rawVar) || []), pace]);
  });
  this.fadeConstantPace = {};
  fadePaces.forEach((paces, rawVar) => {
    if (paces.every((pace) => pace !== null && pace === paces[0]) && paces[0] <= 255) {
      this.fadeConstantPace[rawVar] = paces[0];
    }
  });
  this.backgroundFadeVarsUsed.forEach((rawVar) => {
    reserveDevVar(backgroundFadeTimerVarName(rawVar), undefined, 'this register\'s fade: frames left on the current step');
    if (this.fadeConstantPace[rawVar] === undefined) {
      reserveDevVar(backgroundFadePaceVarName(rawVar), undefined, 'this register\'s fade: frames per step');
    }
    reserveDevVar(backgroundFadeTargetVarName(rawVar), undefined, 'this register\'s fade: color it\'s fading toward');
  });
  // "Fade playfield rows from color to playfield colors": needs the row color
  // table (see needsPlayfieldColorTable), so it does nothing without it.
  const rowFadeBlocks = workspace.getAllBlocks(false).filter((block) => block.type === 'background_fade_rows_from');
  const rowFadeColors = (kind) => [...new Set(rowFadeBlocks
      .filter((block) => (block.getFieldValue('VAR') === 'COLUBK' ? 'bk' : 'pf') === kind).map(rowFadeStartColor))]
      .sort((a, b) => a - b);
  this.multicolorFade.pf.from = multicolorPlayfield ? rowFadeColors('pf') : [];
  this.multicolorFade.bk.from = multicolorBackground ? rowFadeColors('bk') : [];
  this.rowFadeStartColors = this.multicolorFade.pf.from;
  ['pf', 'bk'].forEach((kind) => {
    if (!this.multicolorFade[kind].from.length && !this.multicolorFade[kind].to.length) return;
    [['Step', 'which prebuilt row color table is showing (255 = no fade)'],
      ['Timer', 'frames since the last step'], ['Pace', 'frames per step'],
      ['Start', 'which fade color\'s tables to use'], ['Bg', 'background currently loaded']]
        .forEach(([part, description]) => reserveDevVar(multicolorFadeVarName(kind, part), undefined,
            `${kind === 'bk' ? 'background' : 'playfield'} row fade: ${description}`));
  });
  // One shared byte per group of up to 4 fadeable registers (see
  // FADE_FLAGS_REGISTER_GROUPS' comment in blocks/background.js - a 5th+
  // register, like sprite_player_fade_to's  player0realcolor/
  // player1realcolor, gets its  second byte, since the first one's 8 bits
  // are already spoken for by Background/Playfield/Score/Text) - reserved
  // per GROUP as soon as any of that group's  registers needs it (a
  // "finished" watch, a fade_to trigger, or an "is active" check), since the
  // "active" bits alone (with no finished watch and, via background_fade_
  // active/sprite_player_fade_active, not even a matching fade_to block on
  // that same register) still need their  byte to exist for the read to
  // be valid.
  const fadeActiveCheckVars = hasBackgroundFadeActiveChecks(workspace);
  const allFadeVarsNeedingAByte = new Set([
    ...this.backgroundFadeFinishedWatches, ...this.backgroundFadeVarsUsed, ...fadeActiveCheckVars, ...this.multicolorFade.registers,
  ]);
  FADE_FLAGS_REGISTER_GROUPS.forEach((group) => {
    if (!group.some((rawVar) => allFadeVarsNeedingAByte.has(rawVar))) return;
    reserveDevVar(fadeFlagsVarName(group[0]), undefined,
        'shared active/finished bit-flags byte for this group of fadeable registers');
  });

  // Whether any scroll feature is used at all (a background_scroll block, the
  // background_scroll_position getter, or a sprite following the scroll) -
  // see scrollTrackingFeatureUsed just below for which of those actually
  // need the position tracked in reserved variables.
  this.backgroundScrollUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'background_scroll' || block.type === 'background_scroll_position' ||
        block.type === 'background_scroll_set_row') ||
      this.spriteScrollUsedFor.size > 0;
  // Which edges (top/bottom) a "When background scroll reaches" block watches -
  // background_scroll only sets the edge flags that something watches.
  this.backgroundScrollEdgeWatches = new Set(workspace.getAllBlocks(false)
      .filter((block) => block.type === 'background_scroll_edge_reached')
      .map((block) => block.getFieldValue('EDGE')));
  const scrollSetRowUsed = workspace.getAllBlocks(false)
      .some((block) => block.type === 'background_scroll_set_row');
  // Whether the scroll position needs tracking at all (the row/max/accumulator
  // variables and their upkeep on every scroll call): only for a stop-at-edge
  // scroll block, a "scroll position" getter, or a sprite following the
  // scroll - otherwise (and with no tall background, which always tracks it)
  // a plain pfscroll is all that's needed and nothing is reserved.
  const scrollTrackingFeatureUsed = workspace.getAllBlocks(false).some((block) =>
    block.type === 'background_scroll_position' || block.type === 'background_scroll_set_row' ||
    block.type === 'background_scroll_edge_reached' ||
    (block.type === 'background_scroll' && block.getFieldValue('STOPATEDGE') === 'TRUE')) ||
    this.spriteScrollUsedFor.size > 0;
  // Only when at least one background is actually taller than the live
  // playfield RAM window (pixels.length > visibleRows - see
  // backgroundsWithOverflowRows' comment) does scrolling need the
  // packed-row patching at all; a project using background_scroll only on
  // normal-height backgrounds keeps using plain pfscroll, unchanged.
  // Only the backgrounds that are compiled count (see getIncludedBackgrounds):
  // one that is left out neither makes scrolling use the packed-row patching
  // nor takes a position in the index.
  const includedBackgrounds = this.getIncludedBackgrounds();
  // DPC+ keeps every row of a background in its playfield memory (up to 256 rows), so a tall background needs
  // no row patching, only pfscroll.
  const dpcPlusScroll = config.kernel === 'dpcplus';
  // The playfield rows are cut into thinner ones (as thin as fits) so each step of the scroll moves few lines: the
  // background repeated over and over, plus the rows on screen, has to fit the 255 rows DPC+ takes.
  // Each background's rows are as tall as its pfres makes them, when it sets one (see backgroundRowLinesFor).
  const backgroundLines = (background) => Math.max(1, Math.round(backgroundRowLinesFor(background, config)));
  this.dpcPlusScroll = null;
  this.dpcPlusScrollFor = null;
  const colorsScrollUsed = workspace.getAllBlocks(false).some((block) => block.type === 'background_scroll_colors');
  if (dpcPlusScroll && (this.backgroundScrollUsed || colorsScrollUsed) && includedBackgrounds.length &&
      includedBackgrounds.every((background) => (background.pixels || []).length)) {
    // One thickness of rows for every background, one that goes into the rows of all of them whole; a background with taller rows is
    // cut into more of them (its repeats).
    for (const fine of [1, 2, 4, 8, 16, 32, 64, 128, 255]) {
      if (!includedBackgrounds.every((background) => {
        const lines = backgroundLines(background);
        return fine <= lines && lines % fine === 0 && background.pixels.length * (lines / fine) + Math.ceil(192 / fine) <= 255;
      })) continue;
      const enabledBlocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled());
      const pfColors = enabledBlocks.some(scrollsPfColors);
      const bkColors = enabledBlocks.some(scrollsBkColors);
      const common = {fine, colors: pfColors || bkColors, pfColors, bkColors};
      // What a background's rows are cut into: how many thin rows make up one of its rows, and how many rows it takes in all.
      this.dpcPlusScrollFor = (background) => {
        const repeats = backgroundLines(background) / fine;
        return {...common, repeats, rows: background.pixels.length * repeats};
      };
      this.dpcPlusScroll = this.dpcPlusScrollFor(includedBackgrounds[0]);
      break;
    }
  }
  // A background too tall to wrap seamlessly (its rows plus the rows on screen do not fit in the 255) scrolls without wrapping
  // instead: it is laid out once from the top of the playfield memory, and the scroll stops at either end.
  if (dpcPlusScroll && !this.dpcPlusScroll && (this.backgroundScrollUsed || colorsScrollUsed) && includedBackgrounds.length &&
      includedBackgrounds.every((background) => (background.pixels || []).length)) {
    for (const fine of [1, 2, 4, 8, 16, 32, 64, 128, 255]) {
      if (!includedBackgrounds.every((background) => {
        const lines = backgroundLines(background);
        return fine <= lines && lines % fine === 0 && background.pixels.length * (lines / fine) <= 255;
      })) continue;
      const enabledBlocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled());
      const pfColors = enabledBlocks.some(scrollsPfColors);
      const bkColors = enabledBlocks.some(scrollsBkColors);
      const common = {fine, colors: pfColors || bkColors, pfColors, bkColors, noWrap: true};
      this.dpcPlusScrollFor = (background) => {
        const repeats = backgroundLines(background) / fine;
        const rows = background.pixels.length * repeats;
        // The rows on screen, and so how far down the picture the top of the view can go.
        const screenLines = Math.min(DPC_PLUS_SCREEN_LINES, Math.max(1, backgroundPfresOf(background, config)) * backgroundLines(background));
        const windowRows = Math.ceil(screenLines / fine);
        return {...common, repeats, rows, windowRows, limit: Math.max(0, rows - windowRows)};
      };
      this.dpcPlusScroll = this.dpcPlusScrollFor(includedBackgrounds[0]);
      break;
    }
  }
  this.dpcPlusScrollRows = this.dpcPlusScroll ? this.dpcPlusScroll.rows : 0;
  // Backgrounds that set a pfres differ in row height and row count. What the code that works with the playfield
  // rows needs to know about the background showing is kept in variables that each background's load sets (only the ones a block of the
  // project needs): the row height the kernel is given every frame (see generateDpcPlusColorPriming), the divisor that turns a
  // y position into a row, the last row, and (a scrolling playfield) how many rows one scroll is long.
  this.dpcPlusRowFracVar = null;
  this.dpcPlusRowDivVar = null;
  this.dpcPlusRowLinesVar = null;
  this.dpcPlusRowMaxVar = null;
  this.dpcPlusScrollRowsVar = null;
  this.dpcPlusGeometries = [];
  if (config.kernel === 'dpcplus') {
    includedBackgrounds.forEach((background) => {
      const lines = backgroundRowLinesFor(background, config);
      const rows = Math.max(1, backgroundPfresOf(background, config) - 1);
      if (!this.dpcPlusGeometries.some((geometry) => geometry.lines === lines && geometry.rows === rows)) {
        this.dpcPlusGeometries.push({lines, rows, frac: dpcPlusRowFracOf(lines)});
      }
    });
    if (this.dpcPlusGeometries.length > 1) {
      const rowBlocks = ['background_pixel_to_sprite', 'background_sprite_to_pixel', 'background_get_resolution',
        'background_collision_pixel', 'background_collision_pixel_direction', 'background_area_clear'];
      const pfBoxUsed = this.pfBoxPlayers.size > 0 || (this.pfHitExtras && this.pfHitExtras.size > 0);
      const rowsUsed = pfBoxUsed || this.missileFireUsedFor.size > 0 || this.missileBounceUsedFor.size > 0 ||
        this.inertiaUsedFor.size > 0 || workspace.getAllBlocks(false).some((block) => rowBlocks.includes(block.type));
      // Under a scroll the kernel's row height is the scroll's, so the variable only tells the playfield box test which rows it has.
      if (!this.dpcPlusScroll || pfBoxUsed) {
        this.dpcPlusRowFracVar = reserveDevVar('_dpcRowFrac', undefined, 'DPC+ playfield row height (DFxFRACINC) of the background showing');
      }
      if (rowsUsed) {
        this.dpcPlusRowDivVar = reserveDevVar('_dpcRowDiv', undefined, 'DPC+ playfield: y steps in a row of the background showing');
        this.dpcPlusRowLinesVar = reserveDevVar('_dpcRowLines', undefined, 'DPC+ playfield: lines in a row of the background showing');
        this.dpcPlusRowMaxVar = reserveDevVar('_dpcRowMax', undefined, 'DPC+ playfield: the last row of the background showing');
      }
      if (this.dpcPlusScroll && new Set(includedBackgrounds.map((background) => dpcPlusScrollTravel(this.dpcPlusScrollFor(background)))).size > 1) {
        this.dpcPlusScrollRowsVar = reserveDevVar('_dpcScrollRows', undefined,
            'DPC+ playfield scroll: how many rows the background showing takes, which is how far a scroll wraps');
      }
    }
  }
  Blockly.BBasic.dpcPlusRowFracVar = this.dpcPlusRowFracVar;
  Blockly.BBasic.dpcPlusRowDivVar = this.dpcPlusRowDivVar;
  Blockly.BBasic.dpcPlusRowLinesVar = this.dpcPlusRowLinesVar;
  Blockly.BBasic.dpcPlusRowMaxVar = this.dpcPlusRowMaxVar;
  Blockly.BBasic.dpcPlusScrollRowsVar = this.dpcPlusScrollRowsVar;
  Blockly.BBasic.dpcPlusGeometries = this.dpcPlusGeometries;
  Blockly.BBasic.dpcPlusScrollFor = this.dpcPlusScrollFor;
  Blockly.BBasic.dpcPlusScroll = this.dpcPlusScroll;
  Blockly.BBasic.dpcPlusScrollRows = this.dpcPlusScrollRows;
  if (this.dpcPlusScrollRows) {
    const colorOnlyBlocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled() &&
      block.type === 'background_scroll_colors');
    // Each kind of row colors that a "Background scroll colors" block scrolls keeps track of how far it has moved.
    Blockly.BBasic.dpcPlusColorOnlyScrollUsed = {
      pf: colorOnlyBlocks.some(scrollsPfColors),
      bk: colorOnlyBlocks.some(scrollsBkColors),
    };
    if (Blockly.BBasic.dpcPlusColorOnlyScrollUsed.pf) {
      reserveDevVar('_dpcColorScrollOffset', undefined, 'DPC+ playfield color rows scroll: how far they have moved');
    }
    if (Blockly.BBasic.dpcPlusColorOnlyScrollUsed.bk) {
      reserveDevVar('_dpcBkColorScrollOffset', undefined, 'DPC+ background color rows scroll: how far they have moved');
    }
    reserveDevVar('_dpcScrollOffset', undefined,
        'DPC+ playfield scroll: how far the view has moved, starting one background height in');
  }
  this.backgroundScrollOverflowBackgrounds = (this.backgroundScrollUsed && !dpcPlusScroll) ?
    backgroundsWithOverflowRows(includedBackgrounds, backgroundDataRows(config)) :
    [];
  this.backgroundScrollPacking = this.backgroundScrollOverflowBackgrounds.length ?
    backgroundScrollPacking(includedBackgrounds) : null;
  this.backgroundScrollTracking = !dpcPlusScroll && (this.backgroundScrollOverflowBackgrounds.length > 0 ||
    (this.backgroundScrollUsed && scrollTrackingFeatureUsed));
  if (this.backgroundScrollTracking) {
    reserveDevVar(backgroundScrollRowVarName(), undefined,
        'the current background\'s top visible row (in overflow mode also holds which background is showing)');
    // Overflow mode keeps no furthest-row variable (looked up from ROM
    // instead) and no shadow accumulator, and the row variable also carries
    // the active background's index - see blocks/background.js.
    if (this.backgroundScrollPacking && !this.backgroundScrollPacking.packed) {
      reserveDevVar(backgroundScrollActiveVarName(), undefined,
          'which background is showing, for a project with too many backgrounds to pack it into the row variable');
    }
    if (!this.backgroundScrollOverflowBackgrounds.length) {
      reserveDevVar(backgroundScrollRowMaxVarName(), undefined,
          'the current background\'s furthest valid scroll row (its row count minus the visible rows)');
      reserveDevVar(backgroundScrollSubRowVarName(), undefined,
          'scanlines accumulated toward the next full row - see its comment in blocks/background.js');
    }
  }
  if (this.backgroundScrollEdgeWatches.size) {
    reserveDevVar(backgroundScrollEdgeFlagsVarName(), undefined,
        'bit 0 = scroll reached the top, bit 1 = reached the bottom (for "When background scroll reaches")');
  }
  // The pending starting row only matters when a background is taller than
  // the window (the only case where the scroll position can be set).
  this.backgroundScrollStartUsed = scrollSetRowUsed && this.backgroundScrollOverflowBackgrounds.length > 0;
  if (this.backgroundScrollStartUsed) {
    reserveDevVar(backgroundScrollStartVarName(), undefined,
        'a requested starting scroll row + 1 (0 = none), applied by the next background load');
  }
  reserveSpriteScrollDevVars(reserveDevVar, this.spriteScrollUsedFor);
  reserveSpriteHiddenDevVars(reserveDevVar, this.spriteHiddenUsedFor);
  // "Background scroll" with "scroll playfield colors" checked (needs the row
  // color table, see needsPlayfieldColorTable) - see
  // BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME in blocks/background.js.
  this.backgroundColorScrollUsed = this.usePlayfieldRowColors() && workspace.getAllBlocks(false)
      .some((block) => scrollsPfColors(block));
  if (this.backgroundColorScrollUsed) {
    reserveDevVar(backgroundColorBgVarName(), undefined,
        'playfield color scroll: which background is loaded');
    reserveDevVar(backgroundColorOffsetVarName(), undefined,
        'playfield color scroll: how many rows the playfield colors are scrolled');
  }

  // Add user variables, but only ones that are being used. Their FINAL
  // routed names are tracked separately (userVarNames) so the ROM capacity
  // display's  per-slot list (see letterVarAssignments/
  // superchipVarAssignments below) can tell an actual user-created variable
  // apart from every OTHER entry in that exact same pool - a dev var some
  // block quietly needs (rand16, collision-move's  backtrack bytes, etc.),
  // not something the user themselves created on the Variables tab.
  const variables = Blockly.Variables.allUsedVarModels(workspace);
  this.userVarNames = new Set();
  const userVarNameById = {};
  for (let i = 0; i < variables.length; i++) {
    const userVarName = reserveDevVar(variables[i].getId(), Blockly.VARIABLE_CATEGORY_NAME);
    this.userVarNames.add(userVarName);
    userVarNameById[variables[i].getId()] = userVarName;
  }
  // The user variables that can live in the display memory when the project runs out of ordinary variable space (see where they
  // are taken out of defvars below): the ones only the Variables blocks that read, set and change a variable use, and not in the
  // condition of a "while" (which is checked again every time round, where the byte a read leaves ahead of the statement would be stale).
  const displayRamNotIds = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    const plain = DISPLAY_RAM_VARIABLE_BLOCK_TYPES.includes(block.type);
    block.inputList.forEach((input) => input.fieldRow.forEach((field) => {
      if (!field.referencesVariables || !field.referencesVariables()) return;
      if (!plain) displayRamNotIds.add(field.getValue());
    }));
    if (block.type === 'variables_get') {
      let child = block;
      for (let parent = block.getParent(); parent; child = parent, parent = parent.getParent()) {
        if (parent.type === 'controls_whileUntil' && parent.getInputTargetBlock('BOOL') === child) {
          displayRamNotIds.add(block.getFieldValue('VAR'));
          break;
        }
      }
    }
  });
  this.displayRamEligibleNames = new Set(Object.entries(userVarNameById)
      .filter(([id, name]) => !displayRamNotIds.has(id) && !(this.displayRamExcluded && this.displayRamExcluded.has(name))).map(([, name]) => name));

  // Blocks that read the display memory (Display RAM get, Data stream read, a spilled variable) hand the byte over in a scratch byte:
  // temp5, temp6, and for a statement that has more of them than that, bytes reserved here. The most any one statement needs is
  // counted by walking up from each such block to the statement it sits in.
  const readsPerStatement = new Map();
  workspace.getAllBlocks(false).filter((block) => block.isEnabled() &&
      (READ_SCRATCH_BLOCK_TYPES.includes(block.type) ||
      (block.type === 'variables_get' && this.displayRamEligibleNames.has(userVarNameById[block.getFieldValue('VAR')])))).forEach((block) => {
    let statement = block;
    while (statement.outputConnection && statement.getParent()) statement = statement.getParent();
    readsPerStatement.set(statement, (readsPerStatement.get(statement) || 0) + 1);
  });
  const mostReads = Math.max(0, ...readsPerStatement.values());
  Blockly.BBasic.readScratchNames = ['temp5', 'temp6'];
  for (let i = 0; i < Math.min(mostReads - 2, MAX_EXTRA_READ_SCRATCH); i++) {
    Blockly.BBasic.readScratchNames.push(reserveDevVar(`_readScratch${i}`, undefined,
        'holds a byte read from the display memory while the rest of a long expression is worked out'));
  }

  // Add the run-once flag bytes computed above, after user variables so an
  // unrelated change in how many "Run once" blocks a project uses never
  // shifts any user variable's  assigned letter (or, with Superchip on,
  // var slot). runOnceByteNames are already-final literal names (not
  // canonical IDs needing nameDB_'s  sanitizing/dedup pass - unlike every
  // category above), so they go through routeDevVar directly, same as the
  // original code pushed them into defvars directly.
  let runOnceDefvarsStart = defvars.length;
  const runOnceSuperchipStart = this.superchipVars.length;
  runOnceByteNames.forEach((name) => routeDevVar(name));
  // Split matches exactly how routeDevVar just placed them: whichever ran
  // out of Superchip room mid-loop falls through to defvars from that point
  // on, so the first (superchipVars.length - runOnceSuperchipStart) of these
  // got var slots and the rest got letters (below, once availableLetters is
  // known) - never more of a mix than that, since routeDevVar never goes
  // back to an earlier pool once it's moved on to the next.
  const runOnceSuperchipCount = this.superchipVars.length - runOnceSuperchipStart;
  this.runOnceByteNames = runOnceByteNames;
  this.runOnceByteLetters = runOnceByteNames
      .slice(0, runOnceSuperchipCount)
      .map((_, i) => `var${SUPERCHIP_VAR_START + runOnceSuperchipStart + i}`);

  // Each Title Screen variable takes the slot of a variable only gameplay uses; the ones left over
  // (more title variables than such variables) take a slot just for themselves after all.
  this.titleSharedSlots = [];
  const gameplayOnlyIds = findGameplayOnlyVariables(workspace, variables);
  const shareable = gameplayOnlyIds.map((id) => userVarNameById[id]);
  const afterEndNames = new Set((gameplayOnlyIds.afterEnd || []).map((id) => userVarNameById[id]));
  if (pendingTitleVars.length > shareable.length) {
    // Past the user variables: the hidden direction byte of every fired object that only gameplay fires. Only
    // bytes in the ordinary pools can take a Title Screen variable's name.
    findGameplayOnlyFireNames(workspace, [...this.missileFireUsedFor], fireOrBounceBlockMatchesName).forEach((name) => {
      const dirName = this.nameDB_.getName(missileFireDirVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      if (defvars.includes(dirName) || this.superchipVars.includes(dirName) || this.dpcPlusVars.includes(dirName)) {
        shareable.push(dirName);
      }
    });
  }
  // Past those: the run-once flag bytes only gameplay-only "Run once" blocks use (no title screen event touches them; the
  // per-frame reset leaves them alone while the title loop runs, see generateRunOnceEdgeReset).
  if (pendingTitleVars.length > shareable.length) {
    runOnceByteNames.slice(Math.ceil(runOnceTitleCount / 4)).forEach((name) => {
      if (defvars.includes(name) || this.superchipVars.includes(name)) shareable.push(name);
    });
  }
  // Past those: whatever else the generated code of a first pass shows only gameplay touching (see title-liveness.js), the
  // system variables included. They start from their starting value again when gameplay starts.
  this.titleSharedInit = new Map();
  // (Only when every Title Screen block is inside the events that run during the title screen: the checks below read the
  // generated code, which cannot tell a title block run during gameplay.)
  if (pendingTitleVars.length > shareable.length && this.gameplayOnlyHints && titlePhaseBlocks(workspace)) {
    const omitted = this.omittedSystemVars || new Set();
    const systemNames = SYSTEM_VARIABLES.map(([name]) => name).filter((name) => !omitted.has(name));
    const inPools = (name) => defvars.includes(name) || this.superchipVars.includes(name) || this.dpcPlusVars.includes(name);
    [...this.gameplayOnlyHints.names].filter((name) => (inPools(name) || systemNames.includes(name) || this.userVarNames.has(name)) &&
      !shareable.includes(name) && !runOnceByteNames.includes(name)).forEach((name) => {
      shareable.push(name);
      this.titleSharedInit.set(name, this.gameplayOnlyHints.initValues.get(name));
    });
  }
  pendingTitleVars.forEach((titleVar) => {
    const target = shareable.shift();
    if (target) this.titleSharedSlots.push({titleVar, target});
    else routeDevVar(titleVar);
  });
  this.titleUnhostedCount = pendingTitleVars.length - this.titleSharedSlots.length;
  // "End title screen" sets back to zero the variables that only code running after it uses, which took a Title Screen variable's slot.
  this.titleEndResets = [...new Set(this.titleSharedSlots.map(({target}) => target).filter((name) => afterEndNames.has(name)))]
      .map((name) => `${name} = 0`);
  // The bytes that are another page's graphics' as well take the same slot as the one they share it with.
  (this.titleAliasPairs || []).forEach(({alias, rep}) => {
    const hosted = this.titleSharedSlots.find(({titleVar}) => titleVar === rep);
    this.titleSharedSlots.push({titleVar: alias, target: hosted ? hosted.target : rep});
  });
  this.runOnceHostedBytes = new Set(this.titleSharedSlots.map(({target}) => target).filter((name) => runOnceByteNames.includes(name)));

  // Declare all of the variables. Without Superchip, the system variables
  // above claim most of the alphabet, leaving only
  // USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP free; with it, the system
  // variables move into var0-14 instead, freeing every letter (everything
  // else has already been routed to var15-var43 first, above, via
  // routeDevVar, so only whatever didn't fit there reaches this
  // letter-assignment loop at all once Superchip is on). With the Text
  // Minikernel active, TEXT_MINIKERNEL_RESERVED_LETTERS also comes off the
  // top regardless of Superchip - see its  comment for why.
  // A system variable this build does without hands its slot to this pool (at the end of it).
  const omittedSystemVars = this.omittedSystemVars || new Set();
  const spilledSystemVars = new Set(this.spillPlan ? SYSTEM_VARIABLES.map(([name]) => name).filter((name) => this.spillPlan.has(name)) : []);
  const freedSystemSlots = SYSTEM_VARIABLES
      .map(([name, letter], i) => (omittedSystemVars.has(name) || spilledSystemVars.has(name)) ?
        (superchipOn(config) ? `var${i}` : letter) : null)
      .filter(Boolean);
  const baseAvailableLetters = (superchipOn(config) ? ALL_LETTERS : USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP)
      .concat(freedSystemSlots);
  const availableLetters = this.isTextMinikernelActive() ?
    baseAvailableLetters.filter((letter) => !TEXT_MINIKERNEL_RESERVED_LETTERS.includes(letter)) :
    baseAvailableLetters;
  // Exposed for the ROM capacity display (see hooks/rom.js's
  // computeVariableUsage) - how many of each variable pool this real build
  // actually used, not just the hard totals those pools'  exported
  // constants (SUPERCHIP_VAR_START/END, USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP)
  // already describe. Computed unconditionally (even when defvars.length is
  // 0, e.g. every dev var fit inside the Superchip pool alone) so the display
  // still has real numbers rather than needing its  fallback logic.
  // Before the letters, a DPC+ project's variables go in the memory the kernel leaves free (DPCPLUS_FREED_SPRITE_RAM).
  const freedSpriteRam = dpcPlusFreedSpriteRam(this.dpcPlusSpriteMax || 1, this.isTextMinikernelActive(), this.titleScreenDrawUsed);
  this.dpcPlusSpriteVars = [];
  // They are used before the letters, not after: the first variables take them (not the run-once bytes at the end, which keep their order).
  if (config.kernel === 'dpcplus' && freedSpriteRam.length) {
    const movable = Math.min(freedSpriteRam.length, runOnceDefvarsStart);
    this.dpcPlusSpriteVars = defvars.splice(0, movable);
    runOnceDefvarsStart -= movable;
  }
  this.dpcPlusSpriteVarSlot = (name) => freedSpriteRam[this.dpcPlusSpriteVars.indexOf(name)];
  // Still more variables than there is room for: some user variables go in the display memory instead (DPC+ only), when it has the
  // spare bytes (see displayRamProblem in generators/bbasic/variables.js). They are given the bytes from the top of the last area down, the
  // opposite end to the one the Display RAM blocks are meant for, and every use of one reads and writes the byte through a data fetcher.
  this.displayRamVars = new Map();
  Blockly.BBasic.displayRamVars = this.displayRamVars;
  if (this.spillPlan && config.kernel === 'dpcplus' && !this.dpcPlusScroll && dpcPlusPfresOf(config) <= 127) {
    [...this.spillPlan].forEach((name) => {
      const i = defvars.indexOf(name);
      if (this.displayRamVars.size >= DISPLAY_RAM_VAR_CAPACITY) return;
      if (i === -1 && !spilledSystemVars.has(name)) return;
      if (i !== -1) defvars.splice(i, 1);
      const index = this.displayRamVars.size;
      this.displayRamVars.set(name, {area: 5 - Math.floor(index / 128), byte: 127 - (index % 128)});
      if (i !== -1 && i < runOnceDefvarsStart) runOnceDefvarsStart--;
    });
  }
  // The display memory comes before the letters: every variable that can live there does, so the letters stay free.
  if (config.kernel === 'dpcplus' && !this.dpcPlusScroll && dpcPlusPfresOf(config) <= 127) {
    for (let i = defvars.length - 1; i >= 0 && this.displayRamVars.size < DISPLAY_RAM_VAR_CAPACITY; i--) {
      if (!this.displayRamEligibleNames.has(defvars[i])) continue;
      if (this.titleSharedSlots.some(({target}) => target === defvars[i])) continue;
      const [name] = defvars.splice(i, 1);
      const index = this.displayRamVars.size;
      this.displayRamVars.set(name, {area: 5 - Math.floor(index / 128), byte: 127 - (index % 128)});
      if (i < runOnceDefvarsStart) runOnceDefvarsStart--;
    }
  }
  this.letterVarsUsed = defvars.length;
  // DISPLAY-only total - deliberately NOT availableLetters.length (the real
  // internal cap the "Too many variables" check just above/below actually
  // enforces, which is USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP's smaller 14
  // without Superchip, since the 12 system-variable letters really aren't
  // free for this pool). Now that the ROM capacity display shows "System
  // reserved" as its  separate list (see App.vue's
  // romSystemVariableAssignments), repeating that same 12-letter subtraction
  // in THIS total read as confusing rather than informative - showing the
  // full alphabet here (26, minus TEXT_MINIKERNEL_RESERVED_LETTERS when
  // active, same as the Superchip-on case already did) matches what's
  // actually visible on screen: 26 letters total, some shown under "System
  // reserved", the rest counted here.
  this.letterVarsAvailable = this.isTextMinikernelActive() ?
    ALL_LETTERS.length - TEXT_MINIKERNEL_RESERVED_LETTERS.length : ALL_LETTERS.length;
  this.superchipVarsUsed = this.superchipVars.length;
  this.superchipVarsAvailable = superchipOn(config) ? superchipVarBudget : 0;
  // Same zip order the actual "dim" declarations below (and
  // generateSuperchipVarDims) use - defvars[i]/superchipVars[i] pairs with
  // availableLetters[i]/var${SUPERCHIP_VAR_START + i} respectively. Exposed
  // (alongside the plain counts above) for the ROM capacity display's
  // per-slot breakdown (see hooks/rom.js's computeVariableUsage/App.vue's
  // romVariableAssignments) - lets a project actually see WHICH name landed
  // on which letter/var slot, not just how many total are used, e.g. to spot
  // a dev var that's still being reserved when it shouldn't be.
  // The Title Screen variables that live in another variable's slot (see titleSharedSlots), by that variable.
  const sharedWithOf = (name) => this.titleSharedSlots.filter(({target}) => target === name).map(({titleVar}) => titleVar);
  this.letterVarAssignments = defvars.map((name, i) =>
    ({name, slot: availableLetters[i], description: this.devVarDescriptions[name], isUserVariable: this.userVarNames.has(name),
      sharedWith: sharedWithOf(name)}));
  this.superchipVarAssignments = this.superchipVars.map((name, i) =>
    ({name, slot: `var${SUPERCHIP_VAR_START + i}`, description: this.devVarDescriptions[name], isUserVariable: this.userVarNames.has(name),
      sharedWith: sharedWithOf(name)}));
  // Where each variable that went in the display memory is, for the ROM capacity display (the same area and byte numbers the Display RAM blocks use).
  this.displayRamVarAssignments = [...this.displayRamVars].map(([name, {area, byte}]) =>
    ({name, slot: `Display RAM area ${area + 1}, byte ${byte}`, description: this.devVarDescriptions[name],
      isUserVariable: this.userVarNames.has(name), sharedWith: []}));
  this.dpcPlusVarsUsed = this.dpcPlusVars.length + this.dpcPlusSpriteVars.length;
  const dpcPlusVarsAvailableTotal = dpcPlusVarBudget + freedSpriteRam.length;
  this.dpcPlusVarsAvailable = dpcPlusVarBudget ? dpcPlusVarsAvailableTotal : 0;
  this.dpcPlusVarAssignments = this.dpcPlusVars.map((name, i) =>
    ({name, slot: `var${i}`, description: this.devVarDescriptions[name], isUserVariable: this.userVarNames.has(name),
      sharedWith: sharedWithOf(name)})).concat(this.dpcPlusSpriteVars.map((name) =>
    ({name, slot: this.dpcPlusSpriteVarSlot(name), description: this.devVarDescriptions[name],
      isUserVariable: this.userVarNames.has(name), sharedWith: sharedWithOf(name)})));
  if (defvars.length) {
    if (defvars.length > availableLetters.length && this.spillProbe) {
      // A first look at the generated code (see workspaceToCode at the end of this file): it only needs the code, which does not depend
      // on which names have a slot, so what does not fit is left out here and noted.
      this.spillProbeInfo = {over: defvars.length - availableLetters.length, names: defvars.slice(), userNames: [...this.userVarNames]};
      defvars.length = availableLetters.length;
    }
    if (defvars.length > availableLetters.length) {
      const totalDefined = defvars.length + this.superchipVars.length + this.dpcPlusVars.length +
        this.dpcPlusSpriteVars.length + this.displayRamVars.size;
      const totalAvailable = availableLetters.length +
        (superchipOn(config) ? superchipVarBudget : 0) + (dpcPlusVarBudget ? dpcPlusVarsAvailableTotal : 0) +
        this.displayRamVars.size;
      // DPC+'s bonus pool has no toggle to suggest enabling (it's already
      // always on), and Superchip is never available alongside DPC+ at all
      // (see Configuration.vue) - the hint only makes sense for the
      // standard kernel with Superchip still off.
      const hint = (!superchipOn(config) && config.kernel !== 'dpcplus') ?
        ' (enable Superchip RAM on the Options tab to unlock more)' : '';
      throw new Error(`Too many variables: this project defines ${totalDefined}, ` +
        `but only ${totalAvailable} are available${hint}.`);
    }
    // Configuration.vue's "Show reserved variable comments" toggle
    // (default on) - devVarDescriptions itself is always populated
    // regardless, so this is purely a display choice made right here at the
    // one place every description actually gets rendered into a comment,
    // not something worth threading through every reserveDevVar call site.
    const showVariableComments = config.showVariableComments ?? true;
    this.definitions_['variables'] = defvars
        .map((v, i) => {
          const description = showVariableComments && this.devVarDescriptions[v];
          const commentSuffix = description ? `  ; ${description}` : '';
          return `  dim ${v} = ${availableLetters[i]}${commentSuffix}`;
        })
        .join('\n');
    this.runOnceByteLetters = this.runOnceByteLetters.concat(
        runOnceByteNames.slice(runOnceSuperchipCount)
            .map((name, i) => this.dpcPlusSpriteVars.includes(name) ?
              this.dpcPlusSpriteVarSlot(name) : availableLetters[runOnceDefvarsStart + i]));
  }
  if (this.dpcPlusSpriteVars.length) {
    const showComments = config.showVariableComments ?? true;
    const spriteDims = this.dpcPlusSpriteVars.map((name) => {
      const description = showComments && this.devVarDescriptions[name];
      return `  dim ${name} = ${this.dpcPlusSpriteVarSlot(name)}${description ? `  ; ${description}` : ''}`;
    }).join('\n');
    this.definitions_['variables'] = (this.definitions_['variables'] ? this.definitions_['variables'] + '\n' : '') +
      spriteDims;
  }
  // The shared Title Screen variables: another name for the very same slot as their gameplay
  // variable. generateGameEvent zeroes the shared slots when the title screen starts and when
  // gameplay starts, since each side finds the other's leftovers there.
  const slotOf = (name) => {
    const systemIndex = SYSTEM_VARIABLES.findIndex(([systemName]) => systemName === name);
    if (systemIndex !== -1) return superchipOn(config) ? `var${systemIndex}` : SYSTEM_VARIABLES[systemIndex][1];
    const letterIndex = defvars.indexOf(name);
    if (letterIndex !== -1) return availableLetters[letterIndex];
    if (this.dpcPlusSpriteVars.includes(name)) return this.dpcPlusSpriteVarSlot(name);
    if (this.dpcPlusVars.includes(name)) return `var${this.dpcPlusVars.indexOf(name)}`;
    return `var${SUPERCHIP_VAR_START + this.superchipVars.indexOf(name)}`;
  };
  // The sprite that shows the right half of a wide player: another name for the player's animation, frame and color variables.
  const partnerAliasDims = Object.entries(this.sharedPartnerVars).flatMap(([partner, owner]) =>
    ['animation', 'frame', 'realcolor'].map((part) =>
      // Players 0 and 1 are system variables with fixed names; the others were reserved by name above.
      `  dim ${partner}${part} = ${slotOf(/^player[01]$/.test(owner) ? `${owner}${part}` :
        this.nameDB_.getName(`${owner}${part}`, Blockly.Names.DEVELOPER_VARIABLE_TYPE))}` +
      `  ; same as ${owner}${part}`)).join('\n');
  if (partnerAliasDims) {
    this.definitions_['variables'] = (this.definitions_['variables'] ? this.definitions_['variables'] + '\n' : '') +
      partnerAliasDims;
  }
  if (this.titleSharedSlots.length) {
    const aliasDims = this.titleSharedSlots.map(({titleVar, target}) => {
      const description = this.devVarDescriptions[titleVar];
      return `  dim ${titleVar} = ${slotOf(target)}  ; shares a slot with ${target}` +
        (description ? ` (${description})` : '');
    }).join('\n');
    this.definitions_['variables'] = (this.definitions_['variables'] ? this.definitions_['variables'] + '\n' : '') +
      aliasDims;
  }

  this.blockNumbers = {
    next: (type) => {
      const value = (this.blockNumbers[type] || 0) + 1;
      this.blockNumbers[type] = value;
      return value;
    },
  };

  this.gameEvents = {};

  // Bank-switching support (see getEventBank/bankJumpSuffix below): which
  // event's blocks are currently being generated (null/unset means "the main
  // per-frame loop", which is never relocatable - see the bank-targeting
  // feasibility notes), and which banks each data table has actually been
  // read from, discovered as data_get_element blocks are generated.
  this.currentEventName = null;
  this.dataTableBankUsage = {};

  // See scrub_'s  top comment - the shared "preamble" queue a value
  // block's  newline-embedded preamble gets pushed onto, drained by
  // whichever statement block actually consumes that value. Reset fresh
  // here (same "one clean slate per workspaceToCode() call" reasoning as
  // dataTableBankUsage/subroutines/functions just above/below) so nothing
  // can ever leak in from a previous build attempt.
  this.pendingPreambleLines = [];

  // Bank-switching support for graphics (see wrapRelocatableGraphics below):
  // populated as generateBackgrounds()/generateAnimations() run during
  // finish(), keyed by a per-background/per-animation unit key.
  this.relocatableGraphicsUnits = {};

  // Same idea, kept in its  separate pool for music specifically (see
  // wrapRelocatableMusic below) - populated as generateMusicChecks() runs.
  this.relocatableMusicUnits = {};

  // User-defined subroutines (see generators/bbasic/subroutine.js): name ->
  // body, populated as subroutine_define blocks are walked, then spliced
  // into their  section by generateSubroutines() below.
  this.subroutines = {};

  // Registered here (not from a finish()-time generate* function the way
  // every other Blockly.BBasic.subroutines entry is) specifically because
  // it has to run AFTER this reset but the resolved var names it needs
  // (this.keypadLeftVarName/keypadRightVarName) were already captured
  // above, before the reset - see registerKeypadPollSubroutine's
  // comment for the fuller reasoning.
  if (this.keypad0Used || this.keypad1Used) {
    registerKeypadPollSubroutine(Blockly, {
      useLeft: this.keypad0Used, useRight: this.keypad1Used,
      leftVarName: this.keypadLeftVarName, rightVarName: this.keypadRightVarName,
    });
  }

  // Same timing/reasoning as registerKeypadPollSubroutine above - needs
  // backgroundLineVarNames, already resolved earlier via reserveDevVar (see
  // backgroundLineUsed's  pre-scan).
  if (this.backgroundLineUsed) {
    registerBackgroundLineSubroutine(Blockly, this.backgroundLineVarNames, this.backgroundLineOperationsUsed);
  }

  // Same timing/reasoning as registerKeypadPollSubroutine above - has to
  // run after this reset but needs titleScreenSelectedIdVarName, already
  // resolved earlier via reserveDevVar (see titleScreenDrawUsed's
  // pre-scan). Registers ONE shared subroutine covering every Title Screen
  // page in the project (see registerTitleScreenSubroutine's  comment
  // in generators/bbasic/titlescreen.js for why this can't be one
  // subroutine per page).
  if (this.titleScreenDrawUsed) {
    registerTitleScreenSubroutine(Blockly, {selectedIdVarName: this.titleScreenSelectedIdVarName});
  }

  // User-defined native batari Basic "function"s (see generators/bbasic/
  // function.js) - a real value-returning callable, distinct from the
  // gosub/return-only subroutines above. Kept in its  separate map
  // (rather than sharing this.subroutines) since a function's  header
  // line ("function <name>", not a bare "@<name>" label) and body (which
  // always ends in an explicit "return <value>" from a function_return
  // block, never an auto-appended bare "return") don't fit
  // generateSubroutineBody's shared wrapper - see generateFunctions() below.
  // Relocatable as its  atomic unit (see getFunctionBank/
  // generateRelocatedSections) - but only ever as part of a "family" grouped
  // with every OTHER function/wrapper subroutine it calls (or is called by)
  // as a plain value expression (see hooks/rom.js's computeFunctionFamilies):
  // unlike gosub/goto, a bB function-call expression has no bank-tag syntax,
  // so anything using it as a value can only ever share ITS
  // bank, never cross into a different one.
  this.functions = {};

  // Every function_call_statement wrapper subroutine's  resolved name
  // (see registerFunctionCallWrapper in generators/bbasic/function.js) -
  // tracked separately from this.subroutines'  keys so hooks/rom.js's
  // computeFunctionFamilies can tell a wrapper apart from an ordinary
  // user-authored subroutine without guessing from its name. A wrapper's
  // body is a plain value-form call into the function it wraps (the
  // whole reason it has to join that function's  relocation family,
  // unlike whatever calls the WRAPPER, which does so via a bank-taggable
  // "gosub" and is free to relocate independently).
  this.functionCallWrapperNames = new Set();

  // See RUN_ONCE_EDGE_RESET_NAME's  comment - registered as an ordinary
  // subroutine (rather than left as a separately-templated, always-bank-1
  // splice) so it's relocatable like anything else. Registered here, right
  // after runOnceByteLetters is decided above, rather than left until
  // finish() like every OTHER subroutine (which aren't known until their
  // block's generator walks the workspace) - this one's body only ever
  // depends on runOnceByteLetters, already final by this point.
  if (this.runOnceByteLetters.length || this.runOnceRamBytes) {
    this.subroutines[RUN_ONCE_EDGE_RESET_NAME] = Blockly.BBasic.generateRunOnceEdgeReset();
  }

  // Same idea as RUN_ONCE_EDGE_RESET_NAME above, for the music player's
  // "Play song" reset subroutine(s) (see registerMusicPlayResetSubroutine's
  // comment in generators/bbasic/music.js for the exact gating) -
  // this.projectMusic is already final by this point (resolved above), same
  // reasoning as the run-once registration. Always called (not gated on
  // musicPlayResetShared itself) since a 2+-song project needs this
  // regardless of that flag - musicPlayResetShared only decides what happens
  // internally for the single-song case.
  registerMusicPlayResetSubroutine(Blockly, this.musicPlayResetShared);

  this.isInitialized = true;
};

// Every distinct bank number (other than 1) that this build's  relocation
// decisions have actually put something in, across every relocatable kind at
// once - used by generateTextMinikernel (see its  comment) to avoid
// declaring an empty placeholder "bank N ... bank 1" for a bank
// generateRelocatedSections is ALSO about to declare with real content in
// it. Confirmed directly as a real bug: DASM's address tracking for a bank
// gets corrupted (reported as "Origin Reverse-indexed", the same class of
// error generateRelocatedSections'  comment already documents for
// declaring one bank twice non-contiguously) once relocation actually
// starts using a bank number below the Text Minikernel's  reserved one -
// which never happened before relocation-worthy overflow existed at all, so
// this went unnoticed until now.
Blockly.BBasic.usedRelocationBankNumbers = function() {
  const banks = getRelocationBanks();
  return new Set([
    ...Object.values(banks.eventBanks || {}),
    ...Object.values(banks.graphicsBanks || {}),
    ...Object.values(banks.musicBanks || {}),
    ...Object.values(banks.subroutineBanks || {}),
    ...Object.values(banks.functionBanks || {}),
    ...(Blockly.BBasic.isTextMinikernelActive() && Blockly.BBasic.textKernelBank() ?
      [Blockly.BBasic.textKernelBank()] : []),
  ].filter((bank) => bank !== Blockly.BBasic.primaryBank()));
};

// The bank every unrelocated event/graphics/subroutine/function/data-table
// physically compiles into, and the bank RELOCATABLE_EVENTS' fixed
// template labels (fullgameloop, main) live in - bank 2 for DPC+ (see
// generateDpcPlusBankPreamble's comment: DPC+ pushes the entire
// commongamelogic/main-loop body into bank 2, keeping bank 1 down to a
// single goto), bank 1 for every other kernel. hooks/rom.js's
// primaryBankFor is the same concept, kept separate since that file can't
// import from this one.
Blockly.BBasic.primaryBank = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  return config.kernel === 'dpcplus' ? 2 : 1;
};

// The highest bank number generateRelocatedSections will declare a section
// for this build (real relocated content or not) - with the Text Minikernel
// active, that function's gap-fill (see its "banksBeforeGapFill"/
// "gapFillBanks" comment) already declares EVERY bank from 2 up to whichever
// bank actually holds the highest-numbered relocated unit, contiguously,
// even the ones nothing got relocated into (an empty "bank N ... bank 1"
// placeholder). generateTextMinikernel (see its comment) needs that same
// coverage up through kernelBank - 1, but used to compute its separate
// placeholder loop using only usedRelocationBankNumbers() above, which is
// silent about those already-placeholder-only gap banks - so any bank in
// between (unused by real content, but already covered by
// generateRelocatedSections' contiguity fill) got a SECOND, non-contiguous
// placeholder declared for it here too. Confirmed directly as a real bug via
// a reported build failure (cascading "Unknown Mnemonic" errors starting
// well before the Text Minikernel's bank, only once Fine-mode inertia's
// extra code pushed something - unrelated - out to a high enough bank, e.g.
// music to bank 7, for this overlap to exist at all): the exact "same bank
// declared twice, non-contiguously" corruption class usedRelocationBank
// Numbers' comment already documents, just never triggered before
// because nothing had pushed a real relocation that high yet. Returns 1
// (the lowest a "highest bank" can ever meaningfully be, since bank 1 is
// always implicit) when nothing has been relocated anywhere.
Blockly.BBasic.highestUsedRelocationBankNumber = function() {
  const used = Blockly.BBasic.usedRelocationBankNumbers();
  return used.size ? Math.max(...used) : 1;
};

// Every event defaults to the primary bank (the only bank this app used
// before bank-switching support existed) unless THIS BUILD's relocation
// decisions (see hooks/relocation-banks.js - deliberately not persisted
// across builds, remade from scratch every time) have moved it elsewhere.
// This is intentionally the only place that reads eventBanks, so every other
// bank-aware call site stays correct automatically as the assignment
// strategy evolves.
Blockly.BBasic.getEventBank = function(eventName) {
  const eventBanks = getRelocationBanks().eventBanks || {};
  return eventBanks[eventName] || Blockly.BBasic.primaryBank();
};

// Same idea as getEventBank, for user-defined subroutines (see
// generators/bbasic/subroutine.js) - a separate bucket (subroutineBanks)
// since subroutine names are generated from the project's  content,
// rather than fixed like the event names.
Blockly.BBasic.getSubroutineBank = function(name) {
  const subroutineBanks = getRelocationBanks().subroutineBanks || {};
  return subroutineBanks[name] || Blockly.BBasic.primaryBank();
};

// Every subroutine name currently defined - dynamic (depends on how many
// subroutine_define blocks the project has), unlike RELOCATABLE_EVENT_NAMES's
// fixed list. Only valid after a regenerateCode() call.
Blockly.BBasic.getSubroutineNames = function() {
  return Object.keys(Blockly.BBasic.subroutines);
};

// A subroutine's  generated source length, as a rough, fast proxy for its
// compiled size - same rationale as estimateEventSize/
// estimateGraphicsUnitSize.
Blockly.BBasic.estimateSubroutineSize = function(name) {
  return (Blockly.BBasic.subroutines[name] || '').length;
};

// Same idea as getSubroutineBank, for user-defined functions (see
// generators/bbasic/function.js) - a separate bucket (functionBanks) since a
// function is only ever relocated as part of a "family" (see hooks/rom.js's
// computeFunctionFamilies), never entirely independently the way an event or
// an ordinary subroutine can be.
Blockly.BBasic.getFunctionBank = function(name) {
  const functionBanks = getRelocationBanks().functionBanks || {};
  return functionBanks[name] || Blockly.BBasic.primaryBank();
};

// Every function name currently defined - dynamic, same reasoning as
// getSubroutineNames.
Blockly.BBasic.getFunctionNames = function() {
  return Object.keys(Blockly.BBasic.functions);
};

// A function's  generated source length, as a rough, fast proxy for its
// compiled size - same rationale as estimateSubroutineSize.
Blockly.BBasic.estimateFunctionSize = function(name) {
  return (Blockly.BBasic.functions[name] || '').length;
};

// True if the given already-generated code text calls ANY bB function (see
// generators/bbasic/function.js) via a plain VALUE-form call (a bare
// "name(args)" - either function_call directly, or function_call_statement's
// wrapper subroutine body, see registerFunctionCallWrapper). Unlike
// gosub/goto, that expression has no bank-tag syntax - it
// compiles to a plain same-bank call, so calling one from code that's been
// relocated to a different bank jumps to whatever happens to be paged in
// there instead of the function's  body, corrupting execution regardless
// of what the function itself does (confirmed directly: a real project's
// title_start crashed the ROM in the emulator the moment it called ANY
// function, purely from being relocated off bank 1 by this app's
// automatic bank-fitting).
//
// Used by hooks/rom.js's  pickRelocationCandidate two different ways: an
// ordinary event or user-authored subroutine matching this stays excluded
// from independent relocation entirely (still pinned to bank 1, unchanged
// from this app's first bank-switching implementation) - but a function or
// function_call_statement WRAPPER subroutine matching this instead joins
// whatever it references as part of one shared relocation "family" (see
// computeFunctionFamilies), free to move together to any bank with room, not
// just bank 1. Checks the already-generated code text (not the Blockly block
// tree) for the same reason estimateEventSize/estimateSubroutineSize already
// read generated code back rather than re-deriving from blocks.
Blockly.BBasic.codeReferencesAnyFunction = function(codeText) {
  const names = Object.keys(Blockly.BBasic.functions);
  return names.length > 0 && names.some((name) => codeText.includes(`${name}(`));
};

// The bank the code currently being generated will end up in - either the
// event currently being walked, or bank 1 if this is the main per-frame loop
// (which is not relocatable; see the bank-targeting feasibility notes).
// subroutine_define (see generators/bbasic/subroutine.js) sets
// currentEventName to "subroutine_<name>" while walking a subroutine's
// body - resolved here through getSubroutineBank instead of getEventBank, so
// any bank-crossing code generated INSIDE a relocated subroutine's body (a
// nested subroutine call, a data table read, ...) correctly sees which bank
// it's actually going to end up in, not always bank 1.
//
// currentEventName is only ever set while walking INSIDE an event_block's or
// subroutine_define's  body (see their  generators) - top-level canvas
// code (not wrapped in either) runs with it unset, and always compiles into
// the bank-1-fixed generatedBody section (see bbasic.bb.hbs) regardless of
// where any RELOCATABLE_EVENT_NAMES event itself ends up. Falling back to
// 'gameplay_start' here (rather than literal bank 1, what the comment above
// already documents as the intent) was a real bug: once gameplay_start was
// relocated to some bank N, any gosub/goto from top-level code computed its
// bank as N too, producing a wrong (often silently missing) bank tag for
// a call that was actually being made FROM bank 1 - confirmed directly: a
// top-level "gosub setScene" landed on no bank tag at all whenever
// gameplay_start and setScene happened to share the same relocated bank,
// even though the call site itself was really still in bank 1.
const SUBROUTINE_EVENT_NAME_PREFIX = 'subroutine_';
// function_define (generators/bbasic/function.js) sets currentEventName to
// this prefix instead of SUBROUTINE_EVENT_NAME_PREFIX above - a DISTINCT
// prefix, not reused, specifically so getCurrentBank can resolve a function's
// bank through getFunctionBank (backed by functionBanks/
// computeFunctionFamilies) rather than getSubroutineBank, which knows nothing
// about functions and would silently default every one of them back to bank
// 1 regardless of where its family actually landed.
const FUNCTION_EVENT_NAME_PREFIX = 'function_';
Blockly.BBasic.getCurrentBank = function() {
  const eventName = Blockly.BBasic.currentEventName;
  if (!eventName) return Blockly.BBasic.primaryBank();
  if (eventName.startsWith(FUNCTION_EVENT_NAME_PREFIX)) {
    return Blockly.BBasic.getFunctionBank(eventName.slice(FUNCTION_EVENT_NAME_PREFIX.length));
  }
  if (eventName.startsWith(SUBROUTINE_EVENT_NAME_PREFIX)) {
    return Blockly.BBasic.getSubroutineBank(eventName.slice(SUBROUTINE_EVENT_NAME_PREFIX.length));
  }
  return Blockly.BBasic.getEventBank(eventName);
};

// batari Basic only crosses banks when a goto/gosub is explicitly tagged
// with "bankN" - it never infers this, and there is no compiler check that
// catches a missing or wrong tag (see the bank-targeting feasibility notes:
// this is exactly the class of mistake the docs warn silently returns wrong
// data/jumps to the wrong place). Centralizing the decision here means every
// call site (event_change_state, data table reads, the relocated-event
// template scaffolding) computes it identically.
Blockly.BBasic.bankJumpSuffix = function(fromBank, toBank) {
  return fromBank === toBank ? '' : ` bank${toBank}`;
};

// Every graphics unit (one per background, one per player's "hidden" default
// frame, one per named animation - see wrapRelocatableGraphics) defaults to
// bank 1 unless THIS BUILD's  relocation decisions explicitly assign it
// elsewhere, mirroring getEventBank. A separate bucket from eventBanks since
// the unit keys (e.g. "background1", "player0animation0") are generated from
// project content, not fixed like the event names.
Blockly.BBasic.graphicsUnitBank = function(unitKey) {
  const graphicsBanks = getRelocationBanks().graphicsBanks || {};
  return graphicsBanks[unitKey] || Blockly.BBasic.primaryBank();
};

// Backgrounds and animations are each a single inline call site immediately
// followed by a label the caller already places after the payload (an
// "end-of-block" label, not a fallthrough neighbor the way events have) -
// so unlike RELOCATABLE_EVENTS, there's no entryFallthroughBank/exit-target
// bookkeeping needed here: relocating one of these only ever replaces its
// payload with a bank-tagged goto/return pair, never touches a neighbor.
//
// Always records the unit's payload (even when it stays in bank 1) so
// estimateGraphicsUnitSize can measure it after generation - the allocator
// needs sizes for units currently still in bank 1 to decide what to move
// next (see rom.js's pickRelocationCandidate).
Blockly.BBasic.wrapRelocatableGraphics = function(unitKey, payload) {
  const bank = Blockly.BBasic.graphicsUnitBank(unitKey);
  Blockly.BBasic.relocatableGraphicsUnits[unitKey] = {bank, payload};
  if (bank === Blockly.BBasic.primaryBank()) return payload;

  const entryLabel = `${unitKey}_reloc_entry`;
  const returnLabel = `${unitKey}_reloc_return`;
  return ` goto ${entryLabel} bank${bank}\n${returnLabel}`;
};

// A graphics unit's payload length, as a rough, fast proxy for its compiled
// size - same rationale as estimateEventSize. Only meaningful after
// generateBackgrounds()/generateAnimations() have populated
// relocatableGraphicsUnits for the current build.
Blockly.BBasic.estimateGraphicsUnitSize = function(unitKey) {
  const unit = Blockly.BBasic.relocatableGraphicsUnits[unitKey];
  return unit ? unit.payload.length : 0;
};

// Every graphics unit key seen in the current build - dynamic (depends on how
// many backgrounds/animations the project defines), unlike
// RELOCATABLE_EVENT_NAMES's fixed list. Only valid after a regenerateCode()
// call.
Blockly.BBasic.getGraphicsUnitKeys = function() {
  return Object.keys(Blockly.BBasic.relocatableGraphicsUnits);
};

// Same mechanism as graphicsUnitBank/wrapRelocatableGraphics/
// estimateGraphicsUnitSize/getGraphicsUnitKeys just above, kept in an
// entirely separate pool (its  bucket, musicBanks, and its
// relocatableMusicUnits dict) rather than sharing graphicsBanks - at the
// user's  explicit request, so a bank reserved for music (see rom.js's
// musicReservedBank) can never have a background/animation/player-default
// packed into it, and vice versa. See generateMusicChecks in
// generators/bbasic/music.js for the one call site.
Blockly.BBasic.musicUnitBank = function(unitKey) {
  const musicBanks = getRelocationBanks().musicBanks || {};
  return musicBanks[unitKey] || Blockly.BBasic.primaryBank();
};

Blockly.BBasic.wrapRelocatableMusic = function(unitKey, payload) {
  const bank = Blockly.BBasic.musicUnitBank(unitKey);
  Blockly.BBasic.relocatableMusicUnits[unitKey] = {bank, payload};
  if (bank === Blockly.BBasic.primaryBank()) return payload;

  const entryLabel = `${unitKey}_reloc_entry`;
  const returnLabel = `${unitKey}_reloc_return`;
  return ` goto ${entryLabel} bank${bank}\n${returnLabel}`;
};

Blockly.BBasic.estimateMusicUnitSize = function(unitKey) {
  const unit = Blockly.BBasic.relocatableMusicUnits[unitKey];
  return unit ? unit.payload.length : 0;
};

Blockly.BBasic.getMusicUnitKeys = function() {
  return Object.keys(Blockly.BBasic.relocatableMusicUnits);
};

// Records that a data table was read while generating code for the given
// bank, so generateDataTables() knows which banks need their  copy of it
// (a table can only be read correctly from the same bank it's declared in -
// see the bank-targeting feasibility notes and the Data tab's read-only
// caveat). Tables never read from anywhere still get a bank 1 copy, matching
// this app's behavior before bank-switching support existed.
Blockly.BBasic.trackDataTableBank = function(tableId, bank) {
  const usage = Blockly.BBasic.dataTableBankUsage[tableId] || (Blockly.BBasic.dataTableBankUsage[tableId] = new Set());
  usage.add(bank);
};

// Read-only view of the same per-table bank usage generateDataTables() reads
// - for the ROM capacity display's  bank-contents listing (see
// hooks/rom.js's computeBankContents), which needs to know where each table
// actually landed without duplicating generateDataTables'  filtering
// logic.
Blockly.BBasic.getDataTableBankUsage = function() {
  return Blockly.BBasic.dataTableBankUsage;
};

// Fixed knowledge about how each of these five events is entered/exited in
// the default, fully-inline template, needed to convert a physical
// fallthrough into an explicit bank-tagged jump once relocation moves an
// event away from its neighbor (system_start is not relocatable - it's tiny,
// always runs first, right after fixed setup code with no label
// to jump from, and not a meaningful relocation target).
//
// Each event owns an independent splice point in bbasic.bb.hbs, so relocating
// one only ever needs to change that event's entry/exit - never a
// neighbor's generated content. A neighbor that stays inline still just
// falls through into whatever now physically occupies this event's slot
// (real code, or a short redirect jump), and every cross-reference here is
// by label, which DASM resolves globally regardless of physical position -
// so neighbors never need to know or care whether this event moved.
//
// entryFallthroughBank: null means the event is only ever entered via
// event_change_state (already bank-tagged by itself - see event.js), so
// nothing physically falls into its splice point and relocating it just
// empties that slot. Otherwise a function returning the bank of whatever
// precedes it by fallthrough in the unrelocated template.
//
// exit: what it falls through to once its  code finishes - a fixed
// template label (always bank 1) or another event's begin label. Always
// applied when relocated, even for the looping title_update: normally its
// self-loop never falls off the end, but if it's ever completely empty, the
// wrapping in generateGameEvent still emits bare begin/end labels with
// nothing between them, and without an explicit exit that would fall
// straight into whatever follows in that bank (its  data tables, or the
// bank-switch back to 1) as if it were code.
const RELOCATABLE_EVENTS = {
  title_start: {
    loop: false,
    // precedes it: the fixed "fullgameloop" label, always in the primary bank
    entryFallthroughBank: () => Blockly.BBasic.primaryBank(),
    exit: {label: 'title_update_begin', bank: () => Blockly.BBasic.getEventBank('title_update')},
  },
  title_update: {
    loop: true,
    entryFallthroughBank: () => Blockly.BBasic.getEventBank('title_start'),
    exit: {label: 'gameplay_start_begin', bank: () => Blockly.BBasic.getEventBank('gameplay_start')},
  },
  gameplay_start: {
    loop: false,
    entryFallthroughBank: () => Blockly.BBasic.getEventBank('title_update'),
    // fixed, always the primary bank
    exit: {label: 'main', bank: () => Blockly.BBasic.primaryBank()},
  },
  gameover_start: {
    loop: false,
    entryFallthroughBank: null, // only entered via event_change_state; "goto main" always precedes this slot, never falling into it
    exit: {label: 'gameover_update_begin', bank: () => Blockly.BBasic.getEventBank('gameover_update')},
  },
  gameover_update: {
    loop: false,
    entryFallthroughBank: () => Blockly.BBasic.getEventBank('gameover_start'),
    // fixed, always the primary bank
    exit: {label: 'fullgameloop', bank: () => Blockly.BBasic.primaryBank()},
  },
};

export const RELOCATABLE_EVENT_NAMES = Object.keys(RELOCATABLE_EVENTS);

// A generated event's source length, as a rough, fast proxy for its compiled
// size - used to rank relocation candidates without a full trial build for
// each one. Not exact (bBasic source length only loosely tracks assembled
// bytes), but cheap and good enough to pick "the biggest one" reasonably.
Blockly.BBasic.estimateEventSize = function(eventName) {
  const codeArray = Blockly.BBasic.gameEvents[eventName] || [];
  return codeArray.join('\n\n').length;
};

// Normally (bank 1, the default) returns the event inlined exactly where it
// has always been, unchanged. Once assigned elsewhere (see getEventBank),
// the inline spot instead gets a single bank-tagged "goto" to it (or nothing
// at all, for an event with no fallthrough entry), and the event's real code
// - plus an explicit bank-tagged exit jump replacing the fallthrough it can
// no longer rely on - is returned as "body" for the caller to place in that
// bank's  section (see generateRelocatedEventSections): every event
// sharing a bank has to land in ONE contiguous "bank N ... bank 1" block,
// not one such block per event - confirmed directly against the compiler
// that declaring the same bank number twice, non-contiguously, breaks
// (reported as a segment overflow), presumably because the bank pseudo-op
// continues addressing from wherever the source was up to, rather than
// resuming that bank's  address range.
Blockly.BBasic.generateRelocatableEvent = function(eventName) {
  const spec = RELOCATABLE_EVENTS[eventName];
  const bank = Blockly.BBasic.getEventBank(eventName);
  const generate = () => spec.loop ?
    Blockly.BBasic.generateGameLoopEvent(eventName) :
    Blockly.BBasic.generateGameEvent(eventName);

  if (bank === Blockly.BBasic.primaryBank()) {
    return {inlineEvent: generate(), bank, body: ''};
  }

  const fromBank = spec.entryFallthroughBank ? spec.entryFallthroughBank() : null;
  const inlineEvent = fromBank === null ? '' :
    ` goto ${eventName}_begin${Blockly.BBasic.bankJumpSuffix(fromBank, bank)}`;

  const eventCode = generate();
  const exitJump = spec.exit ?
    ` goto ${spec.exit.label}${Blockly.BBasic.bankJumpSuffix(bank, spec.exit.bank())}` : '';
  const body = [eventCode, exitJump].filter(Boolean).join('\n\n');

  return {inlineEvent, bank, body};
};

// Groups every relocated event's body (see generateRelocatableEvent), every
// relocated graphics unit's payload (see wrapRelocatableGraphics), every
// relocated music unit's  payload (see wrapRelocatableMusic - a separate
// pool from graphics, but grouped into the SAME per-bank section here like
// everything else, if it ever ends up sharing a bank with something else),
// AND every relocated subroutine's "label / body / return" block (see
// getSubroutineBank/generateSubroutines) by bank into one contiguous
// "bank N ... bank 1" section per bank actually used, each including that
// bank's  copies of any data tables read from it (generateDataTables(bank)
// already de-duplicates across everything sharing the bank, so this calls it
// once per bank). Events, graphics units, and subroutines sharing a bank have
// to land in the SAME section, not one each - confirmed directly against the
// compiler that declaring the same bank number twice, non-contiguously,
// breaks (reported as a segment overflow), presumably because the bank
// pseudo-op continues addressing from wherever the source was up to, rather
// than resuming that bank's  address range.
Blockly.BBasic.generateRelocatedSections = function(eventResults) {
  const graphicsUnits = Blockly.BBasic.relocatableGraphicsUnits;
  const graphicsEntries = Object.entries(graphicsUnits);
  const musicEntries = Object.entries(Blockly.BBasic.relocatableMusicUnits);
  const subroutineEntries = Object.entries(Blockly.BBasic.subroutines)
      .filter(([name]) => Blockly.BBasic.getSubroutineBank(name) !== Blockly.BBasic.primaryBank());
  const functionEntries = Object.entries(Blockly.BBasic.functions)
      .filter(([name]) => Blockly.BBasic.getFunctionBank(name) !== Blockly.BBasic.primaryBank());

  // The single HIGHEST bank the chosen ROM size promises always needs its
  // "bank N ... bank 1" section, even with nothing relocated into it -
  // the assembler only pads a bank's segment out to its full declared size
  // once it sees that bank actually opened, so a bank left out here
  // entirely (as every non-1 bank was, for a project small enough that
  // nothing ever needed relocating) comes out short in the assembled
  // binary versus what "set romsize" told the cartridge format to expect.
  // Confirmed directly: a blank Superchip project (nothing to relocate, so
  // every bank past 1 used to just vanish from the source) assembled
  // "successfully" into a truncated file Javatari couldn't make sense of -
  // it never reported a compile error, since nothing here checks the
  // assembled size against the declared ROM size either.
  //
  // Only the highest bank needs forcing, not every unused one in between -
  // DASM pads a forward ORG jump automatically, so a genuinely empty
  // MIDDLE bank (nothing relocated there) still comes out the right total
  // size as long as some LATER bank's  ORG gets opened; only the very
  // last bank has nothing after it to force that padding. Originally this
  // forced every bank 2..maxBanks unconditionally, which is what a blank
  // project needs (bank maxBanks is the only one that matters there
  // either, since nothing else ever gets opened) - but for a large,
  // heavily-relocated project, forcing empty stub sections for banks nothing
  // was ever assigned to needlessly adds more "bank N ... bank 1"
  // transitions than the project actually needs, each one a spot the
  // vendored compiler's  bank-splitting bookkeeping has to track -
  // confirmed directly as a real problem: a large project with several
  // genuinely-unused middle banks hit that bookkeeping's  limit
  // (surfaced as a corrupted "(null)"-filled assembly listing) purely from
  // these extra unconditional stubs, despite comfortably fitting otherwise.
  // The Text Minikernel (see generateTextMinikernel in
  // generators/bbasic/text-minikernel.js) reserves and declares that exact
  // same top bank itself, unconditionally, to hold the kernel's  code -
  // KERNEL_BANK_BY_ROMSIZE there is the same table as
  // BANK_COUNT_BY_ROMSIZE_MINI here, so it's always the identical bank
  // number. Forcing it again here too would declare it a second time,
  // non-contiguously - exactly the "same bank declared twice" corruption
  // both this function's  comment above and generateTextMinikernel's
  // comment already document, just newly reachable because this
  // padding stub didn't exist yet when those were written. Confirmed
  // directly against a real project: a bankswitched ROM with the Text
  // Minikernel active hit the "(null)"-filled corrupted assembly listing
  // purely from this double declaration, even though every relocatable
  // unit fit comfortably otherwise.
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const isDpcPlus = config.kernel === 'dpcplus';
  const maxBanks = BANK_COUNT_BY_ROMSIZE_MINI[isDpcPlus ? 'dpcplus' : config.romSize] || 0;
  const textKernelBank = Blockly.BBasic.isTextMinikernelActive() ? Blockly.BBasic.textKernelBank() : 0;
  const everyDeclaredBank =
    maxBanks > 1 && !Blockly.BBasic.isTextMinikernelActive() ? [maxBanks] : [];
  // The playfield color scroll tables live in the top bank (the kernel's), see
  // buildBackgroundColorScroll. With the Text Minikernel they go in its section
  // of that bank instead.
  const colorScrollTopBank = Blockly.BBasic.backgroundColorScrollTopBank || 0;
  const colorScrollTablesInRelocated = colorScrollTopBank && !Blockly.BBasic.isTextMinikernelActive();
  // DPC+ reserves bank 2 for the whole commongamelogic/main-loop body (see
  // generateDpcPlusBankPreamble's own comment) - it's already declared once
  // there, so treating it as "the primary bank" here too (same role bank 1
  // plays for every other kernel) keeps this function from declaring it a
  // SECOND time as an empty gap-fill stub, which is exactly the "same bank
  // declared twice, non-contiguously" corruption documented above and below.
  const primaryBank = isDpcPlus ? 2 : 1;
  const minGapFillBank = isDpcPlus ? 3 : 2;

  // Numerically sorted, not left in whatever order events/graphics/music/
  // subroutines happen to appear in (a plain Set preserves insertion order,
  // not numeric order) - 2600basic's  preprocessor tracks each bank's
  // remaining space cumulatively and needs banks visited in ascending order
  // to do that correctly (see generateTextMinikernel's  comment on this
  // same requirement for its skipped-bank placeholders) - confirmed directly
  // as a real bug: an out-of-order bank sequence here (e.g. bank 3 appearing
  // in the file before bank 2, simply because whatever got relocated to
  // bank 3 happened to be relocated first) corrupted DASM's running origin
  // tracking, reported as "Origin Reverse-indexed" at a LATER bank's
  // fixed trampoline code, not at the actual out-of-order section itself.
  const banksBeforeGapFill = [...new Set([
    ...eventResults.map((r) => r.bank),
    ...graphicsEntries.map(([, unit]) => unit.bank),
    ...musicEntries.map(([, unit]) => unit.bank),
    ...subroutineEntries.map(([name]) => Blockly.BBasic.getSubroutineBank(name)),
    ...functionEntries.map(([name]) => Blockly.BBasic.getFunctionBank(name)),
    ...everyDeclaredBank,
    ...(textKernelBank ? [textKernelBank] : []),
  ])].filter((bank) => bank !== primaryBank);

  // Ascending, CONTIGUOUS order matters, not just ascending - the comment
  // above already covers ordering; this covers gaps. Confirmed directly as
  // a second, distinct real bug: a project with Superchip RAM, a pfres above
  // the standard kernel's default (12), and a bankswitched ROM size above
  // 8k - nothing else needed, an otherwise-blank project reproduces it -
  // jumped straight from bank 1 to everyDeclaredBank's  forced top bank
  // (e.g. bank 8 on a 32k ROM), skipping banks 2-7 entirely since nothing
  // else used them. 2600basic's per-bank bookkeeping needs EVERY bank
  // number up to the highest one actually visited, not just the ones with
  // real content - skipping any of them desyncs it, surfacing (confirmed
  // against the real failing build) as a cascade of "Unknown Mnemonic 'jmp
  // BS_jsr'"/"BS_return" errors scattered through completely unrelated
  // stock runtime code, not a recognizable "this bank is missing" message.
  // generateTextMinikernel's  kernelBank placement already fixed this
  // exact failure mode for itself the same way (see its  comment) - this
  // generalizes that fix to every other reason a bank might get force-
  // declared, filling only the gaps actually needed to make the sequence
  // contiguous up to whatever the highest required bank genuinely is, NOT
  // unconditionally every bank 2..maxBanks regardless of need (the ORIGINAL
  // version of everyDeclaredBank's  comment above explains why that
  // blanket approach was reverted: wasted stub sections for banks nothing
  // ever needed hit the compiler's  bank-transition bookkeeping limit on
  // a large project). Data-driven from banksBeforeGapFill's  highest
  // entry instead, so a large project's real content never gets padded any
  // higher than it already needs to reach.
  const highestBankNeeded = banksBeforeGapFill.length ? Math.max(...banksBeforeGapFill) : 0;
  const gapFillBanks = highestBankNeeded >= minGapFillBank ?
    Array.from({length: highestBankNeeded - minGapFillBank + 1}, (_, i) => i + minGapFillBank) : [];
  const banks = [...new Set([...banksBeforeGapFill, ...gapFillBanks])].sort((a, b) => a - b);

  return banks.map((bank) => {
    const eventBodies = eventResults.filter((r) => r.bank === bank).map((r) => r.body).filter(Boolean);
    const graphicsBodies = graphicsEntries
        .filter(([, unit]) => unit.bank === bank)
        .map(([key, unit]) => `${key}_reloc_entry\n${unit.payload}\n goto ${key}_reloc_return bank${Blockly.BBasic.primaryBank()}`);
    const musicBodies = musicEntries
        .filter(([, unit]) => unit.bank === bank)
        .map(([key, unit]) => `${key}_reloc_entry\n${unit.payload}\n goto ${key}_reloc_return bank${Blockly.BBasic.primaryBank()}`);
    const subroutineBodies = subroutineEntries
        .filter(([name]) => Blockly.BBasic.getSubroutineBank(name) === bank)
        .map(([name, body]) => generateSubroutineBody(name, body));
    const functionBodies = functionEntries
        .filter(([name]) => Blockly.BBasic.getFunctionBank(name) === bank)
        .map(([name, body]) => generateFunctionBody(name, body));
    const tablesForBank = Blockly.BBasic.generateDataTables(bank);
    const textOffsetTablesForBank = generateTextOffsetTables(Blockly, bank);
    const textStaticOffsetTablesForBank = generateTextStaticOffsetTables(Blockly, bank);
    const textRow2OffsetsTableForBank = generateTextRow2OffsetsTable(Blockly, bank);
    // Always a literal "bank 1" here, never Blockly.BBasic.primaryBank() -
    // confirmed directly against the real compiler source (statements.c's
    // newbank()): "if (bankno == 1) return;" as its very first line, before
    // touching anything else, including the global `bank` state newbank()
    // would otherwise update. "bank 1" is a genuine no-op for every kernel,
    // which is exactly why it's always been safe to sprinkle between
    // sections as a neutral closer - it costs nothing and touches nothing.
    // Using primaryBank() here for DPC+ (bank 2) very much isn't a no-op:
    // confirmed directly as a real bug - it re-triggered newbank(2)'s own
    // real, non-trivial side effects (the ECHO/ORG/footer boilerplate
    // generateDpcPlusBankPreamble's own goto already triggered once) every
    // single time a relocated section closed, corrupting the compiler's
    // OWN per-bank bookkeeping the same "declared twice, non-contiguously"
    // way documented above (surfacing as bank 1's own reserved footer being
    // reached at a wildly wrong, ever-growing address). Leaving this as
    // "bank 1" also means the compiler's own global `bank` state naturally
    // stays at whatever the LAST real "bank N" tag left it at (matching a
    // real, working DPC+ project's own natural shape) - no special-casing
    // needed for the final section either.
    // Harmony cart fix (confirmed against the real bB docs' own "Harmony
    // Cart Fix" section): "put temp1=temp1 right after each bank
    // declaration." generateDpcPlusBankPreamble's own "bank 2" already gets
    // this; every OTHER real (non-1, non-no-op) bank declaration a DPC+
    // build emits - which only ever happens here, for relocated content -
    // needs the same fix, or the Harmony cart's own bankswitch-detection can
    // misfire on real hardware.
    const harmonyCartFix = isDpcPlus ? '\n temp1=temp1' : '';
    return [
      ` bank ${bank}${harmonyCartFix}`,
      ...eventBodies,
      ...graphicsBodies,
      ...musicBodies,
      ...subroutineBodies,
      ...functionBodies,
      tablesForBank,
      colorScrollTablesInRelocated && bank === colorScrollTopBank ?
        Blockly.BBasic.backgroundColorScrollTablesAsm : '',
      textOffsetTablesForBank,
      textStaticOffsetTablesForBank,
      textRow2OffsetsTableForBank,
      textKernelBank && bank === textKernelBank ? Blockly.BBasic.textBankBody : '',
      ` bank 1`,
    ].filter(Boolean).join('\n\n');
  }).join('\n\n');
};

/**
 * Prepend the generated code with the variable definitions.
 * @param {string} code Generated code.
 * @return {string} Completed code.
 */
Blockly.BBasic.finish = function(code) {
  // "On gameplay update" (event.js's  EVENT_OPTIONS) is deliberately NOT
  // one of RELOCATABLE_EVENT_NAMES' five events - it doesn't get its
  // begin/end-labeled splice point in bbasic.bb.hbs at all. Plain top-level
  // blocks (no event wrapper) already run every frame during gameplay - the
  // fixed "main" loop in the template IS the implicit gameplay-update loop,
  // by construction, since gameplay_start always falls through into it and
  // nothing reaches it except via that fallthrough or a gameover_update ->
  // fullgameloop -> ... -> gameplay_start round trip. So "On gameplay
  // update" is purely an organizational wrapper for symmetry with Title/
  // Gameover's  explicit Start+Update pairs - its  collected code
  // (event_block's generator pushes it into this.gameEvents via
  // addGameEvent, same as every other named event) is appended directly
  // onto the plain top-level "code" here, BEFORE the base
  // Generator.finish()/normalizeIndents() calls below run - so it goes
  // through the exact same processing every other top-level block's
  // code does, rather than needing its  separate normalizeIndents pass
  // the way generateGameEvent's real named events do.
  const gameplayUpdateEventCode = this.getGameEvent('gameplay_update').join('\n\n');
  if (gameplayUpdateEventCode.trim()) {
    code = code + '\n\n' + gameplayUpdateEventCode;
  }

  // Options tab's "Show NTSC scanlines used as the score (debug)" toggle -
  // see generateScanlinesDebugScoreCode's comment in
  // generators/bbasic/score.js for why this is prepended here (same timing/
  // reasoning as gameplayUpdateEventCode just above) rather than hand-
  // formatted into one of the template's raw Setup-section splices.
  const scanlinesDebugScoreCode =
    generateScanlinesDebugScoreCode((useConfigurationStorage().value || {}));
  if (scanlinesDebugScoreCode) {
    code = scanlinesDebugScoreCode + '\n\n' + code;
  }

  // Convert the definitions dictionary into a list. Blockly.utils.object
  // only exports deepMerge in Blockly 10 (confirmed directly against the
  // installed package's utils/object.d.ts - values is gone entirely) -
  // Object.values is the standard JS method it used to wrap, so this needs
  // no Blockly API at all, same reasoning as the Blockly.utils.global fix
  // used just above in this same function.
  const definitions = Object.values(this.definitions_);

  // generateTextMinikernelDims() (called later, via generateSystemDims())
  // needs to know whether Score Bar blocks turned pfscore on, but
  // definitions_ itself is gone by then - Blockly.Generator's  finish()
  // (called right below) deletes it.
  this.pfscoreEnabledForTextMinikernel = !!this.definitions_['pfscore_enable'];

  // Call Blockly.Generator's finish.
  code = Object.getPrototypeOf(this).finish.call(this, code);
  // Normalize indents
  code = Blockly.BBasic.normalizeIndents(code);
  code = Blockly.BBasic.removeJumpsToNextLabel(code);
  // Workaround negation that's not working
  code = code.replaceAll(/(\W)not_(switch\w+(\W?))/g, '$1 !$2');

  const generatedProjectInfo = Blockly.BBasic.generateProjectInfo();
  const generatedConfiguration = Blockly.BBasic.generateConfiguration();
  const generatedRomSize = Blockly.BBasic.generateRomSize();
  const generatedTv = bbTvSetting(useConfigurationStorage().value || {});
  // The starting colors (NTSC palette bytes), swapped for PAL60 like any other color.
  const defaultPlayer1Color = colorByteToBuildBBasic(0x80);
  const defaultPlayer0Color = colorByteToBuildBBasic(0x40);
  // The starting values of the system variables this build keeps (see omitSystemVars).
  const keptSystemVars = (names, valueOf) => names
      .filter((name) => !(Blockly.BBasic.omittedSystemVars || new Set()).has(name))
      .map((name) => ` ${name} = ${valueOf(name)} ${SYSTEM_DEFAULT_MARKER}`).join('\n');
  const generatedPlayerColorDefaults = keptSystemVars(['player1realcolor', 'player0realcolor'],
      (name) => name === 'player1realcolor' ? defaultPlayer1Color : defaultPlayer0Color);
  const generatedBackdropDefaults = keptSystemVars(['playfieldrealcolor', 'backgroundrealcolor'],
      (name) => colorByteToBuildBBasic(name === 'playfieldrealcolor' ? 0x0E : 0xC4));
  const generatedFrameCounterTick = keptSystemVars(['framecounter'], () => 'framecounter + 1');
  const generatedPlayerAnimationDefaults = keptSystemVars(['player0animation', 'player1animation'], () => 0);
  // Zero the scroll edge flags / pending start row before any user event can
  // set them (they live in RAM that isn't guaranteed cleared).
  const generatedScrollDefaults = [
    ...(Blockly.BBasic.backgroundScrollEdgeWatches.size ?
      [` ${Blockly.BBasic.nameDB_.getName(backgroundScrollEdgeFlagsVarName(),
          Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = 0`] : []),
    ...[...new Set([...(Blockly.BBasic.titleScrollEdgeSlots || new Map()).values()].map((slot) => slot.varName))]
        .map((varName) => ` ${Blockly.BBasic.nameDB_.getName(varName, Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = 0`),
    ...['pf', 'bk'].filter((kind) => Blockly.BBasic.multicolorFade[kind].from.length || Blockly.BBasic.multicolorFade[kind].to.length)
        .map((kind) => ` ${Blockly.BBasic.nameDB_.getName(multicolorFadeVarName(kind, 'Step'),
            Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${ROW_FADE_IDLE_STEP}`),
    ...(Blockly.BBasic.backgroundScrollStartUsed ?
      [` ${Blockly.BBasic.nameDB_.getName(backgroundScrollStartVarName(),
          Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = 0`] : []),
  ].join('\n');
  const defaultInitialBackgroundColor = colorByteToBuildBBasic(0x0F);
  // A project that hides the score under DPC+ text still has it assembled (see scoreConfigurationCode), so its
  // digits start out black.
  const hiddenDpcPlusTextScore = (useConfigurationStorage().value || {}).kernel === 'dpcplus' &&
    ((useConfigurationStorage().value || {}).showScore ?? true) === false && this.isTextMinikernelActive();
  const defaultScoreColor = colorByteToBuildBBasic(hiddenDpcPlusTextScore ? 0 : 0x08);
  // DPC+ counts a sprite's y in scanlines down to its top edge, the standard kernel in 2-scanline units down to
  // its bottom edge (line 2 * y + 4), and the DPC+ picture starts 4 lines higher, so the same spot is 2 * y minus
  // the sprite's height in lines.
  const dpcPlusStart = (useConfigurationStorage().value || {}).kernel === 'dpcplus';
  const defaultPlayer0Y = dpcPlusStart ? Math.max(0, 150 - Blockly.BBasic.dpcPlusSpriteLines()) : 75;
  const defaultPlayer1Y = dpcPlusStart ? Math.max(0, 50 - Blockly.BBasic.dpcPlusSpriteLines()) : 25;
  const defaultPlayfieldColor = colorByteToBuildBBasic(0x0E);
  const defaultBackgroundColor = colorByteToBuildBBasic(0xC4);
  const generatedSystemDims = Blockly.BBasic.generateSystemDims();
  const generatedBackgrounds = Blockly.BBasic.generateBackgrounds();
  // Has to run after generateBackgrounds() (needs relocatableGraphicsUnits
  // populated with this build's  resolved background banks) and before
  // every generateDataTables() call below (bank 1's here, and each relocated
  // bank's  call inside generateRelocatedSections) - it works by injecting
  // extra trackDataTableBank entries those calls read from.
  Blockly.BBasic.linkDataTablesToBackgrounds();
  const generatedAnimations = Blockly.BBasic.generateAnimations();
  const generatedDataTables = Blockly.BBasic.generateDataTables(Blockly.BBasic.primaryBank());
  const generatedRomNoiseChecks = generateRomNoiseChecks(Blockly);
  const generatedPlayerHeightLimitChecks = generatePlayerHeightLimitChecks(Blockly);
  // Built earlier, during init() (see registerTitleScreenSubroutine in
  // generators/bbasic/titlescreen.js) - not a generate*() call here like
  // its neighbors, since it needs cardAnimationByRef (kernel slot keys,
  // frame heights/durations), which only exists in that function's
  // scope. Empty string when no Title Screen card is actually animated.
  // The Title Screen loop carries a copy of these checks (see generateGameLoopEvent), and they write the Title Screen
  // variables, which with shared slots would be gameplay variables then: so gameplay does not run them.
  const generatedTitleScreenAnimationChecks = (Blockly.BBasic.titleSharedSlots && Blockly.BBasic.titleSharedSlots.length) ? '' :
    (Blockly.BBasic.titleScreenAnimationChecks || '');
  // The Title Screen loop (see generateGameLoopEvent) runs the first half of commongamelogic, which
  // tracks the project's state: the frame counter, joystick presses and taps, sounds, music,
  // fades and text scrolling. The second half only prepares the regular screen for drawscreen,
  // which the Titlescreen Kernel replaces, so the loop marks itself with the unused top bit of
  // player0size and the subroutine returns before that half while the bit is set.
  const generatedTitleKernelSkip = this.titleScreenDrawUsed ?
    ` if !${TITLE_KERNEL_LOOP_BIT} then goto commongamelogicdraw\n return\ncommongamelogicdraw\n` : '';
  const generatedRainbowColorGraphics = generateRainbowColorGraphics(Blockly);
  const generatedRainbowColorChecks = generateRainbowColorChecks(Blockly);
  const generatedMissileFireChecks = generateMissileFireChecks(Blockly) + generateBounceStageChecks(Blockly);
  const generatedSeekChecks = generateSeekChecks(Blockly);
  const generatedLockChecks = generateLockChecks(Blockly);
  const generatedWidePartnerSync = Blockly.BBasic.generateWidePartnerSync();
  const generatedPfHitChecks = generatePfHitChecks(Blockly) + generateBoxChecks(Blockly);
  const generatedInertiaChecks = generateInertiaChecks(Blockly);
  const generatedShakeScreenChecks = generateShakeScreenChecks(Blockly);
  const generatedDpcPlusColorPriming = Blockly.BBasic.generateDpcPlusColorPriming();
  const generatedDpcPlusColorTables = Blockly.BBasic.generateDpcPlusColorTables();
  const generatedDpcPlusSpriteDefaults = Blockly.BBasic.generateDpcPlusSpriteDefaults();
  const generatedDpcPlusInitialDrawscreen = Blockly.BBasic.generateDpcPlusInitialDrawscreen();
  // Bank 1's copy of the Text Minikernel's "show by id" lookup tables
  // (see generateTextOffsetTables' comment in bbasic/text-scroll.js) -
  // each relocated bank gets its copy directly inside
  // generateRelocatedSections above instead, alongside that bank's data
  // tables.
  const generatedTextOffsetTables = generateTextOffsetTables(Blockly, Blockly.BBasic.primaryBank());
  // Same "bank 1's copy here, each relocated bank gets its copy in
  // generateRelocatedSections" reasoning, for "Show text with ID"'s
  // static-offset tables (see their comment in
  // generators/bbasic/text-minikernel.js) instead of the scroll ones.
  const generatedTextStaticOffsetTables = generateTextStaticOffsetTables(Blockly, Blockly.BBasic.primaryBank());
  // Same "bank 1's copy here, each relocated bank gets its copy in
  // generateRelocatedSections" reasoning, for "Show text row 2 ID"'s
  // parallel offset table (see generateTextRow2OffsetsTable's comment in
  // generators/bbasic/text-minikernel.js).
  const generatedTextRow2OffsetsTable = generateTextRow2OffsetsTable(Blockly, Blockly.BBasic.primaryBank());
  // Same "bank 1's copy here, each relocated bank gets its copy in
  // generateRelocatedSections" reasoning as generatedTextOffsetTables just
  // above.
  const generatedJoyDir8Table = generateJoystickDirection8Table(Blockly);
  // The playfield color scroll's tables (built by generateBackgrounds above).
  const generatedBackgroundColorScrollTables = Blockly.BBasic.backgroundColorScrollTopBank ? '' :
    (Blockly.BBasic.backgroundColorScrollTablesAsm || '');
  const fadeChecksAsm = Blockly.BBasic.generateBackgroundFadeChecks();
  if (fadeChecksAsm) this.subroutines[BG_FADE_CHECKS_NAME] = asSubroutineBody(fadeChecksAsm);
  const rowFadeChecks = Blockly.BBasic.generateRowFadeChecks();
  // The DPC+ sound engine's routine, called at the end of commongamelogic once the frame's sound code has run.
  let generatedDpcPlusAudio = '';
  let dpcAudioNames = null;
  if (this.dpcAudioPlan) {
    dpcAudioNames = Object.fromEntries(dpcAudioVars(this.dpcAudioPlan.channels).map((name) =>
      [name, this.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE)]));
    this.subroutines[DPC_AUDIO_SUBROUTINE_NAME] = this.dpcAudioPlan.routine(dpcAudioNames);
    this.dpcAudioFiles = {'DPC_frequencies.h': this.dpcAudioPlan.frequencyFile()};
    generatedDpcPlusAudio = ` gosub ${DPC_AUDIO_SUBROUTINE_NAME}${Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(DPC_AUDIO_SUBROUTINE_NAME))}
`;
  }
  const generatedSubroutines = Blockly.BBasic.generateSubroutines();
  const generatedFunctions = Blockly.BBasic.generateFunctions();

  const systemStartEvent = this.generateGameEvent('system_start');
  const relocatable = Object.fromEntries(
      RELOCATABLE_EVENT_NAMES.map((name) => [name, Blockly.BBasic.generateRelocatableEvent(name)]));
  const titleStartEvent = relocatable.title_start.inlineEvent;
  const titleUpdateEvent = relocatable.title_update.inlineEvent;
  const gamePlayStartEvent = relocatable.gameplay_start.inlineEvent;
  const gameOverStartEvent = relocatable.gameover_start.inlineEvent;
  const gameOverUpdateEvent = relocatable.gameover_update.inlineEvent;
  const generatedTextMinikernel = Blockly.BBasic.generateTextMinikernel();
  const generatedTextMinikernelDefaults = Blockly.BBasic.generateTextMinikernelDefaults() + '\n' +
    Blockly.BBasic.generateScoreBkColorDefaults();
  const generatedScoreBkColorAsm = Blockly.BBasic.generateScoreBkColorAsm();
  // Has to run before generateDivMul() below - it may set usesDivMul as a
  // side effect (the nibble packing math needs mul8/div8), which
  // generateDivMul() then reads to decide whether to inline div_mul.asm.
  const generatedChannelDurationChecks = Blockly.BBasic.generateChannelDurationChecks();
  // Also has to run before generateRelocatedSections() below (same reasoning
  // as generatedMusicChecks'  comment just below this) - it now registers
  // its "soundfxEnvelopeChecks" unit into relocatableGraphicsUnits (see
  // wrapRelocatableGraphics'  call site at the end of generateEnvelopeChecks
  // in generators/bbasic/soundfx.js), which that call needs to already be
  // there to actually place it in a relocated bank's  section.
  const generatedEnvelopeChecks = Blockly.BBasic.generateEnvelopeChecks();
  // No ordering constraint - background_fade_to's usesDivMul
  // side effect already happened during the main workspaceToCode() pass
  // (this file's  blockToCode call, well before finish() runs), same as
  // every other block's  side effects generateDivMul() below depends on.
  // The checks do nothing while no fade runs, and a call into another bank costs about a hundred cycles, so the call is only made when
  // one of the fades is active (the first thing the routine itself looks at).
  const activeFadeBits = fadeChecksAsm ? [...(Blockly.BBasic.backgroundFadeVarsUsed || [])].map((rawVar) =>
    `${Blockly.BBasic.nameDB_.getName(fadeFlagsVarName(rawVar), Blockly.Names.DEVELOPER_VARIABLE_TYPE)}{${fadeActiveBit(rawVar)}}`) : [];
  const fadeChecksCall = fadeChecksAsm ? (activeFadeBits.length && activeFadeBits.length <= 4 ?
    [...activeFadeBits.map((bit) => ` if ${bit} then goto _bgfade_checks_run`), ' goto _bgfade_checks_skip', '_bgfade_checks_run'] : []
  ).concat([` gosub ${BG_FADE_CHECKS_NAME}${Blockly.BBasic.bankJumpSuffix(
      Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(BG_FADE_CHECKS_NAME))}`],
  activeFadeBits.length && activeFadeBits.length <= 4 ? ['_bgfade_checks_skip'] : []).join('\n') + '\n' : '';
  const generatedBackgroundFadeChecks = fadeChecksCall + rowFadeChecks;
  // Also has to run before generateRelocatedSections() below: it registers
  // its "musicEngine" unit into relocatableGraphicsUnits (see its
  // comment, right where it calls wrapRelocatableGraphics), which that call
  // needs to already be there to actually place it in a relocated bank's
  // section - running it any later would silently leave "musicEngine"
  // registered but never actually emitted anywhere.
  const generatedMusicChecks = Blockly.BBasic.generateMusicChecks();
  const generatedRelocatedEvents = Blockly.BBasic.generateRelocatedSections(
      RELOCATABLE_EVENT_NAMES.map((name) => relocatable[name]));
  const generatedDistanceChecks = Blockly.BBasic.generateDistanceChecks();
  // Same splice region/reasoning as generatedDistanceChecks just above (see
  // joyDir8ResultVarName's  comment in generators/bbasic/input.js) - has
  // to run before generateDivMul() below, since it may set usesDivMul as a
  // side effect.
  const generatedJoystickDirection8Checks = generateJoystickDirection8Checks(Blockly);
  // Same splice region as generatedJoystickDirection8Checks just above - no
  // usesDivMul (or any other) side effects, so no ordering
  // constraint relative to generateDivMul() below, but generateJoystickDoubleTapChecks
  // (right after) DOES depend on this having already run THIS SAME PASS
  // (it reads justReleasedVar, which this is what actually computes each
  // frame - see that function's  comment).
  const generatedJoystickButtonChecks = [generateJoystickButtonChecks(Blockly), generateSwitchEdgeChecks(Blockly)]
      .filter(Boolean).join('\n');
  const generatedJoystickDoubleTapChecks = generateJoystickDoubleTapChecks(Blockly);
  // Has to run before generateDivMul() below: its  POINT input can be
  // any value block, including one that sets usesDivMul as a side effect
  // (e.g. a math_arithmetic divide) - generateDivMul() only sees whatever
  // usesDivMul is by the time IT runs, same ordering reasoning as
  // generatedSoundFadeChecks above.
  const generatedDistancePointChecks = Blockly.BBasic.generateDistancePointChecks();
  // Per-frame scroll-advance check for the Text Minikernel's  scrolling
  // messages (see generators/bbasic/text-scroll.js) - has no usesDivMul (or
  // any other) side effects, so it has no ordering constraint
  // relative to generateDivMul() below, unlike its neighbors above.
  const generatedTextScrollAdvance = generateTextScrollAdvance(Blockly);
  const generatedDivMul = Blockly.BBasic.generateDivMul();
  // After everything that can ask for the multiply and divide routine (see generateDpcPlusBankPreamble).
  const generatedDpcPlusBankPreamble = Blockly.BBasic.generateDpcPlusBankPreamble();
  const generatedMuteAudio = Blockly.BBasic.generateMuteAudio();
  const generatedRunOnceEdgeReset = Blockly.BBasic.generateRunOnceEdgeResetCall();
  const generatedKeypadPollCall = Blockly.BBasic.generateKeypadPollCall();
  const generatedKeypadSetup = Blockly.BBasic.generateKeypadSetup();
  const generatedCtrlpfShadowSetup = generateCtrlpfShadowSetup(Blockly) +
      (this.runOnceRamBytes ? '\n' + this.normalizeIndents(runOnceStartupLines(this.runOnceRamBytes).join('\n')) : '');
  // NUSIZ takes the player's copies (bits 0-2) from playerNsize and the missile's width (bits 4-5) from the
  // missile widths byte, never the animation flags that share playerNsize's upper bits.
  const missileWidthsVar = this.missileWidthUsed ?
    this.nameDB_.getName(missileWidthsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
  const nusiz0Expression = missileWidthsVar ?
    `(player0size & $07) | (${missileWidthsVar} & $30)` : 'player0size & $07';
  const nusiz1Expression = missileWidthsVar ?
    `(player1size & $07) | ((${missileWidthsVar} & $C0) / 4)` : 'player1size & $07';
  // DPC+'s player1 is the first of its virtual sprites, whose size and flip live in the _NUSIZ1 variable (NUSIZ1 is
  // the real register, which the virtual sprites ignore): flipping is bit 3 of it (bits 6 and 7 are the left/right
  // masking, which this app does not use - it does not work with the double-width sprites).
  const dpcPlusSprites = (useConfigurationStorage().value || {}).kernel === 'dpcplus';
  const player1NusizLine = dpcPlusSprites ? ` _NUSIZ1 = ${nusiz1Expression}` : ` NUSIZ1 = ${nusiz1Expression}`;
  const player1FlipLines = dpcPlusSprites ?
    ' if player1size{3} then _NUSIZ1{3} = 1' : ' REFP1 = player1size & 8';
  // Players 2 to 9 keep their copies (bits 0-2) and flip (bit 3) in NUSIZn itself.
  const extraPlayerNusizLines = (this.dpcPlusExtraPlayers || [])
      .map((n) => ` NUSIZ${n} = player${n}size & $0F`).join('\n');
  const generatedBackgroundFadeSetup = Blockly.BBasic.generateBackgroundFadeSetup();

  this.isInitialized = false;

  // Section headings for commongamelogic, matched to whether their
  // content below them actually generated anything - a project with no
  // sound effects/music duration tracking has no "Sound handling" code to
  // label, same idea for "Fade routines" and background/playfield fades.
  const hasSoundHandling = generatedChannelDurationChecks !== '' || generatedEnvelopeChecks !== '';
  const hasFadeRoutines = generatedBackgroundFadeChecks !== '';

  this.nameDB_.reset();
  // Some definitions_ entries end up '' (e.g. a flag-only key like
  // pfscore_enable, or a feature toggled off) - joining those in still
  // inserts their  blank-line separator, stacking up extra blank lines
  // under the "Code generated by VCS Game Maker." heading below.
  const generatedBody = definitions.filter((definition) => definition.trim() !== '').join('\n\n') +
    '\n\n\n' + code;
  const generated = handlebarsTemplate({generatedDpcPlusAudio, generatedBody, generatedBackgrounds,
    generatedAnimations, generatedDataTables, generatedRomNoiseChecks, generatedPlayerHeightLimitChecks, generatedTitleScreenAnimationChecks,
    generatedRainbowColorGraphics, generatedRainbowColorChecks, generatedMissileFireChecks,
    generatedSeekChecks, generatedLockChecks, generatedWidePartnerSync, generatedPfHitChecks, generatedInertiaChecks, generatedShakeScreenChecks, generatedDpcPlusColorPriming, generatedDpcPlusColorTables, generatedDpcPlusInitialDrawscreen,
    generatedDpcPlusSpriteDefaults,
    generatedDpcPlusBankPreamble,
    generatedTextOffsetTables, generatedTextStaticOffsetTables, generatedTextRow2OffsetsTable, generatedJoyDir8Table,
    generatedBackgroundColorScrollTables,
    generatedSubroutines, generatedFunctions, generatedRelocatedEvents, generatedTextMinikernel,
    systemStartEvent, titleStartEvent, titleUpdateEvent, gamePlayStartEvent,
    gameOverStartEvent, gameOverUpdateEvent, generatedProjectInfo, generatedConfiguration, generatedRomSize, generatedTv, generatedScrollDefaults, generatedPlayerColorDefaults, generatedPlayerAnimationDefaults,
    generatedFrameCounterTick, generatedBackdropDefaults, defaultPlayfieldColor, defaultBackgroundColor, defaultInitialBackgroundColor, defaultScoreColor,
    defaultPlayer0Y, defaultPlayer1Y,
    generatedSystemDims,
    generatedTextMinikernelDefaults, generatedDivMul, generatedMuteAudio, generatedChannelDurationChecks,
    generatedEnvelopeChecks, hasSoundHandling, hasFadeRoutines,
    generatedBackgroundFadeChecks, generatedMusicChecks, generatedDistanceChecks, generatedDistancePointChecks,
    generatedJoystickDirection8Checks, generatedJoystickButtonChecks, generatedJoystickDoubleTapChecks,
    generatedTextScrollAdvance, generatedTitleKernelSkip, generatedScoreBkColorAsm, generatedRunOnceEdgeReset,
    generatedKeypadPollCall, generatedKeypadSetup, generatedCtrlpfShadowSetup, generatedBackgroundFadeSetup,
    nusiz0Expression, nusiz1Expression, player1NusizLine, player1FlipLines, extraPlayerNusizLines});
  return dpcAudioNames ? redirectSoundRegisters(generated, dpcAudioNames) : generated;
};

// Builds the run-once flag bytes' per-frame reset body - registered as the
// RUN_ONCE_EDGE_RESET_NAME subroutine's body by init() (see its
// comment), called from commongamelogic (see bbasic.bb.hbs) via
// generateRunOnceEdgeResetCall below, before generatedBody itself runs (the
// main loop's "gosub commongamelogic" happens before the per-frame game
// logic containing every "Run once" block) - has to run first so it's
// comparing against LAST frame's touched bits, not bits the current frame
// hasn't set yet. See blocks/event.js's event_run_once and its
// runOnceByteLetters comment in init() for the two-bit-per-instance,
// one-byte-per-4-instances "fired"/"touched" scheme this maintains (low
// nibble touched, high nibble fired): clears an instance's fired bit the
// instant it goes a whole frame without being touched (i.e. its enclosing
// condition just went false), so the very next activation fires again;
// leaves it alone for as long as the instance keeps being touched every
// frame (still the same activation).
//
// Nibble-aligned (not interleaved bit-pairs) specifically so this reset is
// two whole-byte shift/mask ops per byte regardless of how many of its 4
// instances are actually in use, instead of needing to unpack and re-pack
// each instance's  bit pair separately: temp1 takes the touched nibble
// as-is (already low-aligned); temp2 shifts the fired nibble down to
// low-aligned too, ANDs it against temp1 (clearing any fired bit whose
// touched counterpart is 0), then shifts the masked result back up - which
// also has the side effect of zeroing the low nibble, i.e. resetting every
// touched bit for the next frame's fresh tracking, for free.
// Hand-written 6502 instead of the 4-line-per-byte bB version this used to
// be - registered as an ordinary subroutine (see its  caller's comment),
// so this goes through normalizeIndents() same as _distance_abs_diff in
// input.js: bare "asm"/mnemonics with no leading whitespace (normalizeIndents
// adds one uniformly), "@end" (not a bare "end") to force the closing
// keyword back to column 0 the same way "@end" does there - the auto-
// appended bB "return" after this body needs the asm block actually closed
// first. "/16"/"*16" are power-of-2 CONSTANTS, so the real bB compiler
// already compiles those to inline shifts, not a div_mul.asm "jsr" (see
// generateDivMul's  comment on when that IS needed) - the actual saving
// here is smaller than that class of conversion elsewhere: each of the 4 bB
// statements this replaced reloaded its  operand from memory
// independently, where this keeps the touched nibble in temp1 and the rest
// of the work in A throughout, without those redundant reloads.
// Zeroes the display memory bytes user variables were given (see displayRamVars in init()): the memory powers up with random contents.
// A bB loop per area that holds any, writing through data fetcher 6.
Blockly.BBasic.generateDisplayRamVarClears = function() {
  const count = this.displayRamVars ? this.displayRamVars.size : 0;
  if (!count) return '';
  const tables = ['PF1L', 'PF2L', 'PF1R', 'PF2R', 'PFCOLS', 'BKCOLS'];
  const lines = [];
  for (let step = 0; step * 128 < count; step++) {
    const bytes = Math.min(128, count - step * 128);
    const table = tables[5 - step];
    lines.push(' asm', ` lda #<(${table}+${128 - bytes + 128})`, ' sta DF6LOW', ` lda #(>(${table}+${128 - bytes + 128})) & $0F`, ' sta DF6HI',
        'end', ` temp1 = ${bytes}`, `_displayramclear_${step}`, ' asm', ' ldx #0', ' stx DF6WRITE', 'end', ' temp1 = temp1 - 1',
        ` if temp1 > 0 then goto _displayramclear_${step}`);
  }
  return lines.join('\n') + '\n';
};

Blockly.BBasic.generateRunOnceEdgeReset = function() {
  if (this.runOnceRamBytes) return runOnceResetLines(this.runOnceRamBytes).join('\n');
  const bytes = this.runOnceByteLetters || [];
  if (!bytes.length) return '';
  // The bytes that hold Title Screen variables while the title loop runs are not touched then (that bit of player0size is
  // set while the loop runs), so they go last, behind a skip.
  const hostedNames = this.runOnceHostedBytes || new Set();
  const names = this.runOnceByteNames || [];
  const isHosted = (index) => hostedNames.has(names[index]);
  const ordered = [...bytes.keys()].filter((i) => !isHosted(i)).concat([...bytes.keys()].filter(isHosted));
  const firstHosted = ordered.findIndex(isHosted);
  const guard = [];
  const guardEnd = [];
  if (firstHosted !== -1) {
    guard.push('LDA player0size', 'BPL _runoncehosted_run', 'JMP _runoncehosted_skip', '@_runoncehosted_run');
    guardEnd.push('@_runoncehosted_skip');
  }
  return [
    'asm',
    ...ordered.flatMap((index, position) => [
      ...(position === firstHosted ? guard : []),
      ...[bytes[index]].flatMap((byte) => [
        'LDA ' + byte,
        'AND #$0F',
        'STA temp1',
        'LDA ' + byte,
        'LSR',
        'LSR',
        'LSR',
        'LSR',
        'AND temp1',
        'ASL',
        'ASL',
        'ASL',
        'ASL',
        'STA ' + byte,
      ])]),
    ...guardEnd,
    '@end',
  ].join('\n');
};

// The actual splice into commongamelogic (see bbasic.bb.hbs) - just a call
// to the RUN_ONCE_EDGE_RESET_NAME subroutine registered by init(), the same
// bank-tagged "gosub"/bankJumpSuffix pattern subroutine_call itself uses
// (see its  comment for why "return" never needs its  bank tag).
// Empty (nothing to call) whenever the project has no "Run once" blocks at
// all, same as the old inline version being empty in that case.
Blockly.BBasic.generateRunOnceEdgeResetCall = function() {
  if (!this.subroutines[RUN_ONCE_EDGE_RESET_NAME]) return '';
  const suffix = Blockly.BBasic.bankJumpSuffix(
      Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(RUN_ONCE_EDGE_RESET_NAME));
  const call = ` gosub ${RUN_ONCE_EDGE_RESET_NAME}${suffix}`;
  // The reset leaves a byte of flags that is 0 as it is, and on most frames none is set: a few cycles to see that instead of a
  // call that may cross into another bank (about a hundred). Only for plain bytes (the ones that hold Title Screen variables
  // while the title loop runs, and the ones in display memory, are handled inside the routine).
  const bytes = this.runOnceByteLetters || [];
  const hostedNames = this.runOnceHostedBytes || new Set();
  const names = this.runOnceByteNames || [];
  if (this.runOnceRamBytes || !bytes.length || bytes.length > 4 || names.some((name) => hostedNames.has(name))) return call;
  return [...bytes.map((byte) => ` if ${byte} <> 0 then goto _runonce_reset_run`), ' goto _runonce_reset_skip',
    '_runonce_reset_run', call, '_runonce_reset_skip'].join('\n');
};

// "*"/"/" by a non-power-of-2 constant or a runtime variable compiles to
// "jsr mul8"/"jsr div8" (see math.js's math_arithmetic handler), a shared
// routine real batari Basic programs pull in themselves with "include
// div_mul.asm" - since Blockly projects have no way to add that by hand,
// this splices the same file in (as a plain, unconditional "inline", not
// wrapped in a "bank" switch like the Text Minikernel needs - mul8/div8 are
// called with a plain same-bank "jsr" from wherever the multiply/divide
// happens to compile to, which for an unrelocated project is always bank 1,
// the same bank this ends up inlined into) whenever any multiply or divide
// block is used. Placed in bbasic.bb.hbs's trailing "never fallen into"
// section, same as generatedTextMinikernel and generatedDataTables, since -
// like those - falling into "mul8"/"div8"'s  code from above would
// execute it with whatever registers happened to be lying around instead of
// the operands it expects.
Blockly.BBasic.generateDivMul = function() {
  if (!this.usesDivMul) return '';
  // Under DPC+ the routine sits in bank 1 with the kernel, where the compiler sends every multiply and divide to (see
  // generateDpcPlusBankPreamble): the program itself is in bank 2, and a call into bank 1 would find other code.
  const configurationStorage = useConfigurationStorage();
  if (((configurationStorage && configurationStorage.value) || {}).kernel === 'dpcplus') return '';
  return ' inline div_mul.asm';
};

// Whether the project uses multiply/divide (see math.js) - hooks/rom.js
// needs this to know whether to fetch div_mul.asm as a compile sibling file,
// the same way it checks isTextMinikernelActive() for text12a.asm/text12b.asm.
Blockly.BBasic.usesDivMulRoutine = function() {
  return !!this.usesDivMul;
};

// Drops every "goto X" line whose only lines before label X are blank lines,
// comments and other labels: a jump to the next instruction costs 3 bytes and
// 3 cycles for nothing. The generated if/else, loop and run-once blocks leave
// plenty of these behind (a body's closing "goto end" right before the end
// label, a nested block's end label followed by its parent's).
Blockly.BBasic.removeJumpsToNextLabel = function(code) {
  const lines = code.split('\n');
  const kept = [];
  for (let i = 0; i < lines.length; i++) {
    const jump = lines[i].match(/^\s*goto\s+(\w+)\s*$/);
    let redundant = false;
    if (jump) {
      for (let j = i + 1; j < lines.length; j++) {
        const next = lines[j];
        if (/^\s*$/.test(next) || /^\s*rem(\s|$)/i.test(next)) continue;
        // A label is the only kind of line that starts in the first column.
        const label = next.match(/^([A-Za-z_]\w*)\s*$/);
        if (!label) break;
        if (label[1] === jump[1]) {
          redundant = true;
          break;
        }
      }
    }
    if (!redundant) kept.push(lines[i]);
  }
  return kept.join('\n');
};

Blockly.BBasic.normalizeIndents = function(code) {
  code = code.replace(/^[\t ]*/gm, Blockly.BBasic.INDENT);
  // Convert indent for labels
  code = code.replace(/^[\t ]*@\s*/gm, '');
  return code;
};

/**
 * Naked values are top-level blocks with outputs that aren't plugged into
 * anything.  A trailing semicolon is needed to make this legal.
 * @param {string} line Line of generated code.
 * @return {string} Legal line of code.
 */
Blockly.BBasic.scrubNakedValue = function(line) {
  return `  rem Found naked value: ${line}`;
};

/**
 * Encode a string as a properly escaped JavaScript string, complete with
 * quotes.
 * @param {string} string Text to encode.
 * @return {string} JavaScript string.
 * @protected
 */
Blockly.BBasic.quote_ = function(string) {
  // Can't use goog.string.quote since Google's style guide recommends
  // JS string literals use single quotes.
  string = string.replace(/\\/g, '\\\\')
      .replace(/\n/g, '\\\n')
      .replace(/'/g, '\\\'');
  return '\'' + string + '\'';
};

/**
 * Encode a string as a properly escaped multiline JavaScript string, complete
 * with quotes.
 * @param {string} string Text to encode.
 * @return {string} JavaScript string.
 * @protected
 */
Blockly.BBasic.multiline_quote_ = function(string) {
  // Can't use goog.string.quote since Google's style guide recommends
  // JS string literals use single quotes.
  const lines = string.split(/\n/g).map(this.quote_);
  return lines.join(' + \'\\n\' +\n');
};

/**
 * Common tasks for generating JavaScript from blocks.
 * Handles comments for the specified block and any connected value blocks.
 * Calls any statements following this block.
 * @param {!Blockly.Block} block The current block.
 * @param {string} code The JavaScript code created for this block.
 * @param {boolean=} optThisOnly True to generate code for only this statement.
 * @return {string} JavaScript code with comments and subsequent blocks added.
 * @protected
 */
// A value block can smuggle setup statements ahead of its real expression as
// a newline-joined preamble - the ONLY way for a plain value-block generator
// to inject lines before whatever consumes its return value, since there's
// no other hook a value block (no previousStatement/nextStatement of its
// ) can use to emit a statement. This used to be a convention
// each CONSUMER had to know about and manually split back out (see
// controls_if's  comment in generators/bbasic/logic.js, and
// background_get_pixel's in generators/bbasic/background.js) - workable only
// for the handful of consumers that were actually taught it, and a real
// reported bug otherwise: a plain "Set X to <value with a preamble>"
// assignment (variables_set, background_set, sprite_*_set, ... - none of
// which know this convention) compiled the preamble and the assignment onto
// the same broken line ("X = arg1 = Y") instead of two separate ones.
//
// Handled HERE instead, centrally, in scrub_ - the one hook Blockly's
// blockToCode calls for EVERY block, value or statement, immediately after
// that block's  generator function returns. A value block's  nested
// value sockets are always resolved (via valueToCode, which itself goes
// through blockToCode+scrub_) before ITS generator function returns, so
// by the time a value block's  code reaches scrub_ below, any preamble
// ITS children needed has already been queued - meaning this correctly
// unwinds nesting depth-first, regardless of how deep a preamble-emitting
// block sits inside another expression (a case the old, per-consumer
// convention could never handle safely).
//
// pendingPreambleLines is reset fresh in init() (see its  comment there)
// - a value block's  code gets checked for an embedded "\n" (never
// present otherwise - see controls_if's  comment) and, if found, every
// line but the last is pushed here and stripped out of the returned code,
// leaving just the real expression for whatever consumes it; a statement
// block drains and prepends whatever accumulated here while ITS value
// sockets were being resolved, a few lines below.
Blockly.BBasic.scrub_ = function(block, code, optThisOnly) {
  // Not every value block's generator returns a string (e.g. color_get's
  // "return [colorIndex, ORDER_ATOMIC]" in generators/bbasic/color.js returns
  // a bare number) - confirmed as a real reported crash otherwise
  // ("code.includes is not a function"). The embedded-"\n"-preamble
  // convention this hoists is only ever produced by code that's already a
  // built-up string (see this function's  top comment), so anything else
  // can never contain one and is left untouched here.
  if (block.outputConnection && typeof code === 'string') {
    if (code.includes('\n')) {
      const lines = code.split('\n');
      this.pendingPreambleLines.push(...lines.slice(0, -1));
      code = lines[lines.length - 1];
    }
  }
  let commentCode = '';
  // Only collect comments for blocks that aren't inline.
  if (!block.outputConnection || !block.outputConnection.targetConnection) {
    // Collect comment for this block.
    let comment = block.getCommentText();
    if (comment) {
      comment = Blockly.utils.string.wrap(comment, this.COMMENT_WRAP - 3);
      commentCode += this.prefixLines(comment + '\n', 'rem ');
    }
    // Collect comments for all value arguments.
    // Don't collect comments for nested statements.
    for (let i = 0; i < block.inputList.length; i++) {
      if (block.inputList[i].type == Blockly.inputTypes.VALUE) {
        const childBlock = block.inputList[i].connection.targetBlock();
        if (childBlock) {
          comment = this.allNestedComments(childBlock);
          if (comment) {
            commentCode += this.prefixLines(comment, '// ');
          }
        }
      }
    }
  }
  // Drain whatever preamble accumulated above while THIS block's  value
  // sockets were being resolved (see this function's  top comment) - only
  // for a statement block (a value block's  preamble has to bubble up to
  // whichever statement actually consumes it, not be swallowed here by the
  // value block itself, which is why this sits after the `if
  // (block.outputConnection)` branch above, not inside it). A no-op (empty
  // string) for the overwhelming majority of statements, which never have a
  // preamble-emitting value plugged into any of their  sockets.
  //
  // MUST happen before nextCode is resolved below, not after - confirmed as a
  // real reported bug otherwise ("data pulled from the wrong table"):
  // blockToCode(nextBlock) recurses all the way down the rest of THIS
  // statement chain before returning (each subsequent statement's  scrub_
  // call happens INSIDE that recursive call, not after it), so computing
  // nextCode first meant whichever statement happened to bottom out that
  // recursion first (the last one in the chain, or wherever optThisOnly/a
  // null nextBlock ended it) drained the ENTIRE queue accumulated so far -
  // including preamble that belonged to THIS block and any others still
  // waiting - and got it prepended to some LATER statement's  code
  // instead. That left this block's  code (returned below, un-prefixed)
  // reading a dispatch result before its  write+gosub preamble had even
  // been emitted yet, while the actual preamble surfaced too late, clumped
  // in front of an unrelated later line.
  let preambleCode = '';
  if (!block.outputConnection && this.pendingPreambleLines.length) {
    preambleCode = this.pendingPreambleLines.map((line) => line + '\n').join('');
    this.pendingPreambleLines = [];
  }
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = optThisOnly ? '' : this.blockToCode(nextBlock);
  return preambleCode + commentCode + code + nextCode;
};

/**
 * Gets a property and adjusts the value while taking into account indexing.
 * @param {!Blockly.Block} block The block.
 * @param {string} atId The property ID of the element to get.
 * @param {number=} optDelta Value to add.
 * @param {boolean=} optNegate Whether to negate the value.
 * @param {number=} optOrder The highest order acting on this value.
 * @return {string|number}
 */
Blockly.BBasic.getAdjusted = function(block, atId, optDelta, optNegate,
    optOrder) {
  let delta = optDelta || 0;
  let order = optOrder || this.ORDER_NONE;
  if (block.workspace.options.oneBasedIndex) {
    delta--;
  }
  const defaultAtIndex = block.workspace.options.oneBasedIndex ? '1' : '0';
  let at;
  if (delta > 0) {
    at = this.valueToCode(block, atId,
        this.ORDER_ADDITION) || defaultAtIndex;
  } else if (delta < 0) {
    at = this.valueToCode(block, atId,
        this.ORDER_SUBTRACTION) || defaultAtIndex;
  } else if (optNegate) {
    at = this.valueToCode(block, atId,
        this.ORDER_UNARY_NEGATION) || defaultAtIndex;
  } else {
    at = this.valueToCode(block, atId, order) || defaultAtIndex;
  }

  if (Blockly.isNumber(at)) {
    // If the index is a naked number, adjust it right now.
    at = Number(at) + delta;
    if (optNegate) {
      at = -at;
    }
  } else {
    // If the index is dynamic, adjust it in code.
    let innerOrder;
    if (delta > 0) {
      at = at + ' + ' + delta;
      innerOrder = this.ORDER_ADDITION;
    } else if (delta < 0) {
      at = at + ' - ' + -delta;
      innerOrder = this.ORDER_SUBTRACTION;
    }
    if (optNegate) {
      if (delta) {
        at = '-(' + at + ')';
      } else {
        at = '-' + at;
      }
      innerOrder = this.ORDER_UNARY_NEGATION;
    }
    innerOrder = Math.floor(innerOrder);
    order = Math.floor(order);
    if (innerOrder && order >= innerOrder) {
      at = '(' + at + ')';
    }
  }
  return at;
};

Blockly.BBasic.getGameEvent = function(eventName, code) {
  let eventCode = this.gameEvents[eventName];
  if (!eventCode) {
    eventCode = [];
    this.gameEvents[eventName] = eventCode;
  }
  return eventCode;
};

// Title Screen variables only exist while the title screen runs. The variables that gameplay uses
// and the title screen never touches can share their slots, so the project needs fewer slots. A
// variable counts as gameplay-only when it is used by no block of the events that run before or
// around the title screen (System start, Title screen start/update), nor of any other stack that
// has a title screen block, nor of a function or subroutine that those call.
// Nothing is shared at all when a title screen block sits outside those events (it would then
// write the shared slots during gameplay).
const TITLE_PHASE_EVENTS = ['system_start', 'title_start', 'title_update'];
// Set while the Title Screen loop runs (see generatedTitleKernelSkip). Bit 7 of player0size is
// not used by NUSIZ0 or anything else.
const TITLE_KERNEL_LOOP_BIT = 'player0size{7}';
// The blocks that can run while the title screen does (see above), or null when sharing is off altogether.
const CALL_BLOCK_TYPES = ['subroutine_call', 'function_call', 'function_call_statement'];
// The blocks that only run once "End title screen" has: the body of an "if variable = number" in Title screen update, where
// every block of the project that sets the variable to that number is followed by "End title screen" in its stack (so the
// kernel has stopped by the time the variable holds it), and no other kind of block changes the variable. Title screen start
// has to set the variable to some other number first, so a second pass through the title screen starts from a different value.
const findTitleEndedBlocks = (workspace) => {
  const result = new Set();
  const allBlocks = workspace.getAllBlocks(false);
  const isEnd = (block) => block.type === 'titlescreen_end' && block.isEnabled();
  if (!allBlocks.some(isEnd)) return result;
  const numberOf = (block) => (block && block.type === 'math_number' ? Number(block.getFieldValue('NUM')) : null);
  const setsOf = (id) => allBlocks.filter((block) => block.type === 'variables_set' && block.getFieldValue('VAR') === id);
  // The end block is in the same stack as the set block, before or after it, so it has run (this frame) by the time the variable
  // holds the number and any code that checks for it runs.
  const followedByEnd = (block) => {
    for (let next = block.getNextBlock(); next; next = next.getNextBlock()) if (isEnd(next)) return true;
    for (let previous = block.getPreviousBlock(); previous; previous = previous.getPreviousBlock()) if (isEnd(previous)) return true;
    return false;
  };
  const eventBlocks = (name) => allBlocks.filter((block) => block.type === 'event_block' && block.getFieldValue('EVENT') === name);
  const startsAtOtherValue = (id, value) => eventBlocks('title_start').some((top) =>
    (() => {
      for (let block = top.getInputTargetBlock('DO'); block; block = block.getNextBlock()) {
        if (block.type === 'variables_set' && block.getFieldValue('VAR') === id) {
          const set = numberOf(block.getInputTargetBlock('VALUE'));
          return set !== null && set !== value;
        }
      }
      return false;
    })());
  const guardOf = (condition) => {
    if (!condition || condition.type !== 'logic_compare' || condition.getFieldValue('OP') !== 'EQ') return null;
    const [a, b] = [condition.getInputTargetBlock('A'), condition.getInputTargetBlock('B')];
    const variable = [a, b].find((block) => block && block.type === 'variables_get');
    const number = [a, b].map(numberOf).find((value) => value !== null);
    return variable && number !== undefined ? {id: variable.getFieldValue('VAR'), value: number} : null;
  };
  const validGuard = new Map();
  const isValid = ({id, value}) => {
    const key = `${id}=${value}`;
    if (!validGuard.has(key)) {
      const writers = allBlocks.filter((block) => block.type !== 'variables_get' && block.getVars().includes(id));
      validGuard.set(key, writers.every((block) => block.type === 'variables_set' && numberOf(block.getInputTargetBlock('VALUE')) !== null &&
          (numberOf(block.getInputTargetBlock('VALUE')) !== value || followedByEnd(block))) &&
          setsOf(id).length > 0 && startsAtOtherValue(id, value));
    }
    return validGuard.get(key);
  };
  eventBlocks('title_update')
      .forEach((top) => top.getInputTargetBlock('DO') && top.getInputTargetBlock('DO').getDescendants(false)
          .filter((block) => block.type === 'controls_if').forEach((block) => {
            for (let i = 0; block.getInput(`IF${i}`); i++) {
              const guard = guardOf(block.getInputTargetBlock(`IF${i}`));
              const body = block.getInputTargetBlock(`DO${i}`);
              if (guard && body && isValid(guard)) {
                for (let inner = body; inner; inner = inner.getNextBlock()) inner.getDescendants(false).forEach((d) => result.add(d));
              }
            }
          }));
  return result;
};
const titlePhaseBlocks = (workspace, ended = null) => {
  const phaseBlocks = [];
  const routines = new Map();
  let titleBlockOutside = false;
  workspace.getTopBlocks(false).forEach((top) => {
    const blocks = top.getDescendants(false);
    const isTitlePhase = top.type === 'event_block' && TITLE_PHASE_EVENTS.includes(top.getFieldValue('EVENT'));
    const hasTitleBlock = blocks.some((block) => block.type.startsWith('titlescreen_'));
    const isRoutine = top.type === 'function_define' || top.type === 'subroutine_define';
    if (hasTitleBlock && !isTitlePhase && !(top.type === 'event_block' &&
        ['gameover_start', 'gameover_update'].includes(top.getFieldValue('EVENT')))) {
      titleBlockOutside = true;
    }
    if (isRoutine && !hasTitleBlock) routines.set(`${top.type}:${top.getFieldValue('NAME')}`, blocks);
    else if (isTitlePhase || hasTitleBlock) phaseBlocks.push(...blocks);
  });
  // A routine counts only when a block that can run during the title screen calls it, directly or through another routine.
  const reached = new Set();
  const callsFrom = (blocks) => blocks.filter((block) => CALL_BLOCK_TYPES.includes(block.type)).forEach((call) => {
    const key = `${call.type === 'subroutine_call' ? 'subroutine_define' : 'function_define'}:${call.getFieldValue('NAME')}`;
    if (!routines.has(key) || reached.has(key)) return;
    reached.add(key);
    phaseBlocks.push(...routines.get(key));
    callsFrom(routines.get(key));
  });
  callsFrom(ended ? phaseBlocks.filter((block) => !ended.has(block)) : [...phaseBlocks]);
  return titleBlockOutside ? null : (ended ? phaseBlocks.filter((block) => !ended.has(block)) : phaseBlocks);
};
// The ids of the variables no block of the title phase touches. A variable only the blocks that run once "End title screen" has
// (see findTitleEndedBlocks) touch counts too, and comes back in `afterEnd` as well: its slot holds a Title Screen variable until
// then, so it is set back to zero (what it holds before anything sets it) as that block runs.
const findGameplayOnlyVariables = (workspace, variables) => {
  const used = new Set(variables.map((variable) => variable.getId()));
  const usedBy = (blocks) => {
    const ids = new Set();
    blocks.forEach((block) => block.getVars().forEach((id) => ids.add(id)));
    return ids;
  };
  const phaseBlocks = titlePhaseBlocks(workspace);
  if (!phaseBlocks) return [];
  const ended = findTitleEndedBlocks(workspace);
  const endedPhaseBlocks = ended.size ? titlePhaseBlocks(workspace, ended) : phaseBlocks;
  const excluded = usedBy(phaseBlocks);
  const excludedAfterEnd = usedBy(endedPhaseBlocks);
  const ids = [...used].filter((id) => !excludedAfterEnd.has(id));
  ids.afterEnd = ids.filter((id) => excluded.has(id));
  return ids;
};
// The fired objects whose Fire/Bounce direction byte only gameplay uses: the code that moves a fired object runs
// after the Title Screen loop skips the rest of the frame, so only a Fire or Bounce block of the title phase
// itself could touch the byte there.
const findGameplayOnlyFireNames = (workspace, names, matchesName) => {
  const phaseBlocks = titlePhaseBlocks(workspace);
  if (!phaseBlocks) return [];
  return names.filter((name) => !phaseBlocks.some((block) => matchesName(block, name)));
};

Blockly.BBasic.addGameEvent = function(eventName, code) {
  this.getGameEvent(eventName).push(code);
};

Blockly.BBasic.generateGameEvent = function(eventName,
    codeGenerator = (eventName, eventCode) => eventCode.join('\n\n')) {
  let eventCode = codeGenerator(eventName, this.getGameEvent(eventName));
  // Title screen start sets the title screen's runtime state back to what the Title tab says: the colors
  // of the graphics that blocks can recolor, the held frames and the background color override.
  let titleResets = [];
  if (this.titleScreenDrawUsed && eventName === 'title_start') {
    const resets = [
      ...this.titleCardHoldRefs.map((ref, index) => `${titleCardHoldVar()}{${titleCardHoldBit(index)}} = 0`),
      ...this.titleCardOnceRefs.map((ref, index) => `${titleCardOnceVar()}{${titleCardOnceBit(index)}} = 0`),
      ...this.titleCardReverseRefs.map((ref, index) => `${titleCardReverseVar()}{${titleCardReverseBit(index)}} = 0`),
      ...this.titleCardFinishedRefs.flatMap((ref, index) => [
        `${titleCardFinishedVar()}{${titleCardFinishedBit(index)}} = 0`,
        `${titleCardFinishedVar()}{${titleCardFinishedLatchBit(index)}} = 0`]),
      ...[0, 1].filter((i) => this.titlePlayerSlots && this.titlePlayerSlots[i].once)
          .map((i) => `${titlePlayerOnceVar()}{${titlePlayerOnceBit(i)}} = 0`),
      ...(this.titleBgUsed ? [`${titleBgOverrideVar()}{${titleBgOverrideBit()}} = 0`] : []),
      ...(this.titleScreenStartLines || []),
    ];
    if (resets.length) eventCode = resets.join('\n') + '\n' + eventCode;
    titleResets = resets;
  }
  // Leaving the Title Screen loop: commongamelogic goes back to preparing the regular screen.
  if (this.titleScreenDrawUsed && ['title_start', 'gameplay_start', 'gameover_start'].includes(eventName)) {
    eventCode = `${TITLE_KERNEL_LOOP_BIT} = 0\n` + eventCode;
    // The Titlescreen Kernel leaves CTRLPF at the value it needs, so the ball width and playfield priority a
    // block set earlier are put back from the CTRLPF shadow.
    if (eventName !== 'title_start' && this.ctrlpfShadowUsed) {
      const shadowVar = this.nameDB_.getName(ctrlpfShadowVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      eventCode = `CTRLPF = ${shadowVar}\n` + eventCode;
    }
  }
  // Title screen start turns the kernel back on after "End title screen" turned it off.
  if (this.titleEndUsed && eventName === 'title_start') {
    eventCode = `${titleKernelEndedVar()}{${titleKernelEndedBit()}} = 0\n` + eventCode;
  }
  // The Titlescreen Kernel moves the sprites' positions around while it draws (it counts frames in missile0x, for
  // one). A project with no block that sets or changes where a sprite is has nothing to put them back, so
  // gameplay starts them from the positions a new project begins with.
  if (this.titleScreenDrawUsed && eventName === 'gameplay_start' && !this.spritePositionBlocksUsed) {
    const dpcPlusKernel = (useConfigurationStorage().value || {}).kernel === 'dpcplus';
    eventCode = [
      'player0x = 75', `player0y = ${dpcPlusKernel ? Math.max(0, 150 - Blockly.BBasic.dpcPlusSpriteLines()) : 75}`, 'player1x = 75',
      `player1y = ${dpcPlusKernel ? Math.max(0, 50 - Blockly.BBasic.dpcPlusSpriteLines()) : 25}`,
      'ballx = 0', 'bally = 0',
      'missile0x = 0', 'missile0y = 0', 'missile1x = 0', 'missile1y = 0',
    ].join('\n') + '\n' + eventCode;
  }
  // Title Screen variables share their slots with gameplay variables, so each side starts with the
  // slots cleared (the same zeros the variables have at power-on).
  if (this.titleSharedSlots && this.titleSharedSlots.length &&
      (eventName === 'title_start' || eventName === 'gameplay_start')) {
    const names = this.titleSharedSlots.map((shared) => (eventName === 'title_start' ? shared.titleVar : shared.target));
    const startValue = (name) => (eventName === 'gameplay_start' && this.titleSharedInit && this.titleSharedInit.get(name)) || 0;
    eventCode = names.map((name) => `${name} = ${startValue(name)}`).join('\n') + '\n' + eventCode;
  }
  // The run-once bit pairs both sides use: the other side's fired bit would still be set from its last frame.
  if (this.runOnceSharedPairs && ['title_start', 'gameplay_start', 'gameover_start'].includes(eventName)) {
    const clears = [];
    if (this.runOnceRamBytes) clears.push(...runOnceClearLines(this.runOnceSharedPairs));
    else {
      for (let instance = 0; instance < this.runOnceSharedPairs; instance++) {
        const flagByte = this.runOnceByteLetters[Math.floor(instance / 4)];
        clears.push(`${flagByte}{${instance % 4}} = 0`, `${flagByte}{${instance % 4 + 4}} = 0`);
      }
    }
    eventCode = clears.join('\n') + '\n' + eventCode;
  }
  // A gameplay variable that shares a Title Screen variable's slot may be set by the code that runs as the title screen starts
  // (a routine that resets the game, say), which would leave its value in the Title Screen variable. The Title Screen variables
  // are set again as the event ends, from the same values the start of the event gave them.
  const titleReinit = [];
  if (eventName === 'title_start' && this.titleSharedSlots && this.titleSharedInit) {
    this.titleSharedSlots.filter((shared) => this.titleSharedInit.has(shared.target) &&
        this.gameplayOnlyHints && this.gameplayOnlyHints.startAssigned.has(shared.target)).forEach(({titleVar}) => {
      const reset = titleResets.filter((line) => line.startsWith(`${titleVar} = `)).pop();
      titleReinit.push(reset || `${titleVar} = 0`);
    });
  }
  return this.normalizeIndents([
    'rem **************************************************************************',
    `rem Event: ${eventName}.`,
    'rem **************************************************************************',
    `@${eventName}_begin`,
    eventCode,
    `@${eventName}_end`,
    ...titleReinit,
  ].join('\n'));
};

// commongamelogic is fixed, always-bank-1 content (see bbasic.bb.hbs) - the
// "gosub commongamelogic" below needs its  bank tag whenever eventName
// itself has been relocated away from bank 1, same as any other cross-bank
// call (see bankJumpSuffix). Confirmed directly as a real bug: this was
// hardcoded with no tag at all, so once title_update (the only event that
// calls generateGameLoopEvent) got relocated to some bank N, the call
// silently stayed untagged - never actually switching to bank 1 first, so
// whatever happened to be at that address in bank N's  ROM ran instead
// of the real commongamelogic.
Blockly.BBasic.generateGameLoopEvent = function(eventName) {
  return this.generateGameEvent(eventName, (eventName, eventCode) => {
    const innerCode = eventCode.join('\n\n');
    if (!innerCode.trim()) return '';
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getEventBank(eventName), Blockly.BBasic.primaryBank());
    // A "Draw title screen" block anywhere in this event's body (see
    // generators/bbasic/titlescreen.js - its gosub target, "_titlescreen_
    // system", is a reliable textual signature to check for here rather than
    // re-walking the workspace) means this loop owns the ENTIRE frame itself
    // via the Titlescreen Kernel's  cycle-exact vsync/vblank/kernel/
    // overscan routine. drawscreen() is bB's separate full-frame
    // routine, so calling both every iteration draws two competing frames
    // per loop, visibly flickering between the regular game screen and the
    // title screen - already skipped below. The second half of commongamelogic ALSO has to be
    // skipped, not just drawscreen (the first half, the project's state tracking, still runs - see
    // generatedTitleKernelSkip): it unconditionally restores
    // COLUP0/1/COLUPF/COLUBK/NUSIZ0/1 and redraws the current background/
    // animations - all prep for the drawscreen() call that no longer
    // happens here, and confirmed as a real visible bug by itself: since
    // it still runs every iteration, its "COLUBK = backgroundrealcolor"
    // briefly writes the REGULAR game's background color before the title
    // kernel's  vsync/vblank even starts, showing as a stray scanline of
    // the wrong color at the very top of the title screen.
    const usesTitleScreenKernel = innerCode.includes('_titlescreen_system');
    // Skipping commongamelogic entirely (see the comment above) also threw
    // out the ONE piece of it this loop still genuinely needs: each animated
    // Title Screen card's per-frame duration-tick/index-write code
    // (generateTitleScreenAnimationChecks, spliced into commongamelogic by
    // bbasic.bb.hbs's template - see generatedTitleScreenAnimationChecks
    // there) - confirmed as a real reported bug, animated title cards never
    // advancing past their first frame. Inlined directly here instead (safe
    // regardless of which bank this event lands in - it's plain variable
    // arithmetic, no labels/gosubs to bank-tag) rather than
    // routed through commongamelogic, so it runs every real iteration of
    // THIS loop without dragging back the drawscreen-prep work (background/
    // player redraws, panel color restores) that caused the original stray-
    // scanline bug this skip exists to avoid.
    const titleScreenAnimationChecks = usesTitleScreenKernel ?
      (Blockly.BBasic.titleScreenAnimationChecks || '') + (Blockly.BBasic.subroutines[TITLE_FADE_CHECKS_NAME] ?
        `gosub ${TITLE_FADE_CHECKS_NAME}${Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(),
            Blockly.BBasic.getSubroutineBank(TITLE_FADE_CHECKS_NAME))}\n` : '') : '';
    // With "End title screen" in the project the loop has two ways to draw: the kernel's, and once
    // that block has run, the regular game screen's, so the rest of the event goes on as gameplay.
    const hasEnd = usesTitleScreenKernel && this.titleEndUsed;
    const kernelLoopTop = [`${TITLE_KERNEL_LOOP_BIT} = 1`, `gosub commongamelogic${suffix}`, titleScreenAnimationChecks];
    return [
      ...(hasEnd ? [
        `if ${titleKernelEndedVar()}{${titleKernelEndedBit()}} then goto _titleupdate_ended`,
        ...kernelLoopTop,
        'goto _titleupdate_body',
        '@_titleupdate_ended',
        `${TITLE_KERNEL_LOOP_BIT} = 0`,
        `gosub commongamelogic${suffix}`,
        'drawscreen',
        '@_titleupdate_body',
      ] : usesTitleScreenKernel ? kernelLoopTop : [`gosub commongamelogic${suffix}`, 'drawscreen']),
      innerCode,
      `goto ${eventName}_begin`,
    ].join('\n');
  });
};

// Reads the stored backgrounds, applying defaults, or null if they can't load.
Blockly.BBasic.getBackgroundsData = function() {
  try {
    return processBackgroundStorageDefaults(useBackgroundsStorage());
  } catch (e) {
    console.error('Failed to load backgrounds', e);
    return null;
  }
};

// Resolves the Score tab's  background color picker (config.scoreBkColor
// - see views/ScoreFontEditor.vue) to an actual color byte for the literal
// case only: a plain number is returned as-is, anything else (there's
// nothing else valid to reach this with once scoreBkColorIsBackground below
// already routes both 'background' AND unset away from this function at
// every real call site) falls back to black (0). Shared between
// generateScoreBkColorDefaults's Setup-time init (Text Minikernel active)
// and generateScoreBkColorAsm's standalone "minikernel" hook (Text
// Minikernel inactive) so both resolve the same picked literal identically.
Blockly.BBasic.resolveScoreBkColorByte = function(configValue) {
  return typeof configValue === 'number' ? configValue : 0;
};

// Whether the Score tab's  background color picker should track the
// live background color (backgroundrealcolor) instead of a fixed literal -
// true for the explicit 'background' sentinel, but ALSO for unset (the
// picker never touched at all) - confirmed with the user: a project that
// never visited the Score tab's color picker should still match whatever
// its actual background is, not silently default to black underneath the
// score row. Shared by every one of generateScoreBkColorAsm/
// generateScoreBkColorRuntimeDims/generateScoreBkColorDefaults (generators/
// bbasic/score.js) and ScoreFontEditor.vue's  swatch display, so the
// compiled ROM and the UI's  preview always agree on which case a given
// project is actually in.
Blockly.BBasic.scoreBkColorIsBackground = function(configValue) {
  return configValue == null || configValue === 'background';
};

// The exact raw dim target (a single letter, or "varN" with Superchip)
// backgroundrealcolor's  SYSTEM_VARIABLES entry resolves to - the same
// computation generateSystemDims itself uses. Exposed so
// generateScoreBkColorRuntimeDims (generators/bbasic/score.js) can alias
// scorebkcolor directly onto that raw target for "Use background color"
// instead of onto the NAME "backgroundrealcolor" - chaining one dim onto
// another dim's  name (rather than a raw register) doesn't reliably
// resolve here (see that function's  comment for the confirmed failure).
Blockly.BBasic.backgroundRealColorRawTarget = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const index = SYSTEM_VARIABLES.findIndex(([name]) => name === 'backgroundrealcolor');
  return superchipOn(config) ? `var${index}` : SYSTEM_VARIABLES[index][1];
};

// Whether generated code should include per-row playfield colors (pfcolors).
// This is an all-or-nothing project setting (the "enablePfColors" option on
// the Options tab): once it's on, the Background editor requires every
// background to have its  row color list, since the compiled kernel
// always draws every background's playfield from the same color table.
//
// Previously forced off while Superchip RAM was enabled, based on an
// earlier diagnosis (see git history around "patchSuperchipPfColorsPointer",
// since removed) that the compiler hardcoded the pfcolors table pointer as
// "pfcolorlabelN-84", wrong for any pfres other than 12. That diagnosis was
// wrong: the compiler's  generated assembly already wraps that pointer
// setup in a real "ifconst pfres ... else ... endif" (confirmed directly by
// inspecting the compiled output before assembling) - the "-84" form only
// ever sits in the untaken else branch once pfres is defined, so DASM
// already resolves to the correct pfres-relative pointer by itself, no
// patch needed. Retested directly (Superchip on, pfres=24, two backgrounds,
// distinct row colors) and the playfield renders every row's  color
// correctly, no black rows, nothing broken - so this is safe to allow.
// Per-row playfield colors under DPC+: a toggle for DPC+, or the standard kernel's toggle (a project made for the
// standard kernel keeps its row colors when the kernel is switched).
// DPC+ only: how many scanlines tall the sprites are (the tallest animation frame, each row drawn two lines
// tall), which the y conversion needs: the standard kernel's y marks a sprite's bottom edge, DPC+'s its top.
Blockly.BBasic.dpcPlusSpriteLines = function(player) {
  const noiseLines = 2 * ((this.dpcPlusNoiseRows || {})[player] || 0);
  try {
    const animations = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage()).animations || [];
    const rows = Math.max(0, ...animations.map((animation) =>
      Math.max(0, ...((animation && animation.frames) || []).map((frame) => frame.pixels.length))));
    return Math.max((rows || 8) * 2, noiseLines);
  } catch (e) {
    return Math.max(16, noiseLines);
  }
};

// The playfield rainbow needs the playfield color rows, so it switches them on by itself.
let dpcPlusBackgroundRainbow = false;
// A Background scroll block moves the playfield colors with the pixels, or by themselves.
// The playfield colors and the background colors (DPC+) scroll separately: a "Background scroll colors" block has a checkbox for
// each (both on unless unchecked), a Background scroll block one for each kind that moves with its pixels (off unless checked).
const scrollsPfColors = (block) => (block.type === 'background_scroll_colors' && block.getFieldValue('PFCOLORS') !== 'FALSE') ||
  (block.type === 'background_scroll' && block.getFieldValue('COLORS') === 'TRUE');
const scrollsBkColors = (block) => (block.type === 'background_scroll_colors' && block.getFieldValue('BKCOLORS') !== 'FALSE') ||
  (block.type === 'background_scroll' && block.getFieldValue('BKCOLORS') === 'TRUE');
const dpcPlusPfColorsOn = (config) => !!(config && config.kernel === 'dpcplus' &&
  (config.enableDpcPlusPfColors || config.enablePfColors || dpcPlusBackgroundRainbow));
Blockly.BBasic.dpcPlusPfColorsOn = dpcPlusPfColorsOn;

Blockly.BBasic.usePlayfieldRowColors = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  // config.enablePfColors is the Standard-kernel-only toggle (Configuration.
  // vue hides it under DPC+, replaced by the separate enableDpcPlusPfColors
  // toggle/DF4FRACINC mechanism - see generateDpcPlusColorConfiguration) -
  // guarded here too in case a project switched kernels with it still set.
  if (config.kernel === 'dpcplus') return false;
  return config.enablePfColors ?? false;
};

// Whether generated code should include per-row SPRITE colors
// (playercolors/player1colors) as a standing project setting (the Options
// tab's "Enable per-row Player 0/1 sprite colors" toggles - one per
// player, since batari Basic allows "player1colors" on its  without
// "playercolors", but not the other way around - see generateConfiguration's
// comment on why enabling playercolors forces player1colors on too),
// independent of whether any sprite_*_rainbow_colors block actually exists
// on the canvas - unlike that block-presence check (rainbowColorUsedFor),
// this is the user explicitly opting in ahead of time, the same way
// enablePfColors is a standing toggle rather than being driven by which
// backgrounds happen to have custom row colors set. Never excluded while
// Superchip RAM is on - per-row sprite colors reads through
// player0color/player1color (aliased onto paddle/missile1y), a completely
// separate pointer from the playfield's  pfcolortable, and testing
// confirms it renders correctly with Superchip on. name is 'player0' or
// 'player1'.
Blockly.BBasic.useSpriteColorsFor = function(name) {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  // The standard kernel's playercolors/player1colors options: not a thing under DPC+ (see useAnimationRowColors).
  if (config.kernel === 'dpcplus') return false;
  if (name !== 'player0' && name !== 'player1') return false;
  return (name === 'player0' ? config.enablePlayer0SpriteColors : config.enablePlayer1SpriteColors) ?? false;
};

// Whether a player's animations carry per-row colors in the build. Every DPC+ sprite draws its colors from a table per row, so
// the colors painted in the Sprites tab apply there as soon as any frame has some (or, for a project made when they were still
// switches on the Options tab, as soon as that one is on); until then the players keep their plain colors.
Blockly.BBasic.useAnimationRowColors = function(name) {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.kernel !== 'dpcplus') return this.useSpriteColorsFor(name);
  if (config.enablePlayer0SpriteColors || config.enablePlayer1SpriteColors) return true;
  const animations = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage()).animations || [];
  return animations.some((animation) => (animation.frames || []).some((frame) =>
    (frame.rowColors || []).some((color) => color != null && color !== DEFAULT_ROW_COLOR)));
};

// Whether a real, populated pfcolortable (one "pfcolors:" block per
// background, built by generateBackgrounds) needs to exist in ROM - either
// because the user's "playfield row colors" toggle is on, or because
// player0 rainbow colors is in use (a rainbow-colors block on the canvas, OR
// the standing "enable per-row sprite colors" toggle). Per bB's
// kernel_options combination table (pulled from the strings embedded in
// public/bb19/2600basic.wasm), "playercolors" is never valid paired with
// just "player1colors" alone - it always needs a real "pfcolors" (or
// "pfheights") companion too. "pfheights" turned out to need its
// undocumented, never-populated pfheighttable (reads (pfheighttable),y in
// std_kernel.asm with nothing in this codebase ever writing to it -
// confirmed by testing, produced a rolling/garbled screen), so pfcolors -
// which this codebase already builds correctly - is the companion actually
// used. This deliberately bypasses usePlayfieldRowColors'
// config.enablePfColors gate: player0 rainbow colors must be able to pull
// in a real color table even if the user never turned that separate
// feature on themselves.
Blockly.BBasic.needsPlayfieldColorTable = function() {
  return this.usePlayfieldRowColors() || rainbowColorNeedsPlayerColors(this.rainbowColorUsedFor) ||
    this.useSpriteColorsFor('player0');
};

// Whether "no_blank_lines" can actually go on the kernel_options line.
// Per the same combination table referenced above, "playercolors" never
// appears alongside "no_blank_lines" in ANY valid row - the combination is
// simply unsupported by the kernel, confirmed by a real "Invalid
// combination of options" build failure when both were emitted together.
// So the user's "show blank lines" toggle is overridden back on
// whenever player0 rainbow colors is active. Shared between
// generateConfiguration (the kernel_options line itself) and
// generateBackgrounds (whose pfcolors: row-color tables are built with one
// fewer/extra entry depending on which mode is active - see buildPfcolors'
// comment) so the two stay in agreement.
Blockly.BBasic.effectiveShowBlankLines = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const requested = config.showBlankLines ?? true;
  if (requested) return true;
  return rainbowColorNeedsPlayerColors(this.rainbowColorUsedFor) || this.useSpriteColorsFor('player0');
};

// Spliced into bbasic.bb.hbs's main loop right after the user's  generated
// code (not into commongamelogic, which runs before that code each frame -
// putting it there would let a Sound block triggered later the same frame
// re-enable audio, since AUDV0/AUDV1 are read by the TIA continuously rather
// than only at drawscreen). Placed here, after every block for the frame has
// had its say, this is genuinely the last word each frame, silencing both
// channels outright regardless of what a Sound block set them to.
// A sound block's or Music tab track's channel as it is played. The chip's channels (2 and 3, with 0) exist only while the
// chip plays the sounds (see dpcplus-audio.js); a channel number left over from a project made under another kernel (or
// with the chip turned off) is channel 0.
Blockly.BBasic.normalizeChannel = function(value) {
  const channel = Number(value) || 0;
  if (channel === 1) return '1';
  if (channel >= 2 && this.dpcAudioPlan && this.dpcAudioPlan.isChannel(channel)) return `${channel}`;
  return '0';
};

Blockly.BBasic.generateMuteAudio = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (!config.muteAllAudio) return '';
  return ' AUDV0 = 0\n AUDV1 = 0';
};

// Spliced into bbasic.bb.hbs's commongamelogic, right before its own
// "return" - every real drawscreen call site in this codebase (the main
// loop template, generateEventBody's own per-event bodies, "every N
// frames"' own drawscreen) is always immediately preceded by
// "gosub commongamelogic", so this runs right before every one of them
// without needing to touch each call site individually. It sets the
// row heights (DFxFRACINC) the kernel draws the playfield and its color tables with. (The color fetchers are not
// given a throwaway "priming read" first: measured on the emulator, that read moves the row colors up two
// lines, so they no longer line up with the playfield pixels they belong to.)
// What the code that works with the playfield rows divides a y position by, and the last row, as text for bB: a variable holding the
// geometry of the background showing when the backgrounds do not all have the same (see init), else the number.
// With lines set (under DPC+, for what counts its y in lines: the missiles and the ball), the number of lines in a row instead.
Blockly.BBasic.rowDivisorText = function(config, lines) {
  if (lines && config.kernel === 'dpcplus') {
    return this.dpcPlusRowLinesVar || String(Math.max(1, Math.round(dpcPlusRowLinesFor(config))));
  }
  return this.dpcPlusRowDivVar || String(Math.max(1, Math.round(pfRowDivisorFor(config))));
};
Blockly.BBasic.maxRowText = function(config) {
  return this.dpcPlusRowMaxVar || String(effectiveBackgroundRows(config) - 1);
};

// DFxFRACINC for rows this many lines tall.
const dpcPlusRowFracOf = (lines) => Math.min(255, Math.round(256 / lines));

Blockly.BBasic.generateDpcPlusColorPriming = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.kernel !== 'dpcplus') return '';
  // Row height: 256/N scanlines-per-row increment for the 4 playfield
  // column fetchers, set every frame (startup zeroes them, and the kernel
  // needs them set before drawscreen). Without per-row colors the color
  // fetchers get FRACINC 0 plus a one-entry solid table so every row reads
  // the same default color, matching the standard kernel's default look.
  const scrolling = Blockly.BBasic.dpcPlusScroll;
  const scanlines = scrolling ? scrolling.fine : dpcPlusRowLinesFor(config);
  const fracInc = dpcPlusRowFracOf(scanlines);
  // Under a scroll the rows the kernel draws are the scroll's thin ones, the same for every background.
  const fracVar = scrolling ? null : Blockly.BBasic.dpcPlusRowFracVar;
  if (fracVar) {
    // The row height of the background showing (set as it loads); the color tables go at twice the rate, up to the most a byte holds.
    const rates = [' temp1 = ' + fracVar + ' + ' + fracVar, ' if ' + fracVar + ' > 127 then temp1 = 255'];
    return [...rates, ...[0, 1, 2, 3].map((n) => ` DF${n}FRACINC = ${fracVar}`),
      dpcPlusPfColorsOn(config) ? ' DF4FRACINC = temp1' : ' DF4FRACINC = 0',
      config.enableDpcPlusBkColors ? ' DF6FRACINC = temp1' : ' DF6FRACINC = 0'].join('\n') + '\n';
  }
  // The color tables are read at half the rate the playfield rows are (one entry per two FRACINC steps, the
  // batari Basic DPC+ examples set 255 for colors where the playfield has 128), so their increment is doubled.
  const colorFracInc = Math.min(255, fracInc * 2);
  const out = [0, 1, 2, 3].map((n) => ` DF${n}FRACINC = ${fracInc}`);
  out.push(dpcPlusPfColorsOn(config) ? ` DF4FRACINC = ${colorFracInc}` : ' DF4FRACINC = 0');
  out.push(config.enableDpcPlusBkColors ? ` DF6FRACINC = ${colorFracInc}` : ' DF6FRACINC = 0');
  return out.join('\n') + '\n';
};

// DPC+ only: the missiles and the ball are invisible until they have a height (their variables start at 0), and
// the kernel colors each missile from a variable, COLUM0/COLUM1, instead of the player's color. They start
// at the height a standard-kernel missile has and the colors the two players start with.
Blockly.BBasic.generateDpcPlusSpriteDefaults = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.kernel !== 'dpcplus') return '';
  // Players 2 to 9 start spread across the screen, each a little lower and further right than the one before.
  const extraStarts = (this.dpcPlusExtraPlayers || []).map((n) =>
    ` player${n}x = ${40 + 12 * (n - 2)} : player${n}y = ${30 + 14 * (n - 2)}`);
  return [
    ' missile0height = 2 : missile1height = 2 : ballheight = 2',
    ` COLUM0 = ${colorByteToBuildBBasic(0x40)} : COLUM1 = ${colorByteToBuildBBasic(0x80)}`,
    // Frame 255 hides a player (see the hidden handler in generateAnimations).
    ...(this.dpcPlusHidePlayer1 ? [' player1frame = 255'] : []),
    // Until a background loads, the project's pfres.
    ...[[this.dpcPlusRowFracVar, dpcPlusRowFracOf(dpcPlusRowLinesFor(config))],
      [this.dpcPlusRowDivVar, Math.max(1, Math.round(dpcPlusRowLinesFor(config) / 2))],
      [this.dpcPlusRowLinesVar, Math.max(1, Math.round(dpcPlusRowLinesFor(config)))],
      [this.dpcPlusRowMaxVar, Math.max(1, dpcPlusPfresOf(config) - 1) - 1],
      [this.dpcPlusScrollRowsVar, this.dpcPlusScroll ? dpcPlusScrollTravel(this.dpcPlusScroll) : 0]]
        .filter(([name]) => name).map(([name, value]) => ` ${name} = ${value}`),
    ...extraStarts,
  ].join('\n') + '\n';
};

// DPC+ only: which queues a pfscroll moves, as the text after its amount. The playfield columns are queues 0 to 3,
// the playfield colors queue 4 and the background colors queue 6 (scrolling 0 to 6 would also take the unused 5).
// Colors only move when the scroll asks for them, and only the color tables in use.
Blockly.BBasic.dpcPlusScrollQueues = function(config, pfColorsMove, bkColorsMove, colorsOnly) {
  const pfColors = !!pfColorsMove && dpcPlusPfColorsOn(config);
  const bkColors = !!bkColorsMove && !!config.enableDpcPlusBkColors;
  if (colorsOnly) return [...(pfColors ? [' 4 4'] : []), ...(bkColors ? [' 6 6'] : [])];
  if (pfColors && bkColors) return [' 0 6'];
  if (pfColors) return [' 0 4'];
  if (bkColors) return [' 0 3', ' 6 6'];
  return [' 0 3'];
};

// DPC+ only: the one-entry solid color tables used while per-row colors are off, and the score colors. These
// are data statements the kernel keeps pointing at, so they run once at startup like in the batari Basic
// DPC+ examples; running them every frame spent so many 6502 cycles that the frames came out the wrong length.
Blockly.BBasic.generateDpcPlusColorTables = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.kernel !== 'dpcplus') return '';
  const out = [];
  if (!dpcPlusPfColorsOn(config)) out.push(` pfcolors:\n  ${colorByteToBuildBBasic(0x0E)}\nend`);
  if (!config.enableDpcPlusBkColors) out.push(` bkcolors:\n  ${colorByteToBuildBBasic(0xC4)}\nend`);
  out.push(` scorecolors:\n${Array(8).fill('  ' + colorByteToBuildBBasic(0x08)).join('\n')}\nend`);
  return out.join('\n') + '\n';
};

// DPC+ only: the real DPC+ header/score-table/startup/kernel driver (all
// pulled in unconditionally by DPCplus.inc BEFORE this project's own
// generated code even starts - see UPSTREAM_CHANGES.md) already consumes
// nearly all of bank 1 on its own - confirmed against the real bB docs
// (randomterrain.com's batari Basic Commands page, DPC+ Kernel section):
// "The DPC+ kernel goes in bank 1, so there's very little free room there
// ... There are less than 100 bytes free to use in bank 1 ... about the
// only code you should have in bank 1 is a goto that jumps to bank 2."
// Every OTHER kernel this app supports treats bank 1 as a normal, roomy
// bank (see RELOCATABLE_EVENT_NAMES/generateRelocatedSections - only
// individual events/graphics/etc. get relocated out of it, never the bulk
// commongamelogic/main-loop/data-table body this template always emits),
// which is exactly backwards for DPC+ - so this unconditionally pushes that
// ENTIRE rest of the template into bank 2 instead, the same
// "goto label bank2 / bank 2 / temp1=temp1 / label" shape the real docs'
// own DPC+ template uses (temp1=temp1 works around a real Harmony cart
// bankswitch-detection bug the docs call out by name). hooks/rom.js's own
// relocation target range is shifted to start at bank 3 instead of 2 to
// match (see its own bankSizeKeyFor-gated minRelocationBank), since bank 2
// is now permanently spoken for by this, not part of the shared pool
// individual events/graphics compete for.
Blockly.BBasic.generateDpcPlusBankPreamble = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.kernel !== 'dpcplus') return '';
  return ' goto __dpcplus_mainbody_entry bank2\n\n' +
    this.generateDpcPlusScoreBkColorAsm(config) + '\n' +
    // The compiler calls the multiply and divide routine in bank 1, whichever bank the call is in.
    (this.usesDivMul ? ' inline div_mul.asm\n\n' : '') +
    ' bank 2\n' +
    ' temp1=temp1\n\n' +
    '__dpcplus_mainbody_entry\n' +
    // The variables and the coprocessor's display memory power up with random contents (the standard
    // kernel's startup clears them, DPC+ does not), so every batari Basic DPC+ program clears them first.
    ' a = 0 : b = 0 : c = 0 : d = 0 : e = 0 : f = 0 : g = 0 : h = 0 : i = 0\n' +
    ' j = 0 : k = 0 : l = 0 : m = 0 : n = 0 : o = 0 : p = 0 : q = 0 : r = 0\n' +
    ' s = 0 : t = 0 : u = 0 : v = 0 : w = 0 : x = 0 : y = 0 : z = 0\n' +
    ' var0 = 0 : var1 = 0 : var2 = 0 : var3 = 0 : var4 = 0\n' +
    ' var5 = 0 : var6 = 0 : var7 = 0 : var8 = 0\n' +
    // The variables that went in the display memory start at 0 too (see displayRamVars in init()).
    this.generateDisplayRamVarClears() +
    // The Score tab's 5 digits option: the leftmost digit reads these 8 bytes of display memory, which have to hold zeros (see
    // SCOREBLANK in DPCplus_kernel.asm; an immediate load of 0 would read a data fetcher in the kernel).
    (scoreDigitsOf(config) === 5 ? [' asm', ' lda #<(scoredata+80)', ' sta DF0LOW', ' lda #(>(scoredata+80)) & $0F', ' sta DF0HI',
      ' ldx #0', ...Array(8).fill(' stx DF0WRITE'), 'end'].join('\n') + '\n' : '');
};

// DPC+ only: the kernel calls a routine named "minikernel" while it draws the score row, and the routine sets the
// background color for that row. It has to sit in bank 1 with the kernel (a call can not reach another bank), and
// must not wait for a scanline or the score row comes out the wrong height.
Blockly.BBasic.generateDpcPlusScoreBkColorAsm = function(config) {
  const source = this.usesScoreBkColorSetter ? 'scorebkcolor' :
    this.scoreBkColorIsBackground(config.scoreBkColor) ? 'backgroundrealcolor' : null;
  const load = source ? `       ldx ${source}` :
    `       ldx #${colorByteToBuildBBasic(this.resolveScoreBkColorByte(config.scoreBkColor))}`;
  return ['', ' asm', 'minikernel', load, '       stx COLUBK', '       rts', 'end'].join('\n') + '\n';
};

// Every batari Basic DPC+ program draws one screen before the data statements of its main loop (playfield:,
// player0:, ...): they hand data to the coprocessor, which the first drawscreen sets up. Without it the
// frames come out different lengths and the picture flashes.
Blockly.BBasic.generateDpcPlusInitialDrawscreen = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  return config.kernel === 'dpcplus' ? ' drawscreen\n pfclear\n' : '';
};

// Per-frame decrement for channnel0duration/channnel1duration (see
// SYSTEM_VARIABLES' comment and this.channelDurationUsed's  pre-scan
// in init()) - a no-op unless a "Play sound" block or music is actually
// present anywhere in the project, same "spliced in via a JS-generated
// function that returns '' when unneeded" shape every OTHER per-frame check
// around it in bbasic.bb.hbs already uses (generatedEnvelopeChecks,
// generatedMusicChecks, generatedDistanceChecks, etc.) - these 4 lines used
// to be the one exception, hardcoded directly into the template and running
// unconditionally on every single project regardless of whether either
// variable was ever actually written to.
// Hand-written 6502 instead of the 4-line bB if/then version this used to
// be - same commongamelogic-splice context (not a subroutine) as
// generateEnvelopeChecks/buildFadeCheckAsm, so plain column-0 labels/
// indented mnemonics, no "@" trick needed. Each channel only needs a single
// zero-check up front (channel==1 implies channel<>0, so the original's two
// independent bB "if"s always agreed on whether to run at all), and the
// decrement itself is one DEC on the zero-page dim var instead of bB's
// load/subtract/store expression evaluation.
Blockly.BBasic.generateChannelDurationChecks = function() {
  if (!this.channelDurationUsed) return '';
  const lines = [' asm'];
  ['0', '1', '2', '3'].forEach((channel) => {
    if (!this.channelDurationChannels.has(channel)) return;
    const duration = this.nameDB_.getName(`channnel${channel}duration`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    lines.push(
        '       lda ' + duration,
        `       beq _channeldurationasm${channel}_skip`,
        '       cmp #1',
        `       bne _channeldurationasm${channel}_mute_skip`,
        '       lda #0',
        `       sta AUDV${channel}`,
        `_channeldurationasm${channel}_mute_skip`,
        '       dec ' + duration,
        `_channeldurationasm${channel}_skip`,
    );
  });
  lines.push('end');
  return lines.join('\n');
};

// ROM sizes the standard kernel actually bankswitches (see
// BANK_COUNT_BY_ROMSIZE in hooks/rom.js - duplicated here in miniature
// rather than imported, since rom.js already imports from this file and
// importing back would be circular).
const BANKSWITCHED_ROM_SIZES = ['8k', '16k', '32k', '64k'];

// Same duplication reasoning as BANKSWITCHED_ROM_SIZES above, with the
// actual bank counts this time (see BANK_COUNT_BY_ROMSIZE in hooks/rom.js) -
// generateRelocatedSections needs these to always declare every bank the
// chosen ROM size promises, not just the ones something actually got
// relocated into (see its comment for why).
// 'dpcplus' key: see BANK_COUNT_BY_ROMSIZE's comment in hooks/rom.js -
// DPC+ fixes exactly 6 addressable banks (1-6). The other two 4K regions of
// the 32KB ROM (confirmed directly against the real batari Basic docs:
// randomterrain.com's DPC+ Kernel section, "4K bB system, 20K of your
// basic code, 4K graphics data, and 4K ARM code = 32K binary" - and against
// gopher2600's DPC+ mapper source, hardware/memory/cartridge/dpcplus/
// dpcplus.go's driverSize=3072/dataSize=4096/freqSize=1024 fixed-region
// constants: 3072+4096+1024=8192 bytes reserved, leaving exactly
// 32768-8192=24576=6*4096 for addressable banks) are the graphics bank and a
// SEPARATE ARM-driver bank - two distinct 4K regions, not one combined 4K
// region as an earlier (incorrect) revision of this constant assumed.
// Treating bank 7 as real and addressable overflowed DASM's bank
// layout (7*4096 + 8192 = 36864 > 32768), corrupting whatever landed at the
// boundary - confirmed directly: the compiled ROM's 6507 program hit a
// genuine CPU JAM (illegal-opcode hardware halt) a few hundred bytes into
// what should have been bank 1's tiny "goto bank2" stub.
const BANK_COUNT_BY_ROMSIZE_MINI = {'8k': 2, '16k': 4, '32k': 8, '64k': 16, 'dpcplus': 6};

// Whether to inline calls to the random number generator ("set optimization
// inlinerand") instead of calling a shared routine. The docs describe this
// as "particularly useful for bankswitched games" (a shared rand routine
// would otherwise need a bank-switching call every time), so the Options
// tab only allows enabling it when the project's ROM size actually
// bankswitches - see Configuration.vue.
Blockly.BBasic.useInlineRand = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (!BANKSWITCHED_ROM_SIZES.includes(config.romSize)) return false;
  return config.enableInlineRand ?? false;
};

// Spliced into bbasic.bb.hbs as its "rem"-commented block, right above
// the "Options" block (see generateConfiguration just below) - these are
// pure documentation, read by a human looking at the generated source,
// never by the compiler itself. Unlike every other "****/label/****"
// section header in this template (Options, Setup, etc, where the closing
// "****" line sits right under the label, with the section's  real code
// following after), this block has no label line (redundant -
// "Title:"/"Developer:"/etc already say what it is) and its closing "****"
// divider is the LAST line of the whole thing (see bbasic.bb.hbs itself) -
// there's no real code to put after it, only more of this same comment.
// Lives on the same configuration bag every other Project tab field does
// (see Project.vue's  useConfigField) - only a field the user actually
// filled in gets its  line, so an unused project (nothing set on the
// Project tab at all) doesn't leave a block of empty "rem :" noise up top.
// Project Description is free-typed, multi-line text - split one "rem" line
// per source line rather than one long line, both because a comment can't
// itself contain a real newline and because DASM has no line-length limit
// on a "rem" the way it does on a "data" statement, but a very long single
// line would still be awkward to actually read here. Every line (not just
// Description's) is also word-wrapped to the divider's  width (see
// wrapProjectInfoLine below) - a long Title/Website/etc wouldn't otherwise
// be capped at all.
// Matches the "****...****" divider's  length (see bbasic.bb.hbs) - a
// line this block emits is never allowed to run longer than the box drawn
// around it. " rem " (leading space + "rem" + trailing space) is the fixed
// prefix every line in this block already carries, so that's subtracted
// once here rather than at every call site below.
const PROJECT_INFO_LINE_WIDTH = 79;
const PROJECT_INFO_PREFIX = ' rem ';
const PROJECT_INFO_TEXT_WIDTH = PROJECT_INFO_LINE_WIDTH - PROJECT_INFO_PREFIX.length;

/**
 * Greedily word-wraps text to PROJECT_INFO_TEXT_WIDTH-character lines - a
 * single word longer than that on its  is hard-broken instead (e.g. a
 * long unbroken URL), rather than left to overflow the divider width.
 * @param {string} text
 * @return {!Array<string>}
 */
function wrapProjectInfoLine(text) {
  const wrapped = [];
  let current = '';
  String(text).split(/\s+/).filter(Boolean).forEach((rawWord) => {
    let word = rawWord;
    while (word.length > PROJECT_INFO_TEXT_WIDTH) {
      const spaceLeft = PROJECT_INFO_TEXT_WIDTH - current.length - (current ? 1 : 0);
      if (spaceLeft > 0) {
        current = current ? `${current} ${word.slice(0, spaceLeft)}` : word.slice(0, spaceLeft);
        word = word.slice(spaceLeft);
      }
      wrapped.push(current);
      current = '';
    }
    const next = current ? `${current} ${word}` : word;
    if (next.length > PROJECT_INFO_TEXT_WIDTH) {
      wrapped.push(current);
      current = word;
    } else {
      current = next;
    }
  });
  if (current) wrapped.push(current);
  return wrapped.length ? wrapped : [''];
}

Blockly.BBasic.generateProjectInfo = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const lines = [];
  [
    ['Title', config.projectTitle],
    ['Developer', config.projectDeveloper],
    ['Version', config.projectVersion],
    ['Website', config.projectWebsite],
    ['Email', config.projectEmail],
  ].forEach(([label, value]) => {
    if (!value) return;
    wrapProjectInfoLine(`${label}: ${value}`).forEach((line) => lines.push(`${PROJECT_INFO_PREFIX}${line}`));
  });
  if (config.projectDescription) {
    lines.push(' rem');
    lines.push(`${PROJECT_INFO_PREFIX}Description:`);
    // The user's  paragraph breaks (real newlines they typed) are kept
    // as-is - only each RESULTING line gets word-wrapped, so a short line
    // they typed doesn't get glued onto the next one.
    String(config.projectDescription).split('\n').forEach((rawLine) => {
      wrapProjectInfoLine(rawLine).forEach((line) => lines.push(`${PROJECT_INFO_PREFIX}${line}`));
    });
  }
  // App credit - always present regardless of which (if any) fields above
  // were actually filled in, unlike every other line in this block. A
  // deliberate line break before "Create your..." (not left to
  // word-wrap's  judgment) - two separate sentences, so they always
  // start on their  line regardless of exactly where either one happens
  // to wrap.
  lines.push(' rem');
  lines.push(`${PROJECT_INFO_PREFIX}${'*'.repeat(PROJECT_INFO_TEXT_WIDTH)}`);
  wrapProjectInfoLine('Created with VCS Game Maker.').forEach((line) => lines.push(`${PROJECT_INFO_PREFIX}${line}`));
  wrapProjectInfoLine('Create your Atari VCS games: https://haroldo-ok.itch.io/vcs-game-maker')
      .forEach((line) => lines.push(`${PROJECT_INFO_PREFIX}${line}`));
  return lines.join('\n');
};

Blockly.BBasic.generateConfiguration = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};

  const {showScore, enableSuperchip, pfres, enablePfRowHeight, pfrowheight} = config;
  // "Show remaining CPU cycles as the score" (config.enableCycleScore, bB's
  // "set debug cyclescore") always forces the stock/Default font,
  // regardless of the Score tab's  selection - same reasoning as hooks/
  // rom.js's  identical effectiveScoreFont (which controls the ACTUAL
  // score_graphics.asm digit bytes) - this one covers the SOURCE-level
  // consts below it (fontstyle/fontcharsHEX), which independently control
  // the score row's  physical height (Squish's "fontstyle = SQUISH" const
  // shrinks it in the standard kernel) - left pointed at Squish while hooks/
  // rom.js swaps in the Default, full-height digit graphics would shrink the
  // row out from under graphics no longer sized to match it. "Show NTSC
  // scanlines used as the score" (enableScanlinesDebug) forces the same
  // thing, for the same reason - it also just pokes plain decimal digits
  // straight into the score, not a real batari Basic value that would
  // automatically adapt to a shorter Squish digit height.
  // DPC+ always draws its score with the stock digits (see where the score font override is built in hooks/rom.js).
  const scoreFont = (config.enableCycleScore || config.enableScanlinesDebug) ? null : config.scoreFont;

  // batari Basic honours a single "set kernel_options" line, so every option
  // has to go on it together.
  // batari Basic's  kernel_options combination table (pulled from the
  // strings embedded in public/bb19/2600basic.wasm) lists valid
  // combinations in a fixed order, e.g. "playercolors player1colors
  // pfcolors" - never "pfcolors playercolors player1colors". Emitting the
  // right SET of options in the wrong order still produced a real "Invalid
  // combination of options" failure (confirmed by testing), so these are
  // pushed in the documented order: playercolors, then player1colors, then
  // pfcolors/no_blank_lines.
  const kernelOptions = [];
  // Rainbow colors block - see ROM_NOISE_COLOR_REGISTERS' comment in
  // generators/bbasic/sprites.js, and rainbowColorNeedsPlayerColors'
  // comment there for the real, confirmed language rule this follows: a
  // real working example program (using "set kernel_options player1colors"
  // for a player1-only multicolor sprite) proves this DOES belong on the
  // shared kernel_options line alongside pfcolors/no_blank_lines.
  //
  // "playercolors" is never valid on its  with just "player1colors" -
  // every valid combination that includes "playercolors" also includes
  // "pfcolors" and/or "pfheights". "pfheights" needs its  undocumented,
  // never-populated pfheighttable (see needsPlayfieldColorTable's
  // comment) and produced a rolling/garbled screen when tried, so pfcolors -
  // forced on via needsPlayfieldColorTable, which this codebase already
  // knows how to build a real, populated table for - is the companion
  // actually used; pfheights is intentionally never emitted. "playercolors"
  // also never appears alongside "no_blank_lines" in any valid combination
  // row, so effectiveShowBlankLines forces blank lines back on (and
  // Configuration.vue disables the toggle outright) whenever player0
  // rainbow colors is active.
  //
  // The standing "enable per-row Player 0/1 sprite colors" toggles
  // (useSpriteColorsFor) force their  option on the same way a matching
  // rainbow-colors block would, even with no such block on the canvas - the
  // same "opt in ahead of time" relationship enablePfColors already has with
  // backgrounds'  row colors (see useSpriteColorsFor's  comment).
  // "playercolors" is never valid without "player1colors" alongside it (bB's
  // kernel_options combination table has no row with playercolors alone -
  // confirmed by rainbowColorNeedsPlayer1Colors'  unconditional
  // "any rainbow color usage at all" check above), so needsPlayerColors being
  // true forces player1colors on too, below - Configuration.vue's  watch
  // keeps the Player 1 toggle itself in sync with this same rule (forced on
  // and disabled) whenever the Player 0 one is on, but this check exists
  // independently in case the two ever desync (e.g. an old saved project).
  // None of playercolors/player1colors/pfcolors/no_blank_lines/
  // ball_blank_lines are confirmed valid under DPC+ (its own kernel_
  // options validation table is separate from the standard kernel's, and
  // "set kernel DPC+" already fixes DPC+'s bankswitch scheme on its own -
  // see generateRomSize) - skip the whole kernel_options line for a DPC+
  // build rather than risk emitting an invalid combination. Per-row
  // playfield/background colors get their own DPC+-specific handling (see
  // generateDpcPlusColorConfiguration) instead of reusing this line.
  let kernelOptionsConfigurationCode = '';
  if (config.kernel !== 'dpcplus') {
    const needsPlayerColors = rainbowColorNeedsPlayerColors(this.rainbowColorUsedFor) || this.useSpriteColorsFor('player0');
    if (needsPlayerColors) kernelOptions.push('playercolors');
    if (needsPlayerColors || rainbowColorNeedsPlayer1Colors(this.rainbowColorUsedFor) || this.useSpriteColorsFor('player1')) {
      kernelOptions.push('player1colors');
    }
    const usePfColorsOption = this.needsPlayfieldColorTable();
    if (usePfColorsOption) kernelOptions.push('pfcolors');
    if (!this.effectiveShowBlankLines()) {
      kernelOptions.push('no_blank_lines');
    }
    kernelOptionsConfigurationCode = kernelOptions.length ?
      `set kernel_options ${kernelOptions.join(' ')}` : '';
  }
  // "noscore" is a compile-time ifconst gate in the standard kernel - it
  // decides whether the score-digit-drawing assembly is even assembled into
  // the ROM at all, nothing runtime can override it after the fact. The Text
  // Minikernel (public/bb19/text-minikernel/text12a.asm) sets "noscore = 1"
  // itself and draws its own score digits ahead of its text row, so with it in
  // use "noscore" can't hide the score: "noscoretxt" is the constant that
  // does. It removes only the digits (and the space they take); the text row
  // still renders. Without the Text Minikernel it is plain "noscore".
  // The DPC+ text row is called from inside the score code, so with text the score is always assembled (a
  // project that hides it just draws it in a color nobody sees).
  const dpcPlusHiddenTextScore = !(showScore ?? true) && this.isTextMinikernelActive() && config.kernel === 'dpcplus';
  const scoreConfigurationCode = (showScore ?? true) ? '' : dpcPlusHiddenTextScore ? 'const dpchidescore = 1' :
    `const ${this.isTextMinikernelActive() ? 'noscoretxt' : 'noscore'} = 1`;
  // "scorefade" - a standard-kernel-only compile-time gate that adds shading
  // to the score digits based on the live scorecolor value (see the Score
  // category's  color get/set/change blocks on the Actions tab, which
  // already exist and need no changes here - this just turns on the kernel
  // code that actually reads scorecolor for shading purposes). Not paired
  // with an ifconst check against the Text Minikernel the way "noscore"
  // above is - text12a.asm/text12b.asm's  score row drawing doesn't read
  // this const at all, so it has no effect (and no conflict) while the Text
  // Minikernel is active.
  const scoreFadeConfigurationCode = config.enableScoreFade ? 'const scorefade = 1' : '';
  // "scorepaddinglines" (the Score tab's "Add score padding" dropdown,
  // config.scorePaddingLines, 0/1/2) - text12a.asm's "if
  // scorepaddinglines >= N" checks (right after the score digit loop) read
  // this directly. Emitted unconditionally (defaulting to 0) since that
  // file's  compile-time "if" expression needs the symbol to exist at
  // all, unlike an ifconst check - text12a.asm has its "ifnconst
  // scorepaddinglines" fallback too, but emitting it explicitly here keeps
  // the actual configured value visible in the generated source.
  const scorePaddingConfigurationCode = `const scorepaddinglines = ${config.scorePaddingLines || 0}` +
    // The Score tab's 5 digits option: the standard and DPC+ kernels leave the leftmost digit of the score blank.
    (scoreDigitsOf(config) === 5 ? '\n const score5digits = 1' : '');
  // The bundled compiler ignores this and gets its digits swapped in directly
  // instead, but it keeps the generated source correct for real batari Basic.
  // Custom digits live in the compiler's include, so there is no directive that
  // would carry them into an exported source file. An earlier version of this
  // emitted "const font = hex" for Custom specifically, to activate
  // score_graphics.asm's "if font == hex: ORG . - 48" shift instead of
  // buildScoreFontOverride adding its  separate copy of it - reverted
  // after that turned out to actually break real, working projects once
  // extra glyphs were on (Squish Custom's  independent extra-glyph
  // mechanism kept working the whole time on the exact same project/content,
  // isolating the problem to specifically this "const font = hex" path -
  // see buildScoreFontOverride's  comment in utils/score-font.js, which
  // now has its  self-contained shift again instead).
  const scoreFontsCode = this.scoreFontsEnabled ? 'const scorefonts = 1' : '';
  const scoreFontConfigurationCode = (!scoreFont || scoreFont === SQUISH_SCORE_FONT || scoreFont === SQUISH_CUSTOM_SCORE_FONT) ? '' :
    scoreFont === CUSTOM_SCORE_FONT ?
      '' :
      `const font = ${scoreFont}`;
  // Squish (and Squish Custom, which starts from Squish's  digits and is
  // then editable - see utils/score-font.js) are special score font options
  // baked into the Text Minikernel's extended score_graphics.asm (swapped in
  // whenever either is selected, or the Text Minikernel is active - see
  // hooks/rom.js) rather than a byte-swappable preset like the others -
  // selecting either is what shrinks the score row, independent of whether
  // the Text Minikernel itself is in use.
  // (Not under DPC+: its score table is a plain one, without the extended file's SQUISH constant.)
  const textFontConfigurationCode = config.kernel !== 'dpcplus' && (scoreFont === SQUISH_SCORE_FONT || scoreFont === SQUISH_CUSTOM_SCORE_FONT) ?
    'const fontstyle = SQUISH' : '';
  // Activates the extended score_graphics.asm's "ifconst fontcharsHEX"
  // gate (see score_graphics_extended.asm - every font style there, not
  // just Squish, has one) - only for Squish CUSTOM, not plain Squish: only
  // Squish Custom's  override (buildSquishScoreFontOverride in
  // utils/score-font.js) actually splices anything meaningful into that
  // gated block; plain Squish's  bundled digits leave it at its
  // built-in stock A-F hex glyphs, which nothing in this app currently
  // exposes a reason to turn on for a font the user isn't otherwise
  // editing. The PLAIN (non-Squish) Custom path needs no equivalent const
  // at all - its  drawing routine has no such gate to begin with (see
  // buildScoreFontOverride's  comment). Same "only when actually used"
  // gating as scoreFontConfigurationCode's "const font = hex" above,
  // via the same customScoreFontUsesExtraGlyphs check - a Squish Custom
  // project that never touches glyphs 10-15 shouldn't pay this either.
  const scoreFontExtraGlyphsConfigurationCode = (scoreFont === SQUISH_CUSTOM_SCORE_FONT || scoreFont === SQUISH_SCORE_FONT) &&
    customScoreFontUsesExtraGlyphs(scoreFont) ? 'const fontcharsHEX = 1' : '';
  // Two different, INDEPENDENTLY settable colors inside text12a.asm/
  // text12b.asm's "minikernel" subroutine:
  // - "scorebkcolor" (from the Score tab's  background color picker -
  //   see views/ScoreFontEditor.vue, config.scoreBkColor): the very first
  //   thing the subroutine does after WSYNC, if this is defined AND
  //   noscoretxt isn't, is set COLUBK to it for the score row itself, for
  //   as long as that row's  drawing loop runs. NOT emitted here as a
  //   const any more - text12a.asm has been patched (see its  inline
  //   comment) to read scorebkcolor as a real RAM address instead of a
  //   compile-time immediate, so it needs an actual dim, handled by
  //   generateScoreBkColorRuntimeDims/generateScoreBkColorDefaults in
  //   generators/bbasic/score.js instead (spliced into generatedSystemDims/
  //   generatedTextMinikernelDefaults - see finish() below). That's what
  //   lets "Use background color" (config.scoreBkColor === 'background')
  //   alias scorebkcolor directly onto the live backgroundrealcolor
  //   variable, tracking later runtime changes - something a const,
  //   having no runtime existence at all, never could.
  // - "textbkcolor" (from the Text tab's  background color picker - see
  //   views/TextEditor.vue, config.textBkColor): read unconditionally
  //   (defaults to 0/black via its  ifnconst fallback if never set)
  //   right after that loop finishes, setting COLUBK for whatever comes
  //   right after the row - the text minikernel's  message lines
  //   specifically render there. Still a plain compile-time const - only
  //   scorebkcolor needed the RAM treatment, since only the Score tab
  //   offers a "Use background color" option (black is what the Text
  //   Minikernel's  reference layout uses instead).
  // Deliberately two separate values, not one shared setting - a project
  // showing both a numeric score AND the Minikernel's  text message can
  // give each its  distinct background. Both only apply while the Text
  // Minikernel is active - with it inactive, the Score tab's picker instead
  // drives generateScoreBkColorAsm's  standalone "minikernel" hook (see
  // generators/bbasic/score.js), and there's no text row for the Text
  // tab's picker to apply to at all.
  //
  // Both default to black (byte 0) - the darkest palette entry - rather
  // than to no override at all, so the row's background is always some
  // definite, predictable color out of the box instead of silently
  // inheriting whatever COLUBK the surrounding code happens to leave
  // behind.
  const textBkColorConfigurationCode = this.isTextMinikernelActive() ?
    `const textbkcolor = ${colorByteToBuildBBasic(config.textBkColor ?? 0)}` : '';
  // The DPC+ Text Minikernel lives in a bank to itself (the last one, which the relocation leaves alone while it
  // is in use) and the kernel calls into it there.
  const textBankConfigurationCode = !this.isTextMinikernelActive() ? '' :
    config.kernel === 'dpcplus' ? 'const textbank = 6' :
    this.textKernelBank() ? `const textbank = ${this.textKernelBank()}` : '';
  // text12b.asm's  second-line drawing path (see its "textkernel2ndrow"
  // ifconst block) - only assembled in at all once some Text tab entry
  // actually has "Wrap to line 2" on (see TextEditor.vue and
  // isTextRow2Used's  comment in generators/bbasic/text-minikernel.js),
  // same "only pay for what's used" gating as every other Text Minikernel
  // const here.
  const textRow2ConfigurationCode = this.isTextRow2Used() ? 'const textkernel2ndrow = 1' : '';
  // titletextbank: the bank the Title Screen kernel runs from, which the text kernel hops back to (a bankswitched ROM only).
  const titleTextBank = this.isTitleTextUsed() ? Blockly.BBasic.getSubroutineBank(TITLE_SCREEN_SUBROUTINE_NAME) : 0;
  const titleTextConfigurationCode = this.isTitleTextUsed() ?
    'const titletext = 1' + (titleTextBank > 1 ? `
 const titletextbank = ${titleTextBank}` : '') : '';
  // pfres raises the playfield's vertical resolution above the standard
  // kernel's default; it requires the extra RAM Superchip provides (see
  // generateRomSize), and is a single ROM-wide setting, not per-background.
  // Meaningless under DPC+ (Superchip is a Standard-kernel-only extra-RAM
  // scheme, mutually exclusive with DPC+'s) - Configuration.vue already
  // forces enableSuperchip off when the kernel is DPC+, guarded again here
  // in case an old saved project has it stale.
  const pfresConfigurationCode = (config.kernel !== 'dpcplus' && enableSuperchip && pfres) ?
    `const pfres = ${pfres}` : '';
  // "pfrowheight" overrides the kernel's row-height calculation (see
  // std_kernel.asm/std_kernel_vertical_reflect.asm's "ifconst
  // pfrowheight ... else ... lda #(96/pfres)+2" fallback) directly, in
  // scanlines - unlike pfres, it doesn't change how many rows the playfield
  // has (2600basic's  background pixel data is unaffected either way),
  // just how tall each one is drawn, and it works independently of pfres/
  // Superchip (the kernel's  fallback branch checks it even when pfres
  // was never set at all - "lda #10" is the ONLY case where neither
  // applies). pfRowDivisorFor in utils/playfield-coords.js mirrors this
  // same precedence for the sprite/playfield coordinate conversion blocks,
  // so they stay in sync with whatever the kernel actually draws.
  // Same DPC+ guard as pfresConfigurationCode above - pfrowheight is also
  // a std_kernel.asm-only ifconst symbol.
  const pfRowHeightConfigurationCode = (config.kernel !== 'dpcplus' && enablePfRowHeight && pfrowheight) ?
    `const pfrowheight = ${pfrowheight}` : '';
  // Unlike kernel_options, "set optimization" lines can't be combined on one
  // line - each option needs its "set optimization X" statement.
  const optimizationLines = [];
  if (config.enableOptimizationSpeed) optimizationLines.push('set optimization speed');
  if (this.useInlineRand()) optimizationLines.push('set optimization inlinerand');
  const optimizationConfigurationCode = optimizationLines.join('\n ');
  // "set debug cyclescore" - overlays an estimate of the current frame's
  // remaining machine cycles onto the score digits (white = still under
  // budget, red = over) every frame, in place of whatever the project's
  // score logic would otherwise display there. Purely a debugging aid - see
  // the Options tab's  hint for the details (+/- 64 cycle accuracy, only
  // measures +/- 2000 cycles).
  const debugConfigurationCode = config.enableCycleScore ? 'set debug cyclescore' : '';
  return [
    kernelOptionsConfigurationCode,
    scoreConfigurationCode,
    scoreFadeConfigurationCode,
    scorePaddingConfigurationCode,
    scoreFontConfigurationCode,
    scoreFontsCode,
    textFontConfigurationCode,
    scoreFontExtraGlyphsConfigurationCode,
    textBkColorConfigurationCode,
    textBankConfigurationCode,
    textRow2ConfigurationCode,
    titleTextConfigurationCode,
    pfresConfigurationCode,
    pfRowHeightConfigurationCode,
    optimizationConfigurationCode,
    debugConfigurationCode,
  ].join('\n ');
};

const SUPPORTED_ROM_SIZES = ['2k', '4k', '8k', '16k', '32k', '64k'];

// "set kernel DPC+" is a real batari Basic directive, not something this
// app constructs - the real compiler's own parser reacts to it directly
// (statements.c's "set kernel" handling: calling create_includes(
// "DPCplus.inc") to swap its include manifest, setting its internal
// bs=28 kernel-scheme flag every DPC+-specific compiler branch checks,
// and auto-declaring bankswitch_hotspot/bankswitch/bs_mask/last_bank
// itself) - so unlike Standard, DPC+ needs no "set romsize"/Superchip
// line at all; the compiler fixes its own fixed 8-bank (0-7) scheme the
// moment it sees this directive.
Blockly.BBasic.generateRomSize = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.kernel === 'dpcplus') return `set kernel DPC+\n set dpcspritemax ${this.dpcPlusSpriteMax || 1}`;
  const romSize = SUPPORTED_ROM_SIZES.includes(config.romSize) ? config.romSize : '4k';
  // Superchip RAM (needed for pfres above the standard kernel's default) is
  // enabled by appending SC to the rom size, e.g. "set romsize 8kSC".
  const superchipSuffix = superchipOn(config) ? 'SC' : '';
  return `set romsize ${romSize}${superchipSuffix}`;
};

// See the SYSTEM_VARIABLES comment above: without Superchip these bookkeeping
// variables sit on letters, since the standard kernel's playfield buffer
// occupies var0-43; with Superchip that buffer moves to the SARA chip RAM
// page instead, so these move into var0-14, freeing every letter for user
// variables (see Blockly.BBasic.init).
Blockly.BBasic.generateSystemDims = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const showVariableComments = config.showVariableComments ?? true;
  const omitted = this.omittedSystemVars || new Set();
  const systemDims = SYSTEM_VARIABLES
      .map(([name, letter, description], i) => {
        if ((this.displayRamVars || new Map()).has(name)) return '';
        if (!omitted.has(name)) {
          return ` dim ${name} = ${superchipOn(config) ? `var${i}` : letter}` +
            (showVariableComments ? `  ; ${description}` : '');
        }
        const constant = OMITTABLE_SYSTEM_VARIABLES[name];
        return constant === null ? '' : ` const ${name} = ${colorByteToBuildBBasic(constant)}`;
      })
      .filter(Boolean)
      .join('\n');
  return systemDims + this.generateTextMinikernelDims() + this.generateEnvelopeDims() +
    this.generateScoreBkColorRuntimeDims() + this.generateSuperchipVarDims() + this.generateDpcPlusVarDims();
};

// Declares whichever dev/user vars init()'s routeDevVar placed into
// this.superchipVars instead of the letter pool (see SUPERCHIP_VAR_START's
// comment and routeDevVar in init()) - empty (so this whole function is a
// no-op) unless Superchip is enabled, since that routing only ever happens
// then. Spliced in right after generateSystemDims'  var0-var14 dims (see
// its  call above and generatedSystemDims in the template) rather than
// getting its  template slot, since both are the exact same kind of "dim
// name = varN" declaration and need to land before any generated code
// actually reads/writes these names, same as SYSTEM_VARIABLES' dims do.
Blockly.BBasic.generateSuperchipVarDims = function() {
  if (!this.superchipVars || !this.superchipVars.length) return '';
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const showVariableComments = config.showVariableComments ?? true;
  return '\n' + this.superchipVars
      .map((name, i) => {
        const description = showVariableComments && this.devVarDescriptions[name];
        const commentSuffix = description ? `  ; ${description}` : '';
        return ` dim ${name} = var${SUPERCHIP_VAR_START + i}${commentSuffix}`;
      })
      .join('\n');
};

// Declares whichever dev/user vars init()'s routeDevVar placed into
// this.dpcPlusVars instead of the letter pool (see DPCPLUS_VAR_COUNT's own
// comment and routeDevVar in init()) - empty (a no-op) unless kernel is
// DPC+, since that routing only happens then. Same splice point as
// generateSuperchipVarDims (mutually exclusive with it in practice - DPC+
// and Superchip never both apply to the same build).
Blockly.BBasic.generateDpcPlusVarDims = function() {
  if (!this.dpcPlusVars || !this.dpcPlusVars.length) return '';
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const showVariableComments = config.showVariableComments ?? true;
  return '\n' + this.dpcPlusVars
      .map((name, i) => {
        const description = showVariableComments && this.devVarDescriptions[name];
        const commentSuffix = description ? `  ; ${description}` : '';
        return ` dim ${name} = var${i}${commentSuffix}`;
      })
      .join('\n');
};


// The backgrounds that are compiled into the ROM, in the order of the Background
// tab: every background something can switch to (see resolveUsedBackgroundIds),
// all of them when that can't be told. Everything that works from the list of
// backgrounds (the tall-background scrolling tables and their packed index
// included) uses this one list, so a background left out does not leave a gap
// in the positions.
Blockly.BBasic.getIncludedBackgrounds = function() {
  const backgroundData = this.getBackgroundsData();
  const all = (backgroundData && backgroundData.backgrounds) || [];
  if (!this.usedBackgroundIds) return all;
  return all.filter((background) => this.usedBackgroundIds.has(Number(background.id)));
};

// One background's "pfcolors:" block plus the playfieldrealcolor line that
// carries its top row (see generateBackgrounds' comment on that batari Basic
// bug). Also used for each prebuilt step of "Fade playfield rows from".
const buildPfcolorsBlock = (rowCount, rowColors, blankLinesShown) => {
  const resolved = [];
  for (let i = 0; i < rowCount; i++) {
    resolved.push((rowColors && rowColors[i] != null) ? rowColors[i] : DEFAULT_ROW_COLOR);
  }
  const outputBytes = blankLinesShown ?
    resolved.concat([resolved[resolved.length - 1]]) :
    [resolved[0]].concat(resolved);
  const rows = outputBytes.map((byte) => '  ' + colorByteToBuildBBasic(byte));
  return ' pfcolors:\n' + rows.join('\n') + '\nend\n' +
    ` playfieldrealcolor = ${colorByteToBuildBBasic(resolved[0])}\n`;
};

// Repeats a background's rows over the 255 rows (the most DPC+ takes) of the playfield it scrolls through, each
// one cut into `repeats` thinner rows, so stepping a whole background-height either way shows the same picture
// again. The row colors get the same layout, so the colors on screen are the same whether or not they scroll.
const DPC_PLUS_SCROLL_ROWS = 255;
// How many lines of playfield the DPC+ kernel draws (measured on the emulator), whatever pfres says; the picture's last lines are
// only reached by a scroll that goes this far.
const DPC_PLUS_SCREEN_LINES = 176;
// The ROM keeps only this many rows when it can (a whole number of repeats of the picture, at least this many so the copies that
// fill the rest at load time stay few): the code in utils/dpc-tile.js has the coprocessor copy them over the rest of the 255 rows.
const DPC_PLUS_MIN_STORED_ROWS = 64;
// How far a scroll goes, the number the scroll code's row variable holds: a wrapping one goes round the background's rows, a
// no-wrap one (see init) stops after the rows that do not fit on screen.
const dpcPlusScrollTravel = (scroll) => scroll.noWrap ? scroll.limit : scroll.rows;
const dpcPlusStoredRows = (scroll) => {
  if (scroll.noWrap) return DPC_PLUS_SCROLL_ROWS;
  const stored = scroll.rows * Math.max(1, Math.ceil(DPC_PLUS_MIN_STORED_ROWS / scroll.rows));
  return stored >= DPC_PLUS_SCROLL_ROWS ? DPC_PLUS_SCROLL_ROWS : stored;
};
const tileForDpcPlusScroll = (pixels, rowColors, scroll, bkRowColors, count = DPC_PLUS_SCROLL_ROWS) => {
  const height = pixels.length;
  // A no-wrap scroll lays the background out once, with empty rows (and the last row's colors) after it.
  const filled = (i) => !scroll.noWrap || i < height * scroll.repeats;
  const source = (i) => filled(i) ? Math.floor(i / scroll.repeats) % height : height - 1;
  const blank = pixels.length ? pixels[0].map(() => 0) : [];
  const tile = (colors) => colors ? Array.from({length: count}, (_, i) => colors[source(i)]) : colors;
  return {
    pixels: Array.from({length: count}, (_, i) => filled(i) ? pixels[source(i)] : blank),
    rowColors: tile(rowColors),
    bkRowColors: tile(bkRowColors),
  };
};

Blockly.BBasic.generateBackgrounds = function() {
  // The backgrounds that go in the ROM (see getIncludedBackgrounds). The
  // scrolling code finds each background's data by its position in this same
  // list, so the positions always match what is compiled.
  const backgrounds = this.getIncludedBackgrounds();

  const convertPlayfield = (playField) =>
    playField.split('\n').map((line) => '  ' + line).join('\n');

  // A "pfcolors:" block sets the playfield colors at runtime when execution
  // reaches it, so emitting one inside each background's swap conditional gives
  // every background its  colors. One color per playfield row, top to
  // bottom. Rows without an explicit color fall back to the default so that
  // switching to an uncolored background doesn't leave stale colors behind.
  //
  // batari Basic has a documented bug where the playfield's top row doesn't
  // pick up the pfcolors table - it keeps showing whatever COLUPF already held
  // when drawscreen ran. commongamelogic sets "COLUPF = playfieldrealcolor"
  // every frame (to restore it after the score routine stomps on it), so
  // assigning that same variable here, once, when a colored background is
  // selected, makes the existing per-frame restore also carry the correct top
  // row color - no need to re-run pfcolors: every frame.
  //
  // The compiler's row/color table is actually sized for 12 rows, not 11 -
  // the standard kernel's default is documented as effectively pfres=12: 11
  // visible rows plus one further row that's technically off-screen (used
  // to keep pfscroll smooth). Supplying only 11 colors leaves that 12th slot
  // reading whatever ROM byte happens to follow, which shows up as two
  // different-looking bugs depending on which kernel is drawing the
  // playfield:
  //
  // - Blank lines shown (the default, "no_blank_lines" off): compiling a
  //   pfcolors: block special-cases row 1 (into the COLUPF write above) and
  //   stores the remaining rows in a ROM table, but the kernel's last
  //   scanline read of that table reads one slot past the end of it -
  //   landing on that stray byte, hence a black bottom row instead of the
  //   color that was meant to keep displaying there. Confirmed by compiling
  //   a test program and inspecting the generated assembly directly.
  //   Repeating the last row's color as a 12th entry gives that stray read
  //   a valid (and correct) value to land on.
  //
  // - "no_blank_lines" on: the missing 12th entry instead crushes the FIRST
  //   row's real display height down to a couple of scanlines, making it
  //   barely visible (confirmed by precise pixel sampling in the emulator).
  //   Duplicating the first row's color as an extra leading entry - keeping
  //   all 11 original colors after it, none dropped - fixes it the same
  //   way: the sliver and the row after it read as one normal first row.
  const usePfColors = this.needsPlayfieldColorTable();
  const blankLinesShown = this.effectiveShowBlankLines();
  // background_scroll/background_scroll_position's position tracking
  // (see backgroundScrollRowVarName's comment in blocks/background.js) -
  // each background has its real row count, so its furthest valid
  // scroll row (backgroundScrollRowMax) has to be recomputed every time
  // newbackground switches to it, the same reasoning pfcolors already
  // re-applies per background above. Resetting backgroundScrollRow to 0
  // here too means switching backgrounds always starts back at the top,
  // rather than carrying over whatever scroll position the PREVIOUS
  // background happened to be at.
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const visibleRows = backgroundDataRows(config);
  const scrollTrackingUsed = this.backgroundScrollTracking;
  const buildPfcolors = (pixels, rowColors) => buildPfcolorsBlock(pixels.length, rowColors, blankLinesShown);

  // DPC+'s real compiler support for "pfcolors:" (confirmed: a genuine
  // dedicated code path in the real batari Basic compiler, not shared with
  // the standard kernel's) reads a table sized to exactly match the
  // playfield's row count, via its DFxFRACINC-driven fetcher - none
  // of buildPfcolors' 12th-row padding/COLUPF-top-row workaround above
  // applies here, since that's specifically a standard-kernel row-table
  // implementation quirk (confirmed by testing against std_kernel.asm's
  // pfcolortable read), not something inherent to the "pfcolors:" block
  // syntax itself.
  const useDpcPlusPfColors = (configurationStorage && configurationStorage.value &&
    dpcPlusPfColorsOn(configurationStorage.value)) || false;
  const buildDpcPlusPfcolors = (pixels, rowColors) => {
    const rows = pixels.map((_, i) =>
      '  ' + colorByteToBuildBBasic((rowColors && rowColors[i] != null) ? rowColors[i] : DEFAULT_ROW_COLOR));
    return ' pfcolors:\n' + rows.join('\n') + '\nend\n';
  };
  // The background rows have a list of colors apart from the playfield's (bkRowColors, the color bar to the right of the picture in the Background
  // editor); a project from before that has none, and the playfield's colors stand in.
  const useDpcPlusBkColors = (configurationStorage && configurationStorage.value &&
    configurationStorage.value.kernel === 'dpcplus' && configurationStorage.value.enableDpcPlusBkColors) || false;
  const buildDpcPlusBkcolors = (pixels, rowColors) => {
    const rows = pixels.map((_, i) =>
      '  ' + colorByteToBuildBBasic((rowColors && rowColors[i] != null) ? rowColors[i] : DEFAULT_ROW_COLOR));
    return ' bkcolors:\n' + rows.join('\n') + '\nend\n';
  };


  // Registers the shared row-patch subroutine (see its comment) as a side
  // effect, for its relocation bookkeeping - not concatenated into this
  // function's returned bank-1 splice text, since it now rides the
  // ordinary user-subroutine relocation machinery (Blockly.BBasic.
  // subroutines) instead of always being inline-spliced into bank 1.
  Blockly.BBasic.generateBackgroundScrollPatch(backgrounds, visibleRows);
  // Without Superchip RAM the extra 12th row of a background (see
  // backgroundDataRows) is only put in the playfield data when the project
  // scrolls the playfield: it is the row that scrolls into view, so leaving it
  // out left a gap. Otherwise it stays out, since a lit 12th row glitched the
  // text drawn on the same screen (the Play preview's name).
  const drawnRows = (this.backgroundScrollUsed || this.backgroundScrollOverflowBackgrounds.length > 0) ?
    visibleRows : effectiveBackgroundRows(config);
  const dpcPlusDrawsAllRows = config.kernel === 'dpcplus';
  // Scrolling the playfield colors with the pixels: each background gets a
  // separate color table instead of the compiler's "pfcolors:" one (see
  // buildBackgroundColorScroll).
  this.backgroundColorScrollTablesAsm = '';
  this.backgroundColorScrollTopBank = 0;
  const colorScroll = !!this.backgroundColorScrollUsed && usePfColors;
  if (colorScroll) this.buildBackgroundColorScroll(backgrounds, config);

  // The standard kernel keeps each "pfcolors:" table in the kernel bank (4 bytes a row, the compiler puts it there
  // wherever the statement is), once for every statement. Backgrounds with the same row colors would each add a
  // separate copy, so a table that more than one background uses is loaded by a shared subroutine instead.
  const splitPfcolors = (block) => {
    const end = block.indexOf('\nend\n');
    return {table: block.slice(0, end), rest: block.slice(end + 5)};
  };
  const standardPfcolors = usePfColors && !colorScroll && !dpcPlusPfColorsOn(config);
  const pfcolorUses = new Map();
  if (standardPfcolors) {
    backgrounds.forEach(({pixels, rowColors}) => {
      const {table} = splitPfcolors(buildPfcolors(pixels.slice(0, drawnRows), rowColors));
      pfcolorUses.set(table, (pfcolorUses.get(table) || 0) + 1);
    });
  }
  const sharedPfcolors = new Map();
  const loadPfcolors = (id, block) => {
    const {table, rest} = splitPfcolors(block);
    if ((pfcolorUses.get(table) || 0) < 2) return block.replace(/\n$/, '');
    if (!sharedPfcolors.has(table)) {
      const name = `_pfcolors_${sharedPfcolors.size}`;
      sharedPfcolors.set(table, name);
      Blockly.BBasic.subroutines[name] = table.trim().split('\n').map((line) => line.trim()).concat('@end').join('\n');
    }
    const name = sharedPfcolors.get(table);
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.graphicsUnitBank(`background${id}`), Blockly.BBasic.getSubroutineBank(name));
    return ` gosub ${name}${suffix}\n${rest.replace(/\n$/, '')}`;
  };

  // With DPC+ the pictures themselves are kept in the graphics bank, so what is left of a background here is a short run of loading
  // statements. All of them go in one subroutine that can sit in any bank, called only on the frame a background is changed, instead
  // of a piece in the main bank for every background. (Where a background has scroll tracking or color scrolling the pieces call
  // other subroutines with a bank tag that depends on where the code is, so those keep the separate pieces.)
  const loadAsSubroutine = dpcPlusDrawsAllRows && !scrollTrackingUsed && !colorScroll && backgrounds.length > 0;
  const loadCode = backgrounds.map((background, index) => {
    const {id, pixels: rawPixels, rowColors: rawRowColors, bkRowColors: rawBkRowColors} = background;
    // How this background's rows are cut up for scrolling (the rows of every background have the same thickness, see init).
    const scrollOf = (dpcPlusDrawsAllRows && this.dpcPlusScrollFor) ? this.dpcPlusScrollFor(background) : null;
    const endLabel = `background${id}end`;
    // DPC+ scrolls through a 256-row strip that wraps around, so a scrolling background is laid out over all 256
    // rows, in a way that stepping a whole background-height either way (see background_scroll) lands on the
    // same picture again: that is what makes the scrolling seamless.
    // Only the rows of one repeat go in the ROM (dpcPlusStoredRows); a marker after the statements has the rest copied in at load time.
    const storedTileRows = (scrollOf && this.backgroundScrollOverflowBackgrounds.length === 0) ?
      dpcPlusStoredRows(scrollOf) : DPC_PLUS_SCROLL_ROWS;
    const {pixels, rowColors, bkRowColors} = scrollOf ?
      tileForDpcPlusScroll(rawPixels, rawRowColors, scrollOf, rawBkRowColors, storedTileRows) :
      {pixels: rawPixels, rowColors: rawRowColors, bkRowColors: rawBkRowColors};
    // Capped to the live playfield RAM window's real size (visibleRows),
    // not this background's full row count - the SAME overflow/corruption
    // reasoning as the literal "playfield:" block just below applies here
    // too (confirmed against 2600basic.h's playfield/pfwidth addressing):
    // the compiler's pfcolors table is real RAM sized for the visible
    // window alone, with no reserved home for any row beyond it. A
    // background taller than the window with per-row colors enabled will
    // show the CORRECT color on every row initially visible, but not yet
    // on rows only reached by scrolling - unlike the pixel data itself
    // (see generateBackgroundScrollPatch), newly-exposed rows' colors
    // aren't patched in on scroll, a known, narrower gap than the pixel
    // one this fix targets.
    const pfcolorsBlock = (usePfColors && !colorScroll && !dpcPlusPfColorsOn(config)) ?
      buildPfcolors(pixels.slice(0, drawnRows), rowColors) :
      (useDpcPlusPfColors ? buildDpcPlusPfcolors(pixels, rowColors) : '');
    const bkcolorsBlock = useDpcPlusBkColors ? buildDpcPlusBkcolors(pixels, bkRowColors || rowColors) : '';
    const overflowUsed = this.backgroundScrollOverflowBackgrounds.length > 0;
    // A literal "playfield:" block, directly loading this background's
    // first visibleRows rows, ONLY once no background in the project
    // overflows the live window - once any does, the initial load is a
    // gosub into the shared bgscrollpatch routine (offset 255 = load the whole
    // first window, see below) from the same table every scroll step reads
    // its one new row from, so a background's rows live in ROM exactly once
    // (a "playfield:" block here as well would duplicate its first
    // visibleRows rows). Matches Scroll3A.bas's structure: its single
    // "playfield:" block is never directly executed (skipped via "goto
    // manualdraw") and is used purely as a backing data source.
    const payloadLines = overflowUsed ? [] : [
      ' playfield:',
      convertPlayfield(matrixToPlayfield((dpcPlusDrawsAllRows ? pixels : pixels.slice(0, drawnRows)))),
      'end',
    ];
    if (pfcolorsBlock) {
      payloadLines.push(standardPfcolors ? loadPfcolors(id, pfcolorsBlock) : pfcolorsBlock.replace(/\n$/, ''));
    }
    if (bkcolorsBlock) payloadLines.push(bkcolorsBlock.replace(/\n$/, ''));
    // What the code that works with this background's rows is told about them (see init).
    const rowLines = backgroundRowLinesFor(background, config);
    [[this.dpcPlusRowFracVar, dpcPlusRowFracOf(rowLines)],
      [this.dpcPlusRowDivVar, Math.max(1, Math.round(rowLines / 2))],
      [this.dpcPlusRowLinesVar, Math.max(1, Math.round(rowLines))],
      [this.dpcPlusRowMaxVar, Math.max(1, backgroundPfresOf(background, config) - 1) - 1],
      [this.dpcPlusScrollRowsVar, scrollOf ? dpcPlusScrollTravel(scrollOf) : 0]]
        .filter(([name]) => name).forEach(([name, value]) => payloadLines.push(` ${name} = ${value}`));
    if (storedTileRows < DPC_PLUS_SCROLL_ROWS) {
      const parts = `p${pfcolorsBlock ? 'c' : ''}${bkcolorsBlock ? 'b' : ''}`;
      payloadLines.push(dpcTileMarker(id, storedTileRows, DPC_PLUS_SCROLL_ROWS, parts));
    }
    // DPC+ scrolling: start the view one background-height into the repeated rows (see background_scroll).
    // A background's color rows replace the rainbow's, so the rainbow loads its rows again.
    if (dpcPlusDrawsAllRows && this.backgroundRainbowUsed) {
      const flagsVar = Blockly.BBasic.nameDB_.getName(romNoiseFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      payloadLines.push(` ${flagsVar}{${backgroundRainbowLoadedBit()}} = 0`);
    }
    if (scrollOf) {
      const offsetVar = Blockly.BBasic.nameDB_.getName('_dpcScrollOffset', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const colorOnly = Blockly.BBasic.dpcPlusColorOnlyScrollUsed || {};
      [['pf', '_dpcColorScrollOffset'], ['bk', '_dpcBkColorScrollOffset']].filter(([kind]) => colorOnly[kind]).forEach(([, name]) =>
        payloadLines.push(` ${Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${scrollOf.noWrap ? 0 : scrollOf.rows}`));
      // A no-wrap scroll starts at the top of the playfield memory, a wrapping one a background-height into it.
      payloadLines.push(` ${offsetVar} = ${scrollOf.noWrap ? 0 : scrollOf.rows}`,
          ...(scrollOf.noWrap ? [] : Blockly.BBasic.dpcPlusScrollQueues(config, scrollOf.pfColors, scrollOf.bkColors)
              .map((queues) => ` pfscroll ${scrollOf.rows}${queues}`)));
    }
    const payload = payloadLines.join('\n');
    // In overflow mode the background's index is stored in the row
    // variable's high bits right here (for EVERY background, not just
    // overflowing ones), rather than read from "newbackground" later:
    // "newbackground" is a one-shot switch trigger, zeroed every frame right
    // after this same reset block runs, not a persistent "currently active
    // background" register, so a scroll routine reading it only ever matched
    // on the exact frame of a switch (a real, confirmed bug).
    // "playfieldpos = rowHeight" (the overflow case, where the row-step is
    // detected from playfieldpos itself instead of a shadow accumulator)
    // instead of resetting backgroundScrollSubRowVarName to 0 - matches the
    // real kernel's boot-time init (startup.asm sets playfieldpos to this same row-height
    // value) so a background switched in mid-game starts from the same
    // "settled, no fine-scroll offset yet" state pfscroll's row-step
    // detection (see background_scroll's generator) expects.
    // The overflow branch also gosubs into bgscrollpatch immediately with
    // offset 255, which loads the whole first window from the table (see
    // that routine's comment).
    // In overflow mode this single assignment sets row 0 AND the background's
    // index (see backgroundScrollPacking in blocks/background.js); the
    // gosub then loads the first window (temp5 = 255).
    const scrollTrackingLines = scrollTrackingUsed ?
      (overflowUsed ?
        ` ${backgroundScrollRowVarName()} = ${index * this.backgroundScrollPacking.indexStep}\n` +
        (this.backgroundScrollPacking.packed ? '' : ` ${backgroundScrollActiveVarName()} = ${index}\n`) +
        ` playfieldpos = ${Math.max(1, Math.round(pfRowDivisorFor(config)))}\n` +
        ' temp5 = 255\n' +
        ` gosub ${BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME}${Blockly.BBasic.bankJumpSuffix(
            Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME))}\n` :
        ` ${backgroundScrollRowVarName()} = 0\n` +
        ` ${backgroundScrollRowMaxVarName()} = ${Math.max(0, pixels.length - visibleRows)}\n` +
        ` ${backgroundScrollSubRowVarName()} = 0\n`) : '';
    // Only the graphics payload itself is relocatable - the guard above and
    // the endLabel below stay inline in bank 1 no matter what, since a
    // conditional "goto" (like any goto) needs an explicit bank tag to cross
    // banks, and neither of those ever does: this background's guard/label
    // pair are only ever reached from within bank 1's  commongamelogic.
    // Scroll-tracking reset lives here too, not inside the relocatable
    // graphics payload - it's two tiny assignments, not graphics data, so
    // there's no reason to pay for a bank jump just to run them.
    // With background rainbow colors in use, remember where this background's
    // row color table is so Stop can point the kernel back at it.
    const colorTableSaveLines = (usePfColors && this.backgroundRainbowUsed) ?
      ` ${Blockly.BBasic.superchipRwPairs[backgroundColorTableLoVarName()].write} = pfcolortable\n` +
      ` ${Blockly.BBasic.superchipRwPairs[backgroundColorTableHiVarName()].write} = aux2\n` : '';
    // Points the kernel at this background's color table, scrolled to its
    // current row (the first one, or the row a pending "Set background scroll
    // to row" just put it at).
    const colorScrollLines = colorScroll ? [
      ` ${Blockly.BBasic.nameDB_.getName(backgroundColorBgVarName(),
          Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${index}`,
      ` ${Blockly.BBasic.nameDB_.getName(backgroundColorOffsetVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE)} = ${
        overflowUsed ? `${backgroundScrollRowVarName()} & ${this.backgroundScrollPacking.rowMask}` : '0'}`,
      this.backgroundColorScrollApplyLines(),
    ].join('\n') + '\n' : '';
    const rowFadeLines = ['pf', 'bk'].filter((kind) => this.multicolorFade[kind].from.length || this.multicolorFade[kind].to.length)
        .map((kind) => ` ${multicolorFadeVarName(kind, 'Bg')} = ${index}\n` +
          ` ${multicolorFadeVarName(kind, 'Step')} = ${ROW_FADE_IDLE_STEP}\n`).join('');
    return ` if newbackground <> ${id} then goto ${endLabel}` + '\n' +
      rowFadeLines +
      scrollTrackingLines +
      (loadAsSubroutine ? payload : Blockly.BBasic.wrapRelocatableGraphics(`background${id}`, payload)) + '\n' +
      colorScrollLines +
      colorTableSaveLines +
      endLabel;
  }).join('\n\n');
  if (!loadAsSubroutine) return loadCode;
  this.subroutines[BACKGROUND_LOAD_NAME] = asSubroutineBody(loadCode);
  return ` gosub ${BACKGROUND_LOAD_NAME}${Blockly.BBasic.bankJumpSuffix(
      Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(BACKGROUND_LOAD_NAME))}`;
};

// The bB lines that run the color scroll routine for the current
// bgColorBg/bgColorOffset (inputs temp1 and temp2 - see
// buildBackgroundColorScroll).
Blockly.BBasic.backgroundColorScrollApplyLines = function() {
  const resolve = (name) => this.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const suffix = this.bankJumpSuffix(this.getCurrentBank(),
      this.getSubroutineBank(BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME));
  return ` temp1 = ${resolve(backgroundColorBgVarName())}\n` +
    ` temp2 = ${resolve(backgroundColorOffsetVarName())}\n` +
    ` gosub ${BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME}${suffix}`;
};

// Builds what "Background scroll" needs to scroll the playfield colors with
// the pixels (see BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME in
// blocks/background.js). The kernel reads a row's color with
// "lda (pfcolortable),y", the table holding one color every 4 bytes, so
// scrolling the colors by a row is moving pfcolortable up 4 bytes.
//
// An indexed read that crosses a page boundary takes an extra cycle, and the
// kernel's timing has none to spare, so the pointer and everything it reaches
// have to be in one 256 byte page. A background can be much taller than that
// allows, so its colors are cut into pages: page p holds the colors of rows
// p * 16 and on (wrapping round to the first row after the last, which is how
// the playfield wraps) for as many rows as the kernel can read from a pointer
// anywhere in the first 16 rows of the page. To scroll to row k the pointer goes
// to page k / 16, 4 * (k mod 16) bytes in, and the same reads then land on the
// colors of rows k and on. The pages go in the fixed bank the kernel runs in
// (the "bank 1" data tables area), and the routine that sets the pointer
// carries its lookup tables with it, like bgscrollpatch.
//
// The kernel's table from "pfcolors:" (see buildPfcolorsBlock) holds the rows
// after the first (the first goes straight to COLUPF), starting one row
// further down when blank lines are shown, and the kernel starts reading it at
// pfcolortable + 132 - 4 * pfres (pfres being 12 without Superchip RAM). A page
// starts that many bytes (less 4 for the extra row) before its first entry, so
// the pointer is simply the page's address plus the offset. The top row's color
// goes in playfieldrealcolor (the value COLUPF is restored from every frame).
Blockly.BBasic.buildBackgroundColorScroll = function(backgrounds, config) {
  const windowRows = backgroundDataRows(config);
  const overflowMode = this.backgroundScrollOverflowBackgrounds.length > 0;
  const blankLinesShown = this.effectiveShowBlankLines() ? 1 : 0;
  const yBase = 132 - 4 * windowRows;
  const before = Math.max(0, yBase - 4 * blankLinesShown);
  const pageRows = 16;
  const entriesPerPage = pageRows + windowRows + 3;
  const tableLines = [' asm', ' align 256'];
  const firstPage = [];
  const pageHigh = [];
  // The top row's color comes from a plain list of each background's row colors
  // kept with the routine: the table pages can be in another bank than the
  // routine (the kernel's), where the routine can't read them.
  const rowStart = [];
  const rowList = [];
  let pageCount = 0;
  backgrounds.forEach(({pixels, rowColors}, index) => {
    const tall = overflowMode && pixels.length > windowRows;
    // The rows the colors cycle through: the whole background when it is taller
    // than the screen, else the rows the playfield rotates through.
    const rowCount = tall ? pixels.length : windowRows;
    const colorOf = (row) => (row < pixels.length && rowColors && rowColors[row] != null) ?
      rowColors[row] : DEFAULT_ROW_COLOR;
    firstPage.push(pageCount);
    rowStart.push(rowList.length);
    for (let row = 0; row < rowCount; row++) rowList.push(colorByteToBuildBBasic(colorOf(row)));
    for (let page = 0; page < Math.ceil(rowCount / pageRows); page++) {
      pageHigh.push(`bgcolorpage${pageCount}`);
      tableLines.push(`bgcolorpage${pageCount}`);
      if (before > 0) tableLines.push(` repeat ${before}`, ' .byte 0', ' repend');
      for (let i = 0; i < entriesPerPage; i++) {
        tableLines.push(` .byte ${colorByteToBuildBBasic(colorOf((page * pageRows + i) % rowCount))},0,0,0`);
      }
      tableLines.push(' align 256');
      pageCount++;
    }
    if (rowCount > pageRows * 4) {
      appendCompileLog(`Background ${index + 1} has more than ${pageRows * 4} rows: ` +
        'its scrolling playfield colors stop at row ' + (pageRows * 4) + '.', 'info');
    }
  });
  tableLines.push('end');
  if (rowList.length > 255) {
    appendCompileLog('The backgrounds have more than 255 rows in all: the top row of the scrolling ' +
      'playfield colors can show the wrong color on the later ones.', 'info');
  }
  this.backgroundColorScrollTablesAsm = tableLines.join('\n') + '\n';
  // The kernel reads these tables, so with bankswitching they have to be in the
  // bank the kernel runs from (the top one, see KERNEL_BANK_BY_ROMSIZE in
  // generators/bbasic/text-minikernel.js): a bank 1 table is not what the
  // kernel sees there. The pfcolors tables the compiler makes go there too.
  this.backgroundColorScrollTopBank = BANK_COUNT_BY_ROMSIZE_MINI[config.romSize] > 1 ?
    BANK_COUNT_BY_ROMSIZE_MINI[config.romSize] : 0;

  const playfieldColorVar = this.nameDB_.getName('playfieldrealcolor', Blockly.VARIABLE_CATEGORY_NAME);
  // The routine itself (temp1 = background index, temp2 = row offset): picks the
  // page, sets pfcolortable to it plus 4 bytes per row within the page, then
  // reads the top row's color.
  this.subroutines[BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME] = [
    'asm',
    'lda temp2',
    'lsr',
    'lsr',
    'lsr',
    'lsr',
    'ldx temp1',
    'clc',
    'adc bgcolor_first,x',
    'tax',
    'lda bgcolor_pagehigh,x',
    'sta pfcolortable+1',
    'lda temp2',
    'and #15',
    'asl',
    'asl',
    'sta pfcolortable',
    'ldx temp1',
    'lda bgcolor_rowstart,x',
    'clc',
    'adc temp2',
    'tax',
    'lda bgcolor_rows,x',
    `sta ${playfieldColorVar}`,
    '@end',
    ' return',
    '',
    'asm',
    '@bgcolor_first',
    `.byte ${firstPage.join(', ')}`,
    '@bgcolor_pagehigh',
    `.byte ${pageHigh.map((label) => `>${label}`).join(', ')}`,
    '@bgcolor_rowstart',
    `.byte ${rowStart.map((start) => Math.min(start, 255)).join(', ')}`,
    '@bgcolor_rows',
    `.byte ${rowList.slice(0, 256).join(', ')}`,
    '@end',
  ].join('\n');
};

// Per-frame step of the multicolor fades: "Fade playfield rows from color to playfield colors", and "Fade color to" while the
// register it fades has per-row colors (the playfield's, and on DPC+ the background's). Each step shows a prebuilt row color
// table, by running its "pfcolors:" (or "bkcolors:") block, picked by the loaded background, the fade's color and the step.
// Fading from a color: each row keeps its hue, and only the brightness runs from the color's to the row's, in four equal steps.
// Fading to a color: the brightness runs from the row's to the color's and the rows take its hue on the last step, when every
// row has the color (as the single color fade does). Spliced in with the other fade checks.
Blockly.BBasic.generateRowFadeChecks = function() {
  return ['pf', 'bk'].map((kind) => this.generateMulticolorFadeChecks(kind)).join('');
};

Blockly.BBasic.generateMulticolorFadeChecks = function(kind) {
  const fade = (this.multicolorFade || {})[kind];
  if (!fade || (!fade.from.length && !fade.to.length)) return '';
  const entries = [...fade.from.map((color) => ({mode: 'from', color})), ...fade.to.map((color) => ({mode: 'to', color}))];
  const resolveVar = (part) =>
    this.nameDB_.getName(multicolorFadeVarName(kind, part), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const stepVar = resolveVar('Step');
  const timerVar = resolveVar('Timer');
  const paceVar = resolveVar('Pace');
  const startVar = resolveVar('Start');
  const bgVar = resolveVar('Bg');
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const dpcPlus = config.kernel === 'dpcplus';
  const visibleRows = (this.backgroundScrollUsed || this.backgroundScrollOverflowBackgrounds.length > 0) ?
    backgroundDataRows(config) : effectiveBackgroundRows(config);
  const blankLinesShown = this.effectiveShowBlankLines();
  const number = this.blockNumbers.next();
  const endLabel = `_rowfade_${number}_end`;
  const applyLabel = `_rowfade_${number}_apply`;
  const lines = [
    ` if ${stepVar} > 4 then goto ${endLabel}`,
    ` ${timerVar} = ${timerVar} + 1`,
    ` if ${timerVar} < ${paceVar} then goto ${endLabel}`,
    ` ${timerVar} = 0`,
  ];
  // The table that shows these row colors: the standard kernel's pfcolors (with its extra row), or DPC+'s, one color per row of
  // the playfield, for the playfield or the background.
  const tableFor = (colors, rowCount) => {
    if (!dpcPlus) return buildPfcolorsBlock(rowCount, colors, blankLinesShown).replace(/\n$/, '');
    return ` ${kind === 'bk' ? 'bkcolors' : 'pfcolors'}:\n` +
      colors.map((color) => '  ' + colorByteToBuildBBasic(color)).join('\n') + '\nend';
  };
  // Every table is kept once however many backgrounds, colors and steps show it (backgrounds often share their row colors, and so
  // their fade steps do), and the pick of the table is one short run of comparisons per background and color, not three for every
  // table.
  const tables = new Map();
  const tableLabelFor = (rowColors, rowCount) => {
    const key = `${rowCount}:${rowColors.join(',')}`;
    if (!tables.has(key)) tables.set(key, {label: `_rowfade_${number}_t${tables.size}`, rowColors, rowCount});
    return tables.get(key).label;
  };
  const groups = [];
  // One step of a fade: from brightness a to brightness b (0 to 7) a fraction of the way, the hue the row's until the last one.
  const stepColor = (row, color, mode, step) => {
    if (mode === 'from') {
      return (row & 0xF0) | (((color & 0x0E) >> 1) + Math.round((((row & 0x0E) >> 1) - ((color & 0x0E) >> 1)) * step / 4)) << 1;
    }
    const startBrightness = (row & 0x0E) >> 1;
    const endBrightness = (color & 0x0E) >> 1;
    const fraction = Math.min(4, step + 1);
    const brightness = startBrightness + Math.round((endBrightness - startBrightness) * fraction / 4);
    return (fraction >= 4 ? (color & 0xF0) : (row & 0xF0)) | (brightness << 1);
  };
  this.getIncludedBackgrounds().forEach((background, index) => {
    const {pixels: rawPixels, rowColors: rawRowColors, bkRowColors: rawBkRowColors} = background;
    const tiled = (dpcPlus && this.dpcPlusScrollFor) ?
      tileForDpcPlusScroll(rawPixels, rawRowColors, this.dpcPlusScrollFor(background), rawBkRowColors) :
      {pixels: rawPixels, rowColors: rawRowColors, bkRowColors: rawBkRowColors};
    const pixels = tiled.pixels;
    const rowColors = kind === 'bk' ? (tiled.bkRowColors || tiled.rowColors) : tiled.rowColors;
    const rowCount = dpcPlus ? pixels.length : Math.min(pixels.length, visibleRows);
    const realColor = (row) => (rowColors && rowColors[row] != null) ? rowColors[row] : DEFAULT_ROW_COLOR;
    const group = {index, entries: []};
    groups.push(group);
    entries.forEach(({mode, color}, entryIndex) => {
      const picks = [];
      for (let step = 0; step < 4; step++) {
        const colors = [];
        for (let row = 0; row < rowCount; row++) colors.push(stepColor(realColor(row), color, mode, step));
        picks.push({step, label: tableLabelFor(colors, rowCount)});
      }
      // The last step: the rows' colors for a fade from a color, the color itself for a fade to one.
      if (mode === 'to') {
        const colors = [];
        for (let row = 0; row < rowCount; row++) colors.push(stepColor(realColor(row), color, mode, 3));
        picks.push({step: 4, label: tableLabelFor(colors, rowCount)});
      }
      group.entries.push({index: entryIndex, picks});
    });
    const real = [];
    for (let row = 0; row < rowCount; row++) real.push(realColor(row));
    group.realLabel = tableLabelFor(real, rowCount);
  });
  // The pick: background, then color, then step (a step 4 that no color's table answers shows the background's own rows).
  groups.forEach((group) => {
    const nextBackground = `_rowfade_${number}_bg${group.index}`;
    lines.push(` if ${bgVar} <> ${group.index} then goto ${nextBackground}`);
    group.entries.forEach((entry) => {
      const nextEntry = `_rowfade_${number}_bg${group.index}_e${entry.index}`;
      lines.push(` if ${startVar} <> ${entry.index} then goto ${nextEntry}`);
      entry.picks.forEach(({step, label}) => lines.push(` if ${stepVar} = ${step} then goto ${label}`));
      lines.push(nextEntry);
    });
    lines.push(` if ${stepVar} = 4 then goto ${group.realLabel}`, nextBackground);
  });
  lines.push(` goto ${applyLabel}`);
  tables.forEach(({label, rowColors, rowCount}) => {
    lines.push(label, tableFor(rowColors, rowCount), ` goto ${applyLabel}`);
  });
  lines.push(applyLabel);
  // A playfield that scrolls with its colors: the table just loaded starts at its first row, so its colors are moved on to where the
  // picture has scrolled to (the same pfscroll, of the color queue alone, as when the background was loaded).
  if (dpcPlus && this.dpcPlusScroll && (kind === 'bk' ? this.dpcPlusScroll.bkColors : this.dpcPlusScroll.pfColors)) {
    // The queue's position variable: the one the Background scroll colors blocks keep when the project has one for this kind.
    const ownOffset = (Blockly.BBasic.dpcPlusColorOnlyScrollUsed || {})[kind];
    const offsetVar = this.nameDB_.getName(ownOffset ? (kind === 'bk' ? '_dpcBkColorScrollOffset' : '_dpcColorScrollOffset') :
      '_dpcScrollOffset', Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const queue = kind === 'bk' ? 6 : 4;
    lines.push(' asm', ' lda #<C_function', ' sta DF0LOW', ' lda #(>C_function) & $0F', ' sta DF0HI', ' lda #32', ' sta DF0WRITE',
        ` lda ${offsetVar}`, ' sta DF0WRITE', ` lda #${queue}`, ' sta DF0WRITE', ` lda #${queue + 1}`, ' sta DF0WRITE',
        ' lda #255', ' sta CALLFUNCTION', 'end');
  }
  lines.push(` ${stepVar} = ${stepVar} + 1`);
  lines.push(` if ${stepVar} <= 4 then goto ${endLabel}`);
  lines.push(` ${stepVar} = ${ROW_FADE_IDLE_STEP}`);
  // A fade to a color is over: the register is no longer fading, and a "finished fading" watch can fire.
  if (fade.to.length) {
    const rawVar = kind === 'bk' ? 'COLUBK' : 'COLUPF';
    const flags = this.nameDB_.getName(fadeFlagsVarName(rawVar), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    if (fade.from.length) lines.push(` if ${startVar} < ${fade.from.length} then goto ${endLabel}`);
    lines.push(` ${flags}{${fadeActiveBit(rawVar)}} = 0`);
    if ((this.backgroundFadeFinishedWatches || new Set()).has(backgroundFadeWatchKey(rawVar))) {
      lines.push(` ${flags}{${backgroundFadeFinishedBit(rawVar)}} = 1`);
    }
  }
  lines.push(endLabel);
  if (dpcPlus) {
    // A subroutine can be placed in any bank, and DPC+ keeps the tables themselves in the graphics bank wherever the statement is
    // (the standard kernel keeps them in its last bank, so there the code stays inline). The fade is idle most frames, so the
    // call is only made while a step is left to show.
    const name = `${ROW_FADE_CHECKS_NAME}_${kind}`;
    this.subroutines[name] = asSubroutineBody(lines.join('\n'));
    const skipLabel = `_rowfade_${number}_skip`;
    return ` if ${stepVar} > 4 then goto ${skipLabel}\n gosub ${name}${Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(name))}\n${skipLabel}\n`;
  }
  return lines.join('\n') + '\n';
};

// The subroutine that makes scrolling past a customHeight background's
// first visibleRows rows actually work - see the comment above
// backgroundScrollPacking in blocks/background.js for the full account. Real pfscroll rotates
// the live window in place (cheap) but never loads a row that isn't already
// there, leaving exactly one row's worth of stale data behind per row-step;
// background_scroll's generator issues the pfscroll, detects when a row-step
// completed, sets temp5 (which window slot is stale) and temp3 (which row of
// the full background belongs there) and gosubs in here, which copies just
// that one row. A first attempt at this design failed in gameplay testing
// (partly from bugs found later, e.g. dispatching on the one-shot
// "newbackground" - see the reset block in generateBackgrounds); an
// interim version rewrote the whole window from a table on every row-step
// instead (after Scroll3A.bas), which worked but cost ~25x more per row-step
// on slow Superchip RAM.
//
// Builds one "playfield:" block per background in the project (not just the
// overflowing ones - see backgroundsWithOverflowRows' comment) so the
// dispatch always has something to read from, however the project happens
// to be using background_scroll - the exact same readable "X."-pixel-row
// text format (convertPlayfield/matrixToPlayfield) every OTHER "playfield:"
// block in this codebase already uses, not a hand-rolled hex-byte "data"
// table (an earlier, since-abandoned version of this fix used one - bB's
// "PF_dataN" naming, confirmed directly against Scroll3A.bas, already
// does exactly this job, matching that reference's structure exactly rather
// than reinventing it). A "playfield:" block is itself never executed when
// skipped over (same as a "data" table, same underlying JMP-over-the-bytes
// mechanism), and bB auto-names each one "PF_data0", "PF_data1", etc, in
// the order they're declared across the whole compiled program - this is
// the ONLY place in this codebase that ever emits a "playfield:" block
// (confirmed by searching the whole source tree), so that numbering is
// fully predictable: PF_data0 for backgrounds[0], PF_data1 for
// backgrounds[1], and so on, matching the array's declaration order.
//
// The copy itself is a small asm routine rather than bB's "playfield[i] =
// table[j]" assignment: confirmed by compiling both through the real
// toolchain, with Superchip RAM bB's "playfield:" loader writes to
// "playfield-128,x" (the Superchip's separate WRITE window - "playfield"
// itself is the READ window) but a "playfield[i] = ..." assignment emits "sta
// playfield,x", which writes into the read window (ROM) and silently does
// nothing, so no pixels ever showed.
//
// Registered into Blockly.BBasic.subroutines under
// BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME instead of being spliced directly
// into bank 1, so it rides the same bank-relocation machinery as a
// user-defined subroutine - see getSubroutineBank/generateRelocatedSections/
// pickRelocationCandidate in hooks/rom.js, the exact same machinery
// registerDistanceAbsDiffSubroutine (generators/bbasic/input.js) already
// rides. Every background_scroll call site resolves its gosub's bank-jump
// suffix via Blockly.BBasic.getSubroutineBank(BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME)
// instead of assuming bank 1.
//
// Every label DEFINITION below uses the "@" prefix (goto REFERENCES don't
// need it) because the registered body goes through generateSubroutineBody's
// normalizeIndents() pass, which otherwise indents every line flat,
// including bare labels - the same convention buildKeypadPollAsm/
// registerDistanceAbsDiffSubroutine (generators/bbasic/input.js) and
// buildDigitPokeLines (generators/bbasic/score.js) already use for exactly
// this reason.
Blockly.BBasic.generateBackgroundScrollPatch = function(backgrounds, visibleRows) {
  // Same decision init() made (a tall background AND something that scrolls) -
  // the routine reads variables that are only reserved in that case, so a
  // project with a tall background but no scroll block must not emit it.
  if (!this.backgroundScrollOverflowBackgrounds.length) return;

  const rowVar = backgroundScrollRowVarName();
  const packing = backgroundScrollPacking(backgrounds);
  const lastByte = visibleRows * 4 - 1;
  const startUsed = !!this.backgroundScrollStartUsed;
  const startVar = backgroundScrollStartVarName();
  // One shared copy loop, parameterized entirely at runtime by rowVar and
  // whichever table the dispatch below jumps into - growing a background's
  // row count only adds 4 bytes of DATA, never more of this loop.
  // Written as a small asm loop rather than bB's "playfield[i] = table[j]"
  // assignment: confirmed by compiling both through the real toolchain, with
  // Superchip RAM bB's "playfield:" loader writes to "playfield-128,x"
  // (the Superchip's separate WRITE window - "playfield" itself is the READ
  // window) but a "playfield[i] = ..." assignment emits "sta playfield,x",
  // which writes into the read window (ROM) and silently does nothing, so no
  // pixels ever showed. Y is the table offset (row * 4), X the byte index.
  const configurationStorage = useConfigurationStorage();
  const superchip = !!(configurationStorage && configurationStorage.value &&
    superchipOn(configurationStorage.value));
  // ONE routine for every background: the active background's table address
  // is looked up (by background index, kept in the row variable's high bits -
  // see backgroundScrollPacking) from the small per-background tables
  // emitted below and put in the zero-page pointer pair temp1/temp2 (fixed,
  // consecutive addresses $9C/$9D in 2600basic.h - the guaranteed-adjacent
  // pair a "(zp),y" read needs, which no dev var could promise). Adding a
  // background therefore only adds its data plus two table bytes, never
  // another copy of this code.
  //
  // Normally copies just ONE row (4 bytes) - table row temp3 into window slot
  // temp5 - the one row real pfscroll's rotate leaves stale each row-step.
  // temp5 = 255 instead loads the whole first window (rows 0 ..
  // visibleRows-1), used once when a background is switched in, and temp5 =
  // 254 just returns the active background's furthest scroll row (its row
  // count minus the visible rows) in temp6, from a ROM table instead of RAM.
  const copyRoutine = [
    'asm',
    ...(packing.packed ?
      [`lda ${rowVar}`, ...new Array(packing.rowBits).fill('lsr')] :
      [`lda ${backgroundScrollActiveVarName()}`]),
    'tay',
    'lda temp5',
    'cmp #254',
    'bcc bgscrollrow',
    // temp5 254/255: the less common modes, kept off the one-row path.
    'bne bgscrollfull',
    'lda bgscroll_max,y',
    'sta temp6',
    'jmp bgscrolldone',
    '@bgscrollfull',
    'lda bgscroll_lo,y',
    'sta temp1',
    'lda bgscroll_hi,y',
    'sta temp2',
    ...(startUsed ? [
      // A pending starting row (set_row's value + 1, 0 = none): clamp it to
      // this background's furthest row, store it in the row variable's low
      // bits (keeping the background index bits), consume it, and start the
      // copy at that row of the table instead of the first.
      `ldx ${startVar}`,
      'beq bgscrollnostart',
      'dex',
      'txa',
      'cmp bgscroll_max,y',
      'bcc bgscrollstartok',
      'lda bgscroll_max,y',
      '@bgscrollstartok',
      'sta temp3',
      ...(packing.packed ?
        [`lda ${rowVar}`, `and #${packing.indexMask}`, 'ora temp3', `sta ${rowVar}`] :
        [`sta ${rowVar}`]),
      'lda #0',
      `sta ${startVar}`,
      'lda temp3',
      'asl',
      'asl',
      'tay',
      'jmp bgscrollstart',
      '@bgscrollnostart',
    ] : []),
    'ldy #0',
    '@bgscrollstart',
    'ldx #0',
    '@bgscrollcopy',
    'lda (temp1),y',
    `sta playfield${superchip ? '-128' : ''},x`,
    'iny',
    'inx',
    `cpx #${lastByte + 1}`,
    'bne bgscrollcopy',
    'jmp bgscrolldone',
    // One row: dest slot temp5 * 4 into X (A still holds temp5), the
    // background's table pointer into temp1/temp2 (Y = background index),
    // then table row temp3 * 4 into Y.
    '@bgscrollrow',
    'asl',
    'asl',
    'tax',
    'lda bgscroll_lo,y',
    'sta temp1',
    'lda bgscroll_hi,y',
    'sta temp2',
    'lda temp3',
    'asl',
    'asl',
    'tay',
    ...[0, 1, 2, 3].flatMap((n) => [
      'lda (temp1),y',
      `sta playfield${superchip ? '-128' : ''},x`,
      ...(n < 3 ? ['iny', 'inx'] : []),
    ]),
    '@bgscrolldone',
    '@end',
  ].join('\n');

  // Per-background lookup tables (low/high address of each PF_dataN block),
  // plain asm .byte lines - placed after the subroutine's explicit return,
  // like the playfield blocks, so execution never falls into them.
  const lookupTables = [
    'asm',
    '@bgscroll_lo',
    `.byte ${backgrounds.map((_, index) => `<PF_data${index}`).join(', ')}`,
    '@bgscroll_hi',
    `.byte ${backgrounds.map((_, index) => `>PF_data${index}`).join(', ')}`,
    '@bgscroll_max',
    `.byte ${backgrounds.map(({pixels}) => Math.max(0, pixels.length - visibleRows)).join(', ')}`,
    '@end',
  ].join('\n');

  const convertPlayfield = (playField) =>
    playField.split('\n').map((line) => '  ' + line).join('\n');

  const buildTable = (pixels) => {
    // "@end", not a bare "end" - this block is part of a Blockly.BBasic.
    // subroutines body (see this function's comment), which goes through
    // generateSubroutineBody's normalizeIndents() pass; a bare "end" would
    // get the same flat indent as every other line instead of landing at
    // column 0, which bB's compiler requires to recognize it as closing the
    // block (confirmed directly: without this, the real compiler kept
    // consuming every following line - "return", then even the next "rem"
    // comments - as more data).
    return ` playfield:\n${convertPlayfield(matrixToPlayfield(pixels))}\n@end`;
  };

  // An explicit "return" right after the copy (not relying solely on
  // generateSubroutineBody's auto-appended trailing one - see that
  // function's comment) so the lookup tables and every "playfield:" block
  // below are physically placed somewhere normal execution never falls into,
  // the same "never fallen into" requirement the top-level data-tables splice
  // point satisfies by its placement alone (see generateDataTables'
  // comment) - here satisfied by an unconditional return instead, since
  // these tables travel inside this one relocatable subroutine body rather
  // than that fixed splice point. Keeping them in the SAME relocatable unit
  // as the code that reads them also sidesteps the ordinary "a data table
  // must be read from the bank it's declared in" restriction (see
  // trackDataTableBank's comment elsewhere in this file) for free -
  // wherever bgscrollpatch itself gets relocated to, its tables move with
  // it, atomically, by construction.
  Blockly.BBasic.subroutines[BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME] =
    copyRoutine + '\n return\n\n' + lookupTables + '\n\n' +
    backgrounds.map(({pixels}) => buildTable(pixels)).join('\n\n');
};

// Reads the stored data tables, applying defaults, or null if they can't
// load.
Blockly.BBasic.getDataTablesData = function() {
  try {
    return processDataTablesStorageDefaults(useDataTablesStorage());
  } catch (e) {
    console.error('Failed to load data tables', e);
    return null;
  }
};

// Lets a data table double as a background's  level data: a table whose
// name (trimmed) exactly matches a background's  name is forced into
// that background's CURRENT bank (see graphicsUnitBank - reflects this
// build's  relocation decisions, same as every other bank-switching
// lookup here), by injecting the same trackDataTableBank entry a
// data_get_element read from that bank would produce. Once dataTableBankUsage
// has ANY entry for a table, generateDataTables' "nothing ever read this,
// default it to bank 1" fallback no longer applies (see its  comment) - so
// a table linked only to a relocated background's bank is emitted exclusively
// there, not also duplicated into bank 1, matching "always the same bank as
// the background" rather than "also always in bank 1".
Blockly.BBasic.linkDataTablesToBackgrounds = function() {
  const backgroundData = this.getBackgroundsData();
  const backgrounds = (backgroundData && backgroundData.backgrounds) || [];
  const dataTablesData = Blockly.BBasic.getDataTablesData();
  const dataTables = (dataTablesData && dataTablesData.dataTables) || [];
  dataTables.forEach((table) => {
    const tableName = (table.name || '').trim();
    if (!tableName) return;
    const background = backgrounds.find((bg) => (bg.name || '').trim() === tableName);
    if (!background) return;
    // Only a table some block actually reads has anything to place; one nothing
    // reads is not included in the ROM at all.
    if (!Blockly.BBasic.dataTableBankUsage[table.id]) return;
    const bank = Blockly.BBasic.graphicsUnitBank(`background${background.id}`);
    Blockly.BBasic.trackDataTableBank(table.id, bank);
  });
};

// batari Basic's "data" statement declares a read-only ROM table, not
// executable code - unlike playfield/pfcolors blocks, which are only safe
// because generateBackgrounds() guards them with a runtime "goto" so they're
// never fallen into. A data block has no such guard, so this only gets spliced
// into a spot in bbasic.bb.hbs that is never reached by falling off the end of
// the main loop (see the "Data tables" section at the end of that template).
//
// This string is spliced into the hbs template directly (like
// generateBackgrounds()/generateAnimations()), never passing through
// normalizeIndents() - so indentation has to be written literally here. The
// compiler requires the opposite of what "end" needs elsewhere in this file:
// "data <name>" and its value rows must be indented, but "end" must sit at
// column 0 - confirmed by testing directly against the bundled compiler,
// since getting either one backwards produces a graceful "Unknown keyword"
// compile error rather than a parse failure.
// A table can only be read correctly from the same bank it's declared in
// (see dataTableSymbolName/trackDataTableBank), so each bank that reads a
// table needs its  physical copy, emitted alongside whatever else lives
// in that bank - callers pass the bank they're currently emitting content
// for (bank 1's copies go in the shared "Data tables" section below; a
// relocated event's  bank gets its copies alongside that event's code).
// A table nothing ever read is not emitted at all.
Blockly.BBasic.generateDataTables = function(bank) {
  const data = Blockly.BBasic.getDataTablesData();
  if (!data) return '';

  return data.dataTables
      .filter((table) => table.values && table.values.length)
      .filter((table) => {
        // A table no block reads is left out of the ROM entirely.
        const usage = Blockly.BBasic.dataTableBankUsage[table.id];
        return !!usage && usage.has(bank);
      })
      .map((table) => {
        const name = dataTableSymbolName(table, bank);
        // Formatted (decimal literal, an 8-bit %binary literal, or a
        // $-prefixed hex literal - see DataEditor.vue's  valueFormat/
        // toggleValueFormat) BEFORE chunking into rows of 16, so each
        // value's  format travels with it regardless of which row it
        // lands in. table.valueFormats may be shorter than table.values (or
        // missing entirely, for any table saved before this existed) - a
        // value with no format entry of its  defaults to decimal,
        // unchanged from before this feature existed. Confirmed directly
        // that batari Basic's "data" statement accepts a %binary
        // literal mixed freely with decimal ones in the very same table
        // (compiled a real ROM with both in one row before this was built);
        // $hex uses the exact same DASM numeric-literal syntax math_number's
        // hex support already relies on (see generators/bbasic/math.js).
        const formatted = table.values.map((value, i) => {
          const clamped = Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
          const format = (table.valueFormats && table.valueFormats[i]) || 'dec';
          if (format === 'bin') return `%${clamped.toString(2).padStart(8, '0')}`;
          if (format === 'hex') return `$${clamped.toString(16).padStart(2, '0').toUpperCase()}`;
          return `${clamped}`;
        });
        const rows = chunk(formatted, 16).map((row) => '  ' + row.join(', '));
        return ` data ${name}\n${rows.join('\n')}\nend`;
      })
      .join('\n\n');
};

// Builds one subroutine's "label / body / return" block - shared by
// generateSubroutines (bank 1) and generateRelocatedSections (any other
// bank) below, since the block itself is identical either way; only WHERE
// it gets spliced differs. See generateSubroutines'  comment for why each
// entry needs its  normalizeIndents() pass.
const generateSubroutineBody = (name, body) => Blockly.BBasic.normalizeIndents([
  `@${name}`,
  body,
  'return',
].join('\n'));

// Splices every user-defined subroutine (see subroutine_define in
// generators/bbasic/subroutine.js) STILL ASSIGNED TO BANK 1 into its
// "label / body / return" block. Placed in bbasic.bb.hbs right after
// commongamelogic's "return" - the same never-fallen-into spot data
// tables use, for the same reason: nothing above ever runs off the end into
// it, everything either loops back with "goto" or returns from a "gosub". A
// subroutine relocated to another bank (see getSubroutineBank/
// generateRelocatedSections) is emitted in its  bank's  section
// instead - a data table can only be read correctly from the same bank it's
// declared in (see trackDataTableBank's  comment), and the exact same
// reasoning applies to a subroutine's  body once anything it does is
// bank-sensitive.
Blockly.BBasic.generateSubroutines = function() {
  return Object.entries(Blockly.BBasic.subroutines)
      .filter(([name]) => Blockly.BBasic.getSubroutineBank(name) === Blockly.BBasic.primaryBank())
      .map(([name, body]) => generateSubroutineBody(name, body))
      .join('\n\n');
};

// Builds one function's "function <name> ... @end" block - shared by
// generateFunctions (bank 1) and generateRelocatedSections (any other bank)
// below, mirroring generateSubroutineBody's  split. "function <name>" is
// batari Basic's  real header for this (not a bare "@name" label), and
// the body already ends in an explicit "return <value>" from a
// function_return block, so unlike generateSubroutineBody this never
// appends its  trailing "return" - one always defined by a function's
// real syntax, would be unreachable dead code past every branch's
// return, or (for a body with no function_return block at all - a project
// mistake, not something to paper over) a bare valueless "return" that
// doesn't match the "always returns a number" contract every function_call
// site assumes.
//
// "function ... end" needs a literal closing "end", exactly like
// "data ... end"/"asm ... end" - confirmed directly against the reference bB
// compiler's  source: endfunction() exists specifically to reset
// doingfunction back to 0 when it sees that keyword ("if (!doingfunction)
// prerror('extraneous end keyword encountered')"), meaning bB's  parser
// expects one. This was missing here entirely at first - a genuine,
// pre-existing bug (not introduced by any generator that fills in a
// function's  body), confirmed as the actual cause of a real
// "auto: failed" emulator crash: with no explicit terminator, the function's
// compiled body has nothing marking where it ends, corrupting whatever
// assembles right after it. "@end" (not a bare "end") for the same reason
// generateSubroutineBody's "@name" label uses it - normalizeIndents
// below indents every line by default, but a "@"-prefixed line has that
// prefix (and the indent it would otherwise get) stripped back to column 0
// in its  second pass, matching the same "data ${name}\n...\nend" shape
// unindented "end" lines already use everywhere else in this codebase.
//
// "return 0" unconditionally appended right before "@end" - a SECOND,
// independently real bug, exposed cleanly by a fully-disabled function body
// (no reachable function_return block left at all): unlike a subroutine
// (which always falls through into an auto-appended trailing "return" - see
// generateSubroutineBody), a function has NO implicit exit; it
// only ever exits via an explicit "return <value>" from a function_return
// block. A body with no reachable return at all (every function_return
// disabled/removed, or more generally any code path that doesn't end in
// one) falls straight through "end" into whatever's compiled right after it
// - confirmed directly against a real generated ROM: a function with
// everything inside disabled produced "function name\n  rem ...\nend" with
// no return statement anywhere, meaning calling it executes straight into
// the Data tables section as if it were code. A trailing "return 0" is
// always safe to add: unreachable dead code (a few bytes) whenever the
// user's  blocks already guarantee a return on every path, and the only
// thing standing between "call this function" and silently corrupting
// execution otherwise. (Not a bare "return" - see this generator's
// contract that a function call is a Number expression above - "return 0"
// satisfies that the same way a genuine function_return block's  value
// does.)
const generateFunctionBody = (name, body) =>
  Blockly.BBasic.normalizeIndents(`function ${name}\n${body}\nreturn 0\n@end`);

// Splices every user-defined function (see function_define in
// generators/bbasic/function.js) STILL ASSIGNED TO BANK 1 into the same
// never-fallen-into spot generateSubroutines uses, right alongside it. A
// function relocated to another bank (see getFunctionBank/
// computeFunctionFamilies in hooks/rom.js) is emitted in its  bank's
// section instead by generateRelocatedSections below, same as a relocated
// subroutine.
Blockly.BBasic.generateFunctions = function() {
  return Object.entries(Blockly.BBasic.functions)
      .filter(([name]) => Blockly.BBasic.getFunctionBank(name) === Blockly.BBasic.primaryBank())
      .map(([name, body]) => generateFunctionBody(name, body))
      .join('\n\n');
};

// DPC+ only: which Player 2 to 9 shows the right half of each player's 16 pixel wide animations (see utils/wide-sprite.js).
// A player gets one when any animation it can reach is wide; it takes the lowest Player 2 to 9 no block uses and no other
// wide player has. {player0: 'player2'} for example. Only as many wide players as there are free sprites get one.
// The players (as 'player0' to 'player9') some enabled block names: in a Player field, as an object (Seek, Inertia, Fire, Bounce),
// in a Collided or Lock block, or in a player variable.
const playersUsedByBlocks = (workspace) => {
  const used = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (!block.isEnabled() || !block.getField) return;
    const player = block.getField('PLAYER') ? block.getFieldValue('PLAYER') : null;
    if (/^[0-9]$/.test(String(player))) used.add(`player${player}`);
    ['OBJECT', 'MISSILE', 'VAR0', 'VAR1', 'CHILD', 'PARENT', 'VAR'].forEach((fieldName) => {
      const value = block.getField(fieldName) ? String(block.getFieldValue(fieldName)) : '';
      const named = /^(?:__)?(player\d)/.exec(value);
      if (named) used.add(named[1]);
    });
  });
  return used;
};

const resolveWidePartners = (usedPlayerAnimations, usedByBlocks, dpcPlus = true, referencedPlayers = new Set()) => {
  const animations = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage()).animations || [];
  const wideIndices = animations.map((animation, index) => (isWideAnimation(animation) ? index : -1)).filter((i) => i >= 0);
  const partners = {};
  if (!wideIndices.length) return partners;
  if (!dpcPlus) {
    // The standard kernel has no virtual sprites: the other hardware player shows the right half, so only one player can have
    // wide animations (Player 0 if both do) and the other one is not free for anything else.
    const reaches = (name) => {
      const reachable = (usedPlayerAnimations || {})[name];
      return (name === 'player0' || referencedPlayers.has(name)) &&
        (reachable === null || (reachable && wideIndices.some((index) => reachable.has(index))));
    };
    if (reaches('player0')) partners.player0 = 'player1';
    else if (reaches('player1')) partners.player1 = 'player0';
    return partners;
  }
  const taken = new Set(usedByBlocks);
  Object.keys(usedPlayerAnimations || {}).sort().forEach((name) => {
    const reachable = usedPlayerAnimations[name];
    // Only a player the project shows gets a partner: Player 0 always is, the others when a block uses them.
    if (name !== 'player0' && !referencedPlayers.has(name)) return;
    if (!(reachable === null || wideIndices.some((index) => reachable.has(index)))) return;
    for (let n = 2; n <= 9; n++) {
      if (!taken.has(n)) {
        taken.add(n);
        partners[name] = `player${n}`;
        return;
      }
    }
  });
  return partners;
};

// Every frame, after everything that moves sprites has run: the sprite that shows the right half of a wide player goes to
// where the player is, the width of the picture to the right of it (8 pixels, 16 at double size, 32 at quad size), and takes
// its height. (See processWidePartner in generateAnimations for the rest of what it follows.)
Blockly.BBasic.generateWidePartnerSync = function() {
  const partners = this.widePartners || {};
  const lines = [];
  Object.entries(partners).forEach(([owner, name]) => {
    const id = this.blockNumbers.next(`widepartner_${name}`);
    lines.push(` rem ${name} beside ${owner}:`,
        ` if ${name}frame = 255 then goto _widepartner_${name}_${id}_done`,
        ...(((this.sharedPartnerVars || {})[name]) ? [` if ${name}size{6} then goto _widepartner_${name}_${id}_done`] : []),
        ` ${name}y = ${owner}y`,
        ` temp1 = ${owner}size & 7`,
        ` temp2 = 8`,
        ` if temp1 = 5 then temp2 = 16`,
        ` if temp1 = 7 then temp2 = 32`,
        ` ${name}x = ${owner}x + temp2`,
        `_widepartner_${name}_${id}_done`);
  });
  return lines.length ? lines.join('\n') + '\n' : '';
};

Blockly.BBasic.generateAnimations = function() {
  // Reset fresh every generation, same reasoning/mechanism as
  // musicGateAsmFiles in generators/bbasic/music.js - hooks/rom.js merges
  // this into the compiler's siblingFiles after regenerateCode(), the same
  // "inline text12a.asm" mechanism (see text-minikernel-files.js).
  Blockly.BBasic.playerAnimAsmFiles = {};

  // DPC+ copies a sprite's graphic and color data into display RAM each time its data statement runs, which
  // costs many 6502 cycles - run every frame, it made the frames the wrong length. So bit 7 of the player's size
  // variable says whether the picture and colors are loaded: it is cleared by whatever changes the animation or
  // the color (see assignAndReload in generators/bbasic/sprites.js), and a picture is also loaded again whenever the
  // frame counter reaches the first frame of one.
  const isDpcPlus = (useConfigurationStorage().value || {}).kernel === 'dpcplus';

  // A solid color table per color the project gives the player (the default one first), the one matching the
  // player's color variable pointed at whenever the loaded flag is clear. The tables are as tall as the tallest
  // picture.
  const colorSectionFor = (name, playerData, slaveOf) => {
    const rows = Math.max(1, ...playerData.animations.flatMap((animation) =>
      (animation ? animation.frames : []).map((frame) => frame.pixels.length))) * 2;
    const colorVar = `${name}realcolor`;
    // The sprite showing the right half of a wide player is colored like the player is.
    const colorOwner = slaveOf || name;
    const defaultColor = colorOwner === 'player0' ? 0x40 : colorOwner === 'player1' ? 0x80 :
      Number(colorOwner.slice(6)) * 3 % 16 * 16 + 14;
    const given = [defaultColor, ...[...(Blockly.BBasic.dpcPlusPlayerColors[colorOwner] || [])]
        .filter((color) => color !== defaultColor)];
    // A fade steps the brightness of the color the player has (so any hue the player is given) toward the target, and
    // lands on the target, so every brightness of those hues and the target itself get a table too.
    const fades = [...(Blockly.BBasic.dpcPlusPlayerFades[colorOwner] || [])];
    const colors = fades.length ? [...new Set([...given,
      ...[...new Set([...given, ...fades].map((color) => color & 0xF0))]
          .flatMap((hue) => Array.from({length: 8}, (_, i) => hue | (i * 2))),
      ...fades])] : given;
    const hex = (byte) => '$' + byte.toString(16).toUpperCase().padStart(2, '0');
    const label = (i) => `${name}color${i}`;
    const endLabel = `${name}colorEnd`;
    const table = (color, i) => (i ? `${label(i)}\n` : '') +
      Blockly.BBasic.wrapRelocatableGraphics(`${name}colortable${i}`,
          [`  ${name}color:`, ...Array(rows).fill('  ' + hex(color)), 'end'].join('\n')) +
      `\n  goto ${endLabel}`;
    return `\n  rem Color for ${name}:\n` +
      `  if ${name}size{7} then goto ${endLabel}\n` +
      colors.slice(1).map((color, i) => `  if ${colorVar} = ${hex(color)} then goto ${label(i + 1)}`).join('\n') +
      '\n' + table(defaultColor, 0) + '\n' +
      colors.slice(1).map((color, i) => table(color, i + 1)).join('\n') +
      `\n${endLabel}\n`;
  };

  // slaveOf: for the sprite that shows the right half of a wide player, the player it follows; its frame counter is the
  // player's, so it does not count frames and it only has the wide animations.
  const processAnimation = (name, animation, animationIndex, slaveOf = null) => {
    if (!animation) {
      return '';
    }
    // A wide animation is drawn whole only where a second sprite is there to show its right half.
    const wide = isWideAnimation(animation) && !!(slaveOf || (this.widePartners || {})[name]);
    // The player shows the left half of a picture, the other sprite the right half; a flipped picture swaps them. Without
    // one a wide animation shows its left half only.
    const halfOf = (rows, side) => (isWideAnimation(animation) ? rows.map((row) => splitWideRow(row)[side]) : rows);
    const firstSide = slaveOf ? 'right' : 'left';
    const otherSide = slaveOf ? 'left' : 'right';

    const animationLabel = `${name}animation${animationIndex}`;
    const totalDuration = sumBy(animation.frames, (frame) => clampFrameDuration(frame.duration));

    // Two frames with pixel-for-pixel identical bitmaps (e.g. a walk cycle
    // that returns to its  starting pose) don't need to store that
    // bitmap's  8 graphic bytes twice - a later duplicate just jumps
    // straight into the FIRST frame's  already-emitted "name: ... end"
    // block instead of re-declaring the same rows again. Scoped to THIS
    // ONE animation only (a fresh Map per processAnimation call, not
    // shared across animations): every frame of one animation is always
    // wrapped into the exact same relocatable unit together (see
    // wrapRelocatableGraphics below - one unit per ANIMATION, not per
    // frame), so a plain "goto" between two of its  frames is always
    // safe. Two DIFFERENT animations' frames are NOT deduped against each
    // other even if identical - they're separate relocatable units that
    // can each land in a different bank, and a bank isn't known until
    // later (rom.js's  allocator), so a cross-animation "goto" here
    // could easily become an illegal cross-bank jump.
    // A frame that repeats an earlier frame's picture AND its row colors jumps to that frame's entry (its color
    // block, then the shared graphic); one that repeats only the picture gets a color block and jumps to
    // the earlier frame's graphic. Frame picture and color block are two separate pieces of declarative
    // code, so a color block can come first and the picture block after it.
    const pixelKeyToGraphicLabel = new Map();
    const fullKeyToEntryLabel = new Map();
    let frameLimit = 0;
    const stateMachine = animation.frames.map((frame, frameIndex) => {
      frameLimit += clampFrameDuration(frame.duration);
      const endLabel = `${animationLabel}frame${frameIndex}End`;
      const entryLabel = `${animationLabel}frame${frameIndex}Entry`;
      const skipCondition = `  if ${name}frame > ${frameLimit} then goto ${endLabel}\n`;
      const pixelKey = frame.pixels.map((row) => row.join('')).join('|') + (slaveOf ? '#R' : '');
      // Per-row sprite colors (useSpriteColorsFor, see Configuration.vue's
      // "enable per-row Player 0/1 sprite colors" toggles) - a real
      // "playercolor:" block declared right alongside this frame's graphic, exactly the same
      // way generateBackgrounds' buildPfcolors declares a "pfcolors:" block
      // right alongside each background's "playfield:" - both are real
      // batari Basic declarative triggers that take effect the instant
      // execution reaches them, not a runtime pointer assignment. Read with
      // the SAME row order (reversed, matching the graphic) since
      // the kernel indexes both tables with the exact same per-scanline y
      // (see std_kernel.asm's "lda (player0pointer),y" / "lda
      // (player0color),y" pair). Unlike buildPfcolors, no extra
      // padding/duplicate row is needed - that quirk was specific to the
      // playfield's pfres-based row-count math, not this 1:1 per-scanline
      // indexing, which the graphic pointer already relies on working
      // correctly.
      // DPC+ kernel reads sprite rows top-to-bottom at 1 scanline per row
      // (the standard kernel reads bottom-to-top at 2), so rows keep editor
      // order and each is doubled to keep the standard kernel's look.
      const orderRows = (rows) => isDpcPlus ?
        rows.flatMap((row) => [row, row]) : rows.slice().reverse();
      // Without per-row colors, DPC+ players get their color from the table chosen before the animations (see
      // colorSectionFor).
      const colorSource = this.useAnimationRowColors(slaveOf || name) ? (() => {
        const rowColors = frame.rowColors || [];
        const resolved = frame.pixels.map((_, i) => colorByteToBuildBBasic(rowColors[i] ?? DEFAULT_ROW_COLOR));
        const rows = orderRows(resolved).map((byte) => '  ' + byte);
        return `  ${name}color:\n` + rows.join('\n') + '\nend\n';
      })() : '';
      const fullKey = `${pixelKey}#${colorSource}`;

      // DPC+: a frame whose picture is on screen is left alone, unless the counter has just reached its first
      // frame (the first frame of this one is the frame after the previous one's last).
      const shownGuard = isDpcPlus ? (() => {
        const firstFrame = frameLimit - clampFrameDuration(frame.duration) + (frameIndex ? 1 : 0);
        return `  if ${name}size{7} && ${name}frame <> ${firstFrame} then goto ${animationLabel}animationEnd\n` +
          `  ${name}size{7} = 1\n`;
      })() : '';

      const existingEntryLabel = fullKeyToEntryLabel.get(fullKey);
      if (existingEntryLabel) {
        return skipCondition +
          shownGuard +
          `  goto ${existingEntryLabel}\n` +
          endLabel;
      }
      fullKeyToEntryLabel.set(fullKey, entryLabel);

      const existingGraphicLabel = pixelKeyToGraphicLabel.get(pixelKey);
      if (existingGraphicLabel) {
        return skipCondition +
          shownGuard +
          `${entryLabel}\n` +
          colorSource +
          `  goto ${existingGraphicLabel}\n` +
          endLabel;
      }

      const graphicLabel = `${animationLabel}frame${frameIndex}Graphic`;
      pixelKeyToGraphicLabel.set(pixelKey, graphicLabel);
      const graphicBlock = (rows) => `  ${name}:\n` +
        orderRows(rows).map((row) => '  %' + row.join('')).join('\n') +
        '\nend\n' +
        `  goto ${animationLabel}animationEnd\n`;
      // A wide frame's two halves: the flip bit picks which one this sprite shows.
      const wideTest = wide ? `  if ${name}size{3} then goto ${graphicLabel}Flipped\n` : '';
      const flippedBlock = wide ? `${graphicLabel}Flipped\n` + graphicBlock(halfOf(frame.pixels, otherSide)) : '';
      return skipCondition +
        shownGuard +
        `${entryLabel}\n` +
        colorSource +
        `${graphicLabel}\n` +
        wideTest +
        graphicBlock(halfOf(frame.pixels, firstSide)) +
        flippedBlock +
        endLabel;
    });

    // The Player editor's 1x/2x/4x preview-width toggle (previewWidthScale
    // - see PlayerEditor.vue's handleSetPreviewScale) used to be purely a
    // pixel-editor display aid with no effect on the compiled ROM at all -
    // now applied for real here, every frame this animation is the active
    // one (matching how player{N}size is already re-derived every frame by
    // the user's animation/size-changing blocks elsewhere in this
    // codebase - see generators/bbasic/collision.js's comment on that
    // same pattern), so it deliberately overrides whatever a "Set player
    // size" block elsewhere set moments earlier: the animation's
    // declared width wins for as long as that animation stays selected.
    // $F8 masks out only the low 3 NUSIZ bits (see sprite_player_size's
    // identical mask in generators/bbasic/sprites.js), preserving bit 6 (the
    // pause flag just below) and every other bit already in player{N}size.
    const sizeCode = {1: '$0', 2: '$5', 4: '$7'}[animation.previewWidthScale] || '$0';
    // A "set width/quantity" block for the player wins over the animation's width from then on (it is how the copy modes, which
    // the toggle has no place for, are used with an animated player).
    const sizeSet = this.sizeSetPlayers && this.sizeSetPlayers.has(name) ?
      this.nameDB_.getName(sizeSetVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
    const sizeSkipLabel = `${animationLabel}sizeSet`;
    const sizeLines = (sizeSet ? `  if ${sizeSet} then goto ${sizeSkipLabel}\n` : '') +
      `  ${name}size = ${name}size & $F8\n` +
      `  ${name}size = ${name}size | ${sizeCode}\n` +
      (sizeSet ? `${sizeSkipLabel}\n` : '');

    const pauseSkipLabel = `${animationLabel}pauseSkip`;
    // Bit 4 of {name}size ("loop disabled" - see blocks/sprites.js's LOOP
    // checkbox/animationLoopBitsCode in generators/bbasic/sprites.js, both
    // of which write it) decides what happens once the frame counter
    // reaches the end: 0 (the power-on default, matching the checkbox's
    // default-checked state) wraps back to 0 exactly like before this
    // feature existed; 1 freezes on the last frame instead and sets bit 5
    // ("finished"), which sprite_player_animation_finished's generator
    // (generators/bbasic/sprites.js) checks-and-clears. Bit 5 is only ever
    // written when something actually watches it
    // (resolvePlayerAnimationFinishedWatches, read here via
    // Blockly.BBasic.playerAnimationFinishedWatches, same "don't pay for a
    // flag nothing reads" reasoning generateBackgroundFadeChecks' isWatched
    // already uses) - a no-loop animation with no matching watch block
    // anywhere just freezes, same as one with the watch.
    const noLoopLabel = `${animationLabel}noLoop`;
    const wrapDoneLabel = `${animationLabel}wrapDone`;
    const finishedWatches = Blockly.BBasic.playerAnimationFinishedWatches;
    const isFinishedWatched = !!(finishedWatches && finishedWatches.has(name));
    if (slaveOf) {
      return `  rem Animation ${animationIndex} ${animation.name} for ${name}, the right half of ${slaveOf}:\n\n` +
        stateMachine.join('\n\n') +
        `\n\n${animationLabel}animationEnd`;
    }
    return `  rem Animation ${animationIndex} ${animation.name} for ${name}:\n\n` +
      sizeLines +
      `  if ${name}size{6} then goto ${pauseSkipLabel}\n` +
      `  ${name}frame = ${name}frame + 1\n` +
      `  if ${name}frame < ${totalDuration} then goto ${wrapDoneLabel}\n` +
      `  if ${name}size{4} then goto ${noLoopLabel}\n` +
      `  ${name}frame = 0\n` +
      `  goto ${wrapDoneLabel}\n` +
      `${noLoopLabel}\n` +
      `  ${name}frame = ${totalDuration} - 1\n` +
      (isFinishedWatched ? `  ${name}size{5} = 1\n` : '') +
      `${wrapDoneLabel}\n` +
      `${pauseSkipLabel}\n\n` +
      stateMachine.join('\n\n') +
      `\n\n${animationLabel}animationEnd`;
  };

  const processAnimations = (name, playerStorage) => {
    let playerData = null;
    try {
      playerData = processPlayerAnimationsStorageDefaults(playerStorage);
    } catch (e) {
      console.error(`Failed to load ${name} data`, e);
    }

    if (!playerData) {
      return '';
    }

    // null (see resolveUsedPlayerAnimations'  comment) means every index
    // has to be kept - the safe fallback whenever this player's
    // animation selection couldn't be proven statically.
    const usedIndices = Blockly.BBasic.usedPlayerAnimations && Blockly.BBasic.usedPlayerAnimations[name];
    const isUsed = (animationIndex) => !usedIndices || usedIndices.has(animationIndex);

    const animationsLabel = `${name}animations`;
    const animationsStartLabel = `${animationsLabel}Start`;
    const animationsEndLabel = `${animationsLabel}End`;
    const getAnimationStartLabel = (animationIndex) => `${name}animation${animationIndex}Start`;

    // Only the sprite payload itself is relocatable - the guard/label pair
    // around it stays inline in bank 1 no matter what (see the matching note
    // in generateBackgrounds): a bare "goto animationsStartLabel"/"goto
    // animationsEndLabel" only ever needs a bank tag if the LABEL it targets
    // physically moves, and neither of these ever does.
    const hiddenPayload = [`  ${name}:`, `  %00000000`, `end`].join('\n');
    // A player with a hidden flag runs its animation either way, and the flag then draws the blank picture over the animation's.
    const hasFlag = hasHiddenFlag(Blockly, name);
    const hiddenplayerHandler = hasFlag ? '' : [
      `  if ${name}frame <> 255 then goto ${animationsStartLabel}`,
      ...(isDpcPlus ? [`  ${name}size{7} = 0`] : []),
      Blockly.BBasic.wrapRelocatableGraphics(`${name}default`, hiddenPayload),
      `  goto ${animationsEndLabel}\n`,
      animationsStartLabel,
    ].join('\n');

    // The color tables load first, whenever the picture is about to be loaded again (a hidden player does not).
    const colorSection = isDpcPlus && !this.useAnimationRowColors(name) ? colorSectionFor(name, playerData) : '';
    return `  rem Animations for ${name}:\n\n` +
      hiddenplayerHandler +
      colorSection +
      playerData.animations.map((animation, animationIndex) => {
        if (!animationIndex || !isUsed(animationIndex)) return '';
        return `  if ${name}animation = ${animationIndex} then goto ${getAnimationStartLabel(animationIndex)}`;
      }).join('\n') +
      '\n\n' +
      playerData.animations.map((animation, animationIndex) => {
        if (!isUsed(animationIndex)) return '';
        const unitKey = `${name}animation${animationIndex}`;
        const payload = processAnimation(name, animation, animationIndex);
        // Same rationale as hiddenplayerHandler above: this label stays
        // inline in bank 1 regardless of where the animation's  frames
        // end up, so the dispatch conditions above (and this exit) never
        // need a bank tag.
        return `${getAnimationStartLabel(animationIndex)}\n\n` +
          Blockly.BBasic.wrapRelocatableGraphics(unitKey, payload) +
          `\n  goto ${animationsEndLabel}`;
      }).join('\n\n') +
      `\n\n${animationsEndLabel}` +
      (hasFlag ? [`\n  if !${hiddenFlagRef(Blockly, name)} then goto ${name}hiddenDone`,
        Blockly.BBasic.wrapRelocatableGraphics(`${name}default`, hiddenPayload), `${name}hiddenDone`].join('\n') : '');
  };

  // The sprite that shows the right half of a player's wide animations (see utils/wide-sprite.js). Every frame it takes over
  // what the player has: the animation, the frame, the color, the size and flip, and the position (the width of the
  // picture to the right of the player's), and it is hidden whenever the player is not on a wide animation.
  const processWidePartner = (name, owner, playerStorage) => {
    const playerData = processPlayerAnimationsStorageDefaults(playerStorage);
    const usedIndices = Blockly.BBasic.usedPlayerAnimations && Blockly.BBasic.usedPlayerAnimations[owner];
    const isUsed = (animationIndex) => !usedIndices || usedIndices.has(animationIndex);
    const wideIndices = playerData.animations.map((animation, index) =>
      (isWideAnimation(animation) && isUsed(index) ? index : -1)).filter((index) => index >= 0);
    if (!wideIndices.length) return '';
    const animationsEndLabel = `${name}animationsEnd`;
    // DPC+: the animation, the frame and the color are the player's variables under another name (see sharedPartnerVars), so
    // there is nothing to copy; the sprite is hidden by bit 6 of its size byte, set while the player is not on a wide animation
    // (a hidden player has frame 255, which hides this sprite as well), and bit 7 says its picture is loaded as it does for any
    // player. What redraws the player (a changed animation or color, see assignAndReload in sprites.js) redraws this sprite
    // too: the flag of the player is looked at before the animations run (see the start of generateAnimations).
    const shared = isDpcPlus && !!(this.sharedPartnerVars || {})[name];
    const sync = (shared ? [
      `  rem ${name} follows ${owner}, the left half of its 16 pixel wide animations:`,
      ...wideIndices.map((index) => `  if ${owner}animation = ${index} then goto ${name}syncWide`),
      `  ${name}size{6} = 1`,
      `  goto ${name}syncDone`,
      `${name}syncWide`,
      `  temp1 = ${owner}size & 8`,
      `  temp2 = ${name}size & 8`,
      `  if temp1 <> temp2 then ${name}size{7} = 0`,
      `  temp1 = ${owner}size & $0F`,
      `  temp2 = ${name}size & $80`,
      `  ${name}size = temp1 | temp2`,
      `${name}syncDone`,
    ] : [
      `  rem ${name} follows ${owner}, the left half of its 16 pixel wide animations:`,
      ...wideIndices.map((index) => `  if ${owner}animation = ${index} then goto ${name}syncWide`),
      `  ${name}frame = 255`,
      `  goto ${name}syncDone`,
      `${name}syncWide`,
      `  temp1 = ${owner}size & 8`,
      `  temp2 = ${name}size & 8`,
      ...(isDpcPlus ? [`  if temp1 <> temp2 then ${name}size{7} = 0`,
        `  if ${name}animation <> ${owner}animation then ${name}size{7} = 0`,
        `  if ${name}realcolor <> ${owner}realcolor then ${name}size{7} = 0`] : []),
      `  ${name}animation = ${owner}animation`,
      `  ${name}realcolor = ${owner}realcolor`,
      `  temp1 = ${owner}size & $0F`,
      ...(isDpcPlus ? [`  temp2 = ${name}size & $80`, `  ${name}size = temp1 | temp2`] : [`  ${name}size = temp1`]),
      `  ${name}frame = ${owner}frame`,
      // A hidden player's partner is hidden with it, though the frame of that player goes on.
      ...(hasHiddenFlag(Blockly, owner) ? [`  if ${hiddenFlagRef(Blockly, owner)} then ${name}frame = 255`] : []),
      `${name}syncDone`,
    ]).join('\n');
    const hiddenPayload = [`  ${name}:`, `  %00000000`, `end`].join('\n');
    const hiddenHandler = (shared ? [
      `  if ${name}size{6} then goto ${name}hiddenStart`,
      `  if ${name}frame <> 255 then goto ${name}animationsStart`,
      `${name}hiddenStart`,
      `  ${name}size{7} = 0`,
      Blockly.BBasic.wrapRelocatableGraphics(`${name}default`, hiddenPayload),
      `  goto ${animationsEndLabel}\n`,
      `${name}animationsStart`,
    ] : [
      `  if ${name}frame <> 255 then goto ${name}animationsStart`,
      ...(isDpcPlus ? [`  ${name}size{7} = 0`] : []),
      Blockly.BBasic.wrapRelocatableGraphics(`${name}default`, hiddenPayload),
      `  goto ${animationsEndLabel}\n`,
      `${name}animationsStart`,
    ]).join('\n');
    const colorSection = isDpcPlus && !this.useAnimationRowColors(owner) ? colorSectionFor(name, playerData, owner) : '';
    return `${sync}\n\n  rem Animations for ${name}:\n\n` +
      hiddenHandler +
      colorSection +
      wideIndices.map((index) => `  if ${name}animation = ${index} then goto ${name}animation${index}Start`).join('\n') +
      `\n  goto ${animationsEndLabel}\n\n` +
      wideIndices.map((index) => {
        const payload = processAnimation(name, playerData.animations[index], index, owner);
        return `${name}animation${index}Start\n\n` +
          Blockly.BBasic.wrapRelocatableGraphics(`${name}animation${index}`, payload) +
          `\n  goto ${animationsEndLabel}`;
      }).join('\n\n') +
      `\n\n${animationsEndLabel}\n` +
      (shared ? `  if ${name}size{6} then goto ${name}heightDone\n` : '') +
      `  if ${name}frame <> 255 then ${name}height = ${owner}height` +
      (shared ? `\n${name}heightDone` : '');
  };

  // Both hardware players compile from the SAME shared animation pool now
  // (see hooks/project.js's usePlayerAnimationsStorage) - each is still
  // called separately (its  label prefix, its  relocatable unit per
  // animation), so the compiled ROM still contains two independent copies
  // of any animation both players use. True byte-level dedup would need a
  // pointer-aliasing scheme (like sprite_*_rom_noise's  player0pointer/
  // player1pointer trick) plus bank-pinning in the relocator - a separate,
  // bigger change, not done here.
  const playerAnimationsStorage = usePlayerAnimationsStorage();
  // The sprites that show the right half of wide players come last: they copy what the players' code has just worked out.
  const partners = this.widePartners || {};
  const partnerNames = new Set(Object.values(partners));
  // (Under the standard kernel the partner is the other hardware player, which is then not animated by itself.)
  const hardwareCode = ['player0', 'player1'].map((player) => (partnerNames.has(player) ? '' :
    processAnimations(player, playerAnimationsStorage)));
  const extraCode = (this.dpcPlusExtraPlayers || []).filter((n) => !partnerNames.has(`player${n}`)).map((n) =>
    processAnimations(`player${n}`, playerAnimationsStorage));
  const partnerCode = Object.entries(partners).map(([owner, partner]) =>
    processWidePartner(partner, owner, playerAnimationsStorage));
  // A player whose picture has to be loaded again (its flag, bit 7 of its size byte, is clear) has its partner load its picture again too,
  // so the partners look at the flags before any animation code sets them.
  const partnerResets = Object.entries(this.sharedPartnerVars || {}).filter(([partner]) => partnerNames.has(partner))
      .map(([partner, owner]) => ` if !${owner}size{7} then ${partner}size{7} = 0`);
  return [...(partnerResets.length ? [partnerResets.join('\n')] : []), ...hardwareCode, ...extraCode, ...partnerCode].join('\n\n\n');
};
import background, {backgroundGetPixelDevVarsNeeded, registerBackgroundLineSubroutine,
  reserveShakeScreenDevVar, generateShakeScreenChecks} from './bbasic/background';
import bit from './bbasic/bit';
import collision from './bbasic/collision';
import color from './bbasic/color';
import colour from './bbasic/colour';
import data, {dataDispatchArg1VarName, dataDispatchArg2VarName,
  dataBitDispatchArg3VarName} from './bbasic/data';
import event from './bbasic/event';
import functionGenerators from './bbasic/function';
import input from './bbasic/input';
import logic from './bbasic/logic';
import loops, {REPEAT_BOUND_VAR_NAME, REPEAT_COUNTER_VAR_NAME, WAIT_FRAMES_COUNTER_VAR_NAME,
  repeatBoundVarNeeded} from './bbasic/loops';
import math from './bbasic/math';
import music from './bbasic/music';
import random from './bbasic/random';
import score from './bbasic/score';
import sound from './bbasic/sound';
import soundfx, {soundEffectChannelHasEnvelope, resetEnvelopeConfigs} from './bbasic/soundfx';
import sprites from './bbasic/sprites';
import subroutine from './bbasic/subroutine';
import text from './bbasic/text';
import textMinikernel from './bbasic/text-minikernel';
import titlescreen, {TITLE_SCREEN_SUBROUTINE_NAME, TITLE_FADE_CHECKS_NAME} from './bbasic/titlescreen';
import variables from './bbasic/variables';
import {findGameplayOnlyNames} from '../utils/title-liveness';
import {dpcTileMarker} from '../utils/dpc-tile';
import {runOnceResetLines, runOnceClearLines, runOnceStartupLines} from '../utils/dpc-ram-flags';
import {collectChipChannels, createDpcPlusAudioPlan, DPC_AUDIO_SUBROUTINE_NAME, dpcAudioVars, redirectSoundRegisters} from './bbasic/dpcplus-audio';

[background, bit, collision, color, colour, data, event, functionGenerators, input, logic, loops, math, music,
  random, score, sound, soundfx, sprites, spriteLock, subroutine, text, textMinikernel, titlescreen, variables]
    .forEach((init) => init(Blockly));

// Which of OMITTABLE_SYSTEM_VARIABLES the finished code never touches apart from the template's starting
// value and its once-a-frame restore of the colour registers.
const findUnusedSystemVars = (code) => {
  const ownLines = new RegExp(
      `(^\\s*dim (${Object.keys(OMITTABLE_SYSTEM_VARIABLES).join('|')})\\b.*$)|(^.*${SYSTEM_DEFAULT_MARKER}$)|` +
      '(^\\s*COLUP[01] = player[01]realcolor\\s*$)|(^\\s*COLUBK = backgroundrealcolor\\s*$)|' +
      '(^\\s*COLUPF = playfieldrealcolor\\s*$)', 'gm');
  const rest = code.replace(ownLines, '');
  return new Set(Object.keys(OMITTABLE_SYSTEM_VARIABLES).filter((name) => !new RegExp(`\\b${name}\\b`).test(rest)));
};

// A first pass writes the project out as usual; if it shows that some system variables are only ever
// touched by the fixed template, a second pass leaves them out, so their slots (or, for the colours, a
// plain constant) replace the RAM they would have taken.
const generateWithoutUnusedSystemVars = Blockly.BBasic.workspaceToCode;
const isTooManyVariables = (error) => !!error && /^Too many variables/.test(error.message || '');
// One pass of generation. When the project has more variables than slots the pass is run again as a probe, which carries on without
// the ones that do not fit (see spillProbe in init), so the code can still be looked at: the unused system variables it shows free
// slots, and what is left over can be told apart (see this.tooMany).
Blockly.BBasic.generateOnce = function(workspace) {
  this.spillProbe = false;
  this.tooMany = null;
  try {
    return generateWithoutUnusedSystemVars.call(this, workspace);
  } catch (error) {
    if (!isTooManyVariables(error)) throw error;
    this.spillProbe = true;
    try {
      const probeCode = generateWithoutUnusedSystemVars.call(this, workspace);
      this.tooMany = error;
      return probeCode;
    } finally {
      this.spillProbe = false;
    }
  }
};
// A variable the generated code still names after it was given a place in the display memory is used in a way that cannot be
// handled there (see generators/bbasic/spill.js): it is left out of the ones that go there, and the code is generated again.
Blockly.BBasic.workspaceToCode = function(workspace) {
  // (The names found unfit in an earlier build of the same project, when the caller kept them, so they are not found out again.)
  this.displayRamExcluded = new Set(this.displayRamExcludedSeed || []);
  for (let attempt = 0; attempt < 8; attempt++) {
    const code = this.workspaceToCodeOnce(workspace);
    const left = (typeof code === 'string' && this.displayRamVars) ? remainingUses(code, [...this.displayRamVars.keys()]) : [];
    if (!left.length) return code;
    left.forEach((name) => this.displayRamExcluded.add(name));
  }
  return this.workspaceToCodeOnce(workspace);
};
Blockly.BBasic.workspaceToCodeOnce = function(workspace) {
  this.omittedSystemVars = new Set();
  this.gameplayOnlyHints = null;
  this.spillPlan = null;
  let code = this.generateOnce(workspace);
  if (typeof code !== 'string') return code;
  // Title Screen variables still taking a slot for themselves: the generated code shows which other variables only gameplay
  // touches, and those can take the title variables' place (see the hints in init).
  const hints = (this.titleUnhostedCount > 0) ? findGameplayOnlyNames(code) : null;
  const unused = code.includes(SYSTEM_DEFAULT_MARKER) ? findUnusedSystemVars(code) : new Set();
  // The Text Minikernel's score row follows the background color through the very byte this variable lives in.
  if (this.isTextMinikernelActive() && this.scoreBkColorIsBackground((useConfigurationStorage().value || {}).scoreBkColor)) {
    unused.delete('backgroundrealcolor');
  }
  if (unused.size || (hints && hints.names.size)) {
    this.omittedSystemVars = unused;
    this.gameplayOnlyHints = hints;
    code = this.generateOnce(workspace);
  }
  return this.tooMany ? this.spillInternalVariables(workspace, code) : this.spillInternalVariablesFirst(workspace, code);
};

// With DPC+ the display memory is used before the letters: the internal variables the generated code uses in plain places only (see
// generators/bbasic/spill.js) go there whether or not the letters would have been enough, so the letters are left to the
// variables of the project (which still take the letters first, and go in the display memory only when they run out).
// The system variables (see SYSTEM_VARIABLES) that can be in the display memory too: the ones the build keeps, that no other variable
// shares a slot with, and that no hand-written assembly outside the generated code reads by name.
// Another name is the same slot as this one (a Title Screen variable), so it has to stay where it is.
Blockly.BBasic.isSlotHost = function(name) {
  return (this.titleSharedSlots || []).some(({target}) => target === name);
};

Blockly.BBasic.spillableSystemVars = function(config) {
  const omitted = this.omittedSystemVars || new Set();
  const shared = new Set((this.titleSharedSlots || []).map(({target}) => target));
  const partnered = Object.keys(this.sharedPartnerVars || {}).length > 0;
  return SYSTEM_VARIABLES.map(([name]) => name).filter((name) => !omitted.has(name) && !shared.has(name) &&
    !(partnered && /^player[01](animation|frame|realcolor)$/.test(name)) &&
    // (The text cursor's blink reads the frame counter by name.)
    !(name === 'framecounter' && config.enableTextScrollCursor));
};

Blockly.BBasic.spillInternalVariablesFirst = function(workspace, code) {
  const config = (useConfigurationStorage().value) || {};
  if (config.kernel !== 'dpcplus' || this.dpcPlusScroll || dpcPlusPfresOf(config) > 127) return code;
  const readByAsm = new Set([textRow2ColorVarName, textLinesBaseVarName, textLinesMaxVarName, textScrollCursorColorVarName,
    textEndIconColorVarName].map((varName) => this.nameDB_.getName(varName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE)));
  // (A variable of the project that init() left on a letter, because a block uses it in a way its own Display RAM handling does not
  // cover, is looked at in the generated code like any other: if every use is in a plain place it goes too.)
  const internal = (this.letterVarAssignments || []).map(({name}) => name)
      .concat(this.spillableSystemVars(config))
      .filter((name) => !this.displayRamExcluded.has(name) && !readByAsm.has(name) && !this.isSlotHost(name));
  const room = DISPLAY_RAM_VAR_CAPACITY - this.displayRamVars.size;
  const plan = internal.length ? chooseSpill(code, internal, room, true, spillUseBudget(), 0) : null;
  if (!plan || !plan.size) return code;
  this.spillPlan = plan;
  const spilled = this.generateOnce(workspace);
  if (this.tooMany || typeof spilled !== 'string') {
    this.spillPlan = null;
    return code;
  }
  const slots = new Map([...this.displayRamVars].filter(([name]) => plan.has(name)));
  return applySpill(spilled, slots);
};

// The project has more variables than slots, even after the unused system variables gave theirs up (DPC+ only): the internal variables
// the generated code uses in plain places only (see generators/bbasic/spill.js) go in the display memory too, along with the user
// variables that init() moves there itself. `probeCode` is the code of the probing pass that told how many do not fit.
Blockly.BBasic.spillInternalVariables = function(workspace, probeCode) {
  const tooMany = this.tooMany;
  const config = (useConfigurationStorage().value) || {};
  const info = this.spillProbeInfo;
  if (config.kernel !== 'dpcplus' || !info || this.dpcPlusScroll || dpcPlusPfresOf(config) > 127) throw tooMany;
  // The Text Minikernel's hand-written asm reads these by name, which the text analysis cannot see.
  const readByAsm = new Set([textRow2ColorVarName, textLinesBaseVarName, textLinesMaxVarName, textScrollCursorColorVarName,
    textEndIconColorVarName].map((varName) => this.nameDB_.getName(varName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE)));
  const internal = info.names.concat(this.spillableSystemVars(config))
      .filter((name) => !this.displayRamExcluded.has(name) && !readByAsm.has(name) && !this.isSlotHost(name));
  const userRoom = info.userNames.filter((name) => info.names.includes(name) && this.displayRamEligibleNames.has(name)).length;
  // Not only as many as it takes: the display memory is used before the letters (see spillInternalVariablesFirst).
  const needed = Math.max(0, info.over - userRoom);
  const plan = chooseSpill(probeCode, internal, DISPLAY_RAM_VAR_CAPACITY - this.displayRamVars.size, true, spillUseBudget(), needed);
  if (!plan || plan.size < needed) throw tooMany;
  this.spillPlan = plan;
  const code = this.generateOnce(workspace);
  if (this.tooMany) throw this.tooMany;
  const slots = new Map([...this.displayRamVars].filter(([name]) => plan.has(name)));
  return applySpill(code, slots);
};

export default Blockly.BBasic;

