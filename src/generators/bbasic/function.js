'use strict';

import {MAX_FUNCTION_ARGS, functionCallDiscardVarName, functionCallArgVarName} from '../../blocks/function';

export default (Blockly) => {
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  // Lazily builds (once per compile, per distinct target function) a tiny bB
  // subroutine that does nothing but forward function_call_statement's own
  // pre-stashed arguments (see functionCallArgVarName's own comment in
  // blocks/function.js) into a real call to the function itself, then
  // discards the result the same way an inline call would. Registered into
  // Blockly.BBasic.subroutines - the exact same map subroutine_define itself
  // populates - so it participates in the normal "@name ... return" wrapping
  // (see generateSubroutines in generators/bbasic.js) like any other
  // subroutine.
  //
  // This subroutine itself still calls the function directly, so it's still
  // pinned to bank 1 the same way any function-caller is (see
  // codeReferencesAnyFunction's own comment in generators/bbasic.js) - but
  // it's only ever a single line, not however much unrelated code happened to
  // share a statement stack with the original inline call. THAT surrounding
  // code now reaches it via "gosub" instead (see function_call_statement
  // below), which - unlike a bare function call - does carry a bank tag, so
  // the event/subroutine containing it is free to relocate normally again.
  const registerFunctionCallWrapper = (targetName) => {
    const wrapperName = Blockly.BBasic.nameDB_.getName(
        `_call_${targetName}`, Blockly.PROCEDURE_CATEGORY_NAME);
    if (Blockly.BBasic.subroutines[wrapperName]) return wrapperName;
    const args = Array.from(
        {length: MAX_FUNCTION_ARGS}, (_, i) => resolveVar(functionCallArgVarName(i + 1)));
    Blockly.BBasic.subroutines[wrapperName] =
      `${resolveVar(functionCallDiscardVarName())} = ${targetName}(${args.join(', ')})`;
    // Tracked so hooks/rom.js's computeFunctionFamilies can recognize this
    // subroutine as a function-call wrapper (its own body is a plain
    // value-form function call, so it has to join that function's own
    // relocation family) rather than an ordinary user-authored subroutine
    // (independently relocatable on its own, via a bank-taggable "gosub").
    Blockly.BBasic.functionCallWrapperNames.add(wrapperName);
    return wrapperName;
  };

  // Doesn't emit inline where it's dropped on the canvas - like
  // subroutine_define, its body is collected here and spliced into its own
  // never-fallen-into spot (see generateFunctions in bbasic.js), with a real
  // "function <name>" header wrapped around it there.
  //
  // currentEventName is set to "function_<name>" - a DISTINCT prefix from
  // subroutine_define's own "subroutine_<name>" - so getCurrentBank()
  // resolves any bank-crossing code generated INSIDE this function's own
  // body (a subroutine_call, a data table read, a nested function call)
  // through getFunctionBank(name) instead, which reflects wherever THIS
  // function's own relocation family (see computeFunctionFamilies in
  // hooks/rom.js) actually ends up - not always bank 1.
  Blockly.BBasic['function_define'] = function(block) {
    const name = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
    const previousEventName = Blockly.BBasic.currentEventName;
    Blockly.BBasic.currentEventName = `function_${name}`;
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

  // "return <value>" only accepts a SIMPLE value (a literal, a variable, a
  // single table read) - confirmed by a real build failure ("Syntax Error
  // ''" from a mangled "LDY #(" line): unlike a plain assignment, it
  // compiles to a single immediate-mode load ("LDY #(value)"), which can't
  // hold a genuine multi-operator compound expression (e.g. data_get_bit's
  // own division/subtraction formula, or any math_arithmetic chain) the way
  // "var = <expression>" can. Captured into temp6 first (an ordinary
  // statement, always legal for ANY expression) rather than risking that
  // same failure for every possible VALUE input - safe to reuse
  // unconditionally regardless of whether this function itself already uses
  // temp6 as its own 6th argument, since "return" ends the function's own
  // execution immediately: nothing after this line ever runs, so nothing
  // ever needs temp6's PRE-return-statement value again either way.
  Blockly.BBasic['function_return'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    return `temp6 = ${value}\nreturn temp6\n`;
  };

  // Shared by function_call and function_call_statement below - resolves
  // which function this call block actually targets (with the same
  // dropdown-can-be-stale safety net as subroutine_call's own generator in
  // generators/bbasic/subroutine.js - see its comment for the full
  // explanation) and builds the "name(arg1, arg2, ...)" call expression
  // itself.
  // Always emits all MAX_FUNCTION_ARGS positions, "0" for any slot the user
  // hasn't plugged something into (rather than trimming the call to however
  // many are actually connected) - with the call block's own ARG inputs now
  // starting hidden past whatever's connected (see blocks/function.js's
  // updateFunctionCallArgVisibility), a called function reading further
  // arguments than the caller happened to show/fill in would otherwise read
  // whatever stale value temp1-temp6 last held, not a predictable 0.
  const resolveFunctionCallTarget = (block) => {
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
    const args = [];
    for (let i = 1; i <= MAX_FUNCTION_ARGS; i++) {
      args.push(Blockly.BBasic.valueToCode(block, `ARG${i}`, Blockly.BBasic.ORDER_NONE) || '0');
    }
    return {name, args};
  };

  // Compiles straight to batari Basic's own real function-call syntax -
  // "name(arg1, arg2, ...)" - used directly as a value expression, unlike
  // subroutine_call's "gosub" (a statement). Always inline (never routed
  // through registerFunctionCallWrapper below): a value block can't inject a
  // preceding "gosub" statement of its own (same constraint documented on
  // data_get_element_by_id's dynamic path in generators/bbasic/data.js), so
  // there's no way to relocate the surrounding code out from under a call
  // used this way regardless - only function_call_statement's OWN standalone
  // call needs (or can use) the wrapper.
  Blockly.BBasic['function_call'] = function(block) {
    const {name, args} = resolveFunctionCallTarget(block);
    return [`${name}(${args.join(', ')})`, Blockly.BBasic.ORDER_FUNCTION_CALL];
  };

  // Same call as function_call above, but as a standalone statement (see
  // blocks/function.js's own comment on function_call_statement). Routed
  // through a tiny per-function wrapper subroutine (registerFunctionCallWrapper
  // above) rather than calling the function inline here: unlike a bare
  // function call, "gosub" DOES carry a bank tag, so stashing the arguments
  // into dedicated dev vars (functionCallArgVarName - NOT temp1-temp6, which
  // are ALSO argument storage for whichever function this statement might
  // itself be sitting inside, see function_param_get's own comment above) and
  // gosub-ing to the wrapper keeps the event/subroutine THIS statement lives
  // in free to relocate normally, instead of being dragged permanently into
  // bank 1 alongside the function itself (confirmed as a real reported
  // ROM-capacity overflow once enough unrelated code shared a statement stack
  // with a single inline function call).
  Blockly.BBasic['function_call_statement'] = function(block) {
    const {name, args} = resolveFunctionCallTarget(block);
    const wrapperName = registerFunctionCallWrapper(name);
    const assignments = args
        .map((argCode, i) => `${resolveVar(functionCallArgVarName(i + 1))} = ${argCode}`)
        .join('\n');
    const suffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(wrapperName));
    return `${assignments}\ngosub ${wrapperName}${suffix}\n`;
  };
};
