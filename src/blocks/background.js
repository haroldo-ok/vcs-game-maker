'use strict';

import * as Blockly from 'blockly/core';

import {useBackgroundsStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';
import {BACKGROUND_ICON, COLOR_ICON, CHECKBOX_CHECKED_ICON, CHECKBOX_CLEAR_ICON, FLIP_ICON, BACKGROUND_PFSCROLL_LEFT_ICON, BACKGROUND_PFSCROLL_RIGHT_ICON, BACKGROUND_PFSCROLL_UP_ICON, BACKGROUND_PFSCROLL_DOWN_ICON, BACKGROUND_PFSCROLL_DOWN2X_ICON, BACKGROUND_PFSCROLL_UP2X_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

// background_fade_to (see generators/bbasic/background.js) is a fire-and-
// forget TRIGGER, not a "call every frame yourself" block - it writes its
// target/pace once, and a per-frame check spliced into commongamelogic (see
// generateBackgroundFadeChecks) does the actual stepping from then on,
// exactly like sound effect fades (generateEnvelopeChecks in generators/
// bbasic/soundfx.js) and music event watches (generateMusicChecks) already
// do. This matters because a fade triggered from inside an "if" block (e.g.
// "if joystick fire") only has its OWN trigger code re-run while that
// condition holds - a single brief tap wouldn't re-enter it on later
// frames, so an earlier "advance one step per call" design silently stalled
// after one step once nested that way (confirmed as a real bug: the fade
// only ever completed when its trigger sat unconditionally at the main
// loop's top level, re-running it every frame by construction).
//
// FADE_STEPS is fixed at 4, not user-choosable - see its own comment below
// for why.
//
// One set of dev vars per target register (COLUBK/COLUPF), only reserved
// when a fade block actually targets that register:
//  - backgroundFadeTimerVarName: frames remaining until the next brightness
//    step, reloaded from backgroundFadePaceVarName each time it fires.
//  - backgroundFadePaceVarName: the reload value itself (frames requested /
//    FADE_STEPS) - stored rather than recomputed each frame, since it
//    depends on the FRAMES input, which can be an arbitrary runtime
//    expression, not just a compile-time constant.
//  - backgroundFadeTargetVarName: the full target color byte (hue in bits
//    7-4, target brightness in bits 3-1) - stored rather than reading the
//    trigger block's own VALUE input again later, since the check runs from
//    a single shared function with no block of its own to read an input
//    from.
// backgroundFadeIncrementVarName isn't needed either, for the same reason
// FADE_STEPS is fixed: with only one possible step count project-wide,
// every fade on a given register shares the exact same brightness
// increment, so it can be baked into generateBackgroundFadeChecks as a
// literal instead of costing its own dev var.
// The brightness itself isn't tracked in its own dev var at all - it's read
// fresh from the live shadow color variable (backgroundrealcolor/
// playfieldrealcolor) every check instead, specifically to avoid a real bug
// an earlier version of this had: a separate brightness tracker defaulting
// to 0 made a "fade down"-only block snap straight to black on its very
// first call, regardless of whatever color was actually on screen.
// Generalized past just COLUBK/COLUPF - scorecolor (score.js's own
// score_fade_to) and TextColor (text-minikernel.js's own
// text_minikernel_fade_to) share this exact same stepping mechanism, since
// they're ordinary Atari color bytes with the identical hue/brightness
// nibble layout. Unlike COLUBK/COLUPF, neither needs a separate "shadow"
// variable (see generateBackgroundFadeChecks' own targetShadowVar comment in
// generators/bbasic/background.js) - nothing else overwrites scorecolor or
// TextColor every frame the way the score/text drawing routines overwrite
// COLUBK/COLUPF, so the real variable itself doubles as its own shadow.
const FADE_TAG_BY_VAR = {COLUBK: 'bg', COLUPF: 'pf', scorecolor: 'score', TextColor: 'text'};
const fadeTag = (rawVar) => FADE_TAG_BY_VAR[rawVar] || rawVar;
export const backgroundFadeTimerVarName = (rawVar) => `_${fadeTag(rawVar)}FadeTimer`;
export const backgroundFadePaceVarName = (rawVar) => `_${fadeTag(rawVar)}FadePace`;
export const backgroundFadeTargetVarName = (rawVar) => `_${fadeTag(rawVar)}FadeTarget`;

// Fixed at 4 (not a user-choosable STEPS dropdown, as an earlier version of
// this had) specifically because 4 is a power of 2: "frames / 4" always
// compiles to a cheap bit-shift, never the real "jsr div8" subroutine call
// a non-power-of-2 divisor (3, 5, 6, 7) needs (see generateDivMul's own
// comment in generators/bbasic.js). That call is only safe from wherever
// div_mul.asm itself got inlined (always bank 1) - fine from
// generateBackgroundFadeChecks (always in commongamelogic, never
// relocated), but NOT fine from this block's own trigger, which lives
// wherever the user's own blocks place it, potentially a relocated event
// bank in a larger project. Confirmed as a real bug: a large enough
// project to relocate an event crashed (a stray audio tone, i.e. a
// runaway program counter) specifically whenever a non-power-of-2 STEPS
// was chosen. 4 is also the highest step count that's actually distinct
// from lower ones on this hardware (see FADE_STEPS's own increment-math
// comment in generators/bbasic/background.js) - 5, 6, and 7 all produced
// the exact same result as 4 anyway, so fixing it there costs nothing.
export const FADE_STEPS = 4;

// One shared byte covers both the "fade finished" watch flags AND the "fade
// currently active" flags for all four fadeable registers - exactly 8 bits
// total (4 registers x 1 for "finished", plus 4 registers x 1 for
// "active"), filling the byte exactly, so fixed bits are simpler than the
// Music tab's own pooled/overflow allocation (built for open-ended,
// user-defined watch counts) and never need more than this one byte.
// "Finished" fires regardless of which way the fade was moving (brightening
// or dimming) - background_fade_finished used to have its own DIRECTION
// dropdown splitting this by direction, but that meant a project reacting
// to "this fade is done" regardless of which way it happened to go needed
// two near-identical watch blocks wired to the same DO stack; removed in
// favor of one flag per register that fires on either direction's own
// completion. The "active" bits are what the per-frame check
// (generateBackgroundFadeChecks) reads to know whether a register has an
// in-progress fade to keep stepping at all - set once by the matching
// trigger block's own code (background_fade_to/score_fade_to/
// text_minikernel_fade_to), cleared once the check steps the color onto its
// exact target.
export const fadeFlagsVarName = () => '_fadeFlags';
// Scratch storage for background_get_pixel's own X/Y, ONLY when a non-bare
// expression (e.g. "xCycle - 1") is plugged into one of its sockets (see
// generators/bbasic/background.js) - pfread()'s own arguments can't contain
// an operator, so an expression has to be computed somewhere before it's
// passed in. temp1/temp2 look like the obvious scratch spot (used exactly
// that way everywhere else in this codebase), but are NOT safe here: bB's
// own "function" feature passes its arguments through temp1-temp6 directly
// (see generators/bbasic/function.js's own comment) with no other stack or
// register file, so a background_get_pixel block used inside a function
// body could be silently overwriting that function's own live parameter(s)
// out from under it the moment this runs - confirmed directly as a real
// bug (a project's own custom function calling this went from "won't
// compile" to "resets the console the moment it runs" once temp1/temp2
// were reused this way). Two dedicated dev vars sidestep that entirely,
// at the cost of reserving them (see reserveMusicDevVars's own sibling in
// bbasic.js) only for a project that actually uses this block at all.
export const backgroundGetPixelXVarName = () => '_bgGetPixelX';
export const backgroundGetPixelYVarName = () => '_bgGetPixelY';
// Bits 0-3: one "finished" bit per fadeable register (fires on either fade
// direction's own completion - see fadeFlagsVarName's own
// comment). Bits 4-7: the matching "active" bit for that same register
// (FADE_ACTIVE_BIT_BY_VAR below) - always exactly 4 apart from its own
// "finished" bit, which is what backgroundFadeFinishedBit derives from
// rather than keeping a second, parallel map in sync by hand.
const FADE_ACTIVE_BIT_BY_VAR = {COLUBK: 4, COLUPF: 5, scorecolor: 6, TextColor: 7};
export const fadeActiveBit = (rawVar) => FADE_ACTIVE_BIT_BY_VAR[rawVar];
export const backgroundFadeFinishedBit = (rawVar) => FADE_ACTIVE_BIT_BY_VAR[rawVar] - 4;

// Every register some "finished fading" watch block in the project actually
// watches - background_fade_finished (Background/Playfield), score_fade_
// finished (Score), or text_minikernel_fade_finished (Text) - all three
// work identically, just targeting a different register, and all three
// share this exact same resolution/bit/flag machinery. A plain Set, since
// there are only 4 possible registers and each is either watched or not (no
// dedup/index-assignment step needed the way the Music tab's own open-ended
// watches require). Read by both the matching trigger block's own per-frame
// check (to decide whether to bother setting a bit nothing is watching) and
// the watch block itself (to know which bit to check-and-clear) - see
// resolveVar's own callers in generators/bbasic/background.js.
export const backgroundFadeWatchKey = (rawVar) => rawVar;
// score_fade_finished/text_minikernel_fade_finished have no VAR dropdown of
// their own (same reasoning as score_fade_to/text_minikernel_fade_to - see
// their own comments: there's only one possible score/text color register,
// so offering a choice would be pointless) - only background_fade_finished
// actually reads one.
const FADE_FINISHED_RAW_VAR_BY_TYPE = {
  background_fade_finished: (block) => block.getFieldValue('VAR'),
  score_fade_finished: () => 'scorecolor',
  text_minikernel_fade_finished: () => 'TextColor',
};
export const resolveBackgroundFadeFinishedWatches = (workspace) => {
  const watched = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    const rawVarFor = FADE_FINISHED_RAW_VAR_BY_TYPE[block.type];
    if (!rawVarFor) return;
    watched.add(backgroundFadeWatchKey(rawVarFor(block)));
  });
  return watched;
};

