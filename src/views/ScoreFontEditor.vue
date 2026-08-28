<template>
  <v-card flat>
    <v-card-title>Score</v-card-title>
    <v-card-text>
      <v-select
        v-model="selectedFont"
        :items="scoreFontOptions"
        label="Score font"
      />
      <div class="score-bkcolor-row">
        <color-swatch-picker
          :value="scoreBkColorSwatchValue"
          :fallback-color="backgroundPreviewColor"
          clear-label="Use background color"
          title="Click to set the score row's own background color"
          @input="(byte) => (scoreBkColor = byte === null ? 'background' : byte)"
        />
        <span class="score-bkcolor-label">Score background color</span>
      </div>
      <p v-if="isEditableFontSelected" class="v-messages theme--light v-messages__message">
        Draw the ten score digits below. They are used when the score font is
        set to <strong>Custom</strong> or <strong>Squish Custom</strong>.
      </p>
      <p v-else class="v-messages theme--light v-messages__message">
        Set the score font to <strong>Custom</strong> or <strong>Squish Custom</strong> above to draw your own
        digits - {{ selectedFont ? 'the selected preset' : 'Default' }} is a fixed, built-in font with nothing
        to edit here.
      </p>
      <template v-if="isEditableFontSelected">
        <v-switch
          v-if="showExtraGlyphs"
          v-model="extraGlyphsEnabled"
          label="Use extra glyphs (10-15)"
          hint="Costs 48 extra bytes of ROM space."
          persistent-hint
          class="option-switch"
        />
        <editor-zoom v-model="zoom" class="score-editor-zoom" />
        <div class="digit-list">
          <div
            class="digit"
            :style="{width: digitWidth}"
            v-for="(digit, index) in state.digits"
            v-show="index < DECIMAL_DIGIT_COUNT || (showExtraGlyphs && extraGlyphsEnabled)"
            :key="index"
          >
            <div class="digit-label">{{ index }}</div>
            <div class="digit-editor">
              <pixel-editor
                :key="activeDigitHeight + '-' + resetToken"
                :width="8"
                :height="activeDigitHeight"
                :aspectRatio="PIXEL_ASPECT"
                v-model="state.digits[index]"
                fgColor="#f2691e"
                :showClearButton="true"
                :name="'score-font-digit-' + index"
                :allowChangingHeight="false"
                @input="handleChange"
              />
            </div>
          </div>
        </div>
        <v-btn class="reset-button" color="secondary" @click="handleReset">
          <v-icon>mdi-restore</v-icon>
          <div>Reset to default digits</div>
        </v-btn>
      </template>
    </v-card-text>
  </v-card>
</template>
<script>
import {computed, defineComponent, ref} from '@vue/composition-api';

