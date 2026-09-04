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
  // A manual "pfrowheight" override (see Configuration.vue's own "Override
  // playfield row height" switch + field for it) takes priority over the
  // automatic round(96/pfres) calculation below - matches the kernel's own
  // precedence exactly (std_kernel.asm/std_kernel_vertical_reflect.asm both
  // check "ifconst pfrowheight" before ever falling back to computing it
  // from pfres - see generateConfiguration's own comment on
  // pfRowHeightConfigurationCode in generators/bbasic.js). Gated on
  // enablePfRowHeight the same way that const's own emission is - the
  // switch being off means the field's own stored number is never actually
  // applied, so this has to ignore it too, or these coordinate blocks would
  // disagree with what the kernel itself is really doing.
  if (cfg.enablePfRowHeight && cfg.pfrowheight) return Math.round(Number(cfg.pfrowheight));
  const pfres = cfg.enableSuperchip ? effectiveBackgroundRows(config) : 12;
  return Math.round(96 / pfres);
};

// How many bytes of Superchip RAM's own read/write pool (r000-r127/w000-
// w127 - a completely separate 128-byte region from the "48 bytes freed
// from the old RAM playfield" pool generateSystemDims/SUPERCHIP_VAR_START
// already use, see their own comments in generators/bbasic.js) are NOT
// already claimed by the current background's own per-row playfield data.
// Per the real batari Basic reference documentation: that data always
// costs 4 x pfres bytes, counted down from the top (r/w127 backward), so
// whatever's left starting from r/w000 is free - confirmed directly
// against the reference docs' own worked example (pfres=12, the default,
// leaves 128-48=80 free bytes, r/w000-r/w079). Zero once pfres reaches 32
// (4*32=128, the whole chip), and zero whenever Superchip itself is off,
// since this pool doesn't exist at all without it.
export const superchipRwFreeCount = (config) => {
  const cfg = config || {};
  if (!cfg.enableSuperchip) return 0;
  return Math.max(0, 128 - 4 * effectiveBackgroundRows(config));
};
