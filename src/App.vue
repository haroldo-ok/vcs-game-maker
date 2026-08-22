<template>
  <v-app id="inspire" :class="{'hide-description-text': hideDescriptionText}">
    <div
      class="app-logo"
      :class="{'app-logo-hidden': !drawer, 'app-logo-no-transition': !logoTransitionsEnabled}"
    >
      <img src="./assets/logo.svg" alt="VCS Game Maker" class="app-logo-img" />
      <div class="app-logo-version">{{ version }}</div>
    </div>

    <v-app-bar
      app
      clipped-right
      flat
      height="72"
      color="white"
      class="navigation-list top-toolbar"
    >
        <v-btn to="/" link text class="actions-item" title="Actions" elevation="0">
          <v-icon>mdi-chart-scatter-plot</v-icon>
        </v-btn>

        <v-btn to="/player0" link text class="player0-item" title="Player 0" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
        </v-btn>

        <v-btn to="/player1" link text class="player1-item" title="Player 1" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
        </v-btn>

        <v-btn to="/background" link text class="background-item" title="Background" elevation="0">
          <v-icon>mdi-map</v-icon>
        </v-btn>

        <v-btn to="/soundfx" link text class="sound-item" title="Sound" elevation="0">
          <v-icon>mdi-waveform</v-icon>
        </v-btn>

        <v-btn to="/music" link text class="music-item" title="Music" elevation="0">
          <v-icon>mdi-music-note</v-icon>
        </v-btn>

        <v-btn to="/scorefont" link text class="scorefont-item" title="Score" elevation="0">
          <v-icon>mdi-numeric</v-icon>
        </v-btn>

        <v-btn to="/text" link text class="text-tab-item" title="Text" elevation="0">
          <v-icon>mdi-card-text-outline</v-icon>
        </v-btn>

        <v-btn to="/data" link text class="data-item" title="Data" elevation="0">
          <v-icon>mdi-table</v-icon>
        </v-btn>

        <v-btn to="/configuration" link text class="configuration-item" title="Options" elevation="0">
          <v-icon>mdi-cog</v-icon>
        </v-btn>

        <v-btn to="/generated" link text class="generated-item" title="Generated" elevation="0">
          <v-icon>mdi-card-text</v-icon>
        </v-btn>

        <v-btn to="/project" link text class="project-item" title="Project" elevation="0">
          <v-icon>mdi-pencil-ruler</v-icon>
        </v-btn>
    </v-app-bar>

    <v-navigation-drawer
      v-model="drawer"
      app
      clipped
      width="200"
      class="nav-drawer"
    >
      <div class="nav-drawer-inner" :style="{paddingBottom: errorHeight + 'px'}">
      <v-list
        shaped
        class="navigation-list"
      >
        <v-list-item
          to="/"
          link
          class="actions-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-chart-scatter-plot</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Actions</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/player0"
          link
          class="player0-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Player 0</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/player1"
          link
          class="player1-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-human-handsup</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Player 1</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/background"
          link
          class="background-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-map</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Background</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/soundfx"
          link
          class="sound-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-waveform</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Sound</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/music"
          link
          class="music-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-music-note</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Music α</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/scorefont"
          link
          class="scorefont-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-numeric</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Score</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/text"
          link
          class="text-tab-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-card-text-outline</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Text</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/data"
          link
          class="data-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-table</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Data</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/configuration"
          link
          class="configuration-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-cog</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Options</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/generated"
          link
          class="generated-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-card-text</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Generated</v-list-item-title>
          </v-list-item-content>
        </v-list-item>

        <v-list-item
          to="/project"
          link
          class="project-item"
        >
          <v-list-item-icon>
            <v-icon>mdi-pencil-ruler</v-icon>
          </v-list-item-icon>
          <v-list-item-content>
            <v-list-item-title>Project</v-list-item-title>
          </v-list-item-content>
        </v-list-item>
      </v-list>
      </div>
    </v-navigation-drawer>

    <v-navigation-drawer
      v-model="emulatorVisible"
      app
      clipped
      right
      class="emulator-drawer"
      :width="emulatorWidth"
    >
      <div class="emulator-drawer-inner" :style="{paddingBottom: errorHeight + 'px'}">
        <v-btn
          block
          small
          text
          class="emulator-refresh-button"
          title="Reload the page to fix the emulator preview if it has disappeared - you'll need to click Update ROM again afterward"
          @click="handleRefreshEmulator"
        >
          <v-icon left small>mdi-refresh</v-icon>
          Refresh emulator
        </v-btn>
        <div id="javatari-target-container" :style="emulatorScaleStyle"></div>
        <v-btn
          block
          class="mt-2"
          :color="romOutdated ? 'warning' : 'primary'"
          :loading="building"
          @click="handleRomUpdate"
        >
          {{ romOutdated ? 'Update ROM' : 'ROM up to date' }}
        </v-btn>
        <v-btn block color="primary" class="mt-2" @click="handleRomDownload">
          Get generated ROM
        </v-btn>
        <div
          v-if="romCapacityText"
          class="rom-capacity"
          :class="romCapacityLow ? 'rom-capacity-low' : ''"
        >
          {{ romCapacityText }}
        </div>
        <v-progress-linear
          v-if="romCapacityText"
          :value="romCapacityPercentFilled"
          :color="romCapacityBarColor"
          height="6"
          rounded
          class="rom-capacity-bar"
        />
        <div v-if="romCapacitySummary" class="rom-capacity-summary">{{ romCapacitySummary }}</div>
        <div v-if="romVariablesText" class="rom-capacity-summary">{{ romVariablesText }}</div>
        <div v-if="romCapacityBanks.length" class="rom-capacity-detail">
          <div v-for="bank in romCapacityBanks" :key="bank.number" class="rom-capacity-bank">
            <div class="rom-capacity-bank-header">
              <strong>Bank {{ bank.number }}:</strong> {{ bank.freeText }}
            </div>
            <div v-if="bank.contents.length" class="rom-capacity-bank-contents">
              <div v-for="part in bank.contents" :key="part.label">
                <strong>{{ part.label }}{{ part.names ? ':' : '' }}</strong> {{ part.names }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </v-navigation-drawer>

    <div
      v-if="emulatorVisible"
      class="emulator-resize-handle"
      title="Drag to resize the emulator"
      :style="{right: (emulatorWidth - 5) + 'px', bottom: errorHeight + 'px'}"
      @mousedown.prevent="startResize"
    ></div>

    <v-btn
      v-if="emulatorVisible"
      fab
      x-small
      dark
      color="grey"
      title="Hide the emulator preview to free up more space for the block editor"
      class="emulator-hide-button emulator-toggle-button"
      :style="{right: emulatorWidth + 'px'}"
      @click="emulatorVisible = false"
    >
      <v-icon small>mdi-chevron-right</v-icon>
    </v-btn>

    <v-btn
      v-if="!emulatorVisible"
      fab
      x-small
      dark
      color="grey"
      title="Show the emulator preview"
      class="emulator-show-button emulator-toggle-button"
      @click="emulatorVisible = true"
    >
      <v-icon small>mdi-chevron-left</v-icon>
    </v-btn>

    <v-main class="app-main">
      <div class="app-main-inner" :style="{height: `calc(100% - ${errorHeight}px)`}">
        <router-view/>
      </div>
    </v-main>

    <v-footer class="error-message" :style="{height: errorHeight + 'px', maxHeight: errorHeight + 'px'}">
      <div
        class="error-resize-handle"
        title="Drag to resize the error pane"
        @mousedown.prevent="startResizeError"
      ></div>
      <div class="error-scroll-wrapper">
        <div class="error-console-content">
          <div
            v-for="(entry, index) in compileLog"
            :key="index"
            class="compile-log-line"
            :class="entry.level === 'error' ? 'compile-log-error' : 'compile-log-info'"
            :style="{fontWeight: entry.level === 'stage' ? 'bold' : 'normal'}"
          >{{ entry.text }}</div>
          <pre v-if="errorStorage" v-text="errorStorage"></pre>
        </div>
      </div>
    </v-footer>
  </v-app>
</template>

<script>
import {useCompileLog, useErrorStorage, useHideDescriptionTextStorage} from './hooks/project';
import {buildRom, useRomCapacity, useRomOutdated} from './hooks/rom';
import {productName, version} from '../package.json';

// Below this fraction of the bank's usable space remaining, the capacity
// display switches to a warning color.
const ROM_CAPACITY_LOW_THRESHOLD = 0.1;

// Javatari renders at a fixed size and never reflows to fit its container, so
// the emulator is scaled with a CSS transform instead. It picks that size from
// the space available when it starts, so it varies with the window and has to
// be measured rather than assumed.
const EMULATOR_DEFAULT_WIDTH = 256;
const EMULATOR_MIN_WIDTH = 200;
const EMULATOR_MAX_WIDTH = 900;
// Keep enough room for the editor when dragging on smaller screens.
const EDITOR_MIN_WIDTH = 320;
const EMULATOR_WIDTH_KEY = 'vcs-game-maker.emulatorWidth';
// Whether the emulator drawer is shown at all - separate from emulatorWidth
// (which only ever remembers its width while visible), so hiding it to free
// up space for the block editor survives a reload instead of resetting
// every time.
const EMULATOR_VISIBLE_KEY = 'vcs-game-maker.emulatorVisible';
// Matches the footer's old fixed "max-height: 7em" (at the default 16px root
// font size) as the default/minimum, so an unresized pane looks the same as
// before this was made resizable.
const ERROR_DEFAULT_HEIGHT = 112;
const ERROR_MIN_HEIGHT = 112;
// Leaves at least this much of the window for everything else (toolbar, main
// content) when dragging the error pane very tall.
const ERROR_MIN_REMAINING_HEIGHT = 150;
const ERROR_HEIGHT_KEY = 'vcs-game-maker.errorHeight';
// How long to keep waiting for Javatari to lay out before giving up. A timer
// is used rather than an animation frame so this still settles when the window
// is in the background.
const EMULATOR_MEASURE_RETRIES = 60;
const EMULATOR_MEASURE_INTERVAL = 50;

const readStoredWidth = () => {
  const stored = parseInt(localStorage.getItem(EMULATOR_WIDTH_KEY), 10);
  return Number.isFinite(stored) ? stored : EMULATOR_DEFAULT_WIDTH;
};

const readStoredErrorHeight = () => {
  const stored = parseInt(localStorage.getItem(ERROR_HEIGHT_KEY), 10);
  return Number.isFinite(stored) ? stored : ERROR_DEFAULT_HEIGHT;
};

// Stored as the raw string "false" (not JSON-encoded) - same convention as
// useLoadLastProjectStorage in hooks/project.js. Anything else, including
// never having been set, means "visible" (the default).
const readStoredEmulatorVisible = () => localStorage.getItem(EMULATOR_VISIBLE_KEY) !== 'false';

export default {
  data: () => ({
    drawer: null,
    // Starts false so the logo's own opacity/transform transition (see
    // .app-logo's own CSS) is suppressed for whatever the FIRST real class
    // change turns out to be - "drawer" itself starts null, only settling
    // to its real true/false value once Vuetify's own v-navigation-drawer
    // resolves its responsive default on mount, which was animating the
    // logo in on every single page load/refresh, not just on a real
    // sidebar toggle the user actually triggered. Flipped true shortly
    // after mount (see mounted() below), once that initial settling has
    // had a chance to happen.
    logoTransitionsEnabled: false,
    emulatorWidth: readStoredWidth(),
    emulatorVisible: readStoredEmulatorVisible(),
    emulatorScale: 1,
    emulatorHeight: null,
    resizing: false,
    errorHeight: readStoredErrorHeight(),
    resizingError: false,
    building: false,
  }),
  setup() {
    const errorStorage = useErrorStorage();
    console.info('Text', version);
    return {
      errorStorage, compileLog: useCompileLog(), romOutdated: useRomOutdated(), romCapacity: useRomCapacity(),
      productName, version, hideDescriptionTextStorage: useHideDescriptionTextStorage(),
    };
  },
  mounted() {
    this.attachEmulator();
    window.addEventListener('resize', this.handleWindowResize);
    // Waits for the DOM to actually paint the drawer's own initial settled
    // state (Vue's own $nextTick alone only guarantees the DOM has been
    // patched, not that the browser has painted it yet - a raf after that
    // is the usual way to wait for the actual paint) before turning the
    // logo's transition back on, so that initial settling can't itself be
    // animated - only a real, later toggle the user triggers.
    this.$nextTick(() => {
      requestAnimationFrame(() => {
        this.logoTransitionsEnabled = true;
      });
    });
  },
  beforeDestroy() {
    this.stopResize();
    window.removeEventListener('resize', this.handleWindowResize);
    if (this.emulatorResizeObserver) {
      this.emulatorResizeObserver.disconnect();
      this.emulatorResizeObserver = null;
    }
    if (this.emulatorReparentObserver) {
      this.emulatorReparentObserver.disconnect();
      this.emulatorReparentObserver = null;
    }
  },
  computed: {
    // See Configuration.vue's "Expert mode" switch - reads the same standing
    // app preference (useHideDescriptionTextStorage, see its own comment in
    // hooks/project.js - not part of the project itself, unlike the rest of
    // configurationState), bound as a class on the root v-app below so the
    // global ".hide-description-text .v-messages__message" CSS rule can
    // reach every hint/description paragraph in the app from one place,
    // now that they all consistently use that same class (see TextEditor.vue's
    // own hint paragraph for the pattern every other tab's hint text follows).
    hideDescriptionText() {
      // this.hideDescriptionTextStorage is a computed RETURNED from setup() -
      // Vue's Composition API auto-unwraps that when accessed through the
      // component instance (confirmed against this file's own romCapacityText
      // above, which reads "this.romCapacity" the same unwrapped way), so
      // it's already the plain boolean here, not a ref needing its own
      // ".value".
      return !!this.hideDescriptionTextStorage;
    },
    emulatorScaleStyle() {
      return {
        '--emulator-scale': this.emulatorScale,
        'height': this.emulatorHeight === null ? null : `${this.emulatorHeight}px`,
      };
    },
    // Reflects the last successful build, not necessarily the current
    // (possibly-edited-since) project - same staleness the "Update ROM"/"ROM
    // up to date" button above already has, so no separate warning for it.
    // Shows the total across every bank the ROM size actually provides (this
    // is the number that grows when you pick a bigger ROM size), while the
    // "low" warning still keys off bank 1 specifically - that's the one bank
    // that always holds the project's unrelocatable main body, so it's the
    // more actionable signal for "about to need relocation".
    romCapacityText() {
      const capacity = this.romCapacity;
      if (!capacity) return '';
      return `${capacity.total.freeBytes.toLocaleString()} bytes free`;
    },
    // Feeds the progress bar right under the "bytes free" line above -
    // same total-across-every-bank figure that text is already built from,
    // just expressed as a 0-100 percentage instead of a byte count.
    romCapacityPercentFilled() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.total.usableBytes) return 0;
      const used = capacity.total.usableBytes - capacity.total.freeBytes;
      return (used / capacity.total.usableBytes) * 100;
    },
    // Plain, always-visible, selectable text (see the summary/per-bank
    // blocks right under the "bytes free" line in the template) rather than
    // a native title="..." tooltip - a browser tooltip can't be
    // selected/copied at all, which defeats the whole point of this existing
    // specifically to be pasted into a bug report or back into this
    // conversation.
    romCapacitySummary() {
      const capacity = this.romCapacity;
      if (!capacity) return '';
      const totalUsed = capacity.total.usableBytes - capacity.total.freeBytes;
      const bank1Used = capacity.bank1.usableBytes - capacity.bank1.freeBytes;
      return `${totalUsed.toLocaleString()} of ${capacity.total.usableBytes.toLocaleString()} bytes used ` +
        `across every bank (bank 1, which always holds your main code, is ` +
        `${bank1Used.toLocaleString()} of ${capacity.bank1.usableBytes.toLocaleString()} used)`;
    },
    // Variable-pool usage (see hooks/rom.js's computeVariableUsage) - shown
    // separately from the byte-capacity text above since these are a
    // completely different, hard-capped resource (25-55 slots project-wide
    // depending on Superchip, not bytes) that can run out well before ROM
    // space does. Superchip's own half is omitted entirely when it's off
    // (available is 0 then - see computeVariableUsage's own comment) rather
    // than shown as "0 of 0", which would read as broken rather than simply
    // not applicable yet.
    romVariablesText() {
      const usage = this.romCapacity && this.romCapacity.variableUsage;
      if (!usage) return '';
      const letters = `${usage.letters.used} of ${usage.letters.available} letters`;
      if (!usage.superchip.available) return `Variables: ${letters} used.`;
      return `Variables: ${letters}, ${usage.superchip.used} of ${usage.superchip.available} Superchip RAM used.`;
    },
    // Per-bank breakdown (see computeRomCapacity's own perBank field) - the
    // summary above averages over every bank, which can look like there's
    // plenty of room even when a SPECIFIC bank (the one a new relocated unit
    // would actually need to land in) has almost none left. Each bank's own
    // contents (see hooks/rom.js's computeBankContents) are rendered right
    // under its own "free" line - covers every bank, not just ones something
    // got relocated INTO this build (the old autoRelocatedEventsText this
    // replaced only ever showed those).
    romCapacityBanks() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.perBank || !capacity.perBank.length) return [];
      return capacity.perBank.map((bank, i) => ({
        number: i + 1,
        freeText: `${bank.freeBytes.toLocaleString()} free`,
        contents: this.bankContentsParts(i + 1),
      }));
    },
    // Drives the "bytes free" text turning red, and the capacity bar's own
    // red tier (see romCapacityBarColor) - keyed off the TOTAL across every
    // bank (matching what "bytes free" itself already shows), at the user's
    // own explicit request, rather than bank 1 specifically.
    romCapacityLow() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.total.usableBytes) return false;
      return capacity.total.freeBytes / capacity.total.usableBytes < ROM_CAPACITY_LOW_THRESHOLD;
    },
    // Three-tier: red once genuinely close to full (romCapacityLow - same
    // threshold/text the "bytes free" line itself already turns red at),
    // orange past 80% as an earlier heads-up, otherwise the same blue
    // "primary" color used elsewhere in the app (e.g. the Update ROM
    // button).
    romCapacityBarColor() {
      if (this.romCapacityLow) return 'red';
      if (this.romCapacityPercentFilled > 80) return 'warning';
      return 'primary';
    },
  },
  watch: {
    emulatorWidth() {
      // Wait for the drawer's new width to reach the DOM before measuring.
      this.$nextTick(this.updateEmulatorScale);
    },
    emulatorVisible(value) {
      localStorage.setItem(EMULATOR_VISIBLE_KEY, value ? 'true' : 'false');
      // Re-measure once it's shown again - updateEmulatorScale's own retry
      // loop already tolerates being called before the drawer's slide-in
      // transition (transform/visibility - see .emulator-drawer's own
      // transition-property) finishes, the same way it already tolerates a
      // width-drag mid-reflow.
      if (value) this.$nextTick(this.updateEmulatorScale);
    },
  },
  methods: {
    // Formats one bank's own contents (see hooks/rom.js's computeBankContents)
    // as a list of {label, names} entries for romCapacityBanks's own per-bank
    // entry - one entry per kind present (rather than one long comma-separated
    // line) so a bank holding several different kinds of content stays
    // scannable, and an empty array for a bank with nothing in it. Kept
    // structured (not pre-joined into one string) so the template can bold
    // just the label - see .rom-capacity-bank-contents in the template.
    bankContentsParts(bankNumber) {
      const contents = this.romCapacity && this.romCapacity.bankContents && this.romCapacity.bankContents[bankNumber];
      if (!contents) return [];
      const groups = [
        ['Events', contents.events],
        ['Backgrounds', contents.backgrounds],
        ['Player 0', contents.player0Sprites],
        ['Player 1', contents.player1Sprites],
        ['Music', contents.music],
        ['Subroutines', contents.subroutines],
        ['Data tables', contents.dataTables],
      ];
      const parts = groups
          .filter(([, names]) => names.length)
          .map(([label, names]) => ({label, names: names.join(', ')}));
      if (contents.textMinikernel) parts.push({label: 'Text Minikernel', names: ''});
      return parts;
    },
    // Javatari's own size is whatever it chose at startup, so scale it to the
    // column by measuring both. offsetWidth/offsetHeight are layout sizes and
    // so are unaffected by the transform already applied.
    // Ugly hack in order to move the Javatari screen to a Vue component.
    // Javatari builds its screen on its own schedule, so it may not exist yet
    // when this component mounts. Appending it then threw, leaving the emulator
    // missing entirely, so wait for it instead.
    attachEmulator(retriesLeft = EMULATOR_MEASURE_RETRIES) {
      const container = document.getElementById('javatari-target-container');
      const javatariScreen = document.getElementById('javatari-screen');
      if (!container) return;
      if (!javatariScreen) {
        if (retriesLeft > 0) {
          window.setTimeout(
              () => this.attachEmulator(retriesLeft - 1), EMULATOR_MEASURE_INTERVAL);
        }
        return;
      }
      container.appendChild(javatariScreen);
      this.resetScreenStyle(javatariScreen);
      this.observeEmulatorSize(container, javatariScreen);
      this.observeEmulatorReparenting(container);
      this.pollEmulatorVisibility(container);
      this.updateEmulatorScale();
    },
    // Wipes the screen element's inline style (Javatari sets some of its own
    // when it owns the element's placement, e.g. while it's parked in its
    // default DOM location) EXCEPT margin-bottom, which Javatari also uses,
    // separately, to reserve room below the screen for its own console-panel
    // graphic (power/reset/difficulty switches) whenever that panel is
    // active. A blanket "style = ''" here used to wipe that margin along with
    // everything else; updateEmulatorScale() then sized the container from
    // the now-zero margin, and since the container clips overflow, the panel
    // was still being drawn - just below the bottom edge of a container too
    // short to show it. Confirmed by manually restoring the margin and
    // triggering a rescale, which brought the panel back with no other
    // change. Preserving it here keeps the container sized to include it.
    resetScreenStyle(screen) {
      const marginBottom = screen.style.marginBottom;
      screen.style = '';
      screen.style.marginBottom = marginBottom;
    },
    // Javatari sometimes re-inserts its own screen element back into its
    // default location in the DOM (observed after loading a new ROM via
    // "Update ROM") rather than leaving it where attachEmulator() moved it -
    // since our layout only shows what's inside #javatari-target-container,
    // this makes the preview appear to vanish. A single re-attach right after
    // a build finishes (handleRomUpdate already does this) isn't reliable if
    // Javatari does the move on its own schedule; watching for it and moving
    // the screen back the moment it happens is more robust than reacting only
    // once, after the fact.
    //
    // Also dismisses Javatari's own dialogs here rather than only once from
    // handleRomUpdate - see dismissEmulatorDialogs()'s own comment for why a
    // dialog can open on Javatari's own schedule, after the one-shot
    // post-build call already ran, and previously stayed open forever since
    // nothing ever checked again. "attributes: true" with a class filter is
    // needed for that: opening a dialog toggles an existing element's
    // "jt-show" class rather than inserting a new node, which the
    // childList-only observer below never saw.
    // Shared by both the event-driven MutationObserver below and the
    // time-based poller (pollEmulatorVisibility) - the observer only fires
    // for mutations it was specifically told to watch (childList, "class",
    // "style"), so any OTHER way the screen could end up hidden or
    // misplaced (a Javatari-internal state change that doesn't touch those,
    // or one this app doesn't know about yet) would slip past it silently.
    // Polling the same check on a timer catches those too, since it doesn't
    // depend on knowing what caused the problem - only on verifying the
    // current state is correct.
    checkAndFixEmulatorVisibility(container) {
      this.dismissEmulatorDialogs();
      const screen = document.getElementById('javatari-screen');
      if (!screen) return;
      const reparented = screen.parentElement !== container;
      if (reparented) container.appendChild(screen);
      if (reparented || screen.style.display === 'none' || screen.style.visibility === 'hidden' ||
          screen.style.opacity === '0') {
        this.resetScreenStyle(screen);
        this.updateEmulatorScale();
      }
    },
    observeEmulatorReparenting(container) {
      if (this.emulatorReparentObserver) return;
      this.emulatorReparentObserver = new MutationObserver(() => this.checkAndFixEmulatorVisibility(container));
      this.emulatorReparentObserver.observe(document.body,
          {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style']});
    },
    // Time-based backstop for whatever the event-driven observer above
    // misses - see checkAndFixEmulatorVisibility's own comment. Runs
    // indefinitely (this component is never unmounted in normal use - it's
    // the app's own root), so no clearInterval on a matching lifecycle hook.
    pollEmulatorVisibility(container) {
      if (this.emulatorVisibilityPoller) return;
      this.emulatorVisibilityPoller = window.setInterval(
          () => this.checkAndFixEmulatorVisibility(container), 500);
    },
    // Root cause of the preview "vanishing" after "Update ROM": Javatari's
    // own "Select Cartridge"/"Select ROM Format"/"Save/Load State" dialogs
    // (all share the "jt-select-dialog" class, shown/hidden via the "jt-show"
    // class) are drawn on TOP of the screen at a high z-index. If one is
    // already open - most commonly the cartridge chooser, which Javatari
    // opens on its own at startup whenever there's no cartridge inserted yet
    // and it has recent ROMs to offer - loading a new ROM via
    // fileLoader.loadFromContent() builds and runs it correctly underneath,
    // but doesn't close whatever dialog happened to already be open, leaving
    // it covering the now-running game. Removing "jt-show" from every such
    // dialog closes them the same way Javatari's own Escape-key handler does,
    // without triggering any of their side effects (loading a different ROM,
    // opening a file picker, etc. - those only run from their own dialog
    // button/key handlers, not from this class removal).
    dismissEmulatorDialogs() {
      document.querySelectorAll('.jt-select-dialog.jt-show')
          .forEach((dialog) => dialog.classList.remove('jt-show'));
    },
    // A single measurement is fragile: if it runs while the container's width
    // has not settled to the drawer width yet, the scale comes out too large,
    // the fixed container height too tall, and the ROM buttons get pushed out
    // of the drawer. Re-measuring whenever the container's width actually
    // changes makes the height self-correct once layout settles, instead of
    // staying wrong until the user resizes.
    //
    // Also watches the Javatari screen element itself, not just the
    // container: toggling Javatari's own fullscreen button changes the
    // screen's *intrinsic* size (screen.offsetWidth/offsetHeight, what the
    // scale is computed from), without necessarily changing the container's
    // width - leaving the container-only check above blind to it, so the
    // scale stayed stuck at whatever it was before fullscreen and the
    // preview came back the wrong size after exiting.
    observeEmulatorSize(container, screen) {
      if (this.emulatorResizeObserver || typeof ResizeObserver === 'undefined') {
        return;
      }
      // The callback sets the container's height, which the observer reports
      // back as a size change; reacting to that would loop. Only the width
      // matters for the scale and we never set it here, so ignore reports that
      // leave it unchanged, and defer to an animation frame so the measurement
      // never runs inside notification delivery.
      this.emulatorResizeObserver = new ResizeObserver(() => {
        if (this.emulatorResizePending) return;
        this.emulatorResizePending = true;
        window.requestAnimationFrame(() => {
          this.emulatorResizePending = false;
          const width = container.clientWidth;
          const screenWidth = screen.offsetWidth;
          const screenHeight = screen.offsetHeight;
          if (width === this.lastEmulatorWidth &&
              screenWidth === this.lastScreenWidth &&
              screenHeight === this.lastScreenHeight) {
            return;
          }
          this.lastEmulatorWidth = width;
          this.lastScreenWidth = screenWidth;
          this.lastScreenHeight = screenHeight;
          this.updateEmulatorScale();
        });
      });
      this.emulatorResizeObserver.observe(container);
      this.emulatorResizeObserver.observe(screen);
    },
    // Listener wrapper, so the event object is not taken as a retry count.
    handleWindowResize() {
      this.updateEmulatorScale();
    },
    updateEmulatorScale(retriesLeft = EMULATOR_MEASURE_RETRIES) {
      const container = document.getElementById('javatari-target-container');
      const screen = document.getElementById('javatari-screen');
      if (!container || !screen) return;
      // Javatari lays out after this component mounts, so it may still have no
      // size. Measuring then would collapse the container to zero height and
      // clip the emulator away entirely. Also guards the container's own
      // width, not just the screen's - this is called synchronously right
      // after a ROM build finishes (see handleRomUpdate), which can land
      // before the drawer has laid out again since the last reflow, momentarily
      // reading clientWidth as 0. That zeroes emulatorScale, which both sets
      // this container's CSS height to a literal "0px" and (via
      // "transform: scale(var(--emulator-scale))") shrinks the emulator's
      // actual content to nothing - and since nothing else re-triggers a
      // recalculation afterward, it stayed that way instead of self-correcting.
      if (!container.clientWidth || !screen.offsetWidth || !screen.offsetHeight) {
        if (retriesLeft > 0) {
          window.setTimeout(
              () => this.updateEmulatorScale(retriesLeft - 1), EMULATOR_MEASURE_INTERVAL);
        }
        return;
      }
      const marginBottom = parseFloat(getComputedStyle(screen).marginBottom) || 0;
      this.emulatorScale = container.clientWidth / screen.offsetWidth;
      this.emulatorHeight =
        Math.round((screen.offsetHeight + marginBottom) * this.emulatorScale);
    },
    startResize() {
      this.resizing = true;
      window.addEventListener('mousemove', this.doResize);
      window.addEventListener('mouseup', this.stopResize);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ew-resize';
    },
    doResize(event) {
      const maxWidth = Math.min(EMULATOR_MAX_WIDTH, window.innerWidth - EDITOR_MIN_WIDTH);
      const width = window.innerWidth - event.clientX;
      this.emulatorWidth = Math.round(
          Math.min(maxWidth, Math.max(EMULATOR_MIN_WIDTH, width)));
    },
    stopResize() {
      if (!this.resizing) return;
      this.resizing = false;
      window.removeEventListener('mousemove', this.doResize);
      window.removeEventListener('mouseup', this.stopResize);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(EMULATOR_WIDTH_KEY, String(this.emulatorWidth));
      // Nudge layout-sensitive widgets (the Blockly canvas sizes its SVG from
      // its container, and only reflows on a window resize). This has to wait
      // for the drawer's new width to be applied to the DOM, otherwise they
      // measure the previous layout.
      this.$nextTick(() => window.dispatchEvent(new Event('resize')));
    },
    startResizeError() {
      this.resizingError = true;
      window.addEventListener('mousemove', this.doResizeError);
      window.addEventListener('mouseup', this.stopResizeError);
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'ns-resize';
    },
    doResizeError(event) {
      const maxHeight = Math.max(
          ERROR_MIN_HEIGHT, window.innerHeight - ERROR_MIN_REMAINING_HEIGHT);
      const height = window.innerHeight - event.clientY;
      this.errorHeight = Math.round(
          Math.min(maxHeight, Math.max(ERROR_MIN_HEIGHT, height)));
    },
    stopResizeError() {
      if (!this.resizingError) return;
      this.resizingError = false;
      window.removeEventListener('mousemove', this.doResizeError);
      window.removeEventListener('mouseup', this.stopResizeError);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      localStorage.setItem(ERROR_HEIGHT_KEY, String(this.errorHeight));
      // Same reflow nudge as stopResize() above, for the same reason: the
      // Blockly canvas only re-measures its container (which just changed
      // height) on a window resize event, not on its own.
      this.$nextTick(() => window.dispatchEvent(new Event('resize')));
    },
    // buildRom() compiles via WASM asynchronously now (the real bB 1.9
    // toolchain, run through an in-browser WASI shim - see hooks/bb-compiler.js),
    // but the button's progress state still needs a paint before that starts,
    // hence the same setTimeout(...,0) wrapper as when this was synchronous.
    handleRomUpdate() {
      if (this.building) return;
      this.building = true;
      window.setTimeout(() => {
        buildRom().finally(() => {
          this.building = false;
          // Loading a new ROM sometimes leaves the preview looking like it
          // vanished - re-running the same attach/observe logic used on
          // mount is a cheap, safe way to re-sync regardless of the exact
          // cause (it re-finds the screen element fresh rather than
          // trusting a reference that may be stale, and re-attaching an
          // already-attached element or re-observing an already-observed
          // one is a no-op). dismissEmulatorDialogs() closes the actual
          // confirmed cause - see its own comment.
          this.dismissEmulatorDialogs();
          this.attachEmulator();
        });
      }, 0);
    },
    // Manual escape hatch for the emulator preview intermittently vanishing.
    // Re-parenting/re-styling the existing screen element (the same recovery
    // dismissEmulatorDialogs()/attachEmulator()/checkAndFixEmulatorVisibility
    // already do automatically) turned out not to be enough on its own -
    // confirmed the DOM element can be present, correctly parented, and
    // correctly styled while still showing nothing, meaning Javatari's own
    // internal rendering had actually stopped, not just been hidden or
    // misplaced. There's no supported way to restart only Javatari's
    // internals from here (it's a page-embedded <script>, not something this
    // app owns or can re-inject on its own), so this reloads the whole page
    // instead - the one guaranteed way to get a fresh, working instance.
    // Project data lives in localStorage and survives this; the compiled ROM
    // (kept in memory by Javatari) and the Generated tab's own in-memory
    // code ref don't, so the user needs to click "Update ROM" again
    // afterward. Deliberately NOT done automatically here: if a bad ROM is
    // itself what froze the emulator, auto-rebuilding it the moment the
    // page comes back up would just re-trigger the same freeze immediately,
    // soft-locking the user out of ever seeing a stable page to fix the
    // project from.
    handleRefreshEmulator() {
      window.location.reload();
    },
    handleRomDownload() {
      if (!window.Javatari?.compiledResult) {
        this.errorStorage.value =
          'There is no compiled ROM yet; use "Update ROM" first.';
        return;
      }
      const blob = new Blob([Javatari.compiledResult.output], {type: 'application/octet-stream'});
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = 'compiled-rom.bin';
      link.click();
    },
  },
};
</script>
<!-- Unscoped: #javatari-screen is injected by Javatari at runtime, so it never
     carries this component's scope attribute. -->
<style>
/* The app's own default font, as a custom property so switching it later
   (see public/index.html's own <link> for the actual font file/weights)
   only means changing this one value, not hunting down every place that
   might otherwise hardcode a font name. .v-application is the exact
   selector Vuetify's own bundled CSS itself uses for its default
   (Roboto) font-family - matching it here, with !important, is what lets
   this override win over that built-in rule instead of just adding a
   second, lower-priority one beside it. */
:root {
  --app-font-family: 'Inter', sans-serif;
}

/* Every scrollbar in the app (the left sidebar, the emulator column, each
   editor tab's own scroll area, the error console) was previously left at
   the browser's own default width/appearance - unstyled anywhere in this
   codebase (confirmed directly, no "::-webkit-scrollbar"/"scrollbar-width"
   rule existed before this one). Global rather than scoped to any one
   panel, so all of them read as one consistent, subdued design: a slim,
   low-opacity grey bar at rest (barely there until you actually look for
   it), a little darker on hover so it's still easy to find and grab. 16px
   gutter, 12px visible thumb - the thumb is narrower than the gutter via a
   transparent border + background-clip: content-box (the border eats into
   the thumb's own box without changing the gutter it's laid out in, and
   clipping the background to content-box keeps that border area from
   getting painted over) - the standard trick for "thinner bar than its own
   track." Firefox has no equivalent for a specific pixel gutter/thumb size
   (only the generic "scrollbar-width: thin/auto/none" keywords), so it only
   gets the color change here, not the exact sizing. */
/* Vuetify's default v-card corner radius (4px) is only actually visible on
   an OUTLINED card - a flat card (Options, Score, Generated, Project) has
   no border tracing that curve, so it reads as square even though the same
   4px radius is technically still there underneath. Data, Player 0/1, and
   Background all use outlined cards for each entry, where the rounding IS
   visible - overridden globally here (rather than adding "tile" to every
   individual <v-card outlined> across the app) so every outlined card reads
   consistently square everywhere, present and future, in one place. */
.v-sheet--outlined {
  border-radius: 0 !important;
}

* {
  scrollbar-color: rgba(0, 0, 0, 0.25) transparent;
}

::-webkit-scrollbar {
  width: 16px;
  height: 16px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background-color: rgba(0, 0, 0, 0.25);
  background-clip: content-box;
  border: 2px solid transparent;
  border-radius: 8px;
}

::-webkit-scrollbar-thumb:hover {
  background-color: rgba(0, 0, 0, 0.4);
}

/* Blockly draws its own scrollbars as SVG rects (.blocklyScrollbarHandle),
   not real browser scrollbars, so the ::-webkit-scrollbar rules above never
   reach them - overridden here with the same rest/hover colors so they read
   as the same design instead of Blockly's own default light grey.
   Blockly's own stock stylesheet (node_modules/blockly/core/css.js) already
   has a ".blocklyFlyout .blocklyScrollbarHandle"/"...:hover" pair (two
   classes) specifically for flyout scrollbars, darkened for its grey
   background - that beats a plain ".blocklyScrollbarHandle" rule on
   specificity regardless of source order, so the flyout's own scrollbar was
   still showing Blockly's stock grey (#bbb/#aaa) instead of this app's
   rgba(0,0,0,0.25/0.4), particularly obvious on hover. Repeating the
   ".blocklyFlyout" prefix here matches that specificity so this app's colors
   win in the flyout too, not just the main workspace. */
.blocklyScrollbarHandle,
.blocklyFlyout .blocklyScrollbarHandle {
  fill: rgba(0, 0, 0, 0.25);
}

.blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.blocklyScrollbarHandle:hover,
.blocklyFlyout .blocklyScrollbarBackground:hover + .blocklyScrollbarHandle,
.blocklyFlyout .blocklyScrollbarHandle:hover {
  fill: rgba(0, 0, 0, 0.4);
}

/* Matches the grid-snap icon's own rest/hover/press opacity steps (see
   ActionEditor.vue's setupGridSnapZoomButton) - overrides Blockly's own
   stock ".blocklyZoom>image"/"...:hover"/"...:active" rule (css.js,
   .4/.6/.8), which is the SAME selector this app's own stylesheet uses, so
   which one wins is otherwise just a source-order coin flip (Blockly injects
   its CSS at runtime, after this file's own compiled <style> tag) -
   !important makes this app's values win unconditionally instead. */
.blocklyZoom > image,
.blocklyZoom > svg > image {
  opacity: .25 !important;
}

.blocklyZoom > image:hover,
.blocklyZoom > svg > image:hover {
  opacity: .5 !important;
}

.blocklyZoom > image:active,
.blocklyZoom > svg > image:active {
  opacity: .75 !important;
}

/* The handle's exact 12px width/inset (matching the app's global scrollbar
   thumb) is set directly on the SVG attributes in BlocklyComponent.vue's
   createDom_ patch, not here - CSS geometry-property support for SVG
   width/x/rx isn't reliable enough across browsers for something this
   visible. */

/* Overrides Vuetify's own bundled reset (ress.css), which sets
   "html { overflow-y: scroll }" deliberately (its own comment: "All
   browsers without overlaying scrollbars") to reserve scrollbar space
   up front and avoid a width shift on pages that sometimes need to
   scroll and sometimes don't. Confirmed directly (via computed style
   and a search of every loaded stylesheet's own rules) as the actual
   source of an always-present, non-functional scrollbar flush against
   the browser's own right edge - not a bug in this app's own layout,
   and not something overflowing. This app's own design already has
   every panel (nav drawer, emulator sidebar, each editor tab, the
   error console) scroll internally on its own, so the document itself
   is never actually meant to scroll at all - Vuetify's own "always
   reserve the gutter" tradeoff has nothing real to protect against
   here, just an inert scrollbar with no content to scroll to. */
html {
  overflow-y: auto !important;
}

/* Vuetify's own .v-application--wrap (the flex column that lays out the
   app-bar/v-main/footer) only sets "min-height: 100vh" - a FLOOR, not a
   fixed size. flex-shrink only ever kicks in when a flex CONTAINER's own
   main-size is definite/fixed and smaller than its children's combined
   hypothetical sizes; with only a min-height, the browser instead just
   grows this container to fit whatever its children want, so .app-main's
   own "flex: 1 1 auto; min-height: 0" override (see that rule's own
   comment) never actually had a reason to shrink anything - there was
   never a real space shortage for it to respond to, just an ever-growing
   container. height: 100vh makes this a genuinely fixed-size flex
   container, which is what actually makes .app-main shrink to fit instead
   of dictating the page's own height - confirmed as the real remaining
   piece after the flex-shrink change alone turned out not to be enough on
   its own. v-app's own auto-generated v-application--wrap div is rendered
   by the v-app COMPONENT itself, not written in App.vue's own template, so
   (like .v-main__wrap elsewhere in this file) this has to live in this
   UNSCOPED block rather than the scoped one below - a scoped version
   matches nothing here, the same reason the fab z-index rule above had to
   move. */
.v-application--wrap {
  height: 100vh;
}

/* Keeps every tab's floating "+" fab (Background, Player0/1, Sound, Music,
   Data) above .error-message's own fixed, viewport-pinned footer (see that
   rule, in this file's OWN scoped style block below - .error-message is in
   App.vue's own template, so scoped CSS reaches it fine). This rule has to
   live in this UNSCOPED block instead, even though it's right next to
   .error-message conceptually: every one of those fab buttons is rendered
   by a CHILD component's own template (PlayerEditor.vue, BackgroundEditor.vue,
   etc.), and Vue's scoped CSS only ever auto-attaches its scope attribute to
   elements written directly in THIS component's own template - a scoped
   version of this exact rule silently matched nothing at all in any other
   component, confirmed directly as why the fabs went missing again even
   after this same fix was already applied once (it just never actually
   ran). z-index: 20 matches the same value already used for
   .emulator-hide-button/.emulator-show-button, the other controls in this
   app that already needed to sit above ordinary app chrome. */
.v-btn--absolute.v-btn--fab {
  z-index: 20;
}

.v-application {
  font-family: var(--app-font-family) !important;
}

/* Blockly ships its own bundled CSS (font: 11pt sans-serif on these exact
   selectors) rather than inheriting the page's own font-family, so the
   block canvas/flyout text stayed in the browser's generic sans-serif even
   after .v-application above switched everywhere else - confirmed directly
   by inspecting Blockly's own injected stylesheet. font-family only (not
   the shorthand font: ... property) so this doesn't also touch the 11pt
   size Blockly itself sets. [class*="-theme"] (not a specific theme name
   like .app-theme) - ActionEditor.vue's own "Modern block style" option
   swaps between two differently-named themes (see APP_BLOCKLY_THEME/
   APP_BLOCKLY_THEME_MODERN there), and Blockly's own injected class is
   literally that theme's own name + "-theme" (see Theme.prototype.
   getClassName), so a single fixed class here would only have matched
   ONE of the two - confirmed directly as the reason an earlier version of
   this rule (.classic-theme, copied from Blockly's own default theme name
   rather than the actual "app-theme" class this project's custom theme
   produces) never actually matched anything at all. */
.geras-renderer[class*="-theme"] .blocklyText,
.geras-renderer[class*="-theme"] .blocklyFlyoutLabelText {
  font-family: var(--app-font-family) !important;
}

/* Vuetify's own hint/error text under a field (e.g. the description under
   the "Enable Superchip RAM..." switch on the Options tab) - default
   line-height (12px, exactly matching its own 12px font-size, i.e. no
   leading at all) reads as cramped once a hint runs to more than one line.
   Global (not scoped to one field) since every hint/detail message in the
   app uses this same class. */
.v-messages__message {
  line-height: 1.4 !important;
}

/* See Configuration.vue's "Hide small description text" switch (VCSGM
   Options) and this file's own hideDescriptionText computed, bound as a
   class on the root v-app above - hides every hint/description paragraph
   app-wide from one place, now that they all consistently share this same
   Vuetify class (see TextEditor.vue's own hint paragraph for the pattern).
   Left targeting the plain class (not "v-messages" too) since a field's
   OWN validation/error messages also render through the same DOM structure
   and use ".v-messages__message" too - scoping any tighter would need
   distinguishing "hint" text from "error" text, which Vuetify itself
   doesn't expose a separate class for. */
.hide-description-text .v-messages__message {
  display: none;
}

#javatari-target-container {
  overflow: hidden;
  /* This sits inside .emulator-drawer-inner's flex column, at a fixed
     JS-computed height (see App.vue's own updateEmulatorScale) - without
     this, once the ROM capacity bank-contents text below it (see
     .rom-capacity-detail) grew long enough after a build that everything in
     the column no longer fit, the flex column's own default flex-shrink: 1
     silently compressed this container below its real height instead of
     leaving it alone, clipping the bottom of the emulator (Javatari's own
     console-panel graphic) behind whatever sits right after it - the
     Update ROM/Get generated ROM buttons - instead of showing it. That text
     block already has its own overflow-y: auto (see its own flex: 1 1 auto)
     specifically to absorb space shortages like this on its own, so nothing
     above it - this container, the buttons, the summary text - should ever
     need to shrink at all.
  */
  flex-shrink: 0;
}

