'use strict';

import * as Blockly from 'blockly/core';

import {useBackgroundsStorage, useConfigurationStorage} from '../hooks/project';
import {playfieldToMatrix} from '../utils/pixels';
import {BACKGROUND_ICON, COLOR_ICON, CHECKBOX_CHECKED_ICON, CHECKBOX_CLEAR_ICON, FLIP_ICON, BACKGROUND_PFSCROLL_LEFT_ICON, BACKGROUND_PFSCROLL_RIGHT_ICON, BACKGROUND_PFSCROLL_UP_ICON, BACKGROUND_PFSCROLL_DOWN_ICON, BACKGROUND_PFSCROLL_DOWN2X_ICON, BACKGROUND_PFSCROLL_UP2X_ICON, PLAYER_ICON, MISSILE_ICON, BALL_ICON} from './icon';

const BACKGROUND_COLOR = '#ffa500';

// background_fade_to (see generators/bbasic/background.js) is a fire-and-
// forget TRIGGER, not a "call every frame yourself" block - it writes its
// target/pace once, and a per-frame check spliced into commongamelogic (see
// generateBackgroundFadeChecks) does the actual stepping from then on,
// exactly like sound effect fades (generateEnvelopeChecks in generators/
// bbasic/soundfx.js) and music event watches (generateMusicChecks) already
// do. This matters because a fade triggered from inside an "if" block (e.g.
// "if joystick fire") only has its trigger code re-run while that
// condition holds - a single brief tap wouldn't re-enter it on later
// frames, so an earlier "advance one step per call" design silently stalled
// after one step once nested that way (confirmed as a real bug: the fade
// only ever completed when its trigger sat unconditionally at the main
// loop's top level, re-running it every frame by construction).
//
// FADE_STEPS is fixed at 4, not user-choosable - see its  comment below
// for why.
//
// One set of dev vars per target register (COLUBK/COLUPF), only reserved
// when a fade block actually targets that register:
//  - backgroundFadeTimerVarName: frames remaining until the next brightness
//    step, reloaded from backgroundFadePaceVarName each time it fires.
//  - backgroundFadePaceVarName: the reload value itself (frames requested /
//    FADE_STEPS) - stored rather than recomputed each frame, since it
//    depends on the FRAMES input, which can be an arbitrary runtime
//    expression, not just a compile-time constant.
//  - backgroundFadeTargetVarName: the full target color byte (hue in bits
//    7-4, target brightness in bits 3-1) - stored rather than reading the
//    trigger block's  VALUE input again later, since the check runs from
//    a single shared function with no block of its  to read an input
//    from.
// backgroundFadeIncrementVarName isn't needed either, for the same reason
// FADE_STEPS is fixed: with only one possible step count project-wide,
// every fade on a given register shares the exact same brightness
// increment, so it can be baked into generateBackgroundFadeChecks as a
// literal instead of costing its  dev var.
// The brightness itself isn't tracked in its  dev var at all - it's read
// fresh from the live shadow color variable (backgroundrealcolor/
// playfieldrealcolor) every check instead, specifically to avoid a real bug
// an earlier version of this had: a separate brightness tracker defaulting
// to 0 made a "fade down"-only block snap straight to black on its very
// first call, regardless of whatever color was actually on screen.
// Generalized past just COLUBK/COLUPF - scorecolor (score.js's
// score_fade_to) and TextColor (text-minikernel.js's
// text_minikernel_fade_to) share this exact same stepping mechanism, since
// they're ordinary Atari color bytes with the identical hue/brightness
// nibble layout. Unlike COLUBK/COLUPF, neither needs a separate "shadow"
// variable (see generateBackgroundFadeChecks'  targetShadowVar comment in
// generators/bbasic/background.js) - nothing else overwrites scorecolor or
// TextColor every frame the way the score/text drawing routines overwrite
// COLUBK/COLUPF, so the real variable itself doubles as its  shadow.
// player0realcolor/player1realcolor (sprites.js's  sprite_player_fade_to)
// share this same mechanism too, feeding COLUP0/COLUP1 - see
// generateBackgroundFadeChecks'  isShadowedRegister check for why these
// two DO need nameDB_ resolution (like COLUBK/COLUPF), unlike scorecolor/
// TextColor. Fading either one also fades that player's  missile
// (missile0/missile1) for free: real 2600 hardware has no separate missile
// color register at all - missile0 always draws in COLUP0, missile1 in
// COLUP1, the exact same registers Player 0/1's  color already lives in.
const FADE_TAG_BY_VAR = {
  COLUBK: 'bg', COLUPF: 'pf', scorecolor: 'score', TextColor: 'text',
  player0realcolor: 'p0', player1realcolor: 'p1',
};
const fadeTag = (rawVar) => FADE_TAG_BY_VAR[rawVar] || rawVar;
export const backgroundFadeTimerVarName = (rawVar) => `${fadeTag(rawVar)}FadeTimer`;
export const backgroundFadePaceVarName = (rawVar) => `${fadeTag(rawVar)}FadePace`;
export const backgroundFadeTargetVarName = (rawVar) => `${fadeTag(rawVar)}FadeTarget`;

// State of "Fade playfield rows from color to playfield colors" (see that
// block): Step 0-4 is which prebuilt row-color table is showing (255 = idle),
// Timer/Pace count the frames per step, Start picks which fade-from color's
// tables are used, Bg is the background currently loaded.
export const backgroundRowFadeVarName = (part) => `bgRowFade${part}`;
// The state of the multicolor fade of each kind of row colors: 'pf' (the playfield's, which also holds the fade of rows from a
// color) and 'bk' (the background's, DPC+).
export const multicolorFadeVarName = (kind, part) => kind === 'bk' ? `bgBkFade${part}` : backgroundRowFadeVarName(part);
export const ROW_FADE_IDLE_STEP = 255;
// The fade-from color has to be a plain color picker block (a constant), since
// every step's row colors are built into the ROM ahead of time.
export const rowFadeStartColor = (block) => {
  const target = block.getInputTargetBlock('VALUE');
  return target && target.type === 'color_get' ? (parseInt(target.getFieldValue('COLOR')) || 0) & 0xFE : 0;
};

// Fixed at 4 (not a user-choosable STEPS dropdown, as an earlier version of
// this had) specifically because 4 is a power of 2: "frames / 4" always
// compiles to a cheap bit-shift, never the real "jsr div8" subroutine call
// a non-power-of-2 divisor (3, 5, 6, 7) needs (see generateDivMul's
// comment in generators/bbasic.js). That call is only safe from wherever
// div_mul.asm itself got inlined (always bank 1) - fine from
// generateBackgroundFadeChecks (always in commongamelogic, never
// relocated), but NOT fine from this block's  trigger, which lives
// wherever the user's  blocks place it, potentially a relocated event
// bank in a larger project. Confirmed as a real bug: a large enough
// project to relocate an event crashed (a stray audio tone, i.e. a
// runaway program counter) specifically whenever a non-power-of-2 STEPS
// was chosen. 4 is also the highest step count that's actually distinct
// from lower ones on this hardware (see FADE_STEPS's  increment-math
// comment in generators/bbasic/background.js) - 5, 6, and 7 all produced
// the exact same result as 4 anyway, so fixing it there costs nothing.
export const FADE_STEPS = 4;

