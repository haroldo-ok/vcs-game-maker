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

import Blockly from 'blockly/core';
import templateText from 'raw-loader!./bbasic.bb.hbs';
import Handlebars from 'handlebars';
import {sumBy, chunk} from 'lodash';

import {useBackgroundsStorage, useConfigurationStorage, useDataTablesStorage, usePlayer0Storage, usePlayer1Storage} from '../hooks/project';
import {DEFAULT_ROW_COLOR, processBackgroundStorageDefaults} from '../blocks/background';
import {dataTableSymbolName, processDataTablesStorageDefaults} from '../blocks/data';
import {matrixToPlayfield} from '../utils/pixels';
import {colorByteToBBasic} from '../utils/palette';
import {CUSTOM_SCORE_FONT, SQUISH_SCORE_FONT, SQUISH_CUSTOM_SCORE_FONT} from '../utils/score-font';
import {canonicalDistanceVarName} from '../utils/distance';
import {collisionMoveOldXVar, collisionMoveOldYVar} from './bbasic/collision';
import {scoreBkColorVarName} from './bbasic/score';
import {processPlayerStorageDefaults} from './bbasic/sprites';
import {resolveProjectMusic, musicIndexVarName, musicTimerVarName, musicPageVarName,
  musicFlagsVarName} from './bbasic/music';

const handlebarsTemplate = Handlebars.compile(templateText);

// The app's own bookkeeping variables, and the letters they're aliased to on
// the standard (non-Superchip) kernel. Without Superchip RAM, batari Basic's
// playfield buffer physically occupies the same zero-page bytes as var0-var43
// (playfieldbase = var0's address), so those "var" slots aren't safe to use -
// only 26 single letters are available, and these 14 claim most of them.
//
// With Superchip enabled, the playfield buffer moves to the separate SARA
// chip RAM page instead, freeing var0-var43 (plus var44-var47, which are
// always free). Moving these system variables into var0-13 there instead of
// letters frees all 26 letters for user variables - see generateSystemDims
// and the letter pool below.
export const SYSTEM_VARIABLES = [
  ['player0frame', 'x'],
  ['player1frame', 'z'],
  ['newbackground', 'y'],
  ['loopcounter', 'w'],
  ['channnel0duration', 'v'],
  ['channnel1duration', 'u'],
  ['player0size', 't'],
  ['player1size', 's'],
  ['player0realcolor', 'r'],
  ['player1realcolor', 'q'],
  ['playfieldrealcolor', 'm'],
  ['backgroundrealcolor', 'l'],
  ['player0animation', 'p'],
  ['player1animation', 'o'],
  ['framecounter', 'n'],
];

const ALL_LETTERS = 'abcdefghijklmnopqrstuvwxyz'.split('');
const SYSTEM_VARIABLE_LETTERS = SYSTEM_VARIABLES.map(([, letter]) => letter);

// Letters left over for user-created variables when Superchip is off (the
// system variables above claim the rest). All 26 are available when
// Superchip is on, since the system variables move into var0-13 instead.
export const USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP =
  ALL_LETTERS.filter((letter) => !SYSTEM_VARIABLE_LETTERS.includes(letter));

