'use strict';

import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

import Blockly from 'blockly';
import {preprocessBatariBasic, compileBatariBasicToAsm, assembleBatariBasic} from './bb-compiler';

import '../blocks';
import BlocklyBB, {RELOCATABLE_EVENT_NAMES, SYSTEM_VARIABLES} from '../generators/bbasic';
import {processPlayerStorageDefaults} from '../generators/bbasic/sprites';
import {getExtendedScoreGraphics, getTextMinikernelSiblingFiles} from '../generators/bbasic/text-minikernel-files';
import {processBackgroundStorageDefaults} from '../blocks/background';
import {findSongById} from '../blocks/music';
import {buildScoreFontOverride, SQUISH_SCORE_FONT} from '../utils/score-font';
import {showError} from '../utils/build-error';
import {computeRomCapacity} from '../utils/rom-capacity';
import {useGeneratedBasic} from './generated';
import {appendCompileLog, clearCompileLog, useBackgroundsStorage, useConfigurationStorage, useErrorStorage,
  usePlayer0Storage, usePlayer1Storage, useWorkspaceStorage} from './project';
import {getRelocationBanks, resetRelocationBanks, setRelocationBank,
  recordSuccessfulRelocationBanks, seedRelocationBanksFromLastSuccess} from './relocation-banks';
import {markRomUpToDate, markRomOutdated, useRomOutdated, useHasCompiledRom} from './rom-status';
import {setRomCapacity, useRomCapacity} from './rom-capacity';

Vue.use(VueCompositionApi);

export {markRomOutdated, useRomOutdated, useRomCapacity, useHasCompiledRom};

const EMPTY_WORKSPACE = '<xml xmlns="https://developers.google.com/blockly/xml"/>';

// The generated ROM always declares "set tv ntsc" (see bbasic.bb.hbs) - but
// that's a compile-time directive baked into the KERNEL's own timing code,
// not something Javatari can read back out of the compiled binary. Left
// alone, Javatari instead auto-detects the video standard at runtime by
// watching the ROM's own early frame timing for ~90 frames after load - a
// heuristic that's genuinely timing-sensitive and can fail intermittently
// even for a correct, working ROM (confirmed directly: an identical ROM,
// rebuilt with no code changes, sometimes passed and sometimes got
// Javatari's own "AUTO: FAILED" on-screen message with a rolling/garbled
// picture, purely depending on real-world timing jitter around load - not
// a bug in the generated code).
//
// A first attempt simulated Javatari's own video-standard hotkey
// (jt.ConsoleControls.VIDEO_STANDARD via consoleControls.processControlState)
// once per page load, since there's no direct "set and stop auto-detecting"
// call exposed - only that control, which CYCLES (Auto -> NTSC -> PAL ->
// Auto). That didn't reliably stick (confirmed directly: still reproduced
// "AUTO: FAILED" after a hard refresh) - the auto-detector's own ~90-frame
// window can still run concurrently and overwrite whatever the hotkey just
// set once it finishes, win or lose.
//
// This instead directly calls the video output's own setVideoStandard - a
// plain, idempotent setter (unlike the hotkey, calling it again is always
// safe, never cycles to PAL) - both immediately after load AND again after
// a delay comfortably past that ~90-frame/~1.5s detection window, so
// whatever the auto-detector concludes (or fails to conclude) in between
// gets overridden by our own final, correct answer. The "AUTO: FAILED"
// on-screen message may still flash briefly if detection loses, but the
// actual picture recovers to correct NTSC rendering right after, instead
// of staying stuck rolling/garbled.
const forceJavatariNtsc = () => {
  const videoOutput = window.Javatari && window.Javatari.room &&
    window.Javatari.room.console && window.Javatari.room.console.getVideoOutput();
  const jt = window.jt;
  if (!videoOutput || !jt) {
    // Javatari's own room can still be mid-initialization the very first
    // time a build finishes right after a fresh page load (its startup is
    // async, independent of our own compile pipeline) - retry shortly
    // instead of giving up on this attempt entirely.
    setTimeout(forceJavatariNtsc, 250);
    return;
  }
  videoOutput.setVideoStandard(jt.VideoStandard.NTSC);
  setTimeout(() => videoOutput.setVideoStandard(jt.VideoStandard.NTSC), 2000);
};

// Turns Javatari's own Keyboard/Keypad Controller emulation on or off (see
// AtariConsole.setKeypadMode in the vendored public/js/javatari.js - a fork
// of ppeccin/javatari.js with that peripheral newly implemented, since
// upstream doesn't support it at all: https://github.com/ppeccin/javatari.js/issues/17).
// Same "Javatari's own startup is async, independent of our compile
// pipeline" retry reasoning as forceJavatariNtsc above. Called on every
// build (not just ones that use keypad blocks) so a project that USED to
// use the keypad and just removed the last block correctly turns it back
// off too, rather than leaving a stale prior build's setting stuck on.
const setJavatariKeypadMode = (enabled) => {
  const room = window.Javatari && window.Javatari.room;
  const console_ = room && room.console;
  const consoleControls = room && room.consoleControls;
  if (!console_ || typeof console_.setKeypadMode !== 'function' ||
      !consoleControls || typeof consoleControls.setKeypadMode !== 'function') {
    setTimeout(() => setJavatariKeypadMode(enabled), 250);
    return;
  }
  // Two independent switches: console_.setKeypadMode covers the TIA/PIA
  // emulation itself (real hardware protocol) plus the physical-keyboard
  // key mapping; consoleControls.setKeypadMode covers a gamepad-shaped
  // Keyboard/Keypad Controller USB adapter, whose 12 raw buttons would
  // otherwise collide with Javatari's own default gamepad button
  // assignments (see GamepadConsoleControls' own setKeypadMode comment in
  // the vendored fork) - both need to be on together for the peripheral to
  // work regardless of which physical form it takes.
  console_.setKeypadMode(enabled);
  consoleControls.setKeypadMode(enabled);
};

// Loads the stored workspace headlessly (so this works from any tab, not
// just the editor) and runs it through the given callback, disposing it
// afterwards either way.
const withHeadlessWorkspace = (callback) => {
  const xmlText = useWorkspaceStorage().value;
  const workspace = new Blockly.Workspace();
  try {
    const dom = Blockly.Xml.textToDom(
        xmlText && xmlText !== 'null' ? xmlText : EMPTY_WORKSPACE);
    Blockly.Xml.domToWorkspace(dom, workspace);
    return callback(workspace);
  } finally {
    workspace.dispose();
  }
};

// The generated bBasic bakes in the backgrounds, animations and score font read
// from storage, so it has to be regenerated from the current project at build
// time; a graphics edit alone would otherwise leave the cached code stale.
const regenerateCode = () => withHeadlessWorkspace((workspace) => BlocklyBB.workspaceToCode(workspace));

// How many letter-pool slots the current project would actually need if
// Superchip RAM were off - used by Configuration.vue to check whether
// disabling it would leave too few letters free. Deliberately NOT just
// Blockly.Variables.allUsedVarModels(workspace).length (pure user-created
// variables) - with Superchip on, every app-internal dev var (missile fire's
// own fired-direction/speed, seek's own target/throttle state, background
// fade timers, etc. - see generators/bbasic.js's own routeDevVar) is ALSO
// routed through the very same 26-letter pool the instant Superchip goes
// off, competing with user variables for the exact same slots. Counting only
// user variables against the FULL letter pool undercounted real pressure
// whenever a project leaned on dev-var-heavy features but few explicit
// variables - letting "disable Superchip" through here even though the real
// build (bbasic.js's own "Too many variables" throw) would then fail. A real
// headless compile (same as regenerateCode above) is run so
// letterVarsUsed/superchipVarsUsed reflect this exact project's actual
// dev-var + user-var total (see bbasic.js's own routeDevVar/init() comments
// on how those two fields get set) - their SUM is exactly what would need to
// fit in the letter pool alone once Superchip stops splitting that load with
// the Superchip var pool.
export const countUsedVariables = () =>
  withHeadlessWorkspace((workspace) => {
    BlocklyBB.workspaceToCode(workspace);
    return (BlocklyBB.letterVarsUsed || 0) + (BlocklyBB.superchipVarsUsed || 0);
  });

// Whether the project needs "playercolors" (player0's own per-row sprite
// color kernel option) - either a real sprite_player0_rainbow_colors block
// on the canvas, or the standing "Enable per-row Player 0 sprite colors"
// toggle (see useSpriteColorsFor in generators/bbasic.js) - needed by
// Configuration.vue to force "Show blank lines" AND the Player 1 sprite
// colors toggle back on (disabling both) whenever either is active. See
// generators/bbasic.js's effectiveShowBlankLines for the "Show blank lines"
// half of that: batari Basic's own kernel_options combination table never
// pairs "playercolors" with "no_blank_lines" in any valid row, confirmed by
// a real "Invalid combination of options" build failure when both were
// emitted together - and generateConfiguration's own comment for the
// "player1colors" half: playercolors is never valid without it either.
export const usesPlayer0RainbowColors = () => {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.enablePlayer0SpriteColors) return true;
  return withHeadlessWorkspace((workspace) =>
    workspace.getAllBlocks(false).some((block) =>
      block.type === 'sprite_player0_rainbow_colors' && block.isEnabled()));
};


