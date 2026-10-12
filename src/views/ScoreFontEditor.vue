<template>
  <v-card flat class="editor-container">
    <v-card-title>Score</v-card-title>
    <v-card-text class="tab-intro-section">
      <p class="v-messages theme--light v-messages__message scorefont-intro-paragraph">
        The score display shown at the bottom of the screen - set its value with "Score set to"
        or "Score change by" (Actions tab), and its color with the Score category's color
        blocks. Pick a built-in digit font below, or draw a custom one.
      </p>

      <div class="score-font-row">
        <v-select
          v-model="selectedFont"
          :items="scoreFontOptions"
          label="Primary score font"
          class="score-font-select"
        />
        <v-select
          v-model="secondaryFont"
          :items="secondaryFontOptions"
          label="Secondary score font"
          :disabled="secondaryUnavailable"
          class="score-font-select"
        />
        <v-select
          v-model="scorePaddingLines"
          :items="[0, 1, 2]"
          label="Add score padding"
          title="How many extra scanlines of the score row's background color to draw right after the score digits finish, before whatever draws next."
          hide-details
          class="score-padding-field"
        />
      </div>
      <div v-if="secondaryActive" class="score-font-role-row">
        <v-btn-toggle v-model="editingRole" mandatory dense>
          <v-btn small value="primary" title="Draw the primary font below">Edit primary</v-btn>
          <v-btn small value="secondary" title="Draw the secondary font below">Edit secondary</v-btn>
        </v-btn-toggle>
      </div>
      <div class="score-bkcolor-row">
        <color-swatch-picker
          :value="scoreBkColorSwatchValue"
          :fallback-color="backgroundPreviewColor"
          clear-label="Use background color"
          square
          title="Click to set the score row's background color"
          @input="(byte) => (scoreBkColor = byte === null ? 'background' : byte)"
        />
        <span class="score-bkcolor-label">Score background color</span>
        <v-switch
          v-model="scoreFadeEnabled"
          label="Score fade shading (scorefade)"
          title="Adds shading to the score digits. Set the score's color (or keep changing it, e.g. every frame) with the Score category's color blocks on the Actions tab to see the effect - incrementing it continuously produces the classic Atari color-bar look."
          hide-details
          class="score-fade-switch"
        />
      </div>
      <p class="v-messages theme--light v-messages__message">
        Draw the score digits below. Every font can be redrawn: what you draw is kept for the
        selected font only{{ fontIsEdited ? ' (this one has been edited)' : '' }}, and "{{ resetLabel }}"
        brings back its original digits.
      </p>
      <template>
        <div class="score-extras-row">
          <v-switch
            v-model="extraGlyphsEnabled"
            label="Use extra glyphs (10-15)"
            :hint="secondaryActive ? 'Not available while a secondary score font is set.' :
              'Costs 48 extra bytes of ROM space.'"
            :disabled="secondaryActive"
            persistent-hint
            class="option-switch"
          />
        </div>
        <graphic-editor-toolbar class="score-editor-toolbar-row" :active-editor="activeEditor">
          <template v-slot:before-tools>
            <editor-zoom v-model="zoom" class="score-editor-zoom" />
            <pixel-grid-toggle v-model="showPixelGrid" />
          </template>
        </graphic-editor-toolbar>
        <div class="digit-list" :class="{'digit-list-tools-hidden': zoom <= 0.5}">
          <div
            class="digit"
            :style="{width: digitWidth}"
            v-for="(digit, index) in state.digits"
            v-show="index < DECIMAL_DIGIT_COUNT || extraGlyphsEnabled"
            :key="index"
          >
            <div class="digit-label">{{ index }}</div>
            <div
              class="digit-editor"
              :class="{'digit-editor-active': activeEditorIndex === index}"
            >
              <pixel-editor
                :key="activeDigitHeight + '-' + resetToken"
                :width="8"
                :height="activeDigitHeight"
                :aspectRatio="PIXEL_ASPECT"
                v-model="state.digits[index]"
                fgColor="orange"
                :showClearButton="true"
                :name="'score-font-digit-' + index"
                :allowChangingHeight="false"
                :hideToolbar="true"
                :showGrid="showPixelGrid"
                @input="handleChange"
                @activate="(editorInstance) => setActiveEditor(editorInstance, index)"
              >
                <template v-slot:toolbar-end>
                  <v-btn
                    icon
                    small
                    title="Copy this digit's image"
                    class="player-icon-btn-size"
                    @click="() => handleCopyDigit(index)"
                  >
                    <v-icon>mdi-content-copy</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    :disabled="!copiedDigitData"
                    title="Paste copied image onto this digit"
                    class="player-icon-btn-size"
                    @click="() => handlePasteDigit(index)"
                  >
                    <v-icon>mdi-content-paste</v-icon>
                  </v-btn>
                </template>
              </pixel-editor>
            </div>
          </div>
        </div>
        <v-btn class="reset-button" color="secondary" :disabled="!canReset" @click="handleReset">
          <v-icon>mdi-restore</v-icon>
          <div>{{ resetLabel }}</div>
        </v-btn>
      </template>
    </v-card-text>
  </v-card>
