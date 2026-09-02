'use strict';

import * as Blockly from 'blockly/core';

// Distinct from subroutine.js's SUBROUTINE_COLOR (teal) so the two families
// read as related-but-different at a glance - functions return a value and
// take arguments, subroutines don't.
const FUNCTION_COLOR = 'rgb(0, 151, 167)';

const MAX_FUNCTION_ARGS = 6;

// Scratch storage for function_call_statement's own discarded return value
// (see generators/bbasic/function.js) - calling a function purely for its
// side effects still has to assign its result SOMEWHERE, batari Basic's own
// function-call syntax has no way to just drop it. temp1 looks like the
// obvious spot (used exactly that way throughout this codebase, and
// genuinely fine for a call made OUTSIDE any function), but is NOT
// obviously safe for a call made FROM INSIDE another function's own body:
// temp1 is ALSO argument 1's own storage there (see function_param_get's
// own comment), so "temp1 = someFunction(...)" risked colliding with
// whichever argument happens to occupy that exact same register -
// consistent with a real reported bug (argument 1 reading back a stuck
// wrong value after calling a function as a bare statement inside another
// function's own body, while argument 2 read back correctly). A dedicated
// dev var sidesteps that possibility entirely, at the cost of reserving it
// only for a project that actually calls a function as a bare statement at
// all.
export const functionCallDiscardVarName = () => '_functionCallResult';

// Scratch storage for function_call_statement's own arguments, handed off to
// a small per-function wrapper subroutine (see registerFunctionCallWrapper in
// generators/bbasic/function.js) instead of calling the function inline. A
// bB function call ("name(args)") has no bank-tag syntax of its own - unlike
// gosub/goto, it can only ever be called from the exact bank the function
// itself lives in (always bank 1, see this.functions' own comment in
// generators/bbasic.js's init()) - so an event/subroutine calling one
// directly was permanently pinned to bank 1 too, real bytes and all,
// confirmed as a real reported ROM-capacity overflow once enough surrounding
// code (unrelated to the call itself) got dragged along for the ride purely
// by sharing a statement stack with it. Routing through "gosub" instead needs
// somewhere to stash the arguments first (gosub itself carries none) - these
// vars are that somewhere, reserved only for a project that actually calls a
// function as a bare statement at all (see functionCallStatementUsed's own
// pre-scan in generators/bbasic.js).
export const functionCallArgVarName = (index) => `_fnCallArg${index}`;

// Block for defining a native batari Basic "function" - a real,
// value-returning callable (see generators/bbasic/function.js for the exact
// "function <name> ... return <expr>" syntax this compiles to), distinct
// from this app's own subroutine_define/subroutine_call (gosub/return, no
// value). Its body isn't emitted where it's dropped on the canvas - like a
// subroutine, it's collected and spliced into its own never-fallen-into spot
// in the template, with "function_call" blocks elsewhere reaching it by
// using it directly as a value expression.
Blockly.Blocks['function_define'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Function')
        .appendField(new Blockly.FieldTextInput('myFunction'), 'NAME');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(FUNCTION_COLOR);
    this.setTooltip('Defines a named, reusable function that returns a value. Read its ' +
      'arguments with "Function argument" blocks, and end with a "Return" block. Call it ' +
      'from anywhere with a "Call function" block used as a number.');
  },
};

// Reads one of this function's own up-to-6 arguments, passed positionally by
// whichever "Call function" block invoked it (argument 1 -> the first value
// plugged into the call, and so on) - see generators/bbasic/function.js for
// why this only ever needs to emit a literal "temp1".."temp6": that's the
// real language's own fixed calling convention, not something this app
// invents.
Blockly.Blocks['function_param_get'] = {
  init: function() {
    this.appendDummyInput()
        .appendField('Function argument')
        .appendField(new Blockly.FieldDropdown(
            Array.from({length: MAX_FUNCTION_ARGS}, (_, i) => [`${i + 1}`, `${i + 1}`]),
        ), 'INDEX');
    this.setOutput(true, 'Number');
    this.setColour(FUNCTION_COLOR);
    this.setTooltip('Reads one of this function\'s own arguments - only meaningful inside ' +
      'a "Function" block\'s own body, in a position a "Call function" block actually ' +
      'plugged something into.');
  },
};

