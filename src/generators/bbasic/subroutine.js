'use strict';
export default (Blockly) => {
  // Doesn't emit inline where it's dropped on the canvas - like an event
  // block, its body is collected here and spliced into its own safe,
  // never-fallen-into spot in the template (see generateSubroutines in
  // bbasic.js), with a label + "return" wrapped around it there - or, once
  // relocated (see getSubroutineBank), into that bank's own section instead
  // (see generateRelocatedSections).
  //
  // currentEventName is set to "subroutine_<name>" (a prefix
  // getCurrentBank() specifically recognizes and resolves through
  // getSubroutineBank rather than getEventBank) so any bank-crossing code
  // generated INSIDE this subroutine's own body - a nested subroutine call,
  // a data table read - correctly targets wherever THIS subroutine actually
  // ends up, not always bank 1.
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

  // A subroutine's label can live in any bank now (see getSubroutineBank),
  // so calling it needs the same explicit "bankN" tag any other cross-bank
  // goto/gosub does (see bankJumpSuffix) whenever the caller and the
  // subroutine's own bank differ - calling it from its own bank (the common
  // case, including every call before this feature existed, when everything
  // was always bank 1) stays untagged. "return" never takes a bank suffix of
  // its own - the compiler restores the caller's bank automatically
  // (confirmed directly: tagging return with a bank breaks the entire build
  // with a flood of unrelated "unresolved symbol" errors, a sign of the
  // preprocessor losing its place entirely, not a small mistake) - so
  // nothing on the definition side needs to know or care which bank called
  // it.
  Blockly.BBasic['subroutine_call'] = function(block) {
    // The dropdown's own displayed value can be a stale/empty leftover from
    // before it's had a chance to snap to a real subroutine (see
    // ensureSubroutineCallListener in blocks/subroutine.js) - that snapping
    // is UI-timing-dependent, not guaranteed to have happened yet by the
    // time code generation runs, so it's re-checked here against the
    // workspace's own subroutine_define blocks (always fully present by
    // generation time, regardless of UI state) rather than trusting the
    // field verbatim. An empty/unmatched name would otherwise compile to a
    // blank "gosub" target, which the assembler reports as the cryptic
    // "jsr .unnamed" - falling back to whichever subroutine is actually
    // defined keeps the ROM buildable instead.
    let fieldValue = block.getFieldValue('NAME');
    if (block.workspace) {
      const definedNames = [...new Set(
          block.workspace.getBlocksByType('subroutine_define', false)
              .map((defineBlock) => defineBlock.getFieldValue('NAME'))
              .filter(Boolean),
      )];
      if (definedNames.length && !definedNames.includes(fieldValue)) {
        fieldValue = definedNames[0];
      }
    }
    const name = Blockly.BBasic.nameDB_.getName(
        fieldValue, Blockly.PROCEDURE_CATEGORY_NAME);
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name));
    return `gosub ${name}${suffix}\n`;
  };
};
