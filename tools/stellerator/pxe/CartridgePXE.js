'use strict';

/* eslint-disable require-jsdoc */

// A PXE cartridge for 6502.ts: the ROM is an ARM ELF file whose program runs the game in a software 6502 and drives the real 6507 one
// instruction at a time through the bus library (vcsLda2, vcsSta3, vcsJmp3, ...). A call of that library means "the 6507 executes this
// instruction": the bytes of the instruction are put at the next addresses of the cartridge's address space (offsets from $1000), where the 6507
// reads them as it fetches (a byte is read twice when the dummy read of an implied instruction lands on the next opcode). The ARM program is a
// coroutine: it runs only when the 6507 reads the address where the next instruction goes, up to its next call of the library. What the data bus
// holds after the last byte put there is what the 6507 reads at addresses nothing was put at (the NOPs a vcsNop2n skips over). The speed of the
// ARM is not modelled (the real board gives it the time the overblank routine in the RAM of the console leaves it).
//
// Written from the behavior of the library as the ROMs use it (the bytes each call puts on the bus) and checked against gopher2600's frames.

const Thumbulator = require('thumbulator.ts').default;
const AbstractCartridge = require('6502.ts/lib/machine/stella/cartridge/AbstractCartridge').default;
const CartridgeInfo = require('6502.ts/lib/machine/stella/cartridge/CartridgeInfo').default;
const {parseElf, linkElf} = require('./elf');

const BASE = 0x20000000;
const IMPORT_BASE = 0x08000000;
const STOP_ADDRESS = 0x0f000000;
const EXTRA_RAM = 0x10000;
const ARGS_BYTES = 32;
const RUN_BUDGET = 20000000;
const MAX_IDLE_BUDGETS = 10;

const TV_SYSTEM = {NTSC: 0, PAL: 1, PAL60: 2};
const ARM_CLOCK_HZ = 70000000;

// What each bus library call puts on the bus of the 6507: the bytes of the instruction it makes the 6507 execute (functions of the arguments r0 to
// r3), and where the next instruction goes: 'then' says the 6507 goes back to $1000 (jump) or leaves for the routine in RAM (overblank), and
// 'skip' is a number of addresses the 6507 runs through as NOPs. A call that returns what the instruction read is in RETURNS_A.
const BUS_CALLS = {
  vcsLda2: (a) => ({bytes: [0xa9, a & 255]}),
  vcsLdx2: (a) => ({bytes: [0xa2, a & 255]}),
  vcsLdy2: (a) => ({bytes: [0xa0, a & 255]}),
  vcsSta3: (zp) => ({bytes: [0x85, zp & 255]}),
  vcsStx3: (zp) => ({bytes: [0x86, zp & 255]}),
  vcsSty3: (zp) => ({bytes: [0x84, zp & 255]}),
  vcsSta4: (zp) => ({bytes: [0x8d, zp & 255, 0]}),
  vcsStx4: (zp) => ({bytes: [0x8e, zp & 255, 0]}),
  vcsSty4: (zp) => ({bytes: [0x8c, zp & 255, 0]}),
  vcsJmp3: () => ({bytes: [0x4c, 0x00, 0x10], then: 'jump'}),
  vcsNop2: () => ({bytes: [0xea]}),
  vcsNop2n: (n) => ({bytes: [0xea], skip: Math.max(1, n & 0xffff) - 1}),
  vcsNop3: () => ({bytes: [0xc5, 0x00]}),
  vcsWrite5: (zp, data) => ({bytes: [0xa9, data & 255, 0x85, zp & 255]}),
  vcsRead4: (address) => ({bytes: [0xad, address & 255, (address >> 8) & 0x1f]}),
  vcsStartOverblank: () => ({bytes: [0x4c, 0x80, 0x00], then: 'overblank'}),
};
const RETURNS_A = new Set(['vcsRead4']);
const OFFSET_MASK = 0x0fff;
// The table the ARM program reads to reverse the bits of a byte.
const REVERSE_BYTE_TABLE = Uint8Array.from({length: 256}, (_, i) => {
  let out = 0;
  for (let bit = 0; bit < 8; bit++) out |= ((i >> bit) & 1) << (7 - bit);
  return out;
});

