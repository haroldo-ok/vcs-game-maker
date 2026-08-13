<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>Sound</v-card-title>
      <v-card-text>
        <div class="dim-controls">
          <v-switch
            v-model="dimSoundFx"
            label="DIM"
            hide-details
            class="dim-switch"
          />
          <v-slider
            v-model="dimSoundFxPercent"
            :disabled="!dimSoundFx"
            min="0"
            max="100"
            step="1"
            hide-details
            class="dim-slider"
          />
          <span class="dim-percent">{{ dimSoundFxPercent }}%</span>
        </div>
        <p class="dim-hint">
          When DIM is on, every sound effect plays at the volume above, as a
          percentage of its own set volume. Off: sound effects play at their
          own set volume.
        </p>
        <v-list class="soundfx-list">
          <v-list-item
            class="entry-list-item"
            v-for="(soundEffect, index) in state.soundEffects"
            v-bind:key="soundEffect.id"
          >
            <v-list-item-content>
              <v-card
                outlined
                class="soundfx-card"
                :class="dragCardClass(index)"
                v-on="dragTargetListeners(index)"
              >
                <div
                  class="soundfx-drag-handle"
                  title="Drag to reorder"
                  v-bind="dragAttrs(index)"
                  v-on="dragHandleListeners(index)"
                />
                <v-btn
                  :title="isCollapsed(soundEffect) ? 'Expand this sound effect' : 'Collapse this sound effect'"
                  icon
                  small
                  absolute
                  top
                  left
                  class="soundfx-collapse-btn"
                  @click="() => toggleCollapsed(soundEffect)"
                >
                  <v-icon>{{ isCollapsed(soundEffect) ? 'mdi-chevron-down' : 'mdi-chevron-up' }}</v-icon>
                </v-btn>
                <div class="soundfx-id-badge">ID: {{ soundEffect.id }}</div>

                <div class="soundfx-toolbar-top-right">
                  <v-btn
                    icon
                    small
                    title="Export sound effect to .JSON file"
                    class="soundfx-stop-btn soundfx-icon-btn-size"
                    @click="() => handleExportSoundEffect(soundEffect)"
                  >
                    <v-icon>mdi-export</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Import sound effect from .JSON file"
                    class="soundfx-stop-btn soundfx-icon-btn-size"
                    @click="() => handleImportSoundEffect(soundEffect)"
                  >
                    <v-icon>mdi-import</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Stop the sound preview"
                    class="soundfx-stop-btn soundfx-icon-btn-size"
                    @click="handleStopPreview"
                  >
                    <v-icon>mdi-stop</v-icon>
                  </v-btn>
                  <v-btn
                    icon
                    small
                    title="Play this sound effect"
                    class="soundfx-play-btn soundfx-icon-btn-size"
                    @click="() => handlePlaySoundEffect(soundEffect)"
                  >
                    <v-icon>mdi-play</v-icon>
                  </v-btn>
                </div>

                <v-card-text class="soundfx-name-section">
                  <div class="soundfx-name-row">
                    <color-swatch-picker
                      class="soundfx-color-picker"
                      :value="soundEffect.color"
                      :fallback-color="autoInstrumentColor(soundEffect.id)"
                      title="Click to set this instrument's note color on the Music tab"
                      @input="(byte) => handleSetSoundEffectColor(soundEffect, byte)"
                    />
                    <v-text-field
                      class="soundfx-name-field"
                      label="Sound name"
                      v-model="soundEffect.name"
                      @change="handleChildChange"
                    />
                  </div>
                </v-card-text>

                <v-card-text v-if="!isCollapsed(soundEffect)" class="soundfx-fields-section">
                  <div class="soundfx-fields">
                    <v-select
                      label="Sound type"
                      v-model="soundEffect.audc"
                      :items="audcOptionItems"
                      @change="() => handleAudcChange(soundEffect)"
                      class="soundfx-audc"
                    />
                    <v-select
                      v-if="audcHasTunableNotes(soundEffect.audc)"
                      label="Frequency"
                      title="Limited to the AUDF values that play a clean, in-tune note on this sound type - same set the piano roll allows on the Music tab."
                      v-model.number="soundEffect.audf"
                      :items="frequencyItems(soundEffect.audc)"
                      @change="handleChildChange"
                      class="soundfx-number"
                    />
                    <v-text-field
                      v-else
                      label="Frequency"
                      v-model.number="soundEffect.audf"
                      type="number"
                      min="0"
                      max="31"
                      @change="handleChildChange"
                      class="soundfx-number"
                    />
                    <v-text-field
                      label="Volume"
                      v-model.number="soundEffect.audv"
                      type="number"
                      min="0"
                      max="15"
                      @change="handleChildChange"
                      class="soundfx-number"
                    />
                    <v-text-field
                      label="Duration"
                      v-model.number="soundEffect.duration"
                      type="number"
                      min="0"
                      @change="handleChildChange"
                      class="soundfx-number"
                    />
                    <!-- Fade and Arpeggio are both temporarily hidden here
                    (not removed - see processSoundEffectsStorageDefaults'
                    own comment in blocks/soundfx.js, which forces both off
                    everywhere regardless of this UI): each one's generated
                    per-channel dispatch code could grow large enough to blow
                    ROM capacity on some projects. -->
                    <v-spacer />
                    <v-menu
                      v-if="state.soundEffects.length > 1"
                      top
                    >
                      <template v-slot:activator="{ on, attrs }">
                        <v-btn
                          title="Delete this sound effect"
                          icon
                          small
                          class="soundfx-delete-btn delete-icon-btn soundfx-icon-btn-size"
                          v-bind="attrs"
                          v-on="on"
                        >
                          <v-icon>mdi-delete</v-icon>
                        </v-btn>
                      </template>

                      <v-card>
                        <v-card-title>Delete this sound effect?</v-card-title>
                        <v-list>
                          <v-list-item @click="handleDeleteSoundEffect(soundEffect)">
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
                  </div>
                </v-card-text>

                <!-- soundfx-fields-section (above) covers this when expanded, right
                     next to Fade - only needed here as its own row for the collapsed
                     case, where that whole section is hidden. -->
                <v-card-text v-if="isCollapsed(soundEffect)" class="soundfx-delete-section">
                  <v-menu
                    v-if="state.soundEffects.length > 1"
                    top
                  >
                    <template v-slot:activator="{ on, attrs }">
                      <v-btn
                        title="Delete this sound effect"
                        icon
                        small
                        class="soundfx-delete-btn delete-icon-btn soundfx-icon-btn-size"
                        v-bind="attrs"
                        v-on="on"
                      >
                        <v-icon>mdi-delete</v-icon>
                      </v-btn>
                    </template>

                    <v-card>
                      <v-card-title>Delete this sound effect?</v-card-title>
                      <v-list>
                        <v-list-item @click="handleDeleteSoundEffect(soundEffect)">
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
                </v-card-text>
              </v-card>
            </v-list-item-content>
          </v-list-item>
        </v-list>
      </v-card-text>
    </v-card>

    <v-btn
      class="add-soundfx-buttom"
      color="primary"
      title="Add sound effect"
      dark
      absolute
      right
      fab
      @click="handleAddSoundEffect"
    >
      <v-icon>mdi-plus</v-icon>
    </v-btn>
  </div>
