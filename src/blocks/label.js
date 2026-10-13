'use strict';

import * as Blockly from 'blockly/core';

const LABEL_COLOR = 'rgb(39, 176, 176)';

// The batari Basic jump blocks: a named Label, "Go to" that label (goto), and "Return" out of a subroutine early (return).
//
// A label and a goto only reach each other inside the same event, subroutine or function: those are compiled apart, and may
// live in different banks, where a plain goto cannot go (the blocks warn when a Go to has no Label in its stack).

/**
 * Every label name defined on the workspace, deduped.
 * @param {?Blockly.Workspace} workspace
 * @return {!Array<string>}
 */
const definedLabelNames = (workspace) => {
  if (!workspace) return [];
  return [...new Set(workspace.getBlocksByType('label_define', false)
      .map((block) => block.getFieldValue('NAME')).filter(Boolean))];
};

/**
 * The dropdown's options: the labels defined right now, read each time it opens so a renamed, added or deleted label shows up.
 * @return {!Array<!Array<string>>}
 */
function buildLabelOptions() {
  // eslint-disable-next-line no-invalid-this
  const block = this.getSourceBlock && this.getSourceBlock();
  const names = definedLabelNames(block && block.workspace);
  if (!names.length) return [['No labels defined', '']];
  return names.map((name) => [name, name]);
}

// Blockly rejects a value that is not in the options it cached the first time they were built, which on a block loaded from
// saved XML is before the Label it names exists (see the same override on the subroutine Call block in subroutine.js).
const acceptAnyValue = (newValue) => (newValue === undefined ? null : String(newValue));

const setDropdownValue = (field, value) => {
  // Fetching the options again refreshes the cache the validation and the closed dropdown's text read.
  field.getOptions();
  field.setValue(value);
  field.forceRerender();
};

const fixGotoNames = (workspace) => {
  const names = definedLabelNames(workspace);
  if (!names.length) return;
  workspace.getBlocksByType('label_goto', false).forEach((block) => {
    const field = block.getField('NAME');
    if (!field) return;
    const current = block.getFieldValue('NAME');
    setDropdownValue(field, names.includes(current) ? current : names[0]);
  });
};

// Renaming a Label moves the Go to blocks that named it along with it.
const cascadeLabelRename = (workspace, event) => {
  if (event.type !== Blockly.Events.BLOCK_CHANGE || event.element !== 'field' || event.name !== 'NAME') return;
  if (!event.oldValue || !event.newValue || event.oldValue === event.newValue) return;
  const changed = workspace.getBlockById(event.blockId);
  if (!changed || changed.type !== 'label_define') return;
  workspace.getBlocksByType('label_goto', false).forEach((block) => {
    if (block.getFieldValue('NAME') !== event.oldValue) return;
    const field = block.getField('NAME');
    if (field) setDropdownValue(field, event.newValue);
  });
};

const ensureGotoListener = (workspace) => {
  if (!workspace || workspace.isFlyout || workspace.labelGotoListener_) return;
  workspace.labelGotoListener_ = true;
  workspace.addChangeListener((event) => {
    cascadeLabelRename(workspace, event);
    fixGotoNames(workspace);
  });
  setTimeout(() => fixGotoNames(workspace), 0);
};

Blockly.Blocks['label_define'] = {
  init: function() {
    const block = this;
    this.appendDummyInput()
        .appendField('Label')
        .appendField(new Blockly.FieldTextInput('myLabel'), 'NAME');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(LABEL_COLOR);
    this.setTooltip('A named place in the code that a "Go to label" block can jump to, with the blocks inside it. The code ' +
      'goes on with the blocks inside the label and then with the blocks after it. The jump and the label have to be in the ' +
      'same event, subroutine or function.');
    this.setOnChange(() => {
      if (!block.workspace || block.workspace.isFlyout) return;
      const name = block.getFieldValue('NAME');
      const sameName = block.workspace.getBlocksByType('label_define', false)
          .filter((candidate) => candidate.getFieldValue('NAME') === name);
      block.setWarningText(sameName.length > 1 ? `Another label is called "${name}".` : null);
    });
  },
};

Blockly.Blocks['label_goto'] = {
  init: function() {
    const block = this;
    const nameField = new Blockly.FieldDropdown(buildLabelOptions);
    nameField.doClassValidation_ = acceptAnyValue;
    this.appendDummyInput()
        .appendField('Go to label')
        .appendField(nameField, 'NAME');
    this.setPreviousStatement(true, null);
    // The code after a jump is never reached, so nothing follows it in the stack.
    this.setNextStatement(false);
    this.setColour(LABEL_COLOR);
    this.setTooltip('Jumps to a "Label" block in the same event, subroutine or function (batari Basic goto). ' +
      'Put it at the end of a stack, often inside an "if".');
    if (this.workspace) ensureGotoListener(this.workspace);
    this.setOnChange(() => {
      if (!block.workspace || block.workspace.isFlyout) return;
      const name = block.getFieldValue('NAME');
      const root = block.getRootBlock();
      const there = block.workspace.getBlocksByType('label_define', false)
          .some((candidate) => candidate.getFieldValue('NAME') === name && candidate.getRootBlock() === root);
      block.setWarningText(!name ? 'No label is defined yet.' : there ? null :
        `No label called "${name}" in this event, subroutine or function.`);
    });
  },
};

Blockly.Blocks['subroutine_return'] = {
  init: function() {
    const block = this;
    this.appendDummyInput().appendField('Return from subroutine');
    this.setPreviousStatement(true, null);
    // The code after a return is never reached, so nothing follows it in the stack.
    this.setNextStatement(false);
    this.setColour(LABEL_COLOR);
    this.setTooltip('Ends the subroutine this block is in and goes back to the "Call" block that ran it (batari Basic return). ' +
      'A subroutine also returns by itself after its last block.');
    this.setOnChange(() => {
      if (!block.workspace || block.workspace.isFlyout) return;
      const root = block.getRootBlock();
      block.setWarningText(root && root.type === 'subroutine_define' ? null : 'Only works inside a Subroutine.');
    });
  },
};
