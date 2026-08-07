'use strict';

import * as Blockly from 'blockly/core';

import {useSoundEffectsStorage} from '../hooks/project';
import {CHANNEL_OPTIONS} from './sound';
import {SOUND_ICON} from './icon';

const SOUND_COLOR = 'rgb(156, 39, 176)';

export const DEFAULT_SOUND_EFFECTS = {
  soundEffects: [
    {
      id: 1,
      name: 'Example blip',
      audc: '4',
      audf: 16,
      audv: 15,
      duration: 5,
      fade: false,
    },
  ],
};

export const processSoundEffectsStorageDefaults = (soundEffectsStorage) => {
  const soundEffects = soundEffectsStorage.value;
  if (!soundEffects || !soundEffects.soundEffects || !soundEffects.soundEffects.length) {
    return structuredClone(DEFAULT_SOUND_EFFECTS);
  }
  return soundEffects;
};

// Read the sound effects afresh rather than through the module level storage:
// that is a computed over localStorage, which is not reactive, so it caches the
// first value it ever read and would keep serving stale names.
const buildSoundEffectOptions = () => {
  try {
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());

    return data.soundEffects.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list sound effect options', e);
    return [['Error', '1']];
  }
};

// Looks up one stored sound effect preset by id, or null if it can't be found.
export const findSoundEffectById = (id) => {
  try {
    const data = processSoundEffectsStorageDefaults(useSoundEffectsStorage());
    return data.soundEffects.find((soundEffect) => `${soundEffect.id}` === `${id}`) || null;
  } catch (e) {
    console.error('Failed to load sound effect', e);
    return null;
  }
};

// Defined here instead of in the JSON array below, because a JSON definition
// can only take a fixed list of dropdown options. Passing the function to
// FieldDropdown lets Blockly rebuild the list every time the dropdown opens, so
// renamed, added and deleted sound effects show up without reloading the page.
Blockly.Blocks['soundfx_play'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SOUND_ICON} Play sound effect:`)
        .appendField(new Blockly.FieldDropdown(buildSoundEffectOptions), 'SOUNDFX')
        .appendField('on')
        .appendField(new Blockly.FieldDropdown(CHANNEL_OPTIONS), 'CHANNEL');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SOUND_COLOR);
    this.setTooltip('Plays a named sound effect preset, set up on the SoundFX tab.');
  },
};
