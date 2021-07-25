<template>
  <v-card>
    <v-card-title>Project</v-card-title>
    <v-card-text>
        <v-file-input
            accept=".vcsgm"
            label="Project to import."
            v-model="data.fileToImport"
            @change="handleLoadProject"
        ></v-file-input>
    </v-card-text>
    <v-card-actions>
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
import {defineComponent, reactive} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import YAML from 'yaml';

import {useWorkspaceStorage} from '../hooks/project';

const FORMAT_TYPE = 'VCS Game Maker Project';
const FORMAT_VERSION = 1.0;

export default defineComponent({
  setup() {
    const data = reactive({fileToImport: null});
    const workspaceStorage = useWorkspaceStorage();
    return {data, workspaceStorage};
  },
  methods: {
    handleSaveProject() {
      const projectYaml = YAML.stringify({
        'type': FORMAT_TYPE,
        'format-version': FORMAT_VERSION,
        'generation-time': new Date(),
        'blockly-workspace': this.workspaceStorage,
      });

      const projectBlob = new Blob([projectYaml], {type: 'text/yaml'});
      saveAs(projectBlob, 'project.vcsgm');
    },

    handleLoadProject() {
      if (!this.data.fileToImport) {
        console.warn('No file to import.');
        return;
      }

      console.info('Importing file', this.data.fileToImport);
      const reader = new FileReader();
      reader.readAsText(this.data.fileToImport, 'UTF-8');
      reader.onload = (evt) => {
        const projectYaml = evt.target.result;
        console.info('YAML', projectYaml);
        const project = YAML.parse(projectYaml);

        if (project.type !== FORMAT_TYPE) {
          throw new Error('This file does not seem to be a valid project.');
        }

        if (project['format-version'] > FORMAT_VERSION) {
          throw new Error(
              `This project's version (${project['format-version']}) is newer than the supported version (${FORMAT_VERSION})`);
        }

        this.workspaceStorage = project['blockly-workspace'];
      };
      reader.onerror = (evt) => console.error('Error while loading project', evt);
      this.data.fileToImport = null;
    },
  },
});
</script>