// The compiler hardcodes the pfcolors table pointer as "pfcolorlabelN-84",
// which only lands on the right byte when the kernel's own row index starts
// at 84 - true for the standard (pfres-less) kernel, but Superchip's
// explicit "const pfres" changes that starting index to 132-pfres*4, which
// only equals 84 when pfres is exactly 12. For any other pfres this pointer
// is simply wrong, misaligning every row's color read - confirmed by
// comparing resolved ROM addresses and compiling with the offset corrected
// by hand. Patched here, after compiling and before assembling, since nothing
// in the source-level template controls this constant.
//
// This does NOT fully fix pfcolors+Superchip - the very last playfield row
// still renders black regardless of pfres. Root cause not yet found.
const patchSuperchipPfColorsPointer = ({mainAsm, workDir}, config) => {
  if (!config.enableSuperchip || !config.pfres) return {mainAsm, workDir};
  const correctOffset = 132 - config.pfres * 4;
  return {mainAsm: mainAsm.replace(/pfcolorlabel(\d+)-84/g, `pfcolorlabel$1-${correctOffset}`), workDir};
};

// "segment overflow" is DASM's plain "ran out of room in this bank"
// message. "Origin Reverse-indexed" is a second, differently-worded DASM
// error also seen from an over-full bank - not confirmed to be tied to any
// particular ROM setting, just observed alongside overflow-shaped symptoms
// (it went away once the same content shrank, with nothing else changed).
// Treated the same way as a plain overflow so the retry loop below gets a
// chance to relocate something and try a different bank, rather than
// surfacing it as an unrelocatable error immediately. Anything else is a
// genuine problem in the user's own project that auto-relocating an event
// would only obscure, so it's surfaced immediately instead.
//
// A THIRD overflow shape, confirmed directly against a real build (Superchip
// RAM + a pfres above the standard 12 + a bankswitched ROM size above 8k -
// none of those three alone reproduces it, only all three together):
// bank 1 overflowing its RORG'd segment in a way DASM doesn't report as a
// clean "segment overflow" at all - instead its own two-pass symbol
// resolution desyncs, and it cascades into "Unknown Mnemonic" errors on
// dozens of unrelated lines throughout the rest of the file, none of which
// the user's own project touches (stock runtime labels like the bankswitch
// trampoline itself, or the score digit table). The one consistent, safe-
// to-match signature across every reproduction of this: DASM can no longer
// resolve "BS_jsr"/"BS_return", the bankswitch call/return trampoline's own
// labels - a user's own project can never reference those directly (they're
// pure DASM-internal symbols emitted by the "gosub"/"return" macros), so
// this is unambiguous evidence of the same "bank 1 doesn't fit" condition
// as a plain segment overflow, just reported unrecognizably. Whichever unit
// the retry loop picks to relocate next also shrinks bank 1 by the same
// amount either way, so no separate handling is needed once caught here -
// it just needs to be recognized as "try relocating" instead of surfacing
// the cascade directly.
const isOverflowError = (e) => /segment overflow|origin reverse-indexed|Unknown Mnemonic 'jmp BS_(jsr|return)'/i
    .test((e && e.message) || '');

// How many physical banks each bankswitched ROM size actually provides
// (2k/4k don't bankswitch at all, so they're absent - overflowing there just
// surfaces the real error, with nowhere to relocate anything). Every bank
// past bank 1 is a valid relocation target - the standard kernel's
// bankswitch trampoline is duplicated at the same relative offset in every
// bank, and cross-bank calls work identically regardless of which bank
// number is used (confirmed for bank 2 directly against the compiler and
// the emulator - see the bank-targeting feasibility notes).
export const BANK_COUNT_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8, '64k': 16};

// Graphics unit keys (see wrapRelocatableGraphics in generators/bbasic.js)
// are generated, code-facing identifiers ("background3", "player0default",
// "player1animation2"), not anything a user would recognize - this resolves
// one back to whatever the user actually named it (a background's own name,
// or an animation's own name), for the ROM capacity display's bank-contents
// listing only. No player number in the returned label itself - the caller
// already splits player0/player1 into their own separate lists (see
// computeBankContents below), so repeating it per-entry would be redundant.
// Falls back to the raw unit key if the name can't be resolved (e.g. the
// background/animation was since deleted but a stale relocation decision
// still references it - shouldn't happen in practice, since banks are
// re-derived fresh every build, but cheap to guard against).
const BACKGROUND_UNIT_RE = /^background(\d+)$/;
const PLAYER_ANIMATION_UNIT_RE = /^(player[01])animation(\d+)$/;
const PLAYER_DEFAULT_UNIT_RE = /^(player[01])default$/;
const PLAYER_STORAGE_FACTORIES = {player0: usePlayer0Storage, player1: usePlayer1Storage};
const resolveGraphicsUnitLabel = (unitKey) => {
  const backgroundMatch = BACKGROUND_UNIT_RE.exec(unitKey);
  if (backgroundMatch) {
    try {
      const {backgrounds} = processBackgroundStorageDefaults(useBackgroundsStorage());
      const background = backgrounds.find((bg) => `${bg.id}` === backgroundMatch[1]);
      if (background) return background.name || `Background ${backgroundMatch[1]}`;
    } catch (e) {
      console.error('Failed to resolve background name', e);
    }
    return unitKey;
  }
  const animationMatch = PLAYER_ANIMATION_UNIT_RE.exec(unitKey);
  if (animationMatch) {
    const [, player, index] = animationMatch;
    try {
      const data = processPlayerStorageDefaults(PLAYER_STORAGE_FACTORIES[player]());
      const animation = data.animations[Number(index)];
      return (animation && animation.name) || `Unnamed ${Number(index) + 1}`;
    } catch (e) {
      console.error('Failed to resolve animation name', e);
    }
    return unitKey;
  }
  const defaultMatch = PLAYER_DEFAULT_UNIT_RE.exec(unitKey);
  if (defaultMatch) return 'Default frame';
  return unitKey;
};

// Every song/pattern actually included in this build is baked directly into
// the single "musicEngine" relocatable unit's own payload (see
// wrapRelocatableMusic's call site in generators/bbasic/music.js) rather
// than tracked as its own relocatable unit or data table - there's no such
// thing as "this song is in bank 3 but that one is in bank 5", every song
// and pattern always shares musicEngine's one bank. This expands that single
// "musicEngine" entry into the actual song names (with each song's own
// pattern count) it contains, for the ROM capacity display's bank-contents
// listing, rather than literally showing the code-facing "musicEngine" name.
const resolveMusicSongLabels = () => {
  const music = BlocklyBB.projectMusic;
  if (!music || !music.songs || !music.songs.length) return [];
  return music.songs.map(({songId}) => {
    const song = findSongById(songId);
    const name = (song && song.name) || `Song ${songId}`;
    const patternCount = song ? (song.patterns || []).length : 0;
    return patternCount ? `${name} (${patternCount} pattern${patternCount === 1 ? '' : 's'})` : name;
  });
};

