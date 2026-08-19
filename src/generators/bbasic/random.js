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

  // Writes a seed into "rand" (and "rand16", when the latter is on - see
  // blocks/random.js's own comment on why an unseeded rand16 would
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
  // makes it an explicit, guaranteed part of THIS block's own output
  // instead of an implicit assumption about assignment behavior elsewhere.
  //
  // rand16 gets that same clamped byte XORed against 255 (bB's own "^"
  // bitwise XOR operator - confirmed against the real command reference,
  // randomterrain.com's batari Basic commands page) rather than the
  // identical value "rand" just got: seeding both registers with the exact
  // same byte only ever reaches 256 of rand16's own 65,536 possible
  // combined starting states, since both would always start in lockstep.
  // XORing with 255 (a plain bitwise complement) is a free, deterministic
  // way to make the two starting bytes different from the one seed value
  // actually available, without asking the user for a second one.
  Blockly.BBasic[`random_seed_set`] = function(block) {
    const seed = Blockly.BBasic.valueToCode(block, 'SEED', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const clampedSeed = `(${seed}) & 255`;
    return `rand = ${clampedSeed}\n` + (config.enableRand16 ? `rand16 = ${clampedSeed} ^ 255\n` : '');
  };
};
