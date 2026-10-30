import {getAudioContext} from './sound-preview';
import {useDimSoundFxPercentStorage, useDimSoundFxStorage} from '../hooks/project';
import {DEFAULT_DIM_PERCENT} from '../generators/bbasic/soundfx';

// Plays a phrase of the AtariVox's speech chip for the editor's play buttons: the SpeakJet bytes go to a worker that runs the chip
// (public/js/speakjet-worker.js) and the sound it makes is played here.

const SAMPLE_RATE = 8192;

let worker = null;
let counter = 0;
const pending = new Map();
let playing = null;

const getWorker = () => {
  if (!worker) {
    worker = new Worker('js/speakjet-worker.js');
    worker.onmessage = (event) => {
      const resolve = pending.get(event.data.id);
      pending.delete(event.data.id);
      if (resolve) resolve(new Float32Array(event.data.samples));
    };
  }
  return worker;
};

// The samples of a phrase (a Float32Array), from the bytes the SpeakJet takes.
export const renderSpeech = (bytes) => new Promise((resolve) => {
  const id = ++counter;
  pending.set(id, resolve);
  getWorker().postMessage({id, bytes: Uint8Array.from(bytes)});
});

export const stopSpeech = () => {
  if (playing) {
    try {
      playing.stop();
    } catch (e) {
      // (already ended)
    }
    playing = null;
  }
};

// How long a phrase takes to speak: the length of the sound the chip makes (worked out once for each phrase, then kept). The hint says
// it in seconds and frames, and how long the bytes take to send (a byte a frame), which is what "is still being sent" waits for.
const durations = new Map();
const durationKey = (bytes) => Array.from(bytes).join(',');
let onDuration = null;
export const speechSeconds = async (bytes) => {
  const key = durationKey(bytes);
  if (!durations.has(key)) {
    const samples = bytes.length ? await renderSpeech(bytes) : new Float32Array(0);
    durations.set(key, samples.length / SAMPLE_RATE);
    if (onDuration) onDuration();
  }
  return durations.get(key);
};
// Called when a duration has been worked out (so that what shows it can show it).
export const setSpeechDurationListener = (listener) => {
  onDuration = listener;
};
// The hint for a phrase, or null while it is being worked out (this starts that) or when there is nothing to say.
export const speechTimeHint = (bytes) => {
  if (!bytes || !bytes.length) return null;
  const key = durationKey(bytes);
  if (!durations.has(key)) {
    speechSeconds(bytes);
    return null;
  }
  const seconds = durations.get(key);
  if (!seconds) return null;
  return `Takes about ${seconds.toFixed(1)} seconds (${Math.round(seconds * 60)} frames) to speak; its ${bytes.length} bytes take ${bytes.length} frames to send.`;
};

// The sound of a phrase kept to be played at once at a time of the page's choosing (the Music tab's preview of an AtariVox instrument): worked
// out the first time it is asked for, so the first play may miss it.
const sampleCache = new Map();
const warming = new Set();
export const warmSpeech = (bytes) => {
  const key = durationKey(bytes);
  if (!bytes.length || sampleCache.has(key) || warming.has(key)) return;
  warming.add(key);
  renderSpeech(bytes).then((samples) => {
    sampleCache.set(key, samples);
    warming.delete(key);
  });
};
// Starts a phrase at the time (the audio context's clock) into the destination, DIM making it quieter; the source, or null when its sound is
// not ready yet (this starts working it out).
export const playSpeechAt = (context, bytes, when, destination, extraGain = 1) => {
  const samples = sampleCache.get(durationKey(bytes));
  if (!samples) {
    warmSpeech(bytes);
    return null;
  }
  if (!samples.length) return null;
  const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  const gain = context.createGain();
  gain.gain.value = extraGain * (useDimSoundFxStorage().value ?
    Math.max(0, Math.min(100, Number(useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value) || 0)) / 100 : 1);
  source.connect(gain);
  gain.connect(destination || context.destination);
  source.start(when);
  return source;
};

// Plays a phrase from its bytes; resolves when it has ended (or at once, if there is nothing to hear).
export const speakBytes = async (bytes) => {
  stopSpeech();
  if (!bytes.length) return;
  const samples = await renderSpeech(bytes);
  if (!samples.length) return;
  const context = getAudioContext();
  const buffer = context.createBuffer(1, samples.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(samples);
  const source = context.createBufferSource();
  source.buffer = buffer;
  // DIM (the Sound tab's) makes the AtariVox quieter too.
  const gain = context.createGain();
  gain.gain.value = useDimSoundFxStorage().value ? Math.max(0, Math.min(100, Number(useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value) || 0)) / 100 : 1;
  source.connect(gain);
  gain.connect(context.destination);
  playing = source;
  await new Promise((resolve) => {
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    source.start();
  });
};
