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
      // A Windows Installer (.msi) package: it installs for all users into Program Files and adds a Start Menu shortcut.
      name: '@electron-forge/maker-wix',
      config: {
        name: 'VCS Game Maker',
        manufacturer: 'AbstractPolygon',
        icon: 'build/icons/icon.ico',
        defaultInstallMode: 'perMachine',
        // Set by the Windows ARM build (see .github/workflows/build.yml); without it the installer is made the way it always was.
        ...(process.env.WIX_ARCH ? {arch: process.env.WIX_ARCH} : {}),
        // Shows the installer's Customize page, where the Desktop shortcut can be ticked or not (the Start Menu one is always added).
        ui: {chooser: false},
        beforeCreate: (creator) => {
          const template = creator.wixTemplate.replace(/\r\n/g, '\n');
          const ref = /^[ \t]*<ComponentRef Id="DesktopShortcut" \/>\n/m;
          const marker = '<!-- {{AutoLaunchFeature}} -->';
          if (!ref.test(template) || !template.includes(marker)) {
            throw new Error('The WiX template changed: the Desktop shortcut can no longer be made a separate choice.');
          }
          creator.wixTemplate = template.replace(ref, '').replace(marker,
              '<Feature Id="DesktopShortcutFeature" Title="Desktop shortcut" Level="1" ' +
              'Description="Puts a shortcut to the app on the desktop.">\n' +
              '        <ComponentRef Id="DesktopShortcut" />\n      </Feature>\n' + marker);
        },
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
        // The menu entry (a .desktop file) the package installs: its name, icon and the menu section it goes in.
        options: {
          icon: 'build/icons/512x512.png',
          genericName: 'Atari 2600 Game Maker',
          categories: ['Development', 'Game'],
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
          genericName: 'Atari 2600 Game Maker',
          categories: ['Development', 'Game'],
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
