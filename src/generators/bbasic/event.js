'use strict';
export default (Blockly) => {
  Blockly.BBasic['event_block'] = function(block) {
    // Event block
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    return code;
  };
};
