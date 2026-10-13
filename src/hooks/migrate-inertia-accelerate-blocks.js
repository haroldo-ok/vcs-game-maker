'use strict';

// One-time migration from the old, separate sprite_inertia_accelerate (no
// ACTION field yet) / sprite_inertia_stop_accelerate block types into the
// single sprite_inertia_accelerate type they now share (an ACTION dropdown
// up front, same shape as sprite_inertia_decelerate already had - see that
// block's comment in blocks/sprites.js and this combination's
// comment there for why). An old sprite_inertia_accelerate block just needs
// a new "start" ACTION field inserted at the front - every other field it
// already has (OBJECT plus the DIRECTION/RATE/MAXSPEED value inputs) stays
// exactly where it is. An old sprite_inertia_stop_accelerate block needs
// its type attribute changed to sprite_inertia_accelerate and a "stop"
// ACTION field inserted before its existing OBJECT field - it never had
// DIRECTION/RATE/MAXSPEED inputs at all, which is fine, since Stop doesn't
// read them anyway (see the merged generator's comment).
// Same overall shape as hooks/migrate-joystick-blocks.js's
// migrateLegacyJoystickBlocksInWorkspaceXml (raw workspace XML STRING in,
// string out, via DOMParser/XMLSerializer) - called from the same two
// places that function is: main.js's startup pass (an existing
// localStorage-persisted project) and Project.vue's "Open Project" handler
// (a freshly opened .vcsgm file), since either path can hand this a
// workspace that still has the old shape in it.
export const migrateLegacyInertiaAccelerateBlocksInWorkspaceXml = (workspaceXml) => {
  if (!workspaceXml) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    let changed = false;
    doc.querySelectorAll('block').forEach((block) => {
      const type = block.getAttribute('type');
      let actionValue = null;
      if (type === 'sprite_inertia_accelerate') {
        if (block.querySelector(':scope > field[name="ACTION"]')) return;
        actionValue = 'start';
      } else if (type === 'sprite_inertia_stop_accelerate') {
        actionValue = 'stop';
        block.setAttribute('type', 'sprite_inertia_accelerate');
      }
      if (!actionValue) return;
      changed = true;
      const field = doc.createElement('field');
      field.setAttribute('name', 'ACTION');
      field.textContent = actionValue;
      block.insertBefore(field, block.firstChild);
    });
    if (!changed) return workspaceXml;
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to migrate legacy Accelerate/Stop accelerating blocks in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once already migrated (every sprite_inertia_accelerate block
// already has an ACTION field and no sprite_inertia_stop_accelerate blocks
// are left to match) or on a brand-new install (no workspace saved yet) -
// safe to call unconditionally on every launch, same as
// migrateLegacyBounceBlocksInLocalStorage.
export const migrateLegacyInertiaAccelerateBlocksInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateLegacyInertiaAccelerateBlocksInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
