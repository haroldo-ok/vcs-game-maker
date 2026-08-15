'use strict';

import {effectiveBackgroundRows} from '../blocks/background';

// The screen's own fixed geometry: 160 player-pixel-wide, 32 playfield
// columns (see public/bb19/includes/pf_drawing.asm's own header comment,
// "you get a 32x12 bitmapped display... 0-31 and 0-11") - an exact division
// (5px/column), needing no calibration or per-project config lookup, unlike
// the row divisor below.
export const PF_COLUMN_WIDTH_PX = 5;

// The scanline-budget-like constant pf_drawing.asm's own row math is built
// around (confirmed via this app's own Configuration.vue hint text, "Values
// that don't evenly divide 96", for the pfres field) - dividing it by
// effectiveBackgroundRows(config) (src/blocks/background.js) gives how many
// player-pixel scanlines one playfield row spans, scaling correctly for
// Superchip's higher pfres instead of assuming the standard kernel's fixed
// row count. Returns a plain JS number (a compile-time constant to splice
// into generated bB code as a literal divisor), not a bB expression - the
// actual per-pixel division happens in generated code, using this as the
// divisor.
export const pfRowDivisorFor = (config) => Math.round(96 / effectiveBackgroundRows(config));
