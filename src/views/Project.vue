<template>
  <v-card flat>
    <v-card-title>Project</v-card-title>

    <v-card-actions class="project-actions">
      <v-btn
        icon
        class="project-flat-icon-btn"
        title="Save Project"
        @click="handleSaveProject"
      >
        <v-icon>mdi-content-save</v-icon>
      </v-btn>
      <v-btn
        icon
        class="project-flat-icon-btn"
        title="Import Project"
        @click="() => $refs.importFileInput.click()"
      >
        <v-icon>mdi-import</v-icon>
      </v-btn>
      <template>
          <v-dialog
            v-model="data.newProjectDialog"
            width="500"
          >
            <template v-slot:activator="{ on, attrs }">
              <v-btn
                icon
                class="project-flat-icon-btn"
                title="Create New Project"
                v-bind="attrs"
                v-on="on"
              >
                <v-icon>mdi-file-plus-outline</v-icon>
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
      </template>
      <input
        ref="importFileInput"
        type="file"
        accept=".vcsgm"
        class="project-hidden-file-input"
        @change="handleImportFileInputChange"
      >
    </v-card-actions>

    <v-divider class="my-0" />

    <v-card-text class="project-settings-text">
      <span class="text-subtitle-1 project-settings-label">Project Settings</span>
      <v-text-field
        v-model="projectTitle"
        label="Project Title"
        persistent-placeholder
      />
      <v-row>
        <v-col cols="6">
          <v-text-field
            v-model="projectDeveloper"
            label="Developer"
            persistent-placeholder
          />
        </v-col>
        <v-col cols="6">
          <v-text-field
            v-model="projectVersion"
            label="Version"
            persistent-placeholder
          />
        </v-col>
      </v-row>
      <v-row class="project-tight-row">
        <v-col cols="6">
          <v-text-field
            v-model="projectWebsite"
            label="Website"
            persistent-placeholder
          />
        </v-col>
        <v-col cols="6">
          <v-text-field
            v-model="projectEmail"
            label="Email"
            persistent-placeholder
          />
        </v-col>
      </v-row>
      <v-textarea
        v-model="projectDescription"
        label="Project Description"
        persistent-placeholder
        outlined
        rows="10"
        class="project-description-field"
      />
    </v-card-text>
  </v-card>
</template>
<script>
import {defineComponent, reactive, computed} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import YAML from 'yaml';

import {useBackgroundsStorage, useConfigurationStorage, useDataTablesStorage, usePlayer0Storage, usePlayer1Storage, useProjectAutoIncrementVersionStorage, useScoreFontStorage, useSongsStorage, useSoundEffectsStorage, useSquishCustomScoreFontStorage, useTextStringsStorage, useWorkspaceStorage} from '../hooks/project';
import {getDateInfix} from '../utils/date';
import {resetMusicEditorActiveState} from '../hooks/music-editor-state';
import {matrixToPlayfield, playfieldToMatrix} from '../utils/pixels';

const FORMAT_TYPE = 'VCS Game Maker Project';
const FORMAT_VERSION = 1.0;

