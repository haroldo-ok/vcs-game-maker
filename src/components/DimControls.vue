<template>
  <div class="dim-controls" :title="description">
    <v-btn-toggle
      :value="dimSoundFx ? 'dim' : undefined"
      dense
      class="dim-toggle"
      @change="(value) => (dimSoundFx = value === 'dim')"
    >
      <!-- The same "primary" color as the slider next to it, so every theme treats the two alike (App.vue tints both). -->
      <v-btn value="dim" small :color="dimSoundFx ? 'primary' : undefined">DIM</v-btn>
    </v-btn-toggle>
    <v-slider
      :value="percentDisplay"
      @input="(v) => (percentDisplay = v)"
      @change="(v) => (dimSoundFxPercent = v)"
      :disabled="!dimSoundFx"
      min="0"
      max="100"
      step="1"
      dense
      hide-details
      color="primary"
      class="dim-slider"
    />
    <span class="dim-percent">{{ percentDisplay }}%</span>
  </div>
</template>

<script>
import {defineComponent, ref, watch} from '@vue/composition-api';
import {useDimSoundFxPercentStorage, useDimSoundFxStorage} from '../hooks/project';
import {DEFAULT_DIM_PERCENT} from '../generators/bbasic/soundfx';

// The DIM switch with its volume slider, shared by the Sound and Music tabs: every sound effect and note plays at the set percentage of its
// volume. App-wide preference (see useDimSoundFxStorage in hooks/project.js), the same one on both tabs.
export default defineComponent({
  props: {
    description: {type: String, default: ''},
  },
  setup() {
    const dimSoundFx = useDimSoundFxStorage();
    const dimSoundFxPercent = useDimSoundFxPercentStorage(DEFAULT_DIM_PERCENT);
    // The storage's setter writes to localStorage on every call, and the slider fires "input" many times a second while dragging, which made
    // the thumb lag behind the mouse: this ref takes every "input" and the stored value is written once, on "change" (the release).
    const percentDisplay = ref(dimSoundFxPercent.value);
    watch(dimSoundFxPercent, (value) => {
      percentDisplay.value = value;
    });
    return {dimSoundFx, dimSoundFxPercent, percentDisplay};
  },
});
</script>

<style scoped>
.dim-controls {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  gap: 0;
  height: 26px;
  /* Room between the divider before it and the DIM button, on top of the row's 4px gap (the same 8px as the Columns switches). */
  margin-left: 8px;
}

.dim-toggle {
  flex: 0 0 auto;
  /* The toggle's background is another grey in dark mode: the toolbar's color shows through instead. */
  background-color: transparent !important;
}

.dim-toggle >>> .v-btn {
  width: auto !important;
  min-width: 44px !important;
  height: 26px !important;
  padding: 0 10px !important;
  background-color: rgba(128, 128, 128, 0.18);
}

.dim-toggle >>> .v-btn.primary {
  background-color: #1976d2 !important;
  color: #fff !important;
}

/* A short slider, beside the button: it is kept inside the 26px toolbar row. */
.dim-slider {
  flex: 0 0 90px;
  margin: 0 0 0 6px;
  min-height: 0;
}

.dim-slider >>> .v-input__control {
  min-height: 26px;
}

.dim-slider >>> .v-input__slot {
  margin: 0;
}

.dim-percent {
  flex: 0 0 auto;
  min-width: 2.5em;
  margin-left: 4px;
}
</style>