#javatari-target-container > #javatari-screen {
  transform: scale(var(--emulator-scale, 1));
  transform-origin: top left;
}


/* App-wide: no drop shadow on any button or switch toggle - flat, matching
   the outlined-card style used elsewhere, instead of Vuetify's default
   elevated look. Global (not scoped) so it reaches every view/component's
   buttons and switches without editing each one individually. */
.v-btn {
  box-shadow: none !important;
}

.v-input--switch__thumb {
  box-shadow: none !important;
}

/* App-wide: lighter underline for a text field (or a v-select/v-combobox,
   which are both built on top of v-text-field in this Vuetify version - the
   same class carries their own underline too) while it's NOT focused -
   Vuetify's own default resting-state color (rgba(0,0,0,.42), see
   node_modules/vuetify/dist/vuetify.css's own ".theme--light.v-text-field >
   .v-input__control > .v-input__slot:before" rule) reads as fairly dark/
   prominent even on a field nobody's currently using. Only the plain
   ":before" (resting) rule below is touched - the focused state (its own
   ":after" rule, which Vuetify animates in via a separate scaleX
   transform - untouched here) still gets the normal, full-strength primary-
   color underline, so a focused field still reads clearly as active. Every
   field in this app already uses the default (non-outlined/filled/solo)
   style that actually shows this underline at all - confirmed via a
   project-wide grep - so no variant exclusion is needed here.

   :not(:hover) keeps this from also flattening Vuetify's own hover-darken
   rule (its own ".theme--light.v-text-field:not(.v-input--has-state):hover
   > ... :before", rgba(0,0,0,.87)) - that rule and this one both target the
   same ::before, so without this exclusion the !important below (needed to
   beat Vuetify's own un-!important resting rule) was winning on hover too,
   silently killing the hover feedback instead of just lightening the
   resting state. Letting Vuetify's own already-tuned hover rule apply
   unopposed here is simpler than duplicating/guessing a new hover value. */
