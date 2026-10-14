import * as Blockly from 'blockly/core';

import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {usePlayerAnimationsStorage, useConfigurationStorage} from '../hooks/project';
import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, COLOR_ICON, HEIGHT_ICON, ANIMATION_ICON, VISIBILITY_ICON, HORIZONTAL_ICON, VERTICAL_ICON, MIRROR_ICON, FRAME_ICON, PLAY_ICON, PAUSE_ICON, PRIORITY_ICON, DATA_ICON, SEEK_ICON, LOCK_ICON, INERTIA_ICON, STOP_ICON} from './icon';

const PRIORITY_COLOUR = '#009688';

// The generated code dispatches on the animation's position in the list
// ("if player0animation = 2 ..."), not on its id, so the option value is the
// index. Storage is read afresh on each call rather than through a cached
// computed, so renamed and added animations show up without a reload.
const buildAnimationOptions = (storageFactory) => () => {
  try {
    const player = processPlayerAnimationsStorageDefaults(storageFactory());
    return player.animations.map((animation, index) =>
      [animation.name || `Unnamed ${index + 1}`, `${index}`]);
  } catch (e) {
    console.error('Failed to list animation options', e);
    return [['Error', '0']];
  }
};

// Defined programmatically because a JSON definition can only hold a fixed list
// of options, and this one has to be rebuilt each time the dropdown opens.
// Player 0 and Player 1 share this one combined block type (see PLAYER_OPTIONS'
// comment below for why) - no VAR-sync extension needed here unlike
// buildCombinedPlayerVarBlocks'  get/set/change blocks, since the animation
// list itself (buildAnimationOptions) is the SAME shared pool regardless of
// which player is picked, not a player0-prefixed/player1-prefixed pair of
// options like a real bB variable name would be.
const buildAnimationSelectBlock = ({icon, colour, storageFactory}) => {
  // Value block: picks an animation by name and reports its number, so it can
  // be plugged into the sprite setter or anywhere else a number is wanted.
  Blockly.Blocks['sprite_player_animation_select'] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} ${ANIMATION_ICON} animation`)
          .appendField(
              new Blockly.FieldDropdown(buildAnimationOptions(storageFactory)), 'VAR');
      this.setOutput(true, 'Number');
      this.setColour(colour);
      // No player to pick: every sprite shares the one pool of animations. Plugged into a block that has a player, it takes that
      // player's colour (red for Player 0, blue for Player 1, and so on); unplugged it keeps the plain one.
      const block = this;
      // (Never while a block is being dragged, or on the insertion marker the drag shows: recoloring then rebuilds blocks Blockly is
      // in the middle of connecting and disconnecting.)
      this.setOnChange(() => {
        if (!block.workspace || block.workspace.isFlyout || block.isInsertionMarker() ||
          (block.workspace.isDragging && block.workspace.isDragging())) return;
        const parentPlayer = block.getParent() && block.getParent().getFieldValue('PLAYER');
        const wanted = parentPlayer == null ? 'red' :
          parentPlayer === '1' ? 'blue' : /^[2-9]$/.test(parentPlayer) ? extraPlayerColour(parentPlayer) : 'red';
        if (block.getColour() === Blockly.utils.colour.parse(wanted)) return;
        setTimeout(() => {
          if (block.disposed || !block.workspace || block.isInsertionMarker() || block.workspace.isDragging()) return;
          block.setColour(wanted);
        }, 0);
      });
      this.setTooltip('Selects one of the animations by name and reports its number');
    },
  };
};

// Statement block: combines picking the player AND picking the animation by
// name into a single block - a real reported gap, since the generic
// sprite_player_set block (see buildCombinedPlayerVarBlocks) plugged with
// sprite_player_animation_select above makes the user pick the SAME player
// twice (once on each block) to do the single, extremely common "set this
// player's animation" action. Kept as a separate block rather than undoing
// the Player 0/1 combination everywhere else - every other property still
// benefits from the generic get/set/change pattern; only "pick an animation
// by name" is common/awkward enough to deserve this shortcut.
const buildAnimationSetBlock = ({icon, colour, storageFactory}) => {
  Blockly.Blocks['sprite_player_set_animation'] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} Player`)
          .appendField(new Blockly.FieldDropdown(PLAYER_DROPDOWN_OPTIONS), 'PLAYER')
          .appendField(`${ANIMATION_ICON} set animation to`)
          .appendField(
              new Blockly.FieldDropdown(buildAnimationOptions(storageFactory)), 'VAR')
          .appendField(' ')
          .appendField(new Blockly.FieldCheckbox('TRUE'), 'RESTART')
          .appendField('restart')
          .appendField(' ')
          .appendField(new Blockly.FieldCheckbox('TRUE'), 'LOOP')
          .appendField('loop');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(colour);
      // Same "VAR translation naturally no-ops" reasoning as
      // sprite_player_animation_select's comment just above - VAR here is
      // an animation-list index too, never a "player0..."-prefixed name.
      Blockly.Extensions.apply('sprite_player_field_sync', this, false);
      this.setTooltip('Sets the chosen player\'s active animation by name, in one step. "restart" ' +
        'on (the default) plays the new animation from its first frame; off carries on from the ' +
        'current position in the animation that was playing. "loop" ' +
        'on (the default) replays it from the start every time it ends; off plays it once and ' +
        'leaves it on its last frame (see "Player animation has finished" to react to that ' +
        'moment).');
    },
  };
};

// Same one-step shortcut as buildAnimationSetBlock above, but for an
// animation's raw numeric list position (its 0-based index, matching
// sprite_player_animation_select's VAR value) instead of its name - a
// plugged expression/variable/Data table lookup can't be resolved to a
// fixed name the way the dropdown block above needs, so this takes a VALUE
// input instead of a VAR dropdown. The generic sprite_player_set block
// (VAR = Animation) already supports this too, for a value plugged into
// ITS VALUE input, but needs picking "Animation" from VAR first - this
// skips that extra step for the same reason buildAnimationSetBlock skips
// VAR's dropdown.
const buildAnimationSetByIdBlock = ({icon, colour}) => {
  Blockly.Blocks['sprite_player_set_animation_id'] = {
    init: function() {
      this.appendValueInput('VALUE')
          .setCheck('Number')
          .appendField(`${icon} Player`)
          .appendField(new Blockly.FieldDropdown(PLAYER_DROPDOWN_OPTIONS), 'PLAYER')
          .appendField(`${ANIMATION_ICON} set animation to ID`);
      this.appendDummyInput()
          .appendField(' ')
          .appendField(new Blockly.FieldCheckbox('TRUE'), 'RESTART')
          .appendField('restart')
          .appendField(' ')
          .appendField(new Blockly.FieldCheckbox('TRUE'), 'LOOP')
          .appendField('loop');
      this.setInputsInline(true);
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(colour);
      Blockly.Extensions.apply('sprite_player_field_sync', this, false);
      this.setTooltip('Sets the chosen player\'s active animation directly by its numeric list ' +
        'position (0-based, top to bottom) - for a fixed animation picked by name instead, see ' +
        '"set animation to" above. "restart" on (the default) plays the new animation from its first frame; off ' +
        'carries on from the current position in the animation that was playing. ' +
        '"loop" on (the default) replays it from the start every time ' +
        'it ends; off plays it once and leaves it on its last frame (see "Player animation has ' +
        'finished" to react to that moment).');
    },
  };
};

// One-step getter: reads the chosen player's CURRENTLY PLAYING animation as
// its raw numeric list position - pairs with buildAnimationSetByIdBlock
// above the same way sprite_player_animation_select (pick a name, get its
// ID) pairs with buildAnimationSetBlock. The generic sprite_player_get
// block (VAR = Animation) already reads this too, just needing "Animation"
// picked from VAR first - this skips that extra step for the same reason
// buildAnimationSetByIdBlock skips sprite_player_set's VAR dropdown.
const buildAnimationIdGetBlock = ({icon, colour}) => {
  Blockly.Blocks['sprite_player_animation_id_get'] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} Player`)
          .appendField(new Blockly.FieldDropdown(PLAYER_DROPDOWN_OPTIONS), 'PLAYER')
          .appendField(`${ANIMATION_ICON} current animation ID`);
      this.setOutput(true, 'Number');
      this.setColour(colour);
      Blockly.Extensions.apply('sprite_player_field_sync', this, false);
      this.setTooltip('Reads the chosen player\'s currently playing animation as its numeric ' +
        'list position (0-based, top to bottom) - for a fixed animation\'s ID by name instead, ' +
        'see "Player animation [name]", which does the reverse (name to ID).');
    },
  };
};

// Works exactly like sprite_player_fade_finished (see its comment below) -
// same shared "check a flag bit, clear it, run DO" shape,
// just watching a non-looping animation's "finished" bit (see
// animationLoopBitsCode in generators/bbasic/sprites.js) instead of a color
// fade's. Never fires for a LOOPING animation (the default - see the "loop"
// checkbox on "Player set animation to"/"Player set animation to ID"/the
// generic "Player set Animation to"), since a looping animation never
// actually reaches a stopped "finished" state to begin with.
const buildAnimationFinishedBlock = ({icon, colour}) => {
  Blockly.Blocks['sprite_player_animation_finished'] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} When Player`)
          .appendField(new Blockly.FieldDropdown(PLAYER_DROPDOWN_OPTIONS), 'PLAYER')
          .appendField(`${ANIMATION_ICON} animation has finished`);
      this.appendStatementInput('DO');
      this.setPreviousStatement(true);
      this.setNextStatement(true);
      this.setColour(colour);
      Blockly.Extensions.apply('sprite_player_field_sync', this, false);
      this.setTooltip('Runs the connected blocks once, the moment a non-looping animation (see ' +
        'the "loop" checkbox on the Set Animation blocks) reaches its last frame and stops. ' +
        'Never fires for a looping animation (the default), which never actually stops.');
    },
  };
};

const buildPlayerOptions = (name) => [
  [HORIZONTAL_ICON + ' X', `${name}x`],
  [VERTICAL_ICON + ' Y', `${name}y`],
  [COLOR_ICON + ' Color', `${name}realcolor`],
  [ANIMATION_ICON + ' Animation', `${name}animation`],
  [MIRROR_ICON + ' Horizontal flip', `__${name}size_3_`],
];

const buildMissileOptions = (name) => [
  [HORIZONTAL_ICON + ' X', `${name}x`],
  [VERTICAL_ICON + ' Y', `${name}y`],
  [HEIGHT_ICON + ' Height', `${name}height`],
];

const PLAYER_SIZE_OPTIONS = [
  ['1 copy of player and missile.', '$0'],
  ['2 close-spaced copies of player and missile.', '$1'],
  ['2 medium-spaced copies of player and missile.', '$2'],
  ['3 close-spaced copies of player and missile.', '$3'],
  ['2 wide-spaced copies of player and missile.', '$4'],
  ['Double-sized player.', '$5'],
  ['3 medium-spaced copies of player and missile.', '$6'],
  ['Quad-sized', '$7'],
];

const MISSILE_SIZE_OPTIONS = [
  ['1', '$00'],
  ['2', '$10'],
  ['4', '$20'],
  ['8', '$30'],
];

