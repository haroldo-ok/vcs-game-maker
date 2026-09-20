import * as Blockly from 'blockly/core';

import {processPlayerAnimationsStorageDefaults} from '../generators/bbasic/sprites';
import {usePlayerAnimationsStorage} from '../hooks/project';
import {PLAYER_ICON, MISSILE_ICON, BALL_ICON, COLOR_ICON, HEIGHT_ICON, ANIMATION_ICON, VISIBILITY_ICON, HORIZONTAL_ICON, VERTICAL_ICON, MIRROR_ICON, FRAME_ICON, PLAY_ICON, PAUSE_ICON, PRIORITY_ICON, DATA_ICON, SEEK_ICON} from './icon';

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
// own comment below for why) - no VAR-sync extension needed here unlike
// buildCombinedPlayerVarBlocks' own get/set/change blocks, since the animation
// list itself (buildAnimationOptions) is the SAME shared pool regardless of
// which player is picked, not a player0-prefixed/player1-prefixed pair of
// options like a real bB variable name would be.
const buildAnimationSelectBlock = ({icon, colour, storageFactory}) => {
  // Value block: picks an animation by name and reports its number, so it can
  // be plugged into the sprite setter or anywhere else a number is wanted.
  Blockly.Blocks['sprite_player_animation_select'] = {
    init: function() {
      this.appendDummyInput()
          .appendField(`${icon} Player`)
          .appendField(new Blockly.FieldDropdown(PLAYER_OPTIONS), 'PLAYER')
          .appendField(`${ANIMATION_ICON} animation`)
          .appendField(
              new Blockly.FieldDropdown(buildAnimationOptions(storageFactory)), 'VAR');
      this.setOutput(true, 'Number');
      this.setColour(colour);
      // sprite_player_field_sync's own colour-sync half applies fine here
      // too (VAR is an animation-list index, never "player0..."-prefixed,
      // so that extension's OTHER half - VAR translation - naturally never
      // matches and no-ops) - applied directly (not via 'extensions', which
      // only JSON-defined blocks support) since this block builds its own
      // fields by hand.
      Blockly.Extensions.apply('sprite_player_field_sync', this, false);
      this.setTooltip('Selects one of the chosen player\'s animations by name');
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

// Pixels moved per frame, each direction's own X and Y step (see
// generators/bbasic/sprites.js's own generateMissileFireChecks) - a
// bounded dropdown rather than a free-typed field, same "small fixed
// choice" reasoning MISSILE_SIZE_OPTIONS above already uses.
const MISSILE_FIRE_SPEED_OPTIONS = [
  ['1', '1'], ['2', '2'], ['3', '3'], ['4', '4'], ['5', '5'], ['6', '6'], ['7', '7'],
];

// Same 0-7 clockwise-from-Up encoding as input_joyN_direction8 (see
// blocks/input.js's own buildJoystickDirection8Block) - used for the Fire
// block's own "Default direction" dropdown (see generateMissileFireChecks'
// own trigger comment): whatever the user picks here is what actually fires
// when the Angle input evaluates to 255 ("no clear direction" - e.g. the
// joystick is centered), rather than a single hardcoded fallback, so any of
// the 8 directions can be the default, not just Up.
const MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS = [
  ['⬆ Up', '0'],
  ['↗ Up-Right', '1'],
  ['➡ Right', '2'],
  ['↘ Down-Right', '3'],
  ['⬇ Down', '4'],
  ['↙ Down-Left', '5'],
  ['⬅ Left', '6'],
  ['↖ Up-Left', '7'],
];

// Player 0 and Player 1 are otherwise-identical hardware players (same
// register SHAPE, just player0* vs player1* real bB variable names - see
// generators/bbasic/sprites.js's own ROM_NOISE_COLOR_REGISTERS comment for
// the one place they're genuinely different real registers, which is
// data-driven by name already, not block-shape-driven), so every Player
// block is a single combined type with this PLAYER dropdown instead of a
// separate sprite_player0_*/sprite_player1_* pair - confirmed with the user
// (this used to be two full sets of blocks; Ball is NOT part of this - it
// never had a twin to combine with, so buildSpriteBlocks/buildFireBlock/
// buildBounceBlock below stay per-name for it. Missile 0/1 get the exact
// same "one combined type, MISSILE dropdown instead of PLAYER" treatment
// - see MISSILE_OPTIONS just below).
// Labels are bare "0"/"1", not "Player 0"/"Player 1" - every combined
// Player block's own message0 already has a static "Player" word right
// before this dropdown (see buildCombinedPlayerVarBlocks etc. below), so
// full labels here would read as a doubled "Player Player 0" once placed.
const PLAYER_OPTIONS = [['0', '0'], ['1', '1']];

const playerNameFromField = (block) => `player${block && block.getFieldValue('PLAYER') === '1' ? '1' : '0'}`;

// Same reasoning as PLAYER_OPTIONS above, for Missile 0/1 - genuinely
// identical hardware objects (missileFireActiveBit/missileFireDirVarName/
// etc. in generators/bbasic/sprites.js already treat 'missile0'/'missile1'
// as pure data, never branching on which one), just missile0*/missile1*
// real bB variable names.
// Same "bare 0/1, not Missile 0/Missile 1" reasoning as PLAYER_OPTIONS
// above - every combined Missile block's own message0 already has a
// static "Missile" word right before this dropdown.
const MISSILE_OPTIONS = [['0', '0'], ['1', '1']];

const missileNameFromField = (block) => `missile${block && block.getFieldValue('MISSILE') === '1' ? '1' : '0'}`;

// Builds the VAR dropdown's option list fresh every time it opens (the same
// "dynamic options" FieldDropdown support blocks/bit.js's own
// buildVariableField already relies on) - the real variable names
// underneath (player0x vs player1x, etc.) depend on whichever player THIS
// block's own PLAYER field currently holds, so a plain static option array
// can't work once Player 0/1 share one block type. extraOptionsFor, when
// given, appends whatever extra get-only/set-only options that block needs
// (Frame for the getter, Visibility for the setter) - "change" passes
// nothing, matching buildSpriteBlocks' own three-way options/writeOnly/
// readOnly split below.
const buildPlayerVarOptionsFn = (extraOptionsFor) => function() {
  // eslint-disable-next-line no-invalid-this
  const name = playerNameFromField(this.getSourceBlock());
  return [...buildPlayerOptions(name), ...(extraOptionsFor ? extraOptionsFor(name) : [])];
};

// Same reasoning as buildPlayerVarOptionsFn above, for the combined Missile
// 0/1 get/set/change blocks - extraOptionsFor appends Width (set-only), the
// missile equivalent of buildPlayerVarOptionsFn's own Frame/Visibility.
const buildMissileVarOptionsFn = (extraOptionsFor) => function() {
  // eslint-disable-next-line no-invalid-this
  const name = missileNameFromField(this.getSourceBlock());
  return [...buildMissileOptions(name), ...(extraOptionsFor ? extraOptionsFor(name) : [])];
};

// Registers a "dropdown drives colour + VAR field" extension shared by both
// the combined Player and combined Missile blocks (see PLAYER_OPTIONS'/
// MISSILE_OPTIONS' own comments) - identical logic either way, just reading
// a differently-named dropdown field and a differently-prefixed real
// variable name, so this is written once and called twice rather than
// hand-duplicated.
//
// Single extension covering BOTH concerns every combined block needs from
// its own dropdown field - Blockly.Block.prototype.setOnChange (see its own
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
//    Applied once immediately (a block's own initial colour, from its JSON
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
// built from XML with events disabled (see Field.prototype.setValue's own
// "if (source && Blockly.Events.isEnabled())" guard in node_modules/
// blockly/core/field.js) - which is exactly how every TOOLBOX FLYOUT block
// is constructed (Blockly.Xml.domToBlock, called with events off for
// performance), so a block placed in the toolbox XML with e.g.
// `<field name="PLAYER">1</field>` never fired the change this relied on
// and stayed whatever colour PLAYER's own JSON default resolved to. A
// field's LOCAL VALIDATOR (this.getValidator()/setValidator()), by
// contrast, is called unconditionally from inside setValue() itself,
// BEFORE that same events-enabled check - runs every single time, XML load
// or live user edit alike. Field.prototype.setValue's own oldValue read
// happens AFTER the validator runs but BEFORE the new value is committed,
// so the validator's own `this.getValue()` (this = the field) is still the
// OLD value at the point it runs, and the validator's own newValue
// parameter is the incoming one - exactly the {old, new} pair this used to
// read off the (unreliable) BlockChange event instead.
//
// VAR's own getOptions() (no cache arg) has to run BEFORE its setValue() -
// same gotcha blocks/bit.js's own refreshVariableDropdownValue documents:
// the dropdown's dynamic options are cached until something invalidates
// them, and setValue()'s own validation reads whatever's cached, so
// skipping the fresh getOptions() call would just validate the translated
// value against the OLD option list instead of the new one.
const registerDropdownFieldSyncExtension = (extensionName, dropdownFieldName, namePrefixFor) => {
  const colourFor = (value) => (value === '1' ? 'blue' : 'red');
  Blockly.Extensions.register(extensionName, function() {
    // eslint-disable-next-line no-invalid-this
    const block = this;
    const dropdownField = block.getField(dropdownFieldName);
    if (!dropdownField) return;
    block.setColour(colourFor(dropdownField.getValue()));
    dropdownField.setValidator(function(newValue) {
      block.setColour(colourFor(newValue));
      const varField = block.getField('VAR');
      if (varField) {
        // eslint-disable-next-line no-invalid-this
        const oldName = namePrefixFor(this.getValue());
        const newName = namePrefixFor(newValue);
        const current = varField.getValue();
        const translated = (typeof current === 'string' && current.indexOf(oldName) === 0) ?
          newName + current.slice(oldName.length) : current;
        varField.getOptions();
        varField.setValue(translated);
      }
      return newValue;
    });
  });
};

registerDropdownFieldSyncExtension('sprite_player_field_sync', 'PLAYER',
    (value) => `player${value === '1' ? '1' : '0'}`);
registerDropdownFieldSyncExtension('sprite_missile_field_sync', 'MISSILE',
    (value) => `missile${value === '1' ? '1' : '0'}`);

// The combined Player getter/setter/"change by" - see PLAYER_OPTIONS' own
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
          'options': PLAYER_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildPlayerVarOptionsFn((name) => [[FRAME_ICON + ' Frame', `${name}frame`]]),
        },
      ],
      'output': 'Number',
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Reads information about whichever player is selected.',
    },
    // Block for the setter.
    {
      'type': 'sprite_player_set',
      'message0': `${icon} Player %1 set %2 to %3`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'VAR',
          'options': buildPlayerVarOptionsFn((name) => [[VISIBILITY_ICON + ' Visibility', `${name}visibility`]]),
        },
        {
          'type': 'input_value',
          'name': 'VALUE',
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync'],
      'tooltip': 'Updates information about whichever player is selected.',
    },
    // Block for adding to a variable in place.
    {
      'type': 'sprite_player_change',
      'message0': `${icon} Player %1 change %2 by %3`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'PLAYER',
          'options': PLAYER_OPTIONS,
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
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_player_field_sync', 'math_change_tooltip'],
    },
  ]);
};

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
          'options': buildMissileVarOptionsFn(),
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
          'options': buildMissileVarOptionsFn((name) => [[HEIGHT_ICON + ' Width', `${name}width`]]),
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
      'tooltip': 'Updates information about whichever missile is selected.',
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
          'options': PLAYER_OPTIONS,
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
          'options': PLAYER_OPTIONS,
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
          'options': PLAYER_OPTIONS,
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
    // since generateRomNoiseChecks' own per-frame override runs AFTER the
    // animation logic every frame and only ever gets set, never cleared
    // (confirmed as a real reported gap: "I want to be able to switch back
    // to using sprite graphics after using the noise block"). This just
    // clears that flag, letting the animation pointer generateAnimations
    // already reasserts every frame regardless take back over immediately -
    // no pixel/graphic changes of its own.
    {
      'type': 'sprite_player_rom_noise_stop',
      'message0': `${icon} Player %1 stop ${DATA_ICON} ROM noise`,
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
      'tooltip': 'Switches the chosen player back to showing its normal animation frames again, ' +
        'undoing the "display ROM noise" block above - that block keeps overriding the graphic ' +
        'every frame until this one is used, even if a normal animation frame is set in the ' +
        'meantime.',
    },
    // A different color on every scanline of this player - a REAL, existing
    // batari Basic kernel feature ("playercolors"/"player1colors" kernel
    // options - see std_kernel.asm's own "ifnconst playercolors" checks),
    // not built from scratch here. Deliberately its own separate block, not
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
    // instead - see that block's own comment. One real difference: once
    // "playercolors"/"player1colors" is in kernel_options at all, the
    // KERNEL itself always reads (player0color),y every scanline - there's
    // no way to turn that back into a plain flat COLUP0/COLUP1 color at
    // runtime, so this can't fully "undo" rainbow colors the way the ROM
    // noise stop block can fully undo noise. What it DOES do: with the
    // Options tab's "Enable per-row sprite colors" toggle on, each
    // animation frame already declares its own real per-row color table
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
// as buildMissileBlocks' own "fire" block just below - separate from it
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

