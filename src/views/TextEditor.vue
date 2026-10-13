<template>
  <div>
    <v-card class="editor-container" :ripple="false" @click="deselectCard">
      <v-card-title>Text</v-card-title>
      <v-card-text class="tab-intro-section">
        <p class="v-messages theme--light v-messages__message text-intro-paragraph">
          Define text blocks here, then display them at runtime with either the "Show text"
          block (pick from a list) or "Show text ID" - useful for choosing a message from a
          variable. A-Z, 0-9, and basic punctuation only. Unsupported characters and shorter
          text are padded with spaces. Use the "(scrolling)" versions of the "Show text" blocks
          to reveal a message longer than 12 characters by scrolling through it, or turn on a
          message's "Multiline" for word-wrap onto a second static line instead.
        </p>

        <div class="text-bkcolor-row tight-under-intro">
          <color-swatch-picker
            :value="textBkColor"
            :allow-clear="false"
            square
            title="Click to set the Text Minikernel's message background color"
            @input="(byte) => (textBkColor = byte)"
          />
          <span class="text-bkcolor-label">Text background color</span>
          <v-switch
            v-model="enableTextScrollCursor"
            label="Show a scroll cursor"
            title="Shows a small indicator (edit its shape in the Text Minikernel Font card below) right after whichever row is currently the last one visible, but only while there's more of the message left to reveal with &quot;Scroll text lines down&quot;. Costs a few extra scanlines whenever this is on, regardless of whether any particular message actually needs it."
            hide-details
            class="text-scroll-cursor-switch"
          />
          <v-select
            v-if="enableTextScrollCursor"
            v-model="textScrollCursorBlinkSpeed"
            :items="BLINK_SPEED_OPTIONS"
            item-text="text"
            item-value="value"
            title="How often the cursor blinks off - always a power of 2 number of frames (a single framecounter bit), or Never for a steady, non-blinking cursor"
            label="Blink speed"
            hide-details
            class="text-blink-speed-field"
          />
        </div>

        <text-font-editor />

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
        <p class="v-messages theme--light v-messages__message text-max-width-help">
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
                :ripple="false"
                class="text-card"
                :class="[dragCardClass(index), {'text-card-selected': selectedCardIds.includes(entry.id)}]"
                v-on="dragTargetListeners(index)"
                @click.stop="selectCard(entry.id, $event)"
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
                <confirm-delete-menu
                  v-if="state.textStrings.length > 1"
                  :title="deleteQuestion(entry.id, 'message', 1)"
                  :selected="entry.id === selectedCardId && selectedCardIds.includes(entry.id)"
                  :activator-title="deleteQuestion(entry.id, 'message', 1).replace('?', '')"
                  icon-btn-class="text-delete-btn text-icon-btn-size"
                  absolute
                  top
                  right
                  @confirm="handleDeleteEntry(entry)"
                />

                <v-card-text class="text-name-section">
                  <v-text-field
                    class="text-name-field"
                    label="Name"
                    v-model="entry.name"
                    hide-details
                    @change="handleChildChange"
                  />
                </v-card-text>

                <v-card-text v-if="!isCollapsed(entry)" class="text-message-section">
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
                  <v-textarea
                    label="Text"
                    v-model="entry.text"
                    :counter="entry.wrapToLine2 ? TEXT_CARD_MAX_LENGTH : 12"
                    :maxlength="TEXT_CARD_MAX_LENGTH"
                    outlined
                    rows="2"
                    :hint="`Press Enter for a line break. More than 2 lines (or no room for a 2nd - see &quot;Multiline&quot; below): use the &quot;Scroll text lines&quot; blocks to move through them at runtime. ${TEXT_CARD_MAX_LENGTH} characters max.`"
                    persistent-hint
                    @change="() => handleTextChange(entry)"
                  />
                  <v-switch
                    v-model="entry.wrapToLine2"
                    label="Multiline"
                    title="When this message is longer than 12 characters, shows its second line automatically underneath the first, with no scrolling needed. Off (or for a message with more than 2 lines), only the first line shows until a &quot;Scroll text lines&quot; block is used to reveal the rest. Only the plain &quot;Show text&quot; blocks support this - the &quot;(scrolling)&quot; blocks always scroll a single line and ignore it."
                    hide-details
                    class="text-wrap-switch"
                    @change="handleChildChange"
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
import {computed, defineComponent, getCurrentInstance, onBeforeUnmount, onMounted, ref} from '@vue/composition-api';
import {max} from 'lodash';

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import ConfirmDeleteMenu from '../components/ConfirmDeleteMenu.vue';
import TextFontEditor from '../components/TextFontEditor.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {recordReorder, sameItems, tryRedoReorder, tryUndoReorder} from '../hooks/reorder-history';
import {undoRedoKind} from '../utils/undo-hotkey';
import {CSS_CLASS_DRAGGING, dragGroupFor, moveCards} from '../hooks/drag-reorder';
import {useCardSelection} from '../hooks/card-selection';
import {useConfigurationStorage, useTextStringsStorage, useTextColumnsStorage} from '../hooks/project';
import {DEFAULT_TEXT_JUSTIFY, DEFAULT_TEXT_STRINGS, DEFAULT_TEXT_MAX_DISPLAY_WIDTH,
  TEXT_MAX_DISPLAY_WIDTH_OPTIONS, TEXT_CARD_MAX_LENGTH,
  processTextStringsStorageDefaults} from '../blocks/text-strings';
