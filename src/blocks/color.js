import * as Blockly from 'blockly/core';
import '@blockly/field-grid-dropdown';

import {COLOR_ICON} from './icon';
import {NTSC_COLORS} from '../utils/palette';

// 28x28 (up from an original 16x16) - see App.vue's own global .blocklyMenuItem
// padding override, which shrinks each grid cell's own frame to match: a
// swatch this size fills its bordered cell edge to edge instead of floating
// as a small square inside a much bigger padded frame.
const SWATCH_SIZE = 28;

const colorToDataURL = (color) => {
  const canvas = window.document.createElement('canvas');
  canvas.width = SWATCH_SIZE;
  canvas.height = SWATCH_SIZE;

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  return canvas.toDataURL();
};

// Exported so other blocks that need the exact same visual swatch-grid
// picker (see @blockly/field-grid-dropdown) - not just this one's own
// color_get - can reuse it instead of duplicating the color-to-dataURL
// rendering (see blocks/text-minikernel.js's background-color block).
export const NTSC_COLOR_OPTIONS = NTSC_COLORS.map((color, idx) => ([
  {
    src: colorToDataURL(`#${color}`),
    width: SWATCH_SIZE,
    height: SWATCH_SIZE,
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
