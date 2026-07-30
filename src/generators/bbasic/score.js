'use strict';

const PFSCORE_ENABLE_CODE = '  const pfscore = 1';

// The score is three bytes of packed BCD, two digits per byte, so each digit is
// one nibble. "score+1" cannot be assigned to directly, but aliasing it with
// dim works. These are aliases onto the existing score bytes, so they cost no
// variable slots.
const SCORE_DIGIT_ALIASES = [
  '  dim scorebyte1 = score',
  '  dim scorebyte2 = score+1',
  '  dim scorebyte3 = score+2',
].join('\n');

/**
 * Locates a score digit within the packed BCD bytes.
 * @param {string} digit Digit number, "1" (leftmost) to "6".
 * @return {{alias: string, address: string, high: boolean}} The dim alias for
 *     reading, the raw address for assembly, and which nibble holds the digit.
 */
const scoreDigitTarget = (digit) => {
  const index = Math.max(0, Math.min(5, parseInt(digit, 10) - 1 || 0));
  const byteIndex = Math.floor(index / 2);
  return {
    alias: `scorebyte${byteIndex + 1}`,
    address: byteIndex ? `score+${byteIndex}` : 'score',
    high: index % 2 === 0,
  };
};

export default (Blockly) => {
  Blockly.BBasic[`score_get`] = function(block) {
    // Score getter.
    const code = 'score';
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_set`] = function(block) {
    // Score setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return 'score = ' + argument0 + '\n';
  };

  Blockly.BBasic[`score_change`] = function(block) {
    // Add value to the score.
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
    const operator = isNegativeConstant ? '' : '+';
    return `score = score ${operator} ${argument0}\n`;
  };

  Blockly.BBasic[`score_color_get`] = function(block) {
    // Score's color getter.
    const code = 'scorecolor';
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_color_set`] = function(block) {
    // Score's color setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return 'scorecolor = ' + argument0 + '\n';
  };

  Blockly.BBasic[`score_color_change`] = function(block) {
    // Add value to the score's color.
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
    const operator = isNegativeConstant ? '' : '+';
    return `scorecolor = scorecolor ${operator} ${argument0}\n`;
  };

  Blockly.BBasic[`score_digit_get`] = function(block) {
    // Single score digit getter. Reading the score bytes compiles correctly,
    // unlike writing to them.
    Blockly.BBasic.definitions_['score_digit_aliases'] = SCORE_DIGIT_ALIASES;
    const {alias, high} = scoreDigitTarget(block.getFieldValue('DIGIT'));
    // Integer division drops the low nibble.
    const code = high ? `(${alias} / 16)` : `(${alias} & $0F)`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_digit_set`] = function(block) {
    // batari Basic special cases any assignment whose target is the score, and
    // a dim alias of it inherits that: it discards the expression and stores a
    // six digit BCD literal instead. So the digit's nibble is merged in
    // assembly, leaving its partner in the same byte untouched.
    //
    // temp1 and temp2 are only clobbered by drawscreen, which cannot run in the
    // middle of this. "end" has to sit at column 0, hence the "@" that the
    // indent normaliser strips.
    const {address, high} = scoreDigitTarget(block.getFieldValue('DIGIT'));
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return [
      `temp1 = ${argument0}`,
      'asm',
      'lda temp1',
      'and #$0F',
      ...(high ? ['asl', 'asl', 'asl', 'asl'] : []),
      'sta temp2',
      `lda ${address}`,
      `and #${high ? '$0F' : '$F0'}`,
      'ora temp2',
      `sta ${address}`,
      '@end',
    ].join('\n') + '\n';
  };

  Blockly.BBasic[`score_bar_get`] = function(block) {
    // Score bar getter.
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [varName, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_bar_set`] = function(block) {
    // Score bar setter.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return varName + ' = ' + argument0 + '\n';
  };

  Blockly.BBasic[`score_bar_change`] = function(block) {
    // Add value to a score bar.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
    const operator = isNegativeConstant ? '' : '+';
    return `${varName} = ${varName} ${operator} ${argument0}\n`;
  };

  // A score bar's byte is a raw bit pattern read directly by the kernel, not
  // a plain "N units" value - so building "N units filled, growing outward
  // from the score" means constructing that pattern one step at a time, the
  // same way the batari Basic docs' own "add a life"/"add to health" examples
  // do (pfscoreN = pfscoreN*2|1 for a solid bar, pfscoreN = pfscoreN*4|2 for
  // evenly spaced dots) - just run from a value of 0, N times, instead of
  // once. Confirmed directly against the compiler and emulator: N=5 health
  // renders as one solid block, N=3 lives renders as 3 evenly spaced dots,
  // and N=0 safely loops zero times (no wraparound).
  //
  // temp1/temp2 are the compiler's own scratch registers, already reused
  // this way elsewhere for one-off statement-local bookkeeping (see
  // event_frame_even_odd) - nothing needs them to persist past this block.
  const buildBarFillLoop = (varName, targetCode, stepExpression) => [
    `${varName} = 0`,
    `temp1 = ${targetCode}`,
    'for temp2 = 1 to temp1',
    `${varName} = ${stepExpression}`,
    'next',
  ].join('\n') + '\n';

  Blockly.BBasic[`score_bar_set_health`] = function(block) {
    // Fill a score bar with a solid block, N units wide (0-8).
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarFillLoop(varName, argument0, `${varName}*2+1`);
  };

  Blockly.BBasic[`score_bar_set_lives`] = function(block) {
    // Fill a score bar with N evenly spaced dots (0-4).
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarFillLoop(varName, argument0, `${varName}*4+2`);
  };

  // Grows or shrinks a score bar by repeating its one-step doubling/halving
  // move (see buildBarFillLoop above) a number of times, instead of just
  // once like the docs' own "add a life"/"add to health" examples do.
  //
  // The existing raw score_bar_get already returns the bar's plain byte
  // value (not BCD, a normal 0-255 number) - callers wanting a relative
  // change from "the current value" read that directly and do the math
  // themselves; this block only needs the delta, not the current value.
  //
  // A literal delta (the common case - a plain number typed into the
  // block, matching the default shadow) has its direction known at
  // generation time, so it compiles to a single fixed-count loop with no
  // runtime branching at all. A non-literal delta (a variable/expression)
  // can't be sign-branched safely with plain bB comparisons - these bytes
  // are unsigned, so a "negative" runtime value is really a large positive
  // one (two's complement wraparound), not something "temp < 0" can detect
  // - so that case only supports growing the bar; shrinking always needs a
  // literal negative number. Documented on the block's own tooltip.
  const buildBarChangeLoop = (varName, deltaCode, growStep, shrinkStep) => {
    const literalMatch = /^\s*(-?\d+)\s*$/.exec(deltaCode);
    if (literalMatch) {
      const n = parseInt(literalMatch[1], 10);
      if (n === 0) return '';
      const step = n > 0 ? growStep : shrinkStep;
      return [
        `for temp2 = 1 to ${Math.abs(n)}`,
        `${varName} = ${step}`,
        'next',
      ].join('\n') + '\n';
    }
    return [
      `temp1 = ${deltaCode}`,
      'for temp2 = 1 to temp1',
      `${varName} = ${growStep}`,
      'next',
    ].join('\n') + '\n';
  };

  Blockly.BBasic[`score_bar_change_health`] = function(block) {
    // Change a health-style score bar by a number of units.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarChangeLoop(varName, argument0, `${varName}*2+1`, `${varName}/2`);
  };

  Blockly.BBasic[`score_bar_change_lives`] = function(block) {
    // Change a lives-style score bar by a number of dots.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarChangeLoop(varName, argument0, `${varName}*4+2`, `${varName}/4`);
  };
};
