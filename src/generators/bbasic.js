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
import {sumBy} from 'lodash';

import {useBackgroundsStorage, useConfigurationStorage, usePlayer0Storage, usePlayer1Storage} from '../hooks/project';
import {DEFAULT_ROW_COLOR, processBackgroundStorageDefaults} from '../blocks/background';
import {matrixToPlayfield} from '../utils/pixels';
import {colorByteToBBasic} from '../utils/palette';
import {CUSTOM_SCORE_FONT} from '../utils/score-font';
import {processPlayerStorageDefaults} from './bbasic/sprites';

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

  // Add user variables, but only ones that are being used.
  const variables = Blockly.Variables.allUsedVarModels(workspace);
  for (let i = 0; i < variables.length; i++) {
    defvars.push(this.nameDB_.getName(variables[i].getId(),
        Blockly.VARIABLE_CATEGORY_NAME));
  }

  // Declare all of the variables. Without Superchip, the system variables
  // above claim most of the alphabet, leaving only
  // USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP free; with it, the system
  // variables move into var0-13 instead, freeing every letter.
  if (defvars.length) {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const availableLetters = config.enableSuperchip ? ALL_LETTERS : USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP;
    if (defvars.length > availableLetters.length) {
      throw new Error(`Too many variables: this project defines ${defvars.length}, but only ` +
        `${availableLetters.length} are available${config.enableSuperchip ? '' :
          ' (enable Superchip RAM on the Options tab to unlock more)'}.`);
    }
    this.definitions_['variables'] = defvars
        .map((v, i) => `  dim ${v} = ${availableLetters[i]}`)
        .join('\n');
  }

  this.blockNumbers = {
    next: (type) => {
      const value = (this.blockNumbers[type] || 0) + 1;
      this.blockNumbers[type] = value;
      return value;
    },
  };

  this.gameEvents = {};

  this.isInitialized = true;
};

/**
 * Prepend the generated code with the variable definitions.
 * @param {string} code Generated code.
 * @return {string} Completed code.
 */
Blockly.BBasic.finish = function(code) {
  // Convert the definitions dictionary into a list.
  const definitions = Blockly.utils.object.values(this.definitions_);

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

  const systemStartEvent = this.generateGameEvent('system_start');
  const titleStartEvent = this.generateGameEvent('title_start');
  const titleUpdateEvent = this.generateGameLoopEvent('title_update');
  const gamePlayStartEvent = this.generateGameEvent('gameplay_start');
  const gameOverStartEvent = this.generateGameEvent('gameover_start');
  const gameOverUpdateEvent = this.generateGameEvent('gameover_update');

  this.isInitialized = false;

  this.nameDB_.reset();
  const generatedBody = definitions.join('\n\n') + '\n\n\n' + code;
  return handlebarsTemplate({generatedBody, generatedBackgrounds, generatedAnimations,
    systemStartEvent, titleStartEvent, titleUpdateEvent, gamePlayStartEvent,
    gameOverStartEvent, gameOverUpdateEvent, generatedConfiguration, generatedRomSize, generatedSystemDims});
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

// Whether generated code should include per-row playfield colors (pfcolors).
// This is an all-or-nothing project setting (the "enablePfColors" option on
// the Options tab): once it's on, the Background editor requires every
// background to have its own row color list, since the compiled kernel
// always draws every background's playfield from the same color table.
// Off while Superchip RAM is enabled - pfcolors and Superchip's
// higher-resolution playfield (pfres) have an unresolved bug when combined
// (the row colors render at the wrong vertical offset), so pfcolors output
// is suppressed (and its Options tab toggle disabled) while Superchip is on,
// even though backgrounds may still have row colors set in the editor, in
// case the bug gets fixed later.
Blockly.BBasic.usePlayfieldRowColors = function() {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.enableSuperchip) return false;
  return config.enablePfColors ?? true;
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
  const scoreConfigurationCode = (showScore ?? true) ? '' : 'const noscore = 1';
  // The bundled compiler ignores this and gets its digits swapped in directly
  // instead, but it keeps the generated source correct for real batari Basic.
  // Custom digits live in the compiler's include, so there is no directive that
  // would carry them into an exported source file.
  const scoreFontConfigurationCode = !scoreFont ? '' :
    scoreFont === CUSTOM_SCORE_FONT ?
      'rem Custom score font: digits are supplied by the compiler include.' :
      `const font = ${scoreFont}`;
  // pfres raises the playfield's vertical resolution above the standard
  // kernel's default; it requires the extra RAM Superchip provides (see
  // generateRomSize), and is a single ROM-wide setting, not per-background.
  const pfresConfigurationCode = (enableSuperchip && pfres) ? `const pfres = ${pfres}` : '';
  return [
    kernelOptionsConfigurationCode,
    scoreConfigurationCode,
    scoreFontConfigurationCode,
    pfresConfigurationCode,
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
  return SYSTEM_VARIABLES
      .map(([name, letter], i) => ` dim ${name} = ${config.enableSuperchip ? `var${i}` : letter}`)
      .join('\n');
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
    return ` if newbackground <> ${id} then goto ${endLabel}` + '\n' +
      ' playfield:\n' +
      convertPlayfield(matrixToPlayfield(pixels)) + '\n' +
      'end\n' +
      pfcolorsBlock +
      endLabel;
  }).join('\n\n');
};

Blockly.BBasic.generateAnimations = function() {
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

    // Bit 6 of the size variable is the pause flag (see the playback block):
    // while it is set, the frame counter is frozen, holding the current frame.
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

    const hiddenplayerHandler = [
      `  if ${name}frame <> 255 then goto ${animationsStartLabel}`,
      `  ${name}:`,
      `  %00000000`,
      `end`,
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
        return `${getAnimationStartLabel(animationIndex)}\n\n` +
          processAnimation(name, animation, animationIndex) +
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
import event from './bbasic/event';
import input from './bbasic/input';
import logic from './bbasic/logic';
import loops from './bbasic/loops';
import math from './bbasic/math';
import procedures from './bbasic/procedures';
import random from './bbasic/random';
import score from './bbasic/score';
import sound from './bbasic/sound';
import soundfx from './bbasic/soundfx';
import sprites from './bbasic/sprites';
import text from './bbasic/text';
import variables from './bbasic/variables';

[background, bit, collision, color, colour, event, input, logic, loops, math, procedures,
  random, score, sound, soundfx, sprites, text, variables]
    .forEach((init) => init(Blockly));

export default Blockly.BBasic;