// Snapshot of this build's own variable-pool usage (see letterVarsUsed/
// letterVarsAvailable/superchipVarsUsed/superchipVarsAvailable's own comment
// in generators/bbasic.js) for the ROM capacity display - both pools are
// filled fresh on every regenerateCode() call, so this only needs to read
// whatever the just-finished build already left on BlocklyBB, not recompute
// anything itself. superchip.available is 0 (not the full 29-slot budget)
// when Superchip RAM is off, matching how routeDevVar itself never touches
// that pool in that case either.
const computeVariableUsage = () => {
  const config = useConfigurationStorage().value || {};
  // The 12 SYSTEM_VARIABLES (player0frame, framecounter, etc. - see their own
  // comment in generators/bbasic.js) are always dimmed, but land on a
  // DIFFERENT pool depending on Superchip: real letters when it's off, or
  // var0-var11 (a fixed region OUTSIDE letterVarsAvailable/
  // superchipVarsAvailable's own 26-letter/32-slot totals, which only ever
  // described the competitive dev/user pool) when it's on. "Total Variables"
  // is meant to read as everything actually reserved out of whichever pool
  // it really lives in, so this folds systemVarCount into whichever side
  // System reserved is ACTUALLY occupying this build, rather than leaving it
  // out of both (the previous, confusing behavior this replaces).
  const systemVarCount = SYSTEM_VARIABLES.length;
  return {
    letters: {
      used: (BlocklyBB.letterVarsUsed || 0) + (config.enableSuperchip ? 0 : systemVarCount),
      available: BlocklyBB.letterVarsAvailable || 0,
    },
    superchip: {
      used: (BlocklyBB.superchipVarsUsed || 0) + (config.enableSuperchip ? systemVarCount : 0),
      available: config.enableSuperchip ? (BlocklyBB.superchipVarsAvailable || 0) + systemVarCount : 0,
    },
    // Superchip RAM's own SEPARATE read/write pool (r000-r127/w000-w127 -
    // see reserveDevVarRW's own comment in generators/bbasic.js) - a
    // completely different resource from the "letters"/"superchip" pools
    // above (those two compete for the SAME 48-byte-freed-playfield-plus-
    // 26-letter budget; this one is its own distinct 128-byte region, only
    // ever used for a small, hand-picked set of internal vars, never
    // offered to the user). available is 0 whenever Superchip itself is
    // off, or once pfres claims the whole 128 bytes (pfres=32) - same
    // "0 means not applicable, not broken" convention as superchip.available
    // above.
    superchipRw: {
      used: BlocklyBB.superchipRwUsed || 0,
      available: BlocklyBB.superchipRwAvailable || 0,
    },
    // System variables (player0frame, newbackground, etc. - see
    // SYSTEM_VARIABLES' own comment in generators/bbasic.js) are a SEPARATE,
    // always-unconditional set of "dim" lines - never routed through
    // routeDevVar/letterVarAssignments/superchipVarAssignments at all, since
    // they're not part of that competitive pool (every one of them exists on
    // every build, dev/user var count or not). Computed directly here, the
    // same "var${i}"-with-Superchip/literal-letter-otherwise rule
    // generateSystemDims itself uses, rather than threading a third array
    // through BlocklyBB, since it needs nothing from an actual compile -
    // just the current Superchip toggle.
    systemAssignments: SYSTEM_VARIABLES.map(([name, letter], i) =>
      ({name, slot: config.enableSuperchip ? `var${i}` : letter})),
    // Per-slot breakdown for the dynamic dev/user var pool (see bbasic.js's
    // own letterVarAssignments/superchipVarAssignments comment) - which
    // actual name landed on which letter/var slot, for the ROM capacity
    // display's own expandable list.
    letterAssignments: BlocklyBB.letterVarAssignments || [],
    superchipAssignments: BlocklyBB.superchipVarAssignments || [],
    // Same per-slot breakdown, for Superchip's own separate r/w pool (see
    // reserveDevVarRW's own comment in generators/bbasic.js) - every entry
    // here always has isUserVariable: false (this pool is never offered to
    // the user), so it only ever shows up under the block/system list, not
    // the user-variable one.
    superchipRwAssignments: BlocklyBB.superchipRwAssignments || [],
  };
};

// Every graphics/event/music/subroutine unit's own current bank, grouped by
// bank instead of by unit (the shape getRelocationBanks/pickRelocationCandidate
// use) - built fresh after a successful build for the ROM capacity display,
// which wants "what's actually in bank N" for every bank, not just the ones
// something got reactively relocated INTO (getRelocationBanks' own maps only
// ever have entries for units that left bank 1 at all - a unit still sitting
// at its default only shows up here, in whichever bank's own list it falls
// into). BANK_COUNT_BY_ROMSIZE doubles as the Text Minikernel's own reserved
// bank number too (see KERNEL_BANK_BY_ROMSIZE's identical values and
// duplicated-on-purpose comment in generators/bbasic/text-minikernel.js) -
// always the single highest-numbered bank for the ROM's size.
const computeBankContents = (maxBanks, textMinikernelActive) => {
  const banks = getRelocationBanks();
  const contents = {};
  for (let bank = 1; bank <= maxBanks; bank++) {
    contents[bank] = {
      events: [], backgrounds: [], player0Sprites: [], player1Sprites: [], music: [], subroutines: [],
      functions: [], dataTables: [], soundEffects: [], textMinikernel: false, bankOverhead: false,
    };
  }
  const place = (list, names, bankMap, labelFn) => {
    names.forEach((name) => {
      const bank = bankMap[name] || 1;
      if (contents[bank]) contents[bank][list].push(labelFn ? labelFn(name) : name);
    });
  };
  place('events', RELOCATABLE_EVENT_NAMES, banks.eventBanks || {});
  // Split by unit key shape (see resolveGraphicsUnitLabel's own regexes just
  // above) rather than lumping every graphics unit into one list - a
  // background and a player's own sprite frame/animation are different
  // enough kinds of content that a shared "Graphics" label was more
  // confusing than useful once a bank actually held both at once, and the
  // two players' sprites are kept in their own separate lists too rather
  // than sharing one (with a player number on each entry) for the same
  // reason.
  const graphicsKeys = BlocklyBB.getGraphicsUnitKeys();
  place('backgrounds', graphicsKeys.filter((key) => BACKGROUND_UNIT_RE.test(key)),
      banks.graphicsBanks || {}, resolveGraphicsUnitLabel);
  place('player0Sprites', graphicsKeys.filter((key) => key.startsWith('player0')),
      banks.graphicsBanks || {}, resolveGraphicsUnitLabel);
  place('player1Sprites', graphicsKeys.filter((key) => key.startsWith('player1')),
      banks.graphicsBanks || {}, resolveGraphicsUnitLabel);
  // Sound FX envelope-check asm + its own data tables (see
  // wrapRelocatableGraphics' own call site at the end of generateEnvelopeChecks
  // in generators/bbasic/soundfx.js) - shares the same graphics pool/bank map
  // as backgrounds/player sprites above (not a dedicated pool the way music
  // gets one), just filtered out into its own labeled list here for the same
  // "different enough kinds of content" reason those are split out too.
  place('soundEffects', graphicsKeys.filter((key) => key === 'soundfxEnvelopeChecks'),
      banks.graphicsBanks || {}, () => 'Sound envelope checks');
  BlocklyBB.getMusicUnitKeys().forEach((unitKey) => {
    const bank = (banks.musicBanks || {})[unitKey] || 1;
    if (!contents[bank]) return;
    const labels = unitKey === 'musicEngine' ? resolveMusicSongLabels() : [];
    contents[bank].music.push(...(labels.length ? labels : [unitKey]));
  });
  place('subroutines', BlocklyBB.getSubroutineNames(), banks.subroutineBanks || {});
  // A function relocates as part of its own "family" (see
  // computeFunctionFamilies) rather than entirely independently, but still
  // ends up with a real per-function entry in banks.functionBanks either
  // way (see setRelocationBank's own call sites in buildRom(), which iterate
  // every family member individually). Listed under its own label (not
  // lumped into Subroutines) so it's visible at a glance which bank a
  // function ended up in relative to whatever calls it - relevant since a
  // caller outside its family can't safely call a function pinned here
  // (function calls don't get a bank-jump tag the way gosub/goto do).
  place('functions', Object.keys(BlocklyBB.functions), banks.functionBanks || {});
  // Each table's own bank usage (see trackDataTableBank/generateDataTables in
  // generators/bbasic.js) - a table can end up with a physical copy in
  // several banks at once (every bank it's actually read from), unlike the
  // other kinds above which only ever live in one, so this pushes into
  // every bank it has a copy in rather than just one. A table nothing ever
  // read (no usage entry at all) still gets an implicit bank 1 copy,
  // matching generateDataTables' own fallback.
  const dataTablesData = BlocklyBB.getDataTablesData();
  const dataTableUsage = BlocklyBB.getDataTableBankUsage();
  ((dataTablesData && dataTablesData.dataTables) || [])
      .filter((table) => table.values && table.values.length)
      .forEach((table) => {
        const usage = dataTableUsage[table.id];
        const tableBanks = usage && usage.size ? [...usage] : [1];
        tableBanks.forEach((bank) => {
          if (contents[bank]) contents[bank].dataTables.push(table.name || `Unnamed ${table.id}`);
        });
      });
  // textMinikernelActive is passed in by the caller (captured at the exact
  // moment THIS build's own regenerateCode() ran) rather than read fresh off
  // BlocklyBB.isTextMinikernelActive() here - this function runs well after
  // that, following the real async compile/assemble steps, and BlocklyBB is
  // a shared singleton reused across every workspaceToCode() call (see its
  // own comment in generators/bbasic.js) - anything else touching it in the
  // meantime (e.g. the Actions tab's own live code preview,
  // ActionEditor.vue's own workspaceToCode call) can flip textMinikernelUsed
  // back before this ever reads it, silently dropping the Text Minikernel's
  // own real bank-8-ish usage from the display - a real reported bug (the
  // top bank showing real used bytes with no "Text Minikernel" entry to
  // account for them).
  if (textMinikernelActive && contents[maxBanks]) {
    contents[maxBanks].textMinikernel = true;
  }
  // generateRelocatedSections (generators/bbasic.js) always declares this
  // exact top bank on a bankswitched, non-Text-Minikernel build, even with
  // nothing relocated into it, so DASM pads it to full size instead of
  // truncating the assembled binary - that costs real bytes (bB's own
  // per-bank bankswitch entry code), but none of the categories above ever
  // account for it, so the top bank showed used space with an empty content
  // list whenever nothing else happened to be relocated there.
  if (!textMinikernelActive && maxBanks > 1 && contents[maxBanks]) {
    contents[maxBanks].bankOverhead = true;
  }
  return contents;
};

