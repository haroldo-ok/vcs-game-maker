import {SCORE_FONTS} from '../generators/score-fonts';
import {getExtendedScoreGraphics} from '../generators/bbasic/text-minikernel-files';
import {useConfigurationStorage, useScoreFontStorage, useSquishCustomScoreFontStorage} from '../hooks/project';

export const CUSTOM_SCORE_FONT = 'custom';
// A special option, not one of SCORE_FONTS' byte-swappable presets: SQUISH
// is a compressed (4-row instead of 8-row) digit style baked into the Text
// Minikernel's extended score_graphics.asm (see text-minikernel-files.js),
// selected via "const fontstyle = SQUISH" rather than swapping digit bytes -
// see buildScoreFontOverride and hooks/rom.js's own handling of this value.
// Independent of whether the Text Minikernel is actually in use: picking
// this font is what shrinks the score row, not using the Text Minikernel
// itself, so the two can be chosen separately.
export const SQUISH_SCORE_FONT = 'SQUISH';
// Squish, but starting from its own compact digit shapes and then editable
// like Custom, instead of Squish's fixed built-in bitmap - only offered when
// the Text Minikernel is in use, same as plain Squish (see
// ScoreFontEditor.vue).
export const SQUISH_CUSTOM_SCORE_FONT = 'SQUISH_CUSTOM';
// 16, not 10 - a score digit is a plain 4-bit nibble (0-15), and the
// standard kernel's own drawing routine indexes straight into the glyph
// table with no bounds check (confirmed directly: the bundled "hex" preset
// ships all 16 defined, no special flag needed for the plain, non-Squish
// path - see buildScoreFontOverride's own comment). Only the CUSTOM and
// SQUISH_CUSTOM fonts actually offer editing all 16 slots (see
// ScoreFontEditor.vue) - every other font (a preset, or plain Squish) only
// ever has its own fixed 10 real digits, so this being 16 project-wide just
// means "the biggest a font CAN be," not that every font uses all of it.
export const DIGIT_COUNT = 16;
// How many of DIGIT_COUNT's own slots are the "real," always-relevant
// decimal digits (0-9) - the other 6 (10-15) are optional extra glyphs
// (hex-digit-style, but usable for anything - arrows, icons, whatever an
// 8x8 shape can represent) only actually spliced into the compiled ROM for
// CUSTOM/SQUISH_CUSTOM (see buildScoreFontOverride/
// buildSquishScoreFontOverride), and only reachable in-game via
// score_digit_set/score_digit_change writing a raw nibble 10-15 - ordinary
// BCD score arithmetic (score = score + N) can never produce one.
export const DECIMAL_DIGIT_COUNT = 10;
export const DIGIT_WIDTH = 8;
export const DIGIT_HEIGHT = 8;
const DIGIT_BYTES = DIGIT_COUNT * DIGIT_HEIGHT;
// Squish only reads the bottom 5 rows of each digit at runtime (text12a.asm:
// "ldy #scorecount" with scorecount=4, then reads that many bytes plus one -
// 5 total - counting down to 0), so Squish Custom's editor is 5 rows tall
// instead of the usual 8, and the unread top 3 rows are padded back in with
// zero bytes (padSquishDigitBytes below) before splicing into
// score_graphics.asm, which still expects 8 bytes per digit either way.
export const SQUISH_DIGIT_HEIGHT = 5;

const DIGITS_START = 'scoretable';
// The digits run from the scoretable label to the trailing ORG block.
const DIGITS_END = 'ifconst ROM2k';

