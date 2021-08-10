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

import {useBackgroundsStorage, usePlayer0Storage, usePlayer1Storage, useWorkspaceStorage} from '../hooks/project';
import {matrixToPlayfield, playfieldToMatrix} from '../utils/pixels';

const FORMAT_TYPE = 'VCS Game Maker Project';
const FORMAT_VERSION = 1.0;

export default defineComponent({
  setup(props, context) {
    const data = reactive({fileToImport: null});
    const router = context.root.$router;

    const backgroundsStorage = useBackgroundsStorage();
    const player0Storage = usePlayer0Storage();
    const player1Storage = usePlayer1Storage();
    const workspaceStorage = useWorkspaceStorage();

    return {data, router, backgroundsStorage, player0Storage, player1Storage, workspaceStorage};
  },
  methods: {
    handleSaveProject() {
      const backgrounds = !this.backgroundsStorage ? null :
        {
          ...this.backgroundsStorage,
          backgrounds: this.backgroundsStorage.backgrounds
              .map((bkg) => ({...bkg, pixels: matrixToPlayfield(bkg.pixels)})),
        };

      const preparePlayerSave = (playerStorage) => !playerStorage ? null :
        {
          ...playerStorage,
          animations: playerStorage.animations.map((animation) => ({
            ...animation,
            frames: animation.frames.map((frame) => ({
              ...frame,
              pixels: matrixToPlayfield(frame.pixels),
            })),
          })),
        };

      const player0 = preparePlayerSave(this.player0Storage);
      const player1 = preparePlayerSave(this.player1Storage);

      const projectYaml = YAML.stringify({
        'type': FORMAT_TYPE,
        'format-version': FORMAT_VERSION,
        'generation-time': new Date(),
        'blockly-workspace': this.workspaceStorage,
        'player-0': player0,
        'player-1': player1,
        backgrounds,
      });

      const projectBlob = new Blob([projectYaml], {type: 'text/yaml'});
      const dateInfix = new Date().toISOString().replace(/\..*/, '').replace(/[T:]/g, '-');
      saveAs(projectBlob, `project-${dateInfix}.vcsgm`);
    },

    handleLoadProject() {
      if (!this.data.fileToImport) {
        console.warn('No file to import.');
        return;
      }

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

        const playerData = project['player-0'];
        if (playerData) {
          const player0 = {
            ...playerData,
            animations: playerData.animations.map((animation) => ({
              ...animation,
              frames: animation.frames.map((frame) => ({
                ...frame,
                pixels: playfieldToMatrix(frame.pixels),
              })),
            })),
          };

          this.player0Storage = player0;
        }

        if (project.backgrounds) {
          const backgrounds = {
            ...project.backgrounds,
            backgrounds: project.backgrounds.backgrounds
                .map((bkg) => ({...bkg, pixels: playfieldToMatrix(bkg.pixels)})),
          };
          this.backgroundsStorage = backgrounds;
        }

        this.router.push('/');
      };
      reader.onerror = (evt) => console.error('Error while loading project', evt);
      this.data.fileToImport = null;
    },
  },
});
</script>
