'use strict';

// The AtariVox's memory: a 32 KB EEPROM (a 24LC256, the same chip as a SaveKey) on the same controller port as the speech chip, for games that
// keep a high score or a setting between plays. Its I2C bus is bit 2 (data) and bit 3 (clock) of SWCHA on the right port, and the program is
// the bus master: the subroutine below does the whole job bit by bit. The blocks keep one byte at an address: a "slot" (0 to 255) of a "save file" (0 to 127), the high byte of the address.

export const MEMORY_SUBROUTINE_NAME = '_avox_mem';

// The subroutine that saves a byte, loads one or looks for the memory. In: temp3 the job (1 save, 2 load, 3 look for the memory), temp4 the
// slot, temp5 the byte to save, temp6 the save file (the high byte of the address); out: temp5 the byte loaded, temp6 1 when the memory answered. A line is released by making it an input (the port pulls it up), a low is an output of 0.
// The speech line (bit 0) is kept high all the time. Saving waits for the memory to finish writing (a few milliseconds).
// The jobs of the subroutine's code (see its comment): the bus is set up, the job is picked, and the result is a flag in temp6 (the high
// scores' jobs give the place there instead). The memory is read and written by two small routines that take the address in temp6 (high) and
// temp4 (low), and give 0 in A when the memory answered.
const memoryCode = (hs) => {
  let counter = 0;
  const lines = [];
  const asm = (...l) => lines.push(...l);
  const main = [];
  const mainAsm = (...l) => main.push(...l);
  // a failure of the memory in the middle of a job ends the job with the flag at 0
  const check = () => {
    const ok = `_hs_ok${counter++}`;
    asm('beq ' + ok, 'jmp _hs_fail', '@' + ok);
  };
  mainAsm(
      '@_i2c_code',
      'lda #$0D',
      'sta temp1',
      'lda #$09',
      'sta temp2',
      'jsr _i2c_apply',
      'lda temp3',
      'cmp #1',
      'bne _job_load',
      'jsr _mem_save',
      'jmp _i2c_result',
      '@_job_load',
      'cmp #2',
      'bne _job_probe',
      'jsr _mem_load',
      'jmp _i2c_result',
      '@_job_probe',
      'cmp #3',
      'bne _job_hs',
      'jsr _mem_probe',
      'jmp _i2c_result',
      '@_job_hs',
  );
  if (hs) {
    mainAsm(
        'cmp #4',
        'bne _job_hsget',
        'jmp _hs_add',
        '@_job_hsget',
        'cmp #5',
        'bne _job_hsclear',
        'jmp _hs_get',
        '@_job_hsclear',
        'jsr _hs_wipe',
    );
  }
  mainAsm(
      // the answer: A is 0 when the memory answered
      '@_i2c_result',
      'bne _i2c_nothing',
      'lda #1',
      'sta temp6',
      'jmp _i2c_done',
      '@_i2c_nothing',
      'lda #0',
      'sta temp6',
      '@_i2c_done',
      // the speech line idles high and nothing else is driven
      'lda #1',
      'sta SWCHA',
      'sta SWACNT',
  );
  asm(
      // nothing answered
      '@_mem_nack',
      'jsr _i2c_stop',
      'lda #1',
      'rts',
      // save: start, device, address (high, low), byte, stop, then wait for the memory to finish (a few milliseconds)
      '@_mem_save',
      'jsr _i2c_start',
      'ldy #$A0',
      'jsr _i2c_send',
      'beq _ms_ack',
      'jmp _mem_nack',
      '@_ms_ack',
      'ldy temp6',
      'jsr _i2c_send',
      'ldy temp4',
      'jsr _i2c_send',
      'ldy temp5',
      'jsr _i2c_send',
      'jsr _i2c_stop',
      'lda #255',
      'pha',
      '@_ms_poll',
      'jsr _i2c_start',
      'ldy #$A0',
      'jsr _i2c_send',
      'tax',
      'jsr _i2c_stop',
      'cpx #0',
      'beq _ms_done',
      'pla',
      'sec',
      'sbc #1',
      'pha',
      'bne _ms_poll',
      '@_ms_done',
      'pla',
      'lda #0',
      'rts',
      // load: start, device (write), address, start again, device (read), the byte (in temp5), stop
      '@_mem_load',
      'jsr _i2c_start',
      'ldy #$A0',
      'jsr _i2c_send',
      'beq _ml_ack',
      'jmp _mem_nack',
      '@_ml_ack',
      'ldy temp6',
      'jsr _i2c_send',
      'ldy temp4',
      'jsr _i2c_send',
      'jsr _i2c_start',
      'ldy #$A1',
      'jsr _i2c_send',
      'jsr _i2c_recv',
      'sty temp5',
      'jsr _i2c_stop',
      'lda #0',
      'rts',
      // looking for the memory: it answers when it is there
      '@_mem_probe',
      'jsr _i2c_start',
      'ldy #$A0',
      'jsr _i2c_send',
      'tax',
      'jsr _i2c_stop',
      'txa',
      'rts',
  );
  if (hs) {
    const [a, b, c] = hs;
    // The table of the high scores is in the save file 127: the slot 0 holds $A5 once the table is made, then 10 places of 3 bytes (the
    // score as the three bytes of the score, the largest digits first). a: the place, b: the place being copied, c: the byte of a place.
    asm(
        // temp4 = 3 * b + 1 + c, temp6 = 127: where a byte of a place is
        '@_hs_where',
        'lda ' + b,
        'asl',
        'clc',
        'adc ' + b,
        'clc',
        'adc ' + c,
        'clc',
        'adc #1',
        'sta temp4',
        'lda #127',
        'sta temp6',
        'rts',
        // every place is 0 and the table is marked as made
        '@_hs_wipe',
        'lda #1',
        'sta ' + c,
        '@_hs_wipeloop',
        'lda #127',
        'sta temp6',
        'lda ' + c,
        'sta temp4',
        'lda #0',
        'sta temp5',
        'jsr _mem_save',
        'bne _hs_wipefail',
        'inc ' + c,
        'lda ' + c,
        'cmp #31',
        'bne _hs_wipeloop',
        'lda #127',
        'sta temp6',
        'lda #0',
        'sta temp4',
        'lda #$A5',
        'sta temp5',
        'jsr _mem_save',
        '@_hs_wipefail',
        'rts',
        // the table is made when the memory is new (A is 0 when it is)
        '@_hs_init',
        'lda #127',
        'sta temp6',
        'lda #0',
        'sta temp4',
        'jsr _mem_load',
        'beq _hs_initread',
        'rts',
        '@_hs_initread',
        'lda temp5',
        'cmp #$A5',
        'bne _hs_initwipe',
        'lda #0',
        'rts',
        '@_hs_initwipe',
        'jmp _hs_wipe',
        '@_hs_fail',
        'lda #1',
        'jmp _i2c_result',
    );
    // add the score to the table: its place (1 to 10) comes back in temp6, 0 when it is not among the 10 best
    asm(
        '@_hs_add',
        'jsr _hs_init',
        'beq _hs_a1',
        'jmp _hs_fail',
        '@_hs_a1',
        'lda #0',
        'sta ' + a,
        '@_hs_find',
        'lda ' + a,
        'sta ' + b,
    );
    for (let k = 0; k < 3; k++) {
      asm(
          'lda #' + k,
          'sta ' + c,
          'jsr _hs_where',
          'jsr _mem_load',
      );
      check();
      asm(
          'lda score+' + k,
          'cmp temp5',
          'bcs _hs_ge' + k,
          'jmp _hs_next',
          '@_hs_ge' + k,
          'beq _hs_eq' + k,
          'jmp _hs_insert',
          '@_hs_eq' + k,
      );
    }
    asm(
        // not larger than the place: the next place
        '@_hs_next',
        'inc ' + a,
        'lda ' + a,
        'cmp #10',
        'beq _hs_notin',
        'jmp _hs_find',
        '@_hs_notin',
        'lda #0',
        'sta temp6',
        'jmp _i2c_done',
        // larger: the places from here down move one down (from the 9th), then the score is put here
        '@_hs_insert',
        'lda #8',
        'sta ' + b,
        '@_hs_shift',
        'lda ' + b,
        'cmp ' + a,
        'bcs _hs_shiftgo',
        'jmp _hs_shifted',
        '@_hs_shiftgo',
        'lda #0',
        'sta ' + c,
        '@_hs_copy',
        'jsr _hs_where',
        'jsr _mem_load',
    );
    check();
    asm(
        'lda temp4',
        'clc',
        'adc #3',
        'sta temp4',
        'jsr _mem_save',
    );
    check();
    asm(
        'inc ' + c,
        'lda ' + c,
        'cmp #3',
        'bne _hs_copy',
        'lda ' + b,
        'beq _hs_shifted',
        'dec ' + b,
        'jmp _hs_shift',
        '@_hs_shifted',
        'lda ' + a,
        'sta ' + b,
        'lda #0',
        'sta ' + c,
        '@_hs_put',
        'jsr _hs_where',
        'ldx ' + c,
        'lda score,x',
        'sta temp5',
        'jsr _mem_save',
    );
    check();
    asm(
        'inc ' + c,
        'lda ' + c,
        'cmp #3',
        'bne _hs_put',
        'lda ' + a,
        'clc',
        'adc #1',
        'sta temp6',
        'jmp _i2c_done',
    );
    // put a place of the table in the score: the place (1 to 10) is in temp4
    asm(
        '@_hs_get',
        'lda temp4',
        'beq _hs_getbad',
        'cmp #11',
        'bcc _hs_getok',
        '@_hs_getbad',
        'lda #1',
        'jmp _i2c_result',
        '@_hs_getok',
        'sec',
        'sbc #1',
        'sta ' + a,
        'jsr _hs_init',
    );
    check();
    asm(
        'lda ' + a,
        'sta ' + b,
        'lda #0',
        'sta ' + c,
        '@_hs_getbyte',
        'jsr _hs_where',
        'jsr _mem_load',
    );
    check();
    asm(
        'ldx ' + c,
        'lda temp5',
        'sta score,x',
        'inc ' + c,
        'lda ' + c,
        'cmp #3',
        'bne _hs_getbyte',
        'lda #0',
        'jmp _i2c_result',
    );
  }
  return [...lines, ...main];
};

