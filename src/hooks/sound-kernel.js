import {reactive} from '@vue/composition-api';

import {convertSoundsToKernel, KERNEL_NAMES} from '../utils/dpc-sound';

// What the popup in App.vue says after sounds could not be converted to the project's kernel.
export const soundKernelNotice = reactive({open: false, title: '', lines: []});

// Names already reported, so a sound that stays unconvertible is not reported again on every change.
let reported = new Set();

// Makes the project's sounds (the Sound tab's presets, which the Music tab's instruments are too) match its kernel:
// Standard sounds become DPC+ sounds under the DPC+ kernel, and back again under the Standard kernel. A DPC+ sound
// with a waveform the Standard kernel cannot make stays as it is and the user is told.
export const syncSoundsToKernel = (soundEffectsStorage, config) => {
  const stored = soundEffectsStorage.value;
  if (!stored || !Array.isArray(stored.soundEffects)) return;
  const kernel = (config && config.kernel) || 'standard';
  const soundEffects = JSON.parse(JSON.stringify(stored.soundEffects));
  const failed = convertSoundsToKernel(soundEffects, kernel, config);
  // Only a change is written back (a sound that cannot be converted stays as it is, and writing it again would only
  // set this off once more).
  if (JSON.stringify(soundEffects) !== JSON.stringify(stored.soundEffects)) {
    soundEffectsStorage.value = {...stored, soundEffects};
  }
  const approximated = failed.approximated || [];
  const fresh = failed.filter(({name}) => !reported.has(name));
  reported = new Set(failed.map(({name}) => name));
  if (approximated.length && !fresh.length) {
    soundKernelNotice.title = 'Some sounds were changed to the closest Standard sound';
    soundKernelNotice.lines = approximated.map(({name, note}) => `${name}: ${note}.`);
    soundKernelNotice.open = true;
  }
  if (fresh.length) {
    soundKernelNotice.title = `Some sounds can't be converted to ${KERNEL_NAMES[kernel]}`;
    soundKernelNotice.lines = fresh.map(({name, reason}) => `${name}: ${reason}.`);
    soundKernelNotice.open = true;
  }
};
