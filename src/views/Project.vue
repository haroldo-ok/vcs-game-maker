<template>
  <v-card flat class="editor-container">
    <v-card-title>{{ showExamples || showSoundBanks ? 'Project' : 'Project Settings' }}</v-card-title>
    <v-card-text class="tab-intro-section">
      <p class="v-messages theme--light v-messages__message project-intro-paragraph">
        Save your project to a .vcsgm file, or open one you saved earlier - everything on every
        other tab lives in this one file. The fields below (Title, Developer, Version, etc.) are
        saved with it too, and shape the suggested filename when you save.
      </p>
    </v-card-text>

    <div class="project-toolbar tight-under-intro" :class="{'project-toolbar-scrolled': isToolbarScrolled}">
      <div class="project-toolbar-row">
        <v-btn
          icon
          small
          class="project-flat-icon-btn data-icon-btn-size"
          :class="{'project-flat-icon-btn-active': !showExamples && !showSoundBanks}"
          title="Project Settings"
          @click="showSoundBanks = false; showExamples = false"
        >
          <v-icon>mdi-cog-outline</v-icon>
        </v-btn>
        <v-divider class="project-toolbar-divider" vertical />
        <template>
            <v-dialog
              v-model="data.newProjectDialog"
              width="500"
            >
              <template v-slot:activator="{ on, attrs }">
                <v-btn
                  icon
                  small
                  class="project-flat-icon-btn data-icon-btn-size"
                  title="Create New Project"
                  v-bind="attrs"
                  v-on="on"
                >
                  <v-icon>mdi-file-plus-outline</v-icon>
                </v-btn>
              </template>

              <v-card>
                <v-card-title class="text-h5">
                  Do you really want to start a new project?
                </v-card-title>

                <v-card-text class="mt-4">
                  This will create a new project, clearing all the blocks on the actions tab,
                  all the graphics and animations on the player 0 and player 1 tab, all of the
                  backgrounds on the backgrounds tab and replace all the options with default
                  values.
                </v-card-text>

                <v-divider></v-divider>

                <v-card-actions>
                  <v-btn
                    color="primary"
                    text
                    @click="handleNewProject"
                  >
                    Create new project
                  </v-btn>
                  <v-spacer></v-spacer>
                  <v-btn
                    color="secondary"
                    text
                    @click="data.newProjectDialog = false"
                  >
                    Nevermind
                  </v-btn>
                </v-card-actions>
            </v-card>
          </v-dialog>
        </template>
        <v-btn
          icon
          small
          class="project-flat-icon-btn data-icon-btn-size"
          title="Open Project"
          @click="handleOpenProjectClick"
        >
          <v-icon>mdi-folder-open</v-icon>
        </v-btn>
        <v-btn
          icon
          small
          class="project-flat-icon-btn data-icon-btn-size"
          title="Save"
          @click="handleSaveProject"
        >
          <v-icon>mdi-content-save</v-icon>
        </v-btn>
        <v-btn
          icon
          small
          class="project-flat-icon-btn data-icon-btn-size"
          title="Save As..."
          @click="handleSaveProjectAs"
        >
          <v-icon>mdi-content-save-edit</v-icon>
        </v-btn>
        <v-divider class="project-toolbar-divider" vertical />
        <v-btn
          icon
          small
          class="project-flat-icon-btn data-icon-btn-size"
          :class="{'project-flat-icon-btn-active': showExamples && !showSoundBanks}"
          :title="examples.status === 'loading' ? `Example Projects (checking ${examples.source} for updates...)` : 'Example Projects'"
          @click="showSoundBanks = false; showExamples = true"
        >
          <v-progress-circular
            v-if="examples.status === 'loading'"
            indeterminate
            :size="18"
            :width="2"
          />
          <!-- An Atari 2600 joystick (ball top, stick, base with its fire button), drawn on
               the same 24 unit grid and weight as the icon font's glyphs: the font has none. -->
          <svg v-else class="v-icon example-joystick-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path
              fill="currentColor"
              fill-rule="evenodd"
              d="M12 2.3a3.2 3.2 0 1 0 0 6.4a3.2 3.2 0 1 0 0-6.4zM11 8.5h2V13h-2zM5 13h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2zM7 15.2a1.8 1.8 0 1 0 0 3.6a1.8 1.8 0 1 0 0-3.6z"
            />
          </svg>
        </v-btn>
        <v-btn
          icon
          small
          class="project-flat-icon-btn data-icon-btn-size"
          :class="{'project-flat-icon-btn-active': showSoundBanks}"
          :title="soundBanks.status === 'loading' ? `Sound Banks (checking ${soundBanks.source} for updates...)` : 'Sound Banks'"
          @click="showSoundBanks = true"
        >
          <v-progress-circular
            v-if="soundBanks.status === 'loading'"
            indeterminate
            :size="18"
            :width="2"
          />
          <v-icon v-else>mdi-waveform</v-icon>
        </v-btn>
        <input
          ref="importFileInput"
          type="file"
          accept=".vcsgm"
          class="project-hidden-file-input"
          @change="handleImportFileInputChange"
        >
      </div>
    </div>

    <v-card-text v-if="!showExamples && !showSoundBanks" class="project-settings-text">
      <span class="text-subtitle-1 project-settings-label">Project Settings</span>
      <div class="project-title-row">
        <v-text-field
          v-model="projectTitle"
          label="Project Title"
          persistent-placeholder
          class="project-title-field"
        />
        <v-switch
          v-model="projectIncludeDateInFilename"
          label="Include date/time in filename"
          title="Adds the current date and time to the saved filename. Only optional once Project Title is filled in - with no title, the date is the only thing keeping repeated saves from overwriting each other, so it stays on regardless of this switch."
          hide-details
          class="project-auto-increment-switch"
        />
      </div>
      <div class="project-developer-version-row">
        <div class="project-developer-col">
          <v-text-field
            v-model="projectDeveloper"
            label="Developer"
            persistent-placeholder
          />
        </div>
        <div class="project-version-col">
          <v-text-field
            v-model="projectVersion"
            label="Version"
            persistent-placeholder
          />
          <v-switch
            v-model="projectAutoIncrementVersion"
            label="Increment on Save"
            title="Bumps the last segment of this Version field (e.g. 1.2.3 -> 1.2.4) every time you save the project."
            hide-details
            class="project-auto-increment-switch"
          />
        </div>
      </div>
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

    <v-card-text v-else-if="showSoundBanks" class="project-settings-text">
      <span class="text-subtitle-1 project-settings-label">Sound Banks</span>
      <div class="project-search-row">
        <v-text-field
          v-model="data.soundBankSearch"
          label="Search"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="project-search-field"
        />
        <v-select
          v-model="data.soundBankFilter"
          :items="soundBankFilterItems"
          label="Show"
          class="sound-bank-filter"
        />
      </div>
      <p class="v-messages theme--light v-messages__message example-status">
        Sounds and sound banks from GitHub. Click one to choose which sounds to import into the
        open project.
      </p>
      <div v-if="soundBanks.status === 'loading'" class="example-progress">
        <v-progress-circular indeterminate :size="16" :width="2" />
        <span v-if="soundBanks.total">
          Downloading sound banks ({{ soundBanks.done }} of {{ soundBanks.total }}) from {{ soundBanks.source }}...
        </span>
        <span v-else>Checking {{ soundBanks.source }} for sound banks...</span>
      </div>
      <p v-if="!soundBanks.entries.length && soundBanks.status !== 'loading'" class="v-messages theme--light v-messages__message example-status">
        <template v-if="soundBanks.status === 'error'">
          Could not get the sound banks ({{ soundBanks.message }}). They will be available once the
          app can reach GitHub.
        </template>
        <template v-else>There are no sound banks yet.</template>
      </p>
      <p
        v-else-if="!filteredSoundBanks.length && soundBanks.status !== 'loading'"
        class="v-messages theme--light v-messages__message example-status"
      >
        Nothing of that kind in the list. Choose All to see everything.
      </p>
      <p v-if="data.soundBankError" class="example-error">{{ data.soundBankError }}</p>
      <div class="example-list">
        <v-card
          v-for="bank in filteredSoundBanks"
          :key="bank.name"
          outlined
          :ripple="false"
          class="example-card sound-bank-card"
          @click="handleSelectSoundBank(bank)"
        >
          <v-btn
            icon
            small
            class="sound-bank-preview-btn"
            :title="data.previewingSoundBank === bank.name ? 'Stop the preview' : (bank.isBank ? 'Preview every sound in this bank, one after another' : 'Preview this sound')"
            @click.stop="handlePreviewSoundBank(bank)"
          >
            <v-icon>{{ data.previewingSoundBank === bank.name ? 'mdi-stop' : 'mdi-play' }}</v-icon>
          </v-btn>
          <div class="example-card-text">
            <div class="example-card-title">
              <!-- The same icons the app uses elsewhere: the Sound tab's waveform for a sound,
                   the database icon of its bank import/export buttons for a bank, and the
                   piano of its instrument tag for an instrument. -->
              <v-icon small class="sound-bank-kind-icon" :title="soundBankKindLabel(bank)">{{ soundBankKindIcon(bank) }}</v-icon>
              {{ soundBankTitle(bank) }}
            </div>
            <div class="example-card-line">
              {{ soundBankKindLabel(bank) }}<template v-if="bank.isBank">
                - {{ bank.sounds.length === 1 ? '1 sound' : `${bank.sounds.length} sounds` }}</template>
            </div>
            <div v-if="bank.sounds.length" class="example-card-line sound-bank-names">
              {{ bank.sounds.join(', ') }}
            </div>
            <div v-if="bank.developer" class="example-card-line">by {{ bank.developer }}</div>
            <div v-if="soundBankWebsiteLink(bank)" class="example-card-line">
              <a :href="soundBankWebsiteLink(bank)" target="_blank" rel="noopener noreferrer" @click.stop>{{ bank.website }}</a>
            </div>
            <div class="example-card-line example-card-kernel">{{ soundBankKernelLabel(bank) }} Kernel</div>
          </div>
        </v-card>
      </div>
      <SoundBankImportDialog
        v-model="data.soundBankDialog"
        :entries="data.soundBankEntries"
        @confirm="handleConfirmSoundBankImport"
      />
    </v-card-text>

    <v-card-text v-else class="project-settings-text">
      <span class="text-subtitle-1 project-settings-label">Example Projects</span>
      <div class="project-search-row">
        <v-text-field
          v-model="data.exampleSearch"
          label="Search"
          prepend-inner-icon="mdi-magnify"
          clearable
          class="project-search-field"
        />
      </div>
      <div v-if="examples.status === 'loading'" class="example-progress">
        <v-progress-circular indeterminate :size="16" :width="2" />
        <span v-if="examples.total">
          Downloading example projects ({{ examples.done }} of {{ examples.total }}) from {{ examples.source }}...
        </span>
        <span v-else>Checking {{ examples.source }} for example projects...</span>
      </div>
      <p v-if="!examples.entries.length && examples.status !== 'loading'" class="v-messages theme--light v-messages__message example-status">
        <template v-if="examples.status === 'error'">
          Could not get the examples ({{ examples.message }}). They will be available once the
          app can reach GitHub.
        </template>
        <template v-else>There are no examples yet.</template>
      </p>
      <div class="example-list">
        <v-card
          v-for="example in filteredExamples"
          :key="example.name"
          outlined
          :ripple="false"
          class="example-card"
          @click="handleSelectExample(example)"
        >
          <div class="example-screenshot-frame">
            <img
              v-if="example.screenshot"
              :src="example.screenshot"
              :alt="exampleTitle(example)"
              class="example-screenshot"
            >
            <v-icon v-else class="example-screenshot-placeholder">mdi-image-off-outline</v-icon>
          </div>
          <div class="example-card-text">
            <div class="example-card-title">{{ exampleTitle(example) }}</div>
            <div v-if="example.version" class="example-card-line">Version {{ example.version }}</div>
            <div v-if="example.developer" class="example-card-line">by {{ example.developer }}</div>
            <div class="example-card-line example-card-kernel">{{ soundBankKernelLabel(example) }} Kernel</div>
          </div>
        </v-card>
      </div>
    </v-card-text>

    <v-dialog
      v-model="data.exampleDialog"
      width="640"
      :content-class="data.selectedExample && data.selectedExample.screenshot ? 'example-dialog example-dialog-fitted' : 'example-dialog'"
    >
      <v-card v-if="data.selectedExample" class="example-card">
        <v-card-title>{{ exampleTitle(data.selectedExample) }}</v-card-title>
        <v-card-text class="example-info-fields">
          <div class="example-card-line example-dialog-kernel">{{ soundBankKernelLabel(data.selectedExample) }} Kernel</div>
          <div v-if="data.selectedExample.screenshot" class="example-screenshot-frame example-dialog-screenshot">
            <img
              :src="data.selectedExample.screenshot"
              :alt="exampleTitle(data.selectedExample)"
              class="example-screenshot"
            >
          </div>
          <v-text-field
            :value="data.selectedExample.title"
            label="Project Title"
            persistent-placeholder
            readonly
          />
          <v-row class="project-tight-row">
            <v-col cols="6">
              <v-text-field
                :value="data.selectedExample.developer"
                label="Developer"
                persistent-placeholder
                readonly
              />
            </v-col>
            <v-col cols="6">
              <v-text-field
                :value="data.selectedExample.version"
                label="Version"
                persistent-placeholder
                readonly
              />
            </v-col>
          </v-row>
          <v-row class="project-tight-row">
            <v-col cols="6">
              <v-text-field
                v-if="!exampleWebsiteUrl(data.selectedExample)"
                :value="data.selectedExample.website"
                label="Website"
                persistent-placeholder
                readonly
              />
              <div v-else class="example-website">
                <label
                  class="v-label example-website-label"
                  :class="$vuetify.theme.dark ? 'theme--dark' : 'theme--light'"
                >Website</label>
                <a
                  :href="exampleWebsiteUrl(data.selectedExample)"
                  :title="data.selectedExample.website"
                  target="_blank"
                  rel="noopener noreferrer"
                >{{ data.selectedExample.website }}</a>
              </div>
            </v-col>
            <v-col cols="6">
              <v-text-field
                :value="data.selectedExample.email"
                label="Email"
                persistent-placeholder
                readonly
              />
            </v-col>
          </v-row>
          <v-textarea
            :value="data.selectedExample.description"
            label="Project Description"
            class="example-description"
            persistent-placeholder
            no-resize
            readonly
            rows="6"
            hide-details
          />
          <p v-if="data.exampleError" class="example-error">{{ data.exampleError }}</p>
        </v-card-text>
        <v-card-actions>
          <v-btn text color="primary" @click="handleOpenExample">Open example</v-btn>
          <v-spacer></v-spacer>
          <v-btn text @click="data.exampleDialog = false">Close</v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>
  </v-card>
