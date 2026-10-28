# gopher2600-wasm

Builds the app's preview emulator: [github.com/jetsetilly/gopher2600](https://github.com/jetsetilly/gopher2600)'s
emulation core (real DPC+/CDF ARM-coprocessor support included, zero cgo)
compiled to WebAssembly. The output is vendored build output, not built as
part of `npm run build` - same convention as `public/bb19`'s WASM binaries.

## Why `vendor/` instead of a normal module dependency

gopher2600's repository is ~1.3GB (it bundles large test-fixture ROMs/assets
unrelated to the emulation core itself), which exceeds the Go module proxy's
zip size limit (`create zip: module source tree too large`). `go get` /
`go build` against it directly does not work. Instead, this directory vendors
*only the Go source actually imported* (`vendor/`, ~3MB) via a temporary
local `replace` directive during vendoring - see the comment on that
directive in `go.mod` for why it's safe to leave the (non-portable, points at
a throwaway local clone) path in place afterward: `-mod=vendor` builds never
read from it, they only check it matches `vendor/modules.txt` for
consistency.

## Local changes to the vendored gopher2600

`vendor/` is gopher2600 from its main branch (commit 295b9e1, 2026-10-25; the last release, v0.57.2, has no
AtariVox speech engine) with four local patches, kept in `patches/` so they can be reapplied after a re-vendor
(`git apply -p3 patches/*.patch` from this directory; `go mod vendor` brings back the unpatched files):

- `0001-vcs-step-no-closure-allocation.patch`: `VCS.Step()` built a new closure for
  every CPU instruction, which escaped to the heap (about 6,700 allocations per frame)
  and called a do-nothing callback three times per cycle. The cycle function is now a
  method built once. About 8% faster natively and about 6% in WASM.
- `0002-sprite-tick-reports-change-only-when-busy.patch`: the player, missile and ball
  `tick()` returned true on every color clock, so `Video.Pixel()` never took its early
  return. They now report a change only while drawing, latching or with an event
  scheduled (register writes already flag a change themselves). Rendered frames and
  audio hash identically to the unpatched core on every ROM tried (the `pgo-profile`
  harness prints a frame hash); about 2% faster natively, since Pixel was a smaller share
  than its profile suggested.

- `0003-elf-reads-the-loaders-data.patch`: the ELF cartridge (which PXE ROMs use) reopened the
  ROM by file name, and a ROM loaded from memory in the browser has no file, so it failed to
  attach. It now reads the data the loader already holds and only opens the file when there is
  none.

- `0004-prefs-not-read-in-a-browser.patch`: the television's colour generator reads a preferences file when the
  package starts (new since v0.57.2). In the browser opening that file works but reading it returns no data and no
  error, which the scanner reports as an error, so the emulator panicked at start-up and no ROM could run (0.53.1
  to 0.53.3 shipped a build with this). `prefs` now reads and writes nothing when `GOOS` is `js`.

The television's frame limiter is switched off in `main.go` (`tv.SetFPSLimit(false)`):
left on, it padded every frame to a full 16.7 ms wait, and the page paces the
emulator instead.

## Rebuilding (e.g. to pick up a gopher2600 update)

```bash
# 1. Get a full local clone (shallow is fine, still ~1.3GB) and point the
#    replace directive in go.mod at it:
git clone --depth 1 https://github.com/jetsetilly/gopher2600.git /tmp/gopher2600-src
# edit go.mod's replace line to point at that path

go mod tidy
go mod vendor
git apply patches/*.patch   # the local changes described above
# revert the replace line's path back to a placeholder if desired - it's
# never dereferenced by normal -mod=vendor builds, see go.mod's comment

# 2. Build the WASM artifact and copy the matching JS glue:
GOOS=js GOARCH=wasm go build -mod=vendor -ldflags="-s -w" \
  -gcflags='github.com/jetsetilly/gopher2600/...=-l -l -l -l' -gcflags='main=-l -l -l -l' \
  -o ../../public/js/gopher2600.wasm .
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" ../../public/js/wasm_exec.js
```

## Profile-guided optimization

`default.pgo` is a CPU profile Go uses automatically (`-pgo=auto` is its default) to inline and
de-virtualize the hot per-clock code. It made a frame about 11% faster (11.9 ms to 10.6 ms in the
browser, alternating runs of a brick-breaker ROM; 8% on a title-screen ROM). The profile covers a
title screen, a reference ROM and a game played with scripted joystick input. Regenerate it after a gopher2600 update or a change to
the frame loop in `main.go` by running ROMs natively under pprof, then rebuild:

