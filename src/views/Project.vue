<template>
  <v-card>
    <v-card-title>Project</v-card-title>
    <v-card-text>{{ workspaceStorage }}</v-card-text>
    <v-card-actions>
      <v-btn>Load project</v-btn>
      <v-btn
        color="primary"
        @click="handleSaveProject"
      >
          Save Project
      </v-btn>
    </v-card-actions>
  </v-card>
</template>
<script>
import {defineComponent} from '@vue/composition-api';

import {useWorkspaceStorage} from '../hooks/project';

export default defineComponent({
  setup() {
    const workspaceStorage = useWorkspaceStorage();
    return {workspaceStorage};
  },
  methods: {
    handleSaveProject() {
      console.info('Salvando projeto', this.workspaceStorage);
    },
  },
});
</script>
