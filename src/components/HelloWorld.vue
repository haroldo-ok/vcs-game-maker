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
  </v-container>
</template>

<script>
import {baseVariables} from '../services/variables';
import VariableSelect from './VariableSelect.vue';

export default {
  components: {VariableSelect},
  name: 'HelloWorld',

  data: () => ({
    testItems: baseVariables,
    selectedItem: null,
  }),
};
</script>
