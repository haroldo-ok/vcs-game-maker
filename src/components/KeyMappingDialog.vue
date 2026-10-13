<template>
  <v-dialog v-model="open" width="640">
    <template v-slot:activator="{ on, attrs }">
      <v-btn
        icon
        small
        class="emulator-flat-icon-btn"
        title="Configure keyboard and gamepad input mapping"
        v-bind="attrs"
        v-on="on"
      >
        <v-icon>mdi-keyboard-outline</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-card-title>Input Mapping</v-card-title>
      <v-card-text class="key-mapping-text">
        <p class="v-messages theme--light v-messages__message">
          Click a keyboard control, then press a new key. Click a gamepad control, then press a
          button or push a stick. Escape cancels. A key already used elsewhere is cleared from its
          old spot when reassigned. Two input devices of the same type can't share one key.
        </p>
        <div class="key-mapping-columns">
          <div v-for="(portName, portIndex) in portLabels" :key="portIndex" class="key-mapping-port">
            <h3>{{ portName }}</h3>

            <div class="key-mapping-pair">
              <div>
                <h4>Joystick</h4>
                <div class="key-mapping-controls">
                  <v-btn
                    v-for="control in joystickControls"
                    :key="'joystick-' + control"
                    small
                    outlined
                    :color="isCapturing('joystick', portIndex, control) ? 'primary' : undefined"
                    @click="startCapture('joystick', portIndex, control)"
                  >
                    {{ joystickControlLabels[control] }}:
                    {{ isCapturing('joystick', portIndex, control) ? 'Press a key…' : labelForCode(mapping.joystick[portIndex][control]) }}
                  </v-btn>
                </div>
              </div>
              <div>
                <h4>Gamepad {{ portIndex + 1 }}</h4>
                <div class="key-mapping-controls">
                  <v-btn
                    v-for="control in joystickControls"
                    :key="'gamepad-' + control"
                    small
                    outlined
                    :color="isCapturingGamepad(portIndex, control) ? 'primary' : undefined"
                    @click="startGamepadCapture(portIndex, control)"
                  >
                    {{ gamepadControlLabels[control] }}:
                    {{ isCapturingGamepad(portIndex, control) ? 'Press a button…' : gamepadLabel(portIndex, control) }}
                  </v-btn>
                  <div class="key-mapping-switch-row">
                    <v-btn
                      v-for="control in switchControls"
                      :key="'gamepad-' + control"
                      small
                      outlined
                      :color="isCapturingGamepad(portIndex, control) ? 'primary' : undefined"
                      @click="startGamepadCapture(portIndex, control)"
                    >
                      {{ gamepadControlLabels[control] }}:
                      {{ isCapturingGamepad(portIndex, control) ? 'Press a button…' : gamepadLabel(portIndex, control) }}
                    </v-btn>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div class="key-mapping-columns">
          <div v-for="(portName, portIndex) in portLabels" :key="'keypad-' + portIndex" class="key-mapping-port">
            <div class="key-mapping-keypad-heading">
              <h4>Keypad</h4>
              <v-btn-toggle v-model="keypadSource" mandatory dense class="key-mapping-keypad-source">
                <v-btn x-small>Keyboard</v-btn>
                <v-btn x-small>Gamepad</v-btn>
              </v-btn-toggle>
            </div>
            <div v-if="keypadSource === 0" class="key-mapping-controls key-mapping-keypad">
              <v-btn
                v-for="control in keypadControls"
                :key="'keypad-' + control"
                small
                outlined
                :color="isCapturing('keypad', portIndex, control) ? 'primary' : undefined"
                @click="startCapture('keypad', portIndex, control)"
              >
                {{ isCapturing('keypad', portIndex, control) ? '…' : labelForCode(mapping.keypad[portIndex][control]) }}
              </v-btn>
            </div>
            <div v-else class="key-mapping-controls key-mapping-keypad">
              <v-btn
                v-for="control in keypadControls"
                :key="'gamepad-keypad-' + control"
                small
                outlined
                :color="isCapturingGamepad(portIndex, control) ? 'primary' : undefined"
                @click="startGamepadCapture(portIndex, control)"
              >
                {{ isCapturingGamepad(portIndex, control) ? '…' : gamepadLabel(portIndex, control, true) }}
              </v-btn>
            </div>
          </div>
        </div>
      </v-card-text>
      <v-card-actions class="key-mapping-actions">
        <v-btn text @click="handleReset">Reset to defaults</v-btn>
        <v-spacer></v-spacer>
        <v-btn text @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
