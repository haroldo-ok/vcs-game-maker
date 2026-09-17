import {CHAR_TO_GLYPH} from '../blocks/text-strings';
import {getPristineText12b} from '../generators/bbasic/text-minikernel-files';
import {useTextFontStorage} from '../hooks/project';

// Every glyph the Text Minikernel can draw is a fixed 4-pixel-wide, 5-row
// -tall shape (confirmed directly against public/bb19/text-minikernel/
// text12b.asm's own left_text/right_text tables: each row is stored as one
// byte with only its high nibble - left_text - or low nibble - right_text -
// ever set, the other 4 bits always 0). The kernel draws two adjacent
// half-width characters per GRP0/GRP1 write by ORing a "left" glyph's
// left_text byte with a "right" glyph's right_text byte together - see
// buildTextFontOverride's own comment below for exactly how that's
// reconstructed from a single 4x5 pixel matrix per glyph.
export const TEXT_GLYPH_WIDTH = 4;
export const TEXT_GLYPH_HEIGHT = 5;

// The exact order glyph labels appear in text12b.asm's own left_text table -
// confirmed directly against the vendored file. This is the REAL on-disk
// byte layout (glyph N's 5 bytes start at offset N*TEXT_GLYPH_HEIGHT within
// text_data), not just a display convenience, so buildTextFontOverride can
// safely walk both the pristine file's own .byte lines and this app's own
// stored glyph array in lockstep.
const GLYPH_LABEL_ORDER = [
  '__A', '__B', '__C', '__D', '__E', '__F', '__G', '__H', '__I', '__J', '__K', '__L', '__M',
  '__N', '__O', '__P', '__Q', '__R', '__S', '__T', '__U', '__V', '__W', '__X', '__Y', '__Z',
  '__0', '__1', '__2', '__3', '__4', '__5', '__6', '__7', '__8', '__9',
  '_sp', '_pd', '_qu', '_ex', '_cm', '_hy', '_pl', '_ap', '_lp', '_rp', '_co', '_sl', '_eq', '_qt', '_po',
];

// Maps each glyph label back to the character it represents, purely for the
// editor's own display labels - reusing CHAR_TO_GLYPH (blocks/text-strings.js,
// the same map encodeTextMessage itself reads) as the single source of truth
// for that association, rather than a second, independently-typed char list
// that could quietly drift out of sync with it.
const GLYPH_TO_CHAR = Object.fromEntries(
    Object.entries(CHAR_TO_GLYPH).map(([ch, label]) => [label, ch]));

export const TEXT_GLYPH_ORDER = GLYPH_LABEL_ORDER.map((label) => ({label, char: GLYPH_TO_CHAR[label] || label}));
// 51 - exactly fills the 255 bytes (51 * 5) a single 8-bit glyph index can
// address at all (see TextPointersLoop/showtextrow in text12b.asm - the
// index is the glyph's own raw byte offset into text_data, capped at 255).
// This is a firm hardware ceiling, not a chosen limit: there is no spare
// room for a 52nd glyph without changing the addressing scheme entirely, so
// this editor only ever lets these 51 be REDRAWN, never adds a new one.
export const TEXT_GLYPH_COUNT = TEXT_GLYPH_ORDER.length;

// Anchors used to locate the pristine file's own left_text/right_text
// sections (see buildTextFontOverride below) - 'text_data\n\nleft_text' is
// unique to the real table label (plain "left_text,x" - with a comma -
// appears many times earlier, in the kernel's own drawing code, so a bare
// "left_text" search would land on the wrong, much earlier occurrence).
// 'text_data_height' only appears once as an actual label (a second,
// harmless use as an operand - "if >. != >[.+text_data_height]" - comes
// right after it, past wherever this search starts from). 'right_text' is
// searched for starting from THAT point on, which is safely past every
// earlier "ora right_text,x" instruction reference, so no special anchor is
// needed for it the way left_text needs one.
// A plain literal string search doesn't work for this: the vendored file
// uses CRLF line endings, not the bare "\n" a literal-string anchor would
// need to match. A regex tolerates either.
const LEFT_TABLE_ANCHOR_RE = /text_data\r?\n\r?\nleft_text/;
const HEIGHT_LABEL = 'text_data_height';
const RIGHT_TABLE_LABEL = 'right_text';

