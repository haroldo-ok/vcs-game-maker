'use strict';

// One-time migrations for the Fire block: the old, separate sprite_ball_fire
// block becomes the Fire block the missiles use (sprite_missile_fire, whose
// dropdown now also offers the Ball) - every other field and input has the same
// name on both, so only the type changes and a MISSILE field set to 'ball' is
// added - and the speed dropdown field becomes a number input. Same shape
// as hooks/migrate-bounce-blocks.js (workspace XML string in, string out) and
// called from the same two places: main.js's startup pass and Project.vue's
// Open Project handler.
export const migrateLegacyBallFireBlocksInWorkspaceXml = (workspaceXml) => {
  if (!workspaceXml) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    let changed = false;
    doc.querySelectorAll('block[type="sprite_ball_fire"]').forEach((block) => {
      changed = true;
      block.setAttribute('type', 'sprite_missile_fire');
      const field = doc.createElement('field');
      field.setAttribute('name', 'MISSILE');
      field.textContent = 'ball';
      block.insertBefore(field, block.firstChild);
    });
    // The Fire block's speed used to be a dropdown field and is now a number
    // input: a saved speed becomes a number block plugged into it.
    doc.querySelectorAll('block[type="sprite_missile_fire"]').forEach((block) => {
      const speedField = block.querySelector(':scope > field[name="SPEED"]');
      if (!speedField) return;
      changed = true;
      const value = doc.createElement('value');
      value.setAttribute('name', 'SPEED');
      const shadow = doc.createElement('shadow');
      shadow.setAttribute('type', 'math_number');
      const num = doc.createElement('field');
      num.setAttribute('name', 'NUM');
      num.textContent = speedField.textContent;
      shadow.appendChild(num);
      value.appendChild(shadow);
      block.replaceChild(value, speedField);
    });
    // The short-lived "Second playfield collision column/row" blocks were taken
    // out again: dropping one leaves its input on the shadow number beneath it.
    doc.querySelectorAll('block[type="background_collision_pixel_column2"],' +
      'block[type="background_collision_pixel_row2"]').forEach((block) => {
      changed = true;
      block.parentNode.removeChild(block);
    });
    if (!changed) return workspaceXml;
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to migrate legacy Ball Fire blocks in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once already migrated or on a brand-new install, so it is safe to
// call on every launch.
export const migrateLegacyBallFireBlocksInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateLegacyBallFireBlocksInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
