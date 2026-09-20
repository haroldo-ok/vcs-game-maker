'use strict';

// One-time migration from the old, separate sprite_player0_*/sprite_player1_*
// and sprite_missile0_*/sprite_missile1_* block types into the single
// combined sprite_player_*/sprite_missile_* type each pair now shares (see
// PLAYER_OPTIONS'/MISSILE_OPTIONS' own comments in blocks/sprites.js for
// why: Player 0/1 and Missile 0/1 are each otherwise-identical hardware
// objects, so there's a single block type with a PLAYER/MISSILE dropdown
// field instead of two full sets of blocks - Ball is NOT part of this, it
// never had a twin to combine with). Every OTHER field on these blocks
// (VAR/SIZE/STATE/OFFSET/HEIGHT/X/Y/ANGLE/etc.) already holds a real,
// object-specific value or an object-independent choice (e.g. VAR is
// already the literal bB variable name "player0x"/"missile1height", not a
// generic index) - untouched by this migration, only the block's own
// "type" attribute and a brand new PLAYER/MISSILE field need to change.
// Same overall shape as hooks/migrate-player-animations.js's own
// remapPlayer1AnimationIndexesInWorkspaceXml (raw workspace XML STRING in,
// string out, via DOMParser/XMLSerializer) - called from the same two
// places that function is: main.js's own startup pass (an existing
// localStorage-persisted project) and Project.vue's "Open Project" handler
// (a freshly opened .vcsgm file), since either path can hand this a
// workspace that still has the old block types in it.
const OLD_TYPE_TO_NEW = {
  sprite_player0_get: {type: 'sprite_player_get', field: 'PLAYER', value: '0'},
  sprite_player0_set: {type: 'sprite_player_set', field: 'PLAYER', value: '0'},
  sprite_player0_change: {type: 'sprite_player_change', field: 'PLAYER', value: '0'},
  sprite_player0_size: {type: 'sprite_player_size', field: 'PLAYER', value: '0'},
  sprite_player0_animation_select: {type: 'sprite_player_animation_select', field: 'PLAYER', value: '0'},
  sprite_player0_animation_playback: {type: 'sprite_player_animation_playback', field: 'PLAYER', value: '0'},
  sprite_player0_rom_noise: {type: 'sprite_player_rom_noise', field: 'PLAYER', value: '0'},
  sprite_player0_rom_noise_stop: {type: 'sprite_player_rom_noise_stop', field: 'PLAYER', value: '0'},
  sprite_player0_rainbow_colors: {type: 'sprite_player_rainbow_colors', field: 'PLAYER', value: '0'},
  sprite_player0_rainbow_colors_stop: {type: 'sprite_player_rainbow_colors_stop', field: 'PLAYER', value: '0'},
  sprite_player1_get: {type: 'sprite_player_get', field: 'PLAYER', value: '1'},
  sprite_player1_set: {type: 'sprite_player_set', field: 'PLAYER', value: '1'},
  sprite_player1_change: {type: 'sprite_player_change', field: 'PLAYER', value: '1'},
  sprite_player1_size: {type: 'sprite_player_size', field: 'PLAYER', value: '1'},
  sprite_player1_animation_select: {type: 'sprite_player_animation_select', field: 'PLAYER', value: '1'},
  sprite_player1_animation_playback: {type: 'sprite_player_animation_playback', field: 'PLAYER', value: '1'},
  sprite_player1_rom_noise: {type: 'sprite_player_rom_noise', field: 'PLAYER', value: '1'},
  sprite_player1_rom_noise_stop: {type: 'sprite_player_rom_noise_stop', field: 'PLAYER', value: '1'},
  sprite_player1_rainbow_colors: {type: 'sprite_player_rainbow_colors', field: 'PLAYER', value: '1'},
  sprite_player1_rainbow_colors_stop: {type: 'sprite_player_rainbow_colors_stop', field: 'PLAYER', value: '1'},
  sprite_missile0_get: {type: 'sprite_missile_get', field: 'MISSILE', value: '0'},
  sprite_missile0_set: {type: 'sprite_missile_set', field: 'MISSILE', value: '0'},
  sprite_missile0_change: {type: 'sprite_missile_change', field: 'MISSILE', value: '0'},
  sprite_missile0_size: {type: 'sprite_missile_size', field: 'MISSILE', value: '0'},
  sprite_missile0_fire: {type: 'sprite_missile_fire', field: 'MISSILE', value: '0'},
  sprite_missile0_bounce: {type: 'sprite_missile_bounce', field: 'MISSILE', value: '0'},
  sprite_missile1_get: {type: 'sprite_missile_get', field: 'MISSILE', value: '1'},
  sprite_missile1_set: {type: 'sprite_missile_set', field: 'MISSILE', value: '1'},
  sprite_missile1_change: {type: 'sprite_missile_change', field: 'MISSILE', value: '1'},
  sprite_missile1_size: {type: 'sprite_missile_size', field: 'MISSILE', value: '1'},
  sprite_missile1_fire: {type: 'sprite_missile_fire', field: 'MISSILE', value: '1'},
  sprite_missile1_bounce: {type: 'sprite_missile_bounce', field: 'MISSILE', value: '1'},
};

// Exported separately from the localStorage-string wrapper below so
// Project.vue's "Open Project" handler (already working with a plain
// string, not localStorage) can call it directly - same split
// remapPlayer1AnimationIndexesInWorkspaceXml/migrateLegacyPlayerAnimations
// InLocalStorage already use in the sibling migration file.
export const migrateLegacyPlayerBlocksInWorkspaceXml = (workspaceXml) => {
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
    console.error('Failed to migrate legacy Player 0/1 blocks in the workspace', e);
    return workspaceXml;
  }
};

const WORKSPACE_KEY = 'vcs-game-maker.workspace';

// A no-op once already migrated (none of the old types are left to match)
// or on a brand-new install (no workspace saved yet) - safe to call
// unconditionally on every launch, same as migrateLegacyPlayerAnimationsIn
// LocalStorage.
export const migrateLegacyPlayerBlocksInLocalStorage = () => {
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  if (!workspaceXml) return;
  const migrated = migrateLegacyPlayerBlocksInWorkspaceXml(workspaceXml);
  if (migrated != null && migrated !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, migrated);
  }
};
