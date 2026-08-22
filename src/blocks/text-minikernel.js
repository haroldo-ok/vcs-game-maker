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

// A message longer than the Text tab's own "Max characters to display at
// once" setting (see resolveTextMaxDisplayWidth in blocks/text-strings.js)
// always auto-scrolls, regardless of which "Show text" block shows it (see
// generators/bbasic/text-minikernel.js's own encodeMessageRow) - the three
// "..._scroll" block variants below just add speed/pause fields to tune
// that, using DEFAULT_SCROLL_SPEED/DEFAULT_SCROLL_PAUSE otherwise (see
// their own use in generators/bbasic/text-minikernel.js).
const appendScrollInputs = (block) => {
  block.appendValueInput('SCROLL_SPEED')
      .setCheck('Number')
      .appendField('every');
  block.appendDummyInput().appendField('frames,');
  block.appendValueInput('SCROLL_PAUSE')
      .setCheck('Number')
      .appendField('wait');
  block.appendDummyInput().appendField('at limits');
  block.setInputsInline(true);
};

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
      'using the Text Minikernel. Automatically scrolls back and forth if the message is ' +
      'longer than the Text tab\'s own max display width - see "Scroll text" for ' +
      'a version with its own tunable scroll speed/pause.');
  },
};

// Same message-picking rules as text_minikernel_show_named above, with
// SCROLL_SPEED/SCROLL_PAUSE fields added (see appendScrollInputs) to tune
// the scroll that entry gets automatically if it's too long to fit
// statically - a separate block, rather than the two extra fields just
// being added onto text_minikernel_show_named directly, so a project that
// never needs to tune scrolling never has to look at (or account for) those
// fields at all.
Blockly.Blocks['text_minikernel_show_named_scroll'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${TEXT_ICON} Scroll text:`)
        .appendField(new Blockly.FieldDropdown(buildTextStringOptions), 'TEXT_ID');
    appendScrollInputs(this);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TEXT_COLOR);
    this.setTooltip('Displays a message defined on the Text tab, in place of the score, ' +
      'using the Text Minikernel, with its own scroll speed/pause. Only takes effect if the ' +
      'message is longer than the Text tab\'s own max display width - ignored otherwise.');
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
    'tooltip': 'Displays a message in place of the score, using the Text Minikernel ' +
      '(A-Z, 0-9, and basic punctuation). Automatically scrolls back and forth if longer ' +
      'than the Text tab\'s own max display width - see "Scroll text" for a ' +
      'version with its own tunable scroll speed/pause.',
  },
  // Sets the displayed message from a number expression (a variable,
  // computed value, or literal) rather than a fixed choice - the number is
  // the message's position on the Text tab (1 = the first message listed
  // there, 2 = the second, and so on), so the message shown can be picked at
  // runtime instead of always being the same fixed one.
  {
    'type': 'text_minikernel_show_by_id',
    'message0': `${TEXT_ICON} Show text ID: %1`,
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
      'value, so the message shown can be picked at runtime. Automatically scrolls if that ' +
      'message is longer than the Text tab\'s own max display width.',
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
  // Fades TextColor toward a target - same shared mechanism as Background's
  // own "Fade color to" (see blocks/background.js's own fade var-name
  // helpers and generateBackgroundFadeChecks in generators/bbasic/
  // background.js, both now generalized past just COLUBK/COLUPF), just
  // always targeting TextColor rather than offering a register choice.
  // Fire-and-forget, same as Background's own version: triggering this once
  // keeps the color stepping toward the target every frame afterward on its
  // own, only while the Text Minikernel is in use elsewhere in the project.
  {
    'type': 'text_minikernel_fade_to',
    'message0': `${TEXT_ICON} Fade Text ${COLOR_ICON} color to: %1 over %2 frames`,
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
    'colour': TEXT_COLOR,
    'tooltip': 'Starts fading the Text Minikernel\'s own message color toward the given color over ' +
      'roughly this many frames - same hue as the target, brightness automatically climbing or ' +
      'dropping from wherever it currently is. Only needs to be triggered once - the fade keeps ' +
      'running by itself every frame afterward, even from inside an "if" block that only briefly ' +
      'becomes true, until it reaches the target and stops.',
  },
  // A single comparison against the shared scroll offset/max (see
  // generateTextScrollAdvance in generators/bbasic/text-minikernel.js) -
  // true at the moment a scrolling message has reached (and is pausing at)
  // the chosen end, false the rest of the time, including for a message
  // that never needed to scroll in the first place (offset and max are both
  // 0 then, so "Left" reads true and "Right" reads false at every frame -
  // the "already all the way left" state a non-scrolling message is always
  // in).
  // Runtime control over the shared scroll state (see generateTextScrollAdvance
  // in generators/bbasic/text-scroll.js) - a single block with a dropdown
  // rather than five separate blocks, since they're all just one flag/reset
  // write apiece and share the exact same "which action" shape.
  //
  // Start/Unpause both just clear the paused flag - Start reads better at a
  // call site meant to kick scrolling off (e.g. right after a "Show text"
  // call that intentionally left it paused), Unpause reads better paired
  // with a "Pause" earlier in the same logic, but they do the same thing.
  //
  // Stop freezes the message at its own start (offset 0) and pauses it
  // there - Restart resets to offset 0 too, but leaves it running (and
  // waits the "pause at limits" duration before its first step, the same
  // as a genuinely new message - see buildTextScrollSetupLines' own
  // comment in text-scroll.js).
  {
    'type': 'text_minikernel_scroll_control',
    'message0': `${TEXT_ICON} Text scroll: %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'ACTION',
        'options': [
          ['Start', 'start'],
          ['Pause', 'pause'],
          ['Unpause', 'unpause'],
          ['Stop', 'stop'],
          ['Restart', 'restart'],
        ],
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': TEXT_COLOR,
    'tooltip': 'Controls the currently shown scrolling text message. Start/Unpause resume it ' +
      'from wherever it currently is. Pause freezes it in place. Stop resets it back to its ' +
      'own beginning and freezes it there. Restart resets it back to its own beginning too, ' +
      'but keeps it scrolling. Has no visible effect on a message that never needed to scroll ' +
      'in the first place.',
  },
  {
    'type': 'text_minikernel_scroll_at',
    'message0': `${TEXT_ICON} Is text scroll at %1 ?`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'SIDE',
        'options': [['Left', 'left'], ['Right', 'right']],
      },
    ],
    'output': 'Boolean',
    'colour': TEXT_COLOR,
    'tooltip': 'True while the currently shown Text Minikernel message is paused at the ' +
      'chosen end of its scroll range (always true for "Left" on a message that never ' +
      'needed to scroll at all).',
  },
]);