// One shared byte covers both the "fade finished" watch flags AND the "fade
// currently active" flags for up to four fadeable registers at once - 8 bits
// total (up to 4 registers x 1 for "finished", plus up to 4 registers x 1
// for "active"), filling a byte exactly, so fixed bits are simpler than the
// Music tab's  pooled/overflow allocation (built for open-ended,
// user-defined watch counts) and never need more logic than a second byte
// once a 5th+ register needs the same machinery. COLUBK/COLUPF/scorecolor/
// TextColor fill the first byte exactly; player0realcolor/player1realcolor
// (sprites.js's  sprite_player_fade_to) get their  second byte
// (FADE_FLAGS_BYTE_BY_VAR/FADE_FLAGS_REGISTER_GROUPS below), since the first
// one has no bits left to spare.
// "Finished" fires regardless of which way the fade was moving (brightening
// or dimming) - background_fade_finished used to have its  DIRECTION
// dropdown splitting this by direction, but that meant a project reacting
// to "this fade is done" regardless of which way it happened to go needed
// two near-identical watch blocks wired to the same DO stack; removed in
// favor of one flag per register that fires on either direction's
// completion. The "active" bits are what the per-frame check
// (generateBackgroundFadeChecks) reads to know whether a register has an
// in-progress fade to keep stepping at all - set once by the matching
// trigger block's  code (background_fade_to/score_fade_to/
// text_minikernel_fade_to/sprite_player_fade_to), cleared once the check
// steps the color onto its exact target.
const FADE_FLAGS_BYTE_BY_VAR = {
  COLUBK: 1, COLUPF: 1, scorecolor: 1, TextColor: 1,
  player0realcolor: 2, player1realcolor: 2,
};
export const fadeFlagsVarName = (rawVar) => FADE_FLAGS_BYTE_BY_VAR[rawVar] === 2 ? 'fadeFlags2' : 'fadeFlags';
// Which registers share each of fadeFlagsVarName's  two possible bytes -
// read by bbasic.js's  init() to decide which byte(s) actually need
// reserving for a given project (a project fading only Player colors never
// pays for the Background/Score/Text byte, and vice versa).
export const FADE_FLAGS_REGISTER_GROUPS = [
  ['COLUBK', 'COLUPF', 'scorecolor', 'TextColor'],
  ['player0realcolor', 'player1realcolor'],
];
// Scratch storage for background_get_pixel's  X/Y, ONLY when a non-bare
// expression (e.g. "xCycle - 1") is plugged into one of its sockets (see
// generators/bbasic/background.js) - pfread()'s  arguments can't contain
// an operator, so an expression has to be computed somewhere before it's
// passed in. temp1/temp2 look like the obvious scratch spot (used exactly
// that way everywhere else in this codebase), but are NOT safe here: bB's
// "function" feature passes its arguments through temp1-temp6 directly
// (see generators/bbasic/function.js's  comment) with no other stack or
// register file, so a background_get_pixel block used inside a function
// body could be silently overwriting that function's  live parameter(s)
// out from under it the moment this runs - confirmed directly as a real
// bug (a project's  custom function calling this went from "won't
// compile" to "resets the console the moment it runs" once temp1/temp2
// were reused this way). Two dedicated dev vars sidestep that entirely,
// at the cost of reserving them (see reserveMusicDevVars's  sibling in
// bbasic.js) only for a project that actually uses this block at all.
export const backgroundGetPixelXVarName = () => 'bgGetPixelX';
export const backgroundGetPixelYVarName = () => 'bgGetPixelY';
// background_collision_pixel's  result vars (see generators/bbasic/
// background.js) - same reserveDevVarRW/pfread()-argument-safety reasoning
// as backgroundGetPixelXVarName/YVarName above, just always used (this
// block never has a cheaper temp1-temp6 fallback path to begin with, so
// there's no "only when nested in a function" condition to gate on).
// The one variable "Playfield area ... is clear" needs: the left column its scan restarts from on every row.
export const areaClearLeftVarName = () => 'areaClearLeft';
export const collisionPixelColumnVarName = () => 'collisionPixelColumn';
export const collisionPixelRowVarName = () => 'collisionPixelRow';
// Pure internal scratch for the "nudged by one cell" candidates the
// generator checks alongside the exact column/row before committing a
// final result into the two vars above - never read back by any getter
// block, but still needs a real reserved var (not temp1-temp6, same
// reasoning as the pair above) since it's a bare pfread() argument too.
export const collisionPixelNudgedColumnVarName = () => 'collisionPixelColumn2';
export const collisionPixelNudgedRowVarName = () => 'collisionPixelRow2';
// Bits 0-3: one "finished" bit per fadeable register (fires on either fade
// direction's  completion - see fadeFlagsVarName's
// comment). Bits 4-7: the matching "active" bit for that same register
// (FADE_ACTIVE_BIT_BY_VAR below) - always exactly 4 apart from its
// "finished" bit, which is what backgroundFadeFinishedBit derives from
// rather than keeping a second, parallel map in sync by hand. Player0/
// player1 reuse the exact same 0-3/4-7 layout, just within their byte
// (fadeFlagsVarName('player0realcolor') !== fadeFlagsVarName('COLUBK')) -
// bit numbers can safely repeat across the two bytes.
const FADE_ACTIVE_BIT_BY_VAR = {
  COLUBK: 4, COLUPF: 5, scorecolor: 6, TextColor: 7,
  player0realcolor: 4, player1realcolor: 5,
};
export const fadeActiveBit = (rawVar) => FADE_ACTIVE_BIT_BY_VAR[rawVar];
export const backgroundFadeFinishedBit = (rawVar) => FADE_ACTIVE_BIT_BY_VAR[rawVar] - 4;

// Every register some "finished fading" watch block in the project actually
// watches - background_fade_finished (Background/Playfield), score_fade_
// finished (Score), or text_minikernel_fade_finished (Text) - all three
// work identically, just targeting a different register, and all three
// share this exact same resolution/bit/flag machinery. A plain Set, since
// there are only 4 possible registers and each is either watched or not (no
// dedup/index-assignment step needed the way the Music tab's  open-ended
// watches require). Read by both the matching trigger block's  per-frame
// check (to decide whether to bother setting a bit nothing is watching) and
// the watch block itself (to know which bit to check-and-clear) - see
// resolveVar's  callers in generators/bbasic/background.js.
export const backgroundFadeWatchKey = (rawVar) => rawVar;
// score_fade_finished/text_minikernel_fade_finished have no VAR dropdown
// (same reasoning as score_fade_to/text_minikernel_fade_to - see
// their  comments: there's only one possible score/text color register,
// so offering a choice would be pointless) - only background_fade_finished/
// sprite_player_fade_finished (Player 0/Player 1) actually read one.
const FADE_FINISHED_RAW_VAR_BY_TYPE = {
  background_fade_finished: (block) => block.getFieldValue('VAR'),
  score_fade_finished: () => 'scorecolor',
  text_minikernel_fade_finished: () => 'TextColor',
  sprite_player_fade_finished: (block) => block.getFieldValue('VAR'),
};
export const resolveBackgroundFadeFinishedWatches = (workspace) => {
  const watched = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    const rawVarFor = FADE_FINISHED_RAW_VAR_BY_TYPE[block.type];
    if (!rawVarFor) return;
    watched.add(backgroundFadeWatchKey(rawVarFor(block)));
  });
  return watched;
};

// Which backgrounds the project can ever switch to - read by generateBackgrounds
// (generators/bbasic.js) to leave a background nothing selects out of the ROM.
// A Set of background IDs, or null meaning "can't tell, keep every background":
// the Background select blocks name a background directly, but a background set
// from an arbitrary expression (a variable, a Data table lookup...) could be any
// of them. ID 1 is always included: the game starts on it (see bbasic.bb.hbs).
export const resolveUsedBackgroundIds = (workspace) => {
  const used = new Set([1]);
  let unsafe = false;
  workspace.getAllBlocks(false).forEach((block) => {
    // Blocks inside a disabled block (an event, an if...) are never generated either.
    if (!block.isEnabled() || block.getInheritedDisabled()) return;
    if (block.type === 'background_set_select') {
      const id = Number(block.getFieldValue('VAR'));
      if (Number.isInteger(id)) used.add(id);
      else unsafe = true;
    } else if (block.type === 'background_set') {
      const value = block.getInputTargetBlock('VALUE');
      let id = NaN;
      if (value && value.type === 'background_select') id = Number(value.getFieldValue('VAR'));
      else if (value && value.type === 'math_number') id = Number(value.getFieldValue('NUM'));
      if (Number.isInteger(id)) used.add(id);
      else unsafe = true;
    }
  });
  return unsafe ? null : used;
};

// Every register some "is this fade active" block (background_fade_active
// OR sprite_player_fade_active) actually reads - either block reads
// fadeFlagsVarName's  active bit directly (see their generators in
// generators/bbasic/background.js and generators/bbasic/sprites.js), so
// whichever byte a given register lives in needs to be reserved even in the
// (unusual, but valid) case of a project checking "is this fade active" on
// a register that has no matching fade_to block - the check just
// always reads false then, same as a fade that was never triggered. Returns
// a Set of raw var names (not a plain boolean) so bbasic.js's  init() can
// tell which of fadeFlagsVarName's  two possible bytes each one needs.
const FADE_ACTIVE_CHECK_RAW_VAR_BY_TYPE = {
  background_fade_active: (block) => block.getFieldValue('VAR'),
  sprite_player_fade_active: (block) => block.getFieldValue('VAR'),
};
export const hasBackgroundFadeActiveChecks = (workspace) => {
  const found = new Set();
  workspace.getAllBlocks(false).forEach((block) => {
    const rawVarFor = FADE_ACTIVE_CHECK_RAW_VAR_BY_TYPE[block.type];
    if (rawVarFor) found.add(rawVarFor(block));
  });
  return found;
};

