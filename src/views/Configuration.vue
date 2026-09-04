<template>
  <v-card flat class="editor-container">
    <v-card-title>Options</v-card-title>
    <v-card-text>
      <v-btn
        text
        class="reset-to-defaults-btn"
        @click="handleResetToDefaults"
      >
        Reset to Defaults
      </v-btn>

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
          :hint="configurationState.enableSuperchip ?
            'Smaller sizes are hidden while Superchip RAM is on - see below.' : undefined"
          :persistent-hint="configurationState.enableSuperchip"
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
          v-model="configurationState.muteAllAudio"
          @change="handleChangeConfiguration"
          label="Mute in-game audio"
          hint="Silences every sound effect and channel, overriding whatever any Sound block sets - useful for quick testing without needing to remove sound blocks."
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
          :disabled="!configurationState.enableSuperchip"
          label="Playfield vertical resolution (pfres)"
          :hint="configurationState.enableSuperchip ?
            'Up to 32 rows. Values that don\'t evenly divide 96 (3, 4, 6, 8, 12, 16, 24, 32) may leave the screen slightly shorter than normal.' :
            'Only takes effect with Superchip RAM on above - the standard kernel always uses its own fixed 11-row default otherwise.'"
          persistent-hint
          class="pfres-field"
        />
        <v-switch
          v-model="configurationState.enablePfRowHeight"
          @change="handleChangeConfiguration"
          label="Override playfield row height (pfrowheight)"
          hint="Advanced: overrides the row height (in scanlines) the kernel derives from pfres above. Doesn't change how many rows the playfield has, only how tall each one is drawn."
          persistent-hint
          class="option-switch pfrowheight-switch"
        />
        <v-text-field
          v-model.number="configurationState.pfrowheight"
          @change="handleChangePfRowHeight"
          type="number"
          min="1"
          :disabled="!configurationState.enablePfRowHeight"
          label="Playfield row height (pfrowheight)"
          hint="The sprite/playfield coordinate conversion blocks on the Actions tab use this value too, so they stay accurate."
          persistent-hint
          class="pfrowheight-field"
        />
      </div>

      <v-divider class="my-2" />
      <div class="option-section-header" @click="() => toggleSection('kernel')">
        <v-btn icon small :title="isSectionCollapsed('kernel') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('kernel') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">Kernel Options</span>
      </div>
      <div v-if="!isSectionCollapsed('kernel')" class="option-section-content">
        <v-switch
          v-model="configurationState.enableRand16"
          @change="handleChangeConfiguration"
          label="Use 16-bit random number generator (rand16)"
          hint="Widens the random number generator's own cycle length before it starts visibly repeating - every Random block on the Actions tab still reads the same 'rand' either way, this only changes how long it takes before that sequence repeats. Costs one extra variable."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.showBlankLines"
          @change="handleChangeConfiguration"
          :disabled="player0RainbowColorsActive"
          :color="player0RainbowColorsActive ? 'amber darken-2' : undefined"
          label="Show blank lines between background rows (no_blank_lines)"
          :hint="player0RainbowColorsActive ?
            'Forced on: the player0 rainbow colors block requires this to stay on - batari Basic never allows player-colors and no_blank_lines together.' :
            'Turning this off packs playfield rows tighter together, but uses missile0\'s graphics circuitry, so missile0 can no longer be used as a sprite.'"
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enablePlayer0SpriteColors"
          @change="handleChangeConfiguration"
          label="Enable per-row Player 0 sprite colors (playercolors)"
          hint="Lets Player 0 show a different color on every row, the same way backgrounds can. Unlike per-row playfield colors below, this works fine with Superchip RAM on. Costs missile0 (can't be used as a sprite anywhere in the project once this is on) and paddle input. batari Basic requires player1colors alongside playercolors, so turning this on also turns on (and locks on) Player 1 sprite colors below, costing missile1 too."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enablePlayer1SpriteColors"
          @change="handleChangeConfiguration"
          :disabled="player0RainbowColorsActive"
          :color="player0RainbowColorsActive ? 'amber darken-2' : undefined"
          label="Enable per-row Player 1 sprite colors (player1colors)"
          :hint="player0RainbowColorsActive ?
            'Forced on: batari Basic requires player1colors whenever playercolors (Player 0 sprite colors, above) is on.' :
            'Lets Player 1 show a different color on every row, the same way backgrounds can. Unlike per-row playfield colors below, this works fine with Superchip RAM on. Costs missile1 (can\'t be used as a sprite anywhere in the project once this is on) - unlike Player 0 sprite colors, this works on its own with no other cost.'"
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
      </div>

      <v-divider class="my-2" />
      <div class="option-section-header" @click="() => toggleSection('compiler')">
        <v-btn icon small :title="isSectionCollapsed('compiler') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('compiler') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">Compiler Options</span>
      </div>
      <div v-if="!isSectionCollapsed('compiler')" class="option-section-content">
        <v-switch
          v-model="configurationState.enableInlineRand"
          @change="handleChangeConfiguration"
          :disabled="!romSizeIsBankswitched"
          label="Inline random number calls (inlinerand)"
          hint="Places calls to the random number generator inline with your code instead of as a shared routine, trading a small increase in code size for speed - most useful in a bankswitched game, where a shared routine call would otherwise have to switch banks. Requires a bankswitched ROM size (8k or larger) - see ROM size above."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enableOptimizationSpeed"
          @change="handleChangeConfiguration"
          label="Optimize for speed (speed)"
          hint="May increase speed - particularly of multiplication and division - at the cost of code size."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enableCycleScore"
          @change="handleChangeConfiguration"
          label="Show remaining CPU cycles as the score (cyclescore)"
          hint="Displays an estimate (accurate to about +/- 64 cycles) of how many machine cycles are left in the current frame, using the score digits - white means positive (cycles to spare), red means negative (over budget). Only measures +/- 2000 cycles; a bigger deficit may show garbage or crash. Meant for debugging - turn it back off before shipping."
          persistent-hint
          class="option-switch"
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
          v-model="projectAutoIncrementVersion"
          label="Auto-increment version on save"
          hint="Bumps the last segment of the Project tab's own Version field (e.g. 1.2.3 -> 1.2.4) every time you save the project."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="muteBlocklySounds"
          label="Mute Blockly sounds"
          hint="Silences the click, delete, and disconnect sounds heard while editing blocks on the Actions tab. Doesn't affect the game itself - see &quot;Mute in-game audio&quot; above for that."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.showVariableComments"
          @change="handleChangeConfiguration"
          label="Show detailed comments in generated code"
          hint="Adds a short comment next to each reserved variable's own &quot;dim&quot; line, and each data table, in the Generated tab explaining what it's for."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="hideSidebar"
          label="Never show the left sidebar"
          hint="Keeps the left navigation sidebar closed at all times, reclaiming its space for the rest of the app instead of leaving it available to open."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="blocklyControlsHorizontal"
          label="Arrange Blockly controls horizontally"
          hint="When off (default), the zoom in/out/reset/grid-snap buttons on the Actions tab's Blockly canvas are stacked vertically along the right edge. When on, they're arranged in a row along the bottom edge instead."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="desaturateBlocklyColors"
          label="Soft Blockly colors"
          hint="Mutes block colors to half their normal saturation for a calmer, less colorful Blockly view."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="hideDescriptionText"
          label="Expert mode"
          hint="Hides the small explanatory hint text under fields and switches throughout the app (including this one), for a more compact layout once you already know what everything does."
          persistent-hint
          class="option-switch"
        />
        <v-text-field
          v-if="isElectron"
          v-model="stellaPathStorage"
          label="Stella installation location"
          hint="Path to the Stella executable, used by the emulator preview's own 'Test in Stella' button. You need to install Stella yourself first - this only points the app at it."
          persistent-hint
          class="stella-path-field"
        >
          <template v-slot:append>
            <v-btn text small @click="handleBrowseForStella">
              Browse...
            </v-btn>
          </template>
        </v-text-field>
      </div>
    </v-card-text>
    </v-card>
