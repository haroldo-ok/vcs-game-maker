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
    'colour': '%{BKY_LOOPS_HUE}',
    'tooltip': `Pauses for the given number of video frames (NTSC runs at about 60 frames per second) ` +
      `before continuing.`,
  },
]);
