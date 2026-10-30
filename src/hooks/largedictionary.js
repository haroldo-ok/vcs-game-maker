import {reactive} from '@vue/composition-api';
import {SOUND_BANKS_SOURCE} from './soundbanks';
import {setDownloadedDictionary} from '../utils/speakjet-dictionary';

// The large dictionary of the text to speech (CMU.Dic, about 122,000 words, converted from the CMU Pronouncing Dictionary) is an optional
// download from the dictionaries folder of the content repo (the same repo as the sound banks, see hooks/soundbanks.js). It is kept in this
// browser's IndexedDB, not in the project, and read when the page opens; its words are said after the project's and the built-in dictionary's and
// before the letter-to-sound rules (see utils/speakjet-dictionary.js).
const {owner, repo, branch} = SOUND_BANKS_SOURCE;
const FILE_URL = `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/dictionaries/CMU.Dic`;
const DB_NAME = 'vcs-game-maker-largedictionary';
const STORE_NAME = 'files';
const KEY = 'CMU.Dic';

// How many words CMU.Dic has (shown before it is downloaded).
export const LARGE_DICTIONARY_WORDS = 121735;

// The size of CMU.Dic in bytes (the progress of the download is how much of it has come).
const LARGE_DICTIONARY_BYTES = 4616229;

// status: 'none' | 'downloading' | 'ready' | 'error'; progress is a number from 0 to 100 while downloading
export const largeDictionaryState = reactive({status: 'none', words: 0, message: '', progress: 0});

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

const use = (text) => {
  setDownloadedDictionary(text);
  largeDictionaryState.words = text ? Math.max(0, text.split('\n').length - 2) : 0;
  largeDictionaryState.status = text ? 'ready' : 'none';
};

// Reads the stored copy (when the page opens).
export const loadLargeDictionary = async () => {
  try {
    const request = await runTransaction('readonly', (store) => store.get(KEY));
    if (request.result && request.result.text) use(request.result.text);
  } catch (e) {
    console.error('Could not read the stored large dictionary', e);
  }
};

export const downloadLargeDictionary = async () => {
  largeDictionaryState.status = 'downloading';
  largeDictionaryState.message = '';
  largeDictionaryState.progress = 0;
  try {
    const response = await fetch(FILE_URL);
    if (!response.ok) throw new Error(`GitHub returned ${response.status}`);
    // Read it in pieces to show how far it is. (The size of the file is known, as the length of the response may be the compressed one.)
    const chunks = [];
    let loaded = 0;
    if (response.body && response.body.getReader) {
      const reader = response.body.getReader();
      for (;;) {
        const {done, value} = await reader.read();
        if (done) break;
        chunks.push(value);
        loaded += value.length;
        largeDictionaryState.progress = Math.min(99, Math.round(100 * loaded / LARGE_DICTIONARY_BYTES));
      }
    } else {
      chunks.push(new Uint8Array(await response.arrayBuffer()));
    }
    const decoder = new TextDecoder();
    const text = chunks.map((chunk, index) => decoder.decode(chunk, {stream: index < chunks.length - 1})).join('');
    await runTransaction('readwrite', (store) => store.put({key: KEY, text}));
    use(text);
  } catch (e) {
    console.error('Could not download the large dictionary', e);
    largeDictionaryState.status = 'error';
    largeDictionaryState.message = String((e && e.message) || e);
  }
};

export const removeLargeDictionary = async () => {
  try {
    await runTransaction('readwrite', (store) => store.delete(KEY));
  } catch (e) {
    console.error('Could not remove the large dictionary', e);
  }
  use('');
};
