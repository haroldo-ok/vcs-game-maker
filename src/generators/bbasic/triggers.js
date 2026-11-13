'use strict';

// The triggers of the scenes (see utils/scene.js): rectangles of the picture that a sprite sets off by coming into them. They only exist in the
// build when a project has a block that uses one ("On trigger", "Trigger fired"). The Scene tab's "Set scene" blocks become ordinary blocks when
// the project is built, and so do the triggers: an event "Gameplay update" is added whose blocks are
//
//   trigger_clear   puts the "fired" bit of every trigger back to 0 (the bit is true for the one frame a "trigger fired" block is)
//   trigger_check   one for each trigger: the boxes of the sprites that can set it off against its rectangle; when one is in it and none was at the
//                   end of the last frame, the trigger fired
//   scene_mark      at the end of the blocks of every scene: which scene is showing, and the triggers of it are counted as having a sprite in
//                   them already (so a sprite that is in a trigger when its scene is set up does not set it off before it has gone out of it)
//
// The variables are bits of the shared flag bytes (see flag-pool.js): a bit for each scene that has triggers (the scene showing; a byte when there
// are more than eight), a bit for each trigger for "had a sprite in it", and a bit for each trigger for "fired".
//
// The sprite's box is the one the Collided blocks use (sprite-box-width.js): the width of a player is 8 pixels, or the width it has when a block
// changes it. The place of the box on the picture is the one the Scene tab draws the sprite at (the rectangles of a trigger are in pixels from the
// left and lines from the top of the picture).

import {flagPoolVar, flagPoolBit} from './flag-pool';
import {boxWidthVarName} from './sprite-box-width';
import {configurationValue} from '../../hooks/configuration-value';

export const TRIGGER_SCENE_VAR = '_scene';
const BITS_PER_BYTE = 8;
const MAX_SCENE_BITS = 8;
const RIGHT_EDGE_X = 177;
// Where the picture starts, in the units of the x of a sprite: the playfield's first pixel (the same number as the Scene tab's).
const PICTURE_LEFT = 16;
const SCENE_FAMILY = 'triggerScene';
const wasFamily = (index) => `triggerWas${Math.floor(index / BITS_PER_BYTE)}`;
const firedFamily = (index) => `triggerFired${Math.floor(index / BITS_PER_BYTE)}`;
const byWasFamily = (index) => `triggerByWas${Math.floor(index / BITS_PER_BYTE)}`;
const byFiredFamily = (index) => `triggerByFired${Math.floor(index / BITS_PER_BYTE)}`;

const resolve = (Blockly, name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

// The trigger blocks of the project: the checks in the order their bits are given, and the scenes they are in (one bit each, in the order of the
// first check of them). Called from init with the workspace. Returns the players whose boxes the checks need.
export const prepareTriggers = (Blockly, workspace) => {
  const blocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled());
  Blockly.BBasic.triggerChecks = blocks.filter((block) => block.type === 'trigger_check');
  Blockly.BBasic.triggerScenes = [];
  Blockly.BBasic.triggerChecks.forEach((block) => {
    const scene = block.getFieldValue('SCENE');
    if (!Blockly.BBasic.triggerScenes.includes(scene)) Blockly.BBasic.triggerScenes.push(scene);
  });
  // The scenes that work something while they show (the offset areas) have a bit as well.
  blocks.filter((block) => block.type === 'scene_active_if').forEach((block) => {
    const scene = block.getFieldValue('SCENE');
    if (!Blockly.BBasic.triggerScenes.includes(scene)) Blockly.BBasic.triggerScenes.push(scene);
  });
  Blockly.BBasic.triggerSceneUsed = Blockly.BBasic.triggerScenes.length > 0;
  Blockly.BBasic.triggerSceneBits = Blockly.BBasic.triggerScenes.length <= MAX_SCENE_BITS;
  const names = new Set();
  Blockly.BBasic.triggerChecks.forEach((block) => block.getFieldValue('SPRITES').split(',').filter((name) => /^player\d+$/.test(name))
      .forEach((name) => names.add(name)));
  // The blocks that ask for the trigger set off by one sprite ("by pool sprite", which the build has turned into the sprite by now): each trigger they mean
  // keeps two bits for that sprite, in the order of the pairs: the sprite was in it at the end of the last frame, and it fired for that sprite.
  const bySprites = (name) => blocks.filter((block) => (block.type === 'trigger_on' || block.type === 'trigger_fired') && /^player\d+$/.test(block.getFieldValue('BY') || '') &&
    (block.getFieldValue('TRIGGER') === '*' || block.getFieldValue('TRIGGER') === name)).map((block) => block.getFieldValue('BY'));
  Blockly.BBasic.triggerBy = [];
  Blockly.BBasic.triggerChecks.forEach((check, index) => [...new Set(bySprites(check.getFieldValue('NAME')))].sort().forEach((sprite) => {
    Blockly.BBasic.triggerBy.push({check, index, sprite});
    names.add(sprite);
  }));
  // (The bits of the sprites of a Sprite pool go with the sprite when the pool exchanges two of them: see generators/bbasic/sprite-pool.js.)
  Blockly.BBasic.spriteFlagBits.push(...Blockly.BBasic.triggerBy.flatMap(({index, sprite}, pair) => [
    {family: byWasFamily(pair), feature: `triggerByWas:${index}`, owners: new Set([sprite]), bitOf: () => pair % BITS_PER_BYTE},
    {family: byFiredFamily(pair), feature: `triggerByFired:${index}`, owners: new Set([sprite]), bitOf: () => pair % BITS_PER_BYTE},
  ]));
  return names;
};