</template>
<script>
import {computed, defineComponent, getCurrentInstance} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useConfigurationStorage, useSoundEffectsStorage} from '../hooks/project';
import {AUDC_OPTIONS} from '../blocks/sound';
import {DEFAULT_SOUND_EFFECTS, processSoundEffectsStorageDefaults, ARPEGGIO_DIVISION_OPTIONS,
  DEFAULT_ARPEGGIO_DIVISION, DEFAULT_ARPEGGIO_INTERVAL, MIN_ARPEGGIO_INTERVAL,
  MAX_ARPEGGIO_INTERVAL, DEFAULT_ARPEGGIO_RANGE, ARPEGGIO_RANGE_OPTIONS,
  FADE_LENGTH_OPTIONS} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {previewSoundEffect, stopSoundEffectPreview} from '../utils/sound-preview';
import {autoInstrumentColor} from '../utils/instrument-colors';
import {audcHasTunableNotes, notesForAudc} from '../utils/music-notes';
import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';

export default defineComponent({
  components: {ColorSwatchPicker},
  setup() {
    const soundEffectsStorage = useSoundEffectsStorage();
    const configurationStorage = useConfigurationStorage();
    const dimSoundFx = computed({
      get() {
        return !!(configurationStorage.value || {}).dimSoundFx;
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          dimSoundFx: value,
        };
      },
    });
    const dimSoundFxPercent = computed({
      get() {
        return (configurationStorage.value || {}).dimSoundFxPercent ?? DEFAULT_DIM_PERCENT;
      },
      set(value) {
        configurationStorage.value = {
          ...(configurationStorage.value || {}),
          dimSoundFxPercent: value,
        };
      },
    });
    const state = computed({
      get() {
        try {
          return processSoundEffectsStorageDefaults(soundEffectsStorage);
        } catch (e) {
          console.error('Error loading sound effects from local storage', e);
          return DEFAULT_SOUND_EFFECTS;
        }
      },

      set(newState) {
        soundEffectsStorage.value = newState;
      },
    });

    const handleChildChange = () => {
      state.value = state.value;
    };

    const {isCollapsed, toggleCollapsed} = useCollapsedIds('soundfx');

    // Card reordering (see hooks/drag-reorder.js and TextEditor.vue's own
    // first use of this same hook) - sound effects are already referenced
    // everywhere by their own permanent id (see findSoundEffectById/
    // buildSoundEffectOptions in blocks/soundfx.js), never by array
    // position, so unlike the Text tab this needed no separate
    // display-order/ROM-order decoupling work - reordering is already safe.
    const {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners} = useDragReorder(
        () => state.value.soundEffects,
        (items) => {
          state.value.soundEffects = items;
          handleChildChange();
        },
    );

    const instance = getCurrentInstance();
    const handleAddSoundEffect = () => {
      const soundEffects = state.value.soundEffects;
      const maxId = max(soundEffects.map((o) => o.id)) || 0;
      const newSoundEffect = {
        id: maxId + 1,
        name: `Sound effect ${maxId + 1}`,
        audc: '4',
        audf: 16,
        audv: 15,
        duration: 5,
        fade: false,
        arpeggio: false,
        arpeggioDivision: DEFAULT_ARPEGGIO_DIVISION,
        arpeggioInterval: DEFAULT_ARPEGGIO_INTERVAL,
        arpeggioRange: DEFAULT_ARPEGGIO_RANGE,
        color: null,
      };

      state.value.soundEffects.push(newSoundEffect);

      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    const handleDeleteSoundEffect = (soundEffect) => {
      state.value.soundEffects = state.value.soundEffects.filter(({id}) => id != soundEffect.id);
      handleChildChange();
      instance.proxy.$forceUpdate();
    };

    // Sound effect data as a standalone .json file, for sharing an
    // instrument between projects or keeping an external backup - same
    // pattern as MusicEditor.vue's own handleExportSong/handleImportSong
    // (including leaving the card's own id out of the export, kept as the
    // IMPORTING card's id on import instead, since ids only mean anything
    // within a single project's own storage).
    const handleExportSoundEffect = (soundEffect) => {
      // eslint-disable-next-line no-unused-vars
      const {id, ...soundEffectData} = soundEffect;
      const blob = new Blob([JSON.stringify(soundEffectData, null, 2)], {type: 'application/json'});
      const filename = (soundEffect.name || `sound-${soundEffect.id}`).replace(/[^A-Za-z0-9]+/g, '_');
      saveAs(blob, `Sound_${filename}-${getDateInfix()}.json`);
    };

    // Overwrites this sound effect card's own data with a previously
    // exported .json file's contents - keeps this card's own id (see
    // handleExportSoundEffect) untouched so every soundfx_play block and
    // Music tab track already pointing at this card keeps working.
    const handleImportSoundEffect = (soundEffect) => {
      openFileDialog('.json,application/json')
          .then((file) => file.text())
          .then((text) => {
            const soundEffectData = JSON.parse(text);
            if (!soundEffectData || typeof soundEffectData !== 'object' || !('audc' in soundEffectData)) {
              throw new Error('File does not contain valid sound effect data');
            }
            Object.assign(soundEffect, soundEffectData, {id: soundEffect.id});
            // Not just handleChildChange() - an imported file's own audf
            // (especially one hand-edited, or exported from a build before
            // the curated "in tune" Frequency list existed) can be a raw
            // byte that isn't one of the current AUDC type's own valid
            // options, which left the Frequency select showing blank
            // forever (a value with no matching item never displays one)
            // even though the data underneath was actually imported fine.
            // handleAudcChange already does exactly this snap-to-closest-
            // valid-value fixup on an AUDC change; running it here re-uses
            // that same fixup for an AUDF that came in invalid instead
            // (this also calls handleChildChange() itself).
            handleAudcChange(soundEffect);
            instance.proxy.$forceUpdate();
          })
          .catch((e) => console.error('Failed to import sound effect', e));
    };

    const handlePlaySoundEffect = (soundEffect) => {
      // Matches what actually plays in the compiled ROM (see soundfx_play in
      // generators/bbasic/soundfx.js) - previewing at the un-dimmed volume
      // while DIM is on would make the preview lie about what the game
      // actually sounds like.
      const audv = dimSoundFx.value ?
        dimVolume(soundEffect.audv, dimSoundFxPercent.value) : soundEffect.audv;
      previewSoundEffect({...soundEffect, audv});
    };

    const handleStopPreview = () => stopSoundEffectPreview();

    const handleSetSoundEffectColor = (soundEffect, colorByte) => {
      soundEffect.color = colorByte;
      handleChildChange();
    };

    // Same "in tune" AUDF set the piano roll limits its own rows to for a
    // given instrument (see utils/music-notes.js's notesForAudc) - the
    // Frequency field only offers a value picked from here instead of any
    // 0-31 byte, so it can't land on an AUDF this sound type can't actually
    // play a clean note at. The note name is shown right alongside the raw
    // AUDF value (not instead of it) since the underlying byte is still
    // what's stored/generated.
    const frequencyItems = (audc) =>
      notesForAudc(audc).map(({value, label}) => ({text: `${value} (${label})`, value}));

    // AUDC types with no well-defined pitch (most percussion/noise sounds)
    // keep the old plain 0-31 number field instead - there's no "valid
    // frequency" set to limit to, every byte is equally as (un)musical.
    const handleAudcChange = (soundEffect) => {
      if (audcHasTunableNotes(soundEffect.audc)) {
        const items = frequencyItems(soundEffect.audc);
        if (!items.some(({value}) => value === soundEffect.audf)) {
          // Snaps to the closest still-valid AUDF rather than always
          // resetting to the same default, so switching between two
          // similar instruments tends to land near the same pitch instead
          // of jumping around.
          let closest = items[0];
          items.forEach((item) => {
            if (Math.abs(item.value - soundEffect.audf) < Math.abs(closest.value - soundEffect.audf)) {
              closest = item;
            }
          });
          soundEffect.audf = closest.value;
        }
      }
      handleChildChange();
    };

    return {
      state, handleChildChange, handleAddSoundEffect, handleDeleteSoundEffect, handlePlaySoundEffect,
      handleExportSoundEffect, handleImportSoundEffect,
      handleStopPreview, handleSetSoundEffectColor, autoInstrumentColor,
      isCollapsed, toggleCollapsed,
      audcHasTunableNotes, frequencyItems, handleAudcChange,
      dimSoundFx, dimSoundFxPercent,
      audcOptionItems: AUDC_OPTIONS.map(([text, value]) => ({text, value})),
      arpeggioRangeOptionItems: ARPEGGIO_RANGE_OPTIONS.map(([text, value]) => ({text, value})),
      arpeggioDivisionOptionItems: ARPEGGIO_DIVISION_OPTIONS.map((value) => ({text: `1/${value}`, value})),
      fadeLengthOptionItems: FADE_LENGTH_OPTIONS.map((value) => ({text: `${value} frames`, value})),
      MIN_ARPEGGIO_INTERVAL, MAX_ARPEGGIO_INTERVAL,
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
   pushing the sound effect card in further than the Score tab's, which sits
   directly in a v-card-text with no list-item wrapper. */
.entry-list-item {
  padding-left: 0;
}

/* Same fix, and matching 8px/12px values, as BackgroundEditor.vue's own
   .background-list/.entry-list-item rules - v-list-item__content's default
   12px top/bottom padding was adding extra space between cards beyond
   anything explicitly set (there was no explicit gap here at all before),
   so this tab's own card spacing didn't match the Background tab's.
   flex+gap plays the role .background-list's own CSS grid gap does (this
   tab stays single-column); margin-top puts back the space above the FIRST
   card that zeroing v-list-item__content's own padding would otherwise
   have also removed. */
.soundfx-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 12px;
}

.entry-list-item >>> .v-list-item__content {
  padding: 0;
}

.dim-controls {
  display: flex;
  align-items: center;
  gap: 16px;
}

/* Vuetify gives switches/checkboxes ("selection controls") a built-in
   margin-top: 16px, meant for stacking them below other form fields - with
   nothing above it here, that just pushes the switch down out of line with
   the slider next to it (which has no such margin). !important because
   Vuetify's own ".v-input--selection-controls" rule outweighs a single
   custom class on specificity alone. */
.dim-switch {
  flex: 0 0 auto;
  margin-top: 0 !important;
}

.dim-slider {
  flex: 0 1 200px;
  /* Pulls the "%" label below in closer than the row's own 16px gap - the
     slider's own internal thumb padding already leaves visual space after
     it, so the label doesn't need the full gap on top of that. */
  margin-right: -12px;
  /* The slider's track sits a few px higher within its own box than the
     switch's toggle does within its box, even once both boxes are centered
     against each other - nudge it down to actually line up. */
  margin-top: 3px;
}

.dim-percent {
  flex: 0 0 auto;
  min-width: 2.5em;
}

.dim-hint {
  margin-top: 8px;
  color: rgba(0, 0, 0, 0.6);
  font-size: 0.75rem;
}

.soundfx-card {
  position: relative;
  width: 100%;
  max-width: 640px;
}

/* Same reasoning/placement as TextEditor.vue's identical .text-drag-handle
   rule (see hooks/drag-reorder.js's own comment) - only this top strip is
   actually draggable, so click-and-drag still selects text everywhere else
   in the card. */
.soundfx-drag-handle {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  height: 32px;
  cursor: grab;
}

/* Same two classes/reasoning as hooks/drag-reorder.js's own comment and
   TextEditor.vue's identical rules (its own first use of this hook). */
.drag-reorder-dragging {
  opacity: 0.4;
}

.drag-reorder-over {
  border-top: 3px solid var(--v-primary-base, #1976d2) !important;
}

/* Same placement/style as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - sound effects are referenced by this same numeric id
   (see findSoundEffectById in blocks/soundfx.js). Shifted right to clear
   .soundfx-collapse-btn, which sits in the same row to its left. */
.soundfx-id-badge {
  position: absolute;
  top: 10px;
  left: 32px;
  font-size: 0.75rem;
  font-family: monospace;
  opacity: 0.6;
}

/* Same top-edge fix as .soundfx-delete-btn, positioned at the opposite
   corner - a smaller top offset than .soundfx-delete-btn's, since this one
   has to line up against .soundfx-id-badge's own text baseline right next to
   it, not just sit inside the card. */
.soundfx-collapse-btn {
  top: 2px !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Top-right corner, hugging it the same way .soundfx-collapse-btn hugs the
   top-left (top: 0, relying on the buttons' own internal padding rather
   than extra container inset) - stop/play stay reachable with the card
   collapsed, same reason they were pulled out of the collapsible fields
   section. */
.soundfx-toolbar-top-right {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  align-items: center;
  gap: 0;
  z-index: 1;
}

/* Same 4px gap as the Music tab's own .track-instrument-row, but flex-start
   (not flex-end) - unlike that row's dense, hide-details fields, Sound
   name is a full-size v-text-field with a good deal of reserved underline
   space below its own value text, so bottom-aligning the swatch to the
   field's outer box (like the Music tab's shorter fields) would land it in
   that empty space, below the visible text rather than next to it. */
.soundfx-name-row {
  display: flex;
  align-items: flex-start;
  gap: 4px;
}

/* Clears .soundfx-toolbar-top-right, which would otherwise overlap the name
   field's own label/text at the top of the card. */
.soundfx-name-field {
  margin-top: 36px;
  flex: 1 1 auto;
}

/* Vuetify's v-menu renders its activator slot content as a SIBLING of its
   own (empty, zero-size) root element, not nested inside it - a class on
   <color-swatch-picker> itself lands on that invisible marker, not on the
   actual visible swatch, so this has to pierce into the component's own
   internal .color-swatch-picker-dot class instead. 57px (36px from
   .soundfx-name-field's own margin-top, plus 21px to reach the vertical
   center of its floating label + value text) - measured directly against
   the rendered field, since a fixed field like this one doesn't share the
   Instrument row's own dense/hide-details proportions to eyeball from. */
.soundfx-name-row >>> .color-swatch-picker-dot {
  margin-top: 57px;
}

/* Same flat-icon, fade-in-on-hover treatment as the pixel editor's own
   toolbar icons (PixelEditor.vue's .pixel-editor-tools rules) instead of
   Vuetify's default grey circle: dim at rest, darker on hover, no ripple. */
.soundfx-stop-btn,
.soundfx-play-btn {
  flex: 0 0 auto;
  background-color: transparent !important;
  box-shadow: none !important;
}

/* Vuetify paints its own grey hover/focus overlay here - removed in favor of
   the icon colour transition below. */
.soundfx-stop-btn::before,
.soundfx-play-btn::before {
  display: none;
}

.soundfx-stop-btn >>> .v-icon,
.soundfx-play-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.soundfx-stop-btn:hover >>> .v-icon,
.soundfx-play-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

/* Same icon/button sizing as the Player Sprite tab's own toolbar icons
   (PixelEditor.vue's .pixel-editor-tools rules) - size only, no colour
   changes, so .delete-icon-btn's red-on-hover convention is untouched. */
.soundfx-icon-btn-size {
  min-width: 0;
  height: 26px !important;
  width: 26px !important;
  margin: 0 1px;
}

.soundfx-icon-btn-size >>> .v-icon {
  font-size: 19px !important;
}

/* Split from the rest of the card's content (soundfx-fields-section) so the
   name field can stay visible while collapsed - v-card-text's own default
   padding-bottom would otherwise open a gap between them that the original,
   single v-card-text never had. */
.soundfx-name-section {
  padding-bottom: 0;
}

/* Delete sits inline with Fade (pushed to the row's far right by the
   v-spacer between them) when expanded, so this is the true last section
   in that state - keeps its own bottom padding instead of the 0 used
   elsewhere for tight stacking between sections. */
.soundfx-fields-section {
  padding-top: 0;
}

/* Only rendered when collapsed (see the v-if next to it) - soundfx-fields
   above already puts delete in Fade's own row when expanded, but that whole
   section is hidden while collapsed, so delete needs this separate row to
   stay reachable instead of disappearing along with it. Always in normal
   flow rather than absolutely positioned, unlike its previous spot at the
   card's bottom-right - that put it behind the name field once collapsing
   shrank the card down around it. */
.soundfx-delete-section {
  display: flex;
  justify-content: flex-end;
  padding-top: 0;
}

.soundfx-delete-btn {
  box-shadow: none !important;
}

.soundfx-fields {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.soundfx-audc {
  flex: 1 1 260px;
  min-width: 220px;
}

.soundfx-number {
  flex: 0 0 90px;
}

/* Same margin-top override as SoundFXEditor's own .dim-switch - Vuetify's
   selection-control margin-top (meant for stacking below other fields)
   otherwise pushes this out of line with the text fields next to it. */
.soundfx-fade,
.soundfx-arpeggio {
  flex: 0 0 auto;
  margin-top: 0 !important;
}

/* These sit right after the Arpeggio checkbox, which has its own margin-top
   zeroed out above - without a matching nudge here, the fields read as
   sitting a little higher than the checkbox's own label/input baseline. */
.soundfx-arpeggio-field {
  margin-top: 4px;
}

.add-soundfx-buttom {
  bottom: 8px;
}
</style>