// Same 0-7 clockwise-from-Up encoding as input_joyN_direction8 (see
// blocks/input.js's  buildJoystickDirection8Block) - used for the Fire
// block's "Default direction" dropdown (see generateMissileFireChecks'
// trigger comment): whatever the user picks here is what actually fires
// when the Angle input evaluates to 255 ("no clear direction" - e.g. the
// joystick is centered), rather than a single hardcoded fallback, so any of
// the 8 directions can be the default, not just Up.
const MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS_8 = [
  ['⬆ Up', '0'],
  ['↗ Up-Right', '1'],
  ['➡ Right', '2'],
  ['↘ Down-Right', '3'],
  ['⬇ Down', '4'],
  ['↙ Down-Left', '5'],
  ['⬅ Left', '6'],
  ['↖ Up-Left', '7'],
];
// Same 0-15 scale DIRECTION16_STEPS (generators/bbasic/sprites.js) uses at
// runtime - even indices are the original 8 compass points above (doubled),
// odd indices are the new halfway points "16 directions" inserts between
// each pair.
const MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS_16 = [
  ['⬆ Up', '0'],
  ['⬆ Up (leaning right)', '1'],
  ['↗ Up-Right', '2'],
  ['➡ Right (leaning up)', '3'],
  ['➡ Right', '4'],
  ['➡ Right (leaning down)', '5'],
  ['↘ Down-Right', '6'],
  ['⬇ Down (leaning right)', '7'],
  ['⬇ Down', '8'],
  ['⬇ Down (leaning left)', '9'],
  ['↙ Down-Left', '10'],
  ['⬅ Left (leaning down)', '11'],
  ['⬅ Left', '12'],
  ['⬅ Left (leaning up)', '13'],
  ['↖ Up-Left', '14'],
  ['⬆ Up (leaning left)', '15'],
];
// Dynamic dropdown generator (Blockly's  FieldDropdown constructor
// accepts a function as well as a plain array) - "this" is the FIELD
// instance when Blockly calls this, per the standard dynamic-options
// convention already used elsewhere in this codebase (e.g. blocks/
// text-strings.js's  buildTextStringOptions). Reads the SIBLING
// DIRECTIONS16 checkbox off the same block to decide which of the two
// static lists above to show - falls back to the 8-way list if the block
// isn't attached yet (the very first call, made by the FieldDropdown
// constructor itself before this field has even been appended to a block).
const buildMissileFireDefaultAngleOptions = function() {
  // eslint-disable-next-line no-invalid-this
  const block = this.getSourceBlock && this.getSourceBlock();
  const is16 = block && block.getFieldValue('DIRECTIONS16') === 'TRUE';
  return is16 ? MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS_16 : MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS_8;
};
// Wires the DIRECTIONS16 checkbox so toggling it both refreshes
// DEFAULT_ANGLE's  dynamic option list (FieldDropdown caches its
// generated menu - see registerDropdownFieldSyncExtension's  identical
// "getOptions() before setValue()" gotcha above) AND translates whatever
// value was already selected onto the new scale, the same doubling this
// block's  generator already does at compile time for a 255 ("no clear
// direction") fallback - so a project that already had e.g. "Right" (2)
// picked before checking "16 directions" lands on the equivalent "Right"
// (4) on the finer scale instead of silently becoming "Right (leaning up)".
// Halving on the way back down floors to the nearest original compass
// point, since a halfway direction has no exact 8-way equivalent. Also
// busts DEFAULT_ANGLE's  option cache once unconditionally right after
// setup, so a block loaded from a saved project with "16 directions"
// already checked shows the right list immediately - a field's validator
// never fires for a value that arrives via XML load with events suppressed
// (see registerDropdownFieldSyncExtension's  comment on that exact
// mechanism), so waiting for a live toggle to do this wouldn't cover that
// case.
const setupFireDefaultAngleSync = (block) => {
  const directions16Field = block.getField('DIRECTIONS16');
  const defaultAngleField = block.getField('DEFAULT_ANGLE');
  if (!directions16Field || !defaultAngleField) return;
  directions16Field.setValidator(function(newValue) {
    // eslint-disable-next-line no-invalid-this
    const wasOn = this.getValue() === 'TRUE';
    const isOn = newValue === 'TRUE';
    if (wasOn !== isOn) {
      const current = parseInt(defaultAngleField.getValue(), 10) || 0;
      const translated = isOn ? current * 2 : Math.floor(current / 2);
      defaultAngleField.getOptions();
      defaultAngleField.setValue(String(translated));
    }
    return newValue;
  });
  defaultAngleField.getOptions();
};

// Player 0 and Player 1 are otherwise-identical hardware players (same
// register SHAPE, just player0* vs player1* real bB variable names - see
// generators/bbasic/sprites.js's  ROM_NOISE_COLOR_REGISTERS comment for
// the one place they're genuinely different real registers, which is
// data-driven by name already, not block-shape-driven), so every Player
// block is a single combined type with this PLAYER dropdown instead of a
// separate sprite_player0_*/sprite_player1_* pair - confirmed with the user
// (this used to be two full sets of blocks; Ball is NOT part of this - it
// never had a twin to combine with, so buildSpriteBlocks below stays per-name
// for it (its Fire block is the combined Missile/Ball one). Missile 0/1 get the exact
// same "one combined type, MISSILE dropdown instead of PLAYER" treatment
// - see MISSILE_OPTIONS just below).
// Labels are bare "0"/"1", not "Player 0"/"Player 1" - every combined
// Player block's  message0 already has a static "Player" word right
// before this dropdown (see buildCombinedPlayerVarBlocks etc. below), so
// full labels here would read as a doubled "Player Player 0" once placed.
const PLAYER_OPTIONS = [['0', '0'], ['1', '1']];

// The DPC+ kernel has eight more sprites (Player 2 to 9), offered by the blocks that can drive them.
const PLAYER_DROPDOWN_OPTIONS = function() {
  const dpcPlus = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus';
  return Array.from({length: dpcPlus ? 10 : 2}, (_, i) => [String(i), String(i)]);
};

const playerNameFromField = (block) => {
  const value = block && block.getFieldValue('PLAYER');
  return `player${/^[0-9]$/.test(value) ? value : '0'}`;
};

// Same reasoning as PLAYER_OPTIONS above, for Missile 0/1 - genuinely
// identical hardware objects (missileFireActiveBit/missileFireDirVarName/
// etc. in generators/bbasic/sprites.js already treat 'missile0'/'missile1'
// as pure data, never branching on which one), just missile0*/missile1*
// real bB variable names.
// Same "bare 0/1, not Missile 0/Missile 1" reasoning as PLAYER_OPTIONS
// above - every combined Missile block's  message0 already has a
// static "Missile" word right before this dropdown.
const MISSILE_OPTIONS = [['0', '0'], ['1', '1']];
// The Fire block covers both missiles and the ball in one dropdown (the field is still called
// MISSILE, as it was when the block only did missiles, so saved projects keep loading).
const FIRE_OBJECT_OPTIONS = [['Missile 0', '0'], ['Missile 1', '1'], ['Ball', 'ball']];
// Fire also launches the players (all ten on DPC+, two otherwise), as a Fire object like the missiles.
const FIRE_OBJECT_DROPDOWN_OPTIONS = function() {
  const dpcPlus = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus';
  const players = Array.from({length: dpcPlus ? 10 : 2}, (_, i) => ['Player ' + i, 'player' + i]);
  return [...FIRE_OBJECT_OPTIONS, ...players];
};
// Players 2 to 9 (DPC+ virtual sprites) each get a different color on the blocks that pick one, Player 0 is red and Player 1 blue.
const EXTRA_PLAYER_COLOURS = {
  2: '#2e9e4f', 3: '#8a5ac2', 4: '#d4a017', 5: '#17a2b8', 6: '#d6338a', 7: '#7a8c2c', 8: '#8d5a3b', 9: '#607d8b',
};
const extraPlayerColour = (number) => EXTRA_PLAYER_COLOURS[number] || '#8a5ac2';
const fireObjectColour = (value) => (value === 'ball' ? '#ff8800' : (value === '1' || value === 'player1') ? 'blue' :
  /^player[2-9]$/.test(value) ? extraPlayerColour(value.slice(6)) : 'red');

const missileNameFromField = (block) => `missile${block && block.getFieldValue('MISSILE') === '1' ? '1' : '0'}`;

// Builds the VAR dropdown's option list fresh every time it opens (the same
// "dynamic options" FieldDropdown support blocks/bit.js's
// buildVariableField already relies on) - the real variable names
// underneath (player0x vs player1x, etc.) depend on whichever player THIS
// block's  PLAYER field currently holds, so a plain static option array
// can't work once Player 0/1 share one block type. extraOptionsFor, when
// given, appends whatever extra get-only/set-only options that block needs
// (Frame for the getter, Visibility for the setter) - "change" passes
// nothing, matching buildSpriteBlocks'  three-way options/writeOnly/
// readOnly split below.
const buildPlayerVarOptionsFn = (extraOptionsFor) => function() {
  // eslint-disable-next-line no-invalid-this
  const name = playerNameFromField(this.getSourceBlock());
  return [...buildPlayerOptions(name), ...(extraOptionsFor ? extraOptionsFor(name) : [])];
};

