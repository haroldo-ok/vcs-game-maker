<template>
  <v-dialog :value="value" width="480" @input="(open) => $emit('input', open)">
    <v-card>
      <v-card-title>{{ single ? 'Import Sound' : 'Import Sound Bank' }}</v-card-title>
      <v-card-text>
        <div v-if="single" class="text-subtitle-1 sound-bank-import-row">
          <span>{{ entries[0].name }}<span v-if="entries[0].kernels && entries[0].kernels.length" class="text--secondary"> ({{ kernelLabel(entries[0].kernels) }})</span></span>
          <span class="sound-bank-import-play">
            <v-btn v-if="entries[0].kernels.includes('dpcplus')" icon small class="data-icon-btn-size" title="Play the sound on the DPC+ chip" @click="() => play(entries[0], 'dpc')"><v-icon>mdi-play-circle-outline</v-icon></v-btn>
            <v-btn v-if="entries[0].kernels.includes('standard')" icon small class="data-icon-btn-size" title="Play the sound on the TIA" @click="() => play(entries[0], 'tia')"><v-icon>mdi-alpha-t-circle-outline</v-icon></v-btn>
          </span>
        </div>
        <p v-else class="v-messages theme--light v-messages__message">
          Choose which sounds to import. With "Replace existing" ticked, a name that
          matches an existing sound effect replaces its parameters; anything else is added as a
          new card.
        </p>
        <v-checkbox
          v-if="entries.some((entry) => entry.isExisting)"
          :input-value="entries.every((entry) => entry.replace !== false)"
          label="Replace existing"
          hide-details
          dense
          class="mt-0 mb-3"
          @change="setReplace"
        />
        <template v-if="!single">
          <v-btn small @click="selectAll(true)">Select all</v-btn>
          <v-btn small class="ml-2" @click="selectAll(false)">Select none</v-btn>
          <div v-for="(entry, index) in entries" :key="index" class="sound-bank-import-row">
            <v-checkbox
              v-model="entry.selected"
              :label="entry.kernels && entry.kernels.length ? `${entry.name} (${kernelLabel(entry.kernels)})` : entry.name"
              hide-details
              dense
              class="sound-bank-import-check"
            />
            <span class="sound-bank-import-play">
              <v-btn v-if="entry.kernels.includes('dpcplus')" icon small class="data-icon-btn-size" title="Play the sound on the DPC+ chip" @click="() => play(entry, 'dpc')"><v-icon>mdi-play-circle-outline</v-icon></v-btn>
            <v-btn v-if="entry.kernels.includes('standard')" icon small class="data-icon-btn-size" title="Play the sound on the TIA" @click="() => play(entry, 'tia')"><v-icon>mdi-alpha-t-circle-outline</v-icon></v-btn>
            </span>
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn small @click="$emit('input', false)">Cancel</v-btn>
        <v-spacer></v-spacer>
        <v-btn
          color="primary"
          text
          :disabled="!single && !entries.some((entry) => entry.selected)"
          @click="$emit('confirm')"
        >
          {{ single ? 'Import' : 'Import selected' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import {computed, defineComponent} from '@vue/composition-api';
import {kernelSettingsLabel} from '../utils/sound-bank';
import {playSoundBankSounds, stopSoundBankPreview} from '../utils/sound-bank-preview';

// The "Import Sound Bank" popup, shared by the Sound tab (a file opened from
// disk) and the Project tab's Sound Banks screen (a file from GitHub). The
// parent owns the entries (see buildSoundBankImportEntries in
// utils/sound-bank.js) and does the import when "confirm" is emitted.
export default defineComponent({
  props: {
    value: {type: Boolean, default: false},
    entries: {type: Array, default: () => []},
  },
  setup(props) {
    const selectAll = (selected) => {
      props.entries.forEach((entry) => {
        entry.selected = selected;
      });
    };
    // One sound alone has nothing to pick between, so no checkboxes.
    const single = computed(() => props.entries.length === 1);
    const setReplace = (replace) => {
      props.entries.forEach((entry) => {
        entry.replace = !!replace;
      });
    };
    // The kernels a sound has settings for, as text ("Standard and DPC+").
    const kernelLabel = kernelSettingsLabel;
    // Plays a sound of the file on the DPC+ chip or the TIA, like the Sound tab's preview.
    let timers = [];
    const play = (entry, chip) => {
      stopSoundBankPreview(timers);
      timers = playSoundBankSounds([entry.data], chip).timers;
    };
    return {selectAll, single, setReplace, kernelLabel, play};
  },
});
</script>

<style scoped>
.sound-bank-import-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.sound-bank-import-check {
  margin-top: 0;
  padding-top: 0;
}
.sound-bank-import-play {
  flex: none;
  white-space: nowrap;
}

.sound-bank-import-play {
  display: inline-flex;
  align-items: center;
  gap: 0;
}

/* The look of the toolbar's icon buttons (see .project-toolbar-row): flat, faint at rest, darker on hover, shrinking while pressed. */
.sound-bank-import-play >>> .v-btn {
  margin: 0;
  width: 30px !important;
  height: 30px !important;
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
}

.sound-bank-import-play >>> .v-btn::before {
  display: none;
}

.sound-bank-import-play >>> .v-btn .v-icon {
  font-size: 24px !important;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.sound-bank-import-play >>> .v-btn--disabled .v-icon {
  color: rgba(0, 0, 0, 0.18) !important;
}

.sound-bank-import-play >>> .v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.sound-bank-import-play >>> .v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}
</style>
