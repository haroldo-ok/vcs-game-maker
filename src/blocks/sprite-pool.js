import * as Blockly from 'blockly/core';

import {PLAYER_ICON} from './icon';
import {useConfigurationStorage} from '../hooks/project';
import {playerCount, isPxe} from '../utils/pxe';

// The sprite pool blocks share a range of the virtual sprites (Player 1 and up) out among the things a game makes while it runs, such as
// the powerups of Bricks: the blocks inside a pool block say what to do with "pool sprite", and the build makes a copy of them for each sprite
// of the pool (see utils/sprite-pool.js). A sprite is free while it is hidden.
export const SPRITE_POOL_COLOUR = '#3f7f93';
export const SPRITE_POOL_TYPES = ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release_all', 'sprite_pool_full'];

// The sprites a pool can span: Player 1 up to the last one the kernel has.
const poolSpriteOptions = function() {
  const count = Math.max(2, playerCount(((useConfigurationStorage() || {}).value || {})));
  return Array.from({length: count - 1}, (_, i) => [String(i + 1), String(i + 1)]);
};

// The sprites a block that is not made for the extra players can offer: Player 0 and 1, and under DPC+ the virtual sprites (Player 2 to 9) and the
// pool sprite. (Not PXE, whose sprites those blocks do not handle.) The missiles and the ball come after.
export const spriteOptionsWithPool = (extraOptions) => function() {
  const config = ((useConfigurationStorage() || {}).value || {});
  const count = isPxe(config) ? 2 : Math.min(10, playerCount(config));
  return [...Array.from({length: count}, (_, i) => [PLAYER_ICON + ' Player ' + i, 'player' + i]),
    ...(count > 2 ? [[PLAYER_ICON + ' Pool sprite', 'playerpool']] : []), ...extraOptions];
};

const poolRange = (block) => {
  const from = Number(block.getFieldValue('FROM'));
  const to = Number(block.getFieldValue('TO'));
  return [Math.min(from, to), Math.max(from, to)];
};

