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
};