'use strict';

import {
  JOYSTICK_CONTROLS,
  KEYPAD_CONTROLS,
  useKeyMapping,
  setKeyBinding,
  resetKeyMapping,
} from '../hooks/key-mapping';
import {
  captureGamepadInput,
  labelForGamepadInput,
  resetGamepadMapping,
  setGamepadBinding,
  useGamepadMapping,
} from '../hooks/gamepad';

// Friendly labels for KeyboardEvent.code strings - only needs to cover the
// codes an actual keyboard can produce for the controls this dialog binds
// (letters/digits/numpad/arrows/space/modifiers), not every possible code.
const SPECIAL_CODE_LABELS = {
  Space: 'Space',
  ControlLeft: 'L Ctrl',
  ControlRight: 'R Ctrl',
  ShiftLeft: 'L Shift',
  ShiftRight: 'R Shift',
  AltLeft: 'L Alt',
  AltRight: 'R Alt',
  Enter: 'Enter',
  Tab: 'Tab',
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  Semicolon: ';',
  Quote: '\'',
  Comma: ',',
  Period: '.',
  Slash: '/',
  NumpadDecimal: 'Num Dec',
};

const labelForCode = (code) => {
  if (!code) return '—';
  if (SPECIAL_CODE_LABELS[code]) return SPECIAL_CODE_LABELS[code];
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num ' + code.slice(6);
  if (code.startsWith('Arrow')) return code.slice(5);
  return code;
};

export default {
  name: 'KeyMappingDialog',
  data() {
    return {
      open: false,
      portLabels: ['Player 1', 'Player 2'],
      joystickControls: JOYSTICK_CONTROLS,
      keypadControls: KEYPAD_CONTROLS,
      joystickControlLabels: {up: 'Up', down: 'Down', left: 'Left', right: 'Right', fire: 'Fire'},
      capturing: null, // {kind, portIndex, control}
      keydownListener: null,
      // Select and Reset share one row under the other gamepad controls.
      switchControls: ['select', 'reset'],
      gamepadControlLabels: {
        up: 'Up', down: 'Down', left: 'Left', right: 'Right', fire: 'Fire', select: 'Select', reset: 'Reset',
      },
      // Which set of keypad buttons is shown (0 keyboard, 1 gamepad); both always work.
      keypadSource: 0,
      capturingGamepad: null, // {portIndex, control}
      cancelGamepadCapture: null,
    };
  },
  computed: {
    mapping() {
      return useKeyMapping().value;
    },
    gamepadMapping() {
      return useGamepadMapping().value;
    },
  },
  watch: {
    open(isOpen) {
      if (!isOpen) this.stopCapture();
    },
  },
  beforeDestroy() {
    this.stopCapture();
  },
  methods: {
    labelForCode,
    isCapturing(kind, portIndex, control) {
      return !!this.capturing && this.capturing.kind === kind &&
        this.capturing.portIndex === portIndex && this.capturing.control === control;
    },
    startCapture(kind, portIndex, control) {
      this.stopCapture();
      this.capturing = {kind, portIndex, control};
      // Capturing phase + preventDefault so the key that's being bound
      // (e.g. Space, an arrow key) doesn't also trigger its default
      // browser behavior (scrolling, etc.) on the very keypress that binds
      // it.
      this.keydownListener = (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (event.code === 'Escape') {
          this.stopCapture();
          return;
        }
        setKeyBinding(kind, portIndex, control, event.code);
        this.stopCapture();
      };
      document.addEventListener('keydown', this.keydownListener, true);
    },
    gamepadLabel(portIndex, control, short) {
      let inputs;
      if (KEYPAD_CONTROLS.includes(control)) {
        inputs = this.gamepadMapping.keypad[portIndex][control];
      } else {
        inputs = this.gamepadMapping.joystick[portIndex][control];
      }
      return inputs.map((input) => labelForGamepadInput(input, short)).join(' / ') || '—';
    },
    isCapturingGamepad(portIndex, control) {
      return !!this.capturingGamepad && this.capturingGamepad.portIndex === portIndex &&
        this.capturingGamepad.control === control;
    },
    startGamepadCapture(portIndex, control) {
      this.stopCapture();
      this.capturingGamepad = {portIndex, control};
      // Each player's controls listen to that player's pad.
      this.cancelGamepadCapture = captureGamepadInput((input) => {
        setGamepadBinding(portIndex, control, input);
        this.stopCapture();
      }, portIndex);
    },
    stopCapture() {
      if (this.cancelGamepadCapture) {
        this.cancelGamepadCapture();
        this.cancelGamepadCapture = null;
      }
      this.capturingGamepad = null;
      if (this.keydownListener) {
        document.removeEventListener('keydown', this.keydownListener, true);
        this.keydownListener = null;
      }
      this.capturing = null;
    },
    handleReset() {
      this.stopCapture();
      resetKeyMapping();
      resetGamepadMapping();
    },
  },
};
</script>

