import * as Blockly from 'blockly/core';

import {PLAYER_ICON} from './icon';
import {useConfigurationStorage} from '../hooks/project';
import {playerCount} from '../utils/pxe';

// The sprite pool blocks share a range of the virtual sprites (Player 1 and up) out among the things a game makes while it runs, such as
// the powerups of Bricks: the blocks inside a pool block say what to do with "pool sprite", and the build makes a copy of them for each sprite
// of the pool (see utils/sprite-pool.js). A sprite is free while it is hidden.
export const SPRITE_POOL_COLOUR = '#3f7f93';
export const SPRITE_POOL_TYPES = ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release_all', 'sprite_pool_full', 'sprite_pool_free', 'sprite_pool_release_player'];
// The pools are made by "Sprite pool ID" blocks (an id and the players it spans); the blocks that work on a pool name only its id.
export const SPRITE_POOL_DEFINE = 'sprite_pool_define';
// At most 4 pools, so the state kept for the pools fits in a byte (2 bits each, or a bit each) when that is needed.
export const SPRITE_POOL_MAX_ID = 4;

// The sprites a pool can span: Player 1 up to the last one the kernel has.
const poolSpriteOptions = function() {
  const count = Math.max(2, playerCount(((useConfigurationStorage() || {}).value || {})));
  return Array.from({length: count - 1}, (_, i) => [String(i + 1), String(i + 1)]);
};

// The sprites a block that is not made for the extra players can offer: Player 0 and 1, and under DPC+ and PXE the virtual sprites (Player 2 to 9, and up to
// 16 on PXE) and the pool sprite. The missiles and the ball come after.
export const spriteOptionsWithPool = (extraOptions) => function() {
  const config = ((useConfigurationStorage() || {}).value || {});
  const count = playerCount(config);
  return [...Array.from({length: count}, (_, i) => [PLAYER_ICON + ' Player ' + i, 'player' + i]),
    ...(count > 2 ? [[PLAYER_ICON + ' Pool sprite', 'playerpool']] : []), ...extraOptions];
};

// The pools of a workspace: the id of each enabled "Sprite pool ID" block and the players it spans. When an id is given twice the first block counts (the build
// does the same).
const poolDefinitions = (workspace) => {
  const pools = new Map();
  (workspace ? workspace.getBlocksByType(SPRITE_POOL_DEFINE, true) : []).filter((block) => !block.isInsertionMarker() && block.isEnabled()).forEach((block) => {
    const id = Number(block.getFieldValue('ID'));
    const from = Number(block.getFieldValue('FROM'));
    const to = Number(block.getFieldValue('TO'));
    if (!pools.has(id)) pools.set(id, {id, range: [Math.min(from, to), Math.max(from, to)], block});
  });
  return pools;
};

// The pool id a block names: the Number block plugged into its id input (a constant, since the pools are made when the ROM is built), or null for any
// other block. An empty input is pool 1.
const poolIdOf = (block, name = 'ID') => {
  const target = block.getInputTargetBlock(name);
  if (!target) return 1;
  return target.type === 'math_number' ? Number(target.getFieldValue('NUM')) : null;
};

const poolsSupported = () => {
  const config = ((useConfigurationStorage() || {}).value || {});
  return config.kernel === 'dpcplus';
};

// The players a block works on: the ones of its pool id, or null when no "Sprite pool ID" block has that id.
const poolRange = (block) => {
  if (block.type === SPRITE_POOL_DEFINE) {
    const from = Number(block.getFieldValue('FROM'));
    const to = Number(block.getFieldValue('TO'));
    return [Math.min(from, to), Math.max(from, to)];
  }
  const id = poolIdOf(block);
  const pool = id === null ? null : poolDefinitions(block.workspace).get(id);
  return pool ? pool.range : null;
};

// The sprites of the pool (players from to to) that the blocks inside a "spawn" or "for each" block name: the pool works on one sprite at a time through the
// exchange of the sprites' state, so a block naming one of them cannot be built (see utils/sprite-pool.js).
const namedPoolMembers = (block, from, to) => {
  if (from === to || !['sprite_pool_spawn', 'sprite_pool_each'].includes(block.type)) return [];
  const input = block.getInput('DO');
  const first = input && input.connection && input.connection.targetBlock();
  if (!first) return [];
  const names = new Set();
  first.getDescendants(false).forEach((inner) => inner.inputList.forEach((row) => row.fieldRow.forEach((field) => {
    const value = String(field.getValue());
    const match = field.name === 'PLAYER' ? /^(\d+)$/.exec(value) : /^player(\d+)(?!\d)/.exec(value);
    if (match && Number(match[1]) >= from && Number(match[1]) <= to) names.add(Number(match[1]));
  })));
  return [...names].sort((a, b) => a - b);
};