// The score digit bytes the bundled compiler's stock score_graphics.asm
// ships with (public/bb19/includes/score_graphics.asm), extracted once ahead
// of time rather than read at runtime - this needs to be available
// synchronously (ScoreFontEditor.vue seeds its pixel editor from it on
// mount), and these bytes are a fixed part of the standard kernel, not
// something that varies by build.
export const DEFAULT_SCORE_FONT = [
  '%00111100', '%01100110', '%01100110', '%01100110', '%01100110', '%01100110', '%01100110', '%00111100',
  '%01111110', '%00011000', '%00011000', '%00011000', '%00011000', '%00111000', '%00011000', '%00001000',
  '%01111110', '%01100000', '%01100000', '%00111100', '%00000110', '%00000110', '%01000110', '%00111100',
  '%00111100', '%01000110', '%00000110', '%00000110', '%00011100', '%00000110', '%01000110', '%00111100',
  '%00001100', '%00001100', '%01111110', '%01001100', '%01001100', '%00101100', '%00011100', '%00001100',
  '%00111100', '%01000110', '%00000110', '%00000110', '%00111100', '%01100000', '%01100000', '%01111110',
  '%00111100', '%01100110', '%01100110', '%01100110', '%01111100', '%01100000', '%01100010', '%00111100',
  '%00110000', '%00110000', '%00110000', '%00011000', '%00001100', '%00000110', '%01000010', '%00111110',
  '%00111100', '%01100110', '%01100110', '%01100110', '%00111100', '%01100110', '%01100110', '%00111100',
  '%00111100', '%01000110', '%00000110', '%00111110', '%01100110', '%01100110', '%01100110', '%00111100',
  // Slots 10-15: the extra, optional glyphs beyond the normal 0-9 digits
  // (see DECIMAL_DIGIT_COUNT's own comment) - blank/empty by default
  // (every pixel off), matching how a freshly-added frame/graphic starts
  // everywhere else in this app (Player/Background). Not seeded with the
  // bundled "hex" preset's own A-F shapes either, since there's no
  // guarantee a project using these wants hex digits specifically rather
  // than some other custom glyph.
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
];

// Squish's own digit bitmaps (score_graphics_extended.asm's "if fontstyle ==
// SQUISH" block) - just the 5 meaningful rows per digit (the trailing 3 rows
// in the actual .asm file are always zero padding, never read at runtime -
// see SQUISH_DIGIT_HEIGHT above), so this seeds "Squish Custom" the same way
// DEFAULT_SCORE_FONT seeds the regular Custom font. Extracted once ahead of
// time (same reason as DEFAULT_SCORE_FONT) rather than parsed from the
// extended file at runtime.
export const SQUISH_DEFAULT_SCORE_FONT = [
  '%00111100', '%01100110', '%01100110', '%01100110', '%00111100',
  '%01111110', '%00011000', '%00011000', '%00111000', '%00011000',
  '%01111110', '%01100000', '%00111100', '%00000110', '%01111100',
  '%01111100', '%00000110', '%00011100', '%00000110', '%01111100',
  '%00001100', '%01111110', '%01001100', '%00101100', '%00011100',
  '%01111100', '%00000110', '%00111100', '%01100000', '%01111110',
  '%00111100', '%01100110', '%01111100', '%01100000', '%00111100',
  '%00110000', '%00011000', '%00001100', '%00000110', '%01111110',
  '%00111100', '%01100110', '%00111100', '%01100110', '%00111100',
  '%00111100', '%00000110', '%00111110', '%01100110', '%00111100',
  // Slots 10-15: same "blank/empty by default" reasoning as
  // DEFAULT_SCORE_FONT's own extra slots.
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
  '%00000000', '%00000000', '%00000000', '%00000000', '%00000000',
];

/**
 * Converts a font's assembly bytes into one pixel matrix per digit.
 *
 * batari Basic stores score digits bottom-up, the same way it stores sprites,
 * so the rows are flipped to give the editor its usual top-down view.
 * @param {!Array<string>} bytes DIGIT_COUNT * height "%00111100" style rows.
 * @param {number=} height Rows per digit. Defaults to DIGIT_HEIGHT (8) - pass
 *     SQUISH_DIGIT_HEIGHT (5) for Squish Custom.
 * @return {!Array<!Array<!Array<number>>>} Ten height*8 matrices.
 */
