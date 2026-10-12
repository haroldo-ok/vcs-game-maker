'use strict';

// The DPC+ sound engine.
//
// The DPC+ kernel has a music chip: three voices, each a 32 sample waveform played at a pitch from the chip's
// frequency table, mixed into one number that the kernel copies to the TIA's volume register every scanline.
// Everything the app generates for sound and music (the Play sound block, Sound tab presets, the Music tab) is
// written for the TIA's two channels: a type (AUDC), a divider (AUDF) and a volume (AUDV) each. Under DPC+ the same
// generated code is kept, but its three values mean something else: AUDC is the number of a waveform (see
// dpc-sound.js: the shape drawn on the sound's card), AUDF is the pitch, an entry of the frequency table (the 88
// piano keys, then any other pitch a sound needs), and AUDV is the volume. The chip's registers can only be written, not
// read, so the pitch goes straight to the voice's note register and the waveform and the volume are written to two
// variables per voice instead. Once per frame a short routine turns those into the voice's waveform: when the waveform
// or the volume changed it rewrites the voice's 32 bytes of display RAM from the waveform's ROM copy scaled to the
// volume. What the voice's RAM holds is kept in the high nibbles of its first two bytes (the chip only plays the low
// nibble), so that costs no variable.
//
// The chip's voices are the channels 0, 2 and 3 (channel 1 is the TIA's), each its own channel for the music player and
// the sound blocks, so a sound effect can take a voice over from the music for a while and give it back, as on the
// TIA's two channels.
//
// The routine and its tables are an ordinary subroutine, so the project's bank layout can move them out of the bank
// with the game code, and the frequency table is a separate file in the display data bank.

import {convertSoundToDpcPlus, isDpcPlusSound, DPC_WAVE_LENGTH, DPC_WAVE_MAX, dpcWaveOf, frequencyForMidi, frequencyForTia, shapeForAudc, waveFor,
  PIANO_KEY_COUNT, midiForPianoIndex} from '../../utils/dpc-sound';

export const DPC_AUDIO_SUBROUTINE_NAME = '_dpc_audio_update';
// The most waveforms a project can use at once: waveform * 32 + sample has to fit one byte.
const MAX_WAVES = 8;
// Entry 0 of the frequency table is silence. With coprocessor code the chip only has the first 128 entries.
const MAX_PITCHES = 127;
// The chip has three voices, played as channels 0, 2 and 3 (channel 1 is the TIA's): the voice of each channel, and the
// waveform in display RAM each voice's samples are written to (the demo waveforms of the display data, which nothing
// else uses).
export const CHIP_CHANNELS = [0, 2, 3];
const VOICE_OF_CHANNEL = {0: 0, 2: 1, 3: 2};
const VOICE_WAVE_SLOTS = ['SINE_WAVE', 'TRIANGLE_WAVE', 'SAWTOOTH_WAVE'];
export const isChipChannel = (channel) => CHIP_CHANNELS.includes(Number(channel));
// What the voices add up to goes to the TIA's volume register, which has 15 steps: voices that together are louder than that
// are all turned down (see the volume mix in the routine).
const CHIP_CLOCK = 20000;
// A pitch this close (in cents) to a piano key or an earlier pitch is the same entry.
const SAME_PITCH_CENTS = 3;

// The variables the routine reads (what AUDC0/AUDF0/AUDV0 and AUDC1/AUDF1/AUDV1 become), and the one per voice
// that remembers which waveform and volume the voice's RAM holds.
export const dpcAudioVars = (channels) => channels.flatMap((channel) => [`dpcAudc${channel}`, `dpcAudv${channel}`]);

const cents = (a, b) => Math.abs(1200 * Math.log2(a / b));
const distance = (a, b) => a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0);

