'use strict';

import {ref} from '@vue/composition-api';

// Whether the Shift key is currently held - a single app-wide ref (same
// "one shared value, not per-instance state" pattern as hooks/pixel-tool.js)
// so the Line tool (utils/line-tool.js) can read live key state from inside
// its handlePointerMove, which only ever receives a plain {x, y} position
// from @curtishughes/pixel-editor's PixelEditor (see its mousemove handler),
// never the real MouseEvent a shiftKey check would normally read off of.
// Tracked via plain keydown/keyup, independent of any specific canvas or
// drag gesture, so it's already correct the moment a drag starts rather
// than needing its mouse-event plumbing threaded through the tool
// interface. The window "blur" listener guards against a genuinely stuck
// "held" state if focus leaves the page (e.g. alt-tabbing away) while Shift
// is still physically down - there's no keyup to ever un-stick it otherwise.
const shiftHeld = ref(false);

window.addEventListener('keydown', (event) => {
  if (event.key === 'Shift') shiftHeld.value = true;
});
window.addEventListener('keyup', (event) => {
  if (event.key === 'Shift') shiftHeld.value = false;
});
window.addEventListener('blur', () => {
  shiftHeld.value = false;
});

export const useShiftKey = () => shiftHeld;
