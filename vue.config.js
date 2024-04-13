module.exports = {
  transpileDependencies: [
    'vuetify',
  ],
  publicPath: './',
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