// Whether any background_fade_active block exists anywhere in the project -
// that block reads fadeFlagsVarName's own active bit directly (see
// its generator in generators/bbasic/background.js), so the shared byte it
// lives in needs to be reserved even in the (unusual, but valid) case of a
// project checking "is this fade active" on a register that has no
// background_fade_to block of its own - the check just always reads false
// then, same as a fade that was never triggered.
export const hasBackgroundFadeActiveChecks = (workspace) =>
  workspace.getAllBlocks(false).some((block) => block.type === 'background_fade_active');

// Default color byte for a playfield row when per-row colors (pfcolors) are
// enabled: $0E, the same light grey the playfield uses by default, so switching
// the feature on doesn't visibly change an untouched background.
export const DEFAULT_ROW_COLOR = 0x0E;

// Row count used when Superchip RAM's higher-resolution playfield (pfres) is
// not enabled. This is the app's own established default, one row short of
// standard batari Basic's implicit pfres=12 (11 visible + 1 hidden scroll
// row); kept as-is so existing projects don't change shape.
export const DEFAULT_BACKGROUND_ROWS = 11;

// The editable/visible row count for the current configuration. Confirmed
// against a known-working reference program (compiled and run in the
// emulator) that pfres rows of playfield: data - not pfres-1 - render
// correctly, so the Superchip case uses pfres directly.
export const effectiveBackgroundRows = (config) => {
  const cfg = config || {};
  return cfg.enableSuperchip ? Math.max(1, Number(cfg.pfres) || DEFAULT_BACKGROUND_ROWS) :
    DEFAULT_BACKGROUND_ROWS;
};