// Collects the waveforms and pitches the project's sounds use as the generators ask for them, and builds the
// routine and the frequency table from them.
// channels are the chip channels (see CHIP_CHANNELS) the project uses.
export const createDpcPlusAudioPlan = (config, channels = [0]) => {
  const waves = [];
  const waveIdByKey = new Map();
  const extraPitches = [];

  const waveIdFor = (samples) => {
    const key = samples.join(',');
    if (waveIdByKey.has(key)) return waveIdByKey.get(key);
    let id;
    if (waves.length < MAX_WAVES) {
      id = waves.length;
      waves.push(samples);
    } else {
      // No waveform left: the closest one is played instead.
      id = 0;
      waves.forEach((wave, i) => {
        if (distance(wave, samples) < distance(waves[id], samples)) id = i;
      });
    }
    waveIdByKey.set(key, id);
    return id;
  };

  // The frequency table entry of a pitch: a piano key if it is one, otherwise a new entry.
  const pitchIdFor = (hz) => {
    if (!(hz > 0)) return 0;
    const semitones = 12 * Math.log2(hz / 440) + 69;
    const nearestMidi = Math.round(semitones);
    const index = nearestMidi - 20;
    if (index >= 1 && index <= PIANO_KEY_COUNT && cents(hz, frequencyForMidi(nearestMidi)) <= SAME_PITCH_CENTS) return index;
    for (let i = 0; i < extraPitches.length; i++) {
      if (cents(hz, extraPitches[i]) <= SAME_PITCH_CENTS) return PIANO_KEY_COUNT + 1 + i;
    }
    if (PIANO_KEY_COUNT + 1 + extraPitches.length > MAX_PITCHES) {
      // No entry left: the closest piano key is played instead.
      return Math.min(PIANO_KEY_COUNT, Math.max(1, index));
    }
    extraPitches.push(hz);
    return PIANO_KEY_COUNT + extraPitches.length;
  };

  // A sound that has not been converted to the DPC+ kind yet (the project was just switched to it) is converted here.
  const asDpcPlusSound = (sound) => {
    if (isDpcPlusSound(sound)) return sound;
    const copy = {...sound};
    convertSoundToDpcPlus(copy, config);
    return copy;
  };
  const waveIdForSound = (sound) => waveIdFor(dpcWaveOf(asDpcPlusSound(sound)));
  const pitchIdForSound = (sound) => pitchIdFor(asDpcPlusSound(sound).dpcFrequency);
  const waveIdForTia = (audc) => {
    const tia = waveFor(shapeForAudc(audc));
    return waveIdFor(tia ? tia.samples.map((value) => value * DPC_WAVE_MAX) : Array(DPC_WAVE_LENGTH).fill(0));
  };
  const pitchIdForTia = (audc, audf) => pitchIdFor(frequencyForTia(audc, audf, config));


  const byteLines = (label, values) => {
    const lines = ['@' + label];
    for (let i = 0; i < values.length; i += 16) {
      lines.push(' .byte ' + values.slice(i, i + 16).map((value) => '$' + (value & 255).toString(16).padStart(2, '0')).join(','));
    }
    return lines;
  };

  // The DPC_frequencies.h the ROM is built with: the piano keys, then the other pitches, as the chip's 32 bit steps
  // per tick.
  const frequencyFile = () => {
    const lines = [
      '; Provided under the CC0 license. See the included LICENSE.txt for details.',
      '',
      '; The frequency table of this project (see generators/bbasic/dpcplus-audio.js).',
      '; Entry n is 2^32 * frequency / 20000. Entry 0 is silence, 1 to 88 are the piano keys A0 to C8.',
      '',
      '.freq_table_start',
      '',
      ' DC.L 0',
    ];
    const entry = (hz) => ` DC.L ${Math.min(0xFFFFFFFF, Math.round(Math.pow(2, 32) * hz / CHIP_CLOCK))}`;
    for (let index = 1; index <= PIANO_KEY_COUNT; index++) lines.push(entry(frequencyForMidi(midiForPianoIndex(index))));
    extraPitches.forEach((hz) => lines.push(entry(hz)));
    lines.push(
        '',
        ' if (* <= $1400)',
        '   ds ($1400-*) ; pad out remaining space in frequency table',
        ' else',
        '   echo "FATAL ERROR - Frequency table exceeds 1K"',
        '   err',
        ' endif',
        '');
    return lines.join('\n');
  };

  // The waveforms as the coprocessor reads them: 8 of 32 samples (0 to 15), the unused ones silent, two to a byte with the
  // first of the two in the low nibble.
  const waveBytes = () => {
    const samples = Array.from({length: MAX_WAVES}, (_, i) => waves[i] || Array(DPC_WAVE_LENGTH).fill(0)).flat();
    return Array.from({length: samples.length / 2}, (_, i) => (samples[2 * i] & 15) | ((samples[2 * i + 1] & 15) << 4));
  };

  // The routine, in the form subroutine bodies are registered in (see BG_FADE_CHECKS_NAME in generators/bbasic.js):
  // "@" marks labels, "@end" closes the asm block. names maps dpcAudioVars(channels) to the variables the project got.
  const routine = (names) => {
    const lines = ['asm',
      ' lda #0',
      ' sta $15 ; AUDC0 = 0 holds the output high, so the volume register alone makes the sound'];
    // The volume mix: the voices' volumes go to temp4 to temp6. The chip adds the voices up into the 15 steps of the TIA's
    // volume register, so volumes that add up to more than 15 are scaled down together by the coprocessor (function 52).
    channels.forEach((channel, position) => {
      lines.push(` lda ${names[`dpcAudv${channel}`]}`, ' and #15', ` sta temp${4 + position}`);
    });
    if (channels.length > 1) {
      lines.push(' lda temp4', ' clc', ' adc temp5');
      if (channels.length > 2) lines.push(' adc temp6');
      lines.push(
          ' cmp #16',
          ' bcc _dpcmixdone',
          ' lda #<C_function',
          ' sta DF0LOW',
          ' lda #(>C_function) & $0F',
          ' sta DF0HI',
          ' lda #52',
          ' sta DF0WRITE',
          ' lda temp4',
          ' sta DF0WRITE',
          ' lda temp5',
          ' sta DF0WRITE',
          channels.length > 2 ? ' lda temp6' : ' lda #0',
          ' sta DF0WRITE',
          ' lda #255',
          ' sta CALLFUNCTION',
          ' lda #<(C_function+1)',
          ' sta DF0LOW',
          ' lda DF0DATA',
          ' sta temp4',
          ' lda DF0DATA',
          ' sta temp5');
      if (channels.length > 2) lines.push(' lda DF0DATA', ' sta temp6');
      lines.push('@_dpcmixdone');
    }
    channels.forEach((channel, position) => {
      const voice = VOICE_OF_CHANNEL[channel];
      const audc = names[`dpcAudc${channel}`];
      const wave = VOICE_WAVE_SLOTS[voice];
      const slotLow = `<((${wave}&$7f)*32)`;
      const slotHigh = `>((${wave}&$7f)*32)`;
      const label = (name) => `_dpcaud${name}${channel}`;
      const pointAtSlot = [
        ` lda #${slotLow}`,
        ' sta DF6LOW',
        ` lda #${slotHigh}`,
        ' sta DF6HI',
      ];
      const times = (count, line) => Array(count).fill(line);
      lines.push(
          // The pitch (AUDF) goes straight to the chip's note register (see redirectSoundRegisters); this is the waveform
          // and its height, which have to be put together in the voice's 32 bytes of RAM.
          ` lda temp${4 + position}`,
          // The branches over the waveform code are inverted over a JMP: it is longer than a branch reaches.
          ` bne ${label('on')}`,
          ` jmp ${label('off')}`,
          '@' + label('on'),
          ' sta temp2 ; waveform height',
          ` lda ${audc}`,
          ' and #7',
          ' sta temp1 ; waveform',
          // What the voice's bytes hold already: the high nibbles (the chip only plays the low ones) of the first two bytes
          // are the waveform and the height they were made with, so nothing has to be kept in a variable.
          ...pointAtSlot,
          ' lda DF6DATA',
          ' and #$F0',
          ' sta temp3',
          ' lda DF6DATA',
          ' lsr',
          ' lsr',
          ' lsr',
          ' lsr',
          ' ora temp3',
          ' sta temp3 ; waveform and height now in the RAM',
          ' lda temp1',
          ...times(4, ' asl'),
          ' ora temp2',
          ' cmp temp3',
          ` bne ${label('rebuild')}`,
          ` jmp ${label('same')}`,
          '@' + label('rebuild'),
          // The coprocessor writes the voice's 32 bytes (functions 44 and 48 in custom/main.c): the waveform's samples,
          // from the table below, scaled to the height.
          ' lda #<C_function',
          ' sta DF0LOW',
          ' lda #(>C_function) & $0F',
          ' sta DF0HI',
          ' lda #44',
          ' sta DF0WRITE',
          ' lda #<_dpcwaves',
          ' sta DF0WRITE',
          ' lda #((>_dpcwaves) & $0f) | (((>_dpcwaves) / 2) & $70)',
          ' sta DF0WRITE',
          ' lda #255',
          ' sta CALLFUNCTION',
          ' lda #<C_function',
          ' sta DF0LOW',
          ' lda #48',
          ' sta DF0WRITE',
          ` lda #(${wave}&$7f)`,
          ' sta DF0WRITE',
          ' lda temp1',
          ...times(4, ' asl'),
          ' ora temp2',
          ' sta DF0WRITE',
          ' lda #255',
          ' sta CALLFUNCTION',
          '@' + label('same'),
          ` lda #${wave}`,
          ` sta WAVEFORM${voice}`,
          ` jmp ${label('next')}`,
          '@' + label('off'),
          ' lda #SOUND_OFF',
          ` sta WAVEFORM${voice}`,
          '@' + label('next'));
    });
    lines.push(' RETURN',
        ...byteLines('_dpcwaves', waveBytes()),
        '@end');
    return lines.join('\n');
  };

  return {channels, isChannel: (channel) => channels.includes(Number(channel)),
    waveIdForSound, pitchIdForSound, waveIdForTia, pitchIdFor, pitchIdForTia, frequencyFile, routine,
    get waveCount() {
      return waves.length;
    }};
};

