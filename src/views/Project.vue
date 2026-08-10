<template>
  <v-card flat>
    <v-card-title>Project</v-card-title>
    <v-card-text>
        <v-file-input
            accept=".vcsgm"
            label="Project to import."
            v-model="data.fileToImport"
            @change="handleLoadProject"
        ></v-file-input>
    </v-card-text>
    <v-card-actions class="project-actions">
      <v-btn
        color="primary"
        @click="handleSaveProject"
      >
          Save Project
      </v-btn>
      <template>
        <div class="text-center ml-2">
          <v-dialog
            v-model="data.newProjectDialog"
            width="500"
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                color="secondary"
                v-bind="attrs"
                v-on="on"
              >
                Create New Project
              </v-btn>
            </template>

            <v-card>
              <v-card-title class="text-h5 grey lighten-2">
                Do you really want to start a new project?
              </v-card-title>

              <v-card-text>
                This will create a new project, clearing all the blocks on the actions tab,
                all the graphics and animations on the player 0 and player 1 tab, all of the
                backgrounds on the backgrounds tab and replace all the options with default
                values.
              </v-card-text>

              <v-divider></v-divider>

              <v-card-actions>
                <v-spacer></v-spacer>
                <v-btn
                  color="primary"
                  text
                  @click="handleNewProject"
                >
                  Yes, recreate the project
                </v-btn>
                <v-btn
                  color="secondary"
                  text
                  @click="data.newProjectDialog = false"
                >
                  No, nevermind
                </v-btn>
              </v-card-actions>
            </v-card>
          </v-dialog>
        </div>
      </template>
    </v-card-actions>
  </v-card>
</template>
<script>
import {defineComponent, reactive} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import YAML from 'yaml';

import {useBackgroundsStorage, useConfigurationStorage, useDataTablesStorage, usePlayer0Storage, usePlayer1Storage, useScoreFontStorage, useSongsStorage, useSoundEffectsStorage, useSquishCustomScoreFontStorage, useTextStringsStorage, useWorkspaceStorage} from '../hooks/project';
import {getDateInfix} from '../utils/date';
import {resetMusicEditorActiveState} from '../hooks/music-editor-state';
import {matrixToPlayfield, playfieldToMatrix} from '../utils/pixels';

const FORMAT_TYPE = 'VCS Game Maker Project';
const FORMAT_VERSION = 1.0;