// Under DPC+ each missile has a separate color register (COLUM0/COLUM1), where the standard kernel draws a missile in
// its player's color. The Missile blocks' Color option stands for it; the generator turns it into that register.
const dpcPlusMissileColorOptions = (name) =>
  (((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus' ? [[COLOR_ICON + ' Color', `${name}color`]] : []);

// Same reasoning as buildPlayerVarOptionsFn above, for the combined Missile
// 0/1 get/set/change blocks - extraOptionsFor appends Width (set-only), the
// missile equivalent of buildPlayerVarOptionsFn's  Frame/Visibility.
const buildMissileVarOptionsFn = (extraOptionsFor) => function() {
  // eslint-disable-next-line no-invalid-this
  const name = missileNameFromField(this.getSourceBlock());
  return [...buildMissileOptions(name), ...(extraOptionsFor ? extraOptionsFor(name) : [])];
};

// Registers a "dropdown drives colour + VAR field" extension shared by both
// the combined Player and combined Missile blocks (see PLAYER_OPTIONS'/
// MISSILE_OPTIONS' comments) - identical logic either way, just reading
// a differently-named dropdown field and a differently-prefixed real
// variable name, so this is written once and called twice rather than
// hand-duplicated.
//
// Single extension covering BOTH concerns every combined block needs from
// its  dropdown field - Blockly.Block.prototype.setOnChange (see its
// JSDoc) REPLACES any prior onchange handler rather than composing with it,
// so this can't be split into two separate registered extensions (one per
// concern) the way it reads more naturally; every block gets exactly one
// 'extensions' entry pointing here instead.
//
// 1. Colour - index0 (Player 0/Missile 0) = red, index1 (Player 1/
//    Missile 1) = blue, the exact colours the old separate per-name blocks
//    used to be, before they were combined into one type each (confirmed
//    with the user: still wanted that same visual distinction, just driven
//    by the dropdown now instead of by which block type was dragged out).
//    Applied once immediately (a block's  initial colour, from its JSON
//    'colour' key, is only ever right for the dropdown's default value) and
//    again on every change.
// 2. VAR sync (only for blocks that actually have a VAR field - get/set/
//    change) - keeps VAR showing a valid, correctly-translated option after
//    the dropdown changes. Without this, switching e.g. Player 0 -> Player 1
//    on an existing block would leave VAR holding a stale "player0..."
//    value that isn't even one of the (now player1-prefixed) options being
//    shown. Translates the SAME property across (player0x -> player1x, not
//    silently resetting back to X every time) when the old value still has
//    the expected prefix; otherwise leaves it alone.
//
// Registered as a VALIDATOR directly on the dropdown field, not via
// Blockly.Block.prototype.setOnChange - confirmed as a real reported bug:
// setOnChange only ever fires from a real Blockly.Events.BlockChange event,
// and Blockly suppresses event firing entirely while a block is being
// built from XML with events disabled (see Field.prototype.setValue's
// "if (source && Blockly.Events.isEnabled())" guard in node_modules/
// blockly/core/field.js) - which is exactly how every TOOLBOX FLYOUT block
// is constructed (Blockly.Xml.domToBlock, called with events off for
// performance), so a block placed in the toolbox XML with e.g.
// `<field name="PLAYER">1</field>` never fired the change this relied on
// and stayed whatever colour PLAYER's  JSON default resolved to. A
// field's LOCAL VALIDATOR (this.getValidator()/setValidator()), by
// contrast, is called unconditionally from inside setValue() itself,
// BEFORE that same events-enabled check - runs every single time, XML load
// or live user edit alike. Field.prototype.setValue's  oldValue read
// happens AFTER the validator runs but BEFORE the new value is committed,
// so the validator's `this.getValue()` (this = the field) is still the
// OLD value at the point it runs, and the validator's  newValue
// parameter is the incoming one - exactly the {old, new} pair this used to
// read off the (unreliable) BlockChange event instead.
//
// VAR's  getOptions() (no cache arg) has to run BEFORE its setValue() -
// same gotcha blocks/bit.js's  refreshVariableDropdownValue documents:
// the dropdown's dynamic options are cached until something invalidates
// them, and setValue()'s  validation reads whatever's cached, so
// skipping the fresh getOptions() call would just validate the translated
// value against the OLD option list instead of the new one.
// Exported - blocks/input.js's combined Joystick 0/1 blocks reuse this
// directly (same "dropdown drives colour + optional VAR-prefix translate"
// shape) rather than duplicating it.
export const registerDropdownFieldSyncExtension = (extensionName, dropdownFieldName, namePrefixFor) => {
  const colourFor = (value) => (value === '1' ? 'blue' : /^[2-9]$/.test(value) ? extraPlayerColour(value) : 'red');
  Blockly.Extensions.register(extensionName, function() {
    // eslint-disable-next-line no-invalid-this
    const block = this;
    const dropdownField = block.getField(dropdownFieldName);
    if (!dropdownField) return;
    block.setColour(colourFor(dropdownField.getValue()));
    dropdownField.setValidator(function(newValue) {
      block.setColour(colourFor(newValue));
      const varField = block.getField('VAR');
      // eslint-disable-next-line no-invalid-this
      const oldValue = this.getValue();
      // Only when the dropdown is ACTUALLY changing - XML deserialization
      // (loading a saved project) calls setValue for every field tag
      // regardless of whether it differs from the field's just-constructed
      // default, so a block whose PLAYER/MISSILE tag happens to match its
      // default (e.g. "0", same as a fresh block's starting value)
      // would otherwise still schedule a "correction" below - see this
      // whole block's comment for why that's applied AFTER the fact,
      // and why applying it unconditionally clobbered the VALUE this same
      // block's explicit VAR tag had already (correctly) set moments
      // later in the same deserialization pass (confirmed as a real
      // reported bug - see git history for this block).
      if (varField && oldValue !== newValue) {
        // Deferred via setTimeout (same "run after the current Blockly
        // field-update cascade finishes" pattern as blocks/function.js's
        // fixFunctionCallNames/updateFunctionCallArgVisibility), AND
        // re-reading VAR's value fresh only once deferred, not captured
        // synchronously here - confirmed as a real reported bug otherwise
        // ("Player 1 set" blocks silently moving Player 0"): this
        // validator runs BEFORE the dropdown field's value actually
        // commits (Field.prototype.setValue calls the local validator,
        // then only afterwards updates this.value_ - see node_modules/
        // blockly/core/field.js), so reading/translating VAR's value
        // synchronously here uses a STILL-STALE menuGenerator result (it
        // reads this block's PLAYER/MISSILE field LIVE, still the OLD
        // value at this exact moment) - and, if this block has ITS
        // separate VAR field tag still to come later in the same XML
        // deserialization pass, a translated value captured NOW would go
        // stale the instant that later, legitimate tag applies, and then
        // silently overwrite it right back out from under it once this
        // deferred callback finally runs. Reading everything fresh here
        // instead - by now PLAYER/MISSILE's value has genuinely
        // committed AND any of this block's later field tags have
        // already applied - avoids both problems at once.
        setTimeout(() => {
          if (!block.workspace || (typeof block.isDeadOrDying === 'function' && block.isDeadOrDying())) return;
          const oldName = namePrefixFor(oldValue);
          const newName = namePrefixFor(newValue);
          const current = varField.getValue();
          // A plain .replace() (first occurrence anywhere), not an
          // indexOf(...)===0/slice pair - confirmed as a real reported bug
          // otherwise ("Horizontal flip" left untranslated switching
          // Player 0/1): buildPlayerOptions' Horizontal flip option
          // value is `__${name}size_3_` (the player name embedded after a
          // leading "__", not at the very start of the string, unlike every
          // other property's `${name}...` shape), so an indexOf(...)===0
          // check never matched it at all. Every raw value this can ever
          // see is one of this app's generated option strings (never
          // user input), so a first-occurrence replace is safe - there's
          // no risk of coincidentally matching unrelated text.
          const translated = (typeof current === 'string' && current.includes(oldName)) ?
            current.replace(oldName, newName) : current;
          if (translated === current) return;
          varField.generatedOptions = null;
          varField.setValue(translated);
        }, 0);
      }
      return newValue;
    });
  });
};

registerDropdownFieldSyncExtension('sprite_player_field_sync', 'PLAYER',
    (value) => `player${/^[0-9]$/.test(value) ? value : '0'}`);
registerDropdownFieldSyncExtension('sprite_missile_field_sync', 'MISSILE',
    (value) => `missile${value === '1' ? '1' : '0'}`);

// The combined Player getter/setter/"change by" - see PLAYER_OPTIONS'
// comment above. Unlike buildSpriteBlocks below (still per-name, still used
// for Missile 0/1/Ball), this is only ever called once, for both players at
// once - there's no separate "options"/description per player anymore, just
// the one shared VAR dropdown reading whichever player PLAYER currently
// names (buildPlayerVarOptionsFn above).
const buildCombinedPlayerVarBlocks = ({icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': 'sprite_player_get',
      'message0': `${icon} Player %1 %2`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          // Custom-ordered (not buildPlayerVarOptionsFn's usual "base
          // options, then extras appended at the end") so Height can sit
          // between Y and Color, as requested, rather than trailing after
          // Frame like every other get-only extra does.
          'options': function() {
            // eslint-disable-next-line no-invalid-this
            const name = playerNameFromField(this.getSourceBlock());
            return [
              [HORIZONTAL_ICON + ' X', `${name}x`],
              [VERTICAL_ICON + ' Y', `${name}y`],
              // player0height/player1height are real batari Basic kernel
              // variables (see sprite_player_rom_noise's comment in
              // generators/bbasic/sprites.js) - auto-set by the compiler to
              // match whichever graphic frame is currently showing, exactly
              // like player0frame already is, so this needs no new dev var
              // or generator special-case, just another plain get-only
              // option resolving straight to the real kernel symbol.
              [HEIGHT_ICON + ' Height', `${name}height`],
              // The width/quantity code (0-7) "Player set width/quantity" writes into
              // the low 3 bits of the size variable: 0 is one copy, 5 double size,
              // 7 quad size, the rest are 2 or 3 copies. It is not a variable,
              // so the generator masks it out of the size variable.
              [HEIGHT_ICON + ' Width/quantity', `__${name}size_w_`],
              [COLOR_ICON + ' Color', `${name}realcolor`],
              [ANIMATION_ICON + ' Animation', `${name}animation`],
              [MIRROR_ICON + ' Horizontal flip', `__${name}size_3_`],
              [FRAME_ICON + ' Frame', `${name}frame`],
              // 1 while the player is shown, 0 while Visibility has hidden it (a hidden player
              // is on frame 255). Not a variable, so the generator works it out from the frame.
              [VISIBILITY_ICON + ' Visibility', `__${name}visible_`],
            ];
          },
        },
      ],
      // Also fits the true/false sockets of the Logic blocks: Visibility reads as true or false there.
      'output': ['Number', 'Boolean'],
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Reads information about whichever player is selected. Visibility is 1 while the ' +
        'player is shown and 0 while it is hidden.',
    },
    // Block for the setter.
    {
      'type': 'sprite_player_set',
      'message0': `${icon} Player %1 set %2 to %3`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildPlayerVarOptionsFn((name) => [
            [VISIBILITY_ICON + ' Visibility', `${name}visibility`],
            // Cuts a DPC+ player's picture down to this many scanlines (a drawn row is 2) whatever its animation frame
            // says, e.g. to make a bar that grows and shrinks. 255 takes the limit off.
            ...(((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus' ?
              [[HEIGHT_ICON + ' Height limit in lines (DPC+)', `${name}height`]] : []),
          ]),
        },
        {
          'type': 'input_value',
          'name': 'VALUE',
        },
      ],
      // A second row for the "loop" checkbox - same "field(s) FIRST, then
      // a trailing named input_dummy to close/wrap them" shape as
      // sprite_inertia_accelerate's DIRECTIONS16_INPUT/FINE_INPUT rows
      // (see that block's comment for why the dummy has to come AFTER the
      // field it's wrapping, not before - a real reported crash
      // ("FieldDropdown.getTextContent: text content is null") when this
      // was first built with the dummy declared first). Only actually
      // shown once VAR is "Animation" - see
      // sprite_player_set_loop_visibility_sync's comment below.
      'message1': '%1 %2 loop %3',
      'args1': [
        {'type': 'field_label', 'text': ' '},
        {
          'type': 'field_checkbox',
          'name': 'LOOP',
          'checked': true,
        },
        {
          'type': 'input_dummy',
          'name': 'LOOP_INPUT',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync', 'sprite_player_set_loop_visibility_sync'],
      'tooltip': 'Updates information about whichever player is selected. Setting Animation ' +
        'shows a "loop" checkbox - on (the default) replays it from the start every time it ' +
        'ends; off plays it once and leaves it on its last frame (see "Player animation has ' +
        'finished" to react to that moment).',
    },
    // Block for adding to a variable in place.
    {
      'type': 'sprite_player_change',
      'message0': `${icon} Player %1 change %2 by %3`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildPlayerVarOptionsFn(),
        },
        {
          'type': 'input_value',
          'name': 'DELTA',
          'check': 'Number',
        },
      ],
      // Same shape as sprite_player_set's message1/args1 just above.
      'message1': '%1 %2 loop %3',
      'args1': [
        {'type': 'field_label', 'text': ' '},
        {
          'type': 'field_checkbox',
          'name': 'LOOP',
          'checked': true,
        },
        {
          'type': 'input_dummy',
          'name': 'LOOP_INPUT',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync', 'sprite_player_set_loop_visibility_sync', 'math_change_tooltip'],
    },
  ]);
};

// Shows/hides sprite_player_set's/sprite_player_change's LOOP_INPUT (the
// "loop" checkbox) based on whether VAR is currently set to "Animation" -
// every other property (X/Y/Color/Visibility/Horizontal flip/...) has no
// such concept, so the checkbox would just read as a dead control for
// them. Same visibility-toggle shape/guards (insertion-marker/headless-
// workspace bail-outs) as sprite_inertia_accelerate_action_sync's
// comment above - VAR's value is a real variable name
// (player0animation/player1animation), not a fixed literal shared across
// every PLAYER choice, so this checks endsWith('animation') rather than a
// fixed option list, matching buildPlayerOptions' `${name}animation`
// value shape. A dedicated extension, not folded into
// registerDropdownFieldSyncExtension above - that one's shared with the
// combined Missile blocks too, which have no Animation option or
// LOOP_INPUT to toggle at all.
Blockly.Extensions.register('sprite_player_set_loop_visibility_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const varField = block.getField('VAR');
  if (!varField) return;
  const applyVisibility = (value) => {
    if (typeof block.isInsertionMarker === 'function' && block.isInsertionMarker()) return;
    if (!block.workspace || !block.workspace.rendered) return;
    const shouldBeVisible = typeof value === 'string' && value.endsWith('animation');
    const input = block.getInput('LOOP_INPUT');
    if (!input || input.isVisible() === shouldBeVisible) return;
    input.setVisible(shouldBeVisible);
    // Deferred, not called synchronously here - same "run after the
    // current Blockly field-update cascade finishes" reasoning
    // registerDropdownFieldSyncExtension's comment documents in detail.
    // This runs from TWO places that can both fire before the block has
    // ever gone through a first real render: once synchronously at
    // extension-apply time (construction - VAR's default option here is
    // X, not Animation, so this genuinely does need to hide LOOP_INPUT on
    // every fresh instance, unlike sprite_inertia_accelerate_action_sync's
    // initial call, which happens to be a no-op since that block's default
    // ACTION already matches its fields' starting visibility), and again
    // via the VALIDATOR the instant a saved project's XML
    // <field name="VAR"> tag gets applied during load - BEFORE this
    // block's first real render either time. Calling block.render()
    // synchronously in both cases corrupts this block's row/field
    // measurements for Blockly's subsequent real render pass right after -
    // confirmed as a real reported crash
    // ("FieldDropdown.getTextContent: text content is null") on every
    // fresh sprite_player_set/change instance AND on loading any saved
    // project with one. Deferring guarantees Blockly's first render
    // (which already reads isVisible() fresh regardless) has happened by
    // the time this actually runs.
    setTimeout(() => {
      // The block may be gone by now (the tab was left or a project was
      // imported in the meantime): rendering a disposed block throws and
      // breaks Blockly's shared render queue for every later render.
      if (!block.workspace || (typeof block.isDeadOrDying === 'function' && block.isDeadOrDying())) return;
      if (typeof block.queueRender === 'function') block.queueRender();
      else if (typeof block.render === 'function') block.render();
      if (block.workspace && block.workspace.resizeContents) block.workspace.resizeContents();
    }, 0);
  };
  applyVisibility(varField.getValue());
  varField.setValidator((newValue) => {
    applyVisibility(newValue);
    return newValue;
  });
});

