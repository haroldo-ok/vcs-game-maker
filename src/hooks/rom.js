'use strict';

import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

import Blockly from 'blockly';
import {preprocessBatariBasic, compileBatariBasicToAsm, assembleBatariBasic} from './bb-compiler';

import '../blocks';
import BlocklyBB, {RELOCATABLE_EVENT_NAMES} from '../generators/bbasic';
import {getExtendedScoreGraphics, getTextMinikernelSiblingFiles} from '../generators/bbasic/text-minikernel-files';
import {buildScoreFontOverride, SQUISH_SCORE_FONT} from '../utils/score-font';
import {showError} from '../utils/build-error';
import {computeRomCapacity} from '../utils/rom-capacity';
import {useGeneratedBasic} from './generated';
import {useConfigurationStorage, useErrorStorage, useWorkspaceStorage} from './project';
import {getRelocationBanks, resetRelocationBanks, setRelocationBank} from './relocation-banks';
import {setAutoRelocatedEvents, useAutoRelocatedEvents} from './relocated-events';
import {markRomUpToDate, markRomOutdated, useRomOutdated} from './rom-status';
import {setRomCapacity, useRomCapacity} from './rom-capacity';

Vue.use(VueCompositionApi);

export {markRomOutdated, useRomOutdated, useRomCapacity, useAutoRelocatedEvents};

const EMPTY_WORKSPACE = '<xml xmlns="https://developers.google.com/blockly/xml"/>';

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

// How many user-created variables the current project actually uses - needed
// to check whether disabling Superchip RAM would leave too few letters free
// for them (see Configuration.vue).
export const countUsedVariables = () =>
  withHeadlessWorkspace((workspace) => Blockly.Variables.allUsedVarModels(workspace).length);


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
const isOverflowError = (e) => /segment overflow|origin reverse-indexed/i.test((e && e.message) || '');

// How many physical banks each bankswitched ROM size actually provides
// (2k/4k don't bankswitch at all, so they're absent - overflowing there just
// surfaces the real error, with nowhere to relocate anything). Every bank
// past bank 1 is a valid relocation target - the standard kernel's
// bankswitch trampoline is duplicated at the same relative offset in every
// bank, and cross-bank calls work identically regardless of which bank
// number is used (confirmed for bank 2 directly against the compiler and
// the emulator - see the bank-targeting feasibility notes).
export const BANK_COUNT_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8};