export default defineComponent({
  setup(props, context) {
    const data = reactive({
      fileToImport: null,
      newProjectDialog: false,
    });
    const router = context.root.$router;

    const backgroundsStorage = useBackgroundsStorage();
    const player0Storage = usePlayer0Storage();
    const player1Storage = usePlayer1Storage();
    const workspaceStorage = useWorkspaceStorage();
    const configurationStorage = useConfigurationStorage();
    const scoreFontStorage = useScoreFontStorage();
    const squishCustomScoreFontStorage = useSquishCustomScoreFontStorage();
    const dataTablesStorage = useDataTablesStorage();
    const textStringsStorage = useTextStringsStorage();
    const soundEffectsStorage = useSoundEffectsStorage();
    const songsStorage = useSongsStorage();

    return {data, router, backgroundsStorage, player0Storage, player1Storage,
      workspaceStorage, configurationStorage, scoreFontStorage, squishCustomScoreFontStorage, dataTablesStorage,
      textStringsStorage, soundEffectsStorage, songsStorage};
  },
  methods: {
    handleSaveProject() {
      const configuration = !this.configurationStorage ? null : {
        ...this.configurationStorage,
      };

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

      const scoreFont = !this.scoreFontStorage ? null : {
        ...this.scoreFontStorage,
        digits: this.scoreFontStorage.digits.map(matrixToPlayfield),
      };

      const squishCustomScoreFont = !this.squishCustomScoreFontStorage ? null : {
        ...this.squishCustomScoreFontStorage,
        digits: this.squishCustomScoreFontStorage.digits.map(matrixToPlayfield),
      };

      const projectYaml = YAML.stringify({
        'type': FORMAT_TYPE,
        'format-version': FORMAT_VERSION,
        'generation-time': new Date(),
        configuration,
        'blockly-workspace': this.workspaceStorage,
        'player-0': player0,
        'player-1': player1,
        backgrounds,
        'score-font': scoreFont,
        'squish-custom-score-font': squishCustomScoreFont,
        'data-tables': this.dataTablesStorage,
        'text-strings': this.textStringsStorage,
        'sound-effects': this.soundEffectsStorage,
        // Songs, sequences, patterns, instruments (tracks) and their notes -
        // all live in this one storage object (see hooks/project.js's
        // useSongsStorage/blocks/music.js's DEFAULT_SONGS shape). Was never
        // wired into save/load at all, so a saved .vcsgm silently dropped
        // every Music tab edit - the song would still play back in the
        // editor itself (localStorage was never cleared), but loading that
        // saved file elsewhere, or after clearing storage, lost it all.
        'songs': this.songsStorage,
      });

      const projectBlob = new Blob([projectYaml], {type: 'text/yaml'});
      saveAs(projectBlob, `project-${getDateInfix()}.vcsgm`);
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

        const preparePlayerLoad = (playerData) => playerData && {
          ...playerData,
          animations: playerData.animations.map((animation) => ({
            ...animation,
            frames: animation.frames.map((frame) => ({
              ...frame,
              pixels: playfieldToMatrix(frame.pixels),
            })),
          })),
        };

        const player0 = preparePlayerLoad(project['player-0']);
        if (player0) {
          this.player0Storage = player0;
        }

        const player1 = preparePlayerLoad(project['player-1']);
        if (player1) {
          this.player1Storage = player1;
        }

        if (project['score-font']) {
          this.scoreFontStorage = {
            ...project['score-font'],
            digits: project['score-font'].digits.map(playfieldToMatrix),
          };
        }

        if (project['squish-custom-score-font']) {
          this.squishCustomScoreFontStorage = {
            ...project['squish-custom-score-font'],
            digits: project['squish-custom-score-font'].digits.map(playfieldToMatrix),
          };
        }

        if (project.backgrounds) {
          const backgrounds = {
            ...project.backgrounds,
            backgrounds: project.backgrounds.backgrounds
                .map((bkg) => ({...bkg, pixels: playfieldToMatrix(bkg.pixels)})),
          };
          this.backgroundsStorage = backgrounds;
        }

        if (project.configuration) {
          this.configurationStorage = project.configuration;
        }

        if (project['data-tables']) {
          this.dataTablesStorage = project['data-tables'];
        }

        if (project['text-strings']) {
          this.textStringsStorage = project['text-strings'];
        }

        if (project['sound-effects']) {
          this.soundEffectsStorage = project['sound-effects'];
        }

        if (project.songs) {
          this.songsStorage = project.songs;
        }

        // Song/pattern/track IDs in the loaded project collide with
        // whatever the previous project used (both start counting from 1) -
        // without this, the Music tab's own active pattern/track selection
        // (see hooks/music-editor-state.js) would keep pointing at IDs left
        // over from before, showing the piano roll against the wrong
        // pattern/track, or one that doesn't exist in this project at all.
        resetMusicEditorActiveState();

        this.router.push('/');
      };
      reader.onerror = (evt) => console.error('Error while loading project', evt);
      this.data.fileToImport = null;
    },

    handleNewProject() {
      this.configurationStorage = null;
      this.workspaceStorage = null;
      this.player0Storage = null;
      this.player1Storage = null;
      this.backgroundsStorage = null;
      this.scoreFontStorage = null;
      this.squishCustomScoreFontStorage = null;
      this.dataTablesStorage = null;
      this.textStringsStorage = null;
      this.soundEffectsStorage = null;
      this.songsStorage = null;

      // Same reasoning as handleLoadProject's own call - a fresh project's
      // song/pattern/track IDs start counting from 1 again too, colliding
      // with whatever the previous project used.
      resetMusicEditorActiveState();

      this.data.newProjectDialog = false;
      this.router.push('/');
    },
  },
});
</script>
<style scoped>
/* Matches v-card-text's own left padding (v-card-actions' default is
   narrower), and sits right under the import field above it rather than
   the wider gap v-card-actions normally leaves. */
.project-actions {
  padding-top: 0;
  padding-left: 16px;
}
</style>
