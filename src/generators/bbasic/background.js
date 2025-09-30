'use strict';

export default (Blockly) => {
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
    // Background color setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    return varName + ' = ' + argument0 + '\n';
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

