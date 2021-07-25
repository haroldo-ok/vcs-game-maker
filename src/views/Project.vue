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
import AdmZip from 'adm-zip';

import {useWorkspaceStorage} from '../hooks/project';

export default defineComponent({
  setup() {
    const workspaceStorage = useWorkspaceStorage();
    return {workspaceStorage};
  },
  methods: {
    async handleSaveProject() {
      const workspaceBlob = new Blob([this.workspaceStorage], {type: 'text/xml'});

      const zip = new AdmZip();
      zip.addFile('blockly-workspace.xml', await workspaceBlob.arrayBuffer());

      const zipBuffer = zip.toBuffer();
      saveAs(new Blob([Uint8Array.from(zipBuffer)], {type: 'application/octet-stream'}), 'project.vcs-gm.zip');
    },
  },
});
</script>
