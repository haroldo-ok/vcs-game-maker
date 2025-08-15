'use strict';

export default (Blockly) => {
  Blockly.BBasic['color_get'] = function(block) {
    // Color getter.
    const colorIndex = parseInt(block.getFieldValue('COLOR')) || 0;
    return [colorIndex, Blockly.BBasic.ORDER_ATOMIC];
  };
};
