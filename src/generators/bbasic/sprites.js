'use strict';

import {playfieldToMatrix} from '../../utils/pixels';
import {useConfigurationStorage} from '../../hooks/project';


export const DEFAULT_SPRITES={
  animations: [
    {
      id: 1,
      name: 'Example1',
      frames: [
        {
          id: 1,
          duration: 10,
          pixels: playfieldToMatrix(
              '...XXX..\n'+
            '...XXX..\n'+
            '...XXX..\n'+
            '..X.X...\n'+
            '..XXXXX.\n'+
            '....X.X.\n'+
            '...X.X..\n'+
            '..X...X.'),
        },
        {
          id: 2,
          duration: 10,
          pixels: playfieldToMatrix(
              '...XXX..\n'+
            '...XXX..\n'+
            '...XXX..\n'+
            '....X.X.\n'+
            '..XXXXX.\n'+
            '..X.X...\n'+
            '...X.X..\n'+
            '...X.X..'),
        },
      ],
    },
  ],
};

export const processPlayerStorageDefaults = (playerStorage) => {
  const player = playerStorage.value;
  if (!player?.animations?.length) {
    return structuredClone(DEFAULT_SPRITES);
  }
  return player;
};

// sprite_*_rom_noise (below) points a sprite's pointer/height straight at raw
// ROM bytes instead of a drawn graphic - the classic Yars' Revenge "neutral
// zone" trick, reading real CODE bytes, not a dedicated data table.
//
// Real bugs had to be fixed to get here, all only visible from an actual
// compile+run, not from reading the bB docs alone:
//
// 1. The very first version pointed at "commongamelogic" using
//    "pointer = commongamelogic + offset" - confirmed WRONG by a real build
//    failure ("Unknown Mnemonic 'lda commongamelogic'"), reproduced 3
//    separate times including a fresh session, so it's not flaky. Tried
//    "main" next (reached only by fallthrough/a plain "goto", confirmed
//    from the compiled output to be a direct "jmp .label", not a
//    gosub/return trampoline the way "commongamelogic" is) - identical
//    failure, "Unknown Mnemonic 'lda main'". Tried a raw hex address next
//    ("pointer = $D000 + offset", bank 1's own real RORG base per ROM size -
//    see public/bb19/includes/2600basicheader.asm) - DIFFERENT failure this
//    time ("Value in 'lda #$D000' must be <$100"): batari Basic compiles a
//    plain numeric literal here as an 8-bit IMMEDIATE load, not a 16-bit
//    address, so no bare number over 255 can work this way either. Tried a
//    small in-range constant next (confirming the "+offset" idiom's real,
//    undocumented behavior: it only ever sets the pointer's LOW byte,
//    inheriting whatever HIGH byte the last real animation-pointer
//    assignment left there that same frame) - this one compiled, but read a
//    uniform/blank memory region (a solid-color sprite, not noise) since
//    the inherited high byte wasn't pointing anywhere interesting.
//    Fixed by not using the "+offset" idiom at ALL: 2600basic.h aliases
//    player0pointerlo/player0pointerhi (and the player1 equivalents) onto
//    the exact same zero-page pair player0pointer itself is, so both bytes
//    can be set with two independent, ordinary 8-bit assignments instead -
//    no label, no 16-bit immediate, no "+" arithmetic at all. baseHigh
//    (below) is bank 1's own real RORG base address's high byte; every one
//    of those bases is page-aligned ($D000/$9000/$1000/$F000, all low byte
//    $00), so "low = 0 + offset" can never carry into the high byte - true
//    real-code noise, genuinely zero ROM cost, exactly like the original
//    Yars' Revenge trick.
// 2. This block's own line (wherever the user placed it) only ever set
//    player0pointer for a single instant - but generateAnimations() ALWAYS
//    unconditionally reassigns every player's pointer/height once per frame,
//    from inside commongamelogic, for ANY player with animation frames (even
//    a blank default one - see its own "if player0frame <> 255 ... else
//    player0: %00000000" fallback), and commongamelogic runs before every
//    single drawscreen. So the animation logic silently clobbered this
//    block's own assignment before the next frame ever got drawn, no matter
//    where the block was placed. Fixed the same way background_fade_to/text-
//    scroll.js's own scrolling already solve "something needs to keep
//    happening every frame, unconditionally, right up until drawscreen":
//    this block is now a one-shot TRIGGER (stores the requested offset/
//    height in dev vars and sets an "active" flag), and a real per-frame
//    check - generateRomNoiseChecks below - is spliced into commongamelogic
//    right AFTER generateAnimations' own output, so it runs (and wins) after
//    the animation logic but still before that frame's drawscreen.
// Bank 1's own fixed base address per ROM size - confirmed against public/
// bb19/includes/2600basicheader.asm's own "RORG" directive: $F000 with no
// bankswitching, $D000/$9000/$1000 for 8k/16k/32k+ (64k shares 32k's own
// $1000 - both hit the "if bankswitch == 32"/"if bankswitch == 64" branches,
// which RORG to the identical address). Every one of these is already
// page-aligned (low byte $00) - deliberately not arbitrary: that's what
// makes the split-byte assignment below safe with no carry/overflow handling
// needed (see its own comment).
const ROM_NOISE_BASE_HIGH_BYTE_BY_ROMSIZE = {
  '2k': 0xF0,
  '4k': 0xF0,
  '8k': 0xD0,
  '16k': 0x90,
  '32k': 0x10,
  '64k': 0x10,
};

