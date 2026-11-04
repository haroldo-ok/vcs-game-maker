'use strict';

import {playerCount} from './pxe';

// A scene is a Data table card (see blocks/data.js) with `scene: true`, whose values are laid out the same way for every kind of game, so that a
// stage, a level, a menu or a cut scene can all be kept in one: eight values for the header, then eight for each sprite that is placed.
//
//   header:  [format (1), background id (0 keeps the background that is showing), number of sprites, number of triggers, number of offset areas, 0, 0, 0]
//   sprite:  [object, x, y, color, size, animation, flags, height]
//   trigger:  [left, top, width, height, target x or scene, target y, sprites 0 to 7 that trigger it, kind + sprites 8 to 12]
//
//   offset area: [left column, top row, right column, bottom row, direction (a place of SCENE_OFFSET_DIRECTIONS), 1 whole playfield, how often (the
//   mask of "Every N frames": 0, 1, 3, 7... 255), plus how many frames (0 to 255, the "plus" of that block)]: the area of the playfield (columns 0 to 31 and rows from 0, as the "Playfield offset" block takes them)
//   whose pixels move one step in that direction every so many frames while the scene is showing.
//
//   A trigger is an invisible rectangle of the picture, in pixels (left, width) and lines (top, height) from the top left of the screen. A sprite that
//   touches it for the first time (and again only after it has left it) makes the trigger act for that one frame: kind 0 moves the sprite to X,Y
//   (the numbers the X and Y blocks take), kind 1 sets up the scene whose ID is the target. Which sprites can trigger it is a mask of the objects
//   (bit 0 Player 0 ... bit 9 Player 9, bit 10 Missile 0, bit 11 Missile 1, bit 12 Ball): the low 8 bits are the seventh value, the others the
//   bits 1 to 5 of the eighth, whose bit 0 is the kind. The names of the triggers (for the "trigger fired" block) are kept beside the values.
//
//   object:  0 to 9 Player 0 to 9, 10 Missile 0, 11 Missile 1, 12 the Ball
//   x, y:    what the sprite's X and Y blocks take (the same numbers as "Player 0 set X to"), 0 to 255
//   color:   the color byte, 0 to 254
//   size:    a player's width and number of copies (what NUSIZ takes, 0 to 7: the options of "Player set width/quantity"); a missile's and the
//            ball's width as a code, 0 to 3 for 1, 2, 4 and 8 pixels
//   animation: the number of the player's animation (the position in the Sprites tab's list), 255 when none
//   flags:   bit 0 hidden, bit 1 set the color, bit 2 set the size, bit 3 set the animation, bit 4 the player faces left, bit 5 set the height
//   height:  a missile's or the ball's height in lines (a player's height is its picture's)
//
// The Data table card holds eight values to a row, so a header and each sprite are a row of the card.

export const SCENE_FORMAT = 1;
export const SCENE_RECORD_SIZE = 8;
export const SCENE_TRIGGER_MOVE = 0;
export const SCENE_TRIGGER_LOAD = 1;
// A trigger that does nothing by itself: the project's blocks ("On trigger", "Trigger fired") act for it.
export const SCENE_TRIGGER_NONE = 2;
// The ways a "Playfield offset" area moves its pixels (the choices of the block, in the order of its list), and how often: every 1, 2, 4... 256 frames
// (the mask of the "Every N frames" block, 0 to 255).
export const SCENE_OFFSET_DIRECTIONS = ['alternate', 'alternate_rl', 'left', 'right', 'alternate_ud', 'alternate_du', 'up', 'down'];
export const SCENE_OFFSET_MASKS = [0, 1, 3, 7, 15, 31, 63, 127, 255];
export const SCENE_SCREEN_WIDTH = 160;
export const SCENE_SCREEN_LINES = 192;
export const SCENE_NO_ANIMATION = 255;
export const SCENE_FLAG_HIDDEN = 1;
export const SCENE_FLAG_COLOR = 2;
export const SCENE_FLAG_SIZE = 4;
export const SCENE_FLAG_ANIMATION = 8;
export const SCENE_FLAG_FLIPPED = 16;
export const SCENE_FLAG_HEIGHT = 32;

