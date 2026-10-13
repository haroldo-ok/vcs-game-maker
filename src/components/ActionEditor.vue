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
  useGridSnapStorage, useDesaturateBlocklyColorsStorage, useDarkModeStorage} from '../hooks/project';
import {useGeneratedBasic} from '../hooks/generated';
import {markRomOutdated} from '../hooks/rom';

// Keep in sync with --blockly-font-family in App.vue's  global <style>
// (deliberately its variable, not --app-font-family - this app's Inter
// font everywhere else is unaffected, only Blockly's block/flyout text uses
// this one) - there's no build-time bridge between a CSS custom property
// and this JS theme config, so the two have to be updated together by hand.
// Blockly
// measures every block's  text width at layout time using ITS
// font-metrics call (a hidden canvas context, not the DOM/CSS engine), so
// switching the app's font via CSS alone (see App.vue's .blocklyText
// override) left Blockly still measuring block width as if the text were
// still in its  default (11pt sans-serif) - text rendered in the new,
// often-wider font then visibly overran the space Blockly had reserved for
// it, overlapping whatever field/input came right after (confirmed
// directly: "plus" on the "every X frames" block overlapping its  value
// field, "to" on "change state to" overlapping its dropdown). Registering
// the real font here instead means Blockly's  measurement uses it from
// the start, so block width is computed correctly to begin with - the CSS
// override above is then mostly redundant for block text specifically) but
// still needed for the toolbox/flyout labels here, which use this same
// theme's fontStyle too.
const APP_BLOCKLY_THEME = Blockly.Theme.defineTheme('app', {
  name: 'app',
  // Colours stay on Classic (the app's  original palette, per-category
  // block colours this app has always used) - the block SHAPE is back to
  // Blockly's default renderer too (see options.renderer's  comment in
  // this file), so this app is visually back to its original look overall.
  // Briefly tried Blockly.Themes.Zelos as the base here (paired with the
  // Zelos renderer) - that made every stock block relying on its  3-tone
  // colourPrimary/Secondary/Tertiary style (e.g. controls_if's
  // "logic_blocks" style) render solid black, since Zelos's  blockStyles
  // weren't resolving correctly layered under this app's custom theme;
  // Classic's simpler single-colour block styles never hit that.
  base: Blockly.Themes.Classic,
  fontStyle: {
    // Quoted ("IBM Plex Mono", not bare IBM Plex Mono) - this string gets
    // concatenated directly into a canvas 2D context's font property
    // (dom.getFastTextWidthWithSizeString, node_modules/blockly/core/
    // utils/dom.js: `fontWeight + ' ' + fontSize + ' ' + fontFamily`), which
    // follows the same CSS font-shorthand parsing rules as a real font:
    // property - an unquoted multi-word family name there is ambiguous
    // (parses as several single-word fallback names instead of one), so the
    // canvas silently measured against its default font instead, producing
    // a NARROWER width than the real font actually renders at - confirmed
    // as the real reason "block width is computed correctly to begin with"
    // (this comment's claim, right above) wasn't actually true: text
    // visibly overflowing its block ("too narrow"), permanently
    // (not the font-load race this looks like at first - quoting is wrong
    // regardless of whether the font has finished loading yet).
    family: '"IBM Plex Mono", monospace',
    weight: 'normal',
    size: 11,
  },
});

// Re-run whenever "Enable per-row Player 0/1 sprite colors" (see
// Configuration.vue) changes, not just once at mount - both here (the
// initial options.toolbox) and via updateToolbox() in the
// player0SpriteColorsEnabled/player1SpriteColorsEnabled watchers below, so
// the rainbow colors blocks (gated on {{#if enablePlayer0SpriteColors}}/
// {{#if enablePlayer1SpriteColors}} in blockly-toolbox.xml.hbs) appear/
// disappear from the toolbox live as either toggle changes, without needing
// a page reload. Only gates whether the blocks are OFFERED in the toolbox -
// a block already placed on the canvas before the toggle was turned off
// keeps working exactly as it did (see generators/bbasic.js's
// isEnabled()-based pre-scan, unaffected by this), same as any other
// toolbox-only restriction in this app.
const buildToolboxXml = (enablePlayer0SpriteColors, enablePlayer1SpriteColors, kernelIsDpcPlus) =>
  Handlebars.compile(blocklyToolboxTemplate)({
    blocklyToolboxPlayer0Movement,
    blocklyToolboxPlayer1Movement,
    blocklyToolboxBallMovement,
    blocklyToolboxBackground,
    blocklyToolboxExampleEvent,
    enablePlayer0SpriteColors,
    enablePlayer1SpriteColors,
    kernelIsDpcPlus,
  });

