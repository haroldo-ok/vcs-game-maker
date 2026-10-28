'use strict';

import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

import {restoreStorageKeys, snapshotStorageKeys, storageKeysMatch} from './storage';
import {recordReorder} from './reorder-history';
import {markRomOutdated} from './rom-status';

Vue.use(VueCompositionApi);

// Undo and redo for deleting a card, on every tab. Deleting a card numbers the cards after it again and changes what refers to them (the
// Actions blocks, Data cells, the instruments of songs, the cards of title screens), so the whole of what a delete can touch is kept as it
// was, and put back as it was. It goes through the same Undo and Redo buttons and shortcuts as dragging cards into a new order
// (hooks/reorder-history.js). Like a reorder it counts only while nothing else in what it holds has changed since.
const PROJECT_KEYS = ['workspace', 'backgrounds', 'playerAnimations', 'dataTables', 'soundEffects', 'songs', 'textStrings', 'titleScreen']
    .map((type) => `vcs-game-maker.${type}`);

// The tab on screen is made again from what is stored, after a put back: it holds the cards in memory.
const remountKey = ref(0);
export const useRemountKey = () => remountKey;

// Called as a delete starts: what the project holds now.
export const beginCardDelete = () => snapshotStorageKeys(PROJECT_KEYS);

const put = (snapshot) => {
  restoreStorageKeys(snapshot);
  markRomOutdated();
  remountKey.value++;
};

// Called as a delete ends: the tab writes its list once the delete has returned, so what the project holds is read just after.
export const recordCardDelete = (before) => {
  setTimeout(() => {
    const after = snapshotStorageKeys(PROJECT_KEYS);
    if (Object.keys(before).every((key) => before[key] === after[key])) return;
    recordReorder({
      undo: () => put(before),
      redo: () => put(after),
      isCurrent: () => storageKeysMatch(after),
    });
  }, 0);
};