</template>
<script>
import {defineComponent, reactive, computed, onMounted, onBeforeUnmount, ref, getCurrentInstance} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import YAML from 'yaml';

import {appendCompileLog, useBackgroundsStorage, useColorPaletteStorage, useConfigurationStorage, useDataTablesStorage, usePlayerAnimationsStorage, useProjectAutoIncrementVersionStorage, useProjectIncludeDateInFilenameStorage, useProjectShowExamplesStorage, useDimSoundFxPercentStorage, useDimSoundFxStorage, useProjectShowSoundBanksStorage, useScoreFontEditsStorage, useScoreFontStorage, useSongsStorage, useSoundEffectsStorage, useSquishCustomScoreFontStorage, useTextFontStorage, useTextStringsStorage, useTitleScreenStorage, useWorkspaceStorage} from '../hooks/project';
import {combineLegacyPlayerAnimations, remapPlayer1AnimationIndexesInWorkspaceXml} from '../hooks/migrate-player-animations';
import {migrateLegacyPlayerBlocksInWorkspaceXml} from '../hooks/migrate-player-blocks';
import {migrateLegacyBounceBlocksInWorkspaceXml} from '../hooks/migrate-bounce-blocks';
import {migrateLegacyBallFireBlocksInWorkspaceXml} from '../hooks/migrate-ball-fire-blocks';
import {migrateLegacyInertiaAccelerateBlocksInWorkspaceXml} from '../hooks/migrate-inertia-accelerate-blocks';
import {migrateLegacyJoystickBlocksInWorkspaceXml} from '../hooks/migrate-joystick-blocks';
import {migrateLegacyKeypadBlocksInWorkspaceXml} from '../hooks/migrate-keypad-blocks';
import {getDateInfix} from '../utils/date';
import {sanitizeForFilename} from '../utils/file';
import {resetMusicEditorActiveState} from '../hooks/music-editor-state';
import {clearEmulatorRom} from '../hooks/emulator';
import {useLastLoadedRomBytes, useLastBuildScreenshot} from '../hooks/rom-status';
import {captureEmulatorScreenshot} from '../utils/emulator-screenshot';
import {matrixToPlayfield, playfieldToMatrix} from '../utils/pixels';
import {persistActiveFileHandle, loadPersistedFileHandle, persistActiveDirHandle, loadPersistedDirHandle,
  ensureWritePermission, persistActiveFilePath, loadPersistedFilePath} from '../utils/file-handle-storage';
