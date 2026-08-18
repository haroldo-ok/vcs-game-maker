import {ref} from '@vue/composition-api';

// Click-and-drag reordering for a list of cards, built to be reusable
// across any tab that renders one - TextEditor.vue and SoundFXEditor.vue
// are the current callers, with Music/etc's own card lists expected to
// adopt this same hook later rather than growing their own copy. Uses the
// browser's native HTML5 drag-and-drop (no external library): dragover/drop
// compute the new order.
//
// getItems/setItems are the only per-tab contract: getItems() returns the
// current array (in display order), setItems(newArray) is called with the
// reordered array once a drop lands - deliberately unopinionated about
// where/how that array is stored, so each tab can wire it straight into
// whatever storage setter it already uses (see TextEditor.vue's own
// handleChildChange-based example).
//
// dragAttrs(index)/dragHandleListeners(index) are meant for a template's
// `v-bind`/`v-on` respectively (Vue 2 templates don't merge "onX"-style
// keys from a single v-bind the way JSX/render functions can, hence the
// split): v-bind="dragAttrs(index)" v-on="dragHandleListeners(index)" on a
// small drag handle within the top of the card, NOT the whole card. Making
// the whole card draggable was tried first and reverted: `draggable="true"`
// on an ancestor intercepts the browser's own click-and-drag
// text-selection gesture for everything inside it, so a user could no
// longer select text in a card's own fields.
//
// dragTargetListeners(index) is separate and goes on the CARD itself
// (v-on="dragTargetListeners(index)", no v-bind needed - the card itself
// was never draggable, only a valid drop target): dragover/drop need to
// work anywhere a dragged card might be dropped ON, not just over the
// target's own small handle, which dragHandleListeners alone can't cover
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

export const useDragReorder = (getItems, setItems) => {
  const draggedIndex = ref(null);
  const dragOverIndex = ref(null);

  const reset = () => {
    draggedIndex.value = null;
    dragOverIndex.value = null;
  };

  const dragAttrs = () => ({
    draggable: true,
  });

  const dragCardClass = (index) => ({
    [CSS_CLASS_DRAGGING]: draggedIndex.value === index,
    [CSS_CLASS_DRAG_OVER]: dragOverIndex.value === index && draggedIndex.value !== index,
  });

  const dragHandleListeners = (index) => ({
    dragstart: (event) => {
      draggedIndex.value = index;
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
  });

  return {dragAttrs, dragCardClass, dragHandleListeners, dragTargetListeners};
};
