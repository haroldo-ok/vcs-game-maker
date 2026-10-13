import {reactive} from '@vue/composition-api';
import YAML from 'yaml';

// Example projects (.vcsgm files) are kept in a folder of a GitHub repo and
// copied into this browser's IndexedDB once per page load: one request lists
// the folder (each file comes with a content hash), and only files that are
// new or whose hash changed are downloaded. Files no longer in the folder
// are deleted locally. The Examples view always reads the local copies, so
// it works offline after the first successful run.
//
// To change which repo the examples come from, edit EXAMPLES_SOURCE.
const EXAMPLES_SOURCE = {
  owner: 'AbstractPolygon',
  repo: 'vcs-game-maker-content',
  branch: 'main',
  path: 'examples',
};

const SOURCE_KEY = `${EXAMPLES_SOURCE.owner}/${EXAMPLES_SOURCE.repo}@${EXAMPLES_SOURCE.branch}/${EXAMPLES_SOURCE.path}`;
// Where the files come from, shown while they download.
const SOURCE_URL = `https://github.com/${EXAMPLES_SOURCE.owner}/${EXAMPLES_SOURCE.repo}/tree/${EXAMPLES_SOURCE.branch}/${EXAMPLES_SOURCE.path}`;
const DB_NAME = 'vcs-game-maker-examples';
const STORE_NAME = 'examples';

// status: 'idle' | 'loading' | 'done' | 'error'. While loading, total is how
// many files are being downloaded (0 while still checking) and done how many
// have finished.
export const examplesState = reactive({source: SOURCE_URL, entries: [], status: 'idle', message: '', done: 0, total: 0});

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

// The fields shown on an example's card and in its popup, read from the
// project file's configuration (the Project tab's settings) plus its screenshot.
const summarize = (name, text) => {
  let project = null;
  try {
    project = YAML.parse(text);
  } catch (e) {
    console.error(`Could not read example ${name}`, e);
  }
  const configuration = (project && project.configuration) || {};
  return {
    screenshot: (project && project.screenshot) || null,
    title: configuration.projectTitle || '',
    developer: configuration.projectDeveloper || '',
    version: configuration.projectVersion || '',
    website: configuration.projectWebsite || '',
    email: configuration.projectEmail || '',
    description: configuration.projectDescription || '',
  };
};

// The kernel an example was made for. Read from the file's text each time rather than kept in the stored summary,
// so examples downloaded before this existed get one too; a project saved before the kernel option existed is Standard.
const kernelOf = (text) => {
  try {
    const project = YAML.parse(text);
    return ((project && project.configuration) || {}).kernel === 'dpcplus' ? 'dpcplus' : 'standard';
  } catch (e) {
    return 'standard';
  }
};

const toEntry = (record) => ({
  name: record.name,
  text: record.text,
  ...record.summary,
  kernel: kernelOf(record.text),
});

const sortEntries = (entries) => entries.sort((a, b) => a.name.localeCompare(b.name));

const showCached = async () => {
  const records = (await readEverything()).filter((record) => record.source === SOURCE_KEY);
  examplesState.entries = sortEntries(records.map(toEntry));
  return records;
};

const listRemoteFiles = async () => {
  const {owner, repo, branch, path} = EXAMPLES_SOURCE;
  const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/contents/${path}?ref=${encodeURIComponent(branch)}`,
      // no-cache: the API marks listings cacheable for a minute, which kept a
      // just-changed folder from showing up on a quick reload. This still
      // revalidates cheaply (an unchanged folder answers 304).
      {headers: {Accept: 'application/vnd.github+json'}, cache: 'no-cache'});
  // The folder not existing (yet) just means there are no examples.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
  const listing = await response.json();
  return listing.filter((item) => item.type === 'file' && /\.vcsgm$/i.test(item.name));
};

let started = false;

// Runs once per page load (further calls do nothing). Shows whatever is
// already stored straight away, then checks GitHub for new, changed and
// removed files. A failed check (offline, rate limited) leaves the stored
// copies as they are.
export const syncExamples = async () => {
  if (started) return;
  started = true;
  examplesState.status = 'loading';
  let cached = [];
  try {
    cached = await showCached();
  } catch (e) {
    console.error('Could not read the stored examples', e);
  }
  try {
    const remote = await listRemoteFiles();
    const cachedByName = new Map(cached.map((record) => [record.name, record]));
    const toDownload = remote.filter((file) => {
      const existing = cachedByName.get(file.name);
      return !existing || existing.sha !== file.sha;
    });
    examplesState.done = 0;
    examplesState.total = toDownload.length;
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
      examplesState.done += 1;
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
    examplesState.total = 0;
    examplesState.status = 'done';
    examplesState.message = '';
  } catch (e) {
    console.error('Could not check for example updates', e);
    examplesState.total = 0;
    examplesState.status = 'error';
    examplesState.message = String((e && e.message) || e);
    await showCached().catch(() => {});
  }
};
