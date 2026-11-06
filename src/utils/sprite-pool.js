'use strict';

// Sprite pool blocks (blocks/sprite-pool.js) are not built as they are: the build puts ordinary blocks in their place in the project's XML (the project on
// screen is not touched), the same way the "Set scene" blocks are (see utils/scene.js). The blocks inside a pool block that name the "pool sprite"
// (the player list's "pool" choice, the "playerpool..." names of the other lists) are copied once for each sprite of the pool, each copy naming that sprite.
// A sprite is free while it is hidden (a hidden player is on frame 255).

const STATEMENTS = ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release_all'];
const VALUES = ['sprite_pool_full'];
const SELECTOR = [...STATEMENTS, ...VALUES].map((type) => `block[type="${type}"]`).join(',');
const MAX_PLAYER = 16;

const children = (node, tag) => [...node.children].filter((child) => child.tagName === tag);
const fieldOf = (block, name) => children(block, 'field').find((field) => field.getAttribute('name') === name);
const serialize = (node) => new XMLSerializer().serializeToString(node);

const num = (value) => `<block type="math_number"><field name="NUM">${value}</field></block>`;
// Puts blocks (each one block's XML) in a stack.
const stack = (blocks) => blocks.filter(Boolean).reduceRight((rest, block) => (rest ? `${block.slice(0, -'</block>'.length)}<next>${rest}</next></block>` : block), '');
const visibleIs = (n, value) => `<block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="sprite_player_get">` +
  `<field name="PLAYER">${n}</field><field name="VAR">__player${n}visible_</field></block></value><value name="B">${num(value)}</value></block>`;
const setVisible = (n, shown) => `<block type="sprite_player_set"><field name="PLAYER">${n}</field><field name="VAR">player${n}visibility</field>` +
  `<value name="VALUE"><block type="logic_boolean"><field name="BOOL">${shown ? 'TRUE' : 'FALSE'}</field></block></value></block>`;

// Returns the notes to show in the compile log.
export const expandSpritePools = (dom, Blockly) => {
  const warnings = [];
  const parse = (xml) => Blockly.utils.xml.textToDom(`<xml xmlns="https://developers.google.com/blockly/xml">${xml}</xml>`).firstElementChild;
  // Puts the XML in place of a block, followed by the blocks that followed that block.
  const replace = (node, xml) => {
    const fresh = xml ? parse(xml) : null;
    const next = children(node, 'next')[0];
    const nextBlock = next && children(next, 'block')[0];
    const parent = node.parentNode;
    if (fresh) {
      if (nextBlock) {
        let last = fresh;
        for (let following = children(last, 'next')[0]; following; following = children(last, 'next')[0]) last = children(following, 'block')[0];
        const wrapper = last.ownerDocument.createElementNS(last.namespaceURI, 'next');
        wrapper.appendChild(nextBlock);
        last.appendChild(wrapper);
      }
      parent.replaceChild(fresh, node);
    } else if (nextBlock) {
      parent.replaceChild(nextBlock, node);
    } else if (parent.tagName === 'next') {
      parent.parentNode.removeChild(parent);
    } else {
      parent.removeChild(node);
    }
  };
  const rangeOf = (node) => {
    const from = Number(((fieldOf(node, 'FROM') || {}).textContent) || 1);
    const to = Number(((fieldOf(node, 'TO') || {}).textContent) || from);
    return [Math.min(MAX_PLAYER, Math.max(1, Math.min(from, to))), Math.min(MAX_PLAYER, Math.max(1, Math.max(from, to)))];
  };
  // The blocks inside a statement input, copied for sprite n.
  const bodyFor = (node, inputName, n) => {
    const input = children(node, 'statement').find((statement) => statement.getAttribute('name') === inputName);
    const first = input && children(input, 'block')[0];
    if (!first) return '';
    const copy = first.cloneNode(true);
    [copy, ...copy.querySelectorAll('[id]')].forEach((element) => element.removeAttribute('id'));
    copy.querySelectorAll('field').forEach((field) => {
      const text = field.textContent;
      if (field.getAttribute('name') === 'PLAYER' && text === 'pool') field.textContent = String(n);
      else if (text.includes('playerpool')) field.textContent = text.replace(/playerpool/g, `player${n}`);
    });
    return serialize(copy);
  };
  // "Release the pool sprite" is a Player block that hides it.
  [...dom.querySelectorAll('block[type="sprite_pool_release"]')].forEach((node) => replace(node,
      `<block type="sprite_player_set"><field name="PLAYER">pool</field><field name="VAR">playerpoolvisibility</field>` +
      `<value name="VALUE"><block type="logic_boolean"><field name="BOOL">FALSE</field></block></value></block>`));
  // The innermost pool first, so the names of its sprite stay with it.
  for (;;) {
    const node = [...dom.querySelectorAll(SELECTOR)].find((candidate) => !candidate.querySelector(SELECTOR));
    if (!node) break;
    const [from, to] = rangeOf(node);
    const sprites = Array.from({length: to - from + 1}, (_, i) => from + i);
    const type = node.getAttribute('type');
    if (type === 'sprite_pool_each') {
      replace(node, stack(sprites.map((n) => `<block type="controls_if"><value name="IF0">${visibleIs(n, 1)}</value>` +
        `<statement name="DO0">${bodyFor(node, 'DO', n)}</statement></block>`)));
    } else if (type === 'sprite_pool_release_all') {
      replace(node, stack(sprites.map((n) => setVisible(n, false))));
    } else if (type === 'sprite_pool_full') {
      const full = sprites.map((n) => visibleIs(n, 1)).reduceRight((rest, test) => (rest ? `<block type="logic_operation"><field name="OP">AND</field>` +
        `<value name="A">${test}</value><value name="B">${rest}</value></block>` : test), '');
      replace(node, full);
    } else {
      // The first free sprite takes the blocks, one that is not free passes on to the next, and when none is left the "no sprite is free" blocks run.
      let rest = bodyFor(node, 'FULL', 0);
      [...sprites].reverse().forEach((n) => {
        rest = `<block type="controls_if">${rest ? '<mutation else="1"></mutation>' : ''}<value name="IF0">${visibleIs(n, 0)}</value>` +
          `<statement name="DO0">${stack([setVisible(n, true), bodyFor(node, 'DO', n)])}</statement>` +
          `${rest ? `<statement name="ELSE">${rest}</statement>` : ''}</block>`;
      });
      replace(node, rest);
    }
  }
  // A pool sprite outside a pool block names no sprite: the blocks that use it are left out.
  const stray = new Set();
  dom.querySelectorAll('field').forEach((field) => {
    if ((field.getAttribute('name') === 'PLAYER' && field.textContent === 'pool') || field.textContent.includes('playerpool')) stray.add(field.parentNode);
  });
  stray.forEach((block) => block.setAttribute('disabled', 'true'));
  if (stray.size) warnings.push(`${stray.size} block${stray.size === 1 ? '' : 's'} using the pool sprite ${stray.size === 1 ? 'is' : 'are'} not inside a Sprite pool block and left out of the build.`);
  return warnings;
};
