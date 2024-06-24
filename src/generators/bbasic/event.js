'use strict';
export default (Blockly) => {
  Blockly.BBasic['event_block'] = function(block) {
    // Event block
    const eventName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('EVENT'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    Blockly.BBasic.addGameEvent(eventName, code);
    return '';
  };
};
