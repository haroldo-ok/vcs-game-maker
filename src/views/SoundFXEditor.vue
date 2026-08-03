<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>SoundFX</v-card-title>
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
        <v-list>
          <v-list-item class="entry-list-item" v-for="soundEffect in state.soundEffects" v-bind:key="soundEffect.id">
            <v-list-item-content>
              <v-card outlined class="soundfx-card">
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
                <v-menu
                  v-if="state.soundEffects.length > 1"
                  top
                >
                  <template v-slot:activator="{ on, attrs }">
                    <v-btn
                      title="Delete this sound effect"
                      icon
                      small
                      absolute
                      top
                      right
                      class="soundfx-delete-btn delete-icon-btn"
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

                <v-card-text class="soundfx-name-section">
                  <v-text-field
                    class="soundfx-name-field"
                    label="Sound effect name"
                    v-model="soundEffect.name"
                    @change="handleChildChange"
                  />
                </v-card-text>

                <v-card-text v-if="!isCollapsed(soundEffect)" class="soundfx-fields-section">
                  <div class="soundfx-fields">
                    <v-select
                      label="Sound type"
                      v-model="soundEffect.audc"
                      :items="audcOptionItems"
                      @change="handleChildChange"
                      class="soundfx-audc"
                    />
                    <v-text-field
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
                    <v-btn
                      icon
                      title="Play this sound effect"
                      @click="() => handlePlaySoundEffect(soundEffect)"
                    >
                      <v-icon>mdi-play</v-icon>
                    </v-btn>
                  </div>
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
import {computed, defineComponent, getCurrentInstance, ref} from '@vue/composition-api';
import {max} from 'lodash';

import {useConfigurationStorage, useSoundEffectsStorage} from '../hooks/project';
import {AUDC_OPTIONS} from '../blocks/sound';
import {DEFAULT_SOUND_EFFECTS, processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {DEFAULT_DIM_PERCENT, dimVolume} from '../generators/bbasic/soundfx';
import {previewSoundEffect} from '../utils/sound-preview';

export default defineComponent({
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

    // Purely a view preference - see TextEditor.vue's identical collapsedIds
    // for why this lives in local component state and is reassigned wholesale.
    const collapsedIds = ref({});
    const isCollapsed = (soundEffect) => !!collapsedIds.value[soundEffect.id];
    const toggleCollapsed = (soundEffect) => {
      collapsedIds.value = {
        ...collapsedIds.value,
        [soundEffect.id]: !collapsedIds.value[soundEffect.id],
      };
    };

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

    const handlePlaySoundEffect = (soundEffect) => {
      // Matches what actually plays in the compiled ROM (see soundfx_play in
      // generators/bbasic/soundfx.js) - previewing at the un-dimmed volume
      // while DIM is on would make the preview lie about what the game
      // actually sounds like.
      const audv = dimSoundFx.value ?
        dimVolume(soundEffect.audv, dimSoundFxPercent.value) : soundEffect.audv;
      previewSoundEffect({...soundEffect, audv});
    };

    return {
      state, handleChildChange, handleAddSoundEffect, handleDeleteSoundEffect, handlePlaySoundEffect,
      isCollapsed, toggleCollapsed,
      dimSoundFx, dimSoundFxPercent,
      audcOptionItems: AUDC_OPTIONS.map(([text, value]) => ({text, value})),
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

/* Same placement/style as the Text tab's "ID: N" badge (TextEditor.vue's
   .text-id-badge) - sound effects are referenced by this same numeric id
   (see findSoundEffectById in blocks/soundfx.js). Shifted right to clear
   .soundfx-collapse-btn, which sits in the same row to its left. */
.soundfx-id-badge {
  position: absolute;
  top: 8px;
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
  top: 0 !important;
  left: 4px !important;
  box-shadow: none !important;
}

/* Same 12px reserved below the badge as PixelEditor.vue's
   .editor-with-sidebar--has-badge (see PlayerEditor.vue's "FRAME: N"). */
.soundfx-name-field {
  margin-top: 12px;
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
}

/* Vuetify's fab+absolute+top combo centers the button on the card's top
   edge, poking half of it out (and clipped there); pull it down so the whole
   button sits inside the card instead. */
.soundfx-delete-btn {
  top: 8px !important;
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

.add-soundfx-buttom {
  bottom: 8px;
}
</style>
