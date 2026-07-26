'use strict';

import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

import Blockly from 'blockly';
import {preprocessBatariBasic, compileBatariBasic, assembleDASM} from 'batari-basic/src/compiler';

import '../blocks';
import BlocklyBB from '../generators/bbasic';
import {applyScoreFont} from '../utils/score-font';
import {showError} from '../utils/build-error';
import {useGeneratedBasic} from './generated';
import {useConfigurationStorage, useErrorStorage, useWorkspaceStorage} from './project';
import {markRomUpToDate, markRomOutdated, useRomOutdated} from './rom-status';

Vue.use(VueCompositionApi);

export {markRomOutdated, useRomOutdated};

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
const patchSuperchipPfColorsPointer = (assemblyFiles, config) => {
  if (!config.enableSuperchip || !config.pfres) return assemblyFiles;
  const correctOffset = 132 - config.pfres * 4;
  return {
    ...assemblyFiles,
    'main.asm': assemblyFiles['main.asm'].replace(/pfcolorlabel(\d+)-84/g, `pfcolorlabel$1-${correctOffset}`),
  };
};

/**
 * Compiles the current project into a ROM and loads it into the emulator.
 * @return {boolean} Whether the ROM was built.
 */
export const buildRom = () => {
  const errorStorage = useErrorStorage();

  let code;
  try {
    code = regenerateCode();
    useGeneratedBasic().value = code;
  } catch (e) {
    showError(errorStorage, 'Error while generating bBasic code', code, e);
    return false;
  }

  try {
    errorStorage.value = '';
    // The compiler has no font support of its own, so point its score
    // digits at the selected font before building.
    applyScoreFont(useConfigurationStorage().value?.scoreFont);
    const config = useConfigurationStorage().value || {};
    const preprocessed = preprocessBatariBasic(code);
    const assemblyFiles = patchSuperchipPfColorsPointer(compileBatariBasic(preprocessed), config);
    const compiledResult = assembleDASM(assemblyFiles);
    Javatari.fileLoader.loadFromContent('main.bin', compiledResult.output);

    // TODO: Implement this without a global variable
    Javatari.compiledResult = compiledResult;
    markRomUpToDate();
    return true;
  } catch (e) {
    showError(errorStorage, 'Error while compiling bBasic code', code, e);
    return false;
  }
};
