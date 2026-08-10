import {ref} from '@vue/composition-api';

// Click-and-drag reordering for a list of cards, built to be reusable
// across any tab that renders one - the Text tab is the first (and, so
// far, only) caller, but Sound/Music/etc's own card lists are expected to
// adopt this same hook later rather than growing their own copy. Uses the
// browser's native HTML5 drag-and-drop (no external library): draggable
// on the card itself gives the grab affordance the caller asked for
// ("click and drag on the cards", not a dedicated handle), and
// dragover/drop compute the new order.
//
// getItems/setItems are the only per-tab contract: getItems() returns the
// current array (in display order), setItems(newArray) is called with the
// reordered array once a drop lands - deliberately unopinionated about
// where/how that array is stored, so each tab can wire it straight into
// whatever storage setter it already uses (see TextEditor.vue's own
// handleChildChange-based example).
//
// dragAttrs(index)/dragListeners(index) are meant for a template's
// `v-bind`/`v-on` respectively (Vue 2 templates don't merge "onX"-style
// keys from a single v-bind the way JSX/render functions can, hence the
// split): v-bind="dragAttrs(index)" v-on="dragListeners(index)" on the
// same draggable element. dragAttrs' returned `class` object also needs a
// couple of CSS rules from the caller's own <style> - see this file's
// exported CSS_CLASS_* constants for their names; TextEditor.vue has a
// working copy of the actual rules to copy from.
export const CSS_CLASS_DRAGGING = 'drag-reorder-dragging';
export const CSS_CLASS_DRAG_OVER = 'drag-reorder-over';

export const useDragReorder = (getItems, setItems) => {
  const draggedIndex = ref(null);
  const dragOverIndex = ref(null);

  const reset = () => {
    draggedIndex.value = null;
    dragOverIndex.value = null;
  };

  const dragAttrs = (index) => ({
    draggable: true,
    class: {
      [CSS_CLASS_DRAGGING]: draggedIndex.value === index,
      [CSS_CLASS_DRAG_OVER]: dragOverIndex.value === index && draggedIndex.value !== index,
    },
  });

  const dragListeners = (index) => ({
    dragstart: (event) => {
      draggedIndex.value = index;
      event.dataTransfer.effectAllowed = 'move';
      // Firefox refuses to start a drag at all unless data is actually
      // set here - the value itself is never read back (the drop handler
      // below closes over draggedIndex instead, which survives even if
      // the drop lands on an element that never itself started the drag).
      event.dataTransfer.setData('text/plain', String(index));
    },
    dragover: (event) => {
      // Dropping is disallowed by default - preventDefault is what tells
      // the browser this element is a valid drop target.
      event.preventDefault();
      event.dataTransfer.dropEffect = 'move';
      dragOverIndex.value = index;
    },
    dragleave: () => {
      if (dragOverIndex.value === index) dragOverIndex.value = null;
    },
    drop: (event) => {
      event.preventDefault();
      const from = draggedIndex.value;
      reset();
      if (from == null || from === index) return;
      const items = getItems().slice();
      const [moved] = items.splice(from, 1);
      items.splice(index, 0, moved);
      setItems(items);
    },
    dragend: reset,
  });

  return {dragAttrs, dragListeners};
};
