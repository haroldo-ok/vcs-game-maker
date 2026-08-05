'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {DEFAULT_DIM_PERCENT, dimVolume} from './soundfx';

export default (Blockly) => {
  Blockly.BBasic[`simple_sound_set`] = function(block) {
    const audc = block.getFieldValue('AUDC');
    const audf = block.getFieldValue('AUDF');
    const audv = block.getFieldValue('AUDV');
    const channel = block.getFieldValue('CHANNEL');
    const duration = block.getFieldValue('DURATION');

    // DIM (see the SoundFX tab) has to be applied here too, not just in
    // soundfx_play (generators/bbasic/soundfx.js) - this "Play sound" block
    // is a separate, freeform way to set AUDC/AUDF/AUDV directly, so it was
    // bypassing DIM entirely regardless of which sound type (AUDC) was
    // picked.
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const effectiveAudv = config.dimSoundFx ?
      dimVolume(audv, config.dimSoundFxPercent ?? DEFAULT_DIM_PERCENT) : audv;

    const code = `AUDV${channel}=0\n` +
      `AUDC${channel}=${audc}\n` +
      `AUDF${channel}=${audf}\n` +
      `AUDV${channel}=${effectiveAudv}\n` +
      `channnel${channel}duration=${duration}\n`;
    return code;
  };
};