// text12b.asm (see generators/bbasic/text-minikernel.js) uses the bare
// single-letter symbol "B" as its own scratch byte ("sta B" / "ldx B",
// confirmed 5 times in its always-active text-drawing routine, once per
// displayed row, never gated behind "extendedtxt") - assuming, like a
// hand-written batari Basic program would, that it's free to borrow. DASM
// resolves that "B" to the exact same address as this app's own lowercase
// "b" (2600basic.h defines single-letter variables case-insensitively), so
// any user variable this app assigns to "b" gets silently overwritten every
// frame the Text Minikernel draws - confirmed by direct RAM inspection: a
// second movement-axis speed variable landing on "b" turned to garbage every
// other frame with the Text Minikernel active, and stayed correct with it
// disabled, all else unchanged. Reserved here as a normal-looking user
// variable letter never actually is when the Text Minikernel is active -
// same reasoning as aux1/aux2 being off-limits for pfcolors above.
const TEXT_MINIKERNEL_RESERVED_LETTERS = ['b'];

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
    // Everything in the current environment (835 items in Chrome, 104 in Node).
    Object.getOwnPropertyNames(Blockly.utils.global).join(','));

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
  // Same reset reasoning as textMinikernelUsed above - see math.js's
  // math_arithmetic handler, which sets this as a side effect.
  this.usesDivMul = false;

  // Normally textMinikernelUsed only becomes true as a side effect of a Text
  // block's own generator running, which happens well after user variable
  // letters are assigned below - too late to keep user variables away from
  // TEXT_MINIKERNEL_RESERVED_LETTERS. A quick pre-scan (block types only, no
  // code generation) determines this early enough to matter, and is
  // harmless to redo: every text_minikernel_* block's own generator sets the
  // same flag again later regardless.
  if (workspace.getAllBlocks(false).some((block) => block.type.startsWith('text_minikernel_'))) {
    this.textMinikernelUsed = true;
  }

  // Whether scorebkcolor (the Score tab's own background color picker - see
  // views/ScoreFontEditor.vue and generators/bbasic/score.js's
  // generateScoreBkColorRuntimeDims) needs its own dedicated dev var - only
  // when the Text Minikernel is active AND the picker isn't set to "Use
  // background color", which instead aliases scorebkcolor directly onto the
  // existing backgroundrealcolor system variable, needing nothing reserved
  // here. Same early-pre-scan reasoning as textMinikernelUsed itself:
  // needed before variable letters are handed out below.
  {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    this.scoreBkColorNeedsOwnVar = this.isTextMinikernelActive() && config.scoreBkColor !== 'background';
  }

  // Collects every distinct (axis, object pair) a "Distance" getter block
  // picks (see blocks/input.js), keyed by the same canonical name its own
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

  // Which players use the hardware-collision backtrack check block (see
  // blocks/collision.js) - each one needs its own pair of hidden bytes to
  // hold the position from before its last move, so this is decided before
  // variable letters are handed out below, same reason as the pre-scans
  // above.
  this.collisionMovePlayers = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'collision_check_position') this.collisionMovePlayers.add(block.getFieldValue('PLAYER'));
  });

  // Resolves which single song (if any) music_play_song blocks reference and
  // builds its per-channel data ahead of time (see generators/bbasic/music.js)
  // - needed this early so its hidden index/timer variables can be reserved
  // below, before nameDB_ hands out letters, same reasoning as the pre-scans
  // above. Stored on the instance (not module-level state) since this
  // Generator is a shared singleton reused across every workspaceToCode()
  // call - same reasoning as textMinikernelUsed above.
  this.projectMusic = resolveProjectMusic(workspace);

  // Run-once blocks (see blocks/event.js's event_run_once) fire once per
  // activation of whatever condition contains them (e.g. once each time an
  // enclosing "if BGScene = 2" becomes true, again next time it does), not
  // just once ever - which needs two bits of persistent state per instance,
  // not one: "fired" (already ran for the CURRENT activation) and "touched"
  // (this instance's gated code ran at all THIS frame). See
  // generateRunOnceEdgeReset below for how the two combine to detect a
  // fresh activation without the block itself ever seeing its own gate's
  // condition go false - and for why one bit alone can't do this safely (a
  // single shared frame-parity bit was considered and rejected: it only
  // detects the gate going false for an ODD number of frames, silently
  // failing to re-fire after an even-length gap).
  //
  // Both bits per instance share ONE byte (not two separate byte arrays):
  // low nibble bits 0-3 are 4 instances' own "touched" bits, high nibble
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
  // minikernel pre-scan above: by the time a run_once block's own generator
  // runs (see generators/bbasic/event.js), its flag byte's letter would
  // already need to be decided. runOnceCounter is what that generator
  // increments, one per instance, to assign each block its own byte+pair.
  this.runOnceCounter = 0;
  const runOnceBlockCount = workspace.getAllBlocks(false)
      .filter((block) => block.type === 'event_run_once').length;
  const runOnceByteCount = Math.ceil(runOnceBlockCount / 4);
  const runOnceByteNames = [...Array(runOnceByteCount).keys()].map((i) => `RunOnceFlags${i}`);

  if (!this.nameDB_) {
    this.nameDB_ = new Blockly.Names(this.RESERVED_WORDS_);
  } else {
    this.nameDB_.reset();
  }

  this.nameDB_.setVariableMap(workspace.getVariableMap());
  this.nameDB_.populateVariables(workspace);
  this.nameDB_.populateProcedures(workspace);

  const defvars = [];
  // Add developer variables (not created or named by the user).
  const devVarList = Blockly.Variables.allDeveloperVariables(workspace);
  for (let i = 0; i < devVarList.length; i++) {
    defvars.push(this.nameDB_.getName(devVarList[i],
        Blockly.Names.DEVELOPER_VARIABLE_TYPE));
  }

  // Same developer-variable bucket as above, for the hidden per-pair bytes
  // "Distance" blocks need (see the distanceChecks pre-scan above and
  // generators/bbasic/input.js's generateDistanceChecks) - routed through
  // nameDB_.getName here (rather than left as the raw canonical string) so
  // its own getter/check generators, which look the same name up again
  // later, are guaranteed to agree on whatever nameDB_ actually assigns.
  for (const varName of this.distanceChecks.keys()) {
    defvars.push(this.nameDB_.getName(varName, Blockly.Names.DEVELOPER_VARIABLE_TYPE));
  }

  // Same bucket again, for the collision-check backtrack bytes (see the
  // collisionMovePlayers pre-scan above and generators/bbasic/collision.js).
  for (const playerNum of this.collisionMovePlayers) {
    defvars.push(this.nameDB_.getName(collisionMoveOldXVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
    defvars.push(this.nameDB_.getName(collisionMoveOldYVar(playerNum), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
  }

  // Same bucket again, for the music player's per-channel index/timer bytes
  // (see the projectMusic pre-scan above and generators/bbasic/music.js) -
  // only reserved for channels the project's song actually uses.
  if (this.projectMusic) {
    for (const channel of Object.keys(this.projectMusic.channelPages)) {
      defvars.push(this.nameDB_.getName(musicIndexVarName(channel), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
      defvars.push(this.nameDB_.getName(musicTimerVarName(channel), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
      if (this.projectMusic.channelPages[channel].length > 1) {
        defvars.push(this.nameDB_.getName(musicPageVarName(channel), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
      }
    }
    // One shared byte for playing/loop/justStopped plus every channel's own
    // active flag (see musicFlagsVarName's comment) - used to cost 3 vars
    // plus 1 more per channel on its own.
    defvars.push(this.nameDB_.getName(musicFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
  }

  // Same bucket again, for scorebkcolor's own dev var (see the
  // scoreBkColorNeedsOwnVar pre-scan above and generators/bbasic/score.js's
  // generateScoreBkColorRuntimeDims).
  if (this.scoreBkColorNeedsOwnVar) {
    defvars.push(this.nameDB_.getName(scoreBkColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE));
  }

  // Add user variables, but only ones that are being used.
  const variables = Blockly.Variables.allUsedVarModels(workspace);
  for (let i = 0; i < variables.length; i++) {
    defvars.push(this.nameDB_.getName(variables[i].getId(),
        Blockly.VARIABLE_CATEGORY_NAME));
  }

  // Add the run-once flag bytes computed above, after user variables so an
  // unrelated change in how many "Run once" blocks a project uses never
  // shifts any user variable's own assigned letter.
  const runOnceDefvarsStart = defvars.length;
  defvars.push(...runOnceByteNames);

  // Declare all of the variables. Without Superchip, the system variables
  // above claim most of the alphabet, leaving only
  // USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP free; with it, the system
  // variables move into var0-13 instead, freeing every letter. With the Text
  // Minikernel active, TEXT_MINIKERNEL_RESERVED_LETTERS also comes off the
  // top regardless of Superchip - see its own comment for why.
  this.runOnceByteLetters = [];
  if (defvars.length) {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const baseAvailableLetters = config.enableSuperchip ? ALL_LETTERS : USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP;
    const availableLetters = this.isTextMinikernelActive() ?
      baseAvailableLetters.filter((letter) => !TEXT_MINIKERNEL_RESERVED_LETTERS.includes(letter)) :
      baseAvailableLetters;
    if (defvars.length > availableLetters.length) {
      throw new Error(`Too many variables: this project defines ${defvars.length}, but only ` +
        `${availableLetters.length} are available${config.enableSuperchip ? '' :
          ' (enable Superchip RAM on the Options tab to unlock more)'}.`);
    }
    this.definitions_['variables'] = defvars
        .map((v, i) => `  dim ${v} = ${availableLetters[i]}`)
        .join('\n');
    this.runOnceByteLetters = runOnceByteNames.map((_, i) => availableLetters[runOnceDefvarsStart + i]);
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

  // Bank-switching support for graphics (see wrapRelocatableGraphics below):
  // populated as generateBackgrounds()/generateAnimations() run during
  // finish(), keyed by a per-background/per-animation unit key.
  this.relocatableGraphicsUnits = {};

  // User-defined subroutines (see generators/bbasic/subroutine.js): name ->
  // body, populated as subroutine_define blocks are walked, then spliced
  // into their own section by generateSubroutines() below.
  this.subroutines = {};

  this.isInitialized = true;
};

// Every event defaults to bank 1 (the only bank this app used before
// bank-switching support existed) unless the project's configuration
// explicitly assigns it elsewhere. This is intentionally the only place that
// reads eventBanks, so every other bank-aware call site stays correct
// automatically as the assignment strategy evolves.
Blockly.BBasic.getEventBank = function(eventName) {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const eventBanks = config.eventBanks || {};
  return eventBanks[eventName] || 1;
};

// The bank the code currently being generated will end up in - either the
// event currently being walked, or bank 1 if this is the main per-frame loop
// (which is not relocatable; see the bank-targeting feasibility notes).
Blockly.BBasic.getCurrentBank = function() {
  return Blockly.BBasic.getEventBank(Blockly.BBasic.currentEventName || 'gameplay_start');
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
// bank 1 unless the project's configuration explicitly assigns it elsewhere,
// mirroring getEventBank. A separate config key from eventBanks since the
// unit keys (e.g. "background1", "player0animation0") are generated from
// project content, not fixed like the event names.
Blockly.BBasic.graphicsUnitBank = function(unitKey) {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const graphicsBanks = config.graphicsBanks || {};
  return graphicsBanks[unitKey] || 1;
};

// Backgrounds and animations are each a single inline call site immediately
// followed by a label the caller already places after the payload (an
// "end-of-block" label, not a fallthrough neighbor the way events have) -
// so unlike RELOCATABLE_EVENTS, there's no entryFallthroughBank/exit-target
// bookkeeping needed here: relocating one of these only ever replaces its own
// payload with a bank-tagged goto/return pair, never touches a neighbor.
//
// Always records the unit's payload (even when it stays in bank 1) so
// estimateGraphicsUnitSize can measure it after generation - the allocator
// needs sizes for units currently still in bank 1 to decide what to move
// next (see rom.js's pickRelocationCandidate).
Blockly.BBasic.wrapRelocatableGraphics = function(unitKey, payload) {
  const bank = Blockly.BBasic.graphicsUnitBank(unitKey);
  Blockly.BBasic.relocatableGraphicsUnits[unitKey] = {bank, payload};
  if (bank === 1) return payload;

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

// Records that a data table was read while generating code for the given
// bank, so generateDataTables() knows which banks need their own copy of it
// (a table can only be read correctly from the same bank it's declared in -
// see the bank-targeting feasibility notes and the Data tab's read-only
// caveat). Tables never read from anywhere still get a bank 1 copy, matching
// this app's behavior before bank-switching support existed.
Blockly.BBasic.trackDataTableBank = function(tableId, bank) {
  const usage = Blockly.BBasic.dataTableBankUsage[tableId] || (Blockly.BBasic.dataTableBankUsage[tableId] = new Set());
  usage.add(bank);
};

// Fixed knowledge about how each of these five events is entered/exited in
// the default, fully-inline template, needed to convert a physical
// fallthrough into an explicit bank-tagged jump once relocation moves an
// event away from its neighbor (system_start is not relocatable - it's tiny,
// always runs first, right after fixed setup code with no label of its own
// to jump from, and not a meaningful relocation target).
//
// Each event owns an independent splice point in bbasic.bb.hbs, so relocating
// one only ever needs to change that event's OWN entry/exit - never a
// neighbor's generated content. A neighbor that stays inline still just
// falls through into whatever now physically occupies this event's slot
// (real code, or a short redirect jump), and every cross-reference here is
// by label, which DASM resolves globally regardless of physical position -
// so neighbors never need to know or care whether this event moved.
//
// entryFallthroughBank: null means the event is only ever entered via
// event_change_state (already bank-tagged on its own - see event.js), so
// nothing physically falls into its splice point and relocating it just
// empties that slot. Otherwise a function returning the bank of whatever
// precedes it by fallthrough in the unrelocated template.
//
// exit: what it falls through to once its own code finishes - a fixed
// template label (always bank 1) or another event's begin label. Always
// applied when relocated, even for the looping title_update: normally its
// self-loop never falls off the end, but if it's ever completely empty, the
// wrapping in generateGameEvent still emits bare begin/end labels with
// nothing between them, and without an explicit exit that would fall
// straight into whatever follows in that bank (its own data tables, or the
// bank-switch back to 1) as if it were code.
const RELOCATABLE_EVENTS = {
  title_start: {
    loop: false,
    entryFallthroughBank: () => 1, // precedes it: the fixed "fullgameloop" label
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
    exit: {label: 'main', bank: () => 1}, // fixed, always bank 1
  },
  gameover_start: {
    loop: false,
    entryFallthroughBank: null, // only entered via event_change_state; "goto main" always precedes this slot, never falling into it
    exit: {label: 'gameover_update_begin', bank: () => Blockly.BBasic.getEventBank('gameover_update')},
  },
  gameover_update: {
    loop: false,
    entryFallthroughBank: () => Blockly.BBasic.getEventBank('gameover_start'),
    exit: {label: 'fullgameloop', bank: () => 1}, // fixed, always bank 1
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
// bank's own section (see generateRelocatedEventSections): every event
// sharing a bank has to land in ONE contiguous "bank N ... bank 1" block,
// not one such block per event - confirmed directly against the compiler
// that declaring the same bank number twice, non-contiguously, breaks
// (reported as a segment overflow), presumably because the bank pseudo-op
// continues addressing from wherever the source was up to, rather than
// resuming that bank's own address range.
Blockly.BBasic.generateRelocatableEvent = function(eventName) {
  const spec = RELOCATABLE_EVENTS[eventName];
  const bank = Blockly.BBasic.getEventBank(eventName);
  const generate = () => spec.loop ?
    Blockly.BBasic.generateGameLoopEvent(eventName) :
    Blockly.BBasic.generateGameEvent(eventName);

  if (bank === 1) {
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

// Groups every relocated event's body (see generateRelocatableEvent) AND
// every relocated graphics unit's payload (see wrapRelocatableGraphics) by
// bank into one contiguous "bank N ... bank 1" section per bank actually
// used, each including that bank's own copies of any data tables read from
// it (generateDataTables(bank) already de-duplicates across everything
// sharing the bank, so this calls it once per bank). Events and graphics
// units sharing a bank have to land in the SAME section, not one each -
// confirmed directly against the compiler that declaring the same bank
// number twice, non-contiguously, breaks (reported as a segment overflow),
// presumably because the bank pseudo-op continues addressing from wherever
// the source was up to, rather than resuming that bank's own address range.
Blockly.BBasic.generateRelocatedSections = function(eventResults) {
  const graphicsUnits = Blockly.BBasic.relocatableGraphicsUnits;
  const graphicsEntries = Object.entries(graphicsUnits);

  const banks = [...new Set([
    ...eventResults.map((r) => r.bank),
    ...graphicsEntries.map(([, unit]) => unit.bank),
  ])].filter((bank) => bank !== 1);

  return banks.map((bank) => {
    const eventBodies = eventResults.filter((r) => r.bank === bank).map((r) => r.body).filter(Boolean);
    const graphicsBodies = graphicsEntries
        .filter(([, unit]) => unit.bank === bank)
        .map(([key, unit]) => `${key}_reloc_entry\n${unit.payload}\n goto ${key}_reloc_return bank1`);
    const tablesForBank = Blockly.BBasic.generateDataTables(bank);
    return [
      ` bank ${bank}`,
      ...eventBodies,
      ...graphicsBodies,
      tablesForBank,
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
  // Convert the definitions dictionary into a list.
  const definitions = Blockly.utils.object.values(this.definitions_);

  // generateTextMinikernelDims() (called later, via generateSystemDims())
  // needs to know whether Score Bar blocks turned pfscore on, but
  // definitions_ itself is gone by then - Blockly.Generator's own finish()
  // (called right below) deletes it.
  this.pfscoreEnabledForTextMinikernel = !!this.definitions_['pfscore_enable'];

  // Call Blockly.Generator's finish.
  code = Object.getPrototypeOf(this).finish.call(this, code);
  // Normalize indents
  code = Blockly.BBasic.normalizeIndents(code);
  // Workaround negation that's not working
  code = code.replaceAll(/(\W)not_(switch\w+(\W?))/g, '$1 !$2');

  const generatedConfiguration = Blockly.BBasic.generateConfiguration();
  const generatedRomSize = Blockly.BBasic.generateRomSize();
  const generatedSystemDims = Blockly.BBasic.generateSystemDims();
  const generatedBackgrounds = Blockly.BBasic.generateBackgrounds();
  const generatedAnimations = Blockly.BBasic.generateAnimations();
  const generatedDataTables = Blockly.BBasic.generateDataTables(1);
  const generatedSubroutines = Blockly.BBasic.generateSubroutines();

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
  const generatedSoundFadeChecks = Blockly.BBasic.generateSoundFadeChecks();
  // Also has to run before generateRelocatedSections() below: it registers
  // its own "musicUpdate" unit into relocatableGraphicsUnits (see its own
  // comment, right where it calls wrapRelocatableGraphics), which that call
  // needs to already be there to actually place it in a relocated bank's
  // own section - running it any later would silently leave "musicUpdate"
  // registered but never actually emitted anywhere.
  const generatedMusicChecks = Blockly.BBasic.generateMusicChecks();
  const generatedRelocatedEvents = Blockly.BBasic.generateRelocatedSections(
      RELOCATABLE_EVENT_NAMES.map((name) => relocatable[name]));
  const generatedDistanceChecks = Blockly.BBasic.generateDistanceChecks();
  const generatedDivMul = Blockly.BBasic.generateDivMul();
  const generatedMuteAudio = Blockly.BBasic.generateMuteAudio();
  const generatedRunOnceEdgeReset = Blockly.BBasic.generateRunOnceEdgeReset();

  this.isInitialized = false;

  this.nameDB_.reset();
  const generatedBody = definitions.join('\n\n') + '\n\n\n' + code;
  return handlebarsTemplate({generatedBody, generatedBackgrounds,
    generatedAnimations, generatedDataTables,
    generatedSubroutines, generatedRelocatedEvents, generatedTextMinikernel,
    systemStartEvent, titleStartEvent, titleUpdateEvent, gamePlayStartEvent,
    gameOverStartEvent, gameOverUpdateEvent, generatedConfiguration, generatedRomSize, generatedSystemDims,
    generatedTextMinikernelDefaults, generatedDivMul, generatedMuteAudio, generatedSoundFadeChecks,
    generatedMusicChecks, generatedDistanceChecks, generatedScoreBkColorAsm, generatedRunOnceEdgeReset});
};

// Spliced into commongamelogic (see bbasic.bb.hbs), before generatedBody
// itself runs (the main loop's own "gosub commongamelogic" happens before
// the per-frame game logic containing every "Run once" block) - has to run
// first so it's comparing against LAST frame's touched bits, not bits the
// current frame hasn't set yet. See blocks/event.js's event_run_once and its
// own runOnceByteLetters comment in init() for the two-bit-per-instance,
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
// each instance's own bit pair separately: temp1 takes the touched nibble
// as-is (already low-aligned); temp2 shifts the fired nibble down to
// low-aligned too, ANDs it against temp1 (clearing any fired bit whose
// touched counterpart is 0), then shifts the masked result back up - which
// also has the side effect of zeroing the low nibble, i.e. resetting every
// touched bit for the next frame's fresh tracking, for free.
Blockly.BBasic.generateRunOnceEdgeReset = function() {
  const bytes = this.runOnceByteLetters || [];
  if (!bytes.length) return '';
  return bytes.map((byte) => [
    ` temp1 = ${byte} & 15`,
    ` temp2 = ${byte} / 16`,
    ` temp2 = temp2 & temp1`,
    ` ${byte} = temp2 * 16`,
  ].join('\n')).join('\n');
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
// like those - falling into "mul8"/"div8"'s own code from above would
// execute it with whatever registers happened to be lying around instead of
// the operands it expects.
Blockly.BBasic.generateDivMul = function() {
  if (!this.usesDivMul) return '';
  return ' inline div_mul.asm';
};

// Whether the project uses multiply/divide (see math.js) - hooks/rom.js
// needs this to know whether to fetch div_mul.asm as a compile sibling file,
// the same way it checks isTextMinikernelActive() for text12a.asm/text12b.asm.
Blockly.BBasic.usesDivMulRoutine = function() {
  return !!this.usesDivMul;
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
Blockly.BBasic.scrub_ = function(block, code, optThisOnly) {
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
  const nextBlock = block.nextConnection && block.nextConnection.targetBlock();
  const nextCode = optThisOnly ? '' : this.blockToCode(nextBlock);
  return commentCode + code + nextCode;
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

Blockly.BBasic.addGameEvent = function(eventName, code) {
  this.getGameEvent(eventName).push(code);
};

Blockly.BBasic.generateGameEvent = function(eventName,
    codeGenerator = (eventName, eventCode) => eventCode.join('\n\n')) {
  const eventCode = codeGenerator(eventName, this.getGameEvent(eventName));
  return this.normalizeIndents([
    'rem **************************************************************************',
    `rem Event: ${eventName}.`,
    'rem **************************************************************************',
    `@${eventName}_begin`,
    eventCode,
    `@${eventName}_end`,
  ].join('\n'));
};

Blockly.BBasic.generateGameLoopEvent = function(eventName) {
  return this.generateGameEvent(eventName, (eventName, eventCode) => {
    const innerCode = eventCode.join('\n\n');
    if (!innerCode.trim()) return '';
    return [
      'gosub commongamelogic',
      'drawscreen',
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

// Resolves the Score tab's own background color picker (config.scoreBkColor
// - see views/ScoreFontEditor.vue) to an actual color byte for the
// literal/default case: a plain number is returned as-is, and anything else
// (unset, or the 'background' sentinel - which both call sites below handle
// separately, by aliasing directly onto backgroundrealcolor instead of
// calling this at all) defaults to black (0). Shared between
// generateScoreBkColorDefaults's Setup-time init (Text Minikernel active)
// and generateScoreBkColorAsm's standalone "minikernel" hook (Text
// Minikernel inactive) so both resolve the same picked literal identically.
Blockly.BBasic.resolveScoreBkColorByte = function(configValue) {
  return typeof configValue === 'number' ? configValue : 0;
};

// The exact raw dim target (a single letter, or "varN" with Superchip)
// backgroundrealcolor's own SYSTEM_VARIABLES entry resolves to - the same
// computation generateSystemDims itself uses. Exposed so
// generateScoreBkColorRuntimeDims (generators/bbasic/score.js) can alias
// scorebkcolor directly onto that raw target for "Use background color"
// instead of onto the NAME "backgroundrealcolor" - chaining one dim onto
// another dim's own name (rather than a raw register) doesn't reliably
// resolve here (see that function's own comment for the confirmed failure).
Blockly.BBasic.backgroundRealColorRawTarget = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const index = SYSTEM_VARIABLES.findIndex(([name]) => name === 'backgroundrealcolor');
  return config.enableSuperchip ? `var${index}` : SYSTEM_VARIABLES[index][1];
};

// Whether generated code should include per-row playfield colors (pfcolors).
// This is an all-or-nothing project setting (the "enablePfColors" option on
// the Options tab): once it's on, the Background editor requires every
// background to have its own row color list, since the compiled kernel
// always draws every background's playfield from the same color table.
//
// Off while Superchip RAM is enabled. buildRom's compiler-output patch (see
// patchSuperchipPfColorsPointer in hooks/rom.js) fixes most of the pfcolors +
// Superchip breakage, but the very last row still renders black, and with
// more than one background the colors come out wrong and the black area
// returns - not fully root-caused yet, so the combination is disabled again
// until that's sorted out.
Blockly.BBasic.usePlayfieldRowColors = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.enableSuperchip) return false;
  return config.enablePfColors ?? false;
};

// Spliced into bbasic.bb.hbs's main loop right after the user's own generated
// code (not into commongamelogic, which runs before that code each frame -
// putting it there would let a Sound block triggered later the same frame
// re-enable audio, since AUDV0/AUDV1 are read by the TIA continuously rather
// than only at drawscreen). Placed here, after every block for the frame has
// had its say, this is genuinely the last word each frame, silencing both
// channels outright regardless of what a Sound block set them to.
Blockly.BBasic.generateMuteAudio = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (!config.muteAllAudio) return '';
  return ' AUDV0 = 0\n AUDV1 = 0';
};

// ROM sizes the standard kernel actually bankswitches (see
// BANK_COUNT_BY_ROMSIZE in hooks/rom.js - duplicated here in miniature
// rather than imported, since rom.js already imports from this file and
// importing back would be circular).
const BANKSWITCHED_ROM_SIZES = ['8k', '16k', '32k'];

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

Blockly.BBasic.generateConfiguration = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};

  const {showScore, showBlankLines, scoreFont, enableSuperchip, pfres} = config;

  // batari Basic honours a single "set kernel_options" line, so every option
  // has to go on it together.
  const kernelOptions = [];
  if (this.usePlayfieldRowColors()) kernelOptions.push('pfcolors');
  if (!(showBlankLines ?? true)) kernelOptions.push('no_blank_lines');
  const kernelOptionsConfigurationCode = kernelOptions.length ?
    `set kernel_options ${kernelOptions.join(' ')}` : '';
  // "noscore" is a compile-time ifconst gate in the standard kernel - it
  // decides whether the score-digit-drawing assembly is even assembled into
  // the ROM at all, nothing runtime can override it after the fact. The Text
  // Minikernel's own manual is explicit that "noscore" is NOT the option to
  // pair with it: "Set this constant to 1 to turn off the score when using
  // this minikernel instead of using the standard 'noscore' option" - i.e.
  // "noscore" and the Text Minikernel don't actually work together, so with
  // it active, unchecking "Show score" has to emit "noscoretxt" instead, or
  // the standard kernel's score-digit code stays compiled in and keeps
  // running (and drawing) every frame right alongside the Text Minikernel's
  // own status row, regardless of this toggle.
  const scoreConfigurationCode = (showScore ?? true) ? '' :
    `const ${this.isTextMinikernelActive() ? 'noscoretxt' : 'noscore'} = 1`;
  // The bundled compiler ignores this and gets its digits swapped in directly
  // instead, but it keeps the generated source correct for real batari Basic.
  // Custom digits live in the compiler's include, so there is no directive that
  // would carry them into an exported source file.
  const scoreFontConfigurationCode = (!scoreFont || scoreFont === SQUISH_SCORE_FONT || scoreFont === SQUISH_CUSTOM_SCORE_FONT) ? '' :
    scoreFont === CUSTOM_SCORE_FONT ?
      'rem Custom score font: digits are supplied by the compiler include.' :
      `const font = ${scoreFont}`;
  // Squish (and Squish Custom, which starts from Squish's own digits and is
  // then editable - see utils/score-font.js) are special score font options
  // baked into the Text Minikernel's extended score_graphics.asm (swapped in
  // whenever either is selected, or the Text Minikernel is active - see
  // hooks/rom.js) rather than a byte-swappable preset like the others -
  // selecting either is what shrinks the score row, independent of whether
  // the Text Minikernel itself is in use.
  const textFontConfigurationCode = (scoreFont === SQUISH_SCORE_FONT || scoreFont === SQUISH_CUSTOM_SCORE_FONT) ?
    'const fontstyle = SQUISH' : '';
  // Two different, INDEPENDENTLY settable colors inside text12a.asm/
  // text12b.asm's own "minikernel" subroutine:
  // - "scorebkcolor" (from the Score tab's own background color picker -
  //   see views/ScoreFontEditor.vue, config.scoreBkColor): the very first
  //   thing the subroutine does after WSYNC, if this is defined AND
  //   noscoretxt isn't, is set COLUBK to it for the score row itself, for
  //   as long as that row's own drawing loop runs. NOT emitted here as a
  //   const any more - text12a.asm has been patched (see its own inline
  //   comment) to read scorebkcolor as a real RAM address instead of a
  //   compile-time immediate, so it needs an actual dim, handled by
  //   generateScoreBkColorRuntimeDims/generateScoreBkColorDefaults in
  //   generators/bbasic/score.js instead (spliced into generatedSystemDims/
  //   generatedTextMinikernelDefaults - see finish() below). That's what
  //   lets "Use background color" (config.scoreBkColor === 'background')
  //   alias scorebkcolor directly onto the live backgroundrealcolor
  //   variable, tracking later runtime changes - something a const,
  //   having no runtime existence at all, never could.
  // - "textbkcolor" (from the Text tab's own background color picker - see
  //   views/TextEditor.vue, config.textBkColor): read unconditionally
  //   (defaults to 0/black via its own ifnconst fallback if never set)
  //   right after that loop finishes, setting COLUBK for whatever comes
  //   right after the row - the text minikernel's own message lines
  //   specifically render there. Still a plain compile-time const - only
  //   scorebkcolor needed the RAM treatment, since only the Score tab
  //   offers a "Use background color" option (black is what the Text
  //   Minikernel's own reference layout uses instead).
  // Deliberately two separate values, not one shared setting - a project
  // showing both a numeric score AND the Minikernel's own text message can
  // give each its own distinct background. Both only apply while the Text
  // Minikernel is active - with it inactive, the Score tab's picker instead
  // drives generateScoreBkColorAsm's own standalone "minikernel" hook (see
  // generators/bbasic/score.js), and there's no text row for the Text
  // tab's picker to apply to at all.
  //
  // Both default to black (byte 0) - the darkest palette entry - rather
  // than to no override at all, so the row's background is always some
  // definite, predictable color out of the box instead of silently
  // inheriting whatever COLUBK the surrounding code happens to leave
  // behind.
  const textBkColorConfigurationCode = this.isTextMinikernelActive() ?
    `const textbkcolor = ${colorByteToBBasic(config.textBkColor ?? 0)}` : '';
  // pfres raises the playfield's vertical resolution above the standard
  // kernel's default; it requires the extra RAM Superchip provides (see
  // generateRomSize), and is a single ROM-wide setting, not per-background.
  const pfresConfigurationCode = (enableSuperchip && pfres) ? `const pfres = ${pfres}` : '';
  // Unlike kernel_options, "set optimization" lines can't be combined on one
  // line - each option needs its own "set optimization X" statement.
  const optimizationLines = [];
  if (config.enableOptimizationSpeed) optimizationLines.push('set optimization speed');
  if (this.useInlineRand()) optimizationLines.push('set optimization inlinerand');
  const optimizationConfigurationCode = optimizationLines.join('\n ');
  return [
    kernelOptionsConfigurationCode,
    scoreConfigurationCode,
    scoreFontConfigurationCode,
    textFontConfigurationCode,
    textBkColorConfigurationCode,
    pfresConfigurationCode,
    optimizationConfigurationCode,
  ].join('\n ');
};

const SUPPORTED_ROM_SIZES = ['2k', '4k', '8k', '16k', '32k'];

Blockly.BBasic.generateRomSize = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const romSize = SUPPORTED_ROM_SIZES.includes(config.romSize) ? config.romSize : '4k';
  // Superchip RAM (needed for pfres above the standard kernel's default) is
  // enabled by appending SC to the rom size, e.g. "set romsize 8kSC".
  const superchipSuffix = config.enableSuperchip ? 'SC' : '';
  return `set romsize ${romSize}${superchipSuffix}`;
};

// See the SYSTEM_VARIABLES comment above: without Superchip these bookkeeping
// variables sit on letters, since the standard kernel's playfield buffer
// occupies var0-43; with Superchip that buffer moves to the SARA chip RAM
// page instead, so these move into var0-13, freeing every letter for user
// variables (see Blockly.BBasic.init).
Blockly.BBasic.generateSystemDims = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const systemDims = SYSTEM_VARIABLES
      .map(([name, letter], i) => ` dim ${name} = ${config.enableSuperchip ? `var${i}` : letter}`)
      .join('\n');
  return systemDims + this.generateTextMinikernelDims() + this.generateSoundFadeDims() +
    this.generateScoreBkColorRuntimeDims();
};

Blockly.BBasic.generateBackgrounds = function() {
  const backgroundData = this.getBackgroundsData();
  const backgrounds = backgroundData && backgroundData.backgrounds;

  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};

  const convertPlayfield = (playField) =>
    playField.split('\n').map((line) => '  ' + line).join('\n');

  // A "pfcolors:" block sets the playfield colors at runtime when execution
  // reaches it, so emitting one inside each background's swap conditional gives
  // every background its own colors. One color per playfield row, top to
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
  const usePfColors = this.usePlayfieldRowColors();
  const blankLinesShown = config.showBlankLines ?? true;
  const buildPfcolors = (pixels, rowColors) => {
    const resolved = [];
    for (let i = 0; i < pixels.length; i++) {
      resolved.push((rowColors && rowColors[i] != null) ? rowColors[i] : DEFAULT_ROW_COLOR);
    }
    const outputBytes = blankLinesShown ?
      resolved.concat([resolved[resolved.length - 1]]) :
      [resolved[0]].concat(resolved);
    const rows = outputBytes.map((byte) => '  ' + colorByteToBBasic(byte));
    return ' pfcolors:\n' + rows.join('\n') + '\nend\n' +
      ` playfieldrealcolor = ${colorByteToBBasic(resolved[0])}\n`;
  };

  return backgrounds.map(({id, pixels, rowColors}) => {
    const endLabel = `background${id}end`;
    const pfcolorsBlock = usePfColors ? buildPfcolors(pixels, rowColors) : '';
    const payloadLines = [
      ' playfield:',
      convertPlayfield(matrixToPlayfield(pixels)),
      'end',
    ];
    if (pfcolorsBlock) payloadLines.push(pfcolorsBlock.replace(/\n$/, ''));
    const payload = payloadLines.join('\n');
    // Only the graphics payload itself is relocatable - the guard above and
    // the endLabel below stay inline in bank 1 no matter what, since a
    // conditional "goto" (like any goto) needs an explicit bank tag to cross
    // banks, and neither of those ever does: this background's guard/label
    // pair are only ever reached from within bank 1's own commongamelogic.
    return ` if newbackground <> ${id} then goto ${endLabel}` + '\n' +
      Blockly.BBasic.wrapRelocatableGraphics(`background${id}`, payload) + '\n' +
      endLabel;
  }).join('\n\n');
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
// table needs its own physical copy, emitted alongside whatever else lives
// in that bank - callers pass the bank they're currently emitting content
// for (bank 1's copies go in the shared "Data tables" section below; a
// relocated event's own bank gets its copies alongside that event's code).
// A table nothing ever read still gets a bank 1 copy, matching this app's
// behavior before bank-switching support existed.
Blockly.BBasic.generateDataTables = function(bank) {
  const data = Blockly.BBasic.getDataTablesData();
  if (!data) return '';

  return data.dataTables
      .filter((table) => table.values && table.values.length)
      .filter((table) => {
        const usage = Blockly.BBasic.dataTableBankUsage[table.id];
        return usage ? usage.has(bank) : bank === 1;
      })
      .map((table) => {
        const name = dataTableSymbolName(table, bank);
        const rows = chunk(table.values, 16).map((row) => '  ' + row.join(', '));
        return ` data ${name}\n${rows.join('\n')}\nend`;
      })
      .join('\n\n');
};

// Splices every user-defined subroutine (see subroutine_define in
// generators/bbasic/subroutine.js) into its own "label / body / return"
// block. Placed in bbasic.bb.hbs right after commongamelogic's own "return" -
// the same never-fallen-into spot data tables use, for the same reason: nothing
// above ever runs off the end into it, everything either loops back with
// "goto" or returns from a "gosub".
//
// Each entry gets its own normalizeIndents() pass (like generateGameEvent) -
// unlike generateBackgrounds/generateAnimations/generateDataTables, a
// subroutine's body comes from ordinary statementToCode() output (block-level
// generators returning un-normalized lines), not literal strings built by
// hand, so it still needs the same indent pass every other block-sourced
// body gets in the main code (see finish()).
Blockly.BBasic.generateSubroutines = function() {
  return Object.entries(Blockly.BBasic.subroutines).map(([name, body]) => {
    return Blockly.BBasic.normalizeIndents([
      `@${name}`,
      body,
      'return',
    ].join('\n'));
  }).join('\n\n');
};

Blockly.BBasic.generateAnimations = function() {
  // Reset fresh every generation, same reasoning/mechanism as
  // musicGateAsmFiles in generators/bbasic/music.js - hooks/rom.js merges
  // this into the compiler's siblingFiles after regenerateCode(), the same
  // "inline text12a.asm" mechanism (see text-minikernel-files.js).
  Blockly.BBasic.playerAnimAsmFiles = {};

  // TEMPORARY DIAGNOSTIC SWAP: restored to the pre-table-driven original
  // implementation, to test whether the still-failing "musicUpdate can't
  // find room anywhere" build error is actually caused by this animation
  // work at all, or is fully independent of it (musicUpdate/Superchip).
  // Real implementation preserved in git history / the conversation - to
  // be restored right after this test.
  const processAnimation = (name, animation, animationIndex) => {
    if (!animation) {
      return '';
    }

    const animationLabel = `${name}animation${animationIndex}`;
    const totalDuration = sumBy(animation.frames, (frame) => frame.duration || 0);

    let frameLimit = 0;
    const stateMachine = animation.frames.map((frame, frameIndex) => {
      frameLimit += frame.duration || 0;
      const pixelSource = frame.pixels.slice().reverse().map((row) => '  %' + row.join(''));
      const endLabel = `${animationLabel}frame${frameIndex}End`;
      const skipCondition = `  if ${name}frame > ${frameLimit} then goto ${endLabel}\n`;

      return skipCondition +
        `  ${name}:\n` +
        pixelSource.join('\n') +
        '\nend\n' +
        `  goto ${animationLabel}animationEnd\n` +
        endLabel;
    });

    const pauseSkipLabel = `${animationLabel}pauseSkip`;
    return `  rem Animation ${animationIndex} ${animation.name} for ${name}:\n\n` +
      `  if ${name}size{6} then goto ${pauseSkipLabel}\n` +
      `  ${name}frame = ${name}frame + 1\n` +
      `  if ${name}frame >= ${totalDuration} then ${name}frame = 0\n` +
      `${pauseSkipLabel}\n\n` +
      stateMachine.join('\n\n') +
      `\n\n${animationLabel}animationEnd`;
  };

  const processAnimations = (name, playerStorage) => {
    let playerData = null;
    try {
      playerData = processPlayerStorageDefaults(playerStorage);
    } catch (e) {
      console.error(`Failed to load ${name} data`, e);
    }

    if (!playerData) {
      return '';
    }

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
    const hiddenplayerHandler = [
      `  if ${name}frame <> 255 then goto ${animationsStartLabel}`,
      Blockly.BBasic.wrapRelocatableGraphics(`${name}default`, hiddenPayload),
      `  goto ${animationsEndLabel}\n`,
      animationsStartLabel,
    ].join('\n');

    return `  rem Animations for ${name}:\n\n` +
      hiddenplayerHandler +
      playerData.animations.map((animation, animationIndex) => {
        if (!animationIndex) return '';
        return `  if ${name}animation = ${animationIndex} then goto ${getAnimationStartLabel(animationIndex)}`;
      }).join('\n') +
      '\n\n' +
      playerData.animations.map((animation, animationIndex) => {
        const unitKey = `${name}animation${animationIndex}`;
        const payload = processAnimation(name, animation, animationIndex);
        // Same rationale as hiddenplayerHandler above: this label stays
        // inline in bank 1 regardless of where the animation's own frames
        // end up, so the dispatch conditions above (and this exit) never
        // need a bank tag of their own.
        return `${getAnimationStartLabel(animationIndex)}\n\n` +
          Blockly.BBasic.wrapRelocatableGraphics(unitKey, payload) +
          `\n  goto ${animationsEndLabel}`;
      }).join('\n\n') +
      `\n\n${animationsEndLabel}`;
  };

  const player0Code = processAnimations('player0', usePlayer0Storage());
  const player1Code = processAnimations('player1', usePlayer1Storage());
  return player0Code + '\n\n\n' + player1Code;
};
import background from './bbasic/background';
import bit from './bbasic/bit';
import collision from './bbasic/collision';
import color from './bbasic/color';
import colour from './bbasic/colour';
import data from './bbasic/data';
import event from './bbasic/event';
import input from './bbasic/input';
import logic from './bbasic/logic';
import loops from './bbasic/loops';
import math from './bbasic/math';
import music from './bbasic/music';
import procedures from './bbasic/procedures';
import random from './bbasic/random';
import score from './bbasic/score';
import sound from './bbasic/sound';
import soundfx from './bbasic/soundfx';
import sprites from './bbasic/sprites';
import subroutine from './bbasic/subroutine';
import text from './bbasic/text';
import textMinikernel from './bbasic/text-minikernel';
import variables from './bbasic/variables';

[background, bit, collision, color, colour, data, event, input, logic, loops, math, music, procedures,
  random, score, sound, soundfx, sprites, subroutine, text, textMinikernel, variables]
    .forEach((init) => init(Blockly));

export default Blockly.BBasic;

