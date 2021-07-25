<template>
  <div class="home">
    <ActionEditor msg="Welcome to Your Vue.js App"/>
  </div>
</template>

<script>
// @ is an alias to /src
import ActionEditor from '@/components/ActionEditor.vue';

export default {
  name: 'Home',
  components: {
    ActionEditor,
  },
};
</script>
