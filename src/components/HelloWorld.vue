<template>
  <v-container>
    <variable-select :items="testItems" v-model="selectedItem" />
    <label>*** {{ selectedItem }} ***</label>

    <v-simple-table>
        <template v-slot:default>
          <thead>
            <tr>
              <th class="text-left" scope="col">
                Condition
              </th>
              <th class="text-left" scope="col">
                Action
              </th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>
                <div  class="d-flex flex-row">
                  <variable-select :items="testItems" />
                  <v-icon>mdi-equal</v-icon>
                  <variable-select :items="testItems" />
                </div>
              </td>
              <td class="d-flex flex-row">
                <div  class="d-flex flex-row">
                  <v-icon>mdi-arrow-up-bold</v-icon>
                  <variable-select :items="testItems" />
                </div>
              </td>
            </tr>
          </tbody>
        </template>
    </v-simple-table>

    <BlocklyComponent id="blockly2" :options="options" ref="foo"></BlocklyComponent>

    <p id="code">
      <button v-on:click="showCode()">Show JavaScript</button>
      <pre v-html="code"></pre>
    </p>
  </v-container>
</template>

<script>
import {baseVariables} from '../services/variables';
import VariableSelect from './VariableSelect.vue';
import BlocklyComponent from './BlocklyComponent.vue';

import '../blocks/stocks';
import blocklyToolbox from 'raw-loader!./blockly-toolbox.xml';
import BlocklyJS from 'blockly/javascript';
import '../generators/bbasic';

export default {
  components: {VariableSelect, BlocklyComponent},
  name: 'HelloWorld',

  data: () => ({
    testItems: baseVariables,
    selectedItem: null,

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
  }),
  methods: {
    showCode() {
      this.code = BlocklyJS.workspaceToCode(this.$refs['foo'].workspace);
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