export const SCENE_OBJECT_NAMES = [
  'player0', 'player1', 'player2', 'player3', 'player4', 'player5', 'player6', 'player7', 'player8', 'player9', 'missile0', 'missile1', 'ball',
  // (The sprites of PXE past Player 9 come after the ball, so the numbers of the sprites a project already has stay what they were.)
  'player10', 'player11', 'player12', 'player13', 'player14', 'player15', 'player16',
];
const SCENE_OBJECT_LABELS = [
  'Player 0', 'Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8', 'Player 9', 'Missile 0', 'Missile 1', 'Ball',
  'Player 10', 'Player 11', 'Player 12', 'Player 13', 'Player 14', 'Player 15', 'Player 16',
];
export const sceneObjectName = (object) => SCENE_OBJECT_NAMES[object] || 'player0';
export const sceneObjectLabel = (object) => SCENE_OBJECT_LABELS[object] || 'Player 0';
export const isScenePlayer = (object) => (object >= 0 && object <= 9) || (object >= 13 && object <= 19);
// The number of the player a scene sprite is.
export const scenePlayerNumber = (object) => (object >= 13 ? object - 3 : object);
// The sprites a trigger can be set off by: the ones its record has room for (the players 10 to 16 of PXE are left out).
export const SCENE_TRIGGER_OBJECT_LIMIT = 12;
export const MISSILE_WIDTHS = [1, 2, 4, 8];

// The sprites a scene can hold under the kernel and options of the project: Player 0 and the missiles and the ball on the standard kernel; with
// DPC+ also the virtual sprites that the Options tab has turned on (Player 1 up to the highest one that is on).
export const availableSceneObjects = (config) => {
  const dpcPlus = !!config && config.kernel === 'dpcplus';
  const highest = playerCount(config) - 1;
  const configured = config && config.dpcPlusSpriteMax;
  const virtual = configured === undefined || configured === null ? 9 : Math.min(highest, Math.max(1, Number(configured) || 1));
  const players = dpcPlus ? Array.from({length: Math.min(virtual, 9) + 1}, (_, i) => i) : [0, 1];
  const pxePlayers = virtual > 9 ? Array.from({length: virtual - 9}, (_, i) => 13 + i) : [];
  return [...players, 10, 11, 12, ...pxePlayers];
};

const clampByte = (value, fallback = 0) => {
  const number = Math.round(Number(value));
  return Number.isFinite(number) ? Math.min(255, Math.max(0, number)) : fallback;
};

// A sprite as the scene editor holds it, with every field filled in.
export const newSceneObject = (object) => ({
  object,
  x: isScenePlayer(object) ? 80 : 90,
  y: isScenePlayer(object) ? 50 : 40,
  color: object === 1 ? 0x80 : object === 0 ? 0x40 : (object * 3 % 16) * 16 + 14,
  size: 0,
  animation: SCENE_NO_ANIMATION,
  flags: 0,
  height: 4,
});

// An offset area as the scene editor holds it, with every field filled in: the middle of the playfield, moving left every 4 frames.
export const newSceneOffset = () => ({left: 4, top: 2, right: 27, bottom: 7, direction: 'left', whole: false, mask: 3, delta: 0});

// A trigger as the scene editor holds it, with every field filled in: a move trigger that every sprite the project has can trigger.
export const newSceneTrigger = (name, config) => ({
  name,
  left: 56,
  top: 80,
  width: 32,
  height: 32,
  kind: SCENE_TRIGGER_NONE,
  targetX: 80,
  targetY: 50,
  targetScene: 0,
  mask: availableSceneObjects(config).filter((object) => object <= SCENE_TRIGGER_OBJECT_LIMIT).reduce((mask, object) => mask | (1 << object), 0),
});

export const isSceneTable = (table) => !!(table && table.scene);

