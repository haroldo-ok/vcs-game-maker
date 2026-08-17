'use strict';

import {findDataTableById, dataTableSymbolName} from '../../blocks/data';

export default (Blockly) => {
  // Shared by every data_get_* variant below (looked up either by name via
  // a TABLE dropdown, or by a typed TABLE_ID number field - the two read
  // identically once the table itself is found, findDataTableById takes
  // either kind of field value as-is). Returns null if the table can't be
  // found, so each block's own generator can fall back to its own "0"/
  // "false" default.
  // @return {?string} The table's own element expression, e.g.
  //     "_dt_1_Title[0]", or null.
  const elementCode = (block, tableFieldName) => {
    const table = findDataTableById(block.getFieldValue(tableFieldName));
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
    const element = elementCode(block, 'TABLE');
    return element ? [element, Blockly.BBasic.ORDER_MEMBER] : ['0', Blockly.BBasic.ORDER_ATOMIC];
  };

  // Same lookup as data_get_element above, just keyed off a typed TABLE_ID
  // field instead of a TABLE dropdown.
  Blockly.BBasic['data_get_element_by_id'] = function(block) {
    const element = elementCode(block, 'TABLE_ID');
    return element ? [element, Blockly.BBasic.ORDER_MEMBER] : ['0', Blockly.BBasic.ORDER_ATOMIC];
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
    const element = elementCode(block, 'TABLE');
    if (!element) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    return [bitCode(element, Number(block.getFieldValue('BIT'))), Blockly.BBasic.ORDER_ATOMIC];
  };

  // Same bit-check as data_get_bit above, just keyed off a typed TABLE_ID
  // field instead of a TABLE dropdown - same relationship
  // data_get_element_by_id has to data_get_element.
  Blockly.BBasic['data_get_bit_by_id'] = function(block) {
    const element = elementCode(block, 'TABLE_ID');
    if (!element) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    return [bitCode(element, Number(block.getFieldValue('BIT'))), Blockly.BBasic.ORDER_ATOMIC];
  };
};
