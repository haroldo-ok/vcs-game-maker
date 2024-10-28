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

  Blockly.BBasic['event_change_state'] = function(block) {
    // Change game state
    const stateName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('STATE'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return `goto ${stateName}_start_begin`;
  };

  Blockly.BBasic['event_frame_even_odd'] = function(block) {
    // Block for even/odd frames
    const blockNumber = Blockly.BBasic.blockNumbers.next();

    const labelStart = `_if_${blockNumber}`;
    const labelOdd = `${labelStart}_odd`;
    const labelEnd = `${labelStart}_end`;

    const evenCode = Blockly.BBasic.statementToCode(block, 'DO_EVEN').trim();
    const oddCode = Blockly.BBasic.statementToCode(block, 'DO_ODD').trim();
    return '\n' +
    [
      'temp1 = framecounter & 1',
      `if temp1 then goto ${labelOdd}`,
      evenCode,
      `goto ${labelEnd}`,
      `@ ${labelOdd}`,
      oddCode,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };
};
