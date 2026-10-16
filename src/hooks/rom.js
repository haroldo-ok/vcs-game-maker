'use strict';

import {superchipOn} from '../utils/superchip';
import {shareIdenticalPlayerData} from '../utils/dpc-share-data';
import {expandDpcPlusTiles} from '../utils/dpc-tile';
import {shareDpcPlusPlayerSource, aliasSharedPlayerData} from '../utils/dpc-share-source';
import {dpcPlusRamUsage} from '../utils/dpc-ram-usage';
import Vue from 'vue';
import VueCompositionApi, {ref} from '@vue/composition-api';

import Blockly from 'blockly';
import {preprocessBatariBasic, compileBatariBasicToAsm, assembleBatariBasic} from './bb-compiler';

import '../blocks';
import BlocklyBB, {RELOCATABLE_EVENT_NAMES, SYSTEM_VARIABLES} from '../generators/bbasic';
import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {getFastMathSiblingFiles, fastMathOn} from '../utils/fast-math';
import {getDpcPlusProgramSiblingFile} from '../utils/dpc-program';
import {getDpcPlusNoScoreSiblingFiles} from '../utils/dpc-noscore';
import {getDpcPlusSquishSiblingFiles} from '../utils/dpc-squish';
import {getDpcPlusAudioSiblingFiles} from '../generators/bbasic/dpcplus-audio';
import {getExtendedScoreGraphics, getTextMinikernelSiblingFiles, getDpcPlusTextMinikernelSiblingFiles,
  dpcPlusTextScreenLines} from '../generators/bbasic/text-minikernel-files';
import {getTitleScreenSiblingFiles} from '../generators/bbasic/titlescreen-files';
import {TITLE_SCREEN_SUBROUTINE_NAME, estimateTitleScreenGraphicsBytes} from '../generators/bbasic/titlescreen';
import {titleScreenAnyPageOverRowBudget} from '../blocks/titlescreen';
import {effectiveBackgroundRows, processBackgroundStorageDefaults} from '../blocks/background';
import {pfRowDivisorFor} from '../utils/playfield-coords';
import {findSongById} from '../blocks/music';
import {buildScoreFontOverride, scoreFontIsEdited, SQUISH_SCORE_FONT, SQUISH_CUSTOM_SCORE_FONT} from '../utils/score-font';
import {buildTextFontOverride, buildTextScrollCursorOverride, buildTextRow2ColorOverride,
  packCursorGlyphByte, processCursorGlyphDefaults, resolveBlinkMask} from '../utils/text-font';
import {textLinesMaxVarName, textLinesBaseVarName, textRow2ColorVarName,
  textScrollCursorColorVarName, textEndIconColorVarName} from '../generators/bbasic/text-minikernel';
import {showError} from '../utils/build-error';
import {emulatorTvSpec} from '../utils/tv-standard';
import {computeRomCapacity} from '../utils/rom-capacity';
import {useGeneratedBasic} from './generated';
import {appendCompileLog, clearCompileLog, useBackgroundsStorage, useConfigurationStorage, useErrorStorage,
  usePlayerAnimationsStorage, useTextFontStorage, useTextStringsStorage, useTitleScreenStorage,
  useWorkspaceStorage} from './project';
import {getRelocationBanks, resetRelocationBanks, setRelocationBank,
  recordSuccessfulRelocationBanks, seedRelocationBanksFromLastSuccess} from './relocation-banks';
import {markRomUpToDate, markRomOutdated, useRomOutdated, useHasCompiledRom,
  useCompiledRomBytes, setCompiledRomBytes, recordLoadedRomForRecovery, useLastBuildScreenshot} from './rom-status';
import {captureEmulatorScreenshot} from '../utils/emulator-screenshot';
import {CHAR_TO_GLYPH, TEXT_MESSAGE_LENGTH} from '../blocks/text-strings';
import {withGopher2600, setEmulatorPaused} from './emulator';
import {setRomCapacity, useRomCapacity} from './rom-capacity';
import {setDebugVariables, collectDebugVariables} from './debug-symbols';

Vue.use(VueCompositionApi);

export {markRomOutdated, useRomOutdated, useRomCapacity, useHasCompiledRom, useCompiledRomBytes};

const EMPTY_WORKSPACE = '<xml xmlns="https://developers.google.com/blockly/xml"/>';

// Whether ANY build - a real one (buildRom) or a title-screen preview
// (buildTitleScreenPreviewRom) - is currently running. Both funnel their
// actual work through Blockly.BBasic, a single module-level singleton
// object that workspaceToCode()/init() read and write a large amount of
// per-build scratch state onto (nameDB_, titleScreenAnimationChecks,
// relocation banks, etc.) - each individual build is internally self-
// consistent (everything gets reset/reassigned fresh at the start of its
// its call to workspaceToCode()), but two builds interleaved via overlapping
// awaits (this WASM-backed pipeline yields to the event loop between
// preprocess/compile/assemble stages - see bb-compiler.js) could each read
// and write that SAME shared object mid-build, confirmed directly as a real
// bug: clicking a title screen's Play button and then Update ROM shortly
// after produced a corrupted assembly (a variable referenced but never
// declared) that neither build alone would ever produce. Exported so
// both App.vue's "Update ROM" button and TitleScreenEditor.vue's Play
// button can disable themselves while the OTHER kind of build is running,
// on top of the hard guard each function below already has.
const buildInProgress = ref(false);
export const useBuildInProgress = () => buildInProgress;

