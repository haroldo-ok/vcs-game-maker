#!/bin/sh
# Builds the DPC+ coprocessor programs that are kept in the ROM as data (public/bb19/includes/custom/prog, see src/generators/bbasic/offset-arm.js):
# one for each set of the functions of armprog.c, named by the letters of the sets it has (o offset, b box test, c circle, p pixel finding and bounce,
# f fire movement, a sound engine, t playfield tilemap, in that order), then g for the build with -DGROUPS. The sets left out are given as
# -DNOOFFSET -DNOBOX -DNOCIRCLE -DNOPIX -DNOFIRE -DNOAUDIO -DNOTILES.
# usage: TC=<the bin folder of arm-none-eabi-gcc 10.3> sh tools/armprog/build.sh [out folder, default public/bb19/includes/custom/prog]
cd "$(dirname "$0")/../.." || exit 1
TC="${TC:-/c/tmp/armtc/x/gcc-arm-none-eabi-10.3-2021.10/bin}"
SRC=public/bb19/includes/custom/armprog.c
OUT="${1:-public/bb19/includes/custom/prog}"
WORK="$(mktemp -d)"
mkdir -p "$OUT"
# The linker script: the entry first, at 0 (the program is position independent).
echo 'SECTIONS { . = 0; .text : { *(.text.entry) *(.text*) *(.rodata*) } }' > "$WORK/l.ld"
LETTERS="o b c p f a t"
flag() { case $1 in o) echo NOOFFSET;; b) echo NOBOX;; c) echo NOCIRCLE;; p) echo NOPIX;; f) echo NOFIRE;; a) echo NOAUDIO;; t) echo NOTILES;; esac; }
n=0
for mask in $(seq 1 127); do
  name=""; defs=""; i=0
  for l in $LETTERS; do
    if [ $(( (mask >> i) & 1 )) -eq 1 ]; then name="$name$l"; else defs="$defs -D$(flag "$l")"; fi
    i=$((i + 1))
  done
  for g in "" g; do
    gdef=""; [ -n "$g" ] && gdef="-DGROUPS"
    "$TC/arm-none-eabi-gcc" -c -Os -mcpu=arm7tdmi -mthumb -fPIC $defs $gdef "$SRC" -o "$WORK/p.o" || exit 1
    "$TC/arm-none-eabi-ld" -T "$WORK/l.ld" "$WORK/p.o" -o "$WORK/p.elf" || exit 1
    "$TC/arm-none-eabi-objcopy" -O binary "$WORK/p.elf" "$OUT/$name$g.bin" || exit 1
    n=$((n + 1))
  done
done
rm -rf "$WORK"
echo "$n programs in $OUT"
