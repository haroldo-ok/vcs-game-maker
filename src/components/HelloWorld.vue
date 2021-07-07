<template>
  <v-container>
    <variable-select :items="testItems" v-model="selectedItem" />
    <label>*** {{ selectedItem }} ***</label>
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