<style scoped>
.key-mapping-columns {
  display: flex;
  gap: 24px;
  flex-wrap: wrap;
}

.key-mapping-port {
  flex: 1 1 260px;
  min-width: 260px;
}

/* Tight vertical spacing so the whole dialog fits a 1080p window without
   scrolling. */
.key-mapping-port h3 {
  margin-bottom: 0;
}

.key-mapping-port h4 {
  margin: 2px 0;
}

.key-mapping-controls {
  /* One control per row (not flex-wrap) so this always renders as exactly
     5 rows (Up/Down/Left/Right/Fire), regardless of how wide any one
     port's bound-key labels happen to render - Player 1 and Player 2
     often bind different-length key names (e.g. "ArrowUp" vs "KeyW"), and
     flex-wrap let that push a control onto a 6th row on one side but not
     the other, leaving the Keypad heading/grid below it at a different
     height between the two columns instead of lined up. */
  display: grid;
  grid-template-columns: 1fr;
  gap: 3px;
  margin-bottom: 6px;
}

.key-mapping-text {
  padding-bottom: 0 !important;
}

.key-mapping-actions {
  padding-top: 6px !important;
}

.key-mapping-switch-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3px;
}

.key-mapping-keypad-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.key-mapping-keypad {
  /* A real Keypad Controller is 3 columns x 4 rows (1,2,3 / 4,5,6 / 7,8,9 /
     star,0,pound) - grid, not flex-wrap, so this always keeps exactly 3 per
     row regardless of how wide any individual button's bound-key label
     happens to render (flex-wrap let a 4th narrow button ride up onto a
     row when the first 3 were narrow enough to leave room). */
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

/* The flat-icon look (transparent background, icon fading from faint grey to
   near-black on hover and flashing blue on press) is shared with the
   screenshot button beside this one, so it lives in App.vue's unscoped
   .emulator-flat-icon-btn rules. Only this button's placement is here. */
.emulator-flat-icon-btn {
  /* Pushes this button to the far right of .emulator-toolbar-row, flush
     with the emulator window's right edge (#gopher2600-target-container
     shares that same row's width - see App.vue's template). Auto
     margins still absorb a flex row's free space even when the item's
     flex-grow is 0 - which it is here, forced by App.vue's
     ".emulator-drawer-inner .v-btn { flex: 0 0 auto !important }" (for an
     unrelated reason - see that rule's comment - that rules out
     growing "Refresh emulator" itself to push this button over instead). */
  margin-left: auto !important;
  margin-right: 4px !important;
}

</style>
