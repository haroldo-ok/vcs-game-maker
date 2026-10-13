'use strict';

import {ref} from '@vue/composition-api';

import {withGopher2600, safeWithGopher2600} from './emulator';

// Keyboard->controller bindings for the browser preview - a page-level
// (not per-project) preference, same reasoning as hooks/zoom.js's
// comment on keeping view/input preferences out of project storage.
const STORAGE_KEY = 'vcs-game-maker.keyMapping';

// WASD + left-Ctrl for Player 1's joystick, arrow keys + right Ctrl for Player 2's,
// plus defaults for Keypad mode modeled on this project's earlier
// Javatari-based preview's equivalent defaults (UserPreferences.js's
// keypadKeys): Player 1's Keypad defaults to 1,2,3/Q,W,E/A,S,D/Z,X,C - this
// overlaps Player 1's WASD joystick defaults, which is fine, since a port is
// only ever actually Joystick OR Keypad at a time (see main.go's
// keypadModeByPort/findKeyBinding) - and Player 2's Keypad defaults to the
// numeric keypad.
export const DEFAULT_KEY_MAPPING = {
  joystick: [
    {up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', fire: 'ControlLeft'},
    {up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', fire: 'ControlRight'},
  ],
  // k1-k9 read left-to-right, top-to-bottom (1,2,3/4,5,6/7,8,9); k10-k12 are
  // the bottom row (*, 0, #) - the same reading order
  // tools/gopher2600-wasm/vendor/.../controllers/keypad.go's HandleEvent
  // expects (see KEYPAD_CONTROL_CHARS below).
  keypad: [
    {
      k1: 'Digit1', k2: 'Digit2', k3: 'Digit3',
      k4: 'KeyQ', k5: 'KeyW', k6: 'KeyE',
      k7: 'KeyA', k8: 'KeyS', k9: 'KeyD',
      k10: 'KeyZ', k11: 'KeyX', k12: 'KeyC',
    },
    {
      // Numpad row order flipped relative to k1-k9's reading order - a
      // real numpad's physical rows run 7,8,9/4,5,6/1,2,3 top-to-bottom
      // (the opposite of a phone/Keypad Controller's 1,2,3/4,5,6/7,8,9), so
      // this matches each keypad digit to the numpad key actually above/
      // below it rather than reusing the numpad's digit for each.
      k1: 'Numpad7', k2: 'Numpad8', k3: 'Numpad9',
      k4: 'Numpad4', k5: 'Numpad5', k6: 'Numpad6',
      k7: 'Numpad1', k8: 'Numpad2', k9: 'Numpad3',
      k10: 'Numpad0', k11: 'NumpadDecimal', k12: 'NumpadEnter',
    },
  ],
};

// Which keypad rune each kN control represents - controllers.Keypad's
// HandleEvent only accepts these 12 exact runes.
const KEYPAD_CONTROL_CHARS = {
  k1: '1', k2: '2', k3: '3', k4: '4', k5: '5', k6: '6',
  k7: '7', k8: '8', k9: '9', k10: '*', k11: '0', k12: '#',
};

export const KEYPAD_CONTROLS = Object.keys(KEYPAD_CONTROL_CHARS);
export const JOYSTICK_CONTROLS = ['up', 'down', 'left', 'right', 'fire'];
export const PORTS = ['left', 'right'];

const clone = (value) => JSON.parse(JSON.stringify(value));

// Merges stored overrides onto the defaults control-by-control (rather than
// replacing a whole port's object wholesale) so a mapping saved before some
// future control existed still picks up that control's default instead of
// leaving it unbound.
const load = () => {
  let stored = null;
  try {
    stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
  } catch (err) {
    stored = null;
  }
  const merged = clone(DEFAULT_KEY_MAPPING);
  PORTS.forEach((port, i) => {
    Object.assign(merged.joystick[i], stored?.joystick?.[i]);
    Object.assign(merged.keypad[i], stored?.keypad?.[i]);
  });
  return merged;
};

const mapping = ref(load());

/**
 * The current keyboard->controller mapping ({joystick: [port0, port1],
 * keypad: [port0, port1]}), reactive and persisted to localStorage.
 * @return {*} Ref to the current mapping.
 */
export const useKeyMapping = () => mapping;

// Flattens the friendly per-control shape above into the {code, port, kind,
// control} array tools/gopher2600-wasm's setKeyMapping (main.go) expects.
const flatten = (value) => {
  const flat = [];
  PORTS.forEach((port, i) => {
    JOYSTICK_CONTROLS.forEach((control) => {
      const code = value.joystick[i][control];
      if (code) flat.push({code, port, kind: 'joystick', control});
    });
    KEYPAD_CONTROLS.forEach((k) => {
      const code = value.keypad[i][k];
      if (code) flat.push({code, port, kind: 'keypad', control: KEYPAD_CONTROL_CHARS[k]});
    });
  });
  return flat;
};

const persistAndPush = () => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(mapping.value));
  safeWithGopher2600((gopher2600) => gopher2600.setKeyMapping(flatten(mapping.value)));
};

