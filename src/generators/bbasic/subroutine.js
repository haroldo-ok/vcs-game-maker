'use strict';
export default (Blockly) => {
  // Doesn't emit inline where it's dropped on the canvas - like an event
  // block, its body is collected here and spliced into its own safe,
  // never-fallen-into spot in the template (see generateSubroutines in
  // bbasic.js), with a label + "return" wrapped around it there.
  //
  // Subroutines always live in bank 1 (no relocation support for them yet,
  // unlike events/backgrounds/animations) - setting currentEventName to a
  // key that's never in RELOCATABLE_EVENTS/eventBanks makes getEventBank()
  // naturally resolve to 1 for anything generated inside this block's body,
  // exactly like it would for any other unknown name.
  Blockly.BBasic['subroutine_define'] = function(block) {
    const name = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
    const previousEventName = Blockly.BBasic.currentEventName;
    Blockly.BBasic.currentEventName = `subroutine_${name}`;
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    Blockly.BBasic.currentEventName = previousEventName;
    Blockly.BBasic.subroutines[name] = code;
    return '';
  };

  // A subroutine's label always lives in bank 1, so calling it from a
  // relocated event's own bank needs the same explicit "bankN" tag any other
  // cross-bank goto/gosub does (see bankJumpSuffix) - calling it from bank 1
  // itself (the common case) stays untagged. "return" never takes a bank
  // suffix of its own - the compiler restores the caller's bank
  // automatically (confirmed directly: tagging return with a bank breaks
  // the entire build with a flood of unrelated "unresolved symbol" errors,
  // a sign of the preprocessor losing its place entirely, not a small
  // mistake) - so nothing on the definition side needs to know or care which
  // bank called it.
  Blockly.BBasic['subroutine_call'] = function(block) {
    const name = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
    const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), 1);
    return `gosub ${name}${suffix}\n`;
  };
};