// Two pools that are not the same range but share a sprite would hand the same sprite out twice.
const poolWarning = (block) => {
  if (!block.workspace || block.workspace.isFlyout || block.isInsertionMarker()) return;
  const [from, to] = poolRange(block);
  const text = [];
  if (Number(block.getFieldValue('FROM')) > Number(block.getFieldValue('TO'))) text.push(`The pool starts after it ends: it is used as ${from} to ${to}.`);
  const clash = block.workspace.getAllBlocks(false).filter((other) => other !== block && SPRITE_POOL_TYPES.includes(other.type) && !other.isInsertionMarker())
      .map(poolRange).find(([otherFrom, otherTo]) => (otherFrom !== from || otherTo !== to) && otherFrom <= to && otherTo >= from);
  if (clash) text.push(`Another pool (players ${clash[0]} to ${clash[1]}) shares a sprite with this one (players ${from} to ${to}): it could hand out the same sprite twice.`);
  block.setWarningText(text.length ? text.join(' ') : null);
};

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'sprite_pool_spawn',
    'message0': `${PLAYER_ICON} Sprite pool: players %1 to %2 spawn in a free sprite`,
    'args0': [
      {'type': 'field_dropdown', 'name': 'FROM', 'options': poolSpriteOptions},
      {'type': 'field_dropdown', 'name': 'TO', 'options': poolSpriteOptions},
    ],
    'message1': '%1',
    'args1': [{'type': 'input_statement', 'name': 'DO'}],
    'message2': 'if no sprite is free %1',
    'args2': [{'type': 'input_statement', 'name': 'FULL'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning'],
    'tooltip': 'Takes the first free (hidden) sprite of the pool, shows it and runs the blocks inside with it as the "pool sprite" (choose that in a ' +
      'Player block\'s player list). Set its position and look with those blocks. When every sprite of the pool is in use the blocks under "if no sprite is ' +
      'free" run instead. The blocks inside are built once for each sprite of the pool. Hide the pool at the start of the game with "Release all sprites in pool".',
  },
  {
    'type': 'sprite_pool_each',
    'message0': `${PLAYER_ICON} For each active sprite in pool: players %1 to %2`,
    'args0': [
      {'type': 'field_dropdown', 'name': 'FROM', 'options': poolSpriteOptions},
      {'type': 'field_dropdown', 'name': 'TO', 'options': poolSpriteOptions},
    ],
    'message1': '%1',
    'args1': [{'type': 'input_statement', 'name': 'DO'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning'],
    'tooltip': 'Runs the blocks inside once for each sprite of the pool that is shown, with that sprite as the "pool sprite" (choose that in a ' +
      'Player block\'s player list). The blocks inside are built once for each sprite of the pool.',
  },
  {
    'type': 'sprite_pool_release',
    'message0': `${PLAYER_ICON} Release the pool sprite`,
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'tooltip': 'Hides the pool sprite, so the pool can hand it out again. Only inside a Sprite pool block.',
  },
  {
    'type': 'sprite_pool_release_all',
    'message0': `${PLAYER_ICON} Release all sprites in pool: players %1 to %2`,
    'args0': [
      {'type': 'field_dropdown', 'name': 'FROM', 'options': poolSpriteOptions},
      {'type': 'field_dropdown', 'name': 'TO', 'options': poolSpriteOptions},
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning'],
    'tooltip': 'Hides every sprite of the pool, so all of them are free. Use it at the start of the game.',
  },
  {
    'type': 'sprite_pool_full',
    'message0': `${PLAYER_ICON} Sprite pool: players %1 to %2 is full`,
    'args0': [
      {'type': 'field_dropdown', 'name': 'FROM', 'options': poolSpriteOptions},
      {'type': 'field_dropdown', 'name': 'TO', 'options': poolSpriteOptions},
    ],
    'output': 'Boolean',
    'colour': SPRITE_POOL_COLOUR,
    'extensions': ['sprite_pool_warning'],
    'tooltip': 'True while every sprite of the pool is shown (none is free to spawn in).',
  },
]);

Blockly.Extensions.register('sprite_pool_warning', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  block.setOnChange(() => poolWarning(block));
});

// "Pool sprite" means the sprite a Sprite pool block is working on, so the lists that offer it (the Player blocks' player lists and the
// others that name a sprite) only show it for a block that is inside the blocks of a "spawn" or "for each" pool block. A block that already has it
// keeps showing it (a block taken out of a pool, or one a project was saved with), and the build leaves such a block out.
// "All pool sprites" (blocks that do something) and "any pool sprite" (the Collided block) work anywhere: the block shows a range of the pool to
// use, and the build makes a copy of it for each sprite of the range (see utils/sprite-pool.js).
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
const poolValueOffered = (value, block) => {
  if (!block) return false;
  if (/any$/.test(value)) return block.type === 'collision_get';
  if (/all$/.test(value)) return !!block.previousConnection || block.type === 'collision_get';
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
  const shown = block.getInput('POOLRANGE');
  if (multi && !shown) {
    block.appendDummyInput('POOLRANGE').appendField(' pool players').appendField(new Blockly.FieldDropdown(poolSpriteOptions), 'POOLFROM')
        .appendField('to').appendField(new Blockly.FieldDropdown(poolSpriteOptions), 'POOLTO');
    const last = poolSpriteOptions().map((option) => option[1]).includes('3') ? '3' : null;
    if (last) block.setFieldValue(last, 'POOLTO');
  } else if (!multi && shown) {
    block.removeInput('POOLRANGE');
  }
};
const rawUpdate = Blockly.FieldDropdown.prototype.doValueUpdate_;
Blockly.FieldDropdown.prototype.doValueUpdate_ = function(newValue) {
  rawUpdate.call(this, newValue);
  const block = this.getSourceBlock();
  if (block && block.inputList && block.inputList.length && (isMultiValue(newValue) || block.getInput('POOLRANGE'))) syncPoolRange(block);
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
    'message0': 'Run sprite pool blocks %1',
    'args0': [{'type': 'field_input', 'name': 'NAME', 'text': 'poolbody'}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SPRITE_POOL_COLOUR,
  },
  {
    'type': 'sprite_pool_swap',
    'message0': 'Swap sprites %1 and %2',
    'args0': [{'type': 'field_input', 'name': 'FROM', 'text': '1'}, {'type': 'field_input', 'name': 'TO', 'text': '2'}],
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
