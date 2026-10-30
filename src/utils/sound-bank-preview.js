'use strict';

import {previewSoundEffect, stopSoundEffectPreview} from './sound-preview';
import {previewDpcPlusSoundEffect} from './dpc-preview';
import {useConfigurationStorage, useDimSoundFxStorage, useDimSoundFxPercentStorage} from '../hooks/project';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';

// Plays the sounds of a sound bank file, the way the Sound tab's preview plays a card, on the TIA ('tia') or on the DPC+ chip ('dpc'): the
// card's Standard settings for the TIA and the chip's settings for the DPC+ chip. Each sound starts when the one before has run its
// duration. Returns the timers (to stop it, see stopSoundBankPreview) and the milliseconds it takes.
export const playSoundBankSounds = (sounds, chip) => {
  const dimOn = useDimSoundFxStorage().value;
  const dimPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value;
  const dimMultiplier = dimOn ? (Number(dimPercent) || 0) / 100 : 1;
  const timers = [];
  let startMs = 0;
  sounds.forEach((sound) => {
    timers.push(window.setTimeout(() => {
      if (chip === 'dpc') previewDpcPlusSoundEffect(sound, useConfigurationStorage().value || {}, dimMultiplier);
      else previewSoundEffect({...sound, audv: dimOn ? dimVolume(sound.audv, dimPercent) : sound.audv});
    }, startMs));
    startMs += (Math.max(0, Number(sound.duration) || 0) / 60) * 1000 + 250;
  });
  return {timers, totalMs: startMs};
};

export const stopSoundBankPreview = (timers) => {
  (timers || []).forEach((timer) => window.clearTimeout(timer));
  stopSoundEffectPreview();
};
