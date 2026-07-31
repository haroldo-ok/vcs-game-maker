'use strict';

import {findSoundEffectById} from '../../blocks/soundfx';
import {useConfigurationStorage} from '../../hooks/project';

// The DIM toggle's default percentage, used until the user picks their own
// on the slider next to it.
export const DEFAULT_DIM_PERCENT = 25;

// AUDV is write-only hardware (the TIA has no way to read it back), so
// dimming can't be a per-frame runtime override the way muteAllAudio is
// (see generateMuteAudio in generators/bbasic.js) - it has to be baked into
// each sound effect's own AUDV value at compile time instead, here.
export const dimVolume = (audv, percent) =>
  Math.round(Number(audv) * (Number(percent) / 100));

export default (Blockly) => {
  Blockly.BBasic['soundfx_play'] = function(block) {
    const channel = block.getFieldValue('CHANNEL');
    const soundEffect = findSoundEffectById(block.getFieldValue('SOUNDFX'));
    if (!soundEffect) {
      return `rem Sound effect not found\n`;
    }

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const {audc, audf, audv, duration} = soundEffect;
    const effectiveAudv = config.dimSoundFx ?
      dimVolume(audv, config.dimSoundFxPercent ?? DEFAULT_DIM_PERCENT) : audv;
    return `AUDV${channel}=0\n` +
      `AUDC${channel}=${audc}\n` +
      `AUDF${channel}=${audf}\n` +
      `AUDV${channel}=${effectiveAudv}\n` +
      `channnel${channel}duration=${duration}\n`;
  };
};
