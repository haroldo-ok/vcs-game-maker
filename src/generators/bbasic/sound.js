'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {registerSoundDescription, volumeLimitAsm} from './soundfx';

export default (Blockly) => {
  Blockly.BBasic[`simple_sound_set`] = function(block) {
    const audc = block.getFieldValue('AUDC');
    const audf = block.getFieldValue('AUDF');
    const audv = block.getFieldValue('AUDV');
    const channel = Blockly.BBasic.normalizeChannel(block.getFieldValue('CHANNEL'));
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
    // App-wide preference (see useDimSoundFxStorage's  comment in
    // hooks/project.js), not part of this project's  saved configuration.
    const effectiveAudv = audv;

    // Under DPC+ the sound type and frequency are turned into the waveform and pitch the sound chip plays (see
    // generators/bbasic/dpcplus-audio.js).
    // Only channel 0 is played by the chip; channel 1 stays on the TIA.
    const dpcPlan = Blockly.BBasic.dpcAudioPlan && Blockly.BBasic.dpcAudioPlan.isChannel(channel) ?
      Blockly.BBasic.dpcAudioPlan : null;
    const audcValue = dpcPlan ? dpcPlan.waveIdForTia(audc) : audc;
    const audfValue = dpcPlan ? dpcPlan.pitchIdForTia(audc, audf) : audf;
    const cutVar = Blockly.BBasic.soundMaxVolumeUsed ?
      Blockly.BBasic.nameDB_.getName('soundVolumeCut', Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
    // The channel's variable for loops and pitch tables, when it has one: the number of this sound's description (0 when it does not
    // loop; this block never changes pitch).
    let idLines = '';
    // A sound that loops counts one frame more, so it plays all of its frames every time round (see soundfx_play).
    const loops = block.getFieldValue('LOOP') === 'TRUE';
    const loopDuration = Math.min(255, Number(duration) + 1);
    if (Blockly.BBasic.soundIdChannels && Blockly.BBasic.soundIdChannels.has(`${Number(channel)}`)) {
      const idVar = Blockly.BBasic.nameDB_.getName(`soundId${channel}`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const durationVar = Blockly.BBasic.nameDB_.getName(`channnel${channel}duration`, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const id = registerSoundDescription(channel, {
        loopLines: !loops ? null : [
          '       lda #0', `       sta AUDV${channel}`,
          `       lda #${audcValue}`, `       sta AUDC${channel}`,
          `       lda #${audfValue}`, `       sta AUDF${channel}`,
          `       lda #${effectiveAudv}`,
          ...(cutVar ? [...volumeLimitAsm(cutVar, `_soundloop${channel}_@@ID@@`), `       stx AUDV${channel}`] :
            [`       sta AUDV${channel}`]),
          `       lda #${loopDuration}`, `       sta ${durationVar}`,
        ],
      });
      idLines = `${idVar}=${id}
`;
    }
    const volumeLines = cutVar ?
      `asm\nlda #15\nsec\nsbc ${cutVar}\ncmp #${effectiveAudv}\nbcc *+4\nlda #${effectiveAudv}\nsta AUDV${channel}\n@end\n` :
      `AUDV${channel}=${effectiveAudv}\n`;
    const code = `AUDV${channel}=0\n` +
      `AUDC${channel}=${audcValue}\n` +
      `AUDF${channel}=${audfValue}\n` +
      volumeLines +
      `channnel${channel}duration=${loops ? loopDuration : duration}\n` +
      idLines;
    return code;
  };
};
