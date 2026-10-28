'use strict';

// The AtariVox for the 6502.ts backend. 6502.ts has no AtariVox, so the worker plays one, as gopher2600 does (hardware/peripherals/atarivox):
// the program sends the speech chip (a SpeakJet) its commands one byte at a time on the right controller port. Bit 0 of SWCHA is the serial
// line (the program makes it an output with bit 0 of SWACNT; it idles high; a byte is a low start bit, 8 data bits low bit first and a
// high stop bit, 62 CPU cycles each, 19200 baud) and bit 1 reads high while the chip can take more bytes (Buffer Half Full is low).
//
// The line is read from the program's writes to SWCHA, with the CPU cycle of each one, so a byte is decoded exactly as the bits were
// timed: from the falling edge of the start bit, each bit is read in the middle of its 62 cycles. The chip itself is
// tools/gopher2600-wasm/speakjet-wasm (the same synthesizer gopher2600 uses), loaded the first time an AtariVox is plugged in.

const CYCLES_PER_BIT = 62;
const SAMPLE_RATE = 8192;
// The control codes that take a second byte.
const DOUBLE_CODES = new Set([20, 21, 22, 23, 24, 25, 26, 28, 29, 30]);
const LOAD_ERROR = 'the AtariVox speech chip did not load';

// The AtariVox's memory (the same 24LC256 EEPROM as a SaveKey, 32 KB): its I2C bus is bit 2 (SDA) and bit 3 (SCL) of SWCHA. It is kept for
// as long as the worker lives, so it survives loading another ROM, as the memory of a real AtariVox survives a reset.
const EEPROM_SIZE = 32768;
const eeprom = new Uint8Array(EEPROM_SIZE).fill(255);
const SDA = 0x04;
const SCL = 0x08;

let chipPromise = null;

// Loads the chip once: the Go runtime's glue and the wasm next to the worker.
const loadChip = () => {
  if (chipPromise) return chipPromise;
  chipPromise = (async () => {
    self.importScripts('wasm_exec.js');
    const go = new self.Go();
    const {instance} = await WebAssembly.instantiateStreaming(fetch('speakjet.wasm'), go.importObject);
    go.run(instance);
    if (!self.speakjetChip) throw new Error(LOAD_ERROR);
    return self.speakjetChip;
  })().catch((error) => {
    chipPromise = null;
    throw error;
  });
  return chipPromise;
};