export default {
  components: {BlocklyComponent},
  name: 'HelloWorld',

  data() {
    const configurationStorage = useConfigurationStorage();
    const muteBlocklySoundsStorage = useMuteBlocklySoundsStorage();
    const gridSnapStorage = useGridSnapStorage();
    // A plain one-off .value read (not a reactive binding) - same "only
    // takes effect on the next remount" reasoning as gridSnapStorage.value
    // just below (options.grid.snap): Blockly.inject() only ever reads
    // options.theme once, at injection time, so a live binding here
    // wouldn't do anything useful anyway - toggling this setting already
    // requires leaving and revisiting the Actions tab for the renderer/
    // theme-level effects it has elsewhere (see ActionEditor.vue's
    // renderer comment). Mutates APP_BLOCKLY_THEME itself (a module-level
    // singleton reused by every mount) via setComponentStyle - the theme
    // object is otherwise defined once, at import time, well before any
    // component (and so this storage value) could ever be read, so there's
    // no other point BEFORE injection where this could be set instead.
    const desaturateBlocklyColors = useDesaturateBlocklyColorsStorage().value;
    APP_BLOCKLY_THEME.setComponentStyle('workspaceBackgroundColour',
        desaturateBlocklyColors ? '#e8e8e8' : null);
    return {
      generatedBasic: useGeneratedBasic(),
      muteBlocklySoundsStorage,
      gridSnapStorage,
      options: {
        media: 'media/',
        sounds: !muteBlocklySoundsStorage.value,
        theme: APP_BLOCKLY_THEME,
        // 'thrasos' keeps the original puzzle-piece block SHAPES (same tab/
        // notch geometry as 'geras', the default, and unlike 'zelos''
        // rounded look) but drops Geras'  light/dark bevel highlight
        // overlay - it shares the same flat "common" drawer Zelos itself is
        // built on, just without Zelos' rounded corners. What's left is a
        // single flat fill plus a solid stroke outline (auto-derived, a
        // darker shade of each block's  colour) - a plain border, no 3D
        // effect. APP_BLOCKLY_THEME's  colours are unaffected either way
        // (still Classic's - see that theme's  comment).
        renderer: 'thrasos',
        grid: {
          spacing: 25,
          length: 3,
          // A touch darker than the usual '#ccc' once the workspace
          // background itself is dimmed (see desaturateBlocklyColors
          // above) - '#ccc' dots read fine against pure white, but lose
          // enough contrast against '#e8e8e8' to be hard to see.
          colour: desaturateBlocklyColors ? '#bbb' : '#ccc',
          // Blockly.inject() only ever reads this once, at injection time
          // (see toggleGridSnap's  comment on Grid.prototype.shouldSnap
          // having no supported setter) - seeding it from the persisted
          // setting here is what makes a remembered "on" actually snap
          // blocks from the very first drag, not just show the icon as on.
          snap: gridSnapStorage.value,
        },
        // move.wheel enables wheel-scrolling at all - unset (this app never
        // set a "move" option before), Blockly's  default only turns
        // wheel-scroll on when moveOptions.scrollbars is passed as a plain
        // per-axis OBJECT, not the plain "true" its  hasCategories-based
        // default resolves to (see node_modules/blockly/core/options.js'
        // parseMoveOptions_) - so plain wheel silently did nothing but zoom
        // before this, regardless of BlocklyComponent.vue's
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
        toolbox: buildToolboxXml((configurationStorage.value || {}).enablePlayer0SpriteColors,
            (configurationStorage.value || {}).enablePlayer1SpriteColors,
            (configurationStorage.value || {}).kernel === 'dpcplus'),
      },
      workspaceStorage: useWorkspaceStorage(),
      errorStorage: useErrorStorage(),
      configurationStorage,
      // Mirrors options.grid.snap's  initial value (see just above) -
      // seeded from the persisted setting (same storage, gridSnapStorage)
      // so the toggle icon and the actual live grid stay in sync with
      // whatever the user last left it as, across navigating away and back.
      gridSnapEnabled: gridSnapStorage.value,
      darkModeStorage: useDarkModeStorage(),
    };
  },
  methods: {
    // Two prior approaches (a Vuetify v-btn positioned with a hand-measured
    // "bottom" pixel value, then the same button repositioned via a live
    // getBoundingClientRect() measurement against Blockly's rendered
    // zoom-controls group) both drifted away from Blockly's actual zoom
    // cluster under layouts other than the one they were tested against -
    // confirmed repeatedly, not just once. A THIRD approach (a genuine 4th
    // child of Blockly's zoom-controls SVG group, pinned by construction to
    // its WIDTH_/HEIGHT_/LARGE_SPACING_) worked, but only as long as that
    // row was the only thing sharing its corner - once the multiselect
    // plugin's icon (see BlocklyComponent.vue's "Lets the user drag a
    // rubber-band..." comment) also needed a spot there, the two started
    // overlapping. Grid snap now lives as a plain CHILD of THAT icon's
    // group instead - see the fixed "translate(36, 0)" below - riding along
    // with wherever BlocklyComponent.vue's multiselectControls position()
    // override puts it, in the corner the zoom-controls row never uses at
    // all, with no separate positioning logic needed.
    setupGridSnapZoomButton() {
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      // The multiselect plugin's toggle icon (BlocklyComponent.vue's
      // mounted() registers it under this exact id - MultiselectControls'
      // "this.id = 'multiselectControls'", see node_modules/@mit-app-
      // inventor/blockly-plugin-workspace-multiselect/src/
      // multiselect_controls.js) - a sibling Vue component, not something
      // this one builds itself, reached through the workspace's
      // ComponentManager (the same registry both plugins and this app's
      // positionable overrides already share) instead of a prop/ref, since
      // BlocklyComponent.vue owns the Multiselect instance privately.
      const multiselectControls = workspace && workspace.getComponentManager &&
        workspace.getComponentManager().getComponent('multiselectControls');
      if (!multiselectControls || !multiselectControls.svgGroup_ || this.gridSnapSvgGroup_) return;

      const NS = 'http://www.w3.org/2000/svg';
      const group = document.createElementNS(NS, 'g');
      // A dedicated class (not just relying on living inside
      // .blocklyMultiselect's subtree for CSS targeting) - confirmed live,
      // via the actual rendered DOM, that this group does NOT end up a
      // descendant of the
      // .blocklyMultiselect-classed element despite being appended to
      // multiselectControls.svgGroup_ below (that property apparently
      // isn't the same node the "blocklyMultiselect" class lands on) - so
      // App.vue's Dark Mode CSS (.grid-snap-icon-group) needs this class to
      // have anything stable to select at all, confirmed as a real
      // reported bug ("grid icon in blockly still needs to be inverted...
      // inactive state") otherwise.
      group.setAttribute('class', 'grid-snap-icon-group');
      // A plain CHILD of the multiselect icon's group (not a second
      // independently-positioned POSITIONABLE component the way this used
      // to sit in Blockly's zoom-controls row) - 36 = 32 (that icon's
      // WIDTH/HEIGHT) + 4px gap, sitting immediately to its right. Only
      // ever needs this ONE fixed local transform, regardless of layout
      // mode or window size: BlocklyComponent.vue's position() override for
      // multiselectControls already recomputes ITS outer translate on every
      // resize, and this group rides along with it automatically as its
      // child, with no separate dynamic repositioning needed the way the
      // old zoom-controls-row slot required (see the git history of this
      // function for that old approach, and why it needed
      // BlocklyComponent.vue's involvement just to place a single button -
      // confirmed as a real reported overlap otherwise, "grid and
      // multiselect icons are overlapping", once both independently claimed
      // the same corner).
      group.setAttribute('transform', 'translate(36, 0)');
      group.style.cursor = 'pointer';

      // Plain transparent rect gives this the same 32x32 (WIDTH_/HEIGHT_)
      // clickable footprint the other three buttons get for free from
      // their <image> element's  bounds.
      const hitArea = document.createElementNS(NS, 'rect');
      hitArea.setAttribute('width', '32');
      hitArea.setAttribute('height', '32');
      hitArea.setAttribute('fill', 'transparent');
      group.appendChild(hitArea);

      // A plain 2x2 grid glyph, drawn directly rather than referencing
      // Blockly's  sprite sheet (media/sprites.png - see zoom_
      // controls.js's  createDom - has no grid icon in it to clip out).
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
      // over it. Inactive starts fainter (.25, dimmer than Blockly's
      // zoom-icon rest opacity of .4) so it visibly recedes next to the
      // solid active state, brightening the same way those icons do as the
      // mouse gets closer to actually clicking it. Fill starts from the same
      // near-black those icons are actually drawn at (confirmed directly:
      // sampling the zoom-out icon's  pixels averaged to ~rgb(45,45,45) -
      // a flat mid-grey like '#757575' BEFORE opacity is applied came out
      // visibly lighter/washed-out next to them).
      const render = () => {
        const active = this.gridSnapEnabled;
        // Off: the near-black glyph, or white in Dark Mode (a filter can't be used:
        // it would turn the active blue into another color). On: always the blue.
        icon.setAttribute('fill', active ? '#1976d2' : (this.darkModeStorage.value ? '#ffffff' : '#000000'));
        icon.style.opacity = active ? '1' : '.25';
        title.textContent = active ?
          'Turn off block grid snap' : 'Turn on block grid snap';
      };
      render();
      this.renderGridSnapIcon_ = render;

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

      multiselectControls.svgGroup_.appendChild(group);
      this.gridSnapSvgGroup_ = group;
    },
    // Blockly 10's Grid class has a public setSnapToGrid() for exactly this
    // (confirmed against node_modules/blockly/core/grid.d.ts) - its private
    // field is named "snapToGrid" (no trailing underscore) now, not the
    // "snapToGrid_" this used to write directly under an older bundled
    // Blockly version; writing to that old name silently created an unused
    // property instead of ever reaching the real grid, a real bug (grid snap
    // toggle doing nothing) confirmed directly against the installed
    // package's type declarations. shouldSnap() is read fresh on every block
    // drag-end (see node_modules/blockly/core/block_svg.js's call), not
    // cached anywhere else, so the setter still takes effect immediately for
    // every future placement.
    toggleGridSnap() {
      this.gridSnapEnabled = !this.gridSnapEnabled;
      this.gridSnapStorage.value = this.gridSnapEnabled;
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      const grid = workspace && workspace.getGrid && workspace.getGrid();
      if (grid) grid.setSnapToGrid(this.gridSnapEnabled);
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
    player0SpriteColorsEnabled() {
      return !!(this.configurationStorage.value || {}).enablePlayer0SpriteColors;
    },
    player1SpriteColorsEnabled() {
      return !!(this.configurationStorage.value || {}).enablePlayer1SpriteColors;
    },
    kernelIsDpcPlus() {
      return (this.configurationStorage.value || {}).kernel === 'dpcplus';
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
    // Blockly workspace via its  updateToolbox() - options.toolbox
    // itself is only ever read once, at Blockly.inject() time (see
    // BlocklyComponent.vue's  mounted()), so just reassigning it
    // wouldn't do anything after the fact.
    player0SpriteColorsEnabled() {
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      if (!workspace) return;
      workspace.updateToolbox(buildToolboxXml(this.player0SpriteColorsEnabled, this.player1SpriteColorsEnabled,
          this.kernelIsDpcPlus));
    },
    player1SpriteColorsEnabled() {
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      if (!workspace) return;
      workspace.updateToolbox(buildToolboxXml(this.player0SpriteColorsEnabled, this.player1SpriteColorsEnabled,
          this.kernelIsDpcPlus));
    },
    kernelIsDpcPlus() {
      const workspace = this.$refs['foo'] && this.$refs['foo'].workspace;
      if (!workspace) return;
      workspace.updateToolbox(buildToolboxXml(this.player0SpriteColorsEnabled, this.player1SpriteColorsEnabled,
          this.kernelIsDpcPlus));
    },
  },
  mounted() {
    // BlocklyComponent's  mounted() (a child, so it runs first) has
    // already called Blockly.inject by the time this runs, so
    // workspace.zoomControls_ already exists - no rAF/ResizeObserver needed
    // here unlike the two prior approaches, since this only ever appends a
    // new child to an existing group once; it doesn't need to know the
    // group's rendered screen position, so it isn't affected by layout
    // settling the way a getBoundingClientRect()-based measurement was.
    this.setupGridSnapZoomButton();
    // Redraws the grid snap icon in the colors for the new theme (see render in
    // setupGridSnapZoomButton). darkModeStorage is a ref held as is in data(), so
    // it is read through .value.
    this.$watch(() => this.darkModeStorage.value, () => {
      if (this.renderGridSnapIcon_) this.renderGridSnapIcon_();
    });
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
   SVG child of Blockly's zoom-controls group, styled inline where it's
   built rather than here. */
</style>
