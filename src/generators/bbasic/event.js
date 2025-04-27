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

    const labelStart = `_frame_even_odd_${blockNumber}`;
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

  Blockly.BBasic['event_frame_every_n'] = function(block) {
    // Every n frames
    const blockNumber = Blockly.BBasic.blockNumbers.next();

    const labelStart = `_frame_every_n_${blockNumber}`;
    const labelEnd = `${labelStart}_end`;

    const frameMask = block.getFieldValue('MASK');
    const frameDelta = block.getFieldValue('DELTA');
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();

    return '\n' +
    [
      `temp1 = (framecounter + ${frameDelta}) & ${frameMask}`,
      `if temp1 then goto ${labelEnd}`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };
};