// Default color byte for a playfield row when per-row colors (pfcolors) are
// enabled: $0E, the same light grey the playfield uses by default, so switching
// the feature on doesn't visibly change an untouched background.
export const DEFAULT_ROW_COLOR = 0x0E;

// Resets an existing rowColors array back to DEFAULT_ROW_COLOR, one entry
// per row - shared by every tab's "clear colors" handler (Background,
// Sprites, Title screen) so they don't each redeclare the same map().
export const clearRowColors = (rowColors) => (rowColors || []).map(() => DEFAULT_ROW_COLOR);

// Row count used when Superchip RAM's higher-resolution playfield (pfres) is
// not enabled. This is the app's  established default, one row short of
// standard batari Basic's implicit pfres=12 (11 visible + 1 hidden scroll
// row); kept as-is so existing projects don't change shape.
export const DEFAULT_BACKGROUND_ROWS = 11;

// The editable/visible row count for the current configuration. Confirmed
// against a known-working reference program (compiled and run in the
// emulator) that pfres rows of playfield: data - not pfres-1 - render
// correctly, so the Superchip case uses pfres directly.
// The number of playfield rows on screen under DPC+, which has no Superchip RAM to set it with; it uses the DPC+
// setting, or, for a project that never set it, what the standard kernel it came from had.
export const dpcPlusPfresOf = (config) => {
  const cfg = config || {};
  if (Number(cfg.dpcPlusPfres) > 0) return Math.round(Number(cfg.dpcPlusPfres));
  // A project that never set it follows the standard kernel's settings it came from.
  const superchip = cfg.enableSuperchipStandard !== undefined ? cfg.enableSuperchipStandard : cfg.enableSuperchip;
  return superchip ? Math.max(1, Number(cfg.pfres) || 12) : 12;
};

// DPC+: a background can have its pfres set in the Background editor, the number of rows on screen; one that does not
// keeps the project's.
export const backgroundPfresOf = (background, config) => {
  const rows = Math.round(Number(background && background.pfres));
  if (config && config.kernel === 'dpcplus' && rows > 0) return Math.min(192, rows);
  return dpcPlusPfresOf(config);
};

export const effectiveBackgroundRows = (config) => {
  const cfg = config || {};
  // DPC+ sets a number of playfield rows (the one extra row below the screen is counted in
  // backgroundDataRows, like without Superchip).
  if (cfg.kernel === 'dpcplus') return Math.max(1, dpcPlusPfresOf(cfg) - 1);
  return cfg.enableSuperchip ? Math.max(1, Number(cfg.pfres) || DEFAULT_BACKGROUND_ROWS) :
    DEFAULT_BACKGROUND_ROWS;
};

// How many rows of playfield data a background holds: the visible rows plus,
// without Superchip RAM, the one extra row the standard kernel's playfield
// keeps below the 11 you can see (its implicit pfres is 12). It scrolls into
// view with pfscroll. With Superchip, pfres already counts that row.
export const backgroundDataRows = (config) =>
  effectiveBackgroundRows(config) + ((config && config.enableSuperchip) ? 0 : 1);

// Pads every background's pixel matrix (and per-row colors, if set) up to
// targetRows. Used when the global playfield resolution (pfres) changes, since
// that setting reshapes every non-custom-height background's playfield RAM
// layout at once. Rows are never removed: a background with more rows than
// targetRows keeps them, and the extra rows become rows that scroll into view
// (see backgroundsWithOverflowRows), so lowering pfres cannot crop a scrolling
// background. A background the user has explicitly resized (via the pixel
// editor's "Set height" tool on the Background tab - see BackgroundEditor.vue's
// resize handler, which sets customHeight) is skipped entirely: it's meant to
// be taller than one screen's worth of rows on purpose (e.g. to hold extra rows
// a vertical scroll block will pan through later).
export const reflowBackgroundsToHeight = (backgroundsStorage, targetRows) => {
  const data = processBackgroundStorageDefaults(backgroundsStorage);
  const reflowRows = (rows, emptyRow) => {
    const next = rows.slice();
    while (next.length < targetRows) next.push(emptyRow());
    return next;
  };

  const backgrounds = data.backgrounds.map((background) => {
    if (background.customHeight) return background;
    if (background.pixels.length >= targetRows) return background;
    const width = background.pixels[0] ? background.pixels[0].length : 32;
    return {
      ...background,
      pixels: reflowRows(background.pixels, () => new Array(width).fill(0)),
      rowColors: background.rowColors ?
        reflowRows(background.rowColors, () => DEFAULT_ROW_COLOR) : background.rowColors,
    };
  });

  backgroundsStorage.value = {...data, backgrounds};
};

// Vertical scroll position tracking for background_scroll/background_
// scroll_position (see generators/bbasic.js's generateBackgrounds and
// generators/bbasic/background.js's background_scroll generator). Real bB
// pfscroll has no idea how tall a background's underlying data actually
// is - confirmed directly against public/bb19/includes/pf_scrolling.asm, it
// only ever ROTATES a fixed-size window of exactly pfres rows of live
// playfield RAM (12 if pfres isn't set) - rows beyond that have no RAM
// reserved for them at all and are never read by it. This app tracks the
// CURRENT background's vertical offset itself, in a dev var reset to 0 and
// recomputed to that background's max scroll distance every time
// newbackground changes (see generateBackgrounds), so a scroll block can
// tell whether it's already at the top/bottom of THIS background's real
// row count before calling pfscroll, and a "read scroll position" getter
// always reflects where the currently-shown background actually is. For a
// background taller than pfres (customHeight), this same tracked row also
// drives overwriting the one stale row of the live RAM window on every
// completed row-step (see the comment on backgroundScrollPacking below, and
// generateBackgroundScrollPatch in generators/bbasic.js) - pfscroll's
// rotate alone would otherwise just keep cycling the same rows forever.
// Horizontal (left/right) scrolling has no equivalent, since the standard
// kernel has a hard 32-column playfield width ceiling - there's no way for
// a background to be wider than what's already on screen, so there's no
// "edge" a horizontal scroll could ever reach.
export const backgroundScrollRowVarName = () => 'backgroundScrollRow';
export const backgroundScrollRowMaxVarName = () => 'backgroundScrollRowMax';

// Real pfscroll rotates the live playfield window in place - each completed
// row-step leaves exactly ONE row's worth of stale data behind, at the
// window's BOTTOM edge for the pfscroll direction that advances the
// background and at its TOP edge for the other (byte-level trace of
// public/bb19/includes/pf_scrolling.asm, and std_kernel.asm reads slot 0 as
// screen row 0). generateBackgroundScrollPatch's shared subroutine overwrites
// just that one row's 4 bytes from the active background's table.
//
// When any background overflows the window, that whole feature runs on ONE
// reserved variable (backgroundScrollRowVarName, packed - see
// backgroundScrollPacking) plus bB's scratch variables:
//  - temp5 = what the shared subroutine should do: a window slot to
//    overwrite (0 .. visibleRows-1), 255 = load the whole first window (once,
//    at background-switch time), or 254 = just return the active background's
//    furthest scroll row (its row count minus the visible rows) in temp6,
//    looked up from ROM instead of kept in RAM.
//  - temp3 = the absolute row of the full background (0-based) to copy into
//    that slot.
// Those are only live between a scroll block setting them and its gosub in
// the same frame (nothing in between touches temp3-temp6; the bankswitch
// trampoline only uses temp7), so they need no reserved storage at all.
// Writing only the one stale row instead of the whole window is ~25x less
// work per row-step, which matters on Superchip RAM (slow, separate
// read/write windows).

