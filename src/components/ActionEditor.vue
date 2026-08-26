<template>
  <v-container>
    <BlocklyComponent
      id="blockly2"
      :options="options"
      ref="foo"
      v-model="workspaceData"
      @input="showCode"
    >
    </BlocklyComponent>
  </v-container>
</template>

<script>
import Handlebars from 'handlebars';
import Blockly from 'blockly';

import BlocklyComponent from './BlocklyComponent.vue';

import '../blocks/prompt-fix';

import '../blocks/background';
import '../blocks/bit';
import '../blocks/collision';
import '../blocks/color';
import '../blocks/data';
import '../blocks/event';
import '../blocks/function';
import '../blocks/input';
import '../blocks/loops';
import '../blocks/math';
import '../blocks/music';
import '../blocks/random';
import '../blocks/score';
import '../blocks/sound';
import '../blocks/soundfx';
import '../blocks/sprites';
import '../blocks/subroutine';
import '../blocks/text-minikernel';

import blocklyToolboxTemplate from 'raw-loader!./blockly-toolbox.xml.hbs';
import blocklyToolboxPlayer0Movement from 'raw-loader!./blockly-toolbox-player0-movement.xml';
import blocklyToolboxPlayer1Movement from 'raw-loader!./blockly-toolbox-player1-movement.xml';
import blocklyToolboxBallMovement from 'raw-loader!./blockly-toolbox-ball-movement.xml';
import blocklyToolboxBackground from 'raw-loader!./blockly-toolbox-background.xml';
import blocklyToolboxExampleEvent from 'raw-loader!./blockly-toolbox-example-event.xml';

import BlocklyBB from '../generators/bbasic';
import {showError} from '../utils/build-error';
import {useWorkspaceStorage, useErrorStorage, useConfigurationStorage, useMuteBlocklySoundsStorage,
  useGridSnapStorage} from '../hooks/project';
import {useGeneratedBasic} from '../hooks/generated';
import {markRomOutdated} from '../hooks/rom';

// Keep in sync with --app-font-family in App.vue's own global <style> -
// there's no build-time bridge between a CSS custom property and this JS
// theme config, so the two have to be updated together by hand. Blockly
// measures every block's own text width at layout time using ITS OWN
// font-metrics call (a hidden canvas context, not the DOM/CSS engine), so
// switching the app's font via CSS alone (see App.vue's own .blocklyText
// override) left Blockly still measuring block width as if the text were
// still in its own default (11pt sans-serif) - text rendered in the new,
// often-wider font then visibly overran the space Blockly had reserved for
// it, overlapping whatever field/input came right after (confirmed
// directly: "plus" on the "every X frames" block overlapping its own value
// field, "to" on "change state to" overlapping its dropdown). Registering
// the real font here instead means Blockly's own measurement uses it from
// the start, so block width is computed correctly to begin with - the CSS
// override above is then mostly redundant for block text specifically) but
// still needed for the toolbox/flyout labels here, which use this same
// theme's fontStyle too.
const APP_BLOCKLY_THEME = Blockly.Theme.defineTheme('app', {
  name: 'app',
  // Colours stay on Classic (the app's own original palette, per-category
  // block colours this app has always used) - only the block SHAPE switches
  // to modern via options.renderer: 'zelos' below. Using Blockly.Themes.Zelos
  // as the base here instead made every stock block that relies on its own
  // 3-tone colourPrimary/Secondary/Tertiary style (e.g. controls_if's own
  // "logic_blocks" style) render solid black - Zelos's own blockStyles
  // weren't resolving correctly layered under this app's custom theme.
  // Classic's simpler single-colour block styles don't hit that.
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: 'Inter, sans-serif',
    weight: 'normal',
    size: 11,
  },
});

// Re-run whenever "Enable per-row sprite colors" (see Configuration.vue)
// changes, not just once at mount - both here (the initial options.toolbox)
// and via updateToolbox() in the enableSpriteColors watcher below, so the
// rainbow colors blocks (gated on {{#if enableSpriteColors}} in
// blockly-toolbox.xml.hbs) appear/disappear from the toolbox live as the
// toggle changes, without needing a page reload. Only gates whether the
// blocks are OFFERED in the toolbox - a block already placed on the canvas
// before the toggle was turned off keeps working exactly as it did (see
// generators/bbasic.js's own isEnabled()-based pre-scan, unaffected by
// this), same as any other toolbox-only restriction in this app.
const buildToolboxXml = (enableSpriteColors) => Handlebars.compile(blocklyToolboxTemplate)({
  blocklyToolboxPlayer0Movement,
  blocklyToolboxPlayer1Movement,
  blocklyToolboxBallMovement,
  blocklyToolboxBackground,
  blocklyToolboxExampleEvent,
  enableSpriteColors,
});

