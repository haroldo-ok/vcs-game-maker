'use strict';

// Which Harmony driver a DPC+ ROM carries decides how the fractional data fetchers behave, and 6502.ts only knows one of the ways.
// gopher2600 (hardware/memory/cartridge/dpcplus/state.go) hashes the first 3 KB of the ROM, the driver, and for two of the four drivers
// it knows (the one the DPC+ ROMs of batari Basic carry among them) a write of a fetcher's low byte also clears its fraction counter.
// 6502.ts keeps the counter, so a playfield whose rows are counted by a fractional fetcher starts each frame at a different place
// inside a row: its row edges jitter by a few lines from frame to frame, which neither gopher2600 nor the hardware does.

const DRIVER_RESETS_COUNTER = {
  '17884ec14f9b1d06fe8d617a1fbdcf47': false,
  '5f80b5a5adbe483addc3f6e6f1b472f8': true,
  '8dd73b44fd11c488326ce507cbeb19d1': true,
  'b328dbdf787400c0f0e2b88b425872a5': false,
};

const DRIVER_BYTES = 0xc00;

// MD5 (RFC 1321) of a Uint8Array, as lower case hex.
const md5 = (bytes) => {
  const K = new Uint32Array(64);
  for (let i = 0; i < 64; i++) K[i] = Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0;
  const S = [7, 12, 17, 22, 5, 9, 14, 20, 4, 11, 16, 23, 6, 10, 15, 21];
  const length = bytes.length;
  const padded = new Uint8Array(((length + 8) >> 6 << 6) + 64);
  padded.set(bytes);
  padded[length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 8, (length * 8) >>> 0, true);
  view.setUint32(padded.length - 4, Math.floor(length / 0x20000000), true);
  let a0 = 0x67452301;
  let b0 = 0xefcdab89;
  let c0 = 0x98badcfe;
  let d0 = 0x10325476;
  for (let offset = 0; offset < padded.length; offset += 64) {
    const M = new Uint32Array(16);
    for (let i = 0; i < 16; i++) M[i] = view.getUint32(offset + i * 4, true);
    let A = a0;
    let B = b0;
    let C = c0;
    let D = d0;
    for (let i = 0; i < 64; i++) {
      let F;
      let g;
      if (i < 16) {
        F = (B & C) | (~B & D);
        g = i;
      } else if (i < 32) {
        F = (D & B) | (~D & C);
        g = (5 * i + 1) % 16;
      } else if (i < 48) {
        F = B ^ C ^ D;
        g = (3 * i + 5) % 16;
      } else {
        F = C ^ (B | ~D);
        g = (7 * i) % 16;
      }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      const shift = S[(i >> 4) * 4 + (i % 4)];
      B = (B + ((F << shift) | (F >>> (32 - shift)))) >>> 0;
    }
    a0 = (a0 + A) >>> 0;
    b0 = (b0 + B) >>> 0;
    c0 = (c0 + C) >>> 0;
    d0 = (d0 + D) >>> 0;
  }
  const out = new DataView(new ArrayBuffer(16));
  [a0, b0, c0, d0].forEach((word, index) => out.setUint32(index * 4, word, true));
  return Array.from(new Uint8Array(out.buffer)).map((byte) => byte.toString(16).padStart(2, '0')).join('');
};

// Makes the fractional fetchers of a DPC+ cartridge behave like the hardware with the driver of the ROM: a write of the low byte
// clears the fraction counter (the low byte of the 20 bit pointer 6502.ts keeps) when that driver does so. A no-op for other cartridges.
const matchDriverFractionalFetchers = (cartridge, rom) => {
  const fetchers = cartridge && cartridge._fractionalFetchers;
  if (!fetchers || !rom || rom.length < DRIVER_BYTES) return;
  if (!DRIVER_RESETS_COUNTER[md5(rom.subarray(0, DRIVER_BYTES))]) return;
  fetchers.forEach((fetcher) => {
    const setPointerLo = fetcher.setPointerLo.bind(fetcher);
    fetcher.setPointerLo = (value) => {
      setPointerLo(value);
      fetcher.pointer &= 0x0fff00;
    };
  });
};

module.exports = {md5, matchDriverFractionalFetchers};