// backgroundScrollRowVarName holds TWO fields in overflow mode: the window's
// top row in the low rowBits bits and the active background's index (which
// background's table to read) in the remaining high bits - the index is set
// once when a background is switched in and the row only ever changes by
// whole row-steps, so one byte carries both. rowBits is sized to the tallest
// background in the project (at most 64 rows, the data-table ceiling, = 6
// bits), which leaves room for 2^(8-rowBits) backgrounds (4 at 33-64 rows, 8
// at 17-32, ...). A project with more backgrounds than that simply doesn't
// pack: the row variable then holds the whole byte (rowMask 255, no index
// bits) and the index lives in a separate variable,
// backgroundScrollActiveVarName, instead - one extra byte only for projects
// that need it, never a cap on how many backgrounds can scroll.
export const backgroundScrollPacking = (backgrounds) => {
  const rowCounts = (backgrounds || []).map(({pixels}) => (pixels ? pixels.length : 0));
  const maxRows = Math.max(2, ...rowCounts);
  const rowBits = Math.min(7, Math.ceil(Math.log2(maxRows)));
  const packed = (backgrounds || []).length <= (1 << (8 - rowBits));
  if (!packed) {
    return {packed, rowBits: 8, rowMask: 255, indexMask: 0, indexStep: 0};
  }
  return {
    packed,
    rowBits,
    rowMask: (1 << rowBits) - 1,
    indexMask: 255 - ((1 << rowBits) - 1),
    indexStep: 1 << rowBits,
  };
};

// One byte of edge flags for background_scroll_edge_reached watches: bit 0 =
// the top was just reached, bit 1 = the bottom was. background_scroll sets a
// bit when a row-step lands on that edge; the watch block clears it as it runs.
export const backgroundScrollEdgeFlagsVarName = () => 'backgroundScrollEdgeFlags';
export const BACKGROUND_SCROLL_EDGE_BITS = {top: 0, bottom: 1};

// A requested starting row (+1, so 0 means "none") from background_scroll_set_row,
// waiting for the next background load to apply it - see that block's
// generator and the full-load mode of the bgscrollpatch routine. Only reserved
// for a project with a background taller than the visible window.
export const backgroundScrollStartVarName = () => 'backgroundScrollStart';

// Holds the active background's index only for a project too big to pack it
// into backgroundScrollRowVarName's high bits - see backgroundScrollPacking.
export const backgroundScrollActiveVarName = () => 'backgroundScrollActive';

// Real batari Basic pfscroll up/down moves by ONE SCANLINE per call, not
// one logical playfield row (confirmed directly against
// public/bb19/includes/pf_scrolling.asm: it accumulates into the kernel's
// "playfieldpos" every call, only actually rotating a row once that
// reaches pfRowDivisorFor(config)'s row height, then resets) - a real
// reported bug otherwise, since backgroundScrollRowVarName used to
// increment once per CALL regardless, making "stop at edge" trigger
// roughly pfRowDivisorFor-times too early (confirmed against the
// background_scroll generator in generators/bbasic/background.js, which
// used to treat every call as a full row). This dev var is background_
// scroll's parallel scanline accumulator - not a read of the kernel's
// real sub-row counter (ambiguous to read back - see that generator's
// comment) - incremented by the same 1 (single) or 2 (2x) scanlines
// pfscroll itself steps by, reset the same way, so backgroundScrollRow
// only ever advances once a real row has genuinely completed.
//
// Only used for a background that does NOT overflow the live window - once
// any background in the project does, background_scroll detects a completed
// row-step by reading the kernel's "playfieldpos" right after the pfscroll
// call instead (pfscroll resets it to a known value exactly when it wraps),
// so this shadow accumulator is no longer needed there.
export const backgroundScrollSubRowVarName = () => 'backgroundScrollSubRow';

// Every background whose row count overflows the live playfield RAM
// window (pixels.length > visibleRows) - these are the only ones
// generateBackgrounds needs to cap its literal "playfield:" block for (see
// that function's comment - the uncapped rows have no RAM reserved for them
// at all and would otherwise overwrite whatever happens to sit right after
// the playfield RAM window at boot/background-switch time, a real silent
// memory-corruption risk confirmed directly against 2600basic.h's
// playfield/pfwidth addressing). Also used as the project-wide switch
// deciding whether background_scroll needs the packed-row patching at all
// (see backgroundScrollPacking's comment) - once ANY background overflows,
// generateBackgroundScrollPatch builds a table for EVERY background in the
// project (not just the overflowing ones), so the shared routine has
// something to read from no matter which background happens to be active
// when a scroll block runs.
export const backgroundsWithOverflowRows = (backgrounds, visibleRows) =>
  (backgrounds || []).filter(({pixels}) => pixels && pixels.length > visibleRows);

// Shared by generators/bbasic.js's generateBackgroundScrollPatch (which
// registers the body under this name into Blockly.BBasic.subroutines, so it
// rides the same bank-relocation machinery as a user-defined subroutine - see
// getSubroutineBank - instead of being permanently stuck in bank 1) and
// generators/bbasic/background.js's background_scroll generator (which needs
// the same name to resolve its gosub's bank-jump suffix via that same
// getSubroutineBank call).
export const BACKGROUND_SCROLL_PATCH_SUBROUTINE_NAME = 'bgscrollpatch';

// "Playfield scroll" with "scroll playfield colors" checked: the row colors
// scroll along with the pixels. The kernel reads each row's color through a
// pointer (pfcolortable) into a ROM table with one entry every 4 bytes, so
// scrolling a row just moves that pointer 4 bytes: each background gets a separate
// longer, page-aligned table (see generateBackgroundColorScrollTables in
// generators/bbasic.js) and this subroutine points the kernel at the part of it
// for the current scroll offset. bgColorBg is the loaded background's index and
// bgColorOffset the number of rows its colors are scrolled by.
export const BACKGROUND_COLOR_SCROLL_SUBROUTINE_NAME = 'bgcolorscroll';
export const backgroundColorBgVarName = () => 'bgColorBg';
export const backgroundColorOffsetVarName = () => 'bgColorOffset';

const BACKGROUND_PFPIXEL_OPTIONS = [
  [`${CHECKBOX_CHECKED_ICON} Set`, 'on'],
  [`${CHECKBOX_CLEAR_ICON} Clear`, 'off'],
  [`${FLIP_ICON} Flip`, 'flip'],
];

const BACKGROUND_LINE_DIRECTION_OPTIONS = [
  [`Horizontally`, 'pfhline'],
  [`Vertically`, 'pfvline'],
];

// Up first (not Left) - a plain field_dropdown's default selected value
// is always whichever option is FIRST in this list (FieldDropdown has no
// separate "default value" to set independently - see node_modules/
// blockly/core/field_dropdown.js's constructor), and Up works unconditionally
// (Left/Right don't, once Superchip RAM is on - see background_scroll_
// direction_sync's comment below), so it's the only choice that's always
// a valid default regardless of that setting.
const BACKGROUND_PFSCROLL_OPTIONS = [
  [`${BACKGROUND_PFSCROLL_UP_ICON} Up`, 'up'],
  [`${BACKGROUND_PFSCROLL_DOWN_ICON} Down`, 'down'],
  [`${BACKGROUND_PFSCROLL_LEFT_ICON} Left`, 'left'],
  [`${BACKGROUND_PFSCROLL_RIGHT_ICON} Right`, 'right'],
  [`${BACKGROUND_PFSCROLL_UP2X_ICON} Up (2x)`, 'upup'],
  [`${BACKGROUND_PFSCROLL_DOWN2X_ICON} Down (2x)`, 'downdown'],
];

// Real batari Basic doesn't support horizontal (Left/Right) playfield
// scrolling once Superchip RAM is on (see Configuration.vue's
// "Enable Superchip RAM" hint text) - a function menuGenerator (rather
// than the plain static array every other JSON-defined dropdown in this
// file uses) so the option list is recomputed live every time the
// dropdown is actually opened (FieldDropdown.getOptions(false) always
// calls a function generator fresh, unlike its cached array path - see
// node_modules/blockly/core/field_dropdown.js), instead of needing a
// toolbox-rebuild/watcher plumbing like ActionEditor.vue's Player 0/1
// sprite-colors toggle uses.
//
// Also corrects the field's current value at init time if it's
// already Left/Right while Superchip is on - covers a block freshly
// dragged out of the flyout (which otherwise defaulted to Left, the
// filtered menuGenerator's first entry no longer including it, but the
// field's already-set value never re-validated against that by itself
// - confirmed as a real reported bug, "scroll left is still showing
// as the default"), AND a project loaded with an existing Left/Right
// choice from before Superchip was turned on - unlike the toolbox-only
// sprite-colors gate this pattern is modeled on, Left/Right genuinely
// doesn't function under Superchip's kernel at all, so there's no
// "keeps working as it did" case worth preserving here.
Blockly.Extensions.register('background_scroll_direction_sync', function() {
  // eslint-disable-next-line no-invalid-this
  const block = this;
  const field = block.getField('DIRECTION');
  if (!field) return;
  const optionsForCurrentConfig = () => {
    const cfg = useConfigurationStorage().value || {};
    if (!cfg.enableSuperchip) return BACKGROUND_PFSCROLL_OPTIONS;
    return BACKGROUND_PFSCROLL_OPTIONS.filter(([, value]) => value !== 'left' && value !== 'right');
  };
  field.menuGenerator_ = optionsForCurrentConfig;
  const validValues = new Set(optionsForCurrentConfig().map(([, value]) => value));
  if (!validValues.has(field.getValue())) {
    field.setValue('up');
  }
});