import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import EditorZoom from '../components/EditorZoom.vue';
import PixelEditor from '../components/PixelEditor.vue';
import {useConfigurationStorage, useScoreFontStorage, useSquishCustomScoreFontStorage} from '../hooks/project';
import {useEditorZoom} from '../hooks/zoom';
import {colorByteToCss} from '../utils/palette';
import {SCORE_FONT_NAMES} from '../generators/score-fonts';
import {
  CUSTOM_SCORE_FONT,
  DECIMAL_DIGIT_COUNT,
  DEFAULT_SCORE_FONT,
  DIGIT_HEIGHT,
  SQUISH_SCORE_FONT,
  SQUISH_CUSTOM_SCORE_FONT,
  SQUISH_DEFAULT_SCORE_FONT,
  SQUISH_DIGIT_HEIGHT,
  fontToDigits,
  processScoreFontDefaults,
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

// backgroundrealcolor's own hardcoded Setup default (see bbasic.bb.hbs) -
// used only for the "Use background color" preview swatch below, since
// there's no per-project stored value to read it from otherwise (a project
// with no "Background: set color" block never changes it from this).
const BACKGROUND_DEFAULT_COLOR_BYTE = 0xC4;

export default defineComponent({
  components: {ColorSwatchPicker, EditorZoom, PixelEditor},
  setup() {
    const scoreFontStorage = useScoreFontStorage();
    const squishCustomScoreFontStorage = useSquishCustomScoreFontStorage();
    const configurationStorage = useConfigurationStorage();
    const zoom = useEditorZoom('scorefont');
    const digitWidth = computed(() => `${Math.round(DIGIT_BASE_WIDTH * zoom.value)}px`);

    // Squish (and Squish Custom, which starts from Squish's own digits and is
    // then editable below like the regular Custom font) shrinks the score
    // row to make room for the Text Minikernel's own text lines underneath
    // it - always offered, even with no Text Minikernel block placed yet,
    // since a smaller score font is a reasonable choice on its own.
    const scoreFontOptions = computed(() => [...BASE_SCORE_FONT_OPTIONS,
      {text: 'Squish (compact - shrinks the score row)', value: SQUISH_SCORE_FONT},
      {text: 'Squish Custom (compact - drawn below)', value: SQUISH_CUSTOM_SCORE_FONT},
      CUSTOM_SCORE_FONT_OPTION]);

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

    // The score row's own background color, independent of the playfield -
    // only takes effect with the standard kernel's own generic "minikernel"
    // score-row hook (see generators/bbasic/score.js's
    // generateScoreBkColorAsm/generateScoreBkColorRuntimeDims). Three
    // possible states: a byte (an explicitly picked palette color), the
    // string 'background' (explicitly track the live backgroundrealcolor
    // system variable - see backgroundPreviewColor below), or unset, which
    // is treated the SAME as 'background' (see
    // Blockly.BBasic.scoreBkColorIsBackground's own comment in generators/
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

    // 'background' has no palette swatch of its own to highlight - the
    // picker only understands a byte or null (its own "nothing selected"
    // state), so that sentinel is translated to/from null here rather than
    // taught to the shared component.
    const scoreBkColorSwatchValue = computed(() =>
      scoreBkColor.value === 'background' ? null : scoreBkColor.value);

    // A preview swatch color for the "Use background color" option -
    // backgroundrealcolor's own hardcoded Setup default (there's no other
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
    // font (different storage key, seeded from Squish's own compact shapes
    // instead of the standard 8-row digits), so the editor below switches
    // which one it's bound to based on the current selection.
    const isSquishCustomSelected = computed(() => selectedFont.value === SQUISH_CUSTOM_SCORE_FONT);
    // Gates the 6 extra glyph cards (10-15, see DECIMAL_DIGIT_COUNT's own
    // comment) below - only the two fonts a project can actually EDIT get
    // them; every preset (and plain Squish) is a fixed, non-editable
    // bitmap already, so there's nothing useful to draw for slots those
    // fonts don't expose in the compiled ROM anyway (see
    // buildScoreFontOverride/buildSquishScoreFontOverride in
    // utils/score-font.js - only CUSTOM/SQUISH_CUSTOM ever splice them in
    // at all).
    const showExtraGlyphs = computed(() =>
      selectedFont.value === CUSTOM_SCORE_FONT || isSquishCustomSelected.value);
    // Same condition as showExtraGlyphs above, but gating the base 0-9 digit
    // editors themselves (see the template's own v-if on .digit-list) - only
    // Custom/Squish Custom are actually EDITABLE fonts (backed by real
    // storage this editor writes to); Default and every named preset are
    // fixed, compiled-in bitmaps (see generators/score-fonts.js) with no
    // storage of their own to write to at all. Before this, the digit grid
    // stayed visible and editable regardless of selectedFont - editing it
    // always silently wrote to the Custom (or Squish Custom) font's own
    // storage no matter what was actually selected, which looked like (and
    // was reported as) "editing Default" even though Default itself was
    // never actually touched - just confusingly implied to be, and any
    // edits made this way were invisible until Custom was later selected.
    const isEditableFontSelected = computed(() =>
      selectedFont.value === CUSTOM_SCORE_FONT || isSquishCustomSelected.value);
    // Explicit, stored opt-in (see utils/score-font.js's own
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
    const activeScoreFontStorage = computed(() =>
      isSquishCustomSelected.value ? squishCustomScoreFontStorage : scoreFontStorage);
    const activeDefaultFont = computed(() =>
      isSquishCustomSelected.value ? SQUISH_DEFAULT_SCORE_FONT : DEFAULT_SCORE_FONT);
    // Squish Custom's editor is 5 rows tall instead of the usual 8 - Squish
    // never reads the top 3 rows at runtime (see SQUISH_DIGIT_HEIGHT), so
    // there's nothing useful to draw there.
    const activeDigitHeight = computed(() =>
      isSquishCustomSelected.value ? SQUISH_DIGIT_HEIGHT : DIGIT_HEIGHT);

    const state = computed({
      get() {
        try {
          return processScoreFontDefaults(activeScoreFontStorage.value, activeDefaultFont.value, activeDigitHeight.value);
        } catch (e) {
          console.error('Error loading the score font from local storage', e);
          return {digits: fontToDigits(activeDefaultFont.value, activeDigitHeight.value)};
        }
      },

      set(newState) {
        activeScoreFontStorage.value.value = newState;
      },
    });

    // The pixel editor mutates its matrix in place, so the whole object is
    // reassigned to push it back into storage.
    const handleChange = () => {
      state.value = state.value;
    };

    // PixelEditor only reads its "value" prop once, on mount - it has no
    // watcher to notice external changes after that (e.g. dragging pixels
    // updates it, via handleChange, but writes from outside the component
    // don't). Reset replaces all ten digits' data at once from here, so
    // resetToken is bumped into the editors' :key below to force them to
    // remount and pick the new data up, the same trick already used for
    // activeDigitHeight when switching between Custom and Squish Custom.
    const resetToken = ref(0);
    const handleReset = () => {
      state.value = {digits: fontToDigits(activeDefaultFont.value, activeDigitHeight.value)};
      resetToken.value++;
    };

    return {
      state,
      handleChange,
      handleReset,
      selectedFont,
      scoreBkColor,
      scoreBkColorSwatchValue,
      backgroundPreviewColor,
      scoreFontOptions,
      activeDigitHeight,
      resetToken,
      PIXEL_ASPECT,
      zoom,
      digitWidth,
      showExtraGlyphs,
      extraGlyphsEnabled,
      isEditableFontSelected,
      DECIMAL_DIGIT_COUNT,
    };
  },
});
</script>
<style scoped>
/* Same as Configuration.vue's own .option-switch rule - Vuetify aligns a
   switch's hint under the toggle track by default; indent it to line up
   under the label text instead, matching the toggle's own width. */
.option-switch >>> .v-messages {
  margin-left: 46px;
}

/* Breathing room from the "Use extra glyphs" switch's own hint text
   ("Costs 48 extra bytes of ROM space.") directly above - the two sat flush
   against each other otherwise. */
.score-editor-zoom {
  margin-top: 12px;
}

.score-bkcolor-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  margin-bottom: 16px;
}

.digit-list {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
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
</style>
