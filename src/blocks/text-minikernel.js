import * as Blockly from 'blockly/core';

import {COLOR_ICON, TEXT_ICON} from './icon';
import {buildTextStringOptions} from './text-strings';

// Was '#795548' - identical (down to the exact RGB triplet) to Data's own
// 'rgb(121, 85, 72)', making Text and Data blocks indistinguishable by
// colour alone. Indigo isn't used anywhere else in the app's palette (see
// blocks/*.js: purple, red, blue, background's orange, score's orange-red,
// data's brown, sound's magenta, sprites' teal, event's teal, comment's
// blue-grey).
const TEXT_COLOR = '#3F51B5';

// Shows a message using the Text Minikernel (a five-line message drawn in
// place of the score digits - see generators/bbasic/text-minikernel.js), the
// message picked from the entries defined on the Text tab. Defined in JS
// rather than the JSON array below so the dropdown can be backed by a
// function: that lets Blockly rebuild the option list every time the
// dropdown opens, so messages added, renamed or deleted on the Text tab show
// up without reloading the page (same reasoning as data_get_element's TABLE
// dropdown in blocks/data.js).
Blockly.Blocks['text_minikernel_show_named'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${TEXT_ICON} Show text:`)
        .appendField(new Blockly.FieldDropdown(buildTextStringOptions), 'TEXT_ID');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TEXT_COLOR);
    this.setTooltip('Displays a message defined on the Text tab, in place of the score, ' +
      'using the Text Minikernel.');
  },
};

Blockly.defineBlocksWithJsonArray([
  // Shows a message using the Text Minikernel. Free-typed here rather than
  // picked from a list: the generator registers whatever's typed into a
  // shared, deduplicated message table at compile time, so any text works
  // without a separate "define your messages first" step - see
  // "Show text" (text_minikernel_show_named above) for the named-entry
  // version backed by the Text tab.
  {
    'type': 'text_minikernel_show',
    'message0': `${TEXT_ICON} Show text: %1`,
    'args0': [
      {
        'type': 'field_input',
        'name': 'TEXT',
        'text': 'HELLO WORLD!',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': TEXT_COLOR,
    'tooltip': 'Displays a message in place of the score, using the Text ' +
      'Minikernel. Up to 12 characters (A-Z, 0-9, and basic punctuation) - ' +
      'longer text is cut off, shorter text is padded with spaces.',
  },
  // Sets the displayed message from a number expression (a variable,
  // computed value, or literal) rather than a fixed choice - the number is
  // the message's position on the Text tab (1 = the first message listed
  // there, 2 = the second, and so on), so the message shown can be picked at
  // runtime instead of always being the same fixed one.
  {
    'type': 'text_minikernel_show_by_id',
    'message0': `${TEXT_ICON} Show text with ID: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': TEXT_COLOR,
    'tooltip': 'Displays the message at this position on the Text tab (1 = the first message ' +
      'listed there, 2 = the second, and so on) - the number can be a variable or computed ' +
      'value, so the message shown can be picked at runtime.',
  },
  // Clears whatever message is currently shown, without displaying a new
  // one - equivalent to "Show text" with an empty message, but reads clearer
  // at the call site.
  {
    'type': 'text_minikernel_clear',
    'message0': `${TEXT_ICON} Clear text`,
    'previousStatement': null,
    'nextStatement': null,
    'colour': TEXT_COLOR,
    'tooltip': 'Clears the currently displayed Text Minikernel message.',
  },
  {
    'type': 'text_minikernel_set_color',
    'message0': `${COLOR_ICON} Text: set color to: %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': TEXT_COLOR,
    'tooltip': 'Sets the color of Text Minikernel messages.',
  },
]);
