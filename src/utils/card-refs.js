import * as Blockly from 'blockly/core';

import {useDataTablesStorage, useSongsStorage, useWorkspaceStorage} from '../hooks/project';
import {remapAnimationReferences} from './animation-refs';
import {remapBackgroundReferences} from './background-refs';
import {beginCardDelete, recordCardDelete} from '../hooks/delete-history';

// Cards (data tables, title screens and the cards in them, backgrounds, sounds, songs, text messages and sprite animations) are
// numbered by their place in the list on their tab: 1, 2, 3... (What refers to a sprite animation holds its place counted from 0,
// which is what the game compares with: see animation-refs.js.) Dragging a card to another place or deleting one renumbers the
// cards that follow, and what refers to a card by its number has to follow it. This is that, in one place, for every kind of card:
// - the Actions tab's blocks: every dropdown that lists the cards of a kind (the option list function was marked with
//   cardOptions(kind, ...), so a block added later that uses one is found without being listed here), and the few number sockets that
//   take a card's number;
// - the cells of the data tables whose format names the kind of card;
// - what other tabs keep that names a card (the instrument of a song's track, the animation of a title screen's player card).
// A reference to a card that was deleted becomes 0 (nothing), so it never ends up on another card. Whatever ends up holding a number
// when the game runs (a variable, a calculation) can't be followed here.

// What a number map (old number -> new number) holds for a card that is gone.
export const REMOVED = -1;

// What a data table cell's format is called for each kind of card.
const CELL_FORMAT = {
  datatable: 'datatable',
  sound: 'sound',
  music: 'music',
  text: 'text',
  titlescreen: 'titlescreen',
  background: 'background',
};

// Marks an option list function (the one a block's FieldDropdown is made from) as listing the cards of a kind: 'datatable', 'sound',
// 'music', 'text', 'titlescreen', 'titlecard' (options valued "screen:card") or 'background'.
export const cardOptions = (kind, builder) => {
  builder.cardKind = kind;
  return builder;
};

// What holds a card's number apart from the dropdowns: a number plugged straight into an input ("input"), or a number field
// ("field"). position: the number is the place of the card in the list, not its id (the same for cards numbered by their places).
const NUMBER_REFS = {
  datatable: [
    {type: 'data_table_size_by_id', input: 'TABLE_ID'},
    {type: 'data_get_element_by_id', input: 'TABLE_ID'},
    {type: 'data_get_bit_by_id', input: 'TABLE_ID'},
  ],
  music: [
    {type: 'music_play_song_by_id', input: 'SONG_ID'},
    {type: 'music_song_playing_by_number', input: 'SONG_ID'},
    {type: 'music_song_stopped_by_number', input: 'SONG_ID'},
  ],
  sound: [{type: 'music_note_played_by_id', field: 'INSTRUMENT_ID'}],
  text: [
    {type: 'text_minikernel_show_by_id', input: 'VALUE', position: true},
    {type: 'text_minikernel_show_by_id_scroll', input: 'VALUE', position: true},
  ],
};

let dropdownFields = null;
// {kind: [{type, field}]} for every block type that has a dropdown marked with cardOptions. Found by making each block type once in an
// empty workspace and looking at its fields.
const dropdownFieldsOf = (kind) => {
  if (!dropdownFields) {
    dropdownFields = {};
    const scratch = new Blockly.Workspace();
    Object.keys(Blockly.Blocks).forEach((type) => {
      let block = null;
      try {
        block = scratch.newBlock(type);
      } catch (e) {
        return;
      }
      block.inputList.forEach((input) => input.fieldRow.forEach((field) => {
        const kindOfField = field instanceof Blockly.FieldDropdown && field.menuGenerator_ && field.menuGenerator_.cardKind;
        if (kindOfField) (dropdownFields[kindOfField] = dropdownFields[kindOfField] || []).push({type, field: field.name});
      }));
      block.dispose();
    });
    scratch.dispose();
  }
  return dropdownFields[kind] || [];
};

// The new number of a stored value (a number or a numeric string, kept as it was), or the value itself when it is not renumbered.
const mapped = (value, idMap) => {
  if (value === '' || value === null || value === undefined) return value;
  const found = idMap.get(Number(value));
  if (found === undefined) return value;
  const next = found === REMOVED ? 0 : found;
  return typeof value === 'string' ? String(next) : next;
};

// "screen:card" with the screen and card numbers renumbered the way the maps say (a map left out keeps its numbers).
const mappedCardRef = (value, screenMap, cardMap) => {
  const match = /^(\d+):(\d+)$/.exec(`${value}`);
  if (!match) return value;
  const screen = screenMap ? screenMap.get(Number(match[1])) : Number(match[1]);
  if (screen === undefined) return value;
  const card = cardMap ? cardMap.get(Number(match[2])) : Number(match[2]);
  if (card === undefined) return value;
  // A card (or its whole screen) that was deleted: nothing.
  return screen === REMOVED || card === REMOVED ? '' : `${screen}:${card}`;
};

