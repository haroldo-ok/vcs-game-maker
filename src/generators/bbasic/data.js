'use strict';

import {findDataTableById, dataTableSymbolName} from '../../blocks/data';

export default (Blockly) => {
  Blockly.BBasic['data_get_element'] = function(block) {
    const table = findDataTableById(block.getFieldValue('TABLE'));
    if (!table) {
      return ['0', Blockly.BBasic.ORDER_ATOMIC];
    }

    // A table must be read from the same bank it's declared in, so
    // generateDataTables() needs to know every bank this table is actually
    // read from, to emit a copy into each one (see dataTableSymbolName).
    const bank = Blockly.BBasic.getCurrentBank();
    Blockly.BBasic.trackDataTableBank(table.id, bank);

    const name = dataTableSymbolName(table, bank);
    // ORDER_NONE: the index sits inside the table's own "[...]" brackets,
    // which already provide grouping, so it never needs extra parens.
    const index = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_NONE) || '0';
    return [`${name}[${index}]`, Blockly.BBasic.ORDER_MEMBER];
  };
};