</template>
<script>
import {computed, defineComponent, ref, watch} from '@vue/composition-api';

import {USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP} from '../generators/bbasic';
import {useBackgroundsStorage, useBlocklyControlsHorizontalStorage, useConfigurationStorage,
  useDesaturateBlocklyColorsStorage, useErrorStorage,
  useHideDescriptionTextStorage, useHideSidebarStorage, useLoadLastProjectStorage, useMuteBlocklySoundsStorage,
  useProjectAutoIncrementVersionStorage, useStellaPathStorage} from '../hooks/project';
import {BANK_COUNT_BY_ROMSIZE, countUsedVariables, usesPlayer0RainbowColors} from '../hooks/rom';
import {effectiveBackgroundRows, reflowBackgroundsToHeight} from '../blocks/background';

// 64k compiles correctly (see generators/bbasic.js's own SUPPORTED_ROM_SIZES/
// BANK_COUNT_BY_ROMSIZE_MINI) but isn't offered here yet - the bundled
// preview emulator (public/js/javatari.js) can't actually run bB's own 64k
// bankswitch scheme (confirmed directly: still "AUTO: FAILED"/no video even
// forcing every cartridge format it has that's remotely close - EF included,
// the one whose own hotspot address genuinely matches bB's), so exposing it
// here would just let someone build a ROM this app's own preview can't show
// them running. Re-add once that's sorted out (a newer/different bundled
// emulator, most likely).
const ROM_SIZE_OPTIONS = ['2k', '4k', '8k', '16k', '32k'];
const MIN_PFRES = 1;
const MAX_PFRES = 32;
// Superchip RAM only works on a bankswitched ROM ("Superchip RAM is only used
// in conjunction with bankswitching" - batari Basic docs); 2k/4k never
// bankswitch, so the compiler silently ignores the SC suffix on those sizes,
// leaving pfres pointed at RAM that was never actually enabled.
const MIN_SUPERCHIP_ROM_SIZE_INDEX = ROM_SIZE_OPTIONS.indexOf('8k');