// Returns the index right at "left_text" itself (just past the anchor's own
// "text_data\n\n" prefix), or -1 if the pristine file isn't shaped as
// expected.
const findLeftTextStart = (text12b) => {
  const match = LEFT_TABLE_ANCHOR_RE.exec(text12b);
  return match ? match.index + match[0].length - 'left_text'.length : -1;
};

const BYTE_LINE_RE = /\.byte\s+%[01]{8}/g;

// Parses one section's own sequence of ".byte %XXXXXXXX" lines, in order,
// into an array of 8-char bit strings - used both to read the pristine
// file's own default glyphs (getDefaultTextFont) and (indirectly, via
// replaceByteValues below) to rewrite them.
const parseByteValues = (section) => [...section.matchAll(BYTE_LINE_RE)].map((m) => m[0].match(/[01]{8}/)[0]);

// Replaces every ".byte %XXXXXXXX" line in a section with the given values,
// in order - preserving every other character (labels, comments, blank
// lines, indentation) exactly as the pristine file has them, so offsets and
// addresses stay byte-for-byte identical to the original; only the pixel
// VALUES change. This is what lets this override skip the ORG/RORG address
// juggling buildScoreFontOverride (utils/score-font.js) needs - a glyph's
// on-disk size never changes (see TEXT_GLYPH_COUNT's own "firm hardware
// ceiling" comment), so there is never a byte count to compensate for.
const replaceByteValues = (section, values) => {
  let i = 0;
  return section.replace(BYTE_LINE_RE, () => `.byte %${values[i++]}`);
};

// Splits a section's own flat byte-value array (TEXT_GLYPH_COUNT *
// TEXT_GLYPH_HEIGHT long) into one TEXT_GLYPH_HEIGHT x TEXT_GLYPH_WIDTH
// pixel matrix per glyph - only the byte's own nibble that this glyph
// table actually stores data in matters (left_text's high nibble, or
// right_text's identical low nibble - see this file's own top comment); the
// other nibble is always zero in the pristine file, and this app never
// needs to represent it separately at all, since buildTextFontOverride
// below always re-derives BOTH nibbles fresh from one shared pixel matrix.
const bytesToGlyphs = (byteValues, nibble) => {
  const glyphs = [];
  for (let i = 0; i < TEXT_GLYPH_COUNT; i++) {
    const rows = byteValues.slice(i * TEXT_GLYPH_HEIGHT, (i + 1) * TEXT_GLYPH_HEIGHT)
        .map((byte) => (nibble === 'high' ? byte.slice(0, 4) : byte.slice(4)).split('').map(Number));
    glyphs.push(rows);
  }
  return glyphs;
};

/**
 * The Text Minikernel's own built-in glyph shapes, one 5-row x 4-col pixel
 * matrix per glyph (TEXT_GLYPH_ORDER's own order) - parsed once from the
 * real pristine text12b.asm rather than hand-transcribed, so this can never
 * drift out of sync with whatever the vendored file actually ships.
 * @return {!Promise<!Array<!Array<!Array<number>>>>}
 */
let defaultTextFontPromise = null;
export const getDefaultTextFont = () => {
  if (!defaultTextFontPromise) {
    defaultTextFontPromise = getPristineText12b().then((text12b) => {
      const leftStart = findLeftTextStart(text12b);
      const heightAt = leftStart >= 0 ? text12b.indexOf(HEIGHT_LABEL, leftStart) : -1;
      if (leftStart < 0 || heightAt < 0) {
        throw new Error('Unexpected text12b.asm shape - could not locate the left_text glyph table.');
      }
      return bytesToGlyphs(parseByteValues(text12b.slice(leftStart, heightAt)), 'high');
    });
  }
  return defaultTextFontPromise;
};

/**
 * Fills in a usable glyph set - the stored one if it's shaped as expected,
 * otherwise the given defaults (same "validate shape, else fall back"
 * pattern as processScoreFontDefaults in utils/score-font.js).
 * @param {*} storage Text font storage, or its value.
 * @param {!Array<!Array<!Array<number>>>} defaultGlyphs From getDefaultTextFont.
 * @return {{glyphs: !Array<!Array<!Array<number>>>}}
 */