// Pads or truncates every background's pixel matrix (and per-row colors, if
// set) to exactly targetRows. Used when the global playfield resolution
// (pfres) changes, since that setting reshapes every background's playfield
// RAM layout at once - there is no per-background override.
export const reflowBackgroundsToHeight = (backgroundsStorage, targetRows) => {
  const data = processBackgroundStorageDefaults(backgroundsStorage);
  const reflowRows = (rows, emptyRow) => {
    const next = rows.slice(0, targetRows);
    while (next.length < targetRows) next.push(emptyRow());
    return next;
  };

  const backgrounds = data.backgrounds.map((background) => {
    if (background.pixels.length === targetRows) return background;
    const width = background.pixels[0] ? background.pixels[0].length : 32;
    return {
      ...background,
      pixels: reflowRows(background.pixels, () => new Array(width).fill(0)),
      rowColors: background.rowColors ?
        reflowRows(background.rowColors, () => DEFAULT_ROW_COLOR) : background.rowColors,
    };
  });

  backgroundsStorage.value = {...data, backgrounds};
};

const BACKGROUND_PFPIXEL_OPTIONS = [
  [`${CHECKBOX_CHECKED_ICON} Set`, 'on'],
  [`${CHECKBOX_CLEAR_ICON} Clear`, 'off'],
  [`${FLIP_ICON} Flip`, 'flip'],
];

const BACKGROUND_LINE_DIRECTION_OPTIONS = [
  [`Horizontally`, 'pfhline'],
  [`Vertically`, 'pfvline'],
];