// Same colour-per-choice treatment as sprite_player_fade_colour_sync above,
// generalized to OBJECT's 5-way pick instead of a 2-way one - reusing each
// object's own individual block colour (red for either Player 0 or
// Missile 0, blue for either Player 1 or Missile 1, orange for Ball,
// matching PLAYER_ICON/MISSILE_ICON/BALL_ICON's own call sites further down
// this file) rather than inventing a new palette just for this dropdown.
const SEEK_OBJECT_COLOURS = {
  player0: 'red', player1: 'blue', missile0: 'red', missile1: 'blue', ball: '#ff8800',
};
// Validator-based, not setOnChange - see registerDropdownFieldSyncExtension's
// own comment above for why: setOnChange only ever fires from a real
// Blockly.Events.BlockChange event, which never fires while a block is
// being built from XML with events disabled (exactly how every toolbox
// flyout block is constructed) - a validator on the field itself runs
// unconditionally on every setValue call instead, XML load or live edit
// alike (confirmed as a real reported bug: toolbox flyout copies all
// stayed the same colour regardless of their own preset OBJECT field).
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

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'object_seek_to',
    'message0': `${SEEK_ICON} Seek %1 to X %2 Y %3 at speed %4`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OBJECT',
        'options': SEEK_OBJECT_OPTIONS,
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
  // reaches its own target X/Y, until the next time that object's own Seek
  // target is set again (object_seek_to's own generator clears this bit
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
        'options': SEEK_OBJECT_OPTIONS,
      },
    ],
    'output': 'Boolean',
    'colour': 'purple',
    'extensions': ['object_seek_colour_sync'],
    'tooltip': 'True once a matching "Seek" block (same player/missile/ball choice) reaches its ' +
      'target X/Y, and stays true until that object is given a new Seek target. Always false ' +
      'if no matching Seek block ever runs anywhere in the project.',
  },
]);

