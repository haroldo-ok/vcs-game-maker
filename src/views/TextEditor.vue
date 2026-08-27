<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Text</v-card-title>
      <v-card-text>
        <p class="v-messages theme--light v-messages__message">
          Define named messages here, then display one at runtime with either the "Show text"
          block (pick from a list) or "Show text ID" (pick by the number shown below - useful
          for choosing a message from a variable). A-Z, 0-9, and basic punctuation only -
          unsupported characters and shorter text are padded with spaces. Use the "(scrolling)"
          versions of the "Show text" blocks to reveal a message longer than 12 characters by
          scrolling through it - the max display width below does not apply to those.
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

        <div class="text-max-width-row">
          <v-select
            v-model="textMaxDisplayWidth"
            :items="TEXT_MAX_DISPLAY_WIDTH_OPTIONS"
            label="Max characters to display at once"
            hide-details
            class="text-max-width-field"
          />
          <v-switch
            v-model="textColumns"
            label="Columns"
            title="Lay text cards out in multiple columns when there's room, instead of one full-width column."
            hide-details
            class="text-columns-switch"
          />
        </div>
        <p class="v-messages theme--light v-messages__message">
          For static (non-scrolling) text only. Only the first this-many of the 12 available character
          slots are ever used - the rest always stay blank, regardless of message length or justify. The
          "Scroll text" blocks ignore this and always scroll through the full message using
          all 12 character slots.
        </p>

        <v-list class="text-list" :class="{'text-list--single-column': !textColumns}">
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
                <div class="text-id-badge" title="The number to use with &quot;Show text ID&quot; - stays the same no matter how cards are rearranged below.">
                  ID:{{ entry.id }}
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
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {CSS_CLASS_DRAGGING} from '../hooks/drag-reorder';
import {useConfigurationStorage, useTextStringsStorage, useTextColumnsStorage} from '../hooks/project';
import {DEFAULT_TEXT_JUSTIFY, DEFAULT_TEXT_STRINGS, DEFAULT_TEXT_MAX_DISPLAY_WIDTH,
  TEXT_MAX_DISPLAY_WIDTH_OPTIONS, processTextStringsStorageDefaults} from '../blocks/text-strings';

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

    // How many of the Text Minikernel's own 12 physical character positions
    // this project actually uses - see TEXT_MAX_DISPLAY_WIDTH_OPTIONS' own
    // comment in blocks/text-strings.js for why this is compile-time only
    // (never a runtime-settable block) and why a narrower setting only
    // blanks the unused tail rather than shrinking storage. Same
    // project-wide, Configuration-storage-backed pattern as textBkColor
    // just above.
    const textColumns = useTextColumnsStorage();
    const textMaxDisplayWidth = computed({
      get() {
        try {
          const value = (configurationStorage.value || {}).textMaxDisplayWidth;
          return value == null ? DEFAULT_TEXT_MAX_DISPLAY_WIDTH : value;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return DEFAULT_TEXT_MAX_DISPLAY_WIDTH;
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          textMaxDisplayWidth: value,
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

    const {isCollapsed, toggleCollapsed, ensureExpanded} = useCollapsedIds('text');

    // Card reordering - NOT built on hooks/drag-reorder.js's own
    // useDragReorder (used as-is by SoundFXEditor.vue/MusicEditor.vue's own
    // single-column card lists), since that hook's own top-border
    // drag-over convention only makes sense for a strictly vertical stack.
    // .text-list is a CSS grid (see its own comment - two or more cards can
    // sit side by side on a wide enough window), where the meaningful
    // drop-target edge is left/right (which card this lands before/after in
    // reading order), not top/bottom - confirmed directly as a real gap
    // otherwise: the shared hook's top-border highlight only ever offered
    // "insert above," with no way to drop a card at the END of a row or
    // between two cards sharing that row.
    const draggedEntryIndex = ref(null);
    // {index, side} - side is 'before' or 'after', which HALF of card
    // `index` the pointer is currently over - same halfway-point
    // convention MusicEditor.vue's own dragOverSideFor/DataEditor.vue's
    // own valueRowListeners already use for their identical grid-drop
    // problem.
    const dragOverEntry = ref(null);
    const isEntryDragging = (index) => draggedEntryIndex.value === index;
    const isEntryDragOver = (index) =>
      !!dragOverEntry.value && dragOverEntry.value.index === index && !isEntryDragging(index);
    const entryDragOverSide = (index) => (isEntryDragOver(index) ? dragOverEntry.value.side : null);
    const dragCardClass = (index) => ({
      [CSS_CLASS_DRAGGING]: isEntryDragging(index),
      'text-card-drag-over-before': entryDragOverSide(index) === 'before',
      'text-card-drag-over-after': entryDragOverSide(index) === 'after',
    });
    const dragOverSideFor = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    };
    const dragAttrs = () => ({draggable: true});
    const dragHandleListeners = (index) => ({
      dragstart: (event) => {
        draggedEntryIndex.value = index;
        event.dataTransfer.effectAllowed = 'move';
        // Same Firefox requirement as hooks/drag-reorder.js's own
        // dragHandleListeners - the value itself is never read back.
        event.dataTransfer.setData('text/plain', String(index));
      },
      dragend: () => {
        draggedEntryIndex.value = null;
        dragOverEntry.value = null;
      },
    });
    const dragTargetListeners = (index) => ({
      dragover: (event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        const side = dragOverSideFor(event);
        const current = dragOverEntry.value;
        if (!current || current.index !== index || current.side !== side) {
          dragOverEntry.value = {index, side};
        }
      },
      dragleave: (event) => {
        if (event.currentTarget.contains(event.relatedTarget)) return;
        if (isEntryDragOver(index) || isEntryDragging(index)) dragOverEntry.value = null;
      },
      drop: (event) => {
        event.preventDefault();
        const from = draggedEntryIndex.value;
        draggedEntryIndex.value = null;
        dragOverEntry.value = null;
        if (from == null || from === index) return;
        // Computed fresh off the actual drop event's own pointer position -
        // see MusicEditor.vue's own sequenceChipListeners drop handler for
        // why this isn't just read back off dragOverEntry instead.
        const side = dragOverSideFor(event);
        let insertAt = side === 'after' ? index + 1 : index;
        if (from < insertAt) insertAt--;
        if (insertAt === from) return;
        const items = state.value.textStrings.slice();
        const [moved] = items.splice(from, 1);
        items.splice(insertAt, 0, moved);
        state.value.textStrings = items;
        handleChildChange();
      },
    });

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
      ensureExpanded(newEntry);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteEntry = (entry) => {
      if (state.value.textStrings.length <= 1) return;
      state.value.textStrings = state.value.textStrings.filter(({id}) => id != entry.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // No longer clamped to TEXT_MESSAGE_LENGTH (12) characters here - a
    // message longer than the project's own configured max display width
    // (see textMaxDisplayWidth below) now scrolls to show the rest instead
    // of being cut off (see encodeTextMessage in generators/bbasic/
    // text-minikernel.js), so there's no reason to stop the user from
    // typing more than that.
    const handleTextChange = (entry) => {
      entry.text = String(entry.text || '');
      handleChildChange();
    };

    return {
      state, handleChildChange, handleAddEntry, handleDeleteEntry, handleTextChange,
      isCollapsed, toggleCollapsed, textBkColor, textMaxDisplayWidth, TEXT_MAX_DISPLAY_WIDTH_OPTIONS,
      textColumns,
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

/* v-list-item's own default 0 16px padding stacks on top of v-card-text's,
   pushing the message card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. Zeroing both sides
   (not just left, as this used to) matches the Player/Data/Background tabs'
   own identical fix - the unzeroed right padding was otherwise most visible
   on the last column of .text-list's grid, sitting further from the tab's
   right edge than the left column sits from the left edge. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

.text-bkcolor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 16px;
}

.text-max-width-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.text-max-width-field {
  max-width: 320px;
  /* Matches SoundFXEditor.vue's own .soundfx-filter margin-top - without
     it, this field and .soundfx-filter sit on different baselines, and
     .text-columns-switch's own offset (tuned to match .soundfx-filter's
     row) ends up too low relative to this field specifically. */
  margin-top: 8px;
}

/* Same margin-top/padding-top override as SoundFXEditor.vue's own
   .soundfx-columns-switch - Vuetify's own selection-control margin-top
   (meant for stacking below other fields) otherwise pushes this out of
   line with the select next to it. */
.text-columns-switch {
  flex: 0 0 auto;
  margin-top: 8px !important;
  padding-top: 0 !important;
}

/* A 12-character message doesn't need anywhere near .text-list's own full
   column width (previously capped at 640px, sized for that) - grid instead
   of the v-list's normal single-column stacking, so two (or more, on a wide
   enough window) fit side by side instead of each wasting most of a full
   row's width. */
.text-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 8px;
  /* Grid items stretch to fill their row's height by default - a collapsed
     card next to an expanded one in the same row would otherwise stretch
     tall to match it, instead of sitting flush at the top like its card
     content actually sizes to. */
  align-items: start;
  /* Matches BackgroundEditor.vue's own .background-list - restores the
     space above the FIRST row that zeroing v-list-item__content's own
     top padding below removes. */
  margin-top: 12px;
}

/* Single full-width column instead of the grid .text-list defaults to
   above - toggled via the "Columns" switch next to the max-width field.
   Same shape as SoundFXEditor.vue's own .soundfx-list--single-column. */
.text-list--single-column {
  display: flex;
  flex-direction: column;
}

/* Grid stretches each item to fill its own column width automatically -
   flex doesn't do that for .entry-list-item (Vuetify's own v-list-item, the
   actual flex child) on its own, leaving .text-card's own width: 100% only
   filling 100% of that un-stretched item instead of the whole row. Same
   fix as SoundFXEditor.vue's own equivalent rule. */
.text-list--single-column .entry-list-item {
  width: 100%;
}

/* v-list-item__content's default 12px top/bottom padding was adding extra
   space between grid ROWS on top of this grid's own 8px gap (same issue as
   BackgroundEditor.vue's own .background-list, see its comment there),
   without anything similar between columns - zeroing it here keeps this
   grid's own gap as the only source of spacing, matching the Background
   tab's spacing exactly. */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
}

.text-card {
  position: relative;
  width: 100%;
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

/* hooks/drag-reorder.js's own CSS_CLASS_DRAGGING (see its comment for why
   this lives per-tab instead of globally) - faded so the card being moved
   reads as "lifted" rather than duplicated. */
.drag-reorder-dragging {
  opacity: 0.4;
}

/* Which side of THIS card a dragged one would land on (see
   entryDragOverSide/dragOverSideFor) - left/right, not hooks/
   drag-reorder.js's own top-border convention, since .text-list is a CSS
   grid that can put more than one card on the same row (see its own
   comment) - left/right is what actually reflects reading-order position
   within it. */
.text-card-drag-over-before {
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.text-card-drag-over-after {
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
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
  top: 2px !important;
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
  top: 10px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same margin-top as the SoundFX tab's .soundfx-name-field, for consistent
   badge-to-name spacing across every tab. */
.text-name-field {
  margin-top: 20px;
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
