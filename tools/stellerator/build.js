'use strict';

// Bundles the 6502.ts emulator backend into public/js (committed, like gopher2600.wasm, so a
// normal build needs no extra step). Run with `npm run build:stellerator` after changing
// anything in this folder or updating the 6502.ts package.
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..', '..');
const common = {
  bundle: true,
  platform: 'browser',
  format: 'iife',
  minify: true,
  logLevel: 'info',
  // thumbulator.ts (the DPC+ ARM core) mentions Node's fs and path behind an environment
  // check that never runs in a browser.
  external: ['fs', 'path'],
  banner: {js: '/* 6502.ts (MIT, https://github.com/6502ts/6502.ts) - built by tools/stellerator/build.js */'},
};

Promise.all([
  esbuild.build({
    ...common,
    entryPoints: [path.join(__dirname, 'worker-entry.js')],
    outfile: path.join(root, 'public/js/stellerator-worker.js'),
    define: {global: 'self'},
  }),
  esbuild.build({
    ...common,
    entryPoints: [path.join(__dirname, 'page-entry.js')],
    outfile: path.join(root, 'public/js/stellerator-page.js'),
    define: {global: 'window'},
  }),
]).catch(() => process.exit(1));
