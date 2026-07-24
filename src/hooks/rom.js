'use strict';

import Vue from 'vue';
import VueCompositionApi from '@vue/composition-api';

import Blockly from 'blockly';
import bBasic from 'batari-basic';

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

// The generated bBasic bakes in the backgrounds, animations and score font read
// from storage, so it has to be regenerated from the current project at build
// time; a graphics edit alone would otherwise leave the cached code stale.
// Generated headlessly so this works from any tab, not just the editor.
const regenerateCode = () => {
  const xmlText = useWorkspaceStorage().value;
  const workspace = new Blockly.Workspace();
  try {
    const dom = Blockly.Xml.textToDom(
        xmlText && xmlText !== 'null' ? xmlText : EMPTY_WORKSPACE);
    Blockly.Xml.domToWorkspace(dom, workspace);
    return BlocklyBB.workspaceToCode(workspace);
  } finally {
    workspace.dispose();
  }
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
    const compiledResult = bBasic(code);
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