// A view preference, not part of the project itself - same "survives
// navigating away and back" reasoning as hooks/collapse.js's own
// collapsedRefs (Vue Router destroys and recreates this whole component on
// navigation, which would otherwise reset any state kept inside setup()
// itself). Not reused straight from that hook: its isCollapsed/
// toggleCollapsed take an {id} object and always default to "not
// collapsed," whereas this page wants every section collapsed the FIRST
// time (before the user has ever toggled anything) - a plain module-scope
// ref, hydrated from localStorage once here, covers both without changing
// that shared hook's own contract for its other callers.
const OPTIONS_COLLAPSED_SECTIONS_KEY = 'vcs-game-maker.collapsed.options-sections';
const DEFAULT_COLLAPSED_SECTIONS = ['rom', 'kernel', 'compiler', 'vcsgm'];
const loadCollapsedSections = () => {
  try {
    const stored = JSON.parse(localStorage.getItem(OPTIONS_COLLAPSED_SECTIONS_KEY));
    if (Array.isArray(stored)) return new Set(stored);
  } catch (e) {
    // Fall through to the default below.
  }
  return new Set(DEFAULT_COLLAPSED_SECTIONS);
};
const collapsedSections = ref(loadCollapsedSections());

// Hoisted out of configurationState's own getter (module scope, like
// collapsedSections above) so handleResetToDefaults can reuse the exact
// same values rather than keeping a second, easily-drifting copy of every
// default in sync by hand.
const DEFAULT_CONFIGURATION = {
  showScore: true,
  enableScoreFade: false,
  showBlankLines: true,
  enablePlayer0SpriteColors: false,
  enablePlayer1SpriteColors: false,
  enablePfColors: false,
  enableSuperchip: false,
  enableOptimizationSpeed: false,
  enableInlineRand: true,
  enableRand16: true,
  enableCycleScore: false,
  pfres: 24,
  enablePfRowHeight: false,
  pfrowheight: 8,
  romSize: '4k',
  scoreFont: '',
  muteAllAudio: false,
  showVariableComments: true,
};

