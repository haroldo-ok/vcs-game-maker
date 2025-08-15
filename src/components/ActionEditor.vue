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

import bBasic from 'batari-basic';

import BlocklyComponent from './BlocklyComponent.vue';

import '../blocks/prompt-fix';

import '../blocks/background';
import '../blocks/collision';
import '../blocks/color';
import '../blocks/event';
import '../blocks/input';
import '../blocks/random';
import '../blocks/score';
import '../blocks/sound';
import '../blocks/sprites';

import blocklyToolboxTemplate from 'raw-loader!./blockly-toolbox.xml.hbs';
import blocklyToolboxPlayer0Movement from 'raw-loader!./blockly-toolbox-player0-movement.xml';
import blocklyToolboxPlayer1Movement from 'raw-loader!./blockly-toolbox-player1-movement.xml';
import blocklyToolboxBallMovement from 'raw-loader!./blockly-toolbox-ball-movement.xml';
import blocklyToolboxBackground from 'raw-loader!./blockly-toolbox-background.xml';
import blocklyToolboxExampleEvent from 'raw-loader!./blockly-toolbox-example-event.xml';

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
