'use strict';

export default (Blockly) => {
  Blockly.BBasic[`random_get`] = function(block) {
    const code = `rand`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`random_range_get`] = function(block) {
    const randCode = block.getFieldValue('RAND_CODE');

    return [`${randCode}`, Blockly.BBasic.ORDER_ATOMIC];
  };
};