export default {
  components: {BlocklyComponent},
  name: 'HelloWorld',

  data() {
    const configurationStorage = useConfigurationStorage();
    const muteBlocklySoundsStorage = useMuteBlocklySoundsStorage();
    const gridSnapStorage = useGridSnapStorage();
    return {
      generatedBasic: useGeneratedBasic(),
      muteBlocklySoundsStorage,
      gridSnapStorage,
      options: {
        media: 'media/',
        sounds: !muteBlocklySoundsStorage.value,
        theme: APP_BLOCKLY_THEME,
        // Zelos is Blockly's own "modern" look (rounded blocks, inline
        // toolbox icons, etc.) - purely a block SHAPE change here, kept
        // independent of APP_BLOCKLY_THEME's own colours (still Classic's -
        // see that theme's own comment), which is a valid/supported
        // combination on Blockly's end.
        renderer: 'zelos',
        grid: {
          spacing: 25,
          length: 3,
          colour: '#ccc',
          // Blockly.inject() only ever reads this once, at injection time
          // (see toggleGridSnap's own comment on Grid.prototype.shouldSnap
          // having no supported setter) - seeding it from the persisted
          // setting here is what makes a remembered "on" actually snap
          // blocks from the very first drag, not just show the icon as on.
          snap: gridSnapStorage.value,
        },
        // move.wheel enables wheel-scrolling at all - unset (this app never
        // set a "move" option before), Blockly's own default only turns
        // wheel-scroll on when moveOptions.scrollbars is passed as a plain
        // per-axis OBJECT, not the plain "true" its own hasCategories-based
        // default resolves to (see node_modules/blockly/core/options.js'
        // parseMoveOptions_) - so plain wheel silently did nothing but zoom
        // before this, regardless of BlocklyComponent.vue's own
        // shift-to-zoom patch. drag: true matches what Blockly would have
        // defaulted to anyway (scrollbars implies drag-to-pan) - listed
        // explicitly here since scrollbars is no longer left to infer it.
        move: {
          scrollbars: true,
          wheel: true,
          drag: true,
        },
        zoom: {
          controls: true,
          wheel: true,
          startScale: 1.0,
          maxScale: 3,
          minScale: 0.3,
          scaleSpeed: 1.2,
        },
        toolbox: buildToolboxXml((configurationStorage.value || {}).enableSpriteColors),
      },
      workspaceStorage: useWorkspaceStorage(),
      errorStorage: useErrorStorage(),
      configurationStorage,
      // Mirrors options.grid.snap's own initial value (see just above) -
      // seeded from the persisted setting (same storage, gridSnapStorage)
      // so the toggle icon and the actual live grid stay in sync with
      // whatever the user last left it as, across navigating away and back.
      gridSnapEnabled: gridSnapStorage.value,
    };
  },
  methods: {
    // Two prior approaches (a Vuetify v-btn positioned with a hand-measured
    // "bottom" pixel value, then the same button repositioned via a live
    // getBoundingClientRect() measurement against Blockly's own rendered
    // zoom-controls group) both drifted away from Blockly's actual zoom
    // cluster under layouts other than the one they were tested against -
    // confirmed repeatedly, not just once. Rather than keep chasing a
    // measurement-based fix, this button is now a genuine 4th child of
    // Blockly's OWN zoom-controls SVG group (workspace.zoomControls_.
    // svgGroup_, the same private field zoom_controls.js itself stores its
    // reset/in/out button groups in - see its own createDom/position
    // methods) - positioned with a plain SVG transform in the exact same
    // coordinate system those three buttons already use, so it's pinned to
    // them by construction instead of by a separately-computed guess that
    // can drift. HEIGHT_ (32) + LARGE_SPACING_ (11) from zoom_controls.js
    // matches the same gap already used between the reset button and the
    // zoom-in button below it.
    setupGridSnapZoomButton() {
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      const zoomControls = workspace && workspace.zoomControls_;
      if (!zoomControls || !zoomControls.svgGroup_ || this.gridSnapSvgGroup_) return;

      const NS = 'http://www.w3.org/2000/svg';
      const group = document.createElementNS(NS, 'g');
      // -43 = -(HEIGHT_ [32] + LARGE_SPACING_ [11]) from zoom_controls.js,
      // one slot past the reset button (nearest workspace center) - the
      // DEFAULT (vertical) layout's own final position, set once here since
      // nothing else ever repositions it in that mode. The horizontal
      // layout option overrides this via BlocklyComponent.vue's own
      // ZoomControls.position patch instead (see zoomControls.gridSnapGroup_
      // just below, and workspace.resize() right after this function
      // appends the group) - so this initial value only matters, and only
      // briefly, when that option is off.
      group.setAttribute('transform', 'translate(0, -43)');
      group.style.cursor = 'pointer';

      // Plain transparent rect gives this the same 32x32 (WIDTH_/HEIGHT_)
      // clickable footprint the other three buttons get for free from
      // their own <image> element's own bounds.
      const hitArea = document.createElementNS(NS, 'rect');
      hitArea.setAttribute('width', '32');
      hitArea.setAttribute('height', '32');
      hitArea.setAttribute('fill', 'transparent');
      group.appendChild(hitArea);

      // A plain 2x2 grid glyph, drawn directly rather than referencing
      // Blockly's own sprite sheet (media/sprites.png - see zoom_
      // controls.js's own createDom - has no grid icon in it to clip out).
      const icon = document.createElementNS(NS, 'g');
      icon.style.pointerEvents = 'none';
      [[8, 8], [18, 8], [8, 18], [18, 18]].forEach(([x, y]) => {
        const rect = document.createElementNS(NS, 'rect');
        rect.setAttribute('x', x);
        rect.setAttribute('y', y);
        rect.setAttribute('width', '6');
        rect.setAttribute('height', '6');
        icon.appendChild(rect);
      });
      group.appendChild(icon);

      const title = document.createElementNS(NS, 'title');
      group.appendChild(title);

      // Active (toggled on) is always full opacity, solid blue - it should
      // read as clearly "on" regardless of whether the mouse happens to be
      // over it. Inactive starts fainter (.25, dimmer than Blockly's own
      // zoom-icon rest opacity of .4) so it visibly recedes next to the
      // solid active state, brightening the same way those icons do as the
      // mouse gets closer to actually clicking it. Fill starts from the same
      // near-black those icons are actually drawn at (confirmed directly:
      // sampling the zoom-out icon's own pixels averaged to ~rgb(45,45,45) -
      // a flat mid-grey like '#757575' BEFORE opacity is applied came out
      // visibly lighter/washed-out next to them).
      const render = () => {
        const active = this.gridSnapEnabled;
        icon.setAttribute('fill', active ? '#1976d2' : '#000000');
        icon.style.opacity = active ? '1' : '.25';
        title.textContent = active ?
          'Turn off block grid snap' : 'Turn on block grid snap';
      };
      render();

      group.addEventListener('mouseenter', () => {
        if (!this.gridSnapEnabled) icon.style.opacity = '.5';
      });
      group.addEventListener('mouseleave', render);
      group.addEventListener('mousedown', () => {
        if (!this.gridSnapEnabled) icon.style.opacity = '.75';
      });
      group.addEventListener('click', () => {
        this.toggleGridSnap();
        render();
      });

      zoomControls.svgGroup_.appendChild(group);
      this.gridSnapSvgGroup_ = group;
      // Read directly by BlocklyComponent.vue's own ZoomControls.position
      // override (horizontal layout only) - a direct reference rather than
      // making that code go hunting through svgGroup_'s own children by
      // index, which broke outright once actually tried (fragile: relies on
      // this being exactly the Nth child, with no error if that assumption
      // ever stops holding).
      zoomControls.gridSnapGroup_ = group;

      // Appending a new child here doesn't itself trigger Blockly to
      // reposition anything - the very first layout pass (triggered by
      // Blockly.inject itself, in BlocklyComponent's own mounted(), which
      // runs before this one) already finished before this 4th child even
      // existed. In the default (vertical) layout that's fine, since this
      // group's own initial transform above is already its final position -
      // but the horizontal layout (see BlocklyComponent.vue's own
      // ZoomControls.position override) recomputes THIS group's own
      // position dynamically every time position() runs, so without a fresh
      // pass here it stays wherever it happened to render for the first
      // (and only, until some later resize) time: nowhere, since it was
      // never positioned by that logic at all yet. workspace.resize() is
      // the same method window-resize events themselves trigger.
      workspace.resize();
    },
    // Blockly (this bundled version, 6.20210701.0) has no public setter for
    // grid snap - Grid.prototype.shouldSnap() only ever reads its own
    // snapToGrid_ field, set once from options.grid.snap at injection time,
    // with no supported way to change it afterward. shouldSnap() IS read
    // fresh on every block drag-end (see node_modules/blockly/core/
    // block_svg.js's own snapToGrid_ call), not cached anywhere else, so
    // writing straight to that private field still takes effect immediately
    // for every future placement - the only lever this Blockly version
    // actually offers for a live toggle.
    toggleGridSnap() {
      this.gridSnapEnabled = !this.gridSnapEnabled;
      this.gridSnapStorage.value = this.gridSnapEnabled;
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      const grid = workspace && workspace.getGrid && workspace.getGrid();
      if (grid) grid.snapToGrid_ = this.gridSnapEnabled;
    },
    // Only the bBasic source is refreshed as blocks change; compiling it into a
    // ROM is left to the "Update ROM" button, since a build is slow and a
    // faulty program can lock up the emulator along with the rest of the app.
    showCode() {
      let code;
      try {
        code = BlocklyBB.workspaceToCode(this.$refs['foo'].workspace);
      } catch (e) {
        showError(this.errorStorage, 'Error while generating bBasic code', code, e);
        return;
      }

      // Blockly reports UI-only changes too (opening the toolbox, scrolling),
      // so compare the code rather than trusting the event.
      if (code !== this.generatedBasic.value) {
        this.generatedBasic.value = code;
        markRomOutdated();
      }
    },
  },
  computed: {
    blocklySoundsEnabled() {
      return !this.muteBlocklySoundsStorage.value;
    },
    spriteColorsEnabled() {
      return !!(this.configurationStorage.value || {}).enableSpriteColors;
    },
    workspaceData: {
      get() {
        try {
          return this.workspaceStorage.value||'';
        } catch (e) {
          showError(this.errorStorage, 'Error loading workspace from local storage', '', e);
          return '';
        }
      },
      set(value) {
        this.workspaceStorage.value = value;
      },
    },
  },
  watch: {
    blocklySoundsEnabled(newVal) {
      this.options.sounds = newVal;
    },
    // Live-rebuilds the toolbox XML and pushes it into the already-running
    // Blockly workspace via its own updateToolbox() - options.toolbox
    // itself is only ever read once, at Blockly.inject() time (see
    // BlocklyComponent.vue's own mounted()), so just reassigning it
    // wouldn't do anything after the fact.
    spriteColorsEnabled(newVal) {
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      if (!workspace) return;
      workspace.updateToolbox(buildToolboxXml(newVal));
    },
  },
  mounted() {
    // BlocklyComponent's own mounted() (a child, so it runs first) has
    // already called Blockly.inject by the time this runs, so
    // workspace.zoomControls_ already exists - no rAF/ResizeObserver needed
    // here unlike the two prior approaches, since this only ever appends a
    // new child to an existing group once; it doesn't need to know the
    // group's rendered screen position, so it isn't affected by layout
    // settling the way a getBoundingClientRect()-based measurement was.
    this.setupGridSnapZoomButton();
  },
  beforeDestroy() {
    if (this.gridSnapSvgGroup_ && this.gridSnapSvgGroup_.parentNode) {
      this.gridSnapSvgGroup_.parentNode.removeChild(this.gridSnapSvgGroup_);
    }
  },
};
</script>
<style scoped>
#blockly2 {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  right: 0;
}

/* The grid-snap toggle itself is no longer an HTML element positioned over
   the canvas (see setupGridSnapZoomButton in the script) - it's a genuine
   SVG child of Blockly's own zoom-controls group, styled inline where it's
   built rather than here. */
</style>