const directChildren = (element, tagName) => [...element.children].filter((child) => child.tagName === tagName);

// Rewrites the saved Actions workspace (an XML string): the Actions tab is not on screen while cards are rearranged, and loads from this
// when it next opens. mapField(text) returns the new text of a dropdown; numberRefs (see NUMBER_REFS) are the inputs and number fields
// that hold a number by themselves, mapNumber(number, ref) the new number. Returns whether anything changed.
const rewriteWorkspace = (fieldRefs, mapField, numberRefs = [], mapNumber = null) => {
  const storage = useWorkspaceStorage();
  const text = storage.value;
  if (!text || text === 'null') return false;
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return false;
  let changed = false;
  const wanted = new Set(fieldRefs.map(({type, field}) => `${type}|${field}`));
  const setText = (element, next) => {
    if (next !== element.textContent) {
      element.textContent = next;
      changed = true;
    }
  };
  [...doc.getElementsByTagName('block'), ...doc.getElementsByTagName('shadow')].forEach((block) => {
    const type = block.getAttribute('type');
    directChildren(block, 'field').forEach((field) => {
      const name = field.getAttribute('name');
      if (wanted.has(`${type}|${name}`)) setText(field, mapField(field.textContent));
      numberRefs.filter((ref) => ref.type === type && ref.field === name)
          .forEach((ref) => setText(field, String(mapNumber(Number(field.textContent), ref))));
    });
    numberRefs.filter((ref) => ref.type === type && ref.input).forEach((ref) => {
      directChildren(block, 'value').filter((value) => value.getAttribute('name') === ref.input).forEach((value) => {
        [...value.children].filter((child) => child.getAttribute('type') === 'math_number').forEach((number) => {
          directChildren(number, 'field').filter((field) => field.getAttribute('name') === 'NUM')
              .forEach((field) => setText(field, String(mapNumber(Number(field.textContent), ref))));
        });
      });
    });
  });
  if (changed) storage.value = new XMLSerializer().serializeToString(doc);
  return changed;
};

// The cells of the data tables whose format is the given one hold a card's number. Changed in place (the tables are the same objects
// the Data tab shows, which keeps the cells of the tables it holds in step when it renumbers the tables themselves).
const rewriteDataTableCells = (format, mapValue) => {
  const storage = useDataTablesStorage();
  const tables = storage.value && storage.value.dataTables;
  if (!tables) return false;
  let changed = false;
  tables.forEach((table) => {
    if (!table.valueFormats || !table.values) return;
    table.values.forEach((value, index) => {
      if (table.valueFormats[index] !== format) return;
      const result = mapValue(value);
      if (result === value) return;
      table.values.splice(index, 1, result);
      changed = true;
    });
  });
  if (changed) storage.value = storage.value;
  return changed;
};

// Songs keep the sound each track plays as an instrument.
const rewriteSongInstruments = (idMap) => {
  const storage = useSongsStorage();
  const songs = storage.value && storage.value.songs;
  if (!songs) return false;
  let changed = false;
  songs.forEach((song) => (song.patterns || []).forEach((pattern) => (pattern.tracks || []).forEach((track) => {
    if (track.soundEffectId === null || track.soundEffectId === undefined) return;
    const next = mapped(track.soundEffectId, idMap);
    if (next !== track.soundEffectId) {
      track.soundEffectId = next;
      changed = true;
    }
  })));
  if (changed) storage.value = {...storage.value, songs};
  return changed;
};

// The kinds that are plain numbers (not counted from 0 like animations, not "screen:card").
const plainKinds = ['datatable', 'sound', 'music', 'text'];