// Every object_seek_arrived block resolved to the OBJECT name(s) it actually
// watches - needed early (bbasic.js's own init(), before reserveDevVar hands
// out user variable letters) so seekArrivedFlagsVarName only gets reserved
// when at least one such watch really exists, same reasoning as
// resolveBackgroundFadeFinishedWatches in blocks/background.js. Unlike that
// one, no separate "watch key" function is needed - OBJECT's own value
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

// Missile-only (NUSIZ0/1 width/copies) - the ball has its own separate
// width mechanism (CTRLPF, see reserveCtrlpfShadowDevVar in
// generators/bbasic/sprites.js), so this is never called for it.
// Missile 0/1 only (never had a Ball equivalent at all - Ball's width is
// set through sprite_ball_set's own "Width" option instead), so - unlike
// buildFireBlock/buildBounceBlock just below, which stay per-name for
// Ball's sake - this is fully repurposed into the combined type, called
// once instead of once per name.
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

// Shared by missile0/missile1/ball - see createGeneratorForFireBall in
// generators/bbasic/sprites.js for the fully name-generic trigger/per-frame
// movement this drives; nothing here is missile-specific.
const buildFireBlock = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    // Fires this missile from the given starting X/Y, moving at the given
    // angle/speed until it goes off-screen, where it just stops (see
    // generateMissileFireChecks) - its own Height/visibility is left
    // entirely to the existing "sprite_<name>_set" block, never touched
    // here, so it doesn't change size or disappear on its own.
    {
      'type': `sprite_${name}_fire`,
      'message0': `${icon} Fire ${description} from X %1 Y %2 at angle %3 default %4 speed %5`,
      'args0': [
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
          'name': 'ANGLE',
          'check': 'Number',
        },
        {
          'type': 'field_dropdown',
          'name': 'DEFAULT_ANGLE',
          'options': MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'SPEED',
          'options': MISSILE_FIRE_SPEED_OPTIONS,
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
      'message2': '16 directions %1',
      'args2': [
        {
          'type': 'field_checkbox',
          'name': 'DIRECTIONS16',
          'checked': false,
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Launches ${description} from the given starting X/Y position (e.g. a paired ` +
        'player\'s X/Y position blocks, for a traditional "fire from the player" missile), ' +
        'moving it automatically (a few pixels every frame) until it goes off-screen, where it ' +
        `simply stops moving - ${description}'s Height/visibility is never touched by this ` +
        `block, so it never changes size or disappears automatically; use "${description}: set Height" ` +
        'yourself if you want it hidden once it stops. Angle is 0-7 ' +
        '(0=Up, 1=Up-Right, 2=Right, 3=Down-Right, 4=Down, 5=Down-Left, 6=Left, 7=Up-Left, clockwise ' +
        'from Up) - or 0-15 on the same clockwise-from-Up scale, if "16 directions" below is checked. ' +
        'Plug in a "Joystick direction (8-way)" block to fire toward wherever the ' +
        'joystick is pushed, a plain number for a fixed direction, or a variable holding an angle ' +
        'computed elsewhere. 255 (or any other value outside the valid range) means "no clear direction" (e.g. ' +
        'a centered joystick) - "default" is used instead whenever that happens, so ' +
        `${description} still fires (in whichever direction "default" picks) rather than doing ` +
        `nothing. Every time this block actually runs, it (re)launches ${description} right away, ` +
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
        'ricocheting shells) used instead of real trigonometry. "default" above still only offers ' +
        'the original 8 compass points either way - picked to match whichever mode this checkbox is ' +
        'in, so it always lines up with the angle scale currently in use.',
    },
  ]);
};

// Shared by missile0/missile1/ball, same as buildFireBlock above - reflects
// whichever direction this object was last fired at (see sprite_*_fire),
// using the same adaptive multi-frame guessing Combat (1977) uses for its
// own tank shells: since this block has no idea which wall/edge of whatever
// shape it collided with was actually hit, it can't compute a single
// correct reflection on the first try - so, same as Combat, it treats the
// first stuck frame as a guess (mirror as if a vertical wall was hit),
// keeps guessing differently each consecutive stuck frame (next try: mirror
// as if it was a horizontal wall instead), and after a few frames still
// stuck, gives up and just reverses the original heading outright (assume a
// corner). See generateMissileFireChecks' own comment in
// generators/bbasic/sprites.js for the exact stage sequence and how
// "consecutive" is detected. No built-in screen-edge or collision detection
// of its own (confirmed with the user: no "gravity"/physics beyond this) -
// place this behind whatever collision check (e.g. collision_get) or
// screen-edge check the user's own project already needs, same "trigger
// block, no detection built in" shape as sprite_*_fire itself leaving
// throttling/rate-limiting up to the user. Meant to be called EVERY frame
// the collision persists, not just once - unlike a plain one-shot flip, this
// only makes its intended guess/guess/give-up progression if it keeps being
// called each frame the object is still stuck.
const buildBounceBlock = ({name, description, icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    {
      'type': `sprite_${name}_bounce`,
      'message0': `${icon} Bounce ${description}`,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'tooltip': `Reflects ${description}'s currently fired direction (see "Fire ${description}") ` +
        'off of whatever it just collided with, guessing which kind of surface was hit the same ' +
        'way Combat (1977) does: the first frame it\'s stuck, mirrors the direction as if a ' +
        'vertical wall was hit; if still stuck the next frame, tries a horizontal wall instead; ' +
        'if still stuck after that, gives up guessing and just reverses the original direction by ' +
        '180 degrees (assume a corner). Call this EVERY frame the collision persists (place it ' +
        `behind whatever check decides ${description} should bounce - a collision block, a ` +
        'screen-edge X/Y comparison, etc. - it doesn\'t detect anything by itself) so it can tell ' +
        `consecutive stuck frames apart from a brand new hit. Has no effect if ${description} ` +
        'hasn\'t been fired (or has already gone off-screen and stopped) - reversing a "no ' +
        'direction" state is harmless, but does nothing useful.',
    },
  ]);
};

