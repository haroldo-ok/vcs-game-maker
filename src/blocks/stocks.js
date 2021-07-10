/**
 * @license
 *
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Define custom blocks.
 * @author abbychau@gmail.com (Abby Chau)
 */

// More on defining blocks:
// https://developers.google.com/blockly/guides/create-custom-blocks/define-blocks


import * as Blockly from 'blockly/core';

Blockly.Blocks['stock_buy_simple'] = {
  init: function() {
    this.appendValueInput('Number')
        .setCheck('Number')
        .appendField('Buy Stock ID')
        .appendField(new Blockly.FieldNumber(0), 'ID')
        .appendField('For amount')
        .appendField(new Blockly.FieldNumber(0), 'Amount')
        .appendField('At Price')
        .appendField(new Blockly.FieldNumber(0), 'Price');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, 'String');
    this.setColour(230);
    this.setTooltip('buy id');
    this.setHelpUrl('https://example.com');
  },
};

Blockly.JavaScript['stock_buy_simple'] = function(block) {
  const numberId = block.getFieldValue('ID');
  const numberAmount = block.getFieldValue('Amount');
  const numberPrice = block.getFieldValue('Price');
  const valueNumber = Blockly.JavaScript.valueToCode(
      block,
      'Number',
      Blockly.JavaScript.ORDER_ATOMIC,
  );
  // eslint-disable-next-line max-len
  return `buy(${numberId},${numberAmount},${numberPrice},${valueNumber});\n`;
};

Blockly.Blocks['stock_buy_prog'] = {
  init: function() {
    this.appendValueInput('Number')
        .setCheck('Number')
        .appendField('Buy Stock ID');
    this.appendValueInput('NAME')
        .setCheck('Number')
        .appendField('For amount');
    this.appendValueInput('NAME')
        .setCheck('Number')
        .appendField('At Price');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, 'String');
    this.setColour(230);
    this.setTooltip('buy id');
    this.setHelpUrl('https://example.com');
  },
};

Blockly.JavaScript['stock_buy_prog'] = function(block) {
  const valueNumber = Blockly.JavaScript.valueToCode(
      block,
      'Number',
      Blockly.JavaScript.ORDER_ATOMIC,
  );
  const valueName = Blockly.JavaScript.valueToCode(
      block,
      'NAME',
      Blockly.JavaScript.ORDER_ATOMIC,
  );
  return c`buy(${valueNumber},${valueName},${valueName});\n`;
};

Blockly.Blocks['stock_fetch_price'] = {
  init: function() {
    this.appendValueInput('Fetch')
        .setCheck('Number')
        .appendField('Fetch Price of Stock ID:');
    this.appendDummyInput()
        .appendField('And set to:')
        .appendField(new Blockly.FieldVariable('item'), 'variable');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(230);
    this.setTooltip('fetch stock price');
    this.setHelpUrl('https://example.com');
  },
};

Blockly.JavaScript['stock_fetch_price'] = function(block) {
  const valueFetch = Blockly.JavaScript.valueToCode(
      block,
      'Fetch',
      Blockly.JavaScript.ORDER_ATOMIC,
  );
  const variableVariable = Blockly.JavaScript.variableDB_.getName(
      block.getFieldValue('variable'),
      Blockly.Variables.NAME_TYPE,
  );
  const code = `fetch_price(${valueFetch},${variableVariable});\n`;
  return code;
};
