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

    <p id="code">
      <vue-code-highlight language="basic">
        <pre v-html="code"></pre>
      </vue-code-highlight>
    </p>
  </v-container>
</template>

<script>
import {component as VueCodeHighlight} from 'vue-code-highlight';
import 'vue-code-highlight/themes/duotone-sea.css';

import BlocklyComponent from './BlocklyComponent.vue';

import '../blocks/input';
import '../blocks/sprites';
import blocklyToolbox from 'raw-loader!./blockly-toolbox.xml';
import BlocklyBB from '../generators/bbasic';
import {useLocalStorage} from '../hooks';

export default {
  components: {BlocklyComponent, VueCodeHighlight},
  name: 'HelloWorld',

  data: () => ({
    code: '',
    options: {
      media: 'media/',
      grid: {
        spacing: 25,
        length: 3,
        colour: '#ccc',
        snap: true,
      },
      toolbox: blocklyToolbox,
    },
    workspaceStorage: useLocalStorage('vcs-game-maker.workspace'),
  }),
  methods: {
    showCode() {
      this.code = BlocklyBB.workspaceToCode(this.$refs['foo'].workspace);
    },
  },
  computed: {
    workspaceData: {
      get() {
        try {
          return this.workspaceStorage.value||'';
        } catch (e) {
          console.error('Error loading workspace from local storage', e);
          return '';
        }
      },
      set(value) {
        this.workspaceStorage.value = value;
      },
    },
  },
};
</script>
<style scoped>
#code {
  position: absolute;
  top: 0;
  right: 0;
  bottom: 0;
  width: 50%;
  margin: 0;
  background-color: beige;
}
#blockly2 {
  position: absolute;
  top: 0;
  left: 0;
  bottom: 0;
  width: 50%;
}
</style>
