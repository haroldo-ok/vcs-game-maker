import {ref} from '@vue/composition-api';
import {recordReorder, sameItems} from './reorder-history';
import {renumberCards} from '../utils/card-refs';

// Click-and-drag reordering for a list of cards, built to be reusable
// across any tab that renders one - TextEditor.vue and SoundFXEditor.vue
// are the current callers, with Music/etc's  card lists expected to
// adopt this same hook later rather than growing their  copy. Uses the
// browser's native HTML5 drag-and-drop (no external library): dragover/drop
// compute the new order.
//
// getItems/setItems are the only per-tab contract: getItems() returns the
// current array (in display order), setItems(newArray) is called with the
// reordered array once a drop lands - deliberately unopinionated about
// where/how that array is stored, so each tab can wire it straight into
// whatever storage setter it already uses (see TextEditor.vue's
// handleChildChange-based example).
//
// dragAttrs(index)/dragHandleListeners(index) are meant for a template's
// `v-bind`/`v-on` respectively (Vue 2 templates don't merge "onX"-style
// keys from a single v-bind the way JSX/render functions can, hence the
// split): v-bind="dragAttrs(index)" v-on="dragHandleListeners(index)" on a
// small drag handle within the top of the card, NOT the whole card. Making
// the whole card draggable was tried first and reverted: `draggable="true"`
// on an ancestor intercepts the browser's  click-and-drag
// text-selection gesture for everything inside it, so a user could no
// longer select text in a card's  fields.
//
// dragTargetListeners(index) is separate and goes on the CARD itself
// (v-on="dragTargetListeners(index)", no v-bind needed - the card itself
// was never draggable, only a valid drop target): dragover/drop need to
// work anywhere a dragged card might be dropped ON, not just over the
// target's  small handle, which dragHandleListeners alone can't cover
// since drag-and-drop only starts from - not lands on - a `draggable`
// element itself.
//
// dragCardClass(index) is similarly separate so the CARD can still show the
// dragging/drag-over visual feedback even though only the handle actually
// carries `draggable`/dragstart - see this file's exported CSS_CLASS_*
// constants for the class names; TextEditor.vue has a working copy of the
// actual CSS rules to copy from.
export const CSS_CLASS_DRAGGING = 'drag-reorder-dragging';
export const CSS_CLASS_DRAG_OVER = 'drag-reorder-over';
// Also set (with the one above) when the dragged item came from an earlier
// position, so it will land AFTER the one dragged over - for lists laid out
// side by side, where the drop mark goes on the near edge.
export const CSS_CLASS_DRAG_OVER_AFTER = 'drag-reorder-over-after';
// For cards laid out in a grid (see the sideBySide option): the half of the card the pointer is over says whether the dragged
// cards go before it or after it, and the mark goes on that edge.
export const CSS_CLASS_SIDE_BEFORE = 'drag-reorder-side-before';
export const CSS_CLASS_SIDE_AFTER = 'drag-reorder-side-after';

// getSelectedIndices (optional) returns the indices of the cards selected with Shift or Ctrl/Cmd+click: dragging one of
// two or more selected cards then moves all of them, together and in their order.
// The items with the ones at the indices in group taken out and put back, in their order, just before the item that was at
// insertAt (the end of the list when insertAt is the length). An insertAt that is itself in the group puts them where
// that group started.
export const moveCards = (items, group, insertAt) => {
  const remaining = items.filter((_, i) => !group.includes(i));
  let at = remaining.length;
  for (let i = insertAt; i < items.length; i++) {
    if (!group.includes(i)) {
      at = remaining.indexOf(items[i]);
      break;
    }
  }
  remaining.splice(at, 0, ...group.map((i) => items[i]));
  return remaining;
};

// The indices being dragged: the selected cards when the one dragged is one of two or more, otherwise just it.
export const dragGroupFor = (index, selected) => {
  const sorted = selected.slice().sort((a, b) => a - b);
  return sorted.length > 1 && sorted.includes(index) ? sorted : [index];
};

