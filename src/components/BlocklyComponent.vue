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
