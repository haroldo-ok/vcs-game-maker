import * as Blockly from 'blockly/core';

import {HUE_ANY, hueOptions} from '../generators/bbasic/rainbow-range';

// What the rainbow colors blocks have to give the colors: the first and last color value of the range (inputs that take a Color or a Number block, 0 to 255; the
// default 0 to 255 leaves the colors as the plain rainbow makes them; the table is made when the ROM is built, so the blocks have to be constants), then the
// hues a block of an older project had (HUEFROM and HUETO, shown only while one of them is not "any hue").
export const rainbowRangeArgs = () => [
  {'type': 'input_value', 'name': 'COLORFROM', 'check': 'Number'},
  {'type': 'input_value', 'name': 'COLORTO', 'check': 'Number'},
  {'type': 'field_label', 'name': 'HUELABEL', 'text': 'hues'},
  {'type': 'field_dropdown', 'name': 'HUEFROM', 'options': hueOptions},
  {'type': 'field_dropdown', 'name': 'HUETO', 'options': hueOptions},
];

// The three fields of the older span of hues are hidden until a block has one (a saved project that set it): the colors range replaces it. Choosing "any hue" in
// either dropdown ends the span (see rainbowRangeOf) and hides them again.
Blockly.Extensions.register('rainbow_legacy_hues', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const fields = ['HUELABEL', 'HUEFROM', 'HUETO'].map((name) => block.getField(name));
  if (fields.some((field) => !field)) return;
  const setShown = (shown) => {
    if (fields.every((field) => field.isVisible() === shown)) return;
    fields.forEach((field) => field.setVisible(shown));
    setTimeout(() => {
      if (!block.workspace || (typeof block.isDeadOrDying === 'function' && block.isDeadOrDying())) return;
      if (typeof block.queueRender === 'function') block.queueRender();
    }, 0);
  };
  fields.forEach((field) => field.setVisible(false));
  // A span needs both hues (see rainbowRangeOf), so the fields are shown while neither is "any hue".
  const names = ['HUEFROM', 'HUETO'];
  names.forEach((name) => block.getField(name).setValidator((value) => {
    const other = block.getFieldValue(names.find((n) => n !== name));
    setShown(value !== HUE_ANY && other !== HUE_ANY);
    return value;
  }));
});
