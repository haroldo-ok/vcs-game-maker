<template>
  <v-card outlined class="text-font-card">
    <div class="text-font-card-header" @click="toggleCollapsed(cardEntry)">
      <span class="text-font-card-title">Text Minikernel Font</span>
      <v-btn
        icon
        small
        :title="isCollapsed(cardEntry) ? 'Expand this card' : 'Collapse this card'"
        class="text-font-collapse-btn"
        @click.stop="toggleCollapsed(cardEntry)"
      >
        <v-icon>{{ isCollapsed(cardEntry) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
      </v-btn>
    </div>
    <v-card-text v-if="!isCollapsed(cardEntry)" class="text-font-card-text">
      <p class="v-messages theme--light v-messages__message">
        Edit the Text Minikernel's character set below. Each character is a fixed 4x5 pixel shape.
      </p>
      <div class="text-font-controls-row">
        <editor-zoom v-model="zoom" class="text-font-zoom" />
        <v-switch
          v-model="showInGamePreview"
          label="Preview as in-game"
          title="The kernel actually draws a blank scanline between each row of a glyph's own pixels - toggle this to see glyphs that way instead of as a plain, solid pixel grid. Read-only: switch back to Off to keep editing."
          hide-details
          dense
          class="text-font-preview-switch"
        />
      </div>
      <p v-if="!ready" class="v-messages theme--light v-messages__message">Loading default glyphs...</p>
      <template v-else>
        <!-- Only shown once the Text tab's own "Show a blinking scroll
             cursor" switch is on (enableTextScrollCursor) - this shape has
             nothing to do with the 51 real glyphs below it at all (it's
             never part of the indexed text_data table - see
             TEXT_CURSOR_WIDTH's own comment in utils/text-font.js), so it's
             kept visually and structurally separate rather than folded into
             .glyph-list as a 52nd entry. -->
        <div v-if="enableTextScrollCursor" class="cursor-glyph-section">
          <div
            class="glyph"
            :style="{width: cursorGlyphWidth}"
          >
            <div class="glyph-label">Cursor</div>
            <div class="glyph-editor">
              <pixel-editor
                v-if="!showInGamePreview"
                :key="resetToken"
                :width="TEXT_CURSOR_WIDTH"
                :height="TEXT_CURSOR_HEIGHT"
                :aspectRatio="PIXEL_ASPECT"
                v-model="state.cursor"
                fgColor="#f2691e"
                :showClearButton="true"
                name="text-font-cursor"
                :allowChangingHeight="false"
                @input="handleChange"
              />
              <!-- Same read-only, blank-scanline-interlaced preview as a
                   real glyph's own (see interlacedPreviewRows below) - the
                   cursor's own shape is drawn the exact same way, one
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
                        :style="{backgroundColor: pixel ? '#f2691e' : '#000'}"
                      />
                    </div>
                  </div>
                </v-card-text>
              </v-card>
            </div>
          </div>
        </div>
        <div class="glyph-list">
          <div
            class="glyph"
            :style="{width: glyphWidth}"
            v-for="(glyph, index) in state.glyphs"
            :key="index"
          >
            <div class="glyph-label">{{ glyphLabel(TEXT_GLYPH_ORDER[index].char) }}</div>
            <div class="glyph-editor">
              <pixel-editor
                v-if="!showInGamePreview"
                :key="resetToken"
                :width="TEXT_GLYPH_WIDTH"
                :height="TEXT_GLYPH_HEIGHT"
                :aspectRatio="PIXEL_ASPECT"
                v-model="state.glyphs[index]"
                fgColor="#f2691e"
                :showClearButton="true"
                :name="'text-font-glyph-' + index"
                :allowChangingHeight="false"
                @input="handleChange"
              >
                <template v-slot:badge>
                  <div
                    class="glyph-id-badge"
                    title="This glyph's index (0-50) - its byte offset into the compiled glyph table is this number times 5."
                  >ID:{{ index }}</div>
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
                        :style="{backgroundColor: pixel ? '#f2691e' : '#000'}"
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
    </v-card-text>
  </v-card>
</template>
<script>
import {computed, defineComponent, onMounted, ref} from '@vue/composition-api';

import EditorZoom from './EditorZoom.vue';
import PixelEditor from './PixelEditor.vue';
import {useCollapsedIds} from '../hooks/collapse';
import {useConfigurationStorage, useTextFontStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
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

// Same reasoning as ScoreFontEditor.vue's own PIXEL_ASPECT - these glyphs are
// drawn with player graphics too (one color clock per pixel bit, stretched
// 2:1 by the screen itself), regardless of being only 4 bits wide instead of
// 8.
const PIXEL_ASPECT = 2;

// Width of one glyph editor at 100% zoom - narrower than ScoreFontEditor's
// own DIGIT_BASE_WIDTH (120px for an 8-wide digit), since these glyphs are
// only 4 pixels wide.
const GLYPH_BASE_WIDTH = 70;

// One blank scanline between every real pixel row (see text12b.asm's own
// drawtextrow - each "Text line N/5" section draws a row's own GRP0/GRP1
// bytes once, then a SECOND WSYNC'd scanline right after resets COLUP0/
// COLUP1 to textbkcolor before the next row's own bytes are ready), so a
// glyph's real on-screen height is 2 scanlines per pixel row, not 1 - the
// second one always blank. Purely a preview concern (see interlacedPreviewRows
// below) - the stored/edited pixel matrix itself (state.glyphs) never
// changes shape over this; it's still exactly TEXT_GLYPH_HEIGHT rows.
const buildBlankRow = () => new Array(TEXT_GLYPH_WIDTH).fill(0);

// A single fixed pseudo-entry id for useCollapsedIds (hooks/collapse.js) -
// that hook is built around a LIST of entries each with their own id (see
// TextEditor.vue's own per-message cards), but works just as well for
// remembering one single card's own collapsed state, keyed under its own
// dedicated tab name ('text-font-card', passed to useCollapsedIds below) so
// it can never collide with an actual text message's own id.
const CARD_ENTRY = {id: 'glyphs'};

export default defineComponent({
  components: {EditorZoom, PixelEditor},
  setup() {
    const textFontStorage = useTextFontStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('textfont');
    const glyphWidth = computed(() => `${Math.round(GLYPH_BASE_WIDTH * zoom.value)}px`);
    // Same width, same per-pixel size as a real glyph tile - the cursor is
    // TEXT_CURSOR_WIDTH (4) pixels wide, identical to TEXT_GLYPH_WIDTH.
    const cursorGlyphWidth = computed(() => `${Math.round(GLYPH_BASE_WIDTH * zoom.value)}px`);
    const {isCollapsed, toggleCollapsed} = useCollapsedIds('text-font-card');

    // Whether the Text tab's own "Show a blinking scroll cursor" switch is
    // on - read directly (not passed as a prop) since nothing else about
    // this component depends on a parent already knowing/passing it down,
    // same reasoning textBkColor's own read in TextEditor.vue already
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
    // selectedCardId in TextEditor.vue's own setup(): nothing here should
    // round-trip through a saved project.
    const showInGamePreview = ref(false);
    // Inserts a blank row (buildBlankRow) strictly BETWEEN each of the
    // glyph's own real pixel rows (see buildBlankRow's own comment for why) -
    // N real rows become N*2-1 total, never a leading or trailing blank one.
    const interlacedPreviewRows = (glyphRows) => glyphRows
        .flatMap((row, i) => (i === glyphRows.length - 1 ? [row] : [row, buildBlankRow()]));

    // getDefaultTextFont() parses the real vendored text12b.asm (an async
    // fetch, cached after the first call) rather than a hand-transcribed
    // constant - see its own comment in utils/text-font.js. state/handleReset
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
    // ScoreFontEditor.vue's own handleChange.
    const handleChange = () => {
      state.value = state.value;
    };

    // The space glyph's own char (' ') renders as empty, collapsed text -
    // without a visible stand-in, its label div has no content at all,
    // leaving it (and it alone) shorter than every other glyph's own
    // labeled card, so its whole card sits higher than the rest of its row
    // instead of lining up with them.
    const glyphLabel = (char) => (char === ' ' ? '(space)' : char);

    // Same "PixelEditor only reads its value prop once, on mount" reset
    // trick as ScoreFontEditor.vue's own resetToken.
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
      zoom, glyphWidth, cursorGlyphWidth, isCollapsed, toggleCollapsed, cardEntry: CARD_ENTRY,
      showInGamePreview, interlacedPreviewRows, enableTextScrollCursor,
      TEXT_GLYPH_ORDER, TEXT_GLYPH_WIDTH, TEXT_GLYPH_HEIGHT, TEXT_CURSOR_WIDTH, TEXT_CURSOR_HEIGHT, PIXEL_ASPECT,
    };
  },
});
</script>
<style scoped>
.text-font-card {
  margin-bottom: 16px;
}

.text-font-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 8px 12px 16px;
  cursor: pointer;
}

.text-font-card-title {
  font-size: 1.25rem;
  font-weight: 500;
}

/* Vuetify's own ".v-card__title + .v-card__text" rule zeroes this same
   padding automatically when a real v-card-title comes right before it (see
   TextEditor.vue's own top-level card, confirmed directly: 0px there) - it
   never applies here since .text-font-card-header is a plain div, not an
   actual v-card-title, so this description paragraph sat a further 16px
   below the header than the Text tab's own description sits below ITS
   title. Zeroed here by hand to match that same spacing exactly. */
.text-font-card-text {
  padding-top: 0;
}

.text-font-controls-row {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 8px;
}

.text-font-zoom {
  margin-bottom: 0;
}

/* Same margin-top/padding-top override as TextEditor.vue's own
   .text-columns-switch - Vuetify's own selection-control margin-top (meant
   for stacking below other fields) otherwise pushes this out of line with
   the zoom control sharing this same row. */
.text-font-preview-switch {
  flex: 0 0 auto;
  margin-top: 0 !important;
  padding-top: 0 !important;
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
     row it's actually in (see .glyph-label's own min-height comment right
     below) - flex's default "stretch" would instead make every card in a
     row match the row's TALLEST card, which isn't what's wanted here either. */
  align-items: flex-start;
}

/* Width is set inline from the zoom factor. */

/* min-height (rather than relying on the text itself) keeps every card in a
   row starting at the same height even when a label's own text is empty -
   the space glyph's own char is a literal " ", which the browser collapses
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

/* Same placement/style as PlayerEditor.vue's own .frame-number-badge -
   plain flow (not overlaid on the card border), via the "badge" slot
   PixelEditor.vue exposes for exactly this, so it sits INSIDE the pixel
   editor's own rendered card, pushing the canvas down naturally rather than
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
     as .frame-number-badge's own identical margin-top. */
  margin-top: -8px;
}

/* Matches PixelEditor.vue's own outlined v-card shape/width - kept a plain
   read-only rendering rather than a second PixelEditor instance (see the
   template's own comment on why), so its sizing has to be replicated by
   hand instead of coming from that component's own CSS. */
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

/* aspect-ratio 2/1 matches PIXEL_ASPECT (edit mode's own pixel cells are
   twice as wide as tall, for the same "one screen pixel is 2:1" reason - see
   PIXEL_ASPECT's own comment) - a blank interlaced row (see
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
