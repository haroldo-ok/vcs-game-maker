import * as Blockly from 'blockly/core';

import {COLOR_ICON, SCORE_ICON} from './icon';

const SCORE_COLOR = '#f2691e';

// The score is six digits, numbered left to right.
const SCORE_DIGIT_OPTIONS = [...Array(6).keys()].map((n) => [`${n + 1}`, `${n + 1}`]);

// The byte "Score Bar units" counts the bits of when it is inside a custom function (temp1 to temp6 hold the arguments there).
export const scoreBarUnitsVarName = () => 'scoreBarUnits';
// The same for "Score line colors: set hue", which holds the hue it works out there.
export const scoreLineHueVarName = () => 'scoreLineHue';

const SCORE_BAR_OPTIONS = [
  ['1', 'pfscore1'],
  ['2', 'pfscore2'],
];

Blockly.defineBlocksWithJsonArray([
  // Block for the score getter.
  {
    'type': `score_get`,
    'message0': `${SCORE_ICON} Score`,
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the score`,
  },
  // Block for the score setter.
  {
    'type': `score_set`,
    'message0': `${SCORE_ICON} Score set to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Updates the score`,
  },
  // Block for adding to the score in place.
  {
    'type': `score_change`,
    'message0': `${SCORE_ICON} Score change by %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'extensions': ['math_change_tooltip'],
  },
  // Block for choosing which of the two score fonts is drawn.
  {
    'type': `score_font_set`,
    'message0': `${SCORE_ICON} Score set font to %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'FONT',
        'options': [['primary', 'primary'], ['secondary', 'secondary']],
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Switches the score digits to the primary or the secondary font chosen on the Score tab, at once. ` +
      `Does nothing without a secondary font.`,
  },
  // Block that changes the hue of the DPC+ score lines.
  {
    'type': `score_line_hue_set`,
    'message0': `${SCORE_ICON} Score line colors: set hue ${COLOR_ICON} to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `DPC+ only: changes the hue of the lines of the score and keeps the brightness each line has on the Score tab, so a gradient can be recolored ` +
      `while the game runs. Only the hue of the color given is used (its top 4 bits). Use it when the Score tab gives the lines different colors: ` +
      `then "Score set color" no longer changes the lines of the score.`,
  },
  // Block that gives the score bars one flat color.
  {
    'type': `score_bar_color_set`,
    'message0': `${SCORE_ICON} Score bars: set ${COLOR_ICON} color to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Gives the score bars one flat color. Without this block the bars take the color of the score (on DPC+, the color of each line of the score). ` +
      `Not for the PXE kernel.`,
  },
  // Block for the color getter.
  {
    'type': `score_color_get`,
    'message0': `${SCORE_ICON} Score ${COLOR_ICON} color`,
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the score's color`,
  },
  // Block for the color setter.
  {
    'type': `score_color_set`,
    'message0': `${SCORE_ICON} Score set ${COLOR_ICON} color to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Updates the score's color`,
  },
  // Block for fading the score's color - same mechanism as Background's
  // "Fade color to" (see blocks/background.js's  fade var-name helpers
  // and generateBackgroundFadeChecks in generators/bbasic/background.js,
  // both now generalized past just COLUBK/COLUPF), just always targeting
  // scorecolor rather than offering a register choice - there's only one
  // possible score color register. Fire-and-forget, same as Background's
  // version: triggering this once keeps the color stepping toward the
  // target every frame afterward by itself.
  {
    'type': `score_fade_to`,
    'message0': `${SCORE_ICON} Fade Score ${COLOR_ICON} color to %1 over %2 frames`,
    'args0': [
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
    'colour': SCORE_COLOR,
    'tooltip': 'Starts fading the score\'s color toward the given color over roughly this many frames - ' +
      'same hue as the target, brightness automatically climbing or dropping from wherever it currently ' +
      'is. Only needs to be triggered once - the fade keeps running by itself every frame afterward, ' +
      'even from inside an "if" block that only briefly becomes true, until it reaches the target and stops.',
  },
  // Block for flashing the score's color: the color alternates with the one the score had, every so many frames, a number of times.
  {
    'type': `score_flash`,
    'message0': `${SCORE_ICON} Flash Score %1 ${COLOR_ICON} color to %2 every %3 frames, %4 times`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'TARGET',
        'options': [['digits', 'digits'], ['bars', 'bars'], ['digits and bars', 'both']],
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
      {
        'type': 'input_value',
        'name': 'TIMES',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': 'Flashes the color of the score digits, of the score bars, or of both: the color given shows for this many frames, then the color the score had for the same ' +
      'number of frames, and so on, so many times (a flash is one of each), and the score ends in the color it had. Runs by itself after it is started; started again ' +
      'while it runs, it starts over with the new color. The bars follow the digits unless a "Score bars set color" block gives them a color: flash the digits alone ' +
      'in a project that has that block, or flash the bars alone. On DPC+ with "Score bars use the line colors" on (Score tab), the bars are drawn in the colors of the score lines, so they flash with the digits. Not for the PXE kernel.',
  },
  // Block for the background color setter - only takes effect when the
  // project also uses the Text Minikernel (see generators/bbasic/score.js's
  // generator): the standard score bar has no runtime-settable
  // background color at all, only the Text Minikernel's "minikernel"
  // subroutine reads scorebkcolor.
  {
    'type': `score_bk_color_set`,
    'message0': `${SCORE_ICON} Score set background ${COLOR_ICON} color to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Updates the score row's background color. Only takes effect when the ` +
      `Text Minikernel is in use elsewhere in the project (e.g. a "Show text" block) - ` +
      `the standard score bar's background color is fixed at compile time (Score tab).`,
  },
  // Block for adding to the score's color in place.
  {
    'type': `score_color_change`,
    'message0': `${SCORE_ICON} Score change ${COLOR_ICON} color by %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'extensions': ['math_change_tooltip'],
  },
  // Block for a single score digit getter.
  {
    'type': `score_digit_get`,
    'message0': `${SCORE_ICON} Score digit %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIGIT',
        'options': SCORE_DIGIT_OPTIONS,
      },
    ],
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads a single score digit (0 to 9), counting from the left. ` +
      `Store it in a variable before comparing it.`,
  },
  // Block for a single score digit setter.
  {
    'type': `score_digit_set`,
    'message0': `${SCORE_ICON} Score digit %1 set to %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIGIT',
        'options': SCORE_DIGIT_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Sets a single score digit, counting from the left, without ` +
      `changing the other digits. Use a value from 0 to 9.`,
  },
  // Block for changing a single score digit in place.
  {
    'type': `score_digit_change`,
    'message0': `${SCORE_ICON} Score digit %1 change by %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIGIT',
        'options': SCORE_DIGIT_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Adds to a single score digit, counting from the left, without changing the other digits. ` +
      `Use a negative value to subtract. Doesn't wrap or carry into the neighboring digit - keep the ` +
      `result between 0 and 9 yourself, same as the plain "set" block already requires.`,
  },
  // Block for the score bar getter.
  {
    'type': `score_bar_get`,
    'message0': `${SCORE_ICON} Score Bar %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
    ],
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads the binary pattern (style) of a playfield score bar`,
  },
  // Block for the number of units a score bar shows.
  {
    'type': `score_bar_units`,
    'message0': `${SCORE_ICON} Score Bar %1 units`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
    ],
    'output': 'Number',
    'colour': SCORE_COLOR,
    'tooltip': `Reads how many units a playfield score bar shows: the number of bits that are set in the bar's pattern (0 to 8). A bar filled by "set health to" ` +
      `or "change health by" counts the width of its solid block, and a bar filled by "set lives to" or "change lives by" counts its dots. A bar set with a ` +
      `raw pattern counts the bits of that pattern. (Score Bar reads the pattern itself.)`,
  },
  // Block for the score bar setter.
  {
    'type': `score_bar_set`,
    'message0': `${SCORE_ICON} Score Bar %1 set to %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Enables the playfield score bars (colored using the score's color), and sets a bar's ` +
      `binary pattern (style). Use %00000000 to %11111111 (each 1 bit lights up a pixel of the bar).`,
  },
  // Block for adding to a score bar in place.
  {
    'type': `score_bar_change`,
    'message0': `${SCORE_ICON} Score Bar %1 change by %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'extensions': ['math_change_tooltip'],
  },
  // Block for setting a score bar as a plain "N units filled" health bar,
  // instead of a raw binary pattern.
  {
    'type': `score_bar_set_health`,
    'message0': `${SCORE_ICON} Score Bar %1 set health to %2 (0-8)`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Enables the playfield score bars, and fills a bar with a solid block of the given ` +
      `width, growing outward from the score (0 = empty, 8 = completely full). Use 0 to 8.`,
  },
  // Block for setting a score bar as a plain "N lives" dot indicator,
  // instead of a raw binary pattern.
  {
    'type': `score_bar_set_lives`,
    'message0': `${SCORE_ICON} Score Bar %1 set lives to %2 (0-4)`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Enables the playfield score bars, and fills a bar with the given number of evenly ` +
      `spaced dots, growing outward from the score. Use 0 to 4.`,
  },
  // Block for changing a health-style score bar by a number of units.
  {
    'type': `score_bar_change_health`,
    'message0': `${SCORE_ICON} Score Bar %1 change health by %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Grows or shrinks a health-style score bar by the given number of units (a literal ` +
      `negative number shrinks it - a variable amount can only grow it, since the bar has no ` +
      `separate stored "current value" to read a sign from).`,
  },
  // Block for changing a lives-style score bar by a number of dots.
  {
    'type': `score_bar_change_lives`,
    'message0': `${SCORE_ICON} Score Bar %1 change lives by %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': SCORE_BAR_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'DELTA',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': SCORE_COLOR,
    'tooltip': `Adds or removes dots from a lives-style score bar (a literal negative number ` +
      `removes dots - a variable amount can only add dots, since the bar has no separate stored ` +
      `"current value" to read a sign from).`,
  },
]);

// Works exactly like background_fade_finished (see blocks/background.js's
// comment - same shared bit/flag machinery, same "fires once, regardless
// of fade direction, never late" behavior), just always targeting
// scorecolor rather than offering a register choice - same reasoning as
// score_fade_to above: there's only one possible score color register.
Blockly.Blocks['score_fade_finished'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SCORE_ICON} When Score ${COLOR_ICON} color has finished fading`);
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(SCORE_COLOR);
    this.setTooltip('Runs the connected blocks once, the moment a matching "Fade Score color" block ' +
      'reaches its target color. Does nothing if no matching fade ever runs anywhere in the project.');
  },
};