// Bounce's angle number is only shown while "set angle manually" is ticked.
// Same deferred-render reasoning as the extension above.
Blockly.Extensions.register('object_bounce_manual_angle_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const manualField = block.getField('MANUAL');
  if (!manualField) return;
  const applyVisibility = (value) => {
    if (typeof block.isInsertionMarker === 'function' && block.isInsertionMarker()) return;
    if (!block.workspace || !block.workspace.rendered) return;
    const shouldBeVisible = value === true || value === 'TRUE';
    const input = block.getInput('ANGLE');
    if (!input || input.isVisible() === shouldBeVisible) return;
    input.setVisible(shouldBeVisible);
    setTimeout(() => {
      if (!block.workspace || (typeof block.isDeadOrDying === 'function' && block.isDeadOrDying())) return;
      // Prefill the shown field with a number block (a shadow, so it can be
      // replaced) when nothing is plugged in.
      if (shouldBeVisible && !input.connection.targetBlock()) {
        const shadow = block.workspace.newBlock('math_number');
        shadow.setShadow(true);
        shadow.setFieldValue(0, 'NUM');
        shadow.initSvg();
        input.connection.connect(shadow.outputConnection);
        if (typeof shadow.render === 'function') shadow.render();
      }
      if (typeof block.queueRender === 'function') block.queueRender();
      else if (typeof block.render === 'function') block.render();
      if (block.workspace && block.workspace.resizeContents) block.workspace.resizeContents();
    }, 0);
  };
  applyVisibility(manualField.getValue());
  manualField.setValidator((newValue) => {
    applyVisibility(newValue);
    return newValue;
  });
});

// Same reasoning as buildCombinedPlayerVarBlocks above, for Missile 0/1 -
// Ball is NOT part of this (never had a twin), so buildSpriteBlocks below
// stays per-name for it, same as it always has.
const buildCombinedMissileVarBlocks = ({icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': 'sprite_missile_get',
      'message0': `${icon} Missile %1 %2`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'MISSILE',
          'options': MISSILE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildMissileVarOptionsFn(dpcPlusMissileColorOptions),
        },
      ],
      'output': 'Number',
      colour,
      'extensions': ['sprite_missile_field_sync'],
      'tooltip': 'Reads information about whichever missile is selected.',
    },
    // Block for the setter.
    {
      'type': 'sprite_missile_set',
      'message0': `${icon} Missile %1 set %2 to %3`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'MISSILE',
          'options': MISSILE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildMissileVarOptionsFn((name) => [[HEIGHT_ICON + ' Width', `${name}width`], ...dpcPlusMissileColorOptions(name)]),
        },
        {
          'type': 'input_value',
          'name': 'VALUE',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_missile_field_sync'],
      'tooltip': 'Updates information about whichever missile is selected. With the DPC+ kernel the missile ' +
        'also has a Color, and a Height of 0 hides it while a Height of 1 draws it on every other line.',
    },
    // Block for adding to a variable in place.
    {
      'type': 'sprite_missile_change',
      'message0': `${icon} Missile %1 change %2 by %3`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'MISSILE',
          'options': MISSILE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildMissileVarOptionsFn(),
        },
        {
          'type': 'input_value',
          'name': 'DELTA',
          'check': 'Number',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_missile_field_sync', 'math_change_tooltip'],
    },
  ]);
};

const buildSpriteBlocks = ({name, description, icon, options=[], writeOnlyOptions=[], readOnlyOptions=[], colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for the getter.
    {
      'type': `sprite_${name}_get`,
      'message0': `${icon} ${description} %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': [...options, ...readOnlyOptions],
        },
      ],
      'output': 'Number',
      colour,
      'tooltip': `Reads information about ${description}`,
    },
    // Block for the setter.
    {
      'type': `sprite_${name}_set`,
      'message0': `${icon} ${description} %{BKY_VARIABLES_SET}`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': [...options, ...writeOnlyOptions],
        },
        {
          'type': 'input_value',
          'name': 'VALUE',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Updates information about ${description}`,
    },
    // Block for adding to a variable in place.
    {
      'type': `sprite_${name}_change`,
      'message0': `${icon} ${description} %{BKY_MATH_CHANGE_TITLE}`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          options,
        },
        {
          'type': 'input_value',
          'name': 'DELTA',
          'check': 'Number',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['math_change_tooltip'],
    },
  ]);
};