.theme--light.v-text-field:not(:hover) > .v-input__control > .v-input__slot:before {
  border-color: rgba(0, 0, 0, 0.15) !important;
}

/* A switch that's off gets a grey outline on its thumb, the same grey as an
   outlined card's border, so it doesn't read as a flat white blob against
   the page background. */
input[type='checkbox']:not(:checked) ~ .v-input--switch__thumb {
  border: thin solid rgba(0, 0, 0, 0.12);
}

/* Shared with the pixel editor toolbar's icons (see PixelEditor.vue) so a
   delete button's rest state matches them, instead of standing out as an
   always-red trash can. */
:root {
  --editor-icon-rest-color: rgba(0, 0, 0, 0.38);
}

/* Delete buttons (trash icon, top-right of a graphics/data/sound card): the
   same muted grey as the pixel editor toolbar icons at rest, turning red
   only on hover - and never a filled circle behind it, at rest or on
   hover (Vuetify's default hover/focus overlay is suppressed here). */
.delete-icon-btn {
  color: var(--editor-icon-rest-color) !important;
}

.delete-icon-btn:hover {
  color: red !important;
}

.delete-icon-btn::before {
  background-color: transparent !important;
}
</style>
<style scoped>
/* Vuetify animates the drawer's width over 200ms, but the emulator's scale is
   applied instantly, so the two visibly drift apart while dragging. This drawer
   is permanent and never slides open, so the width transition serves no
   purpose; dropping it keeps the column and the emulator in lockstep. */
