import {useDataTablesStorage, useWorkspaceStorage} from '../hooks/project';

// What refers to a background by its id, and so has to change when the
// backgrounds are renumbered (see BackgroundEditor.vue's reordering):
// - the Actions tab's blocks that pick a background: "Background [select]"
//   (background_set_select), the "Background" value block (background_select),
//   and a plain number plugged straight into "Background set to"
// - Data table cells whose format is Background
// Anything else that ends up holding a background number at runtime (a variable,
// a calculation) can't be followed here.

const WORKSPACE_ID_FIELDS = {
  background_set_select: 'VAR',
  background_select: 'VAR',
};

const remapNumber = (text, idMap) => {
  const id = Number(text);
  return idMap.has(id) ? String(idMap.get(id)) : text;
};

// Rewrites the saved Actions workspace (an XML string) - the Actions tab isn't
// on screen while backgrounds are being reordered, and loads from this when it
// next opens. Returns whether anything changed.
export const remapWorkspaceBackgroundIds = (idMap) => {
  const storage = useWorkspaceStorage();
  const text = storage.value;
  if (!text || text === 'null') return false;
  const doc = new DOMParser().parseFromString(text, 'text/xml');
  if (doc.getElementsByTagName('parsererror').length) return false;
  let changed = false;
  const setField = (field) => {
    const next = remapNumber(field.textContent, idMap);
    if (next !== field.textContent) {
      field.textContent = next;
      changed = true;
    }
  };
  const directChildren = (element, tagName) =>
    [...element.children].filter((child) => child.tagName === tagName);
  [...doc.getElementsByTagName('block'), ...doc.getElementsByTagName('shadow')].forEach((block) => {
    const type = block.getAttribute('type');
    if (WORKSPACE_ID_FIELDS[type]) {
      directChildren(block, 'field').filter((field) => field.getAttribute('name') === WORKSPACE_ID_FIELDS[type])
          .forEach(setField);
    } else if (type === 'background_set') {
      directChildren(block, 'value').filter((value) => value.getAttribute('name') === 'VALUE').forEach((value) => {
        [...value.children].filter((child) => child.getAttribute('type') === 'math_number').forEach((number) => {
          directChildren(number, 'field').filter((field) => field.getAttribute('name') === 'NUM').forEach(setField);
        });
      });
    }
  });
  if (changed) storage.value = new XMLSerializer().serializeToString(doc);
  return changed;
};

// Data table cells set to the Background format hold a background id.
export const remapDataTableBackgroundIds = (idMap) => {
  const storage = useDataTablesStorage();
  const tables = storage.value && storage.value.dataTables;
  if (!tables) return false;
  let changed = false;
  const next = tables.map((table) => {
    if (!table.valueFormats || !table.values) return table;
    const values = table.values.map((value, index) => {
      if (table.valueFormats[index] !== 'background') return value;
      const mapped = idMap.get(Number(value));
      if (mapped === undefined || mapped === Number(value)) return value;
      changed = true;
      return mapped;
    });
    return {...table, values};
  });
  if (changed) storage.value = {...storage.value, dataTables: next};
  return changed;
};

// Points every reference at the new ids. idMap: old id -> new id.
export const remapBackgroundReferences = (idMap) => {
  remapWorkspaceBackgroundIds(idMap);
  remapDataTableBackgroundIds(idMap);
};