const buildPlayerBlocks = ({icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for changing a player's size and quantity.
    {
      'type': 'sprite_player_size',
      'message0': `${icon} Player %1 set width/quantity to %2`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'SIZE',
          'options': PLAYER_SIZE_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync', 'math_change_tooltip'],
    },
    // Block for pausing/resuming a player's animation.
    {
      'type': 'sprite_player_animation_playback',
      'message0': `${icon} Player %1 ${ANIMATION_ICON} animation %2`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'STATE',
          'options': [
            [`${PLAY_ICON} Play`, 'play'],
            [`${PAUSE_ICON} Pause`, 'pause'],
          ],
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Plays or pauses the chosen player\'s animation',
    },
    // Points this player directly at a slice of the ROM's bank 1 code
    // (plus a runtime offset) instead of one of its defined animation
    // frames - the classic Yars' Revenge "neutral zone" trick: real batari
    // Basic sprites are just a pointer + a row count read from wherever
    // that pointer happens to be (see generators/bbasic/sprites.js's
    // comment on player0pointer/player0height for the confirmed real
    // kernel mechanics), so pointing it at ordinary CODE instead of a
    // drawn graphic makes the sprite display those bytes as a pixel
    // pattern - genuinely arbitrary-looking, not tied to anything the
    // user has to set up first. No data table to create or pick - an
    // earlier version of this required one, specifically to guarantee a
    // real, always-present bank 1 address; generators/bbasic/sprites.js's
    // generator now points at a fixed kernel label that's already
    // guaranteed present in every compiled ROM instead, so this block
    // works immediately with no other setup. OFFSET defaults to the frame
    // counter when left unplugged (see that generator's comment) so the
    // pattern already shimmers by itself - it's still a real, typed input
    // if a specific offset expression is ever wanted instead.
    {
      'type': 'sprite_player_rom_noise',
      'message0': `${icon} Player %1 display ${DATA_ICON} ROM noise, offset %2 height %3 rows`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
        {
          'type': 'input_value',
          'name': 'OFFSET',
          'check': 'Number',
        },
        {
          'type': 'input_value',
          'name': 'HEIGHT',
          'check': 'Number',
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Makes the chosen player display raw ROM bytes as its graphic, instead of one ' +
        'of its normal animation frames - the same trick Yars\' Revenge used for its "neutral ' +
        'zone" static effect. Always reads from bank 1 (regardless of which bank this block ' +
        'itself ends up in). Leave "offset" unplugged for an automatically shimmering pattern ' +
        '(it defaults to the frame counter) - or plug in a custom expression to control exactly ' +
        'which bytes show. This keeps overriding the player\'s graphic every frame, even over a ' +
        'normal animation frame set afterward, until the separate "stop ROM noise" block is used ' +
        '- it does NOT affect player width/quantity (NUSIZ) - a size set with the "set width/' +
        'quantity" block above still applies normally on top of this. See the separate ' +
        '"rainbow colors" block for a different color on every row of the player too.',
    },
    // ROM noise (above) sets a runtime "active" flag that keeps overriding
    // this player's graphic pointer every single frame, forever, once
    // triggered - a normal "Set animation" block alone can't undo that,
    // since generateRomNoiseChecks'  per-frame override runs AFTER the
    // animation logic every frame and only ever gets set, never cleared
    // (confirmed as a real reported gap: "I want to be able to switch back
    // to using sprite graphics after using the noise block"). This just
    // clears that flag, letting the animation pointer generateAnimations
    // already reasserts every frame regardless take back over immediately -
    // no pixel/graphic changes.
    {
      'type': 'sprite_player_rom_noise_stop',
      'message0': `${icon} Player %1 stop ${DATA_ICON} ROM noise`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_DROPDOWN_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Switches the chosen player back to showing its normal animation frames again, ' +
        'undoing the "display ROM noise" block above - that block keeps overriding the graphic ' +
        'every frame until this one is used, even if a normal animation frame is set in the ' +
        'meantime.',
    },
    // A different color on every scanline of this player - a REAL, existing
    // batari Basic kernel feature ("playercolors"/"player1colors" kernel
    // options - see std_kernel.asm's "ifnconst playercolors" checks),
    // not built from scratch here. Deliberately its  separate block, not
    // a checkbox on sprite_*_rom_noise: this reads ROM bytes into
    // player0color/player1color the exact same "no data table, no ROM cost"
    // way the noise block reads them into player0pointer/player1pointer
    // (see generators/bbasic/sprites.js's ROM_NOISE_COLOR_REGISTERS
    // comment for the confirmed real register aliasing this relies on), but
    // that mechanism is entirely independent of what the player's GRAPHIC
    // pointer is doing - it works identically whether this player is
    // showing a normal drawn animation frame OR ROM noise, so keeping it
    // separate lets either be used without the other.
    {
      'type': 'sprite_player_rainbow_colors',
      'message0': `${icon} Player %1 rainbow colors, offset %2`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_OPTIONS,
        },
        {
          'type': 'input_value',
          'name': 'OFFSET',
          'check': 'Number',
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Gives the chosen player a different color on every one of its rows, reading ' +
        'real ROM bytes the same way the "display ROM noise" block does - works with any graphic, ' +
        'a normal animation frame or ROM noise. Leave "offset" unplugged for an automatically ' +
        'shimmering pattern (it defaults to the frame counter). Turns on a real batari Basic ' +
        'kernel feature that repurposes the matching missile\'s (Missile 0 for Player 0, Missile 1 ' +
        'for Player 1) hardware circuitry to do this, so that missile can no longer be used as a ' +
        'sprite anywhere in the project while this block is used (same tradeoff as the "blank ' +
        'lines between background rows" option) - and for Player 0 specifically, paddle input ' +
        'becomes unavailable too.',
    },
    // Same "active flag only ever gets set, never cleared" gap as
    // sprite_player_rom_noise_stop above, for the rainbow-colors trigger
    // instead - see that block's  comment. One real difference: once
    // "playercolors"/"player1colors" is in kernel_options at all, the
    // KERNEL itself always reads (player0color),y every scanline - there's
    // no way to turn that back into a plain flat COLUP0/COLUP1 color at
    // runtime, so this can't fully "undo" rainbow colors the way the ROM
    // noise stop block can fully undo noise. What it DOES do: with the
    // Options tab's "Enable per-row sprite colors" toggle on, each
    // animation frame already declares its  real per-row color table
    // (see generateAnimations in generators/bbasic.js) every time that
    // frame is (re)shown - clearing this flag lets THAT take back over,
    // the same "something else already reasserts every frame" mechanism
    // the ROM noise stop block relies on. Without that toggle, this just
    // freezes the color pointer wherever it currently is.
    {
      'type': 'sprite_player_rainbow_colors_stop',
      'message0': `${icon} Player %1 stop rainbow colors`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Stops the chosen player\'s "rainbow colors" block from continuing to override ' +
        'its row colors every frame. With the Options tab\'s "Enable per-row sprite colors" ' +
        'toggle on, the player goes back to each animation frame\'s declared colors (or the ' +
        'default color if none were set); without that toggle, the color pointer just stays ' +
        'wherever rainbow colors last left it, since batari Basic has no way to fully return to ' +
        'a single flat color once this kernel feature is active.',
    },
  ]);
};

// Same "trigger block, actual movement happens in a per-frame check" shape
// as buildMissileBlocks' "fire" block just below - separate from it
// (not folded in) since the user wants a distinct, dedicated follow/seek
// action rather than an extension of the angle-based Fire block. One single
// block (not one per sprite name, unlike buildSpriteBlocks/buildMissileBlocks
// above) - an OBJECT dropdown covers all 5 names (both players, both
// missiles, the ball) instead, per an explicit request to combine what was
// originally 5 separate blocks into one.
const SEEK_OBJECT_OPTIONS = [
  [PLAYER_ICON + ' Player 0', 'player0'],
  [PLAYER_ICON + ' Player 1', 'player1'],
  [MISSILE_ICON + ' Missile 0', 'missile0'],
  [MISSILE_ICON + ' Missile 1', 'missile1'],
  [BALL_ICON + ' Ball', 'ball'],
];

// Seek and Inertia also move the DPC+ kernel's extra sprites (Player 2 to 9).
const SEEK_OBJECT_DROPDOWN_OPTIONS = function() {
  const dpcPlus = ((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus';
  if (!dpcPlus) return SEEK_OBJECT_OPTIONS;
  const extra = Array.from({length: 8}, (_, i) => [PLAYER_ICON + ' Player ' + (i + 2), 'player' + (i + 2)]);
  return [...SEEK_OBJECT_OPTIONS.slice(0, 2), ...extra, ...SEEK_OBJECT_OPTIONS.slice(2)];
};

// Same colour-per-choice treatment as sprite_player_fade_colour_sync above,
// generalized to OBJECT's 5-way pick instead of a 2-way one - reusing each
// object's  individual block colour (red for either Player 0 or
// Missile 0, blue for either Player 1 or Missile 1, orange for Ball,
// matching PLAYER_ICON/MISSILE_ICON/BALL_ICON's  call sites further down
// this file) rather than inventing a new palette just for this dropdown.
const SEEK_OBJECT_COLOURS = {
  player0: 'red', player1: 'blue', missile0: 'red', missile1: 'blue', ball: '#ff8800',
  ...Object.fromEntries([2, 3, 4, 5, 6, 7, 8, 9].map((n) => [`player${n}`, extraPlayerColour(n)])),
};
// Validator-based, not setOnChange - see registerDropdownFieldSyncExtension's
// comment above for why: setOnChange only ever fires from a real
// Blockly.Events.BlockChange event, which never fires while a block is
// being built from XML with events disabled (exactly how every toolbox
// flyout block is constructed) - a validator on the field itself runs
// unconditionally on every setValue call instead, XML load or live edit
// alike (confirmed as a real reported bug: toolbox flyout copies all
// stayed the same colour regardless of their  preset OBJECT field).
Blockly.Extensions.register('object_seek_colour_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const objectField = block.getField('OBJECT');
  if (!objectField) return;
  block.setColour(SEEK_OBJECT_COLOURS[objectField.getValue()] || 'purple');
  objectField.setValidator((newValue) => {
    block.setColour(SEEK_OBJECT_COLOURS[newValue] || 'purple');
    return newValue;
  });
});

// Hides DIRECTION/RATE/MAXSPEED/DIRECTIONS16_INPUT/FINE_INPUT entirely
// while ACTION is "stop" on the combined sprite_inertia_accelerate block -
// none of direction/rate/max speed/16-directions/Fine are read by the Stop
// branch (see its generator comment in generators/bbasic/sprites.js), so
// showing them just invites editing values that quietly do nothing, the
// same "nothing useful to show" reasoning input_fire_pattern_frames_sync
// uses for Fire's FRAMES field. DIRECTION/RATE/MAXSPEED are each already a
// separate named "input_value"; DIRECTIONS16_INPUT/FINE_INPUT are each a
// dedicated named "input_dummy" wrapping the 16-directions/Fine checkbox on
// a dedicated message row (see the block definition's comment) - so every
// one of the five can be looked up and hidden directly by name, no need
// for a JS init()-style block definition just to name a wrapping input.
// Validator-based, not setOnChange - same reasoning as
// registerDropdownFieldSyncExtension's comment above.
Blockly.Extensions.register('sprite_inertia_accelerate_action_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const actionField = block.getField('ACTION');
  if (!actionField) return;
  const applyVisibility = (action) => {
    // Bails entirely on an insertion marker (the ghost preview block
    // Blockly clones while dragging a new copy out of the flyout, before
    // it's a real connected block) - confirmed as a real reported crash
    // otherwise: an insertion marker's fields exist but aren't backed by
    // real SVG DOM nodes yet, so block.render() throws ("Cannot read
    // properties of null (reading 'setAttribute')") trying to lay one out.
    // Nothing needs to show/hide on a marker anyway - it's discarded the
    // instant the drag ends, and this validator re-runs for real on the
    // actual dropped block once the drag finishes.
    if (typeof block.isInsertionMarker === 'function' && block.isInsertionMarker()) return;
    // Same headless-workspace guard as input_fire_pattern_frames_sync,
    // checked BEFORE any input.setVisible() call below (not just the
    // render()/resizeContents() calls at the end) - setVisible() is the
    // call that actually crashes on a headless workspace ("...
    // stopTrackingAll is not a function" - see function.js's comment for
    // the full explanation), not just the rendering that follows it.
    if (!block.workspace || !block.workspace.rendered) return;
    const shouldBeVisible = action !== 'stop';
    let changed = false;
    ['DIRECTION', 'RATE', 'MAXSPEED', 'DIRECTIONS16_INPUT', 'FINE_INPUT'].forEach((name) => {
      const input = block.getInput(name);
      if (!input || input.isVisible() === shouldBeVisible) return;
      input.setVisible(shouldBeVisible);
      changed = true;
    });
    if (!changed) return;
    if (typeof block.queueRender === 'function') block.queueRender();
    else if (typeof block.render === 'function') block.render();
    if (block.workspace.resizeContents) block.workspace.resizeContents();
  };
  applyVisibility(actionField.getValue());
  actionField.setValidator((newValue) => {
    applyVisibility(newValue);
    return undefined;
  });
});

