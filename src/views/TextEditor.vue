<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Text</v-card-title>
      <v-card-text>
        <p class="text-hint">
          Define named messages here, then display one at runtime with either the "Show text"
          block (pick from a list) or "Show text with ID" (pick by the number shown below - useful
          for choosing a message from a variable). Up to 12 characters (A-Z, 0-9, and basic
          punctuation) - longer text is cut off, unsupported characters and shorter text are padded
          with spaces.
        </p>

        <v-list>
          <v-list-item class="entry-list-item" v-for="(entry, index) in state.textStrings" v-bind:key="entry.id">
            <v-list-item-content>
              <v-card outlined class="text-card">
                <v-btn
                  :title="isCollapsed(entry) ? 'Expand this message' : 'Collapse this message'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="text-collapse-btn"
                  @click="() => toggleCollapsed(entry)"
                >
                  <v-icon>{{ isCollapsed(entry) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="text-id-badge" title="The number to use with &quot;Show text with ID&quot;">
                  ID: {{ index + 1 }}
                </div>
                <v-btn
                  title="Delete this message"
                  icon
                  small
                  absolute
                  top
                  right
                  class="text-delete-btn delete-icon-btn"
                  :disabled="state.textStrings.length <= 1"
                  @click="() => handleDeleteEntry(entry)"
                >
                  <v-icon>mdi-delete</v-icon>
                </v-btn>

                <v-card-text class="text-name-section">
                  <v-text-field
                    class="text-name-field"
                    label="Name"
                    v-model="entry.name"
                    @change="handleChildChange"
                  />
                </v-card-text>

                <v-card-text v-if="!isCollapsed(entry)" class="text-message-section">
                  <v-text-field
                    label="Text"
                    v-model="entry.text"
                    maxlength="12"
                    counter="12"
                    @change="() => handleTextChange(entry)"
                  />
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-text-button"
      color="primary"
      title="Add text message"
      dark
      absolute
      right
      fab
      @click="handleAddEntry"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';

import {useTextStringsStorage} from '../hooks/project';
import {DEFAULT_TEXT_STRINGS, TEXT_MESSAGE_LENGTH, processTextStringsStorageDefaults} from '../blocks/text-strings';

export default defineComponent({
  setup() {
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

      set(newState) {
        textStringsStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    // Purely a view preference - which cards are collapsed has no bearing on
    // the generated game, so it lives in local component state rather than
    // the saved project data. Reassigning the whole object (rather than
    // mutating a reactive({}) in place) - adding a brand new key to a plain
    // reactive object isn't reliably tracked in Vue 2, and every entry's ID
    // is a new key here the first time it's ever collapsed.
    const collapsedIds = ref({});
    const isCollapsed = (entry) => !!collapsedIds.value[entry.id];
    const toggleCollapsed = (entry) => {
      collapsedIds.value = {
        ...collapsedIds.value,
        [entry.id]: !collapsedIds.value[entry.id],
      };
    };

    const instance = getCurrentInstance();
    const handleAddEntry = () => {
      const textStrings = state.value.textStrings;
      const maxId = max(textStrings.map((o) => o.id)) || 0;
      const newEntry = {
        id: maxId + 1,
        name: `Message ${maxId + 1}`,
        text: '',
      };

      state.value.textStrings.push(newEntry);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteEntry = (entry) => {
      if (state.value.textStrings.length <= 1) return;
      state.value.textStrings = state.value.textStrings.filter(({id}) => id != entry.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleTextChange = (entry) => {
      entry.text = String(entry.text || '').slice(0, TEXT_MESSAGE_LENGTH);
      handleChildChange();
    };

    return {
      state, handleChildChange, handleAddEntry, handleDeleteEntry, handleTextChange,
      isCollapsed, toggleCollapsed,
    };
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* v-list-item's own default left padding stacks on top of v-card-text's,
   pushing the message card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. */
.entry-list-item {
  padding-left: 0;
}

.text-hint {
  opacity: 0.7;
  max-width: 640px;
}

.text-card {
  position: relative;
  width: 100%;
  max-width: 640px;
}

/* Vuetify's fab+absolute+top combo centers the button on the card's top
   edge, poking half of it out (and clipped there); pull it down so the whole
   button sits inside the card instead. */
.text-delete-btn {
  top: 8px !important;
  box-shadow: none !important;
}

/* Same top-edge fix as .text-delete-btn, positioned at the opposite corner -
   a smaller top offset than .text-delete-btn's, since this one has to line
   up against .text-id-badge's own text baseline right next to it, not just
   sit inside the card. */
.text-collapse-btn {
  top: 0 !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Shifted right to clear .text-collapse-btn, which now sits in the same
   row to its left. */
.text-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same 12px reserved below the badge as the SoundFX tab's
   .soundfx-name-field. */
.text-name-field {
  margin-top: 12px;
}

/* Split from the rest of the card's content (text-message-section) so the
   name field can stay visible while collapsed - v-card-text's own default
   padding-bottom would otherwise open a gap between them that the original,
   single v-card-text never had. */
.text-name-section {
  padding-bottom: 0;
}

.text-message-section {
  padding-top: 0;
}

.add-text-button {
  bottom: 8px;
}
</style>