// Loads the stored workspace headlessly (so this works from any tab, not
// just the editor) and runs it through the given callback, disposing it
// afterwards either way. xmlOverride (optional) skips storage entirely and
// builds the headless workspace from this XML text instead - used by
// buildTitleScreenPreviewRom below to compile a small synthetic program
// (rather than the project's real Actions-tab workspace) without ever
// touching the real one on screen.
const withHeadlessWorkspace = (callback, xmlOverride) => {
  const xmlText = xmlOverride !== undefined ? xmlOverride : useWorkspaceStorage().value;
  const workspace = new Blockly.Workspace();
  try {
    // Blockly.Xml.textToDom moved to Blockly.utils.xml.textToDom somewhere
    // between Blockly 8 and 10 - confirmed directly against the installed
    // package's xml.d.ts files (gone from core/xml.d.ts, now only declared
    // in core/utils/xml.d.ts). domToWorkspace's argument order is
    // unaffected here - (dom, workspace) already matches the installed
    // package's real signature, confirmed directly against core/xml.d.ts.
    const dom = Blockly.utils.xml.textToDom(
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
const regenerateCode = (xmlOverride) =>
  withHeadlessWorkspace((workspace) => BlocklyBB.workspaceToCode(workspace), xmlOverride);

// How many letter-pool slots the current project would actually need if
// Superchip RAM were off - used by Configuration.vue to check whether
// disabling it would leave too few letters free. Deliberately NOT just
// Blockly.Variables.allUsedVarModels(workspace).length (pure user-created
// variables) - with Superchip on, every app-internal dev var (missile fire's
// fired-direction/speed, seek's  target/throttle state, background
// fade timers, etc. - see generators/bbasic.js's  routeDevVar) is ALSO
// routed through the very same 26-letter pool the instant Superchip goes
// off, competing with user variables for the exact same slots. Counting only
// user variables against the FULL letter pool undercounted real pressure
// whenever a project leaned on dev-var-heavy features but few explicit
// variables - letting "disable Superchip" through here even though the real
// build (bbasic.js's "Too many variables" throw) would then fail. A real
// headless compile (same as regenerateCode above) is run so
// letterVarsUsed/superchipVarsUsed reflect this exact project's actual
// dev-var + user-var total (see bbasic.js's  routeDevVar/init() comments
// on how those two fields get set) - their SUM is exactly what would need to
// fit in the letter pool alone once Superchip stops splitting that load with
// the Superchip var pool.
export const countUsedVariables = () =>
  withHeadlessWorkspace((workspace) => {
    BlocklyBB.workspaceToCode(workspace);
    return (BlocklyBB.letterVarsUsed || 0) + (BlocklyBB.superchipVarsUsed || 0) + (BlocklyBB.dpcPlusVarsUsed || 0);
  });

// Whether the project needs "playercolors" (player0's  per-row sprite
// color kernel option) - either a real sprite_player_rainbow_colors block
// (PLAYER field set to Player 0) on the canvas, or the standing "Enable
// per-row Player 0 sprite colors"
// toggle (see useSpriteColorsFor in generators/bbasic.js) - needed by
// Configuration.vue to force "Show blank lines" AND the Player 1 sprite
// colors toggle back on (disabling both) whenever either is active. See
// generators/bbasic.js's effectiveShowBlankLines for the "Show blank lines"
// half of that: batari Basic's  kernel_options combination table never
// pairs "playercolors" with "no_blank_lines" in any valid row, confirmed by
// a real "Invalid combination of options" build failure when both were
// emitted together - and generateConfiguration's  comment for the
// "player1colors" half: playercolors is never valid without it either.
export const usesPlayer0RainbowColors = () => {
  const configurationStorage = useConfigurationStorage();
  const config = (configurationStorage && configurationStorage.value) || {};
  if (config.enablePlayer0SpriteColors) return true;
  return withHeadlessWorkspace((workspace) =>
    workspace.getAllBlocks(false).some((block) =>
      block.type === 'sprite_player_rainbow_colors' && block.getFieldValue('PLAYER') === '0' &&
      block.isEnabled()));
};


// "segment overflow" is DASM's plain "ran out of room in this bank"
// message. "Origin Reverse-indexed" is a second, differently-worded DASM
// error also seen from an over-full bank - not confirmed to be tied to any
// particular ROM setting, just observed alongside overflow-shaped symptoms
// (it went away once the same content shrank, with nothing else changed).
// Treated the same way as a plain overflow so the retry loop below gets a
// chance to relocate something and try a different bank, rather than
// surfacing it as an unrelocatable error immediately. Anything else is a
// genuine problem in the user's  project that auto-relocating an event
// would only obscure, so it's surfaced immediately instead.
//
// A THIRD overflow shape, confirmed directly against a real build (Superchip
// RAM + a pfres above the standard 12 + a bankswitched ROM size above 8k -
// none of those three alone reproduces it, only all three together):
// bank 1 overflowing its RORG'd segment in a way DASM doesn't report as a
// clean "segment overflow" at all - instead its  two-pass symbol
// resolution desyncs, and it cascades into "Unknown Mnemonic" errors on
// dozens of unrelated lines throughout the rest of the file, none of which
// the user's  project touches (stock runtime labels like the bankswitch
// trampoline itself, or the score digit table). The one consistent, safe-
// to-match signature across every reproduction of this: DASM can no longer
// resolve "BS_jsr"/"BS_return", the bankswitch call/return trampoline's
// labels - a user's  project can never reference those directly (they're
// pure DASM-internal symbols emitted by the "gosub"/"return" macros), so
// this is unambiguous evidence of the same "bank 1 doesn't fit" condition
// as a plain segment overflow, just reported unrecognizably. Whichever unit
// the retry loop picks to relocate next also shrinks bank 1 by the same
// amount either way, so no separate handling is needed once caught here -
// it just needs to be recognized as "try relocating" instead of surfacing
// the cascade directly.
const isOverflowError = (e) => /segment overflow|origin reverse-indexed|Unknown Mnemonic 'jmp BS_(jsr|return)'/i
    .test((e && e.message) || '');

// Frames with the same rows, on any players, are stored once (see utils/dpc-share-data.js).
const shareDpcPlusPlayerData = (compiled, config) => {
  if (!config || config.kernel !== 'dpcplus') return;
  // The scrolling backgrounds keep one repeat of their rows, and the rest is copied in when they load.
  const tiles = expandDpcPlusTiles(compiled.mainAsm);
  compiled.mainAsm = tiles.asm;
  const markers = (compiled.mainAsm.match(/^\.?_dpctile_\d+_\d+_\d+_[pcb]+\s*$/gm) || []).length;
  if (markers !== tiles.expanded) {
    appendCompileLog('A scrolling background could not have its repeated rows filled in: its data statements were not found.', 'error');
  }
  // The repeats the source cut out are names for the first copy's data; any other identical block is shared too.
  const aliases = aliasSharedPlayerData(compiled.mainAsm);
  compiled.mainAsm = aliases.asm;
  const {asm, saved} = shareIdenticalPlayerData(compiled.mainAsm);
  compiled.mainAsm = asm;
  if (saved || aliases.aliased) {
    appendCompileLog(`Shared the sprite graphics and colors that repeat (${aliases.aliased} frames pointed at an earlier copy).`);
  }
};

// The DPC+ kernel keeps every graphic of the project in a single bank (the player frames and their color rows, the playfield
// rows and the row color tables), and nothing moves out of it, so relocating events or graphics to other banks cannot help.
const isDpcPlusGraphicsOverflow = (e) => isOverflowError(e) && /DPC_graphics_end/.test((e && e.message) || '');

// Appended to the end of a build-failure error whenever it's an overflow
// (see isOverflowError above) that the relocation retry loop either had no
// bank left to try, or burned through its whole MAX_RELOCATION_ATTEMPTS
// budget without ever succeeding - both mean the project's content
// genuinely doesn't fit in the ROM size currently configured, not a
// transient/relocatable overflow. Named with the actual configured size
// (config.romSize, e.g. "4k") rather than a generic "doesn't fit" message,
// so this is immediately actionable without the user having to go check
// the Configuration tab themselves to find out what's even selected.
const romSizeOverflowHint = (e, config) => {
  if (!isOverflowError(e)) return '';
  if (isDpcPlusGraphicsOverflow(e)) {
    return `

The DPC+ graphics bank is full. It holds every player's frames and color rows (a frame costs twice its height in ` +
      `bytes with colors), the playfield (a background that scrolls is stored as 255 rows, 4 bytes each) and the row color ` +
      `tables, and a larger ROM size doesn't add to it. Use fewer or shorter frames and animations, or fewer players.`;
  }
  return `\n\nThis project may be too large to fit in the configured ROM size ` +
    `(${(config && config.romSize) || '4k'}) - try a larger ROM size on the Configuration tab.`;
};

// Every title screen's combined graphics (see generators/bbasic/titlescreen.js's
// registerTitleScreenSubroutine) compile into ONE subroutine, which - unlike
// ordinary relocatable content - needs a bank fully to itself (the
// Titlescreen Kernel's documentation: "make sure the minikernel has the
// bank fully to itself"). That means an overflow caused by too much title
// screen data can never be fixed by relocating things to different banks -
// no bank is any bigger than any other - so the real build's 64-attempt
// relocation retry loop below would otherwise burn through its whole budget
// (confirmed to take about a minute) before giving up with a generic "gave
// up after trying 64 combinations" message that never mentions title
// screens at all. Surfaced only as a hint alongside the real DASM error
// (never in place of it, and never used to skip/short-circuit a build) -
// estimateTitleScreenGraphicsBytes is only a fallback here - whenever the
// failed compile left a usable partial symbol table (e.partialSymbolmap,
// see bb-compiler.js's assemble()), computeRomCapacity reads the REAL
// assembled bytes for the title screen's bank straight from that failed
// attempt instead - the actual total (graphics data AND the kernel/driver
// code sharing the same bank), not an estimate. That real number is also
// logged as a dedicated bold compile-log line (not just folded into the
// plain-text error banner below), so it stands out as the one concrete fact
// pointing at what's actually filling up the bank. Deliberately talks in
// ROM BYTES, not the Title tab's "~85/170 rows" help text - that number is
// a completely different, per-PAGE budget (how many TV scanlines ONE page
// takes to draw, unaffected by an animated card's OTHER frames or by other
// pages), and reusing it here for a ROM STORAGE problem (every frame on
// every page, whether currently visible or not) was confirmed directly as
// misleading - a project can legitimately need far more than "85 rows" of
// stored graphics data while every individual page still draws in time.
// Rough, but not dependent on any particular build having already run or
// left usable partial diagnostic data (unlike the real usedBytes/totalBytes
// path below, which needs a failed compile's partial DASM symbol table to
// exist AND be usable - confirmed directly as unreliable for exactly the
// overflow case this hint exists for: a bank that fails deep inside the
// title screen kernel's content can abort before DASM ever resolves a
// usable "scoretable" symbol for that bank at all). titleScreenUsedKernelKeys
// (set by registerTitleScreenSubroutine during code GENERATION, which
// already succeeded by the time an ASSEMBLY-stage overflow like this is
// caught) says exactly which minikernel copies are actually compiled in -
// each is a separate #ifconst-included file with its real code,
// on top of the driver's fixed vsync/vblank/overscan/playfield boilerplate
// every title screen pays regardless of card count.
const TITLE_SCREEN_DRIVER_CODE_BYTES = 300;
// Per-copy code size genuinely differs by graphic type (public/bb19/
// titlescreen/*_kernel.asm) - 96x2 pushes twice the pixel columns through
// the same per-scanline draw loop as 48x1/48x2, and needs its
// row-color table logic 48x1 skips entirely, so a single flat estimate
// for every type under- or over-counted depending on which types a
// project actually used. Approximate (still no way to know the REAL
// assembled size without a compile - see this function's caller's
// comment), scaled from each type's real combined source line count
// (48x1: 158 lines across its 1/X files, 48x2: 199, 96x2: 259 self-
// contained) against the previous flat 150 baseline (kept as 48x2's
// number, since it sits in the middle).
const TITLE_SCREEN_PER_KERNEL_COPY_CODE_BYTES_BY_TYPE = {
  '48x1': 120,
  '48x2': 150,
  '96x2': 195,
};
const DEFAULT_PER_KERNEL_COPY_CODE_BYTES = 150;
const estimateTitleScreenKernelCodeBytes = () => {
  const usedKeys = BlocklyBB.titleScreenUsedKernelKeys;
  if (!usedKeys) return TITLE_SCREEN_DRIVER_CODE_BYTES;
  let bytes = TITLE_SCREEN_DRIVER_CODE_BYTES;
  usedKeys.forEach((key) => {
    // Strips the "_N" kernel-copy slot suffix (e.g. "96x2_3" -> "96x2") -
    // see assignKernelSlots' `${card.type}_${slot}` key format.
    const type = key.replace(/_\d+$/, '');
    bytes += TITLE_SCREEN_PER_KERNEL_COPY_CODE_BYTES_BY_TYPE[type] ?? DEFAULT_PER_KERNEL_COPY_CODE_BYTES;
  });
  return bytes;
};

// Every title screen's combined graphics (see generators/bbasic/titlescreen.js's
// registerTitleScreenSubroutine) compile into ONE subroutine, which - unlike
// ordinary relocatable content - needs a bank fully to itself (the
// Titlescreen Kernel's documentation: "make sure the minikernel has the
// bank fully to itself"). That means an overflow caused by too much title
// screen data can never be fixed by relocating things to different banks -
// no bank is any bigger than any other - so the real build's 64-attempt
// relocation retry loop below would otherwise burn through its whole budget
// (confirmed to take about a minute) before giving up with a generic "gave
// up after trying 64 combinations" message that never mentions title
// screens at all. Surfaced only as a hint alongside the real DASM error
// (never in place of it, and never used to skip/short-circuit a build).
// Prefers the REAL assembled bytes for the title screen's bank (graphics
// AND kernel code together) whenever the failed compile left a usable
// partial DASM symbol table (see bb-compiler.js's assemble()); falls back
// to estimateTitleScreenGraphicsBytes + estimateTitleScreenKernelCodeBytes
// otherwise, clearly labeled as an estimate rather than presented as exact.
// Deliberately talks in ROM BYTES, not the Title tab's "~85/170 rows" help
// text - that number is a completely different, per-PAGE budget (how many
// TV scanlines ONE page takes to draw, unaffected by an animated card's
// OTHER frames or by other pages), and reusing it here for a ROM STORAGE
// problem (every frame on every page, whether currently visible or not)
// was confirmed directly as misleading - a project can legitimately need
// far more than "85 rows" of stored graphics data while every individual
// page still draws in time.
// Returns {text, highlight}: text is the plain-text paragraph appended to
// the error banner's <pre> (see showError - safe by default, escaped),
// highlight is a short, bold HTML snippet (built only from this function's
// plain numbers, never from e/project data) rendered separately above
// it via showError's highlightHtml param and useErrorBannerHighlight - a
// plain <pre v-text> can't render inline <b> itself, confirmed directly as
// why an earlier version of this (the bytes count folded into the plain
// text alone) never actually appeared bold in the error banner, only in
// the compile log line below returns '' for text when there's nothing to
// say (see the early return just below) - always paired with an empty
// highlight too, callers pass both together.
const titleScreenOverflowHint = (e) => {
  // Nothing to say if the project has no title screen content at all - a
  // plain kernel driver overhead number would wrongly imply the title
  // screen is even relevant to an unrelated overflow.
  if (!BlocklyBB.titleScreenUsedKernelKeys || !BlocklyBB.titleScreenUsedKernelKeys.size) {
    return {text: '', highlight: ''};
  }
  const bank = (getRelocationBanks().subroutineBanks || {})[TITLE_SCREEN_SUBROUTINE_NAME] || 1;
  // Only worth bringing up when a page is ACTUALLY over that separate
  // draw-time budget - otherwise every ROM storage overflow would wrongly
  // imply the rows guidance was violated too, when a project can easily
  // need far more than "85 rows" of stored graphics (many frames, many
  // pages) while every individual page still draws well within budget.
  const rowsClause = titleScreenAnyPageOverRowBudget(useTitleScreenStorage()) ?
    ` This is separate from the Title tab's "~85/170 rows" guidance, which is also currently ` +
    `exceeded on at least one page - that limits how much ONE page draws on screen (a draw-time ` +
    `budget), not how much is stored.` : '';
  let usedBytes = null;
  let totalBytes = null;
  let isEstimate = false;
  if (e && e.partialSymbolmap) {
    try {
      const capacity = computeRomCapacity({output: e.partialOutput, symbolmap: e.partialSymbolmap}, 0, bankSizeKeyFor(config) === 'dpcplus');
      const bankCapacity = capacity && capacity.perBank[bank - 1];
      if (bankCapacity) {
        usedBytes = bankCapacity.usableBytes - bankCapacity.freeBytes;
        totalBytes = bankCapacity.usableBytes;
      }
    } catch (capacityErr) {
      // Falls through to the estimate below - losing this real number
      // isn't worth failing the whole error report over.
    }
  }
  if (usedBytes == null) {
    isEstimate = true;
    usedBytes = estimateTitleScreenGraphicsBytes(useTitleScreenStorage()) + estimateTitleScreenKernelCodeBytes();
    // 3956, not 4096 - measured directly against a real successful compile
    // (a near-empty title screen used 418 of 3956 usable bytes per
    // computeRomCapacity), the standard kernel's footer/bankswitch
    // trampoline (ORG $2FF4-bscode_length in the shipped kernel asm)
    // reserves real space this fallback needs to account for too. Even
    // with that correction, this estimate can still be WRONG - confirmed
    // directly against a real project that overflowed while this exact
    // formula predicted only 3032/3956 bytes used - the estimate has no
    // way to see the 256-byte row-color alignment padding buildCardDataAsm
    // can need, so it can undercount a real failure. Phrased in the
    // message as "estimated to need at least", not a guarantee either way.
    totalBytes = 3956;
  }
  appendCompileLog(`Title screen bank ${bank} usage${isEstimate ? ' (estimated)' : ''}: ` +
    `<b>${usedBytes} / ${totalBytes} bytes</b> (graphics data + kernel code)`, 'info', true);
  // The error banner's <pre> can't render inline HTML (see App.vue's
  // v-text vs v-html split, and useErrorBannerHighlight's comment), so the
  // WHOLE explanatory paragraph lives here (rendered as a separate div right
  // after the <pre>, see App.vue's template) rather than split between a
  // plain-text "text" paragraph and a separate bold summary - text stays
  // empty below, this is the one and only paragraph shown.
  const highlight = `This may be caused by the Title Screen's graphics data: every animation frame on ` +
    `every page is baked into ROM at once, and the title screen's bank (bank ${bank}) ` +
    `${isEstimate ? 'is estimated to need at least' : 'is using'} <b>${usedBytes} of its ${totalBytes}</b> ` +
    `usable bytes${isEstimate ? ' (a real build can still fail even under this estimate)' : ''}.` +
    `${rowsClause} Try reducing animation frame counts, shrinking card heights, ` +
    `or reusing frames across cards.`;
  return {text: '', highlight};
};

// std_kernel.asm/score_graphics.asm both self-report free space via a real
// `echo "... bytes of ROM space left in bank 1"` before the bankswitch
// footer's ORG statement runs - DASM still executes that echo even on a
// build that goes on to fail moments later (see bb-compiler.js's
// `err.dasmStdout` comment), so a negative number here is a direct,
// authoritative answer to "is bank 1's fixed content over capacity",
// independent of whichever unit the relocation retry loop happens to be
// trying this attempt. Takes the LAST match (a project can hit this echo
// more than once across relocation attempts within the same stdout blob in
// principle) - returns null if the line isn't present at all (an overflow
// shape that isn't this one, e.g. a genuinely different bank).
const parseBank1FreeBytesEcho = (stdout) => {
  const matches = [...((stdout || '').matchAll(/(-?\d+) bytes of ROM space left in bank 1/g))];
  if (!matches.length) return null;
  return parseInt(matches[matches.length - 1][1], 10);
};

// The bank the assembler reported as too full, from the "bytes of ROM space left in bank N" lines (the last negative one: the
// assembly stops at the first bank that does not fit). Null when no bank is reported over.
const parseOverflowingBank = (stdout) => {
  const over = [...((stdout || '').matchAll(/(-?\d+) bytes of ROM space left in bank (\d+)/g))]
      .filter((match) => parseInt(match[1], 10) < 0);
  return over.length ? parseInt(over[over.length - 1][2], 10) : null;
};

// How many bytes a bank is over by, from the same lines (0 when it is not over or is not reported).
const parseBankOverflowBytes = (stdout, bank) => {
  const matches = [...((stdout || '').matchAll(new RegExp(`(-?\\d+) bytes of ROM space left in bank ${bank}(?!\\d)`, 'g')))];
  if (!matches.length) return 0;
  return Math.max(0, -parseInt(matches[matches.length - 1][1], 10));
};

// How many physical banks each bankswitched ROM size actually provides
// (2k/4k don't bankswitch at all, so they're absent - overflowing there just
// surfaces the real error, with nowhere to relocate anything). Every bank
// past bank 1 is a valid relocation target - the standard kernel's
// bankswitch trampoline is duplicated at the same relative offset in every
// bank, and cross-bank calls work identically regardless of which bank
// number is used (confirmed for bank 2 directly against the compiler and
// the emulator - see the bank-targeting feasibility notes).
// 'dpcplus' isn't a romSize value - DPC+ fixes its own bank count (1-6
// addressable, 8 total 4K regions) the moment "set kernel DPC+" is seen, independent of whatever
// romSize the UI would otherwise offer (which is hidden entirely once DPC+
// is selected - see Configuration.vue). Callers key this table (and every
// other romSize-keyed cache in this file) via bankSizeKeyFor below rather
// than config.romSize directly.
// DPC+ is 6, not 7 or 8. The 32KB DPC+ ROM has 8 total 4K regions, but only
// 6 (bank 1 through bank 6) are addressable via a bBasic "bank N" tag - the
// other two are the graphics bank and a SEPARATE ARM-driver bank, confirmed
// directly against both the real batari Basic docs (randomterrain.com's own
// DPC+ Kernel section: "4K bB system, 20K of your basic code, 4K graphics
// data, and 4K ARM code = 32K binary" - i.e. bank 1 + banks 2-6 = 6 code
// banks, graphics + ARM as two distinct reserved 4K regions) and gopher2600's
// own DPC+ mapper source (driverSize=3072/dataSize=4096/freqSize=1024 fixed
// regions = 8192 bytes reserved, leaving exactly 32768-8192=24576=6*4096 for
// addressable banks). 8 was wrong first (forced an unsupported "bank 8"
// declaration, corrupting the compiler's own internal per-bank bookkeeping -
// confirmed directly: DASM crashed with a WASM "memory access out of bounds"
// fault reading whatever postprocess.wasm's own out-of-bounds write had left
// behind). 7 was ALSO wrong (an earlier fix that stopped that crash by
// happening to stay under DASM's own hard "bank not supported" ceiling, but
// still overflows the real 32K budget: 7*4096 + 8192 = 36864 > 32768) -
// confirmed directly this time by the compiled ROM's own 6507 program
// hitting a genuine CPU JAM (illegal-opcode hardware halt) a few hundred
// bytes into what should have been bank 1's own tiny "goto bank2" stub, from
// whatever got misplaced at the resulting bank-boundary overflow.
export const BANK_COUNT_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8, '64k': 16, 'dpcplus': 6};

export const bankSizeKeyFor = (config) => ((config && config.kernel) === 'dpcplus' ? 'dpcplus' : config && config.romSize);

// DPC+ permanently reserves bank 2 for the whole commongamelogic/main-loop
// body (see generateDpcPlusBankPreamble's own comment in generators/
// bbasic.js) - bank 2 is never part of the shared pool individual events/
// graphics/music/subroutines compete for there, unlike every other kernel
// (where that pool starts at bank 2, right after bank 1's own normal,
// roomy content). Passed as pickNextBank's own minBank param everywhere it's
// called.
const minRelocationBankFor = (config) => (bankSizeKeyFor(config) === 'dpcplus' ? 3 : 2);

// The bank every relocatable unit implicitly defaults to until it's
// explicitly moved elsewhere (see pickRelocationCandidate/
// estimateBank1Total/familyStillInBank1's own "no entry defaults to this"
// convention) - bank 2 for DPC+ (see generateDpcPlusBankPreamble's own
// comment: DPC+ physically compiles everything not individually relocated
// into bank 2, not bank 1), bank 1 for every other kernel.
const primaryBankFor = (config) => (bankSizeKeyFor(config) === 'dpcplus' ? 2 : 1);

// Graphics unit keys (see wrapRelocatableGraphics in generators/bbasic.js)
// are generated, code-facing identifiers ("background3", "player0default",
// "player1animation2"), not anything a user would recognize - this resolves
// one back to whatever the user actually named it (a background's  name,
// or an animation's  name), for the ROM capacity display's bank-contents
// listing only. No player number in the returned label itself - the caller
// already splits player0/player1 into their  separate lists (see
// computeBankContents below), so repeating it per-entry would be redundant.
// Falls back to the raw unit key if the name can't be resolved (e.g. the
// background/animation was since deleted but a stale relocation decision
// still references it - shouldn't happen in practice, since banks are
// re-derived fresh every build, but cheap to guard against).
const BACKGROUND_UNIT_RE = /^background(\d+)$/;
const PLAYER_ANIMATION_UNIT_RE = /^(player[01])animation(\d+)$/;
const PLAYER_DEFAULT_UNIT_RE = /^(player[01])default$/;
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
    const [, , index] = animationMatch;
    try {
      const data = processPlayerAnimationsStorageDefaults(usePlayerAnimationsStorage());
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
// the single "musicEngine" relocatable unit's  payload (see
// wrapRelocatableMusic's call site in generators/bbasic/music.js) rather
// than tracked as its  relocatable unit or data table - there's no such
// thing as "this song is in bank 3 but that one is in bank 5", every song
// and pattern always shares musicEngine's one bank. This expands that single
// "musicEngine" entry into the actual song names (with each song's
// pattern count) it contains, for the ROM capacity display's bank-contents
// listing, rather than literally showing the code-facing "musicEngine" name.
// How many ROM bytes the data of a song takes: the note data of the pages that
// belong to it plus its sequence order and repeat tables. The instrument and
// envelope tables are shared by every song and the music engine's code is not
// counted, so this is the data alone.
const songDataBytes = (music, builtSong) => {
  let total = 0;
  Object.entries(music.channelPages || {}).forEach(([channel, pages]) => {
    const pageSongIds = (music.channelPageSongIds && music.channelPageSongIds[channel]) || [];
    pages.forEach((bytes, page) => {
      if (pageSongIds[page] === builtSong.songId) total += bytes.length;
    });
    const sequence = builtSong.sequenceStartPage && builtSong.sequenceStartPage[channel];
    if (sequence && builtSong.totalSteps > 1) total += sequence.length;
  });
  if (music.hasRepeats && builtSong.sequenceRepeatPacked && builtSong.totalSteps > 1) {
    total += builtSong.sequenceRepeatPacked.length;
  }
  return total;
};

const resolveMusicSongLabels = () => {
  const music = BlocklyBB.projectMusic;
  if (!music || !music.songs || !music.songs.length) return [];
  return music.songs.map((builtSong) => {
    const {songId} = builtSong;
    const song = findSongById(songId);
    const name = (song && song.name) || `Song ${songId}`;
    const patternCount = song ? (song.patterns || []).length : 0;
    const bytes = songDataBytes(music, builtSong);
    const details = [];
    if (patternCount) details.push(`${patternCount} pattern${patternCount === 1 ? '' : 's'}`);
    if (bytes) details.push(`${bytes.toLocaleString()} bytes`);
    return details.length ? `${name} (${details.join(', ')})` : name;
  });
};

// Snapshot of this build's  variable-pool usage (see letterVarsUsed/
// letterVarsAvailable/superchipVarsUsed/superchipVarsAvailable's  comment
// in generators/bbasic.js) for the ROM capacity display - both pools are
// filled fresh on every regenerateCode() call, so this only needs to read
// whatever the just-finished build already left on BlocklyBB, not recompute
// anything itself. superchip.available is 0 (not the full 29-slot budget)
// when Superchip RAM is off, matching how routeDevVar itself never touches
// that pool in that case either.
const computeVariableUsage = () => {
  const config = useConfigurationStorage().value || {};
  // The 12 SYSTEM_VARIABLES (player0frame, framecounter, etc. - see their
  // comment in generators/bbasic.js) are always dimmed, but land on a
  // DIFFERENT pool depending on Superchip: real letters when it's off, or
  // var0-var11 (a fixed region OUTSIDE letterVarsAvailable/
  // superchipVarsAvailable's  26-letter/32-slot totals, which only ever
  // described the competitive dev/user pool) when it's on. "Total Variables"
  // is meant to read as everything actually reserved out of whichever pool
  // it really lives in, so this folds systemVarCount into whichever side
  // System reserved is ACTUALLY occupying this build, rather than leaving it
  // out of both (the previous, confusing behavior this replaces).
  // A system variable the build left out (nothing but the template used it) takes no slot.
  const omittedSystemVars = BlocklyBB.omittedSystemVars || new Set();
  const keptSystemVariables = SYSTEM_VARIABLES.map((entry, i) => [...entry, i])
      .filter(([name]) => !omittedSystemVars.has(name) && !(BlocklyBB.displayRamVars && BlocklyBB.displayRamVars.has(name)));
  const systemVarCount = keptSystemVariables.length;
  return {
    letters: {
      used: (BlocklyBB.letterVarsUsed || 0) + (superchipOn(config) ? 0 : systemVarCount),
      available: BlocklyBB.letterVarsAvailable || 0,
    },
    superchip: {
      used: (BlocklyBB.superchipVarsUsed || 0) + (superchipOn(config) ? systemVarCount : 0),
      available: superchipOn(config) ? (BlocklyBB.superchipVarsAvailable || 0) + systemVarCount : 0,
    },
    // Superchip RAM's  SEPARATE read/write pool (r000-r127/w000-w127 -
    // see reserveDevVarRW's  comment in generators/bbasic.js) - a
    // completely different resource from the "letters"/"superchip" pools
    // above (those two compete for the SAME 48-byte-freed-playfield-plus-
    // 26-letter budget; this one is its  distinct 128-byte region, only
    // ever used for a small, hand-picked set of internal vars, never
    // offered to the user). available is 0 whenever Superchip itself is
    // off, or once pfres claims the whole 128 bytes (pfres=32) - same
    // "0 means not applicable, not broken" convention as superchip.available
    // above.
    superchipRw: {
      used: BlocklyBB.superchipRwUsed || 0,
      available: BlocklyBB.superchipRwAvailable || 0,
    },
    // DPC+'s own always-on bonus RAM pool (var0-var8, 9 slots - see
    // DPCPLUS_VAR_COUNT's own comment in generators/bbasic.js) - unlike
    // Superchip, there's no toggle for this; available is simply 0 whenever
    // kernel isn't DPC+, same "0 means not applicable" convention as the
    // other pools here.
    dpcPlus: {
      used: BlocklyBB.dpcPlusVarsUsed || 0,
      available: BlocklyBB.dpcPlusVarsAvailable || 0,
    },
    // User variables the build put in the display memory because the ordinary variable space ran out (DPC+ only).
    displayRam: {
      used: BlocklyBB.displayRamVars ? BlocklyBB.displayRamVars.size : 0,
    },
    // System variables (player0frame, newbackground, etc. - see
    // SYSTEM_VARIABLES' comment in generators/bbasic.js) are a SEPARATE,
    // always-unconditional set of "dim" lines - never routed through
    // routeDevVar/letterVarAssignments/superchipVarAssignments at all, since
    // they're not part of that competitive pool (every one of them exists on
    // every build, dev/user var count or not). Computed directly here, the
    // same "var${i}"-with-Superchip/literal-letter-otherwise rule
    // generateSystemDims itself uses, rather than threading a third array
    // through BlocklyBB, since it needs nothing from an actual compile -
    // just the current Superchip toggle.
    systemAssignments: keptSystemVariables.map(([name, letter, , i]) =>
      ({name, slot: superchipOn(config) ? `var${i}` : letter})),
    // Per-slot breakdown for the dynamic dev/user var pool (see bbasic.js's
    // letterVarAssignments/superchipVarAssignments comment) - which
    // actual name landed on which letter/var slot, for the ROM capacity
    // display's  expandable list.
    letterAssignments: BlocklyBB.letterVarAssignments || [],
    superchipAssignments: BlocklyBB.superchipVarAssignments || [],
    dpcPlusAssignments: BlocklyBB.dpcPlusVarAssignments || [],
    displayRamAssignments: BlocklyBB.displayRamVarAssignments || [],
    // Same per-slot breakdown, for Superchip's  separate r/w pool (see
    // reserveDevVarRW's  comment in generators/bbasic.js) - every entry
    // here always has isUserVariable: false (this pool is never offered to
    // the user), so it only ever shows up under the block/system list, not
    // the user-variable one.
    superchipRwAssignments: BlocklyBB.superchipRwAssignments || [],
  };
};

// Every graphics/event/music/subroutine unit's  current bank, grouped by
// bank instead of by unit (the shape getRelocationBanks/pickRelocationCandidate
// use) - built fresh after a successful build for the ROM capacity display,
// which wants "what's actually in bank N" for every bank, not just the ones
// something got reactively relocated INTO (getRelocationBanks'  maps only
// ever have entries for units that left bank 1 at all - a unit still sitting
// at its default only shows up here, in whichever bank's  list it falls
// into). BANK_COUNT_BY_ROMSIZE doubles as the Text Minikernel's  reserved
// bank number too (see KERNEL_BANK_BY_ROMSIZE's identical values and
// duplicated-on-purpose comment in generators/bbasic/text-minikernel.js) -
// always the single highest-numbered bank for the ROM's size.
const computeBankContents = (maxBanks, textMinikernelActive, titleScreenKernelActive) => {
  const banks = getRelocationBanks();
  const contents = {};
  for (let bank = 1; bank <= maxBanks; bank++) {
    contents[bank] = {
      events: [], backgrounds: [], player0Sprites: [], player1Sprites: [], music: [], subroutines: [],
      functions: [], dataTables: [], soundEffects: [], textMinikernel: false, titleScreenKernel: false,
      bankOverhead: false, fixed: [],
    };
  }
  // What is in the banks whatever the project has: the main loop sits in the main bank with the kernel's own code, and DPC+ keeps its
  // kernel and driver in bank 1.
  const dpcPlus = (useConfigurationStorage().value || {}).kernel === 'dpcplus';
  if (dpcPlus) {
    if (contents[1]) contents[1].fixed.push('DPC+ kernel, driver, score digits and startup code');
    if (contents[2]) contents[2].fixed.push('Main game loop and common game logic');
  } else if (contents[1]) {
    contents[1].fixed.push('Main game loop and common game logic', 'Kernel, score digits and bank switching code');
  }
  const place = (list, names, bankMap, labelFn) => {
    names.forEach((name) => {
      const bank = bankMap[name] || BlocklyBB.primaryBank();
      if (contents[bank]) contents[bank][list].push(labelFn ? labelFn(name) : name);
    });
  };
  place('events', RELOCATABLE_EVENT_NAMES, banks.eventBanks || {});
  // Split by unit key shape (see resolveGraphicsUnitLabel's  regexes just
  // above) rather than lumping every graphics unit into one list - a
  // background and a player's  sprite frame/animation are different
  // enough kinds of content that a shared "Graphics" label was more
  // confusing than useful once a bank actually held both at once, and the
  // two players' sprites are kept in their  separate lists too rather
  // than sharing one (with a player number on each entry) for the same
  // reason.
  const graphicsKeys = BlocklyBB.getGraphicsUnitKeys();
  place('backgrounds', graphicsKeys.filter((key) => BACKGROUND_UNIT_RE.test(key)),
      banks.graphicsBanks || {}, resolveGraphicsUnitLabel);
  place('player0Sprites', graphicsKeys.filter((key) => key.startsWith('player0')),
      banks.graphicsBanks || {}, resolveGraphicsUnitLabel);
  place('player1Sprites', graphicsKeys.filter((key) => key.startsWith('player1')),
      banks.graphicsBanks || {}, resolveGraphicsUnitLabel);
  // Sound FX envelope-check asm + its  data tables (see
  // wrapRelocatableGraphics'  call site at the end of generateEnvelopeChecks
  // in generators/bbasic/soundfx.js) - shares the same graphics pool/bank map
  // as backgrounds/player sprites above (not a dedicated pool the way music
  // gets one), just filtered out into its  labeled list here for the same
  // "different enough kinds of content" reason those are split out too.
  place('soundEffects', graphicsKeys.filter((key) => key === 'soundfxEnvelopeChecks'),
      banks.graphicsBanks || {}, () => 'Sound envelope checks');
  BlocklyBB.getMusicUnitKeys().forEach((unitKey) => {
    const bank = (banks.musicBanks || {})[unitKey] || BlocklyBB.primaryBank();
    if (!contents[bank]) return;
    const labels = unitKey === 'musicEngine' ? resolveMusicSongLabels() : [];
    contents[bank].music.push(...(labels.length ? labels : [unitKey]));
  });
  // The Title Screen Kernel is listed by itself (below) instead of among the subroutines.
  const titleKernelBank = (banks.subroutineBanks || {})[TITLE_SCREEN_SUBROUTINE_NAME] || 1;
  place('subroutines', BlocklyBB.getSubroutineNames().filter((name) => name !== TITLE_SCREEN_SUBROUTINE_NAME),
      banks.subroutineBanks || {});
  // titleScreenKernelActive is captured at the start of the build, for the same reason as textMinikernelActive below.
  if (titleScreenKernelActive && contents[titleKernelBank]) {
    contents[titleKernelBank].titleScreenKernel = true;
  }
  // A function relocates as part "family" (see
  // computeFunctionFamilies) rather than entirely independently, but still
  // ends up with a real per-function entry in banks.functionBanks either
  // way (see setRelocationBank's  call sites in buildRom(), which iterate
  // every family member individually). Listed under its  label (not
  // lumped into Subroutines) so it's visible at a glance which bank a
  // function ended up in relative to whatever calls it - relevant since a
  // caller outside its family can't safely call a function pinned here
  // (function calls don't get a bank-jump tag the way gosub/goto do).
  place('functions', Object.keys(BlocklyBB.functions), banks.functionBanks || {});
  // Each table's  bank usage (see trackDataTableBank/generateDataTables in
  // generators/bbasic.js) - a table can end up with a physical copy in
  // several banks at once (every bank it's actually read from), unlike the
  // other kinds above which only ever live in one, so this pushes into
  // every bank it has a copy in rather than just one. A table nothing ever
  // read (no usage entry at all) still gets an implicit bank 1 copy,
  // matching generateDataTables'  fallback.
  const dataTablesData = BlocklyBB.getDataTablesData();
  const dataTableUsage = BlocklyBB.getDataTableBankUsage();
  ((dataTablesData && dataTablesData.dataTables) || [])
      .filter((table) => table.values && table.values.length)
      .forEach((table) => {
        // A table no block reads is not in the ROM, so it is not listed.
        const usage = dataTableUsage[table.id];
        const tableBanks = usage && usage.size ? [...usage] : [];
        tableBanks.forEach((bank) => {
          if (contents[bank]) contents[bank].dataTables.push(table.name || `Unnamed ${table.id}`);
        });
      });
  // textMinikernelActive is passed in by the caller (captured at the exact
  // moment THIS build's  regenerateCode() ran) rather than read fresh off
  // BlocklyBB.isTextMinikernelActive() here - this function runs well after
  // that, following the real async compile/assemble steps, and BlocklyBB is
  // a shared singleton reused across every workspaceToCode() call (see its
  // comment in generators/bbasic.js) - anything else touching it in the
  // meantime (e.g. the Actions tab's  live code preview,
  // ActionEditor.vue's  workspaceToCode call) can flip textMinikernelUsed
  // back before this ever reads it, silently dropping the Text Minikernel's
  // real bank-8-ish usage from the display - a real reported bug (the
  // top bank showing real used bytes with no "Text Minikernel" entry to
  // account for them).
  if (textMinikernelActive && contents[maxBanks]) {
    contents[maxBanks].textMinikernel = true;
    const textBank = BlocklyBB.textKernelBank();
    if (textBank && contents[textBank]) contents[textBank].textMinikernel = true;
  }
  // generateRelocatedSections (generators/bbasic.js) always declares this
  // exact top bank on a bankswitched, non-Text-Minikernel build, even with
  // nothing relocated into it, so DASM pads it to full size instead of
  // truncating the assembled binary - that costs real bytes (bB's
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
// bank-tag syntax (see codeReferencesAnyFunction's  comment in
// generators/bbasic.js), so a function and everything that reaches it
// through a plain VALUE-form call - another function's  body, or a
// wrapper subroutine's  body, both scanned here the same way
// codeReferencesAnyFunction does - must always land in the exact same bank
// as each other, whichever bank that turns out to be. Anything reaching a
// function through a wrapper's "gosub" (bank-taggable) is deliberately
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

// A function family's  combined estimated size - the sum of every
// member's  size estimate, since the whole family always relocates (or
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
const familyStillInBank1 = (members, banks, primaryBank) => {
  const primary = primaryBank || 1;
  return members.every(({kind, name}) => ((banks[kind] || {})[name] || primary) === primary);
};

// True if ANYTHING outside this family bare-calls one of its  function
// members directly - an ordinary user-authored subroutine (or an event)
// that references a function this way, WITHOUT itself being pulled into
// the family (computeFunctionFamilies only ever unions functions/wrapper
// subroutines together - an ordinary subroutine bare-calling one of them is
// invisible to it, on purpose: see pickRelocationCandidate's  comment on
// why THAT subroutine stays excluded from independent relocation, pinned to
// bank 1 forever). If such a caller exists, this family can never safely
// relocate anywhere else: a bare function call has no bank-tag syntax (same
// reason the family itself has to move as one atomic unit), so the moment
// the family leaves bank 1, that external, bank-1-pinned caller's  calls
// jump into whatever happens to be paged in at the family's old address
// instead - a real reported bug this way ("Auto: failed" in the emulator,
// confirmed directly: an ordinary subroutine bare-calling the exact same
// auto-generated dispatch functions a real Function's  body also called
// worked fine through the Function - itself a family member, always
// reached via a bank-tagged wrapper - but crashed the moment those same
// functions got relocated off bank 1 for unrelated reasons, since nothing
// previously checked for this from the FUNCTION's  side). Checked
// against every ordinary subroutine NOT already in this family, and every
// event - the same two "bare-calls a function" pools pickRelocationCandidate
// already excludes as STANDALONE candidates for the identical reason.
const familyHasExternalBareCaller = (members) => {
  const functionMemberNames = members.filter(({kind}) => kind === 'functionBanks').map(({name}) => name);
  if (!functionMemberNames.length) return false;
  const memberNames = new Set(members.map(({name}) => name));
  const referencesAnyMember = (code) => functionMemberNames.some((name) => code.includes(`${name}(`));
  const subroutineHit = BlocklyBB.getSubroutineNames()
      .filter((name) => !memberNames.has(name))
      .some((name) => referencesAnyMember(BlocklyBB.subroutines[name] || ''));
  if (subroutineHit) return true;
  return RELOCATABLE_EVENT_NAMES.some((name) => referencesAnyMember((BlocklyBB.gameEvents[name] || []).join('\n')));
};

// Largest-first, across every relocatable kind: relocating the biggest
// still-inline unit (event, graphics - a background, a player's default
// frame, or a single named animation, see wrapRelocatableGraphics - a
// user-defined subroutine, see getSubroutineBank in generators/bbasic.js -
// music, see wrapRelocatableMusic, kept in its  separate pool/config key
// from graphics - or a function "family", see computeFunctionFamilies)
// frees the most bank 1 space per attempt, minimizing how many rebuild
// cycles are needed. Must run right after a regenerateCode() call, while
// every kind's size estimate is still current - graphics/music unit keys
// and subroutine/function names are only known after that call too, since
// they're generated from the project's  content rather than fixed like
// the event names.
const relocationCandidates = (banks, hasReservedMusicBank, primaryBank) => {
  const primary = primaryBank || 1;
  const eventBanks = banks.eventBanks || {};
  const graphicsBanks = banks.graphicsBanks || {};
  const musicBanks = banks.musicBanks || {};
  const subroutineBanks = banks.subroutineBanks || {};
  const musicCandidates = BlocklyBB.getMusicUnitKeys()
      .filter((name) => (musicBanks[name] || primary) === primary)
      .map((name) => ({kind: 'musicBanks', name, size: BlocklyBB.estimateMusicUnitSize(name)}));
  // Music still sitting in bank 1 jumps the queue whenever it has its
  // reserved bank waiting (see musicReservedBank) - moving it there is a
  // pure win with no downside, unlike graphics/events/subroutines, which
  // compete for space in whichever shared-pool bank they land in. Sorting
  // it in with everything else and picking by size alone only got to it
  // once music happened to be the single largest still-in-bank-1 unit -
  // confirmed directly as a real bug on a project with several sizeable
  // graphics units and one small music engine: bank 1 kept overflowing
  // (evicting graphics into an already-tight shared pool, sized as if only
  // 6 banks existed) while music's  reserved 7th bank sat completely
  // empty for all 64 relocation attempts, since nothing ever picked it.
  if (hasReservedMusicBank && musicCandidates.length) {
    return musicCandidates.sort((a, b) => b.size - a.size).slice(0, 1);
  }
  const candidates = [
    // Excludes anything that calls a bB function via a plain value-form
    // call (see codeReferencesAnyFunction's  comment in
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
        .filter((name) => (eventBanks[name] || primary) === primary)
        .filter((name) => !BlocklyBB.codeReferencesAnyFunction((BlocklyBB.gameEvents[name] || []).join('\n')))
        .map((name) => ({kind: 'eventBanks', name, size: BlocklyBB.estimateEventSize(name)})),
    ...BlocklyBB.getGraphicsUnitKeys()
        .filter((name) => (graphicsBanks[name] || primary) === primary)
        .map((name) => ({kind: 'graphicsBanks', name, size: BlocklyBB.estimateGraphicsUnitSize(name)})),
    ...musicCandidates,
    ...BlocklyBB.getSubroutineNames()
        .filter((name) => (subroutineBanks[name] || primary) === primary)
        .filter((name) => !BlocklyBB.codeReferencesAnyFunction(BlocklyBB.subroutines[name] || ''))
        .map((name) => ({kind: 'subroutineBanks', name, size: BlocklyBB.estimateSubroutineSize(name)})),
    // Every function/wrapper "family" still entirely at bank 1 - relocated
    // as one atomic unit (see setRelocationBank's  call sites in
    // buildRom() below, which iterate candidate.members instead of a single
    // kind/name whenever this is present), sized as the sum of every
    // member's  estimate. Excludes any family an ordinary subroutine or
    // event bare-calls directly (see familyHasExternalBareCaller's
    // comment) - such a family can never safely leave bank 1 at all, so it's
    // not a candidate here any more than an ordinary function-referencing
    // subroutine/event is above.
    ...computeFunctionFamilies()
        .filter(({members}) => familyStillInBank1(members, banks, primary))
        .filter(({members}) => !familyHasExternalBareCaller(members))
        .map(({members}) => ({
          kind: 'family',
          name: members.map((m) => m.name).join(', '),
          size: estimateFamilySize(members),
          members,
        })),
  ];
  return candidates.sort((a, b) => b.size - a.size);
};

const pickRelocationCandidate = (banks, hasReservedMusicBank, primaryBank) =>
  relocationCandidates(banks, hasReservedMusicBank, primaryBank)[0] || null;

// A unit that is still in the main bank and fits in the free bytes another bank measured in the last good build: the largest
// one, to the bank it leaves the least room in. (The sizes are estimates, so a unit has to fit with a margin.) Null when none does.
const pickSqueezeMove = (capacity, config, banks, tried) => {
  const maxBanks = BANK_COUNT_BY_ROMSIZE[bankSizeKeyFor(config)];
  if (!maxBanks || !capacity || !capacity.perBank) return null;
  const primary = primaryBankFor(config);
  const textMinikernelActive = BlocklyBB.isTextMinikernelActive();
  const reservedMusicBank = musicReservedBank(maxBanks, textMinikernelActive, minRelocationBankFor(config));
  const free = {};
  capacity.perBank.forEach(({freeBytes}, i) => {
    const bank = i + 1;
    if (bank !== primary && bank >= minRelocationBankFor(config) && bank !== reservedMusicBank &&
        bank !== (banks.subroutineBanks || {})[TITLE_SCREEN_SUBROUTINE_NAME] &&
        bank <= (textMinikernelActive ? maxBanks - 1 : maxBanks)) free[bank] = freeBytes;
  });
  const scaled = (unit) => unit.size * (unit.kind === 'eventBanks' ? COMPILED_BYTES_PER_EVENT_CHAR :
    unit.kind === 'graphicsBanks' ? COMPILED_BYTES_PER_GRAPHICS_CHAR :
    unit.kind === 'musicBanks' ? 1 : COMPILED_BYTES_PER_SUBROUTINE_CHAR);
  const candidates = relocationCandidates(banks, !!reservedMusicBank, primary).filter((unit) =>
    unit.kind !== 'musicBanks' && !tried.has(`${unit.kind}:${unit.name}`));
  for (const unit of candidates) {
    const need = scaled(unit) * SQUEEZE_MARGIN;
    const fits = Object.keys(free).map(Number).filter((bank) => free[bank] >= need)
        .sort((a, b) => free[a] - free[b]);
    if (fits.length) return {unit, bank: fits[0]};
  }
  return null;
};

// The single highest-numbered available bank (excluding the Text
// Minikernel's  reserved top bank, same as pickNextBank below) is set
// aside for music units specifically, rather than sharing the same pool
// backgrounds/animations/events pack into - see pickNextBank's  comment
// for why a dedicated reservation was tried and reverted once before,
// and generateMusicChecks/generatePlaySong's  comments for why music's
// size can vary a lot build to build in a way fixed content can't.
// Reverting that revert here, at the user's  explicit request, after a
// real project demonstrated the earlier "shared pool" reasoning's
// tradeoff cuts the other way just as easily: a project that's ALREADY
// packed every other bank tight leaves music with nowhere to fit at all
// otherwise, which is worse than dedicating it a bank up front. Returns null
// if there aren't enough banks to spare one just for music (need at least
// one bank left over for the shared graphics/events pool too).
const musicReservedBank = (maxBanks, textMinikernelActive, minBank) => {
  // A project without music has nothing to keep there: the bank joins the shared pool.
  if (!BlocklyBB.getMusicUnitKeys().length) return null;
  const lowestBank = minBank || 2;
  const highestBank = textMinikernelActive ? maxBanks - 1 : maxBanks;
  return highestBank - lowestBank >= 1 ? highestBank : null;
};

// About how many bytes of 6502 code a character of the generated source turns into, measured on a real project (the generated text
// has long labels and comments, and an animation's text is mostly the graphics, which go to the graphics bank, not the code).
const COMPILED_BYTES_PER_EVENT_CHAR = 0.3;
const BANK_FULL_ESTIMATE = 3500;
const SPILL_TIGHT_AFTER_ATTEMPTS = 5;
const BANK_PACK_ESTIMATE = 2800;
const SQUEEZE_MARGIN = 1.3;
const MAX_SQUEEZE_ATTEMPTS = 12;
const COMPILED_BYTES_PER_GRAPHICS_CHAR = 0.09;
const COMPILED_BYTES_PER_SUBROUTINE_CHAR = 0.22;

// About how many bytes of code each bank holds, from the units the banks object puts there.
const estimateBankBytes = (banks) => {
  const bytes = {};
  const tally = (unitBanks, bytesOf) => Object.entries(unitBanks || {}).forEach(([name, bank]) => {
    bytes[bank] = (bytes[bank] || 0) + bytesOf(name);
  });
  tally(banks.eventBanks, (name) => BlocklyBB.estimateEventSize(name) * COMPILED_BYTES_PER_EVENT_CHAR);
  tally(banks.graphicsBanks, (name) => BlocklyBB.estimateGraphicsUnitSize(name) * COMPILED_BYTES_PER_GRAPHICS_CHAR);
  tally(banks.subroutineBanks, (name) => BlocklyBB.estimateSubroutineSize(name) * COMPILED_BYTES_PER_SUBROUTINE_CHAR);
  tally(banks.functionBanks, (name) => BlocklyBB.estimateFunctionSize(name) * COMPILED_BYTES_PER_SUBROUTINE_CHAR);
  return bytes;
};

// Spreads relocated units (events, graphics, and subroutines together, since
// they share the same physical banks) across every available bank rather
// than piling them all into one - picks whichever bank (2..maxBanks, minus
// excludeBank - see musicReservedBank above) currently holds the fewest
// relocated units, ties broken toward the lowest bank number.
//
// Two other strategies were each tried and reverted here in the same
// session: balancing by a summed source-length estimate (see
// estimateEventSize/estimateGraphicsUnitSize's  comments on why that
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
// extraExcluded (a Set, e.g. a unit's  already-tried banks in the
// stuckBank fallback below) is additional to excludeBank (always the
// reserved music bank, if any) - kept as a separate param rather than
// folded into one exclusion set since excludeBank alone is the common case
// every other caller uses.
// excludeBanks is a HARD exclusion - always the reserved music bank (never
// a valid target for non-music content at all) and, from the stuckBank
// fallback's  call site, every bank already tried for THIS unit
// (including its  current bank - moving a unit to the bank it's already
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
// case is instead handled at the stuckBank fallback's  call site by
// clearing that one unit's  tried-set and giving it a fresh attempt,
// rather than by softening the exclusion here.
const pickNextBank = (banks, maxBanks, textMinikernelActive, excludeBanks, minBank, unitKinds, primaryBank) => {
  const lowestBank = minBank || 2;
  // Nothing else goes in the bank the Title Screen Kernel is in (its documentation asks for a bank to itself, and the title screen's
  // graphics take most of it) - unless that leaves no bank at all.
  const titleKernelBank = (banks.subroutineBanks || {})[TITLE_SCREEN_SUBROUTINE_NAME];
  if (titleKernelBank >= lowestBank && !(excludeBanks && excludeBanks.has(titleKernelBank))) {
    const avoided = pickNextBank(banks, maxBanks, textMinikernelActive,
        new Set([...(excludeBanks || []), titleKernelBank]), minBank, null, primaryBank);
    if (avoided) return avoided;
  }
  const highestBank = textMinikernelActive ? maxBanks - 1 : maxBanks;
  if (highestBank < lowestBank) return null;
  const counts = {};
  for (let bank = lowestBank; bank <= highestBank; bank++) {
    if (excludeBanks && excludeBanks.has(bank)) continue;
    counts[bank] = 0;
  }
  if (!Object.keys(counts).length) return null;
  // The banks are filled by about how many bytes each holds, not by how many units: one subroutine can be bigger than all the
  // animations and backgrounds together.
  const bytes = estimateBankBytes(banks);
  Object.keys(counts).forEach((bank) => {
    counts[bank] = bytes[bank] || 0;
  });
  // Units go to as few banks as possible: every bank that holds code also holds a copy of the data tables that code reads and its own
  // bank switching code, so spreading units over every bank takes more room than filling one bank before starting the next.
  const roomy = Object.keys(counts).map(Number).filter((bank) => counts[bank] < BANK_PACK_ESTIMATE);
  const lightest = roomy.length ?
    roomy.reduce((best, bank) => counts[bank] > counts[best] ? bank : best) :
    Object.keys(counts).map(Number).reduce((best, bank) => counts[bank] < counts[best] ? bank : best);
  // The main bank is only a place to put a unit when every other bank is about full (the estimates leave out what each bank holds
  // besides units, a copy of the data tables its code reads and the bank switching code, so a bank is called full a little early).
  if (primaryBank && !(excludeBanks && excludeBanks.has(primaryBank)) && counts[lightest] >= BANK_FULL_ESTIMATE) return primaryBank;
  return lightest;
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
const SCREENSHOT_DELAY_MS = 1500;

export const buildRom = async () => {
  // See buildInProgress's comment above - a title screen preview build
  // running concurrently with this one corrupted a real build's output
  // before this guard existed.
  if (buildInProgress.value) {
    appendCompileLog('Another build is already in progress - try again once it finishes.', 'error');
    return false;
  }
  buildInProgress.value = true;
  setEmulatorPaused(true);
  const screenshotRef = useLastBuildScreenshot();
  screenshotRef.value = null;
  try {
    const built = await buildRomInner();
    // Grabbed once the game has been running a moment, so the picture shows
    // the game rather than a blank first frame.
    if (built) {
      window.setTimeout(() => {
        const shot = captureEmulatorScreenshot();
        if (shot) screenshotRef.value = shot.toDataURL('image/png');
      }, SCREENSHOT_DELAY_MS);
    }
    return built;
  } finally {
    buildInProgress.value = false;
    setEmulatorPaused(false);
  }
};

const buildRomInner = async () => {
  const errorStorage = useErrorStorage();
  const configurationStorage = useConfigurationStorage();
  const relocatedThisBuild = [];
  BlocklyBB.displayRamExcludedSeed = null;
  BlocklyBB.spillTight = false;

  // Tracks every bank each unit has already been tried in during THIS
  // build (keyed by "kind:name"), so the fallback below (see its
  // comment) can tell which banks are left to try for whichever unit needs
  // it, rather than repeating one that already overflowed.
  const retriedBanksByUnit = new Map();

  // Persists across attempts, unlike relocatedThisBuild's  last entry -
  // see the fallback below's  comment for why RE-DERIVING "which bank is
  // actually the problem" fresh every single attempt (from whichever unit
  // the PREVIOUS attempt's  guess happened to move) kept drifting to a
  // new, usually-innocent bank each time instead of ever systematically
  // working through one bank's real occupants.
  let stuckBank = null;
  const stuckBankTriedUnits = new Set();

  // Tracks the most recent failure so the post-loop fallback (see its
  // comment, right after the for loop below) can still report something
  // useful if the attempt budget runs out without the loop's "nothing
  // left to try" branch ever firing.
  let lastCode = '';
  let lastFailure = null;

  // Every relocatable unit (events, graphics, music, subroutines - see
  // hooks/relocation-banks.js) starts this build fresh, back at bank 1,
  // rather than carrying over wherever a PREVIOUS build happened to leave
  // it. Bank assignments aren't PERSISTED across builds (see relocation-
  // banks.js's  comment for why that was tried and reverted), but the
  // last SUCCESSFUL build's  layout is kept in memory for this session as
  // a first-attempt hint (seedRelocationBanksFromLastSuccess, below) -
  // abandoned immediately, via the exact same resetRelocationBanks() this
  // always called, the moment that first attempt doesn't compile clean (see
  // the catch block below), so every attempt from #2 onward behaves
  // identically to how this has always worked.
  resetRelocationBanks();
  const seededFromLastSuccess = seedRelocationBanksFromLastSuccess(
      bankSizeKeyFor(configurationStorage.value || {}));
  clearCompileLog();
  if (seededFromLastSuccess) {
    appendCompileLog('Trying the last successful bank layout first...', 'stage');
  }
  const buildStartedAt = performance.now();

  // After a build that works, units still in the main bank are tried in the free room the other banks measured. A move that does not
  // fit is taken back, and the last good build stays loaded.
  let squeeze = null;
  let squeezeCount = 0;
  let goodCapacity = null;
  const squeezeTried = new Set();
  const trySqueeze = (capacity) => {
    if (squeezeCount >= MAX_SQUEEZE_ATTEMPTS) return false;
    const move = pickSqueezeMove(capacity, configurationStorage.value || {}, getRelocationBanks(), squeezeTried);
    if (!move) return false;
    const members = move.unit.members || [{kind: move.unit.kind, name: move.unit.name}];
    members.forEach(({kind, name}) => setRelocationBank(kind, name, move.bank));
    squeeze = {members, key: `${move.unit.kind}:${move.unit.name}`, from: primaryBankFor(configurationStorage.value || {})};
    squeezeCount++;
    appendCompileLog(`Trying ${move.unit.kind.replace('Banks', '')} "${move.unit.name}" in bank ${move.bank} to free the main bank.`);
    return true;
  };

  for (let attempt = 0; attempt <= MAX_RELOCATION_ATTEMPTS + MAX_SQUEEZE_ATTEMPTS; attempt++) {
    // Every stage below is a synchronous, CPU-bound WASM run (see
    // bb-compiler.js's runWasi - wasi.start blocks until the module exits),
    // chained together with awaits on already-resolved/microtask promises -
    // none of which are real macrotasks, so the browser never gets a chance
    // to repaint or process input between them. A project that needs many
    // relocation attempts to converge (see MAX_RELOCATION_ATTEMPTS's
    // comment) used to run all of them back-to-back with zero yields at
    // all, appearing as a total tab freeze for however long that took - up
    // to roughly a minute for the full 64-attempt budget, confirmed
    // directly (see the post-loop fallback's  comment below). A single
    // setTimeout(0) forces a real macrotask boundary here, letting the
    // compile log's  live updates actually paint and the tab stay
    // responsive between attempts, without changing anything about the
    // relocation logic itself.
    await new Promise((resolve) => setTimeout(resolve, 0));
    appendCompileLog(attempt === 0 ? 'Generating bBasic code...' :
      `Attempt ${attempt + 1}: generating bBasic code...`, 'stage');
    let code;
    // The TV standard this code was generated for, read now - the compile
    // below is async, and the standard can be changed meanwhile, which would
    // pair a ROM built for one standard with the emulator spec of the other.
    let buildTvSpec;
    try {
      code = regenerateCode();
      buildTvSpec = emulatorTvSpec(useConfigurationStorage().value || {});
      useGeneratedBasic().value = code;
      // What the first pass found cannot go in Display RAM holds for the later ones too (only where the units are changes).
      BlocklyBB.displayRamExcludedSeed = new Set(BlocklyBB.displayRamExcluded || []);
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
      const titleScreenKernelActive = BlocklyBB.getSubroutineNames().includes(TITLE_SCREEN_SUBROUTINE_NAME);
      // Copied rather than used directly: getTextMinikernelSiblingFiles()
      // returns the same cached object every call, and this block below
      // mutates whatever ends up in siblingFiles['score_graphics.asm'] - doing
      // that in place used to corrupt the cache permanently (e.g. picking a
      // preset font once would leave that override stuck there forever,
      // masking the Text Minikernel's  extended file even after switching
      // back to Squish or to a different project).
      // A Squish score font on DPC+ shortens the score's loop (see utils/dpc-squish.js); with the score hidden there is nothing to shorten.
      const dpcPlusSquish = config.kernel === 'dpcplus' && (config.scoreFont === SQUISH_SCORE_FONT || config.scoreFont === SQUISH_CUSTOM_SCORE_FONT) &&
        !config.enableCycleScore && !config.enableScanlinesDebug && ((configurationStorage.value || {}).showScore ?? true) !== false;
      const siblingFiles = textMinikernelActive ?
        {...(config.kernel === 'dpcplus' ? await getDpcPlusTextMinikernelSiblingFiles(BlocklyBB.isTextRow2Used(), !!BlocklyBB.textScrollCursorUsed,
            ((configurationStorage.value || {}).showScore ?? true) === false, dpcPlusSquish) : await getTextMinikernelSiblingFiles())} : {};
      // Hand-written .asm content generated during this same attempt's
      // regenerateCode() call above (player animation frame pointers, see
      // generateAnimations in generators/bbasic.js), added as sibling files
      // the exact same way text12a.asm/text12b.asm are - the music per-
      // channel gate check used to work the same way, but was reverted back
      // to plain bB (see generateMusicChecks'  comment) after this
      // "inline"-a-real-file mechanism was confirmed to break once relocated
      // to a bank other than 1.
      Object.assign(siblingFiles, BlocklyBB.playerAnimAsmFiles || {});
      if (BlocklyBB.usesDivMulRoutine() && fastMathOn(configurationStorage.value || {})) {
        Object.assign(siblingFiles, await getFastMathSiblingFiles(config.kernel));
      }
      // The Titlescreen Kernel's  static shared helper code (public/bb19/
      // titlescreen/) plus this build's  generated titlescreen_layout_N.asm
      // (one per title screen page) and combined titlescreen_data.asm (see
      // registerTitleScreenSubroutine in generators/bbasic/titlescreen.js) -
      // same "siblings throughout the whole compile pipeline" reasoning as
      // the Text Minikernel above. Only set at all once at least one "Draw
      // title screen" block exists on the workspace (titleScreenUsedKernelKeys
      // stays undefined otherwise), and only fetches the specific per-copy
      // kernel files the project's  cards (across every page) actually use.
      if (BlocklyBB.titleScreenUsedKernelKeys) {
        Object.assign(siblingFiles, await getTitleScreenSiblingFiles(BlocklyBB.titleScreenUsedKernelKeys, !!BlocklyBB.titleScreenHasScoreCard));
        Object.assign(siblingFiles, BlocklyBB.titleScreenAsmFiles || {});
      }
      // The compiler has no font support, so point its score
      // digits at the selected font by overriding score_graphics.asm.
      // Squish is special (see utils/score-font.js/SQUISH_SCORE_FONT): it's
      // the Text Minikernel's  extended score_graphics.asm, already
      // placed above whenever the Text Minikernel is active, but selectable
      // on its  too, independent of whether the Text Minikernel is used -
      // combining it with one of the byte-swappable preset/custom fonts
      // isn't supported, so those are skipped whenever Squish is picked.
      // "Show remaining CPU cycles as the score" (config.enableCycleScore,
      // bB's "set debug cyclescore") always forces the stock/Default
      // font here regardless of the Score tab's  selection - it reuses
      // the standard kernel's  digit-drawing routine to overlay its cycle
      // count, and a Custom/Squish font's  digit shapes would otherwise
      // still get swapped in underneath that debug overlay, which isn't
      // what a font picked for the REAL score digits should also affect.
      // "Show NTSC scanlines used as the score" (config.enableScanlinesDebug)
      // forces the same thing, for the same reason - it pokes plain digits
      // straight into the score too, sized for the standard kernel's
      // full-height digits, not Squish's shorter ones.
      // DPC+ draws the digits from the same table (scoretable) through its ARM code, so the primary font works there as it does
      // with the standard kernel, extra glyphs included, and so do the Squish fonts (written as a plain table, with the kernel's score
      // loop shortened to match, see utils/dpc-squish.js). A secondary font is not for DPC+ yet.
      const dpcPlusScore = config.kernel === 'dpcplus';
      const effectiveScoreFont = (config.enableCycleScore || config.enableScanlinesDebug) ? null : config.scoreFont;
      if (!dpcPlusScore && effectiveScoreFont === SQUISH_SCORE_FONT && !scoreFontIsEdited(SQUISH_SCORE_FONT)) {
        if (!textMinikernelActive) siblingFiles['score_graphics.asm'] = await getExtendedScoreGraphics();
      } else {
        const scoreFontOverride = await buildScoreFontOverride(effectiveScoreFont,
            (config.enableCycleScore || config.enableScanlinesDebug || dpcPlusScore) ? undefined : config.secondaryScoreFont,
            dpcPlusScore);
        if (scoreFontOverride) siblingFiles['score_graphics.asm'] = scoreFontOverride;
      }
      // Same override mechanism, for the Text Minikernel's  drawn
      // character set (see utils/text-font.js) - only reachable when the
      // Text Minikernel is active at all (siblingFiles only carries
      // text12b.asm in the first place then), and only actually returns an
      // override once the Text Font Editor has ever written to storage.
      if (textMinikernelActive) {
        // DPC+ keeps its whole text kernel in one file, the standard kernel's drawing code is text12b.asm
        const textKernelFile = config.kernel === 'dpcplus' ? 'text12DPCplus.asm' : 'text12b.asm';
        const textFontOverride = await buildTextFontOverride(
            config.kernel === 'dpcplus' ? siblingFiles[textKernelFile] : null);
        if (textFontOverride) siblingFiles[textKernelFile] = textFontOverride;
        // Row 2's  color ("Text: set row 2 color" block) - see
        // buildTextRow2ColorOverride's  doc comment in utils/text-font.js.
        // Real resolved name read off BlocklyBB.nameDB_ the same way
        // linesMaxVarName/linesBaseVarName are below.
        if (BlocklyBB.isTextRow2Used()) {
          const colorVarName = BlocklyBB.nameDB_.getName(
              textRow2ColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
          siblingFiles[textKernelFile] = buildTextRow2ColorOverride(
              siblingFiles[textKernelFile], {colorVarName});
        }
        // The "more below" scroll cursor (see utils/text-font.js's
        // buildTextScrollCursorOverride) splices its  drawing code into
        // WHATEVER text12b.asm content is already staged above (the font
        // override, if any, otherwise the sibling file's  pristine
        // copy) - applied on top, not instead of, so a project customizing
        // both its glyphs AND the cursor gets both at once. _textLinesMax's
        // real resolved name is read directly off BlocklyBB.nameDB_
        // here, right after this same build's regenerateCode() call
        // already resolved it the same way for the actual generated source
        // (see that function's  doc comment in utils/text-font.js for
        // why a standalone util module can't resolve this by itself).
        if (config.enableTextScrollCursor) {
          const glyphByte = packCursorGlyphByte(processCursorGlyphDefaults(useTextFontStorage()));
          const linesMaxVarName = BlocklyBB.nameDB_.getName(
              textLinesMaxVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
          const linesBaseVarName = BlocklyBB.nameDB_.getName(
              textLinesBaseVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
          const colorVarName = BlocklyBB.nameDB_.getName(
              textScrollCursorColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
          const endColorVarName = BlocklyBB.nameDB_.getName(
              textEndIconColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
          const blinkMask = resolveBlinkMask(config.textScrollCursorBlinkSpeed);
          siblingFiles[textKernelFile] = buildTextScrollCursorOverride(siblingFiles[textKernelFile],
              {glyphByte, linesMaxVarName, linesBaseVarName, colorVarName, endColorVarName, blinkMask});
        }
      }
      // Passed to every stage below so each one's  real CLI invocation
      // (and, once it finishes, how long it took) appears live in the error
      // console, each on its  line - matches what running the actual
      // batari Basic toolchain locally would print.
      const log = (text) => appendCompileLog(text);
      appendCompileLog('Preprocessing...', 'stage');
      // Sprite frames that repeat are cut out of the source batari Basic compiles (see utils/dpc-share-source.js).
      const sharedSource = (configurationStorage.value || {}).kernel === 'dpcplus' ? shareDpcPlusPlayerSource(code) : null;
      const preprocessed = await preprocessBatariBasic(sharedSource ? sharedSource.code : code, log);
      appendCompileLog('Compiling to assembly...', 'stage');
      Object.assign(siblingFiles, await getDpcPlusAudioSiblingFiles(siblingFiles, BlocklyBB.dpcAudioFiles));
      // The text builds' kernels are made above, with the Squish loop in them.
      if (dpcPlusSquish && !BlocklyBB.isTextMinikernelActive()) {
        Object.assign(siblingFiles, await getDpcPlusSquishSiblingFiles(siblingFiles));
      }
      // A hidden score gives its scanlines to the picture (the Text Minikernel's score row stays, it draws the text).
      if ((configurationStorage.value || {}).kernel === 'dpcplus' && ((configurationStorage.value || {}).showScore ?? true) === false &&
        !BlocklyBB.isTextMinikernelActive()) {
        Object.assign(siblingFiles, await getDpcPlusNoScoreSiblingFiles(siblingFiles));
      }
      Object.assign(siblingFiles, await getDpcPlusProgramSiblingFile((configurationStorage.value || {}).kernel, {
        audio: Object.keys(BlocklyBB.dpcAudioFiles || {}).length > 0,
        math: !!(BlocklyBB.usesDivMulRoutine() && fastMathOn(configurationStorage.value || {})),
      }));
      const compiled = await compileBatariBasicToAsm(preprocessed, siblingFiles, log);
      shareDpcPlusPlayerData(compiled, configurationStorage.value);
      appendCompileLog('Assembling ROM...', 'stage');
      const compiledResult = await assembleBatariBasic(compiled.mainAsm, compiled.workDir, log);
      // The ROM itself is fully compiled and valid at this point - a failure
      // from here on is the PREVIEW emulator's problem, not a compile error,
      // and must never be reported (or retried into) as one. In particular,
      // if gopher2600.wasm has previously crashed (a fatal WASM trap - its
      // JS object reference survives, but every call into it throws "Go
      // program has already exited"), every future build would otherwise
      // permanently masquerade as a bBasic compile failure even though
      // nothing about the project or the compiler is actually broken.
      try {
        withGopher2600((gopher2600) => {
          gopher2600.loadRom(compiledResult.output, buildTvSpec);
          gopher2600.setKeypadMode('left', !!BlocklyBB.keypad0Used);
          gopher2600.setKeypadMode('right', !!BlocklyBB.keypad1Used);
        });
        recordLoadedRomForRecovery(compiledResult.output, buildTvSpec);
      } catch (previewError) {
        console.error('gopher2600-wasm: failed to load the compiled ROM into the preview emulator ' +
          '(the ROM itself compiled successfully) - try "Refresh emulator":', previewError);
      }

      setCompiledRomBytes(compiledResult);
      markRomUpToDate();
      const bankSizeKey = bankSizeKeyFor(config);
      const capacity = computeRomCapacity(compiledResult, bankSizeKey === 'dpcplus' ? 1 : 0, bankSizeKey === 'dpcplus');
      const maxBanks = BANK_COUNT_BY_ROMSIZE[bankSizeKey];
      // Safety net for the "third overflow shape" isOverflowError's
      // comment documents (Superchip + a pfres above 12 + a bankswitched ROM
      // above 8k): bank 1 can overflow its RORG'd segment without DASM
      // raising ANY recognizable error at all - the assembly reports success,
      // but the resulting binary is silently corrupt (confirmed directly: a
      // real project matching that exact combination built with no errors,
      // but showed garbled text and wrong scene graphics in the emulator,
      // traced to bank 1 actually being over its real capacity - fixed by
      // shrinking its content). computeRomCapacity's  bank1.freeBytes
      // going negative is the same unambiguous "doesn't fit" signal a
      // genuine assembler-caught overflow already gives the catch block
      // below - thrown here (before this build is ever treated as a success,
      // recorded as a relocation hint, or left loaded in the emulator) so
      // it's caught by that exact same isOverflowError branch instead of
      // duplicating the retry logic for this rare, quiet case. Scoped to
      // bankswitched ROMs only (maxBanks truthy) - a 2k/4k ROM has no other
      // bank to relocate into anyway, and DASM's  overflow detection
      // there isn't masked by a bankswitch trampoline the way this specific
      // failure mode requires.
      if (maxBanks && capacity && capacity.bank1 && capacity.bank1.freeBytes < 0) {
        throw new Error(
            `segment overflow (bank 1 measured ${-capacity.bank1.freeBytes} bytes over capacity, ` +
            'no assembler error raised)');
      }
      // romSize is stored alongside the measurement (not just the bank
      // contents) so a LATER build's  proactive relocation pre-pass (see
      // its  comment near the top of this function) can confirm this
      // capacity was actually measured under the SAME ROM size before
      // trusting it - bank 1's  usable-byte boundary genuinely differs
      // between a bankswitched and non-bankswitched build (only bankswitched
      // sizes pay for the hotspot-detection trampoline at all), so a cached
      // measurement from a since-changed ROM size would misinform rather
      // than help.
      const variableUsage = computeVariableUsage();
      // DPC+'s 4K of display RAM: the kernel's fixed buffers come first, and USERSTACK is where what is left starts (the
      // same figure the kernel reports as "DPC free RAM").
      const dpcPlusStack = compiledResult.symbolmap && compiledResult.symbolmap.USERSTACK;
      const dpcPlusRam = config.kernel === 'dpcplus' && dpcPlusStack !== undefined ?
        dpcPlusRamUsage(compiledResult.symbolmap) : undefined;
      const dpcPlusRamFree = dpcPlusRam ? dpcPlusRam.free :
        (config.kernel === 'dpcplus' && dpcPlusStack !== undefined ? 0x1000 - (dpcPlusStack & 0x0FFF) : undefined);
      setRomCapacity(capacity ?
        {...capacity, romSize: bankSizeKey, dpcPlusRamFree, dpcPlusRamItems: dpcPlusRam ? dpcPlusRam.items : undefined,
          bankContents: maxBanks ? computeBankContents(maxBanks, textMinikernelActive, titleScreenKernelActive) : undefined,
          variableUsage} :
        capacity);
      // Where each variable lives, for the emulator's debug info.
      setDebugVariables(collectDebugVariables(variableUsage, compiledResult.symbolmap));
      // Remembers THIS build's  final layout as the next build's
      // first-attempt hint (see seedRelocationBanksFromLastSuccess's
      // comment in relocation-banks.js) - recorded on every success, not
      // just ones that needed relocation at all, so a project that fits in
      // bank 1 alone keeps skipping straight to a real compile too (an empty
      // banks object is itself a perfectly valid, useful "hint").
      squeeze = null;
      goodCapacity = capacity;
      // (A layout that came from the last good build, and worked again, was squeezed then.)
      if (!(attempt === 0 && seededFromLastSuccess) && trySqueeze(capacity)) continue;
      recordSuccessfulRelocationBanks(bankSizeKey);
      appendCompileLog('Build succeeded.', 'stage');
      appendCompileLog(`Total build time: ${Math.round(performance.now() - buildStartedAt)}ms.`, 'stage');
      return true;
    } catch (e) {
      if (squeeze) {
        // The move did not work out: back to the layout of the last good build, which is still the ROM that is loaded.
        squeeze.members.forEach(({kind, name}) => setRelocationBank(kind, name, squeeze.from));
        squeezeTried.add(squeeze.key);
        squeeze = null;
        appendCompileLog('That did not fit: keeping the previous layout.');
        if (trySqueeze(goodCapacity)) continue;
        regenerateCode();
        recordSuccessfulRelocationBanks(bankSizeKeyFor(configurationStorage.value || {}));
        appendCompileLog('Build succeeded.', 'stage');
        appendCompileLog(`Total build time: ${Math.round(performance.now() - buildStartedAt)}ms.`, 'stage');
        return true;
      }
      lastCode = code;
      lastFailure = e;
      // The seeded first attempt (see seedRelocationBanksFromLastSuccess
      // above) didn't pan out - abandon it completely rather than patching
      // further on top of it, so every attempt from here on behaves
      // identically to how this retry loop has always worked (see this
      // block's  git history/comments below), starting from true
      // scratch exactly like a never-seeded build's  first failure would.
      if (attempt === 0 && seededFromLastSuccess) resetRelocationBanks();
      // Several overflows in: the code has to get smaller, so the variables that did not have to go in Display RAM stay where they are.
      if (attempt >= SPILL_TIGHT_AFTER_ATTEMPTS) BlocklyBB.spillTight = true;
      const maxBanks = BANK_COUNT_BY_ROMSIZE[bankSizeKeyFor(config)];
      if (isOverflowError(e) && maxBanks && !isDpcPlusGraphicsOverflow(e)) {
        // Diagnostic-only for now (see bb-compiler.js's  comment on
        // partialOutput/partialSymbolmap) - not read by anything below yet.
        // DASM writes its symbol table incrementally as it assembles, so an
        // overflow caught partway through a LATER bank can still leave an
        // earlier bank's  boundary-adjacent symbols (e.g. "scoretable")
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
            const partialCapacity = computeRomCapacity({output: e.partialOutput, symbolmap: e.partialSymbolmap},
                bankSizeKeyFor(config) === 'dpcplus' ? 1 : 0, bankSizeKeyFor(config) === 'dpcplus');
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
        const reservedMusicBank = musicReservedBank(maxBanks, textMinikernelActive, minRelocationBankFor(config));
        const banks = getRelocationBanks();
        let candidate = pickRelocationCandidate(banks, !!reservedMusicBank, primaryBankFor(config));
        let bank = candidate && (
          candidate.kind === 'musicBanks' && reservedMusicBank ?
            reservedMusicBank :
            pickNextBank(banks, maxBanks, textMinikernelActive,
                reservedMusicBank ? new Set([reservedMusicBank]) : null, minRelocationBankFor(config),
                (candidate.members || [candidate]).map(({kind}) => kind)));

        // The bank that is too full is not the one the units start in: moving more out of that one does not help, the bank that
        // is over has to give up some of its units (the fallback just below does that).
        const overflowingBank = parseOverflowingBank(e.dasmStdout);
        const emptyThisBank = overflowingBank !== null && overflowingBank !== primaryBankFor(config) && overflowingBank !== 1 &&
          overflowingBank >= minRelocationBankFor(config) && relocatedThisBuild.length ? overflowingBank : null;
        if (emptyThisBank !== null) {
          candidate = null;
          bank = null;
        }

        // Bank 1 itself (not some other bank) is over capacity, AND nothing
        // is left in it to relocate out (candidate came back empty just
        // above) - the stuckBank fallback right below this exists to shuffle
        // content between OTHER banks, which can never shrink bank 1's own
        // fixed/mandatory footprint (the trampoline, score table, and
        // whatever of the project's own code can't be relocated at all).
        // Every one of the up-to-64 remaining attempts would fail identically
        // no matter what gets shuffled where, so this stops immediately with
        // the real, exact number instead of burning through all of them
        // first - confirmed directly against a bare-minimum DPC+ project
        // (kernel's own fixed header/score-table/startup overhead alone
        // already leaves less than a full 4096-byte bank1 budget available,
        // unlike the standard kernel).
        if (!candidate) {
          const freeBytes = parseBank1FreeBytesEcho(e.dasmStdout);
          if (freeBytes != null && freeBytes < 0) {
            appendCompileLog('Build failed.', 'error');
            const bank1Error = new Error(
                `Bank 1 is ${-freeBytes} bytes over capacity, and every relocatable unit is already ` +
                'in another bank - nothing left to move out of bank 1 to fix this. Reduce bank 1\'s ' +
                'own fixed content (fewer/simpler always-resident events, a shorter startup routine, ' +
                'DPC+\'s own always-included score table, etc.) rather than adding more content ' +
                'elsewhere.');
            showError(errorStorage, 'Error while compiling bBasic code', code, bank1Error);
            return false;
          }
        }

        // Fallback for when nothing is left in bank 1 to relocate, but some
        // OTHER bank turns out to be too full too - the one case
        // pickRelocationCandidate structurally can't handle by itself,
        // since it only ever looks at units still sitting in bank 1.
        //
        // Systematically empties out ONE bank at a time (stuckBank, chosen
        // once and then held onto across attempts - see its  comment
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
        // (its  generated body is nearly empty), then a small animation,
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
            kind === 'eventBanks' ? BlocklyBB.estimateEventSize(name) * COMPILED_BYTES_PER_EVENT_CHAR :
            kind === 'graphicsBanks' ? BlocklyBB.estimateGraphicsUnitSize(name) * COMPILED_BYTES_PER_GRAPHICS_CHAR :
            kind === 'musicBanks' ? BlocklyBB.estimateMusicUnitSize(name) :
            kind === 'functionBanks' ? BlocklyBB.estimateFunctionSize(name) * COMPILED_BYTES_PER_SUBROUTINE_CHAR :
            BlocklyBB.estimateSubroutineSize(name) * COMPILED_BYTES_PER_SUBROUTINE_CHAR
          );
          // A function or function_call_statement wrapper subroutine can
          // never be picked as a co-resident on its  here - see
          // computeFunctionFamilies'  comment: it has no bank-tag syntax,
          // so it can only ever move together with the rest of
          // its family. Resolved once per rederive (not per member found
          // below) since it's cheap and this fallback path is already rare.
          const wrapperNames = BlocklyBB.functionCallWrapperNames || new Set();
          const functionFamilies = computeFunctionFamilies();
          const familyForMember = (kind, name) => functionFamilies.find(
              ({members}) => members.some((m) => m.kind === kind && m.name === name));
          const familyUnitKey = (members) =>
            `family:${members.map((m) => `${m.kind}:${m.name}`).sort().join('|')}`;

          stuckBank = null;
          for (let rederive = 0; !candidate && rederive < maxBanks; rederive++) {
            if (stuckBank === null) {
              // The bank a relocation actually landed in is already recorded
              // directly on its  relocatedThisBuild entry - no need to
              // look it back up through banks[kind][name], which (unlike
              // "bank" here) has no sensible meaning for a multi-member
              // family's  synthetic "family" kind.
              // The bank the assembler reported, or else the fullest by the estimates (the last unit moved is not a better
              // guess: the units go to the emptiest bank, so it is the one least likely to be too full).
              const bankBytes = estimateBankBytes(banks);
              const poolBanks = Object.keys(bankBytes).map(Number).filter((bank) =>
                bank >= minRelocationBankFor(config) && bank !== reservedMusicBank);
              stuckBank = emptyThisBank !== null ? emptyThisBank : poolBanks.length ?
                poolBanks.reduce((best, bank) => (bankBytes[bank] > bankBytes[best] ? bank : best)) :
                relocatedThisBuild[relocatedThisBuild.length - 1].bank;
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
            // A music unit always goes straight back to its  reserved
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
              // Balanced by current occupancy (same as pickNextBank's
              // primary use above), not just "lowest untried bank number" -
              // confirmed directly as a real bug: the untried-lowest-number
              // version piled the vast majority of a project's content into
              // bank 2 while later banks sat completely empty, since once
              // bank 1's "still there" candidates run out (which happens
              // within the first few attempts), nearly every relocation for
              // the rest of the build goes through this exact fallback path.
              // Every bank already tried for THIS unit (triedBanks, which
              // already includes stuckBank - added a few lines above) is a
              // HARD exclusion, not a soft penalty - see pickNextBank's
              // comment for why a softer version of this (letting a
              // previously-tried bank stay pickable, just deprioritized)
              // caused a different real bug, a unit oscillating forever
              // between the same two equally-penalized banks.
              const excludeBanks = new Set([reservedMusicBank, ...triedBanks].filter(Boolean));
              let nextBank = pickNextBank(banks, maxBanks, textMinikernelActive, excludeBanks,
                  minRelocationBankFor(config), [next.kind], primaryBankFor(config));
              // Every available bank has now been tried for this ONE unit
              // (not the whole build - see the outer stuckBank exhaustion
              // check above, a separate case) - rather than give up on it
              // for the rest of the build the way a permanent hard exclusion
              // would, its  tried-set is reset here and it gets one more
              // fresh attempt (still never straight back to stuckBank
              // itself, the one place a move is guaranteed to be a no-op).
              // A bank that didn't fit this unit alongside 40 attempts' worth
              // of OTHER since-moved content may well fit it now that
              // everything around it has changed.
              if (!nextBank) {
                triedBanks.clear();
                triedBanks.add(stuckBank);
                nextBank = pickNextBank(banks, maxBanks, textMinikernelActive,
                    new Set([reservedMusicBank, stuckBank].filter(Boolean)), minRelocationBankFor(config), [next.kind],
                    primaryBankFor(config));
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
          // real problem the user needs to act on (see isOverflowError's
          // comment); only a failure that survives every retry (below) is
          // shown in red.
          appendCompileLog(
              `Bank overflow - relocating ${candidate.kind.replace('Banks', '')} "${candidate.name}" to bank ${bank}, retrying...`);
          // The assembler says how many bytes the bank is over by, so units are moved until about that many bytes are out, not one
          // per compile (each compile takes seconds).
          const scaledBytes = (unit) => unit.size * (unit.kind === 'eventBanks' ? COMPILED_BYTES_PER_EVENT_CHAR :
            unit.kind === 'graphicsBanks' ? COMPILED_BYTES_PER_GRAPHICS_CHAR :
            unit.kind === 'musicBanks' ? 1 : COMPILED_BYTES_PER_SUBROUTINE_CHAR);
          let stillOver = parseBankOverflowBytes(e.dasmStdout, primaryBankFor(config)) - scaledBytes(candidate);
          while (stillOver > 0 && emptyThisBank === null) {
            const more = pickRelocationCandidate(getRelocationBanks(), !!reservedMusicBank, primaryBankFor(config));
            if (!more || more.kind === 'musicBanks') break;
            const moreBank = pickNextBank(getRelocationBanks(), maxBanks, textMinikernelActive,
                reservedMusicBank ? new Set([reservedMusicBank]) : null, minRelocationBankFor(config),
                (more.members || [more]).map(({kind}) => kind));
            if (!moreBank) break;
            (more.members || [{kind: more.kind, name: more.name}]).forEach(({kind, name}) => setRelocationBank(kind, name, moreBank));
            relocatedThisBuild.push({kind: more.kind, name: more.name, bank: moreBank, members: more.members});
            appendCompileLog(`Also relocating ${more.kind.replace('Banks', '')} "${more.name}" to bank ${moreBank}.`);
            stillOver -= scaledBytes(more);
          }
          continue;
        }
      }
      appendCompileLog('Build failed.', 'error');
      // Appended so a failure can be fully diagnosed from just the copy-pasted
      // error banner text - same info someone would otherwise have to open
      // devtools and read hooks/relocation-banks.js's in-memory state to get.
      // relocatedThisBuild is this build's  history (what got moved where,
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
      const titleScreenHint = titleScreenOverflowHint(e);
      const annotatedError = new Error(
          `${e.message}${titleScreenHint.text}${romSizeOverflowHint(e, config)}\n\n` +
          `Bank assignments at failure:\n${JSON.stringify(diagnostics, null, 2)}`);
      showError(errorStorage, 'Error while compiling bBasic code', code, annotatedError, titleScreenHint.highlight);
      return false;
    }
  }
  // Reached only if every single attempt up to MAX_RELOCATION_ATTEMPTS kept
  // finding SOME new combination worth trying (see the retry loop's
  // comment) without ever actually succeeding - i.e. genuine exhaustion of
  // the attempt budget itself, not the "nothing left to try" case the loop
  // above already reports by itself (that one returns straight from inside
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
  const titleScreenHint = titleScreenOverflowHint(lastFailure);
  showError(errorStorage, 'Error while compiling bBasic code', lastCode,
      new Error(`${(lastFailure && lastFailure.message) || 'Ran out of relocation attempts.'}\n\n` +
        `Gave up after trying ${MAX_RELOCATION_ATTEMPTS} different bank combinations without finding one ` +
        `that compiles.${titleScreenHint.text}${romSizeOverflowHint(lastFailure, configurationStorage.value)}\n\n` +
        `Bank assignments at failure:\n${JSON.stringify(diagnostics, null, 2)}`), titleScreenHint.highlight);
  return false;
};

// A synthetic single-block program - "On Title screen update: Draw title
// screen [screenId]" - matching the exact pattern titlescreen_draw's
// tooltip recommends ("call this repeatedly... for as long as you want it
// shown"). No "Change state to Title screen" block needed alongside it:
// bbasic.bb.hbs's template (see systemStartEvent/titleStartEvent/
// titleUpdateEvent) already runs Title state unconditionally right after
// boot, before ever falling into the main gameplay loop - title_update
// starts running every frame from power-on with no explicit state block at
// all, exactly like a real project's title screen normally starts out.
const buildTitleScreenPreviewXml = (screenId) =>
  `<xml xmlns="https://developers.google.com/blockly/xml">` +
    `<block type="event_block">` +
      `<field name="EVENT">title_update</field>` +
      `<statement name="DO">` +
        `<block type="titlescreen_draw">` +
          `<field name="SCREEN">${screenId}</field>` +
        `</block>` +
      `</statement>` +
    `</block>` +
  `</xml>`;

/**
 * Compiles a tiny, throwaway ROM that does nothing but show one Title
 * screen page, and loads it into the preview emulator - lets a single card
 * be test-played without building (or disturbing) the real project's
 * compiled ROM, "ROM up to date" status, ROM capacity numbers, or Generated
 * Code tab content, all of which stay exactly as they were before this was
 * called. Deliberately NOT a thin wrapper around buildRom() above - that
 * function's side effects (setCompiledRomBytes/markRomUpToDate/
 * setRomCapacity/recordSuccessfulRelocationBanks/useGeneratedBasic) are all
 * specifically about the REAL project's last build, and would have
 * been silently overwritten with data about this one-off synthetic program
 * instead had this reused it directly.
 * @param {number|string} screenId Which Title Screen tab page to show
 *   (screen.id, same value titlescreen_draw's SCREEN field expects).
 * @return {!Promise<boolean>} Whether the preview ROM was built and loaded.
 */
export const buildTitleScreenPreviewRom = (screenId) => buildPreviewRom({
  name: `Title Screen ${screenId}`,
  xml: buildTitleScreenPreviewXml(screenId),
  titleScreen: true,
});

// Same throwaway-ROM preview for one Background tab card: "System start:
// Background [id]", then the normal game loop draws it. The ROM only
// contains what that block uses (unused backgrounds are left out).
// The block that shows a preview's name on the Text Minikernel's first line:
// centered when it fits the 12 characters of the row, scrolled when longer.
const previewNameBlockXml = (name) => {
  const text = String(name || '').toUpperCase().split('').map((char) => CHAR_TO_GLYPH[char] ? char : ' ').join('').trim();
  const escape = (value) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (text.length > TEXT_MESSAGE_LENGTH) {
    const number = (value) => `<shadow type="math_number"><field name="NUM">${value}</field></shadow>`;
    return `<block type="text_minikernel_show_scroll"><field name="TEXT">${escape(text)}</field>` +
      `<field name="START_AT_END">FALSE</field>` +
      `<value name="SCROLL_SPEED">${number(8)}</value><value name="SCROLL_PAUSE">${number(30)}</value>`;
  }
  const centered = ' '.repeat(Math.floor((TEXT_MESSAGE_LENGTH - text.length) / 2)) + text;
  return `<block type="text_minikernel_show"><field name="TEXT">${escape(centered)}</field>`;
};

// Setting every preview needs: the 12-character row, and the score (which
// the text replaces) left on.
const PREVIEW_TEXT_CONFIG = {
  textMaxDisplayWidth: TEXT_MESSAGE_LENGTH,
  scoreBkColor: 0,
  // The debug displays that write numbers into the score.
  enableCycleScore: false,
  enableScanlinesDebug: false,
};

export const buildBackgroundPreviewRom = (backgroundId, name) => {
  // Both players hidden, so only the background shows.
  const hide = (player) => `<block type="sprite_player_set"><field name="PLAYER">${player}</field>` +
    `<field name="VAR">player${player}visibility</field><value name="VALUE"><shadow type="math_number">` +
    `<field name="NUM">0</field></shadow></value>`;
  const steps = [
    `<block type="background_set_select"><field name="VAR">${backgroundId}</field>`,
    // The screen behind the playfield is black.
    `<block type="background_set_color"><field name="VAR">COLUBK</field><value name="VALUE">` +
      `<shadow type="math_number"><field name="NUM">0</field></shadow></value>`,
    previewNameBlockXml(name),
    hide(0),
    hide(1),
  ];
  const chain = steps.map((step) => step + '<next>').join('') + steps.map(() => '</next></block>').join('');
  return buildPreviewRom({
    name: name ? `Background ${backgroundId} (${name})` : `Background ${backgroundId}`,
    // The score area is left out whether score fade is on or off, so the text row sits in the same place.
    configOverride: {...PREVIEW_TEXT_CONFIG, showScore: false},
    xml: `<xml xmlns="https://developers.google.com/blockly/xml">` +
      `<block type="event_block"><field name="EVENT">system_start</field>` +
      `<statement name="DO">${chain}</statement></block></xml>`,
  });
};

// Same for one Player tab animation: only Player 0 shows, playing that
// animation (looping) roughly centered on a black screen with no playfield.
// animationIndex is its position in the list (the value the "set animation"
// block's dropdown holds). centerX is the middle of the lit pixels (in sprite
// pixels from the left, over every frame), height the sprite's height in rows
// and widthScale 1/2/4, so the sprite ends up centered.
export const buildPlayerAnimationPreviewRom = (animationIndex, centerX, height, widthScale, spriteColors, name) => {
  const num = (value) => `<value name="VALUE"><shadow type="math_number">` +
    `<field name="NUM">${value}</field></shadow></value>`;
  const setPlayer = (player, variable, value) =>
    `<block type="sprite_player_set"><field name="PLAYER">${player}</field>` +
    `<field name="VAR">player${player}${variable}</field>${num(value)}`;
  // A player's x is one more than the screen pixel its left edge sits on, so
  // the middle of the 160-pixel screen is x 81 for a sprite's middle. A player's
  // y is the BOTTOM of the sprite (it is drawn upwards from there, one row per
  // 2 scanlines, and the first scanline of the picture is about y 1). The
  // sprite area runs from y 1 down through the playfield's rows (each as many y
  // units tall as the playfield's row divisor), the score below it, so its
  // middle is half way along that and the sprite's bottom goes half its height
  // below it.
  const config = useConfigurationStorage().value || {};
  const middle = effectiveBackgroundRows(config) * pfRowDivisorFor(config) / 2 - 1;
  const x = Math.round(81 - centerX * (widthScale || 1));
  // The block that sets y converts the standard kernel's units for DPC+ (2 * y minus the tallest sprite's height in
  // lines, see sprite_player_set), so the value is worked back from where the top edge should be: the sprite
  // centered on the shortened screen the text leaves (the preview always hides the score).
  const dpcPlus = config.kernel === 'dpcplus';
  const y = dpcPlus ?
    Math.min(191, Math.max(1, Math.round((dpcPlusTextScreenLines(false, false, true) / 2 - (height || 8) +
      BlocklyBB.dpcPlusSpriteLines()) / 2))) :
    Math.min(191, Math.max(1, Math.round(middle + (height || 8) / 2)));
  const steps = [
    // Playfield memory (Superchip RAM, say) holds whatever the emulator powered up with, which would show as lines.
    `<block type="background_clear">`,
    `<block type="background_set_color"><field name="VAR">COLUBK</field>${num(0)}`,
    // 0 = no background: the game loop would otherwise load background 1 on its first pass.
    `<block type="background_set">${num(0)}`,
    previewNameBlockXml(name),
    setPlayer(1, 'visibility', 0),
    // White unless the animation has row colors.
    ...(spriteColors ? [] : [setPlayer(0, 'realcolor', 0x0E)]),
    setPlayer(0, 'x', x),
    setPlayer(0, 'y', y),
    `<block type="sprite_player_set_animation"><field name="PLAYER">0</field>` +
      `<field name="VAR">${animationIndex}</field><field name="LOOP">TRUE</field>`,
  ];
  // Each block nests inside the previous one's <next>.
  const chain = steps.map((step) => step + '<next>').join('') + steps.map(() => '</next></block>').join('');
  return buildPreviewRom({
    name: `Player animation ${animationIndex}`,
    // The score area is left out, as in the Background preview, so the text row sits in the same place on every kernel.
    configOverride: {...PREVIEW_TEXT_CONFIG, showScore: false, previewAnimationOnly: animationIndex,
      ...(spriteColors ? {enablePlayer0SpriteColors: true, enablePlayer1SpriteColors: true} : {})},
    xml: `<xml xmlns="https://developers.google.com/blockly/xml">` +
      `<block type="event_block"><field name="EVENT">system_start</field>` +
      `<statement name="DO">${chain}</statement></block></xml>`,
  });
};

const buildPreviewRom = async ({name, xml, titleScreen = false, configOverride = null}) => {
  // See buildInProgress's comment near the top of this file - running
  // this concurrently with a real buildRom() (or another preview) corrupted
  // BOTH builds' output before this guard existed, since they share
  // Blockly.BBasic's module-level scratch state across the awaits either
  // one's WASM-backed compile pipeline yields on.
  if (buildInProgress.value) {
    appendCompileLog('Another build is already in progress - try again once it finishes.', 'error');
    return false;
  }
  buildInProgress.value = true;
  setEmulatorPaused(true);
  const errorStorage = useErrorStorage();
  const configurationStorage = useConfigurationStorage();
  try {
    clearCompileLog();
    appendCompileLog(`Building a preview of ${name}...`, 'stage');
    // Starts every preview from a clean slate rather than whatever
    // relocation state the last REAL build (or a previous preview) happened
    // to leave behind - resetRelocationBanks()'s effect is purely an
    // in-memory working set for whichever build is currently running, not
    // anything that needs to be restored again afterward for the real
    // project's next build to behave correctly (that build resets it
    // again itself, the same first step buildRomInner() above always takes).
    resetRelocationBanks();
    // Gives the Titlescreen Kernel a bank to itself, matching the
    // Titlescreen Kernel's documentation ("make sure that the minikernel
    // has the bank fully to itself" - its troubleshooting section). Pinning
    // _titlescreen_system to bank 2 alone isn't enough, though - confirmed
    // directly (raw main.asm inspection) that the trailing "bank 1"
    // statement generateRelocatedSections emits after a relocated section
    // is silently a no-op once a LATER bank has already been opened (DASM
    // only supports moving forward through banks, never back to one already
    // closed) - so everything compiled after it (the standard kernel's
    // always-appended files: pf_drawing/pf_scrolling/std_routines/
    // score_graphics/the footer) stayed stuck in bank 2 right alongside
    // _titlescreen_system instead of correctly landing back in bank 1,
    // exactly the entanglement the Kernel's docs warn about. Also
    // relocating gameover_start - a real event this synthetic program
    // already has, entered only via "Change state to Gameover" (never used
    // here, so nothing actually calls it - genuinely inert) - to bank 3
    // gives the file a bank AFTER the title screen's, so bank 2 closes via
    // a real forward transition (confirmed working) instead of being the
    // last bank in the file, and the standard kernel's trailing files land
    // in bank 3 instead of bank 2. gameover_start's exit already cross-
    // bank-jumps to wherever gameover_update ends up (still bank 1), the
    // same mechanism every other relocated event already relies on.
    if (titleScreen) {
      setRelocationBank('subroutineBanks', TITLE_SCREEN_SUBROUTINE_NAME, 2);
      setRelocationBank('eventBanks', 'gameover_start', 3);
    }
    let code;
    // The TV standard this code was generated for, read now - the compile
    // below is async, and the standard can be changed meanwhile, which would
    // pair a ROM built for one standard with the emulator spec of the other.
    let buildTvSpec;
    try {
      if (configOverride) {
        // The generator reads the project's options, so the override is in
        // place only for this synchronous generation and put straight back
        // (nothing is saved).
        const original = configurationStorage.value;
        configurationStorage.value = {...(original || {}), ...configOverride};
        // The project's Text tab messages are left out too: the name must sit
        // within the first 256 bytes of the text table (the Text Minikernel
        // indexes it with one byte), and a project with many messages pushed
        // the name past that, so only its first characters showed.
        const textStrings = useTextStringsStorage();
        const originalTextStrings = textStrings.value;
        // Writing either setting flags the real ROM as out of date; this is
        // temporary, so put that flag back as it was.
        const romOutdated = useRomOutdated();
        const wasOutdated = romOutdated.value;
        textStrings.value = {textStrings: []};
        try {
          code = regenerateCode(xml);
        } finally {
          configurationStorage.value = original;
          textStrings.value = originalTextStrings;
          romOutdated.value = wasOutdated;
        }
      } else {
        code = regenerateCode(xml);
      }
      // The score digits stay (the text sits beneath them) but are drawn in
      // black on the black score strip (scoreBkColor below), so they can't be seen. Plain string search,
      // a no-op if the template ever changes.
      if (!titleScreen) {
        code = code.replace(' pfscorecolor = scorecolor', ' scorecolor = 0' + String.fromCharCode(10) + ' pfscorecolor = scorecolor');
      }
      buildTvSpec = emulatorTvSpec(useConfigurationStorage().value || {});
      // Left as the project's configured ROM size (Configuration.vue)
      // whenever it already has room for banks 1/2/3 above (bankswitched,
      // 16k or bigger) - confirmed directly as a real bug to override it
      // unconditionally: the generator's bank bookkeeping (which banks
      // must exist, reserved-bank placement, etc.) reads the REAL
      // configured romSize DURING regenerateCode() above, so forcing a
      // DIFFERENT value into the text afterward left the generator's
      // internal assumptions and the final "set romsize" text disagreeing -
      // surfaced as nonsensical bank numbers/addresses (e.g. "bank10" at a
      // $15000+ address) once the project's real setting was something
      // other than what this used to force it to. Only bumped up (and
      // ONLY the text, since this throwaway preview never gets saved/
      // exported, so nothing depends on it matching the project's real
      // cartridge size) when the project's setting genuinely doesn't have
      // room for the title screen kernel's bank at all (2k/4k/8k - not
      // bankswitched, or bankswitched with fewer than 3 banks) - \r?
      // before the end anchor is required, not optional tidiness -
      // bbasic.bb.hbs (the template this line comes from) is saved with
      // CRLF line endings, so without it \S+$ silently fails to match at
      // all (confirmed directly against a plain "\n" test string, which
      // matched fine, vs the real "\r\n" content, which didn't).
      const config = configurationStorage.value || {};
      if (titleScreen && (BANK_COUNT_BY_ROMSIZE[config.romSize] || 0) < 3) {
        code = code.replace(/^(\s*set romsize )(\S+)(\r?)$/m,
            (full, prefix, value, cr) => `${prefix}16k${/SC$/i.test(value) ? 'SC' : ''}${cr}`);
      }
    } catch (e) {
      appendCompileLog('Failed to generate the preview bBasic code.', 'error');
      showError(errorStorage, `Error while generating ${name} preview code`, code, e);
      return false;
    }
    try {
      errorStorage.value = '';
      // No text minikernel/custom score font override siblings here (see
      // buildRomInner's much longer equivalent block above) - this
      // synthetic program has no text/score blocks at all, so BlocklyBB.
      // isTextMinikernelActive() is always false for it regardless of what
      // the real project uses, and there's no user-edited score font to
      // splice in - bB's stock score_graphics.asm is left as-is rather
      // than overridden with getExtendedScoreGraphics() the way
      // buildRomInner's default path does. An earlier version of this
      // forced the extended file unconditionally, on the theory that the
      // stock file didn't fit this toolchain's bank layout - confirmed
      // directly (by line count) as the wrong fix instead: the extended
      // file is 2924 lines against the stock file's 207, adding many more
      // ALWAYS-compiled symbol tables (hex/dollar/pound/etc.) regardless of
      // which font is selected, not just the chosen font's digits - real
      // extra ROM bytes that made bank 3's overflow worse, not better.
      // The name shown on the Text Minikernel (background and sprite
      // previews) needs its asm files next to the source; a copy, since the
      // cached object is shared (see buildRomInner).
      const previewDpcPlus = (configurationStorage.value || {}).kernel === 'dpcplus';
      const siblingFiles = BlocklyBB.isTextMinikernelActive() ?
        {...(previewDpcPlus ? await getDpcPlusTextMinikernelSiblingFiles(BlocklyBB.isTextRow2Used(), !!BlocklyBB.textScrollCursorUsed,
            ((configurationStorage.value || {}).showScore ?? true) === false) : await getTextMinikernelSiblingFiles())} : {};
      Object.assign(siblingFiles, BlocklyBB.playerAnimAsmFiles || {});
      if (BlocklyBB.usesDivMulRoutine() && fastMathOn(configurationStorage.value || {})) {
        Object.assign(siblingFiles, await getFastMathSiblingFiles((configurationStorage.value || {}).kernel));
      }
      if (BlocklyBB.isTextMinikernelActive()) {
        const textKernelFile = previewDpcPlus ? 'text12DPCplus.asm' : 'text12b.asm';
        const textFontOverride = await buildTextFontOverride(previewDpcPlus ? siblingFiles[textKernelFile] : null);
        if (textFontOverride) siblingFiles[textKernelFile] = textFontOverride;
      }
      if (BlocklyBB.titleScreenUsedKernelKeys) {
        Object.assign(siblingFiles, await getTitleScreenSiblingFiles(BlocklyBB.titleScreenUsedKernelKeys, !!BlocklyBB.titleScreenHasScoreCard));
        Object.assign(siblingFiles, BlocklyBB.titleScreenAsmFiles || {});
      }
      const log = (text) => appendCompileLog(text);
      appendCompileLog('Preprocessing...', 'stage');
      // Sprite frames that repeat are cut out of the source batari Basic compiles (see utils/dpc-share-source.js).
      const sharedSource = (configurationStorage.value || {}).kernel === 'dpcplus' ? shareDpcPlusPlayerSource(code) : null;
      const preprocessed = await preprocessBatariBasic(sharedSource ? sharedSource.code : code, log);
      appendCompileLog('Compiling to assembly...', 'stage');
      Object.assign(siblingFiles, await getDpcPlusAudioSiblingFiles(siblingFiles, BlocklyBB.dpcAudioFiles));
      // A hidden score gives its scanlines to the picture (the Text Minikernel's score row stays, it draws the text).
      if ((configurationStorage.value || {}).kernel === 'dpcplus' && ((configurationStorage.value || {}).showScore ?? true) === false &&
        !BlocklyBB.isTextMinikernelActive()) {
        Object.assign(siblingFiles, await getDpcPlusNoScoreSiblingFiles(siblingFiles));
      }
      Object.assign(siblingFiles, await getDpcPlusProgramSiblingFile((configurationStorage.value || {}).kernel, {
        audio: Object.keys(BlocklyBB.dpcAudioFiles || {}).length > 0,
        math: !!(BlocklyBB.usesDivMulRoutine() && fastMathOn(configurationStorage.value || {})),
      }));
      const compiled = await compileBatariBasicToAsm(preprocessed, siblingFiles, log);
      shareDpcPlusPlayerData(compiled, configurationStorage.value);
      appendCompileLog('Assembling ROM...', 'stage');
      const compiledResult = await assembleBatariBasic(compiled.mainAsm, compiled.workDir, log);
      try {
        withGopher2600((gopher2600) => {
          gopher2600.loadRom(compiledResult.output, buildTvSpec);
          gopher2600.setKeypadMode('left', false);
          gopher2600.setKeypadMode('right', false);
        });
        recordLoadedRomForRecovery(compiledResult.output, buildTvSpec);
      } catch (previewError) {
        console.error('gopher2600-wasm: failed to load the preview ROM into the emulator ' +
          '(the ROM itself compiled successfully) - try "Refresh emulator":', previewError);
      }
      appendCompileLog('Preview build succeeded.', 'stage');
      return true;
    } catch (e) {
      appendCompileLog('Preview build failed.', 'error');
      // Unlike the real build, there's no relocation retry loop to burn
      // through here - _titlescreen_system either fits its dedicated bank
      // or it doesn't, so an overflow-shaped failure here is title screen
      // data almost by construction (this build compiles nothing else that
      // could overflow a bank by itself). Still phrased as a hint, not a
      // certainty - see titleScreenOverflowHint's comment.
      const titleScreenHint = isOverflowError(e) ? titleScreenOverflowHint(e) : {text: '', highlight: ''};
      const annotatedError = isOverflowError(e) ? new Error(`${e.message}${titleScreenHint.text}`) : e;
      showError(errorStorage, `Error while compiling ${name} preview code`, code, annotatedError,
          titleScreenHint.highlight);
      return false;
    }
  } finally {
    buildInProgress.value = false;
    setEmulatorPaused(false);
  }
};