.emulator-drawer {
  transition-property: transform, visibility;
}

/* Separates the top toolbar from everything below it (the middle pane AND
   the emulator column) with one continuous line, rather than adding the
   same border separately to each pane below it (tried first - two
   separately-bordered panes, each only as wide as its own column, instead
   of one line spanning the full width in one place). !important because
   the v-app-bar's own "color=white" prop applies Vuetify's ".white" color
   utility class, which sets "border-color: #fff !important" - confirmed
   directly (computed style showed this border rendering solid white,
   invisible against the toolbar's own white background) rather than assumed. */
.top-toolbar {
  border-bottom: 1px solid rgba(0, 0, 0, 0.12) !important;
}

/* Sits in the empty top-left corner: to the left of .top-toolbar (which
   only starts at x: 200px, past the navigation drawer's own width), above
   the drawer itself (which is "clipped" and starts at y: 72px, see the
   template). Fixed positioning (not part of any Vuetify "app" element's
   own flow) since none of the surrounding chrome has a slot for it. */
.app-logo {
  position: fixed;
  top: 0;
  left: 8px;
  width: 184px;
  height: 72px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  z-index: 20;
  pointer-events: none;
  opacity: 1;
  transform: translateX(0);
  /* Matches the drawer's own 200ms slide transition (see .nav-drawer's
     comment below) so the logo fades/slides out in step with the sidebar
     collapsing, instead of just popping in/out with it. */
  transition: opacity 0.2s ease, transform 0.2s ease;
}

