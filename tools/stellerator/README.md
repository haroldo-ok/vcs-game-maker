# 6502.ts emulator backend

The preview emulator is [6502.ts](https://github.com/6502ts/6502.ts) (MIT, the emulator behind
Stellerator) by default, with gopher2600 (`tools/gopher2600-wasm`) as a second choice. Both sit
behind the same `window.gopher2600` API and message protocol (see `public/index.html`), and the
**Emulator Settings** button in the emulator pane (`src/components/EmulatorSettingsDialog.vue`)
chooses between them and sets the screen effects.

| File | What it is |
|---|---|
| `worker-entry.js` | The web worker: runs 6502.ts's machine model and speaks the same messages as `public/js/gopher2600-worker.js` (ticks, calls, keys; frames and audio back). |
| `page-entry.js` | The page side: 6502.ts's WebGL video driver (TV signal filter, phosphor, scanlines, gamma, quasi-integer scaling), used only while an effect is on. |
| `build.js` | Bundles both with esbuild into `public/js/stellerator-worker.js` and `public/js/stellerator-page.js`. These are committed, like `gopher2600.wasm`, so a normal build needs no extra step. |

Rebuild with `npm run build:stellerator` after changing a file here or updating the `6502.ts`
package. `npm run build:palettes` (`palettes.js`) copies 6502.ts's NTSC and PAL palettes into
`src/utils/palette.js` (the color of every swatch and editor) and the Aseprite extension in
`6502ts-palettes/`; run it after a 6502.ts update too.

## How it fits together

- The worker paces itself like the gopher2600 one: the page sends one `tick` per display refresh
  and the worker runs the frames that are due, 60 per second (50 for PAL) whatever the monitor's
  refresh rate. Each tick that ran a frame sends back the last picture (160 pixels wide RGBA)
  and the audio (6502.ts's PCM output, 31,440 Hz, run through a high-pass filter because it is
  unipolar).
- With every effect off, the page draws the picture straight onto the canvas. With an effect on,
  the picture goes through 6502.ts's WebGL driver, which draws into an off-screen canvas that is
  copied onto the visible one in the same animation frame, so the visible canvas keeps a single
  2D context for both emulators. The driver and the visible canvas are sized to what reaches the
  screen (the app scales the canvas with a CSS transform), so the picture is drawn 1:1.
- Front-panel switches: 6502.ts reads a switch as "pressed" when true, so the color switch is
  B&W and a difficulty switch is B when set; the worker inverts them.
- **Keypads:** 6502.ts has no keypad controller. When a ROM needs one (`setKeypadMode`), the
  page starts the gopher2600 worker for it and goes back to 6502.ts when the next ROM does not.
- A new worker is sent the key mapping, keypad modes and panel switches the page remembers
  (`replayGopher2600State` in `public/index.html`), and `src/hooks/emulator.js` re-loads the last
  ROM when its `gopher2600-ready` event fires.
- CPU accuracy ("Cycle exact" or "Instruction") is a setting of the 6502.ts machine; changing it
  restarts the ROM.

## Checking it against gopher2600

The two emulators produced pixel-identical frames (compared through a palette mapping, with the
same scripted fire presses) for the 8k/16k/32k Superchip ROMs, a 64k EFSC ROM and a DPC+ ROM
(Cave Bandit). The only differences seen were score digits that depend on the console's random
power-on RAM. 6502.ts runs a frame in about 1.2 ms against about 9 ms for gopher2600's
WebAssembly in Chrome 152.

## Known differences

- PAL60 runs with NTSC timing and the PAL palette, swapped into the TIA by the worker (the field is private to 6502.ts, so a 6502.ts update could need that line revisited).
- The picture is 212 lines of the TV image shown at 4:3; gopher2600 crops 220 lines.
- "Adaptive frame skipping" (Options tab) only affects gopher2600.
