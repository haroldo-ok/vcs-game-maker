import * as Blockly from 'blockly/core';

import {PLAYER_ICON} from './icon';
import {useConfigurationStorage} from '../hooks/project';
import {playerCount} from '../utils/pxe';

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
