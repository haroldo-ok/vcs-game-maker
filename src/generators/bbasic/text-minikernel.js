'use strict';

import {chunk} from 'lodash';

import {useConfigurationStorage} from '../../hooks/project';
import {colorByteToBuildBBasic} from '../../utils/palette';
import {fixedFreeVariable} from '../../utils/fixed-vars';
import {TEXT_MESSAGE_LENGTH, CHAR_TO_GLYPH, listTextStrings,
  resolveTextMaxDisplayWidth} from '../../blocks/text-strings';
import {functionCallDiscardVarName} from '../../blocks/function';
import {bankSuffixedTableName} from '../../blocks/data';
import {getNamedScrollLayout, registerFreeTypedScrollMessage, buildTextScrollSetupLines,
  trackTextByIdScrollUsage, textScrollFarEndVarName,
  textScrollBaseVarName, textScrollStateVarName,
  textScrollPauseOperand, textScrollTimerVarName,
  TEXT_SCROLL_DIR_MASK} from './text-scroll';
import {getStaticMessageLayout, staticMessageRegionEnd, splitMessageLines} from './text-minikernel-layout';

// Canonical dev var names for "Scroll text lines up/down" (see their
// generators below) - a message with more than 2 lines (see
// splitMessageLines in text-minikernel-layout.js) only ever shows 2 of them
// at once (TextIndex/TextIndex+TEXT_MESSAGE_LENGTH, same as any other
// wrapping message), these track the CURRENTLY shown message's  valid
// TextIndex range so the up/down blocks can clamp against it directly
// (comparing TextIndex itself, not a separate 0-based "which page" counter)
// rather than needing a multiply to convert a page number back into a byte
// offset. Plain dev-var-pool names (unlike TextIndex/TextDataPtr/
// TextRow2Active) - only ever read/written from generated bBasic, never
// from the raw text12a.asm/text12b.asm kernel files, so they don't need a
// fixed var slot.
export const textLinesBaseVarName = () => 'textLinesBase';
export const textLinesMaxVarName = () => 'textLinesMax';

// Row 2's  color (settable via the merged "Text: set color" block's
// ROW dropdown, text_minikernel_set_color below) and the scroll cursor's  color
// (via "Text: set scroll cursor color", text_minikernel_set_cursor_color
// below) - unlike TextColor (a fixed alias onto statusbarlength, a real bB
// built-in with a spare byte to reuse), there's no equivalent spare built-in
// for either of these, so each needs a real dev-var-pool slot.
// Read directly by hand-written asm (text12b.asm's "textkernel2ndrow"
// block for row 2, utils/text-font.js's buildTextScrollCursorOverride for
// the cursor) - hooks/rom.js resolves the real name via
// Blockly.BBasic.nameDB_ the same way it already does for
// textLinesMaxVarName/textLinesBaseVarName, for the same reason (see that
// function's  doc comment).
export const textRow2ColorVarName = () => 'textRow2Color';
export const textClearTimerVarName = () => 'textClearTimer';
export const textScrollCursorColorVarName = () => 'textScrollCursorColor';
// The "end of message" icon's  color (via "Text: set end icon color",
// text_minikernel_set_end_icon_color below) - the icon draws on GRP1 (its
// separate COLUP1), so it can have a different color than the up/down
// arrows on GRP0/COLUP0 - see buildTextScrollCursorOverride's  comment
// in utils/text-font.js for why it moved back to GRP1 (needing its
// repositioning HMOVE) after briefly sharing GRP0's  low nibble.
export const textEndIconColorVarName = () => 'textEndIconColor';
// The scroll cursor's  runtime show/hide flag (via "Text scroll cursor
// show or hide", text_minikernel_scroll_cursor_visible below) rides in bit 0
// of textScrollCursorColorVarName above instead of its  dev var - COLUP0
// (what that var is written straight into every frame - see
// buildTextScrollCursorOverride's  comment in utils/text-font.js) only
// ever decodes bits 1-7 on real hardware, so bit 0 has zero effect on the
// displayed color and was otherwise always 0 anyway (the "Color" picker
// block - see color_get in blocks/color.js - only ever emits even values,
// the same "real color bytes are always even" assumption
// buildTextRow2ColorOverride's $01 sentinel already relies on). 1 =
// hidden, 0 (the normal/default state) = visible.
export const TEXT_SCROLL_CURSOR_HIDDEN_BIT = 1;

// The standard kernel's  code calls "jsr minikernel" as a plain,
// same-bank call (never a bankswitched "BS_jsr") - so on a bankswitched ROM,
// text12a.asm/text12b.asm (and the data table between them) have to be
// assembled into the SAME physical bank the kernel itself lives in, not the
// default "bank 1" everything else falls into. That bank is the highest
// numbered one for the ROM size (confirmed against the assembled symbol
// table: with no explicit "bank" wrapping, minikernel/text_strings/textkernel
// landed in the default bank's  address range while drawscreen/scoretable
// - the kernel - landed in a different one; wrapping this block in
// "bank <last bank> ... bank 1" moves it to share the kernel's bank, and the
// score/text rows that were otherwise silently missing on 8k+ ROMs render
// correctly). Duplicated in miniature from hooks/rom.js's
// BANK_COUNT_BY_ROMSIZE rather than imported, to avoid pulling that module's
// heavy compiler chain into every generator file (same reasoning as
// bbasic.js's BANKSWITCHED_ROM_SIZES duplicate).
// 'dpcplus' key: DPC+'s "jsr minikernel" hook (confirmed present in
// DPCplus_kernel.asm, same plain same-bank call) has the identical
// same-bank constraint - DPC+ fixes exactly 6 addressable banks
// (bB-source-numbered 1-6 - see BANK_COUNT_BY_ROMSIZE's comment in
// hooks/rom.js for the full derivation/evidence). The other two 4K regions
// of the 32KB ROM are the graphics bank and a separate ARM-driver bank,
// neither addressable via a bBasic "bank N" tag.
const isDpcPlusConfig = () => (((useConfigurationStorage() || {}).value || {}).kernel === 'dpcplus');

const KERNEL_BANK_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8, '64k': 16, 'dpcplus': 6};

