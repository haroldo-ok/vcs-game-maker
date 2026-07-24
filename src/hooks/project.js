import {computed, ref} from '@vue/composition-api';
import {useJsonLocalStorage, useLocalStorage} from '../hooks/storage';
import {markRomOutdated} from '../hooks/rom-status';

const keyOf = (type) =>`vcs-game-maker.${type}`;

// The graphics, score font and options are compiled into the ROM, but unlike
// the action blocks nothing regenerates the code when they change. Flag the ROM
// stale whenever one is written so the "Update ROM" button reflects the edit.
const withRomInvalidation = (storage) => computed({
  get() {
    return storage.value;
  },
  set(value) {
    storage.value = value;
    markRomOutdated();
  },
});

export const useProjectStorage = (type) => useLocalStorage(keyOf(type));
export const useJsonProjectStorage = (type) => useJsonLocalStorage(keyOf(type));

export const useWorkspaceStorage = () => useProjectStorage('workspace');
export const useBackgroundsStorage = () =>
  withRomInvalidation(useJsonProjectStorage('backgrounds'));
export const usePlayer0Storage = () =>
  withRomInvalidation(useJsonProjectStorage('player0'));
export const usePlayer1Storage = () =>
  withRomInvalidation(useJsonProjectStorage('player1'));
export const useConfigurationStorage = () =>
  withRomInvalidation(useJsonProjectStorage('configuration'));
export const useScoreFontStorage = () =>
  withRomInvalidation(useJsonProjectStorage('scoreFont'));

// Everything that makes up a project. Kept in one place so starting fresh and
// clearing on launch can't drift apart as new pieces are added.
export const PROJECT_STORAGE_TYPES = [
  'workspace', 'backgrounds', 'player0', 'player1', 'configuration', 'scoreFont',
];

/**
 * Discards the stored project, leaving the empty/default one behind.
 */
export const clearProjectStorage = () => {
  PROJECT_STORAGE_TYPES.forEach((type) => localStorage.removeItem(keyOf(type)));
};

const errorRef = ref('');
export const useErrorStorage = () => computed({
  get() {
    return errorRef.value;
  },
  set(value) {
    errorRef.value = value;
  },
});
