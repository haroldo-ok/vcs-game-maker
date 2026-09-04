'use strict';

import {chunk} from 'lodash';

import {useConfigurationStorage} from '../../hooks/project';
import {TEXT_MESSAGE_LENGTH, CHAR_TO_GLYPH, listTextStrings,
  resolveTextMaxDisplayWidth} from '../../blocks/text-strings';
import {functionCallDiscardVarName} from '../../blocks/function';
import {getNamedScrollLayout, registerFreeTypedScrollMessage, buildTextScrollSetupLines,
  trackTextByIdScrollUsage, textScrollFarEndVarName,
  textScrollBaseVarName, textScrollStateVarName,
  textScrollPauseDurationVarName, textScrollTimerVarName,
  TEXT_SCROLL_DIR_MASK} from './text-scroll';
import {getStaticMessageLayout, staticMessageRegionEnd, splitMessageLines} from './text-minikernel-layout';

// Canonical dev var names for "Scroll text lines up/down" (see their own
// generators below) - a message with more than 2 lines (see
// splitMessageLines in text-minikernel-layout.js) only ever shows 2 of them
// at once (TextIndex/TextIndex+TEXT_MESSAGE_LENGTH, same as any other
// wrapping message), these track the CURRENTLY shown message's own valid
// TextIndex range so the up/down blocks can clamp against it directly
// (comparing TextIndex itself, not a separate 0-based "which page" counter)
// rather than needing a multiply to convert a page number back into a byte
// offset. Plain dev-var-pool names (unlike TextIndex/TextDataPtr/
// TextRow2Active) - only ever read/written from generated bBasic, never
// from the raw text12a.asm/text12b.asm kernel files, so they don't need a
// fixed var slot.
export const textLinesBaseVarName = () => '_textLinesBase';
export const textLinesMaxVarName = () => '_textLinesMax';

// The standard kernel's own code calls "jsr minikernel" as a plain,
// same-bank call (never a bankswitched "BS_jsr") - so on a bankswitched ROM,
// text12a.asm/text12b.asm (and the data table between them) have to be
// assembled into the SAME physical bank the kernel itself lives in, not the
// default "bank 1" everything else falls into. That bank is the highest
// numbered one for the ROM size (confirmed against the assembled symbol
// table: with no explicit "bank" wrapping, minikernel/text_strings/textkernel
// landed in the default bank's own address range while drawscreen/scoretable
// - the kernel - landed in a different one; wrapping this block in
// "bank <last bank> ... bank 1" moves it to share the kernel's bank, and the
// score/text rows that were otherwise silently missing on 8k+ ROMs render
// correctly). Duplicated in miniature from hooks/rom.js's
// BANK_COUNT_BY_ROMSIZE rather than imported, to avoid pulling that module's
// heavy compiler chain into every generator file (same reasoning as
// bbasic.js's own BANKSWITCHED_ROM_SIZES duplicate).
const KERNEL_BANK_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8, '64k': 16};

// Resolves a literal "math_number" field's own text to a real JS number, or
// null if it isn't one of the literal forms that block's own field
// validator accepts (see blocks/math.js) - decimal, $1F/0x1F hex, or
// %1010/0b1010 binary. Used by text_minikernel_show_by_id_scroll below to
// recognize "Scroll text ID [a literal number]" specifically, so that ONE
// exact entry's own maxOffset can be checked instead of falling back to
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
// getNamedScrollLayout's own "pages" comment in text-scroll.js) - maxWidth
// is a hard cap either way, so a scroll page is really just one more
// TEXT_MESSAGE_LENGTH-wide row built the exact same way, never a longer,
// untruncated one.
//
// Text is justified within a maxWidth-wide field first (justify - see the
// Text tab's own Left/Center/Right buttons, one of TEXT_JUSTIFY_OPTIONS in
// blocks/text-strings.js - decides where the padding WITHIN that field
// goes: 'left', the default, puts it all on the right, 'right' puts it all
// on the left, 'center' splits it evenly, the smaller half (when the
// padding is odd) going on the left, a plain floor/ceil split. maxWidth
// (the Text tab's own "max characters to display" setting) is what totalPad
// is computed from, so a narrower maxWidth shrinks the field BOTH center
// and right justify split/pad within, not just the overall truncation
// point. That maxWidth-wide field always starts at the row's own first
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
// plain single-row message already is (see encodeTextMessage's own
// comment). Only the first two of these are ever shown at once - "Scroll
// text lines up/down" (see their own generators below) move TextIndex to
// bring the rest into view.
export const encodeTextMessageLines = (text, justify = 'left', maxWidth = resolveTextMaxDisplayWidth()) =>
  splitMessageLines(text, maxWidth).map((line) => encodeTextMessage(line, justify, maxWidth));