/* Suppresses the transition above for the drawer's own initial settling on
   page load (see logoTransitionsEnabled's own comment in data()) - the
   logo should just appear (or not) in its correct starting state
   instantly, not animate in every time the page refreshes. */
.app-logo-no-transition {
  transition: none;
}

.app-logo-img {
  /* height: auto (not a fixed box with object-fit) so the image's real
     rendered height matches its aspect ratio exactly, with no leftover
     whitespace inside a taller box pushing the version text below it away. */
  width: 100%;
  height: auto;
}

.app-logo-version {
  margin-top: 4px;
  font-size: 11px;
  color: rgba(0, 0, 0, 0.6);
  line-height: 1;
}

.app-logo-hidden {
  opacity: 0;
  transform: translateX(-16px);
}

/* Same divider, same color, on the sidebar's own top edge - now that the
   drawer is "clipped" (starts below the app-bar instead of the system-bar
   above it, see the template), this lines up exactly with .top-toolbar's
   own border-bottom above, reading as one continuous line across the whole
   window instead of two separate borders that happen to match colors. */
/* margin-top: -1px nudges the border up a hair from where it'd otherwise
   land - even though the drawer's own top (now "clipped" below the app-bar,
   see the template) and .top-toolbar's own bottom edge compute to the exact
   same y-coordinate, the two borders still rendered a device pixel apart at
   this window's 1.5x scale factor, a common sub-pixel rounding artifact
   between two independently-positioned elements whose edges only coincide
   in CSS px, not real device px. */