// The scene a Data table's values hold. names: the names of its triggers (kept beside the values).
export const decodeScene = (values, names = []) => {
  const list = Array.isArray(values) ? values : [];
  const count = Math.min(Math.max(0, clampByte(list[2])), Math.floor((list.length - SCENE_RECORD_SIZE) / SCENE_RECORD_SIZE));
  const triggerCount = Math.min(Math.max(0, clampByte(list[3])),
      Math.floor((list.length - SCENE_RECORD_SIZE - count * SCENE_RECORD_SIZE) / SCENE_RECORD_SIZE));
  const triggers = [];
  for (let i = 0; i < triggerCount; i++) {
    const at = SCENE_RECORD_SIZE * (1 + count + i);
    const flags = clampByte(list[at + 7]);
    const kind = flags & 64 ? SCENE_TRIGGER_NONE : flags & 1 ? SCENE_TRIGGER_LOAD : SCENE_TRIGGER_MOVE;
    triggers.push({
      name: (names && names[i]) || `Trigger ${i + 1}`,
      left: clampByte(list[at]),
      top: clampByte(list[at + 1]),
      width: Math.max(1, clampByte(list[at + 2], 1)),
      height: Math.max(1, clampByte(list[at + 3], 1)),
      kind,
      targetX: kind === SCENE_TRIGGER_MOVE ? clampByte(list[at + 4]) : 80,
      targetY: kind === SCENE_TRIGGER_MOVE ? clampByte(list[at + 5]) : 50,
      targetScene: kind === SCENE_TRIGGER_LOAD ? clampByte(list[at + 4]) : 0,
      mask: clampByte(list[at + 6]) | ((flags >> 1) & 31) << 8,
    });
  }
  const offsetCount = Math.min(Math.max(0, clampByte(list[4])),
      Math.floor((list.length - SCENE_RECORD_SIZE * (1 + count + triggerCount)) / SCENE_RECORD_SIZE));
  const offsets = [];
  for (let i = 0; i < offsetCount; i++) {
    const at = SCENE_RECORD_SIZE * (1 + count + triggerCount + i);
    offsets.push({
      left: Math.min(31, clampByte(list[at])),
      top: clampByte(list[at + 1]),
      right: Math.min(31, clampByte(list[at + 2])),
      bottom: clampByte(list[at + 3]),
      direction: SCENE_OFFSET_DIRECTIONS[clampByte(list[at + 4])] || 'left',
      whole: clampByte(list[at + 5]) === 1,
      mask: SCENE_OFFSET_MASKS.includes(clampByte(list[at + 6])) ? clampByte(list[at + 6]) : 3,
      delta: clampByte(list[at + 7]),
    });
  }
  const objects = [];
  for (let i = 0; i < count; i++) {
    const at = SCENE_RECORD_SIZE * (i + 1);
    objects.push({
      object: Math.min(SCENE_OBJECT_NAMES.length - 1, clampByte(list[at])),
      x: clampByte(list[at + 1]),
      y: clampByte(list[at + 2]),
      color: clampByte(list[at + 3]),
      size: clampByte(list[at + 4]),
      animation: clampByte(list[at + 5], SCENE_NO_ANIMATION),
      flags: clampByte(list[at + 6]),
      height: clampByte(list[at + 7]),
    });
  }
  return {background: clampByte(list[1]), objects, triggers, offsets};
};

// The values of a Data table for a scene.
export const encodeScene = ({background, objects, triggers = [], offsets = []}) => {
  const values = [SCENE_FORMAT, clampByte(background), objects.length, triggers.length, offsets.length, 0, 0, 0];
  objects.forEach((sprite) => {
    values.push(clampByte(sprite.object), clampByte(sprite.x), clampByte(sprite.y), clampByte(sprite.color), clampByte(sprite.size),
        clampByte(sprite.animation, SCENE_NO_ANIMATION), clampByte(sprite.flags), clampByte(sprite.height));
  });
  triggers.forEach((trigger) => {
    const load = trigger.kind === SCENE_TRIGGER_LOAD;
    values.push(clampByte(trigger.left), clampByte(trigger.top), clampByte(trigger.width), clampByte(trigger.height),
        clampByte(load ? trigger.targetScene : trigger.targetX), clampByte(load ? 0 : trigger.targetY), trigger.mask & 255,
        (load ? 1 : 0) | (trigger.kind === SCENE_TRIGGER_NONE ? 64 : 0) | (((trigger.mask >> 8) & 31) << 1));
  });
  offsets.forEach((offset) => {
    values.push(clampByte(offset.left), clampByte(offset.top), clampByte(offset.right), clampByte(offset.bottom),
        Math.max(0, SCENE_OFFSET_DIRECTIONS.indexOf(offset.direction)), offset.whole ? 1 : 0, clampByte(offset.mask), clampByte(offset.delta));
  });
  return values;
};