export const processTextFontDefaults = (storage, defaultGlyphs) => {
  const stored = storage && ('value' in storage ? storage.value : storage);
  const glyphs = stored && stored.glyphs;
  if (!Array.isArray(glyphs) || glyphs.length !== TEXT_GLYPH_COUNT) {
    return {glyphs: defaultGlyphs};
  }
  return {glyphs};
};

// The "more below" scroll cursor - text12b.asm's own "textScrollCursor"
// ifconst block (see generators/bbasic.js's own textScrollCursorConfigurationCode)
// draws this next to whichever row is currently the last one on screen, only
// when there's more of the message left to scroll to. Unlike the 51 real
// glyphs above, this ISN'T part of the indexed text_data table at all - it's
// never looked up by a runtime glyph index, just a single fixed shape drawn
// directly by name - so it isn't limited to the 4-bit-wide, half-nibble
// shape those need to leave room for OR-ing two characters together (see
// this file's own top comment). With the WHOLE byte to itself, 2 rows of a
// full 4 bits each fits with zero bits left over: 2 * 4 = 8.
export const TEXT_CURSOR_WIDTH = 4;
export const TEXT_CURSOR_HEIGHT = 2;

// A plain downward chevron ("more below") - just a reasonable starting
// shape, fully editable in the Text Minikernel Font card like any glyph.
export const DEFAULT_TEXT_CURSOR = [
  [1, 0, 0, 1],
  [0, 1, 1, 0],
];

// The "end of message" icon - a plain filled 2x2 square, drawn on GRP1 (its
// own COLUP1, independent of the up/down arrows' COLUP0 on GRP0) with a
// corrective HMOVE (see buildTextScrollCursorOverride) pulling it back in
// line with the down arrow's own position. Fixed, not user-editable like
// the up/down glyph - a much smaller, simpler shape that doesn't need its
// own Font Editor tile.
export const END_ICON_BYTE = '%11000000';

// The scroll cursor's own blink speed (Text tab's own "Blink speed" field,
// shown next to "Show a scroll cursor" only while that's on) - stored
// directly as the frames-per-phase value, always a power of 2 (see
// buildTextScrollCursorOverride's own blinkMask param above): framecounter's
// bit for that value is ANDed against every frame, toggling every N frames -
// a HIGHER value means a SLOWER blink (each on/off phase lasts longer). Only
// powers of 2 are valid - anything else wouldn't correspond to a single
// framecounter bit at all. "never" is a special case - not a mask at all,
// it means the cursor never blinks off (see resolveBlinkMask/
// buildTextScrollCursorOverride's own "no blink check at all" path below) -
// first in the list and the default, since a non-blinking cursor is the
// simpler, less surprising default behavior.
export const BLINK_SPEED_OPTIONS = [
  {value: 'never', text: 'Never'},
  {value: 8, text: '8 frames'},
  {value: 16, text: '16 frames'},
  {value: 32, text: '32 frames'},
  {value: 64, text: '64 frames'},
  {value: 128, text: '128 frames'},
];
export const DEFAULT_BLINK_SPEED = 'never';

// Resolves a stored blink-speed value (config.textScrollCursorBlinkSpeed) to
// its own "$XX" asm literal, or null for "never"/an unset/invalid value
// (e.g. an older saved project from before this field existed) - null tells
// buildTextScrollCursorOverride to skip the blink check entirely rather than
// AND against some mask, since "never blink" isn't representable as any
// single framecounter bit.
export const resolveBlinkMask = (value) => {
  const option = BLINK_SPEED_OPTIONS.find((o) => o.value === value && typeof o.value === 'number');
  return option ? '$' + option.value.toString(16).toUpperCase().padStart(2, '0') : null;
};

