import {encodeSpeech} from './speakjet';
import {BUILTIN_DICTIONARY} from './speakjet-dictionary-data';

// The dictionaries of the text to speech: words with the SpeakJet words that say them ("WORD = SpeakJet words", the way the pronunciations of
// the Text tab are written). Looked up in this order, the first that has the word says it:
//   1. the project's pronunciations (the Text tab's list),
//   2. the dictionary of the project (the words of the dictionary files imported on the Vox tab, kept with the project),
//   3. the built-in dictionary (see speakjet-dictionary-data.js, the PhraseALator dictionary),
//   4. the large dictionary, when it was downloaded (see hooks/largedictionary.js),
// and a word that none has is said as the letter-to-sound rules make it (see speakjet-text.js).

// The key of a word: upper case, with no apostrophes.
const keyOf = (word) => String(word).toUpperCase().replace(/'/g, '');

// A list of lines ("WORD = words" or "WORD: words") as a Map from the word to its SpeakJet words.
export const parseDictionaryLines = (text) => {
  const map = new Map();
  String(text || '').split(/\r?\n/).forEach((line) => {
    const found = /^\s*([A-Za-z']+)\s*[=:]\s*(.+?)\s*$/.exec(line);
    if (found) map.set(keyOf(found[1]), found[2].toUpperCase());
  });
  return map;
};

let builtin = null;
// The built-in dictionary as a Map (made the first time it is asked for).
export const builtinDictionary = () => {
  if (!builtin) builtin = parseDictionaryLines(BUILTIN_DICTIONARY);
  return builtin;
};

// The dictionary text of a project, as a Map, kept until the text changes.
let projectCache = {text: null, map: null};
const projectDictionary = (text) => {
  if (projectCache.text !== text) projectCache = {text, map: parseDictionaryLines(text)};
  return projectCache.map;
};

// The large dictionary: a .Dic file kept as its text, and made a Map the first time a word is looked up (it has over a hundred thousand words).
let downloaded = {text: '', map: null, entries: null};
export const setDownloadedDictionary = (text) => {
  downloaded = {text: text || '', map: null, entries: null};
};
const downloadedDictionary = () => {
  if (!downloaded.map) {
    const map = new Map();
    downloaded.text.split(/\r?\n/).forEach((line) => {
      const found = /^\s*([A-Za-z']+)\s*=\s*(.+?)\s*$/.exec(line);
      if (!found) return;
      const words = found[2].split(/[\s\\]+/).filter(Boolean).map((word) => word.toUpperCase()).map((word) => FILE_NAMES[word] || word).join(' ');
      map.set(keyOf(found[1]), words);
    });
    downloaded.map = map;
  }
  return downloaded.map;
};

// The words of the large dictionary as a list of [word, SpeakJet words] in the order of the alphabet, made once; empty when it has not
// been downloaded.
export const downloadedDictionaryEntries = () => {
  if (!downloaded.text) return [];
  if (!downloaded.entries) downloaded.entries = [...downloadedDictionary()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  return downloaded.entries;
};

// What the words are looked up in for a project: `has(word)` and `get(word)` like a Map, over the layers above. `strings` is the text strings
// storage (its `pronunciations` is the Text tab's list and its `dictionary` the imported words).
export const pronunciationsFor = (strings) => {
  const layers = [parseDictionaryLines((strings || {}).pronunciations), projectDictionary((strings || {}).dictionary || ''), builtinDictionary()];
  if (downloaded.text) layers.push(downloadedDictionary());
  return {
    has: (word) => layers.some((layer) => layer.has(word)),
    get: (word) => (layers.find((layer) => layer.has(word)) || new Map()).get(word),
  };
};

// How the PhraseALator file names what the app names otherwise (a pause of that length, a diphthong spelled differently).
const FILE_NAMES = {EHLE: 'EHLL', P1: 'PAUSE100', P2: 'PAUSE200', P3: 'PAUSE700', P4: 'PAUSE30', P5: 'PAUSE60', P6: 'PAUSE90', P0: '#0'};
const FILE_NAMES_BACK = {'EHLL': 'EHLE', 'PAUSE100': 'P1', 'PAUSE1000': 'P1', 'PAUSE200': 'P2', 'PAUSE700': 'P3', 'PAUSE30': 'P4', 'PAUSE60': 'P5', 'PAUSE90': 'P6', '#0': 'P0'};
// The words that are followed by a number.
const NUMBER_WORDS = new Set(['VOLUME', 'SPEED', 'PITCH', 'BEND', 'DELAY']);

// The words of a dictionary file, as lines for the project's dictionary: a PhraseALator (.Dic) file (a word per line, the SpeakJet words written
// with a backslash before each: "word = \AY \EK \TT"), or lines in the app's way ("WORD = AY EK TT"). A line whose words the app does not
// understand (the sound effect scripts of a PhraseALator file, plain words) is left out. Returns {lines, count, skipped}.
export const dictionaryFromFile = (text) => {
  const lines = [];
  let skipped = 0;
  String(text || '').split(/\r?\n/).forEach((line) => {
    if (/^\s*(\[.*\]\s*)?$/.test(line)) return;
    const found = /^\s*([A-Za-z']+)\s*[=:]\s*(.+?)\s*$/.exec(line);
    if (!found || /^fx/i.test(found[1])) {
      skipped += 1;
      return;
    }
    // (The SOFT of a PhraseALator file has no code in the chip's list of the app: it is left out of the word.)
    const words = found[2].split(/[\s\\,]+/).filter(Boolean).map((word) => word.toUpperCase()).map((word) => FILE_NAMES[word] || word)
        .filter((word) => word !== 'SOFT').join(' ');
    if (!words || encodeSpeech(words).unknown.length) {
      skipped += 1;
      return;
    }
    lines.push(`${keyOf(found[1])} = ${words}`);
  });
  return {lines, count: lines.length, skipped};
};

// The project's dictionary text with these lines added: a word that is already in it is said the new way.
export const mergeDictionary = (text, lines) => {
  const merged = parseDictionaryLines(text);
  parseDictionaryLines(lines.join('\n')).forEach((words, word) => merged.set(word, words));
  return [...merged].map(([word, words]) => `${word} = ${words}`).join('\n');
};

// The whole dictionary of a project as text: the built-in words with the words of the project over them, in the order of the alphabet.
export const fullDictionaryText = (text) => {
  const merged = new Map(builtinDictionary());
  parseDictionaryLines(text).forEach((words, word) => merged.set(word, words));
  return [...merged].sort((a, b) => a[0].localeCompare(b[0])).map(([word, words]) => `${word} = ${words}`).join('\n');
};

// The project's dictionary text with one word set (said the new way) or, with no words, taken out.
export const setDictionaryWord = (text, word, words) => {
  const map = parseDictionaryLines(text);
  if (words) map.set(keyOf(word), String(words).toUpperCase().trim());
  else map.delete(keyOf(word));
  return [...map].map(([key, value]) => `${key} = ${value}`).join('\n');
};

// The words of the SpeakJet that the app does not understand in some words ('' when they are all fine).
export const unknownDictionaryWords = (words) => encodeSpeech(words).unknown.join(' ');

// The project's dictionary as a PhraseALator (.Dic) file.
export const dictionaryToFile = (text) => {
  const lines = ['[words]'];
  parseDictionaryLines(text).forEach((words, word) => {
    const tokens = words.split(/\s+/).filter(Boolean);
    const written = tokens.map((token, index) => {
      if (/^\d+$/.test(token) && NUMBER_WORDS.has(tokens[index - 1])) return `\\${token}`;
      return `\\${FILE_NAMES_BACK[token] || token}`;
    });
    lines.push(`${word.toLowerCase()} = ${written.join(' ')}`);
  });
  return `${lines.join('\r\n')}\r\n`;
};

// How many words a dictionary text has.
export const dictionaryWordCount = (text) => parseDictionaryLines(text).size;