// Block for scrolling the background. STOPATEDGE only has any effect for
// Up/Down/Up (2x)/Down (2x) - see backgroundScrollRowVarName's
// comment for why Left/Right have no edge to stop at on the standard
// kernel (a fixed 32-column playfield width, nothing to scroll past).
Blockly.Blocks['background_scroll'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Playfield scroll`)
        .appendField(new Blockly.FieldDropdown(BACKGROUND_PFSCROLL_OPTIONS), 'DIRECTION')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'STOPATEDGE')
        .appendField('stop at top/bottom edge')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'COLORS')
        .appendField('scroll playfield colors')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'BKCOLORS')
        .appendField('scroll background colors');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    Blockly.Extensions.apply('background_scroll_direction_sync', this, false);
    this.setTooltip(`Scrolls the background in the given direction. Left/Right aren't offered while Superchip ` +
        `RAM is enabled (Options tab) - real batari Basic doesn't support horizontal playfield scrolling ` +
        `on that kernel. "stop at top/bottom edge", when checked, ` +
        `tracks how far Up/Down/Up (2x)/Down (2x) scrolling has moved within the CURRENT background's ` +
        `real row count (not just the fixed 12-row window batari Basic's pfscroll rotates through) ` +
        `and skips the scroll instead of continuing past the top (row 0) or the bottom (this background's ` +
        `last row). Has no effect on Left/Right, which have no edge to stop at - the standard kernel's ` +
        `playfield is always exactly 32 columns wide, so there's nothing beyond it to scroll into. Position ` +
        `is tracked regardless of whether this checkbox is on, so "Playfield scroll position" always ` +
        `reflects where the current background actually is, even from a scroll block that doesn't stop at ` +
        `the edges itself. "scroll playfield colors", when checked (and per-row playfield colors are on in ` +
        `the Options tab), moves each row's color along with its pixels for Up/Down/Up (2x)/Down (2x), ` +
        `instead of the colors staying where they are on the screen. "scroll background colors" does the same for ` +
        `the background row colors (DPC+ with per-row background colors on). Use them on every scroll block of a ` +
        `project that scrolls colors. To scroll just the colors, use "Playfield scroll colors" instead.`);
  },
};

// Scrolls only the row colors, leaving the playfield pixels where they are. The standard kernel moves them a whole
// playfield row per block; DPC+ moves them by scanline.
Blockly.Blocks['background_scroll_colors'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Playfield scroll colors`)
        .appendField(new Blockly.FieldDropdown(BACKGROUND_PFSCROLL_OPTIONS.filter(([, value]) =>
          value !== 'left' && value !== 'right')), 'DIRECTION')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('FALSE'), 'STOPATEDGE')
        .appendField('stop at top/bottom edge')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'PFCOLORS')
        .appendField('playfield colors')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('TRUE'), 'BKCOLORS')
        .appendField('background colors');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Scrolls just the row colors in the given direction and leaves the playfield ' +
        'pixels where they are, so it works without scrolling the playfield. It needs per-row ' +
        'playfield colors (the Options tab). The standard kernel moves the colors a whole playfield row at a ' +
        'time; DPC+ moves them a scanline at a time. The playfield colors and the background colors (DPC+ with ' +
        'per-row background colors) scroll separately: check the ones this block moves. "stop at top/bottom ' +
        'edge", when checked, stops the colors at the top or bottom of the background instead of wrapping around.');
  },
};

// The ways "Playfield offset" can move the pixels of an area (one pixel column or row per block).
export const BACKGROUND_OFFSET_OPTIONS = [
  ['alternate rows left and right', 'alternate'],
  ['all left', 'left'],
  ['all right', 'right'],
  ['all up', 'up'],
  ['all down', 'down'],
];
// The playfield is four bytes of eight pixels a row; the area's left and right edges are whole bytes.
export const BACKGROUND_OFFSET_LEFT_OPTIONS = [['0', '0'], ['8', '1'], ['16', '2'], ['24', '3']];
export const BACKGROUND_OFFSET_RIGHT_OPTIONS = [['7', '0'], ['15', '1'], ['23', '2'], ['31', '3']];

// Moves the pixels of the whole playfield, or of an area of it, by one pixel (column or row), wrapping around inside
// the area. Run every few frames it makes the holes of a wall drift sideways, like the shield in Yars' Revenge.
Blockly.Blocks['background_offset'] = {
  init: function() {
    this.appendDummyInput('HEAD')
        .appendField(`${BACKGROUND_ICON} Playfield offset`)
        .appendField(new Blockly.FieldDropdown(BACKGROUND_OFFSET_OPTIONS), 'DIRECTION')
        .appendField(' ')
        .appendField(new Blockly.FieldCheckbox('TRUE', (value) => {
          // The area's corners are only there while it isn't the whole playfield.
          this.updateShape_(value === 'TRUE' || value === true);
          return value;
        }), 'WHOLE')
        .appendField('whole playfield');
    this.setInputsInline(true);
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip(`Moves the pixels of the playfield by one step in the chosen direction, so holes in a wall drift ` +
        `along (the shield in Yars' Revenge). A pixel that leaves the end of a row carries on at the start of the next row ` +
        `and one that leaves the last row comes back on the first, and "all up" and "all down" wrap the top and ` +
        `the bottom. "alternate rows left and right" moves one row left, the next right, and so on, so the ` +
        `pixels run along the rows like a belt. Untick "whole playfield" to move just an area: its left and right edges ` +
        `are whole bytes of the playfield (columns 0-7, 8-15, 16-23 and 24-31, so its width is a multiple of eight ` +
        `pixels) and its top and bottom are rows counted from 0 like "Playfield get pixel". Run it every few frames ` +
        `for a slower drift. Pixels only move; per-row colors stay where they are.`);
  },
  mutationToDom: function() {
    const container = Blockly.utils.xml.createElement('mutation');
    container.setAttribute('whole', this.getFieldValue('WHOLE') === 'FALSE' ? '0' : '1');
    return container;
  },
  domToMutation: function(xml) {
    this.updateShape_(xml.getAttribute('whole') !== '0');
  },
  // Adds or removes the top left and bottom right corner of the area.
  updateShape_: function(whole) {
    const hasArea = !!this.getInput('X1IN');
    if (whole && hasArea) {
      ['Y2', 'X2IN', 'Y1', 'X1IN'].forEach((name) => this.removeInput(name));
    } else if (!whole && !hasArea) {
      this.appendDummyInput('X1IN')
          .appendField('from X')
          .appendField(new Blockly.FieldDropdown(BACKGROUND_OFFSET_LEFT_OPTIONS), 'X1');
      this.appendValueInput('Y1').setCheck('Number').appendField('Y');
      this.appendDummyInput('X2IN')
          .appendField('to X')
          .appendField(new Blockly.FieldDropdown(BACKGROUND_OFFSET_RIGHT_OPTIONS), 'X2');
      this.appendValueInput('Y2').setCheck('Number').appendField('Y');
      [['Y1', 0], ['Y2', 10]].forEach(([name, rows]) => {
        const shadow = this.workspace.newBlock('math_number');
        shadow.setShadow(true);
        shadow.setFieldValue(String(rows), 'NUM');
        if (this.rendered) shadow.initSvg();
        this.getInput(name).connection.connect(shadow.outputConnection);
      });
      if (this.rendered) this.render();
    }
  },
};

export const DEFAULT_BACKGROUNDS = {
  backgrounds: [
    {
      id: 1,
      name: 'Background',
      pixels: playfieldToMatrix(
          'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'X..............................X\n' +
        'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX'),
    },
  ],
};

