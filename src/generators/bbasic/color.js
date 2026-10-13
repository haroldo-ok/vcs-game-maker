'use strict';

import {tvColorByte} from '../../utils/palette';

export default (Blockly) => {
  Blockly.BBasic['color_get'] = function(block) {
    // Color getter.
    const colorIndex = parseInt(block.getFieldValue('COLOR')) || 0;
    // Swapped for the closest PAL color on a PAL60 project (see tvColorByte).
    return [tvColorByte(colorIndex), Blockly.BBasic.ORDER_ATOMIC];
  };
};
