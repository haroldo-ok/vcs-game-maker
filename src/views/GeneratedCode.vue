<template>
    <div>
      <h1>Generated bBasic code</h1>
      <vue-code-highlight language="basic" class="code-container">
        <pre v-html="generatedBasic">Test!!!</pre>
      </vue-code-highlight>
    </div>
</template>
<script>
import {defineComponent} from '@vue/composition-api';
import {component as VueCodeHighlight} from 'vue-code-highlight';
import 'vue-code-highlight/themes/duotone-sea.css';

import {useGeneratedBasic} from '../hooks/generated';

export default defineComponent({
  name: 'GeneratedCode',
  components: {VueCodeHighlight},
  setup() {
    const generatedBasic = useGeneratedBasic();
    return {generatedBasic};
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
