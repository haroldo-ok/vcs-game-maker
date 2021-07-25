<template>
    <p id="code">
      <vue-code-highlight language="basic">
        <pre v-html="code">Test!!!</pre>
      </vue-code-highlight>
    </p>
</template>
<script>
import {defineComponent, reactive} from '@vue/composition-api';

export default defineComponent({
  name: 'GeneratedCode',
  setup() {
    const code = reactive('Another test!!');
    return {code};
  },
});
</script>
