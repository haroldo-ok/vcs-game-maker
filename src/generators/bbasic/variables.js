/**
 * @license
 * Copyright 2012 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Generating JavaScript for variable blocks.
 * @author fraser@google.com (Neil Fraser)
 */
'use strict';

/*
goog.provide('Blockly.BBasic.variables');

goog.require('Blockly.BBasic');
*/


import {useConfigurationStorage} from '../../hooks/project';
import {dpcPlusPfresOf} from '../../blocks/background';

export default (Blockly) => {
  Blockly.BBasic['variables_get'] = function(block) {
  // Variable getter.
    const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['variables_set'] = function(block) {
  // Variable setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    return varName + ' = ' + argument0 + '\n';
  };

  // DPC+'s variable stack (see blocks/stack.js). The other kernels have no push/pull.
  const stackStatement = (command) => function(block) {
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    if (config.kernel !== 'dpcplus') {
      return ` rem ${command} ${varName}: the variable stack needs the DPC+ kernel\n`;
    }
    return ` ${command} ${varName}\n`;
  };
  Blockly.BBasic['variables_push'] = stackStatement('push');
  Blockly.BBasic['variables_pull'] = stackStatement('pull');
  Blockly.BBasic['variables_stack_position'] = function(block) {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    const position = Math.min(255, Math.max(0, Math.round(Number(block.getFieldValue('POSITION')) || 0)));
    if (config.kernel !== 'dpcplus') {
      return ` rem stack ${position}: the variable stack needs the DPC+ kernel\n`;
    }
    return ` stack ${position}\n`;
  };

  // DPC+ display memory variables (see blocks/display-ram.js): bytes in the upper half of six of the coprocessor's
  // 256-row tables, which a project with at most 127 playfield rows and no scrolling background leaves alone. They are
  // reached through data fetcher 6, which the kernel sets up again for itself every frame, so the pointer is
  // loaded right before each use.
  const DISPLAY_RAM_TABLES = ['PF1L', 'PF2L', 'PF1R', 'PF2R', 'PFCOLS', 'BKCOLS'];
  const displayRamAddress = (block) => {
    const table = DISPLAY_RAM_TABLES[Number(block.getFieldValue('AREA')) || 0] || DISPLAY_RAM_TABLES[0];
    const index = Math.min(127, Math.max(0, Math.round(Number(block.getFieldValue('INDEX')) || 0)));
    return `${table}+${128 + index}`;
  };
  // Why display memory variables are not there, or null when they are.
  const displayRamProblem = () => {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    if (config.kernel !== 'dpcplus') return 'the Display RAM blocks need the DPC+ kernel';
    if (dpcPlusPfresOf(config) > 127) return 'Display RAM needs 127 playfield rows or fewer';
    if (Blockly.BBasic.dpcPlusScroll) return 'Display RAM is not available while a background scrolls';
    return null;
  };
  const setDisplayRamPointer = (address) => [
    `lda #<(${address})`,
    'sta DF6LOW',
    `lda #(>(${address})) & $0F`,
    'sta DF6HI',
  ];
  Blockly.BBasic['display_ram_set'] = function(block) {
    const problem = displayRamProblem();
    if (problem) return ` rem Display RAM set: ${problem}\n`;
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return ` temp1 = ${value}\n` + ['asm', ...setDisplayRamPointer(displayRamAddress(block)),
      'lda temp1', 'sta DF6WRITE', '@end'].join('\n') + '\n';
  };
  Blockly.BBasic['display_ram_change'] = function(block) {
    const problem = displayRamProblem();
    if (problem) return ` rem Display RAM change: ${problem}\n`;
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    // Reading moves the pointer one byte on, and a push moves it back one byte before it writes, so the sum goes back
    // where the byte was read from.
    return ` temp1 = ${value}\n` + ['asm', ...setDisplayRamPointer(displayRamAddress(block)),
      'lda DF6DATA', 'clc', 'adc temp1', 'sta DF6PUSH', '@end'].join('\n') + '\n';
  };
  // A value block hands its setup lines to the block that uses it (see scrub_ in generators/bbasic.js). Two reads in
  // one expression get different scratch bytes.
  let displayRamReads = 0;
  Blockly.BBasic['display_ram_get'] = function(block) {
    if (displayRamProblem()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const result = displayRamReads++ % 2 ? 'temp6' : 'temp5';
    const read = ['asm', ...setDisplayRamPointer(displayRamAddress(block)),
      'lda DF6DATA', `sta ${result}`, '@end'].join('\n');
    return [`${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['math_change'] = function(block) {
    // Variable increment.
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    return varName + ' = ' + varName + ' + ' + argument0 + '\n';
  };
};
