<template>
  <div>
    <v-card class="editor-container">
      <v-card-title>SoundFX</v-card-title>
      <v-card-text>
        <v-list>
          <v-list-item v-for="soundEffect in state.soundEffects" v-bind:key="soundEffect.id">
            <v-list-item-content>
              <v-card outlined class="soundfx-card">
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

                <v-card-text>
                  <v-text-field
                    label="Sound effect name"
                    v-model="soundEffect.name"
                    @change="handleChildChange"
                  />

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
import {computed, defineComponent, getCurrentInstance} from '@vue/composition-api';
import {max} from 'lodash';

import {useSoundEffectsStorage} from '../hooks/project';
import {AUDC_OPTIONS} from '../blocks/sound';
import {DEFAULT_SOUND_EFFECTS, processSoundEffectsStorageDefaults} from '../blocks/soundfx';
import {previewSoundEffect} from '../utils/sound-preview';

export default defineComponent({
  setup() {
    const soundEffectsStorage = useSoundEffectsStorage();
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
      previewSoundEffect(soundEffect);
    };

    return {
      state, handleChildChange, handleAddSoundEffect, handleDeleteSoundEffect, handlePlaySoundEffect,
      audcOptionItems: AUDC_OPTIONS.map(([text, value]) => ({text, value})),
    };
  },
});
</script>
<style scoped>
.editor-container {
  position: absolute;
  overflow: auto;
  top: 3em;
  bottom: 0;
  width: 100%;
}

.soundfx-card {
  position: relative;
  width: 100%;
  max-width: 640px;
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
