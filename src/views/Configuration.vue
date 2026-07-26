<template>
  <v-card>
    <v-card-title>Options</v-card-title>
    <v-card-text>
      <v-select
        v-model="configurationState.romSize"
        @change="handleChangeConfiguration"
        :items="romSizeOptions"
        label="ROM size"
      />
      <v-switch
        v-model="configurationState.showScore"
        @change="handleChangeConfiguration"
        label="Show score at bottom of screen (noscore)"
        hint="Turning this off skips the score display code entirely, freeing up ROM space."
        persistent-hint
        class="option-switch"
      />
      <v-switch
        v-model="configurationState.showBlankLines"
        @change="handleChangeConfiguration"
        label="Show blank lines between background rows (no_blank_lines)"
        hint="Turning this off packs playfield rows tighter together, but uses missile0's graphics circuitry, so missile0 can no longer be used as a sprite."
        persistent-hint
        class="option-switch"
      />
      <v-switch
        v-model="configurationState.enablePfColors"
        @change="handleChangeConfiguration"
        :disabled="configurationState.enableSuperchip"
        label="Enable per-row playfield colors (pfcolors)"
        hint="Backgrounds can still have row colors set while this is off; they just won't be included in the generated code. Disabled while Superchip RAM is on - see below."
        persistent-hint
        class="option-switch"
      />
      <v-switch
        v-model="configurationState.enableSuperchip"
        @change="handleToggleSuperchip"
        label="Enable Superchip RAM for higher-resolution playfields"
        hint="Adds a Superchip (SC) to the ROM and lets the playfield use more than 11 rows. Requires an 8k or larger ROM (bumped automatically if needed), and horizontal playfield scrolling (left/right) isn't supported once this is on. Per-row playfield colors (pfcolors) don't render correctly with Superchip yet, so they're left out of the generated code while this is on - backgrounds can still have row colors set in the editor for whenever that's fixed. Also moves the app's own bookkeeping variables off letters and into extra Superchip RAM, freeing every letter (a-z) for your own variables instead of just 12."
        persistent-hint
        class="option-switch"
      />
      <v-text-field
        v-model.number="configurationState.pfres"
        @change="handleChangeResolution"
        type="number"
        min="13"
        max="32"
        label="Playfield vertical resolution (pfres)"
        hint="From 13 to 32 rows. Values that don't evenly divide 96 (3, 4, 6, 8, 12, 16, 24, 32) may leave the screen slightly shorter than normal."
        persistent-hint
        class="pfres-field"
      />
    </v-card-text>
    </v-card>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';

import {USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP} from '../generators/bbasic';
import {useBackgroundsStorage, useConfigurationStorage, useErrorStorage} from '../hooks/project';
import {countUsedVariables} from '../hooks/rom';
import {effectiveBackgroundRows, reflowBackgroundsToHeight} from '../blocks/background';

const ROM_SIZE_OPTIONS = ['2k', '4k', '8k', '16k', '32k'];
const MIN_PFRES = 13;
const MAX_PFRES = 32;
// Superchip RAM only works on a bankswitched ROM ("Superchip RAM is only used
// in conjunction with bankswitching" - batari Basic docs); 2k/4k never
// bankswitch, so the compiler silently ignores the SC suffix on those sizes,
// leaving pfres pointed at RAM that was never actually enabled.
const MIN_SUPERCHIP_ROM_SIZE_INDEX = ROM_SIZE_OPTIONS.indexOf('8k');

export default defineComponent({
  setup(props, context) {
    const configurationStorage = useConfigurationStorage();
    const backgroundsStorage = useBackgroundsStorage();

    const configurationState = computed({
      get() {
        // scoreFont is chosen on the Score tab, but is kept here so that
        // changing any other option round-trips it instead of dropping it.
        const DEFAULT_CONFIGURATION = {
          showScore: true,
          showBlankLines: true,
          enablePfColors: true,
          enableSuperchip: false,
          pfres: 24,
          romSize: '4k',
          scoreFont: '',
        };

        try {
          const configuration = configurationStorage.value || structuredClone(DEFAULT_CONFIGURATION);

          return Object.fromEntries(Object.entries(DEFAULT_CONFIGURATION)
              .map(([k, v]) => [k, configuration[k] ?? v]));
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return structuredClone(DEFAULT_CONFIGURATION);
        }
      },

      set(newState) {
        configurationStorage.value = newState;
      },
    });

    // pfcolors and Superchip's higher-resolution playfield don't render
    // correctly together (last row black, and with more than one background
    // the colors come out wrong and the black area returns), so the two
    // options can't both be on.
    const enforceSuperchipPfColorsExclusivity = (state) => {
      if (state.enableSuperchip) {
        state.enablePfColors = false;
      }
      return state;
    };

    const handleChangeConfiguration = () => {
      configurationState.value = enforceSuperchipPfColorsExclusivity(configurationState.value);
    };

    // The playfield's vertical resolution (pfres) is a single setting for the
    // whole ROM - batari Basic has no per-background override - so every
    // background's pixel data has to be reflowed to match whenever it or the
    // Superchip toggle changes, rather than each background choosing its own.
    const handleChangeResolution = () => {
      const state = configurationState.value;
      state.pfres = Math.min(MAX_PFRES, Math.max(MIN_PFRES, Number(state.pfres) || MIN_PFRES));
      if (state.enableSuperchip && ROM_SIZE_OPTIONS.indexOf(state.romSize) < MIN_SUPERCHIP_ROM_SIZE_INDEX) {
        state.romSize = ROM_SIZE_OPTIONS[MIN_SUPERCHIP_ROM_SIZE_INDEX];
      }
      configurationState.value = enforceSuperchipPfColorsExclusivity(state);

      reflowBackgroundsToHeight(backgroundsStorage, effectiveBackgroundRows(state));
    };

    // With Superchip off, the app's own bookkeeping variables have to live on
    // letters, leaving only USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP free for
    // user-created ones (see bbasic.js's SYSTEM_VARIABLES comment) - turning
    // Superchip off is blocked if the project already uses more variables
    // than that, since there'd be nowhere left to put them.
    const handleToggleSuperchip = () => {
      const state = configurationState.value;
      if (!state.enableSuperchip) {
        const usedVariables = countUsedVariables();
        if (usedVariables > USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP.length) {
          state.enableSuperchip = true;
          configurationState.value = state;
          useErrorStorage().value = `Can't disable Superchip RAM: this project uses ${usedVariables} ` +
            `variables, but only ${USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP.length} letters are available ` +
            'without it. Remove some variables first.';
          return;
        }
      }
      handleChangeResolution();
    };

    return {
      configurationState,
      handleChangeConfiguration,
      handleChangeResolution,
      handleToggleSuperchip,
      romSizeOptions: ROM_SIZE_OPTIONS,
    };
  },
  methods: {
  },
});
</script>
<style scoped>
/* Vuetify aligns a switch's hint under the toggle track by default; indent it
   to line up under the label text instead, matching the toggle's own width. */
.option-switch >>> .v-messages {
  margin-left: 46px;
}

/* Reads as a sub-option of the Superchip switch above it, so it's indented to
   line up under that switch's label text rather than its toggle track. */
.pfres-field {
  margin-left: 46px;
  max-width: calc(100% - 46px);
}
</style>
