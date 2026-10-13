'use strict';

// One-time migration from the old, separate sprite_missile_bounce/
// sprite_ball_bounce block types into the single object_bounce type they
// now share (an OBJECT dropdown covering all 5 sprite names, since Bounce
// now also reflects Inertia's  velocity for Player 0/1, which never had
// a Bounce block at all before - see object_bounce's  comment in
// blocks/sprites.js/generators/bbasic/sprites.js for why). Unlike
// hooks/migrate-player-blocks.js's  OLD_TYPE_TO_NEW map (a fixed
// literal per old type), sprite_missile_bounce's  replacement OBJECT
// value depends on that block's existing MISSILE field (0 or 1) - read
// before the block is rewritten, not a constant - so this needs its
// per-block logic rather than a flat lookup table. sprite_ball_bounce has
// no fields at all, so its  replacement is always the literal 'ball'.
// Same overall shape as migrate-player-blocks.js otherwise (raw workspace
// XML string in, string out, via DOMParser/XMLSerializer) - called from the
// same two places that migration is: main.js's  startup pass (an
// existing localStorage-persisted project) and Project.vue's "Open Project"
// handler (a freshly opened .vcsgm file), since either path can hand this a
// workspace that still has the old block types in it.
export const migrateLegacyBounceBlocksInWorkspaceXml = (workspaceXml) => {
  if (!workspaceXml) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    let changed = false;
    doc.querySelectorAll('block').forEach((block) => {
      const type = block.getAttribute('type');
      let objectValue = null;
      if (type === 'sprite_ball_bounce') {
        objectValue = 'ball';
      } else if (type === 'sprite_missile_bounce') {
        const missileField = block.querySelector(':scope > field[name="MISSILE"]');
        objectValue = missileField && missileField.textContent === '1' ? 'missile1' : 'missile0';
      }
      if (!objectValue) return;
      changed = true;
      block.setAttribute('type', 'object_bounce');
      const missileField = block.querySelector(':scope > field[name="MISSILE"]');
      if (missileField) missileField.remove();
      const field = doc.createElement('field');
      field.setAttribute('name', 'OBJECT');
      field.textContent = objectValue;
      block.insertBefore(field, block.firstChild);
    });
    if (!changed) return workspaceXml;
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to migrate legacy Bounce blocks in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once already migrated (none of the old types are left to match)
// or on a brand-new install (no workspace saved yet) - safe to call
// unconditionally on every launch, same as migrateLegacyPlayerBlocksIn
// LocalStorage.
export const migrateLegacyBounceBlocksInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateLegacyBounceBlocksInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
