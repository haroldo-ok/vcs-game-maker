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
      if (varName === 'ballwidth') {
        // Ball width packs into CTRLPF's own bits 4-5 - masked in against
        // CTRLPF's CURRENT value (207 = 0b11001111, clearing only bits 4-5)
        // rather than overwriting the whole byte, which used to also
        // hardcode bit 0 (playfield reflect) permanently on and reset bit 2
        // (playfield priority - see sprite_priority_set's own `CTRLPF{2} =`
        // bit-safe write just below) back to 0 every time ball width was
        // set - a real bug (reported as "changing sprite priority flips the
        // right half of the playfield," since whichever of the two blocks
        // ran later silently undid the other's own bit).
        return `CTRLPF = (CTRLPF & 207) + (${argument0}) * 16\n`;
      } else if (varName.endsWith('visibility')) {
        const blockNumber = Blockly.BBasic.blockNumbers.next();
        const baseLabel = `_visibility_${blockNumber}`;

        const frameVarName = varName.replace('visibility', 'frame');
        return [
          `if ${argument0} then goto ${baseLabel}_visible else ${frameVarName} = 255 : goto ${baseLabel}_end`,
          `@ ${baseLabel}_visible`,
          `if ${frameVarName} = 255 then ${frameVarName} = 0`,
          `@ ${baseLabel}_end`,
        ].join('\n') + '\n\n';
      } else if (varName.endsWith('size_3_')) {
        const bitVarName = varName.replace('__', '').replace('_3_', '{3}');
        return `if ${argument0} then ${bitVarName} = 1 else ${bitVarName} = 0\n`;
      }
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
    // The dropdown already holds the animation's position in the list, which is
    // what the generated animation dispatch compares against.
    Blockly.BBasic[`sprite_${name}_animation_select`] = function(block) {
      const index = block.getFieldValue('VAR') || '0';
      return [index, Blockly.BBasic.ORDER_ATOMIC];
    };

    Blockly.BBasic[`sprite_${name}_size`] = function(block) {
      const size = block.getFieldValue('SIZE') || '0';
      const varName = name + 'size';
      return `${varName} = ${varName} & $F8\n` +
        `${varName} = ${varName} | ${size}\n`;
    };

    // Bit 6 of the size variable pauses the animation: the frame counter is
    // frozen while it is set. It is unused by NUSIZ, so it rides along
    // harmlessly when the size variable is loaded into the register.
    Blockly.BBasic[`sprite_${name}_animation_playback`] = function(block) {
      const paused = block.getFieldValue('STATE') === 'pause';
      return `${name}size{6} = ${paused ? 1 : 0}\n`;
    };

    // player0pointer/player1pointer and player0height/player1height are
    // real batari Basic kernel symbols (confirmed directly against
    // public/bb19/includes/2600basic.h and std_kernel.asm) - plain,
    // already-defined zero-page RAM the standard kernel reads every
    // scanline as "lda (player0pointer),y" (y counting down from
    // player0height), the exact same mechanism the compiler's own
    // "player0: ... end" graphic-literal syntax sets up automatically
    // behind the scenes for every normal animation frame (see
    // generateAnimations in generators/bbasic.js). Every OTHER player
    // graphic in this app goes through that literal-bitmap path; this is
    // the only generator that assigns those two RAM variables directly,
    // pointing them at ordinary CODE instead of a drawn graphic - the
    // classic Yars' Revenge "neutral zone" trick.
    //
    // ROM_NOISE_BASE_LABEL ("commongamelogic") is a fixed anchor point,
    // not a data table the user has to set up first (an earlier version
    // of this required creating and picking a data table specifically to
    // guarantee a real, always-present bank 1 address) - commongamelogic
    // itself is unconditionally present in every compiled ROM, always in
    // bank 1, and never relocated (see bbasic.bb.hbs's own template and
    // hooks/relocation-banks.js's own comments on what is/isn't eligible
    // for relocation), so this needs no per-project setup or bank
    // tracking at all to stay valid - unlike a data table's own address,
    // which only exists (and only in bank 1 specifically) because
    // something else already asked for it there.
    const ROM_NOISE_BASE_LABEL = 'commongamelogic';
    Blockly.BBasic[`sprite_${name}_rom_noise`] = function(block) {
      // Defaults to framecounter (already ticking every frame regardless
      // of anything else in the project) rather than a plain "0" fallback
      // - the whole point of this block is a shimmering, ever-changing
      // pattern with no setup required, and a fixed offset would instead
      // show the exact same static bytes forever until the user thought
      // to wire up their own changing value.
      const offset = Blockly.BBasic.valueToCode(block, 'OFFSET', Blockly.BBasic.ORDER_ADDITION) ||
        'framecounter';
      const height = Math.max(1, Math.min(32, Number(block.getFieldValue('HEIGHT')) || 8));
      return `${name}pointer = ${ROM_NOISE_BASE_LABEL} + (${offset})\n` +
        `${name}height = ${height}\n`;
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

  // Bit 2 of CTRLPF. Set through the bit-index syntax rather than a full
  // assignment so it doesn't clobber the other bits sprite_ball_set already
  // packs into CTRLPF (reflection, ball width).
  Blockly.BBasic['sprite_priority_set'] = function(block) {
    const value = block.getFieldValue('VALUE');
    return `CTRLPF{2} = ${value}\n`;
  };
};