// Builds the "family" grouping every function (see function_define in
// generators/bbasic/function.js) and every function_call_statement wrapper
// subroutine (registerFunctionCallWrapper there) needs before either can be
// relocated safely: a bB function-call expression ("name(args)") has no
// bank-tag syntax of its own (see codeReferencesAnyFunction's own comment in
// generators/bbasic.js), so a function and everything that reaches it
// through a plain VALUE-form call - another function's own body, or a
// wrapper subroutine's own body, both scanned here the same way
// codeReferencesAnyFunction does - must always land in the exact same bank
// as each other, whichever bank that turns out to be. Anything reaching a
// function through a wrapper's own "gosub" (bank-taggable) is deliberately
// NOT part of this - only the wrapper itself joins the family, not whatever
// calls the wrapper, which stays free to relocate independently.
//
// Returns every function/wrapper in the project grouped into families, each
// {members: [{kind, name}, ...]} - kind is always 'functionBanks' (a real
// function) or 'subroutineBanks' (a wrapper subroutine, which physically
// lives in the same subroutines map/bucket as an ordinary user-authored one,
// see registerFunctionCallWrapper). Every function/wrapper appears in
// EXACTLY one family, even one nothing else calls and that calls nothing
// else itself (a size-1 family, trivially relocatable alone) - a plain
// connected-components pass (union-find) over the "calls" graph, not just
// direct pairs, so a chain (event-callable wrapper -> function A -> function
// B) still lands all three in one family together.
const computeFunctionFamilies = () => {
  const functionNames = BlocklyBB.getFunctionNames();
  const wrapperNames = [...(BlocklyBB.functionCallWrapperNames || [])];
  const nodeKind = new Map([
    ...functionNames.map((name) => [name, 'functionBanks']),
    ...wrapperNames.map((name) => [name, 'subroutineBanks']),
  ]);
  const codeOf = (name) => nodeKind.get(name) === 'functionBanks' ?
    (BlocklyBB.functions[name] || '') : (BlocklyBB.subroutines[name] || '');

  const parent = new Map([...nodeKind.keys()].map((name) => [name, name]));
  const find = (name) => {
    let root = name;
    while (parent.get(root) !== root) root = parent.get(root);
    let cur = name;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur);
      parent.set(cur, root);
      cur = next;
    }
    return root;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  };

  nodeKind.forEach((kind, name) => {
    const code = codeOf(name);
    functionNames.forEach((otherName) => {
      if (otherName === name) return;
      if (code.includes(`${otherName}(`)) union(name, otherName);
    });
  });

  const families = new Map();
  nodeKind.forEach((kind, name) => {
    const root = find(name);
    if (!families.has(root)) families.set(root, []);
    families.get(root).push({kind, name});
  });
  return [...families.values()].map((members) => ({members}));
};

// A function family's own combined estimated size - the sum of every
// member's own size estimate, since the whole family always relocates (or
// stays) together as one atomic unit.
const estimateFamilySize = (members) => members.reduce((sum, {kind, name}) =>
  sum + (kind === 'functionBanks' ?
    BlocklyBB.estimateFunctionSize(name) : BlocklyBB.estimateSubroutineSize(name)), 0);

// True only if EVERY member of the family is still at bank 1 in the given
// banks snapshot - a family only ever moves as a whole, so it's only a
// relocation candidate while none of its members have already been moved
// elsewhere (which, given every relocation always moves a whole family at
// once, really means none of them have - this is written per-member anyway
// so a family whose members haven't been touched yet, the common case,
// still reads correctly as bank 1 by the same "no entry defaults to 1"
// convention every other bank map in this file already uses).
const familyStillInBank1 = (members, banks) =>
  members.every(({kind, name}) => ((banks[kind] || {})[name] || 1) === 1);

// Largest-first, across every relocatable kind: relocating the biggest
// still-inline unit (event, graphics - a background, a player's default
// frame, or a single named animation, see wrapRelocatableGraphics - a
// user-defined subroutine, see getSubroutineBank in generators/bbasic.js -
// music, see wrapRelocatableMusic, kept in its own separate pool/config key
// from graphics - or a function "family", see computeFunctionFamilies)
// frees the most bank 1 space per attempt, minimizing how many rebuild
// cycles are needed. Must run right after a regenerateCode() call, while
// every kind's size estimate is still current - graphics/music unit keys
// and subroutine/function names are only known after that call too, since
// they're generated from the project's own content rather than fixed like
// the event names.
const pickRelocationCandidate = (banks, hasReservedMusicBank) => {
  const eventBanks = banks.eventBanks || {};
  const graphicsBanks = banks.graphicsBanks || {};
  const musicBanks = banks.musicBanks || {};
  const subroutineBanks = banks.subroutineBanks || {};
  const musicCandidates = BlocklyBB.getMusicUnitKeys()
      .filter((name) => (musicBanks[name] || 1) === 1)
      .map((name) => ({kind: 'musicBanks', name, size: BlocklyBB.estimateMusicUnitSize(name)}));
  // Music still sitting in bank 1 jumps the queue whenever it has its own
  // reserved bank waiting (see musicReservedBank) - moving it there is a
  // pure win with no downside, unlike graphics/events/subroutines, which
  // compete for space in whichever shared-pool bank they land in. Sorting
  // it in with everything else and picking by size alone only got to it
  // once music happened to be the single largest still-in-bank-1 unit -
  // confirmed directly as a real bug on a project with several sizeable
  // graphics units and one small music engine: bank 1 kept overflowing
  // (evicting graphics into an already-tight shared pool, sized as if only
  // 6 banks existed) while music's own reserved 7th bank sat completely
  // empty for all 64 relocation attempts, since nothing ever picked it.
  if (hasReservedMusicBank && musicCandidates.length) {
    return musicCandidates.sort((a, b) => b.size - a.size)[0];
  }
  const candidates = [
    // Excludes anything that calls a bB function via a plain value-form
    // call (see codeReferencesAnyFunction's own comment in
    // generators/bbasic.js) - an ordinary event or user-authored subroutine
    // matching this stays pinned to bank 1 (the minimal fix for the exact
    // same "no bank-tag syntax" reason function families themselves need
    // to move together, confirmed directly: a real project's title_start
    // crashed in the emulator the moment it called ANY function while
    // relocated off bank 1). A function_call_statement WRAPPER subroutine
    // also matches this same check, but is deliberately NOT excluded here
    // for a different reason - it's picked up by the family-based
    // candidates below instead, never as an ordinary standalone subroutine.
    ...RELOCATABLE_EVENT_NAMES
        .filter((name) => (eventBanks[name] || 1) === 1)
        .filter((name) => !BlocklyBB.codeReferencesAnyFunction((BlocklyBB.gameEvents[name] || []).join('\n')))
        .map((name) => ({kind: 'eventBanks', name, size: BlocklyBB.estimateEventSize(name)})),
    ...BlocklyBB.getGraphicsUnitKeys()
        .filter((name) => (graphicsBanks[name] || 1) === 1)
        .map((name) => ({kind: 'graphicsBanks', name, size: BlocklyBB.estimateGraphicsUnitSize(name)})),
    ...musicCandidates,
    ...BlocklyBB.getSubroutineNames()
        .filter((name) => (subroutineBanks[name] || 1) === 1)
        .filter((name) => !BlocklyBB.codeReferencesAnyFunction(BlocklyBB.subroutines[name] || ''))
        .map((name) => ({kind: 'subroutineBanks', name, size: BlocklyBB.estimateSubroutineSize(name)})),
    // Every function/wrapper "family" still entirely at bank 1 - relocated
    // as one atomic unit (see setRelocationBank's own call sites in
    // buildRom() below, which iterate candidate.members instead of a single
    // kind/name whenever this is present), sized as the sum of every
    // member's own estimate.
    ...computeFunctionFamilies()
        .filter(({members}) => familyStillInBank1(members, banks))
        .map(({members}) => ({
          kind: 'family',
          name: members.map((m) => m.name).join(', '),
          size: estimateFamilySize(members),
          members,
        })),
  ];
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.size - a.size)[0];
};

