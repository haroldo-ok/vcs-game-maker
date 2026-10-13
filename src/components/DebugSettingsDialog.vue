<template>
  <v-dialog v-model="open" width="560">
    <template v-slot:activator="{ on, attrs }">
      <v-btn
        icon
        small
        class="emulator-flat-icon-btn"
        title="Choose which variables the debug info shows"
        v-bind="attrs"
        v-on="on"
      >
        <v-icon>mdi-format-list-checks</v-icon>
      </v-btn>
    </template>
    <v-card>
      <v-card-title>Debug Info</v-card-title>
      <v-card-text class="debug-settings-text">
        <p class="v-messages theme--light v-messages__message">
          Pick the variables whose values show over the emulator screen, in a table. The list comes
          from the last build, so click Update ROM first when it is empty. Values are read from the
          console's RAM once a frame (6502.ts emulator only).
        </p>
        <v-text-field
          v-model="filter"
          label="Find a variable"
          clearable
          hide-details
          dense
          class="debug-settings-filter"
        />
        <div v-if="!variables.length" class="debug-settings-empty">
          No variables yet: build the ROM to list them.
        </div>
        <div v-for="group in groups" :key="group.title" class="debug-settings-group">
          <div class="debug-settings-group-title">{{ group.title }}</div>
          <div class="debug-settings-select-row">
            <v-btn
              small
              depressed
              :color="allChosen(group) ? 'primary' : undefined"
              class="debug-settings-toggle-left"
              @click="() => handleToggleGroup(group, true)"
            >
              Select all
            </v-btn>
            <v-btn
              small
              depressed
              :color="noneChosen(group) ? 'primary' : undefined"
              class="debug-settings-toggle-right"
              @click="() => handleToggleGroup(group, false)"
            >
              Select none
            </v-btn>
          </div>
          <div class="debug-settings-grid">
            <v-checkbox
              v-for="variable in group.variables"
              :key="variable.name"
              :input-value="isChosen(variable.name)"
              :label="variable.name"
              dense
              hide-details
              class="debug-settings-checkbox"
              @change="(checked) => handleToggle(variable.name, checked)"
            />
          </div>
        </div>
      </v-card-text>
      <v-card-actions>
        <v-btn text :disabled="!chosen.length" @click="handleClear">Clear</v-btn>
        <v-spacer />
        <v-btn text color="primary" @click="open = false">Close</v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script>
import {useEmulatorSettings, saveEmulatorSettings} from '../hooks/emulator-settings';
import {useDebugVariables} from '../hooks/debug-symbols';

const GROUP_TITLES = [['user', 'Your variables'], ['block', 'Required by blocks'], ['system', 'System']];

export default {
  name: 'DebugSettingsDialog',
  setup() {
    return {settings: useEmulatorSettings(), debugVariables: useDebugVariables()};
  },
  data() {
    return {open: false, filter: ''};
  },
  computed: {
    variables() {
      return this.debugVariables;
    },
    chosen() {
      return this.settings.debugVariables || [];
    },
    groups() {
      const filter = (this.filter || '').trim().toLowerCase();
      return GROUP_TITLES.map(([owner, title]) => ({
        title,
        variables: this.variables
            .filter((variable) => variable.owner === owner && variable.name.toLowerCase().includes(filter))
            .sort((a, b) => a.name.localeCompare(b.name)),
      })).filter((group) => group.variables.length);
    },
  },
  methods: {
    isChosen(name) {
      return this.chosen.includes(name);
    },
    handleToggle(name, checked) {
      const next = this.chosen.filter((chosenName) => chosenName !== name);
      if (checked) next.push(name);
      saveEmulatorSettings({...this.settings, debugVariables: next});
    },
    // The variables the group shows (after the filter) that are chosen.
    chosenIn(group) {
      return group.variables.filter((variable) => this.isChosen(variable.name));
    },
    noneChosen(group) {
      return this.chosenIn(group).length === 0;
    },
    allChosen(group) {
      return group.variables.length > 0 && this.chosenIn(group).length === group.variables.length;
    },
    handleToggleGroup(group, checked) {
      const names = new Set(group.variables.map((variable) => variable.name));
      const next = this.chosen.filter((name) => !names.has(name));
      if (checked) next.push(...names);
      saveEmulatorSettings({...this.settings, debugVariables: next});
    },
    handleClear() {
      saveEmulatorSettings({...this.settings, debugVariables: []});
    },
  },
};
</script>

<style scoped>
.debug-settings-text {
  padding-bottom: 8px !important;
  max-height: 70vh;
  overflow-y: auto;
}

.debug-settings-filter {
  margin-bottom: 8px;
}

.debug-settings-empty {
  opacity: 0.7;
  padding: 8px 0;
}

.debug-settings-group-title {
  font-weight: 500;
  margin-top: 12px;
}

/* Two buttons joined into one toggle: the one that matches the choices (all of the section on, or none of it)
   is filled with the primary color. */
.debug-settings-select-row {
  display: flex;
  margin: 6px 0 4px;
}

/* Capital letters have no descenders, so centering the line box leaves the word about a pixel high:
   nudge the text down to sit in the middle of the button. */
.debug-settings-select-row .v-btn >>> .v-btn__content {
  position: relative;
  top: 1px;
  line-height: 18px;
}

.debug-settings-toggle-left.v-btn {
  border-top-right-radius: 0;
  border-bottom-right-radius: 0;
}

.debug-settings-toggle-right.v-btn {
  border-top-left-radius: 0;
  border-bottom-left-radius: 0;
  margin-left: 1px;
}

.debug-settings-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  column-gap: 12px;
}

.debug-settings-checkbox {
  margin-top: 2px !important;
  padding-top: 0 !important;
}
</style>
