import * as Blockly from 'blockly/core';
import '@blockly/field-grid-dropdown';

import {COLOR_ICON} from './icon';
import {NTSC_COLORS} from '../utils/palette';

const colorToDataURL = (color) => {
  const canvas = window.document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.toDataURL();
};

const NTSC_COLOR_OPTIONS = NTSC_COLORS.map((color, idx) => ([
  {
    src: colorToDataURL(`#${color}`),
    width: 16,
    height: 16,
  },
  `${idx << 1}`,
]));

Blockly.defineBlocksWithJsonArray([
  {
    'type': 'color_get',
    'message0': `${COLOR_ICON} Color %1`,
    'args0': [
      {
        'type': 'field_grid_dropdown',
        'name': 'COLOR',
        'columns': 8,
        'options': NTSC_COLOR_OPTIONS,
      },
    ],
    'output': 'Number',
    'icon': COLOR_ICON,
    'colour': 'purple',
    'tooltip': 'Select a color to use.',
  },
]);
