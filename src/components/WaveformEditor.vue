<template>
  <div class="waveform-editor">
    <!-- The same kind of toolbar the graphic editors have: icon buttons (a Material Design icon per shape), then the number of bars. -->
    <div class="waveform-toolbar get-tools" @click.stop>
      <v-btn-toggle :value="activePreset" borderless>
        <v-btn
          v-for="preset in presets"
          :key="preset.name"
          icon
          small
          :value="preset.name"
          :title="preset.name"
          @click="() => handlePreset(preset)"
        >
          <v-icon>{{ preset.icon }}</v-icon>
        </v-btn>
      </v-btn-toggle>
      <v-select
        :value="barCount"
        :items="barCounts"
        label="Bars"
        dense
        hide-details
        class="waveform-bars-select"
        title="How many bars the shape is drawn with. The chip plays 32 samples a cycle, each bar is held for 32 divided by the number of bars."
        @change="handleBarCount"
      />
    </div>
    <div class="waveform-graph">
      <!-- The y axis: the height of the wave at each point, 0 (silent) to 15 (the sound's full volume). -->
      <div class="waveform-axis" title="Height of the wave: 0 is silent, 15 is the full volume of the sound.">
        <span class="waveform-axis-ticks">
          <span v-for="tick in axisTicks" :key="tick" class="waveform-axis-tick" :style="{bottom: (tick / maxValue * 100) + '%'}">{{ tick }}</span>
        </span>
      </div>
      <div
        ref="grid"
        class="waveform-grid"
        title="Draw the shape of one cycle of the sound: click or drag across the bars. The taller a bar, the louder that part of the cycle."
        @pointerdown="handlePointerDown"
        @pointermove="handlePointerMove"
        @pointerup="handlePointerUp"
        @pointercancel="handlePointerUp"
      >
        <div v-for="(sample, index) in bars" :key="index" class="waveform-column">
          <div class="waveform-bar" :style="{height: (sample / maxValue * 100) + '%'}"></div>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import {computed, defineComponent, ref} from '@vue/composition-api';

import {DPC_WAVE_LENGTH, DPC_WAVE_MAX, dpcWaveOf, NOISE_WAVE, waveFor} from '../utils/dpc-sound';

const BAR_COUNTS = [4, 8, 12, 16, 32];

const buildPresets = () => {
  const max = DPC_WAVE_MAX;
  const fromFunction = (fn) => Array.from({length: DPC_WAVE_LENGTH}, (_, i) => Math.round(fn(i / DPC_WAVE_LENGTH) * max));
  return [
    {name: 'Square', shape: 'square', icon: 'mdi-square-wave', wave: fromFunction((t) => (t < 0.5 ? 1 : 0))},
    {name: 'Pulse', shape: 'pulse', icon: 'mdi-pulse', wave: fromFunction((t) => (t < 0.25 ? 1 : 0))},
    {name: 'Triangle', shape: 'triangle', icon: 'mdi-triangle-wave', wave: fromFunction((t) => 1 - Math.abs(2 * t - 1))},
    {name: 'Saw', shape: 'sawtooth', icon: 'mdi-sawtooth-wave', wave: fromFunction((t) => t)},
    {name: 'Sine', shape: 'sine', icon: 'mdi-sine-wave', wave: fromFunction((t) => (Math.sin(2 * Math.PI * t) + 1) / 2)},
    {name: 'Noise', shape: 'noise', icon: 'mdi-waveform', wave: NOISE_WAVE},
    // The shapes the Standard kernel's sound chip makes (what a converted sound starts as).
    {name: 'Buzzy (Standard type 1)', shape: 'buzzy', icon: 'mdi-chart-line', wave: waveFor('tia1').samples.map((value) => value * max)},
    {name: 'Rough (Standard type 6)', shape: 'rough', icon: 'mdi-waves', wave: waveFor('tia6').samples.map((value) => value * max)},
  ];
};

export default defineComponent({
  name: 'WaveformEditor',
  props: {
    sound: {type: Object, required: true},
  },
  emits: ['change'],
  setup(props, context) {
    const grid = ref(null);
    const presets = buildPresets();
    const samples = computed(() => dpcWaveOf(props.sound));
    const barCounts = BAR_COUNTS;
    const axisTicks = [0, 5, 10, 15];
    // How many bars the shape is drawn with: 32 by default, or fewer for a simpler shape.
    // A shape that was not drawn here (from a sound bank, or converted from the Standard kernel) has no number of bars set:
    // it is shown with the fewest that draw it exactly, so a square wave is a few wide bars rather than thirty-two.
    const exactBarCount = (wave) => BAR_COUNTS.find((count) =>
      wave.every((value, i) => value === wave[Math.ceil(Math.floor(i * count / DPC_WAVE_LENGTH) * DPC_WAVE_LENGTH / count)])) ||
      DPC_WAVE_LENGTH;
    const barCount = computed(() => (BAR_COUNTS.includes(props.sound.dpcWaveBars) ? props.sound.dpcWaveBars :
      exactBarCount(samples.value)));
    // The value of each bar: the first sample of the group of samples it stands for.
    const bars = computed(() => {
      const count = barCount.value;
      return Array.from({length: count}, (_, i) => samples.value[Math.ceil(i * DPC_WAVE_LENGTH / count)]);
    });
    const maxValue = DPC_WAVE_MAX;
    let drawing = false;

    // Spreads bars over the chip's 32 samples, each held for its share of them.
    const expand = (barValues) => {
      return Array.from({length: DPC_WAVE_LENGTH}, (_, i) => barValues[Math.floor(i * barValues.length / DPC_WAVE_LENGTH)]);
    };
    // Reduces 32 samples to a number of bars, each the average of the samples it covers.
    const toBars = (wave, count) => {
      return Array.from({length: count}, (_, i) => {
        const covered = wave.filter((_, sample) => Math.floor(sample * count / DPC_WAVE_LENGTH) === i);
        return Math.round(covered.reduce((a, b) => a + b, 0) / covered.length);
      });
    };
    // shape names the preset the wave came from (nothing for a wave drawn by hand).
    const setBars = (barValues, shape = 'custom') => {
      context.emit('change', {wave: expand(barValues), bars: barValues.length, shape});
    };
    const setFromPointer = (event) => {
      const rect = grid.value.getBoundingClientRect();
      const count = barCount.value;
      const index = Math.min(count - 1, Math.max(0, Math.floor((event.clientX - rect.left) / rect.width * count)));
      const value = Math.min(maxValue, Math.max(0, Math.round((1 - (event.clientY - rect.top) / rect.height) * maxValue)));
      if (bars.value[index] === value) return;
      const next = bars.value.slice();
      next[index] = value;
      setBars(next);
    };
    const handlePointerDown = (event) => {
      drawing = true;
      grid.value.setPointerCapture(event.pointerId);
      setFromPointer(event);
    };
    const handlePointerMove = (event) => {
      if (drawing) setFromPointer(event);
    };
    const handlePointerUp = () => {
      drawing = false;
    };
    // The preset a sound is shown as: the one it was made from, or else the one its shape is closest to (a shape from a
    // sound bank, or the Standard kernel's, is the same kind of wave without being drawn exactly the same).
    const stretch = (wave) => {
      const low = Math.min(...wave);
      const high = Math.max(...wave);
      return wave.map((value) => (high === low ? 0 : (value - low) * maxValue / (high - low)));
    };
    const activePreset = computed(() => {
      const byShape = presets.find((preset) => preset.shape === props.sound.dpcShape);
      if (byShape) return byShape.name;
      const shape = stretch(samples.value);
      let best = null;
      presets.forEach((preset) => {
        if (preset.shape === 'noise') return;
        const target = stretch(preset.wave);
        const difference = shape.reduce((sum, value, i) => sum + Math.abs(value - target[i]), 0) / DPC_WAVE_LENGTH;
        if (!best || difference < best.difference) best = {name: preset.name, difference};
      });
      return best && best.difference <= 2 ? best.name : undefined;
    });
    const handlePreset = (preset) => setBars(toBars(preset.wave, barCount.value), preset.shape);
    const handleBarCount = (count) => setBars(toBars(samples.value, count), props.sound.dpcShape || 'custom');
    return {grid, presets, activePreset, samples, maxValue, handlePointerDown, handlePointerMove, handlePointerUp, handlePreset, handleBarCount, barCounts, barCount, bars, axisTicks};
  },
});
</script>

<style scoped>
.waveform-editor {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.waveform-graph {
  position: relative;
  display: flex;
  align-items: stretch;
}

/* The y axis numbers hang in the card's left padding, so the bars start at the same x as the fields below. */
.waveform-axis {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -14px;
  width: 11px;
  display: flex;
  font-size: 0.7em;
  opacity: 0.75;
}

.waveform-axis-ticks {
  position: relative;
  flex: 1 1 auto;
}

.waveform-axis-tick {
  position: absolute;
  right: 0;
  transform: translateY(50%);
  line-height: 1;
}

.waveform-grid {
  flex: 1 1 auto;
  display: flex;
  align-items: stretch;
  height: 64px;
  min-width: 192px;
  border: 1px solid rgba(128, 128, 128, 0.7);
  background-color: rgba(128, 128, 128, 0.12);
  cursor: crosshair;
  touch-action: none;
  user-select: none;
}

.waveform-column {
  flex: 1 1 0;
  display: flex;
  align-items: flex-end;
  border-right: 1px solid rgba(128, 128, 128, 0.2);
}

.waveform-column:last-child {
  border-right: none;
}

.waveform-bar {
  width: 100%;
  background-color: var(--v-primary-base, #1976d2);
}

.waveform-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  margin-bottom: 12px;
}

/* The same states as the graphic editors' toolbar (see GraphicEditorToolbar.vue's .get-tools rules): quiet at rest,
   darker on hover, shrinking a little while pressed, the theme color once selected. */
.waveform-toolbar >>> .v-btn {
  background-color: transparent !important;
  box-shadow: none !important;
  border: none !important;
  min-width: 0;
  height: 26px;
  width: 26px;
  margin: 0;
  padding: 0;
}

.waveform-toolbar >>> .v-btn::before {
  display: none;
}

.waveform-toolbar >>> .v-btn-toggle {
  gap: 4px;
  background-color: transparent !important;
}

.waveform-bars-select {
  /* Right under the Priority dropdown in the card's name row: the same 80px wide, and ending where it ends (past the
     kind button's 26px and the row's 4px gap). */
  flex: 0 0 80px;
  margin: 0 32px 0 auto;
  padding-top: 0;
}

.waveform-toolbar >>> .v-btn .v-icon {
  font-size: 19px;
  color: var(--editor-icon-rest-color, rgba(0, 0, 0, 0.38)) !important;
  transition: color 0.15s ease, transform 0.08s ease;
}

.waveform-toolbar >>> .v-btn:not(.v-btn--disabled):hover .v-icon {
  color: rgba(0, 0, 0, 0.87) !important;
}

.waveform-toolbar >>> .v-btn:not(.v-btn--disabled):active .v-icon {
  transform: scale(0.82);
}

.waveform-toolbar >>> .v-btn.v-btn--active .v-icon {
  color: var(--v-primary-base, #1976d2) !important;
}
</style>
