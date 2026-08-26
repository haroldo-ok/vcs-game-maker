'use strict';

import * as Blockly from 'blockly/core';

const SUBROUTINE_COLOR = 'rgb(39, 176, 176)';

// Block for defining a named, reusable subroutine (bBasic gosub/return) -
// its body isn't emitted where it's dropped on the canvas (see
// generators/bbasic/subroutine.js): like an event, it's collected and
// spliced into its own safe, never-fallen-into spot in the template, with
// "subroutine_call" blocks elsewhere reaching it via a bank-tagged "gosub".
Blockly.Blocks['subroutine_define'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Subroutine')
        .appendField(new Blockly.FieldTextInput('mySubroutine'), 'NAME');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SUBROUTINE_COLOR);
    this.setTooltip('Defines a named, reusable block of code. Call it from anywhere ' +
      'with a "Call" block.');
  },
};

/**
 * Every subroutine name currently defined on the given workspace, deduped.
 * @param {?Blockly.Workspace} workspace
 * @return {!Array<string>}
 */
function definedSubroutineNames(workspace) {
  if (!workspace) return [];
  return [...new Set(
      workspace.getBlocksByType('subroutine_define', false)
          .map((defineBlock) => defineBlock.getFieldValue('NAME'))
          .filter(Boolean),
  )];
}

/**
 * Lists every subroutine currently defined on the same workspace as the
 * dropdown's own block, so renamed/added/deleted subroutines show up the next
 * time the dropdown opens - no separate storage needed, since the definition
 * blocks living on the canvas already are the source of truth. Blockly calls
 * this with `this` bound to the field.
 * @return {!Array<!Array<string>>} Pairs of label and value.
 */
function buildSubroutineOptions() {
  // eslint-disable-next-line no-invalid-this
  const block = this.getSourceBlock && this.getSourceBlock();
  const names = definedSubroutineNames(block && block.workspace);
  if (!names.length) return [['No subroutines defined', '']];
  return names.map((name) => [name, name]);
}

// Root cause of every previous attempt at this failing silently: Blockly's
// FieldDropdown.getOptions(useCache) - despite the name - only RE-RUNS the
// generator function when useCache is falsy; passed `true`, it returns
// whatever it cached from the FIRST call and never looks again. And
// doClassValidation_ (the gate every setValue() has to pass) always calls
// getOptions(true) - the cached path. So a field whose first-ever options
// fetch happened while it had nothing to offer (the toolbox flyout, before
// any subroutine_define exists) has that empty result cached permanently:
// every later setValue() to a real subroutine name gets validated against
// the stale empty list and silently rejected, forever, no matter how much
// later or how many times it's retried - confirmed directly by reading
// getOptions's own source and by reproducing the stuck cache live. Calling
// getOptions() with no argument (falsy useCache) first forces a fresh
// generator call, which also happens to refresh the cache doClassValidation_
// itself will read right after - that's the only thing that actually clears
// the block, not more retries or longer delays.
/**
 * @param {!Blockly.Field} field
 * @param {string} newValue
 */
function setSubroutineDropdownValue(field, newValue) {
  field.getOptions();
  field.setValue(newValue);
  // Field.prototype.setValue's own "new value equals the old value" fast
  // path (see node_modules/blockly/core/field.js) calls doValueUpdate_ -
  // which is what actually recomputes FieldDropdown's selectedOption_ (the
  // CLOSED dropdown's displayed text) - but returns immediately afterward,
  // WITHOUT ever reaching the forceRerender() call the "value actually
  // changed" path gets. Exactly the case here: by the time this settle pass
  // runs, the value itself is often already correct (see
  // acceptAnyDropdownValue's own comment - just the earlier deserialization
  // moment's stale-cache display lookup wasn't), so setValue's own "nothing
  // changed" shortcut would otherwise leave the stale text on screen forever
  // despite selectedOption_ now being right underneath it - a real, reported
  // symptom (closed dropdown still showing "No subroutines defined" even
  // once the underlying value, visible via the open dropdown's own
  // checkmark, was already correct). Forcing this unconditionally costs
  // nothing when a redraw wasn't actually needed.
  field.forceRerender();
}

/**
 * A block dragged in from the toolbox flyout is a fresh instance whose
 * FieldDropdown is constructed - and gets its initial value AND its first
 * (then permanently cached, see setSubroutineDropdownValue) options fetch -
 * while it's still on the flyout's own separate workspace, which never has
 * any "subroutine_define" blocks of its own. That leaves the NAME field
 * stuck on "" (an empty gosub target - see subroutine_call in
 * generators/bbasic/subroutine.js) even once the block lands on the real
 * workspace next to an existing subroutine, until something re-picks a
 * value AND refreshes the cache together.
 * @param {?Blockly.Workspace} workspace
 */
