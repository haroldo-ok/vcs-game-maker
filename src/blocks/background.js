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
// exactly like sound effect fades (generateSoundFadeChecks in generators/
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

// One shared byte covers both the "fade finished" watch flags (COLUBK/COLUPF
// only - see background_fade_finished's own comment; scorecolor/TextColor
// have no equivalent finished-watch block) AND the "fade currently active"
// flags for all four fadeable registers - exactly 8 possible bits total (2
// registers x 2 directions for "finished", plus 4 registers x 1 for
// "active"), filling the byte exactly, so fixed bits are simpler than the
// Music tab's own pooled/overflow allocation (built for open-ended,
// user-defined watch counts) and never need more than this one byte.
// "Finished" is split by
// direction (fading in/brightening vs fading out/dimming), not just by
// register, since a background_fade_finished watch needs to tell those
// apart - e.g. a "flash brighter then settle back down" sequence (two
// separate background_fade_to triggers on the same register, one right
// after the other) has two distinct completion moments a project may want
// to react to differently. The "active" bits are what the per-frame check
// (generateBackgroundFadeChecks) reads to know whether a register has an
// in-progress fade to keep stepping at all - set once by background_fade_
// to's own trigger code, cleared once the check steps the color onto its
// exact target; unlike "finished", "active" never needs to be direction-
// specific, since only one fade can be in progress on a given register at
// a time regardless of which way it's headed.
export const backgroundFadeFlagsVarName = () => '_bgFadeFlags';
export const backgroundFadeFinishedBit = (rawVar, direction) =>
  (rawVar === 'COLUPF' ? 2 : 0) + (direction === 'down' ? 1 : 0);
// Bits 0-3 are the COLUBK/COLUPF "finished" bits above (2 registers x 2
// directions) - active bits for all four fadeable registers pack into the
// remaining 4-7, filling the byte exactly.
const FADE_ACTIVE_BIT_BY_VAR = {COLUBK: 4, COLUPF: 5, scorecolor: 6, TextColor: 7};
export const fadeActiveBit = (rawVar) => FADE_ACTIVE_BIT_BY_VAR[rawVar];

// Every (register, direction) pair a background_fade_finished block in the
// project actually watches, keyed as "VAR:DIRECTION" - a plain Set, since
// there are only 4 possible combinations total and each is either watched
// or not (no dedup/index-assignment step needed the way the Music tab's own
// open-ended watches require). Read by both background_fade_to's own
// per-frame check (to decide whether to bother setting a bit nothing is
// watching) and the event block itself (to know which bit to check-and-
// clear) - see resolveVar's own callers in generators/bbasic/background.js.
export const backgroundFadeWatchKey = (rawVar, direction) => `${rawVar}:${direction}`;
export const resolveBackgroundFadeFinishedWatches = (workspace) => {
  const watched = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    if (block.type !== 'background_fade_finished') return;
    watched.add(backgroundFadeWatchKey(block.getFieldValue('VAR'), block.getFieldValue('DIRECTION')));
  });
  return watched;
};

// Whether any background_fade_active block exists anywhere in the project -
// that block reads backgroundFadeFlagsVarName's own active bit directly (see
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
      name: 'Test 1',
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
        .appendField(`${BACKGROUND_ICON} Background:`)
        .appendField(new Blockly.FieldDropdown(buildBackgroundOptions), 'VAR');
    this.setOutput(true, 'Number');
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Selects a background');
  },
};

Blockly.Blocks['background_set_select'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Background:`)
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
    'message0': `${BACKGROUND_ICON} Background: set to: %1`,
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
    'message0': `${BACKGROUND_ICON} Background: set %1 ${COLOR_ICON} color to: %2`,
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
    'message0': `${BACKGROUND_ICON} Fade %1 ${COLOR_ICON} color to: %2 over %3 frames`,
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
    'message0': `${BACKGROUND_ICON} Background: get pixel at X %1 and Y %2`,
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
    'message0': `${BACKGROUND_ICON} Background: %1 pixel at X %2 and Y %3`,
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
    'message0': `${BACKGROUND_ICON} Background:  %1 %2 %3 pixels at X %4 and Y %5`,
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
    'message0': `${BACKGROUND_ICON} Background: playfield height (rows)`,
    'args0': [],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `The playfield's vertical resolution in rows - the Superchip RAM pfres setting ` +
      `if that's turned on (Options tab), otherwise the standard 11-row default.`,
  },
  // Block for clearing every playfield pixel at once
  {
    'type': `background_clear`,
    'message0': `${BACKGROUND_ICON} Background: clear all pixels`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Turns off every playfield pixel, the same as batari Basic's own "pfclear".`,
  },
  // Block for scrolling the background
  {
    'type': `background_scroll`,
    'message0': `${BACKGROUND_ICON} Background: scroll %1`,
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
// register AND direction) actually reaches its own target color - see
// resolveBackgroundFadeFinishedWatches/backgroundFadeFinishedBit above for
// how this is resolved to one of backgroundFadeFlagsVarName's own fixed
// bits, and generators/bbasic/background.js for where that bit actually
// gets set (inside the per-frame check's own step branch, only the exact
// frame a step causes it to reach the target) and checked-and-cleared
// (this block's own generator). Direction is which way brightness was
// actually moving on the completing step (up = fading in/brightening,
// down = fading out/dimming) - background_fade_to itself never states a
// direction (it auto-detects which way to go from the current color), so
// this is the only place a project chooses to care about one specific
// direction's own completion, e.g. reacting only once a "flash brighter"
// has finished, not the "settle back down" that follows it. A fade that
// starts already AT its target (nothing to actually step, so no direction
// was ever taken) never fires this - there's no real completion event to
// report if it was already done before the first check.
Blockly.Blocks['background_fade_finished'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} When`)
        .appendField(new Blockly.FieldDropdown([
          ['Background', 'COLUBK'],
          ['Playfield', 'COLUPF'],
        ]), 'VAR')
        .appendField(`${COLOR_ICON} color has finished`)
        .appendField(new Blockly.FieldDropdown([
          ['fading in', 'up'],
          ['fading out', 'down'],
        ]), 'DIRECTION');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Runs the connected blocks once, the moment a matching "Fade" block (same Background/' +
      'Playfield choice) reaches its own target color while moving in this direction. Does nothing if no ' +
      'matching fade ever moves that way anywhere in the project.');
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