// superchipheader.asm (used instead of 2600basicheader.asm whenever
// Superchip RAM is on) pads the FIRST 256 bytes right at that same base
// address with "repeat 256 / .byte $ff / repend" before any real code -
// confirmed directly against a real reported bug: with Superchip on, the
// noise sprite sometimes rendered as a solid block instead of noise,
// because an offset landing in that padding reads nothing but $FF
// (all bits set = solid). Skipped by bumping the base address forward one
// full page (256 bytes, i.e. +1 on the high byte - safe since every base
// above is already page-aligned) whenever Superchip is on, landing offset 0
// on real compiled content instead. 2600basicheader.asm (Superchip off) has
// no such padding, so this only applies conditionally.
const romNoiseBaseHighByteHex = (config) => {
  const high = ROM_NOISE_BASE_HIGH_BYTE_BY_ROMSIZE[config && config.romSize] ?? 0xF0;
  const paddingPages = config && config.enableSuperchip ? 1 : 0;
  return `$${(high + paddingPages).toString(16).toUpperCase()}`;
};

// One shared flags byte covers both features' "active" bits for both
// players - only ever 4 possible bits total (2 features x 2 players), same
// reasoning fadeFlagsVarName's own shared byte uses in
// blocks/background.js.
export const romNoiseFlagsVarName = () => '_romNoiseFlags';
export const romNoiseActiveBit = (name) => name === 'player1' ? 1 : 0;
export const romNoiseOffsetVarName = (name) => `_${name}RomNoiseOffset`;
export const romNoiseHeightVarName = (name) => `_${name}RomNoiseHeight`;
export const rainbowColorActiveBit = (name) => name === 'player1' ? 3 : 2;
export const rainbowColorOffsetVarName = (name) => `_${name}RainbowColorOffset`;

// sprite_*_fire's own dev vars (see its own trigger generator and
// generateMissileFireChecks below) - one shared flags byte (same "one byte
// covers every player/missile's own active bit" convention as
// romNoiseFlagsVarName above) plus, per missile, a direction (0-7, or
// 255/anything else for "no direction") and a speed (1-7), both captured
// once at fire time so the per-frame check never has to re-evaluate the
// original ANGLE/SPEED block inputs.
export const missileFireFlagsVarName = () => '_missileFireFlags';
export const missileFireActiveBit = (name) => name === 'missile1' ? 1 : 0;
export const missileFireDirVarName = (name) => `_${name}FireDir`;
export const missileFireSpeedVarName = (name) => `_${name}FireSpeed`;

