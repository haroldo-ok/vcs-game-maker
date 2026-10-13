'use strict';

// Regenerates every place the 6502.ts palettes are copied to, from the 6502.ts package itself:
//  - NTSC_COLORS and PAL_COLORS in src/utils/palette.js (the colors of every swatch and editor),
//  - the Aseprite extension in 6502ts-palettes/ (one color per Atari color byte).
// Run with `npm run build:palettes` after updating the 6502.ts package.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..', '..');
const palettes = require('6502.ts/lib/machine/stella/tia/palette');

// 6502.ts stores each color as a little-endian ABGR integer.
const hexOf = (value) => [value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff]
    .map((channel) => channel.toString(16).padStart(2, '0')).join('');

const colors = (palette) => Array.from(palette.slice(0, 128), hexOf);

const arrayText = (name, list) => {
  const rows = [];
  for (let i = 0; i < list.length; i += 8) {
    rows.push('  ' + list.slice(i, i + 8).map((hex) => `'${hex}'`).join(', ') + ',');
  }
  return `export const ${name} = [\n${rows.join('\n')}\n];`;
};

const replaceArray = (source, name, list) => {
  const pattern = new RegExp(`export const ${name} = \\[[^\\]]*\\];`);
  if (!pattern.test(source)) throw new Error(`${name} not found in src/utils/palette.js`);
  return source.replace(pattern, arrayText(name, list));
};

const ntsc = colors(palettes.NTSC);
const pal = colors(palettes.PAL);

const paletteFile = path.join(root, 'src/utils/palette.js');
const original = fs.readFileSync(paletteFile, 'utf8');
const crlf = original.includes('\r\n');
let source = original.replace(/\r\n/g, '\n');
source = replaceArray(source, 'PAL_COLORS', pal);
source = replaceArray(source, 'NTSC_COLORS', ntsc);
fs.writeFileSync(paletteFile, crlf ? source.replace(/\n/g, '\r\n') : source);

const gpl = (title, list) => {
  const lines = ['GIMP Palette', '#', `# ${title}`, '# Colors are named by their Atari color byte, as used in batari Basic', '#'];
  list.forEach((hex, index) => {
    const rgb = [0, 2, 4].map((i) => String(parseInt(hex.slice(i, i + 2), 16)).padStart(3, ' '));
    lines.push(`${rgb.join(' ')}\t$${(index * 2).toString(16).toUpperCase().padStart(2, '0')}`);
  });
  return lines.join('\n') + '\n';
};

const folder = path.join(root, '6502ts-palettes');
fs.mkdirSync(folder, {recursive: true});
fs.writeFileSync(path.join(folder, '6502ts-ntsc.gpl'), gpl('Atari 2600 NTSC (6502.ts)', ntsc));
fs.writeFileSync(path.join(folder, '6502ts-pal.gpl'), gpl('Atari 2600 PAL (6502.ts)', pal));
fs.writeFileSync(path.join(folder, 'package.json'), JSON.stringify({
  name: '6502ts-palettes',
  displayName: 'Atari 2600 (6502.ts) Palettes',
  description: 'The NTSC and PAL palettes the 6502.ts emulator in VCS Game Maker draws, with each color named by its Atari color byte.',
  version: '1.0',
  author: {name: 'VCS Game Maker'},
  publisher: 'vcs-game-maker',
  categories: ['Palettes'],
  contributes: {
    palettes: [
      {id: 'Atari 2600 NTSC (6502.ts)', path: './6502ts-ntsc.gpl'},
      {id: 'Atari 2600 PAL (6502.ts)', path: './6502ts-pal.gpl'},
    ],
  },
}, null, 2) + '\n');

console.log('NTSC', ntsc.slice(0, 4).join(' '), '... PAL', pal.slice(0, 4).join(' '));