// Lock a sprite to another: it follows the other one, an offset away, until it is unlocked (see generators/bbasic/sprite-lock.js).
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'sprite_lock',
    'message0': `${LOCK_ICON} Lock %1 to %2 at X offset %3 Y offset %4`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'CHILD',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'PARENT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'tooltip': 'Makes the first sprite follow the second one, the given number of pixels to the right (X) and down (Y) of ' +
      'it (a negative number goes left or up), every frame until it is unlocked. When the second sprite is a player ' +
      'facing left (flipped), the first one is put on the other side of it and flipped too, so a sword stays in the same hand.',
  },
  {
    'type': 'sprite_unlock',
    'message0': `${LOCK_ICON} Unlock %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'CHILD',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'tooltip': 'Lets a sprite locked to another one move freely again; it stays where it is.',
  },
]);

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'object_seek_to',
    'message0': `${SEEK_ICON} Seek %1 to X %2 Y %3 at speed %4`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'SPEED',
        'check': 'Number',
      },
    ],
    'message1': 'throttle movement %1',
    'args1': [
      {
        'type': 'field_checkbox',
        'name': 'THROTTLE',
        'checked': false,
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'Moves the chosen player/missile/ball automatically, a few pixels every ' +
      'frame, toward the given X/Y - each axis moves independently by up to "speed" pixels ' +
      'a frame, so it arrives diagonally when both axes have similar distances left and ' +
      'moves in a straight line once one axis catches up, stopping exactly on arrival. Its ' +
      'Height/visibility is never touched by this block, same as "Fire missile". Every ' +
      'time this block actually runs, it immediately updates that object\'s target/' +
      'speed, even if it\'s still moving toward a previous target - place this behind a ' +
      'rate limiter (e.g. an "every X frames" block) if the target/speed shouldn\'t reset ' +
      'every single frame. "throttle movement", when checked AND this block is placed ' +
      'directly inside an "every X frames" block, slows the actual movement itself down to ' +
      'that same rate (one step every X frames) instead of moving every frame regardless - ' +
      'unchecked (the default), movement always happens every frame once triggered, no ' +
      'matter what wraps this block.',
  },
  // A plain boolean value (plugs into an "if", same as collision_get/
  // background_fade_active elsewhere in this codebase - a bare 'output':
  // 'Boolean' with no outputShape override, the same "classic" connector
  // every other boolean-pluggable block here already uses), true from the
  // moment a matching object_seek_to block (same OBJECT choice) actually
  // reaches its  target X/Y, until the next time that object's  Seek
  // target is set again (object_seek_to's  generator clears this bit
  // right when it (re)triggers - see generators/bbasic/sprites.js). A seek
  // that starts already at its target (nothing to actually step) never sets
  // this - there's no real arrival to report if it was already there before
  // the first check.
  {
    'type': 'object_seek_arrived',
    'message0': `${SEEK_ICON} %1 arrived at its seek target`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'True once a matching "Seek" block (same player/missile/ball choice) reaches its ' +
      'target X/Y, and stays true until that object is given a new Seek target. Always false ' +
      'if no matching Seek block ever runs anywhere in the project.',
  },
  // True once a Fire block's object has gone off the screen and stopped there.
  {
    'type': 'object_fire_offscreen',
    'message0': `${MISSILE_ICON} Fired %1 has gone off screen`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'True once a missile, ball or player that a "Fire" block launched has gone off the edge of the ' +
      'screen and stopped (it is put at the top left corner, out of sight), and stays true until a "Fire" block ' +
      'launches it again. It is not true when "Stop fired" or a collision stopped it. Always false if no "Fire" ' +
      'block ever launches that object, or while "Bounce off screen edges" keeps it in play.',
  },
  // Same "one block, OBJECT dropdown covers all 5 names" shape as object_
  // seek_to above, reusing the same SEEK_OBJECT_OPTIONS/object_seek_colour_
  // sync. A runtime on/off toggle (not a compile-time checkbox) - lets a
  // project turn scroll-following on for one sprite mid-game (e.g. only
  // once gameplay actually starts scrolling) and off for another (e.g. a
  // HUD-like sprite that should stay fixed on screen). VALUE accepts
  // Boolean or Number, same convention as bit_set's VALUE input in
  // blocks/bit.js.
  {
    'type': 'sprite_scroll_with_playfield_set',
    'message0': `${SEEK_ICON} %1 set scroll with playfield to %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': ['Boolean', 'Number'],
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'Turns automatic playfield-scroll following on or off for this object. While on, every ' +
      '"Background scroll" block using Up/Down/Up (2x)/Down (2x) also shifts this object\'s Y position ' +
      'by the same amount, so it stays in the same spot relative to the scrolling background instead of ' +
      'the screen. Has no effect on Left/Right scrolling. Accepts true/false or 1/0.',
  },
  // Read-only companion to the setter above - same OBJECT dropdown/colour
  // extension, just reading the same runtime bit back instead of writing it.
  {
    'type': 'sprite_scroll_with_playfield_get',
    'message0': `${SEEK_ICON} Is %1 scrolling with playfield?`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'True while this object currently has playfield-scroll following turned on (see ' +
      '"set scroll with playfield to").',
  },
  // Same "one block, OBJECT dropdown covers all 5 names" shape as
  // object_seek_to above, and the same per-choice colour extension
  // (object_seek_colour_sync is already OBJECT-dropdown-generic, so it's
  // reused directly rather than duplicated). Continuous, not a one-shot
  // push - toggled on/off, same as sprite_player_animation_playback's
  // Play/Pause shape - "accelerate" here means "start applying this rate
  // every frame," not "add this amount once." DIRECTION is a plain 0-7
  // number input (not a fixed dropdown), matching sprite_*_fire's
  // ANGLE field - lets it be wired straight from a "Joystick direction
  // (8-way)" block for continuous joystick-driven thrust, not just typed
  // in as a literal.
  // Combined Start/Stop, same "one block, ACTION dropdown up front" shape
  // as sprite_inertia_decelerate below (was two separate block types,
  // sprite_inertia_accelerate and sprite_inertia_stop_accelerate, per an
  // explicit request to match Decelerate's shape) - DIRECTION/RATE/MAXSPEED
  // hide entirely while ACTION is Stop (see sprite_inertia_accelerate_
  // action_sync's comment above for why). Old projects using the two
  // separate block types are auto-migrated on load - see
  // hooks/migrate-inertia-accelerate-blocks.js.
  {
    'type': 'sprite_inertia_accelerate',
    'message0': `${INERTIA_ICON} %1 Accelerate %2 %3 toward direction %4 by %5, max speed %6`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'ACTION',
        'options': [['Start', 'start'], ['Stop', 'stop']],
      },
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      // Forces ACTION/OBJECT above onto a separate input instead of being
      // swept into DIRECTION's - Blockly's JSON interpolation attaches any
      // fields with no input between them and the NEXT value/statement/
      // dummy input onto THAT next input (confirmed directly against
      // Blockly.Block.prototype.interpolateArguments_/jsonInit_'s
      // fieldStack logic), so without this, DIRECTION's hidden/shown
      // input.setVisible() call in sprite_inertia_accelerate_action_sync
      // below was ALSO hiding ACTION and OBJECT - a real reported bug
      // ("every field gets hidden ... except 16 directions and fine",
      // i.e. everything sharing DIRECTION's input). inputsInline (below)
      // still renders this on the same line as everything else, same as
      // input_joystick_fire_pattern's separately-named FRAMES_INPUT
      // dummy achieves for the same reason.
      {'type': 'input_dummy'},
      {
        'type': 'input_value',
        'name': 'DIRECTION',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'RATE',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'MAXSPEED',
        'check': 'Number',
      },
    ],
    // Trailing named "input_dummy" on each row (rather than just a bare
    // checkbox) - same "give the field an addressable wrapping input"
    // reasoning as the DIRECTION-row's dummy above: with no input to
    // its name, a message1/message2 row's checkbox would otherwise get
    // wrapped in an ANONYMOUS auto-created dummy input Blockly.Block.
    // prototype.interpolate_ generates for any fields left unclaimed at
    // the end of a message row - impossible to look up and hide later.
    'message1': '%1 %2 16 directions %3',
    'args1': [
      {'type': 'field_label', 'text': ' '},
      {
        'type': 'field_checkbox',
        'name': 'DIRECTIONS16',
        'checked': false,
      },
      {'type': 'input_dummy', 'name': 'DIRECTIONS16_INPUT'},
    ],
    'message2': '%1 %2 Fine %3',
    'args2': [
      {'type': 'field_label', 'text': ' '},
      {
        'type': 'field_checkbox',
        'name': 'FINE',
        'checked': false,
      },
      {'type': 'input_dummy', 'name': 'FINE_INPUT'},
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync', 'sprite_inertia_accelerate_action_sync'],
    'tooltip': 'Start: begins accelerating the chosen player/missile/ball toward the given ' +
      'direction - every frame from now on, its velocity moves "rate" closer to that direction\'s ' +
      'X/Y, up to "max speed" per axis, until Stop runs. Direction is 0-7 (0=Up, 1=Up-Right, ' +
      '2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left, clockwise from Up, same scale ' +
      'as "Fire") - or 0-15 on the same clockwise-from-Up scale, if "16 directions" below is checked, ' +
      'same coarse approximation "Fire"\'s 16-direction mode uses (the 8 extra directions each ' +
      'push their dominant axis at the full rate and the other axis at half rate). Plug in a ' +
      '"Joystick direction (8-way)" block for player-controlled thrust, or a plain number for a ' +
      'fixed direction. Running Start again while already accelerating just updates the direction/' +
      'rate/max speed in place, without resetting velocity. Stop: velocity is left exactly where it ' +
      'is (still moving the object every frame) unless "Decelerate" is also turned on for it, same ' +
      'as taking your foot off the gas rather than braking - use "Decelerate" to actually slow it ' +
      'back down. "Fine": rate becomes a fraction of a pixel per frame (0-255, representing ' +
      '0-255/256ths) instead of whole pixels, so acceleration/movement can ramp up and down more ' +
      'gradually - costs 2 extra hidden bytes per axis, and can\'t be combined with 16 directions. ' +
      'Turning this on or off must match whatever "Decelerate" (if any) uses for the same object - ' +
      'mixing Fine and non-Fine on the same object between the two blocks isn\'t supported.',
  },
  {
    'type': 'sprite_inertia_decelerate',
    'message0': `${INERTIA_ICON} %1 Decelerate %2 by %3`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'ACTION',
        'options': [['Start', 'start'], ['Stop', 'stop']],
      },
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'RATE',
        'check': 'Number',
      },
    ],
    'message1': '%1 %2 Fine',
    'args1': [
      {'type': 'field_label', 'text': ' '},
      {
        'type': 'field_checkbox',
        'name': 'FINE',
        'checked': false,
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'Start: every frame from now on, the chosen player/missile/ball\'s velocity ' +
      'moves "rate" closer to 0 per axis (real friction/drag), clamped at exactly 0 so it never ' +
      'overshoots into moving the opposite way - turns itself back off automatically once velocity ' +
      'reaches exactly 0 on both axes, same as running "Stop", so it stops re-checking already-' +
      'stopped movement every frame; running Start again always turns it back on. Independent of ' +
      'Accelerate - an object can accelerate and decelerate at the same time (net effect: whichever ' +
      'rate wins that frame), or decelerate by itself to coast to a stop after "Stop accelerating". ' +
      '"Fine": rate becomes a fraction of a pixel per frame (0-255, representing 0-255/256ths) ' +
      'instead of whole pixels, and movement itself slows through sub-1-pixel-per-frame speeds ' +
      '(skipping frames automatically) as it approaches 0, instead of jumping straight from 1px/' +
      'frame to a dead stop - costs 2 extra hidden bytes per axis. Must match whatever "Accelerate" ' +
      '(if any) uses for the same object.',
  },
  // One block, OBJECT dropdown covers all 5 names (same shape as
  // object_seek_to/the Inertia blocks above) - replaces the old, separate
  // sprite_missile_bounce/sprite_ball_bounce (Player never had a Bounce
  // block at all, since Players never had Fire) per an explicit request
  // not to have separate blocks for the same functionality. Old projects
  // using the previous block types are auto-migrated on load - see
  // hooks/migrate-bounce-blocks.js. Reflects whichever movement system(s)
  // the chosen object actually uses: Fire's  angle (missile/ball only,
  // unchanged Combat-style guessing), Inertia's  velocity (any of the
  // 5), or both at once if both are in play on the same object - see this
  // block's  generator for exactly how.
  {
    'type': 'object_bounce',
    'message0': `${INERTIA_ICON} Bounce %1 %2 %3 off screen edges %4 %5 set angle manually %6 %7`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_DROPDOWN_OPTIONS,
      },
      {
        'type': 'field_label',
        'text': ' ',
      },
      {
        'type': 'field_checkbox',
        'name': 'EDGES',
        'checked': false,
      },
      // Extra gap between the two options.
      {
        'type': 'field_label',
        'text': ' ',
      },
      {
        'type': 'field_checkbox',
        'name': 'MANUAL',
        'checked': false,
      },
      // Holds the fields above, so hiding ANGLE does not hide them.
      {
        'type': 'input_dummy',
      },
      {
        'type': 'input_value',
        'name': 'ANGLE',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync', 'object_bounce_manual_angle_sync'],
    'tooltip': 'Reflects the chosen player/missile/ball off of whatever it just collided with, ' +
      'guessing which kind of surface was hit the same way Combat (1977) does: the first frame ' +
      'it\'s stuck, mirrors as if a vertical wall was hit; if still stuck the next frame, tries a ' +
      'horizontal wall instead; if still stuck after that, gives up guessing and just reverses ' +
      'outright (assume a corner). Reflects Fire\'s fired direction (missile/ball only) AND/OR ' +
      'Inertia\'s velocity (any of the 5 - see "Accelerate"/"Decelerate"), whichever the chosen ' +
      'object actually has in use - has no effect at all on an object using neither. Call this ' +
      'EVERY frame the collision persists (place it behind whatever check decides it should bounce ' +
      '- a collision block, a screen-edge X/Y comparison, etc. - it doesn\'t detect anything by ' +
      'itself) so it can tell consecutive stuck frames apart from a brand new hit. With "off screen ' +
      'edges" ticked it works differently: no collision is needed and nothing is guessed. Place it ' +
      'where it runs every frame (for example in a Gameplay update event) and it bounces the object ' +
      'the moment it goes past the left, right, top or bottom edge of the screen, flipping the ' +
      'matching direction (left/right edges flip horizontal movement, top/bottom flip vertical), ' +
      'putting it back on the edge, and keeping a fired missile or ball moving instead of letting ' +
      'it stop off-screen. With "set angle manually" unticked the ' +
      'reflection is automatic. Ticked, a fired missile or ball leaves the surface at the angle ' +
      'you give (0-7, or 0-15 when the Fire block uses 16 directions, clockwise from up) instead. It applies to ' +
      'collision bounces only, not to "off screen edges".',
  },
  // Cancels what a Fire block started: the object stops moving where it is.
  // Same OBJECT dropdown and colour sync as object_bounce above.
  {
    'type': 'object_fire_stop',
    'message0': `${STOP_ICON} Stop fired %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_OPTIONS,
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'Stops a missile or ball that a "Fire" block launched from moving, leaving it exactly ' +
      'where it is right now - its height and visibility are not touched (use "Missile: set ' +
      'Height" to hide it), and a later "Fire" block launches it again. Has no effect on a player, ' +
      'or on an object no "Fire" block ever launched.',
  },
]);

// Every object_seek_arrived block resolved to the OBJECT name(s) it actually
// watches - needed early (bbasic.js's  init(), before reserveDevVar hands
// out user variable letters) so seekArrivedFlagsVarName only gets reserved
// when at least one such watch really exists, same reasoning as
// resolveBackgroundFadeFinishedWatches in blocks/background.js. Unlike that
// one, no separate "watch key" function is needed - OBJECT's  value
// (player0/player1/missile0/missile1/ball) already is the key.
export const resolveSeekArrivedWatches = (workspace) => {
  const watched = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type === 'object_seek_arrived' && block.isEnabled()) {
      watched.add(block.getFieldValue('OBJECT'));
    }
  });
  return watched;
};

// Missile-only (NUSIZ0/1 width/copies) - the ball has its  separate
// width mechanism (CTRLPF, see reserveCtrlpfShadowDevVar in
// generators/bbasic/sprites.js), so this is never called for it.
// Missile 0/1 only (never had a Ball equivalent at all - Ball's width is
// set through sprite_ball_set's "Width" option instead), so - unlike
// the per-name blocks for Ball - this is fully repurposed into the combined type,
// called once instead of once per name.
const buildMissileSizeBlock = ({icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Block for changing a missile's width.
    {
      'type': 'sprite_missile_size',
      'message0': `${icon} Missile %1 set width to %2 pixels`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'MISSILE',
          'options': MISSILE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'SIZE',
          'options': MISSILE_SIZE_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_missile_field_sync', 'math_change_tooltip'],
    },
  ]);
};

// Shared by missile0/missile1/ball - reflects
// whichever direction this object was last fired at (see sprite_*_fire),
// using the same adaptive multi-frame guessing Combat (1977) uses for its
// tank shells: since this block has no idea which wall/edge of whatever
// shape it collided with was actually hit, it can't compute a single
// correct reflection on the first try - so, same as Combat, it treats the
// first stuck frame as a guess (mirror as if a vertical wall was hit),
// keeps guessing differently each consecutive stuck frame (next try: mirror
// as if it was a horizontal wall instead), and after a few frames still
// stuck, gives up and just reverses the original heading outright (assume a
// corner). See generateMissileFireChecks'  comment in
// generators/bbasic/sprites.js for the exact stage sequence and how
// "consecutive" is detected. No built-in screen-edge or collision detection
// (confirmed with the user: no "gravity"/physics beyond this) -
// place this behind whatever collision check (e.g. collision_get) or
// screen-edge check the user's  project already needs, same "trigger
// block, no detection built in" shape as sprite_*_fire itself leaving
// throttling/rate-limiting up to the user. Meant to be called EVERY frame
// the collision persists, not just once - unlike a plain one-shot flip, this
// only makes its intended guess/guess/give-up progression if it keeps being
// called each frame the object is still stuck.
// The Fire block for Missile 0, Missile 1 and the Ball: one block with a dropdown
// (it used to be a separate block for the ball; hooks/migrate-ball-fire-blocks.js
// converts those). Fires the object from the given starting X/Y, moving at the
// given angle/speed until it goes off-screen, where it just stops (see
// generateMissileFireChecks) - its Height/visibility is left entirely to the
// existing "set" blocks, never touched here. Defined in JS rather than the JSON
// array shape every other block in this file uses, so DEFAULT_ANGLE's dropdown
// can be backed by a function (see buildMissileFireDefaultAngleOptions'
// comment) - same reasoning text_minikernel_show_named's comment in
// blocks/text-minikernel.js gives for the identical choice there.
const buildCombinedMissileFireBlock = ({icon, colour}) => {
  Blockly.Blocks['sprite_missile_fire'] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} Fire`)
          .appendField(new Blockly.FieldDropdown(FIRE_OBJECT_DROPDOWN_OPTIONS), 'MISSILE');
      this.appendValueInput('X')
          .setCheck('Number')
          .appendField('from X');
      this.appendValueInput('Y')
          .setCheck('Number')
          .appendField('Y');
      this.appendValueInput('ANGLE')
          .setCheck('Number')
          .appendField('at angle');
      this.appendDummyInput()
          .appendField('default')
          .appendField(new Blockly.FieldDropdown(buildMissileFireDefaultAngleOptions), 'DEFAULT_ANGLE');
      // Pixels per frame, 0 (stands still) to 7: a number block, variable or any
      // other number (anything above 7 is held at 7 in the generated code). Each
      // block in the toolbox comes with a number block already plugged in.
      this.appendValueInput('SPEED')
          .setCheck('Number')
          .appendField('speed');
      this.appendDummyInput()
          .appendField(' ')
          .appendField(new Blockly.FieldCheckbox('FALSE'), 'THROTTLE')
          .appendField('throttle movement');
      this.appendDummyInput()
          .appendField(' ')
          .appendField(new Blockly.FieldCheckbox('FALSE'), 'DIRECTIONS16')
          .appendField('16 directions');
      const playfieldCheckField = new Blockly.FieldCheckbox('FALSE');
      playfieldCheckField.setTooltip('Moves the object one pixel at a time and checks the playfield after ' +
        'each one, stopping on the first lit playfield pixel it reaches. Without it a fast object can ' +
        'jump over a thin playfield pixel without ever touching it, so no collision is detected. ' +
        'Costs a little extra time every frame while the object is moving.');
      this.appendDummyInput()
          .appendField(' ')
          .appendField(playfieldCheckField, 'PFCHECK')
          .appendField('check playfield while moving');
      this.setInputsInline(true);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour(colour);
      // Red for Missile 0, blue for Missile 1 (like the other missile blocks)
      // and orange for the Ball, following the dropdown.
      const fireColourFor = fireObjectColour;
      const objectField = this.getField('MISSILE');
      this.setColour(fireColourFor(objectField.getValue()));
      objectField.setValidator((newValue) => {
        this.setColour(fireColourFor(newValue));
        return newValue;
      });
      setupFireDefaultAngleSync(this);
      this.setTooltip('Launches the chosen missile from the given starting X/Y position (e.g. a ' +
        'paired player\'s X/Y position blocks, for a traditional "fire from the player" missile), ' +
        'moving it automatically (a few pixels every frame) until it goes off-screen, where it ' +
        'simply stops moving - the missile\'s Height/visibility is never touched by this ' +
        'block, so it never changes size or disappears automatically; use "Missile: set Height" ' +
        'yourself if you want it hidden once it stops. Angle is 0-7 ' +
        '(0=Up, 1=Up-Right, 2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left, clockwise ' +
        'from Up) - or 0-15 on the same clockwise-from-Up scale, if "16 directions" below is checked. ' +
        'Plug in a "Joystick direction (8-way)" block to fire toward wherever the ' +
        'joystick is pushed, a plain number for a fixed direction, or a variable holding an angle ' +
        'computed elsewhere. 255 (or any other value outside the valid range) means "no clear direction" (e.g. ' +
        'a centered joystick) - "default" is used instead whenever that happens, so ' +
        'the missile still fires (in whichever direction "default" picks) rather than doing ' +
        'nothing. Every time this block actually runs, it (re)launches the missile right away, ' +
        'even if a previous shot is still in flight - resetting its position to whatever X/Y it\'s ' +
        'given at that moment. Because of that, this should be placed behind a rate limiter ' +
        '(e.g. an "every X frames" block) rather than something that stays true every single frame ' +
        '(like "if Fire then ..." alone), or it\'ll keep resetting the shot every frame instead ' +
        'of letting it fly. "throttle movement", when checked AND this block is placed directly ' +
        'inside an "every X frames" block, slows the actual in-flight movement down to that same ' +
        'rate (one step every X frames) instead of moving every frame regardless - unchecked (the ' +
        'default), it always moves every frame once fired, no matter what wraps this block. ' +
        '"16 directions", when checked, doubles the angle resolution to 0-15 (each of the original ' +
        '8 compass points, plus one halfway between each pair) instead of 0-7 - the two extra ' +
        'directions between each compass point move at full speed on their dominant axis and half ' +
        'speed on the other, the same coarse approximation classic 2600 games (e.g. Combat\'s ' +
        'ricocheting shells) used instead of real trigonometry. "default" above offers all 16 of ' +
        'those directions once this is checked (just the original 8 otherwise) - already-picked ' +
        'values are translated onto the new scale automatically when this is toggled, so it always ' +
        'lines up with the angle scale currently in use.');
    },
  };
};

