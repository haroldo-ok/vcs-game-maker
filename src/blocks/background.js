'use strict';

import * as Blockly from 'blockly/core';

import {useBackgroundsStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';
import {BACKGROUND_ICON, COLOR_ICON, CHECKBOX_CHECKED_ICON, CHECKBOX_CLEAR_ICON, FLIP_ICON, BACKGROUND_PFSCROLL_LEFT_ICON, BACKGROUND_PFSCROLL_RIGHT_ICON, BACKGROUND_PFSCROLL_UP_ICON, BACKGROUND_PFSCROLL_DOWN_ICON, BACKGROUND_PFSCROLL_DOWN2X_ICON, BACKGROUND_PFSCROLL_UP2X_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

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
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
        'X....X...................X....X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X.............................X\n' +
        'X....X...................X....X\n' +
        'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
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