</template>
<script>
import {computed, defineComponent, ref, watch} from '@vue/composition-api';

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import EditorZoom from '../components/EditorZoom.vue';
import GraphicEditorToolbar from '../components/GraphicEditorToolbar.vue';
import PixelEditor from '../components/PixelEditor.vue';
import PixelGridToggle from '../components/PixelGridToggle.vue';
import {useConfigurationStorage, usePixelGridOverlayStorage, useScoreFontEditsStorage, useScoreFontStorage,
  useSquishCustomScoreFontStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {colorByteToCss} from '../utils/palette';
import {SCORE_FONT_NAMES} from '../generators/score-fonts';
import {
  CUSTOM_SCORE_FONT,
  DECIMAL_DIGIT_COUNT,
  SQUISH_SCORE_FONT,
  SQUISH_CUSTOM_SCORE_FONT,
  editedScoreFontDigits,
  fontToDigits,
  processScoreFontDefaults,
  scoreFontDigitHeight,
  scoreFontEditKey,
  scoreFontOriginalBytes,
} from '../utils/score-font';

// Score digits are drawn with player graphics, one colour clock per pixel, and
// those 160 clocks are stretched across a 4:3 frame, so on screen each pixel
// ends up twice as wide as it is tall (measured at 1.998:1 in the emulator).
// The grid is square, so this doubles as the preview's width-to-height ratio.
const PIXEL_ASPECT = 2;

// Width of one digit editor at 100% zoom.
const DIGIT_BASE_WIDTH = 120;

const BASE_SCORE_FONT_OPTIONS = [
  {text: 'Default', value: ''},
  ...SCORE_FONT_NAMES.map((name) => ({text: name, value: name})),
];
const CUSTOM_SCORE_FONT_OPTION = {text: 'Custom (drawn below)', value: CUSTOM_SCORE_FONT};

// backgroundrealcolor's  hardcoded Setup default (see bbasic.bb.hbs) -
// used only for the "Use background color" preview swatch below, since
// there's no per-project stored value to read it from otherwise (a project
// with no "Background: set color" block never changes it from this).
const BACKGROUND_DEFAULT_COLOR_BYTE = 0xC4;

// Same "module-scope ref, not per-instance state" reasoning as
// PlayerEditor.vue's copiedFrameData - a copied digit survives
// navigating away from this tab and back (this component is destroyed/
// recreated on navigation - see hooks/collapse.js's comment on that
// lifecycle elsewhere).
const copiedDigitData = ref(null);

export default defineComponent({
  components: {ColorSwatchPicker, EditorZoom, GraphicEditorToolbar, PixelEditor, PixelGridToggle},
  setup() {
    const scoreFontStorage = useScoreFontStorage();
    const squishCustomScoreFontStorage = useSquishCustomScoreFontStorage();
    const scoreFontEditsStorage = useScoreFontEditsStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('scorefont', 1.5);
    // Shared with every other tab's pixel grid toggle (see
    // PixelGridToggle.vue's comment) - not per-tab state.
    const showPixelGrid = usePixelGridOverlayStorage();
    const digitWidth = computed(() => `${Math.round(DIGIT_BASE_WIDTH * zoom.value)}px`);

    // Squish (and Squish Custom, which starts from Squish's  digits and is
    // then editable below like the regular Custom font) shrinks the score
    // row to make room for the Text Minikernel's  text lines underneath
    // it - always offered, even with no Text Minikernel block placed yet,
    // since a smaller score font is a reasonable choice by itself.
    // A font with changes drawn for it is marked as edited (Custom and Squish Custom are all
    // drawing, so they are not).
    // The DPC+ kernel has no secondary font yet.
    const isDpcPlus = computed(() => ((configurationStorage.value || {}).kernel === 'dpcplus'));
    const scoreFontOptions = computed(() => [...BASE_SCORE_FONT_OPTIONS,
      {text: 'Squish (compact - shrinks the score row)', value: SQUISH_SCORE_FONT},
      {text: 'Squish Custom (compact - drawn below)', value: SQUISH_CUSTOM_SCORE_FONT},
      CUSTOM_SCORE_FONT_OPTION].map((option) => (editedScoreFontDigits(option.value) ?
        {...option, text: `${option.text} (edited)`} : option)));

    // Only this one option is owned here, so it is merged into the stored
    // configuration rather than replacing it.
    const selectedFont = computed({
      get() {
        try {
          return (configurationStorage.value || {}).scoreFont || '';
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return '';
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          scoreFont: value,
        };
      },
    });

    // The secondary font: "" for none, "default" for the default font, otherwise a font name. It has the
    // ten digits only, and shares one page of ROM with the primary font (see buildScoreFontOverride).
    const secondaryFont = computed({
      get() {
        return (configurationStorage.value || {}).secondaryScoreFont || '';
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          secondaryScoreFont: value,
        };
      },
    });
    const isSquishFont = (font) => font === SQUISH_SCORE_FONT || font === SQUISH_CUSTOM_SCORE_FONT;
    const secondaryUnavailable = computed(() => isSquishFont(selectedFont.value) || isDpcPlus.value);
    const secondaryActive = computed(() => !!secondaryFont.value && !secondaryUnavailable.value);
    const secondaryFontOptions = computed(() => [
      {text: 'None', value: ''},
      {text: 'Default', value: 'default'},
      ...SCORE_FONT_NAMES.map((name) => ({text: name, value: name})),
      CUSTOM_SCORE_FONT_OPTION,
    ].map((option) => (option.value && editedScoreFontDigits(option.value === 'default' ? '' : option.value) ?
      {...option, text: `${option.text} (edited)`} : option)));
    // Which of the two fonts the editor below draws.
    const editingRole = ref('primary');
    const editingFont = computed(() => (editingRole.value === 'secondary' && secondaryActive.value ?
      (secondaryFont.value === 'default' ? '' : secondaryFont.value) : selectedFont.value));

    // The score row's  background color, independent of the playfield -
    // only takes effect with the standard kernel's  generic "minikernel"
    // score-row hook (see generators/bbasic/score.js's
    // generateScoreBkColorAsm/generateScoreBkColorRuntimeDims). Three
    // possible states: a byte (an explicitly picked palette color), the
    // string 'background' (explicitly track the live backgroundrealcolor
    // system variable - see backgroundPreviewColor below), or unset, which
    // is treated the SAME as 'background' (see
    // Blockly.BBasic.scoreBkColorIsBackground's  comment in generators/
    // bbasic.js - a project that never visited this picker should match its
    // actual background, not default to black underneath the score row) -
    // normalized to the literal string here too, so the swatch always shows
    // a real, concrete selection (the "Use background color" one) instead
    // of looking unset.
    const scoreBkColor = computed({
      get() {
        try {
          const value = (configurationStorage.value || {}).scoreBkColor;
          return value == null ? 'background' : value;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return 'background';
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          scoreBkColor: value,
        };
      },
    });

    // Adds shading to the score digits (const scorefade = 1 - see
    // generateConfiguration in generators/bbasic.js) - a plain boolean
    // config field, same computed get/set shape as scoreBkColor above.
    const scoreFadeEnabled = computed({
      get() {
        try {
          return !!(configurationStorage.value || {}).enableScoreFade;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return false;
        }
      },

      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          enableScoreFade: value,
        };
      },
    });

    // 'background' has no palette swatch of its  to highlight - the
    // picker only understands a byte or null (its "nothing selected"
    // state), so that sentinel is translated to/from null here rather than
    // taught to the shared component.
    const scoreBkColorSwatchValue = computed(() =>
      scoreBkColor.value === 'background' ? null : scoreBkColor.value);

    // A preview swatch color for the "Use background color" option -
    // backgroundrealcolor's  hardcoded Setup default (there's no other
    // stored value to read ahead of time; a "Background: set color" block
    // could change it at runtime, which this static preview can't reflect).
    // Both generateScoreBkColorRuntimeDims (Text Minikernel active) and
    // generateScoreBkColorAsm (inactive) alias scorebkcolor directly onto
    // the live backgroundrealcolor system variable for this option, so the
    // ACTUAL score row keeps tracking its real current value, live,
    // including any later runtime change - this swatch is just a best-guess
    // preview of that.
    const backgroundPreviewColor = computed(() => colorByteToCss(BACKGROUND_DEFAULT_COLOR_BYTE));

    // Squish Custom edits a separate set of digits from the regular Custom
    // font (different storage key, seeded from Squish's  compact shapes
    // instead of the standard 8-row digits), so the editor below switches
    // which one it's bound to based on the current selection.
    const isSquishCustomSelected = computed(() => editingFont.value === SQUISH_CUSTOM_SCORE_FONT);
    // Explicit, stored opt-in (see utils/score-font.js's
    // customScoreFontExtraGlyphsEnabled/trimUnusedExtraGlyphs, the actual
    // source of truth this reads/writes the same configuration key as) -
    // off by default, so a project that's never visited this toggle keeps
    // paying nothing extra for glyphs 10-15, and hiding those cards
    // whenever it's off (see the v-show above) keeps "not shown" and "not
    // compiled into the ROM" always in agreement.
    const extraGlyphsEnabled = computed({
      get() {
        try {
          return !!(configurationStorage.value || {}).scoreFontExtraGlyphsEnabled;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return false;
        }
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          scoreFontExtraGlyphsEnabled: value,
        };
      },
    });
    // How many extra blank scanlines (0, 1, or 2) the score row draws of its
    // background color right after the digits finish (see
    // generators/bbasic.js's  scorePaddingConfigurationCode, which emits
    // "const scorepaddinglines = N" - text12a.asm's
    // "if scorepaddinglines >= N" checks read that). 0 by default - a
    // project that's never visited this dropdown keeps its existing frame
    // timing unchanged.
    const scorePaddingLines = computed({
      get() {
        try {
          const value = (configurationStorage.value || {}).scorePaddingLines;
          return value == null ? 0 : value;
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return 0;
        }
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          scorePaddingLines: value,
        };
      },
    });
    // Custom and Squish Custom keep their digits in separate storage; every other font in
    // the scoreFontEdits storage (see scoreFontEditKey in utils/score-font.js).
    const editKey = computed(() => scoreFontEditKey(editingFont.value));
    const ownStorage = computed(() =>
      isSquishCustomSelected.value ? squishCustomScoreFontStorage : scoreFontStorage);
    const originalBytes = computed(() => scoreFontOriginalBytes(editingFont.value));
    // Squish and Squish Custom are 5 rows tall instead of the usual 8 - Squish never reads the
    // top 3 rows at runtime (see SQUISH_DIGIT_HEIGHT), so there's nothing useful to draw there.
    const activeDigitHeight = computed(() => scoreFontDigitHeight(editingFont.value));
    const fontIsEdited = computed(() => editKey.value !== null && !!editedScoreFontDigits(editingFont.value));
    const canReset = computed(() => editKey.value === null || fontIsEdited.value);
    const resetLabel = computed(() =>
      editKey.value === null ? 'Reset to default digits' : 'Reset to original digits');

    // Tracks whichever digit's PixelEditor instance was last clicked
    // into (see its "activate" event, emitted from PixelEditor.vue's
    // handleActivate) - the single toolbar above (Eraser/Pencil/Undo/Redo/
    // Export/Import) acts on THIS digit, since every digit's
    // per-instance toolbar is now hidden (hideToolbar on the pixel-editor
    // below) in favor of this one shared row. No card-selection fallback is
    // needed here (unlike PlayerEditor.vue's effectiveFrameEditor) -
    // there's no way to "select" a digit other than clicking directly into
    // its PixelEditor card (no separate header/name row to click that
    // wouldn't also activate it), so a plain activeEditor is enough.
    const activeEditor = ref(null);
    const activeEditorIndex = ref(null);
    const setActiveEditor = (editorInstance, index) => {
      activeEditor.value = editorInstance;
      activeEditorIndex.value = index;
    };

    // PixelEditor only reads its "value" prop once, on mount - it has no
    // watcher to notice external changes after that (e.g. dragging pixels
    // updates it, via handleChange, but writes from outside the component
    // don't). Reset replaces all the digits' data at once from here, so
    // resetToken is bumped into the editors' :key below to force them to
    // remount and pick the new data up, the same trick used for
    // activeDigitHeight when switching between fonts.
    const resetToken = ref(0);

    // The digits being edited: a working copy of the selected font's, loaded when the font
    // changes (the stored digits for Custom/Squish Custom or an edited font, otherwise the
    // font's original ones), and saved back by handleChange. A font that was never edited
    // stores nothing until the first change, so just looking at one costs nothing.
    const working = ref({digits: []});
    const loadWorking = () => {
      try {
        if (editKey.value === null) {
          working.value = processScoreFontDefaults(ownStorage.value, originalBytes.value, activeDigitHeight.value);
        } else {
          const edited = editedScoreFontDigits(editingFont.value);
          working.value = {
            digits: edited ? JSON.parse(JSON.stringify(edited)) :
              fontToDigits(originalBytes.value, activeDigitHeight.value),
          };
        }
      } catch (e) {
        console.error('Error loading the score font from local storage', e);
        working.value = {digits: fontToDigits(originalBytes.value, activeDigitHeight.value)};
      }
    };
    watch(editingFont, () => {
      loadWorking();
      resetToken.value++;
    }, {immediate: true});

    const state = computed(() => working.value);

    const persist = () => {
      if (editKey.value === null) {
        ownStorage.value.value = working.value;
        return;
      }
      const stored = scoreFontEditsStorage.value;
      scoreFontEditsStorage.value = {
        ...(stored || {}),
        fonts: {
          ...((stored && stored.fonts) || {}),
          [editKey.value]: {digits: JSON.parse(JSON.stringify(working.value.digits))},
        },
      };
    };

    // The pixel editor mutates its matrix in place, so the whole font is saved back.
    const handleChange = () => {
      persist();
    };

    // Same "whole image" copy/paste pair as PlayerEditor.vue's
    // handleCopyFrame/handlePasteFrame - digits have no row colors or other
    // per-cell metadata to carry along, just the plain pixel matrix.
    const handleCopyDigit = (index) => {
      copiedDigitData.value = structuredClone(state.value.digits[index]);
    };
    const handlePasteDigit = (index) => {
      if (!copiedDigitData.value) return;
      state.value.digits[index] = structuredClone(copiedDigitData.value);
      handleChange();
      // PixelEditor only reads its "value" prop once, on mount (see
      // resetToken's comment right below) - pasting writes the new
      // pixels from OUTSIDE the target digit's editor instance, so
      // without this it wouldn't actually show up until something else
      // happened to force that digit to remount.
      resetToken.value++;
    };

    const handleReset = () => {
      if (editKey.value === null) {
        working.value = {digits: fontToDigits(originalBytes.value, activeDigitHeight.value)};
        persist();
      } else {
        const stored = scoreFontEditsStorage.value || {};
        const fonts = {...(stored.fonts || {})};
        delete fonts[editKey.value];
        scoreFontEditsStorage.value = {...stored, fonts};
        loadWorking();
      }
      resetToken.value++;
    };

    return {
      state,
      handleChange,
      handleReset,
      selectedFont,
      secondaryFont,
      secondaryFontOptions,
      secondaryUnavailable,
      secondaryActive,
      editingRole,
      scoreBkColor,
      scoreBkColorSwatchValue,
      scoreFadeEnabled,
      backgroundPreviewColor,
      scoreFontOptions,
      activeDigitHeight,
      resetToken,
      PIXEL_ASPECT,
      zoom,
      showPixelGrid,
      digitWidth,
      extraGlyphsEnabled,
      scorePaddingLines,
      fontIsEdited,
      canReset,
      resetLabel,
      DECIMAL_DIGIT_COUNT,
      activeEditor, activeEditorIndex, setActiveEditor,
      copiedDigitData, handleCopyDigit, handlePasteDigit,
    };
  },
});
</script>
<style scoped>
/* Same as Configuration.vue's .option-switch rule - Vuetify aligns a
   switch's hint under the toggle track by default; indent it to line up
   under the label text instead, matching the toggle's width. */
