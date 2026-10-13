import {ref} from '@vue/composition-api';

// Same "single pending slot in a module shared across unrelated component
// trees" pattern as hooks/quick-color-undo.js, for the shared graphics
// toolbar's Undo button (GraphicEditorToolbar.vue) to also restore a
// deleted Title Screen card - the toolbar has no idea TitleScreenEditor.vue
// or its card list even exist, so this is the only practical way to
// connect a click on its Undo button back to a deletion that happened in a
// completely different component.
//
// restoreCard is the actual restore function, supplied by whichever caller
// recorded the deletion (TitleScreenEditor.vue's handleDeleteCard) - kept
// generic (not "splice this card into this screen's cards array" hardcoded
// here) so this same module could back a card-delete undo on another tab
// later without changing anything in here.
let pending = null;
const hasPendingRef = ref(false);

export const usePendingCardDeletion = () => hasPendingRef;

// Called right before a card is actually removed.
export const recordCardDeletion = (restoreCard) => {
  pending = restoreCard;
  hasPendingRef.value = true;
};

// Called by GraphicEditorToolbar's Undo button before falling through to
// quick color deletion, then the focused pixel editor's undo. Returns
// whether it actually handled the click (true = restored the card, the
// caller must not try anything else; false = nothing pending).
export const tryUndoCardDeletion = () => {
  if (!pending) return false;
  const restoreCard = pending;
  pending = null;
  hasPendingRef.value = false;
  restoreCard();
  return true;
};