import {examplesState} from '../hooks/examples';
import {useDebugVariables, setDebugVariables} from '../hooks/debug-symbols';
import {useEmulatorSettings, saveEmulatorSettings} from '../hooks/emulator-settings';
import {soundBanksState} from '../hooks/soundbanks';
import {processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {buildSoundBankImportEntries, importSoundBankEntries, soundEffectsInBankFile} from '../utils/sound-bank';
import {KERNEL_NAMES} from '../utils/dpc-sound';
import SoundBankImportDialog from '../components/SoundBankImportDialog.vue';
import {previewSoundEffect, stopSoundEffectPreview} from '../utils/sound-preview';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';
import pkg from '../../package.json';
const appVersion = pkg.version;

const FORMAT_TYPE = 'VCS Game Maker Project';
const FORMAT_VERSION = 1.0;

// True "Save" (silently overwriting the same file, no picker) needs a real
// FileSystemFileHandle to write back to - only Chromium browsers (Chrome/
// Edge/Opera) implement the File System Access API these come from;
// Firefox/Safari have no way to write to an arbitrary file without a
// picker at all. Confirmed as the intended tradeoff (asked directly): on
// unsupported browsers, the "Save" button simply never appears - every
// save there goes through "Save As..." (the existing always-prompts
// download behavior), rather than "Save" silently falling back to that
// same behavior under an identical-looking button.
const SUPPORTS_FILE_SYSTEM_ACCESS =
  typeof window !== 'undefined' &&
  typeof window.showSaveFilePicker === 'function' &&
  typeof window.showOpenFilePicker === 'function';

// Set when Save with auto-increment has no folder to write new versions into (see saveAsNextVersion); both
// last until the page is reloaded, when the folder is offered again.
let incrementSaveToDownloads = false;
// Set once the folder dialog has been shown (see saveAsNextVersion).
let projectFolderAsked = false;

// window.electronAPI only exists inside the desktop build's preload script
// (see preload.js) - never true in a browser. Checked BEFORE
// SUPPORTS_FILE_SYSTEM_ACCESS in every save/open handler below: Electron
// never exposes window.showSaveFilePicker/showOpenFilePicker (that API
// isn't wired up in Electron the way it is in Chrome), so without this,
// SUPPORTS_FILE_SYSTEM_ACCESS was always false there and "Save" silently
// fell all the way back to "Save As..." - a picker on every single click,
// even for the same already-saved file (a real reported bug: "Save" acting
// like "Save As" in the desktop build).
const IS_ELECTRON = typeof window !== 'undefined' && !!window.electronAPI;

const FILE_PICKER_TYPES = [{
  description: 'VCS Game Maker Project',
  accept: {'application/x-yaml': ['.vcsgm']},
}];

export default defineComponent({
  components: {SoundBankImportDialog},
  setup(props, context) {
    const data = reactive({
      newProjectDialog: false,
      // The example card whose popup is open (see hooks/examples.js).
      selectedExample: null,
      exampleDialog: false,
      exampleError: '',
      // The sound bank being imported (see hooks/soundbanks.js): its popup rows
      // and open state, and a message if its file can't be read.
      soundBankDialog: false,
      soundBankEntries: [],
      soundBankError: '',
      // Which downloads the Sound Banks screen lists: 'all', 'bank', 'sound' or 'instrument'.
      soundBankFilter: 'all',
      // Text the Sound Banks and Example Projects screens narrow their cards down to.
      soundBankSearch: '',
      exampleSearch: '',
      // Name of the sound bank whose preview is playing, or ''.
      previewingSoundBank: '',
      // The handle "Save" writes back to, from the last "Save As..." or
      // "Open Project" that went through the File System Access API (see
      // SUPPORTS_FILE_SYSTEM_ACCESS above) - null whenever there's nothing
      // to save back to yet (nothing opened/saved this session), or on a
      // browser that never gets one at all. Restored from IndexedDB on
      // mount (see onMounted below and utils/file-handle-storage.js) so a
      // page refresh doesn't lose it - a real reported gap: "Save" was
      // silently falling back to "Save As..." behavior after a reload
      // even with the exact same project still open, since a
      // FileSystemFileHandle used to live in memory only.
      activeFileHandle: null,
      // The folder the project is saved into, for the auto-incrementing Save (see handleSaveProject).
      activeDirHandle: null,
      // The Electron build's  equivalent of activeFileHandle above - a
      // plain absolute path (see background.js's project:save-as/
      // project:open handlers) rather than a FileSystemFileHandle, since
      // Electron never exposes the File System Access API SUPPORTS_FILE_
      // SYSTEM_ACCESS checks for. Restored from localStorage on mount (see
      // onMounted below), same reasoning as activeFileHandle's  restore.
      activeFilePath: null,
    });
    const router = context.root.$router;
    // Whether the Example Projects section replaces the Project Settings
    // section; remembered across page refreshes.
    const showExamples = useProjectShowExamplesStorage();
    // The Sound Banks screen, kept across a refresh like showExamples.
    const showSoundBanks = useProjectShowSoundBanksStorage();

    // Same "growing padding + a bottom border once actually scrolled"
    // treatment as the graphic editor toolbar. This component's root is the
    // scrolling .editor-container itself.
    const instance = getCurrentInstance();
    const isToolbarScrolled = ref(false);
    const handleToolbarScroll = (event) => {
      isToolbarScrolled.value = event.target.scrollTop > 0;
    };
    onMounted(() => instance.proxy.$el.addEventListener('scroll', handleToolbarScroll));
    onBeforeUnmount(() => instance.proxy.$el.removeEventListener('scroll', handleToolbarScroll));

    const backgroundsStorage = useBackgroundsStorage();
    const playerAnimationsStorage = usePlayerAnimationsStorage();
    const workspaceStorage = useWorkspaceStorage();
    const configurationStorage = useConfigurationStorage();
    const scoreFontStorage = useScoreFontStorage();
    const squishCustomScoreFontStorage = useSquishCustomScoreFontStorage();
    const scoreFontEditsStorage = useScoreFontEditsStorage();
    const dataTablesStorage = useDataTablesStorage();
    const textStringsStorage = useTextStringsStorage();
    const textFontStorage = useTextFontStorage();
    const soundEffectsStorage = useSoundEffectsStorage();
    const songsStorage = useSongsStorage();
    const titleScreenStorage = useTitleScreenStorage();
    // The Quick colors shortlist shared by the graphic editors - saved with the project.
    const colorPaletteStorage = useColorPaletteStorage();
    const debugVariablesStorage = useDebugVariables();
    const emulatorSettingsStorage = useEmulatorSettings();

    // Kept directly on the same configuration bag every other project-wide
    // setting already lives in (scoreBkColor, textBkColor, etc. - see
    // ScoreFontEditor.vue's  scoreBkColor for the identical pattern),
    // rather than a separate storage key - it's saved/loaded as part of the
    // project file for free that way (buildProjectYaml/loadProjectFromFile
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
    // A standing app preference (see Configuration.vue's  Options tab
    // switch), not part of the project itself - unlike projectTitle/
    // projectVersion/etc above, this shouldn't reset to off every time you
    // switch or start a new project, so it deliberately does NOT live on
    // configurationStorage via useConfigField.
    const projectAutoIncrementVersion = useProjectAutoIncrementVersionStorage();
    // Same "standing app preference, not a project setting" reasoning as
    // projectAutoIncrementVersion above.
    const projectIncludeDateInFilename = useProjectIncludeDateInFilenameStorage();

    // Restores whatever file handle was persisted from the last Save
    // As.../Open Project this browser did (see utils/file-handle-storage.js)
    // - queryPermission only ever CHECKS the current status, no user
    // gesture needed, so this can run unprompted right on mount. A
    // "denied" status (the user explicitly revoked it, or the file was
    // moved/deleted) is the one case this deliberately does NOT restore -
    // "Save" falls back to "Save As..." instead, the same as if nothing
    // had ever been persisted, rather than repeatedly failing against a
    // handle that's never going to work again. "prompt" (not yet decided,
    // common right after a reload even for a previously-granted handle)
    // still gets restored - the next actual "Save" click re-asks via
    // ensureWritePermission, which a real click satisfies the user-gesture
    // requirement for.
    if (SUPPORTS_FILE_SYSTEM_ACCESS) {
      onMounted(async () => {
        const handle = await loadPersistedFileHandle();
        if (!handle) return;
        try {
          const permission = await handle.queryPermission({mode: 'readwrite'});
          if (permission !== 'denied') data.activeFileHandle = handle;
        } catch (e) {
          console.error('Error while checking permission for the restored project file handle', e);
        }
        // The project's folder too, so Save with auto-increment keeps writing new versions beside it.
        try {
          const folder = await loadPersistedDirHandle();
          if (folder && (await folder.queryPermission({mode: 'readwrite'})) !== 'denied') data.activeDirHandle = folder;
        } catch (e) {
          console.error('Error while restoring the project folder handle', e);
        }
      });
    }

    // Electron's  restore - the file may have been moved/deleted since
    // the path was persisted, so this double-checks via project:path-exists
    // (the Electron-side equivalent of the browser restore's
    // queryPermission() === 'denied' check above) rather than trusting a
    // stale path and only finding out on the next failed Save.
    if (IS_ELECTRON) {
      onMounted(async () => {
        const filePath = loadPersistedFilePath();
        if (!filePath) return;
        try {
          if (await window.electronAPI.projectPathExists(filePath)) data.activeFilePath = filePath;
        } catch (e) {
          console.error('Error while checking the restored project file path', e);
        }
      });
    }

    const soundBankFilterItems = [
      {text: 'All', value: 'all'},
      {text: 'Sound banks', value: 'bank'},
      {text: 'Sounds', value: 'sound'},
      {text: 'Instruments', value: 'instrument'},
      {text: 'Percussion', value: 'percussion'},
    ];
    // Every word typed has to be somewhere in the card's text (names, developer, kernel...).
    const matchesSearch = (search, parts) => {
      const words = String(search || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return true;
      const text = parts.filter(Boolean).join(' ').toLowerCase();
      return words.every((word) => text.includes(word));
    };
    const filteredSoundBanks = computed(() => soundBanksState.entries.filter(
        (bank) => (data.soundBankFilter === 'all' || bank.kind === data.soundBankFilter) &&
          matchesSearch(data.soundBankSearch, [bank.name, bank.developer, bank.kernel, bank.kind, ...(bank.sounds || [])])));
    const filteredExamples = computed(() => examplesState.entries.filter(
        (example) => matchesSearch(data.exampleSearch,
            [example.name, example.title, example.developer, example.version, example.kernel, example.description])));

    return {data, router, showExamples, showSoundBanks, isToolbarScrolled, examples: examplesState, soundBanks: soundBanksState,
      soundBankFilterItems, filteredSoundBanks, filteredExamples, backgroundsStorage, playerAnimationsStorage,
      workspaceStorage, configurationStorage, scoreFontStorage, squishCustomScoreFontStorage, scoreFontEditsStorage, dataTablesStorage,
      textStringsStorage, textFontStorage, soundEffectsStorage, songsStorage, titleScreenStorage, colorPaletteStorage,
      debugVariablesStorage, emulatorSettingsStorage, projectTitle,
      projectDescription, projectDeveloper, projectVersion, projectAutoIncrementVersion, projectIncludeDateInFilename,
      projectWebsite, projectEmail};
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

    // Shared by handleSaveProjectAs and handleSaveProject - builds the same
    // YAML content either one writes out, so the two only differ in WHERE
    // it ends up (a fresh picker vs. writing straight back to
    // data.activeFileHandle).
    buildProjectYaml() {
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

      const playerAnimations = preparePlayerSave(this.playerAnimationsStorage);

      const scoreFont = !this.scoreFontStorage ? null : {
        ...this.scoreFontStorage,
        digits: this.scoreFontStorage.digits.map(matrixToPlayfield),
      };

      const squishCustomScoreFont = !this.squishCustomScoreFontStorage ? null : {
        ...this.squishCustomScoreFontStorage,
        digits: this.squishCustomScoreFontStorage.digits.map(matrixToPlayfield),
      };

      // Fonts other than Custom and Squish Custom that have been redrawn: one entry each.
      const scoreFontEdits = !this.scoreFontEditsStorage || !this.scoreFontEditsStorage.fonts ? null : {
        ...this.scoreFontEditsStorage,
        fonts: Object.fromEntries(Object.entries(this.scoreFontEditsStorage.fonts).map(([key, font]) => [
          key, {...font, digits: font.digits.map(matrixToPlayfield)},
        ])),
      };

      const textFont = !this.textFontStorage ? null : {
        ...this.textFontStorage,
        glyphs: this.textFontStorage.glyphs.map(matrixToPlayfield),
        // The scroll cursor's  shape (see components/TextFontEditor.vue) -
        // optional: an older saved project (or one that's never opened the
        // Text Font Editor card at all) has no cursor of its  yet, and
        // processCursorGlyphDefaults already falls back to a sensible
        // default whenever this key is missing on load.
        cursor: this.textFontStorage.cursor ? matrixToPlayfield(this.textFontStorage.cursor) : undefined,
      };

      // Was never wired into save/load at all, same gap "songs" fell into
      // (see that comment below) - a saved .vcsgm silently dropped every
      // Title tab page/graphic, confirmed as a real reported bug. Only
      // bitmap-type cards (48x1/48x2/96x2) have frames at all - space/
      // player/score cards pass through untouched, same reasoning
      // preparePlayerSave's frame mapping doesn't need for THOSE types.
      const titleScreen = !this.titleScreenStorage ? null : {
        ...this.titleScreenStorage,
        screens: this.titleScreenStorage.screens.map((screen) => ({
          ...screen,
          cards: (screen.cards || []).map((card) => !card.frames ? card : ({
            ...card,
            frames: card.frames.map((frame) => ({...frame, pixels: matrixToPlayfield(frame.pixels)})),
          })),
        })),
      };

      // A picture of what the emulator is showing, as a PNG data URL, so a
      // saved project can be recognised at a glance. Only taken while a ROM
      // is running (otherwise it would just be a black screen), and nothing
      // reads it back on load.
      const liveScreenshot = useLastLoadedRomBytes().value ? captureEmulatorScreenshot() : null;
      const screenshot = useLastBuildScreenshot().value ||
        (liveScreenshot ? liveScreenshot.toDataURL('image/png') : null);

      const projectYaml = YAML.stringify({
        'type': FORMAT_TYPE,
        'format-version': FORMAT_VERSION,
        // The actual VCS Game Maker release that wrote this file (package.json's
        // version, e.g. "0.50.28") - distinct from format-version above,
        // which is this .vcsgm SCHEMA's  version and only bumps when the
        // save shape itself changes. Purely informational (nothing reads this
        // back on load) - lets a saved file's  history/support requests
        // say which app build produced it, same reasoning generation-time
        // already does for when.
        'app-version': appVersion,
        'generation-time': new Date(),
        'screenshot': screenshot || undefined,
        configuration,
        'blockly-workspace': this.workspaceStorage,
        'player-animations': playerAnimations,
        backgrounds,
        'title-screen': titleScreen,
        'score-font': scoreFont,
        'squish-custom-score-font': squishCustomScoreFont,
        'score-font-edits': scoreFontEdits,
        'data-tables': this.dataTablesStorage,
        'text-strings': this.textStringsStorage,
        'text-font': textFont,
        'sound-effects': this.soundEffectsStorage,
        // Songs, sequences, patterns, instruments (tracks) and their notes -
        // all live in this one storage object (see hooks/project.js's
        // useSongsStorage/blocks/music.js's DEFAULT_SONGS shape). Was never
        // wired into save/load at all, so a saved .vcsgm silently dropped
        // every Music tab edit - the song would still play back in the
        // editor itself (localStorage was never cleared), but loading that
        // saved file elsewhere, or after clearing storage, lost it all.
        'songs': this.songsStorage,
        // The Quick colors shortlist (color bytes, in order) shown above the graphic editors.
        'quick-colors': this.colorPaletteStorage || undefined,
        // The variables the emulator's debug info shows, and the list of variables (with their addresses) from the
        // last build that the Debug Info dialog picks from, so both are there again when the project is opened.
        'debug-variables': (this.emulatorSettingsStorage.debugVariables || []).length || this.debugVariablesStorage.length ?
          {chosen: this.emulatorSettingsStorage.debugVariables || [], list: this.debugVariablesStorage} : undefined,
      });

      return projectYaml;
    },

    // Builds the suggested filename for a new save - empty title prefix
    // when the Project tab's  Title field was never filled in, same as
    // before (just the date, no stray leading "_"). Version is appended
    // last (also underscore-led) so two saves of the same project on the
    // same day - a common case with projectAutoIncrementVersion on, see
    // handleSaveProjectAs/handleSaveProject above - still get distinct
    // filenames instead of colliding on just the date. Periods (a plain
    // version like "0.50.23") become dashes - sanitizeForFilename itself
    // leaves periods alone (they're valid on every platform, unlike the
    // characters it actually strips), but "0.50.23.vcsgm" reads as though
    // ".23" were the file's  extension, not part of the version.
    // The date/time stamp itself is only actually optional once a Title is
    // filled in (see the "Include date/time" switch next to that field) -
    // with no title at all, the date is the only thing keeping repeated
    // saves from colliding on a bare "0-0-8.vcsgm", so it always stays on
    // regardless of the switch in that case.
    buildSaveFilename() {
      const includeDate = !this.projectTitle || this.projectIncludeDateInFilename;
      const parts = [
        this.projectTitle ? sanitizeForFilename(this.projectTitle) : '',
        includeDate ? getDateInfix() : '',
        this.projectVersion ? sanitizeForFilename(this.projectVersion).replace(/\./g, '-') : '',
      ].filter(Boolean);
      return `${parts.join('_')}.vcsgm`;
    },

    // Always prompts, regardless of whether a "Save" handle already exists
    // - the whole point of "Save As...", as distinct from "Save" below.
    // Picks up a fresh data.activeFileHandle on a browser that supports it
    // (see SUPPORTS_FILE_SYSTEM_ACCESS), so a subsequent "Save" click
    // writes back to WHATEVER was picked here, not whatever was open
    // before.
    async handleSaveProjectAs() {
      // Applied before buildProjectYaml() reads configurationStorage, so
      // both the saved file AND the field shown on this tab pick up the
      // bump - not just a one-off value baked into this particular export.
      if (this.projectAutoIncrementVersion) {
        this.projectVersion = this.incrementVersion(this.projectVersion);
      }
      const filename = this.buildSaveFilename();
      // Built after the save dialog closes, not before: taking the screenshot
      // can mean a build, and a dialog opened after that long a wait is no
      // longer allowed (the click's permission to open one has expired).
      let projectYaml = null;
      const prepareProjectYaml = async () => {
        projectYaml = this.buildProjectYaml();
      };

      if (IS_ELECTRON) {
        await prepareProjectYaml();
        const result = await window.electronAPI.saveProjectAs(projectYaml, filename);
        if (!result) return; // The user cancelled the native dialog.
        this.data.activeFilePath = result.path;
        persistActiveFilePath(result.path);
        appendCompileLog(`Game saved to ${result.path}`, 'stage');
        return;
      }

      if (SUPPORTS_FILE_SYSTEM_ACCESS) {
        let handle;
        try {
          handle = await window.showSaveFilePicker({
            suggestedName: filename,
            types: FILE_PICKER_TYPES,
          });
        } catch (e) {
          // The user closing/cancelling the picker throws AbortError -
          // not a real failure, nothing to report or recover from.
          if (e && e.name === 'AbortError') return;
          // Chrome throws this SecurityError unconditionally when the app
          // is embedded in a cross-origin iframe - the spec disallows the
          // picker there outright, with no permissions-policy/allow
          // attribute able to override it (confirmed as the actual
          // reported bug: "Save"/"Save As" silently doing nothing when
          // embedded that way). Falls through to the same download-based
          // fallback used on a browser that never had the File System
          // Access API at all, rather than leaving the user with no way
          // to save.
          if (!(e && e.name === 'SecurityError')) {
            console.error('Error while saving project', e);
            return;
          }
        }
        await prepareProjectYaml();
        if (handle) {
          try {
            const writable = await handle.createWritable();
            await writable.write(projectYaml);
            await writable.close();
            this.data.activeFileHandle = handle;
            this.data.activeDirHandle = null;
            persistActiveDirHandle(null);
            // So "Save" keeps working as "Save" after a reload too - see
            // utils/file-handle-storage.js's  comment.
            persistActiveFileHandle(handle);
            appendCompileLog(`Game saved to ${handle.name}`, 'stage');
            return;
          } catch (e) {
            // Same cross-origin-iframe restriction as the showSaveFilePicker
            // catch above, just surfacing at a different call - confirmed
            // directly as a real reported bug ("can't open any vcsgm
            // files", the matching Open Project failure): showSaveFilePicker
            // itself can succeed while the handle it returns still can't
            // actually be written to, throwing NotAllowedError here instead.
            // Falls through to the same download-based fallback used for a
            // SecurityError above, rather than leaving "Save"/"Save As"
            // silently doing nothing.
            if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) {
              console.error('Error while saving project', e);
              return;
            }
          }
        }
      }

      if (projectYaml === null) await prepareProjectYaml();
      const projectBlob = new Blob([projectYaml], {type: 'text/yaml'});
      saveAs(projectBlob, filename);
      appendCompileLog(`Game saved to ${filename}`, 'stage');
    },

    // Always visible, always enabled - writes straight back to whatever
    // file was last opened/saved this session (data.activeFileHandle), no
    // picker at all. The FIRST time it's ever clicked in a session (or on
    // a browser that can never get a handle at all - see
    // SUPPORTS_FILE_SYSTEM_ACCESS), there's nothing to write back to yet,
    // so this just falls through to the exact same picker Save As uses -
    // meaning Save always does SOMETHING useful, and every save after that
    // first one goes straight back to the same file with no prompt.
    async handleSaveProject() {
      if (IS_ELECTRON) {
        if (!this.data.activeFilePath) {
          await this.handleSaveProjectAs();
          return;
        }
        // With auto-increment on, every save is a new file beside the last one, under the new
        // version's name - nothing is overwritten and nothing is asked.
        let targetPath = this.data.activeFilePath;
        if (this.projectAutoIncrementVersion) {
          this.projectVersion = this.incrementVersion(this.projectVersion);
          const folderEnd = Math.max(targetPath.lastIndexOf('/'), targetPath.lastIndexOf('\\'));
          targetPath = targetPath.slice(0, folderEnd + 1) + this.buildSaveFilename();
        }
        const projectYaml = this.buildProjectYaml();
        const ok = await window.electronAPI.saveProject(targetPath, projectYaml);
        if (!ok) {
          console.error('Could not save the project file.');
          return;
        }
        this.data.activeFilePath = targetPath;
        persistActiveFilePath(targetPath);
        appendCompileLog(`Game saved to ${targetPath}`, 'stage');
        return;
      }

      // With no folder to write into, every save goes to the downloads with its new name; the first
      // save of a session still needs the Save As dialog to get a place for the project.
      if (this.projectAutoIncrementVersion && SUPPORTS_FILE_SYSTEM_ACCESS && incrementSaveToDownloads) {
        await this.saveAsNextVersion();
        return;
      }
      if (!SUPPORTS_FILE_SYSTEM_ACCESS || !this.data.activeFileHandle) {
        await this.handleSaveProjectAs();
        return;
      }

      if (this.projectAutoIncrementVersion) {
        await this.saveAsNextVersion();
        return;
      }
      // A handle restored from a previous session (see the onMounted
      // restore in setup()) commonly still needs its write permission
      // re-confirmed after a reload - this click is the user gesture that
      // makes requestPermission() allowed to actually prompt if needed.
      const granted = await ensureWritePermission(this.data.activeFileHandle);
      if (!granted) {
        console.error('Write permission for the active project file was denied.');
        return;
      }
      const projectYaml = this.buildProjectYaml();
      const writable = await this.data.activeFileHandle.createWritable();
      await writable.write(projectYaml);
      await writable.close();
      appendCompileLog(`Game saved to ${this.data.activeFileHandle.name}`, 'stage');
    },

    // Save with "auto-increment version" on, in a browser: a new file under the next version's name
    // instead of writing over the last one, without asking each time. A browser can only create a
    // file next to another with the user's permission for that folder, which is asked for once
    // (the picker opens in the project file's folder) and remembered after that. When there is no
    // such folder - the picker was cancelled, or Chrome does not allow the folder (it refuses
    // Documents, Desktop and Downloads themselves) - every later save of the session goes straight
    // to the browser's downloads with the new name, rather than opening a dialog each time.
    async saveAsNextVersion() {
      let folder = null;
      {
        // The remembered folder is always tried first, even after an earlier save of this session went
        // to the downloads: its permission may only need a click to be confirmed again.
        folder = this.data.activeDirHandle;
        if (folder) {
          try {
            if (!(await ensureWritePermission(folder))) folder = null;
          } catch (e) {
            folder = null;
          }
        }
        if (folder) incrementSaveToDownloads = false;
        // The folder dialog opens at most once per page load, whatever happens: a refusal, a
        // cancel or a folder that stops being writable later all end in downloads, never in the
        // dialog again.
        if (!folder && !projectFolderAsked && !incrementSaveToDownloads) {
          projectFolderAsked = true;
          try {
            folder = await window.showDirectoryPicker({id: 'vcs-game-maker-project', mode: 'readwrite',
              startIn: this.data.activeFileHandle});
            this.data.activeDirHandle = folder;
            persistActiveDirHandle(folder);
          } catch (e) {
            if (!(e && e.name === 'AbortError')) console.error('Could not get the project folder', e);
            folder = null;
          }
        }
        if (!folder) {
          appendCompileLog(`Saving each new version to the browser's downloads, since no folder for the project was chosen. ` +
            `Pick a folder inside Documents (not Documents itself) next time to keep saving there without the browser asking.`, 'stage');
          incrementSaveToDownloads = true;
        }
      }
      this.projectVersion = this.incrementVersion(this.projectVersion);
      const filename = this.buildSaveFilename();
      const projectYaml = this.buildProjectYaml();
      if (folder) {
        try {
          const handle = await folder.getFileHandle(filename, {create: true});
          const writable = await handle.createWritable();
          await writable.write(projectYaml);
          await writable.close();
          this.data.activeFileHandle = handle;
          persistActiveFileHandle(handle);
          appendCompileLog(`Game saved to ${handle.name}`, 'stage');
          return;
        } catch (e) {
          console.error('Error while saving the project as a new version', e);
          incrementSaveToDownloads = true;
        }
      }
      saveAs(new Blob([projectYaml], {type: 'text/yaml'}), filename);
      appendCompileLog(`Game saved to ${filename}`, 'stage');
    },

    // "Open Project" - on a browser that supports it, uses the same File
    // System Access API Save As does, so the resulting handle can ALSO
    // back a later "Save" click (matches the actual request: Save should
    // write back to whatever file was either imported from OR saved to
    // previously, not just the latter). Falls back to the existing hidden
    // native file input otherwise, which yields no handle - "Save" simply
    // falls back to prompting (see handleSaveProject above) the first time
    // that way, since there's no way to silently write back to a file
    // picked through a plain <input type="file">.
    async handleOpenProjectClick() {
      // Re-entrancy guard: a real reported bug ("the open window opening
      // twice", the SAME native picker flashing closed and immediately
      // reopening before anything was picked) traces to this handler firing
      // twice for one click - Chrome's spec for showOpenFilePicker()
      // aborts and replaces any picker already open when called again
      // before the first resolves, which looks exactly like a flash/reopen
      // rather than two separate dialogs. Persisted across the whole click
      // (not just the picker await) since the plain <input> fallback's
      // .click() below is just as capable of firing twice from the same
      // underlying double-invocation. Not on `this.data` - this doesn't
      // need to be reactive, just shared across re-entrant calls to this
      // same method.
      if (this._openingProject) return;
      this._openingProject = true;
      try {
        if (IS_ELECTRON) {
          const result = await window.electronAPI.openProject();
          if (!result) return; // The user cancelled the native dialog.
          this.data.activeFilePath = result.path;
          persistActiveFilePath(result.path);
          this.applyProjectYaml(result.content, result.name);
          return;
        }

        if (SUPPORTS_FILE_SYSTEM_ACCESS) {
          let handle;
          let file;
          try {
            const [pickedHandle] = await window.showOpenFilePicker({types: FILE_PICKER_TYPES});
            handle = pickedHandle;
            // Same cross-origin-iframe restriction as handleSaveProjectAs
            // above, just surfacing at a different call: showOpenFilePicker
            // itself can succeed (the native picker UI opens and the user
            // picks a file) while the handle it returns still can't actually
            // be read - handle.getFile() throws NotAllowedError in that case,
            // confirmed directly as a real reported bug ("can't open any
            // vcsgm files"): that error was previously thrown OUTSIDE this
            // try/catch entirely, so it just became an unhandled promise
            // rejection with "Open Project" silently doing nothing, instead
            // of falling through to the plain file input below like every
            // other cross-origin-iframe failure here does.
            file = await handle.getFile();
          } catch (e) {
            if (e && e.name === 'AbortError') return;
            if (!(e && (e.name === 'SecurityError' || e.name === 'NotAllowedError'))) {
              console.error('Error while opening project', e);
              return;
            }
            this.$refs.importFileInput.click();
            return;
          }
          this.data.activeFileHandle = handle;
          this.data.activeDirHandle = null;
          persistActiveDirHandle(null);
          persistActiveFileHandle(handle);
          this.loadProjectFromFile(file);
          return;
        }
        this.$refs.importFileInput.click();
      } finally {
        this._openingProject = false;
      }
    },

    // The native file input (replacing the old v-file-input, now that
    // importing is an icon button matching Save/Create New Project rather
    // than its  field) fires a plain change event with the picked file
    // on event.target.files - only reached on a browser without the File
    // System Access API (see handleOpenProjectClick above), so
    // data.activeFileHandle stays null and "Save" stays unavailable.
    handleImportFileInputChange(event) {
      const file = event.target.files[0] || null;
      // Clears the native input's  value too - without this, picking
      // the SAME file twice in a row wouldn't fire another change event at
      // all, since the browser only fires "change" when the input's value
      // actually differs from before.
      event.target.value = '';
      if (!file) return;
      this.loadProjectFromFile(file);
    },

    loadProjectFromFile(file) {
      if (!file) {
        console.warn('No file to import.');
        return;
      }

      const reader = new FileReader();
      reader.readAsText(file, 'UTF-8');
      reader.onload = (evt) => this.applyProjectYaml(evt.target.result, file.name);
      reader.onerror = (evt) => console.error('Error while loading project', evt);
    },

    // Shared by loadProjectFromFile (FileReader-based, used by the browser
    // build's  File System Access/plain-input paths) and Electron's
    // handleOpenProjectClick above, which already has the file's content as
    // a plain string via IPC (fs.readFileSync in the main process) with no
    // File/FileReader involved at all.
    applyProjectYaml(projectYaml, sourceName) {
      console.info('YAML', projectYaml);
      // YAML.parse returns null (not a parse error) for an empty document
      // - an empty/blank file, or one that's otherwise valid YAML but
      // just isn't an object (e.g. a bare "null"/"~" or a single scalar
      // value) - confirmed as a real reported crash this way: unguarded,
      // "project.type" below threw "Cannot read properties of null
      // (reading 'type')", a confusing raw TypeError instead of this same
      // file's  clear "not a valid project" message every OTHER
      // malformed-file case already gets.
      const project = YAML.parse(projectYaml);
      if (!project || typeof project !== 'object') {
        throw new Error('This file does not seem to be a valid project.');
      }

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

      const playerAnimations = preparePlayerLoad(project['player-animations']);
      if (playerAnimations) {
        this.playerAnimationsStorage = playerAnimations;
      } else if (project['player-0'] || project['player-1']) {
        // An older project saved before the two hardware players shared one
        // pool of animations (see hooks/migrate-player-animations.js's
        // comment) - combines the two legacy lists into the shared shape,
        // and remaps any sprite_player1_animation_select block's  stored
        // dropdown index (already loaded into this.workspaceStorage just
        // above) to match its animation's new position in the combined
        // pool.
        const legacyPlayer0 = preparePlayerLoad(project['player-0']);
        const legacyPlayer1 = preparePlayerLoad(project['player-1']);
        this.playerAnimationsStorage = combineLegacyPlayerAnimations(legacyPlayer0, legacyPlayer1);
        const offset = (legacyPlayer0 && legacyPlayer0.animations.length) || 0;
        if (offset) {
          this.workspaceStorage =
            remapPlayer1AnimationIndexesInWorkspaceXml(this.workspaceStorage, offset);
        }
      }

      // Rewrites any old sprite_player0_*/sprite_player1_* blocks a project
      // saved before Player 0/1 shared one combined block type still has -
      // see that function's  comment in hooks/migrate-player-blocks.js.
      // Has to run AFTER remapPlayer1AnimationIndexesInWorkspaceXml just
      // above, not before: that remap finds its target blocks by the OLD
      // "sprite_player1_animation_select" type string, which this migration
      // renames away.
      this.workspaceStorage = migrateLegacyPlayerBlocksInWorkspaceXml(this.workspaceStorage);

      // Rewrites any old sprite_missile_bounce/sprite_ball_bounce blocks
      // a project saved before Bounce became one unified object_bounce
      // block still has - see that function's  comment in
      // hooks/migrate-bounce-blocks.js.
      this.workspaceStorage = migrateLegacyBounceBlocksInWorkspaceXml(this.workspaceStorage);

      // Rewrites any old sprite_ball_fire block into the combined Fire block.
      this.workspaceStorage = migrateLegacyBallFireBlocksInWorkspaceXml(this.workspaceStorage);

      // Rewrites any old sprite_inertia_accelerate blocks missing their
      // ACTION field, and any old sprite_inertia_stop_accelerate blocks, a
      // project saved before Accelerate/Stop accelerating became one
      // combined block still has - see that function's comment in
      // hooks/migrate-inertia-accelerate-blocks.js.
      this.workspaceStorage = migrateLegacyInertiaAccelerateBlocksInWorkspaceXml(this.workspaceStorage);

      // Rewrites any old input_joy0_*/input_joy1_* blocks a project saved
      // before Joystick 0/1 shared one combined block type per feature
      // still has - see that function's comment in
      // hooks/migrate-joystick-blocks.js.
      this.workspaceStorage = migrateLegacyJoystickBlocksInWorkspaceXml(this.workspaceStorage);

      // Rewrites any old input_keypad0_*/input_keypad1_* blocks a project
      // saved before Keypad 0/1 shared one combined block type per feature
      // still has - see that function's comment in
      // hooks/migrate-keypad-blocks.js.
      this.workspaceStorage = migrateLegacyKeypadBlocksInWorkspaceXml(this.workspaceStorage);

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

      if (project['score-font-edits'] && project['score-font-edits'].fonts) {
        this.scoreFontEditsStorage = {
          ...project['score-font-edits'],
          fonts: Object.fromEntries(Object.entries(project['score-font-edits'].fonts).map(([key, font]) => [
            key, {...font, digits: font.digits.map(playfieldToMatrix)},
          ])),
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

      if (project['title-screen']) {
        const titleScreen = {
          ...project['title-screen'],
          screens: project['title-screen'].screens.map((screen) => ({
            ...screen,
            cards: (screen.cards || []).map((card) => !card.frames ? card : ({
              ...card,
              frames: card.frames.map((frame) => ({...frame, pixels: playfieldToMatrix(frame.pixels)})),
            })),
          })),
        };
        this.titleScreenStorage = titleScreen;
      }

      if (project.configuration) {
        this.configurationStorage = project.configuration;
      }

      // A file saved before Quick colors went into the project has none: the
      // current shortlist is left alone then.
      if (Array.isArray(project['quick-colors'])) {
        this.colorPaletteStorage = project['quick-colors'];
      }

      // A file saved before this existed has none: the current choice and list are cleared, since they
      // belong to another project's build.
      const debug = project['debug-variables'];
      setDebugVariables(debug && Array.isArray(debug.list) ? debug.list : []);
      saveEmulatorSettings({
        ...this.emulatorSettingsStorage,
        debugVariables: debug && Array.isArray(debug.chosen) ? debug.chosen : [],
      });

      if (project['data-tables']) {
        this.dataTablesStorage = project['data-tables'];
      }

      if (project['text-strings']) {
        this.textStringsStorage = project['text-strings'];
      }

      if (project['text-font']) {
        this.textFontStorage = {
          ...project['text-font'],
          glyphs: project['text-font'].glyphs.map(playfieldToMatrix),
          cursor: project['text-font'].cursor ? playfieldToMatrix(project['text-font'].cursor) : undefined,
        };
      }

      if (project['sound-effects']) {
        this.soundEffectsStorage = project['sound-effects'];
      }

      if (project.songs) {
        this.songsStorage = project.songs;
      }

      // Song/pattern/track IDs in the loaded project collide with
      // whatever the previous project used (both start counting from 1) -
      // without this, the Music tab's  active pattern/track selection
      // (see hooks/music-editor-state.js) would keep pointing at IDs left
      // over from before, showing the piano roll against the wrong
      // pattern/track, or one that doesn't exist in this project at all.
      resetMusicEditorActiveState();
      // Unlike an earlier version of this, deliberately stays on this tab
      // rather than navigating to Actions - same reasoning as
      // handleNewProject's  identical change: the user may still want
      // to check/adjust the imported project's  Title/Developer/
      // Version/Description right here first.
      clearEmulatorRom();
      appendCompileLog(`Imported project ${sourceName}`, 'stage');
    },

    handleSelectExample(example) {
      this.data.selectedExample = example;
      this.data.exampleError = '';
      this.data.exampleDialog = true;
    },

    exampleTitle(example) {
      return example.title || example.name.replace(/\.vcsgm$/i, '');
    },

    soundBankKindIcon(bank) {
      return {bank: 'mdi-database', instrument: 'mdi-piano', percussion: '$drum'}[bank.kind] || 'mdi-waveform';
    },
    // The website of a file as a link, or '' when it is not a web address.
    soundBankWebsiteLink(bank) {
      const site = (bank.website || '').trim();
      if (!site) return '';
      const url = /^https?:\/\//i.test(site) ? site : `https://${site}`;
      return /^https?:\/\/[^\s]+$/i.test(url) ? url : '';
    },
    soundBankKernelLabel(bank) {
      return KERNEL_NAMES[bank.kernel] || bank.kernel;
    },
    soundBankKindLabel(bank) {
      return {bank: 'Sound bank', instrument: 'Instrument', percussion: 'Percussion'}[bank.kind] || 'Sound';
    },

    // A single sound is titled with the name saved inside its file, a bank with
    // its file name.
    soundBankTitle(bank) {
      if (!bank.isBank && bank.sounds.length === 1 && bank.sounds[0] !== 'Unnamed sound effect') return bank.sounds[0];
      return bank.name.split('/').pop().replace(/\.(vcssnd|vcsbnk|json)$/i, '');
    },

    // Plays a card's sound, or every sound in a bank one after another (each
    // starts when the one before has run its duration). Clicking again, or
    // starting another card's preview, stops it.
    handlePreviewSoundBank(bank) {
      const wasPlaying = this.data.previewingSoundBank === bank.name;
      (this.soundBankPreviewTimers || []).forEach((timer) => window.clearTimeout(timer));
      this.soundBankPreviewTimers = [];
      stopSoundEffectPreview();
      this.data.previewingSoundBank = '';
      if (wasPlaying) return;
      let sounds;
      try {
        sounds = soundEffectsInBankFile(JSON.parse(bank.text));
      } catch (e) {
        this.data.soundBankError = `Could not read ${bank.name}: ${e.message}`;
        return;
      }
      this.data.soundBankError = '';
      this.data.previewingSoundBank = bank.name;
      const dimOn = useDimSoundFxStorage().value;
      const dimPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT).value;
      let startMs = 0;
      sounds.forEach((sound) => {
        // The volume the emulator plays it at with DIM on (see the Sound tab).
        const audv = dimOn ? dimVolume(sound.audv, dimPercent) : sound.audv;
        this.soundBankPreviewTimers.push(window.setTimeout(() => previewSoundEffect({...sound, audv}), startMs));
        startMs += (Math.max(0, Number(sound.duration) || 0) / 60) * 1000 + 250;
      });
      this.soundBankPreviewTimers.push(window.setTimeout(() => {
        this.data.previewingSoundBank = '';
      }, startMs));
    },

    // Opens the import popup for a bank's sounds against the open project's
    // sound effects (the same popup the Sound tab uses).
    handleSelectSoundBank(bank) {
      this.data.soundBankError = '';
      try {
        const state = processSoundEffectsStorageDefaults(useSoundEffectsStorage());
        this.data.soundBankEntries = buildSoundBankImportEntries(JSON.parse(bank.text), state.soundEffects);
        this.data.soundBankDialog = true;
      } catch (e) {
        console.error('Could not read the sound bank', e);
        this.data.soundBankError = `Could not read ${bank.name}: ${e.message}`;
      }
    },

    handleConfirmSoundBankImport() {
      const storage = useSoundEffectsStorage();
      const state = processSoundEffectsStorageDefaults(storage);
      importSoundBankEntries(state.soundEffects, this.data.soundBankEntries);
      storage.value = state;
      this.data.soundBankDialog = false;
      const count = this.data.soundBankEntries.filter((entry) => entry.selected).length;
      appendCompileLog(`Imported ${count} sound${count === 1 ? '' : 's'} into the project`, 'stage');
    },

    // The example's website as a link, or '' if it isn't a web address (only
    // http/https are linked, so a project file can't smuggle in another scheme).
    exampleWebsiteUrl(example) {
      const website = ((example && example.website) || '').trim();
      if (!website) return '';
      const url = /^[a-z][a-z0-9+.-]*:/i.test(website) ? website : `https://${website}`;
      return /^https?:\/\//i.test(url) ? url : '';
    },

    // Opens the example in the popup like a project file opened from disk,
    // except nothing is saved back to it: the example is a read-only copy, so
    // the active file handle/path from whatever project was open before is
    // dropped, the same as for a new project.
    handleOpenExample() {
      const example = this.data.selectedExample;
      if (!example) return;
      try {
        this.applyProjectYaml(example.text, example.name);
      } catch (e) {
        console.error('Could not open the example', e);
        this.data.exampleError = `Could not open this example: ${e.message}`;
        return;
      }
      this.data.activeFileHandle = null;
      this.data.activeDirHandle = null;
      persistActiveDirHandle(null);
      persistActiveFileHandle(null);
      this.data.activeFilePath = null;
      persistActiveFilePath(null);
      this.data.exampleError = '';
      this.data.exampleDialog = false;
      this.showExamples = false;
    },

    handleNewProject() {
      this.configurationStorage = null;
      this.workspaceStorage = null;
      this.playerAnimationsStorage = null;
      this.backgroundsStorage = null;
      this.titleScreenStorage = null;
      this.scoreFontStorage = null;
      this.squishCustomScoreFontStorage = null;
      this.scoreFontEditsStorage = null;
      this.dataTablesStorage = null;
      // A new project has nothing to "Save" back to yet, and shouldn't
      // silently overwrite whatever file the PREVIOUS project came from -
      // clears the persisted copy too, or a later reload would restore
      // the old project's handle right back onto this new, unrelated one.
      this.data.activeFileHandle = null;
      this.data.activeDirHandle = null;
      persistActiveDirHandle(null);
      persistActiveFileHandle(null);
      // The Electron build's  equivalent of the above - see
      // data.activeFilePath's  comment in setup().
      this.data.activeFilePath = null;
      persistActiveFilePath(null);
      this.textStringsStorage = null;
      this.textFontStorage = null;
      this.soundEffectsStorage = null;
      this.songsStorage = null;

      // Same reasoning as loadProjectFromFile's  call - a fresh project's
      // song/pattern/track IDs start counting from 1 again too, colliding
      // with whatever the previous project used.
      resetMusicEditorActiveState();
      clearEmulatorRom();

      this.data.newProjectDialog = false;
      // Unlike loadProjectFromFile, deliberately stays on this tab rather than
      // navigating to Actions - a real reported preference: after starting a
      // new project, the user may still want to set its Title/Developer/
      // Version/Description right here before doing anything else.
    },
  },
});
</script>
<style scoped>
/* The scrolling area, so the toolbar can stay pinned to its top (same as the
   Data tab). */
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* Same toolbar treatment as the graphic editor toolbar (and the Data tab's):
   pinned to the top of the scrolling area, with a bottom border and extra
   padding once something has scrolled under it. */
.project-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
  padding: 4px 16px;
  transition: padding 0.15s ease;
}

.project-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

.desaturate-app-colors .project-toolbar {
  background-color: #e1e1e1;
}

/* Plain, small flex gap between the icons - v-dialog injects its wrapper div
   around the Create New Project button's activator, so spacing comes from the
   row's gap rather than per-button margins. */
.project-toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 26px;
}

.project-toolbar-row >>> .data-icon-btn-size {
  margin: 0;
}

/* Icon states copied from the graphic editor toolbar: faint at rest, darker
   on hover, shrinking slightly while pressed, and dimmer still when disabled. */
.project-toolbar-row >>> .v-btn .v-icon {
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.project-toolbar-row >>> .v-btn--disabled .v-icon {
  color: rgba(0, 0, 0, 0.18) !important;
}

.project-toolbar-row >>> .v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.project-toolbar-row >>> .v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

/* The Example Projects button while its section is showing. */
.project-toolbar-row >>> .project-flat-icon-btn-active .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

/* v-dialog renders its  activator slot content wrapped in a real
   ".v-dialog__container" element (confirmed directly via the rendered DOM -
   [Save button, Import button, DIV.v-dialog__container, hidden input], not
   [Save, Import, Create-New-Project button, hidden input] as the template's
   flat appearance suggests) - THAT div, not the Create New Project
   button itself, was the actual flex child .project-toolbar-row's "gap"
   was spacing against, one reason the three icons never looked evenly
   spaced no matter what margin/gap value was tried here before this.
   display: contents removes the wrapper from the box model entirely while
   keeping its child (the real button) exactly where it sits in the DOM, so
   gap now applies between the three ICONS themselves, uniformly. */
.project-toolbar-row >>> .v-dialog__container {
  display: contents;
}

/* Hidden native file input backing the Import Project icon button - clicked
   programmatically (see handleImportFileInputChange) rather than shown
   itself, now that importing is an icon matching Save/Create New Project
   instead v-file-input field. */
.project-hidden-file-input {
  display: none;
}

/* Vuetify's default textarea line-height reads as loose over 6 rows of
   plain prose - tightened to read more like a compact text block. */
.project-description-field >>> textarea {
  line-height: 1.3;
}

/* v-card-text's  default top/bottom padding otherwise leaves a bigger
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
   to a small negative margin, -12px, by Vuetify's default) - two v-rows
   stacked back to back don't get that same collapse (confirmed directly:
   +12px instead), leaving a visibly bigger gap before this row than every
   other row on this tab. */
.project-tight-row {
  margin-top: -24px !important;
}

/* Plain flexbox (not v-row/v-col, tried first) - Vuetify's grid breaks on
   VIEWPORT width (its "sm" breakpoint etc, a media query under the hood),
   but this tab's actual available width is the CONTENT area, which is the
   viewport MINUS whatever the left nav-drawer/right emulator-drawer
   currently take up - confirmed as the real reason the earlier v-row/v-col
   version never actually wrapped: the browser window could easily stay
   above Vuetify's "sm" breakpoint (600px) while the content column itself
   was already down to a couple hundred cramped pixels with both drawers
   open. flex-wrap here reacts to this row's real rendered width
   instead, however that width got there. */
.project-developer-version-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0 24px;
}

/* Same reasoning as .project-developer-version-row above (Vuetify's grid
   breakpoints don't react to the actual available content width, plain
   flexbox does) - puts the "Include date/time" switch beside the Title
   field, wrapping onto a separate row once there isn't room. */
.project-title-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0 24px;
}

