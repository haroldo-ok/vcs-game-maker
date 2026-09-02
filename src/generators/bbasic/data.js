'use strict';

import {findDataTableById, dataTableSymbolName, processDataTablesStorageDefaults} from '../../blocks/data';
import {useDataTablesStorage} from '../../hooks/project';

// Auto-generated bB function name (see registerDataDispatchFunction below) -
// resolved through nameDB_/PROCEDURE_CATEGORY_NAME the same way a real
// function_define's own name is (see generators/bbasic/function.js), so it
// can never collide with a user-authored subroutine/function of the same
// name (subroutine_define and function_define already share this one
// namespace on purpose - a real collision between the two caused a genuine
// reported crash before, confirmed unrelated to this dispatch mechanism
// itself - routing through nameDB_ here is what keeps this auto-generated
// name safe from that same class of bug too, not a coincidence).
const DATA_DISPATCH_FUNCTION_CANONICAL_NAME = '_dataElementDispatch';

// Lazily builds (once per compile) a bB `function` that dispatches on a
// runtime table-id argument (temp1) and index argument (temp2), returning
// whichever table's own [index] element - the one bB construct that can
// both branch internally AND be used as a plain inline value expression
// (see function_call's own ORDER_FUNCTION_CALL in generators/bbasic/
// function.js) - a raw "if/goto" dispatch chain has no such value-expression
// form of its own (a value block can't inject a preceding statement - see
// bitCode's own comment below for the same constraint hit elsewhere). Only
// called when TABLE_ID actually needs it (see resolveTableIdLiteral below) -
// a project using only literal TABLE_ID values never pays for this at all.
//
// This was tried once before and reverted after a real, reproduced
// "auto: failed" emulator crash - root-caused, eventually, to TWO
// pre-existing, unrelated bugs in generateFunctions() itself (bbasic.js):
// every compiled bB function was missing its own required closing "end",
// and had no guaranteed exit (no fallback "return") when a function's own
// body didn't reach a function_return block on every path - confirmed
// directly against the reference bB compiler's own source (endfunction()
// validates the "end" keyword; a function has no implicit exit the way a
// subroutine does). BOTH are now fixed at the source (generateFunctions()
// itself), so THIS mechanism - calling an auto-generated function as a
// value expression - is safe again; the earlier revert was never actually
// about this dispatch design being unsound.
//
// Every table in the project gets a branch, not just the ones some literal
// TABLE_ID elsewhere already references - a runtime id can't be narrowed at
// compile time, so any table could be the one actually picked. Each
// referenced table gets trackDataTableBank(table.id, 1) - this function is
// never relocated (bB functions are always bank 1, see this.functions' own
// comment in bbasic.js's init(), and the crash-fix in hooks/rom.js's
// pickRelocationCandidate already keeps every CALLER of this function
// pinned to bank 1 too, for the same reason), so bank 1 is the only bank
// that ever needs a copy.
const registerDataDispatchFunction = (Blockly) => {
  const name = Blockly.BBasic.nameDB_.getName(
      DATA_DISPATCH_FUNCTION_CANONICAL_NAME, Blockly.PROCEDURE_CATEGORY_NAME);
  if (Blockly.BBasic.functions[name]) return name;
  const data = processDataTablesStorageDefaults(useDataTablesStorage());
  // Whichever bank this dispatch function's OWN body ends up compiled into -
  // NOT hardcoded to 1. This function is registered from wherever it's first
  // referenced (a data_get_element_by_id/data_get_bit_by_id block with a
  // dynamic TABLE_ID), always somewhere inside its own eventual relocation
  // family (see computeFunctionFamilies in hooks/rom.js) - so getCurrentBank()
  // here correctly reflects wherever that whole family, including THIS
  // function, is actually going to land. Data tables must be read from the
  // exact same bank they're declared in (confirmed directly against the
  // language reference: "If you try to access data in another bank, there
  // will be no errors, but the data you get will certainly be incorrect.") -
  // hardcoding bank 1 here was correct back when every function was
  // permanently pinned to bank 1, but silently wrong the moment functions
  // became relocatable (see this codebase's own move to make functions
  // relocatable): the dispatch function's compiled code could end up in a
  // different bank than the one this had recorded/emitted the table's own
  // copy into, reading real bytes at the right address but the WRONG bank's
  // content - a real reported bug ("results being returned from the data
  // table are incorrect"), not a crash, since the bank-switched hardware has
  // no way to notice a stale cross-bank read on its own.
  const bank = Blockly.BBasic.getCurrentBank();
  const lines = [];
  (data.dataTables || []).filter((table) => table.values && table.values.length).forEach((table, i) => {
    Blockly.BBasic.trackDataTableBank(table.id, bank);
    const tableName = dataTableSymbolName(table, bank);
    const label = `_datadispatch_${i}`;
    lines.push(
        ` if temp1 <> ${table.id} then goto ${label}`,
        ` return ${tableName}[temp2]`,
        // "@" prefix - this whole body goes through normalizeIndents (see
        // generateFunctions in bbasic.js), which indents every line by
        // default; a label needs to land at column 0 to actually be
        // recognized as one (confirmed directly by a real build failure:
        // "Unknown keyword: _datadispatch_0" - the indented version wasn't
        // parsed as a label at all), same "@" convention
        // generateSubroutineBody's own "@name" already uses.
        `@${label}`,
    );
  });
  // No trailing "return 0" needed here - generateFunctions() already
  // appends one unconditionally after every function's own body (see its
  // own comment in bbasic.js), specifically as a guaranteed fallback exit
  // for exactly this "ran off the end of every branch" case. Adding one
  // here too would just be redundant dead code after that unreachable
  // point.
  Blockly.BBasic.functions[name] = lines.join('\n');
  return name;
};

