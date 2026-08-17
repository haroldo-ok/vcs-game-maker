<template>
  <v-card flat class="editor-container">
    <v-card-title>Options</v-card-title>
    <v-card-text>
      <div class="option-section-header" @click="() => toggleSection('rom')">
        <v-btn icon small :title="isSectionCollapsed('rom') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('rom') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">ROM Options</span>
      </div>
      <div v-if="!isSectionCollapsed('rom')" class="option-section-content">
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
          hint="Adds a Superchip (SC) to the ROM and lets the playfield use more than 11 rows. Requires an 8k or larger ROM (bumped automatically if needed), and horizontal playfield scrolling (left/right) isn't supported once this is on. Per-row playfield colors (pfcolors) don't render correctly with Superchip yet, so they're left out of the generated code while this is on - backgrounds can still have row colors set in the editor for whenever that's fixed. Also moves the app's own bookkeeping variables off letters and into extra Superchip RAM, freeing every letter (a-z) for your own variables."
          persistent-hint
          class="option-switch"
        />
        <v-text-field
          v-model.number="configurationState.pfres"
          @change="handleChangeResolution"
          type="number"
          min="1"
          max="32"
          label="Playfield vertical resolution (pfres)"
          hint="Up to 32 rows. Values that don't evenly divide 96 (3, 4, 6, 8, 12, 16, 24, 32) may leave the screen slightly shorter than normal."
          persistent-hint
          class="pfres-field"
        />
      </div>

      <v-divider class="my-2" />
      <div class="option-section-header" @click="() => toggleSection('vcsgm')">
        <v-btn icon small :title="isSectionCollapsed('vcsgm') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('vcsgm') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">VCSGM Options</span>
      </div>
      <div v-if="!isSectionCollapsed('vcsgm')" class="option-section-content">
        <v-switch
          v-model="loadLastProject"
          label="Load last open project on startup"
          hint="When off, the app always starts from the empty project instead of restoring whatever was last saved."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.muteAllAudio"
          @change="handleChangeConfiguration"
          label="Mute all in-game audio"
          hint="Silences every sound effect and channel, overriding whatever any Sound block sets - useful for quick testing without needing to remove sound blocks."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.muteBlocklySounds"
          @change="handleChangeConfiguration"
          label="Mute Blockly sounds"
          hint="Silences the click, delete, and disconnect sounds heard while editing blocks on the Actions tab. Doesn't affect the game itself - see &quot;Mute all in-game audio&quot; above for that."
          persistent-hint
          class="option-switch"
        />
      </div>

      <v-divider class="my-2" />
      <div class="option-section-header" @click="() => toggleSection('kernel')">
        <v-btn icon small :title="isSectionCollapsed('kernel') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('kernel') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">Kernel Optimization (Advanced)</span>
      </div>
      <div v-if="!isSectionCollapsed('kernel')" class="option-section-content">
        <v-switch
          v-model="configurationState.enableOptimizationSpeed"
          @change="handleChangeConfiguration"
          label="Optimize for speed (speed)"
          hint="May increase speed - particularly of multiplication and division - at the cost of code size."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enableInlineRand"
          @change="handleChangeConfiguration"
          :disabled="!romSizeIsBankswitched"
          label="Inline random number calls (inlinerand)"
          hint="Places calls to the random number generator inline with your code instead of as a shared routine, trading a small increase in code size for speed - most useful in a bankswitched game, where a shared routine call would otherwise have to switch banks. Requires a bankswitched ROM size (8k or larger) - see ROM size above."
          persistent-hint
          class="option-switch"
        />
      </div>
    </v-card-text>
    </v-card>
</template>
<script>
import {computed, defineComponent, ref} from '@vue/composition-api';

import {USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP} from '../generators/bbasic';
import {useBackgroundsStorage, useConfigurationStorage, useErrorStorage, useLoadLastProjectStorage} from '../hooks/project';
import {BANK_COUNT_BY_ROMSIZE, countUsedVariables} from '../hooks/rom';
import {effectiveBackgroundRows, reflowBackgroundsToHeight} from '../blocks/background';