.nav-drawer {
  margin-top: -1px;
  border-top: 1px solid rgba(0, 0, 0, 0.12) !important;
}

/* Vuetify offsets the main content with an animated padding matching the
   drawer width, which makes the Blockly canvas ease into its new size while
   the column and emulator resize instantly. It also means the canvas is
   measured mid-animation when it reflows. Both drawers here are permanent, so
   nothing needs to animate. */
.app-main {
  transition: none;
  /* Vuetify's own .v-main is "flex: 1 0 auto" - flex-shrink: 0 means it
     NEVER shrinks below its own content's natural height, regardless of how
     little space v-application--wrap (min-height: 100vh, otherwise
     content-driven) actually has left for it - so a tab with enough content
     to be genuinely taller than the viewport (16 score-font glyph cards,
     for instance) grew the WHOLE PAGE taller instead of ever reaching
     .app-main-inner's own overflow-y: auto at all, which only ever gets a
     chance to clip/scroll content that doesn't already fit within the
     height this element itself was already given. flex-shrink: 1
     (overriding Vuetify's 0) lets this actually shrink to fit its real
     allocated space instead of dictating the page's own height upward, and
     min-height: 0 removes flexbox's own separate "never shrink below
     content size" default floor (distinct from flex-shrink, and it applies
     even with flex-shrink: 1 unless overridden) that would otherwise still
     block the same thing from working. Confirmed directly as the real root
     cause of a "phantom" scrollbar appearing at the literal browser window
     edge (not this app's own internal panel scrollbars) specifically on
     tabs with enough content to actually be taller than one viewport. */
  flex: 1 1 auto;
  min-height: 0;
}

/* Vuetify's own .v-main is "flex: 1 0 auto" (flex-shrink: 0) with no fixed
   height of its own - a paddingBottom bound directly to it (an earlier
   version of this) just grew that box past whatever space the outer
   v-application--wrap flex column actually had left, overflowing the
   whole page (a real, new scrollbar this time, not the inert forced-
   scrollbar case fixed elsewhere) instead of being absorbed anywhere. This
   inner div is a plain block, not a flex item with its own shrink-doesn't-
   happen behavior - height: calc(100% - Npx) takes exactly whatever height
   v-main's own flex-grow already resolved (stretched across via v-main's
   default row-direction align-items: stretch on its real single child,
   .v-main__wrap, which this sits inside), reduced by errorHeight to reserve
   room for .error-message's own fixed footer (which isn't an "app" element
   Vuetify lays out room for).
   position: relative makes THIS the containing block for any
   position: absolute descendant a routed view renders (e.g.
   ActionEditor.vue's own "#blockly2 { position: absolute; bottom: 0; }",
   which sizes the whole Blockly canvas including its toolbox/flyout, or
   GeneratedCode.vue's own ".editor-container", same pattern) - without it,
   such a descendant skips past this div (position: static doesn't
   establish a containing block) straight to the next actual positioned
   ancestor up the tree, Vuetify's own .v-main__wrap, which still extends
   all the way to the TRUE viewport bottom.
   A PADDING-based version of this (height: 100% + padding-bottom: Npx +
   box-sizing: border-box, matching .nav-drawer-inner/.emulator-drawer-inner's
   own pattern) was tried here first and confirmed NOT equivalent for this
   specific job: a position: absolute child's own "bottom: 0" aligns with
   its containing block's PADDING-box edge, which is the same as the
   border-box edge (the outermost edge, padding included) whenever there's
   no border - so "bottom: 0" landed exactly at this div's own OUTER edge,
   completely ignoring the padding meant to hold it back, and every
   position: absolute view (ActionEditor's Blockly canvas, GeneratedCode's
   whole editor pane including its search dock) kept rendering straight
   through .error-message's fixed footer regardless. Actually reducing the
   HEIGHT itself (not padding it) is what genuinely moves this div's own
   bottom edge - and so its padding-box edge too - up above the footer, the
   only version of this fix confirmed (via direct getBoundingClientRect
   measurement) to actually change where "bottom: 0" resolves to. */
