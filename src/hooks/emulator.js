'use strict';

import {useLastLoadedRomBytes, useLastLoadedTvSpec, clearLoadedRom} from './rom-status';

// public/index.html's loadGopher2600Wasm() fires this every time a
// window.gopher2600 instance becomes ready - the real first page load
// (nothing to restore yet, unless a previous page load in this same tab
// session left something behind - see rom-status.js's sessionStorage
// restore, which runs before this listener can ever fire), every automatic
// reinstantiation after a fatal WASM trap (see that function's comment
// on why a crash can't be recovered from inside the dead instance itself),
// and a real full page reload (App.vue's handleRefreshEmulator). A fresh
// instance boots with no ROM attached, so without this, "Reset"/every other
// panel switch stayed visibly dead after a crash even though the
// auto-recovery had already silently replaced window.gopher2600 with a
// working instance underneath - confirmed directly as a real reported
// symptom ("hitting reset doesn't fix the issue"). Reads whatever was last
// successfully loaded, from either a real "Update ROM" build or a Title
// Screen preview build, not just the real build's compiledRomBytes -
// otherwise a page reload while a preview was showing came back up blank
// instead of showing what was actually on screen a moment ago.
// BlocklyBB.keypad0Used/keypad1Used (see hooks/rom.js's loadRom call)
// aren't re-applied here - they're a property of the CURRENT workspace's
// compiled code, not of the ROM bytes themselves, and re-deriving them here
// would need the whole compile pipeline re-run; the keypad mode a fresh
// instance boots with (off) matches a real console being power-cycled
// anyway, and the next real "Update ROM" click reapplies it correctly
// regardless.
window.addEventListener('gopher2600-ready', () => {
  const lastLoadedRomBytes = useLastLoadedRomBytes();
  if (!lastLoadedRomBytes.value) return;
  const lastLoadedTvSpec = useLastLoadedTvSpec();
  withGopher2600((gopher2600) => gopher2600.loadRom(lastLoadedRomBytes.value, lastLoadedTvSpec.value));
});

// Waits for tools/gopher2600-wasm's window.gopher2600 API to exist - its WASM
// module is instantiated asynchronously at page load (see public/index.html),
// independent of both the compile pipeline (hooks/rom.js) and the panel
// switch UI (App.vue), either of which can run before it's ready.
// Note on error handling: if gopher2600.wasm has previously crashed (a fatal
// WASM trap), window.gopher2600 itself is still a live JS object (its
// function properties survive), but calling any of them throws "Go program
// has already exited". Callers that must not let a dead emulator instance
// break unrelated functionality (see hooks/rom.js's build pipeline) should
// wrap their callback in try/catch; this only guards against the
// callback never running at all (window.gopher2600 not existing yet).
export const withGopher2600 = (callback, retriesLeft = 40) => {
  if (window.gopher2600) {
    callback(window.gopher2600);
    return;
  }
  if (retriesLeft <= 0) return;
  window.setTimeout(() => withGopher2600(callback, retriesLeft - 1), 250);
};

// Stops (or restarts) the emulator running its frames, keeping the ROM and its state. A build
// pauses it so the compiler has the machine to itself instead of sharing it with a game
// running at 60 frames per second. A no-op if the emulator is an older build without it.
export const setEmulatorPaused = (paused) => {
  withGopher2600((gopher2600) => {
    if (typeof gopher2600.setPaused === 'function') gopher2600.setPaused(paused);
  });
};

// Empties the emulator and forgets the ROM behind it, for a new or imported
// project (the ROM belonged to the project it replaces). A no-op on the
// emulator side if it isn't loaded yet or is an older build without clearRom.
export const clearEmulatorRom = () => {
  clearLoadedRom();
  safeWithGopher2600((gopher2600) => {
    if (gopher2600.clearRom) gopher2600.clearRom();
  });
};

// For callers (front-panel switch UI) where a dead emulator instance should
// just be a silent no-op rather than an uncaught exception out of a Vue
// event handler - the ROM itself is unaffected either way, there's simply
// nothing left running to send the switch state to until the user reloads.
export const safeWithGopher2600 = (callback) => {
  withGopher2600((gopher2600) => {
    try {
      callback(gopher2600);
    } catch (err) {
      console.error('gopher2600-wasm: call failed (the emulator instance may have crashed - try ' +
        '"Refresh emulator"):', err);
    }
  });
};
