'use strict';

export default (Blockly) => {
  // The variable dropdown mixes the user's own variables, which are listed by
  // id, with built-in batari Basic names, which are listed literally.
  const resolveVariable = (block) => {
    const value = block.getFieldValue('VAR');
    if (!value) return 'temp1';
    const workspace = block.workspace;
    const variable = workspace && workspace.getVariableById ?
      workspace.getVariableById(value) : null;
    return Blockly.BBasic.nameDB_.getName(
        variable ? variable.getId() : value, Blockly.VARIABLE_CATEGORY_NAME);
  };

  Blockly.BBasic['bit_get'] = function(block) {
    const varName = resolveVariable(block);
    const bit = block.getFieldValue('BIT');
    const code = `${varName}{${bit}}`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  // A literal can be assigned straight to the bit; anything else has to be
  // branched on, since a batari Basic condition is not a value.
  const BIT_LITERALS = {'true': '1', '1': '1', 'false': '0', '0': '0'};

  Blockly.BBasic['bit_set'] = function(block) {
    const varName = resolveVariable(block);
    const bit = block.getFieldValue('BIT');
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || 'true';
    const target = `${varName}{${bit}}`;
    const literal = BIT_LITERALS[argument0.trim()];
    if (literal) {
      return `${target} = ${literal}\n`;
    }
    return `if ${argument0} then ${target} = 1 else ${target} = 0\n`;
  };
};