// "Show text with ID" (the plain, non-scrolling block) doesn't know which
// entry it's showing until runtime, so it normally computes the static
// row's own byte offset with a cheap "id * TEXT_MESSAGE_LENGTH" multiply -
// correct ONLY when every entry is exactly one row wide. The moment any one
// entry in the project has "Wrap to line 2" on, that uniform-stride
// assumption breaks (a wrapping entry earlier in id order pushes every
// later entry's own offset further out than a flat multiply would land on),
// so that block falls back to a real runtime table lookup instead - same
// "small parallel tables, one byte per Text tab entry (including the
// reserved blank guard row)" shape as text-scroll.js's own text_offsets/
// text_scroll_max tables, and the same per-bank-copy scheme (a table can
// only be read correctly from the bank it's declared in - see
// dataTableSymbolName/trackDataTableBank in generators/bbasic.js). Only
// ever generated at all when isTextRow2Used() is true (see
// generateTextStaticOffsetTables below), matching TextRow2Active's own dim
// gate:
//   text_static_offsets - that entry's own row 1 byte offset (also doubles
//     as its own lowest valid TextIndex, for "Scroll text lines up").
//   text_has_row2 (0 or 1) - tells the kernel whether to also draw row 2 at
//     all (see text12b.asm's own "textkernel2ndrow" block) - true for
//     every entry with 2+ lines, regardless of current scroll position.
//   text_lines_max - that entry's own HIGHEST valid TextIndex (its own row
//     1 offset when it has only 1 line, i.e. no scroll room at all) - for
//     "Scroll text lines down"'s own clamp.
const TEXT_STATIC_OFFSET_TABLE_ID = '__text_static_offsets';
const TEXT_HAS_ROW2_TABLE_ID = '__text_has_row2';
const TEXT_LINES_MAX_TABLE_ID = '__text_lines_max';

export const trackTextStaticOffsetUsage = (Blockly, bank) => {
  Blockly.BBasic.trackDataTableBank(TEXT_STATIC_OFFSET_TABLE_ID, bank);
  Blockly.BBasic.trackDataTableBank(TEXT_HAS_ROW2_TABLE_ID, bank);
  Blockly.BBasic.trackDataTableBank(TEXT_LINES_MAX_TABLE_ID, bank);
};

// Spliced into bbasic.bb.hbs right alongside generatedTextOffsetTables (see
// generators/bbasic.js's own finish() for bank 1's own copy and
// generateRelocatedSections for each relocated bank's own copy) - same
// "nothing ever read it, no bank 1 copy either" behavior as
// generateTextOffsetTables when isTextRow2Used() is false (the common
// case), so a project that never uses "Wrap to line 2" pays nothing for
// this at all.
export const generateTextStaticOffsetTables = (Blockly, bank) => {
  if (!Blockly.BBasic.isTextRow2Used()) return '';
  const usage = Blockly.BBasic.dataTableBankUsage[TEXT_STATIC_OFFSET_TABLE_ID];
  if (!(usage ? usage.has(bank) : bank === 1)) return '';
  const layout = getStaticMessageLayout();
  const offsets = layout.map((entry) => `${entry.offset}`).join(', ');
  const hasRow2Bytes = layout.map((entry) => (entry.lineCount >= 2 ? 1 : 0)).join(', ');
  const linesMax = layout.map((entry) =>
    `${entry.offset + Math.max(0, entry.lineCount - 2) * TEXT_MESSAGE_LENGTH}`).join(', ');
  return ` data text_static_offsets\n  ${offsets}\nend\n\n data text_has_row2\n  ${hasRow2Bytes}\nend\n\n` +
    ` data text_lines_max\n  ${linesMax}\nend`;
};

