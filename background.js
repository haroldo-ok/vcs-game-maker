const {app, BrowserWindow, Menu, MenuItem} = require('electron/main');

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
  });

  win.loadFile('dist/index.html');
  win.webContents.on('context-menu', (event, params) => showContextMenu(win, params));
};

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