const ROM_SIZE_OPTIONS = ['2k', '4k', '8k', '16k', '32k'];
const MIN_PFRES = 1;
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
    // A standing app preference, not part of the project itself (see
    // hooks/project.js's own comment) - kept separate from configurationState
    // below so it survives clearProjectStorage() and can be checked at
    // startup, before deciding whether to call that at all.
    const loadLastProject = useLoadLastProjectStorage();

    // Which sections are collapsed - a Set of section keys, matching the
    // collapse pattern already used by the other tabs' own cards (a plain
    // left-aligned chevron icon button, not Vuetify's own v-expansion-panels,
    // which puts its arrow on the right). Starts empty (everything expanded)
    // so this page looks the same as before collapsing existed. Not
    // persisted - like every other tab's own collapse state, it resets on
    // reload rather than being remembered.
    // 'rom' starts open (the most commonly-tweaked settings); 'vcsgm' and
    // 'kernel' both start closed (less commonly needed).
    const collapsedSections = ref(new Set(['vcsgm', 'kernel']));
    const isSectionCollapsed = (key) => collapsedSections.value.has(key);
    const toggleSection = (key) => {
      const next = new Set(collapsedSections.value);
      if (next.has(key)) next.delete(key); else next.add(key);
      collapsedSections.value = next;
    };

    const configurationState = computed({
      get() {
        // scoreFont is chosen on the Score tab, but is kept here so that
        // changing any other option round-trips it instead of dropping it.
        const DEFAULT_CONFIGURATION = {
          showScore: true,
          showBlankLines: true,
          enablePfColors: false,
          enableSuperchip: false,
          enableOptimizationSpeed: false,
          enableInlineRand: false,
          pfres: 24,
          romSize: '4k',
          scoreFont: '',
          muteAllAudio: false,
          muteBlocklySounds: false,
        };

        try {
          const configuration = configurationStorage.value || structuredClone(DEFAULT_CONFIGURATION);

          // Spread (not a DEFAULT_CONFIGURATION-keys-only rebuild) so fields
          // this page doesn't know about - graphicsBanks/eventBanks, the
          // auto-relocation system's own bank-assignment cache (see
          // hooks/rom.js) - pass through untouched instead of silently
          // vanishing the moment this getter runs.
          return {...DEFAULT_CONFIGURATION, ...configuration};
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return structuredClone(DEFAULT_CONFIGURATION);
        }
      },

      set(newState) {
        // Merged into the EXISTING stored configuration, not a wholesale
        // replacement - newState only ever came from this same getter (see
        // above), so writing it back verbatim would erase graphicsBanks/
        // eventBanks every time any Options control changed, forcing every
        // relocated event/background/animation/music payload to fall back
        // into bank 1 and re-relocate from scratch on the next build. That
        // was silently masking a real, unrelated capacity bug behind what
        // looked like "toggling Superchip fixes it" - the reset just gave
        // the auto-relocation retry loop a fresh start, coincidentally
        // finding a layout that fit.
        configurationStorage.value = {...(configurationStorage.value || {}), ...newState};
      },
    });

    // Whether the selected ROM size actually bankswitches (see
    // BANK_COUNT_BY_ROMSIZE in hooks/rom.js - 2k/4k never do).
    const romSizeIsBankswitched = computed(() =>
      Boolean(BANK_COUNT_BY_ROMSIZE[configurationState.value.romSize]));

    // pfcolors and Superchip's higher-resolution playfield don't render
    // correctly together (last row black, and with more than one background
    // the colors come out wrong and the black area returns), so the two
    // options can't both be on. Inlining random-number calls (see
    // useInlineRand in bbasic.js) only makes sense on a bankswitched ROM
    // size too, so it's forced off whenever the ROM size changes away from
    // one.
    const enforceSuperchipPfColorsExclusivity = (state) => {
      if (state.enableSuperchip) {
        state.enablePfColors = false;
      }
      if (!BANK_COUNT_BY_ROMSIZE[state.romSize]) {
        state.enableInlineRand = false;
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
      romSizeIsBankswitched,
      loadLastProject,
      isSectionCollapsed,
      toggleSection,
    };
  },
  methods: {
  },
});
</script>
<style scoped>
/* Same pattern already used by the other editor tabs (e.g. DataEditor's
   .editor-container): absolutely positioned and stretched to its parent's
   full height via top/bottom rather than a hardcoded height, with its own
   overflow: auto. That keeps the scrollbar attached to this tab's own
   column (matching where the other tabs already put theirs) and only
   showing up when this tab's content is actually taller than the window -
   unlike scrolling the whole document, which put the scrollbar at the far
   outer edge of the browser window instead of next to the content, and
   unlike a hardcoded height, which didn't leave room for the resizable
   error footer below (that footer isn't Vuetify "app"-managed, so nothing
   else accounts for its height). */
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* Left-aligned collapse chevron + section title - matches the other tabs'
   own per-card collapse control (e.g. DataEditor's .data-collapse-btn),
   rather than Vuetify's own v-expansion-panel-header, which puts its arrow
   on the right. */
.option-section-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.option-section-content {
  padding-left: 4px;
}

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
