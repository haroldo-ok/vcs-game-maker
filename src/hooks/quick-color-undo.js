import {ref} from '@vue/composition-api';

// Lets the shared graphics toolbar's Undo button (see GraphicEditorToolbar.vue)
// also restore a quick color swatch removed via QuickColorPalette.vue's
// alt-click delete - the two live in unrelated component trees (the palette
// isn't a child of the toolbar, and the toolbar has no idea a palette even
// exists), so this module-scope slot is the only practical way to connect
// them without threading a prop through every tab that uses both.
//
// A single pending slot, not a full stack - restoring it (or a newer
// deletion superseding it) clears it outright rather than chaining back
// further. Only reachable while nothing has been drawn on the SAME frame
// that was focused at the moment of deletion since (see
// tryUndoQuickColorDeletion below) - once that frame's pixel edit
// history moves, this button falls back to undoing THAT instead, and the
// color deletion is no longer undoable through it.
let pending = null;
const hasPendingRef = ref(false);

// Reactive read for GraphicEditorToolbar.vue's Undo button - enables it
// even with no frame currently focused (activeEditor null), so a color
// deleted before any card/frame was ever selected can still be restored.
export const usePendingQuickColorDeletion = () => hasPendingRef;

// Called right before a swatch is actually removed (see
// QuickColorPalette.vue's handleRemoveColor) - undoStackLength is the
// CURRENTLY focused pixel editor's undo history length at this exact
// moment (or null with no frame focused), snapshotted so
// tryUndoQuickColorDeletion below can tell whether anything's been drawn on
// that same frame since.
export const recordQuickColorDeletion = ({byte, index, paletteStorage, undoStackLength}) => {
  pending = {byte, index, paletteStorage, undoStackLength};
  hasPendingRef.value = true;
};

// Called by GraphicEditorToolbar's Undo button before falling through to the
// focused pixel editor's undo. Returns whether it actually handled the
// click (true = restored the color, the caller must NOT also call
// activeEditor.undo(); false = nothing pending, or the pending deletion is
// now stale - the caller falls through to its normal pixel undo).
export const tryUndoQuickColorDeletion = (activeEditor) => {
  if (!pending) return false;
  const currentLength = activeEditor && activeEditor.editor && activeEditor.editor.history ?
    activeEditor.editor.history.undoStack.length : null;
  const stillCurrent = currentLength === pending.undoStackLength;
  const {byte, index, paletteStorage} = pending;
  pending = null;
  hasPendingRef.value = false;
  if (!stillCurrent) return false;
  const restored = (paletteStorage.value || []).slice();
  restored.splice(index, 0, byte);
  paletteStorage.value = restored;
  return true;
};
