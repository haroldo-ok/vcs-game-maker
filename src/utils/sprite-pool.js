'use strict';

// Sprite pool blocks (blocks/sprite-pool.js) are not built as they are: the build puts ordinary blocks in their place in the project's XML (the project on
// screen is not touched), the same way the "Set scene" blocks are (see utils/scene.js). The blocks inside a pool block that name the "pool sprite"
// (the player list's "pool" choice, the "playerpool..." names of the other lists) are copied once for each sprite of the pool, each copy naming that sprite.
// A sprite is free while it is hidden (a hidden player is on frame 255).

const STATEMENTS = ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release_all'];
const VALUES = ['sprite_pool_full', 'sprite_pool_free'];
const SELECTOR_TYPES = [...STATEMENTS, ...VALUES];
const SELECTOR = SELECTOR_TYPES.map((type) => `block[type="${type}"]`).join(',');
const MAX_PLAYER = 16;
// Blocks that jump out of the blocks they are in: a pool with one of them in it is built as a copy of the blocks for each sprite instead.
const NON_LOCAL = ['function_return', 'subroutine_return', 'label_goto', 'event_change_state'];

const children = (node, tag) => [...node.children].filter((child) => child.tagName === tag);
const fieldOf = (block, name) => children(block, 'field').find((field) => field.getAttribute('name') === name);
const serialize = (node) => new XMLSerializer().serializeToString(node);

const num = (value) => `<block type="math_number"><field name="NUM">${value}</field></block>`;
// Puts blocks (each one block's XML) in a stack.
const stack = (blocks) => blocks.filter(Boolean).reduceRight((rest, block) => (rest ? `${block.slice(0, -'</block>'.length)}<next>${rest}</next></block>` : block), '');
// Whether a sprite is shown (value 1) or hidden (0): one test of its frame (a hidden player is on frame 255) or of its hidden flag, see the generator.
const visibleIs = (n, value) => `<block type="sprite_pool_visible"><field name="PLAYER">${n}</field><field name="VISIBLE">${value}</field></block>`;
const setVisible = (n, shown, origin = false) => `<block type="sprite_player_set"><field name="PLAYER">${n}</field><field name="VAR">player${n}visibility</field>` +
  `<field name="ORIGIN">${origin ? 'TRUE' : 'FALSE'}</field>` +
  `<value name="VALUE"><block type="logic_boolean"><field name="BOOL">${shown ? 'TRUE' : 'FALSE'}</field></block></value></block>`;

