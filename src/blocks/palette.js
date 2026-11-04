import * as Blockly from 'blockly/core';

// The PXE kernel sends every color through a 256 byte table (PALETTE, in RAM at $0700) on its way to the TIA, so changing an entry changes
// every place that color is used.
Blockly.defineBlocksWithJsonArray([
  {
    'type': 'palette_set',
    'message0': 'PXE palette: show color %1 as %2',
    'args0': [
      {'type': 'input_value', 'name': 'INDEX', 'check': 'Number'},
      {'type': 'input_value', 'name': 'COLOR', 'check': 'Number'},
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel only: every use of the color (0 to 255) is shown as the other color from now on, in the playfield, ' +
      'background, sprites and score together. Show a color as itself to put it back. Used in rows, it makes colors cycle or flash.',
  },
  {
    'type': 'pxe_screen_mode',
    'message0': 'PXE screen: %1',
    'args0': [{'type': 'field_dropdown', 'name': 'MODE', 'options': [['score at the bottom', '0'], ['playfield drawn as a 48 pixel sprite', '1'], ['no score, picture to the bottom', '2']]}],
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel only: the usual screen shows the score bar at the bottom. Without it the picture fills all 188 lines. As a 48 pixel sprite the ' +
      'first 48 columns of the playfield are drawn a pixel to a column, in the middle of the screen, in the colors of the playfield (use a playfield width of 64 or 120 columns in Options for ' +
      'all 48: a 40 column one leaves the last 8 unset) - for big titles and letters.',
  },
  {
    'type': 'pxe_pf_scroll',
    'message0': 'PXE playfield scroll %1 by %2 pixels, %3',
    'args0': [
      {'type': 'field_dropdown', 'name': 'DIRECTION', 'options': [['left', 'left'], ['right', 'right']]},
      {'type': 'input_value', 'name': 'AMOUNT', 'check': 'Number'},
      {'type': 'field_dropdown', 'name': 'EDGE', 'options': [['stopping at the edges', 'stop'], ['going round', 'wrap']]},
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel, with a playfield of 64 or 120 columns (Options): moves the part of the playfield the screen shows sideways, 4 pixels to a ' +
      'column. Left shows what is further left. It stops at the edges of the playfield, or goes round (the map is a ring).',
  },
  {
    'type': 'pxe_pf_scroll_to',
    'message0': 'PXE playfield scroll to column %1',
    'args0': [{'type': 'input_value', 'name': 'COLUMN', 'check': 'Number'}],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel, with a playfield of 64 or 120 columns (Options): the screen shows the playfield from this column (0 is the left edge), ' +
      'up to the furthest it can go.',
  },
  {
    'type': 'pxe_pf_scroll_get',
    'message0': 'PXE playfield scroll column',
    'output': 'Number',
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel: the column of the playfield at the left edge of the screen (whole columns: the 4 pixel steps of the scroll are rounded down).',
  },
  {
    'type': 'pxe_pf_column_scroll',
    'message0': 'PXE playfield column group %1 show row %2 at the top',
    'args0': [
      {'type': 'input_value', 'name': 'GROUP', 'check': 'Number'},
      {'type': 'input_value', 'name': 'POSITION', 'check': 'Number'},
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel, with "Each column group has its own scroll and row step" on (Options, a playfield of 40, 64 or 120 columns): moves the group of 8 columns ' +
      '(group 0 is columns 0 to 7) up or down on its own: it starts at this row of the map, so groups can scroll at different speeds (parallax). The map has 256 rows and goes round.',
  },
  {
    'type': 'pxe_pf_column_step',
    'message0': 'PXE playfield column group %1 row step %2',
    'args0': [
      {'type': 'input_value', 'name': 'GROUP', 'check': 'Number'},
      {'type': 'input_value', 'name': 'STEP', 'check': 'Number'},
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel, with "Each column group has its own scroll and row step" on (Options): how fast the rows of the group of 8 columns go by. 256 divided ' +
      'by the step is the number of scanlines to a row (16 is rows of 16 lines, 32 rows of 8, 8 rows of 32), so a group with a smaller step has taller rows ' +
      'and shows less of the map.',
  },
  {
    'type': 'pxe_pf_column_row_get',
    'message0': 'PXE playfield column group %1 top row',
    'args0': [{'type': 'input_value', 'name': 'GROUP', 'check': 'Number'}],
    'inputsInline': true,
    'output': 'Number',
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel, with "Each column group has its own scroll and row step" on (Options): the row of the map at the top of the screen for the group ' +
      'of 8 columns (what "column group show row at the top" set).',
  },
  {
    'type': 'palette_get',
    'message0': 'PXE palette: color %1 is shown as',
    'args0': [{'type': 'input_value', 'name': 'INDEX', 'check': 'Number'}],
    'inputsInline': true,
    'output': 'Number',
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel only: the color the palette shows the color (0 to 255) as now. Read it before changing a color to be able to put it back.',
  },
  {
    'type': 'palette_is_pal',
    'message0': 'PXE console is PAL',
    'output': 'Boolean',
    'colour': 'rgb(122, 76, 158)',
    'tooltip': 'PXE kernel only: true when the console runs the game with the PAL colors, false for NTSC (the kernel loads the palette of the ' +
      'standard it found at start; this looks at color 16 of the palette, so it is wrong if a Palette block changed that color).',
  },
]);