// options:
// - sideBySide: the cards are in a grid, so the half of a card the pointer is over (left or right) says whether the dragged cards go
//   before or after it, instead of the place they came from; the card shows it with CSS_CLASS_SIDE_BEFORE/AFTER.
// - renumber: {kind, context, onRenumbered}: the cards are numbered by their place (see utils/card-refs.js). After every move (and
//   after undoing or redoing one) the cards get the numbers of their new places, and what refers to them follows.
//   context() gives the extra facts of kind (the screenId of the cards of a title screen); onRenumbered(idMap) lets the tab
//   move what it keeps by number (collapsed cards, the selection) to the new numbers.
export const useDragReorder = (getItems, setItems, getSelectedIndices = () => [], options = {}) => {
  const draggedIndex = ref(null);
  const dragOverIndex = ref(null);
  // {index, side} while sideBySide: the card the pointer is over and which half of it.
  const dragOverSide = ref(null);
  const {sideBySide = false, renumber = null} = options;

  // Puts the cards in an order: numbers them by their place first (the cards are the same objects, so setItems stores the new numbers),
  // then lets the tab store the list.
  const applyOrder = (order) => {
    const idMap = renumber ?
      renumberCards(renumber.kind, order, {...(renumber.context ? renumber.context() : {}), previous: getItems().slice()}) : null;
    setItems(order);
    if (idMap && renumber.onRenumbered) renumber.onRenumbered(idMap);
  };

  const sideOf = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return (event.clientX - rect.left) < rect.width / 2 ? 'before' : 'after';
  };
  // The indices being dragged: just the one card, or every selected card when it is one of them.
  const draggedGroup = ref([]);

  const reset = () => {
    draggedIndex.value = null;
    dragOverIndex.value = null;
    dragOverSide.value = null;
    draggedGroup.value = [];
  };

  const dragAttrs = () => ({
    draggable: true,
  });

  const dragging = (index) => draggedIndex.value === index || draggedGroup.value.includes(index);
  const dragCardClass = (index) => (sideBySide ? {
    [CSS_CLASS_DRAGGING]: dragging(index),
    [CSS_CLASS_SIDE_BEFORE]: !dragging(index) && !!dragOverSide.value && dragOverSide.value.index === index &&
      dragOverSide.value.side === 'before',
    [CSS_CLASS_SIDE_AFTER]: !dragging(index) && !!dragOverSide.value && dragOverSide.value.index === index &&
      dragOverSide.value.side === 'after',
  } : {
    [CSS_CLASS_DRAGGING]: dragging(index),
    [CSS_CLASS_DRAG_OVER]: dragOverIndex.value === index && !draggedGroup.value.includes(index) &&
      draggedIndex.value !== index,
    [CSS_CLASS_DRAG_OVER_AFTER]: dragOverIndex.value === index && draggedIndex.value != null &&
      draggedIndex.value < index,
  });

  const dragHandleListeners = (index) => ({
    dragstart: (event) => {
      draggedIndex.value = index;
      draggedGroup.value = dragGroupFor(index, getSelectedIndices());
      event.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag at all unless data is actually
      // set here - the value itself is never read back (the drop handler
      // below closes over draggedIndex instead, which survives even if
      // the drop lands on an element that never itself started the drag).
      event.dataTransfer.setData('text/plain', String(index));
    },
    dragend: reset,
  });

  const dragTargetListeners = (index) => ({
    dragover: (event) => {
      // Dropping is disallowed by default - preventDefault is what tells
      // the browser this element is a valid drop target.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      dragOverIndex.value = index;
      if (sideBySide) {
        const side = sideOf(event);
        const current = dragOverSide.value;
        if (!current || current.index !== index || current.side !== side) dragOverSide.value = {index, side};
      }
      // Stops this dragover from also reaching an ANCESTOR's
      // dragTargetListeners (e.g. TitleScreenEditor.vue's per-screen card
      // list nested inside that screen's draggable-card list) -
      // without this, dragover bubbling up the DOM marked the outer
      // screen/card as "dragged over" too, showing its drag-above
      // highlight for a drag that can only ever reorder within this
      // nested list, never actually move onto that outer target
      // (confirmed as a real reported bug).
      event.stopPropagation();
    },
    dragleave: (event) => {
      if (sideBySide && event.currentTarget.contains(event.relatedTarget)) return;
      if (dragOverIndex.value === index) dragOverIndex.value = null;
      if (dragOverSide.value && dragOverSide.value.index === index) dragOverSide.value = null;
      event.stopPropagation();
    },
    drop: (event) => {
      event.preventDefault();
      event.stopPropagation();
      const from = draggedIndex.value;
      const group = draggedGroup.value.length ? draggedGroup.value : [from];
      // Read off the drop itself, not off where the last dragover left the mark.
      const side = sideBySide ? sideOf(event) : null;
      reset();
      if (from == null || group.includes(index)) return;
      const before = getItems().slice();
      // The dragged cards go where the one dropped on is: after it when they came from above it, before it when
      // they came from below (in a grid: on the side of the card the pointer is on).
      const insertAt = sideBySide ? (side === 'after' ? index + 1 : index) : (from < index ? index + 1 : index);
      const items = moveCards(before, group, insertAt);
      if (sameItems(items, before)) return;
      applyOrder(items);
      const after = items.slice();
      recordReorder({
        undo: () => applyOrder(before.slice()),
        redo: () => applyOrder(after.slice()),
        isCurrent: () => sameItems(getItems(), after),
      });
    },
  });

  return {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners, applyOrder};
};
