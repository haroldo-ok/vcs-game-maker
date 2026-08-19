<template>
  <div>
    <div class="blocklyDiv" ref="blocklyDiv">
    </div>
    <xml ref="blocklyToolbox" style="display:none">
      <slot></slot>
    </xml>
  </div>
</template>

<script>
/**
 * @license
 *
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * @fileoverview Blockly Vue Component.
 * @author samelh@google.com (Sam El-Husseini)
 */

import Blockly from 'blockly';
import {debounce} from 'lodash';

// Live-snap-while-dragging: stock Blockly only ever snaps a block to the
// grid once, at the very END of a drag (BlockSvg.prototype.snapToGrid,
// reached via BlockDragger's own endDrag flow) - moveDuringDrag (called on
// every single mousemove, with the block's live workspace-coordinate
// target position) never consults the grid at all, so a dragged block's
// on-screen position never visibly snaps until you let go, even with grid
// snap turned on. Patched once here, at the shared prototype level (there's
// no per-workspace hook Blockly itself offers for this - confirmed via its
// own docs at https://docs.blockly.com/guides/configure/grid/, which only
// documents the injection-time "snap" option, nothing for drag-time
// behaviour) - rounds the live position to the nearest grid vertex on every
// move too, using the exact same half-spacing formula
// BlockSvg.prototype.snapToGrid itself uses (see node_modules/blockly/core/
// block_svg.js), so what's shown while dragging always agrees with where
// the block will actually land.
const originalMoveDuringDrag = Blockly.BlockSvg.prototype.moveDuringDrag;
Blockly.BlockSvg.prototype.moveDuringDrag = function(newLoc) {
  const grid = this.workspace && this.workspace.getGrid && this.workspace.getGrid();
  if (grid && grid.shouldSnap()) {
    const spacing = grid.getSpacing();
    const half = spacing / 2;
    newLoc = new Blockly.utils.Coordinate(
        Math.round((newLoc.x - half) / spacing) * spacing + half,
        Math.round((newLoc.y - half) / spacing) * spacing + half);
  }
  originalMoveDuringDrag.call(this, newLoc);
};

// No wheel-behavior patch needed here (an earlier version of this had one,
// for a since-reverted shift-to-zoom scheme) - Ctrl+wheel to zoom, plain
// wheel to scroll vertically, is already stock Blockly's own default
// onMouseWheel_ behavior (node_modules/blockly/core/workspace_svg.js: zooms
// when canWheelZoom && e.ctrlKey, otherwise scrolls). The only reason plain
// wheel used to always zoom regardless of Ctrl was that this app never set
// a "move" option at all, leaving wheel-scrolling off entirely (see
// ActionEditor.vue's own "move: {wheel: true}" option, which is the actual
// fix) - once that's on, stock Blockly's own logic already does exactly
// what's wanted with no override needed.

export default {
  name: 'BlocklyComponent',
  props: ['options', 'value'],
  data() {
    return {
      workspace: null,
      lastSavedWorkspace: null,
    };
  },
  mounted() {
    const options = this.$props.options || {};
    if (!options.toolbox) {
      options.toolbox = this.$refs['blocklyToolbox'];
    }

    this.workspace = Blockly.inject(this.$refs['blocklyDiv'], options);
    this.workspace.addChangeListener(debounce(() => this.handleChange()));
    this.loadWorkspace(this.value);

    // Keep the Blockly SVG sized to its container. The surrounding layout can
    // resize the container after inject (Blockly only reflows on window
    // resize), which would otherwise leave the SVG mis-sized and its zoom and
    // trashcan controls anchored off-screen.
    //
    // The scrollbar specifically needs its own extra settle-and-recompute
    // pass: ResizeObserver can fire mid-reflow (e.g. while a sibling panel's
    // resize is still being applied across a couple of frames), and
    // Blockly.svgResize()/workspace.resize() then caches the scrollbar's
    // position from that in-between size instead of the final one - the SVG
    // itself keeps tracking the container correctly (CSS does that on its
    // own), so only the scrollbar (positioned from Blockly's own cached
    // metrics, not live CSS) ends up visibly drawn in the wrong place versus
    // where it actually receives clicks.
    const resizeWorkspace = () => {
      Blockly.svgResize(this.workspace);
      if (this.workspace.scrollbar) this.workspace.scrollbar.resize();
    };
    this.resizeObserver = new ResizeObserver(() => {
      resizeWorkspace();
      clearTimeout(this.resizeSettleTimer);
      this.resizeSettleTimer = setTimeout(resizeWorkspace, 100);
    });
    this.resizeObserver.observe(this.$refs['blocklyDiv']);
  },
  beforeDestroy() {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    clearTimeout(this.resizeSettleTimer);
  },
  methods: {
    setSoundsEnabled(enabled) {
      const audioMgr = this.workspace.getAudioManager();
      if (enabled) {
        const pathToMedia = (this.$props.options || {}).media || 'media/';
        audioMgr.load(
            [pathToMedia + 'click.mp3', pathToMedia + 'click.wav', pathToMedia + 'click.ogg'], 'click');
        audioMgr.load(
            [pathToMedia + 'disconnect.wav', pathToMedia + 'disconnect.mp3', pathToMedia + 'disconnect.ogg'],
            'disconnect');
        audioMgr.load(
            [pathToMedia + 'delete.mp3', pathToMedia + 'delete.ogg', pathToMedia + 'delete.wav'], 'delete');
      } else {
        audioMgr.SOUNDS_ = {};
      }
    },
    loadWorkspace(value) {
      const xml = Blockly.Xml.textToDom(value && value !== 'null' ?
          value : '<xml xmlns="https://developers.google.com/blockly/xml"/>');
      Blockly.Xml.domToWorkspace(this.workspace, xml);
    },
    handleChange() {
      const xml = Blockly.Xml.workspaceToDom(this.workspace);
      const text = Blockly.Xml.domToPrettyText(xml);
      this.lastSavedWorkspace = text;
      this.$emit('input', text, {
        workspace: this.workspace,
      });
    },
  },
  watch: {
    value(newVal, oldVal) {
      if (newVal !== this.lastSavedWorkspace) {
        this.loadWorkspace(newVal);
      }
    },
    'options.sounds'(newVal) {
      if (this.workspace) {
        this.setSoundsEnabled(newVal);
      }
    },
  },
};
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.blocklyDiv {
  height: 100%;
  width: 100%;
  text-align: left;
}
</style>
