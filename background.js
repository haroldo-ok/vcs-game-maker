const {app, BrowserWindow, Menu, MenuItem, dialog, ipcMain} = require('electron/main');
const path = require('path');
const fs = require('fs');
const os = require('os');
const {execFile} = require('child_process');

// Electron doesn't show a right-click context menu on its own - build one
// per-click from the params Electron already computes (isEditable/selection
// text/editFlags) rather than a fixed one, so it only offers actions that
// are actually valid for whatever the user right-clicked.
const showContextMenu = (win, params) => {
  const menu = new Menu();
  if (params.isEditable) {
    menu.append(new MenuItem({role: 'cut', enabled: params.editFlags.canCut}));
    menu.append(new MenuItem({role: 'copy', enabled: params.editFlags.canCopy}));
    menu.append(new MenuItem({role: 'paste', enabled: params.editFlags.canPaste}));
    menu.append(new MenuItem({role: 'selectAll'}));
  } else if (params.selectionText) {
    menu.append(new MenuItem({role: 'copy'}));
  }
  if (menu.items.length) menu.popup({window: win});
};

const createWindow = () => {
  const win = new BrowserWindow({
    width: 800,
    height: 600,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile('dist/index.html');
  win.webContents.on('context-menu', (event, params) => showContextMenu(win, params));
};

// "Browse..." on the Options tab's Stella field - a plain native file picker,
// filtered to executables on Windows (Stella.exe) and left unfiltered
// elsewhere (macOS/Linux Stella builds aren't a single, predictable
// extension the way Windows .exe is - an app bundle on macOS is itself a
// directory, and a Linux build might be a plain extensionless binary or an
// AppImage). Returns null (not '') when the user cancels, so the renderer
// can tell "cancelled" apart from "cleared the field" without a separate
// flag.
ipcMain.handle('stella:pick-path', async (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  const filters = process.platform === 'win32' ?
    [{name: 'Programs', extensions: ['exe']}, {name: 'All Files', extensions: ['*']}] :
    [{name: 'All Files', extensions: ['*']}];
  const result = await dialog.showOpenDialog(win, {
    title: 'Locate the Stella executable',
    properties: ['openFile'],
    filters,
  });
  if (result.canceled || !result.filePaths.length) return null;
  return result.filePaths[0];
});

// "Test in Stella" (App.vue) - writes the just-compiled ROM bytes to a temp
// file (Stella, like every standalone 2600 emulator, only takes a ROM as a
// file path argument, not piped/inline data), then launches Stella pointed
// at it with its own default settings (no extra CLI flags - "automatically
// open the ROM with default settings" was the explicit request, and Stella
// already remembers whatever the user last configured in its own UI across
// runs). One fixed temp filename (not a fresh one per launch) so repeated
// "Test in Stella" clicks don't leave an ever-growing pile of stale ROMs
// behind in the OS temp directory. execFile (not exec) - the ROM path is
// passed as its own argv entry, never interpolated into a shell string, so
// a path containing spaces or shell-meaningful characters can't break the
// invocation or be interpreted as shell syntax. Detached and unref'd so
// Stella keeps running (and this app doesn't wait on it) after this handler
// returns - matches how a real "launch an external app" action should
// behave, not a blocking subprocess call.
ipcMain.handle('stella:launch', async (event, {stellaPath, romBytes}) => {
  if (!stellaPath) return {success: false, error: 'No Stella path configured.'};
  const romPath = path.join(os.tmpdir(), 'vcs-game-maker-preview.bin');
  try {
    fs.writeFileSync(romPath, Buffer.from(romBytes));
  } catch (err) {
    return {success: false, error: `Couldn't write the ROM to a temp file: ${err.message}`};
  }
  return new Promise((resolve) => {
    const child = execFile(stellaPath, [romPath], (err) => {
      // ENOENT here specifically means the STELLA PATH itself doesn't exist/
      // isn't executable (execFile's own spawn failure, not anything Stella
      // did after starting) - the one failure mode worth a specific message
      // for, since it's directly actionable ("check the path on the Options
      // tab"). Any other error surfaces via its own message rather than a
      // second hardcoded string, since there's no other single common case
      // worth special-casing here.
      if (!err) return;
      if (err.code === 'ENOENT') {
        resolve({success: false, error: `No executable found at "${stellaPath}".`});
      } else {
        resolve({success: false, error: err.message});
      }
    });
    child.unref();
    // Resolve success immediately once the process has actually spawned,
    // rather than waiting for it to exit (Stella is a long-running GUI app -
    // waiting for exit would mean the button just spins until the user
    // closes Stella again).
    child.once('spawn', () => resolve({success: true}));
  });
});

// Explicit Edit menu (rather than relying on Electron's implicit default
// menu) so Ctrl+C/Cut/Paste/Select All accelerators are guaranteed to be
// wired up - covers plain selectable text (e.g. the error console) as well
// as editable fields, since role: 'copy' etc. act on whatever's currently
// selected/focused in the renderer either way.
Menu.setApplicationMenu(Menu.buildFromTemplate([
  {
    label: 'Edit',
    submenu: [
      {role: 'cut'},
      {role: 'copy'},
      {role: 'paste'},
      {role: 'selectAll'},
    ],
  },
]));

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
