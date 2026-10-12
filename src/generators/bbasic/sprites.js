'use strict';

import {playfieldToMatrix} from '../../utils/pixels';
import {useConfigurationStorage} from '../../hooks/project';
import {fireObjectName} from '../../utils/fire-object';
import {pfRowDivisorFor as exactRowDivisorFor, MISSILE_BALL_PF_X_OFFSET} from '../../utils/playfield-coords';

// batari Basic can only multiply and divide by whole numbers, and with DPC+ a row is not always a whole number of
// y steps, so the nearest whole number of steps is used.
const pfRowDivisorFor = (config) => Math.max(1, Math.round(exactRowDivisorFor(config)));
import {flagPoolVar, flagPoolBit} from './flag-pool';
import {fadeFlagsVarName, fadeActiveBit, effectiveBackgroundRows} from '../../blocks/background';


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

// playerAnimationsStorage is the ONE shared pool (see
// hooks/project.js's usePlayerAnimationsStorage) - both hardware players
// (Player 0 and Player 1) read from this same storage/animation list now.
export const processPlayerAnimationsStorageDefaults = (playerAnimationsStorage) => {
  const player = playerAnimationsStorage.value;
  if (!player?.animations?.length) {
    return structuredClone(DEFAULT_SPRITES);
  }
  return player;
};

// Which animation indices each player's  dispatch chain can actually be
// sent to at runtime - read by generateAnimations (generators/bbasic.js) to
// skip compiling (and paying the ROM bytes for) an animation nothing in the
// project ever selects. Per player, either a Set of reachable indices, or
// null meaning "couldn't prove which indices are reachable here, keep every
// animation" - the conservative fallback whenever playerNanimation is set
// from anything other than a literal sprite_player_animation_select block
// (an arbitrary expression, a plain number, a Data table lookup...) or
// changed by a runtime delta (sprite_player_change on Animation) - either
// way, the actual index reached at runtime isn't known until the game
// itself runs, so nothing can safely be excluded.
//
// Index 0 is always included for both players - it's processAnimations'
// dispatch-chain fallthrough default (see its "if (!animationIndex)
// return ''" - no explicit check is ever emitted for it, so it's reachable
// the instant player0animation/player1animation holds anything unmatched,
// not just a literal 0), not something a project's  blocks need to
// reference by name to reach. It is also what both players start on:
// bbasic.bb.hbs sets player0animation and player1animation to 0 at boot.
// 'player0'..'player9' for a Player block's dropdown value (players 2 to 9 are the DPC+ kernel's virtual sprites).
// The byte, per player, that remembers a "Player set width/quantity" block ran for it: 0 until then, else the size code it set plus
// one. The player's animations apply a width every frame, and leave the player's size alone once a block set it.
export const sizeSetVarName = (name) => `${name}sizeset`;
export const reserveSizeSetDevVars = (reserveDevVar, players) => {
  (players || new Set()).forEach((name) => {
    reserveDevVar(sizeSetVarName(name), undefined, `0, or the width/quantity code a block set for ${name} plus 1`);
  });
};

export const playerNameOfValue = (value) => `player${/^[0-9]$/.test(String(value)) ? value : '0'}`;

export const resolveUsedPlayerAnimations = (workspace) => {
  const used = {player0: new Set([0]), player1: new Set([0])};
  const unsafe = {player0: false, player1: false};
  const track = (name, index) => {
    if (!used[name]) {
      used[name] = new Set([0]);
      unsafe[name] = false;
    }
    if (Number.isInteger(index)) {
      used[name].add(index);
    } else {
      unsafe[name] = true;
    }
  };
  const animationOf = (varField) => {
    const match = /^(player\d)animation$/.exec(varField || '');
    return match ? match[1] : null;
  };
  const selectedIndex = (valueBlock) => valueBlock && valueBlock.type === 'sprite_player_animation_select' ?
    Number(valueBlock.getFieldValue('VAR')) : NaN;
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'sprite_player_set') {
      const name = animationOf(block.getFieldValue('VAR'));
      if (name) track(name, selectedIndex(block.getInputTargetBlock('VALUE')));
    } else if (block.type === 'sprite_player_set_animation') {
      // Same reachability tracking as the sprite_player_set + nested
      // sprite_player_animation_select combo above, just read straight off
      // this block's PLAYER/VAR fields directly - no separate VALUE input
      // to dig into, since both are baked into one block here.
      track(playerNameOfValue(block.getFieldValue('PLAYER')), Number(block.getFieldValue('VAR')));
    } else if (block.type === 'sprite_player_set_animation_id') {
      // The VALUE is as arbitrary an expression as in sprite_player_set above: provably safe only
      // when a sprite_player_animation_select block is plugged into it.
      track(playerNameOfValue(block.getFieldValue('PLAYER')), selectedIndex(block.getInputTargetBlock('VALUE')));
    } else if (block.type === 'sprite_player_change') {
      const name = animationOf(block.getFieldValue('VAR'));
      if (name) track(name, NaN);
    }
  });
  // The Sprites tab's animation preview (see buildPlayerAnimationPreviewRom in
  // hooks/rom.js) shows one animation on Player 0 and hides Player 1, so only that
  // animation is built: without this, index 0 for both players came along with
  // it, and a preview of any later animation could overflow the ROM (the preview
  // has no relocation to make room).
  const previewOnly = (useConfigurationStorage().value || {}).previewAnimationOnly;
  if (Number.isInteger(previewOnly)) return {player0: new Set([previewOnly]), player1: new Set()};
  return Object.fromEntries(Object.keys(used).map((name) => [name, unsafe[name] ? null : used[name]]));
};

// Every player a sprite_player_animation_finished watch block actually
// exists for - read by bbasic.js's generateAnimations (processAnimation) to
// skip setting the "finished" bit (playerNsize{5}) on a non-looping
// animation's last frame when nothing in the project ever checks it, same
// "don't pay for a flag nothing reads" reasoning
// resolveBackgroundFadeFinishedWatches (blocks/background.js) already uses
// for color fades. A plain Set, same shape as that one - only 2 possible
// players, each either watched or not.
export const resolvePlayerAnimationFinishedWatches = (workspace) => {
  const watched = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'sprite_player_animation_finished') return;
    watched.add(playerNameOfValue(block.getFieldValue('PLAYER')));
  });
  return watched;
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
//    ("pointer = $D000 + offset", bank 1's  real RORG base per ROM size -
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
//    (below) is bank 1's  real RORG base address's high byte; every one
//    of those bases is page-aligned ($D000/$9000/$1000/$F000, all low byte
//    $00), so "low = 0 + offset" can never carry into the high byte - true
//    real-code noise, genuinely zero ROM cost, exactly like the original
//    Yars' Revenge trick.
// 2. This block's  line (wherever the user placed it) only ever set
//    player0pointer for a single instant - but generateAnimations() ALWAYS
//    unconditionally reassigns every player's pointer/height once per frame,
//    from inside commongamelogic, for ANY player with animation frames (even
//    a blank default one - see its "if player0frame <> 255 ... else
//    player0: %00000000" fallback), and commongamelogic runs before every
//    single drawscreen. So the animation logic silently clobbered this
//    block's  assignment before the next frame ever got drawn, no matter
//    where the block was placed. Fixed the same way background_fade_to/text-
//    scroll.js's  scrolling already solve "something needs to keep
//    happening every frame, unconditionally, right up until drawscreen":
//    this block is now a one-shot TRIGGER (stores the requested offset/
//    height in dev vars and sets an "active" flag), and a real per-frame
//    check - generateRomNoiseChecks below - is spliced into commongamelogic
//    right AFTER generateAnimations'  output, so it runs (and wins) after
//    the animation logic but still before that frame's drawscreen.
// Bank 1's  fixed base address per ROM size - confirmed against public/
// bb19/includes/2600basicheader.asm's "RORG" directive: $F000 with no
// bankswitching, $D000/$9000/$1000 for 8k/16k/32k+ (64k shares 32k's
// $1000 - both hit the "if bankswitch == 32"/"if bankswitch == 64" branches,
// which RORG to the identical address). Every one of these is already
// page-aligned (low byte $00) - deliberately not arbitrary: that's what
// makes the split-byte assignment below safe with no carry/overflow handling
// needed (see its  comment).
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
// reasoning fadeFlagsVarName's  shared byte uses in
// blocks/background.js.
export const ROM_NOISE_FLAGS_FAMILY = 'romNoiseFlags';
// Players 2 to 9 (DPC+) have a byte for this, one bit each, so the shared byte above keeps its room.
export const ROM_NOISE_EXTRA_FAMILY = 'romNoiseExtraFlags';
export const isRomNoiseExtra = (name) => /^player[2-9]$/.test(name);
export const romNoiseExtraOwnBit = (name) => Number(name.slice(6)) - 2;
export const romNoiseFlagsVarName = (name) =>
  flagPoolVar(name && isRomNoiseExtra(name) ? ROM_NOISE_EXTRA_FAMILY : ROM_NOISE_FLAGS_FAMILY);
export const romNoiseOwnBit = (name) => name === 'player1' ? 1 : 0;
export const romNoiseActiveBit = (name) => isRomNoiseExtra(name) ?
  flagPoolBit(ROM_NOISE_EXTRA_FAMILY, romNoiseExtraOwnBit(name)) : flagPoolBit(ROM_NOISE_FLAGS_FAMILY, romNoiseOwnBit(name));
export const romNoiseOffsetVarName = (name) => `${name}RomNoiseOffset`;
export const romNoiseHeightVarName = (name) => `${name}RomNoiseHeight`;
export const rainbowColorOwnBit = (name) => name === 'player1' ? 3 : 2;
export const rainbowColorActiveBit = (name) => flagPoolBit(ROM_NOISE_FLAGS_FAMILY, rainbowColorOwnBit(name));
export const rainbowColorOffsetVarName = (name) => `${name}RainbowColorOffset`;
// The playfield twin of the player rainbow colors: the same shared flags byte
// (bit 4) and a separate offset var.
export const BACKGROUND_RAINBOW_OWN_BIT = 4;
export const backgroundRainbowActiveBit = () => flagPoolBit(ROM_NOISE_FLAGS_FAMILY, BACKGROUND_RAINBOW_OWN_BIT);
// DPC+ only: set once the rainbow's color rows are loaded, cleared whenever a background loads its color rows.
export const BACKGROUND_RAINBOW_LOADED_BIT = 5;
export const backgroundRainbowLoadedBit = () => flagPoolBit(ROM_NOISE_FLAGS_FAMILY, BACKGROUND_RAINBOW_LOADED_BIT);
export const backgroundRainbowOffsetVarName = () => 'backgroundRainbowColorOffset';
// DPC+ moves the rainbow by scrolling its color rows, so it keeps the offset it last scrolled to.
export const backgroundRainbowLastVarName = () => 'backgroundRainbowColorLast';
// Where the loaded background's color table is (address low and high byte),
// saved when it loads so "Stop background rainbow colors" can point the kernel
// back at it.
export const backgroundColorTableLoVarName = () => 'backgroundColorTableLo';
export const backgroundColorTableHiVarName = () => 'backgroundColorTableHi';

// sprite_*_fire's  dev vars (see its  trigger generator and
// generateMissileFireChecks below) - one shared flags byte (same "one byte
// covers every player/missile's  active bit" convention as
// romNoiseFlagsVarName above) plus, per missile, a direction (0-7, or
// 255/anything else for "no direction") and a speed (1-7), both captured
// once at fire time so the per-frame check never has to re-evaluate the
// original ANGLE/SPEED block inputs.
// RAM shadow for CTRLPF - see reserveCtrlpfShadowDevVar's  comment for
// why ball width/priority can't safely read the real hardware register back.
export const ctrlpfShadowVarName = () => '_ctrlpf';

// Both missiles' widths, a 2-bit code each, kept apart from playerNsize: NUSIZ's bits 4-5 are the missile width, but
// the upper bits 4-6 of playerNsize hold the animation's loop, finished and pause flags, so sharing one byte made every
// "set animation" change a missile's width (and every missile width change the animation's looping). Missile 0's
// code sits in bits 4-5 (where NUSIZ0 has it) and missile 1's in bits 6-7.
export const missileWidthsVarName = () => '_missileWidths';
// DPC+ only: which of a player's animation frames' graphics is in display RAM right now (0 = none), so a
// frame already shown isn't copied in again every frame.
// A sprite that shows the right half of a wide player (sharedPlayers) uses its player's animation, frame and color variables
// (see the aliases in init of generators/bbasic.js), so it only needs a size byte.
export const reserveDpcPlusShownDevVars = (reserveDevVar, used, extraPlayers = [], sharedPlayers = new Set()) => {
  if (!used) return;
  // Players 2 to 9 are plain kernel sprites with no such state: their animation, frame and size/flip
  // live in variables of the same names the first two players use.
  extraPlayers.forEach((n) => {
    if (!sharedPlayers.has(n)) {
      reserveDevVar(`player${n}animation`, undefined, `Which animation is playing on player${n} (DPC+)`);
      reserveDevVar(`player${n}frame`, undefined, `Which frame player${n} shows; 255 hides it (DPC+)`);
      reserveDevVar(`player${n}realcolor`, undefined, `player${n}'s color (DPC+)`);
    }
    reserveDevVar(`player${n}size`, undefined, `player${n}'s copies (bits 0-2), flip (bit 3) and animation flags (DPC+)`);
  });
};
export const reserveMissileWidthsDevVar = (reserveDevVar, used) => {
  if (!used) return;
  reserveDevVar(missileWidthsVarName(), undefined, 'Missile 0 (bits 4-5) and Missile 1 (bits 6-7) width codes');
};

export const MISSILE_FIRE_FLAGS_FAMILY = 'missileFireFlags';
export const missileFireFlagsVarName = () => flagPoolVar(MISSILE_FIRE_FLAGS_FAMILY);
export const missileFireOwnBit = (name) => ({missile0: 0, missile1: 1, ball: 2,
  player0: 3, player1: 4, player2: 5, player3: 6, player4: 7, player5: 8, player6: 9, player7: 10, player8: 11,
  player9: 12})[name];
export const missileFireActiveBit = (name) => flagPoolBit(MISSILE_FIRE_FLAGS_FAMILY, missileFireOwnBit(name));
export const missileFireDirVarName = (name) => `${name}FireDir`;
export const missileFireSpeedVarName = (name) => `${name}FireSpeed`;
// Only reserved for a sprite using 16-way Fire (missileFire16UsedFor) - see
// generateMissileFireChecks'  comment on why the 16-way dispatch can't
// just inline "(speedVar/2)" the way the plain half-speed math would
// suggest: bB's integer division rounds 1/2 down to 0, which would make
// every "halfway" direction's slower axis vanish entirely at speed 1,
// collapsing 16-way movement to look identical to 8-way. This holds
// speedVar/2, computed once per frame instead of per dispatch line; at speed 1
// it alternates between 0 and 1 from frame to frame, so the slower axis moves
// every other frame.
export const missileFireHalfSpeedVarName = (name) => `${name}FireHalfSpeed`;

// The halfway directions of 16 directions (the odd angles) move at the same total speed as a
// diagonal, at 22.5 degrees from their main axis: the main axis at speed * sqrt(2) * cos(22.5)
// pixels per frame and the other axis at speed * sqrt(2) * sin(22.5). Those are not whole
// pixels, so the extra fractions are worked out in sixteenths of a pixel, 0 to 15 of them each
// frame. A fixed speed that is not throttled gets them from the frame counter, so no variable is
// needed; a speed that is a variable, or movement that is throttled (which runs on only some
// frames of the counter), keeps the leftover sixteenths of each axis in a byte for the object
// (see missileFireFracSlots).
const LEAN_MAIN_PER_SPEED = Math.SQRT2 * Math.cos(Math.PI / 8);
const LEAN_OTHER_PER_SPEED = Math.SQRT2 * Math.sin(Math.PI / 8);
export const leanSixteenths = (speed) => ({
  main: Math.round(speed * LEAN_MAIN_PER_SPEED * 16),
  other: Math.round(speed * LEAN_OTHER_PER_SPEED * 16),
});
export const missileFireFracVarName = (index) => `missileFireFrac${index}`;
// Which objects need their leftover sixteenths kept (16 directions, with a speed that is not a fixed
// number or movement that is throttled), in the order missile0, missile1, ball. Each takes a
// byte: the low nibble is the main axis's leftover and the high nibble the other axis's, and the
// slot is the index of the byte (missileFireFracVarName).
export const missileFireFracSlots = (usedFor, used16, usedPfCheck, usedThrottle, constSpeed) => {
  // The halfway directions move whole pixels every frame now, so nothing is kept between frames.
  return new Map();
};

// sprite_*_seek_to's  dev vars (see its  trigger generator and
// generateSeekChecks below) - same shape as sprite_*_fire's  above: one
// shared flags byte (one bit per sprite name, since up to all 5 - both
// players, both missiles, and the ball - can each be seeking independently)
// plus, per sprite, the target X/Y and speed, captured once when the block
// runs so the per-frame check never has to re-evaluate the original X/Y/
// SPEED block inputs.
export const SEEK_FLAGS_FAMILY = 'seekFlags';
export const seekFlagsVarName = () => flagPoolVar(SEEK_FLAGS_FAMILY);
// The bit number of a sprite in the seek, scroll and inertia flag bytes.
export const spriteOwnBit = (name) => {
  const bits = {player0: 0, player1: 1, missile0: 2, missile1: 3, ball: 4,
    player2: 5, player3: 6, player4: 7, player5: 8, player6: 9, player7: 10, player8: 11, player9: 12};
  return bits[name];
};
export const seekActiveBit = (name) => flagPoolBit(SEEK_FLAGS_FAMILY, spriteOwnBit(name));
export const seekXVarName = (name) => `${name}SeekX`;
export const seekYVarName = (name) => `${name}SeekY`;
export const seekSpeedVarName = (name) => `${name}SeekSpeed`;

// sprite_scroll_with_playfield_set/_get's shared runtime flags byte - one
// bit per sprite name (same bits as seekActiveBit above, reused directly
// rather than a duplicate map, since there's no reason the two features'
// bit layouts need to differ). This is the ONLY dedicated state the
// feature needs - the actual per-frame Y nudge (background_scroll's
// generator, generators/bbasic/background.js) reuses backgroundScrollRow
// directly rather than keeping a second, per-sprite scroll offset of its
// ; see backgroundScrollRowVarName's comment in blocks/background.js.
export const SPRITE_SCROLL_FLAGS_FAMILY = 'spriteScrollFlags';
export const spriteScrollFlagsVarName = () => flagPoolVar(SPRITE_SCROLL_FLAGS_FAMILY);
export const spriteScrollActiveBit = (name) => flagPoolBit(SPRITE_SCROLL_FLAGS_FAMILY, spriteOwnBit(name));

// object_seek_arrived's "finished" bits - deliberately a SEPARATE byte
// from seekFlagsVarName's  active bits above (not packed into the same
// byte the way background.js's  fadeFlagsVarName does for its 4
// registers): seek has 5 possible names, so 5 active + 5 finished bits would
// be 10, over a single byte's 8. Same bit-per-name layout as
// seekActiveBit, reused via seekArrivedBit rather than a second parallel
// map. Only reserved at all when resolveSeekArrivedWatches (blocks/
// sprites.js) finds at least one object_seek_arrived block actually
// watching - see this file's  reserveSeekArrivedDevVars.
export const SEEK_ARRIVED_FLAGS_FAMILY = 'seekArrivedFlags';
export const seekArrivedFlagsVarName = () => flagPoolVar(SEEK_ARRIVED_FLAGS_FAMILY);
export const seekArrivedBit = (name) => flagPoolBit(SEEK_ARRIVED_FLAGS_FAMILY, spriteOwnBit(name));

// "throttle movement" (see object_seek_to/sprite_*_fire's  checkbox
// field) - an opt-in countdown that slows the per-frame movement check
// itself down to whatever "every X frames" block the trigger is placed
// inside, instead of always stepping every frame. A plain decrement-and-
// compare-to-zero countdown, not a bitwise-AND against a runtime variable
// mask (unlike event_frame_every_n's  compile-time-literal mask) - every
// existing "& mask" in this codebase's generated output is against a
// literal, never a variable, so this avoids relying on an operator
// combination with no precedent here. ...ThrottleVarName is the countdown
// itself; ...ThrottleResetVarName is what it resets to each time it hits
// zero (the resolved "every X frames" interval, or 1 - "step every frame",
// the same behavior as if throttling were off - when not actually
// wrapped/enabled).
export const seekThrottleVarName = (name) => `${name}SeekThrottle`;
export const seekThrottleResetVarName = (name) => `${name}SeekThrottleReset`;
export const missileFireThrottleVarName = (name) => `${name}FireThrottle`;
export const missileFireThrottleResetVarName = (name) => `${name}FireThrottleReset`;

