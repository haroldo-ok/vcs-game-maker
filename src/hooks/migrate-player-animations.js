'use strict';

// One-time migration from the old, separate 'player0'/'player1' localStorage
// keys into the single shared animation pool this app now uses (see
// hooks/project.js's usePlayerAnimationsStorage) - has to run against raw
// localStorage, directly, before ANY of hooks/storage.js's own reactive refs
// are created for these keys (see that file's own comment on why a key's
// initial value is only ever read once, the first time it's accessed) - see
// main.js's own call site, which runs this before the app is mounted, same
// timing main.js already relies on for useLoadLastProjectStorage/
// clearProjectStorage just above it.
const PLAYER0_KEY = 'vcs-game-maker.player0';
const PLAYER1_KEY = 'vcs-game-maker.player1';
const PLAYER_ANIMATIONS_KEY = 'vcs-game-maker.playerAnimations';
const WORKSPACE_KEY = 'vcs-game-maker.workspace';

const readJson = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error(`Failed to read ${key} while migrating player animations`, e);
    return null;
  }
};

// ids only ever needed to be unique WITHIN one player's own list before (see
// PlayerEditor.vue's own getMaxId) - two independently-saved projects'
// worth of ids commonly overlap (e.g. both starting at 0), so combining the
// two lists needs a fresh, non-colliding id for every animation.
const renumber = (animations, startId) => {
  let nextId = startId;
  return animations.map((animation) => ({...animation, id: nextId++}));
};

// Player 0's animations keep their original relative order and come FIRST,
// Player 1's are appended after - so every sprite_player0_animation_select
// block's own stored dropdown index (a position in the list - see
// blocks/sprites.js's own buildAnimationOptions) stays correct completely
// unchanged, since Player 0's animations don't move. Only Player 1's own
// blocks need their stored index remapped - see
// remapPlayer1AnimationIndexesInWorkspaceXml below.
export const combineLegacyPlayerAnimations = (player0Data, player1Data) => {
  const player0Animations = (player0Data && player0Data.animations) || [];
  const player1Animations = (player1Data && player1Data.animations) || [];
  return {
    animations: [
      ...renumber(player0Animations, 0),
      ...renumber(player1Animations, player0Animations.length),
    ],
  };
};

// Shifts every sprite_player1_animation_select block's own stored VAR field
// (the animation's position in what USED to be Player 1's own separate list -
// see blocks/sprites.js's own generator, which reads this field as a plain
// literal index) by however many Player 0 animations now precede it in the
// combined pool. sprite_player0_animation_select blocks need no change -
// Player 0's animations weren't moved. ':scope > field' (not a plain
// descendant selector) is deliberate - a value input can itself hold another
// block with its own unrelated 'VAR' field (e.g. a variable getter plugged
// into this block's own inputs elsewhere in the tree), which must NOT be
// touched here.
export const remapPlayer1AnimationIndexesInWorkspaceXml = (workspaceXml, offset) => {
  if (!workspaceXml || !offset) return workspaceXml;
  try {
    const doc = new DOMParser().parseFromString(workspaceXml, 'text/xml');
    if (doc.querySelector('parsererror')) return workspaceXml;
    doc.querySelectorAll('block[type="sprite_player1_animation_select"]').forEach((block) => {
      const field = block.querySelector(':scope > field[name="VAR"]');
      if (!field) return;
      const current = parseInt(field.textContent, 10);
      if (Number.isFinite(current)) field.textContent = String(current + offset);
    });
    return new XMLSerializer().serializeToString(doc);
  } catch (e) {
    console.error('Failed to remap Player 1 animation indexes in the workspace', e);
    return workspaceXml;
  }
};

// A no-op once already migrated (the new key already exists) or on a
// brand-new install (neither legacy key ever existed) - safe to call
// unconditionally on every launch.
export const migrateLegacyPlayerAnimationsInLocalStorage = () => {
  if (localStorage.getItem(PLAYER_ANIMATIONS_KEY)) return;
  const player0Data = readJson(PLAYER0_KEY);
  const player1Data = readJson(PLAYER1_KEY);
  if (!player0Data && !player1Data) return;

  const combined = combineLegacyPlayerAnimations(player0Data, player1Data);
  localStorage.setItem(PLAYER_ANIMATIONS_KEY, JSON.stringify(combined));

  const offset = (player0Data && player0Data.animations && player0Data.animations.length) || 0;
  if (!offset) return;
  const workspaceXml = localStorage.getItem(WORKSPACE_KEY);
  const remapped = remapPlayer1AnimationIndexesInWorkspaceXml(workspaceXml, offset);
  if (remapped != null && remapped !== workspaceXml) {
    localStorage.setItem(WORKSPACE_KEY, remapped);
  }
};
