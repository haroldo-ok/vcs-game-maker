'use strict';

import * as Blockly from 'blockly/core';

import {BIT_OPTIONS} from './bit';
import {useDataTablesStorage} from '../hooks/project';
import {BIT_ICON, DATA_ICON} from './icon';

const DATA_COLOR = 'rgb(121, 85, 72)';

// batari Basic's "data" statement caps a table at 256 elements (it's a
// read-only lookup table baked into ROM, indexed like an array - not a
// mutable variable array).
export const MAX_DATA_TABLE_VALUES = 256;

// How many value fields DataEditor.vue displays per row before wrapping to a
// new one - purely a display preference (see table.columns there), stored
// per table so it survives a reload. Also the fallback for any table saved
// before this feature existed, which won't have its own "columns" yet.
export const DEFAULT_DATA_TABLE_COLUMNS = 4;

export const DEFAULT_DATA_TABLES = {
  dataTables: [
    {
      id: 1,
      name: 'Example table',
      values: [0, 1, 2, 3],
      columns: DEFAULT_DATA_TABLE_COLUMNS,
    },
  ],
};

export const processDataTablesStorageDefaults = (dataTablesStorage) => {
  const dataTables = dataTablesStorage.value;
  if (!dataTables || !dataTables.dataTables || !dataTables.dataTables.length) {
    return structuredClone(DEFAULT_DATA_TABLES);
  }
  return dataTables;
};

// The name the user types is free-form text for display, so it is never used
// directly as the bBasic symbol: the id keeps the generated symbol unique and
// stable even if two tables share a display name or one gets renamed.
//
// A table can only be read correctly from the same bank it's declared in
// (see the bank-targeting feasibility notes), so a table read from more than
// one bank needs a separate physical copy per bank - each copy needs its own
// symbol name, hence the bank number baked in here. Bank 1 keeps the
// original (suffix-less) name some existing generated projects may already
// reference.
export const dataTableSymbolName = (table, bank = 1) => {
  const sanitized = (table.name || '').replace(/[^A-Za-z0-9]/g, '_');
  const base = `_dt_${table.id}_${sanitized}`.replace(/_+$/, '');
  return bank === 1 ? base : `${base}_b${bank}`;
};

// Read the data tables afresh rather than through the module level storage:
// that is a computed over localStorage, which is not reactive, so it caches
// the first value it ever read and would keep serving stale names.
const buildDataTableOptions = () => {
  try {
    const data = processDataTablesStorageDefaults(useDataTablesStorage());
    return data.dataTables.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list data table options', e);
    return [['Error', '1']];
  }
};

// Looks up one stored data table by id, or null if it can't be found.
export const findDataTableById = (id) => {
  try {
    const data = processDataTablesStorageDefaults(useDataTablesStorage());
    return data.dataTables.find((table) => `${table.id}` === `${id}`) || null;
  } catch (e) {
    console.error('Failed to load data table', e);
    return null;
  }
};

// Defined here instead of in a JSON array below, because a JSON definition can
// only take a fixed list of dropdown options. Passing the function to
// FieldDropdown lets Blockly rebuild the list every time the dropdown opens,
// so renamed, added and deleted tables show up without reloading the page.
Blockly.Blocks['data_get_element'] = {
  init: function() {
    this.appendValueInput('INDEX')
        .setCheck('Number')
        .appendField(`${DATA_ICON} Data table:`)
        .appendField(new Blockly.FieldDropdown(buildDataTableOptions), 'TABLE')
        .appendField('at index');
    this.setOutput(true, 'Number');
    this.setColour(DATA_COLOR);
    this.setTooltip('Reads a value out of a read-only data table set up on the Data tab. ' +
      'The table can only be read, not written to.');
  },
};

// Same table lookup as data_get_element above, just chosen by typing its ID
// number directly (see the ID badge shown on each table card on the Data
// tab) instead of picking it from a name dropdown - lets a project with
// many similarly-structured tables be built generically (e.g. a formula
// elsewhere computing which table's own ID to read) rather than hardcoding
// one specific table by name at edit time.
Blockly.Blocks['data_get_element_by_id'] = {
  init: function() {
    this.appendValueInput('INDEX')
        .setCheck('Number')
        .appendField(`${DATA_ICON} Data table ID`)
        .appendField(new Blockly.FieldNumber(1, 1), 'TABLE_ID')
        .appendField('at index');
    this.setOutput(true, 'Number');
    this.setColour(DATA_COLOR);
    this.setTooltip('Reads a value out of a read-only data table, chosen by typing its own ID ' +
      'number (see the ID badge on its card on the Data tab) instead of picking it from a ' +
      'dropdown. The table can only be read, not written to.');
  },
};

// A plain VALUE block, pluggable directly into a standard "if" (or any
// other Number/Boolean socket) - unlike batari Basic's own "{n}" bit-index
// syntax (see generators/bbasic/bit.js), which only works on a plain
// variable and can't be chained onto an array read like "table[index]{n}"
// (confirmed by a real compile: the assembler choked on a mangled
// "LDX #0]{0" line). Its own generator instead computes the bit with pure
// arithmetic (see its own comment there) - no "{n}" syntax, no temp
// variable, so it never runs into that limitation at all.
Blockly.Blocks['data_get_bit'] = {
  init: function() {
    this.appendValueInput('INDEX')
        .setCheck('Number')
        .appendField(`${DATA_ICON} Data table:`)
        .appendField(new Blockly.FieldDropdown(buildDataTableOptions), 'TABLE')
        .appendField(`${BIT_ICON} bit`)
        .appendField(new Blockly.FieldDropdown(BIT_OPTIONS), 'BIT')
        .appendField('at index');
    this.setOutput(true, 'Boolean');
    this.setColour(DATA_COLOR);
    this.setTooltip('Checks a single bit (0-7) of a value read out of a read-only data table ' +
      'set up on the Data tab - lets one byte pack up to 8 true/false flags.');
  },
};

// Same bit-check as data_get_bit above, just choosing its table by typing
// its own ID number (see the ID badge on its card on the Data tab) instead
// of picking it from a name dropdown - same relationship
// data_get_element_by_id has to data_get_element.
Blockly.Blocks['data_get_bit_by_id'] = {
  init: function() {
    this.appendValueInput('INDEX')
        .setCheck('Number')
        .appendField(`${DATA_ICON} Data table ID`)
        .appendField(new Blockly.FieldNumber(1, 1), 'TABLE_ID')
        .appendField(`${BIT_ICON} bit`)
        .appendField(new Blockly.FieldDropdown(BIT_OPTIONS), 'BIT')
        .appendField('at index');
    this.setOutput(true, 'Boolean');
    this.setColour(DATA_COLOR);
    this.setTooltip('Checks a single bit (0-7) of a value read out of a read-only data table, ' +
      'chosen by typing its own ID number (see the ID badge on its card on the Data tab) ' +
      'instead of picking it from a dropdown.');
  },
};