// Missile 0/1's own combined Fire block - same shape as buildFireBlock
// above (which stays as-is, still used for Ball's own separate, never-
// combined sprite_ball_fire), just with a MISSILE dropdown prepended and
// missile-generic tooltip text instead of a fixed ${description}.
const buildCombinedMissileFireBlock = ({icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    {
      'type': 'sprite_missile_fire',
      'message0': `${icon} Fire Missile %1 from X %2 Y %3 at angle %4 default %5 speed %6`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'MISSILE',
          'options': MISSILE_OPTIONS,
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
          'name': 'ANGLE',
          'check': 'Number',
        },
        {
          'type': 'field_dropdown',
          'name': 'DEFAULT_ANGLE',
          'options': MISSILE_FIRE_DEFAULT_ANGLE_OPTIONS,
        },
        {
          'type': 'field_dropdown',
          'name': 'SPEED',
          'options': MISSILE_FIRE_SPEED_OPTIONS,
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
      'message2': '16 directions %1',
      'args2': [
        {
          'type': 'field_checkbox',
          'name': 'DIRECTIONS16',
          'checked': false,
        },
      ],
      'inputsInline': true,
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_missile_field_sync'],
      'tooltip': 'Launches the chosen missile from the given starting X/Y position (e.g. a ' +
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
        'ricocheting shells) used instead of real trigonometry. "default" above still only offers ' +
        'the original 8 compass points either way - picked to match whichever mode this checkbox is ' +
        'in, so it always lines up with the angle scale currently in use.',
    },
  ]);
};