export const fontToDigits = (bytes, height = DIGIT_HEIGHT) => {
  const digits = [];
  for (let i = 0; i < DIGIT_COUNT; i++) {
    const rows = bytes.slice(i * height, (i + 1) * height)
        .map((byte) => byte.replace('%', '').split('').map(Number));
    digits.push(rows.reverse());
  }
  return digits;
};

/**
 * Inverse of fontToDigits.
 * @param {!Array<!Array<!Array<number>>>} digits Ten height*8 matrices.
 * @return {!Array<string>} DIGIT_COUNT * height "%00111100" style rows.
 */
export const digitsToFont = (digits) => digits
    .map((rows) => rows.slice().reverse()
        .map((row) => '%' + row.map((pixel) => pixel ? 1 : 0).join('')))
    .reduce((all, rows) => all.concat(rows), []);

/**
 * Fills in a usable custom font, seeded from the given default digits (the
 * regular Custom font's DEFAULT_SCORE_FONT, unless a caller passes Squish
 * Custom's SQUISH_DEFAULT_SCORE_FONT instead).
 * @param {*} storage Score font storage, or its value.
 * @param {!Array<string>=} fallbackFont Defaults to DEFAULT_SCORE_FONT.
 * @param {number=} height Rows per digit for both the stored and fallback
 *     digits - see fontToDigits. Defaults to DIGIT_HEIGHT (8).
 * @return {{digits: !Array<!Array<!Array<number>>>}} Custom font state.
 */
export const processScoreFontDefaults = (storage, fallbackFont = DEFAULT_SCORE_FONT, height = DIGIT_HEIGHT) => {
  const stored = storage && ('value' in storage ? storage.value : storage);
  const digits = stored && stored.digits;
  if (!Array.isArray(digits) || digits.length !== DIGIT_COUNT || digits[0].length !== height) {
    return {digits: fontToDigits(fallbackFont, height)};
  }
  return {digits};
};

// Every Custom/Squish Custom font is stored with all DIGIT_COUNT (16) slots
// (see processScoreFontDefaults), so digitsToFont always returns the full
// 128-byte shape regardless of whether glyphs 10-15 are actually wanted -
// this is a plain, explicit, user-facing toggle (see ScoreFontEditor.vue's
// own "Use extra glyphs (10-15)" checkbox) rather than an implicit "scan
// the pixels for anything non-blank" guess: the earlier pixel-scanning
// version silently kept including a project's already-drawn extra glyphs
// forever with no way to opt back OUT of paying for them short of erasing
// the artwork, and silently started including them the moment a user drew
// even a single pixel with no visibility into the ROM-size tradeoff they'd
// just made. An explicit stored flag makes that a deliberate choice
// instead, and the editor hides the extra glyph cards entirely whenever
// it's off, matching "not shown" with "not compiled in" exactly. Defaults
// to false (the same cost every Custom/Squish Custom font always had
// before glyphs 10-15 existed) rather than true, so a project that's never
// visited this toggle keeps paying nothing extra - confirmed as necessary
// after this exact unconditional cost (this toggle's own predecessor: an
// earlier version of buildScoreFontOverride that always spliced all 128
// bytes, no toggle or detection at all) tipped an already-tight, previously
// -working project into a real overflow/relocator-thrashing build failure.
export const customScoreFontExtraGlyphsEnabled = () => {
  try {
    return !!(useConfigurationStorage().value || {}).scoreFontExtraGlyphsEnabled;
  } catch (e) {
    console.error('Error loading configuration from local storage', e);
    return false;
  }
};

const trimUnusedExtraGlyphs = (bytes) => {
  const decimalByteCount = DECIMAL_DIGIT_COUNT * DIGIT_HEIGHT;
  return customScoreFontExtraGlyphsEnabled() ? bytes : bytes.slice(0, decimalByteCount);
};

const customFontBytes = () => {
  try {
    return trimUnusedExtraGlyphs(digitsToFont(processScoreFontDefaults(useScoreFontStorage()).digits));
  } catch (e) {
    console.error('Error loading the custom score font', e);
    return null;
  }
};

