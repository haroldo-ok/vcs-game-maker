import Vue from 'vue';
import {ref} from '@vue/composition-api';
import {dragGroupFor} from './drag-reorder';
import {recordReorder} from './reorder-history';

// Folders for a tab's cards (see components/CardFolderBar.vue for the bar): the cards can be put in named folders, which can hold folders.
// It is for looking after the cards only: a card keeps its number and its place in the one list (blocks and data refer to it by that
// number), and the folder it is in is the `folder` of the card (none for the top level); the folders are a list of {id, name, parent} kept
// with the tab's cards. A card whose folder is not in the list (a card copied in from another project) is at the top level.
//
// getCards() the tab's cards, getFolders() the list of folders (made if the project has none yet), setFolders(list) stores a new list,
// refresh() stores the tab's data and draws it again, getSelectedIndices() the indices, in the whole list, of the selected cards,
// deselectCard() clears the selection.
export const useCardFolders = ({getCards, getFolders, setFolders, refresh, getSelectedIndices, deselectCard}) => {
  const currentFolder = ref(null);
  const hasFolder = (id) => getFolders().some((folder) => folder.id === id);
  // The folder that is open: the top level when it no longer exists.
  const openFolderId = () => (hasFolder(currentFolder.value) ? currentFolder.value : null);
  const folderOf = (card) => (card.folder !== undefined && card.folder !== null && hasFolder(card.folder) ? card.folder : null);
  // The cards of the open folder with their index in the whole list.
  const visibleEntries = () => getCards()
      .map((card, index) => ({card, index}))
      .filter(({card}) => folderOf(card) === openFolderId());
  const openFolder = (id) => {
    currentFolder.value = id;
    deselectCard();
  };
  // What a card made now gets: the open folder.
  const newCardFolder = () => (openFolderId() === null ? {} : {folder: openFolderId()});

  const handleAddFolder = (folder) => {
    getFolders().push(folder);
    refresh();
  };
  // Deleting a folder keeps what is in it: the cards and folders go to the folder it was in.
  const handleDeleteFolder = (folder) => {
    const parent = folder.parent === undefined ? null : folder.parent;
    getCards().forEach((card) => {
      if (folderOf(card) === folder.id) Vue.set(card, 'folder', parent);
    });
    getFolders().forEach((other) => {
      if (other.parent === folder.id) Vue.set(other, 'parent', parent);
    });
    setFolders(getFolders().filter((other) => other.id !== folder.id));
    refresh();
  };

  // The index (in the whole list) of the card being dragged, while one is: only a drag of a card is taken by a folder (a picture being
  // dragged is not).
  const draggingCardIndex = ref(null);
  // The drag listeners of a card's handle (from useDragReorder) that also say a card is being dragged.
  const wrapHandleListeners = (handleListeners) => (index) => {
    const base = handleListeners(index);
    return {
      dragstart: (event) => {
        base.dragstart(event);
        draggingCardIndex.value = index;
      },
      dragend: (event) => {
        base.dragend(event);
        draggingCardIndex.value = null;
      },
    };
  };
  const moveToFolder = (indices, target) => {
    const cards = getCards();
    const before = indices.map((index) => [cards[index], folderOf(cards[index])]);
    const apply = (pairs) => {
      pairs.forEach(([card, folder]) => Vue.set(card, 'folder', folder));
      refresh();
    };
    if (before.every(([, folder]) => folder === target)) return;
    apply(before.map(([card]) => [card, target]));
    recordReorder({
      undo: () => apply(before),
      redo: () => apply(before.map(([card]) => [card, target])),
      isCurrent: () => before.every(([card]) => folderOf(card) === target),
    });
  };
  // A card (or the selected cards, when it is one of them) dropped on a folder; the top level is null.
  const handleDropCards = (target) => {
    if (draggingCardIndex.value === null) return;
    const group = dragGroupFor(draggingCardIndex.value, getSelectedIndices());
    draggingCardIndex.value = null;
    moveToFolder(group, target);
  };

  return {currentFolder, openFolderId, folderOf, visibleEntries, openFolder, newCardFolder, handleAddFolder, handleDeleteFolder, draggingCardIndex,
    wrapHandleListeners, handleDropCards};
};