/**
 * Binds one control to a new key, clearing that key from every other
 * binding of the SAME kind first (two joystick controls, or two keypad
 * controls, can't share one physical key - but a joystick control and a
 * keypad control can, since a given port is only ever actually one or the
 * other at a time - see main.go's keypadModeByPort/findKeyBinding. The
 * default mapping itself relies on this: Player 1's Keypad defaults reuse
 * Player 2's WASD joystick defaults).
 * @param {string} kind 'joystick' or 'keypad'.
 * @param {number} portIndex 0 (left/Player 1) or 1 (right/Player 2).
 * @param {string} control Control name - one of JOYSTICK_CONTROLS or
 *   KEYPAD_CONTROLS depending on kind.
 * @param {string} code KeyboardEvent.code to bind, e.g. "ArrowUp".
 */
export const setKeyBinding = (kind, portIndex, control, code) => {
  const next = clone(mapping.value);
  const controls = kind === 'joystick' ? JOYSTICK_CONTROLS : KEYPAD_CONTROLS;
  [0, 1].forEach((i) => {
    controls.forEach((c) => {
      if (next[kind][i][c] === code) delete next[kind][i][c];
    });
  });
  next[kind][portIndex][control] = code;
  mapping.value = next;
  persistAndPush();
};

/** Restores every binding to DEFAULT_KEY_MAPPING. */
export const resetKeyMapping = () => {
  mapping.value = clone(DEFAULT_KEY_MAPPING);
  persistAndPush();
};

// Pushed on every fresh window.gopher2600 instance, not just at page load -
// see hooks/emulator.js's comment on 'gopher2600-ready' firing again
// after an automatic crash-recovery reinstantiation, which boots with an
// empty keyMapping (tools/gopher2600-wasm/main.go's console struct has
// no defaults - this module is the single source of truth for
// what the defaults actually are).
window.addEventListener('gopher2600-ready', () => {
  withGopher2600((gopher2600) => gopher2600.setKeyMapping(flatten(mapping.value)));
});
// The event above alone left the mapping unapplied until the very first
// setKeyBinding/resetKeyMapping call (i.e. actually opening the Keyboard
// Mapping dialog and editing something) - confirmed as a real reported bug.
// This module is only reached via a static import chain starting at
// KeyMappingDialog.vue (App.vue -> that component -> here), which resolves
// at the same time as every other top-level import when the app's bundle
// first evaluates - genuinely no guarantee that's BEFORE
// public/index.html's gopher2600-wasm loader fires 'gopher2600-ready'
// for the very first time; a JS event listener that starts listening after
// an event already fired simply never sees it, unlike withGopher2600's
// retry loop below, which instead POLLS for window.gopher2600 - already
// existing or not yet - and only gives up after 40 tries. Calling that
// directly here, once, covers the case the event's timing could miss;
// the event listener above still separately covers every LATER
// reinstantiation after a crash.
withGopher2600((gopher2600) => gopher2600.setKeyMapping(flatten(mapping.value)));
