import {reactive, ref} from '@vue/composition-api';

// Which tool (pencil/eraser) is currently selected - shared across EVERY
// PixelEditor.vue instance in the whole app, not per-frame/per-card local
// state the way it used to be. Switching which graphic you're editing (a
// different card, frame, or animation - each a separate PixelEditor.vue
// instance) used to silently reset back to Pencil, since each instance's
// "toggledTool" data property independently defaulted to it - reported
// as a real bug: picking Eraser, then clicking into a different frame,
// meant drawing there with what LOOKED like Eraser still selected on the
// shared toolbar actually erased nothing until Eraser was clicked again.
// A single shared ref fixes both halves of that at once: the toolbar's
// highlighted button now reflects one true value instead of whichever
// instance happens to be focused, and a freshly-focused instance picks up
// that same value immediately (see PixelEditor.vue's initEditor) instead of
// requiring a fresh click before drawing actually uses it.
const toggledTool = ref('pencil');

export const usePixelTool = () => toggledTool;

// The color the swatch in the graphic editor toolbar holds (a color byte, or null for none yet): the Pencil and Fill paint the rows of
// a row color bar with it, and the Eyedropper sets it to the color it is clicked on. Drawing on the picture itself only draws pixels.
const drawColor = ref(null);

export const useDrawColor = () => drawColor;

// Mirror drawing: with horizontal and/or vertical on, whatever is drawn on one
// side of a graphic is drawn flipped on the other side too (both on: all four
// corners). Shared by every PixelEditor.vue instance like toggledTool above, and
// switched by the two buttons in GraphicEditorToolbar.vue.
const mirrorDraw = reactive({horizontal: false, vertical: false});

export const useMirrorDraw = () => mirrorDraw;
