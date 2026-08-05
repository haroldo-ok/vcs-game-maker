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

// This is the only signature the underlying compiler gives for "your code
// doesn't fit" (see the trial-build/attemptBuild investigation) - anything
// else is a genuine problem in the user's own project that auto-relocating
// an event would only obscure, so it's surfaced immediately instead.
const isOverflowError = (e) => /segment overflow/i.test((e && e.message) || '');

// How many physical banks each bankswitched ROM size actually provides
// (2k/4k don't bankswitch at all, so they're absent - overflowing there just
// surfaces the real error, with nowhere to relocate anything). Every bank
// past bank 1 is a valid relocation target - the standard kernel's
// bankswitch trampoline is duplicated at the same relative offset in every
// bank, and cross-bank calls work identically regardless of which bank
// number is used (confirmed for bank 2 directly against the compiler and
// the emulator - see the bank-targeting feasibility notes).
export const BANK_COUNT_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8};

// Largest-first, across both relocatable kinds: relocating the biggest
// still-inline unit (event OR graphics - a background, a player's default
// frame, or a single named animation, see wrapRelocatableGraphics) frees the
// most bank 1 space per attempt, minimizing how many rebuild cycles are
// needed. Must run right after a regenerateCode() call, while both kinds'
// size estimates are still current - graphics unit keys themselves are only
// known after that call too, since they're generated from the project's
// backgrounds/animations rather than fixed like the event names.
const pickRelocationCandidate = (config) => {
  const eventBanks = config.eventBanks || {};
  const graphicsBanks = config.graphicsBanks || {};
  const candidates = [
    ...RELOCATABLE_EVENT_NAMES
        .filter((name) => (eventBanks[name] || 1) === 1)
        .map((name) => ({kind: 'eventBanks', name, size: BlocklyBB.estimateEventSize(name)})),
    ...BlocklyBB.getGraphicsUnitKeys()
        .filter((name) => (graphicsBanks[name] || 1) === 1)
        .map((name) => ({kind: 'graphicsBanks', name, size: BlocklyBB.estimateGraphicsUnitSize(name)})),
  ];
  if (!candidates.length) return null;
  return candidates.sort((a, b) => b.size - a.size)[0];
};

// Spreads relocated units (events and graphics together, since they share
// the same physical banks) across every available bank rather than piling
// them all into bank 2 - picks whichever bank (2..maxBanks) currently holds
// the fewest relocated units, ties broken toward the lowest bank number.
// There is no reliable way to measure how much room is actually left in a
// bank once it holds relocated content (the free-space technique that works
// for bank 1 was verified to give a wrong answer there - see
// utils/rom-capacity.js), so this can only spread the *count* of units
// evenly; whether the result actually compiles is still decided by trying
// it, same as picking the candidate unit itself.
const pickNextBank = (config, maxBanks) => {
  if (maxBanks < 2) return null;
  const counts = {};
  for (let bank = 2; bank <= maxBanks; bank++) counts[bank] = 0;
  const tally = (banks) => Object.values(banks || {}).forEach((bank) => {
    if (counts[bank] !== undefined) counts[bank]++;
  });
  tally(config.eventBanks);
  tally(config.graphicsBanks);
  let best = 2;
  for (let bank = 3; bank <= maxBanks; bank++) {
    if (counts[bank] < counts[best]) best = bank;
  }
  return best;
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
      const maxBanks = BANK_COUNT_BY_ROMSIZE[config.romSize];
      if (isOverflowError(e) && maxBanks) {
        const candidate = pickRelocationCandidate(config);
        const bank = candidate && pickNextBank(config, maxBanks);
        if (candidate && bank) {
          const banksForKind = config[candidate.kind] || {};
          configurationStorage.value = {
            ...config,
            [candidate.kind]: {...banksForKind, [candidate.name]: bank},
          };
          relocatedThisBuild.push({name: candidate.name, bank});
          continue;
        }
      }
      showError(errorStorage, 'Error while compiling bBasic code', code, e);
      return false;
    }
  }
  return false;
};