const BACKGROUND_PFSCROLL_OPTIONS = [
  [`${BACKGROUND_PFSCROLL_LEFT_ICON} Left`, 'left'],
  [`${BACKGROUND_PFSCROLL_RIGHT_ICON} Right`, 'right'],
  [`${BACKGROUND_PFSCROLL_UP_ICON} Up`, 'up'],
  [`${BACKGROUND_PFSCROLL_DOWN_ICON} Down`, 'down'],
  [`${BACKGROUND_PFSCROLL_UP2X_ICON} Up (2x)`, 'upup'],
  [`${BACKGROUND_PFSCROLL_DOWN2X_ICON} Down (2x)`, 'downdown'],
];

export const DEFAULT_BACKGROUNDS = {
  backgrounds: [
    {
      id: 1,
      name: 'Background',
      pixels: playfieldToMatrix(
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
    },
  ],
};

export const processBackgroundStorageDefaults = (backgroundsStorage) => {
  const backgrounds = backgroundsStorage.value;
  if (!backgrounds || !backgrounds.backgrounds || !backgrounds.backgrounds.length) {
    return structuredClone(DEFAULT_BACKGROUNDS);
  }
  return backgrounds;
};

// Read the backgrounds afresh rather than through the module level storage:
// that is a computed over localStorage, which is not reactive, so it caches the
// first value it ever read and would keep serving stale names.
const buildBackgroundOptions = () => {
  try {
    const background = processBackgroundStorageDefaults(useBackgroundsStorage());

    return background.backgrounds.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list background options', e);
    return [['Error', '1']];
  }
};

// These two are defined below instead of in the JSON array, because a JSON
// definition can only take a fixed list of options. Passing the function to
// FieldDropdown lets Blockly rebuild the list every time the dropdown opens, so
// renamed, added and deleted backgrounds show up without reloading the page.
Blockly.Blocks['background_select'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Background`)
        .appendField(new Blockly.FieldDropdown(buildBackgroundOptions), 'VAR');
    this.setOutput(true, 'Number');
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Selects a background');
  },
};

Blockly.Blocks['background_set_select'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Background`)
        .appendField(new Blockly.FieldDropdown(buildBackgroundOptions), 'VAR');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Updates the background');
  },
};

