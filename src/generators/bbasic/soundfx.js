'use strict';

import {findSoundEffectById} from '../../blocks/soundfx';

export default (Blockly) => {
  Blockly.BBasic['soundfx_play'] = function(block) {
    const channel = block.getFieldValue('CHANNEL');
    const soundEffect = findSoundEffectById(block.getFieldValue('SOUNDFX'));
    if (!soundEffect) {
      return `rem Sound effect not found\n`;
    }

    const {audc, audf, audv, duration} = soundEffect;
    return `AUDV${channel}=0\n` +
      `AUDC${channel}=${audc}\n` +
      `AUDF${channel}=${audf}\n` +
      `AUDV${channel}=${audv}\n` +
      `channnel${channel}duration=${duration}\n`;
  };
};