.app-main-inner {
  position: relative;
  overflow-y: auto;
}

/* A sibling of the drawer (see the template), NOT a child of it - same
   reasoning as .emulator-hide-button below: v-navigation-drawer sets
   overflow: hidden on itself, which clipped away the left half of this
   handle's straddle when it lived inside the drawer as an absolutely-
   positioned child, so the hover highlight never actually spilled onto the
   content to its left the way .error-resize-handle's does (that one lives in
   a v-footer, which doesn't clip). Fixed to the window instead, with "right"
   bound inline to emulatorWidth so it still tracks the drawer's own left
   edge as it's resized. */
.emulator-resize-handle {
  position: fixed;
  /* 72px clears the fixed chrome above the drawer (the app-bar's own
     height, see .emulator-hide-button's own comment below) - this used to
     be a plain 0, which ran the handle up over that chrome instead of
     starting at the drawer's own clipped top edge. */
  top: 72px;
  /* bottom is set inline (bound to errorHeight, see the template) rather
     than a plain 0 here - this handle used to run the full viewport height,
     rendering on top of the console footer (a sibling, not a descendant, so
     the console's own z-index couldn't help) instead of stopping above it
     the way the emulator drawer itself already does. */
  /* Straddles the drawer's own left edge (-5px to +5px, via the "right"
     style bound to emulatorWidth - 5 in the template), matching
     .error-resize-handle's own straddle - a plain 6px strip fully inside
     the drawer was too easy to miss by a pixel and land on the emulator
     content instead. */
  width: 10px;
  cursor: ew-resize;
  /* Same z-index the toggle buttons below use to sit above the drawer -
     without this, the drawer (a higher-z-index Vuetify "app" element)
     painted over the right half of this straddle and ate its hover/clicks,
     leaving only the left half interactive - looked both shrunken and
     shifted left of where it used to sit. */
  z-index: 20;
}

.emulator-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}

/* A visible grip bar centered in the drag strip - same rest/hover grey as
   the scrollbar thumbs and .error-resize-handle's own grip below, so all of
   the app's draggable handles read as one consistent design instead of
   being invisible until hovered. */
.emulator-resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 3px;
  height: 40px;
  border-radius: 2px;
  background-color: rgba(0, 0, 0, 0.25);
}

.emulator-resize-handle:hover::after {
  background-color: rgba(0, 0, 0, 0.4);
}

.emulator-refresh-button {
  margin-top: 8px;
  margin-bottom: 4px;
}

/* A sibling of the drawer (see the template), NOT a child of it - v-
   navigation-drawer sets overflow: hidden on itself (to mask its own slide
   transition), which was clipping away the left half of this button when it
   lived inside the drawer as an absolutely-positioned child straddling its
   edge. Fixed to the window instead, with "right" bound inline to
   emulatorWidth (see the template) so it still tracks the drawer's own left
   edge as it's resized. top: 80px clears the fixed chrome above the drawer
   (the app-bar's own 72px, plus a little breathing room), putting this at
   the top of the emulator column instead of vertically centered on it.
   z-index bumped well past Vuetify's own app-bar/navigation-drawer chrome,
   which otherwise sat on top of and ate clicks meant for this button. */
.emulator-hide-button {
  position: fixed;
  top: 80px;
  transform: translateX(calc(-50% - 4px));
  z-index: 20;
  box-shadow: none !important;
}

/* right: 16px (not flush against the window's own edge) - flush placement
   sat exactly where the browser's native scrollbar renders, which (unlike
   the DOM z-index fix .emulator-hide-button needed) can't be fixed with
   z-index at all: an OS/browser-drawn scrollbar always paints on top of
   page content regardless, and was silently eating clicks (starting a
   scroll drag instead) meant for this button. Clearing that strip entirely,
   rather than straddling it, is the only real fix. */
.emulator-show-button {
  position: fixed;
  top: 80px;
  right: 21px;
  z-index: 20;
  box-shadow: none !important;
}

/* Faded and grey at rest (see color="grey" in the template) - a quieter
   default than the app's usual blue "primary" accent, since this floats
   over whatever tab is open rather than living inside a toolbar/panel with
   other controls, and shouldn't compete for attention until the user is
   actually reaching for it. Full opacity plus the app's own primary blue on
   hover together read as "now active"/clickable. */
.emulator-toggle-button {
  opacity: 0.5;
}

.emulator-toggle-button:hover {
  opacity: 1;
  background-color: var(--v-primary-base, #1976d2) !important;
}

/* Flex column so .rom-capacity-detail (the last child) can grow to fill
   whatever vertical space the emulator/buttons/summary line above it don't
   use, instead of sizing to its own content and leaving dead space below.
   box-sizing: border-box makes the padding-bottom below (which reserves room
   for the error console footer, which overlaps the bottom of this drawer
   since it isn't an "app" element Vuetify reserves layout space for) count
   against this 100% height, instead of being added on top of it - otherwise
   the flex children size themselves as if the footer weren't there, and
   .rom-capacity-detail's own scrollbar never kicks in until content is
   pushed further down than the footer already covers. */
.emulator-drawer-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  box-sizing: border-box;
  /* The "Refresh emulator"/"Update ROM"/"Get generated ROM" buttons are all
     "block" (100% width of this container), which previously ran them
     flush edge to edge with no breathing room. #javatari-target-container
     (the emulator screen itself) also ends up very slightly narrower as a
     result, rather than compensating it back out with its own negative
     margin - that container's own width feeds a live ResizeObserver-driven
     scale calculation (see updateEmulatorScale/observeEmulatorSize below),
     and a negative margin there risks that measurement disagreeing with
     what's actually laid out, for a fix this small. */
  padding: 0 8px;
}

/* Same reasoning as .emulator-drawer-inner above: the error console footer
   overlaps the bottom of this drawer too (it isn't an "app" element Vuetify
   reserves layout space for), so a plain height: 100% scroll area would let
   the last couple of tabs end up hidden behind it. box-sizing: border-box
   makes the reactive padding-bottom count against the 100% height instead of
   adding to it, so the scrollbar appears in time to reach everything above
   the footer. */
.nav-drawer-inner {
  height: 100%;
  overflow-y: auto;
  box-sizing: border-box;
}

.v-list-item__icon {
  margin-right: 12px !important;
}

.navigation-list > .v-list-item:not(.v-list-item--active) {
  border-left: 8px solid;
}

/* REMOVED: "opacity: 0.65" on every inactive sidebar item - the top bar's
   own tab buttons have no equivalent dimming (always full-strength color,
   active or not), so this was the actual source of the sidebar's icon/text
   colors looking washed out compared to the top bar's for any tab that
   wasn't the current page - confirmed directly via computed style: both
   already resolved to the exact same "color: rgb(...)" (the shared
   .actions-item/.player0-item/etc rules below already cover both bars
   identically), it was purely this element-wide opacity multiplying that
   same color down for the sidebar alone. */

/* The top v-app-bar's own tab buttons (.actions-item/.player0-item/etc,
   the exact same class names as the sidebar's own v-list-item entries just
   above - see the rules right below this one) used to render with
   Vuetify's own default v-btn appearance, a solid light grey fill
   (".theme--light.v-btn.v-btn--has-bg { background-color: #f5f5f5 }" - see
   node_modules/vuetify/dist/vuetify.css), unlike the sidebar's own
   v-list-item entries, which have no background fill of their own at all -
   confirmed as the actual source of the two navigation bars visibly not
   matching. The "text" prop (added on each of these v-btn in the template)
   is what removes that default fill, the same way it would for any other
   Vuetify text-style button - no CSS override needed here for that part.
   Once that grey fill is gone, the hover/active TINT COLOR already matches
   the sidebar for free: Vuetify's own v-btn already uses
   "background-color: currentColor" for its built-in hover/focus/active
   overlay (".v-btn:before"/".v-btn--active::before" in the same vuetify.css),
   and the color rules below already force "color: rgbX !important" on
   these exact same classes. The tint's own STRENGTH still didn't match
   though (confirmed directly against vuetify.css) - v-list-item's own
   overlay opacities (hover 0.04, active 0.12) are roughly HALF v-btn's own
   (hover 0.08, active 0.18), which read as visibly lighter/washed-out on
   the sidebar than the same color looked on the top bar even once both
   used the same base color. The override right below brings the sidebar's
   own v-list-item opacities UP to match the top bar's v-btn values
   exactly, scoped to just these nav items (not every v-list-item
   app-wide). */