.option-switch >>> .v-messages {
  margin-left: 46px;
}

.score-font-row {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 16px;
}

.score-font-select {
  flex: 1 1 150px;
  max-width: 320px;
  min-width: 0;
}

.score-font-role-row {
  margin: 4px 0 28px;
}

.score-extras-row {
  display: flex;
  align-items: flex-start;
  gap: 16px;
  /* Closer to the text above it. */
  margin-top: -10px;
}

.score-padding-field {
  flex: 0 1 150px;
  min-width: 0;
}

/* Breathing room from the "Use extra glyphs" switch's  hint text
   ("Costs 48 extra bytes of ROM space.") directly above - the two sat flush
   against each other otherwise. */
/* Unlike PlayerEditor.vue/BackgroundEditor.vue/TitleScreenEditor.vue, this
   tab never had its self-scrolling wrapper - it relied on some outer
   ancestor (app-main's overflow) to scroll instead, which is why the
   toolbar row below couldn't stick to "the top of this tab" the way theirs
   do (there was no boundary of this tab's to stick to in the first
   place). Same position: absolute + overflow: auto trick as those other
   tabs' .editor-container. */
.editor-container {
  position: absolute;
  overflow: auto;
  top: 0;
  bottom: 0;
  width: 100%;
}

/* Attribute passthrough - Vue applies a non-prop class/attribute given to a
   component directly onto ITS root element, so this reaches
   GraphicEditorToolbar.vue's outer div despite living in a different
   file - restores the gap between the switches row above and the toolbar
   that this tab used to set directly by itself (now-removed) wrapper. */
