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
  },
  methods: {
    loadWorkspace(value) {
      if (!value) return;

      const xml = Blockly.Xml.textToDom(value);
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
