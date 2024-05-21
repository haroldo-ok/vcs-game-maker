'use strict';

export default (Blockly) => {
  Blockly.BBasic[`simple_sound_set`] = function(block) {
    const audc = block.getFieldValue('AUDC');
    const audf = block.getFieldValue('AUDF');
    const audv = block.getFieldValue('AUDV');
    const channel = block.getFieldValue('CHANNEL');
    const duration = block.getFieldValue('DURATION');
    const code = `AUDV${channel}=0\n` +
      `AUDC${channel}=${audc}\n` +
      `AUDF${channel}=${audf}\n` +
      `AUDV${channel}=${audv}\n` +
      `channnel${channel}duration=${duration}\n`;
    return code;
  };
};
