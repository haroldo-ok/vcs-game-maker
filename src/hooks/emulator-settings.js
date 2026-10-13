'use strict';

import {computed} from '@vue/composition-api';
import {useLocalStorage} from './storage';
import {safeWithGopher2600} from './emulator';

// The preview emulator's settings: which emulator runs, and the 6502.ts emulator's CPU accuracy
// and screen effects. A standing app preference (not part of a project), kept in one localStorage
// key that public/index.html also reads at page load, so the very first frame already uses them.
// Keep the defaults in step with EMULATOR_SETTINGS_DEFAULTS in public/index.html.
export const EMULATOR_SETTINGS_KEY = 'vcs-game-maker.emulatorSettings';

export const EMULATOR_SETTINGS_DEFAULTS = {
  // 'stellerator' (the 6502.ts emulator) or 'gopher2600'.
  backend: 'stellerator',
  // 'cycle' (every bus access modelled) or 'instruction' (about 15% faster).
  cpuAccuracy: 'cycle',
  // 'none', 'composite' or 'svideo': how a TV turns the signal into a picture.
  tvEmulation: 'none',
  // 0 to 1: how long a bright pixel lingers, like CRT phosphor.
  phosphor: 0,
  // 0 to 1: how dark the gaps between scanlines are.
  scanlines: 0,
  gamma: 1,
  // Whether the debug numbers (registers, scanlines, cycles) show over the picture (6502.ts only).
  debugOverlay: false,
  // The names of the variables whose values the debug info shows.
  debugVariables: [],
  // 'none' (sharp pixels), 'bilinear' (smooth) or 'qis' (quasi-integer scaling).
  scalingMode: 'none',
  // The tallest picture, in pixels, that full screen renders when effects are on: 'native' (the
  // display's own resolution) or a height such as '1080'. A lower one is scaled up by the browser.
  fullscreenResolution: 'native',
  // How full screen scales the picture: 'same' as the window, or 'none', 'bilinear' or 'qis'.
  fullscreenScaling: 'qis',
};

export const useEmulatorSettings = () => {
  const raw = useLocalStorage(EMULATOR_SETTINGS_KEY);
  return computed({
    get() {
      try {
        return {...EMULATOR_SETTINGS_DEFAULTS, ...JSON.parse(raw.value)};
      } catch (error) {
        return {...EMULATOR_SETTINGS_DEFAULTS};
      }
    },
    set(settings) {
      raw.value = JSON.stringify(settings);
    },
  });
};

// Saves the settings and tells the running emulator.
export const saveEmulatorSettings = (settings) => {
  const merged = {...EMULATOR_SETTINGS_DEFAULTS, ...settings};
  useEmulatorSettings().value = merged;
  safeWithGopher2600((gopher2600) => {
    if (typeof gopher2600.setEmulatorSettings === 'function') gopher2600.setEmulatorSettings(merged);
  });
};

// What is running right now: 'stellerator' or 'gopher2600', and whether a keypad ROM forced the
// switch to gopher2600.
export const getEmulatorInfo = () =>
  (window.gopher2600 && typeof window.gopher2600.getEmulatorInfo === 'function') ?
    window.gopher2600.getEmulatorInfo() : null;
