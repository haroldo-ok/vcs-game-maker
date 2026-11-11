'use strict';

import {superchipOn} from './superchip';
import {pfWidthOf, pfIsWide, pfMaxScrollOf} from './pxe';
import {effectiveBackgroundRows, dpcPlusPfresOf, backgroundPfresOf} from '../blocks/background';

// Pixel-to-cell math for pfread()-based playfield lookups. Recreated for
// collision_check_position_box (see generators/bbasic/collision.js) after
// an earlier version of this file was deleted along with a fully-reverted
// prior attempt at the same feature - see that file's  top-of-file
// comment for the account of what broke.

// batari Basic's playfield is 32 columns, each 4 pixels wide, so it spans 128 of
// the screen's 160 pixels (it starts at sprite X 17, which is why the sprite to
// playfield column conversions use (x - 17) / 4), regardless of pfres/Superchip
// - exact, no project config needed. Measured on the emulator: a full-width
// background is 128 pixels wide. This used to be 5 (160 / 32), which made the
// Background editor's canvas too wide for its height.
export const PF_COLUMN_WIDTH_PX = 4;

// The PXE kernel can run a playfield of 40 columns (see pfWidthOf in utils/pxe.js) that starts at the left edge of the screen, 16 pixels (4 columns)
// before the 32 column one does: a sprite's column is 16 pixels more, and the last column is 39.
export const pfColumnBias = (config) => (pfIsWide(config) ? 16 : 0);
export const pfMaxColumn = (config) => pfWidthOf(config) - 1;
// The text of a sprite x less the offset the playfield starts at (see the offsets below), allowing for the bias: (x - n) or (x + n).
// A playfield of 64 or 120 columns scrolls sideways (PF_HOR_SCROLL_LO and HI, 16 bits of pixels): the map column under a screen pixel is the scroll plus
// the pixel, over 4. The scroll's whole columns are added after the division, its extra pixels (0 to 3) before it.
const pfScrolls = (config) => pfMaxScrollOf(config) > 0;
export const pfScrollFraction = (config) => (pfScrolls(config) ? ' + (PF_HOR_SCROLL_LO & 3)' : '');
export const pfScrollColumns = (config) => (pfScrolls(config) ? ' + (PF_HOR_SCROLL_LO / 4) + (PF_HOR_SCROLL_HI * 64)' : '');
export const pfColumnText = (x, offset, config) => {
  const n = offset - pfColumnBias(config);
  return n >= 0 ? `(${x} - ${n}${pfScrollFraction(config)})` : `(${x} + ${-n}${pfScrollFraction(config)})`;
};
// The map column under a sprite's x: what the text above gives over 4, and the scroll's columns.
export const pfColumnOf = (x, offset, config) => `${pfColumnText(x, offset, config)} / 4${pfScrollColumns(config)}`;

// A player's x is one more than the screen pixel its left edge sits on (the
// playfield's first column starts at x 17), but a missile or the ball sits one
// pixel further left for the same x - the TIA starts drawing a missile or the
// ball one color clock earlier than a player - so its left edge is at pixel x - 2
// and its playfield column is (x - 18) / 4. Measured on the emulator: a 1 pixel
// wide ball at ballx 100 is drawn in screen column 98.
export const PLAYER_PF_X_OFFSET = 17;
export const MISSILE_BALL_PF_X_OFFSET = 18;
// Under DPC+ a player is drawn one pixel further right for the same x (measured on the emulator with the same sprite on both kernels:
// its left edge is at pixel 76 for player0x 80, against 75 on the standard kernel), so its playfield column is (x - 16) / 4.
export const playerPfXOffset = (config) => (config && config.kernel === 'dpcplus' ? PLAYER_PF_X_OFFSET - 1 : PLAYER_PF_X_OFFSET);
// Under DPC+ the ball and the missiles sit at other columns than on the standard kernel. Measured with the hardware collision flag of a one pixel
// object swept across a single lit playfield cell (column c): the ball touches it for ballx 17 + 4 * c to 20 + 4 * c (a ball w pixels wide from
// w - 1 less), so its playfield column is (x - 17) / 4; a missile for missile0x 14 + 4 * c to 17 + 4 * c, so (x - 14) / 4. (Their first pixel is
// the same for any width. Rows: the ball covers lines y and below, a missile lines y + 1 and below.)
// The PXE kernel draws them at the same pixels for the same x (measured 2026-11-10: a ball at ballx 40 and missile1 at 120 are drawn at pixels 39 and 119 on
// both, on a playfield that starts at pixel 16 on both), so it has the same numbers. It had 20 for both before, the DPC+ number before DPC+ was measured
// again: a ball going up a gap one column wide in Bricks was stopped by Check playfield in the column beside it, and never touched a lit pixel.
export const missileBallPfXOffset = (config, name = 'ball') => {
  if (!config || config.kernel !== 'dpcplus') return MISSILE_BALL_PF_X_OFFSET;
  return /^missile/.test(name) ? 14 : 17;
};