// "Rainbow colors" (its own block, sprite_*_rainbow_colors) is a REAL,
// existing batari Basic kernel feature (see std_kernel.asm's own "ifnconst
// playercolors"/"ifnconst player1colors" checks - it reads (player0color),y
// / (player1color),y every scanline, the SAME Y the graphic pointer itself
// uses, into COLUP0/COLUP1), not something built from scratch here - just
// never wired up by this app before. 2600basic.h confirms player0color/
// player1color are each 2-byte zero-page pointers like player0pointer, but
// WITHOUT the same lo/hi-split alias names that let the graphic pointer be
// set safely (see generateRomNoiseChecks' own comment on why "pointer = X +
// offset" can't be used) - EXCEPT they happen to double up on other named
// registers at the exact same physical addresses, which the header's own
// comments confirm is deliberate, not coincidental ("currentpaddle = $90 ;
// replaces missile 0 (and can't be used with playercolor)"): player0color's
// low byte IS player0color itself, and its high byte is "paddle";
// player1color's low byte is player1color itself, and its high byte is
// "missile1y". Reusing those exact names lets the color pointer be set the
// same safe, plain-8-bit-assignment way as the graphic pointer, with no new
// mechanism needed. Deliberately independent of sprite_*_rom_noise (its own
// offset/dev var, its own active bit) - this reads real ROM bytes into the
// COLOR channel regardless of whatever the player's own GRAPHIC pointer is
// currently showing, a normal animation frame or ROM noise.
export const ROM_NOISE_COLOR_REGISTERS = {
  player0: {low: 'player0color', high: 'paddle', kernelOption: 'playercolors'},
  player1: {low: 'player1color', high: 'missile1y', kernelOption: 'player1colors'},
};

// Actually allocates a RAM slot (letter or varN) for each dev var name this
// feature needs, and gets each one a real "dim name = ..." declaration -
// merely resolving a name through nameDB_.getName (what every generator
// function here does via resolveVar) only assigns it a SYMBOL, it does not
// reserve storage or emit a dim for it. Confirmed as a real build failure
// (DASM: "Unknown Mnemonic 'sta _player0RomNoiseOffset'" - an undeclared
// symbol) from an earlier version of this that only ever called
// nameDB_.getName from inside the trigger/check generators, the same way
// reserveTextScrollDevVars already has to for the Text Minikernel's own
// scroll state (see its own call site in bbasic.js's init(), which this
// mirrors) - called with a pre-scanned Set of which player names actually
// use rom_noise anywhere in the project (bbasic.js's init() has to know this
// BEFORE user variable letters are handed out, well before either
// generator would otherwise run).
export const reserveRomNoiseDevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(romNoiseFlagsVarName(), undefined, 'shared active-bit byte (ROM noise + rainbow colors)');
  usedFor.forEach((name) => {
    reserveDevVar(romNoiseOffsetVarName(name), undefined, 'this player\'s ROM noise: pointer offset');
    reserveDevVar(romNoiseHeightVarName(name), undefined, 'this player\'s ROM noise: sprite height');
  });
};

// Same reasoning as reserveRomNoiseDevVars above, for sprite_*_rainbow_
// colors' own offset dev var - deliberately separate from ROM noise's own,
// since either block can be used without the other. Shares the SAME flags
// byte (romNoiseFlagsVarName) rather than a byte of its own - see that
// function's own "one shared flags byte" comment.
export const reserveRainbowColorDevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(romNoiseFlagsVarName(), undefined, 'shared active-bit byte (ROM noise + rainbow colors)');
  usedFor.forEach((name) =>
    reserveDevVar(rainbowColorOffsetVarName(name), undefined, 'this player\'s rainbow-color cycle offset'));
};

// Same reasoning as reserveRomNoiseDevVars above, for sprite_*_fire - called
// with a pre-scanned Set of which missile names actually have a Fire block
// used anywhere in the project (bbasic.js's own init() has to know this
// before user variable letters are handed out, well before this feature's
// own generator would otherwise run).
export const reserveMissileFireDevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(missileFireFlagsVarName(), undefined, 'shared active-bit byte for fired missiles');
  usedFor.forEach((name) => {
    reserveDevVar(missileFireDirVarName(name), undefined, 'this missile\'s fired direction (0-7, or 255 for none)');
    reserveDevVar(missileFireSpeedVarName(name), undefined, 'this missile\'s fired speed (pixels/frame)');
  });
};

