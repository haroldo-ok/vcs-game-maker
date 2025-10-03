'use strict';

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
};