// Resolves a literal "math_number" field's  text to a real JS number, or
// null if it isn't one of the literal forms that block's  field
// validator accepts (see blocks/math.js) - decimal, $1F/0x1F hex, or
// %1010/0b1010 binary. Used by text_minikernel_show_by_id_scroll below to
// recognize "Scroll text ID [a literal number]" specifically, so that ONE
// exact entry's  maxOffset can be checked instead of falling back to
// "does anything in the whole project scroll."
const parseLiteralNumberField = (raw) => {
  const text = String(raw).trim();
  if (/^\$[0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(1), 16);
  if (/^0[xX][0-9a-fA-F]+$/.test(text)) return parseInt(text.slice(2), 16);
  if (/^%[01]+$/.test(text)) return parseInt(text.slice(1), 2);
  if (/^0[bB][01]+$/.test(text)) return parseInt(text.slice(2), 2);
  if (/^-?\d+$/.test(text)) return Number(text);
  return null;
};

// Converts text into a fixed-width row of glyph tokens for the
// "data text_strings" table: upper-cased, unsupported characters become
// spaces, and the result is always exactly TEXT_MESSAGE_LENGTH tokens long.
// Used for every static row AND every individual scroll page (see
// getNamedScrollLayout's "pages" comment in text-scroll.js) - maxWidth
// is a hard cap either way, so a scroll page is really just one more
// TEXT_MESSAGE_LENGTH-wide row built the exact same way, never a longer,
// untruncated one.
//
// Text is justified within a maxWidth-wide field first (justify - see the
// Text tab's  Left/Center/Right buttons, one of TEXT_JUSTIFY_OPTIONS in
// blocks/text-strings.js - decides where the padding WITHIN that field
// goes: 'left', the default, puts it all on the right, 'right' puts it all
// on the left, 'center' splits it evenly, the smaller half (when the
// padding is odd) going on the left, a plain floor/ceil split. maxWidth
// (the Text tab's "max characters to display" setting) is what totalPad
// is computed from, so a narrower maxWidth shrinks the field BOTH center
// and right justify split/pad within, not just the overall truncation
// point. That maxWidth-wide field always starts at the row's  first
// character slot - the remaining TEXT_MESSAGE_LENGTH - maxWidth slots are
// always blank and always at the END of the row, regardless of justify, so
// a narrower maxWidth always reads as "the rest of the row got truncated,"
// never as the message shifting position.
export const encodeTextMessage = (text, justify = 'left', maxWidth = resolveTextMaxDisplayWidth()) => {
  const upper = String(text || '').toUpperCase().slice(0, maxWidth);
  const totalPad = maxWidth - upper.length;
  const leftPad = justify === 'right' ? totalPad :
    justify === 'center' ? Math.floor(totalPad / 2) : 0;
  const withinWidth = ' '.repeat(leftPad) + upper.padEnd(maxWidth - leftPad, ' ');
  const fullRow = withinWidth.padEnd(TEXT_MESSAGE_LENGTH, ' ');
  return fullRow.split('').map((char) => CHAR_TO_GLYPH[char] || '_sp');
};

// Same as encodeTextMessage, but for a "Wrap to line 2" entry - returns one
// glyph row per line splitMessageLines (text-minikernel-layout.js) split
// the text into, each independently justified/padded exactly the way a
// plain single-row message already is (see encodeTextMessage's
// comment). Only the first two of these are ever shown at once - "Scroll
// text lines up/down" (see their  generators below) move TextIndex to
// bring the rest into view.
export const encodeTextMessageLines = (text, justify = 'left', maxWidth = resolveTextMaxDisplayWidth()) =>
  splitMessageLines(text, maxWidth).map((line) => encodeTextMessage(line, justify, maxWidth));

// "Show text with ID" (the plain, non-scrolling block) doesn't know which
// entry it's showing until runtime, so it normally computes the static
// row's  byte offset with a cheap "id * TEXT_MESSAGE_LENGTH" multiply -
// correct ONLY when every entry is exactly one row wide. The moment any one
// entry in the project has more than one row - "Wrap to line 2" on with
// overflow text, or (since getStaticMessageLayout always splits regardless
// of that toggle now) simply a plain message long enough to word-wrap - that
// uniform-stride assumption breaks (an earlier multi-row entry pushes every
// later entry's  offset further out than a flat multiply would land on),
// so that block falls back to a real runtime table lookup instead - same
// "small parallel tables, one byte per Text tab entry (including the
// reserved blank guard row)" shape as text-scroll.js's  text_offsets/
// text_scroll_max tables, and the same per-bank-copy scheme (a table can
// only be read correctly from the bank it's declared in - see
// dataTableSymbolName/trackDataTableBank in generators/bbasic.js). Only ever
// generated at all when isTextMultiRowUsed() is true (see
// generateTextStaticOffsetTables below) - a DIFFERENT, broader condition
// than isTextRow2Used()/TextRow2Active's  dim gate now that a message can
// have multiple rows without "Wrap to line 2" ever being on:
//   text_static_offsets - that entry's  row 1 byte offset (also doubles
//     as its  lowest valid TextIndex, for "Scroll text lines up").
//   text_has_row2 (0 or 1) - tells the kernel whether to also draw row 2
//     automatically, alongside row 1 with no scrolling needed (see
//     text12b.asm's "textkernel2ndrow" block) - true only for an entry
//     with BOTH 2+ lines AND "Wrap to line 2" actually on; a multi-row entry
//     with that toggle off still has real row 2+ data (reachable via
//     "Scroll text lines down"), it just never draws automatically.
//   text_lines_max - that entry's  HIGHEST valid TextIndex (its  row
//     1 offset when it has only 1 line, i.e. no scroll room at all) - for
//     "Scroll text lines down"'s  clamp. Applies regardless of "Wrap to
//     line 2", same reasoning as text_static_offsets above.
const TEXT_STATIC_OFFSET_TABLE_ID = '__text_static_offsets';
const TEXT_HAS_ROW2_TABLE_ID = '__text_has_row2';
const TEXT_LINES_MAX_TABLE_ID = '__text_lines_max';

export const trackTextStaticOffsetUsage = (Blockly, bank) => {
  Blockly.BBasic.trackDataTableBank(TEXT_STATIC_OFFSET_TABLE_ID, bank);
  Blockly.BBasic.trackDataTableBank(TEXT_HAS_ROW2_TABLE_ID, bank);
  Blockly.BBasic.trackDataTableBank(TEXT_LINES_MAX_TABLE_ID, bank);
};

// Spliced into bbasic.bb.hbs right alongside generatedTextOffsetTables (see
// generators/bbasic.js's  finish() for bank 1's  copy and
// generateRelocatedSections for each relocated bank's  copy) - same
// "nothing ever read it, no bank 1 copy either" behavior as
// generateTextOffsetTables when isTextMultiRowUsed() is false (the common
// case), so a project with only single-row messages pays nothing for this
// at all.
export const generateTextStaticOffsetTables = (Blockly, bank) => {
  if (!Blockly.BBasic.isTextMultiRowUsed()) return '';
  const usage = Blockly.BBasic.dataTableBankUsage[TEXT_STATIC_OFFSET_TABLE_ID];
  if (!(usage ? usage.has(bank) : bank === Blockly.BBasic.primaryBank())) return '';
  const layout = getStaticMessageLayout();
  const offsets = layout.map((entry) => `${entry.offset}`).join(', ');
  const hasRow2Bytes = layout.map((entry) => (entry.wrapToLine2 && entry.lineCount >= 2 ? 1 : 0)).join(', ');
  // Same "-2 with auto row 2, -1 without" distinction as
  // text_minikernel_show_named's  maxOffset - see its comment.
  const linesMax = layout.map((entry) =>
    `${entry.offset + Math.max(0, entry.lineCount - (entry.wrapToLine2 ? 2 : 1)) * TEXT_MESSAGE_LENGTH}`).join(', ');
  // Bank-suffixed (see bankSuffixedTableName's  comment in blocks/data.js)
  // - a project reading these from more than one bank (e.g. a "Show text ID"
  // scroll block used both from ordinary code and from inside a relocated
  // Function) needs a distinctly-named copy per bank, not just a second copy
  // of the same name (a real reported duplicate-label assembly failure).
  const staticOffsetsName = bankSuffixedTableName('text_static_offsets', bank);
  const hasRow2Name = bankSuffixedTableName('text_has_row2', bank);
  const linesMaxName = bankSuffixedTableName('text_lines_max', bank);
  return ` data ${staticOffsetsName}\n  ${offsets}\nend\n\n data ${hasRow2Name}\n  ${hasRow2Bytes}\nend\n\n` +
    ` data ${linesMaxName}\n  ${linesMax}\nend`;
};

const TEXT_ROW2_OFFSET_TABLE_ID = '__text_row2_offsets';

export const trackTextRow2OffsetUsage = (Blockly, bank) => {
  Blockly.BBasic.trackDataTableBank(TEXT_ROW2_OFFSET_TABLE_ID, bank);
};

// "Show text row 2 ID [n]" (text_minikernel_show_by_id_row, ROW=2) needs a
// row 1 it can point TextIndex at that's ALWAYS blank, immediately followed
// by whichever entry's  first line the runtime id picks - text12b.asm's
// row 2 is always read from TextIndex+TEXT_MESSAGE_LENGTH (see
// text_minikernel_show_row's  comment), so there's no shortcut here the
// way ROW=1 gets (its  row 1 already comes from text_static_offsets
// unmodified - see text_minikernel_show_by_id_row's  comment - and ROW=1
// just forces row 2 off instead of needing new data at all). One [blank,
// entry's first line] PAIR is built here for every Text tab entry (id-order,
// position 0 = the same blank guard row text_static_offsets itself reserves
// - see getStaticMessageLayout's  comment), reusing the exact same
// freeTypedMessages array/table-building code every OTHER free-typed/row
// entry already goes through (see registerFreeTypedRowMessage's
// comment) - only built once per project (cached on Blockly.BBasic, reset
// per build in bbasic.js's  init()) even though generateTextRow2OffsetsTable
// below can run once per bank.
const ensureTextRow2Pairs = (Blockly) => {
  if (Blockly.BBasic.textRow2PairOffsets) return Blockly.BBasic.textRow2PairOffsets;
  const maxWidth = resolveTextMaxDisplayWidth();
  const entries = [{text: ''}, ...listTextStrings()];
  Blockly.BBasic.freeTypedMessages = Blockly.BBasic.freeTypedMessages || [];
  const messages = Blockly.BBasic.freeTypedMessages;
  const offsets = entries.map(({text}) => {
    const offset = staticMessageRegionEnd() + messages.length * TEXT_MESSAGE_LENGTH;
    const firstLine = text ? (splitMessageLines(text, maxWidth)[0] || '') : '';
    messages.push('', firstLine);
    return offset;
  });
  Blockly.BBasic.textRow2PairOffsets = offsets;
  return offsets;
};

// Only built/reserved when a "Show text row 2 ID" block actually exists
// somewhere in the project (Blockly.BBasic.textShowByIdRow2Used, a real
// block-type pre-scan set in bbasic.js's  init()) - a project using only
// ROW=1 by-id blocks (or the free-typed/named row blocks) never pays for
// this second, parallel copy of every Text tab entry's  first line.
export const generateTextRow2OffsetsTable = (Blockly, bank) => {
  if (!Blockly.BBasic.textShowByIdRow2Used) return '';
  const usage = Blockly.BBasic.dataTableBankUsage[TEXT_ROW2_OFFSET_TABLE_ID];
  if (!(usage ? usage.has(bank) : bank === Blockly.BBasic.primaryBank())) return '';
  const offsets = ensureTextRow2Pairs(Blockly);
  const tableName = bankSuffixedTableName('text_row2_offsets', bank);
  return ` data ${tableName}\n  ${offsets.join(', ')}\nend`;
};

export default (Blockly) => {
  const markTextMinikernelUsed = () => {
    Blockly.BBasic.textMinikernelUsed = true;
  };

  // Every message defined on the Text tab occupies a FIXED table row, one
  // more than its position in listTextStrings()'s  id-sorted order (row 0
  // is reserved blank - see generateTextMinikernel() below) - not assigned
  // lazily as blocks happen to reference them. That's what makes "Show text
  // with ID" possible at all: its number is only known at runtime, so
  // there's no block-visitation moment to hang a lazy registration off of.
  // Deliberately keyed off id, not Text tab DISPLAY order (see
  // listTextStrings'  comment) - display order is freely drag-reorderable
  // (see TextEditor.vue), and a message's ROM row/ID number staying fixed
  // regardless of where its card happens to sit in the editor is exactly the
  // point: typing "2" always gets you the same message, whether or not it's
  // been dragged somewhere else on the Text tab since.
  const namedMessagePosition = (id) => {
    const entries = listTextStrings();
    const index = entries.findIndex((entry) => `${entry.id}` === `${id}`);
    return index === -1 ? 0 : index + 1;
  };
  // This entry's  byte offset/line count within the static region - see
  // getStaticMessageLayout's  comment above for why these can no longer
  // be a flat position*TEXT_MESSAGE_LENGTH computation.
  const namedMessageOffset = (id) => getStaticMessageLayout()[namedMessagePosition(id)].offset;
  const namedMessageLineCount = (id) => getStaticMessageLayout()[namedMessagePosition(id)].lineCount;
  // Whether row 2+ should draw AUTOMATICALLY (alongside row 1, no scrolling
  // needed) for this entry - "Wrap to line 2" itself, not lineCount (which
  // is now independent of that toggle - see getStaticMessageLayout's
  // comment). A message can have real, scrollable 2nd+ row data with this
  // false: "Scroll text lines down" still reveals it, one row at a time,
  // just never automatically.
  const namedMessageWrapToLine2 = (id) => getStaticMessageLayout()[namedMessagePosition(id)].wrapToLine2;
  // Just this entry's  FIRST line of raw text (before glyph-encoding) -
  // used by text_minikernel_show_named_row below, which only ever shows one
  // row of a named entry (no word-wrap/scrolling), same "first line only"
  // rule as encodeTextMessage would apply to a would-be single-row version
  // of this entry anyway.
  const namedMessageFirstLine = (id) => {
    const entry = listTextStrings().find((candidate) => `${candidate.id}` === `${id}`);
    if (!entry) return '';
    return splitMessageLines(entry.text, resolveTextMaxDisplayWidth())[0] || '';
  };

  // Free-typed messages ("Show text: <literal>") have no Text tab entry to
  // number them by, so they keep the old lazy, dedup-by-content scheme,
  // appended after every Text tab entry's  static row(s) (see
  // staticMessageRegionEnd/generateTextMinikernel()) - always
  // TEXT_MESSAGE_LENGTH wide and always truncated to maxWidth (see
  // encodeTextMessage), same as every named row, since maxWidth is a hard
  // cap every "Show text" block respects, scrolling variants included (see
  // getNamedScrollLayout's  comment in text-scroll.js). Free-typed
  // messages never wrap - no Text tab entry means no "Wrap to line 2"
  // toggle to read.
  const registerFreeTypedMessage = (text) => {
    Blockly.BBasic.freeTypedMessages = Blockly.BBasic.freeTypedMessages || [];
    const messages = Blockly.BBasic.freeTypedMessages;
    let index = messages.indexOf(text);
    if (index === -1) {
      index = messages.length;
      messages.push(text);
    }
    const offset = staticMessageRegionEnd() + index * TEXT_MESSAGE_LENGTH;
    return {offset, maxOffset: 0};
  };

  // "Show text row 1/2" (text_minikernel_show_row) - reuses the SAME
  // freeTypedMessages array/region as registerFreeTypedMessage above (built
  // into the final table by the exact same "one row per array entry" code,
  // see this.freeTypedMessages'  use near the bottom of this file), but
  // always pushes TWO entries at once (row 1's text, then row 2's text -
  // whichever one wasn't set comes out blank) so they land at consecutive
  // offsets in the table, matching what text12b.asm's "textkernel2ndrow"
  // expects (row 2 is always read from TextIndex+TEXT_MESSAGE_LENGTH,
  // unconditionally). Never deduped against an existing single-row entry the
  // way registerFreeTypedMessage's  text.indexOf is - an existing entry
  // has no guaranteed real row 2 sitting right after it, so reusing one here
  // could read someone else's unrelated row as row 2.
  const registerFreeTypedRowMessage = (row, text) => {
    Blockly.BBasic.freeTypedMessages = Blockly.BBasic.freeTypedMessages || [];
    const messages = Blockly.BBasic.freeTypedMessages;
    const offset = staticMessageRegionEnd() + messages.length * TEXT_MESSAGE_LENGTH;
    messages.push(row === '2' ? '' : text, row === '2' ? text : '');
    return offset;
  };

  // Emits the write every "Show text"/"Show text with ID"/"Clear text" code
  // path needs, telling the kernel whether TextIndex's  message (just
  // set above/below) also has a wrapped second line - see text12b.asm's
  // "textkernel2ndrow" block. Only emitted when TextRow2Active is actually
  // dimmed (isTextRow2Used(), gated the same way in
  // generateTextMinikernelDims) - a project with no wrapping entries at all
  // never reserves the var, so writing to it unconditionally here would
  // reference an undeclared symbol.
  const setTextRow2ActiveCode = (active) => {
    if (!Blockly.BBasic.isTextRow2Used()) return '';
    return `TextRow2Active = ${active ? 1 : 0}\n`;
  };

  // Emits the write "Show text"/"Show text with ID"/"Clear text" need for
  // "Scroll text lines up/down" (see their  generators below) to know
  // the CURRENTLY shown message's  valid TextIndex range - baseExpr is
  // its row 1 offset (the lowest valid TextIndex, same value "Scroll text
  // lines up" clamps against), maxOffsetExpr is its highest (row 1's
  // offset again, unchanged, for a message with only 1 line - i.e. no room
  // to scroll at all). Only emitted when isTextLineScrollUsed() is true - a
  // project with no "Scroll text lines" block anywhere never reserves
  // these, so writing to them unconditionally here would reference
  // undeclared symbols.
  const setTextLinesRangeCode = (baseExpr, maxOffsetExpr) => {
    if (!Blockly.BBasic.isTextLineScrollUsed()) return '';
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${resolveVar(textLinesBaseVarName())} = ${baseExpr}\n` +
      `${resolveVar(textLinesMaxVarName())} = ${maxOffsetExpr}\n`;
  };

  // Every "Show text" generator ends by calling this with the offset/
  // maxOffset it already knows (a compile-time constant for named/free-typed
  // messages, a runtime table lookup for "Show text with ID" - see its
  // generators below) and the scroll speed/pause codes to use (either the
  // fixed defaults below, for the plain "Show text" blocks, or a
  // "..._scroll" block's  SCROLL_SPEED/SCROLL_PAUSE fields) - see
  // buildTextScrollSetupLines'  comment in text-scroll.js for exactly
  // what gets reconfigured unconditionally vs. only when the message
  // actually changes.
  const emitScrollSetup = (offsetExpr, maxOffsetExpr, speed, pause, startAtEnd) => {
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const uniqueId = Blockly.BBasic.blockNumbers.next('textScroll');
    const lines = buildTextScrollSetupLines(
        resolveVar, offsetExpr, maxOffsetExpr, speed, pause, uniqueId, Blockly.BBasic.isTextScrollActive(),
        !!startAtEnd);
    return lines.join('\n') + '\n';
  };

  // Used by the plain "Show text" blocks (no SCROLL_SPEED/SCROLL_PAUSE
  // fields) whenever a message they show turns out to be too
  // long to fit statically - see blocks/text-minikernel.js's "(scrolling)"
  // block variants for ones with tunable fields instead.
  const DEFAULT_SCROLL_SPEED = '20';
  const DEFAULT_SCROLL_PAUSE = '30';

  const scrollFieldCodes = (block) => [
    Blockly.BBasic.valueToCode(block, 'SCROLL_SPEED', Blockly.BBasic.ORDER_ASSIGNMENT) || DEFAULT_SCROLL_SPEED,
    Blockly.BBasic.valueToCode(block, 'SCROLL_PAUSE', Blockly.BBasic.ORDER_ASSIGNMENT) || DEFAULT_SCROLL_PAUSE,
  ];
  const startAtEndCode = (block) => block.getFieldValue('START_AT_END') === 'TRUE';

  // Plain named block: always the ordinary static row(s) (namedMessageOffset -
  // one row, or as many as splitMessageLines needed - always, regardless of
  // "Wrap to line 2" now, see getStaticMessageLayout's  comment), maxOffset
  // always 0 - never touches the scroll append region at all. Row 2 only
  // draws automatically when "Wrap to line 2" is ALSO on (namedMessageWrapToLine2)
  // - a multi-row entry with it off still has real, scrollable row 2+ data
  // (setTextLinesRangeCode below), just never shown without scrolling to it.
  Blockly.BBasic['text_minikernel_show_named'] = function(block) {
    markTextMinikernelUsed();
    const id = block.getFieldValue('TEXT_ID');
    const offset = namedMessageOffset(id);
    const lineCount = namedMessageLineCount(id);
    const wrapToLine2 = namedMessageWrapToLine2(id);
    // With "Wrap to line 2" on, the LAST two lines are already both visible
    // at once (row 1 + auto-drawn row 2), so there's no need to scroll all
    // the way to the very last one - lineCount-2. Without it, only one row
    // is EVER on screen at a time (row 2 never auto-draws - see
    // setTextRow2ActiveCode below), so reaching the last line means
    // scrolling through every single one - lineCount-1. Using the "-2"
    // formula regardless of wrapToLine2 was a real bug: it left the very
    // last line of a non-wrapping multi-line message permanently
    // unreachable, since max never advanced far enough to uncover it.
    const maxOffset = offset + Math.max(0, lineCount - (wrapToLine2 ? 2 : 1)) * TEXT_MESSAGE_LENGTH;
    return emitScrollSetup(offset, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      setTextRow2ActiveCode(wrapToLine2 && lineCount >= 2) +
      setTextLinesRangeCode(offset, maxOffset);
  };
  // Puts a named entry's  first line on just one row, reusing the same
  // registerFreeTypedRowMessage mechanism text_minikernel_show_row uses for
  // its  free-typed text - the entry's justify setting isn't applied
  // here (registerFreeTypedRowMessage always left-justifies, the same
  // limitation "Show text: <free-typed text>" already has - see
  // registerFreeTypedMessage's  comment), only its raw first-line text.
  Blockly.BBasic['text_minikernel_show_named_row'] = function(block) {
    markTextMinikernelUsed();
    const row = block.getFieldValue('ROW');
    const id = block.getFieldValue('TEXT_ID');
    const offset = registerFreeTypedRowMessage(row, namedMessageFirstLine(id));
    return emitScrollSetup(offset, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      setTextRow2ActiveCode(true) +
      setTextLinesRangeCode(offset, offset);
  };
  // Scroll named block: uses the SAME position to look up that entry's
  // page-0 offset/maxOffset in the scroll append region (see
  // getNamedScrollLayout in text-scroll.js) - naturally maxOffset = 0 for a
  // message with only one page (fits within maxWidth already), same
  // end-to-end effect as the plain block above for that message. Scrolling
  // messages never wrap (always a single line - see setTextRow2ActiveCode's
  // comment on its "active" parameter), regardless of whether this
  // entry's "Wrap to line 2" toggle happens to be on - that toggle only
  // means anything to the plain block above. setTextLinesRangeCode(entry.offset,
  // entry.offset) pins the "Scroll text lines" range to a single point (no
  // room to move) so those blocks become harmless no-ops if used together
  // with a horizontally-scrolling message, rather than acting on a stale
  // range left over from some earlier wrapping message.
  Blockly.BBasic['text_minikernel_show_named_scroll'] = function(block) {
    markTextMinikernelUsed();
    const position = namedMessagePosition(block.getFieldValue('TEXT_ID'));
    const layout = getNamedScrollLayout();
    const entry = layout[position] || layout[0];
    return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block), startAtEndCode(block)) +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(entry.offset, entry.offset);
  };

  Blockly.BBasic['text_minikernel_show'] = function(block) {
    markTextMinikernelUsed();
    const entry = registerFreeTypedMessage(block.getFieldValue('TEXT'));
    return emitScrollSetup(entry.offset, entry.maxOffset, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(entry.offset, entry.offset);
  };

  // Always forces row 2 ON (true) regardless of which row (1 or 2) was
  // actually set - registerFreeTypedRowMessage above always compiles in a
  // real row 2 right after row 1 (blank for whichever row wasn't chosen),
  // so the kernel should always draw it, never fall back to the blank guard
  // row setTextRow2ActiveCode(false) would otherwise point it at.
  Blockly.BBasic['text_minikernel_show_row'] = function(block) {
    markTextMinikernelUsed();
    const row = block.getFieldValue('ROW');
    const offset = registerFreeTypedRowMessage(row, block.getFieldValue('TEXT'));
    return emitScrollSetup(offset, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      setTextRow2ActiveCode(true) +
      setTextLinesRangeCode(offset, offset);
  };
  Blockly.BBasic['text_minikernel_show_scroll'] = function(block) {
    markTextMinikernelUsed();
    const entry = registerFreeTypedScrollMessage(Blockly, block.getFieldValue('TEXT'));
    return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block), startAtEndCode(block)) +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(entry.offset, entry.offset);
  };

  Blockly.BBasic['text_minikernel_show_by_id'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    // argument0 captured into a dedicated dev var first, rather than
    // embedded directly into "(argument0) * TEXT_MESSAGE_LENGTH" - VALUE can
    // be a genuine bB function call now (e.g. a dynamic-TABLE_ID "Data table
    // element by ID" block plugged in here - see generators/bbasic/data.js's
    // registerDataDispatchFunction), and a function call is only legal
    // when directly assigned to a variable (confirmed straight from the
    // reference bB compiler's  source: callfunction() only supports
    // "var = name(args)") - embedding it inside further arithmetic instead
    // produced a real, reproduced build failure ("Syntax Error '#,'" from a
    // mangled immediate load). temp1 (not this block's  capture var) was
    // tried here first and reverted: this block can sit INSIDE a function
    // (e.g. one built to work around the exact same "table id from a
    // variable" need this exists for), and temp1 doubles as that enclosing
    // function's  argument 1 - confirmed as a second real build failure,
    // clobbering that argument the moment this ran, same class of bug
    // functionCallDiscardVarName already exists to avoid in
    // generators/bbasic/function.js - reused directly here rather than a
    // second dedicated var, same "written once, read back
    // immediately after, never held across another Function call" lifetime.
    // functionCallDiscardVarName now routes through reserveDevVarRW
    // (generators/bbasic.js's  init()) - captured with .write here,
    // then read back (.read, possibly more than once - emitScrollSetup
    // embeds it in up to 3 separate lines) on the lines right after.
    const argPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const captureArg = `${argPair.write} = ${argument0}\n`;
    // Fast path: no entry in the project can ever have a second row, so the
    // static region really is a uniform TEXT_MESSAGE_LENGTH stride - the
    // plain multiply (needing div_mul.asm - see Blockly.BBasic.usesDivMul's
    // comment elsewhere in this codebase) is cheaper than a table read
    // and stays exactly correct. isTextMultiRowUsed(), not isTextRow2Used() -
    // a plain message can need a second row purely from word-wrap now, with
    // "Wrap to line 2" never coming into it at all (see
    // getStaticMessageLayout's  comment), so THAT'S the real condition
    // this uniform-stride shortcut depends on.
    if (!Blockly.BBasic.isTextMultiRowUsed()) {
      Blockly.BBasic.usesDivMul = true;
      const offsetExpr = `${argPair.read} * ${TEXT_MESSAGE_LENGTH}`;
      return captureArg +
        emitScrollSetup(offsetExpr, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
        setTextLinesRangeCode(offsetExpr, offsetExpr);
    }
    // Slow path: some entry has 2+ rows, so row widths aren't uniform any
    // more - the offset and the valid scroll range both have to come from a
    // real runtime table lookup instead (see text_static_offsets/
    // text_has_row2/text_lines_max's  comment above). The
    // "TextRow2Active = text_has_row2[...]" write itself is only emitted
    // when isTextRow2Used() is ALSO true (some entry actually has "Wrap to
    // line 2" on) - TextRow2Active isn't even dimmed otherwise (see
    // generateTextMinikernelDims), since nothing would ever need row 2 to
    // auto-draw in that case.
    const bank = Blockly.BBasic.getCurrentBank();
    trackTextStaticOffsetUsage(Blockly, bank);
    // Bank-suffixed reads (see bankSuffixedTableName's  comment in
    // blocks/data.js) - this generator can run once per bank a "Show text
    // ID" block happens to be reached from (ordinary code, or a relocated
    // Function's  body), and each needs to read back the SAME bank's
    // copy of the table generateTextStaticOffsetTables emitted above.
    const staticOffsets = `${bankSuffixedTableName('text_static_offsets', bank)}[${argPair.read}]`;
    const hasRow2 = `${bankSuffixedTableName('text_has_row2', bank)}[${argPair.read}]`;
    const linesMax = `${bankSuffixedTableName('text_lines_max', bank)}[${argPair.read}]`;
    return captureArg +
      emitScrollSetup(staticOffsets, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      (Blockly.BBasic.isTextRow2Used() ? `TextRow2Active = ${hasRow2}\n` : '') +
      setTextLinesRangeCode(staticOffsets, linesMax);
  };
  // Same runtime-id lookup as text_minikernel_show_by_id above, but shows
  // just one row (1 or 2) of whichever entry the id picks - the OTHER row
  // always comes out blank, same limitation every other "show row" block
  // has (see text_minikernel_show_row's  comment).
  //
  // ROW=1 is essentially "free": an entry's  row 1 IS its  first line
  // already (by construction - see getStaticMessageLayout's  comment),
  // so this reuses the EXACT SAME text_static_offsets[id] lookup (and its
  // fast/slow path split) text_minikernel_show_by_id already has,
  // just always forcing TextRow2Active off afterward instead of ever
  // reading that entry's  real "has row 2" flag - blanking row 2
  // regardless of whether the picked entry happens to wrap.
  //
  // ROW=2 has no such shortcut - text12b.asm's  row 2 is always read
  // from TextIndex+TEXT_MESSAGE_LENGTH, so showing an ARBITRARY entry's
  // first line on row 2 needs TextIndex pointed at a blank row immediately
  // followed by that entry's  text - no existing row 1 in the table has
  // a guaranteed-blank row right before it, so this reads its  separate,
  // purpose-built text_row2_offsets[id] table instead (see
  // generateTextRow2OffsetsTable's  comment above) - only ever built at
  // all when this specific ROW=2 case is actually used somewhere.
  Blockly.BBasic['text_minikernel_show_by_id_row'] = function(block) {
    markTextMinikernelUsed();
    const row = block.getFieldValue('ROW');
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const argPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const captureArg = `${argPair.write} = ${argument0}\n`;

    if (row === '2') {
      const bank = Blockly.BBasic.getCurrentBank();
      trackTextRow2OffsetUsage(Blockly, bank);
      const row2Offsets = `${bankSuffixedTableName('text_row2_offsets', bank)}[${argPair.read}]`;
      return captureArg +
        emitScrollSetup(row2Offsets, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
        setTextRow2ActiveCode(true) +
        setTextLinesRangeCode(row2Offsets, row2Offsets);
    }

    if (!Blockly.BBasic.isTextMultiRowUsed()) {
      Blockly.BBasic.usesDivMul = true;
      const offsetExpr = `${argPair.read} * ${TEXT_MESSAGE_LENGTH}`;
      return captureArg +
        emitScrollSetup(offsetExpr, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
        setTextRow2ActiveCode(false) +
        setTextLinesRangeCode(offsetExpr, offsetExpr);
    }
    const bank = Blockly.BBasic.getCurrentBank();
    trackTextStaticOffsetUsage(Blockly, bank);
    const staticOffsets = `${bankSuffixedTableName('text_static_offsets', bank)}[${argPair.read}]`;
    return captureArg +
      emitScrollSetup(staticOffsets, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(staticOffsets, staticOffsets);
  };

  // Scroll by-id block: normally WHICH entry gets shown isn't known until
  // runtime, so the offset needs the real "text_offsets[id]" table lookup -
  // but every entry's  maxOffset is Text tab data, known at compile time
  // either way, so two levels of shortcut apply before falling back to an
  // actual runtime "text_scroll_max[id]" table read:
  //  1. A literal number plugged directly into VALUE (e.g. "Scroll text ID
  //     3") means the exact entry is ALSO known at compile time here, same
  //     as the named blocks above - resolve straight to that one entry's
  //     maxOffset (same layout[position] indexing
  //     text_minikernel_show_named_scroll uses, since this block's
  //     tooltip documents the same "position on the Text tab" numbering).
  //  2. Otherwise the id is only known at runtime, but if NO entry in the
  //     WHOLE project is long enough to ever scroll, text_scroll_max[id]
  //     would read 0 for every possible id regardless of which one gets
  //     picked - same fast path, just proven a different way.
  // trackTextByIdScrollUsage (which pulls the scrollable append-region data
  // into the ROM at all) is only ever called on the genuine fallback path,
  // where a real runtime table lookup is unavoidable.
  Blockly.BBasic['text_minikernel_show_by_id_scroll'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const layout = getNamedScrollLayout();

    const valueBlock = block.getInputTargetBlock('VALUE');
    const literalId = valueBlock && valueBlock.type === 'math_number' ?
      parseLiteralNumberField(valueBlock.getFieldValue('NUM')) : null;
    if (literalId != null) {
      // Both halves are compile-time literals here (not just maxOffset) -
      // entry.offset is the exact same value text_offsets[literalId] would
      // have read from the table at runtime, so using it directly also
      // skips that table read, the same way the plain named blocks above
      // never touch text_offsets at all.
      const entry = layout[literalId] || layout[0];
      return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block), startAtEndCode(block)) +
        setTextRow2ActiveCode(false) +
        setTextLinesRangeCode(entry.offset, entry.offset);
    }

    // argument0 is only ever a compile-time literal on the branch above (the
    // one case where it's never actually embedded into generated code at
    // all) - every OTHER value reaching here is a genuine runtime
    // expression, up to and including another table read (e.g. a "Data: get
    // element" block plugged straight into this block's  VALUE socket -
    // a real reported bug: "not stopping at the bounds... when given from a
    // data table"). Embedding that raw expression directly inside
    // "text_offsets[...]"/"text_scroll_max[...]" below used to produce a
    // NESTED table-index expression ("text_offsets[sometable[y]]") - the
    // same "complex statement" class of corruption already fixed elsewhere
    // in this codebase for a compound arithmetic index (see
    // generators/bbasic/music.js's  joyDir8Table comment: "only a single
    // plain variable index compiles correctly"), just with a nested table
    // read instead of arithmetic as the culprit. Captured into a dedicated
    // dev var exactly ONCE here instead (same reasoning
    // generateDistancePointChecks'  POINT-into-temp2 capture uses for the
    // "capture once" part), so every table index below is a single plain
    // variable - also incidentally fixes argument0 otherwise being
    // evaluated twice over (once per table read) for no reason, since both
    // reads plug the exact same value in. temp1 itself (not this dedicated
    // var) was used here originally and reverted: this block can sit INSIDE
    // a function whose argument is also read via temp1 (see
    // text_minikernel_show_by_id's  identical comment just above, and
    // functionCallDiscardVarName's in blocks/function.js for the same class
    // of risk) - confirmed as a real build failure, clobbering that
    // function's  live argument. Reuses that same shared var directly
    // rather than a second dedicated one (see its  comment).
    // functionCallDiscardVarName now routes through reserveDevVarRW (see
    // this file's  identical comment on text_minikernel_show_by_id
    // above) - .write to capture, .read for every use after.
    const argPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const captureArg = `${argPair.write} = ${argument0}\n`;
    // Bank-suffixed reads (see bankSuffixedTableName's  comment in
    // blocks/data.js) - this generator can run once per bank a "Scroll text
    // ID" block happens to be reached from (ordinary code, or a relocated
    // Function's  body), and each needs to read back the SAME bank's
    // copy of whichever table(s) generateTextOffsetTables emitted there.
    const bank = Blockly.BBasic.getCurrentBank();
    const offsets = `${bankSuffixedTableName('text_offsets', bank)}[${argPair.read}]`;
    if (!layout.some((entry) => entry.maxOffset > 0)) {
      return captureArg + emitScrollSetup(offsets, 0, ...scrollFieldCodes(block), startAtEndCode(block)) +
        setTextRow2ActiveCode(false) +
        setTextLinesRangeCode(offsets, offsets);
    }

    trackTextByIdScrollUsage(Blockly, bank);
    const scrollMax = `${bankSuffixedTableName('text_scroll_max', bank)}[${argPair.read}]`;
    return captureArg + emitScrollSetup(offsets, scrollMax, ...scrollFieldCodes(block), startAtEndCode(block)) +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(offsets, offsets);
  };

  // The frames left before a "Clear text after" block clears the text (0: none is waiting): counted down once a frame, in the code
  // that runs every frame.
  Blockly.BBasic['text_minikernel_clear_after'] = function(block) {
    markTextMinikernelUsed();
    const timer = Blockly.BBasic.nameDB_.getName(textClearTimerVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const argument0 = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_ASSIGNMENT) || '60';
    const literal = /^\s*(\d+)\s*$/.exec(argument0);
    if (literal) return `${timer} = ${Math.max(1, Math.min(255, Number(literal[1])))}\n`;
    return `${timer} = ${argument0}\nif ${timer} = 0 then ${timer} = 1\n`;
  };

  Blockly.BBasic.generateTextClearTimerChecks = function() {
    if (!this.textClearAfterUsed) return '';
    const timer = this.nameDB_.getName(textClearTimerVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const skip = '_textcleartimer_done';
    return [
      ` if ${timer} = 0 then goto ${skip}`,
      ` ${timer} = ${timer} - 1`,
      ` if ${timer} > 0 then goto ${skip}`,
      ...this.textClearCode().split('\n').filter(Boolean).map((line) => ` ${line}`),
      skip,
    ].join('\n') + '\n';
  };

  Blockly.BBasic['text_minikernel_clear'] = function(block) {
    markTextMinikernelUsed();
    return Blockly.BBasic.textClearCode();
  };

  // The code that clears the shown text (also run when the time of a "Clear text after" block is up).
  Blockly.BBasic.textClearCode = function() {
    // Setting TextIndex alone isn't enough: if the message being cleared was
    // scrolling, generateTextScrollAdvance (text-scroll.js) runs every frame
    // in commongamelogic and keeps recomputing TextIndex from the OLD scroll
    // state, overwriting this back to the scrolling message on the very next
    // frame - a real reported bug ("text isn't staying clear after using
    // 'clear text'"). Setting farEnd = base (both 0) makes that per-frame
    // check bail immediately (its  first line is "if farEnd = base then
    // goto done"), and base is reset too so a later "Show text (scrolling)"
    // call starts from a clean slate rather than whatever was left over.
    // state is set to 2, not 1 - a tri-state (see textScrollStateVarName's
    // comment) that also forces the NEXT "Show text" call to fully
    // reset even if it's showing the exact same message as before the clear
    // (otherwise buildTextScrollSetupLines'  base-matches guard would
    // think nothing changed and skip re-pointing TextIndex at it - a real
    // reported follow-up bug, "scroll text is not coming back after using
    // clear text"). That same bare "state = 2" also resets direction back to
    // 0 for free (see TEXT_SCROLL_DIR_BIT's  comment) - no separate write
    // needed, unlike the "Pause"/"Unpause" actions in
    // text_minikernel_scroll_control, which specifically must NOT do that.
    // Same "resolveVar allocates a real letter the first time it's called,
    // independent of reserveTextScrollDevVars'  reservation" hazard as
    // buildTextScrollSetupLines'  comment in text-scroll.js - only
    // resolved (and only written) when the project actually has some other
    // scroll-related block that could ever read base/farEnd/state at all.
    if (!Blockly.BBasic.isTextScrollActive()) {
      return `TextIndex = 0\n` + setTextRow2ActiveCode(false) + setTextLinesRangeCode(0, 0);
    }
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const base = resolveVar(textScrollBaseVarName());
    const farEnd = resolveVar(textScrollFarEndVarName());
    const state = resolveVar(textScrollStateVarName());
    return `TextIndex = 0\n` +
      `${base} = 0\n` +
      `${farEnd} = 0\n` +
      `${state} = 2\n` +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(0, 0);
  };

  // ROW picks which row(s) this sets: "1" (the default - a project saved
  // before this dropdown existed has no ROW field serialized at all, so
  // Blockly falls back to the block's  default value here, keeping its
  // exact old, row-1-only behavior), "2" (row 2's  dev var - see
  // textRow2ColorVarName's  comment above for why that needs a real dev
  // var, unlike TextColor), or "both". "Both" deliberately only writes
  // TextColor, the same as "1" - row 2 already follows TextColor
  // automatically whenever its  var hasn't been explicitly written (see
  // buildTextRow2ColorOverride's "$01 sentinel" comment in
  // utils/text-font.js), so writing a redundant second copy into row 2's
  // var here would only cost cycles/bytes for no visible difference, and
  // would stop row 2 from tracking any LATER TextColor change (a fade, or
  // another "both"/"row 1" set) the way the automatic fallback otherwise
  // does. Only "2" ever writes row 2's  var, switching it from
  // "following row 1" to "independent" from that point on.
  Blockly.BBasic['text_minikernel_set_color'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const row = block.getFieldValue('ROW') || '1';
    if (row === '2') {
      const varName = Blockly.BBasic.nameDB_.getName(
          textRow2ColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      return `${varName} = ${argument0}\n`;
    }
    return `TextColor = ${argument0}\n`;
  };

  // The scroll cursor's  color (see textScrollCursorColorVarName's
  // comment above).
  Blockly.BBasic['text_minikernel_set_cursor_color'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        textScrollCursorColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${varName} = ${argument0}\n`;
  };

  // The end icon's  color (see textEndIconColorVarName's  comment).
  Blockly.BBasic['text_minikernel_set_end_icon_color'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const varName = Blockly.BBasic.nameDB_.getName(
        textEndIconColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return `${varName} = ${argument0}\n`;
  };

  // The scroll cursor's  runtime show/hide flag (see
  // TEXT_SCROLL_CURSOR_HIDDEN_BIT's  comment above) - a read-modify-write
  // of the cursor color var's  bit 0, read by buildTextScrollCursorOverride's
  // spliced asm. Leaves every other bit (the actual color) untouched, so
  // hiding/showing the cursor never disturbs whatever color it was last set
  // to.
  Blockly.BBasic['text_minikernel_scroll_cursor_visible'] = function(block) {
    markTextMinikernelUsed();
    const varName = Blockly.BBasic.nameDB_.getName(
        textScrollCursorColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const action = block.getFieldValue('ACTION');
    return action === 'hide' ?
      `${varName} = ${varName} | ${TEXT_SCROLL_CURSOR_HIDDEN_BIT}\n` :
      `${varName} = ${varName} & $FE\n`;
  };

  Blockly.BBasic['text_minikernel_fade_to'] = function(block) {
    // Text's color fade trigger - same shared mechanism as Background's
    // "Fade color to" (see emitColorFadeTrigger in
    // generators/bbasic/background.js), always targeting TextColor.
    markTextMinikernelUsed();
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    return Blockly.BBasic.emitColorFadeTrigger('TextColor', color, frames);
  };

  Blockly.BBasic['text_minikernel_fade_finished'] = function(block) {
    // Text's  fade-finished watch - same shared mechanism as
    // Background's "When ... color has finished fading" (see
    // emitFadeFinishedWatch in generators/bbasic/background.js), always
    // targeting TextColor. No markTextMinikernelUsed() call here (unlike
    // text_minikernel_fade_to above) - this is already a no-op unless a
    // matching fade trigger exists elsewhere in the project (see
    // emitFadeFinishedWatch's  watches.has(...) check), and that
    // trigger's  generator already marks the kernel used whenever it's
    // actually reachable.
    return Blockly.BBasic.emitFadeFinishedWatch(block, 'TextColor');
  };

  // A single comparison against the shared scroll state (see
  // text-scroll.js) - modeled directly on background_fade_active's
  // simple-bit-read pattern in generators/bbasic/background.js. TextIndex is
  // the scroll position tracker itself now (see textScrollFarEndVarName's
  // comment in text-scroll.js) - "Left" reads TextIndex = base (also
  // true, harmlessly, for a message that never needed to scroll at all -
  // see buildTextScrollSetupLines'  comment); "Right" reads TextIndex =
  // farEnd, which is only ever reached by a message that's actually
  // scrolling.
  Blockly.BBasic['text_minikernel_scroll_at'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const side = block.getFieldValue('SIDE');
    const code = side === 'right' ? `TextIndex = ${resolveVar(textScrollFarEndVarName())}` : `TextIndex = ${resolveVar(textScrollBaseVarName())}`;
    return [code, Blockly.BBasic.ORDER_EQUALITY];
  };

  // True exactly when the scroll cursor's "end of message" icon would
  // currently be showing (see buildTextScrollCursorOverride's  matching
  // check in utils/text-font.js) - _textLinesMax is already the highest
  // value TextIndex can hold for the currently shown message, so "nothing
  // left below" is just TextIndex reaching it. Deliberately the real dev
  // vars, not the cursor's  scorepointers scratch bytes (those are only
  // ever valid transiently during the minikernel's  scanlines, not
  // readable from ordinary game logic running elsewhere in the frame).
  Blockly.BBasic['text_minikernel_end_icon_visible'] = function(block) {
    markTextMinikernelUsed();
    const linesMax = Blockly.BBasic.nameDB_.getName(
        textLinesMaxVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    return [`TextIndex >= ${linesMax}`, Blockly.BBasic.ORDER_RELATIONAL];
  };

  // See text_minikernel_scroll_control's  comment in blocks/
  // text-minikernel.js for what each action means. All five just write the
  // shared scroll state directly (see text-scroll.js) - none of them need
  // to know which message is currently showing, since there's only ever
  // one at a time.
  Blockly.BBasic['text_minikernel_scroll_control'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const base = resolveVar(textScrollBaseVarName());
    const timer = resolveVar(textScrollTimerVarName());
    const pauseDuration = textScrollPauseOperand(resolveVar).value;
    const state = resolveVar(textScrollStateVarName());
    const action = block.getFieldValue('ACTION');
    // Snaps back to the message's  start (TextIndex = base, its
    // scroll position tracker now - see textScrollFarEndVarName's
    // comment) - shared by Stop/Restart, which only differ in whether they
    // leave the paused flag set afterward. Direction isn't reset here
    // directly (no separate write needed - see TEXT_SCROLL_DIR_BIT's
    // comment) since both callers below immediately follow this with a
    // bare "state = n" overwrite, which already zeroes that
    // bit as a side effect of resetting the tri-state value.
    const resetToStart = `TextIndex = ${base}\n`;
    // "Pause"/"Unpause"/"Start" specifically must NOT disturb direction (a
    // message scrolling backward should still be scrolling backward once
    // unpaused) - unlike every other write to state in this file, these
    // can't use a bare overwrite (that would zero the direction bit
    // alongside the tri-state value), so they mask it in via
    // TEXT_SCROLL_DIR_MASK instead: clear only the tri-state bits, OR in the
    // new value, leaving bit 2 exactly as it was.
    if (action === 'pause') return `${state} = (${state} & ${TEXT_SCROLL_DIR_MASK}) | 1\n`;
    if (action === 'start' || action === 'unpause') return `${state} = ${state} & ${TEXT_SCROLL_DIR_MASK}\n`;
    if (action === 'stop') return resetToStart + `${state} = 1\n`;
    // 'restart' - waits the "pause at limits" duration before its first
    // step, matching buildTextScrollSetupLines'  reasoning for why a
    // freshly (re)started message shouldn't immediately start scrolling
    // away after only a "speed"-length delay.
    return resetToStart + `${state} = 0\n` + `${timer} = ${pauseDuration}\n`;
  };

  // Moves the CURRENTLY shown message up/down by one or two lines (the
  // block's  LINES dropdown - TextIndex +/- TEXT_MESSAGE_LENGTH, once per
  // line) when it has more than 2 lines (see splitMessageLines in
  // text-minikernel-layout.js) - only the first 2 of any message's
  // lines are ever drawn at once (text12b.asm's "textkernel2ndrow"
  // block always reads row 2 from TextIndex+TEXT_MESSAGE_LENGTH), so this is
  // how the rest come into view. Clamped directly against TextIndex itself,
  // via _textLinesBase/_textLinesMax (see setTextLinesRangeCode's
  // comment above, set by whichever "Show text" call most recently pointed
  // at the message currently showing) - a message with 2 or fewer lines has
  // base = max, so both blocks are harmless no-ops for it. No multiply
  // needed either way: every line is exactly TEXT_MESSAGE_LENGTH bytes
  // apart, so moving one line at a time is just a plain add/subtract.
  //
  // A 2-line move is two separate single-line guarded steps in a row, NOT
  // one step of 2*TEXT_MESSAGE_LENGTH - TextIndex only ever sits at exactly
  // base + TEXT_MESSAGE_LENGTH*k (k>=0), so this single-line guard
  // ("if TextIndex > base then ...") is already known safe by itself (the
  // same code this always was, before LINES existed) - repeating it can
  // never step past base even when only one line of room remains, because
  // the SECOND guard re-checks TextIndex fresh after the first one already
  // moved it. A single combined "- 2*TEXT_MESSAGE_LENGTH" step, guarded by
  // one check against base, would NOT have this safety: with only one
  // line's worth of room left, that single big step would undershoot past
  // base (or, for "down", overshoot past max) before the guard ever gets a
  // chance to re-examine TextIndex partway through.
  const buildLineScrollSteps = (block, bound, direction) => {
    const lines = Number(block.getFieldValue('LINES')) || 1;
    const step = direction === 'up' ?
      `if TextIndex > ${bound} then TextIndex = TextIndex - ${TEXT_MESSAGE_LENGTH}\n` :
      `if TextIndex < ${bound} then TextIndex = TextIndex + ${TEXT_MESSAGE_LENGTH}\n`;
    return step.repeat(Math.max(1, Math.min(2, lines)));
  };
  Blockly.BBasic['text_minikernel_line_scroll_up'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const base = resolveVar(textLinesBaseVarName());
    return buildLineScrollSteps(block, base, 'up');
  };
  Blockly.BBasic['text_minikernel_line_scroll_down'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const max = resolveVar(textLinesMaxVarName());
    return buildLineScrollSteps(block, max, 'down');
  };

  // Drives generateSystemDims()'s TextIndex/TextDataPtr dims below - needs to
  // know this well before any block's  generator runs.
  Blockly.BBasic.isTextMinikernelActive = function() {
    return !!this.textMinikernelUsed;
  };

  // The standard kernel's Title Screen pages draw the Text Minikernel's text under their graphics, when the project uses both
  // (see titletextkernel in text12a.asm and buildDriverAsm in titlescreen.js).
  Blockly.BBasic.isTitleTextUsed = function() {
    const config = ((useConfigurationStorage() || {}).value) || {};
    return config.kernel !== 'dpcplus' && !!this.titleScreenDrawUsed && this.isTextMinikernelActive();
  };

  // The timer ticks (64 cycles each) a page needs left after its graphics for the text: its lines, the setup lines and a margin;
  // with a wrapped second row 16 more. A page that has less left shows no text.
  Blockly.BBasic.titleTextTimerTicks = function() {
    return 22 + (this.isTextRow2Used() ? 16 : 0);
  };

  // Whether the project uses any block that can actually make a message
  // scroll or that reads/controls in-progress scroll state - see the
  // textScrollUsed pre-scan in bbasic.js for exactly which block types
  // count. Drives both reserveTextScrollDevVars (bbasic.js) and
  // generateTextScrollAdvance's  splice (text-scroll.js) - a project
  // using only plain, static "Show text" blocks needs neither.
  Blockly.BBasic.isTextScrollActive = function() {
    return !!this.textScrollUsed;
  };

  // Whether ANY Text tab entry has "Wrap to line 2" on - purely a Text tab
  // data check (not a workspace-block pre-scan), since the toggle lives on
  // the entry itself, not on any block. Drives text12b.asm's
  // "textkernel2ndrow" ifconst gate (see generateConfiguration in
  // generators/bbasic.js) and TextRow2Active's  dim just below - both
  // only pay for this feature once a project actually uses it. The
  // "(scrolling)" Show text blocks never wrap (per their  generators
  // below, which always force TextRow2Active to 0), so this only reflects
  // what the PLAIN Show text blocks can ever act on.
  Blockly.BBasic.isTextRow2Used = function() {
    // An entry that wraps only counts when a block can show it: a project that never shows one has no use for the
    // second row (and for DPC+ its lines).
    const wrapping = listTextStrings().filter((entry) => entry.wrapToLine2);
    const wrappingShown = wrapping.length && (this.textEntryShowBlocks || []).some((block) =>
      block.type === 'text_minikernel_show_by_id' ||
      wrapping.some((entry) => `${entry.id}` === `${block.getFieldValue('TEXT_ID')}`));
    return this.isTextMinikernelActive() && (!!wrappingShown || !!this.textRowSetUsed);
  };

  // Whether TextRow2Active itself needs to be dimmed - a BROADER condition
  // than isTextRow2Used() just above, which still gates ONLY the real,
  // expensive row-2-drawing kernel feature (textkernel2ndrow). The "more
  // below" scroll cursor (see generators/bbasic.js's
  // textScrollCursorConfigurationCode) reads TextRow2Active directly in
  // hand-written asm too, for ANY project using it, even one where no
  // message ever actually has "Wrap to line 2" on - it still needs the
  // BYTE to exist (reading as 0/false, correctly meaning "single row mode"
  // for every message in that case), just never the costly kernel feature
  // itself. Keeping these two checks separate is what stops turning on the
  // cursor from silently turning on ~13 extra scanlines of row-2-drawing
  // code nothing in the project actually asked for.
  Blockly.BBasic.needsTextRow2ActiveDim = function() {
    return this.isTextRow2Used() || !!this.textScrollCursorUsed;
  };

  // Whether ANY Text tab entry occupies more than one row - a BROADER check
  // than isTextRow2Used() just above, now that getStaticMessageLayout splits
  // a message into real, separate rows regardless of "Wrap to line 2" (a
  // plain overlong message word-wraps into row 2+ too, it just never draws
  // automatically without that toggle - see namedMessageWrapToLine2's
  // comment). Drives whether the static region's  byte offsets are still
  // a uniform TEXT_MESSAGE_LENGTH stride (text_minikernel_show_by_id's
  // fast/slow path) and whether text_static_offsets/text_has_row2/
  // text_lines_max get reserved/generated at all (generateTextStaticOffsetTables) -
  // a project where every message fits on one line pays nothing for any of
  // this, same as before "Wrap to line 2" existed at all.
  Blockly.BBasic.isTextMultiRowUsed = function() {
    return this.isTextMinikernelActive() && getStaticMessageLayout().some((entry) => entry.lineCount >= 2);
  };

  // Whether the project uses "Scroll text lines up/down" anywhere - a real
  // workspace-block pre-scan (see textLineScrollUsed in generators/
  // bbasic.js), unlike isTextRow2Used just above, since these blocks (not
  // Text tab data) are what actually read _textLinesBase/_textLinesMax.
  // Gates reserving those two dev vars (bbasic.js's  init()) and every
  // "Show text" code path's  setTextLinesRangeCode call above - a
  // project that never uses these blocks never pays for the range tracking
  // at all, even if some Text tab entry does wrap.
  Blockly.BBasic.isTextLineScrollUsed = function() {
    return !!this.textLineScrollUsed;
  };

  // TextIndex/TextDataPtr sit in var44/var46 (2 bytes: var46+var47) - scratch
  // RAM this app never otherwise touches, and safely free regardless of
  // Superchip or the standard kernel's  playfield buffer (var0-var43),
  // unlike aux1/aux2 (which alias the pfcolors/pfheights row pointers, and
  // would collide with the Enable per-row playfield colors option).
  //
  // TextDataPtr is different: per the Text Minikernel's  docs, it only
  // needs to be dimmed at all when the project's  Score Bar blocks have
  // separately turned pfscore on (score.js sets the PFSCORE_ENABLE_KEY
  // definitions_ entry that Blockly.BBasic.finish() snapshots into
  // pfscoreEnabledForTextMinikernel, since definitions_ itself is already
  // gone by the time generateSystemDims() runs) - text12a.asm already falls
  // back to reusing pfscore1's  storage for TextDataPtr otherwise, so
  // dimming it ourselves in that case would just double-define the symbol.
  //
  // TextRow2Active is the third and last member of this fixed-symbol-name
  // family (text12b.asm needs a literal, unchanging name to hardcode, the
  // same reason TextIndex/TextDataPtr aren't just ordinary auto-lettered
  // dev vars) - var45, the one byte of the documented "var44-47 always
  // free" pool (see reserveDevVarRW's  comment in generators/bbasic.js)
  // neither TextIndex (44) nor TextDataPtr (46-47) ever claims. Dimmed
  // whenever needsTextRow2ActiveDim() is true - either "Wrap to line 2" is
  // actually used somewhere (the same condition that separately gates
  // text12b.asm's, far more expensive "textkernel2ndrow" ifconst block -
  // see generateConfiguration in generators/bbasic.js), or the "more below"
  // scroll cursor is on and needs to read this byte regardless (see
  // needsTextRow2ActiveDim's  comment above).
  Blockly.BBasic.generateTextMinikernelDims = function() {
    if (!this.isTextMinikernelActive()) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const showVariableComments = config.showVariableComments ?? true;
    const textIndexComment = showVariableComments ?
      '  ; which message/character is currently shown, and the scroll position tracker (see text-scroll.js)' : '';
    const textDataPtrComment = showVariableComments ? '  ; Text Minikernel\'s message-table pointer' : '';
    const textRow2ActiveComment = showVariableComments ?
      '  ; whether the currently shown message also draws a wrapped second line' : '';
    const textIndexDim = `\n dim TextIndex = ${fixedFreeVariable(config, 44, Blockly.BBasic.dpcPlusSpriteMax)}${textIndexComment}`;
    const textDataPtrDim = this.pfscoreEnabledForTextMinikernel ?
      `\n dim TextDataPtr = ${fixedFreeVariable(config, 46, Blockly.BBasic.dpcPlusSpriteMax)}${textDataPtrComment}` : '';
    const textRow2ActiveDim = this.needsTextRow2ActiveDim() ?
      `\n dim TextRow2Active = ${fixedFreeVariable(config, 45, Blockly.BBasic.dpcPlusSpriteMax)}${textRow2ActiveComment}` : '';
    return textIndexDim + textDataPtrDim + textRow2ActiveDim;
  };

  // Spliced into bbasic.bb.hbs's Setup section, alongside the other system
  // variables' initial values (player0realcolor, etc.) - before
  // systemStartEvent, so a "Text: set color" block placed in the player's
  // System start event still overrides this. Without it TextColor (an alias
  // of statusbarlength - see text12a.asm) starts at whatever the standard
  // kernel's  RAM-clearing leaves it at (0, i.e. black), matching neither
  // the reference demo (which explicitly sets white) nor a readable default.
  Blockly.BBasic.generateTextMinikernelDefaults = function() {
    if (!this.isTextMinikernelActive()) return '';
    const lines = [` TextColor = ${colorByteToBuildBBasic(0x0F)}`];
    // DPC+ keeps these in the memory of virtual sprites the kernel does not clear, so they start out as whatever
    // was there (a second text row drawn before the first message is shown).
    if (isDpcPlusConfig()) {
      lines.push(' TextIndex = 0');
      if (this.needsTextRow2ActiveDim()) lines.push(' TextRow2Active = 0');
    }
    // Row 2's  color defaults to the "$01 sentinel" (see
    // buildTextRow2ColorOverride's  comment in utils/text-font.js), not a
    // real color - it means "follow TextColor" until a "Text: set color"
    // block explicitly targets row 2 and overwrites it with a real (always
    // even) color byte. Matches the reservation's  gate exactly
    // (isTextRow2Used() or some "Text: set color" block actually targeting
    // row 2) - row 1 is that dropdown's  default, so most projects never
    // reserve or default this var at all.
    if (this.isTextRow2Used() || this.textRow2ColorBlockUsed) {
      const row2Color = Blockly.BBasic.nameDB_.getName(
          textRow2ColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      lines.push(` ${row2Color} = $01`);
    }
    if (this.textScrollCursorUsed) {
      // $0E's  bit 0 is already 0 (even), so this doubles as the
      // "visible by default" default too - see TEXT_SCROLL_CURSOR_HIDDEN_BIT's
      // comment above.
      const cursorColor = Blockly.BBasic.nameDB_.getName(
          textScrollCursorColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      lines.push(` ${cursorColor} = ${colorByteToBuildBBasic(0x0E)}`);
      const endIconColor = Blockly.BBasic.nameDB_.getName(
          textEndIconColorVarName(), Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      lines.push(` ${endIconColor} = ${colorByteToBuildBBasic(0x0E)}`);
    }
    return lines.join('\n');
  };

  // Spliced into bbasic.bb.hbs right after the data tables section (see
  // "generatedTextMinikernel" in the template) - the same never-fallen-into
  // spot data tables/subroutines use, since this is a self-contained
  // subroutine only ever reached via "jsr minikernel" from the standard
  // kernel's  code, never by falling through from the line above.
  //
  // text12a.asm/text12b.asm are pulled in with the manual's  documented
  // "inline <file>" statement, exactly as written (no compiler workarounds
  // needed with the real bB 1.9 toolchain - see hooks/bb-compiler.js) - the
  // actual file contents reach the compiler as siblings of the source, via
  // getTextMinikernelSiblingFiles()/hooks/rom.js.
  //
  // On a 2k/4k ROM (a single physical bank), these files simply stay inline
  // wherever they fall - matching the reference demo's  layout exactly
  // (confirmed byte-for-byte and working end to end in the emulator). On a
  // bankswitched ROM, the whole block is wrapped in "bank <kernel bank> ...
  // bank 1" (see KERNEL_BANK_BY_ROMSIZE above) so it shares the kernel's
  // bank, matching the plain (non-bankswitched) "jsr minikernel" call the
  // standard kernel makes into it.
  // The bank the standard kernel's drawing code and message data go in (text12a.asm's "textbank" - the score-loop
  // half stays in the kernel bank), or 0 when they stay with it: DPC+ keeps everything in one bank, and an 8k ROM
  // has no bank to spare. It is the one below the kernel bank, which the relocation also uses, so that bank's
  // section is where generateRelocatedSections puts this content.
  Blockly.BBasic.textKernelBank = function() {
    const config = ((useConfigurationStorage() || {}).value) || {};
    if (config.kernel === 'dpcplus') return 0;
    const kernelBank = KERNEL_BANK_BY_ROMSIZE[config.romSize];
    return kernelBank >= 4 ? kernelBank - 1 : 0;
  };

  Blockly.BBasic.generateTextMinikernel = function() {
    this.textBankBody = '';
    if (!this.isTextMinikernelActive()) return '';

    // Row 0: reserved blank - TextIndex lives in RAM the standard kernel
    // clears to 0 at power-on, and stays 0 until some block explicitly
    // assigns it, so this is what shows (nothing) before that happens,
    // rather than whichever message happened to be defined first. Rows
    // 1..N: every Text tab entry, in that same order (position N's  byte
    // offset - see getStaticMessageLayout() above and "Show text with ID"'s
    // generator - no longer a flat N*TEXT_MESSAGE_LENGTH stride once any
    // entry wraps). An entry with "Wrap to line 2" on gets one row per line
    // splitMessageLines (text-minikernel-layout.js) split its  text
    // into - explicit line breaks first, falling back to word-wrap only
    // when there isn't one - all stored back to back (see text12b.asm's
    // "textkernel2ndrow" block, which always reads row 2 from TextIndex+
    // TEXT_MESSAGE_LENGTH - this adjacency is what makes that fixed offset
    // correct, and what lets "Scroll text lines up/down" move through the
    // rest just by adding/subtracting TEXT_MESSAGE_LENGTH from TextIndex).
    // Next: free-typed messages, in first-referenced order (see
    // registerFreeTypedMessage above) - never wrapped, always a single row.
    // Every row so far is always exactly TEXT_MESSAGE_LENGTH wide and
    // always truncated to maxWidth via encodeTextMessage - this is the
    // region the PLAIN "Show text" blocks exclusively read from.
    //
    // After that: the scroll append region (see getNamedScrollLayout/
    // registerFreeTypedScrollMessage's  comments in text-scroll.js) - one
    // extra, untruncated row for every entry a "(scrolling)" block variant
    // actually needed one for (an entry short enough to not need scrolling
    // reuses its  static row above instead, and has no `glyphs` here at
    // all - see getNamedScrollLayout's  null-glyphs case).
    // bB's "data" statement caps how many comma-separated values a
    // single line can hold (confirmed directly: a real build of a long
    // scrollable message failed with "Maximum line length exceeded in data
    // statement") - every row's  glyphs are chunked into lines of at
    // most 16 (same chunk size generateDataTables() in generators/bbasic.js
    // already uses for the same reason) before being joined. Purely a
    // source-formatting concern: DASM concatenates every value in a
    // "data...end" block into one contiguous byte run regardless of how
    // many lines it's split across, so this never changes any offset above.
    const glyphRows = (glyphs) => chunk(glyphs, 16).map((row) => '  ' + row.join(', '));

    const maxWidth = resolveTextMaxDisplayWidth();
    const staticEntries = [{text: '', justify: 'left'}, ...listTextStrings()];
    // Always splits into as many rows as splitMessageLines needs, regardless
    // of "Wrap to line 2" - that toggle no longer decides whether row 2+
    // data EXISTS (see getStaticMessageLayout's  comment), only whether
    // it draws automatically (namedMessageWrapToLine2/setTextRow2ActiveCode
    // above).
    const namedRows = staticEntries.flatMap(({text, justify}) =>
      encodeTextMessageLines(text, justify, maxWidth).flatMap((glyphs) => glyphRows(glyphs)));
    const freeTypedRows = (this.freeTypedMessages || []).flatMap((text) =>
      glyphRows(encodeTextMessage(text, 'left', maxWidth)));
    const namedScrollRows = getNamedScrollLayout()
        .filter((entry) => entry.glyphs)
        .flatMap(({glyphs}) => glyphRows(glyphs));
    const freeTypedScrollRows = (this.freeTypedScrollMessages || [])
        .flatMap(({glyphs}) => glyphRows(glyphs));
    // Page-aligned (DASM's "align 256", same directive text12a.asm's
    // score_loop_height guard uses right above textscoreloop) - text12b.asm's
    // showtextrow reads this table via "(TextDataPtr),y" with y =
    // TextIndex..TextIndex+11 (see its  comment), a 12-value UNROLLED run
    // with no branch to absorb the 6502's well-known extra cycle whenever an
    // indexed-indirect read crosses a page boundary. Without this, whether
    // any given TextIndex value happens to cross one depends entirely on
    // wherever DASM happens to place this table in ROM - invisible for a
    // message that only ever sits at one fixed, by-luck-safe offset (a
    // static "Show text"), but scrolling sweeps TextIndex through every
    // offset in the message, so it was only ever a matter of time before one
    // of them landed on the wrong side of a page boundary and shifted every
    // cycle-exact instruction after it in showtextrow/drawtextrow for that
    // frame - confirmed as the real cause of a reported "text looks garbled
    // only while scrolling, not when static" bug. Forcing the whole table
    // onto one page removes the possibility entirely, for every TextIndex
    // value it can ever hold, regardless of table size (small enough here
    // that alignment padding is the only cost, never a second page).
    const dataTable = ` asm\n       align 256\nend\n data text_strings\n${
      [...namedRows, ...freeTypedRows, ...namedScrollRows, ...freeTypedScrollRows].join('\n')
    }\nend`;

    // Matches the reference demo's  layout exactly: the data table comes
    // first, then both inline files back to back with nothing between them.
    // text12a.asm's  tail jumps to a label defined in text12b.asm, so
    // splitting them with the data table in between doesn't break by
    // address (DASM resolves that jump by label, not by physical position) -
    // but nothing about combining the Text Minikernel with hardware
    // collision has ever been tested against that arrangement, only this
    // one, so there's no reason to keep the two files apart from each other.
    const dpcPlusText = isDpcPlusConfig();
    // The standard kernel can run the drawing code and the message data from another bank (text12a.asm
    // switches to it through "textbank"), which leaves the kernel bank with just the score-loop half. That
    // content goes out with the relocated sections (generateRelocatedSections), as the bank has other
    // content in it too.
    const textBank = Blockly.BBasic.textKernelBank();
    this.textBankBody = textBank ? [dataTable, '', ' inline text12b.asm'].join('\n') : '';
    const block = [
      ...(textBank ? [] : [dataTable, '']),
      ...(dpcPlusText ? [' inline text12DPCplus.asm'] :
        textBank ? [' inline text12a.asm'] : [' inline text12a.asm', ' inline text12b.asm']),
      // The playfield color scroll tables go in this bank too (the kernel's):
      // see buildBackgroundColorScroll in generators/bbasic.js.
      ...(Blockly.BBasic.backgroundColorScrollTopBank ? ['', Blockly.BBasic.backgroundColorScrollTablesAsm] : []),
    ].join('\n');

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const kernelBank = KERNEL_BANK_BY_ROMSIZE[config.kernel === 'dpcplus' ? 'dpcplus' : config.romSize];
    if (!kernelBank) return block;

    // 2600basic's  per-bank bookkeeping (the space-left tracking that
    // produced the "bytes left in bank N" figures used to find kernelBank in
    // the first place) needs every bank up to kernelBank to be visited at
    // least once, in order - confirmed by reproducing the real failure: with
    // nothing else in this project using banks 2/3 on a 16k+ ROM, jumping
    // straight to "bank <kernelBank>" (skipping the banks in between) made
    // DASM fail with a cascade of "Unknown Mnemonic 'jmp BS_jsr'"/"BS_return"
    // errors - harmless empty "bank N ... bank 1" placeholders for every
    // skipped bank fixed it. Bank 1 itself doesn't need one (it's always
    // visited - the whole rest of the program lives there).
    //
    // Any bank the auto-relocation system (see hooks/rom.js) has actually
    // put real content in is skipped here, NOT given an empty placeholder on
    // top of that - generateRelocatedSections already declares "bank N ...
    // bank 1" for it with real content inside. Confirmed directly as a real
    // bug otherwise: declaring the same bank a second time, non-
    // contiguously (an empty placeholder here, real content later),
    // corrupts DASM's address tracking for it (reported as "Origin Reverse-
    // indexed" - see generateRelocatedSections' comment on this same
    // failure mode).
    //
    // But that's not the only bank generateRelocatedSections already
    // declares - with the Text Minikernel active, its gap-fill (see its
    // "banksBeforeGapFill"/"gapFillBanks" comment) ALSO declares an empty
    // placeholder, contiguously, for every bank from 2 up through whichever
    // bank holds the highest-numbered real relocated unit
    // (highestUsedRelocationBankNumber, see its comment) - even ones
    // nothing landed in. Skipping only banks with REAL content (usedBanks,
    // above) and then separately placeholder-filling from 2 here duplicated
    // THOSE gap banks a second time too, non-contiguously - the exact same
    // corruption class, just for an empty-vs-empty pair instead of an
    // empty-vs-real one. Confirmed directly as a real bug via a reported
    // build failure (cascading "Unknown Mnemonic" errors, only once Fine-
    // mode inertia's extra code pushed something unrelated - music - out to
    // a high enough bank for this overlap to exist at all): starting this
    // loop after whatever generateRelocatedSections already covers, instead
    // of always at 2, leaves every bank declared exactly once.
    const usedBanks = Blockly.BBasic.usedRelocationBankNumbers();
    const primaryBank = Blockly.BBasic.primaryBank();
    // DPC+ only (primaryBank is 2 only for DPC+, 1 for every other kernel) -
    // see generateRelocatedSections' own identical "Harmony cart fix"
    // comment in bbasic.js for the real docs citation.
    const harmonyCartFix = primaryBank === 2 ? '\n temp1=temp1' : '';
    const skippedBankPlaceholders = [];
    // Closing tag is always a literal "bank 1", never primaryBank() - see
    // generateRelocatedSections' identical comment (statements.c's
    // newbank() treats "bank 1" as a genuine no-op, but bank 2 has real
    // side effects for DPC+ that a bare closer must never re-trigger).
    const gapFillStart = Math.max(primaryBank + 1, Blockly.BBasic.highestUsedRelocationBankNumber() + 1);
    for (let bank = gapFillStart; bank < kernelBank; bank++) {
      if (!usedBanks.has(bank)) skippedBankPlaceholders.push(` bank ${bank}${harmonyCartFix}\n bank 1`);
    }

    return `${skippedBankPlaceholders.join('\n')}\n bank ${kernelBank}${harmonyCartFix}\n${block}\n bank 1`;
  };
};
