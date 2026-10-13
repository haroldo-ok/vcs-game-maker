<template>
  <v-dialog :value="value" width="480" @input="(open) => $emit('input', open)">
    <v-card>
      <v-card-title>{{ single ? 'Import Sound' : 'Import Sound Bank' }}</v-card-title>
      <v-card-text>
        <div v-if="single" class="text-subtitle-1">{{ entries[0].name }}</div>
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
          <v-checkbox
            v-for="(entry, index) in entries"
            :key="index"
            v-model="entry.selected"
            :label="entry.name"
            hide-details
            dense
          />
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
    return {selectAll, single, setReplace};
  },
});
</script>
