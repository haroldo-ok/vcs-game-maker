'use strict';

import Vue from 'vue';

import {useConfigurationStorage, useTextStringsStorage} from '../hooks/project';

// Matches text12b.asm's TextPointersLoop, which always reads exactly 12
// bytes starting at TextIndex, unconditionally - a hard hardware ceiling
// baked into that hand-tuned, cycle-counted routine, not something this app
// can raise. Every message's own STORED row is still exactly this wide
// regardless of the project's own configured max display width below (a
// narrower setting only blanks out the unused tail, it never shrinks
// storage - see encodeTextMessage in generators/bbasic/text-minikernel.js).
export const TEXT_MESSAGE_LENGTH = 12;

// How many of TEXT_MESSAGE_LENGTH's own 12 positions a project actually
// wants to USE at once - a project-wide, compile-time-only setting (see
// TextEditor.vue's own dropdown), never runtime-adjustable: letting it
// change at runtime would mean a message's own padding/justification could
// no longer be baked in at compile time the way it is now, and would need
// an extra RAM scratch buffer + per-display reformatting instead of
// reading straight from ROM - real added cost for a feature nobody asked
// for once "just clip statically" covered the actual need. Positions from
// this value up to TEXT_MESSAGE_LENGTH-1 are always left blank, in every
// message, regardless of that message's own justify setting - "only the
// first N slots are ever used" applies literally, not just to where the
// text happens to sit within them.
export const TEXT_MAX_DISPLAY_WIDTH_OPTIONS =
  Array.from({length: TEXT_MESSAGE_LENGTH}, (_, i) => i + 1);
export const DEFAULT_TEXT_MAX_DISPLAY_WIDTH = TEXT_MESSAGE_LENGTH;

// How a message's own padding (see encodeTextMessage in
// generators/bbasic/text-minikernel.js) is split across the 12-character
// row - 'left' (all padding on the right, the original/default behavior),
// 'center' (padding split across both sides), or 'right' (all padding on
// the left).
export const TEXT_JUSTIFY_OPTIONS = ['left', 'center', 'right'];
export const DEFAULT_TEXT_JUSTIFY = 'left';

// Read fresh every call (same reasoning as listTextStrings below - a
// computed over localStorage isn't reactive) rather than cached. Clamped to
// 1..TEXT_MESSAGE_LENGTH so a corrupt/out-of-range stored value (or one from
// a hypothetical future version with a wider option list) can never produce
// a negative pad count or blank out the whole row.
export const resolveTextMaxDisplayWidth = () => {
  try {
    const value = Number((useConfigurationStorage().value || {}).textMaxDisplayWidth);
    if (!Number.isFinite(value)) return DEFAULT_TEXT_MAX_DISPLAY_WIDTH;
    return Math.max(1, Math.min(TEXT_MESSAGE_LENGTH, Math.round(value)));
  } catch (e) {
    console.error('Error loading configuration from local storage', e);
    return DEFAULT_TEXT_MAX_DISPLAY_WIDTH;
  }
};

// Maps each supported character to the glyph constant name declared in
// text12a.asm/text12b.asm's left_text/right_text tables. Anything not
// listed here (lowercase letters get upper-cased first) falls back to a
// blank space rather than failing the build. Lives here (not in
// generators/bbasic/text-minikernel.js, where every OTHER encoding
// function using it does) so generators/bbasic/text-scroll.js can share it
// too without an import cycle between those two generator files.
export const CHAR_TO_GLYPH = {
  'A': '__A', 'B': '__B', 'C': '__C', 'D': '__D', 'E': '__E', 'F': '__F',
  'G': '__G', 'H': '__H', 'I': '__I', 'J': '__J', 'K': '__K', 'L': '__L',
  'M': '__M', 'N': '__N', 'O': '__O', 'P': '__P', 'Q': '__Q', 'R': '__R',
  'S': '__S', 'T': '__T', 'U': '__U', 'V': '__V', 'W': '__W', 'X': '__X',
  'Y': '__Y', 'Z': '__Z',
  '0': '__0', '1': '__1', '2': '__2', '3': '__3', '4': '__4',
  '5': '__5', '6': '__6', '7': '__7', '8': '__8', '9': '__9',
  ' ': '_sp', '.': '_pd', '?': '_qu', '!': '_ex', ',': '_cm', '-': '_hy',
  '+': '_pl', '\'': '_ap', '(': '_lp', ')': '_rp', ':': '_co', '/': '_sl',
  '=': '_eq', '"': '_qt', '#': '_po',
};

export const DEFAULT_TEXT_STRINGS = {
  textStrings: [
    {
      id: 1,
      name: 'Example message',
      text: 'HELLO WORLD!',
      justify: DEFAULT_TEXT_JUSTIFY,
      wrapToLine2: false,
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
    // Entries saved before "Wrap to line 2" existed won't have this field -
    // defaults to off, matching every message's own pre-existing single-row
    // behavior exactly (see encodeTextMessageLines in
    // generators/bbasic/text-minikernel.js). Vue.set, not a plain
    // assignment: `entry` here is very often the SAME object useLocalStorage
    // has already made reactive (see hooks/storage.js's shared, memoized
    // ref) from an EXISTING saved project's JSON, which never had this key
    // at all - Vue 2's reactivity can't detect a brand new property added to
    // an already-observed object via plain assignment (the classic "Vue
    // cannot detect property addition" caveat), so TextEditor.vue's own
    // ":counter" binding (which reads entry.wrapToLine2) silently never
    // updated on toggle - confirmed as a real reported bug ("it should
    // update the character count without selecting another text card").
    // Vue.set is safe here even when `entry` isn't reactive yet (a brand
    // new project's freshly-cloned DEFAULT_TEXT_STRINGS, still plain JS at
    // this point) - it just falls back to a plain assignment in that case.
    if (typeof entry.wrapToLine2 !== 'boolean') Vue.set(entry, 'wrapToLine2', false);
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

// Every stored text string, sorted by its own permanent id - NOT the order
// shown on the Text tab (see TextEditor.vue's own drag-reorder, which only
// ever touches display order, reading state.textStrings directly rather
// than through this function). "Show text with ID"'s runtime number counts
// positions in THIS id-sorted order (see generators/bbasic/
// text-minikernel.js, both for the compiled data table's own row order and
// namedMessagePosition's lookup), so a raw compile-time reference
// (dropdown) and a runtime one (a variable holding a typed-in number)
// always agree on which message a given position means, and neither one
// shifts just because a card got dragged to a new spot in the editor.
export const listTextStrings = () => {
  try {
    return processTextStringsStorageDefaults(useTextStringsStorage())
        .textStrings.slice().sort((a, b) => a.id - b.id);
  } catch (e) {
    console.error('Failed to list text strings', e);
    return [];
  }
};