// Strips characters Windows/macOS/Linux all disallow (or treat specially)
// in a filename, and collapses whitespace to single underscores - a title
// like "My Cool Game!" becomes "My_Cool_Game", safe to drop straight into
// the saved .vcsgm's own filename with no further escaping needed.
const sanitizeForFilename = (text) =>
  String(text).trim().replace(/[\\/:*?"<>|]/g, '').replace(/\s+/g, '_');

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

    // Kept directly on the same configuration bag every other project-wide
    // setting already lives in (scoreBkColor, textBkColor, etc. - see
    // ScoreFontEditor.vue's own scoreBkColor for the identical pattern),
    // rather than a separate storage key - it's saved/loaded as part of the
    // project file for free that way (handleSaveProject/handleLoadProject
    // below already round-trip the whole configuration object), with no
    // extra wiring needed there.
    const useConfigField = (key, defaultValue = '') => computed({
      get() {
        const value = (configurationStorage.value || {})[key];
        return value == null || value === '' ? defaultValue : value;
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          [key]: value,
        };
      },
    });
    const projectTitle = useConfigField('projectTitle');
    const projectDescription = useConfigField('projectDescription');
    const projectDeveloper = useConfigField('projectDeveloper');
    const projectVersion = useConfigField('projectVersion', '0.0.0');
    const projectWebsite = useConfigField('projectWebsite');
    const projectEmail = useConfigField('projectEmail');
    // A standing app preference (see Configuration.vue's own Options tab
    // switch), not part of the project itself - unlike projectTitle/
    // projectVersion/etc above, this shouldn't reset to off every time you
    // switch or start a new project, so it deliberately does NOT live on
    // configurationStorage via useConfigField.
    const projectAutoIncrementVersion = useProjectAutoIncrementVersionStorage();

    return {data, router, backgroundsStorage, player0Storage, player1Storage,
      workspaceStorage, configurationStorage, scoreFontStorage, squishCustomScoreFontStorage, dataTablesStorage,
      textStringsStorage, soundEffectsStorage, songsStorage, projectTitle, projectDescription,
      projectDeveloper, projectVersion, projectAutoIncrementVersion, projectWebsite, projectEmail};
  },
  methods: {
    // Bumps the last dot-separated segment of the version string (e.g.
    // "1.2.3" -> "1.2.4") - a non-numeric/malformed last segment falls back
    // to 0 rather than throwing, so an unexpected format still produces
    // SOME incremented value instead of blocking the save entirely.
    incrementVersion(version) {
      const parts = String(version || '0.0.0').split('.');
      const lastIndex = parts.length - 1;
      const lastNum = parseInt(parts[lastIndex], 10);
      parts[lastIndex] = String(Number.isFinite(lastNum) ? lastNum + 1 : 0);
      return parts.join('.');
    },

    handleSaveProject() {
      // Applied before reading configurationStorage below, so both the
      // saved file AND the field shown on this tab pick up the bump - not
      // just a one-off value baked into this particular export.
      if (this.projectAutoIncrementVersion) {
        this.projectVersion = this.incrementVersion(this.projectVersion);
      }

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
      // Empty when the Project tab's own Title field was never filled in -
      // filename stays exactly as it was before this (just the date) rather
      // than starting with a stray "_".
      const titlePrefix = this.projectTitle ? `${sanitizeForFilename(this.projectTitle)}_` : '';
      saveAs(projectBlob, `${titlePrefix}${getDateInfix()}.vcsgm`);
    },

    // The native file input (replacing the old v-file-input, now that
    // importing is an icon button matching Save/Create New Project rather
    // than its own field) fires a plain change event with the picked file
    // on event.target.files - handleLoadProject itself is unchanged, still
    // reading from data.fileToImport, so this just bridges the two.
    handleImportFileInputChange(event) {
      this.data.fileToImport = event.target.files[0] || null;
      this.handleLoadProject();
      // Clears the native input's own value too (not just data.fileToImport
      // - see handleLoadProject's own reset below) - without this, picking
      // the SAME file twice in a row wouldn't fire another change event at
      // all, since the browser only fires "change" when the input's value
      // actually differs from before.
      event.target.value = '';
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
        // Unlike an earlier version of this, deliberately stays on this tab
        // rather than navigating to Actions - same reasoning as
        // handleNewProject's own identical change: the user may still want
        // to check/adjust the imported project's own Title/Developer/
        // Version/Description right here first.
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
      // Unlike handleLoadProject, deliberately stays on this tab rather than
      // navigating to Actions - a real reported preference: after starting a
      // new project, the user may still want to set its Title/Developer/
      // Version/Description right here before doing anything else.
    },
  },
});
</script>
<style scoped>
/* Aligns the save icon's own visible glyph (not the button's own larger,
   invisible circular hit area) with the "Project" title text's left edge
   above it - confirmed directly via getBoundingClientRect() (icon was 22px
   further right than the title). v-card-actions' own default 16px left
   padding plus the icon button's own internal padding around its glyph
   accounted for all 22px between them. */