// Missile 0/1's own combined Bounce block - same shape/behavior as
// buildBounceBlock above (which stays as-is, still used for Ball's own
// separate sprite_ball_bounce), just with a MISSILE dropdown prepended.
const buildCombinedMissileBounceBlock = ({icon, colour}) => {
  Blockly.defineBlocksWithJsonArray([
    {
      'type': 'sprite_missile_bounce',
      'message0': `${icon} Bounce Missile %1`,
      'args0': [
        {
          'type': 'field_dropdown',
          'name': 'MISSILE',
          'options': MISSILE_OPTIONS,
        },
      ],
      'previousStatement': null,
      'nextStatement': null,
      colour,
      'extensions': ['sprite_missile_field_sync'],
      'tooltip': 'Reflects the chosen missile\'s currently fired direction (see "Fire Missile") ' +
        'off of whatever it just collided with, guessing which kind of surface was hit the same ' +
        'way Combat (1977) does: the first frame it\'s stuck, mirrors the direction as if a ' +
        'vertical wall was hit; if still stuck the next frame, tries a horizontal wall instead; ' +
        'if still stuck after that, gives up guessing and just reverses the original direction by ' +
        '180 degrees (assume a corner). Call this EVERY frame the collision persists (place it ' +
        'behind whatever check decides the missile should bounce - a collision block, a ' +
        'screen-edge X/Y comparison, etc. - it doesn\'t detect anything by itself) so it can tell ' +
        'consecutive stuck frames apart from a brand new hit. Has no effect if the missile ' +
        'hasn\'t been fired (or has already gone off-screen and stopped) - reversing a "no ' +
        'direction" state is harmless, but does nothing useful.',
    },
  ]);
};

