<template>
  <v-dialog :value="value" width="480" @input="(open) => $emit('input', open)">
    <v-card>
      <v-card-title>{{ single ? 'Import Voice' : 'Import Voice Bank' }}</v-card-title>
      <v-card-text>
        <div v-if="single" class="text-subtitle-1">{{ entries[0].name }}</div>
        <p v-else class="v-messages theme--light v-messages__message">
          Choose which voices to import. With "Replace existing" ticked, a name that matches an existing voice replaces its controls; anything else is added as a
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
          <div v-for="(entry, index) in entries" :key="index" class="voice-bank-import-row">
            <v-checkbox v-model="entry.selected" :label="entry.name" hide-details dense class="voice-bank-import-check" />
          </div>
        </template>
      </v-card-text>
      <v-card-actions>
        <v-btn small @click="$emit('input', false)">Cancel</v-btn>
        <v-spacer></v-spacer>
        <v-btn color="primary" text :disabled="!single && !entries.some((entry) => entry.selected)" @click="$emit('confirm')">
          {{ single ? 'Import' : 'Import selected' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import {computed, defineComponent} from '@vue/composition-api';

// The "Import Voice Bank" popup of the Vox tab. The parent owns the entries (see buildVoiceImportEntries in utils/voice-bank.js) and does the
// import when "confirm" is emitted.
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
    // One voice alone has nothing to pick between, so no checkboxes.
    const single = computed(() => props.entries.length === 1);
    const setReplace = (replace) => {
      props.entries.forEach((entry) => {
        entry.replace = !!replace;
      });
    };
    return {selectAll, single, setReplace};
  },
});
</script>

<style scoped>
.voice-bank-import-row {
  display: flex;
  align-items: center;
}
.voice-bank-import-check {
  margin-top: 0;
  padding-top: 0;
}
</style>