/**
 * Fills in a usable cursor shape - the stored one if it's shaped as
 * expected, otherwise DEFAULT_TEXT_CURSOR (same "validate shape, else fall
 * back" pattern as processTextFontDefaults above). Synchronous (unlike
 * processTextFontDefaults/getDefaultTextFont) - there's no pristine file to
 * parse a default out of, since this shape never existed in the vendored
 * text12b.asm at all.
 * @param {*} storage Text font storage, or its value.
 * @return {!Array<!Array<number>>} TEXT_CURSOR_HEIGHT x TEXT_CURSOR_WIDTH.
 */
export const processCursorGlyphDefaults = (storage) => {
  const stored = storage && ('value' in storage ? storage.value : storage);
  const cursor = stored && stored.cursor;
  const isValid = Array.isArray(cursor) && cursor.length === TEXT_CURSOR_HEIGHT &&
    cursor.every((row) => Array.isArray(row) && row.length === TEXT_CURSOR_WIDTH);
  return isValid ? cursor : DEFAULT_TEXT_CURSOR.map((row) => row.slice());
};

/**
 * Packs the cursor's own 2x4 pixel matrix into the single byte
 * buildTextScrollCursorOverride below splices into text12b.asm as a literal
 * "lda #%XXXXXXXX" - row 0 in the high nibble, row 1 in the low nibble, each
 * the shape's own full 4 bits wide (see TEXT_CURSOR_WIDTH's own comment for
 * why this doesn't need left_text/right_text's half-nibble reservation).
 * @param {!Array<!Array<number>>} cursor TEXT_CURSOR_HEIGHT x TEXT_CURSOR_WIDTH.
 * @return {string} An assembly "%XXXXXXXX" byte literal.
 */
export const packCursorGlyphByte = (cursor) => {
  const rowBits = (row) => (row || []).map((pixel) => (pixel ? '1' : '0')).join('').padEnd(4, '0');
  return `%${rowBits(cursor[0])}${rowBits(cursor[1])}`;
};

const nibbleBits = (row) => row.map((pixel) => pixel ? '1' : '0').join('');

/**
 * Builds a text12b.asm override with the user's own drawn glyphs spliced
 * into the left_text/right_text tables, for hooks/rom.js to place as a
 * sibling of the compiled source (the same mechanism buildScoreFontOverride
 * in utils/score-font.js already uses for score_graphics.asm). Returns null
 * whenever nothing has actually been customized yet (no Text Font Editor
 * card has ever written to storage), or if the bundled text12b.asm isn't
 * shaped as expected - either way, the caller keeps using the stock,
 * unmodified file.
 * @return {!Promise<?string>}
 */
export const buildTextFontOverride = async () => {
  let stored;
  try {
    stored = useTextFontStorage().value;
  } catch (e) {
    console.error('Error loading the text font from local storage', e);
    return null;
  }
  const glyphs = stored && stored.glyphs;
  if (!Array.isArray(glyphs) || glyphs.length !== TEXT_GLYPH_COUNT) return null;

  const pristine = await getPristineText12b();
  const leftStart = findLeftTextStart(pristine);
  const heightAt = leftStart >= 0 ? pristine.indexOf(HEIGHT_LABEL, leftStart) : -1;
  const rightStart = heightAt >= 0 ? pristine.indexOf(RIGHT_TABLE_LABEL, heightAt) : -1;
  if (leftStart < 0 || heightAt < 0 || rightStart < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    return null;
  }

  // Each glyph's row is a single shared 4-bit pattern - left_text always
  // stores it left-aligned into the byte's high nibble (the low nibble
  // always 0), right_text stores that exact same pattern right-aligned into
  // the low nibble instead (the high nibble always 0) - see this file's own
  // top comment for why the kernel needs both.
  const leftValues = [];
  const rightValues = [];
  glyphs.forEach((rows) => {
    rows.forEach((row) => {
      const bits = nibbleBits(row);
      leftValues.push(bits + '0000');
      rightValues.push('0000' + bits);
    });
  });

  const leftSection = replaceByteValues(pristine.slice(leftStart, heightAt), leftValues);
  const rightSection = replaceByteValues(pristine.slice(rightStart), rightValues);

  return pristine.slice(0, leftStart) + leftSection +
    pristine.slice(heightAt, rightStart) + rightSection;
};