export default (Blockly) => {
  const markTextMinikernelUsed = () => {
    Blockly.BBasic.textMinikernelUsed = true;
  };

  // Every message defined on the Text tab occupies a FIXED table row, one
  // more than its position in listTextStrings()'s own id-sorted order (row 0
  // is reserved blank - see generateTextMinikernel() below) - not assigned
  // lazily as blocks happen to reference them. That's what makes "Show text
  // with ID" possible at all: its number is only known at runtime, so
  // there's no block-visitation moment to hang a lazy registration off of.
  // Deliberately keyed off id, not Text tab DISPLAY order (see
  // listTextStrings' own comment) - display order is freely drag-reorderable
  // (see TextEditor.vue), and a message's ROM row/ID number staying fixed
  // regardless of where its card happens to sit in the editor is exactly the
  // point: typing "2" always gets you the same message, whether or not it's
  // been dragged somewhere else on the Text tab since.
  const namedMessagePosition = (id) => {
    const entries = listTextStrings();
    const index = entries.findIndex((entry) => `${entry.id}` === `${id}`);
    return index === -1 ? 0 : index + 1;
  };
  // This entry's own byte offset/line count within the static region - see
  // getStaticMessageLayout's own comment above for why these can no longer
  // be a flat position*TEXT_MESSAGE_LENGTH computation.
  const namedMessageOffset = (id) => getStaticMessageLayout()[namedMessagePosition(id)].offset;
  const namedMessageLineCount = (id) => getStaticMessageLayout()[namedMessagePosition(id)].lineCount;

  // Free-typed messages ("Show text: <literal>") have no Text tab entry to
  // number them by, so they keep the old lazy, dedup-by-content scheme,
  // appended after every Text tab entry's own static row(s) (see
  // staticMessageRegionEnd/generateTextMinikernel()) - always
  // TEXT_MESSAGE_LENGTH wide and always truncated to maxWidth (see
  // encodeTextMessage), same as every named row, since maxWidth is a hard
  // cap every "Show text" block respects, scrolling variants included (see
  // getNamedScrollLayout's own comment in text-scroll.js). Free-typed
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

  // Emits the write every "Show text"/"Show text with ID"/"Clear text" code
  // path needs, telling the kernel whether TextIndex's own message (just
  // set above/below) also has a wrapped second line - see text12b.asm's own
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
  // "Scroll text lines up/down" (see their own generators below) to know
  // the CURRENTLY shown message's own valid TextIndex range - baseExpr is
  // its row 1 offset (the lowest valid TextIndex, same value "Scroll text
  // lines up" clamps against), maxOffsetExpr is its highest (row 1's own
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
  // messages, a runtime table lookup for "Show text with ID" - see its own
  // generators below) and the scroll speed/pause codes to use (either the
  // fixed defaults below, for the plain "Show text" blocks, or a
  // "..._scroll" block's own SCROLL_SPEED/SCROLL_PAUSE fields) - see
  // buildTextScrollSetupLines' own comment in text-scroll.js for exactly
  // what gets reconfigured unconditionally vs. only when the message
  // actually changes.
  const emitScrollSetup = (offsetExpr, maxOffsetExpr, speed, pause) => {
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const uniqueId = Blockly.BBasic.blockNumbers.next('textScroll');
    const lines = buildTextScrollSetupLines(
        resolveVar, offsetExpr, maxOffsetExpr, speed, pause, uniqueId, Blockly.BBasic.isTextScrollActive());
    return lines.join('\n') + '\n';
  };

  // Used by the plain "Show text" blocks (no SCROLL_SPEED/SCROLL_PAUSE
  // fields of their own) whenever a message they show turns out to be too
  // long to fit statically - see blocks/text-minikernel.js's own "(scrolling)"
  // block variants for ones with tunable fields instead.
  const DEFAULT_SCROLL_SPEED = '20';
  const DEFAULT_SCROLL_PAUSE = '30';

  const scrollFieldCodes = (block) => [
    Blockly.BBasic.valueToCode(block, 'SCROLL_SPEED', Blockly.BBasic.ORDER_ASSIGNMENT) || DEFAULT_SCROLL_SPEED,
    Blockly.BBasic.valueToCode(block, 'SCROLL_PAUSE', Blockly.BBasic.ORDER_ASSIGNMENT) || DEFAULT_SCROLL_PAUSE,
  ];

  // Plain named block: always the ordinary static row(s) (namedMessageOffset -
  // one row, or as many as splitMessageLines needed if this entry has "Wrap
  // to line 2" on), maxOffset always 0 - never touches the scroll append
  // region at all.
  Blockly.BBasic['text_minikernel_show_named'] = function(block) {
    markTextMinikernelUsed();
    const id = block.getFieldValue('TEXT_ID');
    const offset = namedMessageOffset(id);
    const lineCount = namedMessageLineCount(id);
    const maxOffset = offset + Math.max(0, lineCount - 2) * TEXT_MESSAGE_LENGTH;
    return emitScrollSetup(offset, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      setTextRow2ActiveCode(lineCount >= 2) +
      setTextLinesRangeCode(offset, maxOffset);
  };
  // Scroll named block: uses the SAME position to look up that entry's own
  // page-0 offset/maxOffset in the scroll append region (see
  // getNamedScrollLayout in text-scroll.js) - naturally maxOffset = 0 for a
  // message with only one page (fits within maxWidth already), same
  // end-to-end effect as the plain block above for that message. Scrolling
  // messages never wrap (always a single line - see setTextRow2ActiveCode's
  // own comment on its "active" parameter), regardless of whether this
  // entry's own "Wrap to line 2" toggle happens to be on - that toggle only
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
    return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block)) +
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
  Blockly.BBasic['text_minikernel_show_scroll'] = function(block) {
    markTextMinikernelUsed();
    const entry = registerFreeTypedScrollMessage(Blockly, block.getFieldValue('TEXT'));
    return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block)) +
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
    // own registerDataDispatchFunction), and a function call is only legal
    // when directly assigned to a variable (confirmed straight from the
    // reference bB compiler's own source: callfunction() only supports
    // "var = name(args)") - embedding it inside further arithmetic instead
    // produced a real, reproduced build failure ("Syntax Error '#,'" from a
    // mangled immediate load). temp1 (not this block's own capture var) was
    // tried here first and reverted: this block can sit INSIDE a function
    // (e.g. one built to work around the exact same "table id from a
    // variable" need this exists for), and temp1 doubles as that enclosing
    // function's own argument 1 - confirmed as a second real build failure,
    // clobbering that argument the moment this ran, same class of bug
    // functionCallDiscardVarName already exists to avoid in
    // generators/bbasic/function.js - reused directly here rather than a
    // second dedicated var of its own, same "written once, read back
    // immediately after, never held across another Function call" lifetime.
    // functionCallDiscardVarName now routes through reserveDevVarRW
    // (generators/bbasic.js's own init()) - captured with .write here,
    // then read back (.read, possibly more than once - emitScrollSetup
    // embeds it in up to 3 separate lines) on the lines right after.
    const argPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const captureArg = `${argPair.write} = ${argument0}\n`;
    // Fast path: no entry in the project can ever have a second row, so the
    // static region really is a uniform TEXT_MESSAGE_LENGTH stride - the
    // plain multiply (needing div_mul.asm - see Blockly.BBasic.usesDivMul's
    // own comment elsewhere in this codebase) is cheaper than a table read
    // and stays exactly correct.
    if (!Blockly.BBasic.isTextRow2Used()) {
      Blockly.BBasic.usesDivMul = true;
      const offsetExpr = `${argPair.read} * ${TEXT_MESSAGE_LENGTH}`;
      return captureArg +
        emitScrollSetup(offsetExpr, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
        setTextLinesRangeCode(offsetExpr, offsetExpr);
    }
    // Slow path: some entry DOES wrap, so row widths aren't uniform any
    // more - the offset, whether row 2 applies, and the valid scroll range
    // all have to come from a real runtime table lookup instead (see
    // text_static_offsets/text_has_row2/text_lines_max's own comment
    // above).
    trackTextStaticOffsetUsage(Blockly, Blockly.BBasic.getCurrentBank());
    return captureArg +
      emitScrollSetup(`text_static_offsets[${argPair.read}]`, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE) +
      `TextRow2Active = text_has_row2[${argPair.read}]\n` +
      setTextLinesRangeCode(`text_static_offsets[${argPair.read}]`, `text_lines_max[${argPair.read}]`);
  };
  // Scroll by-id block: normally WHICH entry gets shown isn't known until
  // runtime, so the offset needs the real "text_offsets[id]" table lookup -
  // but every entry's own maxOffset is Text tab data, known at compile time
  // either way, so two levels of shortcut apply before falling back to an
  // actual runtime "text_scroll_max[id]" table read:
  //  1. A literal number plugged directly into VALUE (e.g. "Scroll text ID
  //     3") means the exact entry is ALSO known at compile time here, same
  //     as the named blocks above - resolve straight to that one entry's
  //     own maxOffset (same layout[position] indexing
  //     text_minikernel_show_named_scroll uses, since this block's own
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
      return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block)) +
        setTextRow2ActiveCode(false) +
        setTextLinesRangeCode(entry.offset, entry.offset);
    }

    // argument0 is only ever a compile-time literal on the branch above (the
    // one case where it's never actually embedded into generated code at
    // all) - every OTHER value reaching here is a genuine runtime
    // expression, up to and including another table read (e.g. a "Data: get
    // element" block plugged straight into this block's own VALUE socket -
    // a real reported bug: "not stopping at the bounds... when given from a
    // data table"). Embedding that raw expression directly inside
    // "text_offsets[...]"/"text_scroll_max[...]" below used to produce a
    // NESTED table-index expression ("text_offsets[sometable[y]]") - the
    // same "complex statement" class of corruption already fixed elsewhere
    // in this codebase for a compound arithmetic index (see
    // generators/bbasic/music.js's own joyDir8Table comment: "only a single
    // plain variable index compiles correctly"), just with a nested table
    // read instead of arithmetic as the culprit. Captured into a dedicated
    // dev var exactly ONCE here instead (same reasoning
    // generateDistancePointChecks' own POINT-into-temp2 capture uses for the
    // "capture once" part), so every table index below is a single plain
    // variable - also incidentally fixes argument0 otherwise being
    // evaluated twice over (once per table read) for no reason, since both
    // reads plug the exact same value in. temp1 itself (not this dedicated
    // var) was used here originally and reverted: this block can sit INSIDE
    // a function whose own argument is also read via temp1 (see
    // text_minikernel_show_by_id's own identical comment just above, and
    // functionCallDiscardVarName's in blocks/function.js for the same class
    // of risk) - confirmed as a real build failure, clobbering that
    // function's own live argument. Reuses that same shared var directly
    // rather than a second dedicated one of its own (see its own comment).
    // functionCallDiscardVarName now routes through reserveDevVarRW (see
    // this file's own identical comment on text_minikernel_show_by_id
    // above) - .write to capture, .read for every use after.
    const argPair = Blockly.BBasic.superchipRwPairs[functionCallDiscardVarName()];
    const captureArg = `${argPair.write} = ${argument0}\n`;
    if (!layout.some((entry) => entry.maxOffset > 0)) {
      return captureArg + emitScrollSetup(`text_offsets[${argPair.read}]`, 0, ...scrollFieldCodes(block)) +
        setTextRow2ActiveCode(false) +
        setTextLinesRangeCode(`text_offsets[${argPair.read}]`, `text_offsets[${argPair.read}]`);
    }

    trackTextByIdScrollUsage(Blockly, Blockly.BBasic.getCurrentBank());
    return captureArg + emitScrollSetup(
        `text_offsets[${argPair.read}]`, `text_scroll_max[${argPair.read}]`, ...scrollFieldCodes(block)) +
      setTextRow2ActiveCode(false) +
      setTextLinesRangeCode(`text_offsets[${argPair.read}]`, `text_offsets[${argPair.read}]`);
  };

  Blockly.BBasic['text_minikernel_clear'] = function(block) {
    markTextMinikernelUsed();
    // Setting TextIndex alone isn't enough: if the message being cleared was
    // scrolling, generateTextScrollAdvance (text-scroll.js) runs every frame
    // in commongamelogic and keeps recomputing TextIndex from the OLD scroll
    // state, overwriting this back to the scrolling message on the very next
    // frame - a real reported bug ("text isn't staying clear after using
    // 'clear text'"). Setting farEnd = base (both 0) makes that per-frame
    // check bail immediately (its own first line is "if farEnd = base then
    // goto done"), and base is reset too so a later "Show text (scrolling)"
    // call starts from a clean slate rather than whatever was left over.
    // state is set to 2, not 1 - a tri-state (see textScrollStateVarName's
    // own comment) that also forces the NEXT "Show text" call to fully
    // reset even if it's showing the exact same message as before the clear
    // (otherwise buildTextScrollSetupLines' own base-matches guard would
    // think nothing changed and skip re-pointing TextIndex at it - a real
    // reported follow-up bug, "scroll text is not coming back after using
    // clear text"). That same bare "state = 2" also resets direction back to
    // 0 for free (see TEXT_SCROLL_DIR_BIT's own comment) - no separate write
    // needed, unlike the "Pause"/"Unpause" actions in
    // text_minikernel_scroll_control, which specifically must NOT do that.
    // Same "resolveVar allocates a real letter the first time it's called,
    // independent of reserveTextScrollDevVars' own reservation" hazard as
    // buildTextScrollSetupLines' own comment in text-scroll.js - only
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

  Blockly.BBasic['text_minikernel_set_color'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return `TextColor = ${argument0}\n`;
  };

  Blockly.BBasic['text_minikernel_fade_to'] = function(block) {
    // Text's color fade trigger - same shared mechanism as Background's own
    // "Fade color to" (see emitColorFadeTrigger in
    // generators/bbasic/background.js), always targeting TextColor.
    markTextMinikernelUsed();
    const color = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    const frames = Blockly.BBasic.valueToCode(block, 'FRAMES', Blockly.BBasic.ORDER_NONE) || '1';
    return Blockly.BBasic.emitColorFadeTrigger('TextColor', color, frames);
  };

  Blockly.BBasic['text_minikernel_fade_finished'] = function(block) {
    // Text's own fade-finished watch - same shared mechanism as
    // Background's own "When ... color has finished fading" (see
    // emitFadeFinishedWatch in generators/bbasic/background.js), always
    // targeting TextColor. No markTextMinikernelUsed() call here (unlike
    // text_minikernel_fade_to above) - this is already a no-op unless a
    // matching fade trigger exists elsewhere in the project (see
    // emitFadeFinishedWatch's own watches.has(...) check), and that
    // trigger's own generator already marks the kernel used whenever it's
    // actually reachable.
    return Blockly.BBasic.emitFadeFinishedWatch(block, 'TextColor');
  };

  // A single comparison against the shared scroll state (see
  // text-scroll.js) - modeled directly on background_fade_active's own
  // simple-bit-read pattern in generators/bbasic/background.js. TextIndex is
  // the scroll position tracker itself now (see textScrollFarEndVarName's
  // own comment in text-scroll.js) - "Left" reads TextIndex = base (also
  // true, harmlessly, for a message that never needed to scroll at all -
  // see buildTextScrollSetupLines' own comment); "Right" reads TextIndex =
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

  // See text_minikernel_scroll_control's own comment in blocks/
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
    const pauseDuration = resolveVar(textScrollPauseDurationVarName());
    const state = resolveVar(textScrollStateVarName());
    const action = block.getFieldValue('ACTION');
    // Snaps back to the message's own start (TextIndex = base, its own
    // scroll position tracker now - see textScrollFarEndVarName's own
    // comment) - shared by Stop/Restart, which only differ in whether they
    // leave the paused flag set afterward. Direction isn't reset here
    // directly (no separate write needed - see TEXT_SCROLL_DIR_BIT's own
    // comment) since both callers below immediately follow this with a
    // bare "state = n" overwrite of their own, which already zeroes that
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
    // step, matching buildTextScrollSetupLines' own reasoning for why a
    // freshly (re)started message shouldn't immediately start scrolling
    // away after only a "speed"-length delay.
    return resetToStart + `${state} = 0\n` + `${timer} = ${pauseDuration}\n`;
  };

  // Moves the CURRENTLY shown message up/down by one line (TextIndex +/-
  // TEXT_MESSAGE_LENGTH) when it has more than 2 lines (see splitMessageLines
  // in text-minikernel-layout.js) - only the first 2 of any message's own
  // lines are ever drawn at once (text12b.asm's own "textkernel2ndrow"
  // block always reads row 2 from TextIndex+TEXT_MESSAGE_LENGTH), so this is
  // how the rest come into view. Clamped directly against TextIndex itself,
  // via _textLinesBase/_textLinesMax (see setTextLinesRangeCode's own
  // comment above, set by whichever "Show text" call most recently pointed
  // at the message currently showing) - a message with 2 or fewer lines has
  // base = max, so both blocks are harmless no-ops for it. No multiply
  // needed either way: every line is exactly TEXT_MESSAGE_LENGTH bytes
  // apart, so moving one line at a time is just a plain add/subtract.
  Blockly.BBasic['text_minikernel_line_scroll_up'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const base = resolveVar(textLinesBaseVarName());
    return `if TextIndex > ${base} then TextIndex = TextIndex - ${TEXT_MESSAGE_LENGTH}\n`;
  };
  Blockly.BBasic['text_minikernel_line_scroll_down'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const max = resolveVar(textLinesMaxVarName());
    return `if TextIndex < ${max} then TextIndex = TextIndex + ${TEXT_MESSAGE_LENGTH}\n`;
  };

  // Drives generateSystemDims()'s TextIndex/TextDataPtr dims below - needs to
  // know this well before any block's own generator runs.
  Blockly.BBasic.isTextMinikernelActive = function() {
    return !!this.textMinikernelUsed;
  };

  // Whether the project uses any block that can actually make a message
  // scroll or that reads/controls in-progress scroll state - see the
  // textScrollUsed pre-scan in bbasic.js for exactly which block types
  // count. Drives both reserveTextScrollDevVars (bbasic.js) and
  // generateTextScrollAdvance's own splice (text-scroll.js) - a project
  // using only plain, static "Show text" blocks needs neither.
  Blockly.BBasic.isTextScrollActive = function() {
    return !!this.textScrollUsed;
  };

  // Whether ANY Text tab entry has "Wrap to line 2" on - purely a Text tab
  // data check (not a workspace-block pre-scan), since the toggle lives on
  // the entry itself, not on any block. Drives text12b.asm's own
  // "textkernel2ndrow" ifconst gate (see generateConfiguration in
  // generators/bbasic.js) and TextRow2Active's own dim just below - both
  // only pay for this feature once a project actually uses it. The
  // "(scrolling)" Show text blocks never wrap (per their own generators
  // below, which always force TextRow2Active to 0), so this only reflects
  // what the PLAIN Show text blocks can ever act on.
  Blockly.BBasic.isTextRow2Used = function() {
    return this.isTextMinikernelActive() && listTextStrings().some((entry) => entry.wrapToLine2);
  };

  // Whether the project uses "Scroll text lines up/down" anywhere - a real
  // workspace-block pre-scan (see textLineScrollUsed in generators/
  // bbasic.js), unlike isTextRow2Used just above, since these blocks (not
  // Text tab data) are what actually read _textLinesBase/_textLinesMax.
  // Gates reserving those two dev vars (bbasic.js's own init()) and every
  // "Show text" code path's own setTextLinesRangeCode call above - a
  // project that never uses these blocks never pays for the range tracking
  // at all, even if some Text tab entry does wrap.
  Blockly.BBasic.isTextLineScrollUsed = function() {
    return !!this.textLineScrollUsed;
  };

  // TextIndex/TextDataPtr sit in var44/var46 (2 bytes: var46+var47) - scratch
  // RAM this app never otherwise touches, and safely free regardless of
  // Superchip or the standard kernel's own playfield buffer (var0-var43),
  // unlike aux1/aux2 (which alias the pfcolors/pfheights row pointers, and
  // would collide with the Enable per-row playfield colors option).
  //
  // TextDataPtr is different: per the Text Minikernel's own docs, it only
  // needs to be dimmed at all when the project's own Score Bar blocks have
  // separately turned pfscore on (score.js sets the PFSCORE_ENABLE_KEY
  // definitions_ entry that Blockly.BBasic.finish() snapshots into
  // pfscoreEnabledForTextMinikernel, since definitions_ itself is already
  // gone by the time generateSystemDims() runs) - text12a.asm already falls
  // back to reusing pfscore1's own storage for TextDataPtr otherwise, so
  // dimming it ourselves in that case would just double-define the symbol.
  //
  // TextRow2Active is the third and last member of this fixed-symbol-name
  // family (text12b.asm needs a literal, unchanging name to hardcode, the
  // same reason TextIndex/TextDataPtr aren't just ordinary auto-lettered
  // dev vars) - var45, the one byte of the documented "var44-47 always
  // free" pool (see reserveDevVarRW's own comment in generators/bbasic.js)
  // neither TextIndex (44) nor TextDataPtr (46-47) ever claims. Only
  // dimmed when isTextRow2Used() is true - the exact same condition that
  // gates text12b.asm's own "textkernel2ndrow" ifconst block in the first
  // place (see generateConfiguration in generators/bbasic.js), so a
  // project that never turns on "Wrap to line 2" never reserves it.
  Blockly.BBasic.generateTextMinikernelDims = function() {
    if (!this.isTextMinikernelActive()) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const showVariableComments = config.showVariableComments ?? true;
    const textIndexComment = showVariableComments ?
      '  ; which message/character is currently shown, and the scroll position tracker (see text-scroll.js)' : '';
    const textDataPtrComment = showVariableComments ? '  ; Text Minikernel\'s own message-table pointer' : '';
    const textRow2ActiveComment = showVariableComments ?
      '  ; whether the currently shown message also draws a wrapped second line' : '';
    const textIndexDim = `\n dim TextIndex = var44${textIndexComment}`;
    const textDataPtrDim = this.pfscoreEnabledForTextMinikernel ?
      `\n dim TextDataPtr = var46${textDataPtrComment}` : '';
    const textRow2ActiveDim = this.isTextRow2Used() ?
      `\n dim TextRow2Active = var45${textRow2ActiveComment}` : '';
    return textIndexDim + textDataPtrDim + textRow2ActiveDim;
  };

  // Spliced into bbasic.bb.hbs's Setup section, alongside the other system
  // variables' initial values (player0realcolor, etc.) - before
  // systemStartEvent, so a "Text: set color" block placed in the player's own
  // System start event still overrides this. Without it TextColor (an alias
  // of statusbarlength - see text12a.asm) starts at whatever the standard
  // kernel's own RAM-clearing leaves it at (0, i.e. black), matching neither
  // the reference demo (which explicitly sets white) nor a readable default.
  Blockly.BBasic.generateTextMinikernelDefaults = function() {
    if (!this.isTextMinikernelActive()) return '';
    return ' TextColor = $0F';
  };

  // Spliced into bbasic.bb.hbs right after the data tables section (see
  // "generatedTextMinikernel" in the template) - the same never-fallen-into
  // spot data tables/subroutines use, since this is a self-contained
  // subroutine only ever reached via "jsr minikernel" from the standard
  // kernel's own code, never by falling through from the line above.
  //
  // text12a.asm/text12b.asm are pulled in with the manual's own documented
  // "inline <file>" statement, exactly as written (no compiler workarounds
  // needed with the real bB 1.9 toolchain - see hooks/bb-compiler.js) - the
  // actual file contents reach the compiler as siblings of the source, via
  // getTextMinikernelSiblingFiles()/hooks/rom.js.
  //
  // On a 2k/4k ROM (a single physical bank), these files simply stay inline
  // wherever they fall - matching the reference demo's own layout exactly
  // (confirmed byte-for-byte and working end to end in the emulator). On a
  // bankswitched ROM, the whole block is wrapped in "bank <kernel bank> ...
  // bank 1" (see KERNEL_BANK_BY_ROMSIZE above) so it shares the kernel's own
  // bank, matching the plain (non-bankswitched) "jsr minikernel" call the
  // standard kernel makes into it.
  Blockly.BBasic.generateTextMinikernel = function() {
    if (!this.isTextMinikernelActive()) return '';

    // Row 0: reserved blank - TextIndex lives in RAM the standard kernel
    // clears to 0 at power-on, and stays 0 until some block explicitly
    // assigns it, so this is what shows (nothing) before that happens,
    // rather than whichever message happened to be defined first. Rows
    // 1..N: every Text tab entry, in that same order (position N's own byte
    // offset - see getStaticMessageLayout() above and "Show text with ID"'s
    // own generator - no longer a flat N*TEXT_MESSAGE_LENGTH stride once any
    // entry wraps). An entry with "Wrap to line 2" on gets one row per line
    // splitMessageLines (text-minikernel-layout.js) split its own text
    // into - explicit line breaks first, falling back to word-wrap only
    // when there isn't one - all stored back to back (see text12b.asm's own
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
    // registerFreeTypedScrollMessage's own comments in text-scroll.js) - one
    // extra, untruncated row for every entry a "(scrolling)" block variant
    // actually needed one for (an entry short enough to not need scrolling
    // reuses its own static row above instead, and has no `glyphs` here at
    // all - see getNamedScrollLayout's own null-glyphs case).
    // bB's own "data" statement caps how many comma-separated values a
    // single line can hold (confirmed directly: a real build of a long
    // scrollable message failed with "Maximum line length exceeded in data
    // statement") - every row's own glyphs are chunked into lines of at
    // most 16 (same chunk size generateDataTables() in generators/bbasic.js
    // already uses for the same reason) before being joined. Purely a
    // source-formatting concern: DASM concatenates every value in a
    // "data...end" block into one contiguous byte run regardless of how
    // many lines it's split across, so this never changes any offset above.
    const glyphRows = (glyphs) => chunk(glyphs, 16).map((row) => '  ' + row.join(', '));

    const maxWidth = resolveTextMaxDisplayWidth();
    const staticEntries = [{text: '', justify: 'left', wrapToLine2: false}, ...listTextStrings()];
    const namedRows = staticEntries.flatMap(({text, justify, wrapToLine2}) => {
      if (!wrapToLine2) return glyphRows(encodeTextMessage(text, justify, maxWidth));
      return encodeTextMessageLines(text, justify, maxWidth).flatMap((glyphs) => glyphRows(glyphs));
    });
    const freeTypedRows = (this.freeTypedMessages || []).flatMap((text) =>
      glyphRows(encodeTextMessage(text, 'left', maxWidth)));
    const namedScrollRows = getNamedScrollLayout()
        .filter((entry) => entry.glyphs)
        .flatMap(({glyphs}) => glyphRows(glyphs));
    const freeTypedScrollRows = (this.freeTypedScrollMessages || [])
        .flatMap(({glyphs}) => glyphRows(glyphs));
    const dataTable = ` data text_strings\n${
      [...namedRows, ...freeTypedRows, ...namedScrollRows, ...freeTypedScrollRows].join('\n')
    }\nend`;

    // Matches the reference demo's own layout exactly: the data table comes
    // first, then both inline files back to back with nothing between them.
    // text12a.asm's own tail jumps to a label defined in text12b.asm, so
    // splitting them with the data table in between doesn't break by
    // address (DASM resolves that jump by label, not by physical position) -
    // but nothing about combining the Text Minikernel with hardware
    // collision has ever been tested against that arrangement, only this
    // one, so there's no reason to keep the two files apart from each other.
    const block = [
      dataTable,
      '',
      ' inline text12a.asm',
      ' inline text12b.asm',
    ].join('\n');

    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const kernelBank = KERNEL_BANK_BY_ROMSIZE[config.romSize];
    if (!kernelBank) return block;

    // 2600basic's own per-bank bookkeeping (the space-left tracking that
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
    // A bank the auto-relocation system (see hooks/rom.js) has actually put
    // real content in is skipped here, NOT given an empty placeholder on top
    // of that - generateRelocatedSections already declares "bank N ... bank
    // 1" for it with real content inside. Confirmed directly as a real bug
    // otherwise: declaring the same bank a second time, non-contiguously (an
    // empty placeholder here, real content later), corrupts DASM's address
    // tracking for it (reported as "Origin Reverse-indexed" - see
    // generateRelocatedSections' own comment on this same failure mode) -
    // which only ever surfaces once relocation actually needs a bank number
    // below the Text Minikernel's own reserved one, so it went unnoticed
    // until a project's bank 1 overflow was small enough to be fixed by
    // relocating into exactly such a bank.
    const usedBanks = Blockly.BBasic.usedRelocationBankNumbers();
    const skippedBankPlaceholders = [];
    for (let bank = 2; bank < kernelBank; bank++) {
      if (!usedBanks.has(bank)) skippedBankPlaceholders.push(` bank ${bank}\n bank 1`);
    }

    return `${skippedBankPlaceholders.join('\n')}\n bank ${kernelBank}\n${block}\n bank 1`;
  };
};