// One AtariVox: feed() it the program's writes, flush() it at the end of every frame and render() the speech that is due.
const createAtariVox = () => {
  const vox = {
    chip: null,
    // The line: SWACNT bit 0 (output), the last SWCHA written, and the edges of the level with the cycle they came at.
    output: false,
    cnt: 0,
    swcha: 0xff,
    level: 1,
    edges: [],
    // The byte being received: the cycle its start bit began, or null.
    start: null,
    consumed: 0,
    // A double code waiting for its second byte.
    pushed: null,
    ready: true,
    fraction: 0,
    quiet: true,
    // Bytes received before the chip had loaded.
    waiting: [],
    sent: [],
    // The I2C bus: the levels the program drives (a pin that is not an output is released and reads high) and what the memory drives.
    sda: 1,
    scl: 1,
    slaveSda: 1,
    // The memory as a slave: idle, recv (a byte from the program), ack (driving the acknowledge), send (a byte to the program), mack (the
    // program's acknowledge).
    i2c: 'idle',
    kind: 'dev',
    after: 'recv',
    bits: 0,
    shift: 0,
    reading: false,
    address: 0,
    current: 0,
  };

  const levelAt = (cycle) => {
    let level = 1;
    for (const edge of vox.edges) {
      if (edge.cycle > cycle) break;
      level = edge.level;
    }
    return level;
  };

  const command = (byte) => {
    if (vox.pushed !== null) {
      const code = vox.pushed;
      vox.pushed = null;
      write(code, byte);
    } else if (DOUBLE_CODES.has(byte)) {
      vox.pushed = byte;
    } else {
      write(byte, 0);
    }
  };

  const write = (code, data) => {
    vox.sent.push(code);
    if (vox.sent.length > 128) vox.sent.shift();
    if (vox.chip) {
      vox.chip.write(code, data);
      vox.ready = !vox.chip.bufferHalfFull();
    } else {
      vox.waiting.push([code, data]);
    }
  };

  // Decodes the bytes that are complete by cycle `now`.
  const decode = (now) => {
    for (;;) {
      if (vox.start === null) {
        const next = vox.edges.find((edge) => edge.level === 0 && edge.cycle >= vox.consumed);
        if (!next) break;
        vox.start = next.cycle;
      }
      const stopMiddle = vox.start + CYCLES_PER_BIT * 9.5;
      if (now < stopMiddle) break;
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        if (levelAt(vox.start + CYCLES_PER_BIT * (1.5 + bit))) byte |= 1 << bit;
      }
      const framed = levelAt(vox.start) === 0 && levelAt(stopMiddle) === 1;
      vox.consumed = vox.start + CYCLES_PER_BIT * 9;
      vox.start = null;
      if (framed) command(byte);
    }
    // Edges older than what has been decoded are not needed again (the level at the last of them is kept as the first).
    const keep = vox.edges.findIndex((edge) => edge.cycle > vox.consumed);
    if (keep > 1) vox.edges.splice(0, keep - 1);
    else if (keep === -1 && vox.edges.length > 1) vox.edges.splice(0, vox.edges.length - 1);
  };

  const i2cByte = () => {
    const byte = vox.shift;
    vox.shift = 0;
    vox.bits = 0;
    if (vox.kind === 'dev') {
      if ((byte & 0xfe) !== 0xa0) {
        vox.i2c = 'idle'; return;
      }
      vox.reading = (byte & 1) === 1;
      vox.after = vox.reading ? 'send' : 'recv';
      vox.kind = 'ahi';
    } else if (vox.kind === 'ahi') {
      vox.address = (byte << 8) & 0x7f00;
      vox.kind = 'alo';
      vox.after = 'recv';
    } else if (vox.kind === 'alo') {
      vox.address |= byte;
      vox.kind = 'data';
      vox.after = 'recv';
    } else {
      eeprom[vox.address] = byte;
      vox.address = (vox.address + 1) % EEPROM_SIZE;
    }
    vox.i2c = 'ack';
    vox.slaveSda = 0;
  };

  const i2cLoad = () => {
    vox.current = eeprom[vox.address];
    vox.address = (vox.address + 1) % EEPROM_SIZE;
    vox.bits = 1;
    vox.slaveSda = (vox.current >> 7) & 1;
    vox.i2c = 'send';
  };

  // The levels of the two lines have changed to sda and scl.
  const i2cLines = (sda, scl) => {
    const oldSda = vox.sda;
    const oldScl = vox.scl;
    vox.sda = sda;
    vox.scl = scl;
    if (oldScl && scl && oldSda !== sda) {
      if (!sda) {
        // start (or a start again): an address is next
        vox.i2c = 'recv';
        vox.kind = 'dev';
        vox.bits = 0;
        vox.shift = 0;
        vox.slaveSda = 1;
      } else {
        vox.i2c = 'idle';
        vox.slaveSda = 1;
      }
      return;
    }
    if (!oldScl && scl) {
      // the clock rises: a bit of the program's is read now
      if (vox.i2c === 'recv') {
        vox.shift = ((vox.shift << 1) | sda) & 0xff;
        vox.bits++;
      } else if (vox.i2c === 'mack') {
        vox.acked = sda === 0;
      }
    } else if (oldScl && !scl) {
      // the clock falls: what the memory drives changes now
      if (vox.i2c === 'recv' && vox.bits === 8) {
        i2cByte();
      } else if (vox.i2c === 'ack') {
        vox.slaveSda = 1;
        vox.i2c = vox.after;
        if (vox.after === 'send') i2cLoad();
      } else if (vox.i2c === 'send') {
        if (vox.bits < 8) {
          vox.slaveSda = (vox.current >> (7 - vox.bits)) & 1;
          vox.bits++;
        } else {
          vox.slaveSda = 1;
          vox.i2c = 'mack';
          vox.acked = false;
        }
      } else if (vox.i2c === 'mack') {
        if (vox.acked) i2cLoad();
        else vox.i2c = 'idle';
      }
    }
  };

  const setLevel = (cycle) => {
    // The memory: the program's lines.
    const driven = (mask) => (vox.cnt & mask ? (vox.swcha & mask ? 1 : 0) : 1);
    i2cLines(driven(SDA), driven(SCL));
    // A pin that is not an output reads high (the console's pull-up).
    const level = vox.output ? vox.swcha & 1 : 1;
    if (level === vox.level) return;
    vox.level = level;
    vox.edges.push({cycle, level});
    decode(cycle);
  };

  return {
    state: vox,
    // The program wrote SWCHA or SWACNT (register 0 or 1), at CPU cycle `cycle`.
    write: (register, value, cycle) => {
      if (register === 0) vox.swcha = value;
      else {
        vox.output = (value & 1) === 1;
        vox.cnt = value;
      }
      setLevel(cycle);
    },
    // What reading SWCHA shows: READY on bit 1.
    read: (value) => {
      const ready = vox.ready ? value | 0x02 : value & ~0x02;
      // the data line is the program's and the memory's together (either can pull it low)
      return vox.sda && vox.slaveSda ? ready | SDA : ready & ~SDA;
    },
    // End of a frame: bytes that finished since the last write are decoded now.
    flush: (cycle) => decode(cycle),
    attach: async () => {
      vox.chip = await loadChip();
      vox.waiting.forEach(([code, data]) => vox.chip.write(code, data));
      vox.waiting = [];
      vox.ready = !vox.chip.bufferHalfFull();
    },
    // The speech for `milliseconds` of emulated time, as the Float32Array the page plays, or null while the chip is silent.
    render: (milliseconds) => {
      if (!vox.chip) return null;
      vox.fraction += (SAMPLE_RATE * milliseconds) / 1000;
      const count = Math.floor(vox.fraction);
      vox.fraction -= count;
      if (count <= 0) return null;
      const bytes = vox.chip.render(count);
      vox.ready = !vox.chip.bufferHalfFull();
      const speaking = vox.chip.speaking();
      if (!speaking && vox.quiet) return null;
      vox.quiet = !speaking;
      return new Float32Array(bytes.buffer, bytes.byteOffset, count);
    },
    sampleRate: SAMPLE_RATE,
  };
};

module.exports = {createAtariVox};
