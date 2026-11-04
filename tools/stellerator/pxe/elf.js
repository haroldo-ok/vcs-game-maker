'use strict';

// A reader and a linker for the ELF files a PXE ROM is: ELF32, little endian, type REL (a relocatable object: nothing is linked, the cartridge
// places the sections and applies the relocations), ARM Thumb-1. The bB toolchain's PXE kernel produces only three kinds of relocation:
// R_ARM_ABS32 (2), R_ARM_THM_CALL (10) and R_ARM_TARGET1 (38, used by the init_array, the same as ABS32).

const SHT_PROGBITS = 1;
const SHT_SYMTAB = 2;
const SHT_STRTAB = 3;
const SHT_REL = 9;
const SHT_NOBITS = 8;
const SHT_INIT_ARRAY = 14;
const SHF_ALLOC = 2;
const SHN_UNDEF = 0;
const SHN_ABS = 0xfff1;
const STT_SECTION = 3;

const R_ARM_ABS32 = 2;
const R_ARM_THM_CALL = 10;
const R_ARM_TARGET1 = 38;

const cString = (bytes, offset) => {
  let end = offset;
  while (bytes[end] !== 0) end++;
  return String.fromCharCode(...bytes.subarray(offset, end));
};

const isElf = (bytes) => bytes.length > 52 && bytes[0] === 0x7f && bytes[1] === 0x45 && bytes[2] === 0x4c && bytes[3] === 0x46;

const parseElf = (bytes) => {
  if (!isElf(bytes)) throw new Error('not an ELF file');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes[4] !== 1 || bytes[5] !== 1) throw new Error('only ELF32 little endian is supported');
  const type = view.getUint16(16, true);
  const machine = view.getUint16(18, true);
  if (type !== 1) throw new Error(`ELF type ${type} is not a relocatable object`);
  if (machine !== 40) throw new Error(`ELF machine ${machine} is not ARM`);
  const shoff = view.getUint32(32, true);
  const shentsize = view.getUint16(46, true);
  const shnum = view.getUint16(48, true);
  const shstrndx = view.getUint16(50, true);
  const sections = [];
  for (let i = 0; i < shnum; i++) {
    const at = shoff + i * shentsize;
    sections.push({
      index: i,
      nameOffset: view.getUint32(at, true),
      type: view.getUint32(at + 4, true),
      flags: view.getUint32(at + 8, true),
      offset: view.getUint32(at + 16, true),
      size: view.getUint32(at + 20, true),
      link: view.getUint32(at + 24, true),
      info: view.getUint32(at + 28, true),
      align: Math.max(1, view.getUint32(at + 32, true)),
      entsize: view.getUint32(at + 36, true),
    });
  }
  const shstr = sections[shstrndx];
  sections.forEach((section) => {
    section.name = cString(bytes, shstr.offset + section.nameOffset);
    section.data = section.type === SHT_NOBITS ? null : bytes.subarray(section.offset, section.offset + section.size);
  });
  const symtab = sections.find((section) => section.type === SHT_SYMTAB);
  const strtab = sections[symtab.link];
  const symbols = [];
  for (let at = symtab.offset; at < symtab.offset + symtab.size; at += 16) {
    const info = bytes[at + 12];
    symbols.push({
      name: cString(bytes, strtab.offset + view.getUint32(at, true)),
      value: view.getUint32(at + 4, true),
      size: view.getUint32(at + 8, true),
      type: info & 15,
      bind: info >> 4,
      shndx: view.getUint16(at + 14, true),
    });
  }
  const relocations = [];
  sections.filter((section) => section.type === SHT_REL).forEach((section) => {
    for (let at = section.offset; at < section.offset + section.size; at += 8) {
      const info = view.getUint32(at + 4, true);
      relocations.push({target: section.info, offset: view.getUint32(at, true), type: info & 255, symbol: info >> 8});
    }
  });
  return {sections, symbols, relocations};
};

const align = (value, to) => Math.ceil(value / to) * to;

