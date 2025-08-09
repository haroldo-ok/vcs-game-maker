'use strict';

export default (Blockly) => {
  const createGeneratorForJoystick = (name) => {
    Blockly.BBasic[`input_${name}_get`] = function(block) {
      // Variable getter.
      const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
          Blockly.VARIABLE_CATEGORY_NAME);
      return [code, Blockly.BBasic.ORDER_ATOMIC];
    };
  };

  ['joy0', 'joy1'].forEach(createGeneratorForJoystick);

  Blockly.BBasic['input_console_switch_get'] = function(block) {
    // Variable getter.
    const switchName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('SWITCH'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [switchName, Blockly.BBasic.ORDER_ATOMIC];
  };
};