// A fixed, unique comment text12b.asm itself carries right after
// "textrowsdone"'s own GRP0/GRP1/NUSIZ0/NUSIZ1/VDELP0/VDELP1 cleanup (see the
// vendored file directly) - the splice point for the "more below" scroll
// cursor below. Deliberately NOT a bare "left_text"-style anchor - this text
// only ever appears once, as a plain comment, so a simple indexOf is safe
// (no CRLF-vs-LF concern either, since nothing here needs to match ACROSS a
// line break the way the glyph table anchors do).
const SCROLL_CURSOR_ANCHOR = 'vcs-game-maker scroll-cursor hook';

// Same reasoning as SCROLL_CURSOR_ANCHOR above, but for row 2's own color -
// see its own comment in text12b.asm, right after "gotrow2base".
const ROW2_COLOR_ANCHOR = 'vcs-game-maker row2-color hook';

/**
 * Splices row 2's own color set into text12b.asm, right after its own fixed
 * anchor comment (see ROW2_COLOR_ANCHOR above) - a plain "pha/lda <var>/sta
 * COLUP0/sta COLUP1/pla" run right before row 2's own "jsr showtextrow",
 * saving/restoring A (row 2's base offset into text_strings, needed
 * untouched by showtextrow) around the color set. Only ever called when row
 * 2 is actually used (see hooks/rom.js) - like buildTextScrollCursorOverride
 * below, there's no separate "customized or not" gate here to return null
 * from.
 * @param {string} text12b Either the pristine file, or an earlier override's
 *     own output - either way, its anchor comment is untouched by that.
 * @param {{colorVarName: string}} params colorVarName is
 *     textRow2ColorVarName's own REAL resolved symbol name for this build,
 *     routed through the ordinary letter/Superchip-var pool (settable via
 *     the "Text: set row 2 color" block) - see buildTextScrollCursorOverride's
 *     own doc comment below for why hooks/rom.js has to resolve this rather
 *     than a standalone util module doing it.
 * @return {string}
 */
export const buildTextRow2ColorOverride = (text12b, {colorVarName}) => {
  const anchorAt = text12b.indexOf(ROW2_COLOR_ANCHOR);
  const insertAt = anchorAt >= 0 ? text12b.indexOf('\n', anchorAt) : -1;
  if (insertAt < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    return text12b;
  }
  // $01 is the "never explicitly set" sentinel (see textRow2ColorVarName's
  // own comment in generators/bbasic/text-minikernel.js) - real color bytes
  // are always even (colorByteToBBasic masks off bit 0), so $01 can never
  // collide with an actual chosen color. Row 2 then just follows TextColor
  // directly until a "Text: set color" block explicitly targets row 2 (or
  // "both", which still only ever writes TextColor - "both" relies on this
  // same fallback rather than writing its own copy into row 2's var at
  // all), including tracking any later change to TextColor (a fade, or
  // another row-1/both color set) automatically, the way a real single
  // shared color would.
  const asm = [
    '',
    '        pha',
    `        lda ${colorVarName}`,
    '        cmp #$01',
    '        bne _tr2_use_own',
    '        lda TextColor',
    '_tr2_use_own',
    '        sta COLUP0',
    '        sta COLUP1',
    '        pla',
  ].join('\n');
  return text12b.slice(0, insertAt) + asm + text12b.slice(insertAt);
};