class CartridgePXE extends AbstractCartridge {
  constructor(buffer, {tvSpec = 'NTSC'} = {}) {
    super();
    this._bytes = Uint8Array.from(buffer);
    this._rom = this._bytes;
    this._tvSpec = tvSpec;
    this._names = [];
    const elf = parseElf(this._bytes);
    this._linked = linkElf(elf, {base: BASE, dataImports: {ReverseByte: REVERSE_BYTE_TABLE}, imports: (name) => {
      this._names.push(name);
      return IMPORT_BASE + (this._names.length - 1) * 4;
    }});
    this._memory = new Uint8Array(this._linked.image.length + ARGS_BYTES + EXTRA_RAM);
    this._view = new DataView(this._memory.buffer);
    this._argsAddress = BASE + this._linked.image.length;
    this._stackTop = BASE + this._memory.length - 16;
    this._thumb = new Thumbulator({
      read16: (a) => this._read(a, 2),
      read32: (a) => this._read(a, 4),
      write16: (a, v) => this._write(a, v, 2),
      write32: (a, v) => this._write(a, v, 4),
    }, {stopAddress: STOP_ADDRESS, printer: (line) => {
      if (this.armPrinter) this.armPrinter(line);
    }});
    this._clearBus();
    this._pendingFinish = null;
    this._started = false;
    this._ended = false;
    this._resetPhase = true;
    this._rngState = 0x12345678;
    this.reset();
  }

  // The key a game's saved data is kept under: its size and a cheap hash of its bytes.
  static keyOf(bytes) {
    let hash = 5381;
    for (let i = 0; i < bytes.length; i += 7) hash = (Math.imul(hash, 33) + bytes[i]) >>> 0;
    return `${bytes.length}:${hash}`;
  }

  _nvKey() {
    if (!this._nvKeyValue) this._nvKeyValue = CartridgePXE.keyOf(this._rom);
    return this._nvKeyValue;
  }

  static matchesBuffer(buffer) {
    return buffer.length > 52 && buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
  }

  async init() {
    await this._thumb.init();
  }

  reset() {
    this._memory.fill(0);
    this._memory.set(this._linked.image);
    this._view.setUint32(this._argsAddress - BASE, TV_SYSTEM[this._tvSpec] || 0, true);
    this._view.setUint32(this._argsAddress - BASE + 4, ARM_CLOCK_HZ, true);
    // (The flags: bit 3 says the host has a non-volatile store, for `set save_data`.)
    this._view.setUint32(this._argsAddress - BASE + 8, 8, true);
    this._clearBus();
    this._pendingFinish = null;
    this._started = false;
    this._ended = false;
    this._resetPhase = true;
  }

  _clearBus() {
    // The bytes of the instruction the program put in the address space (offset -> byte), the offset the next one goes at, the last byte put
    // there (what the data bus holds), the offset of the last byte of a jump, and whether the 6507 is in the overblank routine in RAM, which
    // waits at the last address of the cartridge for the program to call vcsEndOverblank.
    this._bytes = new Map();
    this._next = 0;
    this._latched = 0xea;
    this._lastOfJump = -1;
    this._overblank = false;
  }

  getType() {
    return CartridgeInfo.CartridgeType.unknown;
  }

  setBus(bus) {
    this._bus = bus;
    return this;
  }

  setCpu(cpu) {
    this._cpu = cpu;
    return this;
  }

  setCpuTimeProvider(provider) {
    this._cpuTimeProvider = provider;
    return this;
  }

  // The 6507 reads the cartridge's address space: the reset vector ($1000), and every byte of the instructions the ARM program sends.
  read(address) {
    const offset = address & OFFSET_MASK;
    if (this._resetPhase) {
      if (offset === 0x0ffc) return 0x00;
      if (offset === 0x0ffd) {
        this._resetPhase = false;
        return 0x10;
      }
    }
    // The routine in RAM waits for the byte at the last address of the cartridge to become 0, which the program does by calling vcsEndOverblank.
    if (offset === OFFSET_MASK && this._overblank && !this._bytes.has(offset)) this._runArm(() => this._bytes.has(offset));
    if (!this._bytes.has(offset) && offset === this._next) this._runArm(() => this._bytes.has(offset));
    let byte = this._latched;
    if (this._bytes.has(offset)) {
      byte = this._bytes.get(offset);
      if (offset === OFFSET_MASK && this._overblank) {
        this._overblank = false;
        this._bytes.clear();
      } else if (offset === this._lastOfJump) {
        // The 6507 has read the whole jump: the bytes go, so that the next fetch, where it jumped to, asks the program for more.
        this._lastOfJump = -1;
        this._bytes.clear();
      }
    }
    if (this.byteLog) {
      this.byteLog.push(offset.toString(16) + ':' + byte.toString(16));
      if (this.byteLog.length > 80) this.byteLog.shift();
    }
    return byte;
  }

  peek() {
    return 0;
  }

  write() {}

