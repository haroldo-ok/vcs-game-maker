import * as Blockly from 'blockly/core';

// DPC+ keeps the playfield and color tables in 4K of display memory with room for 256 rows each, and a project
// only uses as many rows as its playfield resolution says. The upper half of six of those tables (128 bytes each)
// is spare and can hold plain variables, reached through one of the coprocessor's data fetchers (see
// generators/bbasic/display-ram.js), so these blocks give a project another 768 bytes to keep numbers in.
export const DISPLAY_RAM_AREA_OPTIONS = [
  ['1', '0'], ['2', '1'], ['3', '2'], ['4', '3'], ['5', '4'], ['6', '5'],
];

const DISPLAY_RAM_COLOUR = '#8a5ac2';
const DISPLAY_RAM_TOOLTIP = 'DPC+ only: the display memory has six areas of 128 spare bytes (numbered 0 to 127) ' +
  'that work like variables. They are not available while the playfield has more than 127 rows or a background ' +
  'scrolls (those use the whole memory), and a get takes a few dozen cycles longer than a normal variable.';

Blockly.Blocks['display_ram_set'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField('Display RAM area')
        .appendField(new Blockly.FieldDropdown(DISPLAY_RAM_AREA_OPTIONS), 'AREA')
        .appendField('byte')
        .appendField(new Blockly.FieldNumber(0, 0, 127, 1), 'INDEX')
        .appendField('set to');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(DISPLAY_RAM_COLOUR);
    this.setTooltip(DISPLAY_RAM_TOOLTIP);
  },
};

Blockly.Blocks['display_ram_change'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField('Display RAM area')
        .appendField(new Blockly.FieldDropdown(DISPLAY_RAM_AREA_OPTIONS), 'AREA')
        .appendField('byte')
        .appendField(new Blockly.FieldNumber(0, 0, 127, 1), 'INDEX')
        .appendField('change by');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(DISPLAY_RAM_COLOUR);
    this.setTooltip(DISPLAY_RAM_TOOLTIP);
  },
};

Blockly.Blocks['display_ram_get'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Display RAM area')
        .appendField(new Blockly.FieldDropdown(DISPLAY_RAM_AREA_OPTIONS), 'AREA')
        .appendField('byte')
        .appendField(new Blockly.FieldNumber(0, 0, 127, 1), 'INDEX');
    this.setOutput(true, 'Number');
    this.setColour(DISPLAY_RAM_COLOUR);
    this.setTooltip(DISPLAY_RAM_TOOLTIP);
  },
};
