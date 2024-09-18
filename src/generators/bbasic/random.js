'use strict';

export default (Blockly) => {
  Blockly.BBasic[`random_get`] = function(block) {
    const code = `rand`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`random_range_get`] = function(block) {
    const rangeStart = block.getFieldValue('RANGE_START');
    const rangeEnd = block.getFieldValue('RANGE_END');

    const code =
      `rem ${rangeStart} to ${rangeEnd}\n` +
      `temp1 = rand \n` +
      `player0x = rand / 4 + 20`;
    return code;
  };
};