import {BLINK_SPEED_OPTIONS, DEFAULT_BLINK_SPEED} from '../utils/text-font';

export default defineComponent({
  components: {ColorSwatchPicker, ConfirmDeleteMenu, TextFontEditor},
  setup() {
    const textStringsStorage = useTextStringsStorage();
    const configurationStorage = useConfigurationStorage();

    // The Text Minikernel's  message background color (the "textbkcolor"
    // const - see generators/bbasic.js's generateConfiguration) - a single
    // project-wide setting stored alongside the rest of Configuration.vue's
    // options, not per-message, since only one Text Minikernel instance
    // can ever be active in a project. Defaults to black (0), matching the
    // same "?? 0" fallback generateConfiguration itself uses (and what
    // text12a.asm's  ifnconst fallback already defaults to).
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

    // Whether text12b.asm's "more below" scroll cursor is compiled in at
    // all (see generators/bbasic.js's  buildRom-time
    // buildTextScrollCursorOverride splice, gated on this same field) - a
    // single project-wide toggle, same reasoning/pattern as textBkColor
    // just above.
    const enableTextScrollCursor = computed({
      get() {
        try {
          return !!(configurationStorage.value || {}).enableTextScrollCursor;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return false;
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          enableTextScrollCursor: value,
        };
      },
    });

    // The scroll cursor's  blink speed (see BLINK_SPEED_OPTIONS/
    // resolveBlinkMask in utils/text-font.js) - only meaningful (and only
    // shown, see the template above) while enableTextScrollCursor is on.
    const textScrollCursorBlinkSpeed = computed({
      get() {
        try {
          const value = (configurationStorage.value || {}).textScrollCursorBlinkSpeed;
          return value == null ? DEFAULT_BLINK_SPEED : value;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return DEFAULT_BLINK_SPEED;
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          textScrollCursorBlinkSpeed: value,
        };
      },
    });

    // How many of the Text Minikernel's  12 physical character positions
    // this project actually uses - see TEXT_MAX_DISPLAY_WIDTH_OPTIONS'
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

    // Purely a visual "which card am I looking at" marker - same
    // selectCard/selectedCardId/deselectCard pattern as MusicEditor.vue's
    // song cards and SoundFXEditor.vue's  sound effect cards (see
    // MusicEditor.vue's  comment for the full reasoning): plain local
    // component state, not persisted, not wired into anything else.
    // Shift+click selects a range, Ctrl/Cmd+click adds or removes a card (see hooks/card-selection.js): deleting or
    // dragging one of several selected cards does it to all of them.
    const selectedCardId = ref(null);
    const {selectedCardIds, selectCard, deselectCard, getSelectedIndices, idsToDelete, deleteQuestion} = useCardSelection(
        () => state.value.textStrings.map(({id}) => id), selectedCardId);

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

    // Every card starts collapsed on every visit to this tab (see
    // collapseAll's  comment in hooks/collapse.js), not just ones never
    // expanded before.
    const {isCollapsed, toggleCollapsed, ensureExpanded, collapseAll} = useCollapsedIds('text', true);
    collapseAll();

    // Card reordering - NOT built on hooks/drag-reorder.js's
    // useDragReorder (used as-is by SoundFXEditor.vue/MusicEditor.vue's
    // single-column card lists), since that hook's  top-border
    // drag-over convention only makes sense for a strictly vertical stack.
    // .text-list is a CSS grid (see its  comment - two or more cards can
    // sit side by side on a wide enough window), where the meaningful
    // drop-target edge is left/right (which card this lands before/after in
    // reading order), not top/bottom - confirmed directly as a real gap
    // otherwise: the shared hook's top-border highlight only ever offered
    // "insert above," with no way to drop a card at the END of a row or
    // between two cards sharing that row.
    const draggedEntryIndex = ref(null);
    // Every card being dragged: the selected ones when the one dragged is one of them.
    const draggedGroup = ref([]);
    // {index, side} - side is 'before' or 'after', which HALF of card
    // `index` the pointer is currently over - same halfway-point
    // convention MusicEditor.vue's  dragOverSideFor/DataEditor.vue's
    // valueRowListeners already use for their identical grid-drop
    // problem.
    const dragOverEntry = ref(null);
    const isEntryDragging = (index) => draggedEntryIndex.value === index || draggedGroup.value.includes(index);
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
        draggedGroup.value = dragGroupFor(index, getSelectedIndices());
        event.dataTransfer.effectAllowed = 'move';
        // Same Firefox requirement as hooks/drag-reorder.js's
        // dragHandleListeners - the value itself is never read back.
        event.dataTransfer.setData('text/plain', String(index));
      },
      dragend: () => {
        draggedEntryIndex.value = null;
        draggedGroup.value = [];
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
        const group = draggedGroup.value.length ? draggedGroup.value : [from];
        draggedEntryIndex.value = null;
        draggedGroup.value = [];
        dragOverEntry.value = null;
        if (from == null || group.includes(index)) return;
        // Computed fresh off the actual drop event's  pointer position -
        // see MusicEditor.vue's  sequenceChipListeners drop handler for
        // why this isn't just read back off dragOverEntry instead.
        const side = dragOverSideFor(event);
        const insertAt = side === 'after' ? index + 1 : index;
        const before = state.value.textStrings.slice();
        const items = moveCards(before, group, insertAt);
        if (sameItems(items, before)) return;
        state.value.textStrings = items;
        handleChildChange();
        const after = items.slice();
        const restore = (order) => {
          state.value.textStrings = order.slice();
          handleChildChange();
        };
        recordReorder({
          undo: () => restore(before),
          redo: () => restore(after),
          isCurrent: () => sameItems(state.value.textStrings, after),
        });
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
        wrapToLine2: false,
      };

      state.value.textStrings.push(newEntry);
      ensureExpanded(newEntry);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteEntry = (entry) => {
      if (state.value.textStrings.length <= 1) return;
      const doomed = idsToDelete(entry.id, 1);
      state.value.textStrings = state.value.textStrings.filter(({id}) => !doomed.includes(id));
      if (doomed.length > 1) deselectCard();
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // No longer clamped to TEXT_MESSAGE_LENGTH (12) characters here - a
    // message longer than the project's  configured max display width
    // (see textMaxDisplayWidth below) now scrolls to show the rest instead
    // of being cut off (see encodeTextMessage in generators/bbasic/
    // text-minikernel.js), so there's no reason to stop the user from
    // typing more than that.
    const handleTextChange = (entry) => {
      entry.text = String(entry.text || '');
      handleChildChange();
    };

    // Ctrl+Z / Ctrl+Shift+Z (Ctrl+Y) put a reordered card back; nothing else on this tab has an
    // undo.
    const handleHistoryHotkey = (event) => {
      const history = undoRedoKind(event);
      if (!history) return;
      if (history === 'undo' ? tryUndoReorder() : tryRedoReorder()) event.preventDefault();
    };
    onMounted(() => window.addEventListener('keydown', handleHistoryHotkey));
    onBeforeUnmount(() => window.removeEventListener('keydown', handleHistoryHotkey));

    return {
      selectedCardId, selectedCardIds, selectCard, deselectCard, deleteQuestion,
      state, handleChildChange, handleAddEntry, handleDeleteEntry, handleTextChange,
      isCollapsed, toggleCollapsed, textBkColor, enableTextScrollCursor,
      textScrollCursorBlinkSpeed, BLINK_SPEED_OPTIONS, textMaxDisplayWidth,
      TEXT_MAX_DISPLAY_WIDTH_OPTIONS, TEXT_CARD_MAX_LENGTH, textColumns,
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

/* v-list-item's  default 0 16px padding stacks on top of v-card-text's,
   pushing the message card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. Zeroing both sides
   (not just left, as this used to) matches the Player/Data/Background tabs'
   identical fix - the unzeroed right padding was otherwise most visible
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

/* Same margin-top/padding-top override as .text-columns-switch below -
   Vuetify's selection-control margin-top (meant for stacking below
   other fields) otherwise leaves extra space above this switch. Sits inline
   in .text-bkcolor-row now, to the right of the color picker, so no
   margin-bottom is needed either. */
.text-scroll-cursor-switch {
  margin-top: 0 !important;
  padding-top: 0 !important;
  margin-bottom: 0;
  margin-left: 16px;
}

/* Matches the Score tab's .score-bkcolor-label size (ScoreFontEditor.vue). */
.text-bkcolor-label {
  font-size: 1rem;
}

/* Vuetify's  v-select reserves space above the input for its label,
   sitting lower than .text-scroll-cursor-switch's centered toggle+label
   row right next to it - nudged up to bring its input line back onto
   the same baseline. */
.text-blink-speed-field {
  max-width: 160px;
  margin-top: -12px;
  margin-left: 16px;
}

.text-max-width-row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.text-max-width-help {
  margin-top: 8px;
}

.text-max-width-field {
  max-width: 320px;
  /* Matches SoundFXEditor.vue's .soundfx-filter margin-top - without
     it, this field and .soundfx-filter sit on different baselines, and
     .text-columns-switch's offset (tuned to match .soundfx-filter's
     row) ends up too low relative to this field specifically. */
  margin-top: 8px;
}

/* Same margin-top/padding-top override as SoundFXEditor.vue's
   .soundfx-columns-switch - Vuetify's selection-control margin-top
   (meant for stacking below other fields) otherwise pushes this out of
   line with the select next to it. */
.text-columns-switch {
  flex: 0 0 auto;
  margin-top: 8px !important;
  padding-top: 0 !important;
}

/* A 12-character message doesn't need anywhere near .text-list's  full
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
  /* Matches BackgroundEditor.vue's .background-list - restores the
     space above the FIRST row that zeroing v-list-item__content's
     top padding below removes. */
  margin-top: 12px;
}

/* Single full-width column instead of the grid .text-list defaults to
   above - toggled via the "Columns" switch next to the max-width field.
   Same shape as SoundFXEditor.vue's .soundfx-list--single-column. */
.text-list--single-column {
  display: flex;
  flex-direction: column;
}

/* Grid stretches each item to fill its  column width automatically -
   flex doesn't do that for .entry-list-item (Vuetify's v-list-item, the
   actual flex child) by itself, leaving .text-card's width: 100% only
   filling 100% of that un-stretched item instead of the whole row. Same
   fix as SoundFXEditor.vue's equivalent rule. */
.text-list--single-column .entry-list-item {
  width: 100%;
}

/* v-list-item__content's default 12px top/bottom padding was adding extra
   space between grid ROWS on top of this grid's 8px gap (same issue as
   BackgroundEditor.vue's .background-list, see its comment there),
   without anything similar between columns - zeroing it here keeps this
   grid's gap as the only source of spacing, matching the Background
   tab's spacing exactly. overflow: visible (see MusicEditor.vue's
   identical fix) stops this same element's default "overflow: hidden"
   from clipping a selected card's 2px outline - min-width: 0 has to
   come with it (same comment there for the full explanation): overflow:
   visible silently undoes a flex item's default 0 min-width, letting
   it refuse to shrink below its widest content instead of the tab's
   width. */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
  overflow: visible;
  min-width: 0;
}

.text-card {
  position: relative;
  width: 100%;
}

/* Only this top strip is actually draggable (see hooks/drag-reorder.js's
   comment on why) - covers the same header band the collapse/ID/delete
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

/* hooks/drag-reorder.js's  CSS_CLASS_DRAGGING (see its comment for why
   this lives per-tab instead of globally) - faded so the card being moved
   reads as "lifted" rather than duplicated. */
.drag-reorder-dragging {
  opacity: 0.4;
}

/* Which side of THIS card a dragged one would land on (see
   entryDragOverSide/dragOverSideFor) - left/right, not hooks/
   drag-reorder.js's top-border convention, since .text-list is a CSS
   grid that can put more than one card on the same row (see its
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
   button sits inside the card instead.
   ">>>" deep combinator, not a plain selector - this class now lands on
   ConfirmDeleteMenu.vue's internal activator button (passed down via
   its "icon-btn-class" prop), a CHILD component's element that never
   carries this file's scope attribute, so a plain scoped ".text-delete-btn"
   selector would silently never match it at all - the same cross-component
   scoping gap already hit elsewhere in this app (e.g. BlocklyComponent.vue's
   deep-selector rules for Blockly's runtime-injected markup). */
.text-card >>> .text-delete-btn {
  top: 8px !important;
  right: 8px !important;
  box-shadow: none !important;
}

/* Same top-edge fix as .text-delete-btn, positioned at the opposite corner -
   a smaller top offset than .text-delete-btn's, since this one has to line
   up against .text-id-badge's text baseline right next to it, not just
   sit inside the card. */
.text-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same icon/button sizing as the Player Sprite tab's  toolbar icons
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
   name field can stay visible while collapsed. padding-bottom: 0 (an
   earlier version) left almost no room below the name field's
   underline while collapsed - unlike DataEditor.vue's equivalent .data-
   name-section, whose Table name field isn't hide-details, so Vuetify
   reserves a ~22px hint/error strip below it "for free" - this
   field IS hide-details (no hint text ever needed here), so that room
   has to come from padding instead, tuned to match that same ~22px gap
   directly (confirmed against the real rendered card) rather than
   guessing. */
.text-name-section {
  padding-bottom: 22px;
}

.text-message-section {
  padding-top: 0;
}

/* Vuetify's  v-text-field__details reserves a 12px left padding by
   default (tuned for the non-outlined variant's underline, which is inset
   from the field's edge) - the outlined Text field's hint sat 12px
   further right than the field's left border because of it, confirmed
   directly via each element's getBoundingClientRect. Zeroed here so the
   hint lines up with the outline above it instead. */
.text-message-section >>> .v-textarea .v-text-field__details {
  padding-left: 0;
}

.text-justify-toggle {
  margin-top: 12px;
  margin-bottom: 12px;
}

.text-wrap-switch {
  margin-top: 4px;
}

.add-text-button {
  bottom: 8px;
}
</style>