// Player 0 and Player 1 share these three combined block families now (see
// PLAYER_OPTIONS' comment in buildCombinedPlayerVarBlocks above). The
// 'colour' passed here is only ever the construction-time placeholder,
// immediately overridden by sprite_player_field_sync's  colour-sync half
// (red for Player 0, blue for Player 1 - the same colours the old separate
// sprite_player0_*/sprite_player1_* blocks used to be, restored per the
// user's  follow-up request after this refactor first shipped them all
// as a single flat purple) - 'red' here just matches PLAYER's  default.
buildCombinedPlayerVarBlocks({
  icon: PLAYER_ICON,
  colour: 'red',
});

buildPlayerBlocks({
  icon: PLAYER_ICON,
  colour: 'red',
});

buildAnimationSelectBlock({
  icon: PLAYER_ICON,
  colour: 'red',
  storageFactory: usePlayerAnimationsStorage,
});

buildAnimationSetBlock({
  icon: PLAYER_ICON,
  colour: 'red',
  storageFactory: usePlayerAnimationsStorage,
});

buildAnimationSetByIdBlock({
  icon: PLAYER_ICON,
  colour: 'red',
});

buildAnimationIdGetBlock({
  icon: PLAYER_ICON,
  colour: 'red',
});

buildAnimationFinishedBlock({
  icon: PLAYER_ICON,
  colour: 'red',
});