Blockly.defineBlocksWithJsonArray([
  // Block for the setter.
  {
    'type': `background_set`,
    'message0': `${BACKGROUND_ICON} Background set to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Updates the background`,
  },
  // Block for the color setter.
  {
    'type': `background_set_color`,
    'message0': `${BACKGROUND_ICON} Background set %1 ${COLOR_ICON} color to %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Sets the background color`,
  },
  // Block for the color getter - one block with a Background/Playfield
  // dropdown (same VAR options as the setter above), rather than two
  // separate blocks, since both read the exact same kind of value and a
  // project switching which one it reads only ever needs to change the
  // dropdown, not swap blocks out.
  {
    'type': `background_get_color`,
    'message0': `${BACKGROUND_ICON} Get %1 ${COLOR_ICON} color`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
      },
    ],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Gets the current background or playfield color`,
  },
  // Block for fading a background/playfield color TOWARD a target color -
  // a one-shot TRIGGER (see backgroundFadeTimerVarName's own comment
  // above): call it once and the color keeps stepping toward the target on
  // its own, every frame from then on, via a check spliced into
  // commongamelogic - no need to keep re-calling this block yourself.
  // Brightness steps one level closer to the target each time the check
  // fires, AUTOMATICALLY going up or down depending on whether the color's
  // own current brightness is currently below or above the target's - no
  // separate "fade up"/"fade down" choice needed (an earlier version of
  // this had two separate blocks for that; folded into one since which
  // direction is "correct" is really just a fact about the current color,
  // not something worth asking the user to get right).
  // No STEPS field at all (an earlier version of this had a user-facing
  // dropdown for it) - always FADE_STEPS (4), fixed, for the real bug its
  // own comment describes: any other choice risked a crash once this
  // block's own trigger code ended up in a relocated bank.
  {
    'type': `background_fade_to`,
    'message0': `${BACKGROUND_ICON} Fade %1 ${COLOR_ICON} color to %2 over %3 frames`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
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
    'colour': BACKGROUND_COLOR,
    'tooltip': 'Starts fading the background or playfield color toward the given color over roughly ' +
      'this many frames - same hue as the target, brightness automatically climbing or dropping from ' +
      'wherever it currently is, whichever direction actually gets closer. Only needs to be triggered ' +
      'once - the fade keeps running by itself every frame afterward, even from inside an "if" block ' +
      'that only briefly becomes true, until it reaches the target and stops.',
  },
  // Block for reading a playfield pixel
  {
    'type': `background_get_pixel`,
    'message0': `${BACKGROUND_ICON} Background get pixel at X %1 and Y %2`,
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
    ],
    'inputsInline': true,
    'output': 'Boolean',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Reads a pixel of the background; can only be used on "if" statements`,
  },
  // Block for setting a playfield pixel
  {
    'type': `background_change_pixel`,
    'message0': `${BACKGROUND_ICON} Background %1 pixel at X %2 and Y %3`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
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
    'colour': BACKGROUND_COLOR,
    'tooltip': `Changes a pixel of the background`,
  },
  // Block for drawing an horizontal/vertical line
  {
    'type': `background_change_hv_line`,
    'message0': `${BACKGROUND_ICON} Background %1 %2 %3 pixels at X %4 and Y %5`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIRECTION',
        'options': BACKGROUND_LINE_DIRECTION_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'LENGTH',
        'check': 'Number',
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
    'colour': BACKGROUND_COLOR,
    'tooltip': `Draws an horizontal/vertical line.`,
  },
  // Block for reading the playfield's vertical resolution (row count)
  {
    'type': `background_get_resolution`,
    'message0': `${BACKGROUND_ICON} Background playfield height (rows)`,
    'args0': [],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `The playfield's vertical resolution in rows - the Superchip RAM pfres setting ` +
      `if that's turned on (Options tab), otherwise the standard 11-row default.`,
  },
  // Block for clearing every playfield pixel at once
  {
    'type': `background_clear`,
    'message0': `${BACKGROUND_ICON} Background clear all pixels`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Turns off every playfield pixel, the same as batari Basic's own "pfclear".`,
  },
  // Block for scrolling the background
  {
    'type': `background_scroll`,
    'message0': `${BACKGROUND_ICON} Background scroll %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIRECTION',
        'options': BACKGROUND_PFSCROLL_OPTIONS,
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Scrolls the background on a certain direction`,
  },
  // Block for drawing the screen
  {
    'type': `draw_screen`,
    'message0': `Draw screen`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Draws the screen`,
  },
]);

// Fires once, the moment a matching background_fade_to block (same
// register) actually reaches its own target color, regardless of which way
// brightness was moving to get there - see
// resolveBackgroundFadeFinishedWatches/backgroundFadeFinishedBit above for
// how this is resolved to one of fadeFlagsVarName's own fixed
// bits, and generators/bbasic/background.js for where that bit actually
// gets set (inside the per-frame check's own step branch, only the exact
// frame a step causes it to reach the target, either direction) and
// checked-and-cleared (this block's own generator). Used to have its own
// DIRECTION dropdown (fading in/brightening vs fading out/dimming), removed
// since a project reacting to "this fade is done" regardless of direction
// needed two near-identical copies of this block wired to the same DO stack
// - background_fade_to itself never states a direction either (it
// auto-detects which way to go from the current color), so there was no
// direction-aware trigger to actually pair a direction-specific watch
// against in the first place. A fade that starts already AT its target
// (nothing to actually step) never fires this - there's no real completion
// event to report if it was already done before the first check.
Blockly.Blocks['background_fade_finished'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} When`)
        .appendField(new Blockly.FieldDropdown([
          ['Background', 'COLUBK'],
          ['Playfield', 'COLUPF'],
        ]), 'VAR')
        .appendField(`${COLOR_ICON} color has finished fading`);
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Runs the connected blocks once, the moment a matching "Fade" block (same Background/' +
      'Playfield choice) reaches its own target color. Does nothing if no matching fade ever runs anywhere ' +
      'in the project.');
  },
};

// Plain, always-current boolean read of fadeActiveBit - not an
// event like background_fade_finished above (nothing to "watch" or clear),
// just whatever the bit currently holds: true from the moment a matching
// background_fade_to block triggers until the per-frame check (see
// generateBackgroundFadeChecks) steps that register's color onto its exact
// target, false the rest of the time, including before the first trigger.
Blockly.Blocks['background_fade_active'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Is`)
        .appendField(new Blockly.FieldDropdown([
          ['Background', 'COLUBK'],
          ['Playfield', 'COLUPF'],
        ]), 'VAR')
        .appendField(`${COLOR_ICON} color fade active?`);
    this.setOutput(true, 'Boolean');
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('True while the Background or Playfield color is in the middle of a "Fade" - from the ' +
      'moment a "Fade" block triggers it until it reaches its own target color, false the rest of the time.');
  },
};