// Points the generated code's writes to the sound registers of the chip's channels at the variables above (the TIA's channel
// 1 stays as it is).
export const redirectSoundRegisters = (code, names) =>
  code.replace(/\bAUD([CFV])([023])\b/g, (match, kind, channel) => (kind === 'F' ?
    `NOTE${VOICE_OF_CHANNEL[channel]}` : names[`dpcAud${kind.toLowerCase()}${channel}`] || match));

const KERNEL_LOOP_SLOT = /( *)ifnconst DPC_kernel_options\r?\n( *);sleep 8 ; REVENG[^\r\n]*\r?\n( *)sleep 5 ; this is better\r?\n/;
const KERNEL_EXIT = /^(exitkernel[^\r\n]*\r?\n)( *)/m;

// The kernel reads the chip's mixed output into the volume register on each scanline it has the 5 cycles to spare
// (the same 5 cycles that were a sleep), and silences it when the picture ends.
export const withDpcPlusAudioHook = (kernel) => {
  if (!KERNEL_LOOP_SLOT.test(kernel) || !KERNEL_EXIT.test(kernel)) {
    throw new Error('The DPC+ kernel does not have the places the sound engine hooks into');
  }
  return kernel
      .replace(KERNEL_LOOP_SLOT, (match, i1, i2, i3) =>
        `${i1}ifnconst DPC_kernel_options\r\n${i2};sleep 8 ; REVENG - timing is off - results in a garbled screen\r\n` +
        `${i3}lda #<AMPLITUDE ; the sound engine (see generators/bbasic/dpcplus-audio.js)\r\n${i3}sta AUDV0\r\n`)
      .replace(KERNEL_EXIT, (match, label, indent) => `${label}${indent}stx AUDV0 ; X is 0 here: the sound stops with the picture
${indent}`);
};