// Player 0 and Player 1 share these three combined block families now (see
// PLAYER_OPTIONS' own comment in buildCombinedPlayerVarBlocks above). The
// 'colour' passed here is only ever the construction-time placeholder,
// immediately overridden by sprite_player_field_sync's own colour-sync half
// (red for Player 0, blue for Player 1 - the same colours the old separate
// sprite_player0_*/sprite_player1_* blocks used to be, restored per the
// user's own follow-up request after this refactor first shipped them all
// as a single flat purple) - 'red' here just matches PLAYER's own default.
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

// Missile 0/1 share these four combined block families now (see
// MISSILE_OPTIONS' own comment above) - 'colour' is only ever the
// construction-time placeholder, immediately overridden by
// sprite_missile_field_sync's own colour-sync half (red for Missile 0,
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

buildCombinedMissileBounceBlock({
  icon: MISSILE_ICON,
  colour: 'red',
});

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

buildFireBlock({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
});

buildBounceBlock({
  name: 'ball',
  description: 'Ball',
  icon: BALL_ICON,
  colour: '#ff8800',
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
// own "Fade color to" (see emitColorFadeTrigger in generators/bbasic/
// background.js, generalized past just COLUBK/COLUPF/scorecolor/TextColor
// to cover player0realcolor/player1realcolor too - see blocks/background.js's
// own FADE_TAG_BY_VAR/FADE_FLAGS_BYTE_BY_VAR). One combined VAR dropdown
// covering both players (same "one combined block instead of one per
// player/missile/ball" convention as object_seek_to/object_seek_arrived
// above), targeting the exact same player0realcolor/player1realcolor system
// variables the "Color" option on sprite_player_get/sprite_player_set
// already reads/writes (buildPlayerOptions above).
//
// Also fades the matching missile (missile0 for Player 0, missile1 for
// Player 1) with no extra code needed: real 2600 hardware has no separate
// missile color register at all - missile0 always draws using COLUP0 (the
// exact same register Player 0's own color lives in), missile1 uses COLUP1 -
// so fading player0realcolor/player1realcolor (which feed COLUP0/COLUP1
// every frame - see bbasic.bb.hbs's own "COLUP0 = player0realcolor") already
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
// field to translate anything against), so this is its own small extension
// rather than reusing that generic factory. Validator-based, not
// setOnChange - see registerDropdownFieldSyncExtension's own comment above
// for why (setOnChange never fires for a toolbox flyout block built from
// XML with events disabled).
Blockly.Extensions.register('sprite_player_fade_colour_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const varField = block.getField('VAR');
  if (!varField) return;
  block.setColour(varField.getValue() === 'player1realcolor' ? 'blue' : 'red');
  varField.setValidator((newValue) => {
    block.setColour(newValue === 'player1realcolor' ? 'blue' : 'red');
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
      'there\'s no separate missile color to fade.',
  },
]);

// Works exactly like background_fade_finished (see blocks/background.js's
// own comment - same shared bit/flag machinery, same "fires once, regardless
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
// background_fade_active's own generator (see blocks/background.js's own
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