// Summed estimated size of every relocatable unit (of every kind, including
// music and function families - unlike pickRelocationCandidate above, this
// isn't picking a single winner, it wants the true total) still sitting in
// bank 1 - used only by buildRom()'s own proactive relocation pre-pass, to
// compare against a real, previously-measured bank 1 capacity before that
// pre-pass ever moves anything. Same "must run right after
// regenerateCode()" requirement as pickRelocationCandidate.
const estimateBank1Total = (banks) => {
  const inBank1 = (bankMap, name) => (bankMap[name] || 1) === 1;
  const eventTotal = RELOCATABLE_EVENT_NAMES
      .filter((name) => inBank1(banks.eventBanks || {}, name))
      .reduce((sum, name) => sum + BlocklyBB.estimateEventSize(name), 0);
  const graphicsTotal = BlocklyBB.getGraphicsUnitKeys()
      .filter((name) => inBank1(banks.graphicsBanks || {}, name))
      .reduce((sum, name) => sum + BlocklyBB.estimateGraphicsUnitSize(name), 0);
  const musicTotal = BlocklyBB.getMusicUnitKeys()
      .filter((name) => inBank1(banks.musicBanks || {}, name))
      .reduce((sum, name) => sum + BlocklyBB.estimateMusicUnitSize(name), 0);
  // Excludes function_call_statement wrapper subroutines (see
  // codeReferencesAnyFunction's own comment) - counted once, below, as part
  // of their own function family's total instead, so they're not double-
  // counted here too.
  const subroutineTotal = BlocklyBB.getSubroutineNames()
      .filter((name) => inBank1(banks.subroutineBanks || {}, name))
      .filter((name) => !BlocklyBB.codeReferencesAnyFunction(BlocklyBB.subroutines[name] || ''))
      .reduce((sum, name) => sum + BlocklyBB.estimateSubroutineSize(name), 0);
  const functionFamilyTotal = computeFunctionFamilies()
      .filter(({members}) => familyStillInBank1(members, banks))
      .reduce((sum, {members}) => sum + estimateFamilySize(members), 0);
  return eventTotal + graphicsTotal + musicTotal + subroutineTotal + functionFamilyTotal;
};

// The single highest-numbered available bank (excluding the Text
// Minikernel's own reserved top bank, same as pickNextBank below) is set
// aside for music units specifically, rather than sharing the same pool
// backgrounds/animations/events pack into - see pickNextBank's own comment
// for why a dedicated reservation was tried and reverted once before,
// and generateMusicChecks/generatePlaySong's own comments for why music's
// own size can vary a lot build to build in a way fixed content can't.
// Reverting that revert here, at the user's own explicit request, after a
// real project demonstrated the earlier "shared pool" reasoning's own
// tradeoff cuts the other way just as easily: a project that's ALREADY
// packed every other bank tight leaves music with nowhere to fit at all
// otherwise, which is worse than dedicating it a bank up front. Returns null
// if there aren't enough banks to spare one just for music (need at least
// one bank left over for the shared graphics/events pool too).
const musicReservedBank = (maxBanks, textMinikernelActive) => {
  const highestBank = textMinikernelActive ? maxBanks - 1 : maxBanks;
  return highestBank - 2 >= 1 ? highestBank : null;
};

// Spreads relocated units (events, graphics, and subroutines together, since
// they share the same physical banks) across every available bank rather
// than piling them all into one - picks whichever bank (2..maxBanks, minus
// excludeBank - see musicReservedBank above) currently holds the fewest
// relocated units, ties broken toward the lowest bank number.
//
// Two other strategies were each tried and reverted here in the same
// session: balancing by a summed source-length estimate (see
// estimateEventSize/estimateGraphicsUnitSize's own comments on why that
// doesn't reliably track compiled bytes), and always packing into the
// lowest-numbered bank with no balancing at all. The latter failed hard on a
// real project: it crammed 20+ units into bank 2 alone before ever trying
// bank 3, bank 2 genuinely overflowed, and the fallback below (which only
// ever reconsiders the MOST RECENTLY relocated unit) kept cycling whichever
// unit happened to be last through every other bank - never addressing the
// real problem, since DASM only ever reports ONE overflowing segment at a
// time and there's no way from its error message alone to confirm THAT was
// actually the segment (bank) responsible. Spreading by count avoids ever
// concentrating that much untested content in one bank in the first place -
// it doesn't know any better than the size estimate did whether a given
// bank is ACTUALLY full, but bounding how much accumulates in any one bank
// before compiling bounds how bad a wrong guess can be.
// extraExcluded (a Set, e.g. a unit's own already-tried banks in the
// stuckBank fallback below) is additional to excludeBank (always the
// reserved music bank, if any) - kept as a separate param rather than
// folded into one exclusion set since excludeBank alone is the common case
// every other caller uses.
// excludeBanks is a HARD exclusion - always the reserved music bank (never
// a valid target for non-music content at all) and, from the stuckBank
// fallback's own call site, every bank already tried for THIS unit
// (including its own current bank - moving a unit to the bank it's already
// in is a pure no-op that still counts as an attempt). A SOFT version of
// this (a large penalty added to an already-tried bank's tally instead of
// excluding it outright) was tried and reverted here: it fixed the
// "permanently out of options" dead-end below by letting a previously-tried
// bank stay pickable as a last resort, but introduced a different, equally
// real bug - once two or more banks were EQUALLY penalized, the tie-break
// (still just "fewest current occupants") could alternate a unit back and
// forth between exactly two of them forever, each move flipping which one
// currently has fewer occupants - confirmed directly on a real project (one
// event alternating between the same two banks, ~19 times, zero net
// progress). Hard exclusion doesn't have that failure mode (a bank, once
// tried, is simply never offered again), so the "ran out of every bank"
// case is instead handled at the stuckBank fallback's own call site by
// clearing that one unit's own tried-set and giving it a fresh attempt,
// rather than by softening the exclusion here.
const pickNextBank = (banks, maxBanks, textMinikernelActive, excludeBanks) => {
  const highestBank = textMinikernelActive ? maxBanks - 1 : maxBanks;
  if (highestBank < 2) return null;
  const counts = {};
  for (let bank = 2; bank <= highestBank; bank++) {
    if (excludeBanks && excludeBanks.has(bank)) continue;
    counts[bank] = 0;
  }
  if (!Object.keys(counts).length) return null;
  const tally = (unitBanks) => Object.values(unitBanks || {}).forEach((bank) => {
    if (counts[bank] !== undefined) counts[bank]++;
  });
  tally(banks.eventBanks);
  tally(banks.graphicsBanks);
  tally(banks.subroutineBanks);
  tally(banks.functionBanks);
  return Object.keys(counts).map(Number).reduce((best, bank) => counts[bank] < counts[best] ? bank : best);
};

// Safety cap on relocation attempts, not a real limit on how many units
// exist: every attempt either moves one previously-still-bank-1 unit out (so
// it's never picked again) or gives up, and the total number of relocatable
// units (fixed events plus however many backgrounds/animations the project
// defines) realistically never approaches this.
const MAX_RELOCATION_ATTEMPTS = 64;

/**
 * Compiles the current project into a ROM and loads it into the emulator.
 * If it doesn't fit in bank 1, automatically relocates the largest
 * still-inline relocatable unit - an event, a background, a player's default
 * frame, or a single named animation - into whichever available bank
 * currently holds the fewest relocated units, and retries - repeating until
 * it fits, every relocatable unit has been tried, or every bank the ROM size
 * provides is in use.
 * @return {!Promise<boolean>} Whether the ROM was built.
 */
