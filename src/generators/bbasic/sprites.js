'use strict';

import {playfieldToMatrix} from '../../utils/pixels';


export const DEFAULT_SPRITES={
  animations: [
    {
      id: 1,
      name: 'Example1',
      frames: [
        {
          id: 1,
          duration: 10,
          pixels: playfieldToMatrix(
              '...XXX..\n'+
            '...XXX..\n'+
            '...XXX..\n'+
            '..X.X...\n'+
            '..XXXXX.\n'+
            '....X.X.\n'+
            '...X.X..\n'+
            '..X...X.'),
        },
        {
          id: 2,
          duration: 10,
          pixels: playfieldToMatrix(
              '...XXX..\n'+
            '...XXX..\n'+
            '...XXX..\n'+
            '....X.X.\n'+
            '..XXXXX.\n'+
            '..X.X...\n'+
            '...X.X..\n'+
            '...X.X..'),
        },
      ],
    },
  ],
};

export const processPlayerStorageDefaults = (playerStorage) => {
  const player = playerStorage.value;
  if (!player?.animations?.length) {
    return structuredClone(DEFAULT_SPRITES);
  }
  return player;
};

export default (Blockly) => {
  const createGeneratorForSprite = (name) => {
    Blockly.BBasic[`sprite_${name}_get`] = function(block) {
      // Variable getter.
      const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
          Blockly.VARIABLE_CATEGORY_NAME);
      return [code, Blockly.BBasic.ORDER_ATOMIC];
    };

    Blockly.BBasic[`sprite_${name}_set`] = function(block) {
      // Variable setter.
      const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
          Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const varName = Blockly.BBasic.nameDB_.getName(
          block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
      return varName + ' = ' + argument0 + '\n';
    };

    Blockly.BBasic[`sprite_${name}_change`] = function(block) {
    // Add value do a variable.
      const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
          Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const varName = Blockly.BBasic.nameDB_.getName(
          block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
      const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
      const operator = isNegativeConstant ? '' : '+';
      return `${varName} = ${varName} ${operator} ${argument0}\n`;
    };
  };

  const createGeneratorForPlayer = (name) => {
    Blockly.BBasic[`sprite_${name}_size`] = function(block) {
      const size = block.getFieldValue('SIZE') || '0';
      return `${name}size = ${name}size & $F0\n` +
        `${name}size = ${name}size | ${size}\n`;
    };
  };

  const createGeneratorForMissile = (name) => {
    Blockly.BBasic[`sprite_${name}_size`] = function(block) {
      const size = block.getFieldValue('SIZE') || 0;
      const varName = name.replace('missile', 'player') + 'size';
      return `${varName} = ${varName} & $0F\n` +
        `${varName} = ${varName} | ${size}\n`;
    };
  };

  ['player0', 'player1', 'missile0', 'missile1', 'ball'].forEach(createGeneratorForSprite);
  ['player0', 'player1'].forEach(createGeneratorForPlayer);
  ['missile0', 'missile1'].forEach(createGeneratorForMissile);
};
