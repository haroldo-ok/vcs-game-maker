<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>
        Generated bBasic code
      </v-card-title>
      <div class="generated-code-toolbar">
        <v-btn
          icon
          class="generated-code-flat-icon-btn"
          :title="copyButtonTitle"
          @click="handleCopyGeneratedCode"
        >
          <v-icon>mdi-content-copy</v-icon>
        </v-btn>
        <v-btn
          icon
          class="generated-code-flat-icon-btn"
          title="Save Generated Code"
          @click="handleSaveGeneratedCode"
        >
          <v-icon>mdi-content-save</v-icon>
        </v-btn>
      </div>
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
import {defineComponent, computed, ref} from '@vue/composition-api';
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
    // Reverts on its own after a couple seconds - see handleCopyGeneratedCode.
    // Shown as this icon-only button's own title tooltip now (there's no
    // visible label left to show it in directly).
    const copyButtonTitle = ref('Copy Generated Code');
    return {generatedBasic, lineNumbersText, copyButtonTitle};
  },
  methods: {
    handleSaveGeneratedCode() {
      const textBlob = new Blob([this.generatedBasic], {type: 'text/plain'});
      saveAs(textBlob, `generated-bBasic-${getDateInfix()}.bas`);
    },
    async handleCopyGeneratedCode() {
      try {
        await navigator.clipboard.writeText(this.generatedBasic);
        this.copyButtonTitle = 'Copied!';
      } catch (e) {
        console.error('Error copying generated code to clipboard', e);
        this.copyButtonTitle = 'Copy failed';
      }
      setTimeout(() => {
        this.copyButtonTitle = 'Copy Generated Code';
      }, 2000);
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

/* Flush left (no v-spacer/justify-content pushing them right, unlike when
   these lived inline in the v-card-title next to the title text) - just a
   plain left-to-right row now that they're their own row below the title,
   above the code itself. */
.generated-code-toolbar {
  display: flex;
  gap: 4px;
  padding: 0 16px 2px 8px;
}

/* Same flat-icon, fade-in-on-hover/blue-on-press treatment as the Music
   tab's own play/stop buttons (MusicEditor.vue's .music-flat-icon-btn) -
   transparent background (no Vuetify default hover circle), icon fades
   from a faint grey to near-black on hover, and flashes the app's own blue
   on an actual click/press. */
.generated-code-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.generated-code-flat-icon-btn::before {
  display: none;
}

.generated-code-flat-icon-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.generated-code-flat-icon-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.generated-code-flat-icon-btn:active >>> .v-icon {
  color: #1976d2 !important;
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
