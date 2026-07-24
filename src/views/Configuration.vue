<template>
  <v-card>
    <v-card-title>Options</v-card-title>
    <v-card-text>
      <v-switch
        v-model="configurationState.showScore"
        @click="handleChangeConfiguration"
        label="Show score at bottom of screen"
      />
      <v-switch
        v-model="configurationState.showBlankLines"
        @click="handleChangeConfiguration"
        label="Show blank lines between background rows"
      />
      <v-select
        v-model="configurationState.romSize"
        @change="handleChangeConfiguration"
        :items="romSizeOptions"
        label="ROM size"
      />
    </v-card-text>
    </v-card>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';

import {useConfigurationStorage} from '../hooks/project';

const ROM_SIZE_OPTIONS = ['2k', '4k', '8k', '16k', '32k'];

export default defineComponent({
  setup(props, context) {
    const configurationStorage = useConfigurationStorage();

    const configurationState = computed({
      get() {
        // scoreFont is chosen on the Score tab, but is kept here so that
        // changing any other option round-trips it instead of dropping it.
        const DEFAULT_CONFIGURATION = {
          showScore: true,
          showBlankLines: true,
          romSize: '4k',
          scoreFont: '',
        };

        try {
          const configuration = configurationStorage.value || structuredClone(DEFAULT_CONFIGURATION);

          return Object.fromEntries(Object.entries(DEFAULT_CONFIGURATION)
              .map(([k, v]) => [k, configuration[k] ?? v]));
        } catch (e) {
          console.error('Error loading configuration from local storage', e);
          return structuredClone(DEFAULT_CONFIGURATION);
        }
      },

      set(newState) {
        configurationStorage.value = newState;
      },
    });

    const handleChangeConfiguration = () => {
      configurationState.value = configurationState.value;
    };

    return {
      configurationState,
      handleChangeConfiguration,
      romSizeOptions: ROM_SIZE_OPTIONS,
    };
  },
  methods: {
  },
});
</script>
