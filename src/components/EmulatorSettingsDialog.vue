<template>
  <v-dialog v-model="open" width="520">
    <template v-slot:activator="{ on, attrs }">
      <v-btn
        icon
        small
        class="emulator-flat-icon-btn"
        title="Emulator Settings"
        v-bind="attrs"
        v-on="on"
      >
        <v-icon>mdi-cog-outline</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-card-title>Emulator Settings</v-card-title>
      <v-card-text class="emulator-settings-text">
        <v-select
          :value="settings.backend"
          :items="backendItems"
          label="Emulator"
          :hint="backendNote"
          persistent-hint
          @change="(value) => update({backend: value})"
        />
        <v-checkbox
          class="emulator-vox-switch"
          dense
          :input-value="settings.atariVox"
          label="AtariVox (speech) in the Player 2 port"
          hint="For ROMs that speak through an AtariVox, in either emulator; the Player 2 joystick is replaced. Switched on for you when the project has Speech blocks."
          persistent-hint
          @change="(value) => update({atariVox: !!value})"
        />

        <v-select
          :value="settings.tvEmulation"
          :items="tvItems"
          label="TV signal"
          :disabled="!stellerator"
          @change="(value) => update({tvEmulation: value})"
        />
        <v-slider
          :value="Math.round(settings.phosphor * 100)"
          label="Phosphor glow"
          min="0"
          max="100"
          step="5"
          thumb-label
          :disabled="!stellerator"
          hide-details
          class="emulator-settings-slider"
          @change="(value) => update({phosphor: value / 100})"
        >
          <template v-slot:append>{{ Math.round(settings.phosphor * 100) }}%</template>
        </v-slider>
        <v-slider
          :value="Math.round(settings.scanlines * 100)"
          label="Scanlines"
          min="0"
          max="100"
          step="5"
          thumb-label
          :disabled="!stellerator"
          hide-details
          class="emulator-settings-slider"
          @change="(value) => update({scanlines: value / 100})"
        >
          <template v-slot:append>{{ Math.round(settings.scanlines * 100) }}%</template>
        </v-slider>
        <v-slider
          :value="settings.gamma"
          label="Gamma"
          min="0.5"
          max="2"
          step="0.05"
          thumb-label
          :disabled="!stellerator"
          hide-details
          class="emulator-settings-slider"
          @change="(value) => update({gamma: value})"
        >
          <template v-slot:append>{{ settings.gamma.toFixed(2) }}</template>
        </v-slider>
        <v-select
          :value="settings.scalingMode"
          :items="scalingItems"
          label="Scaling"
          hint="Effects are drawn on the GPU and cost nothing while all are off. They apply to the 6502.ts emulator only."
          persistent-hint
          :disabled="!stellerator"
          @change="(value) => update({scalingMode: value})"
        />
        <v-select
          :value="settings.fullscreenResolution"
          :items="fullscreenResolutionItems"
          label="Full screen resolution"
          hint="The tallest picture full screen draws. A lower one is lighter on the GPU and is scaled up to the display."
          persistent-hint
          :disabled="!stellerator"
          @change="(value) => update({fullscreenResolution: value})"
        />
        <v-select
          :value="settings.fullscreenScaling"
          :items="fullscreenScalingItems"
          label="Full screen scaling"
          hint="How the picture is scaled to the display in full screen."
          persistent-hint
          :disabled="!stellerator"
          @change="(value) => update({fullscreenScaling: value})"
        />

        <v-select
          :value="settings.cpuAccuracy"
          :items="accuracyItems"
          label="CPU accuracy"
          hint="Changing the accuracy restarts the running ROM. Cycle exact models every bus access; Instruction is about 15% faster."
          persistent-hint
          :disabled="!stellerator"
          @change="(value) => update({cpuAccuracy: value})"
        />
      </v-card-text>
      <v-card-actions class="emulator-settings-actions">
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
  EMULATOR_SETTINGS_DEFAULTS,
  getEmulatorInfo,
  saveEmulatorSettings,
  useEmulatorSettings,
} from '../hooks/emulator-settings';

export default {
  name: 'EmulatorSettingsDialog',
  data() {
    return {
      open: false,
      // What is running (a keypad ROM runs on gopher2600 whatever is chosen); read when the
      // dialog opens and after each change.
      info: null,
      backendItems: [
        {text: '6502.ts (fast, screen effects)', value: 'stellerator'},
        {text: 'gopher2600 (cycle-exact WebAssembly)', value: 'gopher2600'},
      ],
      tvItems: [
        {text: 'Off (raw pixels)', value: 'none'},
        {text: 'Composite', value: 'composite'},
        {text: 'S-Video', value: 'svideo'},
      ],
      scalingItems: [
        {text: 'Sharp pixels', value: 'none'},
        {text: 'Smooth', value: 'bilinear'},
        {text: 'Quasi-integer (sharp, even pixels)', value: 'qis'},
      ],
      fullscreenScalingItems: [
        {text: 'Same as the window', value: 'same'},
        {text: 'Sharp pixels', value: 'none'},
        {text: 'Smooth', value: 'bilinear'},
        {text: 'Quasi-integer (sharp, even pixels)', value: 'qis'},
      ],
      fullscreenResolutionItems: [
        {text: 'Native (display resolution)', value: 'native'},
        {text: '2160p (4K)', value: '2160'},
        {text: '1440p', value: '1440'},
        {text: '1080p', value: '1080'},
        {text: '720p', value: '720'},
      ],
      accuracyItems: [
        {text: 'Cycle exact', value: 'cycle'},
        {text: 'Instruction (faster)', value: 'instruction'},
      ],
    };
  },
  computed: {
    settings() {
      return useEmulatorSettings().value;
    },
    // The effects and accuracy belong to 6502.ts.
    stellerator() {
      return this.settings.backend === 'stellerator';
    },
    backendNote() {
      return this.stellerator ?
        '6502.ts is fast and has screen effects and the debug info.' :
        'gopher2600 emulates every clock of the console. It is slower, and has no screen effects.';
    },
  },
  watch: {
    open(isOpen) {
      if (isOpen) this.refreshInfo();
    },
  },
  methods: {
    refreshInfo() {
      this.info = getEmulatorInfo();
    },
    update(change) {
      saveEmulatorSettings({...this.settings, ...change});
      this.refreshInfo();
    },
    handleReset() {
      saveEmulatorSettings({...EMULATOR_SETTINGS_DEFAULTS});
      this.refreshInfo();
    },
  },
};
</script>

<style scoped>
.emulator-settings-text {
  padding-bottom: 8px !important;
}

.emulator-settings-slider {
  margin-top: 16px;
}

/* Right under the Emulator select: the select's hint line already leaves the space, so no extra gap above. */
.emulator-vox-switch {
  margin-top: -2px;
  margin-bottom: 12px;
}

/* The select above the first slider already leaves room for its (empty) hint line, which is
   more than the slider needs, so the slider is pulled up into it; the select below the last
   slider needs a little. */
.v-select + .emulator-settings-slider {
  margin-top: -10px;
}

.emulator-settings-slider + .v-select {
  margin-top: 8px;
}

.emulator-settings-text .v-select + .v-select {
  margin-top: 4px;
}

.emulator-settings-actions {
  padding-top: 6px !important;
}
</style>
