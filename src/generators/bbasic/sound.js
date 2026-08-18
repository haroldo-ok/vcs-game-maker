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

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    // Omitted outright (compile-time config.muteAllAudio, same as
    // resolveProjectMusic's identical guard in generators/bbasic/music.js)
    // rather than still generating the code and relying on
    // generateMuteAudio's later, per-frame "AUDV = 0" override - AUDV is
    // real, unbuffered TIA hardware, so a nonzero write here would still
    // audibly reach the speaker for however many CPU cycles pass before
    // that later override catches up to it, heard as this block's note
    // briefly starting before getting cut off. Never generating the write
    // at all has no such gap, and costs nothing in the compiled ROM.
    if (config.muteAllAudio) return 'rem Sound muted\n';

    // DIM (see the SoundFX tab) has to be applied here too, not just in
    // soundfx_play (generators/bbasic/soundfx.js) - this "Play sound" block
    // is a separate, freeform way to set AUDC/AUDF/AUDV directly, so it was
    // bypassing DIM entirely regardless of which sound type (AUDC) was
    // picked.
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
