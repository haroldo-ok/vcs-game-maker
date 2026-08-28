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

    // "- 1" compensates for commongamelogic's own "framecounter =
    // framecounter + 1" (see bbasic.bb.hbs), which always runs before any
    // event body (and so before this check) gets a chance to run each
    // frame - without it, the very first frame this block's own event body
    // ever executes already sees framecounter = 1, not 0, so "every N
    // frames" never actually fires on that first frame, only starting once
    // framecounter reaches a full interval later. Confirmed as a real
    // reported bug ("should trigger immediately and then wait to repeat").
    // Safe against framecounter's own eventual wraparound (255 -> 0, a
    // real free-running byte): "framecounter - 1" wraps to 255 exactly the
    // same way the 6502's own unsigned subtraction does, and since every
    // MASK option here is 2^n-1 (interval a power of two dividing 256
    // evenly - see FRAME_OPTIONS in blocks/event.js), the resulting
    // periodicity is identical regardless of which representative of
    // framecounter this lands on.
    return '\n' +
    [
      `temp1 = (framecounter - 1 + ${frameDelta}) & ${frameMask}`,
      `if temp1 then goto ${labelEnd}`,
      code,
      `@ ${labelEnd}`,
    ].join('\n') +
    '\n';
  };

  Blockly.BBasic['event_run_once'] = function(block) {
    // Run once PER ACTIVATION of whatever condition contains this block
    // (e.g. once each time an enclosing "if BGScene = 2" becomes true,
    // again next time it does) - not just once ever. See bbasic.js's
    // init() for where runOnceCounter/runOnceByteLetters come from (one
    // shared byte per 4 instances - low nibble bit p is instance p's
    // "touched" flag, high nibble bit p+4 is its "fired" flag), and
    // generateRunOnceEdgeReset for the other half of this: this block's own
    // code only ever runs while its gate is true, so it can mark itself
    // "touched" whenever it's reached, but can't itself detect the gate
    // going false - that's what the unconditional per-frame reset (spliced
    // into commongamelogic, always running before this) is for, clearing
    // the "fired" bit for any instance that went a whole frame untouched.
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_run_once_${blockNumber}_end`;

    const instanceIndex = Blockly.BBasic.runOnceCounter++;
    const byteIndex = Math.floor(instanceIndex / 4);
    const pairInByte = instanceIndex % 4;
    const touchedBit = pairInByte;
    const firedBit = pairInByte + 4;
    const flagByte = Blockly.BBasic.runOnceByteLetters[byteIndex];

    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();

    return '\n' +
    [
      `${flagByte}{${touchedBit}} = 1`,
      `if ${flagByte}{${firedBit}} then goto ${labelEnd}`,
      `${flagByte}{${firedBit}} = 1`,
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