.project-title-field {
  flex: 1 1 220px;
}

.project-developer-col {
  flex: 1 1 220px;
}

/* Puts the Auto-increment switch to the right of the Version field, in the
   same column, rather than a separate one - flex-basis matches
   .project-developer-col's so the two sides split evenly while there's
   room, and wraps onto its full-width row below Developer (see
   .project-developer-version-row's comment) once there isn't. */
.project-version-col {
  display: flex;
  align-items: center;
  gap: 12px;
  flex: 1 1 220px;
}

/* Vuetify's selection-control margin-top (meant for a switch stacking
   BELOW another field) otherwise pushes this out of vertical alignment
   with the Version field sharing this row - same fix as this app's other
   inline field+switch rows (e.g. TextEditor.vue's
   .text-scroll-cursor-switch). white-space: nowrap keeps its label on one
   line - safe now that Version/the switch always share a full row's width
   between them (see .project-version-col's comment) rather than a
   half-width column that could get narrower than the label itself. */
.project-auto-increment-switch {
  margin-top: 0;
  padding-top: 0;
  flex: 0 0 auto;
  white-space: nowrap;
}

/* Flat, transparent buttons; the icon colors and press effect come from the
   toolbar row's rules below, the same as the graphic editor toolbar's. */
.project-flat-icon-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

