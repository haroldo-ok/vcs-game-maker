'use strict';

// The NTSC Atari 2600 palette: one hex string per color index (0..127).
//
// The stored/emitted color BYTE is (index << 1). The 2600 ignores the low bit
// of a color register, so valid bytes are the even numbers 0..254, and a byte
// maps back to a palette entry with (byte >> 1). Keeping the byte (rather than
// the index) is convenient because that is exactly what batari Basic expects in
// a `pfcolors:` table and what the color picker block already emits.
export const NTSC_COLORS = [
  '000000', '131313', '373737', '5f5f5f', '7a7a7a', 'a1a1a1', 'c5c5c5', 'ededed',
  '0d0000', '342100', '594502', '806c04', '9b8706', 'c2af0b', 'e7d32b', 'fffa50',
  '300000', '570500', '7b2a01', 'a15103', 'bc6c09', 'e4942d', 'fcb852', 'fee078',
  '450000', '6c0000', '901003', 'b6392b', 'd15445', 'f87c6c', 'fca090', 'fdc8b8',
  '490002', '6f0029', '93004e', 'ba2875', 'd54390', 'fa6bb7', 'fb90dc', 'fcb8ff',
  '3a0049', '620070', '850094', 'ab22bb', 'c63ed6', 'ee65fd', 'fb89ff', 'fcb2ff',
  '1c017d', '4301a4', '6602c8', '8e29f0', 'a844fe', 'cf6bfe', 'f38fff', 'fcb7ff',
  '000196', '1a02bc', '3f13e0', '673afe', '8253fe', 'a97bfe', 'cd9fff', 'f5c7ff',
  '00018d', '0006b3', '1529d8', '3f51fe', '5a6bfe', '8192fe', 'a6b6ff', 'cedeff',
  '00103A', '001f8c', '0642b0', '226ad7', '3c85f2', '62acff', '87d0ff', 'aef8ff',
  '010f25', '05364c', '0e5a70', '1b8298', '2f9db3', '52c4da', '75e8fe', '99ffff',
  '022000', '0a4702', '146b26', '1f934e', '30ae69', '52d590', '73f9b4', '95ffdb',
  '032700', '0c4e02', '167203', '269a0c', '3ab523', '5ddc4a', '80ff6e', 'a2ff95',
  '032200', '0b4a01', '176e03', '379506', '4fb009', '75d81a', '99fc3a', 'bdff5f',
  '011300', '0d3a01', '2f5f02', '568605', '70a108', '98c80c', 'bced23', 'e2ff47',
  '090000', '302400', '554802', '7c6f04', '978a06', 'bfb20b', 'e3d628', 'fffd4d',
];

// Number of columns the palette is laid out in (matches the color picker block).
export const PALETTE_COLUMNS = 8;

// A color byte -> "#rrggbb" for display in the DOM.
export const colorByteToCss = (byte) =>
  `#${NTSC_COLORS[(byte >> 1) & 0x7f]}`;

// A color byte -> batari Basic literal, e.g. 14 -> "$0E".
export const colorByteToBBasic = (byte) =>
  '$' + (byte & 0xfe).toString(16).toUpperCase().padStart(2, '0');
