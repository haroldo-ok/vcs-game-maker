'use strict';

import {useConfigurationStorage, appendCompileLog} from '../../hooks/project';
import {flagPoolVar, flagPoolBit} from './flag-pool';
import {colorOverrideRef} from './sprites';
import {isPxe} from '../../utils/pxe';
import {pairKey, boxHitRef} from './sprite-box-width';

// The sprite pool blocks are replaced by other blocks before the code is made (see utils/sprite-pool.js): the blocks inside a pool block are built once,
// for the first sprite of the pool, as a subroutine ("sprite_pool_body"). For each sprite of the pool the build swaps what the sprite has (its
// position, frame, animation, color, size and the state the blocks keep for it) with what the first sprite has, calls the subroutine, and swaps back.
// The blocks inside a pool block are also given as "sprite_pool_shadow" blocks for the other sprites: nothing is made for those, but the build
// sees them (so the other sprites get the same variables and bits, and the same colors and animations are set up for them).


// The 6502 lines that exchange two bytes (each one may be a variable with a read and a write address).
// (On PXE, whose 6502 does not have LDX with an absolute address, CPX, CPY and TYA, the first one goes through the stack.)
const exchange = (a, b, pxe = false) => (pxe ?
  [`lda ${a.read}`, 'pha', `lda ${b.read}`, `sta ${a.write}`, 'pla', `sta ${b.write}`] :
  [`lda ${a.read}`, `ldx ${b.read}`, `sta ${b.write}`, `stx ${a.write}`]);