// Spliced into commongamelogic right after generatedAnimations (see this
// file's own top-of-block comment for why the ordering matters) - one check
// per player that actually has a rom_noise block anywhere in the project,
// each only touching that one player's own pointer/height. Follows the same
// literal-whitespace convention generateBackgroundFadeChecks/
// generateTextScrollAdvance already rely on for this same splice style
// (bypasses normalizeIndents() - one leading space per statement line, bare
// zero-indent labels).
export const generateRomNoiseChecks = (Blockly) => {
  const used = Blockly.BBasic.romNoiseUsedFor;
  if (!used || !used.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const flagsVar = resolveVar(romNoiseFlagsVarName());
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const baseHigh = romNoiseBaseHighByteHex(config);
  const lines = [];
  ['player0', 'player1'].forEach((name) => {
    if (!used.has(name)) return;
    const doneLabel = `_romnoise_${name}_done`;
    const offsetVar = resolveVar(romNoiseOffsetVarName(name));
    const heightVar = resolveVar(romNoiseHeightVarName(name));
    lines.push(
        // "flagsVar{bit} = 0" (an equality comparison against the bit-index
        // syntax) isn't valid here - confirmed by a real compile failure
        // ("Unknown keyword: 0"); the bit-index syntax only works as a
        // direct boolean condition, negated with "!" (see backgroundFadeTo's
        // own "if !${activeBit} then goto ..." in generators/bbasic/
        // background.js, the proven working precedent this mirrors).
        ` if !${flagsVar}{${romNoiseActiveBit(name)}} then goto ${doneLabel}`,
        // Sets player0pointer's own hi/lo bytes DIRECTLY (2600basic.h
        // aliases player0pointerlo/player0pointerhi onto the exact same
        // zero-page pair player0pointer itself uses) instead of the
        // "pointer = X + offset" idiom every earlier attempt here used -
        // confirmed by exhaustive testing that idiom only ever works for a
        // "data" table's own label (see this file's own top-of-block
        // comment for the full history: two different code labels and a
        // raw hex address all failed, one other combination compiled but
        // read the wrong memory entirely). Two plain 8-bit assignments sidestep
        // that whole idiom: baseHigh is a compile-time constant (no label,
        // no 16-bit immediate), and offsetVar becomes the low byte
        // directly with NO overflow risk, because every ROM_NOISE_BASE_
        // HIGH_BYTE_BY_ROMSIZE entry is page-aligned (low byte $00) - so
        // "low = 0 + offset" can never carry into the high byte, meaning
        // this reads real code starting from the very base of bank 1's own
        // mapped ROM, offset by 0-255 bytes into it - genuine Yars'
        // Revenge-style "read whatever code is there", zero ROM cost.
        ` ${name}pointerlo = ${offsetVar}`,
        ` ${name}pointerhi = ${baseHigh}`,
        ` ${name}height = ${heightVar}`,
        `${doneLabel}`,
    );
  });
  return lines.join('\n') + '\n';
};

// Whether kernel_options needs "playercolors" - see the real, confirmed
// language rule (from an actual working example program, not guesswork):
// "playercolors cannot be set by itself; player1colors must also be set."
// "player1colors" alone (player1-only multicolor) is fine on its own - only
// "playercolors" (needed whenever player0 wants it) has this extra
// requirement. So both real kernel_options AND both player0color:/
// player1color: graphic-literal declarations below are needed together
// whenever player0 is in use, even if player1 itself never asked for
// rainbow colors.
export const rainbowColorNeedsPlayerColors = (usedFor) => !!(usedFor && usedFor.has('player0'));
export const rainbowColorNeedsPlayer1Colors = (usedFor) => !!(usedFor && usedFor.size);

// Real batari Basic graphic-literal declarations (player0color:/
// player1color:, confirmed syntax from a real working example program) -
// NOT a runtime assignment. This has to exist for kernel_options
// "playercolors"/"player1colors" to compile at all (confirmed by a real
// build failure otherwise), the same way a normal "player0: ... end" sprite
// frame has to exist for the standard graphic pointer mechanism to work.
// The actual byte VALUES here are throwaway placeholders - never read
// during normal gameplay, since generateRainbowColorChecks below
// immediately overrides player0color/player1color's own pointer bytes at
// runtime, every frame, before this default table could ever matter. Only
// its declaration needs to exist, once, matching the exact same "player0: /
// %00000000 / end" raw literal syntax generateAnimations already uses for
// its own blank-default frame (2-space content indent, "end" at column 0 -
// this bypasses normalizeIndents() the same way, spliced into the same
// commongamelogic region right alongside generatedAnimations, so it needs
// the same literal formatting, not the one-space-per-statement convention
// the per-frame checks below it use).
export const generateRainbowColorGraphics = (Blockly) => {
  const used = Blockly.BBasic.rainbowColorUsedFor;
  if (!used || !used.size) return '';
  const lines = [];
  if (rainbowColorNeedsPlayerColors(used)) {
    lines.push('  player0color:', '  $0E', 'end');
  }
  if (rainbowColorNeedsPlayer1Colors(used)) {
    lines.push('  player1color:', '  $0E', 'end');
  }
  return lines.join('\n') + '\n';
};

// Same splice point/whitespace convention as generateRomNoiseChecks above,
// but entirely independent of it - see sprite_*_rainbow_colors' own block
// comment for why this is a separate block/check rather than folded into
// the noise one.
export const generateRainbowColorChecks = (Blockly) => {
  const used = Blockly.BBasic.rainbowColorUsedFor;
  if (!used || !used.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const flagsVar = resolveVar(romNoiseFlagsVarName());
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const baseHigh = romNoiseBaseHighByteHex(config);
  const lines = [];
  ['player0', 'player1'].forEach((name) => {
    if (!used.has(name)) return;
    const doneLabel = `_rainbowcolor_${name}_done`;
    const offsetVar = resolveVar(rainbowColorOffsetVarName(name));
    const registers = ROM_NOISE_COLOR_REGISTERS[name];
    lines.push(
        ` if !${flagsVar}{${rainbowColorActiveBit(name)}} then goto ${doneLabel}`,
        ` ${registers.low} = ${offsetVar}`,
        ` ${registers.high} = ${baseHigh}`,
        `${doneLabel}`,
    );
  });
  return lines.join('\n') + '\n';
};

// Spliced into commongamelogic right after generateRomNoiseChecks/
// generateRainbowColorChecks (same region, same reasoning: nothing else
// there touches missile position) - one check per missile that actually has
// a Fire block used anywhere in the project. Two independent 8-way dispatch
// chains (X, then Y) rather than one combined per-direction chain, because
// bB's "if X then A" only conditions the single statement immediately after
// "then" (a real, previously-confirmed bug class in this codebase - see
// controls_repeat_ext's own label comment above) - a single "if dir=1 then
// x=x-speed : y=y-speed"-style line would silently only ever run the first
// statement. No multiplication anywhere: every direction's own step is
// always exactly -speed/0/+speed, so applying speed is a plain add/subtract.
export const generateMissileFireChecks = (Blockly) => {
  const used = Blockly.BBasic.missileFireUsedFor;
  if (!used || !used.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const flagsVar = resolveVar(missileFireFlagsVarName());
  const lines = [];
  ['missile0', 'missile1'].forEach((name) => {
    if (!used.has(name)) return;
    const doneLabel = `_missilefire_${name}_done`;
    const dirVar = resolveVar(missileFireDirVarName(name));
    const speedVar = resolveVar(missileFireSpeedVarName(name));
    const activeBit = missileFireActiveBit(name);
    lines.push(
        ` if !${flagsVar}{${activeBit}} then goto ${doneLabel}`,
        // X dispatch: Up-Right/Right/Down-Right (1,2,3) step +speed,
        // Down-Left/Left/Up-Left (5,6,7) step -speed, Up/Down (0,4) untouched.
        ` if ${dirVar} = 1 then ${name}x = ${name}x + ${speedVar}`,
        ` if ${dirVar} = 2 then ${name}x = ${name}x + ${speedVar}`,
        ` if ${dirVar} = 3 then ${name}x = ${name}x + ${speedVar}`,
        ` if ${dirVar} = 5 then ${name}x = ${name}x - ${speedVar}`,
        ` if ${dirVar} = 6 then ${name}x = ${name}x - ${speedVar}`,
        ` if ${dirVar} = 7 then ${name}x = ${name}x - ${speedVar}`,
        // Y dispatch: Down-Right/Down/Down-Left (3,4,5) step +speed,
        // Up-Left/Up/Up-Right (7,0,1) step -speed, Left/Right (6,2) untouched.
        ` if ${dirVar} = 3 then ${name}y = ${name}y + ${speedVar}`,
        ` if ${dirVar} = 4 then ${name}y = ${name}y + ${speedVar}`,
        ` if ${dirVar} = 5 then ${name}y = ${name}y + ${speedVar}`,
        ` if ${dirVar} = 7 then ${name}y = ${name}y - ${speedVar}`,
        ` if ${dirVar} = 0 then ${name}y = ${name}y - ${speedVar}`,
        ` if ${dirVar} = 1 then ${name}y = ${name}y - ${speedVar}`,
        // Off-screen (standard NTSC playfield bounds) stops the movement -
        // clears the active bit so this missile's own dispatch above is
        // skipped every frame from here on - WITHOUT touching its own
        // Height (confirmed with the user: it should stop, not change
        // size/visibility on its own - that stays entirely up to whatever
        // "Missile: set Height" blocks the user has elsewhere). x/y are
        // unsigned bytes (see math.js's own "Player coordinates ... are
        // unsigned bytes" comment) - stepping past 0 wraps around to a large
        // positive value rather than going negative, so there's no separate
        // "< 0" case to check: an out-of-range value from EITHER direction
        // always lands as "> 159"/"> 191" here.
        ` if ${name}x > 159 || ${name}y > 191 then ${flagsVar}{${activeBit}} = 0`,
        `${doneLabel}`,
    );
  });
  return lines.join('\n') + '\n';
};

export default (Blockly) => {
  const createGeneratorForSprite = (name) => {
    Blockly.BBasic[`sprite_${name}_get`] = function(block) {
      // Variable getter.
      const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
          Blockly.VARIABLE_CATEGORY_NAME);
      return [code, Blockly.BBasic.ORDER_ATOMIC];
    };

    Blockly.BBasic[`sprite_${name}_set`] = function(block) {
      // Variable setter.
      const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
          Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const varName = Blockly.BBasic.nameDB_.getName(
          block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
      if (varName === 'ballwidth') {
        // Ball width packs into CTRLPF's own bits 4-5 - masked in against
        // CTRLPF's CURRENT value (207 = 0b11001111, clearing only bits 4-5)
        // rather than overwriting the whole byte, which used to also
        // hardcode bit 0 (playfield reflect) permanently on and reset bit 2
        // (playfield priority - see sprite_priority_set's own `CTRLPF{2} =`
        // bit-safe write just below) back to 0 every time ball width was
        // set - a real bug (reported as "changing sprite priority flips the
        // right half of the playfield," since whichever of the two blocks
        // ran later silently undid the other's own bit).
        return `CTRLPF = (CTRLPF & 207) + (${argument0}) * 16\n`;
      } else if (varName.endsWith('visibility')) {
        const blockNumber = Blockly.BBasic.blockNumbers.next();
        const baseLabel = `_visibility_${blockNumber}`;

        const frameVarName = varName.replace('visibility', 'frame');
        return [
          `if ${argument0} then goto ${baseLabel}_visible else ${frameVarName} = 255 : goto ${baseLabel}_end`,
          `@ ${baseLabel}_visible`,
          `if ${frameVarName} = 255 then ${frameVarName} = 0`,
          `@ ${baseLabel}_end`,
        ].join('\n') + '\n\n';
      } else if (varName.endsWith('size_3_')) {
        const bitVarName = varName.replace('__', '').replace('_3_', '{3}');
        return `if ${argument0} then ${bitVarName} = 1 else ${bitVarName} = 0\n`;
      }
      return varName + ' = ' + argument0 + '\n';
    };

    Blockly.BBasic[`sprite_${name}_change`] = function(block) {
    // Add value do a variable.
      const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
          Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const varName = Blockly.BBasic.nameDB_.getName(
          block.getFieldValue('VAR'), Blockly.VARIABLE_CATEGORY_NAME);
      const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
      const operator = isNegativeConstant ? '' : '+';
      return `${varName} = ${varName} ${operator} ${argument0}\n`;
    };
  };

  const createGeneratorForPlayer = (name) => {
    // The dropdown already holds the animation's position in the list, which is
    // what the generated animation dispatch compares against.
    Blockly.BBasic[`sprite_${name}_animation_select`] = function(block) {
      const index = block.getFieldValue('VAR') || '0';
      return [index, Blockly.BBasic.ORDER_ATOMIC];
    };

    Blockly.BBasic[`sprite_${name}_size`] = function(block) {
      const size = block.getFieldValue('SIZE') || '0';
      const varName = name + 'size';
      return `${varName} = ${varName} & $F8\n` +
        `${varName} = ${varName} | ${size}\n`;
    };

    // Bit 6 of the size variable pauses the animation: the frame counter is
    // frozen while it is set. It is unused by NUSIZ, so it rides along
    // harmlessly when the size variable is loaded into the register.
    Blockly.BBasic[`sprite_${name}_animation_playback`] = function(block) {
      const paused = block.getFieldValue('STATE') === 'pause';
      return `${name}size{6} = ${paused ? 1 : 0}\n`;
    };

    // player0pointer/player1pointer and player0height/player1height are
    // real batari Basic kernel symbols (confirmed directly against
    // public/bb19/includes/2600basic.h and std_kernel.asm) - plain,
    // already-defined zero-page RAM the standard kernel reads every
    // scanline as "lda (player0pointer),y" (y counting down from
    // player0height), the exact same mechanism the compiler's own
    // "player0: ... end" graphic-literal syntax sets up automatically
    // behind the scenes for every normal animation frame (see
    // generateAnimations in generators/bbasic.js). Every OTHER player
    // graphic in this app goes through that literal-bitmap path.
    //
    // This is only the TRIGGER - see this file's own top-of-block comment
    // (bug #2) for why the actual player0pointer/player0height writes live
    // in generateRomNoiseChecks instead, spliced into commongamelogic AFTER
    // generateAnimations' own per-frame reassignment. Stores into dev vars
    // (not a direct assignment) because the per-frame check has no block
    // context of its own to re-evaluate OFFSET/HEIGHT's expressions from -
    // same reasoning background_fade_to's own trigger stores its target/pace
    // into dev vars for generateBackgroundFadeChecks to read later.
    //
    // romNoiseUsedFor itself is populated by a pre-scan in bbasic.js's
    // init() (see reserveRomNoiseDevVars' own comment for why it has to be
    // known before this generator ever runs), not mutated here.
    Blockly.BBasic[`sprite_${name}_rom_noise`] = function(block) {
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const offsetVar = resolveVar(romNoiseOffsetVarName(name));
      const heightVar = resolveVar(romNoiseHeightVarName(name));
      const flagsVar = resolveVar(romNoiseFlagsVarName());
      // Defaults to framecounter (already ticking every frame regardless
      // of anything else in the project) rather than a plain "0" fallback
      // - the whole point of this block is a shimmering, ever-changing
      // pattern with no setup required, and a fixed offset would instead
      // show the exact same static bytes forever until the user thought
      // to wire up their own changing value.
      const offset = Blockly.BBasic.valueToCode(block, 'OFFSET', Blockly.BBasic.ORDER_ASSIGNMENT) ||
        'framecounter';
      const height = Blockly.BBasic.valueToCode(block, 'HEIGHT', Blockly.BBasic.ORDER_ASSIGNMENT) || '8';
      return `${offsetVar} = ${offset}\n` +
        `${heightVar} = ${height}\n` +
        `${flagsVar}{${romNoiseActiveBit(name)}} = 1\n`;
    };

    // Clears the active flag sprite_${name}_rom_noise's own trigger sets -
    // see that block's own tooltip/comment for why this is needed at all:
    // generateRomNoiseChecks' per-frame override runs AFTER the animation
    // logic every frame and only ever gets turned ON by the trigger above,
    // never off, so without this there was no way back to a normal
    // animation frame once ROM noise had been used even once.
    // romNoiseUsedFor's own pre-scan in bbasic.js's init() treats this
    // block the same as the trigger above (either one on a player is
    // enough to reserve that player's dev vars), so the flag var is always
    // guaranteed to exist here.
    Blockly.BBasic[`sprite_${name}_rom_noise_stop`] = function(block) {
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const flagsVar = resolveVar(romNoiseFlagsVarName());
      return `${flagsVar}{${romNoiseActiveBit(name)}} = 0\n`;
    };

    // Trigger for sprite_${name}_rainbow_colors - see this file's own
    // ROM_NOISE_COLOR_REGISTERS comment for the real kernel mechanism this
    // uses, and generateRainbowColorChecks for the per-frame write this
    // only primes (same trigger+check split as sprite_${name}_rom_noise's
    // own trigger, and for the same reason: this line alone would only ever
    // take effect for a single instant, not stick).
    Blockly.BBasic[`sprite_${name}_rainbow_colors`] = function(block) {
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const offsetVar = resolveVar(rainbowColorOffsetVarName(name));
      const flagsVar = resolveVar(romNoiseFlagsVarName());
      const offset = Blockly.BBasic.valueToCode(block, 'OFFSET', Blockly.BBasic.ORDER_ASSIGNMENT) ||
        'framecounter';
      return `${offsetVar} = ${offset}\n` +
        `${flagsVar}{${rainbowColorActiveBit(name)}} = 1\n`;
    };

    // Clears the active flag sprite_${name}_rainbow_colors' own trigger
    // sets - see that block's own tooltip/comment for what this can and
    // can't undo. rainbowColorUsedFor's own pre-scan in bbasic.js's init()
    // treats this block the same as the trigger above, so the flag var is
    // always guaranteed to exist here.
    Blockly.BBasic[`sprite_${name}_rainbow_colors_stop`] = function(block) {
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const flagsVar = resolveVar(romNoiseFlagsVarName());
      return `${flagsVar}{${rainbowColorActiveBit(name)}} = 0\n`;
    };
  };

  const createGeneratorForMissile = (name) => {
    Blockly.BBasic[`sprite_${name}_size`] = function(block) {
      const size = block.getFieldValue('SIZE') || 0;
      const varName = name.replace('missile', 'player') + 'size';
      return `${varName} = ${varName} & $0F\n` +
        `${varName} = ${varName} | ${size}\n`;
    };

    // TRIGGER only - see sprite_${name}_rom_noise's own top-of-block comment
    // for why a one-shot assignment here can't be the whole story:
    // generateMissileFireChecks (spliced into commongamelogic) does the
    // actual per-frame movement, reading these dev vars back every frame
    // until the missile goes off-screen. <angleExpr> is evaluated into
    // ${name}dir EXACTLY ONCE (not re-inlined below) since it can itself be
    // a real expression (e.g. the joystick 8-way direction getter's own
    // table lookup), not just a bare variable - see this block's own
    // tooltip. Always re-launches, even if a previous shot from this same
    // missile is still in flight (no "already active" guard) - confirmed
    // with the user: this block is meant to be placed behind its own rate
    // limiter (e.g. an "every X frames" block) rather than fire every
    // single frame it's reached, so every time it DOES run, it should
    // actually fire, resetting position to whatever X/Y it's given right
    // then (a moving X/Y, like a player's own position, naturally "resets
    // to current" this way with no special-casing needed). If the evaluated
    // angle is 255 ("no clear direction" - the joystick 8-way direction
    // getter's own value when the joystick is centered), falls back to the
    // block's own "default" dropdown (any of the 8 directions, user-picked -
    // see MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS in blocks/sprites.js) rather
    // than skipping the launch - an idle joystick should still fire the
    // missile, not silently do nothing, and the direction that happens in
    // should be up to the user, not a single hardcoded choice.
    // missileFireUsedFor's own pre-scan in bbasic.js's init() treats this
    // block type as "in use" (same reasoning as romNoiseUsedFor), so every
    // dev var referenced here is always guaranteed to already exist.
    Blockly.BBasic[`sprite_${name}_fire`] = function(block) {
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const dirVar = resolveVar(missileFireDirVarName(name));
      const speedVar = resolveVar(missileFireSpeedVarName(name));
      const flagsVar = resolveVar(missileFireFlagsVarName());
      const x = Blockly.BBasic.valueToCode(block, 'X', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const y = Blockly.BBasic.valueToCode(block, 'Y', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const angle = Blockly.BBasic.valueToCode(block, 'ANGLE', Blockly.BBasic.ORDER_ASSIGNMENT) || '255';
      const defaultAngle = block.getFieldValue('DEFAULT_ANGLE') || '0';
      const speed = block.getFieldValue('SPEED') || '1';
      const activeBit = missileFireActiveBit(name);
      return `${dirVar} = ${angle}\n` +
        `if ${dirVar} = 255 then ${dirVar} = ${defaultAngle}\n` +
        `${name}x = ${x}\n` +
        `${name}y = ${y}\n` +
        `${speedVar} = ${speed}\n` +
        `${flagsVar}{${activeBit}} = 1\n`;
    };
  };

  ['player0', 'player1', 'missile0', 'missile1', 'ball'].forEach(createGeneratorForSprite);
  ['player0', 'player1'].forEach(createGeneratorForPlayer);
  ['missile0', 'missile1'].forEach(createGeneratorForMissile);

  // Bit 2 of CTRLPF. Set through the bit-index syntax rather than a full
  // assignment so it doesn't clobber the other bits sprite_ball_set already
  // packs into CTRLPF (reflection, ball width).
  Blockly.BBasic['sprite_priority_set'] = function(block) {
    const value = block.getFieldValue('VALUE');
    return `CTRLPF{2} = ${value}\n`;
  };
};
