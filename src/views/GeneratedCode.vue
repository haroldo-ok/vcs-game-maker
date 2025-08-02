<template>
  <div>
    <h1>
      Generated bBasic code

      <v-btn
        color="primary"
        @click="handleSaveGeneratedCode"
      >
          Save Generated Code
      </v-btn>
    </h1>
    <vue-code-highlight language="basic" class="code-container">
      <pre v-html="generatedBasic.value"></pre>
    </vue-code-highlight>
  </div>
</template>
<script>
import {defineComponent} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {component as VueCodeHighlight} from 'vue-code-highlight';
import 'vue-code-highlight/themes/duotone-sea.css';

import {useGeneratedBasic} from '../hooks/generated';
import {getDateInfix} from '../utils/date';

export default defineComponent({
  name: 'GeneratedCode',
  components: {VueCodeHighlight},
  setup() {
    const generatedBasic = useGeneratedBasic();
    return {generatedBasic};
  },
  methods: {
    handleSaveGeneratedCode() {
      const textBlob = new Blob([this.generatedBasic.value], {type: 'text/plain'});
      saveAs(textBlob, `generated-bBasic-${getDateInfix()}.bas`);
    },
  },
});
</script>
<style scoped>
.code-container {
  position: absolute;
  overflow: auto;
  top: 3em;
  bottom: 0;
  width: 100%;
}
</style>
