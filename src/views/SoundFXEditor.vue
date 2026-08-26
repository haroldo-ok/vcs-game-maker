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
            :value="dimSoundFxPercentDisplay"
            @input="(v) => (dimSoundFxPercentDisplay = v)"
            @change="(v) => (dimSoundFxPercent = v)"
            :disabled="!dimSoundFx"
            min="0"
            max="100"
            step="1"
            hide-details
            class="dim-slider"
          />
          <span class="dim-percent">{{ dimSoundFxPercentDisplay }}%</span>
        </div>
        <p class="dim-hint v-messages theme--light v-messages__message">
          When DIM is on, every sound effect plays at the volume above, as a
          percentage of its own set volume. Off: sound effects play at their
          own set volume.
        </p>
        <v-select
          v-model="soundFilter"
          label="Show"
          :items="soundFilterItems"
          hide-details
          class="soundfx-filter"
        />
        <v-list class="soundfx-list">
          <v-list-item
            v-for="(soundEffect, index) in state.soundEffects"
            v-show="matchesSoundFilter(soundEffect)"
            class="entry-list-item"
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
                <div class="soundfx-id-badge">ID:{{ soundEffect.id }}</div>

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
                    <v-btn
                      icon
                      small
                      class="soundfx-instrument-btn soundfx-icon-btn-size"
                      :class="{'soundfx-instrument-btn-active': soundEffect.isInstrument}"
                      :title="(soundEffect.isInstrument ?
                        'Tagged as an instrument (click to untag) ' :
                        'Not tagged as an instrument (click to tag) ') +
                        '- purely a tag for this tab\'s own \'Show\' filter above; every sound effect can ' +
                        'already be used both as a soundfx_play trigger and as a Music tab instrument ' +
                        'regardless of this.'"
                      @click="() => handleToggleInstrument(soundEffect)"
                    >
                      <v-icon small>mdi-piano</v-icon>
                    </v-btn>
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
                    <div class="soundfx-basic-fields-row">
                      <v-select
                        v-if="audcHasTunableNotes(soundEffect.audc)"
                        label="Frequency"
                        title="Limited to the AUDF values that play a clean, in-tune note on this sound type - same set the piano roll allows on the Music tab."
                        v-model.number="soundEffect.audf"
                        :items="frequencyItems(soundEffect.audc)"
                        @change="handleChildChange"
                        class="soundfx-frequency"
                      />
                      <v-text-field
                        v-else
                        label="Frequency"
                        v-model.number="soundEffect.audf"
                        type="number"
                        min="0"
                        max="31"
                        @change="handleChildChange"
                        class="soundfx-frequency"
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
                    </div>
                    <div class="soundfx-arpeggio-block"
                      :class="{'soundfx-arpeggio-block--expanded': soundEffect.arpeggio}"
                    >
                      <v-switch
                        v-model="soundEffect.arpeggio"
                        label="Arpeggio"
                        title="Always on for every note played with this instrument on the Music tab - rapidly flips between the note's own pitch and a second nearby pitch (set below) to fake a chord."
                        hide-details
                        class="soundfx-arpeggio-switch"
                        @change="handleChildChange"
                      />
                      <template v-if="soundEffect.arpeggio">
                        <v-select
                          label="Speed"
                          title="How often it flips pitch, relative to the song/pattern's own tempo - speeds up and slows down with the song."
                          v-model="soundEffect.arpeggioDivision"
                          :items="arpeggioDivisionOptionItems"
                          @change="handleChildChange"
                          class="soundfx-number"
                        />
                        <v-text-field
                          label="Interval"
                          title="Fixed pitch jump between the note's own pitch and the second alternating pitch."
                          v-model.number="soundEffect.arpeggioInterval"
                          type="number"
                          :min="MIN_ARPEGGIO_INTERVAL"
                          :max="MAX_ARPEGGIO_INTERVAL"
                          @change="handleChildChange"
                          class="soundfx-number"
                        />
                        <v-select
                          label="Range"
                          title="1 OCT: cycles only between the note's own pitch and pitch+interval. 2 OCT: plays that pattern, then repeats it one octave up before looping back."
                          v-model="soundEffect.arpeggioRange"
                          :items="arpeggioRangeOptionItems"
                          @change="handleChildChange"
                          class="soundfx-frequency"
                        />
                      </template>
                    </div>
                    <div class="soundfx-envelope-block">
                      <v-switch
                        v-model="soundEffect.envelope"
                        label="Envelope"
                        title="Shapes this sound's own volume over time (Attack/Decay/Sustain/Release), instead of playing at a fixed volume until it ends. Applies both here and when this preset is used as a Music tab instrument."
                        hide-details
                        class="soundfx-envelope-switch"
                        @change="handleChildChange"
                      />
                      <template v-if="soundEffect.envelope">
                        <v-select
                          label="Attack"
                          title="Frames to ramp up from silence to full volume."
                          v-model="soundEffect.envelopeAttack"
                          :items="envelopeStageFrameOptionItems"
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Decay"
                          title="Frames to ramp down from full volume to the Sustain level."
                          v-model="soundEffect.envelopeDecay"
                          :items="envelopeStageFrameOptionItems"
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Sustain"
                          title="The volume level (percent of full volume) held after Attack/Decay, until Release begins."
                          v-model="soundEffect.envelopeSustain"
                          :items="envelopeSustainPercentOptionItems"
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <v-select
                          label="Release"
                          title="Frames to ramp down from the Sustain level to silence, ending exactly when the sound ends."
                          v-model="soundEffect.envelopeRelease"
                          :items="envelopeStageFrameOptionItems"
                          @change="handleChildChange"
                          class="soundfx-envelope-field"
                        />
                        <div class="soundfx-envelope-graph-toolbar">
                          <v-btn
                            icon
                            small
                            title="Reset envelope to default"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            @click="() => handleResetEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-restore</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            title="Undo"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            :disabled="!canUndoEnvelope(soundEffect)"
                            @click="() => handleUndoEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-undo</v-icon>
                          </v-btn>
                          <v-btn
                            icon
                            small
                            title="Redo"
                            class="soundfx-stop-btn soundfx-icon-btn-size"
                            :disabled="!canRedoEnvelope(soundEffect)"
                            @click="() => handleRedoEnvelope(soundEffect)"
                          >
                            <v-icon small>mdi-redo</v-icon>
                          </v-btn>
                        </div>
                        <EnvelopeGraph
                          :attack="soundEffect.envelopeAttack"
                          :decay="soundEffect.envelopeDecay"
                          :sustain-percent="soundEffect.envelopeSustain"
                          :release="soundEffect.envelopeRelease"
                          @update:attack="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeAttack', value)"
                          @update:decay="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeDecay', value)"
                          @update:sustainPercent="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeSustain', value)"
                          @update:release="(value) => handleEnvelopeGraphChange(soundEffect, 'envelopeRelease', value)"
                        />
                      </template>
                    </div>
                  </div>
                </v-card-text>

                <!-- Its own row (not inline with soundfx-fields-section above,
                     where this used to sit next to Fade) so it lands in the
                     same place - close to the card's own bottom edge - whether
                     expanded or collapsed, instead of being roughly mid-card
                     while expanded but bottom-edge while collapsed. -->
                <v-card-text class="soundfx-delete-section">
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
import {computed, defineComponent, getCurrentInstance, ref, watch} from '@vue/composition-api';
import {saveAs} from 'file-saver';
import {max} from 'lodash';

