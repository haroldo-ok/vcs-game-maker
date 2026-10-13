<template>
  <div class="text-font-section">
    <v-divider class="my-2" />
    <div class="option-section-header" @click="toggleCollapsed(cardEntry)">
      <v-btn
        icon
        small
        :title="isCollapsed(cardEntry) ? 'Expand this section' : 'Collapse this section'"
      >
        <v-icon>{{ isCollapsed(cardEntry) ? 'mdi-chevron-right' : 'mdi-chevron-down' }}</v-icon>
      </v-btn>
      <span class="text-subtitle-1">Text Minikernel Font Editor</span>
    </div>
    <div v-if="!isCollapsed(cardEntry)" class="option-section-content">
      <p class="v-messages theme--light v-messages__message">
        Edit the Text Minikernel's character set below. Each character is a fixed 4x5 pixel shape.
      </p>
      <graphic-editor-toolbar class="text-font-controls-row" :active-editor="activeEditor" :bleed="16">
        <template v-slot:before-tools>
          <editor-zoom v-model="zoom" :levels="textFontZoomLevels" class="text-font-zoom" />
          <pixel-grid-toggle v-model="showPixelGrid" />
        </template>
        <template v-slot:after-tools>
          <v-switch
            v-model="showInGamePreview"
            label="Preview as in-game"
            title="The kernel actually draws a blank scanline between each row of a glyph's pixels - toggle this to see glyphs that way instead of as a plain, solid pixel grid. Read-only: switch back to Off to keep editing."
            hide-details
            class="text-font-preview-switch"
          />
        </template>
      </graphic-editor-toolbar>
      <p v-if="!ready" class="v-messages theme--light v-messages__message">Loading default glyphs...</p>
      <template v-else>
        <!-- Only shown once the Text tab's "Show a blinking scroll
             cursor" switch is on (enableTextScrollCursor) - this shape has
             nothing to do with the 51 real glyphs below it at all (it's
             never part of the indexed text_data table - see
             TEXT_CURSOR_WIDTH's comment in utils/text-font.js), so it's
             kept visually and structurally separate rather than folded into
             .glyph-list as a 52nd entry. -->
        <div v-if="enableTextScrollCursor" class="cursor-glyph-section">
          <div
            class="glyph"
            :style="{width: cursorGlyphWidth}"
          >
            <div class="glyph-label">Cursor</div>
            <div
              class="glyph-editor"
              :class="{'glyph-editor-active': activeEditorKey === 'cursor'}"
            >
              <pixel-editor
                v-if="!showInGamePreview"
                :key="resetToken"
                :width="TEXT_CURSOR_WIDTH"
                :height="TEXT_CURSOR_HEIGHT"
                :aspectRatio="PIXEL_ASPECT"
                v-model="state.cursor"
                fgColor="orange"
                :showClearButton="true"
                name="text-font-cursor"
                :allowChangingHeight="false"
                :hideToolbar="true"
                :showGrid="showPixelGrid"
                @input="handleChange"
                @activate="(editorInstance) => setActiveEditor(editorInstance, 'cursor')"
              />
              <!-- Same read-only, blank-scanline-interlaced preview as a
                   real glyph's (see interlacedPreviewRows below) - the
                   cursor's shape is drawn the exact same way, one
                   scanline per row with a blank one between (see
                   buildTextScrollCursorOverride in utils/text-font.js). -->
              <v-card v-else outlined class="glyph-preview-card">
                <v-card-text>
                  <div class="glyph-preview-grid">
                    <div
                      v-for="(row, rowIndex) in interlacedPreviewRows(state.cursor)"
                      :key="rowIndex"
                      class="glyph-preview-row"
                    >
                      <div
                        v-for="(pixel, colIndex) in row"
                        :key="colIndex"
                        class="glyph-preview-cell"
                        :style="{backgroundColor: pixel ? '#FF9800' : '#000'}"
                      />
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </div>
        <div class="glyph-list" :class="{'glyph-list-tools-hidden': zoom < 1.5}">
          <div
            class="glyph"
            :style="{width: glyphWidth}"
            v-for="(glyph, index) in state.glyphs"
            :key="index"
          >
            <div class="glyph-label">{{ glyphLabel(TEXT_GLYPH_ORDER[index].char) }}</div>
            <div
              class="glyph-editor"
              :class="{'glyph-editor-active': activeEditorKey === index}"
            >
              <pixel-editor
                v-if="!showInGamePreview"
                :key="resetToken"
                :width="TEXT_GLYPH_WIDTH"
                :height="TEXT_GLYPH_HEIGHT"
                :aspectRatio="PIXEL_ASPECT"
                v-model="state.glyphs[index]"
                fgColor="orange"
                :showClearButton="true"
                :name="'text-font-glyph-' + index"
                :allowChangingHeight="false"
                :hideToolbar="true"
                :showGrid="showPixelGrid"
                @input="handleChange"
                @activate="(editorInstance) => setActiveEditor(editorInstance, index)"
              >
                <template v-slot:badge>
                  <div
                    class="glyph-id-badge"
                    title="This glyph's index (0-50) - its byte offset into the compiled glyph table is this number times 5."
                  >ID:{{ index }}</div>
                </template>
                <template v-slot:toolbar-end>
                  <v-btn
                    icon
                    small
                    title="Copy this glyph's image"
                    class="glyph-icon-btn-size"
                    @click="() => handleCopyGlyph(index)"
                  >
                    <v-icon>mdi-content-copy</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :disabled="!copiedGlyphData"
                    title="Paste copied image onto this glyph"
                    class="glyph-icon-btn-size"
                    @click="() => handlePasteGlyph(index)"
                  >
                    <v-icon>mdi-content-paste</v-icon>
                  </v-btn>
                </template>
              </pixel-editor>
              <!-- Read-only in-game preview - a blank scanline drawn between
                   each real pixel row (see interlacedPreviewRows below), not
                   a live PixelEditor: there's no real pixel data ON those
                   blank rows to edit at all, so this is a plain, non-
                   interactive rendering rather than a second editable grid a
                   stray click could confusingly "draw" on. -->
              <v-card v-else outlined class="glyph-preview-card">
                <v-card-text>
                  <div
                    class="glyph-id-badge"
                    title="This glyph's index (0-50) - its byte offset into the compiled glyph table is this number times 5."
                  >ID:{{ index }}</div>
                  <div class="glyph-preview-grid">
                    <div
                      v-for="(row, rowIndex) in interlacedPreviewRows(glyph)"
                      :key="rowIndex"
                      class="glyph-preview-row"
                    >
                      <div
                        v-for="(pixel, colIndex) in row"
                        :key="colIndex"
                        class="glyph-preview-cell"
                        :style="{backgroundColor: pixel ? '#FF9800' : '#000'}"
                      />
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </div>
        <v-btn class="reset-button" color="secondary" @click="handleReset">
          <v-icon>mdi-restore</v-icon>
          <div>Reset to default glyphs</div>
        </v-btn>
      </template>
    </div>
  </div>
</template>
<script>
import {computed, defineComponent, onMounted, ref} from '@vue/composition-api';

import EditorZoom from './EditorZoom.vue';
import GraphicEditorToolbar from './GraphicEditorToolbar.vue';
import PixelEditor from './PixelEditor.vue';
import PixelGridToggle from './PixelGridToggle.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useConfigurationStorage, usePixelGridOverlayStorage, useTextFontStorage} from '../hooks/project';
import {useEditorZoom, ZOOM_LEVELS} from '../hooks/zoom';

// Each glyph is a tiny fixed 4x5 grid - unlike every other tab's graphics,
// zooming below 100% here makes it too small to usefully edit at all, so
// the shared 50%/75% stops are dropped, scoped to just this tab (see
// useEditorZoom/stepZoom's "levels" param).
const TEXT_FONT_ZOOM_LEVELS = ZOOM_LEVELS.filter((level) => level >= 1);
import {
  TEXT_GLYPH_ORDER,
  TEXT_GLYPH_WIDTH,
  TEXT_GLYPH_HEIGHT,
  TEXT_CURSOR_WIDTH,
  TEXT_CURSOR_HEIGHT,
  getDefaultTextFont,
  processTextFontDefaults,
  processCursorGlyphDefaults,
  DEFAULT_TEXT_CURSOR,
} from '../utils/text-font';

// Same reasoning as ScoreFontEditor.vue's  PIXEL_ASPECT - these glyphs are
// drawn with player graphics too (one color clock per pixel bit, stretched
// 2:1 by the screen itself), regardless of being only 4 bits wide instead of
// 8.
const PIXEL_ASPECT = 2;

// Width of one glyph editor at 100% zoom - narrower than ScoreFontEditor's
// DIGIT_BASE_WIDTH (120px for an 8-wide digit), since these glyphs are
// only 4 pixels wide.
const GLYPH_BASE_WIDTH = 70;

// One blank scanline between every real pixel row (see text12b.asm's
// drawtextrow - each "Text line N/5" section draws a row's  GRP0/GRP1
// bytes once, then a SECOND WSYNC'd scanline right after resets COLUP0/
// COLUP1 to textbkcolor before the next row's  bytes are ready), so a
// glyph's real on-screen height is 2 scanlines per pixel row, not 1 - the
// second one always blank. Purely a preview concern (see interlacedPreviewRows
// below) - the stored/edited pixel matrix itself (state.glyphs) never
// changes shape over this; it's still exactly TEXT_GLYPH_HEIGHT rows.
const buildBlankRow = () => new Array(TEXT_GLYPH_WIDTH).fill(0);

// A single fixed pseudo-entry id for useCollapsedIds (hooks/collapse.js) -
// that hook is built around a LIST of entries each with their  id (see
// TextEditor.vue's  per-message cards), but works just as well for
// remembering one single card's  collapsed state, keyed under its
// dedicated tab name ('text-font-card', passed to useCollapsedIds below) so
// it can never collide with an actual text message's  id.
const CARD_ENTRY = {id: 'glyphs'};

// Same "module-scope ref, not per-instance state" reasoning as
// PlayerEditor.vue's copiedFrameData - a copied glyph survives
// navigating away from this tab and back.
const copiedGlyphData = ref(null);

export default defineComponent({
  components: {EditorZoom, GraphicEditorToolbar, PixelEditor, PixelGridToggle},
  setup() {
    const textFontStorage = useTextFontStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('textfont', 2, TEXT_FONT_ZOOM_LEVELS);
    // Shared with every other tab's pixel grid toggle (see
    // PixelGridToggle.vue's comment) - not per-tab state.
    const showPixelGrid = usePixelGridOverlayStorage();
    const glyphWidth = computed(() => `${Math.round(GLYPH_BASE_WIDTH * zoom.value)}px`);
    // Same width, same per-pixel size as a real glyph tile - the cursor is
    // TEXT_CURSOR_WIDTH (4) pixels wide, identical to TEXT_GLYPH_WIDTH.
    const cursorGlyphWidth = computed(() => `${Math.round(GLYPH_BASE_WIDTH * zoom.value)}px`);
    const {isCollapsed, toggleCollapsed} = useCollapsedIds('text-font-card', true);

    // Whether the Text tab's "Show a blinking scroll cursor" switch is
    // on - read directly (not passed as a prop) since nothing else about
    // this component depends on a parent already knowing/passing it down,
    // same reasoning textBkColor's  read in TextEditor.vue already
    // establishes for other Configuration-storage-backed Text Minikernel
    // settings.
    const enableTextScrollCursor = computed(() => {
      try {
        return !!(configurationStorage.value || {}).enableTextScrollCursor;
      } catch (e) {
        console.error('Error loading configuration from local storage', e);
        return false;
      }
    });

    // Plain local view state, not persisted - same reasoning as
    // selectedCardId in TextEditor.vue's  setup(): nothing here should
    // round-trip through a saved project.
    const showInGamePreview = ref(false);
    // Inserts a blank row (buildBlankRow) strictly BETWEEN each of the
    // glyph's  real pixel rows (see buildBlankRow's  comment for why) -
    // N real rows become N*2-1 total, never a leading or trailing blank one.
    const interlacedPreviewRows = (glyphRows) => glyphRows
        .flatMap((row, i) => (i === glyphRows.length - 1 ? [row] : [row, buildBlankRow()]));

    // getDefaultTextFont() parses the real vendored text12b.asm (an async
    // fetch, cached after the first call) rather than a hand-transcribed
    // constant - see its  comment in utils/text-font.js. state/handleReset
    // below simply have nothing to fall back to until this resolves, same as
    // any other "first paint waits on an async default" case in this app.
    const defaultGlyphs = ref(null);
    const ready = computed(() => !!defaultGlyphs.value);
    onMounted(async () => {
      try {
        defaultGlyphs.value = await getDefaultTextFont();
      } catch (e) {
        console.error('Failed to load the Text Minikernel\'s default glyphs', e);
      }
    });

    // Tracks whichever glyph's PixelEditor instance was last clicked
    // into (see its "activate" event, emitted from PixelEditor.vue's
    // handleActivate) - the single toolbar above (Eraser/Pencil/Undo/Redo/
    // Export/Import) acts on THIS glyph, since every glyph's
    // per-instance toolbar is now hidden (hideToolbar on the pixel-editor
    // above) in favor of this one shared row. activeEditorKey is either a
    // glyph's numeric index or the literal string 'cursor' - same reasoning
    // as ScoreFontEditor.vue's activeEditor/activeEditorIndex (no
    // card-selection fallback needed, since there's no way to "select" a
    // glyph other than clicking directly into its PixelEditor card).
    const activeEditor = ref(null);
    const activeEditorKey = ref(null);
    const setActiveEditor = (editorInstance, key) => {
      activeEditor.value = editorInstance;
      activeEditorKey.value = key;
    };

    const state = computed({
      get() {
        if (!defaultGlyphs.value) return {glyphs: [], cursor: DEFAULT_TEXT_CURSOR};
        try {
          return {
            ...processTextFontDefaults(textFontStorage, defaultGlyphs.value),
            cursor: processCursorGlyphDefaults(textFontStorage),
          };
        } catch (e) {
          console.error('Error loading the text font from local storage', e);
          return {glyphs: defaultGlyphs.value, cursor: DEFAULT_TEXT_CURSOR};
        }
      },

      set(newState) {
        textFontStorage.value = newState;
      },
    });

    // The pixel editor mutates its matrix in place, so the whole object is
    // reassigned to push it back into storage - same pattern as
    // ScoreFontEditor.vue's  handleChange.
    const handleChange = () => {
      state.value = state.value;
    };

    // Same "whole image" copy/paste pair as ScoreFontEditor.vue's
    // handleCopyDigit/handlePasteDigit.
    const handleCopyGlyph = (index) => {
      copiedGlyphData.value = structuredClone(state.value.glyphs[index]);
    };
    const handlePasteGlyph = (index) => {
      if (!copiedGlyphData.value) return;
      state.value.glyphs[index] = structuredClone(copiedGlyphData.value);
      handleChange();
      // PixelEditor only reads its "value" prop once, on mount (see
      // resetToken's comment right below) - pasting writes the new
      // pixels from OUTSIDE the target glyph's editor instance, so
      // without this it wouldn't actually show up until something else
      // happened to force that glyph to remount.
      resetToken.value++;
    };

    // The space glyph's  char (' ') renders as empty, collapsed text -
    // without a visible stand-in, its label div has no content at all,
    // leaving it (and it alone) shorter than every other glyph's
    // labeled card, so its whole card sits higher than the rest of its row
    // instead of lining up with them.
    const glyphLabel = (char) => (char === ' ' ? '(space)' : char);

    // Same "PixelEditor only reads its value prop once, on mount" reset
    // trick as ScoreFontEditor.vue's  resetToken.
    const resetToken = ref(0);
    const handleReset = () => {
      state.value = {
        glyphs: defaultGlyphs.value.map((rows) => rows.map((row) => row.slice())),
        cursor: DEFAULT_TEXT_CURSOR.map((row) => row.slice()),
      };
      resetToken.value++;
    };

    return {
      state, handleChange, handleReset, ready, resetToken, glyphLabel,
      zoom, showPixelGrid, textFontZoomLevels: TEXT_FONT_ZOOM_LEVELS, glyphWidth, cursorGlyphWidth, isCollapsed, toggleCollapsed, cardEntry: CARD_ENTRY,
      showInGamePreview, interlacedPreviewRows, enableTextScrollCursor,
      TEXT_GLYPH_ORDER, TEXT_GLYPH_WIDTH, TEXT_GLYPH_HEIGHT, TEXT_CURSOR_WIDTH, TEXT_CURSOR_HEIGHT, PIXEL_ASPECT,
      activeEditor, activeEditorKey, setActiveEditor,
      copiedGlyphData, handleCopyGlyph, handlePasteGlyph,
    };
  },
});
</script>
<style scoped>
.text-font-section {
  margin-bottom: 16px;
}

/* Matches Configuration.vue's collapsible-section look exactly (a
   plain left-aligned chevron + title, not a card) - this used to be its
   outlined v-card, which read as one more nested card inside the Text tab's
   main card, unlike every other collapsible grouping in the app. */
.option-section-header {
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
}

.option-section-content {
  padding-left: 4px;
}

/* Attribute passthrough onto GraphicEditorToolbar.vue's root (see
   ScoreFontEditor.vue's identical comment) - :bleed="16" (set in the
   template) reaches TextEditor.vue's real scrolling edge one padded
   level up (this component no longer nests its second v-card-text now
   that it's a plain section, not a card - just TextEditor.vue's outer
   v-card-text). No "gap" here (tried first) - every other tab's
   equivalent toolbar (e.g. ScoreFontEditor.vue's .score-editor-toolbar-row)
   relies purely on GraphicEditorToolbar.vue's internal divider margins
   for icon-to-icon spacing; adding a flex "gap" on top of those stacked an
   extra 16px alongside them here, spacing this tab's icons out further
   than every other tab's - confirmed as a real reported mismatch. */
.text-font-controls-row {
  margin-bottom: 8px;
}

.text-font-zoom {
  margin-bottom: 0;
}

/* Same margin-top/padding-top override as TextEditor.vue's
   .text-columns-switch - Vuetify's selection-control margin-top (meant
   for stacking below other fields) otherwise pushes this out of line with
   the zoom control sharing this same row. */
.text-font-preview-switch {
  flex: 0 0 auto;
  margin-top: 0 !important;
  padding-top: 0 !important;
  /* GraphicEditorToolbar.vue's inner divider only carries a tight 2px
     margin on each side (meant for the small icon buttons sandwiched
     between the other dividers) - fine for those, but this switch's
     track/label read as uncomfortably close to the divider line right next
     to it, unlike anything else in this toolbar. */
  margin-left: 8px;
}

/* Marks which glyph the shared toolbar above currently acts on - same
   border-color + outline treatment as every other tab's "-selected"
   card highlight (App.vue's shared outlined-card border rule) and
   PlayerEditor.vue's identical per-frame highlight. */
.glyph-editor-active >>> .v-card {
  border-color: var(--v-primary-base, #1976d2) !important;
  outline: 2px solid var(--v-primary-base, #1976d2) !important;
}

.cursor-glyph-section {
  margin-bottom: 20px;
}

/* Width is set inline (cursorGlyphWidth) from the zoom factor. */

.glyph-list {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  /* Every card in a row should start at the same height regardless of which
     row it's actually in (see .glyph-label's min-height comment right
     below) - flex's default "stretch" would instead make every card in a
     row match the row's TALLEST card, which isn't what's wanted here either. */
  align-items: flex-start;
}

/* Same reasoning as ScoreFontEditor.vue's .digit-list-tools-hidden -
   the copy/paste icons under each glyph start overlapping/crowding the
   glyph itself below 150% zoom, so hidden entirely rather than shrunk
   further - still reachable via the shared toolbar at the top of the tab
   regardless of zoom level. */
.glyph-list-tools-hidden >>> .pixel-editor-hidden-toolbar-row {
  display: none;
}

/* Width is set inline from the zoom factor. */

/* min-height (rather than relying on the text itself) keeps every card in a
   row starting at the same height even when a label's text is empty -
   the space glyph's char is a literal " ", which the browser collapses
   to nothing visible, leaving that one card shorter (and so higher, given
   align-items: flex-start above) than its neighbors sharing the same row.
   glyphLabel() (see the script below) already substitutes "(space)" text
   for that one specific case, but this stays as a general safeguard rather
   than relying on every possible label always having real visible text. */
.glyph-label {
  min-height: 1.2em;
  font-weight: bold;
  text-align: center;
}

.glyph-editor {
  position: relative;
}

/* Same placement/style as PlayerEditor.vue's .frame-number-badge -
   plain flow (not overlaid on the card border), via the "badge" slot
   PixelEditor.vue exposes for exactly this, so it sits INSIDE the pixel
   editor's rendered card, pushing the canvas down naturally rather than
   floating on top of it (which made it hard to read whenever the top row of
   pixels happened to be drawn in a similar color). This glyph's plain
   0-based index lets one be pointed out unambiguously even for a character
   (e.g. two easily-confused punctuation marks) that's hard to describe
   otherwise. */
.glyph-id-badge {
  text-align: left;
  font-size: 0.7rem;
  font-family: monospace;
  opacity: 0.6;
  /* Pulls it up out of v-card-text's default 16px top padding, same reason
     as .frame-number-badge's identical margin-top. */
  margin-top: -8px;
}

/* Same sizing as PlayerEditor.vue's .player-icon-btn-size - the
   Copy/Paste buttons under each glyph's graphic. */
.glyph-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0;
}

.glyph-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

/* Same fix as PlayerEditor.vue's identical rule - without it, a disabled
   Paste button read as clickable, no different from the enabled Copy
   button next to it. */
.glyph-icon-btn-size.v-btn--disabled {
  opacity: 0.35;
}

/* Matches PixelEditor.vue's  outlined v-card shape/width - kept a plain
   read-only rendering rather than a second PixelEditor instance (see the
   template's comment on why), so its sizing has to be replicated by
   hand instead of coming from that component's CSS. */
.glyph-preview-card {
  width: 100%;
}

.glyph-preview-grid {
  display: flex;
  flex-direction: column;
}

.glyph-preview-row {
  display: flex;
}

/* aspect-ratio 2/1 matches PIXEL_ASPECT (edit mode's  pixel cells are
   twice as wide as tall, for the same "one screen pixel is 2:1" reason - see
   PIXEL_ASPECT's comment) - a blank interlaced row (see
   interlacedPreviewRows) is a real scanline too, so it keeps the exact same
   per-row height as a genuine pixel row rather than reading as a thin
   spacer. */
.glyph-preview-cell {
  flex: 1;
  aspect-ratio: 2 / 1;
}

.reset-button {
  margin-top: 24px;
}
</style>
