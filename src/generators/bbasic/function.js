'use strict';

import {MAX_FUNCTION_ARGS} from '../../blocks/function';

export default (Blockly) => {
  // Doesn't emit inline where it's dropped on the canvas - like
  // subroutine_define, its body is collected here and spliced into its own
  // never-fallen-into spot (see generateFunctions in bbasic.js), with a real
  // "function <name>" header wrapped around it there.
  //
  // currentEventName is set to "subroutine_<name>" - the SAME prefix
  // subroutine_define uses, so getCurrentBank() resolves any bank-crossing
  // code generated INSIDE this function's own body (a subroutine_call, a
  // data table read) through getSubroutineBank(name), which falls back to
  // bank 1 for any name it's never heard of (functions are never registered
  // into the subroutine-relocation map) - exactly the "always bank 1" pin
  // this first implementation wants (see this.functions' own comment in
  // bbasic.js), reusing the existing fallback rather than hand-rolling a
  // separate one.
  Blockly.BBasic['function_define'] = function(block) {
    const name = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
    const previousEventName = Blockly.BBasic.currentEventName;
    Blockly.BBasic.currentEventName = `subroutine_${name}`;
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    Blockly.BBasic.currentEventName = previousEventName;
    Blockly.BBasic.functions[name] = code;
    return '';
  };

  // temp1..temp6 are batari Basic's own fixed calling convention for a
  // function's arguments (confirmed directly against the language
  // reference) - not a name this app invents or reserves, so this needs no
  // nameDB_/dev-var involvement at all, just the literal text for whichever
  // slot the dropdown picked.
  Blockly.BBasic['function_param_get'] = function(block) {
    const index = block.getFieldValue('INDEX');
    return [`temp${index}`, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['function_return'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    return `return ${value}\n`;
  };

  // Shared by function_call and function_call_statement below - resolves
  // which function this call block actually targets (with the same
  // dropdown-can-be-stale safety net as subroutine_call's own generator in
  // generators/bbasic/subroutine.js - see its comment for the full
  // explanation) and builds the "name(arg1, arg2, ...)" call expression
  // itself.
  // Arguments are positional (arg 1 -> temp1, arg 2 -> temp2, ...), so a gap
  // can't just be skipped - leaving ARG1 empty but filling ARG3 has to still
  // emit 3 comma-separated values (with a "0" placeholder for the empty
  // ARG1/ARG2) or the real argument meant for slot 3 would land in temp1
  // instead. Only trims the UNUSED tail past the highest slot actually
  // connected, matching the real language's own "extra arguments are
  // ignored" behavior for a function that reads fewer than 6.
  const buildFunctionCallExpression = (block) => {
    let fieldValue = block.getFieldValue('NAME');
    if (block.workspace) {
      const definedNames = [...new Set(
          block.workspace.getBlocksByType('function_define', false)
              .map((defineBlock) => defineBlock.getFieldValue('NAME'))
              .filter(Boolean),
      )];
      if (definedNames.length && !definedNames.includes(fieldValue)) {
        fieldValue = definedNames[0];
      }
    }
    const name = Blockly.BBasic.nameDB_.getName(
        fieldValue, Blockly.PROCEDURE_CATEGORY_NAME);
    let highestConnected = 0;
    for (let i = 1; i <= MAX_FUNCTION_ARGS; i++) {
      if (block.getInputTargetBlock(`ARG${i}`)) highestConnected = i;
    }
    const args = [];
    for (let i = 1; i <= highestConnected; i++) {
      args.push(Blockly.BBasic.valueToCode(block, `ARG${i}`, Blockly.BBasic.ORDER_NONE) || '0');
    }
    return `${name}(${args.join(', ')})`;
  };

  // Compiles straight to batari Basic's own real function-call syntax -
  // "name(arg1, arg2, ...)" - used directly as a value expression, unlike
  // subroutine_call's "gosub" (a statement).
  Blockly.BBasic['function_call'] = function(block) {
    return [buildFunctionCallExpression(block), Blockly.BBasic.ORDER_FUNCTION_CALL];
  };

  // Same call as function_call above, but as a standalone statement (see
  // blocks/function.js's own comment on function_call_statement) - the
  // language itself only exposes function calls as value expressions, so
  // this still has to assign the result SOMEWHERE; temp1 is always safe to
  // clobber here (see the language reference's own note that the temp
  // variables are "always obliterated by the kernel" and that "user
  // functions also pass values by way of these variables" - nothing
  // upstream of this statement could have been relying on temp1 surviving
  // across a function call anyway).
  Blockly.BBasic['function_call_statement'] = function(block) {
    return `temp1 = ${buildFunctionCallExpression(block)}\n`;
  };
};