// sprite_inertia_accelerate/sprite_inertia_decelerate's  dev vars (see
// their  trigger generators and generateInertiaChecks below) - same
// "one shared flags byte, one bit per sprite name" convention as
// seekFlagsVarName above, just TWO such bytes (accel-active and decel-
// active can't share one byte - 5 names each means 10 bits, over a single
// byte's 8, same reasoning seekArrivedFlagsVarName's  comment gives for
// why IT isn't packed into seekFlagsVarName either).
//
// velocityX/Y are the one genuinely new kind of state this codebase's
// movement blocks have needed: every existing one (Seek's target X/Y,
// Fire's angle/speed) stores direction+magnitude, always unsigned - never
// a persisted signed delta. Inertia's  velocity has to be signed (an
// object accelerating opposite to its current motion needs to slow down
// and reverse, which a direction+magnitude model can't do without real
// vector math) - stored as an ordinary byte holding a two's-complement
// signed value (0-127 = 0..+127, 128-255 = -128..-1, the standard 6502
// convention). Plain bB addition (name x = name x + velocityX) works
// correctly on this with NO special handling (6502 ADC is identical for
// signed and unsigned) - only the max-speed clamp and the decelerate-
// toward-zero step need to treat it as signed, which bB's  unsigned-only
// "if" comparisons can't safely do (see generateInertiaChecks'  comment
// on the hand-asm clamp this requires).
export const INERTIA_ACCEL_FLAGS_FAMILY = 'inertiaAccelFlags';
export const INERTIA_DECEL_FLAGS_FAMILY = 'inertiaDecelFlags';
export const inertiaAccelFlagsVarName = () => flagPoolVar(INERTIA_ACCEL_FLAGS_FAMILY);
export const inertiaDecelFlagsVarName = () => flagPoolVar(INERTIA_DECEL_FLAGS_FAMILY);
// Same bit-per-name layout as seekActiveBit's  map - a separate function
// (not a direct reuse) since these are two entirely separate flag bytes,
// not a shared one, even though the layout happens to match.
export const inertiaAccelActiveBit = (name) => flagPoolBit(INERTIA_ACCEL_FLAGS_FAMILY, spriteOwnBit(name));
export const inertiaDecelActiveBit = (name) => flagPoolBit(INERTIA_DECEL_FLAGS_FAMILY, spriteOwnBit(name));
export const inertiaVelocityXVarName = (name) => `${name}VelocityX`;
export const inertiaVelocityYVarName = (name) => `${name}VelocityY`;
// Only reserved for a sprite with an actual "Accelerate" block targeting
// it (see inertiaAccelUsedFor's  pre-scan in bbasic.js) - a sprite only
// ever decelerated (never accelerated) has nothing for these to hold: with
// nothing ever pushing velocity away from 0 in the first place, decelerate
// alone can never move it.
export const inertiaAccelRateVarName = (name) => `${name}AccelRate`;
export const inertiaMaxSpeedVarName = (name) => `${name}MaxSpeed`;
// Persists which of the 8 directions is currently being accelerated toward
// while the accel-active bit stays set (same reason missileFireDirVarName
// persists across frames rather than being re-read from the trigger block
// every check) - same 0-7 clockwise-from-Up scale generateMissileFireChecks'
// 8-way dispatch already uses, reused directly rather than inventing a
// second angle convention.
export const inertiaAccelDirVarName = (name) => `${name}AccelDir`;
// Only reserved for a sprite using 16-way Accelerate (inertiaAccel16UsedFor) -
// same reasoning and same fix as missileFireHalfSpeedVarName above: holds
// rateVar/2, computed once per frame (alternating between 0 and 1 at rate 1),
// instead of inlining "(rateVar/2)" which rounds down to 0 at rate 1 and
// collapses 16-way to look like 8-way.
export const inertiaAccelHalfRateVarName = (name) => `${name}AccelHalfRate`;
// Only reserved for a sprite with an actual "Decelerate" block targeting it
// (see inertiaDecelUsedFor's  pre-scan in bbasic.js).
export const inertiaDecelRateVarName = (name) => `${name}DecelRate`;

// "Fine" mode's fixed-point state (see inertiaFineUsedFor's  pre-scan in
// bbasic.js, and generateInertiaChecks/buildFineDecelerateAsm/
// buildFinePositionStepAsm further down) - only reserved for a sprite in
// that set. velocityXVar/YVar (above) stay the signed WHOLE-pixel half of
// a 16-bit two's complement pair once Fine is on for a name; these are the
// unsigned (0-255) fractional halves, one per axis for velocity and one per
// axis for position, matching the classic high-byte/low-byte sub-pixel
// technique real hardware of this era actually used (confirmed directly
// against the real Asteroids arcade disassembly - computerarcheology.com's
// Code.html: velocity added into a low position byte, carry propagated via
// ADC into the high byte every frame).
export const inertiaVelocityFracXVarName = (name) => `${name}VelocityFracX`;
export const inertiaVelocityFracYVarName = (name) => `${name}VelocityFracY`;
export const inertiaPosFracXVarName = (name) => `${name}PosFracX`;
export const inertiaPosFracYVarName = (name) => `${name}PosFracY`;

// sprite_*_bounce's  Combat-style state (see its  generator further
// down for the stage sequence this backs, matched against the real 1977
// Combat disassembly's  missile-bounce routine at $F4A6-$F4CD in
// atariage.com's "Definitive Combat Disassembly") - stageVar tracks how many
// consecutive stuck frames have been seen so far (0 = not currently stuck,
// 1-3 = that many consecutive stuck frames, capped at 3 - Combat's
// MxPFcount keeps counting past 3 forever, but every value >= 3 behaves
// identically here, so this caps instead of growing unbounded), origDirVar
// freezes the heading the FIRST stuck frame started from (stage 3's "corner,
// give up" reflection always reflects THIS, never whatever an earlier stage
// left behind), and frameVar is the framecounter value the last time this
// object's Bounce block ran, the only way to tell "still the same collision,
// one frame later" apart from "a brand new collision" with no dedicated
// event to hook a reset into (see generateMissileFireChecks'  comment on
// why).
export const missileBounceStageVarName = (name) => `${name}BounceStage`;
// object_bounce's  velocity-reflection snapshot (see its  generator's
// comment) - the same role as missileBounceOrigDirVarName above, just for
// Inertia's velocity vector instead of Fire's angle. Only reserved for a
// sprite with BOTH object_bounce AND Inertia used on it (a sprite using
// only Fire+Bounce, unchanged from before, never touches these).
export const missileBounceOrigVelocityXVarName = (name) => `${name}BounceOrigVelocityX`;
export const missileBounceOrigVelocityYVarName = (name) => `${name}BounceOrigVelocityY`;
// Only reserved for a sprite with Bounce, Inertia, AND Fine mode all three
// on it - the fractional half of the velocity snapshot above, needed
// alongside it so a Fine-mode sprite's bounce reflects the whole 16-bit
// fixed-point value (see object_bounce's comment on why negating just
// the whole-pixel byte isn't enough once there's a fractional byte too,
// and why the fraction has to be genuinely snapshotted, not reset to 0 -
// it's what lets a bounced object keep moving slower than 1px/frame
// instead of snapping back to whole-pixel speed on every bounce).
export const missileBounceOrigVelocityFracXVarName = (name) => `${name}BounceOrigVelocityFracX`;
export const missileBounceOrigVelocityFracYVarName = (name) => `${name}BounceOrigVelocityFracY`;

// Compile-time lookup, not a runtime one: walks up from the trigger block
// through its  enclosing STATEMENT blocks (getSurroundParent, not the
// getParent()-loop background.js's  isInsideFunctionDefine uses - that
// one also has to follow value-input connections since it's checking a
// block that sits in an "if" condition socket, this one only ever needs
// statement nesting, since a trigger block is always a plain statement)
// looking for an event_frame_every_n ancestor. Its MASK field's VALUE
// is interval-1 (see FRAME_OPTIONS in blocks/event.js) - "+ 1" recovers the
// real interval.
const resolveEnclosingFrameInterval = (block) => {
  let ancestor = block.getSurroundParent();
  while (ancestor) {
    if (ancestor.type === 'event_frame_every_n') {
      return Number(ancestor.getFieldValue('MASK')) + 1;
    }
    ancestor = ancestor.getSurroundParent();
  }
  return null;
};

// "Rainbow colors" (its  block, sprite_*_rainbow_colors) is a REAL,
// existing batari Basic kernel feature (see std_kernel.asm's "ifnconst
// playercolors"/"ifnconst player1colors" checks - it reads (player0color),y
// / (player1color),y every scanline, the SAME Y the graphic pointer itself
// uses, into COLUP0/COLUP1), not something built from scratch here - just
// never wired up by this app before. 2600basic.h confirms player0color/
// player1color are each 2-byte zero-page pointers like player0pointer, but
// WITHOUT the same lo/hi-split alias names that let the graphic pointer be
// set safely (see generateRomNoiseChecks'  comment on why "pointer = X +
// offset" can't be used) - EXCEPT they happen to double up on other named
// registers at the exact same physical addresses, which the header's
// comments confirm is deliberate, not coincidental ("currentpaddle = $90 ;
// replaces missile 0 (and can't be used with playercolor)"): player0color's
// low byte IS player0color itself, and its high byte is "paddle";
// player1color's low byte is player1color itself, and its high byte is
// "missile1y". Reusing those exact names lets the color pointer be set the
// same safe, plain-8-bit-assignment way as the graphic pointer, with no new
// mechanism needed. Deliberately independent of sprite_*_rom_noise (its
// offset/dev var, its  active bit) - this reads real ROM bytes into the
// COLOR channel regardless of whatever the player's  GRAPHIC pointer is
// currently showing, a normal animation frame or ROM noise.
export const ROM_NOISE_COLOR_REGISTERS = {
  player0: {low: 'player0color', high: 'paddle', kernelOption: 'playercolors'},
  player1: {low: 'player1color', high: 'missile1y', kernelOption: 'player1colors'},
};

// DPC+: "Player set Height" keeps a player's picture no taller than a limit, whatever its animation frame says. The
// animation code sets the height again every frame, so the block stores the limit (plus one, so 0 means none: 255
// is the same as no limit) in this byte and generatePlayerHeightLimitChecks applies it right after the animations.
export const playerHeightLimitVarName = (name) => `${name}HeightLimit`;
export const reservePlayerHeightLimitDevVars = (reserveDevVar, usedFor) => {
  (usedFor || []).forEach((name) => reserveDevVar(playerHeightLimitVarName(name), undefined,
      'this player height limit plus one, from the Player set Height block (0 for none)'));
};
export const generatePlayerHeightLimitChecks = (Blockly) => {
  const used = [...(Blockly.BBasic.playerHeightLimitUsedFor || [])];
  if (!used.length) return '';
  return used.map((name) => {
    const limit = Blockly.BBasic.nameDB_.getName(playerHeightLimitVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const done = `_heightlimit_${name}_done`;
    return [
      ` if ${limit} = 0 then goto ${done}`,
      ` temp1 = ${limit} - 1`,
      ` if temp1 < ${name}height then ${name}height = temp1`,
      `${done}`,
    ].join('\n');
  }).join('\n') + '\n';
};

// Actually allocates a RAM slot (letter or varN) for each dev var name this
// feature needs, and gets each one a real "dim name = ..." declaration -
// merely resolving a name through nameDB_.getName (what every generator
// function here does via resolveVar) only assigns it a SYMBOL, it does not
// reserve storage or emit a dim for it. Confirmed as a real build failure
// (DASM: "Unknown Mnemonic 'sta _player0RomNoiseOffset'" - an undeclared
// symbol) from an earlier version of this that only ever called
// nameDB_.getName from inside the trigger/check generators, the same way
// reserveTextScrollDevVars already has to for the Text Minikernel's
// scroll state (see its  call site in bbasic.js's init(), which this
// mirrors) - called with a pre-scanned Set of which player names actually
// use rom_noise anywhere in the project (bbasic.js's init() has to know this
// BEFORE user variable letters are handed out, well before either
// generator would otherwise run).
export const reserveRomNoiseDevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  if ([...usedFor].some((name) => !isRomNoiseExtra(name))) {
    reserveDevVar(romNoiseFlagsVarName(), undefined, 'shared active-bit byte (ROM noise + rainbow colors)');
  }
  if ([...usedFor].some(isRomNoiseExtra)) {
    reserveDevVar(romNoiseFlagsVarName('player2'), undefined, 'active bit of the ROM noise of each of Player 2 to 9');
  }
  usedFor.forEach((name) => {
    reserveDevVar(romNoiseOffsetVarName(name), undefined, 'this player\'s ROM noise: pointer offset');
    reserveDevVar(romNoiseHeightVarName(name), undefined, 'this player\'s ROM noise: sprite height');
  });
};

// Same reasoning as reserveRomNoiseDevVars above, for sprite_*_rainbow_
// colors'  offset dev var - deliberately separate from ROM noise's,
// since either block can be used without the other. Shares the SAME flags
// byte (romNoiseFlagsVarName) rather than a byte - see that
// function's "one shared flags byte" comment.
export const reserveBackgroundRainbowDevVars = (reserveDevVar, reserveDevVarRW, used, simpleOffsets) => {
  if (!used) return;
  reserveDevVar(romNoiseFlagsVarName(), undefined, 'shared active-bit byte (ROM noise + rainbow colors)');
  if (!(simpleOffsets && simpleOffsets.background)) {
    reserveDevVarRW(backgroundRainbowOffsetVarName(), 'playfield rainbow colors: cycle offset');
  }
  // Only ever written when a background loads and read by Stop, so they live in
  // the read/write pool.
  if ((useConfigurationStorage().value || {}).kernel === 'dpcplus') {
    reserveDevVarRW(backgroundRainbowLastVarName(), 'playfield rainbow colors: offset it last scrolled to (DPC+)');
    return;
  }
  reserveDevVarRW(backgroundColorTableLoVarName(), 'loaded background row colors: table address, low byte');
  reserveDevVarRW(backgroundColorTableHiVarName(), 'loaded background row colors: table address, high byte');
};

export const reserveRainbowColorDevVars = (reserveDevVar, reserveDevVarRW, usedFor, simpleOffsets) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(romNoiseFlagsVarName(), undefined, 'shared active-bit byte (ROM noise + rainbow colors)');
  usedFor.forEach((name) => {
    if (!(simpleOffsets && simpleOffsets[name])) {
      reserveDevVarRW(rainbowColorOffsetVarName(name), 'rainbow colors: cycle offset');
    }
  });
};

// Same reasoning as reserveRomNoiseDevVars above, for sprite_*_fire - called
// with a pre-scanned Set of which missile names actually have a Fire block
// used anywhere in the project (bbasic.js's  init() has to know this
// before user variable letters are handed out, well before this feature's
// generator would otherwise run).
// throttleVar/throttleResetVar route through reserveDevVarRW (the
// Superchip r/w pool - see its  big comment in generators/bbasic.js)
// instead of the ordinary lettered pool - a plain decrement-then-if-
// comparison countdown is exactly the "safe" usage shape that pool's
// restrictions allow (never a loop counter, goto/gosub target, or fixed-
// point/16-bit math - confirmed by reading every call site below by hand
// before making this change). Falls back to the ordinary lettered pool
// automatically whenever Superchip is off, pfres is too high, or the r/w
// pool is already full, so this is free real-var savings on Superchip
// builds with no fallback risk.
export const reserveMissileFireDevVars = (reserveDevVar, reserveDevVarRW, usedFor, used16, usedPfCheck, usedThrottle, constSpeed) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(missileFireFlagsVarName(), undefined, 'shared active-bit byte for fired missiles');
  usedFor.forEach((name) => {
    reserveDevVar(missileFireDirVarName(name), undefined, 'this missile\'s fired direction (0-7, or 255 for none)');
    const speedIsConst = !!(constSpeed && constSpeed.has(name));
    if (!speedIsConst) {
      reserveDevVarRW(missileFireSpeedVarName(name), 'fired speed (pixels/frame)');
    }
    if (usedThrottle && usedThrottle.has(name)) {
      reserveDevVarRW(missileFireThrottleVarName(name), 'this missile\'s "throttle movement" countdown');
      reserveDevVarRW(missileFireThrottleResetVarName(name),
          'this missile\'s "throttle movement" countdown reset value');
    }
  });
  // The leftover sixteenths of a pixel of the halfway directions, a byte for each object.
  const slots = missileFireFracSlots(usedFor, used16, usedPfCheck, usedThrottle, constSpeed);
  for (let index = 0; index < slots.size; index++) {
    reserveDevVarRW(missileFireFracVarName(index),
        'fired object: leftover sixteenths of a pixel of the halfway directions');
  }
};

// Same reasoning as reserveMissileFireDevVars above, for sprite_*_bounce's
// Combat-style state (see missileBounceStageVarName's comment) - called
// with a pre-scanned Set of which missile/ball names actually have a
// Bounce block used anywhere in the project. Deliberately separate from
// reserveMissileFireDevVars/missileFireUsedFor: dirVar itself is needed
// whenever EITHER Fire or Bounce is used (Bounce reads/writes it even
// without a matching Fire block), but this extra state is only ever touched
// by Bounce's generator, so a project using Fire without Bounce shouldn't
// pay for unused dev vars per missile - same reasoning extended to
// origDirVar below, which previously reserved unconditionally for every
// Bounce-using sprite even though object_bounce's generator only
// reads/writes it when hasFire is true.
//
// Routed through reserveDevVarRW (the Superchip r/w pool, see its comment
// in bbasic.js's init()) instead of the ordinary lettered pool - every one
// of these five vars' actual usage in object_bounce below is a plain
// comparison, a plain assignment, or a read used as an arithmetic operand
// assigned to a different variable (e.g. "dirVar = origDirVar + half"),
// the same safe shape background_collision_pixel's col2/row2 already use
// successfully (generators/bbasic/background.js's "col2.write =
// col2.read - 1") - none are a loop counter, goto/gosub target, or
// fixed-point/16-bit math. Falls back to the ordinary pool automatically
// whenever Superchip is off (reserveDevVarRW's fallback), so this is
// free real-var savings on Superchip builds with no fallback risk.
export const reserveMissileBounceDevVars = (reserveDevVarRW, usedFor, inertiaUsedFor, fireUsedFor, fineUsedFor) => {
  if (!usedFor || !usedFor.size) return;
  const inertiaSet = inertiaUsedFor || new Set();
  const fineSet = fineUsedFor || new Set();
  usedFor.forEach((name) => {
    // One byte: bits 0-3 the heading when the current collision started, bits 4-5
    // the consecutive stuck frames so far (0-3), bit 6 set when a Bounce block
    // ran this frame (generateBounceStageChecks clears the stuck frames at the
    // start of any frame that follows one without a Bounce call).
    reserveDevVarRW(missileBounceStageVarName(name), 'bounce: stuck frames (bits 4-5), heading at the hit (bits 0-3)');
    if (inertiaSet.has(name)) {
      reserveDevVarRW(missileBounceOrigVelocityXVarName(name),
          'this sprite\'s Combat-style bounce: velocity X when the current collision started');
      reserveDevVarRW(missileBounceOrigVelocityYVarName(name),
          'this sprite\'s Combat-style bounce: velocity Y when the current collision started');
      // Fine mode's fractional half of the same snapshot - see
      // missileBounceOrigVelocityFracXVarName's comment. Only reserved
      // when the sprite is ALSO Fine-mode (a sprite using non-Fine Inertia
      // with Bounce has nothing fractional to snapshot).
      if (fineSet.has(name)) {
        reserveDevVarRW(missileBounceOrigVelocityFracXVarName(name),
            'this sprite\'s Combat-style bounce: Fine-mode velocity X fraction when the current collision started');
        reserveDevVarRW(missileBounceOrigVelocityFracYVarName(name),
            'this sprite\'s Combat-style bounce: Fine-mode velocity Y fraction when the current collision started');
      }
    }
  });
};

// Same reasoning as reserveMissileFireDevVars above, for sprite_*_seek_to -
// called with a pre-scanned Set of which sprite names actually have a Seek
// block used anywhere in the project.
// throttleVar/throttleResetVar route through reserveDevVarRW - same
// reasoning as reserveMissileFireDevVars'  identical change above.
export const reserveSeekDevVars = (reserveDevVar, reserveDevVarRW, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(seekFlagsVarName(), undefined, 'shared active-bit byte for seeking sprites');
  usedFor.forEach((name) => {
    reserveDevVar(seekXVarName(name), undefined, 'this sprite\'s seek target X');
    reserveDevVar(seekYVarName(name), undefined, 'this sprite\'s seek target Y');
    reserveDevVar(seekSpeedVarName(name), undefined, 'this sprite\'s seek speed (pixels/frame/axis)');
    reserveDevVarRW(seekThrottleVarName(name), 'this sprite\'s "throttle movement" countdown');
    reserveDevVarRW(seekThrottleResetVarName(name),
        'this sprite\'s "throttle movement" countdown reset value');
  });
};

// One shared byte, reserved only when at least one sprite_scroll_with_
// playfield_set/_get block is used anywhere in the project (spriteScrollUsedFor,
// bbasic.js's pre-scan - same shape as seekUsedFor). Also forces
// backgroundScrollRow/backgroundScrollRowMax to be reserved even without any
// "Background scroll" block present, since a "set/is scrolling with
// playfield" block by itself still needs somewhere to read/nudge - see
// bbasic.js's init().
export const reserveSpriteScrollDevVars = (reserveDevVar, usedFor) => {
  if (!usedFor || !usedFor.size) return;
  reserveDevVar(spriteScrollFlagsVarName(), undefined,
      'shared active-bit byte for sprites following playfield scroll');
};

// One shared byte, reserved only when at least one object_seek_arrived
// block actually watches something (see resolveSeekArrivedWatches in
// blocks/sprites.js and seekArrivedFlagsVarName's  comment above) -
// called with that same pre-scanned Set, same "known before user variable
// letters are handed out" timing as reserveSeekDevVars above.
export const reserveSeekArrivedDevVars = (reserveDevVar, watches) => {
  if (!watches || !watches.size) return;
  reserveDevVar(seekArrivedFlagsVarName(), undefined, 'shared "seek arrived" finished-bit byte');
};