.project-flat-icon-btn::before {
  display: none;
}


/* Example cards: the same outlined card look as the cards on the other tabs,
   in a grid like the Data tab's. */
.example-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 8px;
  margin-top: 8px;
}

.example-card {
  cursor: pointer;
  overflow: hidden;
}

.example-screenshot-frame {
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: #000;
  aspect-ratio: 4 / 3;
}

.example-screenshot {
  width: 100%;
  height: 100%;
  /* Shown in the 4:3 shape of the emulator, whatever size the stored picture is. */
  object-fit: fill;
  image-rendering: pixelated;
}

.example-screenshot-placeholder {
  color: rgba(255, 255, 255, 0.4) !important;
}

.example-card-text {
  padding: 8px 12px 12px;
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
}

/* The kernel is always the bottom line of a card, whatever else is on it and however tall its row is. */
.example-card-kernel {
  margin-top: auto;
  padding-top: 4px;
}

.example-card-title {
  font-weight: 500;
}

.example-card-line {
  font-size: 0.85em;
  opacity: 0.7;
}

.example-dialog-kernel {
  font-size: 1.1em;
  line-height: 1.5;
  opacity: 0.85;
  margin-bottom: 16px;
}

/* The kernel line sits right under the title. */
.example-dialog .v-card__title {
  padding-bottom: 2px;
}

