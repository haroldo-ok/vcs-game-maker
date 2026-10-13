# Changes from stock batari Basic 1.9

This directory is vendored from the real bB 1.9 distribution (see the top
comment in `src/hooks/bb-compiler.js`). Everything here should match stock
bB byte-for-byte *except* the changes tracked below - keeping this list
accurate is what lets any of them be proposed back upstream later without
having to re-diff the whole tree by hand.

## Binary includes (`custom2.bin`, `DPCplus.arm`) were silently corrupted

DPC+ needs two binary (non-ASCII) includes: `DPCplusheader.asm` has an
unconditional `incbin "DPCplus.arm"` followed by an unconditional `incbin
"custom/bin/custom2.bin"` - neither is gated by `ifconst`/`ifnconst`
(confirmed by grepping the whole file), so every `set kernel DPC+` project
pulls both in. `custom2.bin` is a stock placeholder ARM binary that has
shipped with bB since its first commit (see
[batari-Basic/includes/custom/bin](https://github.com/batari-Basic/batari-Basic/tree/master/includes/custom/bin))
and reserves a fixed slot in the DPC+ ROM layout regardless of whether a
project uses custom ARM driver code - it isn't something a project can opt
out of. Getting a real DPC+ build working surfaced two separate,
independent bugs in how this app's whole toolchain handles binary content -
neither had ever been exercised before, since every other kernel this app
supports only includes plain ASCII `.asm`/`.h` files.

**Bug 1 - `includes-manifest.json` excluded `custom/` entirely.**
`public/bb19/includes-manifest.json` (see `src/hooks/bb-compiler.js`) is a
flat `{"includes/<file>": content}` snapshot every WASI compile stage
actually reads from instead of the live files in this directory - it does
not regenerate itself. It previously had zero keys under `custom/`, even
though the real files were on disk at `includes/custom/bin/custom2.bin`
etc., so `custom2.bin`'s `incbin` failed outright with `Unable to open
file`. Fixed by adding all 11 files under `includes/custom/`
(`ARMCOMPILE.txt`, `Makefile`, `bin/custom2.bin`, `bin/main.lst`, `main.c`,
`main.c.last`, `main.i`, `main.s`, `src/custom.S`, `src/custom.boot.lds`,
`src/custom.h`) to the manifest. `UPSTREAM_CHANGES.md` itself is still
excluded from the manifest, as before.

**Bug 2 - binary content was silently mangled by two separate UTF-8
round-trips, both assuming text.** Once `custom2.bin` could be found at
all, the build still failed with DASM reporting `Origin Reverse-indexed` on
the very next `incbin` line - reproducing on every single bank-relocation
attempt (confirmed via a real build reaching "Attempt 64" and giving up),
which was the first clue this had nothing to do with bank assignment. The
manifest's existing `includes/DPCplus.arm` entry turned out to be 5559
characters, when the real file (both this fork's disk copy and the real
upstream
[batari-Basic/includes/DPCplus.arm](https://github.com/batari-Basic/batari-Basic/blob/master/includes/DPCplus.arm))
is 3072 bytes - `DPCplusheader.asm` reserves exactly `$400`-`$1000` (3072
bytes) for this `incbin` before forcing `ORG $1000` right after for
`custom2.bin`, so the oversized entry pushed `ORG` backward, which is
exactly what DASM's `Origin Reverse-indexed` means.

The real cause was two independent, stacked UTF-8 round-trips, each lossy
for the arbitrary (non-UTF-8-valid) bytes a compiled ARM binary contains:
1. This project's compiler hook (`src/hooks/bb-compiler.js`) fetches
   `includes-manifest.json` via `fetch(...).then(r => r.json())` - the
   browser always decodes an HTTP JSON response body as UTF-8, regardless
   of how the file was actually written to disk.
2. `buildTree()` (same file) mounted every include into the in-browser WASI
   filesystem via `new TextEncoder().encode(content)` - re-encoding as
   UTF-8 a second time before DASM/2600basic.wasm ever see the bytes.

Both steps are lossless for plain ASCII (the only kind of include content
that existed before DPC+), which is exactly why this was never caught.
Fixed on both ends: `includes-manifest.json` is now written to disk with
`fs.writeFileSync(path, JSON.stringify(manifest), 'utf8')`, where each
value is a "byte string" (`fs.readFileSync(file, 'latin1')` - one JS char
code 0-255 per original file byte) - so the browser's UTF-8 `fetch().json()`
decode recovers the exact original byte codes. And `buildTree()` now uses a
new `toBytes()` helper (`charCodeAt(i) & 0xFF` per character) instead of
`TextEncoder`, so mounting a file into the WASI filesystem reproduces the
original bytes exactly instead of re-encoding them as UTF-8. Also fixed the
`DPCplus.arm` manifest entry itself to the correct 3072-byte content.

**Not yet addressed:** `isOverflowError` in `src/hooks/rom.js` treats
`origin reverse-indexed` as a retriable bank-overflow shape (true for the
*standard*-kernel bank-1-RORG-overflow case it was written for) - it can't
tell that shape apart from a genuine DPC+-header failure like this one, so
either would burn through every retry attempt identically before surfacing
the real error. Worth revisiting if a DPC+ build ever exhausts retries
again.

## `score_graphics.asm`: DPC+ (`bankswitch == 28`) case added

With the two binary-corruption bugs above fixed, a real DPC+ build got much
further but still failed with `Origin Reverse-indexed`, now inside the
normal bank-1 bankswitch-trampoline code (`start_bank1`), not the header.
Root cause: `score_graphics.asm` forces the score-font table to a hardcoded
address, selected by `if bankswitch == 8/16/32/64` (each a different literal
`ORG`/`RORG` pair) - with no case for DPC+'s `bankswitch = 28` (set by
`statements.c`'s `set kernel DPC+` handler - confirmed in the real upstream
[batari-Basic/statements.c](https://github.com/batari-Basic/batari-Basic/blob/master/statements.c)),
it always fell through to the `else` branch's `ORG $FF9C` - a fixed address
with no relationship to a DPC+ ROM's actual layout, corrupting DASM's
position tracking for everything placed after it (which is why the error
surfaced later, at `start_bank1`, not at this line itself). This matches
real upstream bB 1.9 byte-for-byte, so stock bB likely has this same gap for
any DPC+ project that doesn't override `score_graphics.asm` itself.

Confirmed via `DPCplus_kernel.asm` (`.byte <scoretable` / `.byte
((>scoretable) & $0f) | (((>scoretable) / 2) & $70)`, around line 710) that
DPC+'s score routine reads `scoretable`'s address as a normal assembler
*symbol*, unlike the fixed-address trick 8/16/32/64k bankswitching rely on -
so DPC+ doesn't need a forced address here at all. Fixed by wrapping the
whole `if bankswitch == 8/16/32/64 ... else ORG $FF9C endif` chain in `if
bankswitch != 28 ... endif`, so DPC+ just skips it and lets `scoretable`
land wherever it naturally falls.

Verified end-to-end against a real (minimal) DPC+ project through all four
WASI compile stages: bank 1 now reports a plain, small overflow (concrete
bytes over capacity, not a corrupted/nonsensical address) - the same kind of
"your project doesn't fit yet" signal a Standard-kernel project would give,
not a toolchain bug. Whatever's left at that point is real content-budget
tuning, not an infrastructure fix.

## `std_kernel.asm`: `ball_blank_lines` kernel option

Nothing is currently tracked here - every file in this directory matches
stock bB 1.9.

## Note: `includes-manifest.json` must be regenerated after any edit here

`public/bb19/includes-manifest.json` (one level up from this directory) is
a flat `{"includes/<file>": content}` snapshot that every WASI compile
stage (`preprocess`/`2600basic`/`postprocess`/`dasm.wasm`, see
`src/hooks/bb-compiler.js`) actually reads instead of the live files in
this directory. It does not regenerate itself - it was generated once, in
commit f64a033, and any edit made directly to a file under
`public/bb19/includes/` since then has had no effect on a real build until
the manifest is regenerated to match. To regenerate it, write out every
file directly under this directory (excluding the `custom/` subdirectory
and this file) as `{"includes/<filename>": "<utf8 content>"}`, sorted by
filename, minified (no indentation, matching the existing format).
