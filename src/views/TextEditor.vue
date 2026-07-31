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

                <v-card-text>
                  <v-text-field
                    label="Name"
                    v-model="entry.name"
                    @change="handleChildChange"
                  />

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
import {computed, defineComponent, getCurrentInstance} from '@vue/composition-api';
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

.text-id-badge {
  position: absolute;
  top: 8px;
  left: 16px;
  font-size: 0.75em;
  font-family: monospace;
  opacity: 0.6;
}

.add-text-button {
  bottom: 8px;
}
</style>
