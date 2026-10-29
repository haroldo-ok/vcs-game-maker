<template>
  <v-dialog :value="value" width="860" persistent>
    <v-card class="sample-import">
      <v-card-title>Import audio samples</v-card-title>
      <v-card-text>
        <p class="sample-import-note">
          Each recording is fitted with the DPC+ sound chip's waveform (up to 32 bars), pitch, volume and volume envelope, keeping its
          length. The chip loops 32 samples, so the result approximates the recording: short, tonal and percussive sounds come out
          closest. {{ whereText }}
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
            v-model="item.bars"
            :items="barItems"
            label="Bars"
            dense
            hide-details
            class="sample-import-bars"
            :disabled="item.status === 'reading'"
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
            <span v-else-if="item.status === 'done'">{{ item.message }}</span>
            <span v-else>Waiting</span>
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
import {describeMismatch, fitSample, prepareSample} from '../utils/sample-fit';

// The "Import audio samples" popup of the Sound tab. The parent hands it the files the user picked and what the import is going to
// do with the selected card (replaceName), and puts the sounds it emits with "confirm" on cards. Reading and fitting each file is
// done here, one after the other, in short slices of time so that the page stays usable.
const QUALITY_SCALE = {fast: 0.5, normal: 1, best: 3};

export default defineComponent({
  props: {
    value: {type: Boolean, default: false},
    files: {type: Array, default: () => []},
    // The name of the selected card that the first sound is going to replace, or null when every sound is a new card.
    replaceName: {type: String, default: null},
  },
  setup(props, context) {
    const items = ref([]);
    const quality = ref('normal');
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

    const describe = (item, result) => {
      const frames = item.prepared.frames;
      const seconds = (frames / 60).toFixed(2);
      return `${describeMismatch(result.mismatch)} match, ${result.mode === 'tone' ? 'tone' : 'noise'}, ${frames} frames (${seconds} s)`;
    };

    const fitItem = async (item, gen) => {
      item.status = 'fitting';
      item.progress = 0;
      const result = await fitSample(item.prepared, {
        mode: item.mode,
        bars: Number(item.bars),
        timeScale: QUALITY_SCALE[quality.value] || 1,
        onProgress: ({fraction}) => {
          item.progress = fraction;
        },
        isCancelled: () => gen !== generation,
      });
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

    const process = async () => {
      const gen = ++generation;
      for (const item of items.value) {
        if (gen !== generation) return;
        if (item.status === 'error' || item.status === 'done') continue;
        if (!item.prepared) await readItem(item);
        if (item.status === 'error') continue;
        if (gen !== generation) return;
        await fitItem(item, gen);
      }
    };

    const refit = (item) => {
      if (item.status === 'error' || !item.prepared) return;
      item.status = 'waiting';
      item.result = null;
      process();
    };

    watch(() => props.value, (open) => {
      generation++;
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
        mode: 'auto',
        bars: 32,
        status: 'waiting',
        progress: 0,
        message: '',
        prepared: null,
        result: null,
        canPlay: false,
      }));
      process();
    });

    const playOriginal = (item) => {
      const sound = decoded.get(item.key);
      if (sound) playAudioBuffer(sound.buffer);
    };

    const handleCancel = () => {
      generation++;
      stopAudioBuffer();
      context.emit('input', false);
    };

    const handleConfirm = () => {
      stopAudioBuffer();
      const imports = items.value.filter((item) => item.status === 'done' && item.result).map((item) => ({
        name: item.name.trim() || item.file.name,
        kind: item.kind,
        fields: item.result.fields,
      }));
      generation++;
      context.emit('confirm', imports);
      context.emit('input', false);
    };

    return {
      items, quality, qualityItems, kindItems, modeItems, barItems, whereText, ready, refit, playOriginal, handleCancel, handleConfirm,
    };
  },
});
</script>

<style scoped>
.sample-import-note {
  font-size: 0.85rem;
  opacity: 0.75;
}

.sample-import-quality {
  margin-bottom: 8px;
}

.sample-import-quality-select {
  max-width: 180px;
}

.sample-import-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-top: 1px solid rgba(128, 128, 128, 0.25);
}

.sample-import-name {
  flex: 1 1 200px;
  min-width: 120px;
}

.sample-import-kind {
  flex: 0 0 150px;
}

.sample-import-mode {
  flex: 0 0 140px;
}

.sample-import-bars {
  flex: 0 0 64px;
}

.sample-import-status {
  flex: 0 0 210px;
  font-size: 0.8rem;
  min-width: 0;
}

.sample-import-error {
  color: var(--v-error-base, #ff5252);
}
</style>
