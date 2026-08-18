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
import {useWorkspaceStorage, useErrorStorage, useConfigurationStorage} from '../hooks/project';
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
  base: Blockly.Themes.Classic,
  fontStyle: {
    family: 'Inter, sans-serif',
    weight: 'normal',
    size: 11,
  },
});

export default {
  components: {BlocklyComponent},
  name: 'HelloWorld',

  data() {
    const configurationStorage = useConfigurationStorage();
    return {
      generatedBasic: useGeneratedBasic(),
      options: {
        media: 'media/',
        sounds: !(configurationStorage.value || {}).muteBlocklySounds,
        theme: APP_BLOCKLY_THEME,
        grid: {
          spacing: 25,
          length: 3,
          colour: '#ccc',
          snap: true,
        },
        zoom: {
          controls: true,
          wheel: true,
          startScale: 1.0,
          maxScale: 3,
          minScale: 0.3,
          scaleSpeed: 1.2,
        },
        toolbox: Handlebars.compile(blocklyToolboxTemplate)({
          blocklyToolboxPlayer0Movement,
          blocklyToolboxPlayer1Movement,
          blocklyToolboxBallMovement,
          blocklyToolboxBackground,
          blocklyToolboxExampleEvent,
        }),
      },
      workspaceStorage: useWorkspaceStorage(),
      errorStorage: useErrorStorage(),
      configurationStorage,
      // Mirrors options.grid.snap's own initial value - a page-local UI
      // preference (not persisted, unlike muteBlocklySounds), since this is
      // just a quick on/off toggle for the current session, not a project
      // setting.
      gridSnapEnabled: true,
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

      // Same three opacity steps as Blockly's own zoom controls (rest/
      // hover/active, see BlocklyComponent.vue's own moveDuringDrag patch
      // comment for where that convention is documented), except the
      // "enabled" state stays at full opacity in blue - the one deliberate
      // difference, since Blockly's own icons have no on/off state to show.
      const render = () => {
        icon.setAttribute('fill', this.gridSnapEnabled ? '#1976d2' : '#000');
        icon.style.opacity = this.gridSnapEnabled ? '1' : '.4';
        title.textContent = this.gridSnapEnabled ?
          'Turn off block grid snap' : 'Turn on block grid snap';
      };
      render();

      group.addEventListener('mouseenter', () => {
        if (!this.gridSnapEnabled) icon.style.opacity = '.6';
      });
      group.addEventListener('mouseleave', render);
      group.addEventListener('mousedown', () => {
        if (!this.gridSnapEnabled) icon.style.opacity = '.8';
      });
      group.addEventListener('click', () => {
        this.toggleGridSnap();
        render();
      });

      zoomControls.svgGroup_.appendChild(group);
      this.gridSnapSvgGroup_ = group;
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
      return !(this.configurationStorage.value || {}).muteBlocklySounds;
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