  // The ARM's memory (a flat image: the sections, the argument block, then the stack).
  _read(address, size) {
    const offset = address - BASE;
    if (offset < 0 || offset + size > this._memory.length) {
      this._fault(`read of ${(address >>> 0).toString(16)}`);
      return 0;
    }
    return size === 2 ? this._view.getUint16(offset, true) : this._view.getUint32(offset, true);
  }

  _write(address, value, size) {
    const offset = address - BASE;
    if (offset < 0 || offset + size > this._memory.length) {
      this._fault(`write of ${(address >>> 0).toString(16)}`);
      return;
    }
    if (size === 2) this._view.setUint16(offset, value & 0xffff, true);
    else this._view.setUint32(offset, value >>> 0, true);
  }

  // The name of the function an address of the ARM program is in (for messages).
  _where(address) {
    let best = '';
    let bestAddress = -1;
    Object.entries(this._linked.symbols).forEach(([name, value]) => {
      const at = value & ~1;
      if (at <= address && at > bestAddress) {
        bestAddress = at;
        best = name;
      }
    });
    return `${address.toString(16)} (${best}+${(address - bestAddress).toString(16)})`;
  }

  _fault(message) {
    if (this._faulted) return;
    this._faulted = true;
    this.triggerTrap(2, `PXE ARM program: ${message}`);
  }

  _setupCall(entry, arg) {
    this._thumb.reset();
    for (let i = 0; i <= 12; i++) this._thumb.writeRegister(i, 0);
    this._thumb.writeRegister(0, arg || 0);
    this._thumb.writeRegister(13, this._stackTop);
    this._thumb.writeRegister(14, STOP_ADDRESS + 1);
    this._thumb.writeRegister(15, entry);
  }

  // Runs the ARM program until done(): it has put the byte the 6507 is reading in the address space (or it has ended).
  _runArm(done) {
    if (this._ended) return;
    if (!this._started) {
      this._started = true;
      for (const init of this._linked.initArray) {
        this._setupCall(init);
        this._thumb.run(RUN_BUDGET);
      }
      this._setupCall(this._linked.symbols.elf_main, this._argsAddress);
    } else if (this._pendingFinish) {
      this._pendingFinish();
    }
    this._pendingFinish = null;
    let result = this._thumb.run(RUN_BUDGET);
    let idleBudgets = 0;
    for (;;) {
      if (result === 2 || result === 3) {
        idleBudgets = 0;
        if (!this._handleLibraryCall()) {
          this._ended = true;
          return;
        }
        if (done() || this._pendingFinish) return;
        result = this._thumb.run(RUN_BUDGET);
      } else if (result === 0) {
        // A program that runs for ages without calling the bus library would freeze the emulator: it is stopped.
        if (++idleBudgets > MAX_IDLE_BUDGETS) {
          // (The 6502 program's counter is a 16 bit value in the software 6502; an instruction it does not have makes it loop.)
          const symbols = this._linked.symbols;
          let program = '';
          if (symbols.cpu !== undefined && symbols.DpcpBin !== undefined) {
            const counter = this._read(symbols.cpu + 0x2228, 2) & 0xffff;
            program = `, 6502 program at $${counter.toString(16)} (opcode $${(this._read(symbols.DpcpBin + counter, 1) & 255).toString(16)})`;
          }
          this._fault(`the program ran without a bus library call, at ${this._where(this._thumb.readRegister(15) >>> 0)}${program}`);
          this._ended = true;
          return;
        }
        result = this._thumb.run(RUN_BUDGET);
      } else {
        this._ended = true;
        if (result !== 20) this._fault(`the program stopped with code ${result}`);
        return;
      }
    }
  }

  // Puts the bytes of an instruction at the next addresses.
  _inject(call) {
    this._bytes.clear();
    call.bytes.forEach((byte, i) => {
      this._bytes.set((this._next + i) & OFFSET_MASK, byte);
    });
    this._latched = call.bytes[call.bytes.length - 1];
    if (call.then === 'jump' || call.then === 'overblank') {
      this._lastOfJump = (this._next + call.bytes.length - 1) & OFFSET_MASK;
      this._next = 0;
      if (call.then === 'overblank') this._overblank = true;
    } else {
      this._next = (this._next + call.bytes.length + (call.skip || 0)) & OFFSET_MASK;
    }
  }

