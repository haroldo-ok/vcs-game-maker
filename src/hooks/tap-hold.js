'use strict';

// The emulator steps one video frame per animation frame and reads a
// keyboard press only when it renders, but the browser delivers keydown and
// keyup as soon as they happen. A quick tap, or any tap while the page is
// running slow and animation frames are being skipped, can put both events
// between two renders, so the console never sees the press at all. This holds
// a keyup back until a frame has run since its keydown, so every tap lasts at
// least one emulated frame.
//
// Registered on the window in the capture phase so it runs before the
// emulator's listeners on the document.
let frameNumber = 0;
const downFrame = new Map(); // KeyboardEvent.code -> frameNumber at keydown
const replayed = new WeakSet();

/**
 * Starts holding too-short taps for one frame.
 * @return {function(): void} Stops it.
 */
export const startTapHold = () => {
  let frame = null;
  const count = () => {
    frameNumber++;
    frame = window.requestAnimationFrame(count);
  };
  frame = window.requestAnimationFrame(count);

  const handleKeydown = (event) => {
    if (!event.repeat) downFrame.set(event.code, frameNumber);
  };
  const handleKeyup = (event) => {
    if (replayed.has(event)) return;
    if (downFrame.get(event.code) !== frameNumber) {
      downFrame.delete(event.code);
      return;
    }
    downFrame.delete(event.code);
    event.stopImmediatePropagation();
    event.preventDefault();
    // Two frames out guarantees a render in between, whichever order the
    // frame callbacks run in.
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const replay = new KeyboardEvent('keyup', {code: event.code, key: event.key, bubbles: true, cancelable: true});
      replayed.add(replay);
      (event.target || document).dispatchEvent(replay);
    }));
  };
  window.addEventListener('keydown', handleKeydown, true);
  window.addEventListener('keyup', handleKeyup, true);

  return () => {
    window.cancelAnimationFrame(frame);
    window.removeEventListener('keydown', handleKeydown, true);
    window.removeEventListener('keyup', handleKeyup, true);
  };
};
