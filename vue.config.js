module.exports = {
  transpileDependencies: [
    'vuetify',
  ],
  publicPath: './',
  // Drives the HTML <title>, which is what both the browser tab and (since
  // background.js's BrowserWindow doesn't set its own "title" option) the
  // Electron desktop window's title bar actually display - without this it
  // falls back to package.json's npm-style "name" ("vcs-game-maker").
  chainWebpack: (config) => {
    config.plugin('html').tap((args) => {
      args[0].title = 'VCS Game Maker';
      return args;
    });
    // @blockly/field-grid-dropdown's published package.json "module" field
    // (what webpack prefers over "main" for an ES-module-aware resolve,
    // Vue CLI's default here) points at "./src/index.js" - a file that
    // doesn't exist in the published package at all, only "./src/index.ts"
    // does (the real TypeScript source, never meant to be resolved
    // directly) - confirmed as a real upstream packaging bug present in
    // both 3.0.0 and 3.0.1 (the only two 3.x releases), not something
    // specific to this project's setup. Aliased straight to the working
    // "main" entry (./dist/index.js, the real compiled output every other
    // consumer actually gets) instead of waiting on an upstream fix.
    config.resolve.alias.set(
        '@blockly/field-grid-dropdown',
        require.resolve('@blockly/field-grid-dropdown/dist/index.js'),
    );
    // Vuetify's per-component .sass files land in different chunks depending
    // on which pages/components pull them in, so mini-css-extract-plugin
    // can't always satisfy one global order across chunks and warns about
    // it. Their selectors don't overlap between components, so the actual
    // load order doesn't affect rendering - only the warning is noise.
    // Only exists for production builds - `vue-cli-service serve` uses
    // vue-style-loader instead, so tapping unconditionally throws "Cannot
    // call .tap() on a plugin that has not yet been defined" on dev server
    // startup.
    if (config.plugins.has('extract-css')) {
      config.plugin('extract-css').tap((args) => {
        args[0].ignoreOrder = true;
        return args;
      });
    }
  },
  pwa: {
    name: 'VCS Game Maker',
    themeColor: '#1a1a2e',
    msTileColor: '#1a1a2e',
    appleMobileWebAppCapable: 'yes',
    appleMobileWebAppStatusBarStyle: 'black-translucent',
    manifestOptions: {
      short_name: 'VCS Game Maker',
      background_color: '#1a1a2e',
      start_url: '.',
      display: 'standalone',
      icons: [
        {src: './icons/icon-192.png', sizes: '192x192', type: 'image/png'},
        {src: './icons/icon-512.png', sizes: '512x512', type: 'image/png'},
      ],
    },
    iconPaths: {
      faviconSVG: null,
      favicon32: 'icons/favicon-32x32.png',
      favicon16: 'icons/favicon-16x16.png',
      appleTouchIcon: 'icons/apple-touch-icon.png',
      maskIcon: null,
      msTileImage: 'icons/mstile-150x150.png',
    },
    // The bundled toolchain (bb19/*.wasm, ~1.5MB total) and the preview
    // emulator (gopher2600.wasm + wasm_exec.js, ~16MB - see
    // tools/gopher2600-wasm) rarely change between releases - precaching
    // them means a repeat visit (or an offline one) skips re-downloading
    // the whole toolchain, at the cost of the service worker needing an
    // update whenever those assets do change (workbox's default
    // revisioning handles that automatically via content hashing).
    workboxOptions: {
      exclude: [/\.map$/, /manifest\.json$/],
      // Workbox's default precache cutoff (2MB) is smaller than
      // gopher2600.wasm (~16MB) - raise it so the emulator actually gets
      // precached per the intent described above, instead of silently
      // skipped.
      maximumFileSizeToCacheInBytes: 20 * 1024 * 1024,
    },
  },
  configureWebpack: {
    // The bundled toolchain/emulator WASM (bb19/*.wasm, gopher2600.wasm) and
    // the vendor/app JS chunks that pull them in are expected to exceed
    // webpack's default 244KiB performance budget - it's not a regression
    // to chase, so raise the thresholds instead of live with the warning.
    performance: {
      maxAssetSize: 16 * 1024 * 1024,
      maxEntrypointSize: 4 * 1024 * 1024,
    },
	  resolve: {
      fallback: {
        'crypto': require.resolve('crypto-browserify'),
        'stream': require.resolve('stream-browserify'),
        'assert': require.resolve('assert'),
        'fs': require.resolve('browserify-fs'),
        'http': require.resolve('stream-http'),
        'https': require.resolve('https-browserify'),
        'os': require.resolve('os-browserify'),
        'path': require.resolve('path-browserify'),
        'url': require.resolve('url'),
      },
	  },
  },
};
