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
      <div class="code-scroll">
        <pre class="line-numbers-gutter">{{ lineNumbersText }}</pre>
        <vue-code-highlight language="basic" class="code-container">
          <pre v-html="generatedBasic"></pre>
        </vue-code-highlight>
      </div>
    </v-card>
  </div>
</template>
<script>
import {defineComponent, computed} from '@vue/composition-api';
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
    // Display-only - never touches generatedBasic itself, so saving/exporting
    // (see handleSaveGeneratedCode) and compiling both still see the exact
    // same plain text they always have, with no line numbers mixed in.
    const lineNumbersText = computed(() => {
      const lineCount = ((generatedBasic.value || '').match(/\n/g) || []).length + 1;
      return Array.from({length: lineCount}, (_, i) => i + 1).join('\n');
    });
    return {generatedBasic, lineNumbersText};
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

.code-scroll {
  display: flex;
  align-items: flex-start;
  overflow: auto;
}

/* Matches duotone-sea.css's own pre[class*="language-"] font/spacing exactly
   (font family/size/line-height/margin), so each printed number lines up
   with its own row in the code pane next to it. */
.line-numbers-gutter {
  flex: none;
  position: sticky;
  left: 0;
  z-index: 1;
  margin: .5em 0;
  padding: 1em .75em 1em 1em;
  font-family: Hack, Consolas, Menlo, Monaco, 'Andale Mono WT', 'Andale Mono', 'Lucida Console',
    'Lucida Sans Typewriter', 'DejaVu Sans Mono', 'Bitstream Vera Sans Mono', 'Liberation Mono',
    'Nimbus Mono L', 'Courier New', Courier, monospace;
  font-size: 14px;
  line-height: 1.375;
  text-align: right;
  color: #4a5f78;
  background: #1d262f;
  border-right: 1px solid #2c3847;
  user-select: none;
}

.code-container {
  flex: 1 1 auto;
  min-width: 0;
}
</style>
