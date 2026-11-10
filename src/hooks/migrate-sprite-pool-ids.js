'use strict';

// The Sprite pool blocks used to carry the players they work on ("players 1 to 3": the fields FROM and TO, and POOLFROM and POOLTO on the blocks that can name
// "all pool sprites" or "any pool sprite"). A pool is made by a "Sprite pool ID" block now (an id and the players it spans), and the blocks that work on a pool
// name only its id (the inputs ID and POOLID, which take a Number block: the id has to be a constant, 1 to 4). A saved project is moved over: each range that was used becomes a "Sprite pool ID" block (put loose at the left of the
// workspace) and the blocks that had it get its id. Same shape as hooks/migrate-rainbow-range.js (workspace XML string in, string out), called from the same two
// places: main.js's startup pass and Project.vue's "Open Project".
const POOL_TYPES = ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release_all', 'sprite_pool_full', 'sprite_pool_free'];

export const migrateSpritePoolIdsInWorkspaceXml = (workspaceXml) => {
  if (!workspaceXml || !workspaceXml.includes('sprite_pool_') && !workspaceXml.includes('POOLFROM')) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    const namespace = doc.documentElement.namespaceURI;
    const make = (name) => namespace ? doc.createElementNS(namespace, name) : doc.createElement(name);
    const fieldOf = (block, name) => Array.from(block.children).find((child) => child.nodeName === 'field' && child.getAttribute('name') === name);
    const ids = new Map();
    const idFor = (from, to) => {
      const low = Math.min(from, to);
      const high = Math.max(from, to);
      const key = `${low}-${high}`;
      if (!ids.has(key)) ids.set(key, {id: ids.size + 1, low, high});
      return ids.get(key).id;
    };
    const idField = (name, id) => {
      const field = make('field');
      field.setAttribute('name', name);
      field.textContent = String(id);
      return field;
    };
    // The id of a pool block is an input holding a Number block.
    const idInput = (name, id) => {
      const value = make('value');
      value.setAttribute('name', name);
      const shadow = make('shadow');
      shadow.setAttribute('type', 'math_number');
      shadow.appendChild(idField('NUM', id));
      value.appendChild(shadow);
      return value;
    };
    let changed = false;
    const convert = (block, fromName, toName, idName) => {
      const from = fieldOf(block, fromName);
      const to = fieldOf(block, toName);
      if (!from || !to) return;
      const id = idFor(Number(from.textContent), Number(to.textContent));
      block.replaceChild(idInput(idName, id), from);
      block.removeChild(to);
      changed = true;
    };
    doc.querySelectorAll('block').forEach((block) => {
      if (POOL_TYPES.includes(block.getAttribute('type'))) convert(block, 'FROM', 'TO', 'ID');
      convert(block, 'POOLFROM', 'POOLTO', 'POOLID');
    });
    if (!changed) return workspaceXml;
    let y = 0;
    ids.forEach(({id, low, high}) => {
      const block = make('block');
      block.setAttribute('type', 'sprite_pool_define');
      block.setAttribute('x', '-400');
      block.setAttribute('y', String(y));
      y += 60;
      block.appendChild(idField('ID', id));
      block.appendChild(idField('FROM', low));
      block.appendChild(idField('TO', high));
      doc.documentElement.appendChild(block);
    });
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to migrate the Sprite pool blocks to pool ids in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once migrated (no block with a range is left) or on a new install.
export const migrateSpritePoolIdsInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateSpritePoolIdsInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