// Row height in scanlines - matches std_kernel.asm/startup.asm's
// default row height calculation ("lda #(96/pfres)"), confirmed against
// that same 96-scanline-tall half-screen constant. Divides by the TRUE
// pfres the kernel itself uses, NOT effectiveBackgroundRows() directly -
// those only agree once Superchip's  pfres is active (effectiveBackgroundRows
// returns cfg.pfres verbatim there). The non-Superchip default is different:
// batari Basic's  IMPLICIT pfres there is 12 (11 VISIBLE rows + 1 hidden
// scroll row - see DEFAULT_BACKGROUND_ROWS's  comment in blocks/
// background.js), but effectiveBackgroundRows deliberately returns just the
// visible 11. Dividing 96 by that visible-only 11 gave 9, not the real
// kernel's  96/12 = 8 - confirmed wrong directly against the reference
// docs'  worked numbers (player0y's documented 1-88 usable range implies
// 11 rows * 8 scanlines = 88, not 11 * 9 = 99), a real reported bug in the
// sprite<->playfield Y conversion blocks (generators/bbasic/background.js).
export const pfRowDivisorFor = (config) => {
  const cfg = config || {};
  // DPC+ has a separate number of rows and row height (see dpcPlusRowLinesFor), in lines instead of two-line steps.
  if (cfg.kernel === 'dpcplus') return dpcPlusRowLinesFor(cfg) / 2;
  // A manual "pfrowheight" override (see Configuration.vue's "Override
  // playfield row height" switch + field for it) takes priority over the
  // automatic floor(96/pfres) calculation below - matches the kernel's
  // precedence exactly (std_kernel.asm/std_kernel_vertical_reflect.asm both
  // check "ifconst pfrowheight" before ever falling back to computing it
  // from pfres - see generateConfiguration's  comment on
  // pfRowHeightConfigurationCode in generators/bbasic.js). Gated on
  // enablePfRowHeight the same way that const's  emission is - the
  // switch being off means the field's  stored number is never actually
  // applied, so this has to ignore it too, or these coordinate blocks would
  // disagree with what the kernel itself is really doing.
  if (cfg.enablePfRowHeight && cfg.pfrowheight) return Math.round(Number(cfg.pfrowheight));
  const pfres = superchipOn(cfg) ? effectiveBackgroundRows(config) : 12;
  // The kernel computes "lda #(96/pfres)" in DASM, which is integer division
  // (the fraction is dropped), so this has to round down too: with pfres 11 a
  // row is 8 two-scanline steps tall (96 / 11 = 8.7), not 9. Measured on the
  // emulator for pfres 2-14 with Superchip on - the wall heights only fit
  // floor(96 / pfres), never round(96 / pfres), for the values that do not
  // divide 96 evenly (5, 7, 9, 10, 11, 13, 14...).
  return Math.floor(96 / pfres);
};

// The height of a playfield row in scanlines under DPC+, which has no pfres: the same as the standard
// kernel gives it with the project's standard-kernel settings (pfres with Superchip RAM, 12 rows without, or the
// row height override), so a project looks the same on either kernel. The Superchip switch is kept aside while
// DPC+ is selected (see Configuration.vue), where the real one is off.
// pfres: the rows of one background that sets a pfres (see backgroundPfresOf); the row height override of the project
// does not apply to it.
export const dpcPlusRowLinesFor = (config, pfres) => {
  const cfg = config || {};
  if (pfres === undefined && cfg.enablePfRowHeight && cfg.pfrowheight) return Math.max(1, Math.min(255, 2 * Math.round(Number(cfg.pfrowheight))));
  // Any number of rows from 1 to 192: the coprocessor steps through the rows by a fraction (DFxFRACINC), so a row
  // does not have to be a whole number of lines.
  return Math.max(1, Math.min(255, Math.round(1000 * 192 / (pfres || dpcPlusPfresOf(cfg))) / 1000));
};

// How many bytes of Superchip RAM's  read/write pool (r000-r127/w000-
// w127 - a completely separate 128-byte region from the "48 bytes freed
// from the old RAM playfield" pool generateSystemDims/SUPERCHIP_VAR_START
// already use, see their  comments in generators/bbasic.js) are NOT
// already claimed by the current background's  per-row playfield data.
// Per the real batari Basic reference documentation: that data always
// costs 4 x pfres bytes, counted down from the top (r/w127 backward), so
// whatever's left starting from r/w000 is free - confirmed directly
// against the reference docs'  worked example (pfres=12, the default,
// leaves 128-48=80 free bytes, r/w000-r/w079). Zero once pfres reaches 32
// (4*32=128, the whole chip), and zero whenever Superchip itself is off,
// since this pool doesn't exist at all without it.
export const superchipRwFreeCount = (config) => {
  const cfg = config || {};
  if (!superchipOn(cfg)) return 0;
  return Math.max(0, 128 - 4 * effectiveBackgroundRows(config));
};

// The height in lines of the rows of this background under DPC+: the pfres it sets, when it sets one (see backgroundPfresOf), else the
// project's.
export const backgroundRowLinesFor = (background, config) =>
  (config && config.kernel === 'dpcplus' && (Math.round(Number(background && background.pfres)) > 0 || (background && Array.isArray(background.groupPfres)))) ?
    dpcPlusRowLinesFor(config, backgroundPfresOf(background, config)) : dpcPlusRowLinesFor(config);