export default defineComponent({
  setup(props, context) {
    const configurationStorage = useConfigurationStorage();
    const backgroundsStorage = useBackgroundsStorage();
    // A standing app preference, not part of the project itself (see
    // hooks/project.js's own comment) - kept separate from configurationState
    // below so it survives clearProjectStorage() and can be checked at
    // startup, before deciding whether to call that at all.
    const loadLastProject = useLoadLastProjectStorage();
    // Same reasoning as loadLastProject above - these three used to round-trip
    // with the project itself via configurationState, silently resetting
    // every time you switched or started a new project.
    const muteBlocklySounds = useMuteBlocklySoundsStorage();
    const hideSidebar = useHideSidebarStorage();
    const blocklyControlsHorizontal = useBlocklyControlsHorizontalStorage();
    const desaturateBlocklyColors = useDesaturateBlocklyColorsStorage();
    const hideDescriptionText = useHideDescriptionTextStorage();
    const projectAutoIncrementVersion = useProjectAutoIncrementVersionStorage();
    const stellaPathStorage = useStellaPathStorage();
    // window.electronAPI only exists inside the desktop (Electron) build's
    // own preload script (see preload.js) - a plain web-served copy of this
    // same app has no such thing, so this is what tells the two apart at
    // runtime rather than any build-time flag.
    const isElectron = computed(() => !!window.electronAPI);
    const handleBrowseForStella = async () => {
      const picked = await window.electronAPI.pickStellaPath();
      // null specifically means the user cancelled the dialog (see
      // background.js's own "stella:pick-path" handler) - leaves whatever
      // was already saved untouched rather than clearing it.
      if (picked) stellaPathStorage.value = picked;
    };

    // Which sections are collapsed - a Set of section keys, matching the
    // collapse pattern already used by the other tabs' own cards (a plain
    // left-aligned chevron icon button, not Vuetify's own v-expansion-panels,
    // which puts its arrow on the right). See collapsedSections' own
    // module-scope definition above for why this isn't just a local ref.
    const isSectionCollapsed = (key) => collapsedSections.value.has(key);
    const toggleSection = (key) => {
      const next = new Set(collapsedSections.value);
      if (next.has(key)) next.delete(key); else next.add(key);
      collapsedSections.value = next;
      localStorage.setItem(OPTIONS_COLLAPSED_SECTIONS_KEY, JSON.stringify([...next]));
    };

    const configurationState = computed({
      // scoreFont is chosen on the Score tab, but is kept here so that
      // changing any other option round-trips it instead of dropping it.
      get() {
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

    // Whether the project uses the player0 rainbow colors block - if so,
    // "Show blank lines" can't be turned off (see usesPlayer0RainbowColors'
    // own comment in hooks/rom.js): batari Basic's kernel_options never
    // allows "playercolors" alongside "no_blank_lines", so the toggle is
    // forced on and disabled rather than letting the user pick a
    // combination that's guaranteed to fail to build.
    const player0RainbowColorsActive = computed(() => usesPlayer0RainbowColors());

    // Catches the block being added (or the workspace loading a project that
    // already has it) even when the user never touches this switch directly
    // themselves - not just the handleChangeConfiguration path below, which
    // only runs when some OTHER switch on this page is what triggered the
    // change. Also forces Player 1 sprite colors on: batari Basic's own
    // kernel_options combination table never has a valid row with
    // "playercolors" alone, it always needs "player1colors" too (see
    // generateConfiguration's own comment in generators/bbasic.js) - so
    // whenever playercolors is needed (a player0 rainbow-colors block, OR
    // the "Enable per-row Player 0 sprite colors" toggle), player1colors has
    // to come along with it, same reasoning/pattern as showBlankLines just
    // below.
    watch(player0RainbowColorsActive, (active) => {
      if (!active) return;
      const state = configurationState.value;
      if (state.showBlankLines && state.enablePlayer1SpriteColors) return;
      state.showBlankLines = true;
      state.enablePlayer1SpriteColors = true;
      configurationState.value = state;
    }, {immediate: true});

    // Whether the selected ROM size actually bankswitches (see
    // BANK_COUNT_BY_ROMSIZE in hooks/rom.js - 2k/4k never do).
    const romSizeIsBankswitched = computed(() =>
      Boolean(BANK_COUNT_BY_ROMSIZE[configurationState.value.romSize]));

    // 2k/4k never bankswitch, so Superchip's SC suffix is silently ignored on
    // them (see MIN_SUPERCHIP_ROM_SIZE_INDEX above) - hidden from the
    // dropdown entirely while Superchip is on, rather than letting the user
    // pick one only to have handleChangeResolution immediately bump it back
    // up again behind their back.
    const romSizeOptions = computed(() => configurationState.value.enableSuperchip ?
      ROM_SIZE_OPTIONS.slice(MIN_SUPERCHIP_ROM_SIZE_INDEX) : ROM_SIZE_OPTIONS);

    // pfcolors and Superchip's higher-resolution playfield don't render
    // correctly together (last row black, and with more than one background
    // the colors come out wrong and the black area returns), so the two
    // options can't both be on. Per-row SPRITE colors doesn't share this
    // problem - it reads through player0color/player1color (aliased onto
    // paddle/missile1y - see ROM_NOISE_COLOR_REGISTERS' own comment in
    // generators/bbasic/sprites.js), a completely separate pointer from the
    // playfield's own pfcolortable, and testing confirms it renders
    // correctly with Superchip on - so it's deliberately NOT excluded here.
    // Inlining random-number calls (see
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
      const state = configurationState.value;
      if (player0RainbowColorsActive.value) state.showBlankLines = true;
      configurationState.value = enforceSuperchipPfColorsExclusivity(state);
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

    // Unlike pfres above, this doesn't change how many rows the playfield
    // has (no reflow needed) - it only overrides the row HEIGHT the kernel
    // draws each one at (see pfRowDivisorFor in utils/playfield-coords.js,
    // which prefers this value over its own round(96/pfres) calculation
    // whenever the "Override playfield row height" switch above is on), so
    // background pixel data stays exactly as-is. Whether the override is
    // APPLIED is entirely the switch's own job (enablePfRowHeight) - this
    // field's own stored number is just clamped to a sane positive integer
    // here, same as pfres's own handleChangeResolution just above, so an
    // invalid/emptied field can't leave a NaN or 0 behind for whenever the
    // switch gets turned back on.
    const handleChangePfRowHeight = () => {
      const state = configurationState.value;
      state.pfrowheight = Math.max(1, Math.round(Number(state.pfrowheight) || DEFAULT_CONFIGURATION.pfrowheight));
      configurationState.value = state;
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

    // Only the boolean (v-switch) settings - romSize/pfres/scoreFont are
    // real project choices, not toggles, so a "reset to defaults" for
    // toggles specifically leaves them alone. Covers both configurationState
    // (project-scoped, saved with the .vcsgm file) and the four standing app
    // preferences kept in their own separate storage (see loadLastProject's
    // own comment above for why those live apart from configurationState).
    const handleResetToDefaults = () => {
      const state = configurationState.value;
      state.showScore = DEFAULT_CONFIGURATION.showScore;
      state.enableScoreFade = DEFAULT_CONFIGURATION.enableScoreFade;
      state.showBlankLines = DEFAULT_CONFIGURATION.showBlankLines;
      state.enablePlayer0SpriteColors = DEFAULT_CONFIGURATION.enablePlayer0SpriteColors;
      state.enablePlayer1SpriteColors = DEFAULT_CONFIGURATION.enablePlayer1SpriteColors;
      state.enablePfColors = DEFAULT_CONFIGURATION.enablePfColors;
      state.enableSuperchip = DEFAULT_CONFIGURATION.enableSuperchip;
      state.enableOptimizationSpeed = DEFAULT_CONFIGURATION.enableOptimizationSpeed;
      state.enableInlineRand = DEFAULT_CONFIGURATION.enableInlineRand;
      state.enableRand16 = DEFAULT_CONFIGURATION.enableRand16;
      state.enableCycleScore = DEFAULT_CONFIGURATION.enableCycleScore;
      state.muteAllAudio = DEFAULT_CONFIGURATION.muteAllAudio;
      state.showVariableComments = DEFAULT_CONFIGURATION.showVariableComments;
      configurationState.value = state;

      loadLastProject.value = false;
      muteBlocklySounds.value = false;
      blocklyControlsHorizontal.value = false;
      hideDescriptionText.value = false;
      projectAutoIncrementVersion.value = false;
    };

    return {
      configurationState,
      handleChangeConfiguration,
      handleChangeResolution,
      handleChangePfRowHeight,
      handleToggleSuperchip,
      handleResetToDefaults,
      romSizeOptions,
      romSizeIsBankswitched,
      player0RainbowColorsActive,
      loadLastProject,
      muteBlocklySounds, hideSidebar, blocklyControlsHorizontal, desaturateBlocklyColors,
      hideDescriptionText, projectAutoIncrementVersion,
      stellaPathStorage, isElectron, handleBrowseForStella,
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

/* A solid background (no "text" prop, unlike this app's usual flat-icon
   buttons) - this is a destructive-ish, whole-page action, so it reads as
   more deliberate/prominent than the section toggles below it. */
.reset-to-defaults-btn {
  margin-bottom: 16px;
}

/* Same flat-icon, fade-in-on-hover/blue-on-press color pattern as every
   icon button elsewhere in the app (e.g. Project.vue's own
   .project-flat-icon-btn, GeneratedCode.vue's own
   .generated-code-flat-icon-btn) - here applied to the button's TEXT color
   instead of an icon's, since this button has a label, not an icon.
   Vuetify's own "text" prop already gives the transparent background/no
   box-shadow those other buttons get from more manual CSS. */
.reset-to-defaults-btn.v-btn {
  color: rgba(0, 0, 0, 0.38) !important;
}

.reset-to-defaults-btn.v-btn:hover {
  color: rgba(0, 0, 0, 0.87) !important;
}

.reset-to-defaults-btn.v-btn:active {
  color: #1976d2 !important;
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

/* Vuetify's own ".v-input--selection-controls" gives every switch a fixed
   16px margin-top regardless of whether its own hint text is even showing
   (see node_modules/vuetify/dist/vuetify.css) - once "Expert mode" (see
   App.vue's own hide-description-text support) removes that hint text,
   that much space between switches reads as too generous with nothing left
   below to justify it. Only switches that FOLLOW another switch (the "+"
   combinator, rather than a blanket ".option-switch") - the section's own
   FIRST switch sits right under its own header instead, and that spacing
   is unrelated to any hint text, so it shouldn't change with this toggle. */
.hide-description-text .option-switch + .option-switch {
  margin-top: 2px;
}

/* Reads as a sub-option of the Superchip switch above it, so it's indented to
   line up under that switch's label text rather than its toggle track.
   margin-top adds a bit of breathing room from that switch's own hint text
   directly above - the two otherwise sat flush against each other. */
.pfres-field {
  margin-left: 46px;
  margin-top: 12px;
  max-width: calc(100% - 46px);
}

/* See App.vue's own "Hide small description text" support - with that
   switch's hint text gone, there's no longer anything for the margin-top
   above to create breathing room from, so it can sit right under the
   switch itself again. */
.hide-description-text .pfres-field {
  margin-top: 0;
}

/* Same reasoning as .pfres-field above, one level further down - it reads
   as a sub-option of the "Override playfield row height" switch right
   above it. */
.pfrowheight-field {
  margin-left: 46px;
  margin-top: 12px;
  max-width: calc(100% - 46px);
}

.hide-description-text .pfrowheight-field {
  margin-top: 0;
}

/* The "Override playfield row height" switch reads as belonging with
   Superchip's own switch (it's the next "advanced ROM knob" down the
   list), even though .pfres-field now sits between them in the DOM - the
   generic ".option-switch + .option-switch" rule above only tightens
   switches that are immediate DOM siblings, which this one no longer is,
   so it needs its own explicit override to get the same tighter spacing
   once Expert mode's hint text is gone. Left alone (Vuetify's own default
   spacing) while Expert mode is off. */
.hide-description-text .pfrowheight-switch {
  margin-top: 2px;
}
</style>