.project-actions {
  padding-left: 8px;
  /* Matches the Generated tab's own flush title-to-icon-row spacing
     (.generated-code-toolbar has 0 top padding) - v-card-actions' own
     default top padding otherwise left an 8px gap under "Project" that
     tab doesn't have. */
  padding-top: 0;
  /* Plain, small flex gap between the icons - v-dialog injects its own
     wrapper div around the Create New Project button's activator, which
     broke every margin/sibling-selector-based approach tried here before
     this (each button ended up with different actual DOM adjacency). gap
     applies evenly around each direct child regardless of what's inside it. */
  display: flex;
  align-items: center;
  gap: 0;
}

/* Vuetify's own base styles apply "margin-left" to a v-btn that DIRECTLY
   follows another v-btn (confirmed directly: computed margin-left was 8px
   on the Import button - which sits right after the plain Save button - and
   0px on both Save and Create New Project, which sit after a non-button
   sibling instead). That built-in rule fights the plain "gap" this file
   uses for spacing instead, so it's zeroed out here. */
.project-actions .project-flat-icon-btn {
  margin-left: 0 !important;
}

/* v-dialog renders its own activator slot content wrapped in a real
   ".v-dialog__container" element (confirmed directly via the rendered DOM -
   [Save button, Import button, DIV.v-dialog__container, hidden input], not
   [Save, Import, Create-New-Project button, hidden input] as the template's
   own flat appearance suggests) - THAT div, not the Create New Project
   button itself, was the actual flex child .project-actions' own "gap"
   was spacing against, one reason the three icons never looked evenly
   spaced no matter what margin/gap value was tried here before this.
   display: contents removes the wrapper from the box model entirely while
   keeping its child (the real button) exactly where it sits in the DOM, so
   gap now applies between the three ICONS themselves, uniformly. */
.project-actions >>> .v-dialog__container {
  display: contents;
}

/* Hidden native file input backing the Import Project icon button - clicked
   programmatically (see handleImportFileInputChange) rather than shown
   itself, now that importing is an icon matching Save/Create New Project
   instead of its own v-file-input field. */
.project-hidden-file-input {
  display: none;
}

/* Vuetify's default textarea line-height reads as loose over 6 rows of
   plain prose - tightened to read more like a compact text block. */
.project-description-field >>> textarea {
  line-height: 1.3;
}

/* v-card-text's own default top/bottom padding otherwise leaves a bigger
   gap than intended, both under the divider above and before the buttons
   below it. */
.project-settings-text {
  padding-top: 10px;
  padding-bottom: 0;
}

.project-settings-label {
  display: block;
  margin-bottom: 12px;
}

/* Matches the tight gap between the Project Title field and the Developer/
   Version row below it (a plain v-text-field followed by a v-row collapses
   to a small negative margin, -12px, by Vuetify's own default) - two v-rows
   stacked back to back don't get that same collapse (confirmed directly:
   +12px instead), leaving a visibly bigger gap before this row than every
   other row on this tab. */
.project-tight-row {
  margin-top: -24px !important;
}

/* Same flat-icon, fade-in-on-hover/blue-on-press treatment as every other
   icon button in the app (e.g. GeneratedCode.vue's own
   .generated-code-flat-icon-btn, MusicEditor.vue's own
   .music-flat-icon-btn) - transparent background (no Vuetify default hover
   circle), icon fades from a faint grey to near-black on hover, and flashes
   the app's own blue on an actual click/press. */
.project-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
}

.project-flat-icon-btn::before {
  display: none;
}

.project-flat-icon-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.project-flat-icon-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.project-flat-icon-btn:active >>> .v-icon {
  color: #1976d2 !important;
}
</style>
