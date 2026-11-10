'use strict';

// The "colors from ... to ..." fields of the rainbow colors blocks (the player's and the playfield's) are inputs now, so a Color or a Number block can be plugged
// in. A saved project has them as number fields (COLORFROM and COLORTO): each becomes an input of the same name holding a Number block with that value.
// Same shape as hooks/migrate-joystick-blocks.js (workspace XML string in, string out), called from the same two places: main.js's startup pass and
// Project.vue's "Open Project".
const RAINBOW_TYPES = ['sprite_player_rainbow_colors', 'background_rainbow_colors'];
const RANGE_FIELDS = ['COLORFROM', 'COLORTO'];

export const migrateRainbowRangeInWorkspaceXml = (workspaceXml) => {
  if (!workspaceXml) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    const namespace = doc.documentElement.namespaceURI;
    const make = (name) => namespace ? doc.createElementNS(namespace, name) : doc.createElement(name);
    let changed = false;
    doc.querySelectorAll('block').forEach((block) => {
      if (!RAINBOW_TYPES.includes(block.getAttribute('type'))) return;
      Array.from(block.children).forEach((child) => {
        if (child.nodeName !== 'field' || !RANGE_FIELDS.includes(child.getAttribute('name'))) return;
        const value = make('value');
        value.setAttribute('name', child.getAttribute('name'));
        const shadow = make('shadow');
        shadow.setAttribute('type', 'math_number');
        const number = make('field');
        number.setAttribute('name', 'NUM');
        number.textContent = child.textContent;
        shadow.appendChild(number);
        value.appendChild(shadow);
        block.replaceChild(value, child);
        changed = true;
      });
    });
    if (!changed) return workspaceXml;
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to migrate the rainbow colors ranges in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once migrated (no number fields are left) or on a new install.
export const migrateRainbowRangeInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateRainbowRangeInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
