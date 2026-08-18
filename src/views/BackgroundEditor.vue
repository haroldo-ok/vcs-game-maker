<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Backgrounds</v-card-title>
      <v-card-text>
        <editor-zoom v-model="zoom" />
        <v-list
          class="background-list"
          :style="{gridTemplateColumns: `repeat(auto-fill, calc(${editorWidth} + 24px))`}"
        >
          <v-list-item
            class="entry-list-item"
            v-for="(background, index) in state.backgrounds"
            v-bind:key="background.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                class="background-card"
                :class="dragCardClass(index)"
                v-on="dragTargetListeners(index)"
              >
                <div
                  class="background-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-list-item-title>
                  <v-btn
                    :title="isCollapsed(background) ? 'Expand this background' : 'Collapse this background'"
                    icon
                    small
                    absolute
                    top
                    left
                    class="background-collapse-btn"
                    @click="() => toggleCollapsed(background)"
                  >
                    <v-icon>{{ isCollapsed(background) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                  </v-btn>
                  <div class="background-id-badge">ID:{{ background.id }}</div>
                  <v-text-field
                    class="background-name-field"
                    label="Background name"
                    v-model="background.name"
                    @change="handleChildChange"
                  />

                  <v-menu
                        top
                        v-if="state.backgrounds.length > 1"
                      >
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        title="Delete this background"
                        icon
                        small
                        absolute
                        top
                        right
                        class="delete-btn-inset delete-icon-btn player-icon-btn-size"
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon>mdi-delete</v-icon>
                      </v-btn>
                    </template>

                    <v-card>
                      <v-card-title>Delete this background?</v-card-title>
                      <v-list>
                        <v-list-item @click="handleDeleteBackground(background)">
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
                </v-list-item-title>
                <v-list-item-subtitle v-if="!isCollapsed(background)">
                  <div class="pixel-editor-container" :style="{width: editorWidth, maxWidth: editorWidth}">
                    <pixel-editor
                      :width="32"
                      :height="backgroundRows"
                      name="background"
                      v-model="background.pixels"
                      fgColor="orange"
                      :rowColors="editorRowColors(background)"
                      :allowChangingHeight="false"
                      :showClearButton="true"
                      @input="handleChildChange"
                    >
                      <template v-if="pfColorsEnabled" v-slot:sidebar>
                        <playfield-color-strip
                          :value="background.rowColors"
                          @input="(colors) => handleRowColorsInput(background, colors)"
                        />
                      </template>
                    </pixel-editor>
                  </div>
                </v-list-item-subtitle>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-frame-buttom"
      color="primary"
      title="Add background"
      dark
      absolute
      right
      fab
      @click="handleAddBackground"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {CSS_CLASS_DRAGGING} from '../hooks/drag-reorder';
import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PlayfieldColorStrip from '../components/PlayfieldColorStrip.vue';
import {useBackgroundsStorage, useConfigurationStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {colorByteToCss} from '../utils/palette';
import {DEFAULT_BACKGROUNDS, DEFAULT_ROW_COLOR, effectiveBackgroundRows,
  processBackgroundStorageDefaults} from '../blocks/background';

// Width of one background editor at 100% zoom.
const EDITOR_BASE_WIDTH = 480;

// A blank canvas (every pixel off), sized to whatever the current playfield
// resolution is - not a fixed row count, since Superchip's pfres setting can
// make that row count anything from 11 to 32. Used for new backgrounds
// instead of pre-drawing anything (a rectangular border was tried first and
// reverted: a brand new background starting with existing pixels already
// set meant clearing them by hand was the normal first step before drawing
// anything new, every time - matches how a new player animation frame
// starts blank too, see PlayerEditor.vue's own handleAddAnimation).
const buildDefaultBackgroundPixels = (rows, cols = 32) =>
  new Array(rows).fill(0).map(() => new Array(cols).fill(0));

export default defineComponent({
  components: {EditorZoom, PixelEditor, PlayfieldColorStrip},
  setup() {
    const backgroundsStorage = useBackgroundsStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('background');
    const editorWidth = computed(() => `${Math.round(EDITOR_BASE_WIDTH * zoom.value)}px`);

    // The playfield's row count is a single setting for the whole ROM (see
    // the Options tab's Superchip/pfres controls), not something each
    // background can override individually.
    const backgroundRows = computed(() =>
      effectiveBackgroundRows(configurationStorage && configurationStorage.value));

    // Per-row playfield colors (batari Basic pfcolors) are an all-or-nothing,
    // project-wide setting (see the Options tab) - once it's on, every
    // background needs its own color list, since the compiled kernel always
    // draws every background's playfield from that color table.
    const pfColorsEnabled = computed(() =>
      (configurationStorage && configurationStorage.value && configurationStorage.value.enablePfColors) ?? false);

    // Fills in a missing/mismatched-length row color list so every background
    // has one whenever per-row colors are enabled, without clobbering colors
    // the user already picked. Left alone (not deleted) while the option is
    // off, so re-enabling it doesn't lose prior work.
    const ensureRowColors = (background, rows) => {
      if (!pfColorsEnabled.value) return;
      const existing = background.rowColors || [];
      if (existing.length === rows) return;
      const next = existing.slice(0, rows);
      while (next.length < rows) next.push(DEFAULT_ROW_COLOR);
      background.rowColors = next;
    };

    const state = computed({
      get() {
        try {
          const data = processBackgroundStorageDefaults(backgroundsStorage);
          data.backgrounds.forEach((background) => ensureRowColors(background, background.pixels.length));
          return data;
        } catch (e) {
          console.error('Error loading backgrounds from local storage', e);
          return DEFAULT_BACKGROUNDS;
        }
      },

      set(newState) {
        backgroundsStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    const {isCollapsed, toggleCollapsed} = useCollapsedIds('background');

    // Card reordering - NOT built on hooks/drag-reorder.js's own
    // useDragReorder (used as-is by SoundFXEditor.vue/MusicEditor.vue's own
    // single-column card lists), since that hook's own top-border
    // drag-over convention only makes sense for a strictly vertical stack.
    // .background-list is a CSS grid (see its own comment - two or more
    // cards can sit side by side on a wide enough window), where the
    // meaningful drop-target edge is left/right (which card this lands
    // before/after in reading order), not top/bottom - same reasoning as
    // TextEditor.vue's own identical replacement.
    const draggedIndex = ref(null);
    // {index, side} - side is 'before' or 'after', which HALF of card
    // `index` the pointer is currently over.
    const dragOverEntry = ref(null);
    const isEntryDragging = (index) => draggedIndex.value === index;
    const isEntryDragOver = (index) =>
      !!dragOverEntry.value && dragOverEntry.value.index === index && !isEntryDragging(index);
    const entryDragOverSide = (index) => (isEntryDragOver(index) ? dragOverEntry.value.side : null);
    const dragCardClass = (index) => ({
      [CSS_CLASS_DRAGGING]: isEntryDragging(index),
      'background-card-drag-over-before': entryDragOverSide(index) === 'before',
      'background-card-drag-over-after': entryDragOverSide(index) === 'after',
    });
    const dragOverSideFor = (event) => {
      const rect = event.currentTarget.getBoundingClientRect();
      return (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
    };
    const dragAttrs = () => ({draggable: true});
    const dragHandleListeners = (index) => ({
      dragstart: (event) => {
        draggedIndex.value = index;
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', String(index));
      },
      dragend: () => {
        draggedIndex.value = null;
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
        const from = draggedIndex.value;
        draggedIndex.value = null;
        dragOverEntry.value = null;
        if (from == null || from === index) return;
        const side = dragOverSideFor(event);
        let insertAt = side === 'after' ? index + 1 : index;
        if (from < insertAt) insertAt--;
        if (insertAt === from) return;
        const items = state.value.backgrounds.slice();
        const [moved] = items.splice(from, 1);
        items.splice(insertAt, 0, moved);
        state.value.backgrounds = items;
        handleChildChange();
      },
    });

    const handleRowColorsInput = (background, colors) => {
      background.rowColors = colors;
      handleChildChange();
      // The editors hold their own display state, so persisting isn't enough to
      // repaint the preview — force a re-render so the pixel editor receives the
      // updated row colors and recolors its canvas.
      instance.proxy.$forceUpdate();
    };

    // CSS colors passed to the pixel editor so it can tint each row. Returns
    // null when per-row colors are off (uniform fgColor). A pure black row
    // ($00) is nudged to near-black so the editor still counts those pixels
    // as "on" rather than reading them as the black background.
    const editorRowColors = (background) => {
      if (!pfColorsEnabled.value || !background.rowColors) {
        return null;
      }
      return background.rowColors.map((byte) => {
        const css = colorByteToCss(byte);
        return css === '#000000' ? '#010101' : css;
      });
    };

    const instance = getCurrentInstance();
    const handleAddBackground = () => {
      const backgrounds = state.value.backgrounds;
      const maxId = max(backgrounds.map((o) => o.id)) || 0;
      const newBackground = {
        id: maxId + 1,
        name: `Background ${maxId + 1}`,
        pixels: buildDefaultBackgroundPixels(backgroundRows.value),
      };

      state.value.backgrounds.push(newBackground);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteBackground = (background) => {
      state.value.backgrounds = state.value.backgrounds.filter(({id}) => id != background.id);
      console.info('Deleted ', background);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    return {state, handleChildChange, handleAddBackground, handleDeleteBackground,
      handleRowColorsInput, editorRowColors, isCollapsed, toggleCollapsed,
      zoom, editorWidth, backgroundRows, pfColorsEnabled,
      dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners};
  },
});
</script>
<style scoped>
/* max-width is set inline from the zoom factor. */

/* Vuetify sets overflow: hidden on list-item content/subtitle (for text
   ellipsis), which clips the pixel editor card's shadow on the flush left and
   bottom edges. Let it show. */
.editor-container >>> .v-list-item__content,
.editor-container >>> .v-list-item__subtitle {
  overflow: visible;
}

.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* v-list-item's own default 0 16px padding stacks on top of v-card-text's,
   pushing the graphic card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. Zeroing both sides
   (not just left, as this used to) keeps the card's right edge from sitting
   16px further in than its left edge. */
/* padding-top/bottom zeroed too (not just left/right) - Vuetify's own
   default vertical list-item padding was adding extra space between grid
   ROWS on top of .background-list's own 8px row gap, without adding
   anything similar between columns (that's handled entirely by the grid's
   column-gap), so rows visibly had more space than columns despite the
   grid's own gap being uniform. Zeroing this leaves the grid's gap as the
   only source of spacing in either direction, matching row/column spacing
   exactly. */
.entry-list-item {
  padding: 0;
}

/* v-list-item__content (a Vuetify-owned element between .entry-list-item
   and .background-card, not directly reachable without a deep selector)
   carries its own default 12px top/bottom padding - on top of the grid's
   own row gap AND .background-card's own 12px padding, this was adding a
   third, easy-to-miss source of extra space above/below each card. */
.entry-list-item >>> .v-list-item__content {
  padding: 0;
}

/* Same grid layout as TextEditor.vue's .text-list - lets more than one
   background card fit per row on a wide enough window/zoom level instead of
   each always spanning a full row, at the user's own request. Unlike
   .text-list's own static minmax(280px, 1fr), the column size here is bound
   inline (see the template) to a literal editorWidth - not minmax(editorWidth,
   1fr) - since a background card's own width is exactly the graphic's width,
   with nothing that benefits from stretching wider: 1fr would have grown
   the single column (and so the card) to fill the entire remaining row
   whenever only one fit, making it far wider than the graphic actually
   needs. A literal, fixed track size means each column is always exactly
   editorWidth, however many fit, with any leftover row space simply left
   empty instead of stretched into a card.

   "+ 24px" accounts for .background-card's own 12px padding on each side
   (below) - editorWidth alone is only the pixel editor's own inner width,
   so a column sized to exactly that was 24px too narrow for the card
   actually wrapping it, and the card's real (wider) box overflowed into
   its neighbor's column instead of fitting in its own. */
/* margin-top restores the gap above the FIRST row that used to come from
   v-list-item__content's own 12px top padding (see .entry-list-item's own
   comment on zeroing that) - zeroing it fixed the (unwanted) extra space
   BETWEEN rows, but also removed the (wanted) space between the editor-zoom
   control above and the first row, which this puts back without
   reintroducing any inter-row gap (a margin on the grid container itself
   only affects space before its first row, not the row gap between items). */
.background-list {
  display: grid;
  gap: 8px;
  align-items: start;
  margin-top: 12px;
}

/* Same rounded, thin-bordered look as the Sound/Data/Text/Music tabs' own
   per-item cards (e.g. SoundFXEditor's .soundfx-card) - this one wraps
   directly around the existing v-list-item-title/subtitle content (rather
   than switching to a v-card-text section like those tabs use) so the
   change is just the border, not a layout rework; padding here replaces the
   internal spacing a v-card-text would otherwise have provided. */
/* width: 100% - without it, the card (nested inside v-list-item-content,
   not itself the grid item .background-list sizes) shrinks to fit its OWN
   content's natural width instead of filling the grid column .background-
   list already fixed to editorWidth + 24px (see its own comment). A
   collapsed card's content (just the title row) is narrower than that
   fixed column, so it rendered visibly narrower than an expanded card
   (whose pixel editor forces the full editorWidth) instead of both being
   the same width the grid already allocated for them. */
.background-card {
  position: relative;
  width: 100%;
  padding: 12px;
}

/* PixelEditor.vue always wraps itself in its own outlined v-card with
   card-text padding - useful standalone (e.g. each Player tab animation
   frame, where it's the only border that card has), but redundant once
   .background-card above already frames the WHOLE background entry the
   same way, showing as a visible second "inner" border-plus-padding around
   just the graphic/tools. Stripped here, scoped to this nested instance
   only, rather than changing PixelEditor.vue itself (which would remove
   the Player tabs' own only border). */
.pixel-editor-container >>> .v-card {
  border: none !important;
  box-shadow: none !important;
}

/* Split, not just zeroed: v-card-text (canvas) and v-card-actions
   (toolbar, below) each carry their own default Vuetify padding, which
   don't match each other (16px vs 8px) - zeroing v-card-text's padding
   entirely earlier left its LEFT edge flush with the card while the
   toolbar's own left padding (untouched) kept it indented, so the two no
   longer lined up. Zeroing left/right on both instead lines their left
   edges up exactly with each other (and with the graphic itself), while a
   small bottom/top pair (4px each, 8px combined) keeps a real but modest
   gap between canvas and toolbar instead of them sitting flush against
   each other. */
.pixel-editor-container >>> .v-card__text {
  padding: 0 0 4px 0 !important;
}

.pixel-editor-container >>> .v-card__actions {
  padding: 4px 0 0 0 !important;
}

/* Only this top strip is draggable (see hooks/drag-reorder.js's own
   comment on why) - covers the same header band the collapse/ID/delete
   controls already occupy. Sits behind them (they're later in DOM order,
   so they paint on top and stay clickable) but in front of everything
   else, so a click-and-drag gesture anywhere else in the card still selects
   text/drags the pixel editor instead of starting a reorder drag. */
.background-drag-handle {
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

/* Which side of THIS card a dragged one would land on (see
   entryDragOverSide/dragOverSideFor) - left/right, not hooks/
   drag-reorder.js's own top-border convention, since .background-list is a
   CSS grid that can put more than one card on the same row (see its own
   comment) - left/right is what actually reflects reading-order position
   within it. */
.background-card-drag-over-before {
  border-left: 3px solid var(--v-primary-base, #1976d2) !important;
}

.background-card-drag-over-after {
  border-right: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Sits in v-list-item-title, which (unlike the pixel editor's own toolbar)
   is always rendered regardless of collapse state, so the button stays
   visible on a collapsed card instead of disappearing along with the pixel
   editor. top/right match every other tab's own delete corner button
   (see MusicEditor.vue's .music-toolbar-top-right) exactly, for a
   consistent corner position across every card type. */
.delete-btn-inset {
  top: 8px !important;
  right: 8px !important;
}

.player-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

.player-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

/* Absolutely positioned (matching Text/SoundFX/Data/Music's own collapse
   button placement exactly) rather than flowed in a flex row alongside the
   ID badge - the row wrapper this used to sit in is gone; .background-
   name-field's own margin-top (below) makes room for both this and the
   badge to sit above it instead. */
.background-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same placement/style as every other tab's own "ID: N" badge (see
   MusicEditor.vue's .music-id-badge). */
.background-id-badge {
  position: absolute;
  top: 8px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same reasoning as TextEditor.vue's .text-name-field - reserves room below
   the now-absolutely-positioned collapse button/ID badge instead of them
   overlapping this field, now that neither sits in a normal-flow row above
   it anymore. Matches .soundfx-name-field's own margin-top (SoundFXEditor.vue)
   for consistent badge-to-name spacing across every tab. */
.background-name-field {
  margin-top: 20px;
}

.add-frame-buttom {
  bottom: 8px;
}

/* No drop shadow on floating (absolute-positioned) buttons - delete, add, etc. */
.v-btn--absolute {
  box-shadow: none !important;
}
</style>
