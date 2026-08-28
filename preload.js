const {contextBridge, ipcRenderer} = require('electron');

// The renderer (a plain web app, also served over http:// for the browser
// build) has no Node/Electron access by default - contextIsolation keeps it
// that way even here, exposing only this narrow, purpose-built surface
// rather than the raw ipcRenderer/require. window.electronAPI's mere
// presence is what the renderer uses (see App.vue/Configuration.vue's own
// isElectron checks) to tell "running inside the desktop app" apart from
// "running in a browser", where none of this exists at all.
contextBridge.exposeInMainWorld('electronAPI', {
  pickStellaPath: () => ipcRenderer.invoke('stella:pick-path'),
  // romBytes: a Uint8Array (Javatari.compiledResult.output) - structured-
  // cloned across the IPC boundary automatically, no manual serialization
  // needed.
  launchStella: (stellaPath, romBytes) => ipcRenderer.invoke('stella:launch', {stellaPath, romBytes}),
});
