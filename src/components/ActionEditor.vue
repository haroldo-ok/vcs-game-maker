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

import '../blocks/background';
import '../blocks/collision';
import '../blocks/input';
import '../blocks/score';
import '../blocks/sound';
import '../blocks/sprites';
import '../blocks/random';
import blocklyToolbox from 'raw-loader!./blockly-toolbox.xml';
import BlocklyBB from '../generators/bbasic';
import {useWorkspaceStorage, useErrorStorage} from '../hooks/project';
import {useGeneratedBasic} from '../hooks/generated';

const preprocessError = (code, e) => {
  if (!code) return e;
  try {
    const codeLines = code.split('\n');

    return `${e}`.split('\n')
        .map((line) => {
          const parts = /^Line (\d+):\s*(.*)/g.exec(line);
          if (!parts) return line;

          const position = parseInt(parts[1]);
          const rest = parts[2];
          return `Line ${position}: ${rest}` + '\n' + codeLines[position - 1];
        })
        .join('\n');
  } catch (e2) {
    logger.warn('Error while preprocessing error message', e2);
    return e;
  }
};

const showError = (errorStorage, msg, code, e) => {
  console.error(msg, e);
  errorStorage.value = `${msg}: ${preprocessError(code, e)}`;
};

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
    workspaceStorage: useWorkspaceStorage(),
    errorStorage: useErrorStorage(),
  }),
  methods: {
    showCode() {
      let code;
      try {
        code = BlocklyBB.workspaceToCode(this.$refs['foo'].workspace);
      } catch (e) {
        showError(this.errorStorage, 'Error while generating bBasic code', code, e);
        return;
      }

      this.generatedBasic.value = code;
      try {
        this.errorStorage.value = '';
        const compiledResult = bBasic(code);
        Javatari.fileLoader.loadFromContent('main.bin', compiledResult.output);

        // TODO: Implement this without a global variable
        Javatari.compiledResult = compiledResult;
      } catch (e) {
        showError(this.errorStorage, 'Error while compiling bBasic code', code, e);
      }
    },
  },
  computed: {
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
</style>