// Largest-first, across every relocatable kind: relocating the biggest
// still-inline unit (event, graphics - a background, a player's default
// frame, or a single named animation, see wrapRelocatableGraphics - a
// user-defined subroutine, see getSubroutineBank in generators/bbasic.js -
// or music, see wrapRelocatableMusic, kept in its own separate pool/config
// key from graphics) frees the most bank 1 space per attempt, minimizing how
// many rebuild cycles are needed. Must run right after a regenerateCode()
// call, while every kind's size estimate is still current - graphics/music
// unit keys and subroutine names are only known after that call too, since
// they're generated from the project's own content rather than fixed like
// the event names.
const pickRelocationCandidate = (banks) => {
  const eventBanks = banks.eventBanks || {};
  const graphicsBanks = banks.graphicsBanks || {};
  const musicBanks = banks.musicBanks || {};
  const subroutineBanks = banks.subroutineBanks || {};
  const candidates = [
    ...RELOCATABLE_EVENT_NAMES
        .filter((name) => (eventBanks[name] || 1) === 1)
        .map((name) => ({kind: 'eventBanks', name, size: BlocklyBB.estimateEventSize(name)})),
    ...BlocklyBB.getGraphicsUnitKeys()
        .filter((name) => (graphicsBanks[name] || 1) === 1)
        .map((name) => ({kind: 'graphicsBanks', name, size: BlocklyBB.estimateGraphicsUnitSize(name)})),
    ...BlocklyBB.getMusicUnitKeys()
        .filter((name) => (musicBanks[name] || 1) === 1)
        .map((name) => ({kind: 'musicBanks', name, size: BlocklyBB.estimateMusicUnitSize(name)})),
    ...BlocklyBB.getSubroutineNames()
        .filter((name) => (subroutineBanks[name] || 1) === 1)
        .map((name) => ({kind: 'subroutineBanks', name, size: BlocklyBB.estimateSubroutineSize(name)})),
  ];
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.size - a.size)[0];
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
const pickNextBank = (banks, maxBanks, textMinikernelActive, excludeBank, extraExcluded) => {
  const highestBank = textMinikernelActive ? maxBanks - 1 : maxBanks;
  if (highestBank < 2) return null;
  const counts = {};
  for (let bank = 2; bank <= highestBank; bank++) {
    if (bank !== excludeBank && !(extraExcluded && extraExcluded.has(bank))) counts[bank] = 0;
  }
  if (!Object.keys(counts).length) return null;
  const tally = (unitBanks) => Object.values(unitBanks || {}).forEach((bank) => {
    if (counts[bank] !== undefined) counts[bank]++;
  });
  tally(banks.eventBanks);
  tally(banks.graphicsBanks);
  tally(banks.subroutineBanks);
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
  // it. Bank assignments deliberately aren't persisted across builds at
  // all (see relocation-banks.js's own comment for why) - a relocation
  // decision is cheap enough to remake from scratch every time that there's
  // no real cost, only the upside of every build reflecting exactly the
  // project as it stands right now.
  resetRelocationBanks();

  // Reverted: graphics used to also be relocated out of bank 1 PROACTIVELY
  // here, before the very first compile attempt, so a project that already
  // compiled fine wouldn't leave bank 1 packed tight while other banks sat
  // empty. Confirmed directly as a net loss on a large, already-tight
  // project: every relocated unit costs its own small entry/return
  // trampoline (wrapRelocatableGraphics) that plain inline code in bank 1
  // doesn't pay - forcing ALL graphics out unconditionally, even ones that
  // never needed to move, added enough total overhead across a project with
  // many graphics units to cost more room than it freed, turning some
  // builds that used to compile into failures. Back to purely reactive
  // relocation below (only ever moves a unit once a real compile attempt
  // proves bank 1 doesn't fit as-is) for every relocatable kind alike.
  for (let attempt = 0; attempt <= MAX_RELOCATION_ATTEMPTS; attempt++) {
    let code;
    try {
      code = regenerateCode();
      useGeneratedBasic().value = code;
    } catch (e) {
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
      const preprocessed = await preprocessBatariBasic(code);
      const compiled = patchSuperchipPfColorsPointer(
          await compileBatariBasicToAsm(preprocessed, siblingFiles), config);
      const compiledResult = await assembleBatariBasic(compiled.mainAsm, compiled.workDir);
      Javatari.fileLoader.loadFromContent('main.bin', compiledResult.output);

      // TODO: Implement this without a global variable
      Javatari.compiledResult = compiledResult;
      markRomUpToDate();
      setRomCapacity(computeRomCapacity(compiledResult));
      setAutoRelocatedEvents(relocatedThisBuild);
      return true;
    } catch (e) {
      lastCode = code;
      lastFailure = e;
      const maxBanks = BANK_COUNT_BY_ROMSIZE[config.romSize];
      if (isOverflowError(e) && maxBanks) {
        const textMinikernelActive = BlocklyBB.isTextMinikernelActive();
        const reservedMusicBank = musicReservedBank(maxBanks, textMinikernelActive);
        const banks = getRelocationBanks();
        let candidate = pickRelocationCandidate(banks);
        let bank = candidate && (
          candidate.kind === 'musicBanks' && reservedMusicBank ?
            reservedMusicBank :
            pickNextBank(banks, maxBanks, textMinikernelActive, reservedMusicBank));

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
            BlocklyBB.estimateSubroutineSize(name)
          );
          for (let rederive = 0; !candidate && rederive < maxBanks; rederive++) {
            if (stuckBank === null) {
              const last = relocatedThisBuild[relocatedThisBuild.length - 1];
              stuckBank = (banks[last.kind] || {})[last.name];
            }
            if (!stuckBank || stuckBank === 1) break;

            const coResidents = [];
            ['eventBanks', 'graphicsBanks', 'musicBanks', 'subroutineBanks'].forEach((kind) => {
              Object.entries(banks[kind] || {}).forEach(([name, unitBank]) => {
                const unitKey2 = `${kind}:${name}`;
                if (unitBank === stuckBank && !stuckBankTriedUnits.has(unitKey2)) {
                  coResidents.push({kind, name, size: estimateSize(kind, name)});
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

            stuckBankTriedUnits.add(`${next.kind}:${next.name}`);
            const unitKey = `${next.kind}:${next.name}`;
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
              const nextBank = pickNextBank(banks, maxBanks, textMinikernelActive, reservedMusicBank, triedBanks);
              if (nextBank) {
                candidate = {kind: next.kind, name: next.name};
                bank = nextBank;
              }
            }
          }
        }

        if (candidate && bank) {
          setRelocationBank(candidate.kind, candidate.name, bank);
          relocatedThisBuild.push({kind: candidate.kind, name: candidate.name, bank});
          continue;
        }
      }
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
  showError(errorStorage, 'Error while compiling bBasic code', lastCode,
      new Error(`${(lastFailure && lastFailure.message) || 'Ran out of relocation attempts.'}\n\n` +
        `Gave up after trying ${MAX_RELOCATION_ATTEMPTS} different bank combinations without finding one ` +
        `that compiles.\n\nBank assignments at failure:\n${JSON.stringify(diagnostics, null, 2)}`));
  return false;
};
