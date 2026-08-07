'use strict';

import {findSoundEffectById, processSoundEffectsStorageDefaults} from '../../blocks/soundfx';
import {useConfigurationStorage, useSoundEffectsStorage} from '../../hooks/project';

// The DIM toggle's default percentage, used until the user picks their own
// on the slider next to it.
export const DEFAULT_DIM_PERCENT = 25;

// AUDV is write-only hardware (the TIA has no way to read it back), so
// dimming can't be a per-frame runtime override the way muteAllAudio is
// (see generateMuteAudio in generators/bbasic.js) - it has to be baked into
// each sound effect's own AUDV value at compile time instead, here.
export const dimVolume = (audv, percent) =>
  Math.round(Number(audv) * (Number(percent) / 100));

// Visual batari Basic's own "Fade" (see randomterrain.com's bB reference,
// Music and Sound Editor section) isn't a smooth ramp either - it just
// appends one extra, quieter volume/duration segment onto the end of the
// note, roughly a quarter of the original volume. This is the same idea,
// sized to fit this app's single AUDC/AUDF/AUDV/duration-per-preset model:
// the last FADE_TAIL_FRAMES frames of playback drop to fadeTargetVolume(),
// instead of a second explicit segment.
const FADE_TAIL_FRAMES = 4;
// 15 (the max nibble value) is never a meaningful *target* to fade down to
// (fading UP to max volume makes no sense), so it doubles as the "this
// channel's current sound has no fade" sentinel - seeing it lets the
// per-frame check (generateSoundFadeChecks) skip leaving AUDV alone for
// ordinary, non-faded sounds sharing the same channel.
const NO_FADE_SENTINEL = 15;
const fadeTargetVolume = (audv) => Math.max(0, Math.min(14, Math.round(Number(audv) / 4)));

// Whether ANY sound effect preset on the SoundFX tab has Fade enabled -
// checked directly against the tab's own stored data, rather than a flag
// set as a side effect of visiting some block during code generation, since
// block visitation order can't be relied on to see a fade-enabled preset's
// own block before a plain one that happens to share its channel (see the
// per-sound-effect call site below, which needs this same answer for EVERY
// soundfx_play block, fade-enabled or not, regardless of which one Blockly
// happens to generate first).
const anySoundEffectHasFade = () => {
  try {
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());
    return data.soundEffects.some((soundEffect) => !!soundEffect.fade);
  } catch (e) {
    return false;
  }
};

export default (Blockly) => {
  Blockly.BBasic['soundfx_play'] = function(block) {
    const channel = block.getFieldValue('CHANNEL');
    const soundEffect = findSoundEffectById(block.getFieldValue('SOUNDFX'));
    if (!soundEffect) {
      return `rem Sound effect not found\n`;
    }

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const {audc, audf, audv, duration, fade} = soundEffect;
    const effectiveAudv = config.dimSoundFx ?
      dimVolume(audv, config.dimSoundFxPercent ?? DEFAULT_DIM_PERCENT) : audv;

    // Every soundfx_play - fade-enabled or not - has to (re)set its
    // channel's nibble in soundFadeVolumes as long as Fade is used ANYWHERE
    // in the project: this sound's channel might previously have been
    // playing a faded sound, and without this, this plain sound would
    // inherit that stale fade target once its own duration counts down to
    // FADE_TAIL_FRAMES.
    let fadeLine = '';
    if (anySoundEffectHasFade()) {
      Blockly.BBasic.usesDivMul = true;
      const nibble = fade ? fadeTargetVolume(effectiveAudv) : NO_FADE_SENTINEL;
      fadeLine = channel === '1' ?
        `soundFadeVolumes = (soundFadeVolumes & $0F) | ${nibble * 16}\n` :
        `soundFadeVolumes = (soundFadeVolumes & $F0) | ${nibble}\n`;
    }

    return `AUDV${channel}=0\n` +
      `AUDC${channel}=${audc}\n` +
      `AUDF${channel}=${audf}\n` +
      `AUDV${channel}=${effectiveAudv}\n` +
      `channnel${channel}duration=${duration}\n` +
      fadeLine;
  };

  // Dim for the shared fade-target byte (see anySoundEffectHasFade above) -
  // only emitted when at least one SoundFX preset actually has Fade on.
  // var47 is the last of the four "var" slots that are safe regardless of
  // Superchip (see generateCollisionBoxDims's old reasoning, or
  // generateTextMinikernelDims's - var0-43 is the standard kernel's own
  // playfield buffer, var44 is TextIndex) - it can double as TextDataPtr's
  // high byte when the Text Minikernel's score-bar integration is also on,
  // which Fade would collide with in that specific combination; there is no
  // further safe slot to fall back to within the same 4-byte margin.
  Blockly.BBasic.generateSoundFadeDims = function() {
    if (!anySoundEffectHasFade()) return '';
    return '\n dim soundFadeVolumes = var47';
  };

  // Spliced into commongamelogic right after the existing per-frame sound
  // duration handling (see bbasic.bb.hbs) - channel 0's fade target lives in
  // the low nibble, channel 1's in the high nibble (see soundfx_play above).
  // Goto-based rather than "if X then A : B" - batari Basic's "if...then"
  // only conditions the statement immediately after "then", not everything
  // up to the next newline, so a colon-chained multi-statement body would
  // run its second half unconditionally.
  Blockly.BBasic.generateSoundFadeChecks = function() {
    if (!anySoundEffectHasFade()) return '';
    this.usesDivMul = true;
    return [
      ` if channnel0duration <> ${FADE_TAIL_FRAMES} then goto _soundfade0_skip`,
      ' temp1 = soundFadeVolumes & $0F',
      ` if temp1 = ${NO_FADE_SENTINEL} then goto _soundfade0_skip`,
      ' AUDV0 = temp1',
      '_soundfade0_skip',
      ` if channnel1duration <> ${FADE_TAIL_FRAMES} then goto _soundfade1_skip`,
      ' temp1 = soundFadeVolumes / 16',
      ` if temp1 = ${NO_FADE_SENTINEL} then goto _soundfade1_skip`,
      ' AUDV1 = temp1',
      '_soundfade1_skip',
    ].join('\n');
  };
};