.score-editor-toolbar-row {
  margin-top: 12px;
}

.score-editor-zoom {
  margin-bottom: 0;
}

/* Marks which digit the shared toolbar above currently acts on - same
   border-color + outline treatment as every other tab's "-selected"
   card highlight (App.vue's shared outlined-card border rule) and
   PlayerEditor.vue's identical per-frame highlight. */
.digit-editor-active >>> .v-card {
  border-color: var(--v-primary-base, #1976d2) !important;
  outline: 2px solid var(--v-primary-base, #1976d2) !important;
}

.score-bkcolor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  /* Sits a little below the Score font selects. */
  margin-top: 4px;
  margin-bottom: 16px;
}

/* Vuetify's  switch margin-top (meant for stacking below other fields)
   otherwise pushes this out of line with the swatch/label sharing this same
   row - same override TextEditor.vue's .text-columns-switch uses for
   an identical inline-row switch. margin-left separates it from the label
   text right before it. */
.score-fade-switch {
  margin-top: 0 !important;
  margin-left: 16px;
  padding-top: 0 !important;
  flex: 0 0 auto;
}

/* Matches .score-bkcolor-label's  explicit size below - Vuetify's switch
   label otherwise renders at its default size, which read visibly
   smaller/larger than the plain-text label sharing this same row. */
.score-fade-switch >>> .v-label {
  font-size: 1rem;
}

.score-bkcolor-label {
  font-size: 1rem;
}

.digit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
}

/* At 50% zoom (the lowest level - see hooks/zoom.js's ZOOM_LEVELS) each
   digit is too small for the Copy/Paste/Clear row below its graphic to fit
   without the icons overlapping or the card growing wider than the graphic
   itself - hidden here rather than shrinking them further, since they're
   still reachable via the shared toolbar at the top of the tab regardless
   of zoom level. */
.digit-list-tools-hidden >>> .pixel-editor-hidden-toolbar-row {
  display: none;
}

/* Width is set inline from the zoom factor. */

.digit-label {
  font-weight: bold;
  text-align: center;
}

.digit-editor {
  position: relative;
}

.reset-button {
  margin-top: 24px;
}

/* .player-icon-btn-size's size/disabled-opacity/icon-font-size rules -
   see App.vue's shared, unscoped copy. */
</style>
