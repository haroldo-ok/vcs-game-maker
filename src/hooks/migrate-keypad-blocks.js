'use strict';

// One-time migration from the old, separate input_keypad0_*/input_keypad1_*
// block types into the single combined input_keypad_* type each pair now
// shares (see KEYPAD_OPTIONS' comment in blocks/input.js for why:
// Keypad 0/1 are otherwise-identical peripheral ports, so there's a single
// block type with a KEYPAD dropdown field instead of two full sets of
// blocks - same reasoning, same shape, as the earlier Joystick 0/1
// combination). The getter's KEY field (already a plain 1-12 key ID,
// not port-specific) is left untouched - only the block's "type"
// attribute and a brand new KEYPAD field need to change, same as JOYSTICK
// did.
// Same overall shape as hooks/migrate-joystick-blocks.js's
// migrateLegacyJoystickBlocksInWorkspaceXml (raw workspace XML STRING in,
// string out, via DOMParser/XMLSerializer) - called from the same two
// places that function is: main.js's startup pass (an existing
// localStorage-persisted project) and Project.vue's "Open Project" handler
// (a freshly opened .vcsgm file), since either path can hand this a
// workspace that still has the old block types in it.
const OLD_TYPE_TO_NEW = {
  input_keypad0_get: {type: 'input_keypad_get', field: 'KEYPAD', value: '0'},
  input_keypad1_get: {type: 'input_keypad_get', field: 'KEYPAD', value: '1'},
  input_keypad0_any_pressed: {type: 'input_keypad_any_pressed', field: 'KEYPAD', value: '0'},
  input_keypad1_any_pressed: {type: 'input_keypad_any_pressed', field: 'KEYPAD', value: '1'},
  input_keypad0_id_get: {type: 'input_keypad_id_get', field: 'KEYPAD', value: '0'},
  input_keypad1_id_get: {type: 'input_keypad_id_get', field: 'KEYPAD', value: '1'},
};

// Exported separately from the localStorage-string wrapper below so
// Project.vue's "Open Project" handler (already working with a plain
// string, not localStorage) can call it directly - same split
// migrateLegacyJoystickBlocksInWorkspaceXml/migrateLegacyJoystickBlocksIn
// LocalStorage already use in the sibling migration file.
export const migrateLegacyKeypadBlocksInWorkspaceXml = (workspaceXml) => {
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
    console.error('Failed to migrate legacy Keypad 0/1 blocks in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once already migrated (none of the old types are left to match)
// or on a brand-new install (no workspace saved yet) - safe to call
// unconditionally on every launch, same as migrateLegacyJoystickBlocksIn
// LocalStorage.
export const migrateLegacyKeypadBlocksInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateLegacyKeypadBlocksInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