  // The ARM program branched to an address that is not Thumb code: one of the library functions (even addresses given by the linker).
  _handleLibraryCall() {
    const thumb = this._thumb;
    const pc = thumb.readRegister(15) >>> 0;
    const instruction = this._read((pc - 4) & ~1, 2);
    if ((instruction & 0xff07) !== 0x4780 && (instruction & 0xff07) !== 0x4700) {
      this._fault(`a branch out of Thumb code from ${pc.toString(16)} with the instruction ${instruction.toString(16)}`);
      return false;
    }
    const register = (instruction >> 3) & 15;
    const target = thumb.readRegister(register) >>> 0;
    const index = (target - IMPORT_BASE) / 4;
    const name = this._names[index];
    if (!name) {
      this._fault(`a branch to ${target.toString(16)}`);
      return false;
    }
    // BLX returns to the next instruction; a BX (a tail call) returns to where the caller of the program's function expects, in LR.
    const isBlx = (instruction & 0xff87) === 0x4780;
    const returnAddress = isBlx ? ((pc - 2) | 1) : (thumb.readRegister(14) >>> 0);
    const r = [0, 1, 2, 3].map((n) => thumb.readRegister(n) >>> 0);
    // (thumbulator keeps r15 as the address of the instruction being run plus 4 and runs the one 2 bytes before it, so a resume goes in 2 above.)
    if (this.debugLog && this.debugLog.length >= 410) console.log('call', name, 'pc', pc.toString(16), 'insn', instruction.toString(16), 'ret', returnAddress.toString(16), 'next', this._read((returnAddress & ~1), 2).toString(16), 'r', r.map((v) => v.toString(16)).join(','));
    thumb.writeRegister(14, returnAddress);
    thumb.writeRegister(15, returnAddress + 2);
    if (this.debugLog) this.debugLog.push(name + ' ' + r.map((v) => v.toString(16)).join(','));
    if (BUS_CALLS[name]) {
      this._inject(BUS_CALLS[name](r[0], r[1], r[2], r[3]));
      if (RETURNS_A.has(name)) {
        this._pendingFinish = () => thumb.writeRegister(0, this._cpu.state.a & 255);
      }
      return true;
    }
    if (name === 'vcsEndOverblank') {
      // The byte the routine in RAM waits for goes to the last address of the cartridge; the next instruction starts again at $1000.
      this._bytes.clear();
      this._bytes.set(OFFSET_MASK, 0);
      this._next = 0;
      return true;
    }
    switch (name) {
      case 'memset':
        this._memory.fill(r[1] & 255, r[0] - BASE, r[0] - BASE + r[2]);
        thumb.writeRegister(0, r[0]);
        break;
      case 'memcpy':
        this._memory.copyWithin(r[0] - BASE, r[1] - BASE, r[1] - BASE + r[2]);
        thumb.writeRegister(0, r[0]);
        break;
      case 'randint':
        this._rngState = (Math.imul(this._rngState, 1664525) + 1013904223) >>> 0;
        thumb.writeRegister(0, this._rngState);
        break;
      case 'ReverseByte': {
        let v = r[0] & 255;
        let out = 0;
        for (let i = 0; i < 8; i++) {
          out = (out << 1) | (v & 1);
          v >>= 1;
        }
        thumb.writeRegister(0, out);
        break;
      }
      case 'vcsInitNvStore': {
        // The non-volatile store (what `set save_data` and `writesavedata` use): two slots, each a run of bytes of the program's memory, kept
        // for as long as the page lives (as an AtariVox's memory is), so that a restart of the same game finds what it saved.
        this._nv = {sizes: [r[0] & 0xffff, r[1] & 0xffff], addresses: [r[2], r[3]]};
        if (this.debugLog) this.debugLog.push(`nv init ${this._nv.sizes} ${this._nv.addresses.map((v) => v.toString(16))}`);
        const saved = CartridgePXE.nvStores.get(this._nvKey());
        if (saved) {
          this._nv.addresses.forEach((address, slot) => {
            if (saved[slot] && saved[slot].length === this._nv.sizes[slot]) this._memory.set(saved[slot], address - BASE);
          });
        }
        break;
      }
      case 'vcsWriteNvChunk': {
        if (this._nv) {
          const slots = CartridgePXE.nvStores.get(this._nvKey()) || [];
          this._nv.addresses.forEach((address, slot) => {
            slots[slot] = this._memory.slice(address - BASE, address - BASE + this._nv.sizes[slot]);
          });
          CartridgePXE.nvStores.set(this._nvKey(), slots);
          // (The page of the worker keeps it past a reload: see nvSink.)
          if (CartridgePXE.nvSink) CartridgePXE.nvSink(this._nvKey(), slots);
        }
        break;
      }
      case 'vcsProcessNvStoreEvents':
        break;
      default:
        this._fault(`an unknown library function ${name}`);
        return false;
    }
    return true;
  }
}

// The saved data of every game this page has run (see vcsInitNvStore).
CartridgePXE.nvStores = new Map();
// Called with the key and the slots (arrays of bytes) each time a game writes its save data; null for none.
CartridgePXE.nvSink = null;

module.exports = CartridgePXE;
