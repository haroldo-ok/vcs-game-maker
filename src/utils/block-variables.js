// The variables that the blocks of the project make, for the block that reads a built-in variable ("system_variable_get", see blocks/bit.js):
// a block that needs a byte to keep its state (the Jump block's, a Seek, the clear text timer) declares it, and the name is the same whatever the
// project, so a block present in the workspace means the variable is there to read. Each is [name, label].

const jumpPlayers = (workspace) => {
  const players = new Set();
  const moving = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (!block.isEnabled() || block.getInheritedDisabled()) return;
    if (block.type === 'sprite_platformer') players.add(`${block.getFieldValue('PLAYER')}`);
    if (block.type === 'sprite_platformer_state') {
      players.add(`${block.getFieldValue('PLAYER')}`);
      if (block.getFieldValue('STATE') === 'moving') moving.add(`${block.getFieldValue('PLAYER')}`);
    }
  });
  return {players: [...players].sort(), moving};
};

export const blockVariables = (workspace) => {
  if (!workspace || !workspace.getAllBlocks) return [];
  const list = [];
  const blocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled() && !block.getInheritedDisabled());
  const {players, moving} = jumpPlayers(workspace);
  players.forEach((player) => {
    const name = /^\d+$/.test(player) ? `Player ${player}` : player;
    list.push([`platState${player}`, `${name} jump state (jumps made 0-2, jumping 3, falling 4, on the ground 5)`],
        [`platSpeed${player}`, `${name} jump speed (eighths of a pixel a frame)`],
        [`platFrac${player}`, `${name} jump, eighths of a pixel not yet moved`]);
    if (moving.has(player)) list.push([`platMoved${player}`, `${name} moved in the last frame`]);
  });
  const seeking = new Set();
  blocks.filter((block) => block.type === 'object_seek_to').forEach((block) => seeking.add(block.getFieldValue('OBJECT')));
  [...seeking].sort().forEach((object) => {
    list.push([`${object}SeekX`, `${object} seek target x`], [`${object}SeekY`, `${object} seek target y`],
        [`${object}SeekSpeed`, `${object} seek speed`]);
  });
  if (blocks.some((block) => block.type === 'text_minikernel_clear_after')) {
    list.push(['textClearTimer', 'frames left before the text is cleared']);
  }
  const seen = new Set();
  return list.filter(([name]) => !seen.has(name) && seen.add(name));
};

// Dropdown options: [label, name].
export const blockVariableOptions = (workspace) => blockVariables(workspace).map(([name, label]) => [`${name} - ${label}`, name]);
