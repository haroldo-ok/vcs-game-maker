'use strict';

export const UNDO_TITLE = 'Undo (Ctrl+Z)';
export const REDO_TITLE = 'Redo (Ctrl+Y)';

/**
 * Which history shortcut a keydown is: Ctrl/Cmd+Z undoes and Ctrl/Cmd+Y redoes (the Actions tab's redo is Ctrl+Y as well).
 * Nothing while typing in a text field, where the keys undo and redo the text instead.
 * @param {!KeyboardEvent} event
 * @return {?string} 'undo', 'redo', or null for any other key.
 */
export const undoRedoKind = (event) => {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || !event.key) return null;
  const target = event.target;
  const tag = target && target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || (target && target.isContentEditable)) return null;
  const letter = event.key.toLowerCase();
  if (letter === 'z' && !event.shiftKey) return 'undo';
  if (letter === 'y' && !event.shiftKey) return 'redo';
  return null;
};
