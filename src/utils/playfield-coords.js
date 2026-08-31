'use strict';

import {effectiveBackgroundRows} from '../blocks/background';

// Pixel-to-cell math for pfread()-based playfield lookups. Recreated for
// collision_check_position_box (see generators/bbasic/collision.js) after
// an earlier version of this file was deleted along with a fully-reverted
// prior attempt at the same feature - see that file's own top-of-file
// comment for the account of what broke.

// The playfield is always 32 columns across a 160px-wide screen, regardless
// of pfres/Superchip - exact, no project config needed.
export const PF_COLUMN_WIDTH_PX = 5;

// Row height in scanlines - matches std_kernel.asm/startup.asm's own
// default row height calculation ("lda #(96/pfres)"), confirmed against
// that same 96-scanline-tall half-screen constant. Divides by the TRUE
// pfres the kernel itself uses, NOT effectiveBackgroundRows() directly -
// those only agree once Superchip's own pfres is active (effectiveBackgroundRows
// returns cfg.pfres verbatim there). The non-Superchip default is different:
// batari Basic's own IMPLICIT pfres there is 12 (11 VISIBLE rows + 1 hidden
// scroll row - see DEFAULT_BACKGROUND_ROWS's own comment in blocks/
// background.js), but effectiveBackgroundRows deliberately returns just the
// visible 11. Dividing 96 by that visible-only 11 gave 9, not the real
// kernel's own 96/12 = 8 - confirmed wrong directly against the reference
// docs' own worked numbers (player0y's documented 1-88 usable range implies
// 11 rows * 8 scanlines = 88, not 11 * 9 = 99), a real reported bug in the
// sprite<->playfield Y conversion blocks (generators/bbasic/background.js).
export const pfRowDivisorFor = (config) => {
  const cfg = config || {};
  const pfres = cfg.enableSuperchip ? effectiveBackgroundRows(config) : 12;
  return Math.round(96 / pfres);
};
