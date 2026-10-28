'use strict';

// The AtariVox's memory: a 32 KB EEPROM (a 24LC256, the same chip as a SaveKey) on the same controller port as the speech chip, for games that
// keep a high score or a setting between plays. Its I2C bus is bit 2 (data) and bit 3 (clock) of SWCHA on the right port, and the program is
// the bus master: the subroutine below does the whole job bit by bit. The blocks keep one byte at an address from 0 to 255 (a "slot").

export const MEMORY_SUBROUTINE_NAME = '_avox_mem';

// The subroutine that saves a byte or loads one. In: temp3 the job (1 save, 2 load), temp4 the slot, temp5 the byte to save; out: temp5 the
// byte loaded, temp6 1 when the memory answered. A line is released by making it an input (the port pulls it up), a low is an output of 0.
// The speech line (bit 0) is kept high all the time. Saving waits for the memory to finish writing (a few milliseconds).
export const registerMemorySubroutine = (Blockly) => {
  Blockly.BBasic.subroutines[MEMORY_SUBROUTINE_NAME] = [
    'asm',
    'jmp _i2c_code',
    // temp1 is what SWCHA is made, temp2 SWACNT: SDA released or low, SCL high or low. SWACNT is written first: writing SWCHA last leaves
    // what the memory drives on the line (an acknowledge) in place until the program reads it
    '@_i2c_apply',
    'lda temp2',
    'sta SWACNT',
    'lda temp1',
    'sta SWCHA',
    'sleep 6',
    'rts',
    '@_i2c_sdah',
    'lda temp2',
    'and #$FB',
    'sta temp2',
    'lda temp1',
    'ora #4',
    'sta temp1',
    'jmp _i2c_apply',
    '@_i2c_sdal',
    'lda temp2',
    'ora #4',
    'sta temp2',
    'lda temp1',
    'and #$FB',
    'sta temp1',
    'jmp _i2c_apply',
    '@_i2c_sclh',
    'lda temp1',
    'ora #8',
    'sta temp1',
    'jmp _i2c_apply',
    '@_i2c_scll',
    'lda temp1',
    'and #$F7',
    'sta temp1',
    'jmp _i2c_apply',
    '@_i2c_start',
    'jsr _i2c_sdah',
    'jsr _i2c_sclh',
    'jsr _i2c_sdal',
    'jsr _i2c_scll',
    'rts',
    '@_i2c_stop',
    'jsr _i2c_sdal',
    'jsr _i2c_sclh',
    'jsr _i2c_sdah',
    'rts',
    // Y is the byte; A comes back 0 when the memory acknowledged
    '@_i2c_send',
    'ldx #8',
    '@_i2c_sendbit',
    'tya',
    'asl',
    'tay',
    'bcc _i2c_sendlow',
    'jsr _i2c_sdah',
    'jmp _i2c_sendclock',
    '@_i2c_sendlow',
    'jsr _i2c_sdal',
    '@_i2c_sendclock',
    'jsr _i2c_sclh',
    'jsr _i2c_scll',
    'dex',
    'bne _i2c_sendbit',
    'jsr _i2c_sdah',
    'jsr _i2c_sclh',
    'lda SWCHA',
    'and #4',
    'tax',
    'jsr _i2c_scll',
    'txa',
    'rts',
    // the byte comes back in Y; it is not acknowledged (the last one of a read)
    '@_i2c_recv',
    'ldy #0',
    'jsr _i2c_sdah',
    'ldx #8',
    '@_i2c_recvbit',
    'jsr _i2c_sclh',
    'lda SWCHA',
    'and #4',
    'cmp #4',
    'tya',
    'rol',
    'tay',
    'jsr _i2c_scll',
    'dex',
    'bne _i2c_recvbit',
    'jsr _i2c_sdah',
    'jsr _i2c_sclh',
    'jsr _i2c_scll',
    'rts',
    '@_i2c_code',
    'lda #$0D',
    'sta temp1',
    'lda #$09',
    'sta temp2',
    'jsr _i2c_apply',
    'lda #0',
    'sta temp6',
    'lda temp3',
    'cmp #2',
    'beq _i2c_load',
    // save: start, device, address (high 0, low), byte, stop, then wait for the memory to finish
    'jsr _i2c_start',
    'ldy #$A0',
    'jsr _i2c_send',
    'bne _i2c_gone',
    'ldy #0',
    'jsr _i2c_send',
    'ldy temp4',
    'jsr _i2c_send',
    'ldy temp5',
    'jsr _i2c_send',
    'jsr _i2c_stop',
    'lda #255',
    'pha',
    '@_i2c_poll',
    'jsr _i2c_start',
    'ldy #$A0',
    'jsr _i2c_send',
    'tax',
    'jsr _i2c_stop',
    'cpx #0',
    'beq _i2c_polled',
    'pla',
    'sec',
    'sbc #1',
    'pha',
    'bne _i2c_poll',
    '@_i2c_polled',
    'pla',
    'lda #1',
    'sta temp6',
    'jmp _i2c_done',
    // load: start, device (write), address, start again, device (read), the byte, stop
    '@_i2c_load',
    'jsr _i2c_start',
    'ldy #$A0',
    'jsr _i2c_send',
    'bne _i2c_gone',
    'ldy #0',
    'jsr _i2c_send',
    'ldy temp4',
    'jsr _i2c_send',
    'jsr _i2c_start',
    'ldy #$A1',
    'jsr _i2c_send',
    'jsr _i2c_recv',
    'sty temp5',
    'jsr _i2c_stop',
    'lda #1',
    'sta temp6',
    'jmp _i2c_done',
    // nothing answered
    '@_i2c_gone',
    'jsr _i2c_stop',
    '@_i2c_done',
    // the speech line idles high and nothing else is driven
    'lda #1',
    'sta SWCHA',
    'sta SWACNT',
    '@end',
  ].join('\n');
};

export default (Blockly) => {
  const label = (kind) => `_avox_${kind}_${Blockly.BBasic.blockNumbers.next('avox')}`;
  const memoryCall = () => ` gosub ${MEMORY_SUBROUTINE_NAME}${Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(),
      Blockly.BBasic.getSubroutineBank(MEMORY_SUBROUTINE_NAME))}`;

  Blockly.BBasic['avox_memory_save'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const slot = Blockly.BBasic.valueToCode(block, 'SLOT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return [` temp5 = ${value}`, ` temp4 = ${slot}`, ' temp3 = 1', memoryCall()].join('\n') + '\n';
  };

  Blockly.BBasic['avox_memory_load'] = function(block) {
    const slot = Blockly.BBasic.valueToCode(block, 'SLOT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const variable = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    // A memory that does not answer leaves the variable as it was.
    const skip = label('noload');
    return [` temp4 = ${slot}`, ' temp3 = 2', memoryCall(), ` if temp6 = 0 then goto ${skip}`, ` ${variable} = temp5`, `@ ${skip}`].join('\n') + '\n';
  };
};
