<template>
  <v-dialog :value="value" width="1180" max-width="96vw" scrollable persistent>
    <v-card class="sample-import">
      <v-card-title>Import audio samples</v-card-title>
      <v-card-text class="sample-import-body">
        <p class="sample-import-note">
          Each recording is fitted to the sound chips, keeping its length: the DPC+ chip with a waveform (up to 32 bars), pitch, volume and
          envelope, the TIA with the closest of its tone and noise types, a divider, volume and envelope. Both only approximate the
          recording: short, tonal and percussive sounds come out closest. {{ whereText }}
        </p>
        <div class="sample-import-quality">
          <v-select
            v-model="quality"
            :items="qualityItems"
            label="Fit quality"
            dense
            hide-details
            class="sample-import-quality-select"
            title="Longer fits are closer to the recording. Change it, then use the refit button on a sound."
          />
        </div>
        <div v-if="items.length > 1" class="sample-import-row sample-import-all">
          <span class="sample-import-all-label">Set every sound</span>
          <v-select
            v-model="allKind"
            :items="kindItems"
            label="Sound is"
            dense
            hide-details
            clearable
            class="sample-import-kind"
            @change="(value) => applyAll('kind', value)"
          />
          <v-select
            v-if="dpcAvailable"
            v-model="allChip"
            :items="chipItems"
            label="Plays on"
            dense
            hide-details
            clearable
            class="sample-import-chip"
            @change="(value) => applyAll('chip', value)"
          />
          <v-select
            v-model="allMode"
            :items="modeItems"
            label="Fit as"
            dense
            hide-details
            clearable
            class="sample-import-mode"
            @change="(value) => applyAll('mode', value)"
          />
          <v-checkbox
            v-model="replaceSameName"
            label="Replace the cards that have the same name"
            dense
            hide-details
            class="sample-import-replace"
            title="A sound whose name is the name of a card of this project replaces that card (it keeps its place, folder and color) instead of becoming a new card"
          />
        </div>
        <div v-for="item in items" :key="item.key" class="sample-import-row">
          <v-text-field v-model="item.name" label="Sound name" dense hide-details class="sample-import-name" />
          <v-select
            v-model="item.kind"
            :items="kindItems"
            label="Sound is"
            dense
            hide-details
            class="sample-import-kind"
            title="Where the sound is offered: a Play sound effect block, the Music tab's instruments, or the Music tab's Hit row"
          />
          <v-select
            v-if="dpcAvailable"
            v-model="item.chip"
            :items="chipItems"
            label="Plays on"
            dense
            hide-details
            class="sample-import-chip"
            :disabled="item.status === 'reading'"
            title="The chip that plays the sound: the DPC+ sound chip (a 32 bar waveform) or the TIA (one of its tone and noise types, with a divider)"
            @change="() => refit(item)"
          />
          <v-select
            v-model="item.mode"
            :items="modeItems"
            label="Fit as"
            dense
            hide-details
            class="sample-import-mode"
            :disabled="item.status === 'reading'"
            title="A tone has a pitch that can move (a tom, a blip); a noise has none (a snare, a hat). Automatic decides from the recording."
            @change="() => refit(item)"
          />
          <v-select
            v-if="dpcAvailable"
            v-model="item.bars"
            :items="barItems"
            label="Bars"
            dense
            hide-details
            class="sample-import-bars"
            :disabled="item.status === 'reading' || item.chip === 'tia'"
            title="How many bars the waveform is drawn with"
            @change="() => refit(item)"
          />
          <v-btn icon small title="Play the original recording" :disabled="!item.canPlay" @click="() => playOriginal(item)">
            <v-icon>mdi-play</v-icon>
          </v-btn>
          <v-btn icon small title="Fit this sound again" :disabled="item.status === 'reading' || item.status === 'fitting' || item.status === 'error'" @click="() => refit(item)">
            <v-icon>mdi-refresh</v-icon>
          </v-btn>
          <div class="sample-import-status">
            <v-progress-linear v-if="item.status === 'reading' || item.status === 'fitting'" :value="item.status === 'reading' ? 0 : item.progress * 100" :indeterminate="item.status === 'reading'" height="6" />
            <span v-else-if="item.status === 'error'" class="sample-import-error">{{ item.message }}</span>
            <template v-else-if="item.status === 'done'">
              <svg v-if="item.result && item.result.curve" class="sample-import-curve" viewBox="0 0 84 28" aria-hidden="true">
                <title>How loud each frame is: the recording (grey), the DPC+ sound (blue) and the TIA sound (orange)</title>
                <polyline class="sample-import-curve-wanted" :points="curvePoints(item.result.curve.wanted)" />
                <polyline v-if="item.result.curve.played && item.chip !== 'tia'" class="sample-import-curve-played" :points="curvePoints(item.result.curve.played)" />
                <polyline v-if="item.chip === 'tia' && item.result.curve.played" class="sample-import-curve-tia" :points="curvePoints(item.result.curve.played)" />
                <polyline v-if="item.result.curve.tiaPlayed" class="sample-import-curve-tia" :points="curvePoints(item.result.curve.tiaPlayed)" />
              </svg>
              <span>{{ item.message }}<em v-if="willReplace(item)" class="sample-import-replaces"> Replaces a card.</em></span>
            </template>
            <span v-else>Waiting</span>
          </div>
          <div class="sample-import-result-buttons">
            <v-btn
              icon
              small
              :disabled="item.status !== 'done' || item.chip === 'tia'"
              :class="{'sample-import-result-hidden': item.chip === 'tia'}"
              title="Play the DPC+ chip's sound, the way the Sound tab's preview plays it"
              @click="() => playResult(item, 'dpc')"
            >
              <v-icon>mdi-play-circle-outline</v-icon>
            </v-btn>
            <v-btn
              icon
              small
              :disabled="item.status !== 'done' || item.chip === 'dpc'"
              :class="{'sample-import-result-hidden': item.chip === 'dpc'}"
              title="Play the TIA sound, the way the Sound tab's preview plays it"
              @click="() => playResult(item, 'tia')"
            >
              <v-icon>mdi-alpha-t-circle-outline</v-icon>
            </v-btn>
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn small @click="handleCancel">Cancel</v-btn>
        <v-spacer></v-spacer>
        <v-btn color="primary" text :disabled="!ready" @click="handleConfirm">
          {{ items.length > 1 ? 'Import sounds' : 'Import sound' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import {computed, defineComponent, ref, watch} from '@vue/composition-api';
import {decodeAudioFile, playAudioBuffer, stopAudioBuffer} from '../utils/audio-decode';
import {describeMismatch, prepareSample} from '../utils/sample-fit';
import {runFit} from '../utils/sample-fit-pool';
import {previewSoundEffect, stopSoundEffectPreview} from '../utils/sound-preview';
import {previewDpcPlusSoundEffect} from '../utils/dpc-preview';

// The "Import audio samples" popup of the Sound tab. The parent hands it the files the user picked and what the import is going to
// do with the selected card (replaceName), and puts the sounds it emits with "confirm" on cards. The files are read here one after the
// other and fitted on worker threads, several at once (see utils/sample-fit-pool.js).
const QUALITY_SCALE = {fast: 0.4, normal: 1, best: 3};

export default defineComponent({
  props: {
    value: {type: Boolean, default: false},
    files: {type: Array, default: () => []},
    // The name of the selected card that the first sound is going to replace, or null when every sound is a new card.
    replaceName: {type: String, default: null},
    // What a sound is made for until it is changed: 'dpc' (the DPC+ chip's waveform) or 'tia' (a TIA type and divider).
    defaultChip: {type: String, default: 'dpc'},
    // Whether the project has the DPC+ sound chip (without it a sound is made for the TIA only).
    dpcAvailable: {type: Boolean, default: true},
    // How much slower the TIA's audio clock runs than on an NTSC console (see tvAudioClockScale).
    clockScale: {type: Number, default: 1},
    // The names of the cards of the project, for replacing the ones that have the same name.
    existingNames: {type: Array, default: () => []},
  },
  setup(props, context) {
    const items = ref([]);
    const quality = ref('normal');
    const replaceSameName = ref(true);
    // What the "set every sound" choices show (they are only for choosing: the sounds hold the values).
    const allKind = ref(null);
    const allChip = ref(null);
    const allMode = ref(null);
    // Incremented to stop whatever is being fitted (the dialog was closed, or another round started).
    let generation = 0;
    // The decoded recordings, by item key: they are not reactive data.
    const decoded = new Map();

    const whereText = computed(() => {
      if (!props.replaceName) return items.value.length > 1 ? 'Each sound becomes a new card.' : 'The sound becomes a new card.';
      return items.value.length > 1 ?
        `The first sound replaces the selected card "${props.replaceName}"; the others become new cards.` :
        `The sound replaces the selected card "${props.replaceName}".`;
    });
    const ready = computed(() => items.value.some((item) => item.status === 'done') &&
      !items.value.some((item) => item.status === 'reading' || item.status === 'fitting'));

    const qualityItems = [
      {text: 'Fast', value: 'fast'}, {text: 'Normal', value: 'normal'}, {text: 'Best (slower)', value: 'best'},
    ];
    const kindItems = [
      {text: 'Sound effect', value: 'effect'}, {text: 'Instrument', value: 'instrument'}, {text: 'Percussion', value: 'percussion'},
    ];
    const modeItems = [
      {text: 'Automatic', value: 'auto'}, {text: 'Tone (pitched)', value: 'tone'}, {text: 'Noise (unpitched)', value: 'noise'},
    ];
    const barItems = [{text: '32', value: 32}, {text: '24', value: 24}];
    const chipItems = [{text: 'Both', value: 'both'}, {text: 'DPC+ chip', value: 'dpc'}, {text: 'TIA', value: 'tia'}];

    const describe = (item, result) => {
      const frames = item.prepared.frames;
      const seconds = (frames / 60).toFixed(2);
      if (result.mode === 'both') {
        return `DPC+ ${describeMismatch(result.dpcMismatch)} (${result.dpcMismatch.toFixed(2)}), TIA ${describeMismatch(result.tiaMismatch)} (${result.tiaMismatch.toFixed(2)}, type ${result.audc}), ${frames} frames (${seconds} s)`;
      }
      if (result.mode === 'tia') return `${describeMismatch(result.mismatch)} match (${result.mismatch.toFixed(2)}), TIA type ${result.audc}, ${frames} frames (${seconds} s)`;
      return `${describeMismatch(result.mismatch)} match (${result.mismatch.toFixed(2)}), ${result.mode === 'tone' ? 'tone' : 'noise'}, ${frames} frames (${seconds} s)`;
    };

    const fitItem = async (item) => {
      // A newer fit of the item (or the dialog closing or opening again) stops this one, and what it leaves behind is not its to set.
      const gen = generation;
      const token = ++item.token;
      const stale = () => gen !== generation || token !== item.token;
      item.status = 'waiting';
      item.progress = 0;
      let result = null;
      try {
        result = await runFit(item.chip, item.prepared, {mode: item.mode, bars: Number(item.bars), timeScale: QUALITY_SCALE[quality.value] || 1, clockScale: props.clockScale}, {
          onStart: () => {
            if (!stale()) item.status = 'fitting';
          },
          onProgress: (fraction) => {
            if (!stale()) item.progress = fraction;
          },
          isCancelled: stale,
        });
      } catch (error) {
        if (!stale()) {
          item.status = 'error';
          item.message = error && error.message ? error.message : 'The sound could not be fitted';
        }
        return;
      }
      if (stale()) return;
      if (!result) {
        item.status = 'waiting';
        return;
      }
      item.result = result;
      item.message = describe(item, result);
      item.status = 'done';
    };

    const readItem = async (item) => {
      item.status = 'reading';
      try {
        const sound = await decodeAudioFile(item.file);
        decoded.set(item.key, sound);
        item.prepared = prepareSample(sound.samples, sound.sampleRate);
        item.canPlay = true;
      } catch (error) {
        item.status = 'error';
        item.message = error && error.message ? error.message : `${item.file.name} could not be read`;
      }
    };

    // Reads the recordings one after the other and starts each one's fit as soon as it is read: the fits run side by side.
    const process = async () => {
      const gen = generation;
      for (const item of items.value) {
        if (gen !== generation) return;
        if (item.status === 'error' || item.status === 'done') continue;
        if (!item.prepared) await readItem(item);
        if (item.status === 'error') continue;
        if (gen !== generation) return;
        fitItem(item);
      }
    };

    const refit = (item) => {
      if (item.status === 'error' || !item.prepared) return;
      item.result = null;
      fitItem(item);
    };

    watch(() => props.value, (open) => {
      generation++;
      stopSoundEffectPreview();
      stopAudioBuffer();
      decoded.clear();
      if (!open) {
        items.value = [];
        return;
      }
      items.value = props.files.map((file, index) => ({
        key: `${index}-${file.name}`,
        file,
        name: file.name.replace(/\.[^.]+$/, '').replace(/[_]+/g, ' ').trim() || `Sample ${index + 1}`,
        kind: 'effect',
        chip: props.defaultChip,
        mode: 'auto',
        bars: 32,
        status: 'waiting',
        token: 0,
        progress: 0,
        message: '',
        prepared: null,
        result: null,
        canPlay: false,
      }));
      process();
    });

    // The fitted sound, played like the Sound tab's preview of a card does.
    const playResult = (item, chip) => {
      if (!item.result) return;
      stopAudioBuffer();
      stopSoundEffectPreview();
      const card = {...item.result.fields, name: item.name};
      if (chip === 'dpc') previewDpcPlusSoundEffect(card, {kernel: 'dpcplus'}, 1, false);
      else previewSoundEffect({...card, loop: false});
    };

    // Sets one choice of every sound; a change of the chip or of how it is fitted fits the sound again.
    const applyAll = (field, value) => {
      if (value) {
        items.value.forEach((item) => {
          if (item[field] === value || item.status === 'reading') return;
          item[field] = value;
          if (field !== 'kind') refit(item);
        });
      }
      allKind.value = null;
      allChip.value = null;
      allMode.value = null;
    };

    // Whether the sound takes the place of a card that has its name.
    const willReplace = (item) => replaceSameName.value && !!item.name.trim() &&
      props.existingNames.some((name) => name.trim().toLowerCase() === item.name.trim().toLowerCase());

    // The points of the little graph of a sound's loudness (0 to 1 a frame).
    const curvePoints = (values) => values.map((value, index) =>
      `${(1 + (values.length > 1 ? index / (values.length - 1) : 0) * 82).toFixed(1)},${(26 - Math.min(1, value) * 24).toFixed(1)}`).join(' ');

    const playOriginal = (item) => {
      const sound = decoded.get(item.key);
      if (sound) playAudioBuffer(sound.buffer);
    };

    const handleCancel = () => {
      generation++;
      stopAudioBuffer();
      stopSoundEffectPreview();
      context.emit('input', false);
    };

    const handleConfirm = () => {
      stopAudioBuffer();
      stopSoundEffectPreview();
      const imports = items.value.filter((item) => item.status === 'done' && item.result).map((item) => ({
        name: item.name.trim() || item.file.name,
        kind: item.kind,
        fields: item.result.fields,
        chip: item.chip,
      }));
      generation++;
      context.emit('confirm', imports, {replaceSameName: replaceSameName.value});
      context.emit('input', false);
    };

    return {
      items, quality, qualityItems, kindItems, modeItems, barItems, chipItems, whereText, ready, refit, playOriginal, playResult, replaceSameName, allKind, allChip, allMode, applyAll, willReplace, curvePoints, handleCancel, handleConfirm,
    };
  },
});
</script>

<style scoped>
.sample-import-note {
  font-size: 0.85rem;
  opacity: 0.75;
}

.sample-import-body {
  max-height: 76vh;
}

.sample-import-quality {
  margin: 16px 0;
}

.sample-import-quality-select {
  max-width: 180px;
}

.sample-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 14px 0;
  min-height: 64px;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}

.sample-import-name {
  flex: 1 1 200px;
  min-width: 120px;
}

.sample-import-kind {
  flex: 0 0 150px;
}

.sample-import-result-buttons {
  display: flex;
  flex: 0 0 64px;
  gap: 0;
}

.sample-import-all {
  border-top: none;
  padding-bottom: 4px;
}

.sample-import-all-label {
  flex: 0 0 auto;
  font-size: 0.8rem;
  opacity: 0.75;
}

.sample-import-replace {
  margin: 0 0 0 auto;
  padding: 0;
}

.sample-import-replaces {
  opacity: 0.75;
}

.sample-import-curve {
  flex: 0 0 84px;
  width: 84px;
  height: 28px;
  margin-right: 8px;
  fill: none;
  stroke-width: 1.5;
}

.sample-import-curve-wanted {
  stroke: #9e9e9e;
}

.sample-import-curve-played {
  stroke: #1976d2;
}

.sample-import-curve-tia {
  stroke: #ef6c00;
}

.sample-import-result-hidden {
  visibility: hidden;
}

.sample-import-chip {
  flex: 0 0 110px;
}

.sample-import-mode {
  flex: 0 0 140px;
}

.sample-import-bars {
  flex: 0 0 64px;
}

.sample-import-status {
  display: flex;
  align-items: center;
  flex: 0 0 300px;
  font-size: 0.8rem;
  min-width: 0;
}

.sample-import-error {
  color: var(--v-error-base, #ff5252);
}
</style>
