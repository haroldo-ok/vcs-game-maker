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
import {saveAs} from 'file-saver';
import YAML from 'yaml';

import {useWorkspaceStorage} from '../hooks/project';

const FORMAT_TYPE = 'VCS Game Maker Project';
const FORMAT_VERSION = 1.0;

export default defineComponent({
  setup() {
    const workspaceStorage = useWorkspaceStorage();
    return {workspaceStorage};
  },
  methods: {
    async handleSaveProject() {
      const projectYaml = YAML.stringify({
        'type': FORMAT_TYPE,
        'format-version': FORMAT_VERSION,
        'generation-time': new Date(),
        'blockly-workspace': this.workspaceStorage,
      });

      const projectBlob = new Blob([projectYaml], {type: 'text/yaml'});
      saveAs(projectBlob, 'project.vcsgm');
    },
  },
});
</script>