import {useCollapsedIds} from '../hooks/collapse';
import {useDragReorder} from '../hooks/drag-reorder';
import {useDimSoundFxPercentStorage, useDimSoundFxStorage, useSoundEffectsStorage} from '../hooks/project';
import {AUDC_OPTIONS} from '../blocks/sound';
import {DEFAULT_SOUND_EFFECTS, processSoundEffectsStorageDefaults, ARPEGGIO_DIVISION_OPTIONS,
  DEFAULT_ARPEGGIO_DIVISION, DEFAULT_ARPEGGIO_INTERVAL, MIN_ARPEGGIO_INTERVAL,
  MAX_ARPEGGIO_INTERVAL, DEFAULT_ARPEGGIO_RANGE, ARPEGGIO_RANGE_OPTIONS,
  ENVELOPE_STAGE_FRAME_OPTIONS, ENVELOPE_SUSTAIN_PERCENT_OPTIONS, DEFAULT_ENVELOPE_ATTACK,
  DEFAULT_ENVELOPE_DECAY, DEFAULT_ENVELOPE_SUSTAIN_PERCENT, DEFAULT_ENVELOPE_RELEASE} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';
import {getDateInfix} from '../utils/date';
import {openFileDialog} from '../utils/file';
import {previewSoundEffect, stopSoundEffectPreview} from '../utils/sound-preview';
import {autoInstrumentColor} from '../utils/instrument-colors';
import {audcHasTunableNotes, notesForAudc} from '../utils/music-notes';
import ColorSwatchPicker from '../components/ColorSwatchPicker.vue';
import EnvelopeGraph from '../components/EnvelopeGraph.vue';

