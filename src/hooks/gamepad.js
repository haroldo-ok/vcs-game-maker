'use strict';

import {ref} from '@vue/composition-api';

import {safeWithGopher2600} from './emulator';
import {JOYSTICK_CONTROLS, KEYPAD_CONTROLS, useKeyMapping} from './key-mapping';

// Physical gamepads drive the preview's joysticks: the first connected pad
// plays the left port (Player 1), the second the right port (Player 2).
// The emulator only listens for keyboard events (tools/gopher2600-wasm's
// keydown/keyup handlers), so a pad's presses are turned into the same
// KeyboardEvents for whatever key the Input Mapping dialog has bound to that
// control - which keeps every binding, and keypad-vs-joystick handling, in
// one place instead of a second input path in the WASM.
//
// A pad input is a string: "b<n>" for button n, "a<n>-"/"a<n>+" for axis n
// pushed past AXIS_THRESHOLD in the negative/positive direction.
const STORAGE_KEY = 'vcs-game-maker.gamepadMapping';
const AXIS_THRESHOLD = 0.5;
// Capturing needs a firmer push so a resting stick's drift is never taken as a choice.
const CAPTURE_AXIS_THRESHOLD = 0.7;

// Everything one pad can be bound to besides the keypad: the joystick controls and the
// console's Select and Reset switches. Either pad can press them.
export const GAMEPAD_CONTROLS = [...JOYSTICK_CONTROLS, 'select', 'reset'];

// Each control takes a list of inputs, any of which triggers it: the D-Pad and
// the left stick both steer, and every face button (A, B, X, Y) fires. Everything is
// per pad (index 0 is Player 1's pad).
const DEFAULT_JOYSTICK = {
  up: ['b12', 'a1-'],
  down: ['b13', 'a1+'],
  left: ['b14', 'a0-'],
  right: ['b15', 'a0+'],
  fire: ['b0', 'b1', 'b2', 'b3'],
  select: ['b8'],
  reset: ['b9'],
};
// A pad has no obvious keypad layout, so the keypad starts unbound.
const DEFAULT_KEYPAD = Object.fromEntries(KEYPAD_CONTROLS.map((control) => [control, []]));
export const DEFAULT_GAMEPAD_MAPPING = {
  joystick: [DEFAULT_JOYSTICK, DEFAULT_JOYSTICK],
  keypad: [DEFAULT_KEYPAD, DEFAULT_KEYPAD],
};

const clone = (value) => JSON.parse(JSON.stringify(value));

const load = () => {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (err) {
    stored = null;
  }
  const merged = clone(DEFAULT_GAMEPAD_MAPPING);
  [0, 1].forEach((portIndex) => {
    GAMEPAD_CONTROLS.forEach((control) => {
      // Before each player had a mapping, the joystick controls (and then Select and
      // Reset) were stored at the top level and shared by both.
      const saved = (stored && stored.joystick && stored.joystick[portIndex] || {})[control] ||
        (stored && stored[control]);
      if (Array.isArray(saved)) merged.joystick[portIndex][control] = saved;
    });
  });
  [0, 1].forEach((portIndex) => {
    KEYPAD_CONTROLS.forEach((control) => {
      const saved = stored && stored.keypad && stored.keypad[portIndex] && stored.keypad[portIndex][control];
      if (Array.isArray(saved)) merged.keypad[portIndex][control] = saved;
    });
  });
  return merged;
};

const mapping = ref(load());

/**
 * The gamepad mapping ({joystick: [player 1, player 2], keypad: [player 1, player 2]}, each
 * control a list of inputs), reactive and persisted to localStorage.
 * @return {*} Ref to the current mapping.
 */
export const useGamepadMapping = () => mapping;

const persist = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping.value));

/**
 * Binds one control to a single pad input, replacing whatever it had and
 * clearing that input from every other control it could clash with (the same
 * pad's joystick, Select, Reset and keypad controls).
 * @param {number} portIndex 0 (Player 1's pad) or 1 (Player 2's pad).
 * @param {string} control One of GAMEPAD_CONTROLS or KEYPAD_CONTROLS.
 * @param {string} input A pad input string, e.g. "b0" or "a1-".
 */
export const setGamepadBinding = (portIndex, control, input) => {
  const next = clone(mapping.value);
  const without = (list) => list.filter((existing) => existing !== input);
  GAMEPAD_CONTROLS.forEach((c) => {
    next.joystick[portIndex][c] = without(next.joystick[portIndex][c]);
  });
  KEYPAD_CONTROLS.forEach((c) => {
    next.keypad[portIndex][c] = without(next.keypad[portIndex][c]);
  });
  if (KEYPAD_CONTROLS.includes(control)) {
    next.keypad[portIndex][control] = [input];
  } else {
    next.joystick[portIndex][control] = [input];
  }
  mapping.value = next;
  persist();
};

/** Restores the default pad mapping. */
export const resetGamepadMapping = () => {
  mapping.value = clone(DEFAULT_GAMEPAD_MAPPING);
  persist();
};

const BUTTON_NAMES = {
  b0: 'A', b1: 'B', b2: 'X', b3: 'Y', b4: 'LB', b5: 'RB', b6: 'LT', b7: 'RT',
  b8: 'Back', b9: 'Start', b10: 'L Stick', b11: 'R Stick',
  b12: 'D-Pad Up', b13: 'D-Pad Down', b14: 'D-Pad Left', b15: 'D-Pad Right',
};
const AXIS_NAMES = {
  'a0-': 'Stick Left', 'a0+': 'Stick Right', 'a1-': 'Stick Up', 'a1+': 'Stick Down',
  'a2-': 'R Stick Left', 'a2+': 'R Stick Right', 'a3-': 'R Stick Up', 'a3+': 'R Stick Down',
};