// Exits the enclosing function immediately with a value - only meaningful
// inside a "Function" block's own body (a project could still drop one
// elsewhere; it would just compile to a bare "return value" wherever that
// happens to land, same as any other misplaced statement in this app).
Blockly.Blocks['function_return'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .appendField('Return');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(FUNCTION_COLOR);
    this.setTooltip('Ends the enclosing function immediately, with this value as its ' +
      'result. A function can have several of these on different branches (e.g. inside ' +
      'an if/else), same as batari Basic\'s own "function" command.');
  },
};

/**
 * Every function name currently defined on the given workspace, deduped.
 * @param {?Blockly.Workspace} workspace
 * @return {!Array<string>}
 */
function definedFunctionNames(workspace) {
  if (!workspace) return [];
  return [...new Set(
      workspace.getBlocksByType('function_define', false)
          .map((defineBlock) => defineBlock.getFieldValue('NAME'))
          .filter(Boolean),
  )];
}

/**
 * Lists every function currently defined on the same workspace as the
 * dropdown's own block - same reasoning as subroutine.js's own
 * buildSubroutineOptions.
 * @return {!Array<!Array<string>>} Pairs of label and value.
 */
function buildFunctionOptions() {
  // eslint-disable-next-line no-invalid-this
  const block = this.getSourceBlock && this.getSourceBlock();
  const names = definedFunctionNames(block && block.workspace);
  if (!names.length) return [['No functions defined', '']];
  return names.map((name) => [name, name]);
}

// Same FieldDropdown getOptions(useCache) cache-staleness bug (and same
// fix) as subroutine.js's own setSubroutineDropdownValue - see its comment
// for the full explanation.
/**
 * @param {!Blockly.Field} field
 * @param {string} newValue
 */
function setFunctionDropdownValue(field, newValue) {
  field.getOptions();
  field.setValue(newValue);
}

/**
 * Same flyout-drag staleness problem (and same fix) as subroutine.js's own
 * fixSubroutineCallNames - see its comment for the full explanation.
 * @param {?Blockly.Workspace} workspace
 */
function fixFunctionCallNames(workspace) {
  const names = definedFunctionNames(workspace);
  if (!names.length) return;
  // Both call block types (the value-returning "function_call" and the
  // standalone "function_call_statement") share the same NAME dropdown - a
  // call block dropped before any function existed shows '' ("No functions
  // defined"), and this is what snaps it onto the first real function the
  // moment one gets defined, matching subroutine_call's own pre-fill
  // behavior. Missing function_call_statement here was a real bug: a
  // statement-style call block never got this treatment at all.
  [...workspace.getBlocksByType('function_call', false),
    ...workspace.getBlocksByType('function_call_statement', false)].forEach((callBlock) => {
    const current = callBlock.getFieldValue('NAME');
    if (names.includes(current)) return;
    const field = callBlock.getField('NAME');
    if (field) setFunctionDropdownValue(field, names[0]);
  });
}

/**
 * Same rename-cascade need (and same fix) as subroutine.js's own
 * cascadeSubroutineRename - see its comment for the full explanation.
 * @param {?Blockly.Workspace} workspace
 * @param {!Blockly.Events.Abstract} event
 */
function cascadeFunctionRename(workspace, event) {
  if (event.type !== Blockly.Events.BLOCK_CHANGE) return;
  if (event.element !== 'field' || event.name !== 'NAME') return;
  if (!event.oldValue || !event.newValue || event.oldValue === event.newValue) return;
  const changedBlock = workspace.getBlockById(event.blockId);
  if (!changedBlock || changedBlock.type !== 'function_define') return;
  // Same "both call block types" reasoning as fixFunctionCallNames above.
  [...workspace.getBlocksByType('function_call', false),
    ...workspace.getBlocksByType('function_call_statement', false)].forEach((callBlock) => {
    if (callBlock.getFieldValue('NAME') !== event.oldValue) return;
    const field = callBlock.getField('NAME');
    if (field) setFunctionDropdownValue(field, event.newValue);
  });
}

