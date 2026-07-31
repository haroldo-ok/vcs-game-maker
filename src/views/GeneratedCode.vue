<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>
        Generated bBasic code
        <v-spacer />
        <v-btn
          color="primary"
          @click="handleSaveGeneratedCode"
        >
          Save Generated Code
        </v-btn>
      </v-card-title>
      <vue-code-highlight language="basic" class="code-container">
        <pre v-html="generatedBasic"></pre>
      </vue-code-highlight>
    </v-card>
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
      const textBlob = new Blob([this.generatedBasic], {type: 'text/plain'});
      saveAs(textBlob, `generated-bBasic-${getDateInfix()}.bas`);
    },
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

.code-container {
  overflow: auto;
}
</style>
