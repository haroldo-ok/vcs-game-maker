'use strict';

// How a sound sounds on the DPC+ kernel, for the previews in the Sound and Music tabs.
//
// The DPC+ sound chip is rebuilt step by step the way the kernel uses it (see generators/bbasic/dpcplus-audio.js):
// a 32 sample waveform of whole numbers scaled by the sound's volume (so a quiet sound has fewer steps to its shape), a position that moves along the waveform 20000 times a second by the pitch's step, and
// the kernel reading the chip once per scanline while the picture is drawn (15720 reads a second), holding the last
// value for the score lines and silent for the rest of each 262 line frame. Nothing is smoothed.

import {buildEnvelopeCurve} from './envelope';
import {DPC_WAVE_LENGTH, dpcWaveOf, convertSoundToDpcPlus, frequencyForMidi, isDpcPlusSound} from './dpc-sound';
import {getAudioContext, registerSoundEffectPreview} from './sound-preview';
import {useConfigurationStorage} from '../hooks/project';

const CHIP_CLOCK = 20000;
const SCANLINE_RATE = 15720;
const LINES_PER_FRAME = 262;
const PICTURE_LINES = 192;
const SCORE_LINES_END = 202;
const FRAMES_PER_SECOND = 60;
// Channel 0 is the first voice alone, so it has all 15 steps of the volume register.
const VOICE_CAP = 15;
// The buffer is built at three times the read rate (each read held three samples) and the browser resamples it.
const HOLD = 3;
const OUTPUT_RATE = SCANLINE_RATE * HOLD;
const TWO_POW_32 = 4294967296;
const TWO_POW_27 = 134217728;
const FADE_SECONDS = 0.004;

export const dpcPlusLevelFor = (volume) => {
  const v = Math.max(0, Math.min(15, Math.round(Number(volume) || 0)));
  return v === 0 ? 0 : Math.max(1, Math.round(v * VOICE_CAP / 15));
};

// The samples (-0.5 to 0.5) of a sound: wave is 32 samples 0-15, frequencyForFrame and volumeForFrame give each 60 Hz
// frame's pitch (Hz) and volume (0-15).
export const renderDpcPlusSamples = ({wave, frequencyForFrame, volumeForFrame, seconds}) => {
  const lines = Math.ceil(seconds * SCANLINE_RATE);
  const out = new Float32Array(lines * HOLD);
  let counter = 0;
  let ticks = 0;
  let held = 0;
  for (let line = 0; line < lines; line++) {
    const frame = Math.floor(line / LINES_PER_FRAME);
    const lineInFrame = line % LINES_PER_FRAME;
    ticks += CHIP_CLOCK / SCANLINE_RATE;
    const clocks = Math.floor(ticks);
    ticks -= clocks;
    const step = Math.round(TWO_POW_32 * frequencyForFrame(frame) / CHIP_CLOCK);
    counter = (counter + step * clocks) % TWO_POW_32;
    const level = dpcPlusLevelFor(volumeForFrame(frame));
    let value;
    if (lineInFrame < PICTURE_LINES) {
      held = Math.round(wave[Math.floor(counter / TWO_POW_27) % DPC_WAVE_LENGTH] * level / 15);
      value = held;
    } else if (lineInFrame < SCORE_LINES_END) {
      value = held;
    } else {
      value = 0;
    }
    // The output sits around the middle of its range, so a silent part is the middle too.
    const sample = lineInFrame < SCORE_LINES_END ? (value - level / 2) / VOICE_CAP : 0;
    for (let i = 0; i < HOLD; i++) out[line * HOLD + i] = sample;
  }
  return out;
};

// The project's settings when its sounds are played by the DPC+ sound chip, otherwise null.
export const dpcPlusPreviewActive = () => {
  const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
  return config.kernel === 'dpcplus' && config.enableDpcPlusAudio !== false ? config : null;
};

// A sound as a DPC+ one, whichever kernel it was last saved under.
export const asDpcPlusSound = (soundEffect, config) => {
  if (isDpcPlusSound(soundEffect)) return soundEffect;
  const copy = {...soundEffect};
  convertSoundToDpcPlus(copy, config);
  return copy;
};