/**
 * Splices the "more below" scroll cursor's own drawing code into
 * text12b.asm, right after its own fixed anchor comment. Reuses GRP0 on 3
 * dedicated extra scanlines (a real pixel row, a blank scanline between -
 * matching how every other glyph in this kernel renders in-game - then the
 * second real row), the exact same "player0 is already free here" premise
 * the rest of this kernel already depends on for its real characters. Only
 * ever called when the feature is actually on (see hooks/rom.js) - unlike
 * buildTextFontOverride above, there's no separate "customized or not" gate
 * here to return null from.
 *
 * Cycle-exactness (the reason buildTextFontOverride's own glyph edits are
 * pure byte swaps, never touching code) genuinely doesn't matter for this
 * one: every new scanline below is its own fresh WSYNC boundary doing only a
 * handful of cycles' worth of work, with nothing after it depending on a
 * precise cycle count the way the tight, interleaved character-drawing loop
 * above it does - if this "spillover" logic (running before its own first
 * WSYNC) takes a little long, the worst case is quietly consuming one more
 * invisible overscan-adjacent cycle window, never misaligned pixels.
 *
 * @param {string} text12b Either the pristine file, or buildTextFontOverride's
 *     own output - either way, its anchor comment is untouched by that.
 * @param {{glyphByte: string, linesMaxVarName: string, linesBaseVarName: string,
 *     colorVarName: string, endColorVarName: string, blinkMask: string}}
 *     params glyphByte is a "%XXXXXXXX" literal (see packCursorGlyphByte
 *     above), reused for both the down arrow (drawn as stored) and the up
 *     arrow (the same shape, drawn with its two rows swapped - a vertical
 *     flip, not a separate glyph). linesMaxVarName/linesBaseVarName/
 *     colorVarName/endColorVarName are _textLinesMax/_textLinesBase/
 *     textScrollCursorColorVarName/textEndIconColorVarName's own REAL
 *     resolved symbol names for this build (routed through the ordinary
 *     letter/Superchip-var pool, never a fixed name - unlike TextIndex/
 *     TextRow2Active/framecounter, which this can reference directly by
 *     their own real, unchanging names) - the caller (hooks/rom.js) resolves
 *     these via Blockly.BBasic.nameDB_ right after the same regenerateCode()
 *     call that already resolved them for the real generated source, since a
 *     standalone util module has no live access to that resolver on its own.
 *     colorVarName/endColorVarName are settable at runtime via the "Text:
 *     set scroll cursor color"/"Text: set end icon color" blocks, unlike
 *     glyphByte (fixed once compiled, from the Text Minikernel Font card).
 *     blinkMask is a "$XX" literal ANDed against framecounter to decide the
 *     blink phase (see BLINK_SPEED_MASKS below) - a single bit of
 *     framecounter toggling every N frames, so a HIGHER bit (bigger mask
 *     value) means a SLOWER blink (each phase lasts longer).
 * @return {string}
 */
