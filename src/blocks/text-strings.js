'use strict';

import {useTextStringsStorage} from '../hooks/project';

// Matches text12b.asm's TextPointersLoop, which always reads exactly 12
// bytes starting at TextIndex - every stored message is fixed at this width
// (see encodeTextMessage in generators/bbasic/text-minikernel.js).
export const TEXT_MESSAGE_LENGTH = 12;

// How a message's own padding (see encodeTextMessage in
// generators/bbasic/text-minikernel.js) is split across the 12-character
// row - 'left' (all padding on the right, the original/default behavior),
// 'center' (padding split across both sides), or 'right' (all padding on
// the left).
export const TEXT_JUSTIFY_OPTIONS = ['left', 'center', 'right'];
export const DEFAULT_TEXT_JUSTIFY = 'left';

export const DEFAULT_TEXT_STRINGS = {
  textStrings: [
    {
      id: 1,
      name: 'Example message',
      text: 'HELLO WORLD!',
      justify: DEFAULT_TEXT_JUSTIFY,
    },
  ],
};

export const processTextStringsStorageDefaults = (textStringsStorage) => {
  const textStrings = textStringsStorage.value;
  if (!textStrings || !textStrings.textStrings || !textStrings.textStrings.length) {
    return structuredClone(DEFAULT_TEXT_STRINGS);
  }
  // Entries saved before Justify existed won't have it yet - including ones
  // saved with the short-lived boolean "Center" checkbox this replaced,
  // which never shipped as a release so isn't worth its own migration path.
  textStrings.textStrings.forEach((entry) => {
    if (!TEXT_JUSTIFY_OPTIONS.includes(entry.justify)) entry.justify = DEFAULT_TEXT_JUSTIFY;
  });
  return textStrings;
};

// Read the text strings afresh rather than through the module level storage:
// that is a computed over localStorage, which is not reactive, so it caches
// the first value it ever read and would keep serving stale names.
export const buildTextStringOptions = () => {
  try {
    const data = processTextStringsStorageDefaults(useTextStringsStorage());
    if (!data.textStrings.length) return [['(none defined - add one on the Text tab)', '0']];
    return data.textStrings.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list text string options', e);
    return [['Error', '0']];
  }
};

// Looks up one stored text string by id, or null if it can't be found (e.g.
// a block still references one that was since deleted).
export const findTextStringById = (id) => {
  try {
    const data = processTextStringsStorageDefaults(useTextStringsStorage());
    return data.textStrings.find((entry) => `${entry.id}` === `${id}`) || null;
  } catch (e) {
    console.error('Failed to load text string', e);
    return null;
  }
};

// Every stored text string, in the same order shown on the Text tab - the
// order "Show text with ID"'s runtime number counts against (see
// generators/bbasic/text-minikernel.js), so a raw compile-time reference
// (dropdown) and a runtime one (a variable holding a typed-in number) always
// agree on which message a given position means.
export const listTextStrings = () => {
  try {
    return processTextStringsStorageDefaults(useTextStringsStorage()).textStrings;
  } catch (e) {
    console.error('Failed to list text strings', e);
    return [];
  }
};