// Returns the notes to show in the compile log.
export const expandSpritePools = (dom, Blockly) => {
  const warnings = [];
  let poolCount = 0;
  let poolTagCount = 0;
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
  // The blocks inside a statement input, copied for sprite n. A block that keeps state of its kind per block (the overlap blocks) is marked in each copy with the same
  // name, so the build knows which block of one copy is which block of another: the state of the sprites is exchanged by it (see generators/bbasic/sprite-pool.js).
  const poolTags = new Map();
  const bodyDom = (node, inputName, n) => {
    const input = children(node, 'statement').find((statement) => statement.getAttribute('name') === inputName);
    const first = input && children(input, 'block')[0];
    if (!first) return null;
    const copy = first.cloneNode(true);
    [copy, ...copy.querySelectorAll('[id]')].forEach((element) => element.removeAttribute('id'));
    if (!poolTags.has(node)) poolTags.set(node, (poolTagCount += 1));
    [copy, ...copy.querySelectorAll('block[type="sprite_overlap_event"]')].filter((block) => block.getAttribute('type') === 'sprite_overlap_event').forEach((block, index) => {
      const data = block.ownerDocument.createElementNS(block.namespaceURI, 'data');
      data.textContent = `pool${poolTags.get(node)}:${inputName}:${index}`;
      block.insertBefore(data, block.firstChild);
    });
    copy.querySelectorAll('field').forEach((field) => {
      const text = field.textContent;
      if (field.getAttribute('name') === 'PLAYER' && text === 'pool') field.textContent = String(n);
      else if (/playerpool(?!all|any)/.test(text)) field.textContent = text.replace(/playerpool(?!all|any)/g, `player${n}`);
    });
    return copy;
  };
  const bodyFor = (node, inputName, n) => {
    const copy = bodyDom(node, inputName, n);
    return copy ? serialize(copy) : '';
  };
  // "Release the pool sprite" is a Player block that hides it.
  [...dom.querySelectorAll('block[type="sprite_pool_release"]')].forEach((node) => replace(node,
      `<block type="sprite_player_set"><field name="PLAYER">pool</field><field name="VAR">playerpoolvisibility</field>` +
      `<field name="ORIGIN">${fieldOf(node, 'ORIGIN') && fieldOf(node, 'ORIGIN').textContent === 'TRUE' ? 'TRUE' : 'FALSE'}</field>` +
      `<value name="VALUE"><block type="logic_boolean"><field name="BOOL">FALSE</field></block></value></block>`));
  // The sprites of the pools, and the blocks outside every pool that name one of them in a field (a Player block, Stop gravity, and so on):
  // a pool sprite is built like the others of its pool (the exchange of two sprites carries what each has), so such a block gets a copy for each other sprite
  // of the pool, kept like the shadow blocks (nothing is made from them, but what the build sets up for a sprite is set up for those too).
  const poolSprites = new Set();
  [...dom.querySelectorAll(SELECTOR)].forEach((poolNode) => {
    const [low, high] = rangeOf(poolNode);
    for (let n = low; n <= high; n++) poolSprites.add(n);
  });
  const namedSprite = (block) => {
    for (const field of children(block, 'field')) {
      const text = field.textContent;
      const match = field.getAttribute('name') === 'PLAYER' ? /^(\d+)$/.exec(text) : /^player(\d+)(?!\d)/.exec(text);
      if (match && poolSprites.has(Number(match[1]))) return Number(match[1]);
    }
    return 0;
  };
  const outside = poolSprites.size ? [...dom.querySelectorAll('block')].filter((block) => {
    if (block.getAttribute('disabled') === 'true' || !block.getAttribute('type') || /^sprite_pool_/.test(block.getAttribute('type'))) return false;
    // (Inside a pool block: a statement input of one on the way up. A block that follows a pool block is inside its "next", not the pool.)
    for (let up = block.parentNode; up && up.tagName; up = up.parentNode) {
      if (up.tagName === 'statement' && up.parentNode && SELECTOR_TYPES.includes(up.parentNode.getAttribute('type'))) return false;
    }
    // Statement blocks only: a copy goes in the stack after the block.
    return !!(block.parentNode && (block.parentNode.tagName === 'statement' || block.parentNode.tagName === 'next')) && namedSprite(block) > 0;
  }).map((block) => ({block, sprite: namedSprite(block)})) : [];
  // A block inside a pool that names a sprite of that pool (Set Player 1 Y in a pool of Players 1 to 2, say) cannot be built: the pool shares one copy of its blocks
  // among the sprites by exchanging what the sprites have around the call, so such a block would hit whichever sprite was exchanged into the named one's place. It
  // is left out of the build (marked disabled, like a pool sprite outside a pool) and the compile log says which one; "pool sprite", or the block outside the pool,
  // is the way to say it.
  [...dom.querySelectorAll(SELECTOR)].filter((poolNode) => ['sprite_pool_spawn', 'sprite_pool_each'].includes(poolNode.getAttribute('type'))).forEach((poolNode) => {
    const [low, high] = rangeOf(poolNode);
    const input = children(poolNode, 'statement').find((statement) => statement.getAttribute('name') === 'DO');
    if (!input || low === high) return;
    const named = new Set();
    const left = new Set();
    input.querySelectorAll('field').forEach((field) => {
      const match = field.getAttribute('name') === 'PLAYER' ? /^(\d+)$/.exec(field.textContent) : /^player(\d+)(?!\d)/.exec(field.textContent);
      if (!match || Number(match[1]) < low || Number(match[1]) > high) return;
      named.add(Number(match[1]));
      left.add(field.parentNode);
    });
    left.forEach((block) => block.setAttribute('disabled', 'true'));
    if (left.size) {
      warnings.push(`A Sprite pool (players ${low} to ${high}) has ${left.size === 1 ? 'a block' : `${left.size} blocks`} that name${left.size === 1 ? 's' : ''} ` +
        `${[...named].sort((x, y) => x - y).map((n) => `Player ${n}`).join(' and ')}, a sprite of the pool, and ${left.size === 1 ? 'is' : 'are'} left out of the build: use "pool sprite" ` +
        `in a block inside the pool, or put the block outside it.`);
    }
  });
  // The innermost pool first, so the names of its sprite stay with it.
  for (;;) {
    const node = [...dom.querySelectorAll(SELECTOR)].find((candidate) => !candidate.querySelector(SELECTOR));
    if (!node) break;
    const [from, to] = rangeOf(node);
    const sprites = Array.from({length: to - from + 1}, (_, i) => from + i);
    const type = node.getAttribute('type');
    // The custom function the pool is in, if any: the subroutine of its blocks and the exchange subroutines are kept in that function's bank (they are
    // moved with it, see hooks/rom.js), so calling them costs the function no more stack than any gosub.
    const host = (() => {
      for (let up = node.parentNode; up && up.tagName; up = up.parentNode) {
        if (up.tagName === 'block' && up.getAttribute('type') === 'function_define') {
          const nameField = fieldOf(up, 'NAME');
          return nameField ? nameField.textContent : '';
        }
      }
      return '';
    })();
    const hostField = `<field name="HOST">${host.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</field>`;
    const bodyKind = type === 'sprite_pool_each' || type === 'sprite_pool_spawn';
    if (bodyKind && sprites.length > 1) {
      // One copy of the blocks, for the first sprite, as a subroutine; the other sprites swap what they have with the first sprite's around a call of it.
      const first = sprites[0];
      const name = `poolbody${(poolCount += 1)}`;
      const callBlocks = (n) => ([n === first ? '' : `<block type="sprite_pool_swap"><field name="FROM">${first}</field><field name="TO">${n}</field>${hostField}<field name="BODY">${name}</field></block>`,
        `<block type="sprite_pool_body_call"><field name="NAME">${name}</field>${hostField}</block>`,
        n === first ? '' : `<block type="sprite_pool_swap"><field name="FROM">${first}</field><field name="TO">${n}</field>${hostField}<field name="BODY">${name}</field></block>`, checkExit]);
      // Blocks of the pool that leave it for somewhere else (Return, Go to label, Change state, Return from a subroutine) cannot jump out of a subroutine: in the
      // subroutine each one leaves its number in temp1 (and the value of a Return in temp6) and returns, and after the call (and the exchange back) the blocks
      // themselves run where the pool block was, when temp1 holds their number. The subroutine ends with temp1 at 0.
      let bodyCopy = bodyDom(node, 'DO', first);
      const holder = bodyCopy ? bodyCopy.ownerDocument.createElementNS(bodyCopy.namespaceURI, 'statement') : null;
      if (holder) holder.appendChild(bodyCopy);
      const exits = [];
      if (bodyCopy) {
        const labels = new Set([bodyCopy, ...bodyCopy.querySelectorAll('block')].filter((block) => block.getAttribute('type') === 'label_define')
            .map((block) => (fieldOf(block, 'NAME') || {}).textContent));
        const inShadow = (block) => {
          for (let up = block.parentNode; up && up.tagName; up = up.parentNode) if (up.tagName === 'block' && up.getAttribute('type') === 'sprite_pool_shadow') return true;
          return false;
        };
        [bodyCopy, ...bodyCopy.querySelectorAll('block')].filter((block) => NON_LOCAL.includes(block.getAttribute('type')) && !inShadow(block) &&
          !(block.getAttribute('type') === 'label_goto' && labels.has((fieldOf(block, 'NAME') || {}).textContent))).forEach((block) => exits.push(block));
      }
      const exitId = poolCount;
      const exitLadder = [];
      let bodyXml = '';
      if (bodyCopy) {
        exits.forEach((block, index) => {
          const code = index + 1;
          const valueInput = children(block, 'value').find((value) => value.getAttribute('name') === 'VALUE');
          const valueBlock = valueInput && children(valueInput, 'block').concat(children(valueInput, 'shadow'))[0];
          const exit = block.cloneNode(true);
          children(exit, 'next').forEach((next) => exit.removeChild(next));
          if (valueBlock) {
            children(exit, 'value').filter((value) => value.getAttribute('name') === 'VALUE').forEach((value) => exit.removeChild(value));
            exit.appendChild(parse('<value name="VALUE"><block type="sprite_pool_exit_value"></block></value>'));
          }
          exitLadder.push(`<block type="controls_if"><value name="IF0"><block type="logic_compare"><field name="OP">EQ</field><value name="A"><block type="sprite_pool_exit_get"></block></value>` +
            `<value name="B">${num(code)}</value></block></value><statement name="DO0">${serialize(exit)}</statement></block>`);
          const setBlock = `<block type="sprite_pool_exit_set"><field name="CODE">${code}</field>${valueBlock ? `<value name="VALUE">${serialize(valueBlock)}</value>` : ''}` +
            `<next><block type="subroutine_return"></block></next></block>`;
          block.parentNode.replaceChild(parse(setBlock), block);
        });
        // The end of the blocks sets 0 (nothing left).
        bodyCopy = children(holder, 'block')[0];
        let last = bodyCopy;
        while (last && children(last, 'next')[0] && children(children(last, 'next')[0], 'block')[0]) last = children(children(last, 'next')[0], 'block')[0];
        if (exits.length && last) {
          const wrapper = last.ownerDocument.createElementNS(last.namespaceURI, 'next');
          wrapper.appendChild(parse(`<block type="sprite_pool_exit_set"><field name="CODE">0</field></block>`));
          last.appendChild(wrapper);
        }
        bodyXml = serialize(bodyCopy);
      }
      const checkExit = exits.length ? `<block type="controls_if"><value name="IF0"><block type="logic_compare"><field name="OP">NEQ</field><value name="A"><block type="sprite_pool_exit_get"></block></value>` +
        `<value name="B">${num(0)}</value></block></value><statement name="DO0"><block type="sprite_pool_goto"><field name="NAME">_poolexit${exitId}</field></block></statement></block>` : '';
      const definition = parse(`<block type="sprite_pool_body"><field name="NAME">${name}</field><statement name="DO">${bodyXml}</statement></block>`);
      // (After the variables list, which has to come before the blocks in the workspace XML.)
      const variablesList = Array.from(dom.children).find((child) => child.tagName.toLowerCase() === 'variables');
      dom.insertBefore(definition, variablesList ? variablesList.nextSibling : dom.firstChild);
      const shadows = (sprites.slice(1).map((n) => `<block type="sprite_pool_shadow"><statement name="DO">${bodyFor(node, 'DO', n)}</statement></block>`));
      let chain;
      if (type === 'sprite_pool_each') {
        chain = sprites.map((n) => `<block type="controls_if"><value name="IF0">${visibleIs(n, 1)}</value><statement name="DO0">${stack(callBlocks(n))}</statement></block>`);
      } else {
        let rest = bodyFor(node, 'FULL', 0);
        [...sprites].reverse().forEach((n) => {
          rest = `<block type="controls_if">${rest ? '<mutation else="1"></mutation>' : ''}<value name="IF0">${visibleIs(n, 0)}</value>` +
            `<statement name="DO0">${stack([setVisible(n, true), ...callBlocks(n)])}</statement>${rest ? `<statement name="ELSE">${rest}</statement>` : ''}</block>`;
        });
        chain = [rest];
      }
      let parts = [...shadows, ...chain];
      if (exits.length) {
        parts = [...parts, `<block type="sprite_pool_goto"><field name="NAME">_poolend${exitId}</field></block>`,
          `<block type="sprite_pool_label"><field name="NAME">_poolexit${exitId}</field></block>`, ...exitLadder,
          `<block type="sprite_pool_label"><field name="NAME">_poolend${exitId}</field></block>`];
      }
      replace(node, stack(parts));
      continue;
    }
    if (type === 'sprite_pool_each') {
      replace(node, stack(sprites.map((n) => `<block type="controls_if"><value name="IF0">${visibleIs(n, 1)}</value>` +
        `<statement name="DO0">${bodyFor(node, 'DO', n)}</statement></block>`)));
    } else if (type === 'sprite_pool_release_all') {
      replace(node, stack(sprites.map((n) => setVisible(n, false, !!fieldOf(node, 'ORIGIN') && fieldOf(node, 'ORIGIN').textContent === 'TRUE'))));
    } else if (type === 'sprite_pool_free') {
      // (Some sprite of the range is hidden.)
      const free = sprites.map((n) => visibleIs(n, 0)).reduceRight((rest, test) => (rest ? `<block type="logic_operation"><field name="OP">OR</field>` +
        `<value name="A">${test}</value><value name="B">${rest}</value></block>` : test), '');
      replace(node, free);
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
  // (The copies of the blocks that name one pool sprite, for the others.)
  outside.forEach(({block, sprite}) => {
    if (!block.parentNode) return;
    const rename = (text, from, to) => text.replace(new RegExp(`^player${from}(?!\d)`), `player${to}`);
    const copies = [...poolSprites].filter((n) => n !== sprite).map((n) => {
      const copy = block.cloneNode(true);
      [copy, ...copy.querySelectorAll('[id]')].forEach((element) => element.removeAttribute('id'));
      children(copy, 'next').forEach((next) => copy.removeChild(next));
      children(copy, 'statement').forEach((statement) => copy.removeChild(statement));
      copy.querySelectorAll('field').forEach((field) => {
        if (field.getAttribute('name') === 'PLAYER' && field.textContent === String(sprite)) field.textContent = String(n);
        else field.textContent = rename(field.textContent, sprite, n);
      });
      return serialize(copy);
    });
    if (!copies.length) return;
    const shadow = parse(`<block type="sprite_pool_shadow"><statement name="DO">${stack(copies)}</statement></block>`);
    const next = children(block, 'next')[0];
    if (next) {
      block.removeChild(next);
      shadow.appendChild(next);
    }
    const wrapper = block.ownerDocument.createElementNS(block.namespaceURI, 'next');
    wrapper.appendChild(shadow);
    block.appendChild(wrapper);
  });
  // "All pool sprites" / "any pool sprite" on a block: a copy of the block for each sprite of the range the block shows (the blocks that do something one after
  // the other, the Collided block joined with "or" for any and "and" for all).
  const MULTI = /^(player)?pool(all|any)$/;
  const multiFields = (block) => children(block, 'field').filter((field) => MULTI.test(field.textContent));
  for (;;) {
    const node = [...dom.querySelectorAll('block')].find((candidate) => multiFields(candidate).length && ![...candidate.querySelectorAll('block')].some((inner) => multiFields(inner).length));
    if (!node) break;
    const fromField = fieldOf(node, 'POOLFROM');
    const toField = fieldOf(node, 'POOLTO');
    const from = Number(fromField ? fromField.textContent : 1);
    const to = Number(toField ? toField.textContent : from);
    const low = Math.min(MAX_PLAYER, Math.max(1, Math.min(from, to)));
    const high = Math.min(MAX_PLAYER, Math.max(1, Math.max(from, to)));
    const any = multiFields(node).some((field) => /any$/.test(field.textContent));
    const copies = Array.from({length: high - low + 1}, (_, i) => low + i).map((n) => {
      const copy = node.cloneNode(true);
      [copy, ...copy.querySelectorAll('[id]')].forEach((element) => element.removeAttribute('id'));
      children(copy, 'next').forEach((next) => copy.removeChild(next));
      ['POOLFROM', 'POOLTO'].forEach((name) => {
        const field = fieldOf(copy, name); if (field) copy.removeChild(field);
      });
      copy.querySelectorAll('field').forEach((field) => {
        const text = field.textContent;
        if (MULTI.test(text)) field.textContent = /^player/.test(text) ? `player${n}` : String(n);
        else if (/playerpool(all|any)/.test(text)) field.textContent = text.replace(/playerpool(all|any)/g, `player${n}`);
      });
      return serialize(copy);
    });
    const isValue = ['value', 'shadow'].includes(node.parentNode.tagName);
    if (isValue) {
      replace(node, copies.reduceRight((rest, copy) => (rest ? `<block type="logic_operation"><field name="OP">${any ? 'OR' : 'AND'}</field><value name="A">${copy}</value><value name="B">${rest}</value></block>` : copy), ''));
    } else {
      replace(node, stack(copies));
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