// (dataImports: the tables the program imports as data, name -> bytes, put after the sections.)
// Places the sections of the loaded kinds one after another from `base` (the image the thumbulator will see), zero fills the NOBITS ones and
// applies the relocations. Undefined symbols (the bus library and the C library calls) get the addresses `imports(name)` returns, which must be
// even (ARM state) so that a BLX to one leaves Thumb state and the emulator can trap it.
// Returns {image, base, symbols: name -> address, sectionBase: name -> address, importAddresses: name -> address, initArray: [addresses]}.
const linkElf = (elf, {base, imports, dataImports = {}}) => {
  const placed = elf.sections.filter((section) => (section.flags & SHF_ALLOC) && section.size > 0);
  let cursor = 0;
  placed.forEach((section) => {
    cursor = align(cursor, Math.max(4, section.align));
    section.placed = cursor;
    cursor += section.size;
  });
  // Imported tables (data, not functions) are put after the sections.
  const dataAddress = {};
  Object.keys(dataImports).forEach((name) => {
    cursor = align(cursor, 4);
    dataAddress[name] = cursor;
    cursor += dataImports[name].length;
  });
  const image = new Uint8Array(align(cursor, 16));
  Object.keys(dataImports).forEach((name) => image.set(dataImports[name], dataAddress[name]));
  const view = new DataView(image.buffer);
  placed.forEach((section) => {
    if (section.data) image.set(section.data, section.placed);
  });
  const sectionAddress = (section) => base + section.placed;
  const importAddresses = {};
  const symbolAddress = (symbol) => {
    if (symbol.shndx === SHN_UNDEF) {
      if (!symbol.name) return 0;
      if (symbol.name in dataAddress) return base + dataAddress[symbol.name];
      if (!(symbol.name in importAddresses)) importAddresses[symbol.name] = imports(symbol.name);
      return importAddresses[symbol.name];
    }
    if (symbol.shndx === SHN_ABS) return symbol.value;
    const section = elf.sections[symbol.shndx];
    return sectionAddress(section) + symbol.value;
  };
  elf.relocations.forEach((relocation) => {
    const section = elf.sections[relocation.target];
    if (section.placed === undefined) return;
    const symbol = elf.symbols[relocation.symbol];
    const place = section.placed + relocation.offset;
    const placeAddress = base + place;
    const target = symbolAddress(symbol);
    if (relocation.type === R_ARM_ABS32 || relocation.type === R_ARM_TARGET1) {
      view.setUint32(place, (view.getUint32(place, true) + target) >>> 0, true);
    } else if (relocation.type === R_ARM_THM_CALL) {
      const first = view.getUint16(place, true);
      const second = view.getUint16(place + 2, true);
      const s = (first >> 10) & 1;
      const j1 = (second >> 13) & 1;
      const j2 = (second >> 11) & 1;
      const i1 = (~(j1 ^ s)) & 1;
      const i2 = (~(j2 ^ s)) & 1;
      let addend = (s << 24) | (i1 << 23) | (i2 << 22) | ((first & 0x3ff) << 12) | ((second & 0x7ff) << 1);
      if (s) addend -= 1 << 25;
      let offset = ((target + addend) & ~1) - placeAddress;
      if (offset < -(1 << 24) || offset >= (1 << 24)) throw new Error(`THM_CALL out of range at ${placeAddress.toString(16)}`);
      const ns = offset < 0 ? 1 : 0;
      if (offset < 0) offset += 1 << 25;
      const ni1 = (offset >> 23) & 1;
      const ni2 = (offset >> 22) & 1;
      const nj1 = (~(ni1 ^ ns)) & 1;
      const nj2 = (~(ni2 ^ ns)) & 1;
      view.setUint16(place, (first & 0xf800) | (ns << 10) | ((offset >> 12) & 0x3ff), true);
      view.setUint16(place + 2, (second & 0xd000) | (nj1 << 13) | (nj2 << 11) | ((offset >> 1) & 0x7ff), true);
    } else {
      throw new Error(`unsupported relocation type ${relocation.type}`);
    }
  });
  const symbols = {};
  elf.symbols.forEach((symbol) => {
    if (symbol.shndx !== SHN_UNDEF && symbol.type !== STT_SECTION && symbol.name) symbols[symbol.name] = symbolAddress(symbol);
  });
  const sectionBase = {};
  placed.forEach((section) => {
    sectionBase[section.name] = sectionAddress(section);
  });
  const initArray = [];
  elf.sections.filter((section) => section.type === SHT_INIT_ARRAY && section.placed !== undefined).forEach((section) => {
    for (let at = 0; at < section.size; at += 4) initArray.push(view.getUint32(section.placed + at, true));
  });
  return {image, base, symbols, sectionBase, importAddresses, initArray};
};

module.exports = {isElf, parseElf, linkElf, SHT_PROGBITS, SHT_STRTAB};
