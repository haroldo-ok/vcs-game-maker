'use strict';

// The Delete key opens the "Delete this ...?" confirmation of the selected card or frame, next to the mouse
// pointer. Every ConfirmDeleteMenu registers here, and says whether what it deletes is selected; of the
// selected ones the most specific wins (a frame before its card, a card before its page), and nothing
// happens when that is not a single one.

const menus = new Set();
let mouse = {x: 0, y: 0};
let installed = false;

const typingInto = (target) => !!target && (target.isContentEditable ||
  ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName));

const handleKeydown = (event) => {
  if (event.key !== 'Delete' || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
  if (typingInto(event.target) || event.defaultPrevented) return;
  // Not while a popup (the confirmation itself, or any other menu or dialog) is open.
  if (document.querySelector('.v-menu__content.menuable__content__active, .v-dialog--active')) return;
  // Once every other listener of the key has run: a graphic editor with pixels selected takes Delete to clear them (see
  // GraphicEditorToolbar.vue), and then the key is not for the card.
  setTimeout(() => {
    if (event.defaultPrevented) return;
    const selected = [...menus].filter((menu) => menu.selected && menu.$el && menu.$el.isConnected !== false);
    if (!selected.length) return;
    const top = Math.max(...selected.map((menu) => menu.selectPriority));
    const winners = selected.filter((menu) => menu.selectPriority === top);
    if (winners.length !== 1) return;
    winners[0].openAtPointer(mouse);
  }, 0);
};

export const registerDeleteMenu = (menu) => {
  menus.add(menu);
  if (installed) return;
  installed = true;
  window.addEventListener('mousemove', (event) => {
    mouse = {x: event.clientX, y: event.clientY};
  }, true);
  window.addEventListener('keydown', handleKeydown);
};

export const unregisterDeleteMenu = (menu) => {
  menus.delete(menu);
};
