'use strict';

export default (Blockly) => {
  Blockly.BBasic[`simple_sound_set`] = function(block) {
    const code = `AUDC0=1\nAUDV0=15\nAUDF0=31`;
    return code;
  };
};
