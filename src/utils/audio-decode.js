'use strict';

// Reads an audio file the browser can play (WAV, OGG, MP3, FLAC, AAC...) as one channel of samples, for the Sound tab's
// "Import sample".

// FL Studio's sample packs store some drums as an Ogg Vorbis stream inside a WAV (RIFF) wrapper, which the browser does not
// open: the stream is found by its "OggS" start and decoded by itself.
const findOggStream = (bytes) => {
  const limit = Math.min(bytes.length - 4, 4096);
  for (let i = 0; i < limit; i++) {
    if (bytes[i] === 0x4f && bytes[i + 1] === 0x67 && bytes[i + 2] === 0x67 && bytes[i + 3] === 0x53) return i;
  }
  return -1;
};

// Resolves to {samples: Float32Array (the channels averaged), sampleRate, buffer: the decoded AudioBuffer}.
export const decodeAudioFile = async (file) => {
  const bytes = await file.arrayBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error('This browser can not decode audio files');
  const context = new AudioContextClass();
  try {
    let buffer;
    try {
      buffer = await context.decodeAudioData(bytes.slice(0));
    } catch (error) {
      const at = findOggStream(new Uint8Array(bytes));
      if (at < 0) throw new Error(`${file.name} is not an audio file this browser can open`);
      buffer = await context.decodeAudioData(bytes.slice(at));
    }
    const samples = new Float32Array(buffer.length);
    for (let channel = 0; channel < buffer.numberOfChannels; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < samples.length; i++) samples[i] += data[i] / buffer.numberOfChannels;
    }
    return {samples, sampleRate: buffer.sampleRate, buffer};
  } finally {
    context.close();
  }
};

// Plays a decoded buffer once; returns a function that stops it.
let playing = null;
export const playAudioBuffer = (buffer) => {
  stopAudioBuffer();
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  source.onended = () => {
    if (playing && playing.context === context) playing = null;
    context.close();
  };
  source.start();
  playing = {context, source};
};

export const stopAudioBuffer = () => {
  if (!playing) return;
  try {
    playing.source.stop();
  } catch (e) {
    // already stopped
  }
  playing = null;
};
