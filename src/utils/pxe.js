'use strict';

// The PXE kernel (config.pxe) runs a DPC+ program on an ARM program, and its sprite and color tables are laid out a little differently.
export const isPxe = (config) => !!(config && config.kernel === 'dpcplus' && config.pxe);
// The Options tab's "Show remaining CPU cycles as the score" (bB's cyclescore): left out with PXE, whose kernel has no cycle score.
export const cycleScoreOn = (config) => !!(config && config.enableCycleScore) && !isPxe(config);

// How many players the kernel has: Player 0 and 1 on the standard kernel, 10 on DPC+ (Players 2 to 9 are its virtual sprites), 17 on PXE
// (Players 2 to 16). The numbers of a project's blocks can only be past 9 on PXE.
export const playerCount = (config) => (isPxe(config) ? 17 : (config && config.kernel === 'dpcplus') ? 10 : 2);
export const EXTRA_PLAYER_NUMBER = /^([2-9]|1[0-6])$/;
export const EXTRA_PLAYER_NAME = /^player([2-9]|1[0-6])$/;

// The variable slots the PXE includes declare (var0 to var60), where the DPC+ ones have only the first nine free for a project.
export const PXE_VAR_COUNT = 61;

// Where the pointers to the colors of the virtual sprites start in playerpointers: after the 9 graphic pointers of DPC+, or the 16 of PXE.
export const playerColorPointerBase = (config) => (isPxe(config) ? 32 : 18);

// PXE has no bank switching (the ARM program maps the whole ROM in), so the compiler treats a program as one flat bank, but its calls and
// jumps to a label said to be in another bank still make bank switching code. The generated code is put in one bank: the bank lines
// and the bank a goto, gosub or on...goto names are dropped.
export const flattenBanks = (code) => code.split('\n')
    .filter((line) => !/^\s*bank\s+\d+\s*$/.test(line))
    .map((line) => (/^\s*(\S+\s+)?(goto|gosub|on\b)/.test(line) ? line.replace(/\s+bank\d+(?=\s|$)/g, '') : line))
    .join('\n');

// A DFxFRACINC of 0 holds a DPC+ fetcher on its first row (the one-entry color lists use it), and gives the PXE kernel a row for every
// scanline, so it is 1 there (256 scanlines to a row).
export const fixFracIncs = (code, wide = false, buffers = 5, separate = false) => {
  const fixed = code.replace(/^(\s*DF\dFRACINC\s*=\s*)0(\s*)$/gm, '$11$2');
  if (!wide) return fixed;
  // The wide playfields use the first column's step for every column (PXE_WIDE_PF_MODE), and the kernel keeps that, and the steps of the playfield and
  // background colors, in registers (PXEheader.asm) rather than in the ones of the DPC+ fetchers the statements set: they are set to the same.
  const registers = {0: 'PF_FRAC_INC', 4: 'PF_FRAC_INC_PFCOL', 6: 'PF_FRAC_INC_BKCOL'};
  return fixed.replace(/^([ \t]*)DF([046])FRACINC[ \t]*=[ \t]*(.+?)[ \t]*$/gm, (line, indent, fetcher, value) => {
    // (Separate groups: the steps of the groups are set once, see mirrorGroupSteps.)
    if (fetcher === '0' && separate) return line;
    return `${line}\n${indent}${registers[fetcher]} = ${value}`;
  });
};

// Separate column groups (f clear): the first four groups' row steps are the fetcher steps the program sets before every drawscreen (DF0FRACINC to
// DF3FRACINC), and the others' are registers (PF_FRAC_INC_4 on). So that a row step block lasts, the statements take the steps from variables
// (steps[0] to steps[3]) that the first run of the DF0FRACINC statement starts with its value (`flag` is 0 until then), with the registers.
export const PXE_GROUP_STEP_VARS = ['pxeGroupStep0', 'pxeGroupStep1', 'pxeGroupStep2', 'pxeGroupStep3'];
export const mirrorGroupSteps = (code, buffers, flag, steps) => {
  let counter = 0;
  return code.replace(/^([ \t]*)DF([0-3])FRACINC[ \t]*=[ \t]*(.+?)[ \t]*$/gm, (line, indent, fetcher, value) => {
    const use = `${indent}DF${fetcher}FRACINC = ${steps[fetcher]}`;
    if (fetcher !== '0') return use;
    counter++;
    const step = value === '0' ? '1' : value;
    return [`${indent}if ${flag} then goto _pxegroupsteps${counter}`, `${indent}${flag} = 1`,
      ...steps.map((name) => `${indent}${name} = ${step}`),
      ...Array.from({length: buffers}, (_, i) => `${indent}PF_FRAC_INC_${i} = ${step}`), `_pxegroupsteps${counter}`, use].join('\n');
  });
};

