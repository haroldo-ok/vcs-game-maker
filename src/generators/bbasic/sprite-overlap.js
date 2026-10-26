'use strict';

// The "Sprite overlap starts / stops" block: true for the one frame in which two sprites begin to overlap or stop overlapping. Overlap is
// the boxes of the two sprites touching, worked out once a frame by the subroutine of sprite-box-width.js, so the block answers as of the end
// of the last frame like "Collided" does.
//
// Each block keeps two bits: whether the sprite overlapped the other at the end of the last frame, and the answer. The bits of
// four blocks fill a byte (see flag-pool.js).

import {flagPoolVar, flagPoolBit} from './flag-pool';
import {pairKey, boxHitRef} from './sprite-box-width';

const BLOCKS_PER_BYTE = 4;
export const overlapFamily = (index) => `overlapFlags${Math.floor(index / BLOCKS_PER_BYTE)}`;
const WAS_BIT = 0;
const ANSWER_BIT = 1;

// The sprite a block compares its first sprite with: none when both are the same one.
export const overlapTargetsOf = (block) => (block.getFieldValue('VAR1') === block.getFieldValue('VAR0') ? [] : [block.getFieldValue('VAR1')]);

// The pairs of sprites the enabled overlap blocks compare: [pairKey]. The names of the sprites come with them, for the box widths.
export const overlapPairsOf = (blocks) => {
  const pairs = new Set();
  const names = new Set();
  blocks.forEach((block) => overlapTargetsOf(block).forEach((target) => {
    pairs.add(pairKey(block.getFieldValue('VAR0'), target));
    names.add(block.getFieldValue('VAR0'));
    names.add(target);
  }));
  return {pairs, names};
};

// The families the plan needs for this many blocks: [{family, bits}].
export const overlapFamilies = (blockIds) => blockIds.reduce((families, _, index) => {
  const family = overlapFamily(index);
  let entry = families.find((candidate) => candidate.family === family);
  if (!entry) families.push(entry = {family, bits: []});
  const base = (index % BLOCKS_PER_BYTE) * 2;
  entry.bits.push(base + WAS_BIT, base + ANSWER_BIT);
  return families;
}, []);

const bitRef = (Blockly, index, bit) => {
  const family = overlapFamily(index);
  const name = Blockly.BBasic.nameDB_.getName(flagPoolVar(family), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  return `${name}{${flagPoolBit(family, (index % BLOCKS_PER_BYTE) * 2 + bit)}}`;
};

export const reserveOverlapDevVars = (reserveDevVar, blockIds) => {
  overlapFamilies(blockIds).forEach(({family}) => {
    reserveDevVar(flagPoolVar(family), undefined,
        'two bits for each "Sprite overlap starts / stops" block: the sprites overlapped at the end of the last frame, and the answer of the block');
  });
};

// The reference to the answer of a block, for its generator.
export const overlapAnswerRef = (Blockly, block) => {
  const index = (Blockly.BBasic.overlapBlocks || []).findIndex((candidate) => candidate.id === block.id);
  return index < 0 ? '0' : bitRef(Blockly, index, ANSWER_BIT);
};

// The statements that work the answers out, after the boxes of the sprites have been compared.
export const generateOverlapChecks = (Blockly) => {
  const lines = [];
  (Blockly.BBasic.overlapBlocks || []).forEach((block, index) => {
    const was = bitRef(Blockly, index, WAS_BIT);
    const answer = bitRef(Blockly, index, ANSWER_BIT);
    const stops = block.getFieldValue('MODE') === 'stops';
    const step = Blockly.BBasic.blockNumbers.next('overlap');
    const off = `_overlap_${step}_off`;
    const done = `_overlap_${step}_done`;
    lines.push(` rem sprite overlap ${stops ? 'stops' : 'starts'}:`, ` ${answer} = 0`, ' temp1 = 0');
    overlapTargetsOf(block).forEach((target) => {
      lines.push(` if ${boxHitRef(Blockly, pairKey(block.getFieldValue('VAR0'), target))} then temp1 = 1`);
    });
    lines.push(` if temp1 = 0 then goto ${off}`,
        ...(stops ? [] : [` if !${was} then ${answer} = 1`]),
        ` ${was} = 1`,
        ` goto ${done}`,
        off,
        ...(stops ? [` if ${was} then ${answer} = 1`] : []),
        ` ${was} = 0`,
        done);
  });
  return lines.length ? lines.join('\n') + '\n' : '';
};