// velocityX/Y are reserved for every sprite in usedFor (either Accelerate or
// Decelerate targets it) - accelRate/maxSpeed/accelDir only for names in
// accelUsedFor (a sprite only ever Decelerated has nothing to hold, see
// inertiaAccelRateVarName's  comment), decelRate only for names in
// decelUsedFor. The two flag bytes are reserved whenever their  Set is
// non-empty, regardless of usedFor (mirrors reserveSeekArrivedDevVars'
// "only when actually watched" gate).
export const reserveInertiaDevVars = (reserveDevVar, usedFor, accelUsedFor, decelUsedFor, accel16UsedFor, fineUsedFor) => {
  const fineSet = fineUsedFor || new Set();
  if (usedFor && usedFor.size) {
    usedFor.forEach((name) => {
      reserveDevVar(inertiaVelocityXVarName(name), undefined, 'this sprite\'s inertia velocity X (signed)');
      reserveDevVar(inertiaVelocityYVarName(name), undefined, 'this sprite\'s inertia velocity Y (signed)');
      if (fineSet.has(name)) {
        reserveDevVar(inertiaVelocityFracXVarName(name), undefined,
            'this sprite\'s Fine-mode inertia: velocity X fractional byte (0-255, low half of a 16-bit signed pair with velocity X)');
        reserveDevVar(inertiaVelocityFracYVarName(name), undefined,
            'this sprite\'s Fine-mode inertia: velocity Y fractional byte (0-255, low half of a 16-bit signed pair with velocity Y)');
        reserveDevVar(inertiaPosFracXVarName(name), undefined,
            'this sprite\'s Fine-mode inertia: X position sub-pixel accumulator (0-255)');
        reserveDevVar(inertiaPosFracYVarName(name), undefined,
            'this sprite\'s Fine-mode inertia: Y position sub-pixel accumulator (0-255)');
      }
    });
  }
  if (accelUsedFor && accelUsedFor.size) {
    reserveDevVar(inertiaAccelFlagsVarName(), undefined, 'shared active-bit byte for accelerating sprites');
    accelUsedFor.forEach((name) => {
      reserveDevVar(inertiaAccelRateVarName(name), undefined, 'this sprite\'s inertia acceleration rate');
      reserveDevVar(inertiaMaxSpeedVarName(name), undefined, 'this sprite\'s inertia max speed (per axis)');
      reserveDevVar(inertiaAccelDirVarName(name), undefined, 'this sprite\'s inertia acceleration direction (0-7)');
      if (accel16UsedFor && accel16UsedFor.has(name)) {
        reserveDevVar(inertiaAccelHalfRateVarName(name), undefined,
            'this sprite\'s inertia acceleration rate / 2, clamped to a minimum of 1, for 16-way\'s halfway directions');
      }
    });
  }
  if (decelUsedFor && decelUsedFor.size) {
    reserveDevVar(inertiaDecelFlagsVarName(), undefined, 'shared active-bit byte for decelerating sprites');
    decelUsedFor.forEach((name) => {
      reserveDevVar(inertiaDecelRateVarName(name), undefined, 'this sprite\'s inertia deceleration rate');
    });
  }
};

// Ball width and playfield priority both need to read-modify-write CTRLPF -
// clear just their  bits, keep everything else. That's unsafe done
// directly against the real hardware register: CTRLPF's write address ($0A)
// is ALIASED on real 2600 hardware with INPT2 (paddle port 2) in read mode -
// TIA only decodes 6 address bits and distinguishes write-only vs read-only
// registers sharing an address purely by the CPU's R/W line, not by the
// address itself (confirmed directly against vcs.h: CTRLPF and INPT2 are
// both "ds 1" at the same offset, in TIA_REGISTERS_WRITE and
// TIA_REGISTERS_READ respectively). So "CTRLPF & 207" doesn't read back
// whatever was last written to CTRLPF at all - it reads live paddle-port
// input (open bus/garbage if nothing's plugged in), and OR/ANDing that into
// a "preserve the other bits" write can set or clear ANY bit, including bit
// 1 (score mode) - confirmed as the actual root cause of a real reported bug
// ("ball width flips half the playfield to player1's color"), after ruling
// out compiler operator-precedence (splitting the multiply into its
// statement first didn't fix it either, since the read-back itself was
// always the problem, however the expression was shaped).
// This dev var is CTRLPF's  RAM shadow: ball width/priority read-modify-
// write THIS instead (an ordinary RAM byte, safe to read back), then flush
// it to the real CTRLPF right after - CTRLPF isn't touched anywhere else in
// the generated kernel (unlike NUSIZ0/COLUP0/etc, it's never clobbered by
// the score routine), so a flush immediately after each write is enough;
// no once-per-frame restore in commongamelogic is needed.
export const reserveCtrlpfShadowDevVar = (reserveDevVar, used) => {
  if (!used) return;
  reserveDevVar(ctrlpfShadowVarName(), undefined,
      'RAM shadow of CTRLPF - the real register can\'t be safely read back (aliases INPT2)');
};