// The pitches an arpeggio goes through, in semitones from the note: the same sequences as the compiled ROM's.
const ARPEGGIO_SEQUENCES = [
  ['B', 'A'], ['A', 'B'], ['B', 'A', 'UB', 'UA'], ['B', 'A', 'DB', 'DA'], ['B', 'A', 'B'],
  ['B', 'A', 'UB', 'UA', 'UB', 'A'],
];
const arpeggioShift = (token, interval) =>
  (token.endsWith('A') ? interval : 0) + (token[0] === 'U' ? 12 : token[0] === 'D' ? -12 : 0);

// Plays a sound. {sound, frequency (Hz), volume, seconds, startTime, destination, envelope fields, arpeggio fields}.
// Returns the source.
export const playDpcPlusSound = (context, {sound, frequency, volume, seconds, startTime, destination, loopSustain = false,
  dimMultiplier = 1, arpeggioSpeed = 0, arpeggioInterval = 0, arpeggioRange = 0}) => {
  const wave = dpcWaveOf(sound);
  const totalFrames = Math.max(1, Math.round(seconds * FRAMES_PER_SECOND));
  const curve = sound.envelope ? buildEnvelopeCurve({
    attack: sound.envelopeAttack, decay: sound.envelopeDecay, decayEndPercent: sound.envelopeDecayEnd,
    releaseStartPercent: sound.envelopeReleaseStart, sustainLength: sound.envelopeSustainLength,
    release: sound.envelopeRelease, peakVolume: volume, totalFrames, loopSustain,
  }) : null;
  const sequence = ARPEGGIO_SEQUENCES[arpeggioRange] || ARPEGGIO_SEQUENCES[0];
  const samples = renderDpcPlusSamples({
    wave, seconds,
    volumeForFrame: (frame) => (curve ? (curve[Math.min(frame, curve.length - 1)] || 0) : volume),
    frequencyForFrame: (frame) => {
      if (!arpeggioSpeed) return frequency;
      const token = sequence[Math.floor(frame / arpeggioSpeed) % sequence.length];
      return frequency * Math.pow(2, arpeggioShift(token, arpeggioInterval) / 12);
    },
  });
  const buffer = context.createBuffer(1, samples.length, OUTPUT_RATE);
  buffer.copyToChannel(samples, 0);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = 0.6 * dimMultiplier;
  gain.gain.setValueAtTime(0.6 * dimMultiplier, startTime);
  // The last few milliseconds fade out, only to stop a click where the buffer ends.
  gain.gain.setValueAtTime(0.6 * dimMultiplier, startTime + Math.max(0, seconds - FADE_SECONDS));
  gain.gain.linearRampToValueAtTime(0, startTime + seconds);
  source.connect(gain);
  gain.connect(destination || context.destination);
  source.start(startTime);
  source.stop(startTime + seconds);
  source.onended = () => gain.disconnect();
  return {source, gain};
};

// The Sound tab's preview of a card.
export const previewDpcPlusSoundEffect = (soundEffect, config) => {
  const seconds = Math.max(0, Number(soundEffect.duration) || 0) / FRAMES_PER_SECOND;
  if (seconds <= 0) return;
  const sound = asDpcPlusSound(soundEffect, config);
  const context = getAudioContext();
  const {source, gain} = playDpcPlusSound(context, {
    sound, frequency: Number(sound.dpcFrequency) || 0, volume: Number(soundEffect.audv) || 0, seconds,
    startTime: context.currentTime,
  });
  registerSoundEffectPreview([source], gain);
};

// What the Music tab plays a note of an instrument with: the sound as a DPC+ one and the pitch (a piano key for an
// instrument, the pitch of the sound itself for percussion), or null when the project does not use the DPC+ sound chip.
export const dpcPlusFor = (soundEffect, midi) => {
  const config = dpcPlusPreviewActive();
  if (!config) return null;
  const sound = asDpcPlusSound(soundEffect, config);
  const pitched = Number.isFinite(midi) && !soundEffect.isPercussion;
  return {sound, frequency: pitched ? frequencyForMidi(midi) : Number(sound.dpcFrequency) || 0};
};

// Under DPC+ the chip plays channel 0 and the TIA plays channel 1.
export const channelUsesTia = (channel) => !!dpcPlusPreviewActive() && Number(channel) === 1;
