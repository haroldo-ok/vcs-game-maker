<template>
  <v-app id="inspire">
    <v-system-bar app>
      <v-card-text>{{ productName }} {{ version }}</v-card-text>

      <v-spacer></v-spacer>

      <v-icon>mdi-square</v-icon>

      <v-icon>mdi-circle</v-icon>

      <v-icon>mdi-triangle</v-icon>
    </v-system-bar>

    <v-app-bar
      app
      clipped-right
      flat
      height="72"
    >
      <v-toolbar
        flat
        class="navigation-list"
      >
        <v-btn to="/" link class="actions-item" title="Actions" elevation="0">
          <v-icon>mdi-chart-scatter-plot</v-icon>
        </v-btn>

        <v-btn to="/player0" link class="player0-item" title="Player 0" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
        </v-btn>

        <v-btn to="/player1" link class="player1-item" title="Player 1" elevation="0">
          <v-icon>mdi-human-handsup</v-icon>
        </v-btn>

        <v-btn to="/background" link class="background-item" title="Background" elevation="0">
          <v-icon>mdi-map</v-icon>
        </v-btn>

        <v-btn to="/soundfx" link class="sound-item" title="Sound" elevation="0">
          <v-icon>mdi-waveform</v-icon>
        </v-btn>

        <v-btn to="/music" link class="music-item" title="Music" elevation="0">
          <v-icon>mdi-music-note</v-icon>
        </v-btn>

        <v-btn to="/scorefont" link class="scorefont-item" title="Score" elevation="0">
          <v-icon>mdi-numeric</v-icon>
        </v-btn>

        <v-btn to="/text" link class="text-tab-item" title="Text" elevation="0">
          <v-icon>mdi-card-text-outline</v-icon>
        </v-btn>

        <v-btn to="/data" link class="data-item" title="Data" elevation="0">
          <v-icon>mdi-table</v-icon>
        </v-btn>

        <v-btn to="/configuration" link class="configuration-item" title="Options" elevation="0">
          <v-icon>mdi-cog</v-icon>
        </v-btn>

        <v-btn to="/generated" link class="generated-item" title="Generated" elevation="0">
          <v-icon>mdi-card-text</v-icon>
        </v-btn>

        <v-btn to="/project" link class="project-item" title="Project" elevation="0">
          <v-icon>mdi-pencil-ruler</v-icon>
        </v-btn>
      </v-toolbar>
    </v-app-bar>

    <v-navigation-drawer
      v-model="drawer"
      app
      width="200"
      class="nav-drawer"
    >
      <div class="nav-drawer-inner" :style="{paddingBottom: errorHeight + 'px'}">
      <v-sheet
        color="grey lighten-5"
        height="128"
        width="100%"
      ></v-sheet>

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
            <v-list-item-title>Music</v-list-item-title>
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
      app
      clipped
      right
      permanent
      class="emulator-drawer"
      :width="emulatorWidth"
    >
      <div
        class="emulator-resize-handle"
        title="Drag to resize the emulator"
        @mousedown.prevent="startResize"
      ></div>
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
        <div v-if="romCapacitySummary" class="rom-capacity-summary">{{ romCapacitySummary }}</div>
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

    <v-main class="app-main">
      <router-view/>
    </v-main>

    <v-footer class="error-message" :style="{height: errorHeight + 'px', maxHeight: errorHeight + 'px'}">
      <div
        class="error-resize-handle"
        title="Drag to resize the error pane"
        @mousedown.prevent="startResizeError"
      ></div>
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
    </v-footer>
  </v-app>
</template>

<script>
import {useCompileLog, useErrorStorage} from './hooks/project';
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

export default {
  data: () => ({
    drawer: null,
    emulatorWidth: readStoredWidth(),
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
      productName, version,
    };
  },
  mounted() {
    this.attachEmulator();
    window.addEventListener('resize', this.handleWindowResize);
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
    romCapacityLow() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.bank1.usableBytes) return false;
      return capacity.bank1.freeBytes / capacity.bank1.usableBytes < ROM_CAPACITY_LOW_THRESHOLD;
    },
  },
  watch: {
    emulatorWidth() {
      // Wait for the drawer's new width to reach the DOM before measuring.
      this.$nextTick(this.updateEmulatorScale);
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
#javatari-target-container {
  overflow: hidden;
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

/* Vuetify offsets the main content with an animated padding matching the
   drawer width, which makes the Blockly canvas ease into its new size while
   the column and emulator resize instantly. It also means the canvas is
   measured mid-animation when it reflows. Both drawers here are permanent, so
   nothing needs to animate. */
.app-main {
  transition: none;
}

.emulator-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  cursor: ew-resize;
  z-index: 2;
}

.emulator-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}

.emulator-refresh-button {
  margin-bottom: 4px;
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

.navigation-list > .v-list-item:not(.v-list-item--active) {
  opacity: 0.65;
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
  opacity: 0.7;
  margin-top: 6px;
  padding: 0 8px;
}

.rom-capacity-low {
  opacity: 1;
  color: rgb(244, 67, 54);
  font-weight: bold;
}

.rom-capacity-summary {
  font-size: 0.75em;
  opacity: 0.6;
  text-align: left;
  margin: 2px 0 0;
  padding: 0 8px;
  user-select: text;
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

.error-message {
  position: relative;
  z-index: 10;
  overflow-y: scroll;
  /* Vuetify's own v-footer default is align-items: center, which vertically
     centers .error-console-content as a whole inside the footer instead of
     pinning it to the top - barely noticeable with only a line or two of
     text, but left the growing live compile log visibly floating in the
     middle of the pane once there was enough of it to matter. */
  align-items: flex-start;
}

.theme--light.v-footer.error-message {
  color: rgb(244, 67, 54);
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
</style>
