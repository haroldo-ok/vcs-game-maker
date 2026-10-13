import * as Blockly from 'blockly/core';

Blockly.defineBlocksWithJsonArray([
  // Block for waiting a number of video frames.
  {
    'type': `wait_frames`,
    'message0': `wait %1 frames`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'FRAMES',
        'check': 'Number',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    // Matches the Event category's  colour (rgb(39, 176, 176) - see
    // blocks/event.js) now that this block lives in that toolbox category
    // instead of Loops.
    'colour': 'rgb(39, 176, 176)',
    'tooltip': `Pauses for the given number of video frames (NTSC runs at about 60 frames per second) ` +
      `before continuing.`,
  },
]);