// Compact names for the small keypad buttons.
const SHORT_NAMES = {
  'b10': 'LS', 'b11': 'RS', 'b12': 'D↑', 'b13': 'D↓', 'b14': 'D←', 'b15': 'D→',
  'a0-': 'LS←', 'a0+': 'LS→', 'a1-': 'LS↑', 'a1+': 'LS↓',
  'a2-': 'RS←', 'a2+': 'RS→', 'a3-': 'RS↑', 'a3+': 'RS↓',
};

/**
 * Friendly label for a pad input string.
 * @param {string} input e.g. "b0" or "a1-".
 * @param {boolean} [short] Compact form, e.g. "D↑" instead of "D-Pad Up".
 * @return {string} e.g. "A" or "Stick Up".
 */
export const labelForGamepadInput = (input, short) =>
  (short && SHORT_NAMES[input]) || BUTTON_NAMES[input] || AXIS_NAMES[input] || input;

const connectedPads = () =>
  (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter((pad) => pad && pad.connected);

const isActive = (pad, input) => {
  if (input[0] === 'b') {
    const button = pad.buttons[Number(input.slice(1))];
    return !!button && button.pressed;
  }
  const value = pad.axes[Number(input.slice(1, -1))] || 0;
  return input.endsWith('-') ? value < -AXIS_THRESHOLD : value > AXIS_THRESHOLD;
};

/**
 * Waits for the next button press or firm stick push on a connected pad.
 * Inputs already held when this starts are ignored until released.
 * @param {function(string): void} onInput Called once with the pad input string.
 * @param {number} [padIndex] Which connected pad (0 first, 1 second) to listen to; any pad if omitted.
 * @return {function(): void} Cancels the wait.
 */
export const captureGamepadInput = (onInput, padIndex) => {
  const seen = new Set();
  let frame = null;
  const find = (pad) => {
    for (let i = 0; i < pad.buttons.length; i++) {
      if (pad.buttons[i].pressed) return `b${i}`;
    }
    for (let i = 0; i < pad.axes.length; i++) {
      if (pad.axes[i] < -CAPTURE_AXIS_THRESHOLD) return `a${i}-`;
      if (pad.axes[i] > CAPTURE_AXIS_THRESHOLD) return `a${i}+`;
    }
    return null;
  };
  const poll = () => {
    const pads = connectedPads();
    for (const pad of padIndex === undefined ? pads : pads.slice(padIndex, padIndex + 1)) {
      const input = find(pad);
      if (input === null) {
        seen.add(pad.index);
      } else if (seen.has(pad.index)) {
        onInput(input);
        return;
      }
    }
    frame = window.requestAnimationFrame(poll);
  };
  frame = window.requestAnimationFrame(poll);
  return () => window.cancelAnimationFrame(frame);
};

/**
 * Starts polling connected gamepads and feeding them to the emulator.
 * @return {function(): void} Stops polling and releases anything held.
 */
export const startGamepadInput = () => {
  const keyMapping = useKeyMapping();
  // Per port, which controls this module is currently holding down.
  const held = [{}, {}];
  let selectHeld = false;
  let resetHeld = false;
  let frame = null;

  // A keypad control presses the keyboard key bound to it, same as a joystick
  // control; the emulator ignores it unless that port is in keypad mode.
  const send = (portIndex, control, down) => {
    const code = (keyMapping.value.joystick[portIndex][control] || keyMapping.value.keypad[portIndex][control]);
    if (!code) return;
    document.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code, bubbles: true, cancelable: true}));
  };

  const setControl = (portIndex, control, down) => {
    if (!!held[portIndex][control] === down) return;
    held[portIndex][control] = down;
    send(portIndex, control, down);
  };

  const setSelect = (down) => {
    if (selectHeld === down) return;
    selectHeld = down;
    safeWithGopher2600((gopher2600) => (down ? gopher2600.pressSelect() : gopher2600.releaseSelect()));
  };

  const setReset = (down) => {
    if (resetHeld === down) return;
    resetHeld = down;
    safeWithGopher2600((gopher2600) => (down ? gopher2600.pressReset() : gopher2600.releaseReset()));
  };

  const poll = () => {
    const pads = connectedPads();
    [0, 1].forEach((portIndex) => {
      const pad = pads[portIndex];
      JOYSTICK_CONTROLS.forEach((control) => {
        setControl(portIndex, control, !!pad && mapping.value.joystick[portIndex][control].some((input) => isActive(pad, input)));
      });
      KEYPAD_CONTROLS.forEach((control) => {
        setControl(portIndex, control, !!pad && mapping.value.keypad[portIndex][control].some((input) => isActive(pad, input)));
      });
    });
    // Select and Reset from each pad; the console's switch is down while any of them is.
    const switchDown = (control) => [0, 1].some((portIndex) =>
      !!pads[portIndex] && mapping.value.joystick[portIndex][control].some((input) => isActive(pads[portIndex], input)));
    setSelect(switchDown('select'));
    setReset(switchDown('reset'));
    frame = window.requestAnimationFrame(poll);
  };
  frame = window.requestAnimationFrame(poll);

  return () => {
    window.cancelAnimationFrame(frame);
    setSelect(false);
    setReset(false);
    [0, 1].forEach((portIndex) => [...JOYSTICK_CONTROLS, ...KEYPAD_CONTROLS].forEach((control) => setControl(portIndex, control, false)));
  };
};
