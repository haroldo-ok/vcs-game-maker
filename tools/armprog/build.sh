#!/bin/sh
# Builds the DPC+ coprocessor programs that are kept in the ROM as data (public/bb19/includes/custom/prog, see src/generators/bbasic/offset-arm.js):
# one for each set of the functions of armprog.c, named by the letters of the sets it has (o offset, b box test, c circle, p pixel finding and bounce,
# f fire movement, a sound engine, t playfield tilemap, n its 4-pixel tiles (only with t), r backgrounds as runs (never with t: a build keeps one
# or the other), in that order), then g for the build with -DGROUPS. The sets left out are given as -DNOOFFSET -DNOBOX -DNOCIRCLE -DNOPIX -DNOFIRE
# -DNOAUDIO -DNOTILES -DNONARROW -DNORUNS.
# usage: TC=<the bin folder of arm-none-eabi-gcc 10.3> sh tools/armprog/build.sh [out folder, default public/bb19/includes/custom/prog]
cd "$(dirname "$0")/../.." || exit 1
TC="${TC:-/c/tmp/armtc/x/gcc-arm-none-eabi-10.3-2021.10/bin}"
SRC=public/bb19/includes/custom/armprog.c
OUT="${1:-public/bb19/includes/custom/prog}"
WORK="$(mktemp -d)"
mkdir -p "$OUT"
# The linker script: the entry first, at 0 (the program is position independent).
echo 'SECTIONS { . = 0; .text : { *(.text.entry) *(.text*) *(.rodata*) } }' > "$WORK/l.ld"
LETTERS="o b c p f a t n r"
flag() { case $1 in o) echo NOOFFSET;; b) echo NOBOX;; c) echo NOCIRCLE;; p) echo NOPIX;; f) echo NOFIRE;; a) echo NOAUDIO;; t) echo NOTILES;; n) echo NONARROW;; r) echo NORUNS;; esac; }
# One program into $1 (a file) with the defines in $2: each step's file is deleted first, so a step that writes nothing can not leave the one before.
compile() {
  rm -f "$WORK/p.o" "$WORK/p.elf" "$1"
  "$TC/arm-none-eabi-gcc" -c -Os -mcpu=arm7tdmi -mthumb -fPIC $2 "$SRC" -o "$WORK/p.o" || exit 1
  "$TC/arm-none-eabi-ld" -T "$WORK/l.ld" "$WORK/p.o" -o "$WORK/p.elf" || exit 1
  "$TC/arm-none-eabi-objcopy" -O binary "$WORK/p.elf" "$1" || exit 1
  [ -s "$1" ] || { echo "empty program $1"; exit 1; }
}
# (Twice the build has made one program a few bytes different from a compile of it alone, not seen again: each program is compiled twice and
# kept when both are the same; when they are not, a third time, and the one two of them agree on is kept, with a warning.)
n=0
for mask in $(seq 1 511); do
  # (n is only built with t, r never with t.)
  [ $(( mask & 192 )) -eq 128 ] && continue
  [ $(( mask & 320 )) -eq 320 ] && continue
  name=""; defs=""; i=0
  for l in $LETTERS; do
    if [ $(( (mask >> i) & 1 )) -eq 1 ]; then name="$name$l"; else defs="$defs -D$(flag "$l")"; fi
    i=$((i + 1))
  done
  for g in "" g; do
    gdef=""; [ -n "$g" ] && gdef="-DGROUPS"
    compile "$WORK/a.bin" "$defs $gdef"
    compile "$WORK/b.bin" "$defs $gdef"
    if ! cmp -s "$WORK/a.bin" "$WORK/b.bin"; then
      compile "$WORK/c.bin" "$defs $gdef"
      echo "warning: $name$g.bin came out two ways; kept the one two of three compiles agree on"
      if cmp -s "$WORK/a.bin" "$WORK/c.bin"; then cp "$WORK/a.bin" "$WORK/b.bin"
      elif ! cmp -s "$WORK/b.bin" "$WORK/c.bin"; then echo "$name$g.bin came out three ways"; exit 1; fi
    fi
    cp "$WORK/b.bin" "$OUT/$name$g.bin" || exit 1
    n=$((n + 1))
  done
done
rm -rf "$WORK"
echo "$n programs in $OUT"