// Pads each digit's 5 read rows back out to the 8 bytes score_graphics.asm's
// table needs (the top 3, which Squish never reads at runtime - see
// SQUISH_DIGIT_HEIGHT - are always blank).
const padSquishDigitBytes = (bytes) => {
  const padded = [];
  for (let i = 0; i < DIGIT_COUNT; i++) {
    padded.push(...bytes.slice(i * SQUISH_DIGIT_HEIGHT, (i + 1) * SQUISH_DIGIT_HEIGHT));
    padded.push('%00000000', '%00000000', '%00000000');
  }
  return padded;
};

const customSquishFontBytes = () => {
  try {
    const digits = processScoreFontDefaults(
        useSquishCustomScoreFontStorage(), SQUISH_DEFAULT_SCORE_FONT, SQUISH_DIGIT_HEIGHT).digits;
    return trimUnusedExtraGlyphs(padSquishDigitBytes(digitsToFont(digits)));
  } catch (e) {
    console.error('Error loading the custom Squish score font', e);
    return null;
  }
};

// Used by generators/bbasic.js to decide whether to emit "const font = hex"
// (plain Custom) or "const fontcharsHEX = 1" (Squish Custom) - both only
// actually needed once customScoreFontExtraGlyphsEnabled's own toggle is on,
// not just because Custom/Squish Custom is the SELECTED font. Reuses the
// exact same trimmed byte arrays buildScoreFontOverride/
// buildSquishScoreFontOverride themselves splice from, rather than
// re-deriving the answer a second way, so the two can never disagree about
// whether this build is paying the extra-glyph cost.
export const customScoreFontUsesExtraGlyphs = (font) => {
  const decimalByteCount = DECIMAL_DIGIT_COUNT * DIGIT_HEIGHT;
  const bytes = font === SQUISH_CUSTOM_SCORE_FONT ? customSquishFontBytes() : customFontBytes();
  return !!bytes && bytes.length > decimalByteCount;
};

let pristineScoreGraphicsPromise = null;
const getPristineScoreGraphics = () => {
  if (!pristineScoreGraphicsPromise) {
    pristineScoreGraphicsPromise = fetch('bb19/includes/score_graphics.asm').then((r) => r.text());
  }
  return pristineScoreGraphicsPromise;
};

