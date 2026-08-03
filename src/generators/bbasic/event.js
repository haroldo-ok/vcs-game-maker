'use strict';
export default (Blockly) => {
  Blockly.BBasic['event_block'] = function(block) {
    // Event block
    const eventName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('EVENT'),
        Blockly.VARIABLE_CATEGORY_NAME);
    // Tracks which event's blocks are currently being generated, so nested
    // blocks (event_change_state, data table reads) know which bank they'll
    // end up in - restored afterwards in case event blocks are ever nested.
    const previousEventName = Blockly.BBasic.currentEventName;
    Blockly.BBasic.currentEventName = eventName;
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    Blockly.BBasic.currentEventName = previousEventName;
    Blockly.BBasic.addGameEvent(eventName, code);
    return '';
  };

  Blockly.BBasic['event_change_state'] = function(block) {
    // Change game state
    const stateName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('STATE'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const targetEvent = `${stateName}_start`;
    // A state's "_start" event might live in a different bank than wherever
    // this goto is - see getCurrentBank/bankJumpSuffix.
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getEventBank(targetEvent));
    // A statement generator's own return value must include its trailing
    // newline - Blockly.BBasic.scrub_ (see bbasic.js) concatenates sequential
    // statements in a stack with no separator of its own, so a plain "goto"
    // like this one would otherwise run straight into whatever statement
    // follows it in the same block stack, on the same line. Pre-existing gap
    // (unrelated to bank-switching): found because this is the first time a
    // "change state" block was tested immediately followed by another
    // statement inside the same event.
    return `goto ${targetEvent}_begin${suffix}\n`;
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

  Blockly.BBasic['event_run_once'] = function(block) {
    // Run once - see bbasic.js's init() for where runOnceCounter/
    // runOnceByteLetters come from: one bit per instance, packed 8 to a
    // byte, in the same dimmed-and-lettered bytes every "Run once" block in
    // the project shares.
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_run_once_${blockNumber}_end`;

    const bitIndex = Blockly.BBasic.runOnceCounter++;
    const byteIndex = Math.floor(bitIndex / 8);
    const bitInByte = bitIndex % 8;
    const flagByte = Blockly.BBasic.runOnceByteLetters[byteIndex];

    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();

    return '\n' +
    [
      `if ${flagByte}{${bitInByte}} then goto ${labelEnd}`,
      `${flagByte}{${bitInByte}} = 1`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };

  // "rem" runs to the end of the line, so a newline (shouldn't be reachable
  // through a single-line text field, but nothing stops a pasted value)
  // would otherwise let whatever's after it escape the comment and
  // potentially assemble as code.
  const sanitizeCommentText = (text) => text.replace(/[\r\n]+/g, ' ');

  Blockly.BBasic['event_comment'] = function(block) {
    return ` rem ${sanitizeCommentText(block.getFieldValue('TEXT'))}\n`;
  };

  // Wrapper version - purely a label around whatever's connected inside
  // "DO", which runs completely unchanged (statementToCode's own output,
  // passed straight through with no gosub/goto/state tracking of any kind -
  // unlike event_block, this doesn't represent a new event, just a labeled
  // section of an existing one).
  Blockly.BBasic['event_comment_wrapper'] = function(block) {
    const comment = ` rem ${sanitizeCommentText(block.getFieldValue('TEXT'))}\n`;
    const code = Blockly.BBasic.statementToCode(block, 'DO');
    return comment + code;
  };
};
