import {getAudioContext} from './sound-preview';

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
  source.connect(context.destination);
  playing = source;
  await new Promise((resolve) => {
    source.onended = () => {
      if (playing === source) playing = null;
      resolve();
    };
    source.start();
  });
};
