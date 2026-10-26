'use strict';

import {overlapAnswerRef} from './sprite-overlap';

export default (Blockly) => {
  Blockly.BBasic['sprite_overlap_event'] = function(block) {
    return [overlapAnswerRef(Blockly, block), Blockly.BBasic.ORDER_ATOMIC];
  };
};