// Missile 0/1 share these four combined block families now (see
// MISSILE_OPTIONS' comment above) - 'colour' is only ever the
// construction-time placeholder, immediately overridden by
// sprite_missile_field_sync's  colour-sync half (red for Missile 0,
// blue for Missile 1, the same colours the old separate
// sprite_missile0_*/sprite_missile1_* blocks used to be).
buildCombinedMissileVarBlocks({
  icon: MISSILE_ICON,
  colour: 'red',
});

buildMissileSizeBlock({
  icon: MISSILE_ICON,
  colour: 'red',
});

buildCombinedMissileFireBlock({
  icon: MISSILE_ICON,
  colour: 'red',
});

// Reads the direction a fired object (set by the Fire block) is travelling in: 0-7
// clockwise from Up, or 0-15 when a Fire block for that object uses 16 directions
// (the same numbers as the Fire block's angle and the joystick direction block).
// Read it before a Bounce block runs, which changes it.
Blockly.Blocks['sprite_fire_angle_get'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${MISSILE_ICON} Fire angle of`)
        .appendField(new Blockly.FieldDropdown(FIRE_OBJECT_DROPDOWN_OPTIONS), 'MISSILE');
    this.setOutput(true, 'Number');
    const colourFor = fireObjectColour;
    const objectField = this.getField('MISSILE');
    this.setColour(colourFor(objectField.getValue()));
    objectField.setValidator((newValue) => {
      this.setColour(colourFor(newValue));
      return newValue;
    });
    this.setTooltip('The direction the chosen missile or ball was last fired in by a "Fire" block: ' +
      '0 Up, 1 Up-Right, 2 Right, 3 Down-Right, 4 Down, 5 Down-Left, 6 Left, 7 Up-Left (or 0-15 on ' +
      'the finer scale when a Fire block for it has "16 directions" ticked). Read it when a collision ' +
      'happens to get the angle the object was travelling at - before a "Bounce" block runs, which ' +
      'turns it around. It plugs straight into the "Find playfield pixel" block\'s direction and ' +
      'into a Fire block\'s angle. Only meaningful for an object a Fire block launched.');
  },
};

// Changes how fast an object a Fire block launched moves, while it is moving (the Fire block
// sets the speed it starts at).
Blockly.Blocks['sprite_fire_speed_set'] = {
  init: function() {
    this.appendValueInput('SPEED')
        .setCheck('Number')
        .appendField(`${MISSILE_ICON} Set fired`)
        .appendField(new Blockly.FieldDropdown(FIRE_OBJECT_DROPDOWN_OPTIONS), 'MISSILE')
        .appendField('speed to');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    const colourFor = fireObjectColour;
    const objectField = this.getField('MISSILE');
    this.setColour(colourFor(objectField.getValue()));
    objectField.setValidator((newValue) => {
      this.setColour(colourFor(newValue));
      return newValue;
    });
    this.setTooltip('Changes the speed, in pixels per frame (0 to 7), of the chosen missile or ball ' +
      'that a "Fire" block launched. It takes effect on the next frame and keeps the direction. 0 ' +
      'holds it still without cancelling the Fire (set the speed back to move it again; "Stop ' +
      'fired" cancels it). Has no effect on an object no "Fire" block launches.');
  },
};

buildSpriteBlocks({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
  options: buildMissileOptions('ball'),
  writeOnlyOptions: [
    [HEIGHT_ICON + ' Width', 'ballwidth'],
  ],
});

// The Atari 2600 only has one priority switch for the whole screen: it can't
// be set per-sprite, only for all players/missiles/ball against the
// playfield at once.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'sprite_priority_set',
    'message0': `${PRIORITY_ICON} Sprite priority %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VALUE',
        'options': [
          ['Sprites above playfield (default)', '0'],
          ['Playfield above sprites', '1'],
        ],
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': PRIORITY_COLOUR,
    'tooltip': `Chooses whether the playfield and ball are drawn in front of, or behind, all ` +
      `players and missiles. This is a single switch for the whole screen - it can't be set ` +
      `per-sprite - but it can be changed at any time during the game.`,
  },
]);

// Fading Player 0/Player 1's color - same shared mechanism as Background's
// "Fade color to" (see emitColorFadeTrigger in generators/bbasic/
// background.js, generalized past just COLUBK/COLUPF/scorecolor/TextColor
// to cover player0realcolor/player1realcolor too - see blocks/background.js's
// FADE_TAG_BY_VAR/FADE_FLAGS_BYTE_BY_VAR). One combined VAR dropdown
// covering both players (same "one combined block instead of one per
// player/missile/ball" convention as object_seek_to/object_seek_arrived
// above), targeting the exact same player0realcolor/player1realcolor system
// variables the "Color" option on sprite_player_get/sprite_player_set
// already reads/writes (buildPlayerOptions above).
//
// Also fades the matching missile (missile0 for Player 0, missile1 for
// Player 1) with no extra code needed: real 2600 hardware has no separate
// missile color register at all - missile0 always draws using COLUP0 (the
// exact same register Player 0's  color lives in), missile1 uses COLUP1 -
// so fading player0realcolor/player1realcolor (which feed COLUP0/COLUP1
// every frame - see bbasic.bb.hbs's "COLUP0 = player0realcolor") already
// fades whichever missile is paired with that player too.
const PLAYER_FADE_VAR_OPTIONS = [
  [`${PLAYER_ICON} Player 0`, 'player0realcolor'],
  [`${PLAYER_ICON} Player 1`, 'player1realcolor'],
];
const PLAYER_FADE_COLOUR = 'red';

// Same red-for-Player-0/blue-for-Player-1 colour-sync treatment
// registerDropdownFieldSyncExtension above already gives the combined
// sprite_player_get/set/change/etc. blocks (confirmed with the user) -
// simpler here since VAR IS the player choice itself (no separate PLAYER
// field to translate anything against), so this is its  small extension
// rather than reusing that generic factory. Validator-based, not
// setOnChange - see registerDropdownFieldSyncExtension's  comment above
// for why (setOnChange never fires for a toolbox flyout block built from
// XML with events disabled).
Blockly.Extensions.register('sprite_player_fade_colour_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const varField = block.getField('VAR');
  if (!varField) return;
  const colourFor = (value) => {
    const extra = /^player([2-9])realcolor$/.exec(value);
    return value === 'player1realcolor' ? 'blue' : extra ? extraPlayerColour(extra[1]) : 'red';
  };
  block.setColour(colourFor(varField.getValue()));
  varField.setValidator((newValue) => {
    block.setColour(colourFor(newValue));
    return newValue;
  });
});

Blockly.defineBlocksWithJsonArray([
  {
    'type': `sprite_player_fade_to`,
    'message0': `${PLAYER_ICON} Fade %1 ${COLOR_ICON} color to %2 over %3 frames`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': PLAYER_FADE_VAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
      {
        'type': 'input_value',
        'name': 'FRAMES',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': PLAYER_FADE_COLOUR,
    'extensions': ['sprite_player_fade_colour_sync'],
    'tooltip': 'Starts fading Player 0 or Player 1\'s color toward the given color over roughly ' +
      'this many frames - same hue as the target, brightness automatically climbing or dropping ' +
      'from wherever it currently is, whichever direction actually gets closer. Only needs to be ' +
      'triggered once - the fade keeps running by itself every frame afterward, even from inside ' +
      'an "if" block that only briefly becomes true, until it reaches the target and stops. Also ' +
      'fades that player\'s missile (missile0 for Player 0, missile1 for Player 1) for free - ' +
      'on real Atari 2600 hardware, a missile always shares its player\'s color register, so ' +
      'there\'s no separate missile color to fade. With the DPC+ kernel a missile has a separate color register ' +
      '(the Missile Color option), and the fade carries it along with the player\'s. A DPC+ player can only fade to a fixed color ' +
      '(a color block, not a calculated value).',
  },
]);

// Works exactly like background_fade_finished (see blocks/background.js's
// comment - same shared bit/flag machinery, same "fires once, regardless
// of fade direction, never late" behavior), just choosing between Player 0/
// Player 1 instead of Background/Playfield.
Blockly.Blocks['sprite_player_fade_finished'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${PLAYER_ICON} When`)
        .appendField(new Blockly.FieldDropdown(PLAYER_FADE_VAR_OPTIONS), 'VAR')
        .appendField(`${COLOR_ICON} color has finished fading`);
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(PLAYER_FADE_COLOUR);
    Blockly.Extensions.apply('sprite_player_fade_colour_sync', this, false);
    this.setTooltip('Runs the connected blocks once, the moment a matching "Fade" block (same ' +
      'Player 0/Player 1 choice) reaches its target color. Does nothing if no matching fade ' +
      'ever runs anywhere in the project.');
  },
};

// Plain, always-current boolean read of the active bit - same shape as
// background_fade_active's  generator (see blocks/background.js's
// comment), just choosing between Player 0/Player 1 instead of Background/
// Playfield.
Blockly.Blocks['sprite_player_fade_active'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${PLAYER_ICON} Is`)
        .appendField(new Blockly.FieldDropdown(PLAYER_FADE_VAR_OPTIONS), 'VAR')
        .appendField(`${COLOR_ICON} color fade active?`);
    this.setOutput(true, 'Boolean');
    this.setColour(PLAYER_FADE_COLOUR);
    Blockly.Extensions.apply('sprite_player_fade_colour_sync', this, false);
    this.setTooltip('True while Player 0 or Player 1\'s color is in the middle of a "Fade" - from ' +
      'the moment a "Fade" block triggers it until it reaches its target color, false the ' +
      'rest of the time.');
  },
};