// hsVars: the three variables of the high score table (the blocks of the table are used), or null.
export const registerMemorySubroutine = (Blockly, hsVars = null) => {
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
    ...memoryCode(hsVars),
    '@end',
  ].join('\n');
};

export default (Blockly) => {
  const label = (kind) => `_avox_${kind}_${Blockly.BBasic.blockNumbers.next('avox')}`;
  const memoryCall = () => ` gosub ${MEMORY_SUBROUTINE_NAME}${Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(),
      Blockly.BBasic.getSubroutineBank(MEMORY_SUBROUTINE_NAME))}`;

  // The save file of a block (0 to 127; a block saved before there were files has none: file 0).
  const fileOf = (block) => {
    const code = Blockly.BBasic.valueToCode(block, 'FILE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return /^\d+$/.test(code.trim()) ? `${Math.min(127, Number(code))}` : `(${code}) & 127`;
  };

  Blockly.BBasic['avox_memory_save'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const slot = Blockly.BBasic.valueToCode(block, 'SLOT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return [` temp5 = ${value}`, ` temp4 = ${slot}`, ` temp6 = ${fileOf(block)}`, ' temp3 = 1', memoryCall()].join('\n') + '\n';
  };

  Blockly.BBasic['avox_memory_load'] = function(block) {
    const slot = Blockly.BBasic.valueToCode(block, 'SLOT', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const variable = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    // A memory that does not answer leaves the variable as it was.
    const skip = label('noload');
    return [` temp4 = ${slot}`, ` temp6 = ${fileOf(block)}`, ' temp3 = 2', memoryCall(), ` if temp6 = 0 then goto ${skip}`, ` ${variable} = temp5`, `@ ${skip}`].join('\n') + '\n';
  };

  // The table of the 10 best scores (in the save file 127): add the score of the game, put a place of the table in the score, wipe the table.
  Blockly.BBasic['avox_highscore_add'] = function(block) {
    const variable = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    return [' temp6 = 0', ' temp3 = 4', memoryCall(), ` ${variable} = temp6`].join('\n') + '\n';
  };

  Blockly.BBasic['avox_highscore_get'] = function(block) {
    const place = Blockly.BBasic.valueToCode(block, 'PLACE', Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    return [` temp4 = ${place}`, ' temp3 = 5', memoryCall()].join('\n') + '\n';
  };

  Blockly.BBasic['avox_highscore_clear'] = function() {
    return [' temp3 = 6', memoryCall()].join('\n') + '\n';
  };

  // Looks for the memory: the variable is 1 when something answers as the memory (an AtariVox or SaveKey is plugged in), 0 when not. (Its
  // size is always 32 KB: every AtariVox and SaveKey has the same chip, so there is no size to read.)
  Blockly.BBasic['avox_memory_check'] = function(block) {
    const variable = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
    return [' temp6 = 0', ' temp3 = 3', memoryCall(), ` ${variable} = temp6`].join('\n') + '\n';
  };
};
