<template>
  <v-card flat class="editor-container">
    <v-card-title>Options</v-card-title>
    <v-card-text>
      <v-btn
        class="reset-to-defaults-btn"
        @click="handleResetToDefaults"
      >
        Reset to Defaults
      </v-btn>

      <div class="option-section-header" @click="() => toggleSection('kernel')">
        <v-btn icon small :title="isSectionCollapsed('kernel') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('kernel') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">Kernel Options</span>
      </div>
      <div v-if="!isSectionCollapsed('kernel')" class="option-section-content">
        <v-select
          v-model="configurationState.kernel"
          @change="handleChangeConfiguration"
          :items="kernelOptions"
          label="Kernel"
          hint="DPC+ trades the standard kernel's playfield/missile/ball tricks (Superchip, per-row playfield colors, no_blank_lines) for an ARM co-processor with different capabilities (settable playfield row height, independent per-row playfield AND background colors) - see the options that appear below once selected."
          persistent-hint
        />
        <v-switch
          v-if="!kernelIsDpcPlus"
          v-model="configurationState.enableRand16"
          @change="handleChangeConfiguration"
          label="Use 16-bit random number generator (rand16)"
          hint="Widens the random number generator's cycle length before it starts visibly repeating - every Random block on the Actions tab still reads the same 'rand' either way, this only changes how long it takes before that sequence repeats. Costs one extra variable."
          persistent-hint
          class="option-switch"
        />
        <template v-if="!kernelIsDpcPlus">
          <v-switch
            v-model="enableMissile0BlankLines"
            @change="handleChangeConfiguration"
            :disabled="player0RainbowColorsActive"
            :color="player0RainbowColorsActive ? 'amber darken-2' : undefined"
            label="Fill blank lines between background rows with missile0 (no_blank_lines)"
            :hint="player0RainbowColorsActive ?
              'Forced off: the player0 rainbow colors block requires blank lines shown normally - batari Basic never allows player-colors and no_blank_lines together.' :
              'Turning this on packs playfield rows tighter together, but uses missile0\'s graphics circuitry, so missile0 can no longer be used as a sprite.'"
            persistent-hint
            class="option-switch"
          />
        </template>
        <template v-else>
          <v-switch
            v-model="configurationState.enablePfColors"
            @change="handleChangeConfiguration"
            label="Enable per-row playfield colors"
            hint="Playfield show a different color on every row."
            persistent-hint
            class="option-switch"
          />
          <v-switch
            v-model="configurationState.enableDpcPlusBkColors"
            @change="handleChangeConfiguration"
            label="Enable per-row background colors"
            hint="An independent color per background row, on top of (not instead of) per-row playfield colors above."
            persistent-hint
            class="option-switch"
          />
          <v-switch
            v-model="configurationState.enableDpcPlusAudio"
            @change="handleChangeConfiguration"
            label="Play sound and music with the DPC+ sound chip"
            hint="Sounds and songs are played by the DPC+ chip: each sound has a waveform you draw on its Sound tab card instead of a sound type, and a note can be any piano key. It plays all three of the chip's voices (Ch0 voice 1 to 3 in the channel choices), and Ch1 stays on the TIA. The chip's sound stops for the part of each frame after the picture (a faint 60 Hz buzz). Turned off, the sounds use the TIA's two channels like the standard kernel."
            persistent-hint
            class="option-switch"
          />
        </template>
        <v-switch
          v-if="!kernelIsDpcPlus"
          v-model="configurationState.enablePlayer0SpriteColors"
          @change="handleChangeConfiguration"
          :label="kernelIsDpcPlus ? 'Enable per-row Player 0 sprite colors' : 'Enable per-row Player 0 sprite colors (playercolors)'"
          :hint="kernelIsDpcPlus ? 'Lets Player 0 show a different color on every row, the same way backgrounds can. The colors are the ones set on each sprite row in the Sprites tab.' : 'Lets Player 0 show a different color on every row, the same way backgrounds can. Costs missile0 (can\'t be used as a sprite anywhere in the project once this is on) and paddle input. batari Basic requires player1colors alongside playercolors, so turning this on also turns on (and locks on) Player 1 sprite colors below, costing missile1 too.'"
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-if="!kernelIsDpcPlus"
          v-model="configurationState.enablePlayer1SpriteColors"
          @change="handleChangeConfiguration"
          :disabled="player0RainbowColorsActive"
          :color="player0RainbowColorsActive ? 'amber darken-2' : undefined"
          :label="kernelIsDpcPlus ? 'Enable per-row Player 1 sprite colors' : 'Enable per-row Player 1 sprite colors (player1colors)'"
          :hint="kernelIsDpcPlus ? 'Lets Player 1 and the other players show a different color on every row, the same way backgrounds can. The colors are the ones set on each sprite row in the Sprites tab.' : player0RainbowColorsActive ?
            'Forced on: batari Basic requires player1colors whenever playercolors (Player 0 sprite colors, above) is on.' :
            'Lets Player 1 show a different color on every row, the same way backgrounds can. Costs missile1 (can\'t be used as a sprite anywhere in the project once this is on) - unlike Player 0 sprite colors, this works alone with no other cost.'"
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-if="!kernelIsDpcPlus"
          v-model="configurationState.enablePfColors"
          @change="handleChangeConfiguration"
          label="Enable per-row playfield colors (pfcolors)"
          hint="Backgrounds can still have row colors set while this is off; they just won't be included in the generated code. Works fine together with Superchip RAM."
          persistent-hint
          class="option-switch"
        />
      </div>

      <v-divider class="my-2" />
      <div class="option-section-header" @click="() => toggleSection('rom')">
        <v-btn icon small :title="isSectionCollapsed('rom') ? 'Expand this section' : 'Collapse this section'">
          <v-icon>{{ isSectionCollapsed('rom') ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
        </v-btn>
        <span class="text-subtitle-1">ROM Options</span>
      </div>
      <div v-if="!isSectionCollapsed('rom')" class="option-section-content">
        <v-select
          v-model="configurationState.tvStandard"
          @change="handleChangeConfiguration"
          :items="tvStandardOptions"
          label="TV standard"
          class="mb-0"
          hint="NTSC is the North American color standard. PAL60 is a PAL console's color signal at the same 60 Hz timing: the emulator preview follows it, each color is swapped in the ROM for the closest PAL color, and the sound previews use the PAL audio clock. Frame-based timing (durations, tempo) is identical to NTSC."
          persistent-hint
        />
        <v-select
          v-if="!kernelIsDpcPlus"
          v-model="configurationState.romSize"
          @change="handleChangeConfiguration"
          :items="romSizeOptions"
          label="ROM size"
          class="rom-size-field"
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
          class="option-switch score-switch"
        />
        <v-switch
          v-model="configurationState.muteAllAudio"
          @change="handleChangeConfiguration"
          label="Mute in-game audio"
          hint="Silences every sound effect and channel, overriding whatever any Sound block sets - useful for quick testing without needing to remove sound blocks."
          persistent-hint
          class="option-switch"
        />
        <template v-if="kernelIsDpcPlus">
          <v-select
            :value="dpcPlusPfresPreset"
            :items="DPC_PLUS_PFRES_PRESETS"
            @change="handleChangeDpcPlusPfresPreset"
            label="Playfield resolution presets"
            placeholder="Custom"
            persistent-placeholder
            hint="Common row heights: pick one to set the pfres below to match."
            persistent-hint
            dense
            class="dpcplus-pfres-presets"
          />
          <div class="dpcplus-pfres-row">
            <v-text-field
              v-model.number="configurationState.dpcPlusPfres"
              @change="handleChangeDpcPlusPfres"
              type="number"
              min="1"
              max="192"
              label="Playfield vertical resolution (pfres)"
              hint="How many rows the playfield has on screen, from 1 to 192 (192 / pfres scanlines tall each, not necessarily a whole number). 12, the default, gives the same 16-scanline rows as the standard kernel without Superchip; 24 gives its Superchip 24-row look; 96 gives 2-scanline rows. A background can set a different pfres in the Backgrounds tab; the rest use this one."
              persistent-hint
              class="dpcplus-row-height-field"
            />
            <div class="dpcplus-sprites" :class="{'dpcplus-sprites-compact': hideDescriptionText}">
              <div class="dpcplus-sprites-title">Virtual sprites (dpcspritemax)</div>
              <div class="dpcplus-sprites-buttons">
                <v-btn small depressed class="dpcplus-sprite-button" color="primary" disabled>1</v-btn>
                <v-btn
                  v-for="n in [2, 3, 4, 5, 6, 7, 8, 9]"
                  :key="n"
                  small
                  depressed
                  class="dpcplus-sprite-button"
                  :color="n <= dpcPlusSpriteMax ? 'primary' : undefined"
                  :title="n <= dpcPlusSpriteMax ? `Turn off Player ${n} and above` : `Turn on Players 2 to ${n}`"
                  @click="() => handleToggleDpcPlusSprite(n)"
                >{{ n }}</v-btn>
              </div>
              <div v-if="!hideDescriptionText" class="dpcplus-sprites-hint">Each virtual sprite that is on keeps memory for its x, y, height and NUSIZ; the ones that are off give that memory to variables ({{ dpcPlusSpriteVariableSlots }} variable slots from the sprites that are off now, 4 for each; the Text Minikernel keeps 4 of them). A player a block uses is always on.</div>
            </div>
          </div>
        </template>
        <template v-if="!kernelIsDpcPlus">
          <v-switch
            v-model="configurationState.enableSuperchip"
            @change="handleToggleSuperchip"
            label="Enable Superchip RAM for higher-resolution playfields"
            hint="Adds a Superchip (SC) to the ROM and lets the playfield use more than 11 rows. Requires an 8k or larger ROM (bumped automatically if needed), and horizontal playfield scrolling (left/right) isn't supported once this is on. Also moves the app's bookkeeping variables off letters and into extra Superchip RAM, freeing every letter (a-z) for your variables."
            persistent-hint
            class="option-switch"
          />
          <v-text-field
            v-model.number="configurationState.pfres"
            @input="handleInputPfres"
            @change="handleChangeResolution"
            type="number"
            min="1"
            max="32"
            :disabled="!configurationState.enableSuperchip"
            label="Playfield vertical resolution (pfres)"
            :hint="configurationState.enableSuperchip ?
              'Up to 32 rows. Values that don\'t evenly divide 96 (3, 4, 6, 8, 12, 16, 24, 32) may leave the screen slightly shorter than normal.' :
              'Only takes effect with Superchip RAM on above - the standard kernel always uses a fixed 11-row default otherwise.'"
            persistent-hint
            class="pfres-field"
          />
          <v-switch
            v-model="configurationState.enablePfRowHeight"
            @change="handleTogglePfRowHeight"
            label="Override playfield row height (pfrowheight)"
            hint="Advanced: overrides the row height (in scanlines) the kernel derives from pfres above. Doesn't change how many rows the playfield has, only how tall each one is drawn."
            persistent-hint
            class="option-switch pfrowheight-switch"
          />
          <v-text-field
            :value="pfRowHeightShown"
            @input="handleInputPfRowHeight"
            @change="handleChangePfRowHeight"
            type="number"
            min="1"
            :disabled="!configurationState.enablePfRowHeight"
            label="Playfield row height (pfrowheight)"
            hint="The sprite/playfield coordinate conversion blocks on the Actions tab use this value too, so they stay accurate."
            persistent-hint
            class="pfrowheight-field"
          />
        </template>
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
          v-model="configurationState.enableFastMath"
          @change="handleChangeConfiguration"
          label="Faster multiply and divide"
          hint="Replaces the multiply and divide routines with ones that look the answer up in a table (multiplying always takes about 60 cycles instead of up to 180) and shift and subtract for big answers (dividing takes at most about 210 cycles instead of over 1000). Costs about 600 bytes of ROM. Only matters when a block multiplies or divides by something that is not a power of 2, such as the playfield and sprite conversion blocks. On DPC+ this is always on and only dividing changes: big answers are worked out by the coprocessor, and no extra ROM is used."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enableCycleScore"
          @change="handleToggleCycleScore"
          label="Show remaining CPU cycles as the score (cyclescore)"
          hint="Displays an estimate (accurate to about +/- 64 cycles) of how many machine cycles are left in the current frame, using the score digits - white means positive (cycles to spare), red means negative (over budget). Only measures +/- 2000 cycles; a bigger deficit may show garbage or crash. Meant for debugging - turn it back off before shipping. Has no effect while a Title screen is being shown."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.enableScanlinesDebug"
          @change="handleToggleScanlinesScore"
          label="Show NTSC scanlines used as the score"
          hint="Writes the playfield kernel's scanline count (out of the 192-line NTSC visible picture) into the score once at startup, computed from the current pfres/pfrowheight settings. Useful for spotting a kernel overrun that shows up as screen rolling/tearing. Meant for debugging - turn it back off before shipping."
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
        <v-text-field
          v-model.number="undoLimit"
          type="number"
          :min="MIN_UNDO_LIMIT"
          :max="MAX_UNDO_LIMIT"
          label="Undo steps"
          hint="How many steps back Undo can go, across all tabs. From 1 to 999, default 99."
          persistent-hint
          class="undo-limit-field"
        />
        <v-switch
          v-model="loadLastProject"
          label="Load last project on startup"
          hint="When on, the app starts with your last open project, so you can pick up where you left off."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-if="isElectron"
          v-model="checkForUpdates"
          label="Notify me of new versions"
          hint="Tells you at startup when a newer version is out, with a download link for your system."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          id="show-startup-tips-option"
          v-model="showStartupTips"
          label="Show Tips at startup"
          hint="Shows a tip with a link to the wiki page about the topic, each time the app starts. The tip popup's &quot;Don't show again&quot; checkbox disables this feature."
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
          v-if="emulatorSettings.backend === 'gopher2600'"
          v-model="adaptiveFrameSkip"
          label="Adaptive frame skipping"
          hint="On a slower computer, the gopher2600 emulator draws only some of the frames it runs when it is close to falling behind, which leaves more time for emulating. Game speed and sound are unchanged."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="configurationState.showVariableComments"
          @change="handleChangeConfiguration"
          label="Show detailed comments in generated code"
          hint="Adds a short comment next to each reserved variable's &quot;dim&quot; line, and each data table, in the generated bBasic code explaining what it's for."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="darkMode"
          label="Dark Mode"
          hint="Switches the app to a dark theme. Combines with Subdued Palette below."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="desaturateBlocklyColors"
          label="Subdued Palette"
          hint="Mutes colors for a calmer, less colorful view."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="colorblindMode"
          label="High Contrast"
          hint="Makes the icons in the left and top toolbars black instead of a color for each, or white in Dark Mode."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="hideTopToolbar"
          :disabled="hideSidebar"
          label="Hide top toolbar"
          hint="Always hides the top app toolbar. Not available while the left toolbar is hidden."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="hideSidebar"
          :disabled="hideTopToolbar"
          label="Hide left toolbar"
          hint="Always hides the left app toolbar. Not available while the top toolbar is hidden."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="hideDescriptionText"
          label="Expert mode"
          hint="Hides the small explanatory hint text under fields and switches throughout the app (including this one), for a more compact layout once you're familiar with VCS Game Maker."
          persistent-hint
          class="option-switch"
        />
        <v-switch
          v-model="hideToolbarLabels"
          :disabled="!hideDescriptionText"
          label="Hide toolbar text labels"
          hint="Expert mode only: the left and top toolbars show just their icons, without the names under them (hover an icon to see its name)."
          persistent-hint
          class="option-switch"
        />
        <v-text-field
          v-if="isElectron"
          v-model="stellaPathStorage"
          label="Stella installation location"
          hint="Path to the Stella executable, used by the emulator preview's 'Test in Stella' button. You need to install Stella yourself first - this only points the app at it."
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
import {computed, defineComponent, nextTick, onMounted, ref, watch} from '@vue/composition-api';
import {TV_STANDARD_OPTIONS} from '../utils/tv-standard';

import {USER_VARIABLE_LETTERS_WITHOUT_SUPERCHIP, dpcPlusFreedSpriteRam} from '../generators/bbasic';
import {useConfigurationStorage,
  useColorblindModeStorage, useDarkModeStorage, useDesaturateBlocklyColorsStorage, useErrorStorage,
  useAdaptiveFrameSkipStorage, useHideDescriptionTextStorage, useHideToolbarLabelsStorage, useHideSidebarStorage, useHideTopToolbarStorage, useLoadLastProjectStorage, useCheckForUpdatesStorage,
  useMuteBlocklySoundsStorage, useShowStartupTipsStorage,
  useProjectAutoIncrementVersionStorage, useStellaPathStorage} from '../hooks/project';
import {MAX_UNDO_LIMIT, MIN_UNDO_LIMIT, useUndoLimitStorage} from '../hooks/undo-limit';
import {useEmulatorSettings} from '../hooks/emulator-settings';
import {optionToReveal} from '../hooks/option-reveal';
import {BANK_COUNT_BY_ROMSIZE, countUsedVariables, usesPlayer0RainbowColors} from '../hooks/rom';

// 64k compiles correctly (see generators/bbasic.js's  SUPPORTED_ROM_SIZES/
// BANK_COUNT_BY_ROMSIZE_MINI) - used to be left out of this list because the
// old bundled preview emulator (public/js/javatari.js) couldn't run bB's 64k
// bankswitch scheme at all (confirmed directly: still "AUTO: FAILED"/no
// video even forcing every cartridge format it has that's remotely close).
// No longer an issue now that the preview is gopher2600-wasm instead (see
// hooks/emulator.js) - its EF/EFSC cartridge mapper (hardware/memory/
// cartridge/mapper_atari_ef.go in the vendored source) is a real, dedicated
// implementation of exactly this 64k/16-bank layout, Superchip RAM included.
const ROM_SIZE_OPTIONS = ['2k', '4k', '8k', '16k', '32k', '64k'];
const MIN_PFRES = 1;
const MAX_PFRES = 32;
// Superchip RAM only works on a bankswitched ROM ("Superchip RAM is only used
// in conjunction with bankswitching" - batari Basic docs); 2k/4k never
// bankswitch, so the compiler silently ignores the SC suffix on those sizes,
// leaving pfres pointed at RAM that was never actually enabled.
const MIN_SUPERCHIP_ROM_SIZE_INDEX = ROM_SIZE_OPTIONS.indexOf('8k');

// A view preference, not part of the project itself. Kept at module scope so it survives navigating to another
// tab and back (Vue Router destroys and recreates this whole component on navigation, which would otherwise
// reset any state kept inside setup()). It is not saved, so every section starts collapsed each time the
// app is loaded.
const collapsedSections = ref(new Set(['rom', 'kernel', 'compiler', 'vcsgm']));

// Hoisted out of configurationState's  getter (module scope, like
// collapsedSections above) so handleResetToDefaults can reuse the exact
// same values rather than keeping a second, easily-drifting copy of every
// default in sync by hand.
const DEFAULT_CONFIGURATION = {
  kernel: 'standard',
  dpcPlusRowScanlines: 16,
  dpcPlusPfres: 12,
  dpcPlusSpriteMax: 9,
  enableDpcPlusPfColors: false,
  enableDpcPlusBkColors: false,
  enableDpcPlusAudio: true,
  showScore: true,
  enableScoreFade: false,
  showBlankLines: true,
  enablePlayer0SpriteColors: false,
  enablePlayer1SpriteColors: false,
  enablePfColors: false,
  enableSuperchip: false,
  enableOptimizationSpeed: false,
  enableFastMath: false,
  enableInlineRand: true,
  enableRand16: true,
  enableCycleScore: false,
  enableScanlinesDebug: false,
  pfres: 24,
  enablePfRowHeight: false,
  pfrowheight: 8,
  tvStandard: 'ntsc',
  romSize: '4k',
  scoreFont: '',
  secondaryScoreFont: '',
  muteAllAudio: false,
  showVariableComments: false,
};

// Standard/DPC+ dropdown items for the new Kernel select - a plain, static
// list (not a computed) since it doesn't depend on any other config value,
// unlike romSizeOptions below.
const KERNEL_OPTIONS = [
  {text: 'Standard', value: 'standard'},
  {text: 'DPC+ (Experimental)', value: 'dpcplus'},
];

export default defineComponent({
  setup(props, context) {
    const configurationStorage = useConfigurationStorage();
    // A standing app preference, not part of the project itself (see
    // hooks/project.js's  comment) - kept separate from configurationState
    // below so it survives clearProjectStorage() and can be checked at
    // startup, before deciding whether to call that at all.
    const loadLastProject = useLoadLastProjectStorage();
    const undoLimit = useUndoLimitStorage();
    const checkForUpdates = useCheckForUpdatesStorage();
    const showStartupTips = useShowStartupTipsStorage();
    // Same reasoning as loadLastProject above - these three used to round-trip
    // with the project itself via configurationState, silently resetting
    // every time you switched or started a new project.
    const muteBlocklySounds = useMuteBlocklySoundsStorage();
    const adaptiveFrameSkip = useAdaptiveFrameSkipStorage();
    // Frame skipping belongs to the gopher2600 emulator, so its switch only shows with that one chosen.
    const emulatorSettings = useEmulatorSettings();
    const hideSidebar = useHideSidebarStorage();
    const hideTopToolbar = useHideTopToolbarStorage();
    // Only one of the two toolbars can be hidden at a time (the switches disable each other), so a saved state with both on
    // keeps just the left toolbar hidden.
    if (hideSidebar.value && hideTopToolbar.value) hideTopToolbar.value = false;
    const darkMode = useDarkModeStorage();
    const desaturateBlocklyColors = useDesaturateBlocklyColorsStorage();
    const colorblindMode = useColorblindModeStorage();
    const hideDescriptionText = useHideDescriptionTextStorage();
    // Under Expert mode: the left and top toolbars show only their icons. It cannot be left on without Expert mode.
    const hideToolbarLabels = useHideToolbarLabelsStorage();
    if (!hideDescriptionText.value) hideToolbarLabels.value = false;
    watch(hideDescriptionText, (expert) => {
      if (!expert) hideToolbarLabels.value = false;
    });
    const projectAutoIncrementVersion = useProjectAutoIncrementVersionStorage();
    const stellaPathStorage = useStellaPathStorage();
    // window.electronAPI only exists inside the desktop (Electron) build's
    // preload script (see preload.js) - a plain web-served copy of this
    // same app has no such thing, so this is what tells the two apart at
    // runtime rather than any build-time flag.
    const isElectron = computed(() => !!window.electronAPI);
    const handleBrowseForStella = async () => {
      const picked = await window.electronAPI.pickStellaPath();
      // null specifically means the user cancelled the dialog (see
      // background.js's "stella:pick-path" handler) - leaves whatever
      // was already saved untouched rather than clearing it.
      if (picked) stellaPathStorage.value = picked;
    };

    // Which sections are collapsed - a Set of section keys, matching the
    // collapse pattern already used by the other tabs'  cards (a plain
    // left-aligned chevron icon button, not Vuetify's  v-expansion-panels,
    // which puts its arrow on the right). See collapsedSections'
    // module-scope definition above for why this isn't just a local ref.
    const isSectionCollapsed = (key) => collapsedSections.value.has(key);
    const toggleSection = (key) => {
      const next = new Set(collapsedSections.value);
      if (next.has(key)) next.delete(key); else next.add(key);
      collapsedSections.value = next;
    };

    // Opens the section that holds an option another part of the app linked to, scrolls to it and flashes it.
    const OPTION_SECTION = {'show-startup-tips-option': 'vcsgm'};
    const revealRequestedOption = async () => {
      const id = optionToReveal.value;
      if (!id) return;
      optionToReveal.value = null;
      const section = OPTION_SECTION[id];
      if (section && collapsedSections.value.has(section)) {
        const next = new Set(collapsedSections.value);
        next.delete(section);
        collapsedSections.value = next;
      }
      await nextTick();
      const input = document.getElementById(id);
      const element = input && (input.closest('.v-input') || input);
      if (!element) return;
      element.scrollIntoView({behavior: 'smooth', block: 'center'});
      element.classList.add('option-revealed');
      setTimeout(() => element.classList.remove('option-revealed'), 2500);
    };
    onMounted(revealRequestedOption);
    watch(optionToReveal, revealRequestedOption);

    const configurationState = computed({
      // scoreFont is chosen on the Score tab, but is kept here so that
      // changing any other option round-trips it instead of dropping it.
      get() {
        try {
          const configuration = configurationStorage.value || structuredClone(DEFAULT_CONFIGURATION);

          // Spread (not a DEFAULT_CONFIGURATION-keys-only rebuild) so fields
          // this page doesn't know about - graphicsBanks/eventBanks, the
          // auto-relocation system's  bank-assignment cache (see
          // hooks/rom.js) - pass through untouched instead of silently
          // vanishing the moment this getter runs.
          // Per-row playfield colors is one setting for both kernels; a project from before that kept it apart for DPC+.
          const merged = {...DEFAULT_CONFIGURATION, ...configuration};
          if (merged.enableDpcPlusPfColors) {
            merged.enablePfColors = true;
            merged.enableDpcPlusPfColors = false;
          }
          return merged;
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
    // comment in hooks/rom.js): batari Basic's kernel_options never
    // allows "playercolors" alongside "no_blank_lines", so the toggle is
    // forced on and disabled rather than letting the user pick a
    // combination that's guaranteed to fail to build.
    const kernelIsDpcPlus = computed(() => configurationState.value.kernel === 'dpcplus');
    // batari Basic's playercolors rules (player1colors alongside, no no_blank_lines) are the standard kernel's.
    const player0RainbowColorsActive = computed(() => !kernelIsDpcPlus.value && usesPlayer0RainbowColors());

    // Gates every DPC+-only/std-kernel-only v-if pair in the template
    // below, and the equivalent branches in generators/bbasic.js.

    // Display-only inverted proxy for the "Show blank lines" toggle -
    // configurationState.showBlankLines itself keeps its original polarity
    // everywhere else in this file and in generators/bbasic.js
    // (effectiveShowBlankLines etc. all still read TRUE = blank lines
    // shown), since flipping that stored meaning would require touching
    // every other reader of it. Only the switch's v-model/label are
    // inverted here, so the toggle reads naturally: OFF = blank lines
    // shown (the default), ON = no blank lines (missile0 fills them in).
    const enableMissile0BlankLines = computed({
      get: () => !configurationState.value.showBlankLines,
      set: (value) => {
        const state = configurationState.value;
        state.showBlankLines = !value;
        configurationState.value = state;
      },
    });

    // Catches the block being added (or the workspace loading a project that
    // already has it) even when the user never touches this switch directly
    // themselves - not just the handleChangeConfiguration path below, which
    // only runs when some OTHER switch on this page is what triggered the
    // change. Also forces Player 1 sprite colors on: batari Basic's
    // kernel_options combination table never has a valid row with
    // "playercolors" alone, it always needs "player1colors" too (see
    // generateConfiguration's  comment in generators/bbasic.js) - so
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

    // Inlining random-number calls (see useInlineRand in bbasic.js) only
    // makes sense on a bankswitched ROM size, so it's forced off whenever
    // the ROM size changes away from one.
    const enforceInlineRandExclusivity = (state) => {
      if (!BANK_COUNT_BY_ROMSIZE[state.romSize]) {
        state.enableInlineRand = false;
      }
      return state;
    };

    const handleChangeConfiguration = () => {
      const state = configurationState.value;
      if (player0RainbowColorsActive.value) state.showBlankLines = true;
      // DPC+ has no Superchip/no_blank_lines equivalent -
      // the template hides these switches under DPC+, but force them off
      // here too in case an old project has them set from before the
      // kernel was switched. rand16 is different: DPC+ has its own
      // hardware-based 32-bit LFSR (see real docs: "the DPC+ kernel has an
      // ARM-based 32-bit LFSR for improved random numbers, so 'dim rand16 =
      // <var>' is no longer needed") - rand16 wouldn't just be a no-op under
      // DPC+, it would waste a variable slot for nothing.
      if (state.kernel === 'dpcplus') {
        // The Superchip switch is hidden, and the setting is left as it is (it is ignored under DPC+, and the DPC+ row height
        // follows it when the project never set one).
        state.enableRand16 = false;
      }
      // A project saved while an older version kept the setting aside: it is back where it was.
      if (state.enableSuperchipStandard !== undefined) {
        state.enableSuperchip = state.enableSuperchipStandard;
        delete state.enableSuperchipStandard;
      }
      configurationState.value = enforceInlineRandExclusivity(state);
    };

    // The playfield's vertical resolution (pfres) is a single setting for the
    // whole ROM - batari Basic has no per-background override. Changing it
    // never resizes the backgrounds' pixel data.
    // The row height the field shows: the override's number while the override is on, else the height the kernel takes from pfres.
    const pfRowHeightShown = computed(() => {
      const state = configurationState.value;
      if (state.enablePfRowHeight) return state.pfrowheight;
      // Without Superchip the standard kernel has 12 rows whatever pfres says.
      const rows = (state.enableSuperchip && state.kernel !== 'dpcplus') ? Number(state.pfres) : 12;
      return rows >= MIN_PFRES ? Math.max(1, Math.floor(96 / Math.round(rows))) : state.pfrowheight;
    });
    const handleInputPfRowHeight = (value) => {
      const state = configurationState.value;
      const height = Number(value);
      if (!(height >= 1)) return;
      state.pfrowheight = Math.round(height);
      configurationState.value = state;
    };
    // The row height follows pfres as it is typed or stepped, not only once the field is left (the override's number is the height
    // that fits that many rows in the 96 steps of the screen, what the kernel itself would pick).
    const handleInputPfres = () => {
      const state = configurationState.value;
      const rows = Number(state.pfres);
      if (state.kernel === 'dpcplus') return;
      if (!(rows >= MIN_PFRES && rows <= MAX_PFRES)) return;
      state.pfrowheight = Math.max(1, Math.floor(96 / Math.round(rows)));
      configurationState.value = state;
    };
    // Turning the override on starts it at the row height the current pfres gives.
    const handleTogglePfRowHeight = () => {
      const state = configurationState.value;
      if (state.enablePfRowHeight && state.kernel !== 'dpcplus' && Number(state.pfres) >= MIN_PFRES) {
        state.pfrowheight = Math.max(1, Math.floor(96 / Math.round(Number(state.pfres))));
        configurationState.value = state;
      }
      handleChangeConfiguration();
    };
    // Both of these write the score every frame, so only one can be on (together they garble the digits).
    const handleToggleCycleScore = () => {
      const state = configurationState.value;
      if (state.enableCycleScore) state.enableScanlinesDebug = false;
      handleChangeConfiguration();
    };
    const handleToggleScanlinesScore = () => {
      const state = configurationState.value;
      if (state.enableScanlinesDebug) state.enableCycleScore = false;
      handleChangeConfiguration();
    };
    const handleChangeResolution = () => {
      const state = configurationState.value;
      state.pfres = Math.min(MAX_PFRES, Math.max(MIN_PFRES, Number(state.pfres) || MIN_PFRES));
      // The row height follows the new pfres to the height that fits that many rows in the 96 steps of the screen (what the kernel
      // itself would pick), so the rows keep filling it.
      if (state.kernel !== 'dpcplus') {
        state.pfrowheight = Math.max(1, Math.floor(96 / state.pfres));
      }
      if (state.enableSuperchip && ROM_SIZE_OPTIONS.indexOf(state.romSize) < MIN_SUPERCHIP_ROM_SIZE_INDEX) {
        state.romSize = ROM_SIZE_OPTIONS[MIN_SUPERCHIP_ROM_SIZE_INDEX];
      }
      configurationState.value = enforceInlineRandExclusivity(state);
    };

    // The row heights that fit the 192-line screen exactly, as rows on screen; picking one fills in pfres.
    const DPC_PLUS_PFRES_PRESETS = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64, 96, 192]
        .map((lines) => ({text: `${lines} scanline${lines === 1 ? '' : 's'} per row (${192 / lines} rows)`, value: 192 / lines}))
        .sort((a, b) => a.value - b.value);
    // The highest virtual sprite that is on; the ones below it are on as well (the kernel keeps them in a row).
    const dpcPlusSpriteMax = computed(() => {
      const configured = configurationState.value.dpcPlusSpriteMax;
      return configured === undefined || configured === null ? 9 : Math.min(9, Math.max(1, Number(configured) || 1));
    });
    // How many variable slots the virtual sprites that are off give to the project (see dpcPlusFreedSpriteRam).
    const dpcPlusSpriteVariableSlots = computed(() => dpcPlusFreedSpriteRam(dpcPlusSpriteMax.value, false).length);
    const handleToggleDpcPlusSprite = (number) => {
      const state = configurationState.value;
      state.dpcPlusSpriteMax = number <= dpcPlusSpriteMax.value ? number - 1 : number;
      configurationState.value = state;
      handleChangeConfiguration();
    };
    const dpcPlusPfresPreset = computed(() => {
      const current = Number(configurationState.value.dpcPlusPfres);
      return DPC_PLUS_PFRES_PRESETS.some(({value}) => value === current) ? current : null;
    });
    const handleChangeDpcPlusPfresPreset = (rows) => {
      configurationState.value.dpcPlusPfres = rows;
      handleChangeDpcPlusPfres();
    };

    // DPC+'s pfres: how many rows the playfield has (see dpcPlusPfresOf in blocks/background.js).
    const handleChangeDpcPlusPfres = () => {
      const state = configurationState.value;
      state.dpcPlusPfres = Math.min(192, Math.max(1, Math.round(Number(state.dpcPlusPfres)) || 12));
      configurationState.value = enforceInlineRandExclusivity(state);
    };

    // Unlike pfres above, this doesn't change how many rows the playfield
    // has (no reflow needed) - it only overrides the row HEIGHT the kernel
    // draws each one at (see pfRowDivisorFor in utils/playfield-coords.js,
    // which prefers this value over its  floor(96/pfres) calculation
    // whenever the "Override playfield row height" switch above is on), so
    // background pixel data stays exactly as-is. Whether the override is
    // APPLIED is entirely the switch's  job (enablePfRowHeight) - this
    // field's  stored number is just clamped to a sane positive integer
    // here, same as pfres's  handleChangeResolution just above, so an
    // invalid/emptied field can't leave a NaN or 0 behind for whenever the
    // switch gets turned back on.
    const handleChangePfRowHeight = () => {
      const state = configurationState.value;
      state.pfrowheight = Math.max(1, Math.round(Number(state.pfrowheight) || DEFAULT_CONFIGURATION.pfrowheight));
      configurationState.value = state;
    };

    // With Superchip off, the app's  bookkeeping variables have to live on
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
    // preferences kept in their  separate storage (see loadLastProject's
    // comment above for why those live apart from configurationState).
    const handleResetToDefaults = () => {
      const state = configurationState.value;
      state.kernel = DEFAULT_CONFIGURATION.kernel;
      state.dpcPlusRowScanlines = DEFAULT_CONFIGURATION.dpcPlusRowScanlines;
      state.dpcPlusSpriteMax = DEFAULT_CONFIGURATION.dpcPlusSpriteMax;
      state.enableDpcPlusPfColors = DEFAULT_CONFIGURATION.enableDpcPlusPfColors;
      state.enableDpcPlusBkColors = DEFAULT_CONFIGURATION.enableDpcPlusBkColors;
      state.enableDpcPlusAudio = DEFAULT_CONFIGURATION.enableDpcPlusAudio;
      state.showScore = DEFAULT_CONFIGURATION.showScore;
      state.enableScoreFade = DEFAULT_CONFIGURATION.enableScoreFade;
      state.showBlankLines = DEFAULT_CONFIGURATION.showBlankLines;
      state.enablePlayer0SpriteColors = DEFAULT_CONFIGURATION.enablePlayer0SpriteColors;
      state.enablePlayer1SpriteColors = DEFAULT_CONFIGURATION.enablePlayer1SpriteColors;
      state.enablePfColors = DEFAULT_CONFIGURATION.enablePfColors;
      state.enableSuperchip = DEFAULT_CONFIGURATION.enableSuperchip;
      state.enableOptimizationSpeed = DEFAULT_CONFIGURATION.enableOptimizationSpeed;
      state.enableFastMath = DEFAULT_CONFIGURATION.enableFastMath;
      state.enableInlineRand = DEFAULT_CONFIGURATION.enableInlineRand;
      state.enableRand16 = DEFAULT_CONFIGURATION.enableRand16;
      state.enableCycleScore = DEFAULT_CONFIGURATION.enableCycleScore;
      state.enableScanlinesDebug = DEFAULT_CONFIGURATION.enableScanlinesDebug;
      state.muteAllAudio = DEFAULT_CONFIGURATION.muteAllAudio;
      state.showVariableComments = DEFAULT_CONFIGURATION.showVariableComments;
      configurationState.value = state;

      loadLastProject.value = false;
      showStartupTips.value = true;
      checkForUpdates.value = true;
      muteBlocklySounds.value = false;
      adaptiveFrameSkip.value = true;
      hideDescriptionText.value = false;
      hideToolbarLabels.value = false;
      projectAutoIncrementVersion.value = false;
    };

    return {
      configurationState,
      handleChangeConfiguration, handleToggleCycleScore, handleToggleScanlinesScore,
      handleChangeResolution, handleInputPfres, handleTogglePfRowHeight, pfRowHeightShown, handleInputPfRowHeight, handleChangeDpcPlusPfres, handleChangeDpcPlusPfresPreset, dpcPlusPfresPreset, dpcPlusSpriteMax, dpcPlusSpriteVariableSlots, handleToggleDpcPlusSprite,
      DPC_PLUS_PFRES_PRESETS,
      handleChangePfRowHeight,
      handleToggleSuperchip,
      handleResetToDefaults,
      romSizeOptions,
      tvStandardOptions: TV_STANDARD_OPTIONS,
      romSizeIsBankswitched,
      player0RainbowColorsActive,
      kernelIsDpcPlus,
      kernelOptions: KERNEL_OPTIONS,
      enableMissile0BlankLines,
      loadLastProject, showStartupTips, checkForUpdates, undoLimit, MIN_UNDO_LIMIT, MAX_UNDO_LIMIT,
      muteBlocklySounds, adaptiveFrameSkip, emulatorSettings, hideSidebar, hideTopToolbar, darkMode, desaturateBlocklyColors, colorblindMode,
      hideDescriptionText,
      hideToolbarLabels,
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
   full height via top/bottom rather than a hardcoded height, with its
   overflow: auto. That keeps the scrollbar attached to this tab's
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

/* A solid background (no "text" prop, matching Select all/Select none/
   Cancel/Refresh emulator - see their comments) - a plain flat/text
   button here read as too easy to miss for a whole-page reset action. */
.reset-to-defaults-btn {
  margin-bottom: 16px;
}

/* Same fade-in-on-hover/blue-on-press color pattern as every flat-icon
   button elsewhere in the app (e.g. Project.vue's
   .project-flat-icon-btn, GeneratedCode.vue's
   .generated-code-flat-icon-btn) - here applied to the button's TEXT color
   instead of an icon's, since this button has a label, not an icon. */
.reset-to-defaults-btn.v-btn {
  color: rgba(0, 0, 0, 0.38) !important;
}

.reset-to-defaults-btn.v-btn:hover {
  color: rgba(0, 0, 0, 0.87) !important;
}

.reset-to-defaults-btn.v-btn:active {
  color: var(--v-primary-base, #1976d2) !important;
}

/* Left-aligned collapse chevron + section title - matches the other tabs'
   per-card collapse control (e.g. DataEditor's .data-collapse-btn),
   rather than Vuetify's v-expansion-panel-header, which puts its arrow
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

/* Track width (32px) and checked-state thumb travel (18px) are now App.vue's
   global ".v-input--switch__track"/".v-input--switch.v-input--is-dirty
   .v-input--switch__thumb" rules, applying the same narrower toggle style
   to every tab, not just this one - see App.vue's comment for why (a
   real reported inconsistency: every other tab's switches stayed at
   Vuetify's wider default). Nothing left to scope here.

   Vuetify aligns a switch's hint under the toggle track by default; indent it
   to line up under the label text instead, matching the toggle's width. */
.undo-limit-field {
  max-width: 24rem;
  margin-bottom: 8px;
}

.option-switch >>> .v-messages {
  margin-left: 46px;
}

/* Vuetify's ".v-input--selection-controls" gives every switch a fixed
   16px margin-top regardless of whether its hint text is even showing
   (see node_modules/vuetify/dist/vuetify.css) - once "Expert mode" (see
   App.vue's hide-description-text support) removes that hint text,
   that much space between switches reads as too generous with nothing left
   below to justify it. Only switches that FOLLOW another switch (the "+"
   combinator, rather than a blanket ".option-switch") - the section's
   FIRST switch sits right under its header instead, and that spacing
   is unrelated to any hint text, so it shouldn't change with this toggle. */
.hide-description-text .option-switch + .option-switch {
  margin-top: 2px;
}

/* Room between the TV standard's hint text above and this field's label. With the small
   description text hidden there is no hint to make room from. */
.rom-size-field {
  margin-top: 12px;
}

.hide-description-text .rom-size-field {
  margin-top: 0;
}

/* Reads as a sub-option of the Superchip switch above it, so it's indented to
   line up under that switch's label text rather than its toggle track.
   margin-top adds a bit of breathing room from that switch's hint text
   directly above - the two otherwise sat flush against each other. The
   field itself stays full-width (no max-width here) - only the actual
   input BOX is capped, via the deep .v-input__slot rule below - a real
   reported request: the number box (same width as MusicEditor.vue's
   .tempo-field) shouldn't stretch the whole window, but the hint text
   underneath it still should, same as every other field's hint on this
   tab, rather than wrapping narrowly beneath a tiny box. */
.pfres-field {
  margin-left: 46px;
  margin-top: 12px;
}

/* >>> (deep combinator) reaches Vuetify's internal .v-input__slot - the
   actual bordered input box - without pulling .v-text-field__details (the
   hint/error text right below it, a SIBLING of .v-input__slot, not a
   descendant) along with it, which capping .pfres-field itself (see the
   comment above) would otherwise do, since that outer element is the
   shared ancestor of both. 110px matches MusicEditor.vue's .tempo-field's
   fixed width. */
.pfres-field >>> .v-input__slot {
  max-width: 110px;
}

/* The label sits inside that 110px box, where Vuetify cuts it off with an ellipsis; let it run
   past the box so the whole field name shows. */
.pfres-field >>> .v-label,
.pfrowheight-field >>> .v-label,
.dpcplus-row-height-field >>> .v-label {
  max-width: none !important;
  overflow: visible;
  white-space: nowrap;
}

/* Same capped number box as .pfres-field, but not indented: under DPC+ this
   field isn't a sub-option of anything (no Superchip switch above it), it
   stands alone at the section's left edge. */
.dpcplus-row-height-field {
  margin-top: 12px;
}

.dpcplus-row-height-field >>> .v-input__slot {
  max-width: 110px;
}

/* The virtual sprite buttons sit right under the pfres box, labeled like its field. */
.dpcplus-sprites {
  margin-top: 4px;
  max-width: 420px;
}

/* Without the hint under them, the buttons get the space the hint would have left. */
.dpcplus-sprites-compact {
  margin-bottom: 12px;
}

.dpcplus-sprites-title {
  font-size: 12px;
  line-height: 20px;
  color: rgba(0, 0, 0, 0.6);
  margin-bottom: 4px;
}

.dark-mode .dpcplus-sprites-title {
  color: rgba(255, 255, 255, 0.7);
}

.dpcplus-sprites-buttons {
  display: flex;
  gap: 2px;
}

.dpcplus-sprite-button {
  min-width: 28px !important;
  padding: 0 !important;
}

.dpcplus-sprites-hint {
  font-size: 12px;
  opacity: 0.7;
  margin-top: 4px;
}

/* The presets list sits right under the pfres box, as wide as its longest entry. */
.dpcplus-pfres-presets {
  margin-top: 28px;
  max-width: 320px;
}

/* See App.vue's "Hide small description text" support - with that
   switch's hint text gone, there's no longer anything for the margin-top
   above to create breathing room from, so it can sit right under the
   switch itself again. */
.hide-description-text .pfres-field {
  margin-top: 0;
}

/* Same reasoning as .pfres-field above (including the deep .v-input__slot
   cap), one level further down - it reads as a sub-option of the "Override
   playfield row height" switch right above it. */
.pfrowheight-field {
  margin-left: 46px;
  margin-top: 12px;
}

.pfrowheight-field >>> .v-input__slot {
  max-width: 110px;
}

.hide-description-text .pfrowheight-field {
  margin-top: 0;
}

/* The "Override playfield row height" switch reads as belonging with
   Superchip's switch (it's the next "advanced ROM knob" down the list),
   even though .pfres-field sits between them in the DOM, so it sits close
   under that field with or without the description text showing. */
.pfrowheight-switch {
  margin-top: 2px;
}
/* The option the tips popup's link took the user to flashes once. */
.option-revealed {
  background-color: rgba(25, 118, 210, 0.15);
  border-radius: 4px;
}
</style>
