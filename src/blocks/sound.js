import * as Blockly from 'blockly/core';

import {SOUND_ICON} from './icon';
import {useConfigurationStorage} from '../hooks/project';

/*
0 No sound (silent).
1 Buzzy tones.
2 Carries distortion 1 downward into a rumble.
3 Flangy wavering tones, like a UFO.
4 Pure tone.
5 Same as 4.
6 Between pure tone and buzzy tone (Adventure death uses this).
7 Reedy tones, much brighter, down to Enduro car rumble.
8 White noise/explosions/lightning, jet/spacecraft engine.
9 Same as 7.
10 Same as 6.
11 Same as 0.
12 Pure tone, goes much lower in pitch than 4 & 5.
13 Same as 12.
14 Electronic tones, mostly lows, extends to rumble.
15 Electronic tones, mostly highs, extends to rumble - NOT a duplicate of 14
   despite sharing the same note chart (see utils/music-notes.js's
   EMPIRICAL_NOTE_CHARTS[15] alias) - Saunders' source lists 14 and 15
   as two separate distortions with different descriptions ("mostly lows"
   vs "mostly highs"), unlike 4/5, 6/10, 7/9, 0/11, and 12/13 below, which
   the source explicitly groups as one row/description each (exactly the
   same notes AND distortion, not just the same notes).
*/

export const AUDC_OPTIONS = [
  ['0/11 No sound (silent).', '0'],
  ['1 Buzzy tones.', '1'],
  ['2 Carries distortion 1 downward into a rumble.', '2'],
  ['3 Flangy wavering tones, like a UFO.', '3'],
  ['4/5 Pure tone.', '4'],
  ['6/10 Between pure tone and buzzy tone.', '6'],
  ['7/9 Reedy tones, much brighter, down to Enduro car rumble.', '7'],
  ['8 White noise/explosions/lightning, jet/spacecraft engine.', '8'],
  ['12/13 Pure tone, goes much lower in pitch than 4 & 5.', '12'],
  ['14 Electronic tones, mostly lows, extends to rumble.', '14'],
  ['15 Electronic tones, mostly highs, extends to rumble.', '15'],
];

export const CHANNEL_OPTIONS = [
  ['Ch0', '0'],
  ['Ch1', '1'],
];

// Under DPC+, with its sound chip, channel 0 is the chip's three voices, each a channel (so a sound effect can
// be on a voice the music does not use, or take one over from it for a while and give it back): channels 0, 2 and 3 are
// voices 1, 2 and 3, and channel 1 is still the TIA's. See generators/bbasic/dpcplus-audio.js.
export const DPC_PLUS_CHANNEL_OPTIONS = [
  ['Ch0 voice 1', '0'],
  ['Ch0 voice 2', '2'],
  ['Ch0 voice 3', '3'],
  ['Ch1 (TIA)', '1'],
];

// Whether the project's sounds are played by the DPC+ sound chip.
export const dpcPlusChipOn = () => {
  const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
  return config.kernel === 'dpcplus' && config.enableDpcPlusAudio !== false;
};

// The channel choices of a sound block or a Music tab track.
export const channelOptions = () => (dpcPlusChipOn() ? DPC_PLUS_CHANNEL_OPTIONS : CHANNEL_OPTIONS);

Blockly.Blocks['simple_sound_set'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SOUND_ICON} Play sound`)
        .appendField(new Blockly.FieldDropdown(AUDC_OPTIONS), 'AUDC');
    this.appendDummyInput()
        .appendField('with frequency')
        .appendField(new Blockly.FieldNumber(31), 'AUDF')
        .appendField(', volume')
        .appendField(new Blockly.FieldNumber(15), 'AUDV')
        .appendField('and duration')
        .appendField(new Blockly.FieldNumber(20), 'DURATION')
        .appendField('on')
        // A function, so the choices follow the kernel (see channelOptions).
        .appendField(new Blockly.FieldDropdown(() => channelOptions()), 'CHANNEL');
    this.setInputsInline(false);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour('rgb(156, 39, 176)');
    this.setTooltip('Starts playing a simple sound.');
  },
};