// The chip's channels (see CHIP_CHANNELS) the project plays something on: a sound block with that channel, or a Music tab
// track with notes on it.
export const collectChipChannels = (workspace, songs) => {
  const used = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if ((block.type === 'soundfx_play' || block.type === 'simple_sound_set') && block.isEnabled()) {
      used.add(Number(block.getFieldValue('CHANNEL')) || 0);
    }
  });
  (songs || []).forEach((song) => (song.patterns || []).forEach((pattern) => (pattern.tracks || []).forEach((track) => {
    if ((track.notes || []).length) used.add(Number(track.channel) || 0);
  })));
  // A channel 1 sound is the TIA's, and any other channel number (a leftover of a project made under another kernel)
  // is played by the chip's first voice.
  const chip = CHIP_CHANNELS.filter((channel) => used.has(channel));
  if ([...used].some((channel) => !CHIP_CHANNELS.includes(channel) && channel !== 1) && !chip.includes(0)) chip.unshift(0);
  return chip;
};

// The files a build with the DPC+ sound engine adds next to the compiled source: the project's frequency table and
// the kernel with its hook (on top of the kernel the Text Minikernel already changed, if it did).
export const getDpcPlusAudioSiblingFiles = async (siblingFiles, audioFiles) => {
  if (!audioFiles || !Object.keys(audioFiles).length) return {};
  const kernel = siblingFiles['DPCplus_kernel.asm'] ||
    await fetch('bb19/includes/DPCplus_kernel.asm').then((response) => response.text());
  return {...audioFiles, 'DPCplus_kernel.asm': withDpcPlusAudioHook(kernel)};
};
