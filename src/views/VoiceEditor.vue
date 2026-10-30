<template>
  <div>
    <v-card class="editor-container" :ripple="false" flat @click="deselectCard">
      <v-card-title>Vox (alpha 0.2)</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message voice-intro-paragraph">
          The voices of the AtariVox, the speech chip in the Player 2 port (turn it on in the Options tab). The speech blocks pick the voice they say with. Each voice sets the controls of the chip (volume, speed, pitch and bend) before the speech starts. A "set voice"
          block of the Vox category changes a control from the point it runs, and then that control is left to the blocks.
        </p>
      </v-card-text>
      <v-card-text class="soundfx-dim-section">
        <div class="soundfx-toolbar" :class="{'soundfx-toolbar-scrolled': isToolbarScrolled}" @click.stop>
          <div class="soundfx-toolbar-row">
            <v-btn
              icon
              small
              :title="UNDO_TITLE"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!reorderCanUndo"
              @click="tryUndoReorder"
            >
              <v-icon>mdi-undo</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              :title="REDO_TITLE"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!reorderCanRedo"
              @click="tryRedoReorder"
            >
              <v-icon>mdi-redo</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <v-btn
              icon
              small
              :title="selectedVoices.length > 1 ? `Save the ${selectedVoices.length} selected voices to a single .vcsvbnk voice bank file` : 'Save every voice in this project to a single .vcsvbnk voice bank file'"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              @click="handleExportBank"
            >
              <v-icon>mdi-database-export</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              :title="'Load a .vcsvbnk voice bank file: a voice whose name matches one already here has its controls replaced; every other voice in the file is added as a new card'"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              @click="handleImportBank"
            >
              <v-icon>mdi-database-import</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <v-btn
              icon
              small
              :title="selectedVoices.length > 1 ? `Export each of the ${selectedVoices.length} selected voices to a separate .vcsvox file` : 'Export voice to .vcsvox file'"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!selectedVoice"
              @click="handleExportSelected"
            >
              <v-icon>mdi-export</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              :title="'Import a voice from a .vcsvox file into the selected voice'"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              :disabled="!selectedVoice"
              @click="handleImportIntoSelected"
            >
              <v-icon>mdi-import</v-icon>
            </v-btn>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <v-btn
              icon
              small
              title="Import a dictionary from a .Dic file"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              @click="handleImportDictionary"
            >
              <v-icon>mdi-book-arrow-down</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              title="Export the whole dictionary to a .Dic file"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              @click="handleExportDictionary"
            >
              <v-icon>mdi-book-arrow-up</v-icon>
            </v-btn>
            <!-- Hidden for now (the words stay in the project): remove the v-if to show it again. -->
            <v-menu v-if="false" v-model="clearDictionaryOpen" top>
              <template v-slot:activator="{ on, attrs }">
                <v-btn
                  icon
                  small
                  title="Remove the imported words"
                  class="soundfx-bank-btn soundfx-icon-btn-size"
                  :disabled="!importedWordCount"
                  v-bind="attrs"
                  v-on="on"
                >
                  <v-icon>mdi-book-remove</v-icon>
                </v-btn>
              </template>
              <v-card>
                <v-card-title>Remove the {{ importedWordCount }} imported words?</v-card-title>
                <v-list>
                  <v-list-item @click="handleClearDictionary">
                    <v-list-item-icon><v-icon>mdi-check</v-icon></v-list-item-icon>
                    <v-list-item-title>Yes, remove</v-list-item-title>
                  </v-list-item>
                  <v-list-item @click="clearDictionaryOpen = false">
                    <v-list-item-icon><v-icon>mdi-cancel</v-icon></v-list-item-icon>
                    <v-list-item-title>No, keep them</v-list-item-title>
                  </v-list-item>
                </v-list>
              </v-card>
            </v-menu>
            <v-divider class="soundfx-toolbar-divider" vertical />
            <DimControls description="When DIM is on, the AtariVox speaks at the volume set here, as a percentage of its volume (the same setting as the Sound and Music tabs' DIM). Off: it speaks at its set volume." />
          </div>
          <v-divider class="soundfx-divider" />
        </div>

        <voice-bank-import-dialog v-model="importOpen" :entries="importEntries" @confirm="handleConfirmImport" />
        <v-text-field
          v-model="state.voicePreview"
          label="Preview message"
          class="voice-preview-field"
          @change="handleChange"
        />
        <v-divider class="voice-dictionary-divider" />
        <div class="voice-dictionary-section">
        <div class="option-section-header voice-dictionary-header" @click="dictionaryOpen = !dictionaryOpen">
          <v-btn icon small :title="dictionaryOpen ? 'Hide the dictionary' : 'Show the dictionary'">
            <v-icon>{{ dictionaryOpen ? 'mdi-chevron-down' : 'mdi-chevron-right' }}</v-icon>
          </v-btn>
          <span class="text-subtitle-1">Dictionary</span>
          <!-- Not a hint of a field: the hints are hidden by Expert mode, and the count is always shown. -->
          <span class="voice-dictionary-count">{{ builtinWordCount.toLocaleString() }} built-in words<template v-if="importedWordCount">, {{ importedWordCount }} imported</template></span>
        </div>
        <div v-if="dictionaryOpen" class="voice-dictionary" @click.stop>
          <div class="voice-dictionary-large">
            <v-btn
              v-if="largeDictionary.status === 'ready'"
              small
              depressed
              class="voice-dictionary-command"
              title="Remove the large dictionary from this browser"
              @click="removeLargeDictionary"
            >
              Remove
            </v-btn>
            <v-btn
              v-else
              small
              depressed
              class="voice-dictionary-command"
              :disabled="largeDictionary.status === 'downloading'"
              title="Download the large dictionary"
              @click="downloadLargeDictionary"
            >
              {{ largeDictionary.status === 'downloading' ? `Downloading ${largeDictionary.progress}%` : 'Download' }}
            </v-btn>
            <span>Large dictionary (CMU): {{ largeDictionaryWords.toLocaleString() }} words (4.6 MB).</span>
            <span v-if="largeDictionary.status === 'error'" class="voice-dictionary-error">Could not download it ({{ largeDictionary.message }})</span>
          </div>
          <div class="voice-dictionary-commands">
            <span class="voice-dictionary-commands-label">Insert</span>
            <v-btn
              v-for="command in speechCommands"
              :key="command.text"
              x-small
              depressed
              class="voice-dictionary-command"
              :title="command.title"
              @mousedown.prevent
              @click="() => handleInsertCommand(command.text)"
            >
              {{ command.text }}
            </v-btn>
          </div>
          <div class="voice-dictionary-search-row">
            <v-text-field
              v-model="dictionarySearch"
              label="Search words or sounds"
              prepend-inner-icon="mdi-magnify"
              clearable
              dense
              hide-details
              class="voice-dictionary-search"
            />
            <span class="voice-dictionary-matches">{{ dictionaryMatches.length.toLocaleString() }} {{ dictionaryMatches.length === 1 ? 'word' : 'words' }}</span>
          </div>
          <div class="voice-dictionary-row voice-dictionary-add-row">
            <v-text-field
              v-model="newWord"
              label="New word"
              dense
              hide-details
              class="voice-dictionary-word"
              @keydown.enter="handleAddWord"
            />
            <v-text-field
              v-model="newSounds"
              label="SpeakJet words (for example AY EK TT)"
              dense
              hide-details
              class="voice-dictionary-sounds"
              @focus="(event) => rememberSoundsField(event, null)"
              @input="soundsEdited = true"
              @keydown.enter="handleAddWord"
            />
            <v-btn icon small title="Say it" class="soundfx-bank-btn soundfx-icon-btn-size" :disabled="!newSounds.trim()" @click="() => handleSaySounds(newSounds)">
              <v-icon>mdi-play</v-icon>
            </v-btn>
            <v-btn icon small title="Add the word to the dictionary of the project" class="soundfx-bank-btn soundfx-icon-btn-size" :disabled="!canAddWord" @click="handleAddWord">
              <v-icon>mdi-plus</v-icon>
            </v-btn>
          </div>
          <p v-if="dictionaryError" class="voice-dictionary-error">{{ dictionaryError }}</p>
          <div class="voice-dictionary-list">
          <div v-for="entry in shownWords" :key="entry.word" class="voice-dictionary-row">
            <span class="voice-dictionary-word voice-dictionary-name">{{ entry.word.toLowerCase() }}</span>
            <v-text-field
              :value="entry.words"
              @focus="(event) => rememberSoundsField(event, entry)"
              dense
              hide-details
              single-line
              class="voice-dictionary-sounds"
              :class="{'voice-dictionary-sounds-project': entry.project}"
              :title="entry.project ? (entry.builtIn ? 'The project says this word differently from the built-in dictionary' : 'A word of the dictionary of the project') : (entry.large ? 'A word of the large dictionary: change it to make a way of the project' : 'A word of the built-in dictionary: change it to make a way of the project')"
              @change="(value) => handleEditWord(entry, value)"
            />
            <v-btn icon small title="Say it" class="soundfx-bank-btn soundfx-icon-btn-size" @click="() => handleSaySounds(entry.words)">
              <v-icon>mdi-play</v-icon>
            </v-btn>
            <v-btn
              v-if="entry.project"
              icon
              small
              :title="entry.builtIn ? 'Back to the way the built-in dictionary says it' : 'Remove the word from the dictionary of the project'"
              class="soundfx-bank-btn soundfx-icon-btn-size"
              @click="() => handleRemoveWord(entry)"
            >
              <v-icon>{{ entry.builtIn ? 'mdi-restore' : 'mdi-delete' }}</v-icon>
            </v-btn>
            <span v-else class="voice-dictionary-spacer" />
          </div>
          <div v-if="dictionaryMatches.length > shownWords.length" class="voice-dictionary-more">
            <v-btn small text @click="dictionaryLimit += 100">Show more ({{ (dictionaryMatches.length - shownWords.length).toLocaleString() }} left)</v-btn>
          </div>
          </div>
        </div>

        </div>
        <v-divider class="voice-dictionary-divider voice-dictionary-divider-bottom" />

        <v-list class="soundfx-list">
          <v-list-item v-for="(voice, index) in state.voices" :key="voice.id" class="entry-list-item">
            <v-list-item-content>
              <v-card
                outlined
                :ripple="false"
                class="soundfx-card"
                :class="[dragCardClass(index), {'soundfx-card-selected': selectedCardIds.includes(voice.id), 'soundfx-card-collapsed': isCollapsed(voice)}]"
                v-on="dragTargetListeners(index)"
                @mousedown.shift.prevent
                @click.stop="(event) => selectCard(voice.id, event)"
              >
                <div
                  class="soundfx-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-btn
                  :title="isCollapsed(voice) ? 'Expand this voice' : 'Collapse this voice'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="soundfx-collapse-btn"
                  @click="() => toggleCollapsed(voice)"
                >
                  <v-icon>{{ isCollapsed(voice) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="soundfx-id-badge">ID:{{ voice.id }}</div>

                <div class="soundfx-toolbar-top-right">
                  <confirm-delete-menu
                    v-if="state.voices.length > 1"
                    :title="deleteQuestion(voice.id, 'voice', 1)"
                    :selected="selectedCardId === voice.id && selectedCardIds.includes(voice.id)"
                    :activator-title="`Delete voice ${voice.name}`"
                    icon-btn-class="soundfx-delete-btn soundfx-icon-btn-size"
                    @confirm="() => handleDelete(voice)"
                  />
                  <v-btn
                    icon
                    small
                    title="Back to the voice the chip has at start"
                    class="soundfx-play-btn soundfx-icon-btn-size"
                    @click.stop="() => handleReset(voice)"
                  >
                    <v-icon>mdi-restore</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Duplicate this voice"
                    class="soundfx-play-btn soundfx-icon-btn-size"
                    @click.stop="() => handleDuplicate(voice)"
                  >
                    <v-icon>mdi-content-duplicate</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :title="speakingId === voice.id ? 'Speaking...' : 'Hear this voice'"
                    :loading="speakingId === voice.id"
                    class="soundfx-play-btn soundfx-icon-btn-size"
                    @click.stop="() => handleSpeak(voice)"
                  >
                    <v-icon>mdi-play</v-icon>
                  </v-btn>
                </div>

                <v-card-text class="soundfx-name-section">
                  <div class="soundfx-name-row">
                    <v-text-field
                      v-model="voice.name"
                      class="soundfx-name-field"
                      label="Voice name"
                      @change="handleChange"
                    />
                  </div>
                </v-card-text>

                <v-card-text v-if="!isCollapsed(voice)" class="soundfx-fields-section">
                  <div class="voice-fields">
                    <v-text-field
                      v-for="control in controls"
                      :key="control.control"
                      :label="control.label"
                      :title="control.hint"
                      :value="voice[control.control]"
                      type="number"
                      min="0"
                      :max="control.max"
                      hide-details
                      class="voice-field"
                      @change="(value) => setValue(voice, control.control, value)"
                    />
                  </div>
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-voice-button"
      color="primary"
      title="Add a voice"
      dark
      absolute
      right
      fab
      @click="handleAdd"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>

<script>
import {computed, defineComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref, watch} from '@vue/composition-api';
import {useCollapsedIds} from '../hooks/collapse';
import {useCardSelection} from '../hooks/card-selection';
import {useDragReorder} from '../hooks/drag-reorder';
import {max} from 'lodash';
import {saveAs} from 'file-saver';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import DimControls from '../components/DimControls.vue';
import VoiceBankImportDialog from '../components/VoiceBankImportDialog.vue';
import {appendCompileLog, useConfigurationStorage} from '../hooks/project';
import {canRedoReorder, canUndoReorder, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';
import {appVersionField} from '../utils/app-version';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {REDO_TITLE, UNDO_TITLE} from '../utils/undo-hotkey';
import {LARGE_DICTIONARY_WORDS, downloadLargeDictionary, largeDictionaryState, removeLargeDictionary} from '../hooks/largedictionary';
import {buildVoiceImportEntries, importVoiceEntries, voiceFields, voicesInFile} from '../utils/voice-bank';
import {useTextStringsStorage} from '../hooks/project';
import {DEFAULT_TEXT_STRINGS, processTextStringsStorageDefaults} from '../blocks/text-strings';
import {SPEAKJET_VOICE, VOICE_CONTROLS, newVoice, voiceById, voiceBytes, voiceControlValue, encodeSpeech} from '../utils/speakjet';
import {textToSpeakJetWords} from '../utils/speakjet-text';
import {builtinDictionary, downloadedDictionaryEntries, dictionaryFromFile, dictionaryToFile, dictionaryWordCount, fullDictionaryText, mergeDictionary, parseDictionaryLines, pronunciationsFor, setDictionaryWord,
  unknownDictionaryWords} from '../utils/speakjet-dictionary';
import {speakBytes, stopSpeech} from '../utils/speech-preview';

const CONTROLS = [
  {control: 'volume', label: 'Volume', hint: 'How loud the chip is (0 to 127, 96 at start).'},
  {control: 'speed', label: 'Speed', hint: 'How fast the speech is (0 to 127, 114 at start); higher is faster.'},
  {control: 'pitch', label: 'Pitch', hint: 'The pitch of the voice (0 to 255, 88 at start).'},
  {control: 'bend', label: 'Bend', hint: 'Changes the tone of the voice from deep to bright (0 to 15, 5 at start).'},
].map((entry) => ({...entry, max: SPEAKJET_VOICE[entry.control].max}));

// The Voice tab, shown while the AtariVox is on (Options tab): cards of voices (see utils/speakjet.js), kept with the text messages (state.voices).
// A message picks its voice on its card, a speech block in its field.
export default defineComponent({
  components: {ConfirmDeleteMenu, DimControls, VoiceBankImportDialog},
  setup() {
    const instance = getCurrentInstance();
    const {isCollapsed, toggleCollapsed} = useCollapsedIds('voices', false);
    const textStringsStorage = useTextStringsStorage();
    const state = computed({
      get() {
        try {
          return processTextStringsStorageDefaults(textStringsStorage);
        } catch (e) {
          console.error('Error loading text strings from local storage', e);
          return DEFAULT_TEXT_STRINGS;
        }
      },
      set(value) {
        textStringsStorage.value = value;
      },
    });
    const handleChange = () => {
      state.value = state.value;
    };
    // Selecting the cards (click; Shift+click a range, Ctrl/Cmd+click adds one) and dragging them to another place (see hooks/card-selection.js and
    // hooks/drag-reorder.js), as the cards of the other tabs. The voices keep their IDs when they move (the blocks use them): the first voice is the
    // one a block that picks none, or a voice that is gone, uses.
    const selectedCardId = ref(null);
    const {selectedCardIds, selectCard, deselectCard, idsToDelete, deleteQuestion} = useCardSelection(() => state.value.voices.map((voice) => voice.id), selectedCardId);
    const getSelectedIndices = () => state.value.voices
        .map((voice, index) => (selectedCardIds.value.includes(voice.id) ? index : -1)).filter((index) => index >= 0);
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.voices,
        (items) => {
          state.value.voices = items;
          handleChange();
          instance.proxy.$forceUpdate();
        },
        getSelectedIndices,
        // The cards are in a grid: with two or more on a row, the left or the right edge of the card under the pointer is marked.
        {sideBySide: () => {
          const list = document.querySelector('.soundfx-list');
          return !!list && getComputedStyle(list).gridTemplateColumns.split(' ').length > 1;
        }},
    );
    const setValue = (voice, control, value) => {
      voice[control] = voiceControlValue({[control]: value}, control);
      handleChange();
      instance.proxy.$forceUpdate();
    };
    const handleAdd = () => {
      const voices = state.value.voices;
      const id = (max(voices.map((voice) => Number(voice.id))) || 0) + 1;
      voices.push(newVoice(id, `Voice ${id}`));
      handleChange();
      instance.proxy.$forceUpdate();
    };
    const handleReset = (voice) => {
      VOICE_CONTROLS.forEach((control) => {
        voice[control] = SPEAKJET_VOICE[control].default;
      });
      handleChange();
      instance.proxy.$forceUpdate();
    };
    const handleDuplicate = (voice) => {
      const voices = state.value.voices;
      const id = (max(voices.map((candidate) => Number(candidate.id))) || 0) + 1;
      voices.splice(voices.indexOf(voice) + 1, 0, {...voice, id, name: `${voice.name} copy`});
      handleChange();
      instance.proxy.$forceUpdate();
    };
    // The voice of the card, or all the selected voices when it is one of several (the first voice is kept when that is all of them). The voices keep
    // their IDs: the blocks use them.
    const deleteIds = (doomed) => {
      const voices = state.value.voices;
      if (voices.length < 2) return;
      state.value.voices = voices.filter((candidate) => !doomed.includes(candidate.id));
      if (doomed.length > 1) deselectCard();
      handleChange();
      instance.proxy.$forceUpdate();
    };
    const handleDelete = (voice) => deleteIds(idsToDelete(voice.id, 1));

    // The toolbar: it acts on the selected cards (see Sound tab's toolbar).
    const configurationStorage = useConfigurationStorage();
    const selectedVoices = computed(() => state.value.voices.filter((voice) => selectedCardIds.value.includes(voice.id)));
    const selectedVoice = computed(() => state.value.voices.find((voice) => voice.id === selectedCardId.value) || selectedVoices.value[0] || null);
    const reorderCanUndo = computed(() => canUndoReorder());
    const reorderCanRedo = computed(() => canRedoReorder());
    // The developer and website from the project settings go into every exported file.
    const developerInfo = () => {
      const config = configurationStorage.value || {};
      return {
        ...(config.projectDeveloper ? {developer: config.projectDeveloper} : {}),
        ...(config.projectWebsite ? {website: config.projectWebsite} : {}),
      };
    };
    // One .vcsvox file for each selected voice, one .vcsvbnk with every voice (or the selected ones, when there are two or more).
    const handleExportSelected = () => {
      selectedVoices.value.forEach((voice) => {
        const blob = new Blob([JSON.stringify({...appVersionField(), ...developerInfo(), ...voiceFields(voice)}, null, 2)], {type: 'application/json'});
        saveAs(blob, `Voice_${(voice.name || `voice-${voice.id}`).replace(/[^A-Za-z0-9]+/g, '_')}-${getDateInfix()}.vcsvox`);
      });
    };
    const handleExportBank = () => {
      const chosen = selectedVoices.value.length > 1 ? selectedVoices.value : state.value.voices;
      const blob = new Blob([JSON.stringify({type: 'VCS Game Maker Voice Bank', ...appVersionField(), ...developerInfo(), voices: chosen.map(voiceFields)}, null, 2)],
          {type: 'application/json'});
      saveAs(blob, `VoiceBank-${getDateInfix()}.vcsvbnk`);
    };
    // A voice file replaces the name and controls of the selected voice (its ID stays, so the blocks that use it keep working).
    const handleImportIntoSelected = () => {
      const voice = selectedVoice.value;
      if (!voice) return;
      openFileDialog('.vcsvox,.vcsvbnk,.json')
          .then((file) => file.text())
          .then((text) => {
            Object.assign(voice, voiceFields(voicesInFile(JSON.parse(text))[0]));
            handleChange();
            instance.proxy.$forceUpdate();
          })
          .catch((e) => console.error('Failed to import voice', e));
    };
    // The dictionary: the words of the files imported here are kept with the project, ahead of the built-in dictionary.
    const importedWordCount = computed(() => dictionaryWordCount(state.value.dictionary));
    const clearDictionaryOpen = ref(false);

    // The section that shows the words: the words of the project over the built-in ones, searched by the word or by its sounds. Only a hundred
    // are on the page at a time (the built-in dictionary has over a thousand words).
    const dictionaryOpen = ref(false);
    const dictionarySearch = ref('');
    const dictionaryLimit = ref(100);
    const dictionaryError = ref('');
    const newWord = ref('');
    const newSounds = ref('');
    const dictionaryEntries = computed(() => {
      const project = parseDictionaryLines(state.value.dictionary);
      const built = builtinDictionary();
      const entries = [];
      project.forEach((words, word) => entries.push({word, words, project: true, builtIn: built.has(word)}));
      built.forEach((words, word) => {
        if (!project.has(word)) entries.push({word, words, project: false, builtIn: true});
      });
      return entries.sort((a, b) => (a.word < b.word ? -1 : a.word > b.word ? 1 : 0));
    });
    // Every word there is, in the order of the alphabet: those of the project and the built-in dictionary, and those of the large dictionary (when it was
    // downloaded) that they do not have.
    const allWords = computed(() => {
      const base = dictionaryEntries.value;
      if (largeDictionaryState.status !== 'ready') return base;
      const known = new Set(base.map((entry) => entry.word));
      const large = downloadedDictionaryEntries().filter(([word]) => !known.has(word)).map(([word, sounds]) => ({word, words: sounds, project: false, builtIn: false, large: true}));
      const merged = [];
      let a = 0;
      let b = 0;
      while (a < base.length || b < large.length) {
        if (b >= large.length || (a < base.length && base[a].word < large[b].word)) merged.push(base[a++]);
        else merged.push(large[b++]);
      }
      return merged;
    });
    // The words that are there without the project: the built-in ones, and those of the large dictionary once it is downloaded (a word that both have
    // is counted once, as it is in the list).
    const builtinWordCount = computed(() => allWords.value.filter((entry) => entry.builtIn || entry.large).length);
    // The words of the search (all of them when it is empty): their number is the number of words there are to find.
    const dictionaryMatches = computed(() => {
      const words = String(dictionarySearch.value || '').toLowerCase().split(/\s+/).filter(Boolean);
      if (!words.length) return allWords.value;
      return allWords.value.filter((entry) => words.every((part) => entry.word.toLowerCase().includes(part) || entry.words.toLowerCase().includes(part)));
    });
    const shownWords = computed(() => dictionaryMatches.value.slice(0, dictionaryLimit.value));
    watch(dictionarySearch, () => {
      dictionaryLimit.value = 100;
    });
    // The SpeakJet words of a new word are made as the word is typed (the way the messages of the Text tab are said), until they are typed in by hand.
    const soundsEdited = ref(false);
    watch(newWord, (word) => {
      if (soundsEdited.value && newSounds.value.trim()) return;
      const letters = String(word || '').trim();
      newSounds.value = /^[A-Za-z']+$/.test(letters) ?
        textToSpeakJetWords(letters, pronunciationsFor(state.value)).replace(/\s*PAUSE30\s*$/, '').trim() : '';
      soundsEdited.value = false;
    });
    // The buttons that put a command of the chip in the words: into the field that was used last (the new word's when none was), at the cursor.
    const speechCommands = [
      {text: 'FAST', title: 'Say the next sound faster'},
      {text: 'SLOW', title: 'Say the next sound slower'},
      {text: 'STRESS', title: 'Stress the next sound'},
      {text: 'RELAX', title: 'Relax the next sound'},
      {text: 'PAUSE30', title: 'A pause of 30 ms'},
      {text: 'PAUSE60', title: 'A pause of 60 ms'},
      {text: 'PAUSE90', title: 'A pause of 90 ms'},
      {text: 'PAUSE100', title: 'A pause of 100 ms'},
      {text: 'PAUSE200', title: 'A pause of 200 ms'},
      {text: 'PAUSE700', title: 'A pause of 700 ms'},
      ...['SPEED', 'PITCH', 'BEND', 'VOLUME'].map((control) => ({text: `${control} ${SPEAKJET_VOICE[control.toLowerCase()].default}`,
        title: `Set the ${control.toLowerCase()} from here on (0 to ${SPEAKJET_VOICE[control.toLowerCase()].max})`})),
    ];
    let lastSoundsField = null;
    const rememberSoundsField = (event, entry) => {
      lastSoundsField = {element: event.target, entry};
    };
    const handleInsertCommand = (command) => {
      let target = lastSoundsField;
      if (!target || !target.element.isConnected) target = {element: instance.proxy.$el.querySelector('.voice-dictionary-add-row .voice-dictionary-sounds input'), entry: null};
      const input = target.element;
      if (!input) return;
      const text = input.value;
      const start = input.selectionStart === null ? text.length : input.selectionStart;
      const end = input.selectionEnd === null ? text.length : input.selectionEnd;
      const before = text.slice(0, start).replace(/\s*$/, '');
      const after = text.slice(end).replace(/^\s*/, '');
      const value = `${before}${before ? ' ' : ''}${command}${after ? ' ' : ''}${after}`;
      if (target.entry) {
        handleEditWord(target.entry, value);
      } else {
        soundsEdited.value = true;
        newSounds.value = value;
      }
      // The cursor goes after the command that was put in.
      const position = before.length + (before ? 1 : 0) + command.length;
      instance.proxy.$nextTick(() => {
        const field = target.entry ? instance.proxy.$el.querySelector(`.voice-dictionary-list .voice-dictionary-sounds input[value="${value}"]`) : input;
        if (field && field.isConnected) {
          field.focus();
          field.setSelectionRange(position, position);
        }
      });
    };
    const canAddWord = computed(() => /^[A-Za-z']+$/.test(newWord.value.trim()) && !!newSounds.value.trim());
    // Stores the words of a word, if the chip has all of them (and says which it does not have when it does not).
    const storeWord = (word, words) => {
      const unknown = unknownDictionaryWords(words);
      if (unknown) {
        dictionaryError.value = `Not a SpeakJet word: ${unknown}`;
        return false;
      }
      dictionaryError.value = '';
      state.value.dictionary = setDictionaryWord(state.value.dictionary, word, words);
      handleChange();
      instance.proxy.$forceUpdate();
      return true;
    };
    const handleAddWord = () => {
      if (canAddWord.value && storeWord(newWord.value.trim(), newSounds.value.trim())) {
        soundsEdited.value = false;
        newWord.value = '';
        newSounds.value = '';
      }
    };
    const handleEditWord = (entry, value) => {
      const words = String(value || '').trim();
      if (!words || words.toUpperCase() === entry.words) return;
      storeWord(entry.word, words);
    };
    const handleRemoveWord = (entry) => {
      dictionaryError.value = '';
      state.value.dictionary = setDictionaryWord(state.value.dictionary, entry.word, '');
      handleChange();
      instance.proxy.$forceUpdate();
    };
    // Says some SpeakJet words in the first voice.
    const handleSaySounds = (words) => {
      const bytes = encodeSpeech(words).bytes;
      speakBytes([...voiceBytes(voiceById(state.value.voices, null)), ...bytes]);
    };
    const handleImportDictionary = () => {
      openFileDialog('.dic,.txt,.json')
          .then((file) => file.text())
          .then((text) => {
            const {lines, count, skipped} = dictionaryFromFile(text);
            if (!count) {
              appendCompileLog(`No words of the dictionary file could be used (${skipped} lines left out)`, 'stage');
              return;
            }
            state.value.dictionary = mergeDictionary(state.value.dictionary, lines);
            handleChange();
            instance.proxy.$forceUpdate();
            appendCompileLog(`Imported ${count} dictionary words${skipped ? ` (${skipped} lines with words the AtariVox does not know were left out)` : ''}`, 'stage');
          })
          .catch((e) => console.error('Failed to import dictionary', e));
    };
    const handleExportDictionary = () => {
      saveAs(new Blob([dictionaryToFile(fullDictionaryText(state.value.dictionary))], {type: 'text/plain'}), `Dictionary-${getDateInfix()}.Dic`);
    };
    const handleClearDictionary = () => {
      state.value.dictionary = '';
      clearDictionaryOpen.value = false;
      handleChange();
      instance.proxy.$forceUpdate();
    };
    const importOpen = ref(false);
    const importEntries = ref([]);
    // A bank file opens the picker, which says what is imported (by name, as the Sound tab's bank import).
    const handleImportBank = () => {
      openFileDialog('.vcsvox,.vcsvbnk,.json')
          .then((file) => file.text())
          .then((text) => {
            importEntries.value = buildVoiceImportEntries(JSON.parse(text), state.value.voices);
            importOpen.value = true;
          })
          .catch((e) => console.error('Failed to import voice bank', e));
    };
    const handleConfirmImport = () => {
      importVoiceEntries(state.value.voices, importEntries.value);
      handleChange();
      instance.proxy.$forceUpdate();
      importOpen.value = false;
    };

    // The toolbar grows and gains a line once the tab is scrolled, as the Sound tab's does.
    const isToolbarScrolled = ref(false);
    let scrollContainer = null;
    const handleScroll = (event) => {
      isToolbarScrolled.value = event.target.scrollTop > 0;
    };
    onMounted(() => {
      scrollContainer = instance.proxy.$el.querySelector('.editor-container');
      if (scrollContainer) scrollContainer.addEventListener('scroll', handleScroll);
    });
    const speakingId = ref(null);
    const handleSpeak = async (voice) => {
      if (speakingId.value === voice.id) {
        stopSpeech();
        return;
      }
      speakingId.value = voice.id;
      try {
        const words = textToSpeakJetWords(state.value.voicePreview, pronunciationsFor(state.value));
        await speakBytes([...voiceBytes(voice), ...encodeSpeech(words).bytes]);
      } finally {
        if (speakingId.value === voice.id) speakingId.value = null;
      }
    };
    onBeforeUnmount(() => {
      stopSpeech();
      if (scrollContainer) scrollContainer.removeEventListener('scroll', handleScroll);
    });
    return {selectedCardId, selectedCardIds, selectCard, deselectCard, dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners, state, controls: CONTROLS, handleChange, setValue, handleAdd, handleReset, handleDelete, handleDuplicate, isCollapsed, toggleCollapsed, speakingId, handleSpeak,
      deleteQuestion, selectedVoices, selectedVoice, reorderCanUndo, reorderCanRedo, tryUndoReorder, tryRedoReorder, UNDO_TITLE, REDO_TITLE,
      handleExportSelected, handleExportBank, handleImportIntoSelected, handleImportBank, handleConfirmImport, importOpen, importEntries, isToolbarScrolled, largeDictionary: largeDictionaryState, largeDictionaryWords: LARGE_DICTIONARY_WORDS, downloadLargeDictionary, removeLargeDictionary, speechCommands, rememberSoundsField, handleInsertCommand, soundsEdited, dictionaryOpen, dictionarySearch, dictionaryLimit, dictionaryError, newWord, newSounds, dictionaryMatches, shownWords, canAddWord,
      handleAddWord, handleEditWord, handleRemoveWord, handleSaySounds, importedWordCount, builtinWordCount, clearDictionaryOpen, handleImportDictionary, handleExportDictionary, handleClearDictionary};
  },
});
</script>

<style scoped>
/* The tab fills the page and scrolls by itself, so a click anywhere outside the cards reaches it and clears the selection (as on the Sound tab). */
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* The toolbar: the same sticky bar, spacing and icon colors as the Sound tab's. */
.soundfx-toolbar {
  position: sticky;
  top: 0;
  z-index: 2;
  background-color: #fff;
  padding-top: 4px;
  padding-bottom: 4px;
  margin-left: -16px;
  margin-right: -16px;
  padding-left: 16px;
  padding-right: 16px;
  /* Close under the intro text while it is not pinned, as the Music tab's toolbar is. */
  margin-top: -10px;
  transition: padding 0.15s ease;
  --toolbar-bleed: 16px;
}

.soundfx-divider {
  margin: 8px -16px;
  max-width: none;
}

.soundfx-toolbar-row {
  display: flex;
  align-items: center;
  gap: 4px;
  min-height: 28px;
}

.soundfx-toolbar-row >>> .soundfx-icon-btn-size {
  margin: 0;
}

.soundfx-toolbar-divider {
  margin: 0;
}

.soundfx-toolbar-scrolled .soundfx-divider {
  display: none;
}

.soundfx-toolbar-scrolled {
  border-bottom: 1px solid rgba(0, 0, 0, 0.24);
  padding-top: 10px;
  padding-bottom: 10px;
}

.desaturate-app-colors .soundfx-toolbar {
  background-color: #e1e1e1;
}

.soundfx-dim-section {
  padding-top: 0;
}

.soundfx-bank-btn {
  margin-left: 0 !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.soundfx-bank-btn::before {
  display: none;
}

.soundfx-bank-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

/* Disabled: dimmed like the icons of the other tabs' toolbars (see GraphicEditorToolbar.vue). */
.soundfx-bank-btn.v-btn--disabled >>> .v-icon {
  color: rgba(0, 0, 0, 0.18) !important;
}

.soundfx-bank-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.soundfx-bank-btn:active >>> .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}

.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

.soundfx-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 8px;
  margin-top: 3px;
  padding-top: 0;
  align-items: start;
}

.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}


.soundfx-card {
  position: relative;
  width: 100%;
}

.soundfx-id-badge {
  position: absolute;
  top: 10px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

.soundfx-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

.soundfx-name-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

.soundfx-name-field {
  margin-top: 20px;
  flex: 1 1 auto;
}

.soundfx-name-row >>> .color-swatch-picker-dot {
  margin-top: 41px;
  margin-left: -6px;
}

.soundfx-stop-btn,
.soundfx-play-btn {
  flex: 0 0 auto;
  background-color: transparent !important;
  box-shadow: none !important;
}

.soundfx-stop-btn::before,
.soundfx-play-btn::before {
  display: none;
}

.soundfx-stop-btn >>> .v-icon,
.soundfx-play-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.soundfx-stop-btn:hover >>> .v-icon,
.soundfx-play-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.soundfx-name-section {
  padding-bottom: 0;
  margin-bottom: -8px;
}

/* A collapsed card ends with the name row: the same 20px under its underline as under the last field of an expanded card. */
.soundfx-card-collapsed .soundfx-name-section {
  margin-bottom: -3px;
}

.soundfx-fields-section {
  padding-top: 0;
  padding-bottom: 19px;
}

.soundfx-toolbar-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  z-index: 1;
}

.soundfx-toolbar-top-right >>> .soundfx-delete-btn {
  box-shadow: none !important;
}


/* The top strip of a card is the handle to drag it by, and the marks of a card being dragged and of the place it would go (the same as the Sound tab's). */
.soundfx-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* With cards side by side the place a dragged card would go is marked on the left or the right edge of the card under the pointer. */
.drag-reorder-side-before {
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.drag-reorder-side-after {
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
}

.voice-fields {
  display: flex;
  gap: 8px;
  /* The labels as far under the name as the Sound cards' fields are (26px from the underline to the text of the label) */
  margin-top: 18px;
}

.voice-field {
  flex: 1 1 0;
  min-width: 0;
  margin-top: 0;
  padding-top: 0;
}

/* 16px from the line of the field to the line under it, as far as the field is from the left edge (the room under it for hints is taken back). */
.voice-preview-field {
  margin-bottom: -14px;
}

/* Lines above and below the section across the full width, as the Text tab's Text Minikernel Font Editor has. */
.voice-dictionary-divider {
  margin: 8px -16px;
  max-width: none;
}

.voice-dictionary-divider-bottom {
  margin-bottom: 16px;
}

.voice-dictionary-section {
  margin: 8px 0;
}

.voice-dictionary-header {
  display: flex;
  align-items: center;
  margin-left: -8px;
}

.voice-dictionary {
  margin-bottom: 16px;
}

.voice-dictionary-large {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  font-size: 12px;
  margin-top: 4px;
}

.voice-dictionary-commands {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-top: 8px;
}

/* On a line by itself: the buttons start on the next one. */
.voice-dictionary-commands-label {
  flex: 0 0 100%;
  font-size: 12px;
  /* The color of the label of a field. */
  color: rgba(0, 0, 0, 0.6);
}

.voice-dictionary-command {
  padding: 0 8px !important;
}

.voice-dictionary-search-row,
.voice-dictionary-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.voice-dictionary-search-row {
  margin-top: 12px;
  margin-bottom: 18px;
}

.voice-dictionary-add-row {
  margin-bottom: 6px;
}

.voice-dictionary-search {
  max-width: 320px;
}

.voice-dictionary-matches {
  font-size: 12px;
  opacity: 0.7;
}

.voice-dictionary-row {
  min-height: 34px;
}

.voice-dictionary-word {
  flex: 0 0 160px;
  min-width: 0;
  margin-top: 0;
  padding-top: 0;
}

.voice-dictionary-name {
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
}

.voice-dictionary-row .v-btn {
  flex: 0 0 26px;
  margin: 0;
}

.voice-dictionary-sounds {
  flex: 1 1 0;
  min-width: 0;
  margin-top: 0;
  padding-top: 0;
}

.voice-dictionary-sounds-project {
  font-weight: 500;
}

.voice-dictionary-spacer {
  flex: 0 0 26px;
}

.voice-dictionary-error {
  color: #b00020;
  font-size: 12px;
  margin: 4px 0;
}

.voice-dictionary-list {
  max-height: 320px;
  overflow-x: hidden;
  overflow-y: auto;
}

.voice-dictionary-more {
  margin-top: 8px;
}

.voice-dictionary-count {
  font-size: 12px;
  line-height: 14px;
  color: rgba(0, 0, 0, 0.6);
  margin-left: 8px;
}

.add-voice-button {
  bottom: 8px;
}
</style>