```bash
go run -mod=vendor ./pgo-profile default.pgo path/to/game.bin path/to/another.bin
```

The `-l -l -l -l` gcflags raise the compiler's inlining effort for the emulator packages and
`main` (the flag is borrowed from JetSetIlly's Gopher2600-Utils `ebiten_test/webserve.sh`). Natively
it made a frame about 2% faster and the RGBA conversion loop about twice as fast. Do not apply it
to every package (`all=`): the Go runtime does not compile with it. `-B` (no bounds checks) was
about 4% faster too but turns an out-of-range index into silent memory corruption, so it is not used.

Converting a frame to RGBA uses a 256-entry color table per TV standard (rebuilt when the
standard changes; SECAM keeps the per-pixel call because its colors depend on the line above)
and writes each pixel as one 32-bit store. That took the conversion from about 270 us to about
40 us per frame natively, with identical output (the `pgo-profile` frame hash matches). The
table logic is duplicated in `pgo-profile/main.go`.

Tried and not kept: `GOWASM=satconv,signext` (no change in speed or size, the Go toolchain
already uses them), an `int32` signal index in the television (2-3% slower), and `-B` (about 4%
faster in WASM, but see above). Audio was not changed: skipping it while silent would change the
channel state the sound starts from.

Raising the GC threshold (`debug.SetGCPercent`) made no measurable difference once the
per-instruction allocation was gone, so it is not set.

## wasm-opt

Binaryen's `wasm-opt -O3` is deliberately not applied: it makes the file about 1 MB
smaller but the emulator about 2% slower (11.1 ms per frame against 10.9 ms, both with
the allocation patch, alternating runs in the same browser page). If you try it anyway, pass the feature flags explicitly
(`--enable-bulk-memory --enable-nontrapping-float-to-int --enable-sign-ext
--enable-mutable-globals --enable-multivalue`): `--all-features` makes newer Binaryen
write a compact-imports section browsers reject ("Invalid import kind 126").

## How the page runs it

The emulator runs in a web worker (`public/js/gopher2600-worker.js`), not on the
page's main thread, so a frame that takes 12-17 ms to emulate never blocks the UI.
`main.go` has no DOM access: the worker script provides `g2kBlank`, `g2kPostFrame`,
`g2kPostAudio` and `g2kReady` for it to call, and the page (`public/index.html`)
draws the frames it posts, plays the audio, forwards keyboard events and sends
one "tick" per display refresh. The worker turns those ticks into a steady 60
frames per second at any monitor refresh rate (50 for PAL).

## AtariVox

`main.go` can plug an AtariVox (a speech synthesizer on the right controller port) in place of the
Player 2 joystick or keypad: `setAtariVox(true)`, set from the Emulator settings dialog. gopher2600's
SpeakJet chip emulation (the `speakjet` module, vendored) makes the speech as an auxiliary audio source
at a sample rate of 8192 Hz; `webAudioMixer` collects it and `g2kPostAuxAudio` hands it to the page,
which plays it beside the console's sound. Only a ROM that sends the AtariVox serial data makes speech.

Attaching a cartridge puts the default controllers back in both ports, so `attachRom` plugs the AtariVox in again afterwards
(without that it was gone as soon as a ROM loaded). The page asks for it with `setAtariVoxRequired` while the loaded ROM has the
Speech blocks (see `public/index.html`).

`atarivox-test/` runs a ROM natively with an AtariVox plugged in and prints the bytes the SpeakJet chip was sent and how much
audio it made, to check the code the Speech blocks generate on either kernel (`go run -mod=vendor ./atarivox-test speech.bin 700`).

## Updating on Windows

gopher2600's `gui/sdlaudio/aux.go` is a reserved device name on Windows, so a plain `git clone` fails
to check out. Check out everything except `gui/` (`git sparse-checkout`, patterns `/*` and `!/gui/`),
the core does not need it. The module needs Go 1.27.2 or newer (`GOTOOLCHAIN=go1.27.2` downloads it).

Requires a Go toolchain (this was built with Go 1.27) - only for whoever
rebuilds this artifact, not for the app's normal `npm install`/`npm run build`.
