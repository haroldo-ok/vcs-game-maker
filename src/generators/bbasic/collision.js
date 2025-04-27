'use strict';

export default (Blockly) => {
  Blockly.BBasic[`collision_get`] = function(block) {
    const var0 = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR0'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const var1 = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR1'),
        Blockly.VARIABLE_CATEGORY_NAME);

    const code = var0 === var1 ? 'true' :
      `collision(${var0}, ${var1})`;

    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };
};
