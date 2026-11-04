'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {isPxe, pfIsWide, pfMaxScrollOf, pfWidthOf, PXE_GROUP_STEP_VARS} from '../../utils/pxe';

export default (Blockly) => {
  // GFX_MODE (PXEheader.asm): 0 the usual screen, 2 no score at the bottom (the top kernel fills all 188 lines).
  Blockly.BBasic['pxe_screen_mode'] = function(block) {
    if (!isPxe((useConfigurationStorage() && useConfigurationStorage().value) || {})) return ' rem PXE screen: only on the PXE kernel\n';
    return ` GFX_MODE = ${{1: 1, 2: 2}[block.getFieldValue('MODE')] || 0}\n`;
  };
  // Sideways scroll of the PXE playfield: PF_HOR_SCROLL_LO and HI (PXEheader.asm), a 16 bit number of pixels, 4 to a column. The furthest it goes is
  // the width less the 40 columns of the screen.
  const maxScroll = () => pfMaxScrollOf((useConfigurationStorage() && useConfigurationStorage().value) || {});
  const NO_SCROLL = ' rem PXE playfield scroll: needs a playfield of 64 or 120 columns (Options)\n';
  Blockly.BBasic['pxe_pf_scroll'] = function(block) {
    if (!maxScroll()) return NO_SCROLL;
    const amount = Blockly.BBasic.valueToCode(block, 'AMOUNT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const max = maxScroll();
    const id = Blockly.BBasic.blockNumbers.next('pxe_pf_scroll');
    const set = `_pxosc${id}_set`;
    const clamp = `_pxosc${id}_clamp`;
    // Going round: the whole map is 4 pixels a column (the width of the playfield in pixels).
    const ring = (pfWidthOf((useConfigurationStorage() && useConfigurationStorage().value) || {})) * 4;
    const wrap = block.getFieldValue('EDGE') === 'wrap';
    const sub = `_pxosc${id}_sub`;
    const lines = wrap && block.getFieldValue('DIRECTION') === 'left' ? [
      'sec', 'lda PF_HOR_SCROLL_LO', 'sbc temp1', 'sta temp2', 'lda PF_HOR_SCROLL_HI', 'sbc #0', 'sta temp3',
      `bcs ${set}`, 'clc', 'lda temp2', `adc #${ring & 255}`, 'sta temp2', 'lda temp3', `adc #${ring >> 8}`, 'sta temp3',
    ] : wrap ? [
      'clc', 'lda PF_HOR_SCROLL_LO', 'adc temp1', 'sta temp2', 'lda PF_HOR_SCROLL_HI', 'adc #0', 'sta temp3',
      `cmp #${ring >> 8}`, `bcc ${set}`, `bne ${sub}`, 'lda temp2', `cmp #${ring & 255}`, `bcc ${set}`,
      `@${sub}`, 'sec', 'lda temp2', `sbc #${ring & 255}`, 'sta temp2', 'lda temp3', `sbc #${ring >> 8}`, 'sta temp3',
    ] : block.getFieldValue('DIRECTION') === 'left' ? [
      'sec', 'lda PF_HOR_SCROLL_LO', 'sbc temp1', 'sta temp2', 'lda PF_HOR_SCROLL_HI', 'sbc #0', 'sta temp3',
      `bcs ${set}`, 'lda #0', 'sta temp2', 'sta temp3',
    ] : [
      'clc', 'lda PF_HOR_SCROLL_LO', 'adc temp1', 'sta temp2', 'lda PF_HOR_SCROLL_HI', 'adc #0', 'sta temp3',
      `cmp #${max >> 8}`, `bcc ${set}`, `bne ${clamp}`, 'lda temp2', `cmp #${(max & 255) + 1}`, `bcc ${set}`,
      `@${clamp}`, `lda #${max & 255}`, 'sta temp2', `lda #${max >> 8}`, 'sta temp3',
    ];
    return ` temp1 = ${amount}\n` + ['asm', ...lines, `@${set}`, 'lda temp2', 'sta PF_HOR_SCROLL_LO', 'lda temp3', 'sta PF_HOR_SCROLL_HI', '@end'].join('\n') + '\n';
  };
  Blockly.BBasic['pxe_pf_scroll_to'] = function(block) {
    if (!maxScroll()) return NO_SCROLL;
    const column = Blockly.BBasic.valueToCode(block, 'COLUMN', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const maxColumn = maxScroll() / 4;
    return ` temp1 = ${column}\n if temp1 > ${maxColumn} then temp1 = ${maxColumn}\n` +
      ['asm', 'lda temp1', 'asl', 'asl', 'sta PF_HOR_SCROLL_LO', 'lda temp1', 'lsr', 'lsr', 'lsr', 'lsr', 'lsr', 'lsr', 'sta PF_HOR_SCROLL_HI', '@end'].join('\n') + '\n';
  };
  // The vertical scroll of one group of 8 columns (PF_VER_SCROLL_LO_n and HI_n, 4 bytes apart in PXEheader.asm, the row of the map at the top of the screen) when every group has a scroll (PF_MODE v clear).
  Blockly.BBasic['pxe_pf_column_scroll'] = function(block) {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    if (!pfIsWide(config) || !config.pxeSeparateScroll) return ' rem PXE column group scroll: needs "Each column group has its own scroll and row step" (Options)\n';
    const group = Blockly.BBasic.valueToCode(block, 'GROUP', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const position = Blockly.BBasic.valueToCode(block, 'POSITION', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return ` temp1 = ${group}\n temp2 = ${position}\n` + ['asm', 'lda temp1', 'asl', 'asl', 'tax', 'lda temp2', 'sta PF_VER_SCROLL_LO_0,x', 'lda #0',
      'sta PF_VER_SCROLL_HI_0,x', '@end'].join('\n') + '\n';
  };
  // The row step of one group (PF_FRAC_INC_n, 4 bytes apart like the scroll: PXEheader.asm).
  Blockly.BBasic['pxe_pf_column_step'] = function(block) {
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    if (!pfIsWide(config) || !config.pxeSeparateScroll) return ' rem PXE column group row step: needs the separate column groups setting (Options)\n';
    const group = Blockly.BBasic.valueToCode(block, 'GROUP', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const step = Blockly.BBasic.valueToCode(block, 'STEP', Blockly.BBasic.ORDER_ASSIGNMENT) || '16';
    // (The first four groups also have the variables the DFnFRACINC statements before every drawscreen take their steps from.)
    const stepVars = PXE_GROUP_STEP_VARS.map((name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE));
    return ` temp1 = ${group}\n temp2 = ${step}\n` + ['asm', 'lda temp1', 'asl', 'asl', 'tax', 'lda temp2', 'sta PF_FRAC_INC_0,x', '@end'].join('\n') + '\n' +
      stepVars.map((name, i) => ` if temp1 = ${i} then ${name} = temp2\n`).join('');
  };
  // The palette table of the PXE kernel: PALETTE + color is the color the TIA gets (see PXEheader.asm). It is RAM at $0700, so the 6502 writes it.
  Blockly.BBasic['palette_set'] = function(block) {
    if (!isPxe((useConfigurationStorage() && useConfigurationStorage().value) || {})) return ' rem PXE palette: only on the PXE kernel\n';
    const index = Blockly.BBasic.valueToCode(block, 'INDEX', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const color = Blockly.BBasic.valueToCode(block, 'COLOR', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return ` temp2 = ${index}\n temp1 = ${color}\n` + ['asm', 'ldx temp2', 'lda temp1', 'sta PALETTE,x', '@end'].join('\n') + '\n';
  };
};