export default (Blockly) => {
  // The subroutine that holds the blocks of a pool: what a subroutine block does.
  Blockly.BBasic['sprite_pool_body'] = function(block) {
    const name = Blockly.BBasic.nameDB_.getName(block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
    const previousEventName = Blockly.BBasic.currentEventName;
    Blockly.BBasic.currentEventName = `subroutine_${name}`;
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    Blockly.BBasic.currentEventName = previousEventName;
    Blockly.BBasic.subroutines[name] = code;
    return '';
  };

  // Tells the build that a subroutine is kept with the custom function it is called from (same bank, moved with the function: see computeFunctionFamilies
  // in hooks/rom.js), so the call is a plain gosub that costs no more stack than any other.
  const keepWithFunction = (subroutineName, block) => {
    const host = block.getFieldValue('HOST');
    if (!host) return;
    const hostName = Blockly.BBasic.nameDB_.getName(host, Blockly.PROCEDURE_CATEGORY_NAME);
    Blockly.BBasic.functionHostedSubroutines[subroutineName] = hostName;
    Blockly.BBasic.functionCallWrapperNames.add(subroutineName);
  };

  Blockly.BBasic['sprite_pool_body_call'] = function(block) {
    const name = Blockly.BBasic.nameDB_.getName(block.getFieldValue('NAME'), Blockly.PROCEDURE_CATEGORY_NAME);
    keepWithFunction(name, block);
    const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name));
    return `gosub ${name}${suffix}\n`;
  };

  // A block of a pool that leaves the pool (Return, Go to label, Change state) cannot do it from inside the pool's subroutine: it leaves its number in temp1
  // (the value of a Return in temp6, which the exchange of sprites does not touch either) and returns; the blocks run after the call (see utils/sprite-pool.js).
  Blockly.BBasic['sprite_pool_exit_set'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE);
    return `${value ? `temp6 = ${value}\n` : ''}temp1 = ${Number(block.getFieldValue('CODE')) || 0}\n`;
  };
  Blockly.BBasic['sprite_pool_exit_get'] = () => ['temp1', Blockly.BBasic.ORDER_ATOMIC];
  Blockly.BBasic['sprite_pool_exit_value'] = () => ['temp6', Blockly.BBasic.ORDER_ATOMIC];
  Blockly.BBasic['sprite_pool_label'] = (block) => `@ ${block.getFieldValue('NAME')}\n`;
  Blockly.BBasic['sprite_pool_goto'] = (block) => `goto ${block.getFieldValue('NAME')}\n`;

  // The blocks inside are made and left out: what making them sets up for the sprite (colors, the animations it shows) is wanted, the code is not
  // (nor the subroutines they ask for that only the sprite would call).
  Blockly.BBasic['sprite_pool_shadow'] = function(block) {
    const before = new Set(Object.keys(Blockly.BBasic.subroutines));
    Blockly.BBasic.statementToCode(block, 'DO');
    Object.keys(Blockly.BBasic.subroutines).filter((name) => !before.has(name)).forEach((name) => delete Blockly.BBasic.subroutines[name]);
    return '';
  };

  // Everything one sprite has that the other has too, as pairs of (what the first has, what the second has): the lines of 6502 code to exchange them.
  const swapLines = (first, second, tag = '') => {
    const config = (useConfigurationStorage() || {}).value || {};
    const a = `player${first}`;
    const b = `player${second}`;
    const lines = [];
    const pxe = isPxe(config);
    const plain = (symbolA, symbolB) => lines.push(...exchange({read: symbolA, write: symbolA}, {read: symbolB, write: symbolB}, pxe));
    // The kernel's arrays.
    ['x', 'y', ...(config.kernel === 'dpcplus' ? ['height'] : [])].forEach((role) => plain(`${a}${role}`, `${b}${role}`));
    const registry = Blockly.BBasic.devVarRegistry || [];
    const known = new Set(registry.map((entry) => `${entry.rw ? 'rw' : 'v'}:${entry.canonical}`));
    const done = new Set();
    // The variables of Player 1 that the compiler has: they are not reserved by name.
    if (first === 1) {
      ['frame', 'animation', 'realcolor', 'size'].forEach((role) => {
        if (known.has(`v:${b}${role}`)) {
          plain(`${a}${role}`, `${b}${role}`);
          done.add(`${a}${role}`);
        }
      });
    }
    // Every variable reserved for the first sprite that is reserved for the second one too. One that only one of them has was asked for by a block that
    // names that sprite alone, outside the pool: the two sprites are not built the same way, and what that variable holds is not carried over.
    const unpaired = [];
    // (The variables named for a sprite, and the ones that say whether it is in the playfield, pfhit<sprite>: the flag of the Collided block, worked out
    // every frame for each sprite, so a pool body that tests it for the sprite it is running with has to see that sprite's.)
    const prefixes = ['', 'pfhit'];
    prefixes.forEach((prefix) => registry.filter((entry) => new RegExp(`^${prefix}${b}(?!\\d)`).test(entry.canonical)).forEach((entry) => {
      // (The variables of Player 1 are the compiler's, not reserved by name.)
      if (first === 1 && /^(frame|animation|realcolor|size)$/.test(entry.canonical.slice(prefix.length + b.length))) return;
      if (!known.has(`${entry.rw ? 'rw' : 'v'}:${prefix}${a}${entry.canonical.slice(prefix.length + b.length)}`)) unpaired.push(entry.canonical);
    }));
    prefixes.forEach((prefix) => registry.filter((entry) => new RegExp(`^${prefix}${a}(?!\\d)`).test(entry.canonical)).forEach((entry) => {
      if (done.has(entry.canonical)) return;
      done.add(entry.canonical);
      const other = `${prefix}${b}${entry.canonical.slice(prefix.length + a.length)}`;
      if (!known.has(`${entry.rw ? 'rw' : 'v'}:${other}`)) {
        unpaired.push(entry.canonical);
        return;
      }
      if (entry.rw) {
        const pairs = Blockly.BBasic.superchipRwPairs;
        if (!pairs[entry.canonical] || !pairs[other]) return;
        lines.push(...exchange(pairs[entry.canonical], pairs[other], pxe));
      } else {
        const symbol = (canonical) => Blockly.BBasic.nameDB_.getName(canonical, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        plain(symbol(entry.canonical), symbol(other));
      }
    }));
    if (unpaired.length) {
      appendCompileLog(`Sprite pool: players ${first} and ${second} do not have the same state (${[...new Set(unpaired)].join(', ')}): a block outside the pool names only one of them, so the sprites are built differently and the blocks of the pool may not work on both. Use "all pool sprites" for the blocks outside the pool.`, 'info');
    }
    // The bits in the shared flag bytes: the same feature's bit of each sprite.
    const bitRef = (family, spriteBit) => {
      const byte = Blockly.BBasic.nameDB_.getName(flagPoolVar(family), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      return {byte, mask: 1 << flagPoolBit(family, spriteBit)};
    };
    const bitPairs = [];
    const byFeature = new Map();
    (Blockly.BBasic.spriteFlagBits || []).forEach((entry) => {
      if (!byFeature.has(entry.feature)) byFeature.set(entry.feature, []);
      byFeature.get(entry.feature).push(entry);
    });
    byFeature.forEach((entries) => {
      const ofA = entries.find((entry) => entry.owners.has(a));
      const ofB = entries.find((entry) => entry.owners.has(b));
      if (!ofA || !ofB) return;
      try {
        bitPairs.push([bitRef(ofA.family, ofA.bitOf(a)), bitRef(ofB.family, ofB.bitOf(b))]);
      } catch (error) {
        // (A bit that was not planned is not in use.)
      }
    });
    // The answers of the box tests of the sprite against each other sprite (the Collided block, the Sprite overlap blocks): one bit for each pair, so the
    // sprite's pairs are exchanged with the other sprite's pairs with the same partners. (The pair of the two sprites themselves is the same one for both.)
    const pairOrder = Blockly.BBasic.boxPairOrder || [];
    const parseRef = (ref) => {
      const match = /^(.+)\{(\d+)\}$/.exec(ref);
      return {byte: match[1], mask: 1 << Number(match[2])};
    };
    pairOrder.forEach((key) => {
      const [p, q] = key.split('|');
      if (p !== a && q !== a) return;
      const partner = p === a ? q : p;
      if (partner === b) return;
      const twin = pairKey(b, partner);
      if (pairOrder.includes(twin)) bitPairs.push([parseRef(boxHitRef(Blockly, key)), parseRef(boxHitRef(Blockly, twin))]);
    });
    // The mark that a color set by a block wins over the row colors.
    const overrides = Blockly.BBasic.colorOverridePlayers;
    if (overrides && overrides.has(a) && overrides.has(b)) {
      const parse = (ref) => {
        const match = /^(.+)\{(\d+)\}$/.exec(ref);
        return {byte: match[1], mask: 1 << Number(match[2])};
      };
      bitPairs.push([parse(colorOverrideRef(Blockly, a)), parse(colorOverrideRef(Blockly, b))]);
    }
    bitPairs.forEach(([x, y], index) => {
      const label = (part) => `_poolswap_${first}_${second}${tag}_${index}_${part}`;
      // (Only the registers: the scratch bytes can hold the arguments of a function.)
      // (On PXE the two bits wait on the stack: no CPX, CPY, TAY.)
      if (pxe) {
        lines.push(
            `lda ${x.byte}`, `and #${x.mask}`, 'pha',
            `lda ${y.byte}`, `and #${y.mask}`, 'pha',
            `lda ${x.byte}`, `and #${(~x.mask) & 255}`, `sta ${x.byte}`,
            `lda ${y.byte}`, `and #${(~y.mask) & 255}`, `sta ${y.byte}`,
            'pla', 'cmp #0', `beq ${label('a')}`, `lda ${x.byte}`, `ora #${x.mask}`, `sta ${x.byte}`, `@${label('a')}`,
            'pla', 'cmp #0', `beq ${label('b')}`, `lda ${y.byte}`, `ora #${y.mask}`, `sta ${y.byte}`, `@${label('b')}`);
        return;
      }
      lines.push(
          `lda ${x.byte}`, `and #${x.mask}`, 'tax',
          `lda ${y.byte}`, `and #${y.mask}`, 'tay',
          `lda ${x.byte}`, `and #${(~x.mask) & 255}`, `sta ${x.byte}`,
          `lda ${y.byte}`, `and #${(~y.mask) & 255}`, `sta ${y.byte}`,
          'cpy #0', `beq ${label('a')}`, `lda ${x.byte}`, `ora #${x.mask}`, `sta ${x.byte}`, `@${label('a')}`,
          'cpx #0', `beq ${label('b')}`, `lda ${y.byte}`, `ora #${y.mask}`, `sta ${y.byte}`, `@${label('b')}`);
    });
    return lines;
  };

  // Exchanges what two sprites of a pool have (done before the subroutine of the pool runs for the second sprite, and again after it).
  Blockly.BBasic['sprite_pool_swap'] = function(block) {
    const first = Number(block.getFieldValue('FROM'));
    const second = Number(block.getFieldValue('TO'));
    // (One exchange subroutine for each custom function that has a pool, kept in the function's bank.)
    const host = block.getFieldValue('HOST');
    const tag = host ? `_in_${Blockly.BBasic.nameDB_.getName(host, Blockly.PROCEDURE_CATEGORY_NAME)}` : '';
    const name = `_poolswap_${first}_${second}${tag}`;
    // (No RTS: the subroutine may be in another bank, where the return that is added after the code is the one that works.)
    if (!Blockly.BBasic.subroutines[name]) {
      Blockly.BBasic.subroutines[name] = ['asm', ...swapLines(first, second, tag), '@end'].join('\n');
    }
    const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(name));
    return `gosub ${name}${suffix}\n`;
  };

  // The blocks that are only a way to ask for a pool, still there when the code is made from a workspace that was not expanded.
  ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release', 'sprite_pool_release_all'].forEach((type) => {
    Blockly.BBasic[type] = () => '';
  });
  Blockly.BBasic['sprite_pool_full'] = () => ['0', Blockly.BBasic.ORDER_ATOMIC];
};
