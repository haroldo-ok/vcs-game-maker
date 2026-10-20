import {useDataTablesStorage, useTitleScreenStorage, useWorkspaceStorage} from '../hooks/project';

// What refers to a sprite animation by its number (its place in the list on the Sprites tab), and so has to change when the animations
// are put in another order or one is deleted (see PlayerEditor.vue):
// - the Actions tab's blocks that pick an animation: "set animation to [select]" (sprite_player_set_animation), the "animation"
//   value block (sprite_player_animation_select), and a plain number plugged straight into a block that sets a player's animation
//   (sprite_player_set with Animation picked) or "set animation to ID"
// - Data table cells whose format is Sprite animation
// - The animations the Player 0 and Player 1 cards of a title screen play
// Anything else that ends up holding an animation number when the game runs (a variable, a calculation) can't be followed here.

const WORKSPACE_FIELDS = {
  sprite_player_set_animation: 'VAR',
  sprite_player_animation_select: 'VAR',
};

// Old place -> new place of every animation that is still there, from the lists before and after (each animation has an id).
export const animationIndexMap = (before, after) => {
  const map = new Map();
  (before || []).forEach((animation, oldIndex) => {
    const newIndex = (after || []).findIndex((other) => other.id === animation.id);
    if (newIndex >= 0) map.set(oldIndex, newIndex);
  });
  return map;
};

const directChildren = (element, tagName) => [...element.children].filter((child) => child.tagName === tagName);

// Rewrites the saved Actions workspace (an XML string): the Actions tab is not on screen while the animations are changed, and loads from
// this when it next opens. Returns whether anything changed.
export const remapWorkspaceAnimationIndices = (indexMap) => {
  const storage = useWorkspaceStorage();
  const text = storage.value;
  if (!text || text === 'null') return false;
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return false;
  let changed = false;
  const setField = (field) => {
    const old = Number(field.textContent);
    if (!indexMap.has(old) || indexMap.get(old) === old) return;
    field.textContent = String(indexMap.get(old));
    changed = true;
  };
  const numberInValue = (block, valueName) => directChildren(block, 'value').filter((value) => value.getAttribute('name') === valueName)
      .forEach((value) => {
        [...value.children].filter((child) => child.getAttribute('type') === 'math_number').forEach((number) => {
          directChildren(number, 'field').filter((field) => field.getAttribute('name') === 'NUM').forEach(setField);
        });
      });
  [...doc.getElementsByTagName('block'), ...doc.getElementsByTagName('shadow')].forEach((block) => {
    const type = block.getAttribute('type');
    if (WORKSPACE_FIELDS[type]) {
      directChildren(block, 'field').filter((field) => field.getAttribute('name') === WORKSPACE_FIELDS[type]).forEach(setField);
    } else if (type === 'sprite_player_set_animation_id') {
      numberInValue(block, 'VALUE');
    } else if (type === 'sprite_player_set') {
      const target = directChildren(block, 'field').find((field) => field.getAttribute('name') === 'VAR');
      if (target && /^player\d+animation$/.test(target.textContent)) numberInValue(block, 'VALUE');
    }
  });
  if (changed) storage.value = new XMLSerializer().serializeToString(doc);
  return changed;
};

// Data table cells set to the Sprite animation format hold the place of an animation.
export const remapDataTableAnimationIndices = (indexMap) => {
  const storage = useDataTablesStorage();
  const tables = storage.value && storage.value.dataTables;
  if (!tables) return false;
  let changed = false;
  const next = tables.map((table) => {
    if (!table.valueFormats || !table.values) return table;
    const values = table.values.map((value, index) => {
      if (!['player0', 'player1'].includes(table.valueFormats[index])) return value;
      const mapped = indexMap.get(Number(value));
      if (mapped === undefined || mapped === Number(value)) return value;
      changed = true;
      return mapped;
    });
    return {...table, values};
  });
  if (changed) storage.value = {...storage.value, dataTables: next};
  return changed;
};

// The Player 0 and Player 1 cards of a title screen name the animation they play by its place (a string, empty for none).
export const remapTitleCardAnimationIndices = (indexMap) => {
  const storage = useTitleScreenStorage();
  const screens = storage.value && storage.value.screens;
  if (!screens) return false;
  let changed = false;
  screens.forEach((screen) => (screen.cards || []).forEach((card) => ['player0Animation', 'player1Animation'].forEach((key) => {
    const value = card[key];
    if (value === undefined || value === null || value === '') return;
    const mapped = indexMap.get(Number(value));
    if (mapped === undefined || mapped === Number(value)) return;
    card[key] = typeof value === 'string' ? String(mapped) : mapped;
    changed = true;
  })));
  if (changed) storage.value = {...storage.value, screens};
  return changed;
};

// Points every reference at the new places. before/after: the lists of animations.
export const remapAnimationReferences = (before, after) => {
  const indexMap = animationIndexMap(before, after);
  if ([...indexMap].every(([from, to]) => from === to)) return false;
  remapDataTableAnimationIndices(indexMap);
  remapTitleCardAnimationIndices(indexMap);
  return remapWorkspaceAnimationIndices(indexMap);
};