// DPC+ scrolls the playfield and the two color queues with `pfscroll amount first last` (queues 0 to 3 are the playfield columns, 4 the
// playfield colors, 6 the background colors). The PXE kernel scrolls the columns with that statement but takes the color queues
// from the vertical scroll of the colors (PF_VER_SCROLL_LO_PFCOL and PF_VER_SCROLL_LO_BKCOL, in rows), so a scroll of the colors adds the amount there
// (through a scratch byte: the PXE 6502 has no ADC of an address above the zero page).
export const scrollColorsForPxe = (code, scratch, columns = 4, separate = false) => code.replace(/^([ \t]*)pfscroll[ \t]+(\S+)[ \t]+(\d)[ \t]+(\d)[ \t]*$/gm,
    (line, indent, amount, first, last) => {
      const from = Number(first);
      const to = Number(last);
      const operand = /^\d+$/.test(amount) ? `#${amount}` : amount;
      const addTo = (offset) => [`${indent} asm`, `${indent} lda ${operand}`, `${indent} sta ${scratch}`, `${indent} lda ${offset}`, `${indent} clc`,
        `${indent} adc ${scratch}`, `${indent} sta ${offset}`,
        'end'];
      const lines = [];
      // (The wide playfields share the first column's settings, scroll included: a scroll of every column would be one for each.)
      // (Separate groups: pfscroll does not move them in step the way it moves the shared scroll, so the playfield columns are scrolled by the group blocks only.)
      if (from <= 3 && !(columns > 4 && separate)) lines.push(`${indent}pfscroll ${amount} ${from} ${columns > 4 ? 0 : Math.min(to, 3)}`);
      if (from <= 4 && to >= 4) lines.push(...addTo('PF_VER_SCROLL_LO_PFCOL'));
      if (from <= 6 && to >= 6) lines.push(...addTo('PF_VER_SCROLL_LO_BKCOL'));
      return lines.length ? lines.join('\n') : line;
    });

// How many pixels across the playfield is. The standard and DPC+ playfield is 32 columns, centered on the screen with 16 pixels at each side; the
// PXE kernel can run a 40 column one that fills the screen, or a 64 or 120 column one that scrolls sideways under it (PF_MODE, see PXEheader.asm, and
// pxePfWidth in the configuration).
export const PF_NARROW_WIDTH = 32;
export const PF_WIDE_WIDTH = 40;
export const PF_WIDTHS = [32, 40, 64, 120];
export const pfWidthOf = (config) => (isPxe(config) && PF_WIDTHS.includes(Number(config.pxePfWidth)) ? Number(config.pxePfWidth) : PF_NARROW_WIDTH);
// A playfield that fills the screen from its left edge (all but the 32 column one).
// How many column buffers (8 columns each) the playfield has: 4, and 5, 8 or 15 for the wide ones.
export const pfBuffersOf = (config) => (pfWidthOf(config) === PF_NARROW_WIDTH ? 4 : pfWidthOf(config) / 8);
export const pfIsWide = (config) => pfWidthOf(config) > PF_NARROW_WIDTH;
// How many columns the screen shows of the playfield: the 32 column one fits in it, the others show 40 of their columns.
export const pfShownColumns = (config) => Math.min(pfWidthOf(config), PF_WIDE_WIDTH);
// The furthest the playfield can be scrolled sideways, in pixels (4 to a column): none on the 32 and 40 column playfields.
export const pfMaxScrollOf = (config) => Math.max(0, (pfWidthOf(config) - PF_WIDE_WIDTH) * 4);

// PF_MODE for the project: the width (ww: 1 for 40 columns, 2 for 64, 3 for 120), and the first column's scroll, write offset and step used for every
// column (f, o and v), as the wide playfields have five to fifteen of each and the code of the app only sets the first.
export const PXE_WIDE_PF_MODE = {40: 0x39, 64: 0x3a, 120: 0x3b};
// The same with every column group (8 columns, a buffer) having a row step, write offset and vertical scroll of its own (f, o and v clear), for parallax:
// pxeSeparateScroll in the configuration.
export const pxePfModeOf = (config) => PXE_WIDE_PF_MODE[pfWidthOf(config)] & (config.pxeSeparateScroll ? ~0x28 : 0xff);

// A background's pixel rows made another width, keeping the picture where it is on the screen: the narrow playfield has 4 columns at each side
// of the wide one, so 4 columns are added or dropped at the left when going to or from it; the rest is added or dropped at the right.
export const resizePixelColumns = (pixels, width) => {
  const rows = pixels || [];
  const current = rows[0] ? rows[0].length : PF_NARROW_WIDTH;
  if (current === width) return rows;
  const left = current === PF_NARROW_WIDTH ? 4 : width === PF_NARROW_WIDTH ? -4 : 0;
  return rows.map((row) => {
    const shifted = left >= 0 ? [...Array(left).fill(0), ...row] : row.slice(-left);
    return shifted.length >= width ? shifted.slice(0, width) : [...shifted, ...Array(width - shifted.length).fill(0)];
  });
};

// The joysticks: 0 and 1 on every kernel, and 2 and 3 (a Quadtari, joy2up and so on in the PXE compiler) on PXE.
export const joystickNameOf = (value) => `joy${['1', '2', '3'].includes(String(value)) ? String(value) : '0'}`;
export const joystickCount = (config) => (isPxe(config) ? 4 : 2);
