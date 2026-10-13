import {reactive} from '@vue/composition-api';
import {soundEffectsInBankFile} from '../utils/sound-bank';

// Sound banks and single sounds (.vcssnd for single sounds, .vcsbnk for banks, or .json files) are kept in a folder
// of a GitHub repo and copied into this browser's IndexedDB once per page
// load, the same way the example projects are (see hooks/examples.js): one
// request lists the folder (each file comes with a content hash), and only
// files that are new or whose hash changed are downloaded. Files no longer in
// the folder are deleted locally. The Sound Banks screen always reads the
// local copies, so it works offline after the first successful run.
//
// To change which repo the sound banks come from, edit SOUND_BANKS_SOURCE.
const SOUND_BANKS_SOURCE = {
  owner: 'AbstractPolygon',
  repo: 'vcs-game-maker-content',
  branch: 'main',
  path: 'soundbanks',
};

const SOURCE_KEY = `${SOUND_BANKS_SOURCE.owner}/${SOUND_BANKS_SOURCE.repo}@${SOUND_BANKS_SOURCE.branch}/${SOUND_BANKS_SOURCE.path}`;
// Where the files come from, shown while they download.
const SOURCE_URL = `https://github.com/${SOUND_BANKS_SOURCE.owner}/${SOUND_BANKS_SOURCE.repo}/tree/${SOUND_BANKS_SOURCE.branch}/${SOUND_BANKS_SOURCE.path}`;
const DB_NAME = 'vcs-game-maker-soundbanks';
const STORE_NAME = 'soundbanks';

// status: 'idle' | 'loading' | 'done' | 'error'. While loading, total is how
// many files are being downloaded (0 while still checking) and done how many
// have finished.
export const soundBanksState = reactive({source: SOURCE_URL, entries: [], status: 'idle', message: '', done: 0, total: 0});

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

// What a bank's card shows: how many sounds it holds and their names, read
// from the file itself.
const summarize = (name, text) => {
  let sounds = [];
  let isBank = false;
  try {
    const parsed = JSON.parse(text);
    isBank = !!(parsed && Array.isArray(parsed.soundEffects));
    sounds = soundEffectsInBankFile(parsed).map((sound) => sound.name || 'Unnamed sound effect');
  } catch (e) {
    console.error(`Could not read sound bank ${name}`, e);
  }
  return {sounds, isBank};
};

// What a download is: a 'bank' (a file of several sounds), an 'instrument' or 'percussion' (a single sound
// tagged as one on the Sound tab) or a plain 'sound'. Read from the file's text
// each time rather than kept in the stored summary, so files downloaded before this existed
// get one too.
const kindOf = (text, isBank) => {
  if (isBank) return 'bank';
  try {
    const sound = JSON.parse(text);
    return sound.isPercussion ? 'percussion' : sound.isInstrument ? 'instrument' : 'sound';
  } catch (e) {
    return 'sound';
  }
};

// The kernel a file says it was made for; a file saved before that was recorded is a Standard kernel one.
const kernelOf = (text) => {
  try {
    return JSON.parse(text).kernel === 'dpcplus' ? 'dpcplus' : 'standard';
  } catch (e) {
    return 'standard';
  }
};

// The developer and website a file was exported with (see the Sound tab's export), or '' for each it does not have.
const creditOf = (text) => {
  try {
    const {developer, website} = JSON.parse(text);
    return {developer: typeof developer === 'string' ? developer : '', website: typeof website === 'string' ? website : ''};
  } catch (e) {
    return {developer: '', website: ''};
  }
};

const toEntry = (record) => ({
  name: record.name,
  text: record.text,
  ...record.summary,
  kind: kindOf(record.text, record.summary && record.summary.isBank),
  kernel: kernelOf(record.text),
  ...creditOf(record.text),
});

const sortEntries = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name));

const showCached = async () => {
  const records = (await readEverything()).filter((record) => record.source === SOURCE_KEY);
  soundBanksState.entries = sortEntries(records.map(toEntry));
  return records;
};

// Lists one folder, then the folders inside it (down to MAX_FOLDER_DEPTH), so
// sounds and banks can be kept in subfolders as well as straight in the main
// one. Each file's name is its path below the main folder.
const MAX_FOLDER_DEPTH = 2;

const listRemoteFiles = async (path = SOUND_BANKS_SOURCE.path, depth = 0) => {
  const {owner, repo, branch} = SOUND_BANKS_SOURCE;
  const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      // no-cache: the API marks listings cacheable for a minute, which kept a
      // just-changed folder from showing up on a quick reload. This still
      // revalidates cheaply (an unchanged folder answers 304).
      {headers: {Accept: 'application/vnd.github+json'}, cache: 'no-cache'});
  // The folder not existing (yet) just means there are no sound banks.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const listing = await response.json();
  const prefix = `${SOUND_BANKS_SOURCE.path}/`;
  const files = listing
      .filter((item) => item.type === 'file' && /\.(vcssnd|vcsbnk|json)$/i.test(item.name))
      .map((item) => ({...item, name: item.path.startsWith(prefix) ? item.path.slice(prefix.length) : item.name}));
  if (depth >= MAX_FOLDER_DEPTH) return files;
  for (const folder of listing.filter((item) => item.type === 'dir')) {
    files.push(...await listRemoteFiles(folder.path, depth + 1));
  }
  return files;
};

let started = false;

// Runs once per page load (further calls do nothing). Shows whatever is
// already stored straight away, then checks GitHub for new, changed and
// removed files. A failed check (offline, rate limited) leaves the stored
// copies as they are.
export const syncSoundBanks = async () => {
  if (started) return;
  started = true;
  soundBanksState.status = 'loading';
  let cached = [];
  try {
    cached = await showCached();
  } catch (e) {
    console.error('Could not read the stored sound banks', e);
  }
  try {
    const remote = await listRemoteFiles();
    const cachedByName = new Map(cached.map((record) => [record.name, record]));
    const toDownload = remote.filter((file) => {
      const existing = cachedByName.get(file.name);
      return !existing || existing.sha !== file.sha;
    });
    soundBanksState.done = 0;
    soundBanksState.total = toDownload.length;
    for (const file of toDownload) {
      // The file's content for exactly this hash, from the git blob API (the
      // raw.githubusercontent.com copy can lag a few minutes behind a push,
      // which would store old content under the new hash).
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
      soundBanksState.done += 1;
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
    soundBanksState.total = 0;
    soundBanksState.status = 'done';
    soundBanksState.message = '';
  } catch (e) {
    console.error('Could not check for sound bank updates', e);
    soundBanksState.total = 0;
    soundBanksState.status = 'error';
    soundBanksState.message = String((e && e.message) || e);
    await showCached().catch(() => {});
  }
};