// Setup-section one-off (see bbasic.bb.hbs's  generatedCtrlpfShadowSetup
// splice, right alongside generatedKeypadSetup) - matches startup.asm's
// real CTRLPF initial value (reflect bit only) so the shadow and the
// hardware register agree from the very first ball width/priority write,
// rather than the shadow starting at 0 (bB's normal all-vars-start-at-zero
// default) and silently dropping reflect the first time either block runs.
export const generateCtrlpfShadowSetup = (Blockly) => {
  if (!Blockly.BBasic.ctrlpfShadowUsed) return '';
  const shadowVar = Blockly.BBasic.nameDB_.getName(ctrlpfShadowVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  return ` ${shadowVar} = 1`;
};

// Spliced into commongamelogic right after generatedAnimations (see this
// file's  top-of-block comment for why the ordering matters) - one check
// per player that actually has a rom_noise block anywhere in the project,
// each only touching that one player's  pointer/height. Follows the same
// literal-whitespace convention generateBackgroundFadeChecks/
// generateTextScrollAdvance already rely on for this same splice style
// (bypasses normalizeIndents() - one leading space per statement line, bare
// zero-indent labels).
export const generateRomNoiseChecks = (Blockly) => {
  const used = Blockly.BBasic.romNoiseUsedFor;
  if (!used || !used.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  // DPC+ reads graphics at an offset into the cartridge's data instead of at a 6507 address, and only Player 0's
  // pointer is a variable (player0pointerlo/hi).
  const dpcPlus = config.kernel === 'dpcplus';
  const baseHigh = dpcPlus ? '$04' : romNoiseBaseHighByteHex(config);
  const lines = [];
  (dpcPlus ? ['player0', 'player1', 'player2', 'player3', 'player4', 'player5', 'player6', 'player7', 'player8', 'player9'] :
    ['player0', 'player1']).forEach((name) => {
    if (!used.has(name)) return;
    const flagsVar = resolveVar(romNoiseFlagsVarName(name));
    const doneLabel = `_romnoise_${name}_done`;
    const offsetVar = resolveVar(romNoiseOffsetVarName(name));
    const heightVar = resolveVar(romNoiseHeightVarName(name));
    lines.push(
        // "flagsVar{bit} = 0" (an equality comparison against the bit-index
        // syntax) isn't valid here - confirmed by a real compile failure
        // ("Unknown keyword: 0"); the bit-index syntax only works as a
        // direct boolean condition, negated with "!" (see backgroundFadeTo's
        // "if !${activeBit} then goto ..." in generators/bbasic/
        // background.js, the proven working precedent this mirrors).
        ` if !${flagsVar}{${romNoiseActiveBit(name)}} then goto ${doneLabel}`,
        // The kernel reads the sprite with "lda (pointer),y", which takes an
        // extra cycle whenever pointer low + y carries into the next page.
        // Every scanline the sprite covers is timed to the cycle, so that extra
        // cycle shifted the playfield on those rows (seen with offsets over
        // 255 - height). The offset is folded into 0..255-height, so no row
        // of the sprite can cross a page: subtract the range size when the
        // offset is past it (twice, which covers heights up to 128 fully and
        // larger ones approximately), then clamp.
        ` temp1 = 255 - ${heightVar}`,
        ` temp2 = ${offsetVar}`,
        ` temp3 = temp1 + 1`,
        ` if temp2 >= temp3 then temp2 = temp2 - temp3`,
        ` if temp2 >= temp3 then temp2 = temp2 - temp3`,
        ` if temp2 > temp1 then temp2 = temp1`,
        // Sets player0pointer's  hi/lo bytes DIRECTLY (2600basic.h
        // aliases player0pointerlo/player0pointerhi onto the exact same
        // zero-page pair player0pointer itself uses) instead of the
        // "pointer = X + offset" idiom every earlier attempt here used -
        // confirmed by exhaustive testing that idiom only ever works for a
        // "data" table's  label (see this file's  top-of-block
        // comment for the full history: two different code labels and a
        // raw hex address all failed, one other combination compiled but
        // read the wrong memory entirely). Two plain 8-bit assignments sidestep
        // that whole idiom: baseHigh is a compile-time constant (no label,
        // no 16-bit immediate), and offsetVar becomes the low byte
        // directly with NO overflow risk, because every ROM_NOISE_BASE_
        // HIGH_BYTE_BY_ROMSIZE entry is page-aligned (low byte $00) - so
        // "low = 0 + offset" can never carry into the high byte, meaning
        // this reads real code starting from the very base of bank 1's
        // mapped ROM, offset by 0-255 bytes into it - genuine Yars'
        // Revenge-style "read whatever code is there", zero ROM cost.
        // Player 0's pointer is a pair of bytes; the other players' are two bytes of display memory, written through data fetcher 0
        // (the same way a "player2:" graphic statement does).
        ...(name === 'player0' ? [
          ` ${name}pointerlo = temp2`,
          ` ${name}pointerhi = ${baseHigh}`,
        ] : [
          ' asm',
          `  lda #<(playerpointers+${2 * (Number(name.slice(6)) - 1)})`,
          '  sta DF0LOW',
          `  lda #(>(playerpointers+${2 * (Number(name.slice(6)) - 1)})) & $0F`,
          '  sta DF0HI',
          '  ldx temp2',
          '  stx DF0WRITE',
          `  lda #${baseHigh}`,
          '  sta DF0WRITE',
          'end',
        ]),
        ` ${name}height = ${heightVar}`,
        `${doneLabel}`,
    );
  });
  return lines.join('\n') + '\n';
};

// Whether kernel_options needs "playercolors" - see the real, confirmed
// language rule (from an actual working example program, not guesswork):
// "playercolors cannot be set by itself; player1colors must also be set."
// "player1colors" alone (player1-only multicolor) is fine by itself - only
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
// immediately overrides player0color/player1color's  pointer bytes at
// runtime, every frame, before this default table could ever matter. Only
// its declaration needs to exist, once, matching the exact same "player0: /
// %00000000 / end" raw literal syntax generateAnimations already uses for
// its  blank-default frame (2-space content indent, "end" at column 0 -
// this bypasses normalizeIndents() the same way, spliced into the same
// commongamelogic region right alongside generatedAnimations, so it needs
// the same literal formatting, not the one-space-per-statement convention
// the per-frame checks below it use).
export const generateRainbowColorGraphics = (Blockly) => {
  if ((useConfigurationStorage().value || {}).kernel === 'dpcplus') return '';
  const used = Blockly.BBasic.rainbowColorUsedFor;
  if (!used || !used.size) return '';
  const lines = [];
  // A player whose sprite colors come from its animation frames sets the
  // color table pointer every frame, so these stand-in tables are declared but
  // jumped over for it: running them would replace that pointer with a plain
  // white table every frame and rainbow colors could never give it back.
  const declare = (name, label) => {
    const skip = Blockly.BBasic.useSpriteColorsFor(name);
    if (skip) lines.push(` goto _rainbowph_${name}_end`);
    lines.push(`  ${label}:`, '  $0E', 'end');
    if (skip) lines.push(`_rainbowph_${name}_end`);
  };
  if (rainbowColorNeedsPlayerColors(used)) declare('player0', 'player0color');
  if (rainbowColorNeedsPlayer1Colors(used)) declare('player1', 'player1color');
  return lines.join('\n') + '\n';
};

// Same splice point/whitespace convention as generateRomNoiseChecks above,
// but entirely independent of it - see sprite_*_rainbow_colors'  block
// comment for why this is a separate block/check rather than folded into
// the noise one.
// How the per-frame check reads the offset: the plan from bbasic.js's
// simpleOffset (a number, a variable or the frame counter), or the offset
// variable the block stored.
const rainbowOffsetExpression = (Blockly, plan, varName) => {
  if (plan && plan.kind === 'number') return String(plan.value);
  if (plan && plan.kind === 'variable') {
    return Blockly.BBasic.nameDB_.getName(plan.id, Blockly.VARIABLE_CATEGORY_NAME);
  }
  if (plan) return 'framecounter';
  return Blockly.BBasic.superchipRwPairs[varName].read;
};

// The playfield rainbow on DPC+: the playfield color rows hold a rainbow (loaded when the block first runs), and
// each frame they are scrolled by however far the offset has moved since the frame before.
const generateDpcPlusBackgroundRainbowChecks = (Blockly) => {
  if (!Blockly.BBasic.backgroundRainbowUsed) return '';
  const flagsVar = Blockly.BBasic.nameDB_.getName(romNoiseFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const lastPair = Blockly.BBasic.superchipRwPairs[backgroundRainbowLastVarName()];
  const offset = rainbowOffsetExpression(Blockly, (Blockly.BBasic.rainbowSimpleOffset || {}).background,
      backgroundRainbowOffsetVarName());
  const doneLabel = '_rainbowcolor_background_done';
  const loadedLabel = '_rainbowcolor_background_loaded';
  // The playfield color rows: a rainbow, one hue per row, 15 hues so the 255 rows join up seamlessly. The kernel's
  // color queue holds 256 rows: the last one is filled in after moving the queue back one row (the trick the
  // batari Basic DPC+ color scrolling examples use).
  const rainbowRow = (r) => '  $' + ((r % 15) * 16 + 10).toString(16).toUpperCase().padStart(2, '0');
  const rows = Array.from({length: 255}, (_, r) => rainbowRow(r));
  return [
    ` if !${flagsVar}{${backgroundRainbowActiveBit()}} then goto ${doneLabel}`,
    ` if ${flagsVar}{${backgroundRainbowLoadedBit()}} then goto ${loadedLabel}`,
    '  pfcolors:', ...rows, 'end',
    ' pfscroll 255 4 4',
    '  pfcolors:', rainbowRow(255), 'end',
    ` ${flagsVar}{${backgroundRainbowLoadedBit()}} = 1`,
    loadedLabel,
    ` temp1 = ${offset}`,
    ` temp2 = temp1 - ${lastPair.read}`,
    ` ${lastPair.write} = temp1`,
    ` if temp2 = 0 then goto ${doneLabel}`,
    ' pfscroll temp2 4 4',
    doneLabel,
  ].join('\n') + '\n';
};

const generateDpcPlusRainbowColorChecks = (Blockly) => {
  const used = Blockly.BBasic.rainbowColorUsedFor;
  if (!used || !used.has('player0')) return generateDpcPlusBackgroundRainbowChecks(Blockly);
  const flagsVar = Blockly.BBasic.nameDB_.getName(romNoiseFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const doneLabel = '_rainbowcolor_player0_done';
  const offset = rainbowOffsetExpression(Blockly, (Blockly.BBasic.rainbowSimpleOffset || {}).player0,
      rainbowColorOffsetVarName('player0'));
  return [
    ` if !${flagsVar}{${rainbowColorActiveBit('player0')}} then goto ${doneLabel}`,
    ` temp1 = ${offset}`,
    ' asm',
    '       lda temp1',
    '       sta player0color',
    '       lda #$04',
    '       sta player0color+1',
    'end',
    doneLabel,
  ].join('\n') + '\n' + generateDpcPlusBackgroundRainbowChecks(Blockly);
};

export const generateRainbowColorChecks = (Blockly) => {
  // DPC+ reads Player 0's colors through the two-byte pointer player0color (an offset into the cartridge's data),
  // so the rainbow aims that at ROM bytes the same way. The other players' pointers are not variables.
  if ((useConfigurationStorage().value || {}).kernel === 'dpcplus') return generateDpcPlusRainbowColorChecks(Blockly);
  const used = Blockly.BBasic.rainbowColorUsedFor;
  const backgroundLines = [];
  if (Blockly.BBasic.backgroundRainbowUsed && Blockly.BBasic.usePlayfieldRowColors()) {
    const flags = Blockly.BBasic.nameDB_.getName(romNoiseFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const offset = rainbowOffsetExpression(Blockly,
        (Blockly.BBasic.rainbowSimpleOffset || {}).background, backgroundRainbowOffsetVarName());
    const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
    // The kernel reads each row's color through the pfcolortable pointer
    // (low byte pfcolortable, high byte aux2): aim it at ROM bytes.
    backgroundLines.push(
        ` if !${flags}{${backgroundRainbowActiveBit()}} then goto _rainbowcolor_background_done`,
        ` pfcolortable = ${offset}`,
        ` aux2 = ${romNoiseBaseHighByteHex(config)}`,
        // The top row's color is not in that table: it is whatever COLUPF holds at the
        // start of the frame, so it gets one of the same ROM bytes too. Written to
        // COLUPF itself, not the playfield color variable: the next frame's
        // "COLUPF = playfieldrealcolor" puts the real color back without any saving.
        ' asm',
        '       ldy #0',
        '       lda (pfcolortable),y',
        '       sta COLUPF',
        'end',
        '_rainbowcolor_background_done');
  }
  if (!used || !used.size) return backgroundLines.length ? backgroundLines.join('\n') + '\n' : '';
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
    const offsetVar = rainbowOffsetExpression(Blockly, (Blockly.BBasic.rainbowSimpleOffset || {})[name],
        rainbowColorOffsetVarName(name));
    const registers = ROM_NOISE_COLOR_REGISTERS[name];
    lines.push(
        ` if !${flagsVar}{${rainbowColorActiveBit(name)}} then goto ${doneLabel}`,
        ` ${registers.low} = ${offsetVar}`,
        ` ${registers.high} = ${baseHigh}`,
        `${doneLabel}`,
    );
  });
  return [...lines, ...backgroundLines].join('\n') + '\n';
};

// Spliced into commongamelogic right after generateRomNoiseChecks/
// generateRainbowColorChecks (same region, same reasoning: nothing else
// there touches missile position) - one check per missile that actually has
// a Fire block used anywhere in the project. Two independent 8-way dispatch
// chains (X, then Y) rather than one combined per-direction chain, because
// bB's "if X then A" only conditions the single statement immediately after
// "then" (a real, previously-confirmed bug class in this codebase - see
// controls_repeat_ext's  label comment above) - a single "if dir=1 then
// x=x-speed : y=y-speed"-style line would silently only ever run the first
// statement. No multiplication anywhere: every direction's  step is
// always exactly -speed/0/+speed, so applying speed is a plain add/subtract.
// Per-direction (x, y) step multipliers for the "16 directions" mode - see
// sprite_*_fire's tooltip in blocks/sprites.js. There's no trig here: the 8
// halfway points inserted between the original compass points each move at
// full speed on their dominant axis and HALF speed (integer division,
// rounds down) on the other, the same coarse lookup-table approximation
// classic 2600 games used instead of real sine/cosine (see this app's
// research into how Combat's shells ricochet). Index matches ANGLE's 0-15,
// clockwise from Up, same convention as the 8-way scale just with a step
// inserted between each original point.
// The value of a generated expression that is just a number (optionally in parentheses),
// or null. Lets a generator skip a range check on a value it can see is already in range.
const literalNumber = (code) => {
  const match = /^\s*\(?\s*(\d+)\s*\)?\s*$/.exec(code);
  return match ? Number(match[1]) : null;
};

// The largest value a generated expression can have when it is a random number
// divided down, "(rand/N)", which is 255 / N at most; null for anything else.
const randomDivisionMax = (code) => {
  const match = /^\s*\(\s*rand\s*\/\s*(\d+)\s*\)\s*$/.exec(code);
  return match && Number(match[1]) > 0 ? Math.floor(255 / Number(match[1])) : null;
};

export const DIRECTION16_STEPS = [
  [0, -1], [1, -2], [1, -1], [2, -1],
  [1, 0], [2, 1], [1, 1], [1, 2],
  [0, 1], [-1, 2], [-1, 1], [-2, 1],
  [-1, 0], [-2, -1], [-1, -1], [-1, -2],
];

// In DIRECTION16_STEPS an axis value of 2 marks the dominant axis of a halfway
// direction and 1 the minor one (a pure compass point or a diagonal uses 1 on
// each axis it moves along, at full speed). So an axis steps at HALF speed only
// when its value is 1 and the other axis is 2. This used to be read the other
// way round (2 meant half), which made every halfway direction lean toward the
// wrong axis (the 16-way angles came out in the wrong order).
const isHalfStep = (step, otherStep) => Math.abs(step) === 1 && Math.abs(otherStep) === 2;

// "Check playfield while moving": the object moves one pixel at a time and, after each pixel,
// looks at the playfield cell it is in; the first lit cell ends the frame's movement there. The
// object then overlaps that playfield pixel when the frame is drawn, so the hardware collision
// flag the project's collision blocks read is set, however fast the object moves.
//
// With 16 directions the halfway directions (odd angles) move their main axis one pixel per
// step, temp3 steps in the frame, and their other axis temp4 pixels in the frame, spread evenly
// over those steps (temp5 collects the share of a pixel, against temp6, the number of steps). The
// caller works temp3 and temp4 out first (the "lean lines" in generateMissileFireChecks): temp3
// is the speed for every other direction.
const buildPlayfieldCheckedMovement = ({Blockly, name, is16, dirVar, speedVar, stepsVar}) => {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  const maxRow = Blockly.BBasic.maxRowText(config);
  const rowDivisor = Blockly.BBasic.rowDivisorText(config);
  Blockly.BBasic.usesDivMul = true;
  const id = Blockly.BBasic.blockNumbers.next('fireStep');
  const label = (part) => `_missilefire_${name}_${id}_${part}`;
  const step = (axis, sign) => ` ${name}${axis} = ${name}${axis} ${sign} 1`;
  const lines = [];
  if (is16) {
    lines.push(' temp6 = temp3', ' temp5 = 0', label('sub'));
    // Every step moves the main axis (both axes of a diagonal) one pixel.
    const minor = [];
    DIRECTION16_STEPS.forEach(([xStep, yStep], dir) => {
      [['x', xStep, yStep], ['y', yStep, xStep]].forEach(([axis, mine, other]) => {
        if (!mine) return;
        const line = ` if ${dirVar} = ${dir} then ${step(axis, mine > 0 ? '+' : '-').trim()}`;
        (isHalfStep(mine, other) ? minor : lines).push(line);
      });
    });
    // The other axis of a halfway direction moves on some of the steps.
    lines.push(
        ` if !${dirVar}{0} then goto ${label('nominor')}`,
        ' temp5 = temp5 + temp4',
        ` if temp5 < temp6 then goto ${label('nominor')}`,
        ' temp5 = temp5 - temp6',
        ...minor,
        label('nominor'));
  } else {
    lines.push(` ${stepsVar} = ${speedVar}`, label('sub'));
    [[1, 'x', '+'], [2, 'x', '+'], [3, 'x', '+'], [5, 'x', '-'], [6, 'x', '-'], [7, 'x', '-'],
      [3, 'y', '+'], [4, 'y', '+'], [5, 'y', '+'], [7, 'y', '-'], [0, 'y', '-'], [1, 'y', '-']]
        .forEach(([dir, axis, sign]) => lines.push(` if ${dirVar} = ${dir} then ${step(axis, sign).trim()}`));
  }
  lines.push(
      // The cell the object is in now. x/y are unsigned bytes, so a value
      // that wrapped below 0 shows up as too large here and is skipped.
      ` temp1 = (${name}x - ${MISSILE_BALL_PF_X_OFFSET}) / 4`,
      ` temp2 = (${name}y - 1) / ${rowDivisor}`,
      ` if temp1 > 31 then goto ${label('next')}`,
      ` if temp2 > ${maxRow} then goto ${label('next')}`,
      ` if pfread(temp1, temp2) then goto ${label('end')}`,
      label('next'),
      ` ${stepsVar} = ${stepsVar} - 1`,
      ` if ${stepsVar} > 0 then goto ${label('sub')}`,
      label('end'),
  );
  return lines;
};

// Start of every frame: the stuck-frame count of a Bounce object survives only
// if a Bounce block ran on it the frame before (bit 6, set by the block);
// otherwise the collision is over and the count starts again. Replaces a
// separate "frame of the last bounce" variable.
export const generateBounceStageChecks = (Blockly) => {
  const used = Blockly.BBasic.missileBounceUsedFor;
  if (!used || !used.size) return '';
  const lines = [];
  used.forEach((name) => {
    const pair = Blockly.BBasic.superchipRwPairs[missileBounceStageVarName(name)];
    if (!pair) return;
    const clearLabel = `_bouncestage_${name}_clear`;
    const doneLabel = `_bouncestage_${name}_done`;
    lines.push(
        ` if !${pair.read}{6} then goto ${clearLabel}`,
        ` ${pair.write} = ${pair.read} & 79`,
        ` goto ${doneLabel}`,
        clearLabel,
        ` ${pair.write} = ${pair.read} & 15`,
        doneLabel);
  });
  return lines.length ? lines.join('\n') + '\n' : '';
};

export const generateMissileFireChecks = (Blockly) => {
  const used = Blockly.BBasic.missileFireUsedFor;
  if (!used || !used.size) return '';
  const usedPfCheck = Blockly.BBasic.missileFirePfCheckUsedFor || new Set();
  const used16 = Blockly.BBasic.missileFire16UsedFor;
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const resolveRW = (canonicalName) => Blockly.BBasic.superchipRwPairs[canonicalName];
  const flagsVar = resolveVar(missileFireFlagsVarName());
  const lines = [];
  ['missile0', 'missile1', 'ball', ...[...used].filter((name) => /^player[0-9]$/.test(name))].forEach((name) => {
    if (!used.has(name)) return;
    const doneLabel = `_missilefire_${name}_done`;
    const dirVar = resolveVar(missileFireDirVarName(name));
    const constSpeed = (Blockly.BBasic.missileFireConstSpeed || new Map()).get(name);
    const speedPair = constSpeed !== undefined ? null : resolveRW(missileFireSpeedVarName(name));
    const speedVar = constSpeed !== undefined ? String(constSpeed) : speedPair.read;
    const activeBit = missileFireActiveBit(name);
    const throttlePair = resolveRW(missileFireThrottleVarName(name));
    const throttleResetPair = resolveRW(missileFireThrottleResetVarName(name));
    const throttled = !!throttlePair;
    const is16 = used16 && used16.has(name);
    const pfChecked = usedPfCheck.has(name);
    // Every "if dirVar = N then ..." line only ever conditions the ONE
    // statement right after "then" (see this function's long-standing
    // comment further down) - a step whose (x, y) pair has BOTH a nonzero x
    // and y (every 16-way entry except the 4 pure compass points) needs two
    // separate lines, one per axis, both guarded by the same dirVar check,
    // rather than one combined statement. Half-speed steps use halfSpeedVar
    // (speedVar/2, clamped to a minimum of 1 below) instead of inlining
    // "(speedVar/2)" - bB's integer division rounds 1/2 down to 0, which at
    // speed 1 would make every halfway direction's slower axis vanish,
    // making 16-way look identical to 8-way (see missileFireHalfSpeedVarName's
    // comment).
    // One computed jump on the heading (the "on ... goto" statement) to a
    // handler that makes that heading's steps, instead of a chain of 12 (8
    // directions) or 20 (16) "if heading = n" lines run on every frame the object
    // moves. A heading outside 0..steps-1 moves nothing, as before.
    const dispatchSteps = is16 ? DIRECTION16_STEPS :
      [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
    const dispatchEnd = `_missilefire_${name}_dispatchend`;
    const dispatchLabel = (dir) => `_mfd${dir}_${name}`;
    // A halfway direction (an odd angle) moves its main axis by temp3 and its other axis by
    // temp4, worked out each frame by the lines before the dispatch (see leanLines).
    const stepLine = (axis, step, other) => {
      const sign = step > 0 ? '+' : '-';
      const amount = is16 && Math.abs(step) === 2 ? 'temp3' : is16 && Math.abs(other) === 2 ? 'temp4' : speedVar;
      return ` ${name}${axis} = ${name}${axis} ${sign} ${amount}`;
    };
    const dispatch = [
      ` if ${dirVar} >= ${dispatchSteps.length} then goto ${dispatchEnd}`,
      ` on ${dirVar} goto ${dispatchSteps.map((_, dir) => dispatchLabel(dir)).join(' ')}`,
      ...dispatchSteps.flatMap(([xStep, yStep], dir) => [
        dispatchLabel(dir),
        ...(xStep ? [stepLine('x', xStep, yStep)] : []),
        ...(yStep ? [stepLine('y', yStep, xStep)] : []),
        ` goto ${dispatchEnd}`,
      ]),
      dispatchEnd,
    ];
    // The steps of a halfway direction (see stepLine), skipped for the other directions.
    const leanDone = `_missilefire_${name}_leandone`;
    const leanLines = [];
    if (is16) {
      // The pixel-by-pixel movement takes its step count from temp3, which is the speed unless the
      // direction is a halfway one.
      if (pfChecked) leanLines.push(` temp3 = ${speedVar}`);
      leanLines.push(` if !${dirVar}{0} then goto ${leanDone}`);
      // A halfway direction moves at the same total speed as a diagonal (speed * 1.41), 22.5 degrees from
      // its main axis: the main axis at speed * 1.31 and the other at speed * 0.54. Whole pixels every
      // frame, with the fractions spread over four frames: with k the frame count's low two bits times 4,
      // main = (21 * speed + k) / 16 and other = (9 * speed + k) / 16 (a speed of 1 gives 1, 1, 1, 2 and
      // 0, 0, 1, 1: close to 1.31 and 0.54, and different from a diagonal).
      leanLines.push(
          ' temp5 = framecounter & 3',
          ' temp5 = temp5 * 4');
      if (constSpeed !== undefined) {
        leanLines.push(` temp3 = ${21 * constSpeed}`, ` temp4 = ${9 * constSpeed}`);
      } else {
        leanLines.push(` temp3 = ${speedVar} * 21`, ` temp4 = ${speedVar} * 9`);
      }
      leanLines.push(
          ' temp3 = temp3 + temp5',
          ' temp3 = temp3 / 16',
          ' temp4 = temp4 + temp5',
          ' temp4 = temp4 / 16');
      leanLines.push(leanDone);
    }
    const throttleContinueLabel = `_missilefire_${name}_throttlecontinue`;
    lines.push(
        ` if !${flagsVar}{${activeBit}} then goto ${doneLabel}`,
        // Was "throttlePair.write = throttlePair.read - 1" followed by a
        // separately bB-compiled "if throttlePair.read then goto doneLabel" -
        // that second line re-loaded the very same byte from RAM purely to
        // re-derive the zero flag the subtraction just above already left
        // set (STA doesn't touch flags, nothing else runs in between). Raw
        // asm instead, branching straight off that flag - read/write pool
        // addresses differ physically (see reserveDevVarRW's  comment),
        // so this still can't be a single in-place "dec", just the same
        // lda/sec/sbc/sta bB itself already compiles to, with the reload
        // removed. doneLabel is a bB-generated label defined OUTSIDE this
        // asm block, so the jump to it needs the same dot-prefixed local
        // name DASM itself expects (see generators/bbasic/music.js's
        // extensive comment on this) - throttleContinueLabel is purely
        // local to this block, so it doesn't need one.
        ...(throttled ? [
          ' asm',
          '       lda ' + throttlePair.read,
          '       sec',
          '       sbc #1',
          '       sta ' + throttlePair.write,
          '       beq ' + throttleContinueLabel,
          '       jmp .' + doneLabel,
          throttleContinueLabel,
          'end',
          ` ${throttlePair.write} = ${throttleResetPair.read}`,
        ] : []),
        // Speed 0 means stand still: nothing below (the half-speed minimum of
        // 1, or the pixel-step counter) may run for it.
        ...(constSpeed === undefined ? [` if ${speedVar} = 0 then goto ${doneLabel}`] :
          constSpeed === 0 ? [` goto ${doneLabel}`] : []),
        ...(is16 ? leanLines : []),
        ...(pfChecked ?
          buildPlayfieldCheckedMovement({
            Blockly, name, is16, dirVar, speedVar,
            // temp3 survives the playfield reads (only temp1/temp2 are overwritten),
            // so the sub-step counter needs no variable.
            stepsVar: 'temp3',
          }) :
          dispatch),
        // Off-screen (standard NTSC playfield bounds) stops the movement -
        // clears the active bit so this missile's  dispatch above is
        // skipped every frame from here on - WITHOUT touching its
        // Height (confirmed with the user: it should stop, not change
        // size/visibility by itself - that stays entirely up to whatever
        // "Missile: set Height" blocks the user has elsewhere). x/y are
        // unsigned bytes (see math.js's "Player coordinates ... are
        // unsigned bytes" comment) - stepping past 0 wraps around to a large
        // positive value rather than going negative, so there's no separate
        // "< 0" case to check: an out-of-range value from EITHER direction
        // always lands as "> 159"/"> 191" here.
        ...((Blockly.BBasic.missileEdgeBounceUsedFor || new Set()).has(name) ? [] :
          [` if ${name}x > 159 || ${name}y > 191 then ${flagsVar}{${activeBit}} = 0`]),
        `${doneLabel}`,
    );
  });
  return lines.join('\n') + '\n';
};

// Spliced into commongamelogic right alongside generateMissileFireChecks
// (same region, same reasoning: nothing else there touches this sprite's
// position) - one check per sprite name that actually has a Seek block used
// anywhere in the project. Per axis: step toward the target by up to speed
// pixels, landing exactly on it rather than overshooting. The remaining
// distance is always computed via subtraction in whichever direction the
// branch just taken already guarantees is safe (the larger value minus the
// smaller), THEN clamped to speed - never the other way around - so this
// stays correct however large speed or the remaining distance is, with no
// unsigned-byte-underflow risk (the exact class of bug the playfield-
// collision work ran into repeatedly - worth being deliberate about here
// even though this arithmetic is much simpler). temp1 is safe scratch here:
// only clobbered by drawscreen, which can't run mid-statement (see
// score.js's  comment on the same convention), and nothing in this block
// calls pfread() to worry about clobbering it early.
// Every sprite Seek and Inertia can move: the two players, the missiles and the ball, and, on DPC+, the extra
// players the project uses.
const moveableSpriteNames = (Blockly) => ['player0', 'player1',
  ...(Blockly.BBasic.dpcPlusExtraPlayers || []).map((n) => `player${n}`), 'missile0', 'missile1', 'ball'];

export const generateSeekChecks = (Blockly) => {
  const used = Blockly.BBasic.seekUsedFor;
  if (!used || !used.size) return '';
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const flagsVar = resolveVar(seekFlagsVarName());
  const arrivedWatches = Blockly.BBasic.seekArrivedWatches || new Set();
  const lines = [];
  moveableSpriteNames(Blockly).forEach((name) => {
    if (!used.has(name)) return;
    const blockNumber = Blockly.BBasic.blockNumbers.next(`seek_${name}`);
    const doneLabel = `_seek_${name}_${blockNumber}_done`;
    const arrivedLabel = `_seek_${name}_${blockNumber}_arrived`;
    const targetXVar = resolveVar(seekXVarName(name));
    const targetYVar = resolveVar(seekYVarName(name));
    const speedVar = resolveVar(seekSpeedVarName(name));
    const activeBit = seekActiveBit(name);
    const isArrivedWatched = arrivedWatches.has(name);
    const arrivedFlagBit = isArrivedWatched ?
      `${resolveVar(seekArrivedFlagsVarName())}{${seekArrivedBit(name)}}` : null;
    const throttlePair = Blockly.BBasic.superchipRwPairs[seekThrottleVarName(name)];
    const throttleResetPair = Blockly.BBasic.superchipRwPairs[seekThrottleResetVarName(name)];

    const buildAxisSteps = (axis, targetVar) => {
      const axisDoneLabel = `_seek_${name}_${blockNumber}_${axis}done`;
      const rightLabel = `_seek_${name}_${blockNumber}_${axis}right`;
      const coord = `${name}${axis}`;
      return [
        ` if ${coord} = ${targetVar} then goto ${axisDoneLabel}`,
        ` if ${targetVar} > ${coord} then goto ${rightLabel}`,
        ` temp1 = ${coord} - ${targetVar}`,
        ` if temp1 > ${speedVar} then temp1 = ${speedVar}`,
        ` ${coord} = ${coord} - temp1`,
        ` goto ${axisDoneLabel}`,
        `${rightLabel}`,
        ` temp1 = ${targetVar} - ${coord}`,
        ` if temp1 > ${speedVar} then temp1 = ${speedVar}`,
        ` ${coord} = ${coord} + temp1`,
        `${axisDoneLabel}`,
      ];
    };

    lines.push(
        ` if !${flagsVar}{${activeBit}} then goto ${doneLabel}`,
        ` ${throttlePair.write} = ${throttlePair.read} - 1`,
        ` if ${throttlePair.read} then goto ${doneLabel}`,
        ` ${throttlePair.write} = ${throttleResetPair.read}`,
        ...buildAxisSteps('x', targetXVar),
        ...buildAxisSteps('y', targetYVar),
        ` if ${name}x = ${targetXVar} && ${name}y = ${targetYVar} then goto ${arrivedLabel}`,
        ` goto ${doneLabel}`,
        `${arrivedLabel}`,
        ` ${flagsVar}{${activeBit}} = 0`,
        ...(isArrivedWatched ? [` ${arrivedFlagBit} = 1`] : []),
        `${doneLabel}`,
    );
  });
  return lines.join('\n') + '\n';
};

// Clamps velocityVar (a two's-complement signed byte) to +/-maxSpeedVar
// (an ordinary unsigned magnitude, realistically well under 128) - bB's
// "if" comparisons are unsigned-only (see inertiaVelocityXVarName's
// comment), so this branches on the sign bit first (BPL/BMI, a single cheap
// check) and does a plain UNSIGNED compare within whichever half of the
// byte range applies from there - valid specifically because both operands
// stay within 0-127 (positive branch) or 128-255 (negative branch) after
// that split, where unsigned and signed comparison agree. negMaxVar is
// computed fresh each call (0 - maxSpeedVar) rather than kept as its
// dev var - two extra instructions, cheaper than a whole extra byte of
// state kept in sync with every "set max speed" write.
const buildSignedClampAsm = (velocityVar, maxSpeedVar, uid) => {
  const posLabel = `_inertiaclamp${uid}_pos`;
  const doneLabel = `_inertiaclamp${uid}_done`;
  return [
    '       lda ' + velocityVar,
    '       bpl ' + posLabel,
    '       lda #0',
    '       sec',
    '       sbc ' + maxSpeedVar,
    '       sta temp7',
    '       lda ' + velocityVar,
    '       cmp temp7',
    '       bcs ' + doneLabel,
    '       lda temp7',
    '       jmp ' + doneLabel,
    posLabel,
    '       cmp ' + maxSpeedVar,
    '       bcc ' + doneLabel,
    '       lda ' + maxSpeedVar,
    doneLabel,
    '       sta ' + velocityVar,
  ];
};

// Steps velocityVar one decelRateVar closer to 0, clamping AT (not past)
// zero - the classic "friction overshoot" bug this guards against directly:
// subtracting decelRateVar from a small positive velocity (or adding it to
// a small negative one) can otherwise cross zero and start moving the
// OPPOSITE direction, which real friction never does. Same sign-bit-first
// split as buildSignedClampAsm above; the positive branch's "cmp
// decelRateVar / bcc" is a plain unsigned compare, valid for the same
// reason (both operands 0-127 here).
const buildDecelerateAsm = (velocityVar, decelRateVar, uid) => {
  const negLabel = `_inertiadecel${uid}_neg`;
  const zeroLabel = `_inertiadecel${uid}_zero`;
  const doneLabel = `_inertiadecel${uid}_done`;
  return [
    '       lda ' + velocityVar,
    '       bmi ' + negLabel,
    '       cmp ' + decelRateVar,
    '       bcc ' + zeroLabel,
    '       sec',
    '       sbc ' + decelRateVar,
    '       jmp ' + doneLabel,
    negLabel,
    '       clc',
    '       adc ' + decelRateVar,
    '       bmi ' + doneLabel,
    zeroLabel,
    '       lda #0',
    doneLabel,
    '       sta ' + velocityVar,
  ];
};

// "Fine" mode's fixed-point helpers (see inertiaFineUsedFor's pre-scan in
// bbasic.js, and inertiaVelocityFracXVarName's comment in this file) - a
// [intVar:fracVar] pair, intVar the signed high byte, fracVar the unsigned
// (0-255) low byte, is a standard 16-bit two's complement number
// representing intVar + fracVar/256 for every value including negative ones
// (confirmed by hand: -1.25 in this scheme is intVar=$FE (-2), fracVar=$C0
// (192) = -2 + 192/256 = -1.25) - so plain ADC/SBC chains below work
// correctly for both signs with no branching needed, unlike
// buildSignedClampAsm/buildDecelerateAsm above (which both need a sign-bit
// branch because THEIR single-byte values can't carry/borrow into anything
// wider). Matches the real technique this era's hardware used for sub-pixel
// movement (confirmed directly against the Asteroids arcade disassembly at
// computerarcheology.com/Arcade/Asteroids/Code.html: velocity added into a
// low position byte, carry propagated via ADC into the high byte).

// [intVar:fracVar] += [0:amountVar] - amountVar is a plain 0-255 magnitude
// (Fine mode's "rate" - always sub-1, no whole-pixel part), so only the low
// byte needs an explicit add; the high byte just needs the carry folded in.
const build16BitAddAsm = (intVar, fracVar, amountVar) => [
  '       lda ' + fracVar,
  '       clc',
  '       adc ' + amountVar,
  '       sta ' + fracVar,
  '       lda ' + intVar,
  '       adc #0',
  '       sta ' + intVar,
];

// Mirror of build16BitAddAsm above for the opposite direction.
const build16BitSubAsm = (intVar, fracVar, amountVar) => [
  '       lda ' + fracVar,
  '       sec',
  '       sbc ' + amountVar,
  '       sta ' + fracVar,
  '       lda ' + intVar,
  '       sbc #0',
  '       sta ' + intVar,
];

// Standard 16-bit two's complement negation (invert every bit, add 1, with
// the +1's carry propagating from the low byte into the high byte) - used
// by object_bounce's Fine-mode reflection below. Only valid for a plain,
// single-symbol var (same physical address for read and write) - NOT safe
// to call directly against an RW-pool {read, write} pair's symbols,
// since a carry chain needs to read-then-write the SAME address each step;
// object_bounce's Fine-mode branch below always copies an RW-pool
// snapshot into an ordinary var first, then negates the ordinary var in
// place, rather than ever negating an RW-pool pair directly.
const build16BitNegateAsm = (intVar, fracVar) => [
  '       lda ' + fracVar,
  '       eor #$FF',
  '       clc',
  '       adc #1',
  '       sta ' + fracVar,
  '       lda ' + intVar,
  '       eor #$FF',
  '       adc #0',
  '       sta ' + intVar,
];

// 16-bit widened version of buildDecelerateAsm above, same "clamp AT zero,
// never overshoot past it" guarantee, just done across the fixed-point
// pair instead of a single byte. amountVar is applied unconditionally
// first (compute-then-correct, rather than comparing magnitudes up front -
// simpler to get right across two bytes), then checked for having crossed
// zero: the positive branch only overshoots if the OLD value was already
// below 1.0 (intVar was 0) and amountVar pushed it negative; the negative
// branch only overshoots if the old value was already above -1.0 (intVar
// was -1) and amountVar pushed it to positive OR to exactly zero with a
// nonzero fracVar remainder (landing at a small positive value is just as
// much a direction reversal as landing at a large one, so it's clamped
// too - the same "friction never overshoots" guarantee buildDecelerateAsm
// itself makes, just checked across two bytes instead of one).
const buildFineDecelerateAsm = (intVar, fracVar, amountVar, uid) => {
  const negLabel = `_inertiafinedecel${uid}_neg`;
  const clampLabel = `_inertiafinedecel${uid}_clamp`;
  const doneLabel = `_inertiafinedecel${uid}_done`;
  return [
    '       lda ' + intVar,
    '       bmi ' + negLabel,
    '       lda ' + fracVar,
    '       sec',
    '       sbc ' + amountVar,
    '       sta ' + fracVar,
    '       lda ' + intVar,
    '       sbc #0',
    '       sta ' + intVar,
    '       bpl ' + doneLabel,
    '       jmp ' + clampLabel,
    negLabel,
    '       lda ' + fracVar,
    '       clc',
    '       adc ' + amountVar,
    '       sta ' + fracVar,
    '       lda ' + intVar,
    '       adc #0',
    '       sta ' + intVar,
    '       bmi ' + doneLabel,
    '       bne ' + clampLabel,
    '       lda ' + fracVar,
    '       beq ' + doneLabel,
    clampLabel,
    '       lda #0',
    '       sta ' + intVar,
    '       sta ' + fracVar,
    doneLabel,
  ];
};

// Fine mode's position integration - replaces the plain bB
// "${name}x = ${name}x + velocityXVar" line for a Fine-using sprite:
// accumulates velocity's fractional byte into a dedicated position
// sub-pixel accumulator (posFracVar), then adds velocity's signed whole-
// pixel byte PLUS whatever carried out of that accumulation into the real
// on-screen position - the exact Asteroids technique cited above, just
// with the "velocity" role played by intVar/fracVar instead of a plain
// per-frame delta.
const buildFinePositionStepAsm = (posVar, intVar, fracVar, posFracVar) => [
  '       lda ' + posFracVar,
  '       clc',
  '       adc ' + fracVar,
  '       sta ' + posFracVar,
  '       lda ' + posVar,
  '       adc ' + intVar,
  '       sta ' + posVar,
];

// Spliced into commongamelogic right alongside generateSeekChecks/
// generateMissileFireChecks (same region, same "nothing else touches this
// sprite's position there" reasoning) - one block per sprite name that
// actually has Accelerate and/or Decelerate used anywhere in the project.
// Accelerate's  direction dispatch (which axis/sign accelRateVar adds
// to) is plain bB if/goto, the exact same 12-line 8-way shape
// generateMissileFireChecks'  dispatch already uses (just adding into
// velocityX/Y instead of stepping name x/y directly) - only the max-speed
// clamp and the decelerate-toward-zero step need hand asm (see
// buildSignedClampAsm/buildDecelerateAsm's  comments on why). Position
// integration itself is a single plain bB add per axis, unconditional,
// after both accel/decel have had their turn - works correctly on the
// two's-complement byte with no special handling at all.
export const generateInertiaChecks = (Blockly) => {
  const usedFor = Blockly.BBasic.inertiaUsedFor;
  if (!usedFor || !usedFor.size) return '';
  const accelUsedFor = Blockly.BBasic.inertiaAccelUsedFor || new Set();
  const accel16UsedFor = Blockly.BBasic.inertiaAccel16UsedFor || new Set();
  const decelUsedFor = Blockly.BBasic.inertiaDecelUsedFor || new Set();
  const fineUsedFor = Blockly.BBasic.inertiaFineUsedFor || new Set();
  const resolveVar = (canonicalName) =>
    Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const accelFlagsVar = accelUsedFor.size ? resolveVar(inertiaAccelFlagsVarName()) : null;
  const decelFlagsVar = decelUsedFor.size ? resolveVar(inertiaDecelFlagsVarName()) : null;
  const lines = [];
  moveableSpriteNames(Blockly).forEach((name) => {
    if (!usedFor.has(name)) return;
    const velocityXVar = resolveVar(inertiaVelocityXVarName(name));
    const velocityYVar = resolveVar(inertiaVelocityYVarName(name));
    const accelBit = () => inertiaAccelActiveBit(name);
    const decelBit = () => inertiaDecelActiveBit(name);
    const uid = Blockly.BBasic.blockNumbers.next(`inertia_${name}`);
    const isFine = fineUsedFor.has(name);
    const velocityFracXVar = isFine ? resolveVar(inertiaVelocityFracXVarName(name)) : null;
    const velocityFracYVar = isFine ? resolveVar(inertiaVelocityFracYVarName(name)) : null;

    if (accelUsedFor.has(name)) {
      const dirVar = resolveVar(inertiaAccelDirVarName(name));
      const rateVar = resolveVar(inertiaAccelRateVarName(name));
      const maxSpeedVar = resolveVar(inertiaMaxSpeedVarName(name));
      const skipLabel = `_inertiaaccel_${name}_skip`;
      // Fine mode only supports 8-way (see sprite_inertia_accelerate's
      // tooltip in blocks/sprites.js - "can't be combined with 16
      // directions") - 16-way's DIRECTIONS16 checkbox is simply
      // ignored here if Fine is also on, rather than adding a second,
      // fixed-point-aware half-rate concept on top of everything else.
      const is16 = !isFine && accel16UsedFor.has(name);
      const halfRateVar = is16 ? resolveVar(inertiaAccelHalfRateVarName(name)) : null;
      // Same 8-way/16-way dispatch generateMissileFireChecks'  Fire
      // dispatch uses (see its  comments, including DIRECTION16_STEPS'
      // "no trig, dominant axis full rate / other axis half rate"
      // approximation, and missileFireHalfSpeedVarName's  comment on why
      // the half-rate step needs a clamped-to-minimum-1 var instead of
      // inlining "(rateVar/2)") - just adding into velocityX/Y here instead
      // of stepping name x/y directly. Fine mode wraps each conditional
      // add/subtract in its goto/label pair so the fixed-point asm
      // (build16BitAddAsm/build16BitSubAsm) can run as the "then" action -
      // a plain bB "if X then Y" only allows one statement for Y, and an
      // asm block isn't one, unlike the non-Fine path's plain add/subtract
      // line.
      // Bare labels (no "@" prefix) - this function's output is
      // spliced directly into commongamelogic's body (see this file's
      // generateInertiaChecks call site in bbasic.js), never passed through
      // Blockly.BBasic.normalizeIndents() the way a normal per-block
      // generator's output automatically is - the SAME reason skipLabel
      // below (in the existing, non-Fine code) has always been a bare
      // label rather than "@"-prefixed. An earlier version of this used
      // "@"-prefixed labels here (copying the convention from block
      // generators that DO go through normalizeIndents, like
      // background_scroll) and it reached preprocess.wasm as a literal,
      // unrecognized "@" character - confirmed directly against a real
      // failed build.
      //
      // One shared asm block per axis-direction (add vs subtract), not one
      // per compass direction - the three directions that add to a given
      // axis (e.g. 1/2/3 for X) all run the exact same build16BitAddAsm
      // body, so branching all three "if dirVar = N" checks at the SAME
      // doLabel instead of giving each a separate copy cuts this dispatch's
      // spliced-into-commongamelogic size by roughly 3x per axis. This is
      // the fix for a real reported build failure ("Unknown Mnemonic 'sta
      // TextColor'", only when Fine is on): confirmed via this codebase's
      // existing relocation-system comments (generators/bbasic.js's
      // banksBeforeGapFill/everyDeclaredBank and hooks/rom.js's isOverflow
      // Error) that this exact "Unknown Mnemonic" cascade, after the
      // auto-relocation retry loop exhausts its attempts, is this
      // toolchain's known fingerprint for bank 1 genuinely not fitting -
      // and this dispatch (like generateSeekChecks/generateMissileFire
      // Checks alongside it) is spliced directly into commongamelogic,
      // never wrapped as a relocatable unit, so the auto-relocation system
      // can never move it out of bank 1 no matter how large it gets.
      const buildFineAxisDispatch = (addDirs, subDirs, velVar, fracVar, suffix) => {
        const addLabel = `_inertiafineaccel_${uid}_${suffix}add`;
        const subLabel = `_inertiafineaccel_${uid}_${suffix}sub`;
        const skipLabel = `_inertiafineaccel_${uid}_${suffix}skip`;
        return [
          ...addDirs.map((dir) => ` if ${dirVar} = ${dir} then goto ${addLabel}`),
          ...subDirs.map((dir) => ` if ${dirVar} = ${dir} then goto ${subLabel}`),
          ` goto ${skipLabel}`,
          addLabel,
          ' asm',
          ...build16BitAddAsm(velVar, fracVar, rateVar),
          'end',
          ` goto ${skipLabel}`,
          subLabel,
          ' asm',
          ...build16BitSubAsm(velVar, fracVar, rateVar),
          'end',
          skipLabel,
        ];
      };
      const dispatch = isFine ?
        [
          ...buildFineAxisDispatch([1, 2, 3], [5, 6, 7], velocityXVar, velocityFracXVar, 'x'),
          ...buildFineAxisDispatch([3, 4, 5], [7, 0, 1], velocityYVar, velocityFracYVar, 'y'),
        ] :
        is16 ?
        DIRECTION16_STEPS.flatMap(([xStep, yStep], dir) => [
          ...(xStep ? [` if ${dirVar} = ${dir} then ${velocityXVar} = ${velocityXVar} ${xStep > 0 ? '+' : '-'} ` +
            `${isHalfStep(xStep, yStep) ? halfRateVar : rateVar}`] : []),
          ...(yStep ? [` if ${dirVar} = ${dir} then ${velocityYVar} = ${velocityYVar} ${yStep > 0 ? '+' : '-'} ` +
            `${isHalfStep(yStep, xStep) ? halfRateVar : rateVar}`] : []),
        ]) :
        [
          ` if ${dirVar} = 1 then ${velocityXVar} = ${velocityXVar} + ${rateVar}`,
          ` if ${dirVar} = 2 then ${velocityXVar} = ${velocityXVar} + ${rateVar}`,
          ` if ${dirVar} = 3 then ${velocityXVar} = ${velocityXVar} + ${rateVar}`,
          ` if ${dirVar} = 5 then ${velocityXVar} = ${velocityXVar} - ${rateVar}`,
          ` if ${dirVar} = 6 then ${velocityXVar} = ${velocityXVar} - ${rateVar}`,
          ` if ${dirVar} = 7 then ${velocityXVar} = ${velocityXVar} - ${rateVar}`,
          ` if ${dirVar} = 3 then ${velocityYVar} = ${velocityYVar} + ${rateVar}`,
          ` if ${dirVar} = 4 then ${velocityYVar} = ${velocityYVar} + ${rateVar}`,
          ` if ${dirVar} = 5 then ${velocityYVar} = ${velocityYVar} + ${rateVar}`,
          ` if ${dirVar} = 7 then ${velocityYVar} = ${velocityYVar} - ${rateVar}`,
          ` if ${dirVar} = 0 then ${velocityYVar} = ${velocityYVar} - ${rateVar}`,
          ` if ${dirVar} = 1 then ${velocityYVar} = ${velocityYVar} - ${rateVar}`,
        ];
      lines.push(
          ` if !${accelFlagsVar}{${accelBit()}} then goto ${skipLabel}`,
          ...(is16 ? [
            ` ${halfRateVar} = ${rateVar} / 2`,
            // A rate of 1 has no whole-number half: the slower axis alternates between adding 0
            // and 1 each frame, instead of 1 every frame (which made every halfway direction
            // accelerate like the diagonal beside it).
            ` if ${halfRateVar} = 0 then ${halfRateVar} = framecounter & 1`,
          ] : []),
          ...dispatch,
          ' asm',
          ...buildSignedClampAsm(velocityXVar, maxSpeedVar, `${uid}x`),
          ...buildSignedClampAsm(velocityYVar, maxSpeedVar, `${uid}y`),
          'end',
          skipLabel,
      );
    }

    if (decelUsedFor.has(name)) {
      const rateVar = resolveVar(inertiaDecelRateVarName(name));
      const skipLabel = `_inertiadecel_${name}_skip`;
      // Auto-stop: once decelerate has clamped velocity all the way to
      // exactly 0 on both axes (buildDecelerateAsm/buildFineDecelerateAsm
      // both clamp AT zero, never past it - see their comments), there's
      // nothing left to decelerate, so this clears the active bit itself
      // instead of leaving Decelerate running (and re-checking already-zero
      // velocity) every frame forever until a "Stop" block runs. Reuses
      // skipLabel as the "still moving, leave it on" bail-out target - if
      // ANY of these checks finds a nonzero byte, it jumps straight past the
      // "clear the flag" line below to the same fallthrough point a
      // still-decelerating frame already reaches. Fine mode also has to
      // check both fractional bytes (a whole-pixel byte of 0 with leftover
      // sub-pixel velocity is still moving), not just the whole-pixel ones.
      const autoStopChecks = [velocityXVar, velocityYVar,
        ...(isFine ? [velocityFracXVar, velocityFracYVar] : [])]
          .map((v) => ` if ${v} <> 0 then goto ${skipLabel}`);
      lines.push(
          ` if !${decelFlagsVar}{${decelBit()}} then goto ${skipLabel}`,
          ' asm',
          ...(isFine ? [
            ...buildFineDecelerateAsm(velocityXVar, velocityFracXVar, rateVar, `${uid}x`),
            ...buildFineDecelerateAsm(velocityYVar, velocityFracYVar, rateVar, `${uid}y`),
          ] : [
            ...buildDecelerateAsm(velocityXVar, rateVar, `${uid}x`),
            ...buildDecelerateAsm(velocityYVar, rateVar, `${uid}y`),
          ]),
          'end',
          ...autoStopChecks,
          ` ${decelFlagsVar}{${decelBit()}} = 0`,
          skipLabel,
      );
    }

    if (isFine) {
      const posFracXVar = resolveVar(inertiaPosFracXVarName(name));
      const posFracYVar = resolveVar(inertiaPosFracYVarName(name));
      lines.push(
          ' asm',
          ...buildFinePositionStepAsm(`${name}x`, velocityXVar, velocityFracXVar, posFracXVar),
          ...buildFinePositionStepAsm(`${name}y`, velocityYVar, velocityFracYVar, posFracYVar),
          'end',
      );
    } else {
      lines.push(
          ` ${name}x = ${name}x + ${velocityXVar}`,
          ` ${name}y = ${name}y + ${velocityYVar}`,
      );
    }
  });
  return lines.join('\n') + '\n';
};

// Writes the two spare playerNsize bits sprite_player_set/sprite_player_
// change's "loop" checkbox (see blocks/sprites.js's LOOP_INPUT comment) and
// the new one-step sprite_player_set_animation/sprite_player_set_animation_id
// blocks all share: bit 4 ("loop disabled" - 0, the power-on/boot default,
// means looping IS on, matching the checkbox's default-checked state with
// no extra init code needed anywhere) and bit 5 ("animation finished" -
// always cleared here, since assigning a new animation index starts a fresh
// playthrough regardless of whether the previous one had finished). Only
// ever called where varName is known to end in "animation" (see each call
// site) - playerNsize's bits 4/5 (unlike 0-3, 6 - see bbasic.js's
// processAnimation comment on the full layout) are otherwise unused, so
// writing them for every OTHER property would be harmless but pointless.
// DPC+ loads a player's graphic and color tables only when something changed, and bit 7 of the player's size
// variable says they are loaded. A change of the animation or color has to clear it, and setting the value it
// already has must not (the same block often runs every frame).
const assignAndReload = (varName, valueCode) => {
  if ((useConfigurationStorage().value || {}).kernel !== 'dpcplus') return `${varName} = ${valueCode}\n`;
  const sizeVar = varName.replace(/(animation|realcolor)$/, 'size');
  if (/^\s*\d+\s*$/.test(valueCode)) {
    return `if ${varName} <> ${valueCode.trim()} then ${sizeVar}{7} = 0\n${varName} = ${valueCode}\n`;
  }
  return `temp1 = ${valueCode}\nif ${varName} <> temp1 then ${sizeVar}{7} = 0\n${varName} = temp1\n`;
};

const animationLoopBitsCode = (block, varName) => {
  const loopField = block.getField('LOOP');
  const loop = loopField ? block.getFieldValue('LOOP') === 'TRUE' : true;
  const sizeVar = varName.replace('animation', 'size');
  // "restart" (only on the one-step set animation blocks) puts the animation's
  // frame counter back to its first frame; without it the new animation picks
  // up from the counter's current position.
  const restart = block.getField('RESTART') && block.getFieldValue('RESTART') === 'TRUE';
  return `${sizeVar}{4} = ${loop ? 0 : 1}\n` +
    `${sizeVar}{5} = 0\n` +
    (restart ? `${varName.replace('animation', 'frame')} = 0\n` : '');
};

export default (Blockly) => {
  const createGeneratorForSprite = (name) => {
    Blockly.BBasic[`sprite_${name}_get`] = function(block) {
      // Variable getter.
      // The width/quantity option reads the low 3 bits of the size variable.
      const widthOf = /^__(player\d)size_w_$/.exec(block.getFieldValue('VAR') || '');
      if (widthOf) return [`(${widthOf[1]}size & 7)`, Blockly.BBasic.ORDER_ATOMIC];
      // Visibility: a hidden player is on frame 255, so frame / 255 is 1 for hidden and 0 for shown.
      const visibleOf = /^__(player\d)visible_$/.exec(block.getFieldValue('VAR') || '');
      if (visibleOf) {
        Blockly.BBasic.usesDivMul = true;
        return [`(1 - ${visibleOf[1]}frame / 255)`, Blockly.BBasic.ORDER_ATOMIC];
      }
      // Horizontal flip is bit 3 of the size variable.
      const flipOf = /^__(player\d)size_3_$/.exec(block.getFieldValue('VAR') || '');
      if (flipOf) return [`((${flipOf[1]}size & 8) / 8)`, Blockly.BBasic.ORDER_ATOMIC];
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
        // Ball width packs into CTRLPF's  bits 4-5 - masked in against
        // CTRLPF's CURRENT value (207 = 0b11001111, clearing only bits 4-5)
        // rather than overwriting the whole byte, which used to also
        // hardcode bit 0 (playfield reflect) permanently on and reset bit 2
        // (playfield priority - see sprite_priority_set's `CTRLPF{2} =`
        // bit-safe write just below) back to 0 every time ball width was
        // set - a real bug (reported as "changing sprite priority flips the
        // right half of the playfield," since whichever of the two blocks
        // ran later silently undid the other's  bit).
        //
        // Reads/writes the CTRLPF RAM shadow (see reserveCtrlpfShadowDevVar's
        // comment for why the real hardware register can't be safely
        // read back), flushing it to the real CTRLPF right after. temp1
        // holds the multiply as its  statement rather than inline (not
        // the actual root cause of the playfield-flip bug, but still cheap
        // insurance against batari Basic's  documented history of
        // compound-expression bugs, e.g. RAND_OPTIONS ruling out division
        // combined with multiplication in one expression) - safe here, only
        // clobbered by drawscreen, which can't run mid-statement (see
        // score.js's  comment on the same convention).
        const shadowVar = Blockly.BBasic.nameDB_.getName(ctrlpfShadowVarName(),
            Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        return `temp1 = (${argument0}) * 16\n` +
            `${shadowVar} = (${shadowVar} & 207) + temp1\n` +
            `CTRLPF = ${shadowVar}\n`;
      } else if (varName.endsWith('width')) {
        // Missile width packs into NUSIZ's  bits 4-5 as a 2-bit code
        // (0-3), not the pixel width itself - unlike ballwidth's  CTRLPF
        // branch just above (which exposes that raw 0-3 code directly),
        // this block takes the actual pixel width (1/2/4/8, the only values
        // real hardware supports) and converts it here, since typing the
        // real width a project actually wants is more intuitive than
        // remembering the code that produces it. Captured into temp1 first
        // (argument0 might be an arbitrary expression, not just a bare
        // literal) and compared against each of the 4 valid widths in turn -
        // temp2 starts at 0 (matching width 1, the code's  natural
        // "nothing set" value) and only needs updating for the other three;
        // any other width the project might pass in (not 1/2/4/8) falls
        // back to that same 0/1-pixel code rather than producing an
        // invalid NUSIZ pattern.
        const widthsVar = Blockly.BBasic.nameDB_.getName(missileWidthsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        const secondMissile = varName.startsWith('missile1');
        return `temp1 = ${argument0}\n` +
            `temp2 = 0\n` +
            `if temp1 = 2 then temp2 = 1\n` +
            `if temp1 = 4 then temp2 = 2\n` +
            `if temp1 = 8 then temp2 = 3\n` +
            `temp2 = temp2 * ${secondMissile ? 64 : 16}\n` +
            `${widthsVar} = (${widthsVar} & ${secondMissile ? '$3F' : '$CF'}) + temp2\n`;
      } else if (/^player\dheight$/.test(varName) && (useConfigurationStorage().value || {}).kernel === 'dpcplus') {
        const limit = Blockly.BBasic.nameDB_.getName(playerHeightLimitVarName(varName.replace('height', '')),
            Blockly.Names.DEVELOPER_VARIABLE_TYPE);
        return `${limit} = ${argument0} + 1
`;
      } else if (varName.endsWith('visibility')) {
        const blockNumber = Blockly.BBasic.blockNumbers.next();
        const baseLabel = `_visibility_${blockNumber}`;

        const frameVarName = varName.replace('visibility', 'frame');
        // A constant Visible/Hidden needs no test at all.
        if (argument0.trim() === 'true') {
          return `if ${frameVarName} = 255 then ${frameVarName} = 0
`;
        }
        if (argument0.trim() === 'false') {
          return `${frameVarName} = 255
`;
        }
        return [
          `if ${argument0} then goto ${baseLabel}_visible else ${frameVarName} = 255 : goto ${baseLabel}_end`,
          `@ ${baseLabel}_visible`,
          `if ${frameVarName} = 255 then ${frameVarName} = 0`,
          `@ ${baseLabel}_end`,
        ].join('\n') + '\n\n';
      } else if (varName.endsWith('size_3_')) {
        const bitVarName = varName.replace('__', '').replace('_3_', '{3}');
        return `if ${argument0} then ${bitVarName} = 1 else ${bitVarName} = 0\n`;
      } else if (varName.endsWith('animation')) {
        return assignAndReload(varName, argument0) + animationLoopBitsCode(block, varName);
      }
      // Players 2 to 9 are colored by a table in ROM per color, so each fixed color a block gives one is noted
      // (see generateAnimations); a color worked out while the game runs can not be shown on them.
      const extraColor = /^(player\d)realcolor$/.exec(varName);
      if (extraColor) {
        const literal = /^\s*(?:\$([0-9a-fA-F]{1,2})|(\d+))\s*$/.exec(argument0);
        if (literal) {
          const byte = literal[1] ? parseInt(literal[1], 16) : Number(literal[2]);
          const colors = Blockly.BBasic.dpcPlusPlayerColors;
          if (byte >= 0 && byte <= 255 && colors) (colors[extraColor[1]] = colors[extraColor[1]] || new Set()).add(byte);
        }
      }
      if (extraColor && (useConfigurationStorage().value || {}).kernel === 'dpcplus') return assignAndReload(varName, argument0);
      // DPC+ counts a player's y in scanlines down to the sprite's top edge, the standard kernel in units of two
      // scanlines down to the sprite's bottom edge (line 2 * y + 4), and the DPC+ picture starts 4 lines higher, so
      // the same spot is 2 * y minus the sprite's height in lines.
      if (/^player\dy$/.test(varName) && (useConfigurationStorage().value || {}).kernel === 'dpcplus') {
        const lines = Blockly.BBasic.dpcPlusSpriteLines();
        const literal = /^\s*(\d+)\s*$/.exec(argument0);
        if (literal) return `${varName} = ${Math.min(255, Math.max(0, 2 * Number(literal[1]) - lines))}\n`;
        return `temp1 = (${argument0}) * 2\n${varName} = temp1 - ${lines}\n`;
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
      const assignment = `${varName} = ${varName} ${operator} ${argument0}\n`;
      if (varName.endsWith('animation') && (useConfigurationStorage().value || {}).kernel === 'dpcplus') {
        return assignment + `${varName.replace('animation', 'size')}{7} = 0\n` + animationLoopBitsCode(block, varName);
      }
      return varName.endsWith('animation') ? assignment + animationLoopBitsCode(block, varName) : assignment;
    };
  };

  // Player 0/1 now share these six combined block types (sprite_player_size,
  // etc. - see PLAYER_OPTIONS' comment in blocks/sprites.js), so this is
  // called once, not once per name (unlike createGeneratorForSprite/
  // createGeneratorForFireBall below, still per-name for Missile 0/1/Ball) -
  // each generator resolves which player THIS block instance is set to via
  // resolvePlayerName, reading the PLAYER field at generation time instead
  // of a closed-over name.
  const createGeneratorForPlayer = () => {
    const resolvePlayerName = (block) => playerNameOfValue(block.getFieldValue('PLAYER'));
    // Players 2 to 9 (DPC+) are bytes the generator reserves itself, so their name is used as it is: asking the variable names for
    // it handed back a renamed one (player2animation2) that nothing declares.
    const animationVarOf = (player) => /^player[2-9]$/.test(player) ? `${player}animation` :
      Blockly.BBasic.nameDB_.getName(`${player}animation`, Blockly.VARIABLE_CATEGORY_NAME);

    // The dropdown already holds the animation's position in the list, which is
    // what the generated animation dispatch compares against - player-
    // independent (the shared animation pool), so no resolvePlayerName call
    // needed here at all.
    Blockly.BBasic['sprite_player_animation_select'] = function(block) {
      const index = block.getFieldValue('VAR') || '0';
      return [index, Blockly.BBasic.ORDER_ATOMIC];
    };

    // Same assignment sprite_player_set's generic setter emits for VAR =
    // "Animation" (see createGeneratorForSprite's `animation`-suffix
    // branch), just with the player and the animation both baked into this
    // one block instead of a separate "Player set Animation to" block plugged
    // with the sprite_player_animation_select value block above - including
    // the same LOOP checkbox/animationLoopBitsCode handling that branch has.
    Blockly.BBasic['sprite_player_set_animation'] = function(block) {
      const varName = animationVarOf(resolvePlayerName(block));
      const index = block.getFieldValue('VAR') || '0';
      return assignAndReload(varName, index) + animationLoopBitsCode(block, varName);
    };

    // Same assignment, for buildAnimationSetByIdBlock's VALUE-input sibling -
    // an arbitrary plugged expression instead of a fixed dropdown value.
    Blockly.BBasic['sprite_player_set_animation_id'] = function(block) {
      const varName = animationVarOf(resolvePlayerName(block));
      const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      return assignAndReload(varName, argument0) + animationLoopBitsCode(block, varName);
    };

    // One-step getter pairing with sprite_player_set_animation_id above -
    // same raw read sprite_player_get's generic getter emits for VAR =
    // "Animation" (nameDB_.getName resolves straight to the real
    // player0animation/player1animation variable, same as there).
    Blockly.BBasic['sprite_player_animation_id_get'] = function(block) {
      return [animationVarOf(resolvePlayerName(block)), Blockly.BBasic.ORDER_ATOMIC];
    };

    Blockly.BBasic['sprite_player_size'] = function(block) {
      const name = resolvePlayerName(block);
      const size = block.getFieldValue('SIZE') || '0';
      const varName = name + 'size';
      const setVar = Blockly.BBasic.sizeSetPlayers && Blockly.BBasic.sizeSetPlayers.has(name) ?
        Blockly.BBasic.nameDB_.getName(sizeSetVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE) : null;
      return `${varName} = ${varName} & $F8\n` +
        `${varName} = ${varName} | ${size}\n` +
        (setVar ? `${setVar} = ${size} + 1\n` : '');
    };

    // Bit 6 of the size variable pauses the animation: the frame counter is
    // frozen while it is set. It is unused by NUSIZ, so it rides along
    // harmlessly when the size variable is loaded into the register.
    Blockly.BBasic['sprite_player_animation_playback'] = function(block) {
      const name = resolvePlayerName(block);
      const paused = block.getFieldValue('STATE') === 'pause';
      return `${name}size{6} = ${paused ? 1 : 0}\n`;
    };

    // player0pointer/player1pointer and player0height/player1height are
    // real batari Basic kernel symbols (confirmed directly against
    // public/bb19/includes/2600basic.h and std_kernel.asm) - plain,
    // already-defined zero-page RAM the standard kernel reads every
    // scanline as "lda (player0pointer),y" (y counting down from
    // player0height), the exact same mechanism the compiler's
    // "player0: ... end" graphic-literal syntax sets up automatically
    // behind the scenes for every normal animation frame (see
    // generateAnimations in generators/bbasic.js). Every OTHER player
    // graphic in this app goes through that literal-bitmap path.
    //
    // This is only the TRIGGER - see this file's  top-of-block comment
    // (bug #2) for why the actual player0pointer/player0height writes live
    // in generateRomNoiseChecks instead, spliced into commongamelogic AFTER
    // generateAnimations'  per-frame reassignment. Stores into dev vars
    // (not a direct assignment) because the per-frame check has no block
    // context of its  to re-evaluate OFFSET/HEIGHT's expressions from -
    // same reasoning background_fade_to's  trigger stores its target/pace
    // into dev vars for generateBackgroundFadeChecks to read later.
    //
    // romNoiseUsedFor itself is populated by a pre-scan in bbasic.js's
    // init() (see reserveRomNoiseDevVars'  comment for why it has to be
    // known before this generator ever runs), not mutated here.
    Blockly.BBasic['sprite_player_rom_noise'] = function(block) {
      const name = resolvePlayerName(block);
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const offsetVar = resolveVar(romNoiseOffsetVarName(name));
      const heightVar = resolveVar(romNoiseHeightVarName(name));
      const flagsVar = resolveVar(romNoiseFlagsVarName(name));
      // Defaults to framecounter (already ticking every frame regardless
      // of anything else in the project) rather than a plain "0" fallback
      // - the whole point of this block is a shimmering, ever-changing
      // pattern with no setup required, and a fixed offset would instead
      // show the exact same static bytes forever until the user thought
      // to wire up their  changing value.
      const offset = Blockly.BBasic.valueToCode(block, 'OFFSET', Blockly.BBasic.ORDER_ASSIGNMENT) ||
        'framecounter';
      const height = Blockly.BBasic.valueToCode(block, 'HEIGHT', Blockly.BBasic.ORDER_ASSIGNMENT) || '8';
      return `${offsetVar} = ${offset}\n` +
        `${heightVar} = ${height}\n` +
        `${flagsVar}{${romNoiseActiveBit(name)}} = 1\n`;
    };

    // Clears the active flag sprite_${name}_rom_noise's  trigger sets -
    // see that block's  tooltip/comment for why this is needed at all:
    // generateRomNoiseChecks' per-frame override runs AFTER the animation
    // logic every frame and only ever gets turned ON by the trigger above,
    // never off, so without this there was no way back to a normal
    // animation frame once ROM noise had been used even once.
    // romNoiseUsedFor's  pre-scan in bbasic.js's init() treats this
    // block the same as the trigger above (either one on a player is
    // enough to reserve that player's dev vars), so the flag var is always
    // guaranteed to exist here.
    Blockly.BBasic['sprite_player_rom_noise_stop'] = function(block) {
      const name = resolvePlayerName(block);
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const flagsVar = resolveVar(romNoiseFlagsVarName(name));
      // On DPC+ the animation only loads a frame's graphic when it changes, so it has to be told to load it again.
      const dpcPlus = (useConfigurationStorage().value || {}).kernel === 'dpcplus';
      const reload = dpcPlus ? `${name}size{7} = 0\n` : '';
      return `${flagsVar}{${romNoiseActiveBit(name)}} = 0\n${reload}`;
    };

    // Trigger for sprite_player_rainbow_colors - see this file's
    // ROM_NOISE_COLOR_REGISTERS comment for the real kernel mechanism this
    // uses, and generateRainbowColorChecks for the per-frame write this
    // only primes (same trigger+check split as sprite_player_rom_noise's
    // trigger, and for the same reason: this line alone would only ever
    // take effect for a single instant, not stick).
    Blockly.BBasic['sprite_player_rainbow_colors'] = function(block) {
      const name = resolvePlayerName(block);
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const offsetPair = Blockly.BBasic.superchipRwPairs[rainbowColorOffsetVarName(name)];
      const flagsVar = resolveVar(romNoiseFlagsVarName());
      const offset = Blockly.BBasic.valueToCode(block, 'OFFSET', Blockly.BBasic.ORDER_ASSIGNMENT) ||
        'framecounter';
      const simple = !!(Blockly.BBasic.rainbowSimpleOffset || {})[name];
      return (simple ? '' : `${offsetPair.write} = ${offset}\n`) +
        `${flagsVar}{${rainbowColorActiveBit(name)}} = 1\n`;
    };

    // Clears the active flag sprite_player_rainbow_colors'  trigger
    // sets - see that block's  tooltip/comment for what this can and
    // can't undo. rainbowColorUsedFor's  pre-scan in bbasic.js's init()
    // treats this block the same as the trigger above, so the flag var is
    // always guaranteed to exist here.
    // The player's color table pointer is set again every frame (by its
    // animation frame, or by the stand-in table), so clearing the flag is all it
    // takes for the next frame to show the player's real colors.
    Blockly.BBasic['sprite_player_rainbow_colors_stop'] = function(block) {
      const name = resolvePlayerName(block);
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const flagsVar = resolveVar(romNoiseFlagsVarName());
      return `${flagsVar}{${rainbowColorActiveBit(name)}} = 0\n`;
    };
  };

  // Missile 0/1 now share this one combined block type (sprite_missile_size
  // - see MISSILE_OPTIONS' comment in blocks/sprites.js, same "one
  // combined type with a dropdown field" treatment Player 0/1 already got),
  // so this is called once, not once per name - Ball has no equivalent
  // block at all (its  width is set through sprite_ball_set's
  // "Width" option instead, see buildMissileOptions/writeOnlyOptions), so
  // there's no third name to worry about here the way createGeneratorFor
  // FireBall below has to.
  const createGeneratorForMissileSize = () => {
    Blockly.BBasic['sprite_missile_size'] = function(block) {
      const name = `missile${block.getFieldValue('MISSILE') === '1' ? '1' : '0'}`;
      const size = block.getFieldValue('SIZE') || 0;
      const widthsVar = Blockly.BBasic.nameDB_.getName(missileWidthsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const secondMissile = name === 'missile1';
      // The option's value ($00, $10, $20, $30) is the code in missile 0's place; missile 1's is four times that.
      const code = Number(String(size).replace('$', '0x')) * (secondMissile ? 4 : 1);
      return `${widthsVar} = (${widthsVar} & ${secondMissile ? '$3F' : '$CF'}) | ${code}\n`;
    };
  };

  // sprite_*_fire's trigger, plus sprite_*_bounce - shared by missile0/
  // missile1/ball (nothing here is missile-specific: ballx/bally are plain
  // bB vars exactly like missile0x/missile0y, and missileFireActiveBit/
  // missileFireDirVarName/missileFireSpeedVarName already cover 'ball' too).
  // registrationName is the block-type suffix to register under
  // (sprite_${registrationName}_fire/_bounce) - 'ball' for Ball's
  // still-separate-from-Missile-0/1 blocks, 'missile' for the combined
  // Missile 0/1 type (see MISSILE_OPTIONS' comment in blocks/
  // sprites.js). resolveName(block) resolves the REAL object name
  // ('missile0'/'missile1'/'ball') this particular block instance means,
  // read fresh every time a generator runs rather than closed over once -
  // Ball's  generator context passes a fixed () => 'ball' (nothing to
  // resolve, it never had a twin), Missile's reads the MISSILE dropdown
  // field.
  const createGeneratorForFireBall = (registrationName, resolveName) => {
    // TRIGGER only - see sprite_${name}_rom_noise's  top-of-block comment
    // for why a one-shot assignment here can't be the whole story:
    // generateMissileFireChecks (spliced into commongamelogic) does the
    // actual per-frame movement, reading these dev vars back every frame
    // until the missile goes off-screen. <angleExpr> is evaluated into
    // ${name}dir EXACTLY ONCE (not re-inlined below) since it can itself be
    // a real expression (e.g. the joystick 8-way direction getter's
    // table lookup), not just a bare variable - see this block's
    // tooltip. Always re-launches, even if a previous shot from this same
    // missile is still in flight (no "already active" guard) - confirmed
    // with the user: this block is meant to be placed behind its  rate
    // limiter (e.g. an "every X frames" block) rather than fire every
    // single frame it's reached, so every time it DOES run, it should
    // actually fire, resetting position to whatever X/Y it's given right
    // then (a moving X/Y, like a player's  position, naturally "resets
    // to current" this way with no special-casing needed). If the evaluated
    // angle is 255 ("no clear direction" - the joystick 8-way direction
    // getter's  value when the joystick is centered), falls back to the
    // block's "default" dropdown (any of the 8 directions, user-picked -
    // see MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS in blocks/sprites.js) rather
    // than skipping the launch - an idle joystick should still fire the
    // missile, not silently do nothing, and the direction that happens in
    // should be up to the user, not a single hardcoded choice.
    // missileFireUsedFor's  pre-scan in bbasic.js's init() treats this
    // block type as "in use" (same reasoning as romNoiseUsedFor), so every
    // dev var referenced here is always guaranteed to already exist.
    Blockly.BBasic[`sprite_${registrationName}_fire`] = function(block) {
      const name = resolveName(block);
      const resolveVar = (canonicalName) =>
        Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const dirVar = resolveVar(missileFireDirVarName(name));
      const speedIsConst = (Blockly.BBasic.missileFireConstSpeed || new Map()).has(name);
      const speedPair = speedIsConst ? null : Blockly.BBasic.superchipRwPairs[missileFireSpeedVarName(name)];
      const flagsVar = resolveVar(missileFireFlagsVarName());
      const x = Blockly.BBasic.valueToCode(block, 'X', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const y = Blockly.BBasic.valueToCode(block, 'Y', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
      const angle = Blockly.BBasic.valueToCode(block, 'ANGLE', Blockly.BBasic.ORDER_ASSIGNMENT) || '255';
      // "default" only ever offers the 8 original compass points (see
      // MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS in blocks/sprites.js) regardless
      // of "16 directions" - doubled here to land on the matching index of
      // the finer 0-15 scale (0=Up stays 0, 2=Right becomes 8, ...) so the
      // fallback always points the same real direction either way.
      const is16 = block.getFieldValue('DIRECTIONS16') === 'TRUE';
      const defaultAngle = (parseInt(block.getFieldValue('DEFAULT_ANGLE'), 10) || 0) * (is16 ? 2 : 1);
      const speed = Blockly.BBasic.valueToCode(block, 'SPEED', Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
      const activeBit = missileFireActiveBit(name);
      // "throttle movement" - see this block's  tooltip and
      // resolveEnclosingFrameInterval's  comment. Write-only here
      // (see reserveMissileFireDevVars'  comment on why these two route
      // through the Superchip r/w pool), so only .write is ever needed.
      const throttlePair = Blockly.BBasic.superchipRwPairs[missileFireThrottleVarName(name)];
      const throttleResetPair = Blockly.BBasic.superchipRwPairs[missileFireThrottleResetVarName(name)];
      // The countdown variables only exist when some Fire block on this object
      // has throttle movement ticked.
      const throttled = !!throttlePair;
      const interval = block.getFieldValue('THROTTLE') === 'TRUE' ?
        (resolveEnclosingFrameInterval(block) || 1) : 1;
      // 255 means "no clear direction" and picks the default. An angle that is a number, or a
      // random number too small to reach 255, needs no check for it, and a speed that is a
      // number is held to 0-7 here instead of at runtime.
      const angleNumber = literalNumber(angle);
      const randomMax = randomDivisionMax(angle);
      const angleLines = angleNumber === 255 ?
        `${dirVar} = ${defaultAngle}
` :
        `${dirVar} = ${angle}
` +
        (angleNumber !== null || (randomMax !== null && randomMax < 255) ? '' :
          `if ${dirVar} = 255 then ${dirVar} = ${defaultAngle}
`);
      const speedNumber = literalNumber(speed);
      const speedLines = speedIsConst ? '' : speedNumber !== null ?
        `${speedPair.write} = ${Math.min(speedNumber, 7)}\n` :
        `${speedPair.write} = ${speed}\n` +
        // The speed is held to 0-7 whatever was plugged in.
        `if ${speedPair.read} > 7 then ${speedPair.write} = 7\n`;
      return angleLines +
        `${name}x = ${x}\n` +
        `${name}y = ${y}\n` +
        speedLines +
        (throttled ? `${throttleResetPair.write} = ${interval}\n` : '') +
        // Was "= 1", forcing the very FIRST step to fire after just 1
        // frame regardless of interval, before falling into the correct
        // every-${interval}-frames cadence from the second step onward -
        // seeded from the same interval instead, so the first step waits
        // the full interval too, same as every step after it.
        (throttled ? `${throttlePair.write} = ${interval}\n` : '') +
        `${flagsVar}{${activeBit}} = 1\n`;
    };
  };

  // 'player'/'missile' register the combined sprite_player_get/set/change
  // and sprite_missile_get/set/change types (see PLAYER_OPTIONS'/
  // MISSILE_OPTIONS' comments in blocks/sprites.js) -
  // createGeneratorForSprite's  get/set/change bodies only ever read
  // VAR's already-real-variable-name value, never `name` itself, so this
  // needs no changes beyond two extra names to register under.
  ['player', 'missile', 'ball'].forEach(createGeneratorForSprite);
  createGeneratorForPlayer();
  createGeneratorForMissileSize();
  // Ball keeps its  separate block type (never had a twin to combine
  // with - see createGeneratorForFireBall's  comment); Missile 0/1
  // share the combined 'missile' type, resolving which one a given block
  // instance means from its  MISSILE field.

  createGeneratorForFireBall('missile',
      (block) => fireObjectName(block.getFieldValue('MISSILE')));

  // Just captures the target/speed and sets the active bit for whichever
  // object OBJECT picks - the actual per-frame movement happens in
  // generateSeekChecks (spliced into commongamelogic), same "trigger block
  // sets dev vars + flag bit, a separate generate*Checks() does the
  // per-frame work" pattern sprite_${name}_fire's  trigger generator
  // already uses above. Unlike Fire (one block type per missile), this is a
  // single block for all 5 sprite names, with OBJECT as a dropdown - "name"
  // is read from that field instead of being fixed per block type, but
  // otherwise every dev var this reads/writes still comes from the exact
  // same per-name functions (seekXVarName/seekYVarName/seekSpeedVarName/
  // seekActiveBit) generateSeekChecks itself uses. seekUsedFor's
  // pre-scan in bbasic.js's init() reads this same OBJECT field to know
  // which names are "in use" (same reasoning as missileFireUsedFor), so
  // every dev var referenced here is always guaranteed to already exist.
  Blockly.BBasic['object_seek_to'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const targetXVar = resolveVar(seekXVarName(name));
    const targetYVar = resolveVar(seekYVarName(name));
    const speedVar = resolveVar(seekSpeedVarName(name));
    const flagsVar = resolveVar(seekFlagsVarName());
    const x = Blockly.BBasic.valueToCode(block, 'X', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const y = Blockly.BBasic.valueToCode(block, 'Y', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const speed = Blockly.BBasic.valueToCode(block, 'SPEED', Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    const activeBit = seekActiveBit(name);
    // "throttle movement" - see this block's  tooltip and
    // resolveEnclosingFrameInterval's  comment. Write-only here (see
    // reserveSeekDevVars'  comment on why these two route through the
    // Superchip r/w pool), so only .write is ever needed.
    const throttlePair = Blockly.BBasic.superchipRwPairs[seekThrottleVarName(name)];
    const throttleResetPair = Blockly.BBasic.superchipRwPairs[seekThrottleResetVarName(name)];
    const interval = block.getFieldValue('THROTTLE') === 'TRUE' ?
      (resolveEnclosingFrameInterval(block) || 1) : 1;
    // Clears this object's "arrived" bit (object_seek_arrived, if
    // watched) every time a new target is set - without this, the bit would
    // stay stuck true from a previous arrival even after re-triggering
    // toward a brand-new target that hasn't been reached yet.
    // seekArrivedWatches'  pre-scan (bbasic.js's init()) guarantees the
    // flags byte only actually exists when at least one object_seek_arrived
    // block is watching, so this only reads/writes it when that's the case.
    const arrivedWatches = Blockly.BBasic.seekArrivedWatches || new Set();
    const clearArrived = arrivedWatches.has(name) ?
      `${resolveVar(seekArrivedFlagsVarName())}{${seekArrivedBit(name)}} = 0\n` : '';
    return `${targetXVar} = ${x}\n` +
      `${targetYVar} = ${y}\n` +
      `${speedVar} = ${speed}\n` +
      `${throttleResetPair.write} = ${interval}\n` +
      // Same fix as sprite_*_fire's  trigger above - was "= 1", making
      // the first step happen after just 1 frame instead of the full
      // interval.
      `${throttlePair.write} = ${interval}\n` +
      `${flagsVar}{${activeBit}} = 1\n` +
      clearArrived;
  };

  // object_seek_arrived's  generator - a plain, always-current boolean
  // read of the arrived bit (same shape as background_fade_active's
  // generator), NOT a watch-and-clear: this plugs into an "if" condition
  // socket as a value (per explicit request - "if (object) arrives at its
  // seek target do..."), so it can be read any number of times (or not at
  // all, if optimized away) without a read itself having a side effect.
  // generateSeekChecks sets this bit the moment this object's  Seek
  // reaches its target; object_seek_to's  generator above clears it again
  // the next time that object is given a new target.
  Blockly.BBasic['object_seek_arrived'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const flagBit = `${resolveVar(seekArrivedFlagsVarName())}{${seekArrivedBit(name)}}`;
    return [flagBit, Blockly.BBasic.ORDER_ATOMIC];
  };

  // A literal can be assigned straight to the bit; anything else has to be
  // branched on, since a batari Basic condition is not a value - same
  // reasoning/shape as bit_set's BIT_LITERALS in generators/bbasic/bit.js
  // (duplicated locally rather than imported, since it's a 4-entry map not
  // worth coupling the two files over).
  const SPRITE_SCROLL_VALUE_LITERALS = {'true': '1', '1': '1', 'false': '0', '0': '0'};

  // sprite_scroll_with_playfield_set's generator - just flips this object's
  // bit in the shared flags byte; background_scroll's generator
  // (generators/bbasic/background.js) is what actually reads it to decide
  // whether to nudge this object's Y alongside the playfield each scroll.
  Blockly.BBasic['sprite_scroll_with_playfield_set'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const target = `${resolveVar(spriteScrollFlagsVarName())}{${spriteScrollActiveBit(name)}}`;
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || 'true';
    const literal = SPRITE_SCROLL_VALUE_LITERALS[argument0.trim()];
    if (literal) {
      return `${target} = ${literal}\n`;
    }
    return `if ${argument0} then ${target} = 1 else ${target} = 0\n`;
  };

  // sprite_scroll_with_playfield_get's generator - a plain, always-current
  // boolean read of the same bit the setter above writes.
  Blockly.BBasic['sprite_scroll_with_playfield_get'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const code = `${resolveVar(spriteScrollFlagsVarName())}{${spriteScrollActiveBit(name)}}`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Captures direction/rate/max speed and sets the accel-active bit for
  // whichever object OBJECT picks - the actual per-frame velocity update
  // happens in generateInertiaChecks (spliced into commongamelogic), same
  // "trigger block sets dev vars + flag bit" shape as object_seek_to above.
  // Direction is a plain 0-7 number input (not a fixed dropdown), same as
  // sprite_*_fire's  ANGLE - lets it be wired directly from a "Joystick
  // direction (8-way)" block for continuous joystick-driven thrust, not
  // just a literal.
  // ACTION dropdown (Start/Stop) - same shape as sprite_inertia_decelerate
  // below (was two separate block types before the combination - see the
  // block definition's comment). Stop clears the accel-active bit only -
  // velocity is left exactly where it is (holds at its current value
  // unless Decelerate is also on for this object), matching this feature's
  // "engine off, still coasting" framing rather than an instant stop -
  // DIRECTION/RATE/MAXSPEED are only meaningful (and only read) on Start,
  // same "don't disturb state Stop has no reason to touch" reasoning
  // sprite_inertia_decelerate's generator already uses.
  Blockly.BBasic['sprite_inertia_accelerate'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const flagsVar = resolveVar(inertiaAccelFlagsVarName());
    const activeBit = inertiaAccelActiveBit(name);
    if (block.getFieldValue('ACTION') === 'stop') return `${flagsVar}{${activeBit}} = 0\n`;
    const dirVar = resolveVar(inertiaAccelDirVarName(name));
    const rateVar = resolveVar(inertiaAccelRateVarName(name));
    const maxSpeedVar = resolveVar(inertiaMaxSpeedVarName(name));
    const direction = Blockly.BBasic.valueToCode(block, 'DIRECTION', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const rate = Blockly.BBasic.valueToCode(block, 'RATE', Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    const maxSpeed = Blockly.BBasic.valueToCode(block, 'MAXSPEED', Blockly.BBasic.ORDER_ASSIGNMENT) || '127';
    return `${dirVar} = ${direction}\n` +
      `${rateVar} = ${rate}\n` +
      `${maxSpeedVar} = ${maxSpeed}\n` +
      `${flagsVar}{${activeBit}} = 1\n`;
  };

  // ACTION dropdown (Start/Stop) - same shape as
  // text_minikernel_scroll_control's  single-block-multiple-actions
  // convention. RATE is only meaningful (and only read) on Start - Stop
  // just clears the bit, leaving whatever rate was last set untouched for
  // the next Start (same "don't disturb state Stop has no reason to
  // touch" reasoning collision_check_position/scroll_control already use
  // elsewhere in this codebase).
  Blockly.BBasic['sprite_inertia_decelerate'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const flagsVar = resolveVar(inertiaDecelFlagsVarName());
    const activeBit = inertiaDecelActiveBit(name);
    const action = block.getFieldValue('ACTION');
    if (action === 'stop') return `${flagsVar}{${activeBit}} = 0\n`;
    const rateVar = resolveVar(inertiaDecelRateVarName(name));
    const rate = Blockly.BBasic.valueToCode(block, 'RATE', Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    return `${rateVar} = ${rate}\n` +
      `${flagsVar}{${activeBit}} = 1\n`;
  };

  // Reflects whichever movement system(s) the chosen object actually uses
  // off of whatever it just collided with - Fire's  fired direction
  // (missile0/1/ball only) AND/OR Inertia's  velocity (any of the 5
  // names), sharing ONE stage/frame progression between them (see
  // missileBounceStageVarName's  comment - "how many consecutive stuck
  // frames" isn't specific to either representation). Neither true (an
  // object using neither Fire nor Inertia) still emits the frame/stage
  // bookkeeping but reflects nothing - harmless no-op, same as this
  // block's  tooltip documents.
  //
  // Matches the real 1977 Combat cartridge's  missile-bounce routine
  // (COLMPF/COLMPFX/Rev180/Bump180 in atariage.com's "Definitive Combat
  // Disassembly", $F4A6-$F4CD) stage-for-stage, not just "3 guesses then
  // give up" in spirit - Stella genuinely has no idea which wall/edge was
  // actually hit, so it can't compute a correct reflection on the first
  // try, and neither can this:
  //
  //   Stage 1 (dirVar/frameVar just went from "not stuck" to "stuck this
  //   frame", stageVar 0 -> 1): mirror the CURRENT heading across a
  //   vertical wall (dirVar = N - dirVar), the routine's  first guess.
  //   Combat then nudges the result off any exact compass point (N/E/S/W)
  //   by one step - a mirror of a purely-vertical heading (dirVar 0 or
  //   N/2) is a no-op (0 and N/2 are their  negation on this scale),
  //   which would make this stage look like nothing happened; the original
  //   game avoids that dead-looking case (and any other exact-axis result)
  //   by always nudging 22.5 degrees off it. dirVar is on a 0 to (N-1)
  //   clockwise-from-Up scale, N=8 or N=16 depending on
  //   missileFire16UsedFor - "exact compass point" is a multiple of N/4 on
  //   that scale.
  //
  //   Stage 2 (still stuck one frame later, stageVar 1 -> 2): add 180
  //   degrees (N/2) to WHATEVER stage 1 just left in dirVar (not a fresh
  //   mirror of the original heading) - Combat's  Rev180/Bump180 reads
  //   DIRECTN directly, already holding stage 1's result. Composing "mirror
  //   vertical" with "+180" is algebraically a horizontal-wall mirror of
  //   the original, so this still reads as "try the other wall orientation
  //   next" - it's just computed as a delta from stage 1, matching Combat
  //   exactly (and inheriting stage 1's off-axis nudge for free).
  //
  //   Stage 3 (still stuck a SECOND frame later, stageVar 2 -> 3): do
  //   nothing at all - Combat's  MxPFcount=$02 case, a deliberate grace
  //   frame giving the object one more chance to clear the wall pixel on
  //   its current (stage 2) heading before giving up.
  //
  //   Stage 4+ (still stuck a THIRD frame later, stageVar 3 and up): give
  //   up guessing and reverse the ORIGINAL pre-collision heading outright
  //   (dirVar = origDirVar + N/2), assuming a corner - and keep reapplying
  //   that same reversed heading every frame for as long as the collision
  //   keeps being reported, exactly like Combat's "or higher" case.
  //
  // velocityX/Y need no angle math at all - two's-complement negation is
  // just "0 - x" (6502 SBC produces the identical bit pattern whether the
  // byte is read as signed or unsigned, not a special case) - so this
  // mirrors the same 4-stage timing (vertical mirror / +180 from stage 1's
  // result / grace frame / corner-reverses-the-original) using plain X/Y
  // negation instead of dirVar arithmetic. There's no equivalent to
  // Combat's off-axis nudge for a raw velocity component (an angle scale
  // has a natural "smallest step" to nudge by; a signed pixel/frame value
  // doesn't), so a sprite using ONLY Inertia (no Fire) can still see a
  // stage-1 mirror that looks like a no-op if the axis being flipped was
  // already 0 - stage 2 (the other axis) still fires normally the frame
  // after, same fallback Combat itself effectively relies on.
  //
  // "Still stuck" vs. "a brand new collision" is told apart by frameVar
  // (the framecounter value at the last Bounce call) - any gap other than
  // exactly 1 frame resets stageVar back to 0. reserveMissileBounceDevVars
  // (bbasic.js's  init()) guarantees stageVar/frameVar/origDirVar (if
  // hasFire)/origVelocityX/Y (if hasInertia) already exist here.
  // Clears the object's "fired" flag - the same thing that happens when it
  // goes off-screen - so generateMissileFireChecks stops stepping it. Nothing
  // to do (and no flag byte to write) for an object no Fire or Bounce block
  // uses, which includes both players.
  // The stored direction of the object a Fire block launched (see
  // sprite_fire_angle_get in blocks/sprites.js). The variable is reserved
  // whenever this block is used, via the same pre-scan Fire uses.
  Blockly.BBasic['sprite_fire_angle_get'] = function(block) {
    const field = block.getFieldValue('MISSILE');
    const name = fireObjectName(field);
    const dirVar = Blockly.BBasic.nameDB_.getName(
        missileFireDirVarName(name), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [dirVar, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Writes the speed variable Fire's movement reads every frame. An object whose Fire blocks all
  // use one plain number has no speed variable (see missileFireConstSpeed in bbasic.js), but a
  // block of this type makes it keep one.
  Blockly.BBasic['sprite_fire_speed_set'] = function(block) {
    const field = block.getFieldValue('MISSILE');
    const name = fireObjectName(field);
    const used = Blockly.BBasic.missileFireUsedFor;
    if (!used || !used.has(name)) return '';
    const speedPair = Blockly.BBasic.superchipRwPairs[missileFireSpeedVarName(name)];
    if (!speedPair) return '';
    const speed = Blockly.BBasic.valueToCode(block, 'SPEED', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const speedNumber = literalNumber(speed);
    return speedNumber !== null ?
      `${speedPair.write} = ${Math.min(speedNumber, 7)}
` :
      `${speedPair.write} = ${speed}
` +
      `if ${speedPair.read} > 7 then ${speedPair.write} = 7
`;
  };

  Blockly.BBasic['object_fire_stop'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const used = Blockly.BBasic.missileFireUsedFor;
    if (!used || !used.has(name)) return '';
    const flagsVar = Blockly.BBasic.nameDB_.getName(
        missileFireFlagsVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${flagsVar}{${missileFireActiveBit(name)}} = 0\n`;
  };

  // "Bounce [object] off screen edges": no collision and no guessing. A
  // position past an edge puts the object back on that edge and flips the
  // matching direction: left/right edges mirror horizontal movement,
  // top/bottom mirror vertical movement - Fire's direction and/or Inertia's
  // velocity, whichever the object uses. x/y are unsigned bytes, so going
  // below 0 wraps to 240 or more. The edges are in sprite coordinates, measured
  // on the emulator: X runs 0-159 across the picture, and Y starts at 8 (the
  // top of the playfield) and ends where the playfield's visible rows end.
  // Y moves in steps of two scanlines, so that is 8 plus the number of
  // visible rows times the row height: 8 + 11 * 8 = 96 by default, and
  // 8 + 23 * 4 = 100 for pfres 24 (with Superchip the last of pfres rows is
  // not drawn). A fixed 96 bounced objects too early on Superchip builds with
  // taller playfields, before they reached the bottom playfield pixels.
  const buildEdgeBounce = (block, name, resolveVar, hasFire, hasInertia) => {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const visibleRows = effectiveBackgroundRows(config) - (config.enableSuperchip ? 1 : 0);
    // The backgrounds do not all have the same rows under DPC+ when they set a pfres: the bottom is worked out from the
    // geometry of the one showing, into temp6.
    const bottomVaries = !!Blockly.BBasic.dpcPlusRowMaxVar;
    if (bottomVaries) Blockly.BBasic.usesDivMul = true;
    const bottomY = bottomVaries ? 'temp6' : 8 + visibleRows * pfRowDivisorFor(config);
    const id = Blockly.BBasic.blockNumbers.next(`edgebounce_${name}`);
    const label = (part) => `_edgebounce_${name}_${id}_${part}`;
    const lines = [];
    const flipX = [];
    const flipY = [];
    if (hasFire) {
      const dirVar = resolveVar(missileFireDirVarName(name));
      const steps = (Blockly.BBasic.missileFire16UsedFor || new Set()).has(name) ? 16 : 8;
      const half = steps / 2;
      flipX.push(
          ` ${dirVar} = ${steps} - ${dirVar}`,
          ` if ${dirVar} = ${steps} then ${dirVar} = 0`);
      flipY.push(
          ` if ${dirVar} > ${half} then goto ${label('dirhigh')}`,
          ` ${dirVar} = ${half} - ${dirVar}`,
          ` goto ${label('dirdone')}`,
          `@ ${label('dirhigh')}`,
          ` ${dirVar} = ${steps + half} - ${dirVar}`,
          `@ ${label('dirdone')}`);
    }
    if (hasInertia) {
      const velocityXVar = resolveVar(inertiaVelocityXVarName(name));
      const velocityYVar = resolveVar(inertiaVelocityYVarName(name));
      if ((Blockly.BBasic.inertiaFineUsedFor || new Set()).has(name)) {
        // 16-bit fixed-point velocity: negate the whole pair (see the stage
        // code in object_bounce below for why "@end" closes the asm block).
        const velocityFracXVar = resolveVar(inertiaVelocityFracXVarName(name));
        const velocityFracYVar = resolveVar(inertiaVelocityFracYVarName(name));
        flipX.push(' asm', ...build16BitNegateAsm(velocityXVar, velocityFracXVar), '@end');
        flipY.push(' asm', ...build16BitNegateAsm(velocityYVar, velocityFracYVar), '@end');
      } else {
        flipX.push(` ${velocityXVar} = 0 - ${velocityXVar}`);
        flipY.push(` ${velocityYVar} = 0 - ${velocityYVar}`);
      }
    }
    lines.push(
        ` if ${name}x >= 240 then goto ${label('left')}`,
        ` if ${name}x > 159 then goto ${label('right')}`,
        ` goto ${label('xend')}`,
        `@ ${label('left')}`,
        ` ${name}x = 0`,
        ` goto ${label('flipx')}`,
        `@ ${label('right')}`,
        ` ${name}x = 159`,
        `@ ${label('flipx')}`,
        ...flipX,
        `@ ${label('xend')}`,
        ...(bottomVaries ? [` temp6 = ${Blockly.BBasic.dpcPlusRowMaxVar} + 1`, ` temp6 = temp6 * ${Blockly.BBasic.dpcPlusRowDivVar}`,
          ' temp6 = temp6 + 8'] : []),
        ` if ${name}y >= 240 then goto ${label('top')}`,
        ` if ${name}y < 8 then goto ${label('top')}`,
        ` if ${name}y > ${bottomY} then goto ${label('bottom')}`,
        ` goto ${label('yend')}`,
        `@ ${label('top')}`,
        ` ${name}y = 8`,
        ` goto ${label('flipy')}`,
        `@ ${label('bottom')}`,
        ` ${name}y = ${bottomY}`,
        `@ ${label('flipy')}`,
        ...flipY,
        `@ ${label('yend')}`,
    );
    return lines.join('\n') + '\n';
  };

  // Bounce on a collision, first frame: work out which way to reflect from the
  // playfield pixels around the object instead of guessing. The object's
  // heading gives a horizontal and a vertical direction. Going straight along one
  // axis simply flips that axis. On a diagonal, the pixel next to the object's
  // cell along x and the pixel next to it along y say what was hit: a lit pixel
  // along x is a vertical wall (flip x), a lit pixel along y is a horizontal wall
  // (flip y), and both or neither is a corner (flip both). Calls on the
  // following frames, while the object is still touching the wall, are ignored
  // for a few frames so the reflected object can move away instead of being
  // flipped back (see the stage code below).
  // pfread overwrites temp1 and temp2, so everything kept across a pfread lives
  // in temp3-temp6: temp3/temp4 the object's base cell (column/row), temp5 the
  // heading (bit 0: moving along x, bit 1: that is leftwards, bit 2: moving
  // along y, bit 3: that is upwards) and temp6 the neighboring column/row being
  // checked. No variables.
  const buildPixelReflect = ({Blockly, name, resolveVar, hasFire, hasInertia, uid}) => {
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const maxRow = Blockly.BBasic.maxRowText(config);
    const rowDivisor = Blockly.BBasic.rowDivisorText(config);
    Blockly.BBasic.usesDivMul = true;
    const label = (part) => `_bouncepix_${name}_${uid}_${part}`;
    const lab = (part) => `@ ${label(part)}`;
    const isFine = (Blockly.BBasic.inertiaFineUsedFor || new Set()).has(name);
    const is16 = (Blockly.BBasic.missileFire16UsedFor || new Set()).has(name);
    const steps = is16 ? 16 : 8;
    const half = steps / 2;
    const lines = [];
    // --- heading, and which axes to flip
    const fireDirVar = hasFire ? resolveVar(missileFireDirVarName(name)) : null;
    const velocityXVar = hasInertia ? resolveVar(inertiaVelocityXVarName(name)) : null;
    const velocityYVar = hasInertia ? resolveVar(inertiaVelocityYVarName(name)) : null;
    const diagonalLines = [
      lab('diagonal'),
      // the object's cell (clamped), stepping back out of it when it is
      // already inside the wall
      ` temp3 = (${name}x - ${MISSILE_BALL_PF_X_OFFSET}) / 4`,
      ` temp4 = (${name}y - 1) / ${rowDivisor}`,
      ` if temp3 > 31 then temp3 = 31`,
      ` if temp4 > ${maxRow} then temp4 = ${maxRow}`,
      ` if pfread(temp3, temp4) then goto ${label('inside')}`,
      ` goto ${label('base')}`,
      lab('inside'),
      ` if temp5{1} then goto ${label('bxplus')}`,
      ` if temp3 > 0 then temp3 = temp3 - 1`,
      ` goto ${label('bxdone')}`,
      lab('bxplus'),
      ` if temp3 < 31 then temp3 = temp3 + 1`,
      lab('bxdone'),
      ` if temp5{3} then goto ${label('byplus')}`,
      ` if temp4 > 0 then temp4 = temp4 - 1`,
      ` goto ${label('base')}`,
      lab('byplus'),
      ` if temp4 < ${maxRow} then temp4 = temp4 + 1`,
      lab('base'),
      // A: the pixel next to the base cell along x
      ` temp6 = temp3`,
      ` if temp5{1} then goto ${label('axminus')}`,
      ` if temp6 < 31 then temp6 = temp6 + 1`,
      ` goto ${label('axdone')}`,
      lab('axminus'),
      ` if temp6 > 0 then temp6 = temp6 - 1`,
      lab('axdone'),
      ` if pfread(temp6, temp4) then goto ${label('alit')}`,
      // A is clear: B, the pixel next to the base cell along y, decides
      ` temp6 = temp4`,
      ` if temp5{3} then goto ${label('byminus')}`,
      ` if temp6 < ${maxRow} then temp6 = temp6 + 1`,
      ` goto ${label('bydone')}`,
      lab('byminus'),
      ` if temp6 > 0 then temp6 = temp6 - 1`,
      lab('bydone'),
      ` if pfread(temp3, temp6) then goto ${label('flipy')}`,
      ` goto ${label('flipboth')}`,
      // A is lit: a lit B too means a corner
      lab('alit'),
      ` temp6 = temp4`,
      ` if temp5{3} then goto ${label('byminus2')}`,
      ` if temp6 < ${maxRow} then temp6 = temp6 + 1`,
      ` goto ${label('bydone2')}`,
      lab('byminus2'),
      ` if temp6 > 0 then temp6 = temp6 - 1`,
      lab('bydone2'),
      ` if pfread(temp3, temp6) then goto ${label('flipboth')}`,
      ` goto ${label('flipx')}`,
    ];
    if (hasFire) {
      // One table read on the heading instead of a chain of 12 (8 directions) or 20
      // (16) compare lines, or an "on ... goto" with a handler per direction:
      // the entry is 0 for a straight vertical heading (go to the vertical flip),
      // 255 for a straight horizontal one (the horizontal flip), and anything
      // else is a diagonal heading's bits (go on to look at the wall).
      // A heading outside 0..steps-1 (no heading) flips both axes, as before.
      const table = is16 ? DIRECTION16_STEPS : [[0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1]];
      const entries = table.map(([xStep, yStep]) => (xStep && yStep) ?
        (xStep > 0 ? 1 : 3) | (yStep > 0 ? 4 : 12) : (xStep ? 255 : 0));
      lines.push(
          ` if ${fireDirVar} >= ${steps} then goto ${label('flipboth')}`,
          ' asm',
          ` ldx ${fireDirVar}`,
          ` lda ${label('headtab')},x`,
          ` jmp ${label('headgo')}`,
          `@ ${label('headtab')}`,
          ` .byte ${entries.join(',')}`,
          `@ ${label('headgo')}`,
          ' sta temp5',
          '@end',
          ` if temp5 = 0 then goto ${label('flipy')}`,
          ` if temp5 = 255 then goto ${label('flipx')}`,
          ` goto ${label('diagonal')}`);
    } else {
      lines.push(' temp5 = 0');
      if (hasInertia) {
        lines.push(
            ` if ${velocityXVar} > 0 then temp5 = temp5 | $01`,
            ` if ${velocityXVar} > 127 then temp5 = temp5 | $03`,
            ` if ${velocityYVar} > 0 then temp5 = temp5 | $04`,
            ` if ${velocityYVar} > 127 then temp5 = temp5 | $0C`);
      }
      lines.push(
          ` if !temp5{0} then goto ${label('nox')}`,
          ` if !temp5{2} then goto ${label('flipx')}`,
          ` goto ${label('diagonal')}`,
          lab('nox'),
          ` if !temp5{2} then goto ${label('flipboth')}`,
          ` goto ${label('flipy')}`);
    }
    lines.push(...diagonalLines);
    // --- apply the flips
    const fireFlipX = !hasFire ? [] : [
      ` ${fireDirVar} = ${steps} - ${fireDirVar}`,
      ` if ${fireDirVar} = ${steps} then ${fireDirVar} = 0`,
    ];
    const fireFlipY = !hasFire ? [] : [
      ` if ${fireDirVar} > ${half} then goto ${label('dirhigh')}`,
      ` ${fireDirVar} = ${half} - ${fireDirVar}`,
      ` goto ${label('dirdone')}`,
      lab('dirhigh'),
      ` ${fireDirVar} = ${steps + half} - ${fireDirVar}`,
      lab('dirdone'),
    ];
    const fireFlipBoth = !hasFire ? [] : [
      ` ${fireDirVar} = ${fireDirVar} + ${half}`,
      ` if ${fireDirVar} >= ${steps} then ${fireDirVar} = ${fireDirVar} - ${steps}`,
    ];
    // Inertia velocity is only reflected for an object with no Fire heading, so
    // a sprite that uses both is reflected through Fire's heading alone.
    const velocityFlip = (axis) => {
      if (!hasInertia || hasFire) return [];
      const intVar = axis === 'x' ? velocityXVar : velocityYVar;
      if (isFine) {
        const fracVar = resolveVar(axis === 'x' ? inertiaVelocityFracXVarName(name) :
          inertiaVelocityFracYVarName(name));
        return [' asm', ...build16BitNegateAsm(intVar, fracVar), '@end'];
      }
      return [` ${intVar} = 0 - ${intVar}`];
    };
    lines.push(
        lab('flipx'), ...fireFlipX, ...velocityFlip('x'), ` goto ${label('done')}`,
        lab('flipy'), ...fireFlipY, ...velocityFlip('y'), ` goto ${label('done')}`,
        lab('flipboth'), ...fireFlipBoth, ...velocityFlip('x'), ...velocityFlip('y'),
        lab('done'));
    return lines;
  };

  Blockly.BBasic['object_bounce'] = function(block) {
    const name = block.getFieldValue('OBJECT');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const hasFire = (Blockly.BBasic.missileFireUsedFor || new Set()).has(name);
    const hasInertia = (Blockly.BBasic.inertiaUsedFor || new Set()).has(name);
    if (block.getFieldValue('EDGES') === 'TRUE') {
      return buildEdgeBounce(block, name, resolveVar, hasFire, hasInertia);
    }
    // stageVar/frameVar (and, when used, origDirVar/origVelocityX/Y below)
    // are routed through the Superchip r/w pool now - see
    // reserveMissileBounceDevVars' comment. {read, write} pair either way
    // (that pool's fallback returns the same symbol for both when
    // Superchip is off), so every access below has to pick whichever side
    // matches its position, same as any other reserveDevVarRW consumer.
    const stagePair = Blockly.BBasic.superchipRwPairs[missileBounceStageVarName(name)];
    // The stage code is the same for every Bounce block of an object, so it lives
    // once in a shared subroutine (see stageName below) and the labels are fixed.
    const stage1Label = `_bounce_${name}_s1`;
    const stage2Label = `_bounce_${name}_s2`;
    const stage3Label = `_bounce_${name}_s3`;
    const stage4Label = `_bounce_${name}_s4`;
    const doneLabel = `_bounce_${name}_done`;

    const fireLines = {stage1: [], stage2: [], stage4: []};
    if (hasFire) {
      const dirVar = resolveVar(missileFireDirVarName(name));
      const steps = (Blockly.BBasic.missileFire16UsedFor || new Set()).has(name) ? 16 : 8;
      const half = steps / 2;
      // "Exact compass point" (N/E/S/W) is a multiple of steps/4 on this
      // 0..steps-1 scale - equivalently, its low log2(steps/4) bits are all
      // 0. Tested bit-by-bit (var{n} && var{n} ...) instead of a single
      // masked comparison (var & mask = 0) since this codebase has no
      // existing precedent for bitwise "&" mixed with a comparison inside
      // one bB expression, and bit-index reads are already this codebase's
      // established way to test individual bits (see e.g. background.js's
      // fade-flag checks).
      // Only the heading snapshot (for the give-up stage); the reflection itself
      // is buildPixelReflect's.
      fireLines.stage1 = [
        ` ${stagePair.write} = (${dirVar} & 15) | 64`,
      ];
      fireLines.stage2 = [];
      fireLines.stage4 = [
        ` ${dirVar} = ${stagePair.read} & 15`,
        ` ${dirVar} = ${dirVar} + ${half}`,
        ` if ${dirVar} >= ${steps} then ${dirVar} = ${dirVar} - ${steps}`,
      ];
    }

    const inertiaLines = {stage1: [], stage2: [], stage4: []};
    if (hasInertia) {
      const velocityXVar = resolveVar(inertiaVelocityXVarName(name));
      const velocityYVar = resolveVar(inertiaVelocityYVarName(name));
      const origVelocityXPair = Blockly.BBasic.superchipRwPairs[missileBounceOrigVelocityXVarName(name)];
      const origVelocityYPair = Blockly.BBasic.superchipRwPairs[missileBounceOrigVelocityYVarName(name)];
      const isFine = (Blockly.BBasic.inertiaFineUsedFor || new Set()).has(name);
      if (!isFine) {
        inertiaLines.stage1 = [
          ` ${origVelocityXPair.write} = ${velocityXVar}`,
          ` ${origVelocityYPair.write} = ${velocityYVar}`,
        ];
        inertiaLines.stage2 = [];
        inertiaLines.stage4 = [
          ` ${velocityXVar} = 0 - ${origVelocityXPair.read}`,
          ` ${velocityYVar} = 0 - ${origVelocityYPair.read}`,
        ];
      } else {
        // Fine mode: velocity is a 16-bit [velocityXVar:velocityFracXVar]
        // fixed-point pair (see inertiaVelocityFracXVarName's comment) -
        // negating just the whole-pixel byte would leave the fractional
        // byte pointing the wrong way (e.g. -1.75 negated that way gives
        // +2.25, not +1.75), so this always negates the FULL pair via
        // build16BitNegateAsm. RW-pool vars (origVelocityXPair etc) can't
        // take part in a carry chain directly (different physical read/
        // write addresses - see build16BitNegateAsm's comment), so a
        // restore always copies the snapshot into the ordinary velocity
        // vars first, then negates those in place, rather than negating
        // straight out of the snapshot. The fractional snapshot
        // (origVelocityFracXPair etc) is genuinely required, not just a
        // nice-to-have: it's what lets a bounced object keep moving
        // slower than 1px/frame instead of snapping back up to
        // whole-pixel speed on every bounce.
        const velocityFracXVar = resolveVar(inertiaVelocityFracXVarName(name));
        const velocityFracYVar = resolveVar(inertiaVelocityFracYVarName(name));
        const origVelocityFracXPair = Blockly.BBasic.superchipRwPairs[missileBounceOrigVelocityFracXVarName(name)];
        const origVelocityFracYPair = Blockly.BBasic.superchipRwPairs[missileBounceOrigVelocityFracYVarName(name)];
        // "@end" (not a bare "end") to close each asm block here - this
        // whole generator (unlike generateInertiaChecks/build16BitNegateAsm's
        // other callers) is a normal per-block generator, so its return
        // value passes through Blockly.BBasic.normalizeIndents(), which
        // replaces EVERY line's leading whitespace with one fixed indent
        // string, not just adds to it - collapsing "asm"/"end"'s deliberate
        // 1-space-vs-0-space difference into two IDENTICALLY-indented lines.
        // 2600basic's asm-block parser needs "end" strictly less
        // indented than "asm" to recognize it as the close, so an
        // equally-indented "end" gets swallowed as if it were still raw
        // asm content - and everything bB-generated after it, for the rest
        // of the file, keeps being emitted as literal, untranslated text
        // instead of real bBasic, cascading into exactly this shape of
        // failure. "@end" survives normalizeIndents' special-case
        // handling (stripped straight to column 0, same as "@label"
        // definitions), matching the same fix already used for this exact
        // reason in generateRunOnceEdgeReset. Confirmed directly as the
        // real cause of a reported build failure ("Unknown Mnemonic 'sta
        // TextColor'" plus a long cascade, only when Fine mode is on):
        // reproduced via a standalone compile of the user's exact project,
        // and confirmed fixed by this exact change.
        inertiaLines.stage1 = [
          ` ${origVelocityXPair.write} = ${velocityXVar}`,
          ` ${origVelocityFracXPair.write} = ${velocityFracXVar}`,
          ` ${origVelocityYPair.write} = ${velocityYVar}`,
          ` ${origVelocityFracYPair.write} = ${velocityFracYVar}`,
        ];
        inertiaLines.stage2 = [];
        inertiaLines.stage4 = [
          ` ${velocityXVar} = ${origVelocityXPair.read}`,
          ` ${velocityFracXVar} = ${origVelocityFracXPair.read}`,
          ` ${velocityYVar} = ${origVelocityYPair.read}`,
          ` ${velocityFracYVar} = ${origVelocityFracYPair.read}`,
          ' asm',
          ...build16BitNegateAsm(velocityXVar, velocityFracXVar),
          ...build16BitNegateAsm(velocityYVar, velocityFracYVar),
          '@end',
        ];
      }
    }

    // The pixel-reflecting code is long, so it lives once per object in a
    // shared subroutine (relocatable like any other) and each Bounce block
    // just calls it - several Bounce blocks otherwise filled bank 1.
    const reflectName = `_bouncepix_${name}`;
    if (!Blockly.BBasic.subroutines[reflectName]) {
      Blockly.BBasic.subroutines[reflectName] =
        buildPixelReflect({Blockly, name, resolveVar, hasFire, hasInertia, uid: 'shared'})
            .map((line) => line.replace(/^ /, '')).join('\n');
    }
    // The stage subroutine can sit in a different bank than the Bounce block
    // calling it, so its call into the reflect routine is tagged relative to
    // the bank it is in.
    const stageName = `_bouncestage_${name}`;
    const reflectSuffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getSubroutineBank(stageName), Blockly.BBasic.getSubroutineBank(reflectName));
    const reflectCall = [` gosub ${reflectName}${reflectSuffix}`];

    // Optional "new angle": replaces the reflected heading of a fired object on
    // the first frame of the bounce (clamped to the valid range).
    const manualAngleLines = [];
    const angleCode = block.getFieldValue('MANUAL') === 'TRUE' ?
      Blockly.BBasic.valueToCode(block, 'ANGLE', Blockly.BBasic.ORDER_NONE) : '';
    if (hasFire && angleCode) {
      const dirVar = resolveVar(missileFireDirVarName(name));
      const maxAngle = (Blockly.BBasic.missileFire16UsedFor || new Set()).has(name) ? 15 : 7;
      const angleNumber = literalNumber(angleCode);
      if (angleNumber !== null) {
        manualAngleLines.push(` ${dirVar} = ${Math.min(angleNumber, maxAngle)}`);
      } else {
        manualAngleLines.push(
            ` ${dirVar} = ${angleCode}`,
            ` if ${dirVar} > ${maxAngle} then ${dirVar} = ${maxAngle}`);
      }
    }

    // Reached by every Bounce block through a gosub, not repeated in each one.
    if (!Blockly.BBasic.subroutines[stageName]) {
      Blockly.BBasic.subroutines[stageName] = [
        // "Still the same collision, one frame later" check - frameVar is
        // advanced to what it'd need to equal for a genuine one-frame gap
        // FIRST, compared, THEN overwritten with the real framecounter value
        // for next time - byte-wrapping (0/255 rollover) falls out of this
        // correctly for free, no special case needed.
        ` temp6 = ${stagePair.read} & 48`,
        // Mark this frame as a Bounce frame (see generateBounceStageChecks).
        ` ${stagePair.write} = ${stagePair.read} | 64`,
        ` if temp6 = 0 then goto ${stage1Label}`,
        ` if temp6 = 16 then goto ${stage2Label}`,
        ` if temp6 = 32 then goto ${stage3Label}`,
        ` goto ${stage4Label}`,
        `@ ${stage1Label}`,
        ...fireLines.stage1,
        ...inertiaLines.stage1,
        ...reflectCall,
        ` ${stagePair.write} = (${stagePair.read} & 79) | 16`,
        ` goto ${doneLabel}`,
        `@ ${stage2Label}`,
        ...fireLines.stage2,
        ...inertiaLines.stage2,
        ` ${stagePair.write} = (${stagePair.read} & 79) | 32`,
        ` goto ${doneLabel}`,
        // Combat's deliberate "do nothing" grace frame (MxPFcount=$02) -
        // gives the object one more frame to clear the wall on stage 2's
        // heading before stage 4 gives up on it.
        `@ ${stage3Label}`,
        ` ${stagePair.write} = (${stagePair.read} & 79) | 48`,
        ` goto ${doneLabel}`,
        `@ ${stage4Label}`,
        ...fireLines.stage4,
        ...inertiaLines.stage4,
        ` ${stagePair.write} = (${stagePair.read} & 79) | 48`,
        `@ ${doneLabel}`,
      ].map((line) => line.replace(/^ /, '')).join('\n');
    }
    const stageSuffix = Blockly.BBasic.bankJumpSuffix(
        Blockly.BBasic.getCurrentBank(), Blockly.BBasic.getSubroutineBank(stageName));

    return [
      ` gosub ${stageName}${stageSuffix}`,
      // Set on every call, not just the first frame: while the object is still
      // touching what it hit, the give-up stage above would otherwise turn it
      // back around and replace this angle.
      ...manualAngleLines,
    ].join('\n') + '\n';
  };

  // Bit 2 of CTRLPF. Set through the bit-index syntax on the CTRLPF RAM
  // shadow (see reserveCtrlpfShadowDevVar's  comment - real CTRLPF can't
  // be safely read back), not a full assignment, so it doesn't clobber the
  // other bits sprite_ball_set already packs into the shadow (reflection,
  // ball width) - then flushed to the real CTRLPF right after.
  Blockly.BBasic['sprite_priority_set'] = function(block) {
    const value = block.getFieldValue('VALUE');
    const shadowVar = Blockly.BBasic.nameDB_.getName(ctrlpfShadowVarName(),
        Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${shadowVar}{2} = ${value}\n` +
        `CTRLPF = ${shadowVar}\n`;
  };

  // Player 0/1's color fade trigger - same shared mechanism as Background's
  // "Fade color to" (see emitColorFadeTrigger in generators/bbasic/
  // background.js), just targeting player0realcolor/player1realcolor
  // (whichever the VAR dropdown picked) instead of COLUBK/COLUPF. This is
  // set up by background.js's  init(), which always runs before this file's
  // (see the registration order in generators/bbasic.js), so
  // Blockly.BBasic.emitColorFadeTrigger already exists by the time this runs.
  Blockly.BBasic['sprite_player_fade_to'] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    return Blockly.BBasic.emitColorFadeTrigger(rawVar, color, frames);
  };

  // Player 0/1's  fade-finished watch - same shared mechanism as
  // Background's "When ... color has finished fading" (see
  // emitFadeFinishedWatch in generators/bbasic/background.js).
  Blockly.BBasic['sprite_player_fade_finished'] = function(block) {
    return Blockly.BBasic.emitFadeFinishedWatch(block, block.getFieldValue('VAR'));
  };

  // Player 0/1's  "animation has finished" watch - same check-and-clear
  // shape as emitFadeFinishedWatch (generators/bbasic/background.js), just
  // reading playerNsize{5} (a literal, not resolved through nameDB_ - a
  // real fixed kernel variable this app already writes directly in
  // bbasic.js's processAnimation, same as the pause bit sprite_player_
  // animation_playback's generator reads/writes) instead of
  // fadeFlagsVarName's dev var. No watches.has(...) guard needed here
  // (unlike emitFadeFinishedWatch) - this IS the one and only watch block
  // for this bit, so if it exists in the workspace at all, it's watching.
  Blockly.BBasic['sprite_player_animation_finished'] = function(block) {
    const name = resolvePlayerName(block);
    const code = Blockly.BBasic.statementToCode(block, 'DO').trim();
    const flagBit = `${name}size{5}`;
    const blockNumber = Blockly.BBasic.blockNumbers.next();
    const labelEnd = `_animfin_${blockNumber}_end`;
    return '\n' +
      [
        `if !${flagBit} then goto ${labelEnd}`,
        `${flagBit} = 0`,
        code,
        `@ ${labelEnd}`,
      ].join('\n') +
      '\n';
  };

  // Plain boolean read of the active bit - same shape as background_fade_
  // active's  generator (see generators/bbasic/background.js).
  Blockly.BBasic['sprite_player_fade_active'] = function(block) {
    const rawVar = block.getFieldValue('VAR');
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const activeBit = `${resolveVar(fadeFlagsVarName(rawVar))}{${fadeActiveBit(rawVar)}}`;
    return [activeBit, Blockly.BBasic.ORDER_ATOMIC];
  };
};
