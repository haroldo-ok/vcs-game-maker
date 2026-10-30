import {reactive} from '@vue/composition-api';
import {SOUND_BANKS_SOURCE} from './soundbanks';
import {voicesInFile} from '../utils/voice-bank';
import {isFromNewerApp, APP_VERSION_KEY} from '../utils/app-version';

// Voice presets and voice banks (.vcsvox for single voices, .vcsvbnk for banks, or .json files) are kept in a folder of the same GitHub repo as the
// sound banks and copied into this browser's IndexedDB once per page load, the same way (see hooks/soundbanks.js): one request lists the folder (each
// file comes with a content hash), only files that are new or whose hash changed are downloaded, files no longer in the folder are deleted locally.
// The Voice Presets screen of the Project tab always reads the local copies, so it works offline after the first successful run.
const VOICE_PRESETS_SOURCE = {...SOUND_BANKS_SOURCE, path: 'voices'};

const SOURCE_KEY = `${VOICE_PRESETS_SOURCE.owner}/${VOICE_PRESETS_SOURCE.repo}@${VOICE_PRESETS_SOURCE.branch}/${VOICE_PRESETS_SOURCE.path}`;
// Where the files come from, shown while they download.
const SOURCE_URL = `https://github.com/${VOICE_PRESETS_SOURCE.owner}/${VOICE_PRESETS_SOURCE.repo}/tree/${VOICE_PRESETS_SOURCE.branch}/${VOICE_PRESETS_SOURCE.path}`;
const DB_NAME = 'vcs-game-maker-voicepresets';
const STORE_NAME = 'voicepresets';

// status: 'idle' | 'loading' | 'done' | 'error'. While loading, total is how many files are being downloaded (0 while still checking) and done how many
// have finished.
export const voicePresetsState = reactive({source: SOURCE_URL, entries: [], status: 'idle', message: '', done: 0, total: 0});

const openDb = () => new Promise((resolve, reject) => {
  const request = indexedDB.open(DB_NAME, 1);
  request.onupgradeneeded = () => {
    request.result.createObjectStore(STORE_NAME, {keyPath: 'key'});
  };
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

const runTransaction = async (mode, work) => {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE_NAME, mode);
    const result = work(tx.objectStore(STORE_NAME));
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
    return result;
  } finally {
    db.close();
  }
};

const readEverything = async () => {
  const request = await runTransaction('readonly', (store) => store.getAll());
  return request.result || [];
};

const putRecord = (record) => runTransaction('readwrite', (store) => store.put(record));
const deleteRecord = (key) => runTransaction('readwrite', (store) => store.delete(key));

// What a card shows: how many voices the file holds and their names, read from the file itself.
const summarize = (name, text) => {
  let voices = [];
  let isBank = false;
  try {
    const parsed = JSON.parse(text);
    isBank = !!(parsed && Array.isArray(parsed.voices));
    voices = voicesInFile(parsed).map((voice) => voice.name || 'Unnamed voice');
  } catch (e) {
    console.error(`Could not read voice preset ${name}`, e);
  }
  return {voices, isBank};
};

// The developer and website a file was exported with (see the Vox tab's export), or '' for each it does not have.
const creditOf = (text) => {
  try {
    const {developer, website} = JSON.parse(text);
    return {developer: typeof developer === 'string' ? developer : '', website: typeof website === 'string' ? website : ''};
  } catch (e) {
    return {developer: '', website: ''};
  }
};

// The version of the app that exported a file, or '' for one exported before it was written.
const appVersionOf = (text) => {
  try {
    const version = JSON.parse(text)[APP_VERSION_KEY];
    return typeof version === 'string' ? version : '';
  } catch (e) {
    return '';
  }
};

const toEntry = (record) => ({
  appVersion: appVersionOf(record.text),
  name: record.name,
  text: record.text,
  ...record.summary,
  ...creditOf(record.text),
});

const sortEntries = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name));

const showCached = async () => {
  const records = (await readEverything()).filter((record) => record.source === SOURCE_KEY);
  // Files exported by a newer version of the app than this one are not shown.
  voicePresetsState.entries = sortEntries(records.map(toEntry).filter((entry) => !isFromNewerApp(entry.appVersion)));
  return records;
};

// Lists one folder, then the folders inside it (down to MAX_FOLDER_DEPTH). Each file's name is its path below the main folder.
const MAX_FOLDER_DEPTH = 2;

const listRemoteFiles = async (path = VOICE_PRESETS_SOURCE.path, depth = 0) => {
  const {owner, repo, branch} = VOICE_PRESETS_SOURCE;
  const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      {headers: {Accept: 'application/vnd.github+json'}, cache: 'no-cache'});
  // The folder not existing (yet) just means there are no voice presets.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const listing = await response.json();
  const prefix = `${VOICE_PRESETS_SOURCE.path}/`;
  const files = listing
      .filter((item) => item.type === 'file' && /\.(vcsvox|vcsvbnk|json)$/i.test(item.name))
      .map((item) => ({...item, name: item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.name}));
  if (depth >= MAX_FOLDER_DEPTH) return files;
  for (const folder of listing.filter((item) => item.type === 'dir')) {
    files.push(...await listRemoteFiles(folder.path, depth + 1));
  }
  return files;
};

let started = false;

// Runs once per page load (further calls do nothing). Shows whatever is already stored straight away, then checks GitHub for new, changed and removed
// files. A failed check (offline, rate limited) leaves the stored copies as they are.
export const syncVoicePresets = async () => {
  if (started) return;
  started = true;
  voicePresetsState.status = 'loading';
  let cached = [];
  try {
    cached = await showCached();
  } catch (e) {
    console.error('Could not read the stored voice presets', e);
  }
  try {
    const remote = await listRemoteFiles();
    const cachedByName = new Map(cached.map((record) => [record.name, record]));
    const toDownload = remote.filter((file) => {
      const existing = cachedByName.get(file.name);
      return !existing || existing.sha !== file.sha;
    });
    voicePresetsState.done = 0;
    voicePresetsState.total = toDownload.length;
    for (const file of toDownload) {
      // The file's content for exactly this hash, from the git blob API (the raw.githubusercontent.com copy can lag a few minutes behind a push).
      const response = await fetch(file.git_url, {headers: {Accept: 'application/vnd.github.raw+json'}});
      if (!response.ok) throw new Error(`Could not download ${file.name} (${response.status})`);
      const text = await response.text();
      await putRecord({
        key: `${SOURCE_KEY}/${file.name}`,
        source: SOURCE_KEY,
        name: file.name,
        sha: file.sha,
        text,
        summary: summarize(file.name, text),
      });
      voicePresetsState.done += 1;
      // Show each file as soon as it is stored.
      await showCached();
    }
    const remoteNames = new Set(remote.map((file) => file.name));
    for (const record of cached) {
      if (!remoteNames.has(record.name)) await deleteRecord(record.key);
    }
    // Copies stored for a different repo/branch/folder than the current one.
    for (const record of await readEverything()) {
      if (record.source !== SOURCE_KEY) await deleteRecord(record.key);
    }
    await showCached();
    voicePresetsState.total = 0;
    voicePresetsState.status = 'done';
    voicePresetsState.message = '';
  } catch (e) {
    console.error('Could not check for voice preset updates', e);
    voicePresetsState.total = 0;
    voicePresetsState.status = 'error';
    voicePresetsState.message = String((e && e.message) || e);
    await showCached().catch(() => {});
  }
};
