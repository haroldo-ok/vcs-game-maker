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
import bBasic from 'batari-basic';

import BlocklyComponent from './BlocklyComponent.vue';

import '../blocks/collision';
import '../blocks/input';
import '../blocks/sprites';
import blocklyToolbox from 'raw-loader!./blockly-toolbox.xml';
import BlocklyBB from '../generators/bbasic';
import {useLocalStorage} from '../hooks/storage';
import {useGeneratedBasic} from '../hooks/generated';

export default {
  components: {BlocklyComponent},
  name: 'HelloWorld',

  data: () => ({
    generatedBasic: useGeneratedBasic(),
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
      const code = BlocklyBB.workspaceToCode(this.$refs['foo'].workspace);
      this.generatedBasic.value = code;
      try {
        const compiledResult = bBasic(code);
        Javatari.fileLoader.loadFromContent('main.bin', compiledResult.output);

        // TODO: Implement this without a global variable
        Javatari.compiledResult = compiledResult;
      } catch (e) {
        console.error('Error while compiling bBasic code.', e);
      }
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
