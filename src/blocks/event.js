import * as Blockly from 'blockly/core';
import {COMMENT_ICON, GAMEOVER_ICON, GAME_ICON, START_ICON, SYSTEM_ICON, TITLE_ICON, UPDATE_ICON} from './icon';

// Distinct from every other block colour in the app (see blocks/*.js's own
// palette: purple, red, blue, background's orange, score's orange-red,
// data's brown, text's brown, sound's magenta, sprites' teal, and this
// category's own existing rgb(39, 176, 176) teal) - plain (non-blue) grey
// reads as neutral/inert, fitting for a block that has no effect on the
// compiled program at all, unlike every other block, which actually does
// something.
const COMMENT_COLOR = '#BDBDBD';

const EVENT_OPTIONS = [
  [`${SYSTEM_ICON} ${START_ICON} System start`, `system_start`],
  [`${TITLE_ICON} ${START_ICON} Title screen start`, `title_start`],
  [`${TITLE_ICON} ${UPDATE_ICON} Title screen update`, `title_update`],
  [`${GAME_ICON} ${START_ICON} Gameplay start`, `gameplay_start`],
  // Deliberately NOT a real, separately-relocatable event the way the other
  // five are - see Blockly.BBasic.finish's own comment in bbasic.js. Plain
  // top-level blocks (no event wrapper at all) already run every frame
  // during gameplay; this is purely an explicit, organized way to write
  // that same code, for symmetry with Title/Gameover's own Start+Update
  // pairs.
  [`${GAME_ICON} ${UPDATE_ICON} Gameplay update`, `gameplay_update`],
  [`${GAMEOVER_ICON} ${START_ICON} Gameover start`, `gameover_start`],
  [`${GAMEOVER_ICON} ${UPDATE_ICON} Gameover update`, `gameover_update`],
];

const STATE_OPTIONS = [
  [`${TITLE_ICON} Title screen`, 'title'],
  [`${GAME_ICON} Gameplay`, 'gameplay'],
  [`${GAMEOVER_ICON} Gameover`, 'gameover'],
];

// A bitmask check ("if frameCounter & mask = 0"), not an arbitrary interval
// counter, so every option has to stay a power of 2 - 256 (mask 255, the
// largest that still fits in a single byte) is the last one that works.
const FRAME_OPTIONS = [...Array(8).keys()]
    .map((n) => Math.pow(2, n + 1))
    .map((n) => [`${n}`, `${n - 1}`]);

Blockly.defineBlocksWithJsonArray([
  // Block for events
  {
    'type': 'event_block',
    'message0': 'On %1',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'EVENT',
        'options': EVENT_OPTIONS,
      },
    ],
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Will be executed when a given event happens',
  },

  // Block for changing game state
  {
    'type': 'event_change_state',
    'message0': 'Change state to %1',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'STATE',
        'options': STATE_OPTIONS,
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Change game state to a given one',
  },

  // Block for even/odd frames
  {
    'type': 'event_frame_even_odd',
    'message0': 'On even frames',
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO_EVEN',
    }],
    'message2': 'On odd frames',
    'message3': '%1',
    'args3': [{
      'type': 'input_statement',
      'name': 'DO_ODD',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Change game state to a given one',
  },

  // Block for executing every "n" frames
  {
    'type': 'event_frame_every_n',
    'message0': 'Every %1 frames, plus %2',
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'MASK',
        'options': FRAME_OPTIONS,
      },
      {
        'type': 'field_number',
        'name': 'DELTA',
        'value': 0,
      },
    ],
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Execute code every few frames',
  },

  // Wrapper block whose contents only run the first time it's reached -
  // every time after, they're skipped entirely. Backed by one bit of
  // persistent state per block instance (see generators/bbasic/event.js),
  // so it works no matter how often the surrounding code runs it (every
  // frame, from a subroutine called from several places, etc.).
  {
    'type': 'event_run_once',
    'message0': '▶️ Run once',
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(39, 176, 176)',
    'tooltip': 'Runs the connected blocks only the first time this is ' +
      'reached. Every time after, they\'re skipped, no matter how often ' +
      'the surrounding code runs.',
  },

  // Block for inserting a plain comment into the generated bBasic code - has
  // no effect on the compiled program whatsoever, purely a note for whoever
  // reads the Generated tab later.
  {
    'type': 'event_comment',
    'message0': `${COMMENT_ICON} %1`,
    'args0': [
      {
        'type': 'field_multilinetext',
        'name': 'TEXT',
        'text': 'Add Comment',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': COMMENT_COLOR,
    'tooltip': 'Inserts a comment into the generated bBasic code. Does not ' +
      'affect how the game runs in any way - purely a note to yourself.',
  },

  // Wrapper version of the above - encloses a whole stack of blocks instead
  // of standing alone, to label/group a section of logic. Whatever's
  // connected inside runs exactly as if this wrapper weren't there at all -
  // it only adds the comment line before it in the generated code.
  {
    'type': 'event_comment_wrapper',
    'message0': `${COMMENT_ICON} %1`,
    'args0': [
      {
        'type': 'field_multilinetext',
        'name': 'TEXT',
        'text': 'Add Comment',
      },
    ],
    'message1': '%1',
    'args1': [{
      'type': 'input_statement',
      'name': 'DO',
    }],
    'previousStatement': null,
    'nextStatement': null,
    'colour': COMMENT_COLOR,
    'tooltip': 'Groups the connected blocks under a comment label in the ' +
      'generated bBasic code. Purely organizational - everything inside ' +
      'still runs exactly as it would outside this wrapper.',
  },

]);