// Same idea as registerDataDispatchFunction above, but a SINGLE function for
// every dynamic-TABLE_ID data_get_bit_by_id block regardless of which bit
// each one checks - one call, taking the bit index as a genuine 3rd runtime
// argument (temp3), rather than one whole function per distinct bit value.
// An earlier version registered one function per bit (each duplicating the
// full table-iteration chain), then a second version kept one-per-bit but
// at least shared the table lookup via registerDataDispatchFunction - both
// still multiplied total code size by however many distinct bits a project
// actually checks. This version pays a fixed, small cost exactly once,
// however many bits/tables exist: a single call into
// registerDataDispatchFunction's own shared element-lookup, followed by a
// runtime right-shift loop (repeatedly halving via integer division, the
// same "no bitwise operator" floor-division trick bitCode's own comment
// below already documents, just looped a runtime-variable number of times
// instead of a single compile-time-constant divisor) to bring the requested
// bit down to position 0, then the same "mod 2" isolate-the-low-bit step
// bitCode itself uses.
//
// Calling one function from inside another here is safe specifically
// because temp1/temp2 (this function's OWN first two arguments) are never
// needed again after that call - they're passed straight through as-is, and
// nothing here reads them back afterward (contrast function_param_get's own
// comment on why that's normally risky: it only matters if the CALLER still
// needs its own temp1-6 preserved past the call, which this function does
// not). temp3 (this function's own 3rd argument, the bit index) IS read
// again after the call - by the shift loop - but that's fine too: the call
// only clobbers temp1/temp2 (its own 2 arguments), never temp3+.
//
// bitCode's own compound expression (see its own comment below) can't be
// handed to "return" directly - confirmed by a real build failure ("Syntax
// Error ''" from a mangled "LDY #(" line): unlike a plain assignment,
// "return <value>" compiles to a single immediate-mode load
// ("LDY #(value)"), which only accepts a SIMPLE value (a literal, a
// variable, a single table read - same class of constraint this codebase
// has hit before for table indices), not a multi-operator arithmetic
// expression. Broken into separate single-operation statements instead,
// ending in a plain "return temp4" - each one (a division, a
// multiplication, a subtraction) is exactly the "one operator" shape
// already proven safe everywhere else in this codebase.
const DATA_BIT_DISPATCH_FUNCTION_CANONICAL_NAME = '_dataBitDispatch';
const registerDataBitDispatchFunction = (Blockly) => {
  const name = Blockly.BBasic.nameDB_.getName(
      DATA_BIT_DISPATCH_FUNCTION_CANONICAL_NAME, Blockly.PROCEDURE_CATEGORY_NAME);
  if (Blockly.BBasic.functions[name]) return name;
  const elementDispatchName = registerDataDispatchFunction(Blockly);
  // No trailing "return 0" needed - generateFunctions() already appends one
  // unconditionally after every function's own body (see its own comment in
  // bbasic.js), but this function's own last real line is already a
  // "return" on every path anyway, so that fallback is unreachable dead
  // code here regardless, same as it would be for any function whose own
  // blocks already guarantee a return.
  Blockly.BBasic.functions[name] = [
    ` temp4 = ${elementDispatchName}(temp1, temp2)`,
    // Shift temp4 right by temp3 places - "if temp3 = 0" (not "<> 0") so a
    // bit-0 request (the common case) skips the loop body entirely rather
    // than looping zero times the long way round.
    `@_dbd_shift`,
    ` if temp3 = 0 then goto _dbd_shift_done`,
    ` temp4 = temp4 / 2`,
    ` temp3 = temp3 - 1`,
    ` goto _dbd_shift`,
    `@_dbd_shift_done`,
    ` temp5 = (temp4 / 2) * 2`,
    ` temp4 = temp4 - temp5`,
    ` return temp4`,
  ].join('\n');
  return name;
};