// Squish Custom splices into the extended score_graphics.asm's own "if
// fontstyle == SQUISH" digit table instead of the stock file's plain
// "scoretable" - it needs the extended file's fontstyle/SQUISH constants
// (defined there, not in the stock file) for text12a.asm's own
// "ifconst fontstyle: ifconst SQUISH: if fontstyle == SQUISH: scorecount=4"
// check to still shrink the row height. The decimal digit bytes run from
// right after that block's own "LENDEC = 80" line to its "ifconst
// fontcharsHEX" gate - and, now that DIGIT_COUNT includes the 6 extra
// slots (10-15, see DECIMAL_DIGIT_COUNT's own comment), THOSE get spliced
// into that same gated block's own byte region too (right after its
// "LENHEX = 48" line, up to its "else"), replacing the stock hex digits
// there with whatever the user drew instead. Left INERT unless
// "fontcharsHEX" is actually const-defined elsewhere in the compiled
// source (see generators/bbasic.js's own scoreFontExtraGlyphsConfigurationCode) -
// splicing the bytes in here alone doesn't activate that gate by itself.
const buildSquishScoreFontOverride = async (digits) => {
  const decimalByteCount = DECIMAL_DIGIT_COUNT * DIGIT_HEIGHT;
  // Same "either the plain 80-byte shape, or the full 128 with extra glyphs
  // actually in use" acceptance as buildScoreFontOverride below - digits is
  // already trimmed back to 80 by customScoreFontUsesExtraGlyphs' shared
  // trimUnusedExtraGlyphs whenever glyphs 10-15 are still all blank, so this
  // has to accept that shorter shape too, not just DIGIT_BYTES.
  if (!digits || (digits.length !== decimalByteCount && digits.length !== DIGIT_BYTES)) return null;

  const extended = await getExtendedScoreGraphics();
  const squishBlockStart = extended.indexOf('if fontstyle == SQUISH');
  const lendecAt = squishBlockStart >= 0 ? extended.indexOf('LENDEC = 80', squishBlockStart) : -1;
  const bytesStart = lendecAt >= 0 ? lendecAt + 'LENDEC = 80'.length : -1;
  const hexGateAt = bytesStart >= 0 ? extended.indexOf('ifconst fontcharsHEX', bytesStart) : -1;
  if (bytesStart < 0 || hexGateAt < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    return null;
  }

  // digits here is already padded to 8 bytes/digit (see padSquishDigitBytes
  // - the file's own LENDEC = 80 confirms 10 digits * 8 bytes each), not
  // SQUISH_DIGIT_HEIGHT (5) - that's only the count of MEANINGFULLY-read
  // rows, the padding still needs the full 8 to match the file's own shape.
  const decimalBytes = digits.slice(0, decimalByteCount);

  // Only 80 bytes (the normal case - see customScoreFontUsesExtraGlyphs):
  // splice the decimal digits and leave the rest of the file, including its
  // own "ifconst fontcharsHEX" block, completely untouched - that block
  // only ever activates via generators/bbasic.js's own "const fontcharsHEX"
  // emission, which is gated on this exact same "extra glyphs actually in
  // use" check, so leaving its stock hex glyphs in place here is harmless:
  // nothing will ever read them.
  if (digits.length === decimalByteCount) {
    return extended.slice(0, bytesStart) + '\n\n' +
      decimalBytes.map((byte) => '       .byte ' + byte).join('\n') + '\n\n ' +
      extended.slice(hexGateAt);
  }

  const lenhexAt = extended.indexOf('LENHEX = 48', hexGateAt);
  const hexBytesStart = lenhexAt >= 0 ? lenhexAt + 'LENHEX = 48'.length : -1;
  const hexBytesEnd = hexBytesStart >= 0 ? extended.indexOf('else', hexBytesStart) : -1;
  if (hexBytesStart < 0 || hexBytesEnd < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    return null;
  }
  const extraBytes = digits.slice(decimalByteCount);

  return extended.slice(0, bytesStart) + '\n\n' +
    decimalBytes.map((byte) => '       .byte ' + byte).join('\n') + '\n\n ' +
    extended.slice(hexGateAt, hexBytesStart) + '\n\n' +
    extraBytes.map((byte) => '       .byte ' + byte).join('\n') + '\n\n ' +
    extended.slice(hexBytesEnd);
};

/**
 * Builds a score_graphics.asm override with the given batari Basic font's
 * digits swapped in, for hooks/rom.js to place as a sibling of the compiled
 * source (the same same-directory-override mechanism the Text Minikernel's
 * extended score_graphics.asm uses) - "const font" alone is inert in this
 * toolchain, since score_graphics.asm always holds the digits inline.
 * @param {string} font Font name, "custom", "SQUISH_CUSTOM", or a falsy
 *     value for the default.
 * @return {!Promise<?string>} The override content, or null to use the
 *     stock score_graphics.asm unmodified.
 */
