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
import {isPxe} from '../../utils/pxe';

export default (Blockly) => {
  Blockly.BBasic['variables_get'] = function(block) {
  // Variable getter.
    const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const spill = spilledVariable(code);
    if (spill) {
      const result = freeReadScratch();
      const read = ['asm', ...setDisplayRamPointer(spillAddress(spill)), 'lda DF6DATA', `sta ${result}`, '@end'].join('\n');
      return [`${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
    }
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['variables_set'] = function(block) {
  // Variable setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    const spill = spilledVariable(varName);
    if (spill) {
      // A number goes straight into the accumulator, with no trip through temp1.
      if (/^(\d+|\$[0-9A-Fa-f]+|%[01]+)$/.test(argument0.trim())) {
        return ['asm', ...setDisplayRamPointer(spillAddress(spill)), `lda #${argument0.trim()}`, 'sta DF6WRITE', '@end'].join('\n') + '\n';
      }
      return ` temp1 = ${argument0}\n` + ['asm', ...setDisplayRamPointer(spillAddress(spill)), 'lda temp1', 'sta DF6WRITE',
        '@end'].join('\n') + '\n';
    }
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
  // A user variable that init() put in the display memory because the ordinary variable space ran out (see displayRamVars there):
  // where its byte is, or null for an ordinary one.
  const spilledVariable = (name) => (Blockly.BBasic.displayRamVars && Blockly.BBasic.displayRamVars.get(name)) || null;
  const spillAddress = ({area, byte}) => `${DISPLAY_RAM_TABLES[area]}+${128 + byte}`;
  // Why display memory variables are not there, or null when they are.
  const displayRamProblem = () => {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    // (On PXE the six areas are 128 bytes each of its extended RAM, from $0400: see pxeAddress.)
    if (isPxe(config)) return null;
    if (config.kernel !== 'dpcplus') return 'the Display RAM blocks need the DPC+ kernel';
    if (dpcPlusPfresOf(config) > 127) return 'Display RAM needs 127 playfield rows or fewer';
    if (Blockly.BBasic.dpcPlusScroll) return 'Display RAM is not available while a background scrolls';
    return null;
  };
  const pxeOn = () => isPxe((useConfigurationStorage() && useConfigurationStorage().value) || {});
  // PXE: the byte of an area (0 to 5) at an index (0 to 127) is a byte of the extended RAM from $0400 (what the save data does not use).
  const pxeBase = (area) => 0x400 + (Number(area) || 0) * 128;
  const pxeAddress = (block) => `$${(pxeBase(block.getFieldValue('AREA')) +
    Math.min(127, Math.max(0, Math.round(Number(block.getFieldValue('INDEX')) || 0)))).toString(16)}`;
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
    if (pxeOn()) return ` temp1 = ${value}\n` + ['asm', 'lda temp1', `sta ${pxeAddress(block)}`, '@end'].join('\n') + '\n';
    return ` temp1 = ${value}\n` + ['asm', ...setDisplayRamPointer(displayRamAddress(block)),
      'lda temp1', 'sta DF6WRITE', '@end'].join('\n') + '\n';
  };
  Blockly.BBasic['display_ram_change'] = function(block) {
    const problem = displayRamProblem();
    if (problem) return ` rem Display RAM change: ${problem}\n`;
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    // Reading moves the pointer one byte on, and a push moves it back one byte before it writes, so the sum goes back
    // where the byte was read from.
    if (pxeOn()) {
      return ` temp1 = ${value}\n` + ['asm', `lda ${pxeAddress(block)}`, 'clc', 'adc temp1', `sta ${pxeAddress(block)}`, '@end'].join('\n') + '\n';
    }
    return ` temp1 = ${value}\n` + ['asm', ...setDisplayRamPointer(displayRamAddress(block)),
      'lda DF6DATA', 'clc', 'adc temp1', 'sta DF6PUSH', '@end'].join('\n') + '\n';
  };
  // A value block hands its setup lines to the block that uses it (see scrub_ in generators/bbasic.js), so a read that is still waiting
  // for its statement keeps its scratch byte: the next one takes a byte that no waiting read has used. The scratch bytes are temp5,
  // temp6 and the ones init() reserves for a statement with more reads (readScratchNames).
  const freeReadScratch = () => {
    const names = Blockly.BBasic.readScratchNames || ['temp5', 'temp6'];
    const waiting = (Blockly.BBasic.pendingPreambleLines || []).join('\n');
    return names.find((name) => !(`${waiting}\n`).includes(`sta ${name}\n`)) || names[names.length - 1];
  };
  Blockly.BBasic['display_ram_get'] = function(block) {
    if (displayRamProblem()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const result = freeReadScratch();
    const read = pxeOn() ? ['asm', `lda ${pxeAddress(block)}`, `sta ${result}`, '@end'].join('\n') :
      ['asm', ...setDisplayRamPointer(displayRamAddress(block)), 'lda DF6DATA', `sta ${result}`, '@end'].join('\n');
    return [`${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
  };

  // The palette of the PXE kernel (see blocks/palette.js and generators/bbasic/palette.js): read into a scratch byte like Display RAM.
  Blockly.BBasic['palette_get'] = function(block) {
    if (!pxeOn()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const index = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const result = freeReadScratch();
    const read = ['asm', 'ldx temp1', 'lda PALETTE,x', `sta ${result}`, '@end'].join('\n');
    return [` temp1 = ${index}\n${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
  };
  // The row at the top for one column group (PF_VER_SCROLL_LO_n, see palette.js).
  Blockly.BBasic['pxe_pf_column_row_get'] = function(block) {
    if (!pxeOn()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const group = Blockly.BBasic.valueToCode(block, 'GROUP', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const result = freeReadScratch();
    const read = ['asm', 'lda temp1', 'asl', 'asl', 'tax', 'lda PF_VER_SCROLL_LO_0,x', `sta ${result}`, '@end'].join('\n');
    return [` temp1 = ${group}\n${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
  };
  // The column at the left edge of the screen of a PXE playfield that scrolls sideways (PF_HOR_SCROLL_LO and HI are pixels, 4 to a column).
  Blockly.BBasic['pxe_pf_scroll_get'] = function(block) {
    if (!pxeOn()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const result = freeReadScratch();
    const read = ['asm', 'lda PF_HOR_SCROLL_LO', 'lsr', 'lsr', `sta ${result}`, 'lda PF_HOR_SCROLL_HI', 'asl', 'asl', 'asl', 'asl', 'asl', 'asl', `ora ${result}`,
      `sta ${result}`, '@end'].join('\n');
    return [`${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
  };
  // The NTSC table has 16 at color 16 and the PAL table 32 (the PAL table is a different one: PXEheader.asm).
  Blockly.BBasic['palette_is_pal'] = function(block) {
    if (!pxeOn()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const result = freeReadScratch();
    const read = ['asm', 'lda PALETTE+16', `sta ${result}`, '@end'].join('\n');
    return [`${read}\n(${result} >= 32)`, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Data streams (see blocks/display-ram.js): streams 1 to 3 are data fetchers 2 to 4, which neither the playfield and
  // sprite code (fetchers 0, 1 and 6) nor the variable stack (7) touch while the program runs.
  const dataStreamFetcher = (block) => 1 + Math.min(3, Math.max(1, Math.round(Number(block.getFieldValue('STREAM')) || 1)));
  const dataStreamProblem = () => {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    return config.kernel === 'dpcplus' ? null : 'data streams need the DPC+ kernel';
  };
  const areaTable = (block, field) => DISPLAY_RAM_TABLES[Number(block.getFieldValue(field)) || 0] || DISPLAY_RAM_TABLES[0];
  // Loads a fetcher's pointer with byte (128 + the index in a temporary variable) of a table.
  const pointerFromTemp = (fetcher, table, index) => [
    `lda ${index}`, 'clc', `adc #<(${table}+128)`, `sta DF${fetcher}LOW`,
    `lda #(>(${table}+128)) & $0F`, 'adc #0', `sta DF${fetcher}HI`,
  ];
  // PXE: a stream is a pointer of two bytes at the top of the extended RAM ($06F8 to $06FA the low bytes, $06FB to $06FD the high ones: the last
  // bytes of the area 5 of Display RAM, which a project that uses streams leaves alone) into the six areas from $0400; reading or writing a
  // byte moves it on, as a fetcher does. The subroutines do the reading and writing for a stream.
  const pxeStreamLow = (stream) => 0x6f8 + stream - 1;
  const pxeStreamHigh = (stream) => 0x6fb + stream - 1;
  const hex = (n) => '$' + n.toString(16);
  const pxeStreamSubroutine = (stream, kind) => {
    const name = `_pxe_stream_${stream}_${kind}`;
    if (!Blockly.BBasic.subroutines[name]) {
      const low = hex(pxeStreamLow(stream));
      const high = hex(pxeStreamHigh(stream));
      const label = (text) => `@_pxs${stream}${kind}_${text}`;
      const access = (page) => (kind === 'write' ? ['lda temp1', `sta ${hex(page)},x`] : [`lda ${hex(page)},x`, 'sta temp1']);
      Blockly.BBasic.subroutines[name] = ['asm', `lda ${low}`, 'tax', `lda ${high}`, 'cmp #5', `beq ${label('p5').slice(1)}`, 'cmp #6',
        `beq ${label('p6').slice(1)}`, ...access(0x400), `jmp ${label('next').slice(1)}`,
        label('p5'), ...access(0x500), `jmp ${label('next').slice(1)}`,
        label('p6'), ...access(0x600),
        label('next'), `inc ${low}`, `bne ${label('done').slice(1)}`, `inc ${high}`, label('done'), '@end'].join('\n');
    }
    return name;
  };
  const pxeStreamCall = (name) => ` gosub ${name}${Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name))}\n`;
  Blockly.BBasic['data_stream_point'] = function(block) {
    if (pxeOn()) {
      const stream = Math.min(3, Math.max(1, Math.round(Number(block.getFieldValue('STREAM')) || 1)));
      const area = Number(block.getFieldValue('AREA')) || 0;
      const index = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      return ` temp1 = ${index} & 127\n` + ['asm', 'lda temp1', 'clc', `adc #${(area & 1) * 128}`, `sta ${hex(pxeStreamLow(stream))}`,
        `lda #${4 + (area >> 1)}`, `sta ${hex(pxeStreamHigh(stream))}`, '@end'].join('\n') + '\n';
    }
    const problem = dataStreamProblem() || displayRamProblem();
    if (problem) return ` rem Data stream point: ${problem}\n`;
    const index = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return ` temp1 = ${index} & 127\n` + ['asm',
      ...pointerFromTemp(dataStreamFetcher(block), areaTable(block, 'AREA'), 'temp1'), '@end'].join('\n') + '\n';
  };
  Blockly.BBasic['data_stream_write'] = function(block) {
    if (pxeOn()) {
      const stream = Math.min(3, Math.max(1, Math.round(Number(block.getFieldValue('STREAM')) || 1)));
      const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      return ` temp1 = ${value}\n` + pxeStreamCall(pxeStreamSubroutine(stream, 'write'));
    }
    const problem = dataStreamProblem();
    if (problem) return ` rem Data stream write: ${problem}\n`;
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return ` temp1 = ${value}\n` + ['asm', 'lda temp1', `sta DF${dataStreamFetcher(block)}WRITE`, '@end'].join('\n') + '\n';
  };
  Blockly.BBasic['data_stream_read'] = function(block) {
    if (pxeOn()) {
      // (The byte comes back in temp1, which a value block can not hand on, so it goes to the scratch byte of the read.)
      const stream = Math.min(3, Math.max(1, Math.round(Number(block.getFieldValue('STREAM')) || 1)));
      const result = freeReadScratch();
      return [`${pxeStreamCall(pxeStreamSubroutine(stream, 'read'))} ${result} = temp1\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
    }
    if (dataStreamProblem()) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const result = freeReadScratch();
    const read = ['asm', `lda DF${dataStreamFetcher(block)}DATA`, `sta ${result}`, '@end'].join('\n');
    return [`${read}\n${result}`, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Fill and copy (see blocks/display-ram.js). Fetcher 6 writes, fetcher 5 reads; the loops are bB rather than raw asm
  // so their labels are the compiler's.
  Blockly.BBasic['display_ram_fill'] = function(block) {
    const problem = (pxeOn() ? null : dataStreamProblem()) || displayRamProblem();
    if (problem) return ` rem Display RAM fill: ${problem}\n`;
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const start = Blockly.BBasic.valueToCode(block, 'START', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const count = Blockly.BBasic.valueToCode(block, 'COUNT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const number = Blockly.BBasic.blockNumbers.next('display_ram_fill');
    if (pxeOn()) {
      // (The index goes through X: the area is a page of the extended RAM from $0400 and the bytes are reached with an indexed store.)
      const base = pxeBase(block.getFieldValue('AREA'));
      return [
        ` temp2 = ${value}`, ` temp3 = ${start} & 127`, ` temp1 = ${count}`,
        ` if temp1 = 0 then goto _display_ram_fill_${number}_done`,
        `@ _display_ram_fill_${number}_loop`,
        ['asm', 'ldx temp3', 'lda temp2', `sta $${base.toString(16)},x`, '@end'].join('\n'),
        ' temp3 = temp3 + 1',
        ' temp1 = temp1 - 1',
        ` if temp1 > 0 then goto _display_ram_fill_${number}_loop`,
        `@ _display_ram_fill_${number}_done`,
      ].join('\n') + '\n';
    }
    return [
      ` temp2 = ${value}`, ` temp3 = ${start} & 127`, ` temp1 = ${count}`,
      ` if temp1 = 0 then goto _display_ram_fill_${number}_done`,
      ['asm', ...pointerFromTemp(6, areaTable(block, 'AREA'), 'temp3'), '@end'].join('\n'),
      `@ _display_ram_fill_${number}_loop`,
      ['asm', 'lda temp2', 'sta DF6WRITE', '@end'].join('\n'),
      ' temp1 = temp1 - 1',
      ` if temp1 > 0 then goto _display_ram_fill_${number}_loop`,
      `@ _display_ram_fill_${number}_done`,
    ].join('\n') + '\n';
  };
  Blockly.BBasic['display_ram_copy'] = function(block) {
    const problem = (pxeOn() ? null : dataStreamProblem()) || displayRamProblem();
    if (problem) return ` rem Display RAM copy: ${problem}\n`;
    const count = Blockly.BBasic.valueToCode(block, 'COUNT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const from = Blockly.BBasic.valueToCode(block, 'FROM', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const to = Blockly.BBasic.valueToCode(block, 'TO', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const number = Blockly.BBasic.blockNumbers.next('display_ram_copy');
    if (pxeOn()) {
      const fromBase = pxeBase(block.getFieldValue('FROM_AREA'));
      const toBase = pxeBase(block.getFieldValue('TO_AREA'));
      return [
        ` temp1 = ${count}`, ` temp3 = ${from} & 127`, ` temp4 = ${to} & 127`,
        ` if temp1 = 0 then goto _display_ram_copy_${number}_done`,
        `@ _display_ram_copy_${number}_loop`,
        ['asm', 'ldx temp3', `lda $${fromBase.toString(16)},x`, 'ldx temp4', `sta $${toBase.toString(16)},x`, '@end'].join('\n'),
        ' temp3 = temp3 + 1',
        ' temp4 = temp4 + 1',
        ' temp1 = temp1 - 1',
        ` if temp1 > 0 then goto _display_ram_copy_${number}_loop`,
        `@ _display_ram_copy_${number}_done`,
      ].join('\n') + '\n';
    }
    return [
      ` temp1 = ${count}`, ` temp3 = ${from} & 127`, ` temp4 = ${to} & 127`,
      ` if temp1 = 0 then goto _display_ram_copy_${number}_done`,
      ['asm', ...pointerFromTemp(5, areaTable(block, 'FROM_AREA'), 'temp3'),
        ...pointerFromTemp(6, areaTable(block, 'TO_AREA'), 'temp4'), '@end'].join('\n'),
      `@ _display_ram_copy_${number}_loop`,
      ['asm', 'lda DF5DATA', 'sta DF6WRITE', '@end'].join('\n'),
      ' temp1 = temp1 - 1',
      ` if temp1 > 0 then goto _display_ram_copy_${number}_loop`,
      `@ _display_ram_copy_${number}_done`,
    ].join('\n') + '\n';
  };

  Blockly.BBasic['math_change'] = function(block) {
    // Variable increment.
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    const spill = spilledVariable(varName);
    if (spill) {
      return ` temp1 = ${argument0}\n` + ['asm', ...setDisplayRamPointer(spillAddress(spill)), 'lda DF6DATA', 'clc', 'adc temp1',
        'sta DF6PUSH', '@end'].join('\n') + '\n';
    }
    return varName + ' = ' + varName + ' + ' + argument0 + '\n';
  };
};
