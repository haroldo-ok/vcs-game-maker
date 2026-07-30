import * as Blockly from 'blockly/core';

import {COLOR_ICON, TEXT_ICON} from './icon';

const TEXT_COLOR = '#795548';

Blockly.defineBlocksWithJsonArray([
  // Shows a message using the Text Minikernel (a five-line message drawn in
  // place of the score digits - see generators/bbasic/text-minikernel.js).
  // Free-typed here rather than picked from a list: the generator registers
  // whatever's typed into a shared, deduplicated message table at compile
  // time, so any text works without a separate "define your messages first"
  // step.
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
