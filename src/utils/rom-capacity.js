'use strict';

// A physical bank is always 4096 bytes on the standard kernel, regardless of
// the selected ROM size - larger sizes just add more of them. A
// non-bankswitched build (2k/4k) is a single bank the size of the whole
// binary instead (2048 or 4096 bytes).
const BANK_SIZE = 4096;

// Unprogrammed/unused ROM reads back as $FF, and DASM pads with that value,
// so a run of trailing $FF bytes just before the reserved footer is free
// space - this mirrors the technique batari Basic programmers commonly use
// by hand (echo-ing "scoretable - *" at compile time), computed here instead
// from the already-assembled binary and its symbol table.
//
// "scoretable" (the score-font/footer table) turns out to mark this boundary
// correctly in *every* bank, not just the one bank standard kernel does
// (which is why it needed a fresh look): its address modulo the bank size
// gives the same relative offset everywhere, confirmed directly against the
// compiler by placing a known amount of real content in a non-primary bank
// and finding the measured free space matched an independent byte-by-byte
// scan exactly. (An earlier version of this used "begin_bscode" - the
// bankswitch trampoline - for bank 1 specifically, on the theory that
// scoretable's *absolute* address only usefully located the one bank holding
// the real font data; that reasoning was wrong in a way that didn't matter
// for bank 1 alone, but gave a badly wrong answer for every other bank -
// scoretable's relative offset was the one that generalizes.)
const countTrailingFree = (bin, bankStart, boundaryOffset) => {
  let freeBytes = 0;
  let p = bankStart + boundaryOffset - 1;
  while (p >= bankStart && bin[p] === 0xFF) {
    freeBytes++;
    p--;
  }
  return freeBytes;
};

// bank1: free space in the single bank that always holds the project's main
// per-frame body (see generators/bbasic.js's RELOCATABLE_EVENT_NAMES) - the
// number that matters for "is my unrelocatable content getting tight".
// total: the same measurement summed across every bank the compiled binary
// actually has - grows with ROM size, reflecting genuine total capacity
// (including banks the automatic allocator hasn't put anything in yet).
export const computeRomCapacity = ({output, symbolmap}) => {
  const bin = output;
  const scoretable = symbolmap['scoretable'];
  if (scoretable == null) return null;

  const bankSize = Math.min(BANK_SIZE, bin.length);
  const boundaryOffset = scoretable % bankSize;
  if (boundaryOffset < 0 || boundaryOffset > bankSize) return null;

  const totalBanks = Math.max(1, Math.floor(bin.length / bankSize));
  const perBank = [];
  for (let i = 0; i < totalBanks; i++) {
    perBank.push({freeBytes: countTrailingFree(bin, i * bankSize, boundaryOffset), usableBytes: boundaryOffset});
  }

  return {
    bank1: perBank[0],
    total: {
      freeBytes: perBank.reduce((sum, b) => sum + b.freeBytes, 0),
      usableBytes: perBank.reduce((sum, b) => sum + b.usableBytes, 0),
    },
  };
};