// Two pools that are not the same range but share a sprite would hand the same sprite out twice.
const poolWarning = (block) => {
  if (!block.workspace || block.workspace.isFlyout || block.isInsertionMarker()) return;
  const text = [];
  const range = poolRange(block);
  if (!poolsSupported()) text.push('Sprite pools work on the DPC+ and PXE kernels, not on the standard kernel: this block is left out of the build.');
  if (block.type === SPRITE_POOL_DEFINE) {
    const [from, to] = range;
    const id = Number(block.getFieldValue('ID'));
    if (Number(block.getFieldValue('FROM')) > Number(block.getFieldValue('TO'))) text.push(`The pool starts after it ends: it is used as ${from} to ${to}.`);
    const same = poolDefinitions(block.workspace).get(id);
    if (same && same.block !== block) text.push(`Another Sprite pool ID block has the id ${id}: only the first one is used, this one is left out.`);
    // Two pools that share a sprite would hand the same sprite out twice.
    const clash = [...poolDefinitions(block.workspace).values()].find((other) => other.block !== block && other.id !== id && other.range[0] <= to && other.range[1] >= from);
    if (clash) text.push(`Pool ${clash.id} (players ${clash.range[0]} to ${clash.range[1]}) shares a sprite with this one (players ${from} to ${to}): they could hand out the same sprite twice.`);
  } else if (poolIdOf(block) === null) {
    text.push('The pool id has to be a Number block: the pools are made when the ROM is built, so the id cannot change while the game runs. The block is left out of the build.');
  } else if (!range) {
    text.push(`No Sprite pool ID block has the id ${poolIdOf(block)}${poolIdOf(block) > SPRITE_POOL_MAX_ID ? ` (the pool ids are 1 to ${SPRITE_POOL_MAX_ID})` : ''}: this block is left out of the build.`);
  } else if (block.type === 'sprite_pool_release_player') {
    const player = Number(block.getFieldValue('PLAYER'));
    if (player < range[0] || player > range[1]) text.push(`Player ${player} is not in pool ${poolIdOf(block)} (players ${range[0]} to ${range[1]}): the block is left out of the build.`);
  } else {
    const named = namedPoolMembers(block, range[0], range[1]);
    if (named.length) text.push(`Blocks inside name ${named.map((n) => `Player ${n}`).join(' and ')}, a sprite of this pool: they are left out of the build. Use "pool sprite" in them, or put them outside the pool.`);
  }
  block.setWarningText(text.length ? text.join(' ') : null);
};

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'sprite_pool_define',
    'message0': `${PLAYER_ICON} Sprite pool ID %1: players %2 to %3`,
    'args0': [
      {'type': 'field_number', 'name': 'ID', 'value': 1, 'min': 1, 'max': 4, 'precision': 1},
      {'type': 'field_dropdown', 'name': 'FROM', 'options': poolSpriteOptions},
      {'type': 'field_dropdown', 'name': 'TO', 'options': poolSpriteOptions},
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning'],
    'tooltip': 'Makes a sprite pool: gives the players from the first to the last the id, so the other Sprite pool blocks only name the id. Put it once, anywhere ' +
      '(System start is a good place); it does nothing while the game runs. Two pools should not share a player.',
  },
  {
    'type': 'sprite_pool_spawn',
    'message0': `${PLAYER_ICON} Sprite pool ID %1 spawn in a free sprite`,
    'args0': [
      {'type': 'input_value', 'name': 'ID', 'check': 'Number'},
    ],
    'message1': '%1',
    'args1': [{'type': 'input_statement', 'name': 'DO'}],
    'message2': 'if no sprite is free %1',
    'args2': [{'type': 'input_statement', 'name': 'FULL'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning', 'sprite_pool_id_shadow'],
    'tooltip': 'Takes the first free (hidden) sprite of the pool, shows it and runs the blocks inside with it as the "pool sprite" (choose that in a ' +
      'Player block\'s player list). Set its position and look with those blocks. When every sprite of the pool is in use the blocks under "if no sprite is ' +
      'free" run instead. The blocks inside are built once for each sprite of the pool. Hide the pool at the start of the game with "Release all sprites in pool".',
  },
  {
    'type': 'sprite_pool_each',
    'message0': `${PLAYER_ICON} For each active sprite in pool ID %1`,
    'args0': [
      {'type': 'input_value', 'name': 'ID', 'check': 'Number'},
    ],
    'message1': '%1',
    'args1': [{'type': 'input_statement', 'name': 'DO'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning', 'sprite_pool_id_shadow'],
    'tooltip': 'Runs the blocks inside once for each sprite of the pool that is shown, with that sprite as the "pool sprite" (choose that in a ' +
      'Player block\'s player list). The blocks inside are built once for each sprite of the pool.',
  },
  {
    'type': 'sprite_pool_release',
    'message0': `${PLAYER_ICON} Release the pool sprite, set x and y to 0 %1`,
    'args0': [{'type': 'field_checkbox', 'name': 'ORIGIN', 'checked': false}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'tooltip': 'Hides the pool sprite, so the pool can hand it out again. Only inside a Sprite pool block.',
  },
  {
    'type': 'sprite_pool_release_player',
    'message0': `${PLAYER_ICON} Release player %1 of pool ID %2, set x and y to 0 %3`,
    'args0': [
      {'type': 'field_dropdown', 'name': 'PLAYER', 'options': poolSpriteOptions},
      {'type': 'input_value', 'name': 'ID', 'check': 'Number'},
      {'type': 'field_checkbox', 'name': 'ORIGIN', 'checked': false},
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning', 'sprite_pool_id_shadow'],
    'tooltip': 'Makes one sprite of the pool free again (it is hidden), from anywhere: a collision or any other block, not only inside a Sprite pool block. The pool can ' +
      'hand it out again. The player has to be one of the players of the pool with that id.',
  },
  {
    'type': 'sprite_pool_release_all',
    'message0': `${PLAYER_ICON} Release all sprites in pool ID %1, set x and y to 0 %2`,
    'args0': [
      {'type': 'input_value', 'name': 'ID', 'check': 'Number'},
      {'type': 'field_checkbox', 'name': 'ORIGIN', 'checked': false},
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning', 'sprite_pool_id_shadow'],
    'tooltip': 'Hides every sprite of the pool, so all of them are free. Use it at the start of the game.',
  },
  {
    'type': 'sprite_pool_full',
    'message0': `${PLAYER_ICON} Sprite pool ID %1 is full`,
    'args0': [
      {'type': 'input_value', 'name': 'ID', 'check': 'Number'},
    ],
    'output': 'Boolean',
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning', 'sprite_pool_id_shadow'],
    'tooltip': 'True while every sprite of the pool is shown (none is free to spawn in).',
  },
  {
    'type': 'sprite_pool_free',
    'message0': `${PLAYER_ICON} Sprite pool ID %1 has a free sprite`,
    'args0': [
      {'type': 'input_value', 'name': 'ID', 'check': 'Number'},
    ],
    'output': 'Boolean',
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning', 'sprite_pool_id_shadow'],
    'tooltip': 'True while at least one sprite of the pool is hidden, free to spawn in. Plug it into an If block to spawn only when there is room.',
  },
]);

// The id input of a block that names a pool starts with a Number block (1) in it, wherever the block comes from (the toolbox, its search, a copy): a block that a
// saved project has gets the number block it was saved with in its place.
Blockly.Extensions.register('sprite_pool_id_shadow', function() {
  // eslint-disable-next-line no-invalid-this
  const input = this.getInput('ID');
  if (!input || !input.connection) return;
  try {
    input.connection.setShadowState({type: 'math_number', fields: {NUM: 1}});
  } catch (e) {
    // (the socket stays empty, which is pool 1)
  }
});

Blockly.Extensions.register('sprite_pool_warning', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  block.setOnChange(() => poolWarning(block));
});

// "Pool sprite" means the sprite a Sprite pool block is working on, so the lists that offer it (the Player blocks' player lists and the
// others that name a sprite) only show it for a block that is inside the blocks of a "spawn" or "for each" pool block. A block that already has it
// keeps showing it (a block taken out of a pool, or one a project was saved with), and the build leaves such a block out.
// "All pool sprites" (blocks that do something, in a project that has a pool block) and "any pool sprite" (the Collided block) work anywhere in a block that
// takes them: the block shows a range of the pool to use, and the build makes a copy of it for each sprite of the range (see utils/sprite-pool.js).
const isPoolValue = (value) => typeof value === 'string' && /^(player)?pool(all|any)?$/.test(value);
const isMultiValue = (value) => typeof value === 'string' && /^(player)?pool(all|any)$/.test(value);
const insidePoolBody = (block) => {
  for (let current = block; current && current.getParent();) {
    const parent = current.getParent();
    if (['sprite_pool_spawn', 'sprite_pool_each'].includes(parent.type)) {
      const input = parent.getInputWithBlock(current);
      if (input && input.name === 'DO') return true;
    }
    current = parent;
  }
  return false;
};
// Whether the project has a block of the Sprite pool (the workspace the block is in, or the one a toolbox flyout is for).
const projectUsesPool = (block) => {
  const workspace = block.workspace && (block.workspace.targetWorkspace || block.workspace);
  return !!workspace && workspace.getAllBlocks(false).some((other) => (SPRITE_POOL_TYPES.includes(other.type) || other.type === SPRITE_POOL_DEFINE) && !other.isInsertionMarker());
};
const poolValueOffered = (value, block) => {
  if (!block) return false;
  if (/any$/.test(value)) return block.type === 'collision_get' || block.type === 'sprite_overlap_event' || block.type === 'trigger_fired';
  // "All pool sprites" only shows in a project that has a pool block: without one there is no pool for it to mean.
  if (/all$/.test(value)) return (!!block.previousConnection || block.type === 'collision_get' || block.type === 'sprite_overlap_event') && projectUsesPool(block);
  return insidePoolBody(block);
};
const rawGetOptions = Blockly.FieldDropdown.prototype.getOptions;
Blockly.FieldDropdown.prototype.getOptions = function(useCache) {
  const options = rawGetOptions.call(this, useCache);
  if (!options.some((option) => isPoolValue(option[1]))) return options;
  const block = this.getSourceBlock();
  return options.filter((option) => !isPoolValue(option[1]) || option[1] === this.getValue() || poolValueOffered(option[1], block));
};
// (A block is made, and loaded from a project, before it is put in its place: the value is accepted whenever the list has it at all.)
const rawValidate = Blockly.FieldDropdown.prototype.doClassValidation_;
Blockly.FieldDropdown.prototype.doClassValidation_ = function(newValue) {
  if (isPoolValue(newValue) && rawGetOptions.call(this, true).some((option) => option[1] === newValue)) return newValue;
  return rawValidate.call(this, newValue);
};
// A block with "all pool sprites" or "any pool sprite" chosen shows which sprites of the pool they are.
const syncPoolRange = (block) => {
  if (!block.workspace || block.isInsertionMarker() || (typeof block.isDeadOrDying === 'function' && block.isDeadOrDying())) return;
  const multi = block.inputList.some((input) => input.fieldRow.some((field) => field instanceof Blockly.FieldDropdown && isMultiValue(field.getValue())));
  const shown = block.getInput('POOLID');
  if (multi && !shown) {
    const input = block.appendValueInput('POOLID').setCheck('Number').appendField(' pool ID');
    try {
      input.connection.setShadowState({type: 'math_number', fields: {NUM: 1}});
    } catch (e) {
      // (the block still works with the socket empty: pool 1)
    }
  } else if (!multi && shown) {
    block.removeInput('POOLID');
  }
};
const rawUpdate = Blockly.FieldDropdown.prototype.doValueUpdate_;
Blockly.FieldDropdown.prototype.doValueUpdate_ = function(newValue) {
  rawUpdate.call(this, newValue);
  const block = this.getSourceBlock();
  if (block && block.inputList && block.inputList.length && (isMultiValue(newValue) || block.getInput('POOLID'))) syncPoolRange(block);
};

// The blocks the build puts in place of a pool (see utils/sprite-pool.js); they are never in the toolbox.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'sprite_pool_body',
    'message0': 'Sprite pool blocks %1 %2',
    'args0': [{'type': 'field_input', 'name': 'NAME', 'text': 'poolbody'}, {'type': 'input_statement', 'name': 'DO'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_body_call',
    'message0': 'Run sprite pool blocks %1 in %2',
    'args0': [{'type': 'field_input', 'name': 'NAME', 'text': 'poolbody'}, {'type': 'field_input', 'name': 'HOST', 'text': ''}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_step',
    'message0': 'Run pool %4 for sprite %2 in %3 (first sprite %1)',
    'args0': [{'type': 'field_input', 'name': 'FROM', 'text': '1'}, {'type': 'field_input', 'name': 'TO', 'text': '2'}, {'type': 'field_input', 'name': 'HOST', 'text': ''},
      {'type': 'field_input', 'name': 'BODY', 'text': ''}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_visible',
    'message0': 'Sprite %1 is shown (%2)',
    'args0': [{'type': 'field_input', 'name': 'PLAYER', 'text': '2'}, {'type': 'field_input', 'name': 'VISIBLE', 'text': '1'}],
    'output': 'Boolean',
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_exit_set',
    'message0': 'Pool exit %1 value %2',
    'args0': [{'type': 'field_input', 'name': 'CODE', 'text': '0'}, {'type': 'input_value', 'name': 'VALUE'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_exit_get',
    'message0': 'Pool exit',
    'output': 'Number',
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_exit_value',
    'message0': 'Pool exit value',
    'output': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_label',
    'message0': 'Pool label %1',
    'args0': [{'type': 'field_input', 'name': 'NAME', 'text': ''}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_goto',
    'message0': 'Pool go to %1',
    'args0': [{'type': 'field_input', 'name': 'NAME', 'text': ''}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_shadow',
    'message0': 'Sprite pool copy %1',
    'args0': [{'type': 'input_statement', 'name': 'DO'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
]);
