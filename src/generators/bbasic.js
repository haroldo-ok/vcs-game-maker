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

import {useBackgroundsStorage, usePlayer0Storage} from '../hooks/project';
import {matrixToPlayfield} from '../utils/pixels';

const handlebarsTemplate = Handlebars.compile(templateText);

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

  // Declare all of the variables.
  if (defvars.length) {
    this.definitions_['variables'] = defvars
        .map((v, i) => `  dim ${v} = ${String.fromCharCode('a'.charCodeAt(0) + i)}`)
        .join('\n');
  }
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
  code = code.replace(/^[\t ]*/gm, Blockly.BBasic.INDENT);

  const playField = Blockly.BBasic.generateBackgrounds();
  const animation = Blockly.BBasic.generateAnimations();

  this.isInitialized = false;

  this.nameDB_.reset();
  const generatedBody = definitions.join('\n\n') + '\n\n\n' + animation + '\n\n\n' + code;
  return handlebarsTemplate({generatedBody, playField});
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
      commentCode += this.prefixLines(comment + '\n', '// ');
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

Blockly.BBasic.generateBackgrounds = function() {
  const backgroundsStorage = useBackgroundsStorage();

  let backgroundData = null;
  try {
    backgroundData = backgroundsStorage.value;
  } catch (e) {
    console.error('Failed to load backgrounds', e);
  }

  const backgrounds = backgroundData && backgroundData.backgrounds;
  let playField =
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
    'X....X...................X....X\n' +
    'X.............................X\n' +
    'X.............................X\n' +
    'X.............................X\n' +
    'X.............................X\n' +
    'X.............................X\n' +
    'X.............................X\n' +
    'X.............................X\n' +
    'X....X...................X....X\n' +
    'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

  if (backgrounds && backgrounds[0] && backgrounds[0].pixels) {
    playField = matrixToPlayfield(backgrounds[0].pixels);
  }

  return playField.split('\n').map((line) => '  ' + line).join('\n');
};

Blockly.BBasic.generateAnimations = function() {
  const playerStorage = usePlayer0Storage();

  let playerData = null;
  try {
    playerData = playerStorage.value;
  } catch (e) {
    console.error('Failed to load player data', e);
  }

  if (!playerData) {
    return '';
  }

  const animation = playerData.animations[0];
  if (!animation) {
    return '';
  }

  const totalDuration = sumBy(animation.frames, (frame) => frame.duration || 0);

  let frameLimit = 0;
  const stateMachine = animation.frames.map((frame, frameIndex) => {
    frameLimit += frame.duration || 0;
    const pixelSource = frame.pixels.slice().reverse().map((row) => '  %' + row.join(''));
    const endLabel = `player0frame${frameIndex}End`;
    const skipCondition = `  if player0frame > ${frameLimit} then goto ${endLabel}\n`;

    return skipCondition +
      '  player0:\n' +
      pixelSource.join('\n') +
      '\nend\n' +
      '  goto player0animationEnd\n' +
      endLabel;
  });

  return `  rem Animation ${animation.name}:\n` +
    '  dim player0frame = z\n\n' +
    '  player0frame = player0frame + 1\n' +
    `  if player0frame = ${totalDuration} then player0frame = 0\n\n` +
    stateMachine.join('\n\n') +
    '\n\nplayer0animationEnd';
};

import collision from './bbasic/collision';
import colour from './bbasic/colour';
import input from './bbasic/input';
import logic from './bbasic/logic';
import loops from './bbasic/loops';
import math from './bbasic/math';
import procedures from './bbasic/procedures';
import sprites from './bbasic/sprites';
import text from './bbasic/text';
import variables from './bbasic/variables';

[collision, colour, input, logic, loops, math, procedures, sprites, text, variables]
    .forEach((init) => init(Blockly));

export default Blockly.BBasic;