export const buildTextScrollCursorOverride = (
    text12b, {glyphByte, linesMaxVarName, linesBaseVarName, colorVarName, endColorVarName, blinkMask}) => {
  const anchorAt = text12b.indexOf(SCROLL_CURSOR_ANCHOR);
  const insertAt = anchorAt >= 0 ? text12b.indexOf('\n', anchorAt) : -1;
  if (insertAt < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    return text12b;
  }

  // Both rows' final GRP0 byte only ever depends on two things: the fixed,
  // compile-time glyph shape (glyphByte - never changes at runtime, only
  // ever set once from the Text Minikernel Font card) and which of the 4
  // up/down combinations is currently active (a runtime decision). Since
  // that's only 4 possibilities, all 4 outcomes per row can be precomputed
  // right here in JS and stored as a tiny ROM table - replacing the runtime
  // branch tree (mask/shift/OR, checked by hand earlier for ~45-60 worst-
  // case cycles per row) with one indexed load (~5 cycles) once the index
  // itself is built. Table order matches index = (up << 1) | down: [neither
  // shown, down solo, up solo, both/shared].
  const parseByteLiteral = (literal) => parseInt(literal.slice(1), 2);
  const toByteLiteral = (value) => '%' + (value & 0xFF).toString(2).padStart(8, '0');
  const g = parseByteLiteral(glyphByte);
  const highNibble = g & 0xF0;
  const lowNibble = g & 0x0F;
  // Row 0: up's own contribution (when shown) is the glyph's low nibble
  // (its stored row 1, for the vertical flip) shifted into the high nibble;
  // down's is the glyph's high nibble either as-is (solo) or shifted into
  // the low nibble (shared, alongside up).
  const row0Table = [
    0,
    highNibble,
    (lowNibble << 4) & 0xFF,
    ((lowNibble << 4) | (highNibble >> 4)) & 0xFF,
  ].map(toByteLiteral);
  // Row 1: the mirror image - up's contribution is the high nibble as-is,
  // down's is the low nibble either shifted up (solo) or as-is (shared) -
  // shared for row 1 happens to equal the glyph byte itself unchanged
  // (high nibble | low nibble = the whole byte).
  const row1Table = [
    0,
    (lowNibble << 4) & 0xFF,
    highNibble,
    g,
  ].map(toByteLiteral);

  // blinkMask null means "never blink" (see resolveBlinkMask above) - the
  // check itself (not just its mask value) has to be skipped, since there's
  // no framecounter bit that's "always 1."
  const blinkCheckLines = (skipLabel) => blinkMask == null ? [] : [
    '    lda framecounter',
    `    and #${blinkMask}`,
    `    beq ${skipLabel}`,
  ];

  const asm = [
    '',
    // Both tables above, skipped over (never executed as code) - referenced
    // by the indexed loads further down via "lda _tsc_rowN_table,x".
    '    jmp _tsc_after_tables',
    '_tsc_row0_table',
    `    .byte ${row0Table.join(', ')}`,
    '_tsc_row1_table',
    `    .byte ${row1Table.join(', ')}`,
    '_tsc_after_tables',
    // Down arrow: shown while there's more below to reach with "Scroll text
    // lines down" - _textLinesMax is already the highest value TextIndex
    // itself can hold (see setTextLinesRangeCode's own
    // "lineCount - (wrapToLine2 ? 2 : 1)" formula in generators/bbasic/
    // text-minikernel.js) - that formula's own "-2" already accounts for
    // row 2 being shown alongside row 1, so a plain TextIndex/_textLinesMax
    // compare works the same whether TextRow2Active is set or not.
    '    ldx #0',
    '    lda TextIndex',
    `    cmp ${linesMaxVarName}`,
    '    bcs _tsc_downdecided',
    ...blinkCheckLines('_tsc_downdecided'),
    '    ldx #1',
    '_tsc_downdecided',
    '    stx scorepointers+0',
    // Ends the pre-existing tight scanline (shared with textrowsdone's own
    // cleanup) right where the original single-arrow version always did -
    // everything below runs on its own fresh scanlines instead of adding
    // more work here, since this one has no slack to spare (an earlier
    // attempt at extra precompute work here caused real frame-timing
    // corruption - see this function's own history).
    '    sta WSYNC',
    // The end icon's own flag - deliberately NOT the same as the down
    // arrow's own scorepointers+0 (which also blinks off while there's
    // still more below, same on/off cycle the arrow itself uses) - the end
    // icon needs a steady "is there structurally nothing left" check with
    // no blink mixed in, or it would flicker on during the down arrow's own
    // off phase even with more content still left to scroll to (a real
    // reported bug). Reuses the carry flag from the down-decision's own
    // "cmp linesMaxVarName" above (the SAME comparison) instead of redoing
    // it - nothing between there and here touches carry (LDA/AND/branches/
    // LDX/STX/a plain STA WSYNC all leave it alone), so it's still exactly
    // "TextIndex >= linesMax" from that original compare.
    '    ldx #1',
    '    bcc _tsc_hasmore_far',
    '    ldx #0',
    '_tsc_hasmore_far',
    '    stx scorepointers+5',
    // Up arrow: shown while there's more above to reach with "Scroll text
    // lines up" - _textLinesBase is the lowest value TextIndex can hold for
    // the message currently shown, so TextIndex is only ever equal to it
    // (nothing more above) or greater (more above).
    '    ldx #0',
    '    lda TextIndex',
    `    cmp ${linesBaseVarName}`,
    '    beq _tsc_updecided',
    ...blinkCheckLines('_tsc_updecided'),
    '    ldx #1',
    '_tsc_updecided',
    '    stx scorepointers+1',
    // Both rows' final GRP0 byte is now a single table lookup (see
    // row0Table/row1Table above) instead of a branch tree - just needs a
    // 2-bit index built from the up/down flags: (up << 1) | down, matching
    // each table's own [neither, down solo, up solo, shared] order. Cheap
    // enough to compute right here alongside the up-decision, rather than
    // needing its own dedicated scanline the way the old branchy version
    // did. Left in X (not stashed to scratch RAM) - nothing between here and
    // the indexed loads below touches X, and WSYNC itself never touches any
    // CPU register, so it survives the scanline boundary for free.
    '    lda scorepointers+1',
    '    asl',
    '    ora scorepointers+0',
    '    tax',
    '    sta WSYNC',
    // GRP1 sits ~10 color clocks right of GRP0 by default (RESP1 strobes 3
    // CPU cycles after RESP0, plus a 1-clock difference between HMP0/HMP1's
    // own original fine-adjust) - an earlier version corrected this with an
    // HMCLR/HMP1/HMOVE sequence, but HMOVE applying any nonzero motion
    // causes a real, unavoidable "comb" glitch (a black patch on that
    // scanline's left edge). A plain RESP1 re-strobe, on its own dedicated
    // scanline, moves it instead without touching any HM register at all -
    // no glitch, just coarser control (3-pixel/1-CPU-cycle steps, since
    // that's what one fewer cycle of "sleep" before the strobe buys) rather
    // than HMOVE's single-pixel fine adjustment. The exact same cycle offset
    // from a fresh WSYNC always lands on the same physical screen column
    // regardless of which scanline it's on - "sleep 45" here reproduces
    // roughly the same column minikernel's own original RESP1 strobe did
    // (cycle 46 there, see text12a.asm), one cycle (3 pixels) earlier to
    // nudge it left.
    '    sleep 40',
    '    sta RESP1',
    '    sta WSYNC',
    // Both rows' table lookups (same index, still in X from before - see
    // its own comment above), the end icon's own byte, and both colors -
    // all still comfortably inside one scanline's budget now that the old
    // branch trees are gone.
    '    lda _tsc_row0_table,x',
    '    sta scorepointers+2',
    '    lda _tsc_row1_table,x',
    '    sta scorepointers+3',
    // The end icon's own byte (GRP1, shared by both rows - a plain filled
    // square, same shape either row) - shown whenever there's structurally
    // nothing left below (scorepointers+5 - see its own comment above;
    // deliberately not the down arrow's own blinking flag).
    '    lda #0',
    '    ldx scorepointers+5',
    '    cpx #0',
    '    bne _tsc_endzero',
    `    lda #${END_ICON_BYTE}`,
    '_tsc_endzero',
    '    sta scorepointers+4',
    // The cursor's own color ("Text: set scroll cursor color" block) and
    // the end icon's own ("Text: set end icon color") - COLUP0/COLUP1 stay
    // put across scanlines until something else writes them, so setting
    // them here (rather than on the draw scanlines themselves) costs
    // nothing extra there.
    `    lda ${colorVarName}`,
    '    sta COLUP0',
    `    lda ${endColorVarName}`,
    '    sta COLUP1',
    '    sta WSYNC',
    // Row 0 draw: plain bare loads/stores, same fast timing the original
    // single-arrow version always used - no HMOVE needed (see this
    // function's own history for why GRP1 is left at its natural position).
    '    lda scorepointers+2',
    '    sta GRP0',
    '    lda scorepointers+4',
    '    sta GRP1',
    '    sta WSYNC',
    '    lda #0',
    '    sta GRP0',
    '    sta GRP1',
    '    sta WSYNC',
    // Row 1 draw: likewise bare.
    '    lda scorepointers+3',
    '    sta GRP0',
    '    lda scorepointers+4',
    '    sta GRP1',
    // Row 1's write can leave GRP0/GRP1 holding a nonzero shape - nothing
    // else clears them before whatever draws next (e.g. a top-of-screen
    // status area also using GRP0/GRP1), so without this it can smear the
    // cursor's leftover pixels into that unrelated drawing until the next
    // frame's own gameplay code re-establishes them from scratch. Needs its
    // own fresh WSYNC first - without one, this zero-write happens on the
    // very same scanline as row 1's own draw above, stomping it before the
    // beam even finishes sweeping across that line (row 1 never actually
    // became visible - only row 0 did).
    '    sta WSYNC',
    '    lda #0',
    '    sta GRP0',
    '    sta GRP1',
  ].join('\n');

  return text12b.slice(0, insertAt) + asm + text12b.slice(insertAt);
};