// The names of the triggers of a scene, as the card keeps them.
export const triggerNamesOf = (triggers) => triggers.map((trigger) => trigger.name);

const number = (value) => `<shadow type="math_number"><field name="NUM">${Math.round(value)}</field></shadow>`;
const chain = (blocks) => blocks.reduceRight((next, block) => (next ? block.replace(/<\/block>$/, `<next>${next}</next></block>`) : block), '');
const setPlayer = (player, variable, value) =>
  `<block type="sprite_player_set"><field name="PLAYER">${player}</field><field name="VAR">${variable}</field><value name="VALUE">${value}</value></block>`;
const setMissile = (missile, variable, value) =>
  `<block type="sprite_missile_set"><field name="MISSILE">${missile}</field><field name="VAR">${variable}</field><value name="VALUE">${value}</value></block>`;
const setBall = (variable, value) =>
  `<block type="sprite_ball_set"><field name="VAR">${variable}</field><value name="VALUE">${value}</value></block>`;

// The blocks (as XML text, each in the next of the one before) that put a scene on the screen: the same blocks as a project would have for it.
export const sceneBlocksXml = (table, config = {}, mark = false) => {
  const scene = decodeScene(table.values, table.triggerNames);
  const blocks = [];
  // With triggers in the project the scene that is showing is kept (see generators/bbasic/triggers.js).
  if (mark) blocks.push(`<block type="scene_mark"><field name="SCENE">${table.id}</field></block>`);
  if (scene.background > 0) blocks.push(`<block type="background_set_select"><field name="VAR">${scene.background}</field></block>`);
  scene.objects.forEach((sprite) => {
    const name = sceneObjectName(sprite.object);
    const flags = sprite.flags;
    if (isScenePlayer(sprite.object)) {
      const player = scenePlayerNumber(sprite.object);
      blocks.push(setPlayer(player, `${name}x`, number(sprite.x)), setPlayer(player, `${name}y`, number(sprite.y)));
      if (flags & SCENE_FLAG_COLOR) blocks.push(setPlayer(player, `${name}realcolor`, number(sprite.color)));
      if (flags & SCENE_FLAG_SIZE) {
        blocks.push(`<block type="sprite_player_size"><field name="PLAYER">${player}</field><field name="SIZE">$${Math.min(7, sprite.size)}</field></block>`);
      }
      if (flags & SCENE_FLAG_ANIMATION && sprite.animation !== SCENE_NO_ANIMATION) {
        blocks.push(`<block type="sprite_player_set_animation"><field name="PLAYER">${player}</field><field name="VAR">${sprite.animation}</field>` +
          '<field name="RESTART">TRUE</field><field name="START">1</field><field name="LOOP">TRUE</field></block>');
      }
      blocks.push(setPlayer(player, `__${name}size_3_`, number(flags & SCENE_FLAG_FLIPPED ? 1 : 0)));
      blocks.push(setPlayer(player, `${name}visibility`, number(flags & SCENE_FLAG_HIDDEN ? 0 : 1)));
    } else if (sprite.object === 12) {
      blocks.push(setBall('ballx', number(sprite.x)), setBall('bally', number(sprite.y)));
      if (flags & SCENE_FLAG_HEIGHT) blocks.push(setBall('ballheight', number(sprite.height)));
      if (flags & SCENE_FLAG_SIZE) blocks.push(setBall('ballwidth', number(Math.min(3, sprite.size))));
      if (flags & SCENE_FLAG_HIDDEN) blocks.push(setBall('ballheight', number(0)));
    } else {
      const missile = sprite.object - 10;
      blocks.push(setMissile(missile, `${name}x`, number(sprite.x)), setMissile(missile, `${name}y`, number(sprite.y)));
      if (flags & SCENE_FLAG_HEIGHT) blocks.push(setMissile(missile, `${name}height`, number(sprite.height)));
      if (flags & SCENE_FLAG_SIZE) blocks.push(setMissile(missile, `${name}width`, number(MISSILE_WIDTHS[Math.min(3, sprite.size)])));
      // A missile has a color apart from its player's only with DPC+.
      if (flags & SCENE_FLAG_COLOR && config.kernel === 'dpcplus') blocks.push(setMissile(missile, `${name}color`, number(sprite.color)));
      if (flags & SCENE_FLAG_HIDDEN) blocks.push(setMissile(missile, `${name}height`, number(0)));
    }
  });
  return chain(blocks);
};

