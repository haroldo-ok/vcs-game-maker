<template>
  <v-app id="inspire">
    <v-system-bar app>
      <v-card-text>{{ name }} {{ version }}</v-card-text>

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

        <v-btn to="/soundfx" link class="sound-item" title="SoundFX" elevation="0">
          <v-icon>mdi-waveform</v-icon>
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
    >
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
            <v-list-item-title>SoundFX</v-list-item-title>
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
        :title="romCapacityTitle"
      >
        {{ romCapacityText }}
      </div>
      <div
        v-if="autoRelocatedEventsText"
        class="rom-capacity"
        title="This project's code didn't fit in bank 1, so these were automatically moved to another bank to make room."
      >
        {{ autoRelocatedEventsText }}
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
      <pre v-text="errorStorage"></pre>
    </v-footer>
  </v-app>
</template>

<script>
import {useErrorStorage} from './hooks/project';
import {buildRom, useAutoRelocatedEvents, useRomCapacity, useRomOutdated} from './hooks/rom';
import {name, version} from '../package.json';

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
      errorStorage, romOutdated: useRomOutdated(), romCapacity: useRomCapacity(),
      autoRelocatedEvents: useAutoRelocatedEvents(), name, version,
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
    romCapacityTitle() {
      const capacity = this.romCapacity;
      if (!capacity) return '';
      const totalUsed = capacity.total.usableBytes - capacity.total.freeBytes;
      const bank1Used = capacity.bank1.usableBytes - capacity.bank1.freeBytes;
      return `${totalUsed.toLocaleString()} of ${capacity.total.usableBytes.toLocaleString()} bytes used ` +
        `across every bank (bank 1, which always holds your main code, is ` +
        `${bank1Used.toLocaleString()} of ${capacity.bank1.usableBytes.toLocaleString()} used)`;
    },
    romCapacityLow() {
      const capacity = this.romCapacity;
      if (!capacity || !capacity.bank1.usableBytes) return false;
      return capacity.bank1.freeBytes / capacity.bank1.usableBytes < ROM_CAPACITY_LOW_THRESHOLD;
    },
    autoRelocatedEventsText() {
      const events = this.autoRelocatedEvents;
      if (!events || !events.length) return '';
      const byBank = {};
      events.forEach(({name, bank}) => {
        (byBank[bank] || (byBank[bank] = [])).push(name);
      });
      return Object.keys(byBank)
          .sort((a, b) => a - b)
          .map((bank) => `Bank ${bank}: ${byBank[bank].join(', ')}`)
          .join(' | ');
    },
  },
  watch: {
    emulatorWidth() {
      // Wait for the drawer's new width to reach the DOM before measuring.
      this.$nextTick(this.updateEmulatorScale);
    },
  },
  methods: {
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
      javatariScreen.style = '';
      this.observeEmulatorSize(container, javatariScreen);
      this.updateEmulatorScale();
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
      // clip the emulator away entirely.
      if (!screen.offsetWidth || !screen.offsetHeight) {
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
          // one is a no-op).
          this.attachEmulator();
        });
      }, 0);
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

.rom-capacity {
  text-align: center;
  font-size: 0.8em;
  opacity: 0.7;
  margin-top: 6px;
}

.rom-capacity-low {
  opacity: 1;
  color: rgb(244, 67, 54);
  font-weight: bold;
}

.error-message {
  position: relative;
  z-index: 10;
  overflow-y: scroll;
}

.theme--light.v-footer.error-message {
  color: rgb(244, 67, 54);
}

.error-resize-handle {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  height: 6px;
  cursor: ns-resize;
  z-index: 2;
}

.error-resize-handle:hover {
  background-color: rgba(0, 0, 0, 0.15);
}
</style>