.example-dialog-screenshot {
  flex: 0 0 auto;
  margin: 0 auto 16px;
  width: min(100%, calc(36vh * 320 / 220));
}

/* The card fits the window; the buttons stay visible and only the description
   takes up whatever height is left (scrolling when its text needs it). */
.example-card {
  display: flex;
  flex-direction: column;
  max-height: 88vh;
}

.example-card > .v-card__text {
  flex: 1 1 auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.example-card > .v-card__text > * {
  flex: 0 0 auto;
}

.example-card > .v-card__text > .example-description {
  flex: 1 1 auto;
  min-height: 72px;
}

.example-info-fields >>> .example-description .v-input__control,
.example-info-fields >>> .example-description .v-input__slot {
  height: 100%;
  min-height: 0;
}

.example-info-fields >>> .v-input__slot:before,
.example-info-fields >>> .v-input__slot:after {
  display: none;
}

/* Every field block (text field, textarea, website link) is the same height:
   12px above (room for the floating label), the 32px field, 12px below. */
.example-info-fields >>> .v-text-field__details {
  display: none;
}

.example-info-fields >>> .v-input {
  margin: 0 0 12px;
  padding-top: 12px;
}

.example-info-fields >>> .v-input__slot {
  margin-bottom: 0;
}

.example-info-fields .project-tight-row {
  margin: 0 -12px !important;
}

.example-info-fields .project-tight-row > .col {
  min-width: 0;
  max-width: 50%;
  padding-top: 0;
  padding-bottom: 0;
}

/* Only the description scrolls (scrollbar only when the text needs it). */
.example-info-fields >>> .v-textarea textarea {
  height: 100%;
  margin-top: 0;
  overflow-y: auto;
}

.example-website {
  box-sizing: border-box;
  max-width: 100%;
  overflow: hidden;
  height: 56px;
  padding-top: 12px;
  position: relative;
}

.example-website .example-website-label {
  position: absolute;
  top: 4px;
  left: 0;
  font-size: 12px;
  line-height: 12px;
  /* The colour comes from Vuetify's .v-label rules, shared with the other fields' labels. */
}

.example-website a {
  display: block;
  line-height: 32px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The search field and the Show drop-down side by side under the screen's title. */
.project-search-row {
  margin-top: -18px;
  display: flex;
  gap: 16px;
  align-items: flex-start;
}

.project-search-field {
  max-width: 320px;
}

/* The Show drop-down under the Sound Banks title: as wide as its choices need, not the page. */
.sound-bank-filter {
  max-width: 220px;
}

/* The kind icon (sound, bank or instrument) before a card's title: the title's grey
   (the text color), a little lower than the baseline so it centers on the text. */
.sound-bank-kind-icon {
  margin-right: 4px;
  vertical-align: -2px;
  color: inherit !important;
}

.sound-bank-card {
  position: relative;
}

.sound-bank-preview-btn {
  position: absolute;
  top: 4px;
  right: 4px;
  z-index: 1;
}

.sound-bank-names {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.example-error {
  color: var(--destructive-color, #b71c1c);
  margin: 8px 0 0;
}

.example-status {
  margin-top: 8px;
}

.example-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  font-size: 0.85em;
  opacity: 0.7;
}

.example-joystick-icon {
  width: 19px !important;
  height: 19px !important;
}

/* Same as the graphic editor toolbar's dividers (.get-inner-divider): no
   margin, so the 4px gap each side is all the spacing, and full height. */
.project-toolbar-divider {
  margin: 0;
}
</style>

<style>
/* The example info popup never scrolls as a whole - only its description does
   (see .example-card in the scoped styles). */
.v-dialog.example-dialog {
  overflow: hidden;
}

/* With a screenshot the popup is only as wide as the picture (the same width as .example-dialog-screenshot) plus the
   card's side padding, instead of the full 640px. */
.v-dialog.example-dialog.example-dialog-fitted {
  width: min(640px, calc(36vh * 320 / 220 + 48px)) !important;
}
</style>
