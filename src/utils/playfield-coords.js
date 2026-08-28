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

// Row height in scanlines depends on how many playfield rows the CURRENT
// project uses (effectiveBackgroundRows - 11 by default, or pfres directly
// under Superchip) - matches std_kernel.asm/startup.asm's own default row
// height calculation ("lda #(96/pfres)"), confirmed against that same
// 96-scanline-tall half-screen constant.
export const pfRowDivisorFor = (config) => Math.round(96 / effectiveBackgroundRows(config));