/**
 * @param {?Blockly.Workspace} workspace
 */
function ensureFunctionCallListener(workspace) {
  if (!workspace || workspace.isFlyout || workspace.functionCallListener_) return;
  workspace.functionCallListener_ = true;
  workspace.addChangeListener((event) => {
    cascadeFunctionRename(workspace, event);
    fixFunctionCallNames(workspace);
  });
  // Same saved-project load-order gap (and same fix) as subroutine.js's own
  // ensureSubroutineCallListener - see its comment for the full explanation.
  setTimeout(() => fixFunctionCallNames(workspace), 0);
}

/**
 * Shows exactly one empty ARG slot past whatever's already connected (up to
 * MAX_FUNCTION_ARGS), and hides the rest - a call site that only needs 2
 * arguments doesn't have to stare at 4 unused ones. Never hides a slot that
 * already has something plugged into it, so this is safe to call after any
 * connect/disconnect (including ones from loading a saved project, which
 * reconnects blocks in whatever order the XML happens to list them) without
 * ever orphaning a live connection behind a hidden input.
 * ARG1's own permanent 0 shadow (see blockly-toolbox.xml.hbs) doesn't count
 * as "connected" here - only a real block the user actually dragged in
 * does, so dropping a fresh call block from the toolbox shows just ARG1
 * (with its shadow), not ARG1+ARG2, until something real is plugged in.
 * A no-op on a headless workspace - the one ROM builds use for code
 * generation (see hooks/rom.js's withHeadlessWorkspace, a plain
 * Blockly.Workspace, not a WorkspaceSvg) creates plain Blockly.Connection
 * objects rather than RenderedConnection, which Input.setVisible() calls
 * straight into (startTrackingAll/stopTrackingAll, RenderedConnection-only
 * methods) - confirmed directly as a real crash otherwise ("stopTrackingAll
 * is not a function") the moment this ran during a build. Checked via
 * workspace.rendered (a stable, TYPE-level flag - false on Workspace, true
 * on WorkspaceSvg, from their own respective prototypes) rather than
 * block.rendered (which starts false/null on EVERY block, interactive or
 * not, until its first actual paint - the wrong thing to gate on here,
 * since this can legitimately run before that first paint on a real
 * interactive block too). Visibility is a purely visual concern the
 * generator itself never reads, so skipping it entirely on a headless
 * workspace is always safe.
 * @param {!Blockly.Block} block
 */
function updateFunctionCallArgVisibility(block) {
  if (!block.workspace || !block.workspace.rendered) return;
  let highestConnected = 0;
  for (let i = 1; i <= MAX_FUNCTION_ARGS; i++) {
    const target = block.getInputTargetBlock(`ARG${i}`);
    if (target && !target.isShadow()) highestConnected = i;
  }
  const visibleCount = Math.min(MAX_FUNCTION_ARGS, highestConnected + 1);
  let changed = false;
  for (let i = 1; i <= MAX_FUNCTION_ARGS; i++) {
    const input = block.getInput(`ARG${i}`);
    if (!input) continue;
    const shouldBeVisible = i <= visibleCount;
    if (input.isVisible() !== shouldBeVisible) {
      input.setVisible(shouldBeVisible);
      changed = true;
    }
  }
  if (changed && typeof block.render === 'function') {
    block.render();
    if (block.workspace && block.workspace.resizeContents) block.workspace.resizeContents();
  }
}

