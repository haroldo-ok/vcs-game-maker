'use strict';

import {useConfigurationStorage} from '../../hooks/project';

export default (Blockly) => {
  Blockly.BBasic[`random_get`] = function(block) {
    const code = `rand`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`random_range_get`] = function(block) {
    const randCode = block.getFieldValue('RAND_CODE');

    return [`${randCode}`, Blockly.BBasic.ORDER_ATOMIC];
  };

  // A random number from MIN to MAX, both included and each as likely as the others: the span (MAX less MIN) is masked up to all ones (the next 2^n - 1) and
  // rand is masked with it, tried again when it is more than the span (about 1.5 tries on average and never more than 2 on average even for the worst span).
  // The steps before the last line go in front of the statement that uses the value (see scrub_ in generators/bbasic.js); the value is left in temp1.
  Blockly.BBasic[`random_between_get`] = function(block) {
    const min = Blockly.BBasic.valueToCode(block, 'MIN', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const max = Blockly.BBasic.valueToCode(block, 'MAX', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const retry = `_randombetween_${Blockly.BBasic.blockNumbers.next('randombetween')}_retry`;
    const lines = [
      `temp1 = ${min}`,
      `temp2 = ${max}`,
      'if temp1 <= temp2 then goto ' + retry + 'swapped',
      'temp3 = temp1 : temp1 = temp2 : temp2 = temp3',
      '@ ' + retry + 'swapped',
      'temp3 = temp2 - temp1',
      'temp4 = temp3',
      'temp4 = temp4 | (temp4 / 2)',
      'temp4 = temp4 | (temp4 / 4)',
      'temp4 = temp4 | (temp4 / 16)',
      '@ ' + retry,
      'temp5 = rand & temp4',
      'if temp5 > temp3 then goto ' + retry,
      'temp1 = temp1 + temp5',
      'temp1',
    ];
    return [lines.join('\n'), Blockly.BBasic.ORDER_ATOMIC];
  };

  // Writes a seed into "rand" (and "rand16", when the latter is on - see
  // blocks/random.js's  comment on why an unseeded rand16 would
  // otherwise still leave the combined sequence deterministic) - a single
  // input rather than two, since asking the user to come up with a second,
  // independent seed value for a variable they never otherwise interact
  // with directly would be more friction than the extra randomness is
  // worth.
  //
  // "& 255" clamps the plugged-in expression to a real, well-defined byte
  // value (0-255) rather than relying on whatever the underlying 6502
  // assignment happens to silently truncate an out-of-range value down to -
  // both are a real byte at the hardware level either way, but the AND
  // makes it an explicit, guaranteed part of THIS block's  output
  // instead of an implicit assumption about assignment behavior elsewhere.
  //
  // rand16 gets that same clamped byte XORed against 255 (bB's "^"
  // bitwise XOR operator - confirmed against the real command reference,
  // randomterrain.com's batari Basic commands page) rather than the
  // identical value "rand" just got: seeding both registers with the exact
  // same byte only ever reaches 256 of rand16's  65,536 possible
  // combined starting states, since both would always start in lockstep.
  // XORing with 255 (a plain bitwise complement) is a free, deterministic
  // way to make the two starting bytes different from the one seed value
  // actually available, without asking the user for a second one.
  Blockly.BBasic[`random_seed_set`] = function(block) {
    const seed = Blockly.BBasic.valueToCode(block, 'SEED', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // Computed into temp1 first, rather than "rand = (seed) & 255" directly -
    // defensive against however complex a plugged-in SEED expression gets,
    // keeping the actual "rand = ..." (and "rand16 = ...") lines themselves
    // always trivially simple.
    const clampedSeed = `(${seed}) & 255`;
    // DPC+ has a 32-bit generator in the chip: its four seed bytes are set through RWRITE0-3 (no byte of "rand" can be
    // written, it is the chip's register). The seed is the first byte and its complement the second, so they are never
    // all zero (which would stop the generator), and the other two are fixed.
    if (config.kernel === 'dpcplus') {
      return `temp1 = ${clampedSeed}\n` + ['asm', ' lda temp1', ' sta RWRITE0', ' eor #$FF', ' sta RWRITE1', ' lda #$32', ' sta RWRITE2',
        ' lda #$36', ' sta RWRITE3', '@end'].join('\n') + '\n';
    }
    return `temp1 = ${clampedSeed}\n` +
      `rand = temp1\n` +
      (config.enableRand16 ? `rand16 = temp1 ^ 255\n` : '');
  };
};