// Free-typed version of text_minikernel_show_named_scroll above - see
// text_minikernel_show's own comment for why free-typed text gets its own
// block instead of a Text tab entry.
Blockly.Blocks['text_minikernel_show_scroll'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${TEXT_ICON} Scroll text:`)
        .appendField(new Blockly.FieldTextInput('HELLO WORLD!'), 'TEXT');
    appendScrollInputs(this);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TEXT_COLOR);
    this.setTooltip('Displays a message in place of the score, using the Text Minikernel, ' +
      'with its own scroll speed/pause. Only takes effect if the message is longer than the ' +
      'Text tab\'s own max display width - ignored otherwise.');
  },
};

// Runtime-ID version of text_minikernel_show_named_scroll above - see
// text_minikernel_show_by_id's own comment for the ID-lookup mechanics.
// Since which message this ends up showing isn't known until runtime,
// whether it scrolls (and how far) is also resolved at runtime, from a
// small lookup table generated alongside text_strings itself (see
// generateTextOffsetTables in generators/bbasic/text-scroll.js) - the
// scroll speed/pause fields below still apply at compile time, since those
// aren't part of what the runtime lookup needs to resolve.
Blockly.Blocks['text_minikernel_show_by_id_scroll'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${TEXT_ICON} Scroll text ID:`);
    appendScrollInputs(this);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(TEXT_COLOR);
    this.setTooltip('Displays the message at this position on the Text tab, with its own ' +
      'scroll speed/pause - the number can be a variable or computed value, so the message ' +
      'shown can be picked at runtime. Only takes effect if that message is longer than the ' +
      'Text tab\'s own max display width - ignored otherwise.');
  },
};