export const buildScoreFontOverride = async (font) => {
  if (font === SQUISH_CUSTOM_SCORE_FONT) {
    return buildSquishScoreFontOverride(customSquishFontBytes());
  }

  const digits = font === CUSTOM_SCORE_FONT ?
    customFontBytes() : (font && SCORE_FONTS[font]);
  // Presets (SCORE_FONTS) are still exactly DECIMAL_DIGIT_COUNT*DIGIT_HEIGHT
  // bytes (80) - only 10 real digits, same as they've always been (see
  // generators/score-fonts.js's own comment) - only CUSTOM can actually be
  // the full DIGIT_BYTES (128, all 16 slots). Accepting either length here
  // (rather than requiring DIGIT_BYTES now that it covers 16 slots) matters:
  // rejecting the 80-byte preset case would silently stop overriding every
  // preset font at once, falling back to the stock score_graphics.asm's own
  // "ifconst font" dispatch - which this toolchain's own bundled compiler
  // doesn't actually support (see this function's own doc comment on why
  // "const font" alone is inert here), so that fallback isn't a safe no-op,
  // it's a real regression. The plain (non-Squish) drawing routine needs no
  // extra activation for a 128-byte table either way (unlike Squish's own
  // "ifconst fontcharsHEX" gate) - it just reads however many bytes are
  // actually here by raw nibble index, so an 80-byte preset naturally still
  // only ever shows its own original 10 digits, nothing missing.
  const decimalByteCount = DECIMAL_DIGIT_COUNT * DIGIT_HEIGHT;
  if (!digits || (digits.length !== decimalByteCount && digits.length !== DIGIT_BYTES)) return null;

  const pristine = await getPristineScoreGraphics();
  const headerEnd = pristine.indexOf(DIGITS_START) + DIGITS_START.length;
  const footerAt = pristine.indexOf(DIGITS_END, headerEnd);
  if (headerEnd < DIGITS_START.length || footerAt < 0) {
    // The bundled file is not shaped as expected; leave it alone rather than
    // risk corrupting the ROM layout.
    return null;
  }
  const footerStart = pristine.lastIndexOf('\n', footerAt);

  // The stock file's own preamble (right before "scoretable") sets the
  // table's own starting address several different ways depending on ROM
  // size - a plain "ORG $F7AC-8"/"ORG $FF9C" for a non-bankswitched ROM, or
  // an "ORG X-bscode_length" PAIRED WITH an independently-tracked
  // "RORG Y-bscode_length" (the runtime/relocated address DASM uses for
  // every branch/jump target from here on, distinct from ORG's own
  // physical file-offset tracking) for each bankswitched size. Extending
  // Custom past the normal 80-byte budget needs this whole start point
  // shifted EARLIER by exactly the extra byte count, so the table's END
  // still lands on the same fixed address the footer below (the reset
  // vectors, or the next bank's own trampoline) is hardcoded to expect.
  //
  // A relative "ORG . - N" (matching the stock "if font == hex" shift this
  // file, and an earlier version of this function, both used) was tried
  // and reverted here after being confirmed to still fail - isolated,
  // minimal testing (a brand-new default project, nothing else in it)
  // showed Custom + extra glyphs compiling fine on a non-bankswitched ROM
  // (4k) but failing on every bankswitched size (8k/16k/32k) with this
  // exact "Origin Reverse-indexed" error, a pattern that only makes sense
  // if the relative shift's interaction with RORG specifically is what's
  // wrong (not a genuine capacity shortfall - the failing case still had
  // thousands of bytes free elsewhere). Both "shift ORG only" (the stock
  // file's own approach) and "shift ORG and RORG both, via their own
  // relative '.'" were tried and also confirmed NOT to fix it - RORG's own
  // relationship to "." evidently doesn't compose with a later relative
  // "ORG . - N"/"RORG . - N" the way it would for a plain, non-relocated
  // ORG.
  //
  // This instead rewrites the header's OWN address expressions directly -
  // appending "-N" onto each literal "ORG expr"/"RORG expr" line here, so
  // every branch (bankswitched or not) computes its already-correct
  // ABSOLUTE target with the extra bytes baked directly in, rather than
  // adjusting it after the fact through RORG's own ambiguous relative
  // tracking. Confirmed directly this way: the exact same isolated,
  // minimal 8k project this shift's earlier "ORG . - N"/"RORG . - N"
  // attempts both failed on now compiles cleanly.
  const extraBytes = digits.length - decimalByteCount;
  const header = pristine.slice(0, headerEnd - DIGITS_START.length);
  const shiftedHeader = extraBytes > 0 ?
    header.replace(/^(\s*R?ORG\s+.+)$/gm, `$1-${extraBytes}`) : header;

  return shiftedHeader +
    pristine.slice(headerEnd - DIGITS_START.length, headerEnd) + '\n\n' +
    digits.map((byte) => '       .byte ' + byte).join('\n') + '\n' +
    pristine.slice(footerStart);
};
