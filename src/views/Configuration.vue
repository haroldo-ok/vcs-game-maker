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
    </v-card-text>
    </v-card>
</template>
<script>
import {computed, defineComponent} from '@vue/composition-api';

import {useConfigurationStorage} from '../hooks/project';

export default defineComponent({
  setup(props, context) {
    const configurationStorage = useConfigurationStorage();

    const configurationState = computed({
      get() {
        const DEFAULT_CONFIGURATION = {
          showScore: true,
          showBlankLines: true,
        };

        try {
          const {showScore, showBlankLines} =
            configurationStorage.value || structuredClone(DEFAULT_CONFIGURATION);

          return {
            showScore: showScore ?? true,
            showBlankLines: showBlankLines ?? true,
          };
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

    return {configurationState, handleChangeConfiguration};
  },
  methods: {
  },
});
</script>