// Points everything that refers to the cards of a kind at their new numbers. idMap: old number -> new number (0 for a card that was
// deleted). For the cards of a title screen, screenId says which screen the cards are in. Returns nothing.
export const remapCardReferences = (kind, idMap, {screenId, positionMap = null} = {}) => {
  if (kind === 'background') {
    remapBackgroundReferences(new Map([...idMap].map(([from, to]) => [from, to === REMOVED ? 0 : to])));
  } else if (kind === 'titlecard') {
    const screen = new Map([[screenId, screenId]]);
    rewriteWorkspace(dropdownFieldsOf('titlecard'), (text) => {
      const match = /^(\d+):/.exec(text);
      return match && Number(match[1]) === screenId ? mappedCardRef(text, screen, idMap) : text;
    });
  } else if (kind === 'titlescreen') {
    rewriteWorkspace(dropdownFieldsOf('titlescreen'), (text) => {
      const next = mapped(text, idMap);
      return next === 0 || next === '0' ? '' : String(next);
    });
    rewriteWorkspace(dropdownFieldsOf('titlecard'), (text) => mappedCardRef(text, idMap, null));
    rewriteDataTableCells(CELL_FORMAT.titlescreen, (value) => mapped(value, idMap));
  } else if (plainKinds.includes(kind)) {
    // A number that is the place of a card (not its id) follows the places when they are known.
    rewriteWorkspace(dropdownFieldsOf(kind), (text) => String(mapped(text, idMap)), NUMBER_REFS[kind] || [],
        (number, ref) => mapped(number, ref.position && positionMap ? positionMap : idMap));
    rewriteDataTableCells(CELL_FORMAT[kind], (value) => mapped(value, idMap));
    if (kind === 'sound') rewriteSongInstruments(idMap);
  }
};

// A map from the numbers the cards have to the ones their places give them (1, 2, 3...), or null when every card already has the
// number of its place. removed: the numbers of cards that are no longer in the list, which refer to nothing from now on (REMOVED).
const idMapOf = (items, removed = []) => {
  const idMap = new Map(items.map((item, index) => [item.id, index + 1]));
  removed.forEach((id) => idMap.set(id, REMOVED));
  return items.every((item, index) => item.id === index + 1) && !removed.length ? null : idMap;
};

// Numbers the cards by their place and points what refers to them at the new numbers. items: the cards, in their new order, with the
// ids they had; removed: the ids of cards taken out of the list. Returns the map from old to new numbers (null when nothing moved),
// for the UI state a tab keeps by id (collapsed cards, selection).
export const renumberCards = (kind, items, {removed = [], screenId, previous = null} = {}) => {
  // The animations are referred to by their place in the list, not by the number on the card: the places before and after say what
  // moved, and what was deleted keeps its place for whatever followed it (there is no "nothing" among the places).
  // Their numbers count from 0, so the number on a card is the place the blocks and cells hold.
  if (kind === 'animation') {
    const before = previous || items;
    const animationMap = new Map(before.map((item) => [item.id, items.includes(item) ? items.indexOf(item) : REMOVED]));
    const compact = items.every((item, index) => item.id === index);
    if (previous) remapAnimationReferences(previous, items);
    if (compact && before.every((item, index) => items[index] === item)) return null;
    items.forEach((item, index) => {
      item.id = index;
    });
    return animationMap;
  }
  const idMap = idMapOf(items, removed);
  if (!idMap) return null;
  // Where each card was in the list (counted from 1) and is now, for what holds a place: 0 for a card that is gone.
  const positionMap = previous ?
    new Map(previous.map((item, index) => [index + 1, items.includes(item) ? items.indexOf(item) + 1 : REMOVED])) : null;
  remapCardReferences(kind, idMap, {screenId, positionMap});
  items.forEach((item, index) => {
    item.id = index + 1;
  });
  return idMap;
};

// The cards of a list without the ones in doomed (their ids), numbered by their new places, with what referred to the ones taken out
// pointing at nothing. Returns {remaining, idMap} (idMap is null when no number changed).
export const removeCards = (kind, items, doomed, {screenId} = {}) => {
  const before = beginCardDelete();
  const remaining = items.filter(({id}) => !doomed.includes(id));
  const idMap = renumberCards(kind, remaining, {removed: doomed, screenId, previous: items.slice()});
  recordCardDelete(before);
  return {remaining, idMap};
};

// A copy put in the list right after the card it was copied from, with everything after it numbered again. Returns the map from old
// to new numbers (null when nothing moved).
export const insertCardAfter = (kind, items, source, copy, {screenId} = {}) => {
  copy.id = items.reduce((highest, item) => Math.max(highest, item.id), 0) + 1;
  const previous = items.slice();
  items.splice(items.indexOf(source) + 1, 0, copy);
  return renumberCards(kind, items, {screenId, previous});
};

// What a tab keeps by card number (an object keyed by it: undo history, a selected value), with the keys of the cards that were
// numbered again changed to the new numbers. idMap: old number -> new number (0 for a card that is gone).
export const remapKeyed = (keyed, idMap) => {
  const next = {};
  Object.keys(keyed).forEach((key) => {
    if (!idMap.has(Number(key))) return;
    const id = idMap.get(Number(key));
    if (id !== REMOVED) next[id] = keyed[key];
  });
  Object.keys(keyed).forEach((key) => {
    if (!idMap.has(Number(key)) && !(key in next)) next[key] = keyed[key];
  });
  return next;
};