export const processBackgroundStorageDefaults = (backgroundsStorage) => {
  const backgrounds = backgroundsStorage.value;
  if (!backgrounds || !backgrounds.backgrounds || !backgrounds.backgrounds.length) {
    // The starting background is a border of lit pixels along the top, left and right edges and two rows at the bottom,
    // sized to the project's full row count (see backgroundDataRows).
    const defaults = structuredClone(DEFAULT_BACKGROUNDS);
    const rows = backgroundDataRows((useConfigurationStorage() || {}).value);
    defaults.backgrounds.forEach((background) => {
      const width = background.pixels[0] ? background.pixels[0].length : 32;
      background.pixels = Array.from({length: rows}, (_, y) =>
        Array.from({length: width}, (__, x) =>
          (y === 0 || y >= rows - 2 || x === 0 || x === width - 1) ? 1 : 0));
    });
    return defaults;
  }
  return backgrounds;
};

// Read the backgrounds afresh rather than through the module level storage:
// that is a computed over localStorage, which is not reactive, so it caches the
// first value it ever read and would keep serving stale names.
const buildBackgroundOptions = () => {
  try {
    const background = processBackgroundStorageDefaults(useBackgroundsStorage());

    return background.backgrounds.map(({id, name}) => [name || `Unnamed ${id}`, `${id}`]);
  } catch (e) {
    console.error('Failed to list background options', e);
    return [['Error', '1']];
  }
};

// These two are defined below instead of in the JSON array, because a JSON
// definition can only take a fixed list of options. Passing the function to
// FieldDropdown lets Blockly rebuild the list every time the dropdown opens, so
// renamed, added and deleted backgrounds show up without reloading the page.
Blockly.Blocks['background_select'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Playfield`)
        .appendField(new Blockly.FieldDropdown(buildBackgroundOptions), 'VAR');
    this.setOutput(true, 'Number');
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Selects a background');
  },
};

Blockly.Blocks['background_set_select'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Playfield`)
        .appendField(new Blockly.FieldDropdown(buildBackgroundOptions), 'VAR');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Updates the background');
  },
};

