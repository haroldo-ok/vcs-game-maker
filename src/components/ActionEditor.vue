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

import BlocklyComponent from './BlocklyComponent.vue';

import '../blocks/prompt-fix';

import '../blocks/background';
import '../blocks/bit';
import '../blocks/collision';
import '../blocks/color';
import '../blocks/event';
import '../blocks/input';
import '../blocks/loops';
import '../blocks/math';
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
import {showError} from '../utils/build-error';
import {useWorkspaceStorage, useErrorStorage} from '../hooks/project';
import {useGeneratedBasic} from '../hooks/generated';
import {markRomOutdated} from '../hooks/rom';

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
  }),
  methods: {
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