export default (Blockly) => {
  // data_get_element_by_id/data_get_bit_by_id's own TABLE_ID is a plain
  // Number value SOCKET (see its own comment in blocks/data.js), not a
  // typed-in field. A literal (a bare math_number) resolves to a real
  // compile-time table, the same fast, zero-cost way TABLE's own dropdown
  // choice already does. Anything else (a variable, a computed expression)
  // routes through registerDataDispatchFunction/registerDataBitDispatchFunction
  // above instead - a real runtime table id, resolved at runtime via an
  // auto-generated bB function.
  const resolveTableIdLiteral = (block) => {
    const target = block.getInputTargetBlock('TABLE_ID');
    return target && target.type === 'math_number' ? target.getFieldValue('NUM') : null;
  };

  // Shared by every data_get_* variant below (looked up either by name via
  // a TABLE dropdown field, or by a resolved TABLE_ID literal - see
  // resolveTableIdLiteral above - the two read identically once the table
  // itself is found, findDataTableById takes either kind of value as-is).
  // Returns null if the table can't be found, so each block's own generator
  // can fall back to its own "0"/"false" default.
  // @return {?string} The table's own element expression, e.g.
  //     "_dt_1_Title[0]", or null.
  const elementCode = (block, tableId) => {
    const table = findDataTableById(tableId);
    if (!table) return null;

    // A table must be read from the same bank it's declared in, so
    // generateDataTables() needs to know every bank this table is actually
    // read from, to emit a copy into each one (see dataTableSymbolName).
    const bank = Blockly.BBasic.getCurrentBank();
    Blockly.BBasic.trackDataTableBank(table.id, bank);

    const name = dataTableSymbolName(table, bank);
    // ORDER_NONE: the index sits inside the table's own "[...]" brackets,
    // which already provide grouping, so it never needs extra parens.
    const index = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_NONE) || '0';
    return `${name}[${index}]`;
  };

  Blockly.BBasic['data_get_element'] = function(block) {
    const element = elementCode(block, block.getFieldValue('TABLE'));
    return element ? [element, Blockly.BBasic.ORDER_MEMBER] : ['0', Blockly.BBasic.ORDER_ATOMIC];
  };

  // Same lookup as data_get_element above, just keyed off TABLE_ID instead
  // of a TABLE dropdown field. A literal still resolves the fast, zero-cost
  // way - direct table[index], no function-call overhead. Anything else (a
  // variable, an expression) routes through registerDataDispatchFunction's
  // own auto-generated bB function instead, called as a plain value
  // expression (name(tableIdCode, indexCode)) - exactly the shape
  // function_call's own buildFunctionCallExpression already uses in
  // generators/bbasic/function.js.
  Blockly.BBasic['data_get_element_by_id'] = function(block) {
    const literalId = resolveTableIdLiteral(block);
    if (literalId != null) {
      const element = elementCode(block, literalId);
      return element ? [element, Blockly.BBasic.ORDER_MEMBER] : ['0', Blockly.BBasic.ORDER_ATOMIC];
    }
    if (!block.getInputTargetBlock('TABLE_ID')) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const dispatchName = registerDataDispatchFunction(Blockly);
    const tableIdCode = Blockly.BBasic.valueToCode(block, 'TABLE_ID', Blockly.BBasic.ORDER_NONE) || '0';
    const indexCode = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_NONE) || '0';
    return [`${dispatchName}(${tableIdCode}, ${indexCode})`, Blockly.BBasic.ORDER_FUNCTION_CALL];
  };

  // batari Basic's own "{n}" bit-index syntax (same one bit_get uses, see
  // generators/bbasic/bit.js) only works on a plain variable - chaining it
  // straight onto an array read ("table[index]{n}") isn't valid syntax; a
  // real compile confirmed it (the assembler choked on a mangled
  // "LDX #0]{0" line). Pure arithmetic sidesteps that entirely: bit N of a
  // byte V equals floor(V / 2^N) - floor(V / 2^(N+1)) * 2 (the low bit of
  // V's own value shifted N places down, extracted via a floor-division
  // trick instead of a bitwise AND, which batari Basic doesn't expose as
  // an operator at all). Division by a compile-time power of 2 compiles to
  // a cheap shift (see math.js's own comment on this), and every operand
  // here is a non-negative byte, so plain integer division already floors
  // exactly like this needs.
  //
  // The one real cost: since this has to stay a single self-contained
  // expression (a value block can't inject a preceding temp-variable
  // assignment the way a statement can), the table lookup itself
  // (elementCode's own return value) appears twice in the generated code -
  // one extra array read's worth of bytes/cycles versus reading it once,
  // but no behavior difference (a data table read has no side effects).
  const bitCode = (element, bit) => {
    const divisorLow = 1 << bit;
    const divisorHigh = divisorLow * 2;
    return `((${element} / ${divisorLow}) - ((${element} / ${divisorHigh}) * 2))`;
  };

  Blockly.BBasic['data_get_bit'] = function(block) {
    const element = elementCode(block, block.getFieldValue('TABLE'));
    if (!element) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    return [bitCode(element, Number(block.getFieldValue('BIT'))), Blockly.BBasic.ORDER_ATOMIC];
  };

  // Same bit-check as data_get_bit above, just keyed off TABLE_ID instead of
  // a TABLE dropdown field - same literal-fast-path/dispatch-fallback split
  // as data_get_element_by_id above, EXCEPT the dynamic path calls
  // registerDataBitDispatchFunction (not registerDataDispatchFunction +
  // bitCode) - see that function's own comment for why: bitCode wrapping a
  // function call in arithmetic is illegal bB (confirmed against the
  // reference compiler's own source), so the dynamic path always returns a
  // bare function call, never a compound expression built around one.
  Blockly.BBasic['data_get_bit_by_id'] = function(block) {
    const literalId = resolveTableIdLiteral(block);
    const bit = Number(block.getFieldValue('BIT'));
    if (literalId != null) {
      const element = elementCode(block, literalId);
      if (!element) return ['0', Blockly.BBasic.ORDER_ATOMIC];
      return [bitCode(element, bit), Blockly.BBasic.ORDER_ATOMIC];
    }
    if (!block.getInputTargetBlock('TABLE_ID')) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    // One shared function regardless of which bit this specific block
    // checks - bit is passed as a genuine 3rd runtime argument, a plain
    // compile-time literal here (BIT is a fixed field, not a socket) but
    // read back at runtime by the function's own shift loop either way.
    const dispatchName = registerDataBitDispatchFunction(Blockly);
    const tableIdCode = Blockly.BBasic.valueToCode(block, 'TABLE_ID', Blockly.BBasic.ORDER_NONE) || '0';
    const indexCode = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_NONE) || '0';
    return [`${dispatchName}(${tableIdCode}, ${indexCode}, ${bit})`, Blockly.BBasic.ORDER_FUNCTION_CALL];
  };
};
