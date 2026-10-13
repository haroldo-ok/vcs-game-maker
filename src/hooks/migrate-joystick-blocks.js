'use strict';

// One-time migration from the old, separate input_joy0_*/input_joy1_*
// block types into the single combined input_joystick_* type each pair now
// shares (see JOYSTICK_OPTIONS' comment in blocks/input.js for why:
// Joystick 0/1 are otherwise-identical input hardware, so there's a single
// block type with a JOYSTICK dropdown field instead of two full sets of
// blocks - same reasoning, same shape, as the earlier Player 0/1 and
// Missile 0/1 combination). The getter's VAR field (already the
// literal bB variable name "joy0up"/"joy1fire", not a generic index) is
// left untouched - only the block's "type" attribute and a brand new
// JOYSTICK field need to change, same as PLAYER/MISSILE did.
// Same overall shape as hooks/migrate-player-blocks.js's
// migrateLegacyPlayerBlocksInWorkspaceXml (raw workspace XML STRING in,
// string out, via DOMParser/XMLSerializer) - called from the same two
// places that function is: main.js's startup pass (an existing
// localStorage-persisted project) and Project.vue's "Open Project" handler
// (a freshly opened .vcsgm file), since either path can hand this a
// workspace that still has the old block types in it.
const OLD_TYPE_TO_NEW = {
  input_joy0_get: {type: 'input_joystick_get', field: 'JOYSTICK', value: '0'},
  input_joy1_get: {type: 'input_joystick_get', field: 'JOYSTICK', value: '1'},
  input_joy0_direction8: {type: 'input_joystick_direction8', field: 'JOYSTICK', value: '0'},
  input_joy1_direction8: {type: 'input_joystick_direction8', field: 'JOYSTICK', value: '1'},
  input_joy0_fire_pattern: {type: 'input_joystick_fire_pattern', field: 'JOYSTICK', value: '0'},
  input_joy1_fire_pattern: {type: 'input_joystick_fire_pattern', field: 'JOYSTICK', value: '1'},
};

// Exported separately from the localStorage-string wrapper below so
// Project.vue's "Open Project" handler (already working with a plain
// string, not localStorage) can call it directly - same split
// migrateLegacyPlayerBlocksInWorkspaceXml/migrateLegacyPlayerBlocksIn
// LocalStorage already use in the sibling migration file.
export const migrateLegacyJoystickBlocksInWorkspaceXml = (workspaceXml) => {
  if (!workspaceXml) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    let changed = false;
    doc.querySelectorAll('block').forEach((block) => {
      const replacement = OLD_TYPE_TO_NEW[block.getAttribute('type')];
      if (!replacement) return;
      changed = true;
      block.setAttribute('type', replacement.type);
      const field = doc.createElement('field');
      field.setAttribute('name', replacement.field);
      field.textContent = replacement.value;
      block.insertBefore(field, block.firstChild);
    });
    if (!changed) return workspaceXml;
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to migrate legacy Joystick 0/1 blocks in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once already migrated (none of the old types are left to match)
// or on a brand-new install (no workspace saved yet) - safe to call
// unconditionally on every launch, same as migrateLegacyPlayerBlocksIn
// LocalStorage.
export const migrateLegacyJoystickBlocksInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateLegacyJoystickBlocksInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
