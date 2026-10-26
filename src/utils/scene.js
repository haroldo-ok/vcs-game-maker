'use strict';

// A scene is a Data table card (see blocks/data.js) with `scene: true`, whose values are laid out the same way for every kind of game, so that a
// stage, a level, a menu or a cut scene can all be kept in one: eight values for the header, then eight for each sprite that is placed.
//
//   header:  [format (1), background id (0 keeps the background that is showing), number of sprites, 0, 0, 0, 0, 0]
//   sprite:  [object, x, y, color, size, animation, flags, height]
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
export const SCENE_NO_ANIMATION = 255;
export const SCENE_FLAG_HIDDEN = 1;
export const SCENE_FLAG_COLOR = 2;
export const SCENE_FLAG_SIZE = 4;
export const SCENE_FLAG_ANIMATION = 8;
export const SCENE_FLAG_FLIPPED = 16;
export const SCENE_FLAG_HEIGHT = 32;

export const SCENE_OBJECT_NAMES = [
  'player0', 'player1', 'player2', 'player3', 'player4', 'player5', 'player6', 'player7', 'player8', 'player9', 'missile0', 'missile1', 'ball',
];
const SCENE_OBJECT_LABELS = [
  'Player 0', 'Player 1', 'Player 2', 'Player 3', 'Player 4', 'Player 5', 'Player 6', 'Player 7', 'Player 8', 'Player 9', 'Missile 0', 'Missile 1', 'Ball',
];
export const sceneObjectName = (object) => SCENE_OBJECT_NAMES[object] || 'player0';
export const sceneObjectLabel = (object) => SCENE_OBJECT_LABELS[object] || 'Player 0';
export const isScenePlayer = (object) => object >= 0 && object <= 9;
export const MISSILE_WIDTHS = [1, 2, 4, 8];

// The sprites a scene can hold under the kernel and options of the project: Player 0 and the missiles and the ball on the standard kernel; with
// DPC+ also the virtual sprites that the Options tab has turned on (Player 1 up to the highest one that is on).
export const availableSceneObjects = (config) => {
  const dpcPlus = !!config && config.kernel === 'dpcplus';
  const configured = config && config.dpcPlusSpriteMax;
  const virtual = configured === undefined || configured === null ? 9 : Math.min(9, Math.max(1, Number(configured) || 1));
  const players = dpcPlus ? Array.from({length: virtual + 1}, (_, i) => i) : [0, 1];
  return [...players, 10, 11, 12];
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

export const isSceneTable = (table) => !!(table && table.scene);

// The scene a Data table's values hold.
export const decodeScene = (values) => {
  const list = Array.isArray(values) ? values : [];
  const count = Math.min(Math.max(0, clampByte(list[2])), Math.floor((list.length - SCENE_RECORD_SIZE) / SCENE_RECORD_SIZE));
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
  return {background: clampByte(list[1]), objects};
};

// The values of a Data table for a scene.
export const encodeScene = ({background, objects}) => {
  const values = [SCENE_FORMAT, clampByte(background), objects.length, 0, 0, 0, 0, 0];
  objects.forEach((sprite) => {
    values.push(clampByte(sprite.object), clampByte(sprite.x), clampByte(sprite.y), clampByte(sprite.color), clampByte(sprite.size),
        clampByte(sprite.animation, SCENE_NO_ANIMATION), clampByte(sprite.flags), clampByte(sprite.height));
  });
  return values;
};

const number = (value) => `<shadow type="math_number"><field name="NUM">${Math.round(value)}</field></shadow>`;
const chain = (blocks) => blocks.reduceRight((next, block) => (next ? block.replace(/<\/block>$/, `<next>${next}</next></block>`) : block), '');
const setPlayer = (player, variable, value) =>
  `<block type="sprite_player_set"><field name="PLAYER">${player}</field><field name="VAR">${variable}</field><value name="VALUE">${value}</value></block>`;
const setMissile = (missile, variable, value) =>
  `<block type="sprite_missile_set"><field name="MISSILE">${missile}</field><field name="VAR">${variable}</field><value name="VALUE">${value}</value></block>`;
const setBall = (variable, value) =>
  `<block type="sprite_ball_set"><field name="VAR">${variable}</field><value name="VALUE">${value}</value></block>`;

// The blocks (as XML text, each in the next of the one before) that put a scene on the screen: the same blocks as a project would have for it.
export const sceneBlocksXml = (table, config = {}) => {
  const scene = decodeScene(table.values);
  const blocks = [];
  if (scene.background > 0) blocks.push(`<block type="background_set_select"><field name="VAR">${scene.background}</field></block>`);
  scene.objects.forEach((sprite) => {
    const name = sceneObjectName(sprite.object);
    const flags = sprite.flags;
    if (isScenePlayer(sprite.object)) {
      const player = sprite.object;
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
    replace(node, table ? sceneBlocksXml(table, config) : '');
  });
  [...dom.querySelectorAll('block[type="scene_set_by_id"]')].forEach((node) => {
    const input = elementChildren(node, 'value').find((candidate) => candidate.getAttribute('name') === 'ID');
    const ifs = [...sceneTables.values()].map((table) => {
      const body = sceneBlocksXml(table, config);
      if (!body) return '';
      const idXml = input ? [...input.children].map((child) => new XMLSerializer().serializeToString(child)).join('') : number(0);
      return `<block type="controls_if"><value name="IF0"><block type="logic_compare"><field name="OP">EQ</field><value name="A">${idXml}</value>` +
        `<value name="B">${number(table.id)}</value></block></value><statement name="DO0">${body}</statement></block>`;
    }).filter(Boolean);
    replace(node, chain(ifs));
  });
};

// How the cells of a scene show in the Data tab: the background and the animations as their pickers, the colors as color swatches. The
// tab renumbers these when a background or an animation is moved or deleted, so a scene follows them.
export const sceneValueFormats = (objectCount) => {
  const formats = [];
  formats[1] = 'background';
  for (let i = 0; i < objectCount; i++) {
    const at = SCENE_RECORD_SIZE * (i + 1);
    formats[at + 3] = 'color';
    formats[at + 5] = 'player0';
  }
  return Array.from(formats, (format) => format || 'dec');
};

const HEADER_NOTES = [
  'Header: the format of the scene (1)',
  'Header: the ID of the playfield to show (0 keeps the playfield that is showing)',
  'Header: how many sprites follow (8 values each)',
  'Header: not used (keep 0)', 'Header: not used (keep 0)', 'Header: not used (keep 0)', 'Header: not used (keep 0)', 'Header: not used (keep 0)',
];

// What each value means, to show as the note of its cell in the Data tab.
export const sceneValueNotes = (objects) => {
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
  return notes;
};
