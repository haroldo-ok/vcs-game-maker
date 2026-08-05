'use strict';

// Whether the project currently has any Text Minikernel block placed - a
// direct block scan (not Blockly.BBasic.isTextMinikernelActive(), which is
// only set as a side effect of actually running code generation through
// hooks/rom.js's buildRom()) so this can be checked from lightweight UI (see
// the Squish score font option in ScoreFontEditor.vue, gated on this)
// without pulling in rom.js's own heavy compiler dependency chain.
import Blockly from 'blockly';

import '../blocks';
import {useWorkspaceStorage} from '../hooks/project';

const EMPTY_WORKSPACE = '<xml xmlns="https://developers.google.com/blockly/xml"/>';

const TEXT_MINIKERNEL_BLOCK_TYPES = [
  'text_minikernel_show', 'text_minikernel_show_named', 'text_minikernel_show_by_id',
  'text_minikernel_clear', 'text_minikernel_set_color',
];

export const isTextMinikernelUsedInProject = () => {
  const xmlText = useWorkspaceStorage().value;
  const workspace = new Blockly.Workspace();
  try {
    const dom = Blockly.Xml.textToDom(xmlText && xmlText !== 'null' ? xmlText : EMPTY_WORKSPACE);
    Blockly.Xml.domToWorkspace(dom, workspace);
    return TEXT_MINIKERNEL_BLOCK_TYPES.some((type) => workspace.getBlocksByType(type, false).length > 0);
  } finally {
    workspace.dispose();
  }
};