export const sceneTablesHaveTriggers = (tables) => (tables || []).some((table) =>
  isSceneTable(table) && decodeScene(table.values, table.triggerNames).triggers.length > 0);
export const sceneTablesHaveOffsets = (tables) => (tables || []).some((table) =>
  isSceneTable(table) && decodeScene(table.values, table.triggerNames).offsets.length > 0);

// The blocks that move the pixels of the offset areas of a scene, while it is the scene showing (see scene_active_if in generators/bbasic/triggers.js):
// each area is a "Playfield offset" block in an "Every N frames" block, with the settings of the area.
const offsetBlocksXml = (offsets) => offsets.map((offset) => {
  const corners = offset.whole ? '' : `<mutation whole="0"></mutation>`;
  const input = (name, value) => `<value name="${name}"><shadow type="math_number"><field name="NUM">${Math.round(value)}</field></shadow></value>`;
  const block = `<block type="background_offset">${corners}<field name="DIRECTION">${offset.direction}</field>` +
    `<field name="WHOLE">${offset.whole ? 'TRUE' : 'FALSE'}</field>` +
    (offset.whole ? '' : input('X1', Math.min(offset.left, offset.right)) + input('Y1', Math.min(offset.top, offset.bottom)) +
      input('X2', Math.max(offset.left, offset.right)) + input('Y2', Math.max(offset.top, offset.bottom))) + '</block>';
  return `<block type="event_frame_every_n"><field name="MASK">${offset.mask}</field><field name="DELTA">${clampByte(offset.delta)}</field><statement name="DO">${block}</statement></block>`;
});

// The "Gameplay update" event that works the triggers of the scenes (as XML text): every frame the fired bits are put back to 0, and then each
// trigger is looked at (see generators/bbasic/triggers.js). What a trigger does by itself (moving the sprite that touched it, setting up a scene:
// the kind it has on its card) is not worked yet: a trigger only fires, and the blocks of the project ("On trigger", "Trigger fired") act for it.
// '' when no scene has a trigger.
const xmlText = (text) => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const triggerEventXml = (tables, config = {}, withTriggers = true) => {
  const checks = [];
  const offsetBlocks = [];
  (tables || []).filter(isSceneTable).forEach((table) => {
    const scene = decodeScene(table.values, table.triggerNames);
    const areas = offsetBlocksXml(scene.offsets);
    if (areas.length) offsetBlocks.push(`<block type="scene_active_if"><field name="SCENE">${table.id}</field><statement name="DO">${chain(areas)}</statement></block>`);
    if (!withTriggers) return;
    scene.triggers.forEach((trigger, index) => {
      const sprites = availableSceneObjects(config).filter((object) => object <= SCENE_TRIGGER_OBJECT_LIMIT && trigger.mask & (1 << object)).map(sceneObjectName);
      if (!sprites.length) return;
      checks.push(`<block type="trigger_check"><field name="KEY">${table.id}:${index}</field><field name="NAME">${xmlText(trigger.name)}</field>` +
        `<field name="SCENE">${table.id}</field><field name="SPRITES">${sprites.join(',')}</field><field name="LEFT">${trigger.left}</field>` +
        `<field name="TOP">${trigger.top}</field><field name="WIDTH">${trigger.width}</field><field name="HEIGHT">${trigger.height}</field></block>`);
    });
  });
  if (!checks.length && !offsetBlocks.length) return '';
  const blocks = [...(checks.length ? ['<block type="trigger_clear"></block>', ...checks] : []), ...offsetBlocks];
  return `<block type="event_block"><field name="EVENT">gameplay_update</field><statement name="DO">${chain(blocks)}</statement></block>`;
};