export const buildRom = async () => {
  const errorStorage = useErrorStorage();
  const configurationStorage = useConfigurationStorage();
  const relocatedThisBuild = [];

  // Tracks every bank each unit has already been tried in during THIS
  // build (keyed by "kind:name"), so the fallback below (see its own
  // comment) can tell which banks are left to try for whichever unit needs
  // it, rather than repeating one that already overflowed.
  const retriedBanksByUnit = new Map();

  // Persists across attempts, unlike relocatedThisBuild's own last entry -
  // see the fallback below's own comment for why RE-DERIVING "which bank is
  // actually the problem" fresh every single attempt (from whichever unit
  // the PREVIOUS attempt's own guess happened to move) kept drifting to a
  // new, usually-innocent bank each time instead of ever systematically
  // working through one bank's real occupants.
  let stuckBank = null;
  const stuckBankTriedUnits = new Set();

  // Tracks the most recent failure so the post-loop fallback (see its own
  // comment, right after the for loop below) can still report something
  // useful if the attempt budget runs out without the loop's own "nothing
  // left to try" branch ever firing.
  let lastCode = '';
  let lastFailure = null;

  // Every relocatable unit (events, graphics, music, subroutines - see
  // hooks/relocation-banks.js) starts this build fresh, back at bank 1,
  // rather than carrying over wherever a PREVIOUS build happened to leave
  // it. Bank assignments aren't PERSISTED across builds (see relocation-
  // banks.js's own comment for why that was tried and reverted), but the
  // last SUCCESSFUL build's own layout is kept in memory for this session as
  // a first-attempt hint (seedRelocationBanksFromLastSuccess, below) -
  // abandoned immediately, via the exact same resetRelocationBanks() this
  // always called, the moment that first attempt doesn't compile clean (see
  // the catch block below), so every attempt from #2 onward behaves
  // identically to how this has always worked.
  resetRelocationBanks();
  const seededFromLastSuccess = seedRelocationBanksFromLastSuccess(
      (configurationStorage.value || {}).romSize);
  clearCompileLog();
  if (seededFromLastSuccess) {
    appendCompileLog('Trying the last successful bank layout first...', 'stage');
  }
  const buildStartedAt = performance.now();

  // An earlier version of this also relocated graphics out of bank 1
  // PROACTIVELY here, before the very first compile attempt, so a project
  // that already compiled fine wouldn't leave bank 1 packed tight while
  // other banks sat empty - and was reverted after being confirmed as a net
  // loss on a large, already-tight project: every relocated unit costs its
  // own small entry/return trampoline (wrapRelocatableGraphics) that plain
  // inline code in bank 1 doesn't pay, and that version moved EVERY graphics
  // unit out unconditionally, even the (usual) majority that never actually
  // needed to move - paying that overhead broadly enough to cost more room
  // than it freed, turning some builds that used to compile into failures.
  //
  // The proactive pre-pass below is deliberately narrower, to avoid
  // repeating exactly that mistake: it only moves anything when there's a
  // REAL, MEASURED reason to expect bank 1 won't fit - this project's own
  // last successful build's actual bank 1 capacity (useRomCapacity(), set
  // at the bottom of this function on every success), not a guess made up
  // before ever compiling once. It's skipped entirely whenever no such
  // measurement exists yet (a brand new project, or one whose ROM size just
  // changed - see setRomCapacity's own comment on why romSize has to match
  // exactly), which makes it a strict no-op the first time any given
  // project/ROM-size combination is ever built, same as before this change.
  // A generous 15% margin over that measured capacity (not a hair-trigger
  // "any excess at all") absorbs the size estimators' own known looseness
  // (see pickRelocationCandidate's callers - estimateEventSize/
  // estimateGraphicsUnitSize/etc. are source-length proxies, not compiled-
  // byte-accurate) without needing them to be exact, only roughly right.
  // Bounded to a handful of moves (not unbounded) so even a badly wrong
  // estimate can't relocate excessively before the real compile below gets
  // a chance to prove whether it was actually needed - and every unit moved
  // here still goes through setRelocationBank the exact same way a reactive
  // move does, so nothing about the retry loop right after this needs to
  // know or care whether a unit got there proactively or reactively.
  try {
    const proactiveConfig = configurationStorage.value || {};
    const proactiveMaxBanks = BANK_COUNT_BY_ROMSIZE[proactiveConfig.romSize];
    const lastCapacity = useRomCapacity().value;
    if (proactiveMaxBanks && lastCapacity && lastCapacity.bank1 &&
        lastCapacity.romSize === proactiveConfig.romSize) {
      // Needed so the size estimators below reflect THIS project's current
      // content - graphics/music unit keys and subroutine names are only
      // known after a real code-generation pass (same requirement
      // pickRelocationCandidate's own comment documents). The retry loop
      // right below regenerates again at attempt 0 regardless of whether
      // this pre-pass moved anything - a small, deliberate redundancy
      // that's cheap next to the real compile/assemble stages, traded for
      // never having to thread a cached code string through both places.
      regenerateCode();
      const threshold = lastCapacity.bank1.usableBytes * 1.15;
      const textMinikernelActive = BlocklyBB.isTextMinikernelActive();
      const reservedMusicBank = musicReservedBank(proactiveMaxBanks, textMinikernelActive);
      for (let i = 0; i < 8; i++) {
        const banks = getRelocationBanks();
        if (estimateBank1Total(banks) <= threshold) break;
        const candidate = pickRelocationCandidate(banks, !!reservedMusicBank);
        if (!candidate) break;
        const bank = candidate.kind === 'musicBanks' && reservedMusicBank ?
          reservedMusicBank :
          pickNextBank(banks, proactiveMaxBanks, textMinikernelActive,
              reservedMusicBank ? new Set([reservedMusicBank]) : null);
        if (!bank) break;
        // A "family" candidate (see computeFunctionFamilies) carries several
        // members that must all land in the SAME bank together - every
        // other candidate kind is really just a family of one, expressed
        // here as the same fallback the reactive retry loop below uses.
        (candidate.members || [{kind: candidate.kind, name: candidate.name}])
            .forEach(({kind, name}) => setRelocationBank(kind, name, bank));
        appendCompileLog(
            `Proactively relocating ${candidate.kind.replace('Banks', '')} "${candidate.name}" to bank ${bank} ` +
            '(estimated bank 1 content exceeds last known capacity).');
      }
    }
  } catch (proactiveErr) {
    // Never lets a mistake in this pre-pass block the real build - falls
    // through to the unchanged reactive loop below exactly as if this whole
    // pre-pass had been skipped, same as the "no prior measurement" case
    // above.
    appendCompileLog(`Proactive relocation pre-pass skipped: ${proactiveErr.message}`);
  }

  for (let attempt = 0; attempt <= MAX_RELOCATION_ATTEMPTS; attempt++) {
    // Every stage below is a synchronous, CPU-bound WASM run (see
    // bb-compiler.js's runWasi - wasi.start blocks until the module exits),
    // chained together with awaits on already-resolved/microtask promises -
    // none of which are real macrotasks, so the browser never gets a chance
    // to repaint or process input between them. A project that needs many
    // relocation attempts to converge (see MAX_RELOCATION_ATTEMPTS's own
    // comment) used to run all of them back-to-back with zero yields at
    // all, appearing as a total tab freeze for however long that took - up
    // to roughly a minute for the full 64-attempt budget, confirmed
    // directly (see the post-loop fallback's own comment below). A single
    // setTimeout(0) forces a real macrotask boundary here, letting the
    // compile log's own live updates actually paint and the tab stay
    // responsive between attempts, without changing anything about the
    // relocation logic itself.
    await new Promise((resolve) => setTimeout(resolve, 0));
    appendCompileLog(attempt === 0 ? 'Generating bBasic code...' :
      `Attempt ${attempt + 1}: generating bBasic code...`, 'stage');
    let code;
    try {
      code = regenerateCode();
      useGeneratedBasic().value = code;
    } catch (e) {
      appendCompileLog('Failed to generate bBasic code.', 'error');
      showError(errorStorage, 'Error while generating bBasic code', code, e);
      return false;
    }

    const config = configurationStorage.value || {};
    try {
      errorStorage.value = '';
      // The Text Minikernel's text12a.asm/text12b.asm need to sit next to
      // the source throughout the whole compile pipeline - see
      // text-minikernel-files.js and compileBatariBasicToAsm.
      const textMinikernelActive = BlocklyBB.isTextMinikernelActive();
      // Copied rather than used directly: getTextMinikernelSiblingFiles()
      // returns the same cached object every call, and this block below
      // mutates whatever ends up in siblingFiles['score_graphics.asm'] - doing
      // that in place used to corrupt the cache permanently (e.g. picking a
      // preset font once would leave that override stuck there forever,
      // masking the Text Minikernel's own extended file even after switching
      // back to Squish or to a different project).
      const siblingFiles = textMinikernelActive ? {...await getTextMinikernelSiblingFiles()} : {};
      // Hand-written .asm content generated during this same attempt's
      // regenerateCode() call above (player animation frame pointers, see
      // generateAnimations in generators/bbasic.js), added as sibling files
      // the exact same way text12a.asm/text12b.asm are - the music per-
      // channel gate check used to work the same way, but was reverted back
      // to plain bB (see generateMusicChecks' own comment) after this
      // "inline"-a-real-file mechanism was confirmed to break once relocated
      // to a bank other than 1.
      Object.assign(siblingFiles, BlocklyBB.playerAnimAsmFiles || {});
      // The compiler has no font support of its own, so point its score
      // digits at the selected font by overriding score_graphics.asm.
      // Squish is special (see utils/score-font.js/SQUISH_SCORE_FONT): it's
      // the Text Minikernel's own extended score_graphics.asm, already
      // placed above whenever the Text Minikernel is active, but selectable
      // on its own too, independent of whether the Text Minikernel is used -
      // combining it with one of the byte-swappable preset/custom fonts
      // isn't supported, so those are skipped whenever Squish is picked.
      if (config.scoreFont === SQUISH_SCORE_FONT) {
        if (!textMinikernelActive) siblingFiles['score_graphics.asm'] = await getExtendedScoreGraphics();
      } else {
        const scoreFontOverride = await buildScoreFontOverride(config.scoreFont);
        if (scoreFontOverride) siblingFiles['score_graphics.asm'] = scoreFontOverride;
      }
      // Passed to every stage below so each one's own real CLI invocation
      // (and, once it finishes, how long it took) appears live in the error
      // console, each on its own line - matches what running the actual
      // batari Basic toolchain locally would print.
      const log = (text) => appendCompileLog(text);
      appendCompileLog('Preprocessing...', 'stage');
      const preprocessed = await preprocessBatariBasic(code, log);
      appendCompileLog('Compiling to assembly...', 'stage');
      const compiled = patchSuperchipPfColorsPointer(
          await compileBatariBasicToAsm(preprocessed, siblingFiles, log), config);
      appendCompileLog('Assembling ROM...', 'stage');
      const compiledResult = await assembleBatariBasic(compiled.mainAsm, compiled.workDir, log);
      Javatari.fileLoader.loadFromContent('main.bin', compiledResult.output);
      forceJavatariNtsc();
      setJavatariKeypadMode(!!(BlocklyBB.keypad0Used || BlocklyBB.keypad1Used));

      // TODO: Implement this without a global variable
      Javatari.compiledResult = compiledResult;
      markRomUpToDate();
      const capacity = computeRomCapacity(compiledResult);
      const maxBanks = BANK_COUNT_BY_ROMSIZE[config.romSize];
      // romSize is stored alongside the measurement (not just the bank
      // contents) so a LATER build's own proactive relocation pre-pass (see
      // its own comment near the top of this function) can confirm this
      // capacity was actually measured under the SAME ROM size before
      // trusting it - bank 1's own usable-byte boundary genuinely differs
      // between a bankswitched and non-bankswitched build (only bankswitched
      // sizes pay for the hotspot-detection trampoline at all), so a cached
      // measurement from a since-changed ROM size would misinform rather
      // than help.
      setRomCapacity(capacity ?
        {...capacity, romSize: config.romSize,
          bankContents: maxBanks ? computeBankContents(maxBanks, textMinikernelActive) : undefined,
          variableUsage: computeVariableUsage()} :
        capacity);
      // Remembers THIS build's own final layout as the next build's own
      // first-attempt hint (see seedRelocationBanksFromLastSuccess's own
      // comment in relocation-banks.js) - recorded on every success, not
      // just ones that needed relocation at all, so a project that fits in
      // bank 1 alone keeps skipping straight to a real compile too (an empty
      // banks object is itself a perfectly valid, useful "hint").
      recordSuccessfulRelocationBanks(config.romSize);
      appendCompileLog('Build succeeded.', 'stage');
      appendCompileLog(`Total build time: ${Math.round(performance.now() - buildStartedAt)}ms.`, 'stage');
      return true;
    } catch (e) {
      lastCode = code;
      lastFailure = e;
      // The seeded first attempt (see seedRelocationBanksFromLastSuccess
      // above) didn't pan out - abandon it completely rather than patching
      // further on top of it, so every attempt from here on behaves
      // identically to how this retry loop has always worked (see this
      // block's own git history/comments below), starting from true
      // scratch exactly like a never-seeded build's own first failure would.
      if (attempt === 0 && seededFromLastSuccess) resetRelocationBanks();
      const maxBanks = BANK_COUNT_BY_ROMSIZE[config.romSize];
      if (isOverflowError(e) && maxBanks) {
        // Diagnostic-only for now (see bb-compiler.js's own comment on
        // partialOutput/partialSymbolmap) - not read by anything below yet.
        // DASM writes its symbol table incrementally as it assembles, so an
        // overflow caught partway through a LATER bank can still leave an
        // earlier bank's own boundary-adjacent symbols (e.g. "scoretable")
        // resolved and usable; whether that holds for the bank that
        // actually overflowed is exactly what this is here to find out,
        // logged so a real overflow during normal use surfaces the answer
        // without needing a separate investigation session. Wrapped in a
        // try/catch since computeRomCapacity assumes a well-formed binary/
        // symbol table that a partial, overflowed assembly may not actually
        // have - a failure here must never break the real relocation retry
        // below, only skip logging.
        if (e.partialSymbolmap) {
          try {
            const partialCapacity = computeRomCapacity({output: e.partialOutput, symbolmap: e.partialSymbolmap});
            appendCompileLog(partialCapacity ?
              `[diagnostic] Partial capacity on overflow - bank 1 free: ${partialCapacity.bank1.freeBytes}b, ` +
              `per-bank free: ${partialCapacity.perBank.map((b) => b.freeBytes).join(', ')}` :
              '[diagnostic] Partial symbol table present but computeRomCapacity returned null ' +
              '(no "scoretable" symbol, or bank size mismatch).');
          } catch (diagErr) {
            appendCompileLog(`[diagnostic] computeRomCapacity threw on partial data: ${diagErr.message}`);
          }
        } else {
          appendCompileLog('[diagnostic] No partial symbol table available on this overflow.');
        }
        const textMinikernelActive = BlocklyBB.isTextMinikernelActive();
        const reservedMusicBank = musicReservedBank(maxBanks, textMinikernelActive);
        const banks = getRelocationBanks();
        let candidate = pickRelocationCandidate(banks, !!reservedMusicBank);
        let bank = candidate && (
          candidate.kind === 'musicBanks' && reservedMusicBank ?
            reservedMusicBank :
            pickNextBank(banks, maxBanks, textMinikernelActive,
                reservedMusicBank ? new Set([reservedMusicBank]) : null));

        // Fallback for when nothing is left in bank 1 to relocate, but some
        // OTHER bank turns out to be too full too - the one case
        // pickRelocationCandidate structurally can't handle on its own,
        // since it only ever looks at units still sitting in bank 1.
        //
        // Systematically empties out ONE bank at a time (stuckBank, chosen
        // once and then held onto across attempts - see its own comment
        // above), moving its LARGEST still-untried occupant elsewhere on
        // each attempt, rather than re-guessing which bank and which unit
        // fresh every time. DASM only ever reports ONE overflowing segment
        // at a time, with no way to confirm from its error message alone
        // WHICH bank that is, let alone which of its several occupants is
        // actually responsible - re-deriving both from scratch every single
        // attempt (an earlier version of this) meant each guess almost
        // always landed on something innocent (whatever the PREVIOUS wrong
        // guess had just moved), never converging on the real cause.
        // Confirmed directly against a real project: first an unused event
        // (its own generated body is nearly empty), then a small animation,
        // each cycled through every bank and failed in all of them, while
        // the project's total content provably fit in a single 4096-byte
        // bank moments earlier - nowhere near enough content to fill five
        // others, so neither one was ever really the problem.
        //
        // Once every occupant of stuckBank has been tried elsewhere without
        // fixing anything, it's dropped so the NEXT failure picks a fresh
        // target instead of looping on a bank that was never really the
        // problem. Bounded by retriedBanksByUnit (at most maxBanks - 1
        // attempts per unit) and stuckBankTriedUnits (each occupant of a
        // given stuckBank only ever tried once), so this can't loop any
        // longer than MAX_RELOCATION_ATTEMPTS already allows for.
        // Bounded to a handful of tries (not just one) within THIS same
        // attempt: if stuckBank turns out fully exhausted (every occupant
        // already tried elsewhere), it's dropped and re-derived from
        // scratch immediately, rather than giving up on the whole build
        // right there - a freshly re-derived stuckBank always has at least
        // the just-relocated unit as an untried occupant, so this only ever
        // needs to retry a small, fixed number of times before either
        // finding a candidate or genuinely running out of banks (the outer
        // MAX_RELOCATION_ATTEMPTS is what actually bounds total build time).
        if (!candidate && relocatedThisBuild.length) {
          const estimateSize = (kind, name) => (
            kind === 'eventBanks' ? BlocklyBB.estimateEventSize(name) :
            kind === 'graphicsBanks' ? BlocklyBB.estimateGraphicsUnitSize(name) :
            kind === 'musicBanks' ? BlocklyBB.estimateMusicUnitSize(name) :
            kind === 'functionBanks' ? BlocklyBB.estimateFunctionSize(name) :
            BlocklyBB.estimateSubroutineSize(name)
          );
          // A function or function_call_statement wrapper subroutine can
          // never be picked as a co-resident on its own here - see
          // computeFunctionFamilies' own comment: it has no bank-tag syntax
          // of its own, so it can only ever move together with the rest of
          // its family. Resolved once per rederive (not per member found
          // below) since it's cheap and this fallback path is already rare.
          const wrapperNames = BlocklyBB.functionCallWrapperNames || new Set();
          const functionFamilies = computeFunctionFamilies();
          const familyForMember = (kind, name) => functionFamilies.find(
              ({members}) => members.some((m) => m.kind === kind && m.name === name));
          const familyUnitKey = (members) =>
            `family:${members.map((m) => `${m.kind}:${m.name}`).sort().join('|')}`;

          for (let rederive = 0; !candidate && rederive < maxBanks; rederive++) {
            if (stuckBank === null) {
              // The bank a relocation actually landed in is already recorded
              // directly on its own relocatedThisBuild entry - no need to
              // look it back up through banks[kind][name], which (unlike
              // "bank" here) has no sensible meaning for a multi-member
              // family's own synthetic "family" kind.
              stuckBank = relocatedThisBuild[relocatedThisBuild.length - 1].bank;
            }
            if (!stuckBank || stuckBank === 1) break;

            const coResidents = [];
            const addedFamilyKeys = new Set();
            ['eventBanks', 'graphicsBanks', 'musicBanks', 'subroutineBanks', 'functionBanks'].forEach((kind) => {
              Object.entries(banks[kind] || {}).forEach(([name, unitBank]) => {
                if (unitBank !== stuckBank) return;
                const isWrapper = kind === 'subroutineBanks' && wrapperNames.has(name);
                if (kind === 'functionBanks' || isWrapper) {
                  const family = familyForMember(kind, name);
                  const members = family ? family.members : [{kind, name}];
                  const unitKey2 = familyUnitKey(members);
                  if (stuckBankTriedUnits.has(unitKey2) || addedFamilyKeys.has(unitKey2)) return;
                  addedFamilyKeys.add(unitKey2);
                  coResidents.push({
                    kind: 'family',
                    name: members.map((m) => m.name).join(', '),
                    size: estimateFamilySize(members),
                    members,
                    unitKey: unitKey2,
                  });
                  return;
                }
                const unitKey2 = `${kind}:${name}`;
                if (!stuckBankTriedUnits.has(unitKey2)) {
                  coResidents.push({kind, name, size: estimateSize(kind, name), unitKey: unitKey2});
                }
              });
            });
            coResidents.sort((a, b) => b.size - a.size);
            const next = coResidents[0];
            if (!next) {
              // Every occupant of this bank has already been tried
              // elsewhere without fixing anything - it probably isn't the
              // real problem. Drop it and loop around to derive a fresh
              // target instead.
              stuckBank = null;
              stuckBankTriedUnits.clear();
              continue;
            }

            stuckBankTriedUnits.add(next.unitKey);
            const unitKey = next.unitKey;
            if (!retriedBanksByUnit.has(unitKey)) retriedBanksByUnit.set(unitKey, new Set());
            const triedBanks = retriedBanksByUnit.get(unitKey);
            triedBanks.add(stuckBank);
            // A music unit always goes straight back to its own reserved
            // bank (same rule the primary candidate path above enforces) -
            // never left to the generic pool below, which would otherwise
            // let it land anywhere, including a bank shared with unrelated
            // graphics/event/subroutine content it's meant to have entirely
            // to itself. Also excluded from the generic pool given TO
            // non-music units, for the same reason in reverse - confirmed
            // directly as a real bug: without this, this fallback (unlike
            // the primary path) could dump ordinary content into the bank
            // reserved for music, or bounce music itself through several
            // unrelated banks before ever reaching its real one.
            if (next.kind === 'musicBanks' && reservedMusicBank && !triedBanks.has(reservedMusicBank)) {
              candidate = {kind: next.kind, name: next.name};
              bank = reservedMusicBank;
            } else if (next.kind !== 'musicBanks') {
              // Balanced by current occupancy (same as pickNextBank's own
              // primary use above), not just "lowest untried bank number" -
              // confirmed directly as a real bug: the untried-lowest-number
              // version piled the vast majority of a project's content into
              // bank 2 while later banks sat completely empty, since once
              // bank 1's own "still there" candidates run out (which happens
              // within the first few attempts), nearly every relocation for
              // the rest of the build goes through this exact fallback path.
              // Every bank already tried for THIS unit (triedBanks, which
              // already includes stuckBank - added a few lines above) is a
              // HARD exclusion, not a soft penalty - see pickNextBank's own
              // comment for why a softer version of this (letting a
              // previously-tried bank stay pickable, just deprioritized)
              // caused a different real bug, a unit oscillating forever
              // between the same two equally-penalized banks.
              const excludeBanks = new Set([reservedMusicBank, ...triedBanks].filter(Boolean));
              let nextBank = pickNextBank(banks, maxBanks, textMinikernelActive, excludeBanks);
              // Every available bank has now been tried for this ONE unit
              // (not the whole build - see the outer stuckBank exhaustion
              // check above, a separate case) - rather than give up on it
              // for the rest of the build the way a permanent hard exclusion
              // would, its own tried-set is reset here and it gets one more
              // fresh attempt (still never straight back to stuckBank
              // itself, the one place a move is guaranteed to be a no-op).
              // A bank that didn't fit this unit alongside 40 attempts' worth
              // of OTHER since-moved content may well fit it now that
              // everything around it has changed.
              if (!nextBank) {
                triedBanks.clear();
                triedBanks.add(stuckBank);
                nextBank = pickNextBank(banks, maxBanks, textMinikernelActive,
                    new Set([reservedMusicBank, stuckBank].filter(Boolean)));
              }
              if (nextBank) {
                candidate = {kind: next.kind, name: next.name, members: next.members};
                bank = nextBank;
              }
            }
          }
        }

        if (candidate && bank) {
          // Same "family moves as one unit" expansion as the proactive
          // pre-pass above.
          (candidate.members || [{kind: candidate.kind, name: candidate.name}])
              .forEach(({kind, name}) => setRelocationBank(kind, name, bank));
          relocatedThisBuild.push({kind: candidate.kind, name: candidate.name, bank, members: candidate.members});
          // Not an 'error'-level entry - an overflow here is an expected,
          // automatically-handled part of the relocation retry loop, not a
          // real problem the user needs to act on (see isOverflowError's own
          // comment); only a failure that survives every retry (below) is
          // shown in red.
          appendCompileLog(
              `Bank overflow - relocating ${candidate.kind.replace('Banks', '')} "${candidate.name}" to bank ${bank}, retrying...`);
          continue;
        }
      }
      appendCompileLog('Build failed.', 'error');
      // Appended so a failure can be fully diagnosed from just the copy-pasted
      // error banner text - same info someone would otherwise have to open
      // devtools and read hooks/relocation-banks.js's in-memory state to get.
      // relocatedThisBuild is this build's own history (what got moved where,
      // in order) - empty means the very first compile attempt already
      // failed and nothing was even tried yet.
      const diagnostics = {
        ...getRelocationBanks(),
        relocatedThisBuild,
        // Which unit keys the relocator can currently see at all - e.g. an
        // empty "music" array despite a music_play_song block existing in
        // the project means resolveProjectMusic returned null this build
        // (muted audio, or no song actually referenced), not that music
        // failed to relocate.
        debugUnitKeys: {
          graphics: BlocklyBB.getGraphicsUnitKeys(),
          music: BlocklyBB.getMusicUnitKeys(),
          subroutines: BlocklyBB.getSubroutineNames(),
          functions: BlocklyBB.getFunctionNames(),
        },
      };
      const annotatedError = new Error(
          `${e.message}\n\nBank assignments at failure:\n${JSON.stringify(diagnostics, null, 2)}`);
      showError(errorStorage, 'Error while compiling bBasic code', code, annotatedError);
      return false;
    }
  }
  // Reached only if every single attempt up to MAX_RELOCATION_ATTEMPTS kept
  // finding SOME new combination worth trying (see the retry loop's own
  // comment) without ever actually succeeding - i.e. genuine exhaustion of
  // the attempt budget itself, not the "nothing left to try" case the loop
  // above already reports on its own (that one returns straight from inside
  // the loop, never reaching here). Without this, a project stuck this way
  // silently returned false with NOTHING shown at all - confirmed directly:
  // the error banner stayed completely empty after a build spent about a
  // minute (all 64 real, blocking compile attempts) failing over and over.
  const diagnostics = {
    ...getRelocationBanks(),
    relocatedThisBuild,
    debugUnitKeys: {
      graphics: BlocklyBB.getGraphicsUnitKeys(),
      music: BlocklyBB.getMusicUnitKeys(),
      subroutines: BlocklyBB.getSubroutineNames(),
    },
  };
  appendCompileLog('Build failed.', 'error');
  showError(errorStorage, 'Error while compiling bBasic code', lastCode,
      new Error(`${(lastFailure && lastFailure.message) || 'Ran out of relocation attempts.'}\n\n` +
        `Gave up after trying ${MAX_RELOCATION_ATTEMPTS} different bank combinations without finding one ` +
        `that compiles.\n\nBank assignments at failure:\n${JSON.stringify(diagnostics, null, 2)}`));
  return false;
};
