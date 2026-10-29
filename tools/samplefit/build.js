'use strict';

// Bundles the audio import's worker (src/utils/sample-fit-worker.js, which fits recordings to sound cards) into public/js, where
// the page starts it with a plain path, the way it starts the SpeakJet worker. Committed like the other bundles in public/js, and
// rebuilt by npm before `serve` and `build` (see "preserve" and "prebuild" in package.json), so it does not fall behind
// src/utils/sample-fit.js. Run with `npm run build:samplefit`.
const path = require('path');
const esbuild = require('esbuild');

const root = path.join(__dirname, '..', '..');

esbuild.build({
  bundle: true,
  platform: 'browser',
  format: 'iife',
  minify: true,
  logLevel: 'info',
  entryPoints: [path.join(root, 'src/utils/sample-fit-worker.js')],
  outfile: path.join(root, 'public/js/sample-fit-worker.js'),
  banner: {js: '/* Built by tools/samplefit/build.js from src/utils/sample-fit-worker.js */'},
}).catch(() => process.exit(1));