// Shared by function_call and function_call_statement below - the dropdown
// and up to MAX_FUNCTION_ARGS argument inputs are identical either way, only
// how the block connects to its surroundings (a value vs. a statement)
// differs.
const appendFunctionCallFields = (block) => {
  block.appendDummyInput()
      .appendField('Call function')
      .appendField(new Blockly.FieldDropdown(buildFunctionOptions), 'NAME');
  for (let i = 1; i <= MAX_FUNCTION_ARGS; i++) {
    block.appendValueInput(`ARG${i}`).setCheck('Number');
  }
  block.setInputsInline(true);
  block.setColour(FUNCTION_COLOR);
  if (block.workspace) ensureFunctionCallListener(block.workspace);
  // Blockly.Block's own constructor already wires up this.onchange (see
  // node_modules/blockly/core/block.js) if it's defined - checks BLOCK_MOVE
  // specifically (Blockly's own event type for a connection changing,
  // covering both a user dragging a block in/out AND a saved project
  // reconnecting one during load) rather than recomputing on every
  // workspace event, which would also fire for unrelated blocks moving
  // around the same canvas.
  block.onchange = function(event) {
    if (event.type !== Blockly.Events.BLOCK_MOVE) return;
    if (this.workspace && this.workspace.isFlyout) return;
    updateFunctionCallArgVisibility(this);
  };
  // Sets the initial ARG visibility (just ARG1, unless this block was loaded
  // from a saved project with more already connected) - deferred rather
  // than called directly here, since this runs during init(), before the
  // block has a rendered SVG root to actually update (calling
  // updateFunctionCallArgVisibility's own render()/resizeContents() that
  // early throws - confirmed directly: "Cannot set properties of null
  // (setting 'nodeValue')" deep inside Blockly's own render pipeline). The
  // same deferred-until-load-settles pattern ensureFunctionCallListener
  // already uses for fixFunctionCallNames, for the same reason.
  //
  // Applies in the toolbox flyout too, not just the main workspace - a
  // flyout's own workspace is a real, rendered WorkspaceSvg (isFlyout is
  // just a flag on it, not a different, unrendered kind of workspace), so
  // updateFunctionCallArgVisibility's own `workspace.rendered` guard already
  // allows this safely. Without running it there, the toolbox always showed
  // the "Call function" block with all 6 argument slots, cluttered and
  // identical regardless of which function it'll actually call - a real
  // reported issue.
  if (block.workspace) {
    setTimeout(() => updateFunctionCallArgVisibility(block), 0);
  }
};

// Block for calling a function defined with "function_define" - used as a
// NUMBER, not a statement (see generators/bbasic/function.js: this compiles
// straight to "name(arg1, arg2, ...)", batari Basic's own real function-call
// syntax, usable anywhere a number can go). Up to MAX_FUNCTION_ARGS value
// inputs, each optional - only the ones actually connected are passed (see
// the generator), matching the real language's own "extra/missing arguments
// aren't checked" behavior rather than silently inventing zeros for unfilled
// slots. See function_call_statement below for a version that drops straight
// into an event's own statement stack instead, for a function whose return
// value doesn't matter at a particular call site.
Blockly.Blocks['function_call'] = {
  init: function() {
    appendFunctionCallFields(this);
    this.setOutput(true, 'Number');
    this.setTooltip('Calls a function defined with a "Function" block and returns its ' +
      'result - plug in as many of the argument slots as that function actually reads ' +
      '(up to 6), matching them left to right against its own "Function argument" blocks.');
  },
};

// Same call as function_call above, but a standalone STATEMENT - drops
// straight into an event's own statement stack rather than needing to be
// plugged into a value input, for calling a function purely for its side
// effects (e.g. it sets some variables along the way) when the caller
// doesn't care what it returns. The real returned value is simply discarded
// (see generators/bbasic/function.js) rather than left unread in some
// awkward way batari Basic itself doesn't actually support - the language's
// own function calls are still real value expressions under the hood, this
// block just doesn't ask for anywhere to put the result.
Blockly.Blocks['function_call_statement'] = {
  init: function() {
    appendFunctionCallFields(this);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setTooltip('Calls a function defined with a "Function" block, without needing to ' +
      'be plugged into anything - use this when you don\'t care what the function returns, ' +
      'just that it runs.');
  },
};

export {MAX_FUNCTION_ARGS};