function fixSubroutineCallNames(workspace) {
  const names = definedSubroutineNames(workspace);
  if (!names.length) return;
  workspace.getBlocksByType('subroutine_call', false).forEach((callBlock) => {
    const current = callBlock.getFieldValue('NAME');
    const field = callBlock.getField('NAME');
    if (!field) return;
    // Always re-applies the value (even when it's already correct), not
    // just when it's outright invalid - FieldDropdown.doValueUpdate_ (see
    // node_modules/blockly/core/field_dropdown.js) separately looks up
    // selectedOption_ (what the CLOSED dropdown actually displays) against
    // its own getOptions(true) cache, at the moment setValue was called.
    // Now that doClassValidation_ is overridden to accept any value (see
    // acceptAnyDropdownValue's own comment above - needed so a value
    // pointing at a subroutine defined LATER in the same XML survives
    // deserialization at all), the underlying value can end up correct
    // while that separate display-text lookup still missed it, because it
    // ran against the SAME incomplete cache at that same moment - a real,
    // reported symptom (closed dropdown showing "No subroutines defined"
    // even though the value underneath, visible via the open dropdown's own
    // checkmark, was already right). setSubroutineDropdownValue's own
    // getOptions()-then-setValue() pattern busts the cache and recomputes
    // selectedOption_ against the now-complete list either way.
    setSubroutineDropdownValue(field, names.includes(current) ? current : names[0]);
  });
}

/**
 * Renaming a subroutine_define block leaves every "Call" block that pointed
 * at its old name stranded - fixSubroutineCallNames only recognizes a value
 * as broken when it matches nothing defined at all, so it can't tell "this
 * Call meant to follow the rename" apart from "this Call points at some
 * other, unrelated subroutine" and won't touch either. A BLOCK_CHANGE event
 * on a subroutine_define's own NAME field carries the exact old/new values,
 * which is enough to retarget only the Call blocks that actually followed
 * that specific subroutine, in the moment of the rename.
 * @param {?Blockly.Workspace} workspace
 * @param {!Blockly.Events.Abstract} event
 */
function cascadeSubroutineRename(workspace, event) {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) return;
  if (event.element !== 'field' || event.name !== 'NAME') return;
  if (!event.oldValue || !event.newValue || event.oldValue === event.newValue) return;
  const changedBlock = workspace.getBlockById(event.blockId);
  if (!changedBlock || changedBlock.type !== 'subroutine_define') return;
  workspace.getBlocksByType('subroutine_call', false).forEach((callBlock) => {
    if (callBlock.getFieldValue('NAME') !== event.oldValue) return;
    const field = callBlock.getField('NAME');
    if (field) setSubroutineDropdownValue(field, event.newValue);
  });
}

/**
 * @param {?Blockly.Workspace} workspace
 */
function ensureSubroutineCallListener(workspace) {
  if (!workspace || workspace.isFlyout || workspace.subroutineCallListener_) return;
  workspace.subroutineCallListener_ = true;
  workspace.addChangeListener((event) => {
    cascadeSubroutineRename(workspace, event);
    fixSubroutineCallNames(workspace);
  });
  // A block reconstructed from SAVED XML (project load, not a fresh drag from
  // the toolbox) applies its saved field value AFTER init() runs, so this
  // block's own value isn't readable yet and the change listener above never
  // fires unless something ELSE edits the workspace afterward. One deferred
  // pass, after the current synchronous load finishes applying every block's
  // saved value, catches any that are still stale without waiting on a
  // future edit that may never come.
  setTimeout(() => fixSubroutineCallNames(workspace), 0);
}

// FieldDropdown.doClassValidation_ (see node_modules/blockly/core/
// field_dropdown.js) rejects any value not present in getOptions(true) - its
// OWN cached option list, captured whenever this field's generator
// (buildSubroutineOptions) last ran. During XML deserialization, Blockly
// applies each block's saved field values as it parses them IN DOCUMENT
// ORDER - so a "Call subroutine" block whose saved NAME points at a
// subroutine_define block that appears LATER in the same XML gets its saved
// value silently rejected (that subroutine doesn't exist as a workspace
// block yet, so it's not in the cache), and Field.prototype.setValue simply
// returns without applying anything, leaving the field at whatever its
// default (first-option) value already was - a real, reported bug ("the
// call subroutine block keeps resetting to the first subroutine when
// navigating away"), since Vue Router destroys and recreates this tab's
// workspace on every visit (see hooks/collapse.js's own comment on the same
// lifecycle), reloading the saved XML - and reproducing from scratch - every
// time. fixSubroutineCallNames's own later correction pass can't catch this
// either: by the time it runs, the field's value has already fallen back to
// some OTHER real subroutine name (not garbage), which looks perfectly
// valid to that check.
//
// The workspace's own subroutine_define blocks are already the single
// source of truth for what's a real target (see definedSubroutineNames,
// used identically by code generation itself in generators/bbasic/
// subroutine.js) - there's no reason this field's own separate, load-order-
// dependent cache should ALSO get a veto. Overriding doClassValidation_ to
// always accept removes that veto entirely; a real click in the dropdown's
// own UI can still only ever offer currently-valid names to click in the
// first place (built fresh via getOptions() when the menu opens), so this
// doesn't let anything genuinely invalid slip in through normal use.
/**
 * @param {*} newValue
 * @return {?string}
 */
function acceptAnyDropdownValue(newValue) {
  return newValue === undefined ? null : String(newValue);
}

// Block for calling a named subroutine defined with "subroutine_define".
Blockly.Blocks['subroutine_call'] = {
  init: function() {
    const nameField = new Blockly.FieldDropdown(buildSubroutineOptions);
    nameField.doClassValidation_ = acceptAnyDropdownValue;
    this.appendDummyInput()
        .appendField('Call')
        .appendField(nameField, 'NAME');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SUBROUTINE_COLOR);
    this.setTooltip('Runs a subroutine defined with a "Subroutine" block, then continues ' +
      'after this block once it finishes.');
    if (this.workspace) ensureSubroutineCallListener(this.workspace);
  },
};
