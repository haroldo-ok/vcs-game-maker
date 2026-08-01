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
    // The bundled toolchain (bb19/*.wasm, ~1.5MB total) and javatari.js
    // (~650KB) rarely change between releases - precaching them means a
    // repeat visit (or an offline one) skips re-downloading the whole
    // toolchain, at the cost of the service worker needing an update
    // whenever those assets do change (workbox's default revisioning
    // handles that automatically via content hashing).
    workboxOptions: {
      exclude: [/\.map$/, /manifest\.json$/],
    },
  },
  configureWebpack: {
	  resolve: {
		fallback: {
			"crypto": require.resolve("crypto-browserify"),
			"stream": require.resolve("stream-browserify"),
			"assert": require.resolve("assert"),
			"fs": require.resolve("browserify-fs"),
			"http": require.resolve("stream-http"),
			"https": require.resolve("https-browserify"),
			"os": require.resolve("os-browserify"),
			"path": require.resolve("path-browserify"),
			"url": require.resolve("url")
		},
	  },
  },
};