const familiesFor = (count, family) => {
  const families = [];
  for (let index = 0; index < count; index++) {
    const name = family(index);
    let entry = families.find((candidate) => candidate.family === name);
    if (!entry) families.push(entry = {family: name, bits: []});
    entry.bits.push(index % BITS_PER_BYTE);
  }
  return families;
};

// The flag pool families the bits need (see flag-pool.js).
export const triggerFamilies = (Blockly) => {
  const checks = (Blockly.BBasic.triggerChecks || []).length;
  return [
    ...(Blockly.BBasic.triggerSceneUsed && Blockly.BBasic.triggerSceneBits ? [{family: SCENE_FAMILY, bits: Blockly.BBasic.triggerScenes.map((_, i) => i)}] : []),
    ...familiesFor(checks, wasFamily),
    ...familiesFor(checks, firedFamily),
    ...familiesFor((Blockly.BBasic.triggerBy || []).length, byWasFamily),
    ...familiesFor((Blockly.BBasic.triggerBy || []).length, byFiredFamily),
  ];
};

export const reserveTriggerDevVars = (reserveDevVar, Blockly) => {
  if (!Blockly.BBasic.triggerSceneUsed) return;
  const checks = (Blockly.BBasic.triggerChecks || []).length;
  if (Blockly.BBasic.triggerSceneBits) {
    reserveDevVar(flagPoolVar(SCENE_FAMILY), undefined, 'a bit for each scene that has triggers: it is the scene that is showing');
  } else {
    reserveDevVar(TRIGGER_SCENE_VAR, undefined, 'the scene that is showing (the ID of its card), for its triggers');
  }
  familiesFor(checks, wasFamily).forEach(({family}) => {
    reserveDevVar(flagPoolVar(family), undefined, 'a bit for each trigger of a scene: a sprite was in it at the end of the last frame');
  });
  familiesFor(checks, firedFamily).forEach(({family}) => {
    reserveDevVar(flagPoolVar(family), undefined, 'a bit for each trigger of a scene: it acted in the last frame (what the trigger blocks read)');
  });
  familiesFor((Blockly.BBasic.triggerBy || []).length, byWasFamily).forEach(({family}) => {
    reserveDevVar(flagPoolVar(family), undefined, 'a bit for each trigger and sprite a trigger block asks about: the sprite was in the trigger at the end of the last frame');
  });
  familiesFor((Blockly.BBasic.triggerBy || []).length, byFiredFamily).forEach(({family}) => {
    reserveDevVar(flagPoolVar(family), undefined, 'a bit for each trigger and sprite a trigger block asks about: the trigger acted for that sprite in the last frame');
  });
};

const bit = (Blockly, family, index) =>
  `${resolve(Blockly, flagPoolVar(family(index)))}{${flagPoolBit(family(index), index % BITS_PER_BYTE)}}`;
const byBit = (Blockly, family, pair) =>
  `${resolve(Blockly, flagPoolVar(family(pair)))}{${flagPoolBit(family(pair), pair % BITS_PER_BYTE)}}`;