.navigation-list.v-list .v-list-item:hover::before {
  opacity: 0.08 !important;
}
.navigation-list.v-list .v-list-item:focus::before {
  opacity: 0.24 !important;
}
.navigation-list.v-list .v-list-item--active:hover::before,
.navigation-list.v-list .v-list-item--active::before {
  opacity: 0.18 !important;
}
.navigation-list.v-list .v-list-item--active:focus::before {
  opacity: 0.16 !important;
}

.actions-item,
.actions-item > .v-list-item__icon > .theme--light.v-icon,
.actions-item > .v-list-item__content {
  color: rgb(76, 175, 80) !important;
  border-left-color: rgb(76, 175, 80) !important;
}

.player0-item,
.player0-item > .v-list-item__icon > .theme--light.v-icon,
.player0-item > .v-list-item__content {
  color: rgb(244, 67, 54) !important;
  border-left-color: rgb(244, 67, 54) !important;
}

.player1-item,
.player1-item > .v-list-item__icon > .theme--light.v-icon,
.player1-item > .v-list-item__content {
  color: rgb(33, 150, 243) !important;
  border-left-color: rgb(33, 150, 243) !important;
}

.background-item,
.background-item > .v-list-item__icon > .theme--light.v-icon,
.background-item > .v-list-item__content {
  color: rgb(255, 152, 0) !important;
  border-left-color: rgb(255, 152, 0) !important;
}

.sound-item,
.sound-item > .v-list-item__icon > .theme--light.v-icon,
.sound-item > .v-list-item__content {
  color: rgb(156, 39, 176) !important;
  border-left-color: rgb(156, 39, 176) !important;
}

.text-tab-item,
.text-tab-item > .v-list-item__icon > .theme--light.v-icon,
.text-tab-item > .v-list-item__content {
  color: rgb(233, 30, 99) !important;
  border-left-color: rgb(233, 30, 99) !important;
}

.data-item,
.data-item > .v-list-item__icon > .theme--light.v-icon,
.data-item > .v-list-item__content {
  color: rgb(121, 85, 72) !important;
  border-left-color: rgb(121, 85, 72) !important;
}

.scorefont-item,
.scorefont-item > .v-list-item__icon > .theme--light.v-icon,
.scorefont-item > .v-list-item__content {
  color: #f2691e !important;
  border-left-color: #f2691e !important;
}

.configuration-item,
.configuration-item > .v-list-item__icon > .theme--light.v-icon,
.configuration-item > .v-list-item__content {
  color: rgb(96, 96, 244) !important;
  border-left-color: rgb(96, 96, 244) !important;
}

.generated-item,
.generated-item > .v-list-item__icon > .theme--light.v-icon,
.generated-item > .v-list-item__content {
  color: rgb(39, 176, 136) !important;
  border-left-color: rgb(39, 176, 136) !important;
}

.project-item,
.project-item > .v-list-item__icon > .theme--light.v-icon,
.project-item > .v-list-item__content {
  color: rgb(39, 136, 176) !important;
  border-left-color: rgb(39, 136, 176) !important;
}

/* Vuetify's "block" prop sets flex: 1 0 auto on a v-btn (so a full-width
   button behaves inside a flex row) - inside .emulator-drawer-inner's flex
   COLUMN that instead makes every block button grow to fill the leftover
   vertical space whenever .rom-capacity-detail isn't rendered yet (no ROM
   built yet), stretching them tall. Buttons should only ever size to their
   own content here. */
.emulator-drawer-inner .v-btn {
  flex: 0 0 auto !important;
}

.rom-capacity {
  text-align: center;
  font-size: 0.8em;
  font-weight: bold;
  opacity: 0.7;
  margin-top: 6px;
  padding: 0 8px;
  flex-shrink: 0;
}

.rom-capacity-low {
  opacity: 1;
  color: rgb(244, 67, 54);
  font-weight: bold;
}

.rom-capacity-bar {
  margin: 4px 8px 8px;
  width: auto;
  flex-shrink: 0;
}

.rom-capacity-summary {
  font-size: 0.75em;
  opacity: 0.6;
  text-align: left;
  margin: 2px 0 0;
  padding: 0 8px;
  user-select: text;
  flex-shrink: 0;
}

/* flex: 1 (with the drawer content column below) lets this grow to fill
   whatever room is left under the emulator/buttons/summary line instead of
   staying a fixed height, with its own scrollbar (min-height: 0 is required
   for a flex child to be allowed to shrink below its content size and
   actually scroll instead of overflowing the drawer). */
.rom-capacity-detail {
  font-size: 0.75em;
  opacity: 0.6;
  text-align: left;
  margin: 6px 0 0;
  padding: 0 8px;
  user-select: text;
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}

.rom-capacity-bank {
  margin-bottom: 6px;
}

.rom-capacity-bank-header {
  white-space: pre-wrap;
}

.rom-capacity-bank-contents {
  padding-left: 1em;
  opacity: 0.85;
}

.rom-capacity-bank-contents > div {
  white-space: pre-wrap;
}

/* position: fixed pins this to the viewport bottom so it can't scroll away
   with page content. This previously covered every tab's own floating "+"
   button (Background, Player0/1, Sound, Music, Data - all use Vuetify's
   "absolute right fab" pattern with no z-index of their own) since a fab
   with no explicit z-index loses the stacking fight against this footer's
   z-index: 10. Fixed for real this time, rather than reverting again, by
   giving those fabs their own explicit z-index above this footer's (see
   the .v-btn--absolute.v-btn--fab rule below) instead of just removing the
   fixed positioning that was the actual point of this rule. */
.error-message {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: 10;
  border-top: 1px solid rgba(0, 0, 0, 0.12);
}

.theme--light.v-footer.error-message {
  color: rgb(244, 67, 54);
}

/* The actual scroll container - moved here from .error-message itself
   (which used to have overflow-y: scroll directly) so .error-resize-handle
   (a sibling of this, not a descendant) never scrolls along with the log
   content: .error-resize-handle's own position: absolute is anchored to
   .error-message, which is also where a scrollbar's scroll OFFSET used to
   be tracked - a still-scrolling ancestor drags an absolutely-positioned
   child's rendered position along with it exactly like any other content,
   confirmed directly as why the handle became unreachable (scrolled out
   of view along with the log text) once there was enough log content to
   scroll at all.
   Absolutely positioned (inset: 0 within .error-message's own
   position: relative, its own top-8px left free for the resize handle's
   own strip) rather than sized through flexbox (a v-footer's row-direction
   flex layout makes height the CROSS axis, which turned out to still let
   this grow to fit its own content instead of actually clipping to the
   footer's own fixed height even with align-self: stretch + flex +
   min-height: 0 all set - confirmed directly: scrollHeight kept exactly
   matching clientHeight, i.e. never actually overflowing/scrolling
   internally at all, which spilled the overflow out into the page's own
   document flow instead, making the WHOLE PAGE scroll to reveal it - this
   sidesteps that flexbox cross-axis sizing question entirely with a hard,
   unambiguous 0/0/0/0 inset instead of a size that has to be derived. */
/* overflow-y: auto (not "scroll") - "scroll" unconditionally reserves a
   scrollbar track even when the log has too few lines to actually need
   one, which renders as an inert, un-draggable scrollbar (no real content
   to scroll to) flush against the browser's own right edge, confirmed as
   a real, confusing bug on its own (looked like something was broken,
   since dragging it did nothing) rather than an intentional "always show
   the gutter to avoid layout shift" choice - nothing in this rule's own
   history documented that as the reason "scroll" was used here. */
.error-scroll-wrapper {
  position: absolute;
  top: 8px;
  left: 0;
  right: 0;
  bottom: 0;
  overflow-y: auto;
}

/* v-footer's own default is a row-direction flex container (fine for a
   single <pre>, wrong once this holds many stacked lines) - column instead,
   with no gap of its own, so spacing between lines comes only from
   .compile-log-line's own tight line-height below. */
.error-console-content {
  display: flex;
  flex-direction: column;
  width: 100%;
  padding-top: 8px;
}

/* Live progress feed for the build pipeline (see hooks/rom.js's buildRom())
   - overrides the footer's own blanket red (meant for errorStorage's actual
   error banner just below it) back to ordinary text color for anything that
   isn't itself an error-level entry. margin: 0 and a tight line-height keep
   many lines from spreading out - the default paragraph-like spacing looked
   like a blank line between every single message. */
.compile-log-line {
  white-space: pre-wrap;
  margin: 0;
  line-height: 1.3;
  padding-left: 8px;
}

.compile-log-info {
  color: rgba(0, 0, 0, 0.87);
}

.compile-log-error {
  color: rgb(244, 67, 54);
  font-weight: bold;
}

.error-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  /* Straddles the footer's own top edge (-5px to +5px) rather than sitting
     entirely inside it - a plain 6px strip fully inside the panel was too
     easy to miss by a pixel and land on the error text right below it
     instead, starting a text selection instead of a resize drag. */
  top: -5px;
  height: 10px;
  cursor: ns-resize;
  z-index: 2;
}

.error-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}

/* Matches .emulator-resize-handle's own grip bar above - same rest/hover
   grey, just rotated for this handle's horizontal drag axis. */
.error-resize-handle::after {
  content: '';
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 40px;
  height: 3px;
  border-radius: 2px;
  background-color: rgba(0, 0, 0, 0.25);
}

.error-resize-handle:hover::after {
  background-color: rgba(0, 0, 0, 0.4);
}
</style>
