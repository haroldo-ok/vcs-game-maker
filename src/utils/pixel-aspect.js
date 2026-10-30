'use strict';

// The proportions of the emulator's picture, which the graphics of the editors follow (public/index.html sizes the emulator's canvas with the
// same numbers): a pixel of an NTSC picture is 0.91 as wide as it is tall, and a TIA color clock is two such pixels wide, so on the emulator's
// screen a color clock (one pixel of a player, a playfield column's quarter, a score digit pixel) is 1.82 times as wide as a scanline is tall.
export const NTSC_PIXEL_ASPECT = 0.91;
export const CLOCK_ASPECT = 2 * NTSC_PIXEL_ASPECT;
// The same, for a row that is two scanlines tall (the rows of a player, of the playfield and of a title screen graphic with two lines).
export const CLOCK_ASPECT_PER_LINE_PAIR = CLOCK_ASPECT / 2;