const sceneBit = (Blockly, scene) => {
  const index = Blockly.BBasic.triggerScenes.indexOf(scene);
  return `${resolve(Blockly, flagPoolVar(SCENE_FAMILY))}{${flagPoolBit(SCENE_FAMILY, index)}}`;
};

// Where a sprite is drawn, and so where its box is, in the x and y numbers its variables hold (see spriteRects of the Scene tab, measured against
// the emulator): the pixels from the first column of the picture to the left edge of the sprite are x minus this.
const leftOffset = (name, dpcPlus) => (dpcPlus ? (/^player0$/.test(name) ? 13 : /^player/.test(name) ? 16 : 14) : (/^player/.test(name) ? 17 : 18));

const boxWidthOf = (Blockly, name) => {
  if (!/^player\d+$/.test(name)) return {fixed: 2};
  if ((Blockly.BBasic.boxFixedPlayers || new Set()).has(name)) return {fixed: 8};
  return {variable: resolve(Blockly, boxWidthVarName(name))};
};

export default (Blockly) => {
  const checks = () => Blockly.BBasic.triggerChecks || [];
  // The fired bits of the triggers a block means: the ones with a name (every one for "any trigger").
  const firedRefsByName = (name) => checks().map((check, index) => ({check, index}))
      .filter(({check}) => name === '*' || check.getFieldValue('NAME') === name)
      .map(({index}) => bit(Blockly, firedFamily, index));
  const placeOf = (check) => Number(check.getFieldValue('KEY').split(':')[1]) + 1;
  const sceneOf = (check) => Number(check.getFieldValue('SCENE')) || 0;

  Blockly.BBasic['trigger_clear'] = function() {
    if (!Blockly.BBasic.triggerSceneUsed) return '';
    // (A bit at a time: the byte is shared with other bits.)
    return [...checks().map((_, index) => ` ${bit(Blockly, firedFamily, index)} = 0`),
      ...(Blockly.BBasic.triggerBy || []).map((_, pair) => ` ${byBit(Blockly, byFiredFamily, pair)} = 0`)].join('\n') + '\n';
  };
  // The "fired for the sprite" bits of the triggers a block means that are asked about for the sprite (every trigger for "any trigger").
  const firedByRefs = (name, sprite) => (Blockly.BBasic.triggerBy || []).map((pair, index) => ({pair, index}))
      .filter(({pair}) => pair.sprite === sprite && (name === '*' || pair.check.getFieldValue('NAME') === name))
      .map(({index}) => byBit(Blockly, byFiredFamily, index));
  const firedRefsFor = (block) => (/^player\d+$/.test(block.getFieldValue('BY') || '') ?
    firedByRefs(block.getFieldValue('TRIGGER'), block.getFieldValue('BY')) : firedRefsByName(block.getFieldValue('TRIGGER')));

  // The scene that is showing, and its triggers counted as having a sprite in them (see the top of this file).
  Blockly.BBasic['scene_mark'] = function(block) {
    if (!Blockly.BBasic.triggerSceneUsed) return '';
    const id = block.getFieldValue('SCENE');
    const lines = [];
    if (Blockly.BBasic.triggerSceneBits) {
      Blockly.BBasic.triggerScenes.forEach((scene) => lines.push(` ${sceneBit(Blockly, scene)} = ${scene === id ? 1 : 0}`));
    } else {
      lines.push(` ${resolve(Blockly, TRIGGER_SCENE_VAR)} = ${Number(id) || 0}`);
    }
    checks().forEach((check, index) => {
      if (check.getFieldValue('SCENE') === id) lines.push(` ${bit(Blockly, wasFamily, index)} = 1`);
    });
    (Blockly.BBasic.triggerBy || []).forEach(({check}, pair) => {
      if (check.getFieldValue('SCENE') === id) lines.push(` ${byBit(Blockly, byWasFamily, pair)} = 1`);
    });
    return lines.length ? `${lines.join('\n')}\n` : '';
  };

  // The blocks inside run while the scene is the one showing.
  Blockly.BBasic['scene_active_if'] = function(block) {
    if (!Blockly.BBasic.triggerSceneUsed) return '';
    const scene = block.getFieldValue('SCENE');
    const id = Blockly.BBasic.blockNumbers.next('scene_if');
    const test = Blockly.BBasic.triggerSceneBits ? `!${sceneBit(Blockly, scene)}` : `${resolve(Blockly, TRIGGER_SCENE_VAR)} <> ${Number(scene) || 0}`;
    return ` if ${test} then goto _scene_if_${id}_done\n${Blockly.BBasic.statementToCode(block, 'DO')}@ _scene_if_${id}_done\n`;
  };

  // "On trigger": the blocks inside run when the "fired" bit of a trigger with the name is set (the frame a sprite came into it, for as long as the
  // frame goes on: the bit is put back to 0 at the start of the check of the next frame).
  Blockly.BBasic['trigger_on'] = function(block) {
    const refs = firedRefsFor(block);
    if (!refs.length) return '';
    const id = Blockly.BBasic.blockNumbers.next('trigger_on');
    return [...refs.map((ref) => ` if ${ref} then goto _trigger_on_${id}_hit`), ` goto _trigger_on_${id}_done`, `@ _trigger_on_${id}_hit`].join('\n') +
      `\n${Blockly.BBasic.statementToCode(block, 'DO')}@ _trigger_on_${id}_done\n`;
  };

  Blockly.BBasic['trigger_fired'] = function(block) {
    const refs = firedRefsFor(block);
    return [refs.length ? refs.join(' || ') : '0', Blockly.BBasic.ORDER_LOGICAL_OR];
  };

  // By number: the place of the trigger in the list of its scene (from 1), in the scene with the ID given (0, the scene that is showing: the
  // triggers of the scenes that are not showing never fire, so any scene does for it). A number that is typed in is compared when the code is made.
  const compare = (expression, value, equal) => {
    const code = expression.trim();
    if (/^\d+$/.test(code)) return (Number(code) === value) === equal ? '' : null;
    return `${/^\w+$/.test(code) ? code : `(${code})`} ${equal ? '=' : '<>'} ${value}`;
  };
  // The ways each trigger can be meant by the two numbers: [{fired, miss: [tests that are false when it is not meant], hit: [tests that are true]}].
  const numberTests = (block) => {
    const number = Blockly.BBasic.valueToCode(block, 'TRIGGER', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const scene = (Blockly.BBasic.valueToCode(block, 'SCENE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0').trim();
    const ways = [];
    checks().forEach((check, index) => {
      const fired = bit(Blockly, firedFamily, index);
      // (A scene ID that is not a number may also be 0, which means the scene that is showing.)
      const sceneWays = scene === '0' ? [''] : /^\d+$/.test(scene) ? [compare(scene, sceneOf(check), true)] : [compare(scene, sceneOf(check), true), compare(scene, 0, true)];
      sceneWays.forEach((sceneHit) => {
        const placeHit = compare(number, placeOf(check), true);
        if (placeHit === null || sceneHit === null) return;
        ways.push({fired, hit: [placeHit, sceneHit].filter(Boolean), miss: [compare(number, placeOf(check), false), compare(scene, sceneOf(check), false)]});
      });
    });
    return ways;
  };

  Blockly.BBasic['trigger_on_by_number'] = function(block) {
    const ways = numberTests(block);
    if (!ways.length) return '';
    const id = Blockly.BBasic.blockNumbers.next('trigger_on_number');
    const lines = [];
    ways.forEach((way, i) => {
      // (Each test of the way that is not a number typed in sends it to the next way when it is false.)
      lines.push(` if !${way.fired} then goto _trigger_n_${id}_${i}`);
      way.hit.forEach((test) => lines.push(` if !(${test}) then goto _trigger_n_${id}_${i}`));
      lines.push(` goto _trigger_n_${id}_hit`, `@ _trigger_n_${id}_${i}`);
    });
    return `${lines.join('\n')}\n goto _trigger_n_${id}_done\n@ _trigger_n_${id}_hit\n${Blockly.BBasic.statementToCode(block, 'DO')}@ _trigger_n_${id}_done\n`;
  };

  // One trigger: when a sprite that can set it off is in its rectangle and none was in it at the end of the last frame, it fires.
  Blockly.BBasic['trigger_check'] = function(block) {
    const index = checks().findIndex((check) => check.id === block.id);
    if (index < 0 || !Blockly.BBasic.triggerSceneUsed) return '';
    const sprites = block.getFieldValue('SPRITES').split(',').filter(Boolean);
    const num = (field) => Number(block.getFieldValue(field)) || 0;
    const [left, top, width, height] = ['LEFT', 'TOP', 'WIDTH', 'HEIGHT'].map(num);
    const dpcPlus = (configurationValue() || {}).kernel === 'dpcplus';
    const was = bit(Blockly, wasFamily, index);
    const fired = bit(Blockly, firedFamily, index);
    const id = Blockly.BBasic.blockNumbers.next('trigger');
    const scene = block.getFieldValue('SCENE');
    const right = left + width;
    const bottom = top + height;
    const lines = [` rem trigger ${block.getFieldValue('NAME')} of scene ${scene}:`,
      Blockly.BBasic.triggerSceneBits ? ` if !${sceneBit(Blockly, scene)} then goto _trigger_${id}_done` :
        ` if ${resolve(Blockly, TRIGGER_SCENE_VAR)} <> ${Number(scene) || 0} then goto _trigger_${id}_done`];
    // The lines that jump to `miss` when the sprite is not in the rectangle of the trigger.
    const geometry = (name, miss) => {
      const out = [];
      const x = `${name}x`;
      const y = `${name}y`;
      const heightVar = `${name}height`;
      const isPlayer = /^player\d+$/.test(name);
      const box = boxWidthOf(Blockly, name);
      const dx = leftOffset(name, dpcPlus) - PICTURE_LEFT;
      // A sprite that is hidden is not in any trigger.
      if ((Blockly.BBasic.hideablePlayers || new Set()).has(name)) out.push(` if ${name}frame = 255 then goto ${miss}`);
      if (!isPlayer) out.push(` if ${heightVar} = 0 then goto ${miss}`);
      // Across: the sprite's box is x - dx to x - dx + its width of the picture; the trigger is left to right.
      if (isPlayer) out.push(` if ${x} >= ${RIGHT_EDGE_X} then goto ${miss}`);
      if (right + dx <= 255) out.push(` if ${x} >= ${right + dx} then goto ${miss}`);
      if (box.fixed !== undefined) {
        out.push(` if (${x} + ${box.fixed}) <= ${left + dx} then goto ${miss}`);
      } else {
        out.push(` temp1 = ${x} + ${box.variable}`, ` if temp1 <= ${left + dx} then goto ${miss}`);
      }
      // Down: standard kernel, the y of a sprite is its bottom edge in steps of two lines; DPC+, the line of its top edge.
      if (!dpcPlus) {
        out.push(` if ${y} <= ${Math.floor(top / 2)} then goto ${miss}`, ` temp1 = ${Math.ceil(bottom / 2) + (isPlayer ? 1 : 0)} + ${heightVar}`,
            ` if ${y} >= temp1 then goto ${miss}`);
      } else {
        out.push(` if ${y} >= ${bottom} then goto ${miss}`, ` temp1 = ${y} + ${heightVar}`, ` if temp1 <= ${top} then goto ${miss}`);
      }
      return out;
    };
    sprites.forEach((name, i) => {
      const miss = `_trigger_${id}_miss${i}`;
      lines.push(...geometry(name, miss), ` goto _trigger_${id}_in`, `@ ${miss}`);
    });
    // No sprite is in it: it can fire again. A sprite is in it: it fires if none was.
    // (What it calls when it fires, from its card, runs then.)
    const call = Blockly.BBasic.statementToCode(block, 'DO').replace(/\n$/, '');
    lines.push(` ${was} = 0`, ` goto _trigger_${id}_main_done`, `@ _trigger_${id}_in`, ` if ${was} then goto _trigger_${id}_main_done`,
        ` ${was} = 1`, ` ${fired} = 1`, ...(call ? [call] : []), `@ _trigger_${id}_main_done`);
    // The same for each sprite a block asks about by itself (a pool sprite): it fires for that sprite when the sprite comes into the rectangle.
    (Blockly.BBasic.triggerBy || []).forEach(({check, sprite}, pair) => {
      if (check.id !== block.id) return;
      const miss = `_trigger_${id}_by${pair}_miss`;
      const wasBy = byBit(Blockly, byWasFamily, pair);
      const firedBy = byBit(Blockly, byFiredFamily, pair);
      lines.push(...geometry(sprite, miss), ` if ${wasBy} then goto _trigger_${id}_by${pair}_done`, ` ${wasBy} = 1`, ` ${firedBy} = 1`, ` goto _trigger_${id}_by${pair}_done`,
          `@ ${miss}`, ` ${wasBy} = 0`, `@ _trigger_${id}_by${pair}_done`);
    });
    lines.push(`@ _trigger_${id}_done`);
    return `${lines.join('\n')}\n`;
  };
};