Blockly.defineBlocksWithJsonArray([
  // Block for the setter.
  {
    'type': `background_set`,
    'message0': `${BACKGROUND_ICON} Playfield set to %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Updates the background`,
  },
  // Block for the color setter.
  {
    'type': `background_set_color`,
    'message0': `${BACKGROUND_ICON} Playfield set %1 ${COLOR_ICON} color to %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
    ],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Sets the background color`,
  },
  // Block for the color getter - one block with a Background/Playfield
  // dropdown (same VAR options as the setter above), rather than two
  // separate blocks, since both read the exact same kind of value and a
  // project switching which one it reads only ever needs to change the
  // dropdown, not swap blocks out.
  {
    'type': `background_get_color`,
    'message0': `${BACKGROUND_ICON} Get %1 ${COLOR_ICON} color`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
      },
    ],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Gets the current background or playfield color`,
  },
  // Block for fading a background/playfield color TOWARD a target color -
  // a one-shot TRIGGER (see backgroundFadeTimerVarName's  comment
  // above): call it once and the color keeps stepping toward the target by itself,
  // every frame from then on, via a check spliced into
  // commongamelogic - no need to keep re-calling this block yourself.
  // Brightness steps one level closer to the target each time the check
  // fires, AUTOMATICALLY going up or down depending on whether the color's
  // current brightness is currently below or above the target's - no
  // separate "fade up"/"fade down" choice needed (an earlier version of
  // this had two separate blocks for that; folded into one since which
  // direction is "correct" is really just a fact about the current color,
  // not something worth asking the user to get right).
  // No STEPS field at all (an earlier version of this had a user-facing
  // dropdown for it) - always FADE_STEPS (4), fixed, for the real bug its
  // comment describes: any other choice risked a crash once this
  // block's  trigger code ended up in a relocated bank.
  {
    'type': `background_fade_to`,
    'message0': `${BACKGROUND_ICON} Fade %1 ${COLOR_ICON} color to %2 over %3 frames`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Background', `COLUBK`],
          ['Playfield', `COLUPF`],
        ],
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
      {
        'type': 'input_value',
        'name': 'FRAMES',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': 'Starts fading the background or playfield color toward the given color over roughly ' +
      'this many frames - same hue as the target, brightness automatically climbing or dropping from ' +
      'wherever it currently is, whichever direction actually gets closer. Only needs to be triggered ' +
      'once - the fade keeps running by itself every frame afterward, even from inside an "if" block ' +
      'that only briefly becomes true, until it reaches the target and stops. With per-row playfield ' +
      '(or, on DPC+, per-row background) colors on, every row fades from the color it has to the target, ' +
      'which has to be a color from the color picker block, starting from the background\'s row colors.',
  },
  {
    'type': `background_fade_rows_from`,
    'message0': `${BACKGROUND_ICON} Fade %1 rows from ${COLOR_ICON} color %2 up/down to row colors over %3 frames`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'VAR',
        'options': [
          ['Playfield', `COLUPF`],
          ['Background', `COLUBK`],
        ],
      },
      {
        'type': 'input_value',
        'name': 'VALUE',
      },
      {
        'type': 'input_value',
        'name': 'FRAMES',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': 'Starts every playfield (or background) row at the brightness of the chosen color and fades each ' +
      'row up or down to its real color from the Background editor, over roughly this many frames. Needs ' +
      '"Enable per-row playfield colors" (Options tab; for the background rows, "Enable per-row background ' +
      'colors" on DPC+) and a color from the color picker block. Only needs to be triggered once. Switching ' +
      'backgrounds cancels it. "Fade color to" does the opposite, from the row colors down to a color.',
  },
  // Block for reading a playfield pixel
  {
    'type': `background_get_pixel`,
    'message0': `${BACKGROUND_ICON} Playfield get pixel at X %1 and Y %2`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'output': 'Boolean',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Reads a pixel of the background; can only be used on "if" statements`,
  },
  // Block for checking a whole area of the playfield
  {
    'type': `background_area_clear`,
    'message0': `${BACKGROUND_ICON} Playfield area from X %1 Y %2 to X %3 Y %4 is clear`,
    'args0': [
      {'type': 'input_value', 'name': 'X1', 'check': 'Number'},
      {'type': 'input_value', 'name': 'Y1', 'check': 'Number'},
      {'type': 'input_value', 'name': 'X2', 'check': 'Number'},
      {'type': 'input_value', 'name': 'Y2', 'check': 'Number'},
    ],
    'inputsInline': true,
    'output': 'Boolean',
    'colour': BACKGROUND_COLOR,
    'tooltip': `True when every playfield pixel in the rectangle between the two corners is off (columns ` +
      `0-31 and rows from 0, the same numbers as "Playfield get pixel"). The corners can be given in ` +
      `either order, and any part of the rectangle outside the playfield is ignored. It reads the pixels ` +
      `one by one, so a big area takes a while: use it now and then (for example when a brick is cleared), ` +
      `not on every frame. Can't be used inside a custom function.`,
  },
  // Block for setting a playfield pixel
  {
    'type': `background_change_pixel`,
    'message0': `${BACKGROUND_ICON} Playfield %1 pixel at X %2 and Y %3`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Changes a pixel of the background`,
  },
  // Block for drawing an horizontal/vertical line
  {
    'type': `background_change_hv_line`,
    'message0': `${BACKGROUND_ICON} Playfield %1 %2 %3 pixels at X %4 and Y %5`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'DIRECTION',
        'options': BACKGROUND_LINE_DIRECTION_OPTIONS,
      },
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'LENGTH',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'X',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Draws an horizontal/vertical line.`,
  },
  // Block for drawing an arbitrary (diagonal) line between two points - see
  // generators/bbasic/background.js's  registerBackgroundLineSubroutine
  // for the runtime Bresenham's-line-algorithm implementation this needs
  // (the endpoints can be variables, not just fixed numbers known at compile
  // time, so this can't be pre-flattened into a fixed run of pfpixel calls
  // the way background_change_hv_line's  straight runs can).
  {
    'type': `background_draw_line`,
    'message0': `${BACKGROUND_ICON} Playfield %1 line from X %2 Y %3 to X %4 Y %5`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'OPERATION',
        'options': BACKGROUND_PFPIXEL_OPTIONS,
      },
      {
        'type': 'input_value',
        'name': 'X1',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y1',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'X2',
        'check': 'Number',
      },
      {
        'type': 'input_value',
        'name': 'Y2',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Draws a straight line of any angle between two playfield points, unlike ` +
      `"Background Horizontally/Vertically pixels", which only draws straight up/down or ` +
      `left/right.`,
  },
  // Block for reading the playfield's vertical resolution (row count)
  {
    'type': `background_get_resolution`,
    'message0': `${BACKGROUND_ICON} Playfield height (rows)`,
    'args0': [],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `The playfield's vertical resolution in rows - the Superchip RAM pfres setting ` +
      `if that's turned on (Options tab), otherwise the standard 11-row default.`,
  },
  // Blocks for converting between playfield pixel coordinates (columns
  // 0-31, rows 0-10/pfres-1 - the same space background_get_pixel/
  // background_change_pixel already read/write) and sprite coordinates (the
  // raw X/Y a Player/Missile/Ball's  X/Y setter blocks use) - see the
  // real batari Basic formulas in generators/bbasic/background.js's
  // comment. One value-returning block per DIRECTION (two total, not one
  // per axis), with an AXIS dropdown - same shape as background_get_
  // resolution above for the no-variable-required part, and the same "one
  // dropdown instead of two near-identical blocks" convention background_
  // get_color/background_set_color already use for Background vs Playfield.
  // WIDTH only actually affects the X formula (see its  generator
  // comment) - still shown for a Y conversion for simplicity, just unused
  // by it.
  {
    'type': `background_pixel_to_sprite`,
    'message0': `${BACKGROUND_ICON} Convert playfield %1 %2 to %3`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'AXIS',
        'options': [
          ['X', 'X'],
          ['Y', 'Y'],
        ],
      },
      {
        'type': 'input_value',
        'name': 'COORD',
        'check': 'Number',
      },
      {
        'type': 'field_dropdown',
        'name': 'WIDTH',
        'options': [
          ['single-wide sprite', 'SINGLE'],
          ['double/quad-wide sprite', 'WIDE'],
        ],
      },
    ],
    'inputsInline': true,
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Converts a playfield pixel column (0-31) or row to the matching Player/Missile/Ball X or ` +
      `Y coordinate.`,
  },
  {
    'type': `background_sprite_to_pixel`,
    'message0': `${BACKGROUND_ICON} Convert %3 %1 %2 to playfield`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'AXIS',
        'options': [
          ['X', 'X'],
          ['Y', 'Y'],
        ],
      },
      {
        'type': 'input_value',
        'name': 'COORD',
        'check': 'Number',
      },
      {
        'type': 'field_dropdown',
        'name': 'WIDTH',
        'options': [
          ['single-wide sprite', 'SINGLE'],
          ['double/quad-wide sprite', 'WIDE'],
        ],
      },
    ],
    'inputsInline': true,
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `Converts a Player/Missile/Ball X or Y coordinate to the matching playfield pixel column ` +
      `(0-31) or row.`,
  },
  // Given a sprite that just registered a hardware collision with the
  // Playfield (see collision_get/collision_check_position in blocks/
  // collision.js), works out exactly which playfield column/row it hit -
  // width is read back automatically (no WIDTH field here, unlike
  // background_sprite_to_pixel above), and the two Boolean inputs are the
  // sprite's  current direction of travel, supplied by whatever
  // movement logic already tracks it (see this block's  generator in
  // generators/bbasic/background.js for why direction isn't auto-tracked
  // here instead). Results are read back via background_collision_pixel_
  // column/_row below, right after this runs.
  {
    'type': `background_collision_pixel`,
    'message0': `${BACKGROUND_ICON} Find playfield pixel %1 collided with`,
    'message1': `moving right %1 moving down %2`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'SPRITE',
        'options': [
          [PLAYER_ICON + ' Player 0', 'player0'],
          [PLAYER_ICON + ' Player 1', 'player1'],
          [MISSILE_ICON + ' Missile 0', 'missile0'],
          [MISSILE_ICON + ' Missile 1', 'missile1'],
          [BALL_ICON + ' Ball', 'ball'],
        ],
      },
    ],
    'args1': [
      {
        'type': 'input_value',
        'name': 'MOVING_RIGHT',
        'check': 'Boolean',
      },
      {
        'type': 'input_value',
        'name': 'MOVING_DOWN',
        'check': 'Boolean',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Works out which exact playfield column/row the chosen sprite is touching right now ` +
      `- place this right after a "Collided <sprite> and Playfield" check. "Moving right"/"moving ` +
      `down" should reflect the sprite's CURRENT direction of travel (wire in whatever variable ` +
      `already tracks that) - used to pick the right neighboring pixel if the sprite's exact position ` +
      `doesn't land precisely on a playfield pixel. Read the result with "Playfield collision column" ` +
      `/ "Playfield collision row" right after this runs.`,
  },
  // The same block, but taking one direction of travel instead of the two
  // "moving right"/"moving down" true/false inputs, so every direction works
  // (up and left too, and the diagonals) and a sprite that is not moving can
  // say so. The direction is 0-7 clockwise from Up, the same scale as the Fire
  // block's angle and the "Joystick direction (8-way)" block; any other value
  // (255 for "no direction") checks only the exact cell. The older block above
  // still works in existing projects but is no longer in the toolbox.
  {
    'type': `background_collision_pixel_direction`,
    'message0': `${BACKGROUND_ICON} Find playfield pixel %1 collided with`,
    'message1': `moving in direction %1`,
    'args0': [
      {
        'type': 'field_dropdown',
        'name': 'SPRITE',
        'options': [
          [PLAYER_ICON + ' Player 0', 'player0'],
          [PLAYER_ICON + ' Player 1', 'player1'],
          [MISSILE_ICON + ' Missile 0', 'missile0'],
          [MISSILE_ICON + ' Missile 1', 'missile1'],
          [BALL_ICON + ' Ball', 'ball'],
        ],
      },
    ],
    'args1': [
      {
        'type': 'input_value',
        'name': 'DIRECTION',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Works out which exact playfield column/row the chosen sprite is touching right now ` +
      `- place this right after a "Collided <sprite> and Playfield" check. "Moving in direction" is ` +
      `the way the sprite is travelling: 0 Up, 1 Up-Right, 2 Right, 3 Down-Right, 4 Down, 5 Down-Left, ` +
      `6 Left, 7 Up-Left (the same numbers as the Fire block's angle and the joystick direction ` +
      `block), or 255 for no direction. It is used to pick the right neighboring pixel if the ` +
      `sprite's exact position doesn't land precisely on a playfield pixel. Read the result with ` +
      `"Playfield collision column" / "Playfield collision row" right after this runs.`,
  },
  {
    'type': `background_collision_pixel_column`,
    'message0': `${BACKGROUND_ICON} Playfield collision column`,
    'args0': [],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `The playfield column (0-31) found by the last "Find playfield pixel collided with" ` +
      `block that ran - meaningless if read before that block has run this frame.`,
  },
  {
    'type': `background_collision_pixel_row`,
    'message0': `${BACKGROUND_ICON} Playfield collision row`,
    'args0': [],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `The playfield row found by the last "Find playfield pixel collided with" block that ` +
      `ran - meaningless if read before that block has run this frame.`,
  },
  // Per-row color noise for the playfield, the background twin of the player
  // "rainbow colors" block.
  {
    'type': `background_rainbow_colors`,
    'message0': `${BACKGROUND_ICON} Playfield rainbow colors, offset %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'OFFSET',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Gives every playfield row a different color, reading real ROM bytes the same way ` +
      `the player "rainbow colors" block does. Leave "offset" unplugged for an automatically ` +
      `shimmering pattern (it defaults to the frame counter), or plug in a number to hold or ` +
      `scroll the pattern yourself. Needs "Playfield row colors" turned on in Options; with it ` +
      `off this block does nothing. Loading a background restores that background's row colors ` +
      `only until the next frame, so use "Stop background rainbow colors" to go back to its row colors.`,
  },
  {
    'type': `background_rainbow_colors_stop`,
    'message0': `${BACKGROUND_ICON} Stop playfield rainbow colors`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Stops "Playfield rainbow colors" and puts the playfield rows back to the row colors of the ` +
      `background that is loaded (the colors set for it in the Background tab). The playfield pixels ` +
      `are left alone.`,
  },
  // Block for clearing every playfield pixel at once
  {
    'type': `background_clear`,
    'message0': `${BACKGROUND_ICON} Playfield clear all pixels`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Turns off every playfield pixel, the same as batari Basic's "pfclear".`,
  },
  // Read-only - how far Up/Down scrolling has moved the CURRENTLY shown
  // background from its top row (0 = top, at most that background's
  // row count minus the visible row count - see backgroundScrollRowVarName's
  // comment). Reset to 0 every time newbackground changes. Only ever
  // updated by background_scroll's Up/Down/Up (2x)/Down (2x) calls
  // (Left/Right never touch it, see that block's tooltip).
  {
    'type': `background_scroll_position`,
    'message0': `${BACKGROUND_ICON} Playfield scroll position`,
    'args0': [],
    'output': 'Number',
    'colour': BACKGROUND_COLOR,
    'tooltip': `How many rows Up/Down scrolling has moved the currently shown background from its top ` +
      `row (0 = top). Only updated by "Playfield scroll" blocks using Up/Down/Up (2x)/Down (2x) - Left/` +
      `Right don't affect it. Resets to 0 whenever a different background is switched to.`,
  },
  // Jumps the scroll position to a chosen row instead of always starting at
  // the top - see this block's generator in generators/bbasic/background.js.
  {
    'type': `background_scroll_set_row`,
    'message0': `${BACKGROUND_ICON} Set playfield scroll to row %1`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'ROW',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Moves the scroll to start at this row of the background (0 = the top, the default). For ` +
      `example, with a 64-row background and a 12-row screen, 32 shows rows 32 to 43. A row past the ` +
      `last scrollable one is clamped to it. Only does anything for a background taller than the ` +
      `screen. Works whether it comes before or after a "Set background" block in the same event, and ` +
      `sprites that follow the scroll aren't moved. Use it right after switching backgrounds, or ` +
      `later to jump the view.`,
  },
  // Block for drawing the screen
  {
    'type': `draw_screen`,
    'message0': `Draw screen`,
    'args0': [],
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': `Draws the screen`,
  },
  // Standard kernel's  undocumented "shakescreen" hook (see
  // generateShakeScreenChecks'  comment in generators/bbasic/
  // background.js for the real per-frame mechanism this drives) - a whole-
  // screen effect, not a background/playfield one specifically, same
  // reasoning draw_screen above already lives in this file despite not
  // being "background_"-prefixed. Self-contained, unlike every other
  // trigger block in this codebase (Fire/Bounce/Seek/Fade all leave their
  // timing up to the user) - confirmed with the user: a raw on/off
  // toggle only sets a constant one-scanline offset, not an actual
  // vibration, so a useful "shake" needs the frame-by-frame alternation
  // built in, not left for the user to wire up themselves.
  {
    'type': `screen_shake`,
    'message0': `${BACKGROUND_ICON} Shake screen for %1 frames`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'FRAMES',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': 'Vibrates the whole screen up and down by one scanline, every other frame, for roughly ' +
      'this many frames (at most 127; a longer count is shortened to 127), then stops automatically. Only needs to be triggered once - the shake keeps ' +
      'running by itself every frame afterward, even from inside an "if" block that only briefly ' +
      'becomes true, same as "Fade color to". Triggering it again while already shaking restarts the ' +
      'countdown at the new frame count, rather than stacking.',
  },
  // DPC+ only (see blockly-toolbox.xml.hbs's own {{#if kernelIsDpcPlus}}
  // gate) - the standard kernel derives its playfield row height from
  // pfres/pfrowheight, both compile-time constants with no DPC+ equivalent;
  // DPC+ instead reads it every frame from a runtime register (DFxFRACINC)
  // that nothing initializes on its own (confirmed: no default anywhere in
  // DPCplus_kernel.asm's startup) - so a project with no block like this
  // one anywhere would render its playfield at whatever height happens to
  // be left in uninitialized RAM. See generators/bbasic/background.js's
  // generateDpcPlusRowHeight for the actual DFxFRACINC math.
  {
    'type': `background_set_dpc_plus_row_height`,
    'message0': `${BACKGROUND_ICON} Set playfield row height to %1 scanlines`,
    'args0': [
      {
        'type': 'input_value',
        'name': 'SCANLINES',
        'check': 'Number',
      },
    ],
    'inputsInline': true,
    'previousStatement': null,
    'nextStatement': null,
    'colour': BACKGROUND_COLOR,
    'tooltip': 'DPC+ only: sets how many scanlines tall each playfield row is drawn - unlike the ' +
      'standard kernel, DPC+ has no built-in default for this, so a block like this needs to run ' +
      'somewhere (once at startup is enough) or the playfield renders at whatever height happens to ' +
      'be left in RAM. Also controls per-row playfield/background color resolution if either is ' +
      'enabled (Options tab) - they stay locked to this same row height. Running this again with a ' +
      'different value re-flows every row live, which is exactly how DPC+ projects implement things ' +
      'like a title screen with different proportions than the main game.',
  },
]);

// Fires once, the moment a matching background_fade_to block (same
// register) actually reaches its  target color, regardless of which way
// brightness was moving to get there - see
// resolveBackgroundFadeFinishedWatches/backgroundFadeFinishedBit above for
// how this is resolved to one of fadeFlagsVarName's  fixed
// bits, and generators/bbasic/background.js for where that bit actually
// gets set (inside the per-frame check's  step branch, only the exact
// frame a step causes it to reach the target, either direction) and
// checked-and-cleared (this block's  generator). Used to have its
// DIRECTION dropdown (fading in/brightening vs fading out/dimming), removed
// since a project reacting to "this fade is done" regardless of direction
// needed two near-identical copies of this block wired to the same DO stack
// - background_fade_to itself never states a direction either (it
// auto-detects which way to go from the current color), so there was no
// direction-aware trigger to actually pair a direction-specific watch
// against in the first place. A fade that starts already AT its target
// (nothing to actually step) still fires this, on that same first active
// frame - confirmed as a real reported bug: a project fading the playfield
// to a color that happened to share its starting color's luminance nibble
// (hue commits instantly regardless, only luminance ramps - see
// generators/bbasic/background.js's  buildFadeCheckAsm) took the
// "already" shortcut on frame one and silently never reported completion,
// even though the register visibly was at its target the whole time.
Blockly.Blocks['background_fade_finished'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} When`)
        .appendField(new Blockly.FieldDropdown([
          ['Background', 'COLUBK'],
          ['Playfield', 'COLUPF'],
        ]), 'VAR')
        .appendField(`${COLOR_ICON} color has finished fading`);
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Runs the connected blocks once, the moment a matching "Fade" block (same Background/' +
      'Playfield choice) reaches its target color. Does nothing if no matching fade ever runs anywhere ' +
      'in the project.');
  },
};

// Runs its blocks once, the moment background_scroll lands a row-step on the
// top or bottom row - see backgroundScrollEdgeFlagsVarName. Works like
// background_fade_finished above (the flag is set by the scroll block and
// cleared here as the blocks run).
Blockly.Blocks['background_scroll_edge_reached'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} When playfield scroll reaches the`)
        .appendField(new Blockly.FieldDropdown([
          ['Top', 'top'],
          ['Bottom', 'bottom'],
        ]), 'EDGE');
    this.appendStatementInput('DO');
    this.setPreviousStatement(true);
    this.setNextStatement(true);
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('Runs the connected blocks once, each time a "Playfield scroll" (Up/Down) moves the ' +
      'view onto the top row or the bottom row of the current background. Reaching the edge by "Set ' +
      'background scroll to row" or by switching backgrounds does not count.');
  },
};

// Plain, always-current boolean read of fadeActiveBit - not an
// event like background_fade_finished above (nothing to "watch" or clear),
// just whatever the bit currently holds: true from the moment a matching
// background_fade_to block triggers until the per-frame check (see
// generateBackgroundFadeChecks) steps that register's color onto its exact
// target, false the rest of the time, including before the first trigger.
Blockly.Blocks['background_fade_active'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${BACKGROUND_ICON} Is`)
        .appendField(new Blockly.FieldDropdown([
          ['Background', 'COLUBK'],
          ['Playfield', 'COLUPF'],
        ]), 'VAR')
        .appendField(`${COLOR_ICON} color fade active?`);
    this.setOutput(true, 'Boolean');
    this.setColour(BACKGROUND_COLOR);
    this.setTooltip('True while the Background or Playfield color is in the middle of a "Fade" - from the ' +
      'moment a "Fade" block triggers it until it reaches its target color, false the rest of the time.');
  },
};
