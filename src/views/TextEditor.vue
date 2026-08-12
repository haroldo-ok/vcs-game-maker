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

        <div class="text-bkcolor-row">
          <color-swatch-picker
            :value="textBkColor"
            :allow-clear="false"
            title="Click to set the Text Minikernel's own message background color"
            @input="(byte) => (textBkColor = byte)"
          />
          <span class="text-bkcolor-label">Text background color</span>
        </div>

        <v-list>
          <v-list-item class="entry-list-item" v-for="(entry, index) in state.textStrings" v-bind:key="entry.id">
            <v-list-item-content>
              <v-card
                outlined
                class="text-card"
                :class="dragCardClass(index)"
                v-on="dragTargetListeners(index)"
              >
                <div
                  class="text-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
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
                <div class="text-id-badge" title="The number to use with &quot;Show text with ID&quot; - stays the same no matter how cards are rearranged below.">
                  ID: {{ entry.id }}
                </div>
                <v-menu
                  v-if="state.textStrings.length > 1"
                  top
                >
                  <template v-slot:activator="{ on, attrs }">
                    <v-btn
                      title="Delete this message"
                      icon
                      small
                      absolute
                      top
                      right
                      class="text-delete-btn delete-icon-btn text-icon-btn-size"
                      v-bind="attrs"
                      v-on="on"
                    >
                      <v-icon>mdi-delete</v-icon>
                    </v-btn>
                  </template>

                  <v-card>
                    <v-card-title>Delete this message?</v-card-title>
                    <v-list>
                      <v-list-item @click="handleDeleteEntry(entry)">
                        <v-list-item-icon>
                          <v-icon>mdi-check</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>Yes, delete</v-list-item-title>
                      </v-list-item>
                      <v-list-item>
                        <v-list-item-icon>
                          <v-icon>mdi-cancel</v-icon>
                        </v-list-item-icon>
                        <v-list-item-title>No, don't delete</v-list-item-title>
                      </v-list-item>
                    </v-list>
                  </v-card>
                </v-menu>

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
                  <v-btn-toggle
                    v-model="entry.justify"
                    mandatory
                    dense
                    class="text-justify-toggle"
                    @change="handleChildChange"
                  >
                    <v-btn value="left" small title="Left-justified: pads the message with spaces on the right.">
                      <v-icon small>mdi-format-align-left</v-icon>
                    </v-btn>
                    <v-btn value="center" small title="Centered: pads the message with spaces on both sides.">
                      <v-icon small>mdi-format-align-center</v-icon>
                    </v-btn>
                    <v-btn value="right" small title="Right-justified: pads the message with spaces on the left.">
                      <v-icon small>mdi-format-align-right</v-icon>
                    </v-btn>
                  </v-btn-toggle>
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

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useConfigurationStorage, useTextStringsStorage} from '../hooks/project';
import {DEFAULT_TEXT_JUSTIFY, DEFAULT_TEXT_STRINGS, TEXT_MESSAGE_LENGTH,
  processTextStringsStorageDefaults} from '../blocks/text-strings';

export default defineComponent({
  components: {ColorSwatchPicker},
  setup() {
    const textStringsStorage = useTextStringsStorage();
    const configurationStorage = useConfigurationStorage();

    // The Text Minikernel's own message background color (the "textbkcolor"
    // const - see generators/bbasic.js's generateConfiguration) - a single
    // project-wide setting stored alongside the rest of Configuration.vue's
    // own options, not per-message, since only one Text Minikernel instance
    // can ever be active in a project. Defaults to black (0), matching the
    // same "?? 0" fallback generateConfiguration itself uses (and what
    // text12a.asm's own ifnconst fallback already defaults to).
    const textBkColor = computed({
      get() {
        try {
          const value = (configurationStorage.value || {}).textBkColor;
          return value == null ? 0 : value;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return 0;
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          textBkColor: value,
        };
      },
    });

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

    const {isCollapsed, toggleCollapsed} = useCollapsedIds('text');

    // Card reordering (see hooks/drag-reorder.js's own comment - built to
    // be reused by other tabs' card lists later, not just this one).
    // getItems/setItems both go through the SAME state.value.textStrings/
    // handleChildChange path every other mutation here already uses, so a
    // drop is persisted and re-rendered exactly like an add/delete.
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.textStrings,
        (items) => {
          state.value.textStrings = items;
          handleChildChange();
        },
    );

    const instance = getCurrentInstance();
    const handleAddEntry = () => {
      const textStrings = state.value.textStrings;
      const maxId = max(textStrings.map((o) => o.id)) || 0;
      const newEntry = {
        id: maxId + 1,
        name: `Message ${maxId + 1}`,
        text: '',
        justify: DEFAULT_TEXT_JUSTIFY,
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
      isCollapsed, toggleCollapsed, textBkColor,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners,
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

.text-bkcolor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.text-card {
  position: relative;
  width: 100%;
  max-width: 640px;
}

/* Only this top strip is actually draggable (see hooks/drag-reorder.js's
   own comment on why) - covers the same header band the collapse/ID/delete
   controls already occupy. Sits behind them (they're later in DOM order,
   so they paint on top and stay clickable) but in front of everything
   else, so a click-and-drag gesture anywhere else in the card - the name/
   text fields especially - still selects text instead of starting a drag. */
.text-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* hooks/drag-reorder.js's own two feedback classes - see its comment for
   why these live per-tab instead of globally. Dragging: faded so the card
   being moved reads as "lifted" rather than duplicated. Drag-over: a top
   border on whichever OTHER card the dragged one is currently over, giving
   a clear "it'll land here" indicator without needing to animate the whole
   list into its post-drop order as you drag. */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Vuetify's fab+absolute+top combo centers the button on the card's top
   edge, poking half of it out (and clipped there); pull it down so the whole
   button sits inside the card instead. */
.text-delete-btn {
  top: 8px !important;
  right: 8px !important;
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

/* Same icon/button sizing as the Player Sprite tab's own toolbar icons
   (PixelEditor.vue's .pixel-editor-tools rules) - size only, no colour
   changes, so .delete-icon-btn's red-on-hover convention is untouched. */
.text-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

.text-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
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

.text-justify-toggle {
  margin-top: 8px;
}

.add-text-button {
  bottom: 8px;
}
</style>