const parse = (xml, Blockly) => Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${xml}</xml>`).firstElementChild;
const elementChildren = (node, tag) => [...node.children].filter((child) => child.tagName === tag);
const lastOfChain = (block) => {
  let current = block;
  for (;;) {
    const next = elementChildren(current, 'next')[0];
    const inner = next && elementChildren(next, 'block')[0];
    if (!inner) return current;
    current = inner;
  }
};

// Puts the blocks of the scenes in place of the "Set scene" and "Set scene by ID" blocks of a workspace's XML (the DOM Blockly reads), so that
// the generator only ever meets the ordinary blocks a scene is made of, and the project builds the same as if they had been put there by hand.
// tables: the Data tables of the project.
export const expandSceneBlocks = (dom, tables, Blockly, config = {}) => {
  const sceneTables = new Map((tables || []).filter(isSceneTable).map((table) => [`${table.id}`, table]));
  // The triggers are only worked when a block of the project uses one ("On trigger", "Trigger fired").
  const triggers = sceneTablesHaveTriggers(tables) && !!dom.querySelector('block[type^="trigger_on"], block[type^="trigger_fired"]');
  // The offset areas of the scenes work whenever a scene is set up.
  const offsets = sceneTablesHaveOffsets(tables);
  const usesScenes = !!dom.querySelector('block[type="scene_set"], block[type="scene_set_by_id"]');
  const replace = (node, chainXml) => {
    const nextBlock = (() => {
      const next = elementChildren(node, 'next')[0];
      return next ? elementChildren(next, 'block')[0] : null;
    })();
    const parent = node.parentNode;
    if (chainXml) {
      const first = parse(chainXml, Blockly);
      if (nextBlock) {
        const last = lastOfChain(first);
        const wrapper = last.ownerDocument.createElementNS(last.namespaceURI, 'next');
        wrapper.appendChild(nextBlock);
        last.appendChild(wrapper);
      }
      parent.replaceChild(first, node);
    } else if (nextBlock) {
      parent.replaceChild(nextBlock, node);
    } else {
      // Nothing is left in its place: an empty "next" would not load.
      if (parent.tagName === 'next') parent.parentNode.removeChild(parent);
      else parent.removeChild(node);
    }
  };
  [...dom.querySelectorAll('block[type="scene_set"]')].forEach((node) => {
    const field = elementChildren(node, 'field').find((candidate) => candidate.getAttribute('name') === 'SCENE');
    const table = field && sceneTables.get(field.textContent);
    replace(node, table ? sceneBlocksXml(table, config, triggers || offsets) : '');
  });
  [...dom.querySelectorAll('block[type="scene_set_by_id"]')].forEach((node) => {
    const input = elementChildren(node, 'value').find((candidate) => candidate.getAttribute('name') === 'ID');
    const ifs = [...sceneTables.values()].map((table) => {
      const body = sceneBlocksXml(table, config, triggers || offsets);
      if (!body) return '';
      const idXml = input ? [...input.children].map((child) => new XMLSerializer().serializeToString(child)).join('') : number(0);
      return `<block type="controls_if"><value name="IF0"><block type="logic_compare"><field name="OP">EQ</field><value name="A">${idXml}</value>` +
        `<value name="B">${number(table.id)}</value></block></value><statement name="DO0">${body}</statement></block>`;
    }).filter(Boolean);
    replace(node, chain(ifs));
  });
  // The triggers of the scenes work from an event that is added for them.
  if ((triggers || offsets) && usesScenes) {
    const eventXml = triggerEventXml(tables, config, triggers);
    if (eventXml) dom.appendChild(parse(eventXml, Blockly));
  }
};

// How the cells of a scene show in the Data tab: the background and the animations as their pickers, the colors as color swatches. The
// tab renumbers these when a background or an animation is moved or deleted, so a scene follows them.
export const sceneValueFormats = (objectCount, triggerCount = 0, offsetCount = 0) => {
  const formats = [];
  formats[1] = 'background';
  for (let i = 0; i < objectCount; i++) {
    const at = SCENE_RECORD_SIZE * (i + 1);
    formats[at + 3] = 'color';
    formats[at + 5] = 'player0';
  }
  const length = SCENE_RECORD_SIZE * (1 + objectCount + triggerCount + offsetCount);
  return Array.from({length: Math.max(formats.length, length)}, (_, i) => formats[i] || 'dec');
};

const HEADER_NOTES = [
  'Header: the format of the scene (1)',
  'Header: the ID of the playfield to show (0 keeps the playfield that is showing)',
  'Header: how many sprites follow (8 values each)',
  'Header: how many triggers follow the sprites (8 values each)',
  'Header: how many playfield offset areas follow the triggers (8 values each)',
  'Header: not used (keep 0)', 'Header: not used (keep 0)', 'Header: not used (keep 0)',
];

// What each value means, to show as the note of its cell in the Data tab.
export const sceneValueNotes = (objects, triggers = [], offsets = []) => {
  const notes = HEADER_NOTES.slice();
  objects.forEach((sprite, i) => {
    const label = `Sprite ${i + 1} (${sceneObjectLabel(sprite.object)})`;
    notes.push(
        `${label}: which sprite: 0 to 9 Player 0 to 9, 10 Missile 0, 11 Missile 1, 12 Ball`,
        `${label}: X position (the number the X blocks take, 0 to 255)`,
        `${label}: Y position (the number the Y blocks take, 0 to 255)`,
        `${label}: color (a color byte, used when the color flag is on)`,
        `${label}: width. A player: width/quantity 0 to 7 as in "Player set width/quantity". A missile or the ball: 0 to 3 for 1, 2, 4 or 8 pixels (used when the width flag is on)`,
        `${label}: animation number, the place in the Sprites tab's list (255 for none; used when the animation flag is on)`,
        `${label}: flags, added together: 1 hidden, 2 set the color, 4 set the width, 8 set the animation, 16 player faces left, 32 set the height`,
        `${label}: height in lines for a missile or the ball`,
    );
  });
  triggers.forEach((trigger, i) => {
    const label = `Trigger ${i + 1} (${trigger.name})`;
    notes.push(
        `${label}: left edge in pixels from the left of the screen (0 to 159)`,
        `${label}: top edge in lines from the top of the screen (0 to 191)`,
        `${label}: width in pixels`,
        `${label}: height in lines`,
        `${label}: a move trigger: the X the sprite is moved to. A scene trigger: the ID of the scene it sets up`,
        `${label}: a move trigger: the Y the sprite is moved to (not used by a scene trigger)`,
        `${label}: the sprites that trigger it, added together: 1 Player 0, 2 Player 1, 4 Player 2, 8 Player 3, 16 Player 4, 32 Player 5, 64 Player 6, 128 Player 7 (Player 8 and 9, the missiles and the ball are in the next value)`,
        `${label}: added together: 1 sets up a scene (0 moves the sprite), 2 Player 8, 4 Player 9, 8 Missile 0, 16 Missile 1, 32 Ball, 64 does nothing itself (the On trigger blocks act)`,
    );
  });
  offsets.forEach((offset, i) => {
    const label = `Offset area ${i + 1}`;
    notes.push(
        `${label}: left column of the area (0 to 31, a playfield cell is 4 pixels wide)`,
        `${label}: top row of the area (rows count from 0)`,
        `${label}: right column of the area`,
        `${label}: bottom row of the area`,
        `${label}: the way the pixels move: 0 alternate rows left and right, 1 alternate rows right and left, 2 all left, 3 all right, 4 alternate columns up and down, 5 alternate columns down and up, 6 all up, 7 all down`,
        `${label}: 1 moves the whole playfield (the corners are not used)`,
        `${label}: how often, one step every 1, 2, 4... 256 frames: 0, 1, 3, 7, 15, 31, 63, 127, 255`,
        `${label}: plus this many frames (0 to 255) on top of how often, so areas can step on different frames`,
    );
  });
  return notes;
};
