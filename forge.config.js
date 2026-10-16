const {FusesPlugin} = require('@electron-forge/plugin-fuses');
const {FuseV1Options, FuseVersion} = require('@electron/fuses');

module.exports = {
  packagerConfig: {
    asar: true,
    // The deb and rpm makers look for the program under the package name, but the packager names it after the product
    // name (with spaces) unless told otherwise. Only Linux needs this; Windows and macOS keep the product name.
    ...(process.platform === 'linux' ? {executableName: 'vcs-game-maker'} : {}),
    // Without the extension: the packager adds .ico on Windows and .icns on
    // macOS (Linux packages get theirs from the makers below).
    icon: 'build/icons/icon',
  },
  rebuildConfig: {},
  makers: [
    {
      name: '@electron-forge/maker-squirrel',
      config: {
        setupIcon: 'build/icons/icon.ico',
      },
    },
    {
      name: '@electron-forge/maker-zip',
      platforms: ['darwin'],
    },
    {
      name: '@electron-forge/maker-dmg',
      platforms: ['darwin'],
      config: {
        icon: 'build/icons/icon.icns',
      },
    },
    {
      name: '@electron-forge/maker-deb',
      config: {
        options: {
          icon: 'build/icons/512x512.png',
        },
      },
    },
    {
      // One file that runs on any Linux distribution, with no install (needs mksquashfs when it is made).
      name: '@reforged/maker-appimage',
      platforms: ['linux'],
      config: {
        options: {
          icon: 'build/icons/512x512.png',
          categories: ['Development', 'Game'],
        },
      },
    },
    {
      name: '@electron-forge/maker-rpm',
      config: {
        options: {
          icon: 'build/icons/512x512.png',
        },
      },
    },
  ],
  plugins: [
    {
      name: '@electron-forge/plugin-auto-unpack-natives',
      config: {},
    },
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};
