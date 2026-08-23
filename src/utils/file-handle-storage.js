// Persists the single "active project" FileSystemFileHandle (see
// Project.vue's own data.activeFileHandle) across a page reload, so "Save"
// keeps writing straight back to the same file the user last saved to or
// opened, instead of silently reverting to "Save As..." behavior just
// because the tab got refreshed. A real reported gap: the handle used to
// live in memory only, so it vanished on every reload even with the exact
// same (localStorage-backed) project still open.
//
// A FileSystemFileHandle can't go in localStorage (string-only), but IS a
// structured-cloneable object IndexedDB can store directly - a single
// fixed key is enough here, since there's only ever one "current project"
// handle at a time (matching data.activeFileHandle's own single-value
// shape), not a per-project history.
const DB_NAME = 'vcs-game-maker';
const STORE_NAME = 'file-handles';
const HANDLE_KEY = 'active-project';

const openHandleDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME);
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// handle=null clears whatever was persisted (see Project.vue's own
// handleNewProject - a new project has nothing to save back to, and
// shouldn't leave the PREVIOUS project's handle sitting around to be
// silently restored into it on the next reload).
export const persistActiveFileHandle = async (handle) => {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    if (handle) {
      tx.objectStore(STORE_NAME).put(handle, HANDLE_KEY);
    } else {
      tx.objectStore(STORE_NAME).delete(HANDLE_KEY);
    }
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.error('Error while persisting the active project file handle', e);
  }
};

export const loadPersistedFileHandle = async () => {
  try {
    const db = await openHandleDb();
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(HANDLE_KEY);
    return await new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } catch (e) {
    console.error('Error while loading the persisted active project file handle', e);
    return null;
  }
};

// A handle restored from a PRIOR session (queryPermission) - or even one
// from THIS session that was never actually granted write access yet
// (requestPermission, which needs a user gesture; both this and the
// "Save" click that calls it are the same gesture, so this is safe to
// call from there) - needs its write permission (re-)confirmed before
// createWritable() is trusted to work. The browser itself decides how
// long a "granted" answer is remembered (commonly for the page's own
// lifetime, sometimes across reloads for the same origin) - this only
// ever ASKS, never assumes.
export const ensureWritePermission = async (handle) => {
  const options = {mode: 'readwrite'};
  if ((await handle.queryPermission(options)) === 'granted') return true;
  if ((await handle.requestPermission(options)) === 'granted') return true;
  return false;
};