export default defineComponent({
  components: {ColorSwatchPicker, EnvelopeGraph},
  setup() {
    const soundEffectsStorage = useSoundEffectsStorage();
    // App-wide preference, not part of this project's own saved
    // configuration - see useDimSoundFxStorage's own comment in
    // hooks/project.js.
    const dimSoundFx = useDimSoundFxStorage();
    const dimSoundFxPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT);
    // Same reasoning as MusicEditor.vue's own identical dimSoundFxPercentDisplay -
    // dimSoundFxPercent's own setter still does a synchronous localStorage
    // write on every call, which v-slider's v-model would otherwise trigger
    // on every "input" tick while dragging - the exact repeated-main-thread-
    // work pattern that caused the visible thumb to lag behind the mouse and
    // only catch up once dragging stopped (a real reported bug, originally
    // against the old, much heavier whole-configurationStorage-object write
    // this used to do). This cheap local ref absorbs every "input" tick
    // instead; the persisted write only happens once, on "change" (drag
    // release).
    const dimSoundFxPercentDisplay = ref(dimSoundFxPercent.value);
    watch(dimSoundFxPercent, (value) => {
      dimSoundFxPercentDisplay.value = value;
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

    // EnvelopeGraph.vue emits "update:<field>" events (dragging a handle,
    // snapped to the same option set the dropdowns use - see its own
    // snapTo) rather than v-modeling the whole envelope shape as one
    // object, so dragging and picking from a dropdown both just set one
    // field on soundEffect and go through this exact same save path.
    const handleEnvelopeGraphChange = (soundEffect, field, value) => {
      soundEffect[field] = value;
      handleChildChange();
    };

    // Undo/redo for just the envelope shape (Attack/Decay/Sustain/Release),
    // one stack pair per sound effect id - same shape as MusicEditor.vue's
    // own pattern undo/redo (patternUndoStacks/patternRedoStacks/
    // patternLastSnapshot), scoped down to just these 4 fields rather than
    // a whole sound effect's every field, since dragging the envelope graph
    // is the one interaction here fiddly enough to want stepping back
    // through.
    const ENVELOPE_HISTORY_KEYS = ['envelopeAttack', 'envelopeDecay', 'envelopeSustain', 'envelopeRelease'];
    const snapshotEnvelope = (soundEffect) => JSON.stringify(
        ENVELOPE_HISTORY_KEYS.reduce((acc, key) => {
          acc[key] = soundEffect[key]; return acc;
        }, {}));
    const envelopeUndoStacks = ref({});
    const envelopeRedoStacks = ref({});
    const envelopeLastSnapshot = {};
    state.value.soundEffects.forEach((soundEffect) => {
      envelopeLastSnapshot[soundEffect.id] = snapshotEnvelope(soundEffect);
    });
    let envelopeHistoryDebounce = null;
    watch(() => state.value.soundEffects, () => {
      clearTimeout(envelopeHistoryDebounce);
      envelopeHistoryDebounce = setTimeout(() => {
        state.value.soundEffects.forEach((soundEffect) => {
          const snapshot = snapshotEnvelope(soundEffect);
          const last = envelopeLastSnapshot[soundEffect.id];
          if (last !== undefined && last !== snapshot) {
            const stack = envelopeUndoStacks.value[soundEffect.id] || [];
            envelopeUndoStacks.value = {...envelopeUndoStacks.value, [soundEffect.id]: [...stack, last]};
            if ((envelopeRedoStacks.value[soundEffect.id] || []).length) {
              envelopeRedoStacks.value = {...envelopeRedoStacks.value, [soundEffect.id]: []};
            }
          }
          envelopeLastSnapshot[soundEffect.id] = snapshot;
        });
      }, 500);
    }, {deep: true});

    const applyEnvelopeSnapshot = (soundEffect, snapshotJson) => {
      const data = JSON.parse(snapshotJson);
      ENVELOPE_HISTORY_KEYS.forEach((key) => {
        soundEffect[key] = data[key];
      });
      // Written directly (not through the watcher above) so restoring a
      // snapshot is never itself mistaken for a new edit worth recording.
      envelopeLastSnapshot[soundEffect.id] = snapshotJson;
      handleChildChange();
    };
    const canUndoEnvelope = (soundEffect) => (envelopeUndoStacks.value[soundEffect.id] || []).length > 0;
    const canRedoEnvelope = (soundEffect) => (envelopeRedoStacks.value[soundEffect.id] || []).length > 0;
    const handleUndoEnvelope = (soundEffect) => {
      const stack = envelopeUndoStacks.value[soundEffect.id] || [];
      if (!stack.length) return;
      const redoStack = envelopeRedoStacks.value[soundEffect.id] || [];
      envelopeRedoStacks.value = {...envelopeRedoStacks.value,
        [soundEffect.id]: [...redoStack, snapshotEnvelope(soundEffect)]};
      envelopeUndoStacks.value = {...envelopeUndoStacks.value, [soundEffect.id]: stack.slice(0, -1)};
      applyEnvelopeSnapshot(soundEffect, stack[stack.length - 1]);
    };
    const handleRedoEnvelope = (soundEffect) => {
      const stack = envelopeRedoStacks.value[soundEffect.id] || [];
      if (!stack.length) return;
      const undoStack = envelopeUndoStacks.value[soundEffect.id] || [];
      envelopeUndoStacks.value = {...envelopeUndoStacks.value,
        [soundEffect.id]: [...undoStack, snapshotEnvelope(soundEffect)]};
      envelopeRedoStacks.value = {...envelopeRedoStacks.value, [soundEffect.id]: stack.slice(0, -1)};
      applyEnvelopeSnapshot(soundEffect, stack[stack.length - 1]);
    };
    const handleResetEnvelope = (soundEffect) => {
      soundEffect.envelopeAttack = DEFAULT_ENVELOPE_ATTACK;
      soundEffect.envelopeDecay = DEFAULT_ENVELOPE_DECAY;
      soundEffect.envelopeSustain = DEFAULT_ENVELOPE_SUSTAIN_PERCENT;
      soundEffect.envelopeRelease = DEFAULT_ENVELOPE_RELEASE;
      handleChildChange();
    };

    const {isCollapsed, toggleCollapsed} = useCollapsedIds('soundfx');

    // Purely a display filter for this tab's own card list (see the
    // Instrument checkbox in the name row) - not persisted, and doesn't
    // touch soundEffect.isInstrument itself or anything else that reads it.
    // Cards not matching stay in the underlying array/v-for at their own
    // real index (v-show, not a filtered array or v-if - ESLint's
    // vue/no-use-v-if-with-v-for rule forbids the latter on the same
    // element as v-for anyway) specifically so drag-reorder (see
    // hooks/drag-reorder.js, which reorders by splicing the real array at
    // whatever index it's given) keeps working correctly even mid-filter,
    // rather than reordering against filtered-out indices that don't match
    // the real array at all.
    const soundFilter = ref('all');
    const soundFilterItems = [
      {text: 'All', value: 'all'},
      {text: 'Instruments', value: 'instrument'},
      {text: 'Sound effects', value: 'sound'},
    ];
    const matchesSoundFilter = (soundEffect) => {
      if (soundFilter.value === 'instrument') return !!soundEffect.isInstrument;
      if (soundFilter.value === 'sound') return !soundEffect.isInstrument;
      return true;
    };

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
        envelope: false,
        envelopeAttack: DEFAULT_ENVELOPE_ATTACK,
        envelopeDecay: DEFAULT_ENVELOPE_DECAY,
        envelopeSustain: DEFAULT_ENVELOPE_SUSTAIN_PERCENT,
        envelopeRelease: DEFAULT_ENVELOPE_RELEASE,
        arpeggio: false,
        arpeggioDivision: DEFAULT_ARPEGGIO_DIVISION,
        arpeggioInterval: DEFAULT_ARPEGGIO_INTERVAL,
        arpeggioRange: DEFAULT_ARPEGGIO_RANGE,
        color: null,
        isInstrument: false,
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

    const handleToggleInstrument = (soundEffect) => {
      soundEffect.isInstrument = !soundEffect.isInstrument;
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
      canUndoEnvelope, canRedoEnvelope, handleUndoEnvelope, handleRedoEnvelope, handleResetEnvelope,
      handleStopPreview, handleSetSoundEffectColor, handleToggleInstrument, autoInstrumentColor,
      isCollapsed, toggleCollapsed,
      audcHasTunableNotes, frequencyItems, handleAudcChange,
      dimSoundFx, dimSoundFxPercent, dimSoundFxPercentDisplay,
      soundFilter, soundFilterItems, matchesSoundFilter,
      audcOptionItems: AUDC_OPTIONS.map(([text, value]) => ({text, value})),
      arpeggioRangeOptionItems: ARPEGGIO_RANGE_OPTIONS.map(([text, value]) => ({text, value})),
      arpeggioDivisionOptionItems: ARPEGGIO_DIVISION_OPTIONS.map((value) => ({text: `1/${value}`, value})),
      envelopeStageFrameOptionItems: ENVELOPE_STAGE_FRAME_OPTIONS.map((value) => ({text: `${value} frames`, value})),
      envelopeSustainPercentOptionItems: ENVELOPE_SUSTAIN_PERCENT_OPTIONS.map((value) => ({text: `${value}%`, value})),
      handleEnvelopeGraphChange,
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

/* v-list-item's own default left/right padding (16px each side) stacks on
   top of v-card-text's, pushing the sound effect card in from both edges
   instead of it actually filling the full available width - confirmed as
   the source of a visible gap past the card's own right edge, same fix as
   PlayerEditor.vue's own identical .entry-list-item rule. */
.entry-list-item {
  padding-left: 0;
  padding-right: 0;
}

/* Single column, full width - matches PlayerEditor.vue's own .animation-list
   (flex column) rather than a multi-column grid, so every card spans the
   full available width instead of 2+ narrower cards sitting side by side.
   gap: 0 matches PlayerEditor.vue's own .pixel-editor-parent-container
   spacing (plain adjacent inline-block frames, no gap of their own). */
.soundfx-list {
  display: flex;
  flex-direction: column;
  /* Matches PlayerEditor.vue's own .animation-list gap (its top-level entry
     list - the more apt comparison now that .soundfx-list is single-column
     top-level entries too, not a grid of cards sitting side by side like a
     single entry's own frame sub-cards do) - 0 read as too cramped between
     entire cards, even though it matched .pixel-editor-parent-container's
     own frame-to-frame spacing fine. */
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

/* font-size/color/line-height now come from the "v-messages theme--light
   v-messages__message" classes on the element itself (see the template) -
   the same classes every hint/description paragraph in the app uses. */
.dim-hint {
  margin-top: 8px;
}

.soundfx-filter {
  max-width: 220px;
  margin-top: 8px;
}

/* No max-width (used to cap at 640px, back when .soundfx-list was a
   multi-column grid and a capped width kept a card from stretching to fill
   an entire wide grid column on its own) - .soundfx-list is a single,
   full-width column now (matching PlayerEditor.vue's own .animation-list),
   so this can just fill 100% of it like every other tab's own main card. */
/* No max-width (used to cap at 640px) - that was capping each card well
   short of its own 1fr share of .soundfx-list's grid row on a wide window,
   leaving unused space to its right instead of the card actually filling
   the full width its own grid column allotted it. */
.soundfx-card {
  position: relative;
  width: 100%;
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
   field's own label/text at the top of the card - matches the Music tab's
   own song cards' card-top-to-label gap (measured directly: 36.67px there
   vs this field's own 40.67px at 24px margin-top, so 20px lines the two
   up) - was 36px originally. */
.soundfx-name-field {
  margin-top: 20px;
  flex: 1 1 auto;
}

/* Same flat-icon, fade-in-on-hover treatment as .soundfx-stop-btn/
   .soundfx-play-btn below, plus an "on" tint (see .soundfx-instrument-btn-
   active) matching the Music tab's own mute/solo toggle buttons
   (MusicEditor.vue's .music-icon-btn-active - same blue, #1976d2, Vuetify's
   default "primary"). 30px roughly centers it against .soundfx-name-field's
   own floating label/text (20px offset) - not a measured value, nudge if it
   doesn't quite line up. !important because this element also carries
   .soundfx-icon-btn-size (defined later in this same file), whose own
   "margin: 0 1px" shorthand resets margin-top to 0 and would otherwise win
   on source order alone despite matching specificity - confirmed as the
   actual cause of this button rendering hard against the row's own top
   edge instead of lined up with the name field next to it. */
.soundfx-instrument-btn {
  flex: 0 0 auto;
  margin-top: 38px !important;
  background-color: transparent !important;
  box-shadow: none !important;
}

.soundfx-instrument-btn::before {
  display: none;
}

.soundfx-instrument-btn >>> .v-icon {
  color: rgba(0, 0, 0, 0.38) !important;
  transition: color 0.15s ease;
}

.soundfx-instrument-btn:hover >>> .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.soundfx-instrument-btn.soundfx-instrument-btn-active >>> .v-icon {
  color: #1976d2 !important;
}

/* Vuetify's v-menu renders its activator slot content as a SIBLING of its
   own (empty, zero-size) root element, not nested inside it - a class on
   <color-swatch-picker> itself lands on that invisible marker, not on the
   actual visible swatch, so this has to pierce into the component's own
   internal .color-swatch-picker-dot class instead. 41px (.soundfx-name-
   field's own 20px margin-top, plus 21px to reach the vertical center of
   its floating label + value text) - measured directly against the
   rendered field, since a fixed field like this one doesn't share the
   Instrument row's own dense/hide-details proportions to eyeball from. */
.soundfx-name-row >>> .color-swatch-picker-dot {
  margin-top: 41px;
  margin-left: -6px;
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

.soundfx-fields-section {
  padding-top: 0;
  padding-bottom: 0;
}

/* Its own row, not inline with soundfx-fields-section above (where Delete
   used to sit, pushed to the row's far right by a v-spacer) - that made
   Delete land roughly mid-card while expanded but hard against the card's
   own bottom edge while collapsed (see soundfx-fields-section, which is
   entirely hidden then), two different positions for the same button.
   Rendered unconditionally now (not just while collapsed) so it lands in
   this same bottom-edge spot either way. Always in normal flow rather than
   absolutely positioned, unlike its previous spot at the card's
   bottom-right - that put it behind the name field once collapsing
   shrank the card down around it. */
.soundfx-delete-section {
  display: flex;
  justify-content: flex-end;
  padding-top: 0;
  /* Vuetify's v-card-text default padding-bottom (16px) left too much empty
     space below the last field row, especially once Arpeggio's own stacked
     controls made that row taller - shrunk to a small amount instead of
     zeroed, so the Delete button itself (rendered here whenever there's
     more than one sound effect) still has a little clearance from the
     card's own bottom edge rather than sitting flush against it. */
  padding-bottom: 8px;
  /* Matches .soundfx-toolbar-top-right's own "right: 8px" (the Play
     button's own horizontal position) - v-card-text's default 16px right
     padding put this 8px further left than that, so Delete and Play didn't
     line up vertically despite both being right-aligned. */
  padding-right: 8px;
}

.soundfx-delete-btn {
  box-shadow: none !important;
}

/* row-gap 4px (not the same 8px as column-gap) to match the gap above this
   section, between the Sound name row and this one (soundfx-name-section's
   own padding-bottom: 0 / soundfx-fields-section's own padding-top: 0) -
   without splitting it out, the plain 8px shorthand made a wrapped row
   within this section sit visibly farther from its neighbor above/below
   than the Sound name row sits from Sound type. */
.soundfx-fields {
  display: flex;
  align-items: center;
  row-gap: 0;
  column-gap: 8px;
  flex-wrap: wrap;
}

.soundfx-audc {
  flex: 1 1 260px;
  min-width: 220px;
}

/* Own row, own nested flex container (rather than Frequency/Volume/Duration
   being flat siblings of Sound type in the shared .soundfx-fields wrap) -
   forces Sound type onto its own line and keeps these 3 always together as
   one row, instead of the exact wrapping being at the mercy of whatever
   width happens to be left over after Sound type on a given card width
   (confirmed as a real problem: at some widths Frequency wrapped next to
   Sound type while Volume/Duration split onto their own row instead). */
.soundfx-basic-fields-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

.soundfx-number {
  flex: 0 0 90px;
}

/* Unlike Arpeggio's own row (2 fixed-width fields plus one growing Range
   field to soak up the rest), Envelope's 4 fields are all the same kind of
   control (a small option dropdown) with no natural single field to grow -
   so all 4 grow evenly together instead, filling the same full row width
   Arpeggio's row already does rather than leaving empty space after
   Release. */
.soundfx-envelope-field {
  flex: 1 1 90px;
}

/* Wider than .soundfx-number's fixed 90px (Frequency's own options - a
   v-select of note names, or a plain 0-31 number field - read better with
   more room than Volume/Duration's plain 2-digit numbers need), but still
   sized to fit alongside both of them on the same row within the card's own
   ~350px width, rather than growing enough to wrap them onto their own
   separate row. */
.soundfx-frequency {
  flex: 1 1 140px;
  min-width: 110px;
}

/* Each switch and its own conditional field(s) sit in one row (wrapping onto
   a second line if the card isn't wide enough), rather than the fields
   stacking in their own row underneath the switch. */
.soundfx-arpeggio-block, .soundfx-envelope-block {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  width: 100%;
}

/* .soundfx-fields' own row-gap is 0 (see its own comment), so with
   Arpeggio's controls collapsed (just its own switch row) there'd otherwise
   be no visible separation at all between the Arpeggio and Envelope
   switches - they'd read as one run-on row. Only needed when Arpeggio's
   own extra controls AREN'T also adding their own visual separation
   underneath it. */
.soundfx-envelope-block {
  margin-top: 8px;
}

.hide-description-text .soundfx-envelope-block {
  margin-top: 12px;
}

/* Arpeggio's own expanded fields already add their own visual separation
   above Envelope (see the un-scoped rule above's own comment, written for
   the collapsed case) - the same margin-top on top of THAT read as too
   much. */
.soundfx-arpeggio-block--expanded + .soundfx-envelope-block {
  margin-top: 4px;
}

.hide-description-text .soundfx-arpeggio-block--expanded + .soundfx-envelope-block {
  margin-top: 4px;
}

/* Full width so it forces its own line above the graph, same "100%-width
   flex child forces a line break" mechanism .envelope-graph itself relies
   on within this same wrapping row. */
.soundfx-envelope-graph-toolbar {
  display: flex;
  width: 100%;
  gap: 4px;
}

/* Same margin-top override as SoundFXEditor's own .dim-switch - Vuetify's
   selection-control margin-top (meant for stacking below other fields)
   otherwise pushes this out of line with the dropdowns next to it. Also
   zeroes its own 4px padding-top (a v-switch default, unlike the plain
   text fields/selects elsewhere in this card) so this row sits a few
   pixels closer to the row above it, matching their spacing more closely. */
.soundfx-arpeggio-switch, .soundfx-envelope-switch {
  flex: 0 0 auto;
  margin-top: -4px !important;
  padding-top: 0 !important;
}

/* Extra breathing room between each switch's own label text and the field(s)
   right next to it - the shared 8px row gap (also used between Speed/
   Interval/Range themselves) read as too tight specifically here, where a
   switch's label text sits right up against its own edge. */
.soundfx-arpeggio-switch, .soundfx-envelope-switch {
  margin-right: 12px !important;
}

.soundfx-arpeggio-btn.soundfx-arpeggio-btn-active >>> .v-icon {
  color: #1976d2 !important;
}

/* Grows (unlike .soundfx-number's fixed 90px, used for Volume/Duration
   above) to fill the full width of .soundfx-arpeggio-controls' own row -
   these 3 fields have nothing else sharing that row with them, so there's
   no reason to leave the rest of the card's width empty next to them. */
.soundfx-arpeggio-field {
  flex: 1 1 0;
  min-width: 90px;
}

.add-soundfx-buttom {
  bottom: 8px;
}
</style>
