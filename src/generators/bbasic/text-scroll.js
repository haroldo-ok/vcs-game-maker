'use strict';

// Everything the Text Minikernel's per-character scrolling feature needs,
// kept apart from generators/bbasic/text-minikernel.js's own static
// (non-scrolling) message encoding the same way generators/bbasic/music.js
// is kept apart from the rest of generators/bbasic.js - a self-contained
// concern with its own dev vars, its own data tables, and its own per-frame
// runtime check, that the "Show text" block generators just call into.

import {TEXT_MESSAGE_LENGTH, CHAR_TO_GLYPH, listTextStrings} from '../../blocks/text-strings';

// One shared copy of this runtime state project-wide, reconfigured by
// whichever "Show text" block most recently triggered a message - the Text
// Minikernel can only ever show one message at a time anyway, so there's
// nothing to gain from a per-message copy. Reserved (see
// reserveTextScrollDevVars below) whenever the Text Minikernel is used at
// all, regardless of whether any particular message actually needs to
// scroll - see buildTextScrollSetupLines' own comment for why every "Show
// text" call always writes all of these, even for a message that fits
// without scrolling.
export const textScrollBaseVarName = () => '_textScrollBase';
export const textScrollOffsetVarName = () => '_textScrollOffset';
export const textScrollMaxVarName = () => '_textScrollMax';
export const textScrollDirVarName = () => '_textScrollDir';
export const textScrollTimerVarName = () => '_textScrollTimer';
export const textScrollSpeedVarName = () => '_textScrollSpeed';
export const textScrollPauseVarName = () => '_textScrollPauseVar';

export const reserveTextScrollDevVars = (reserveDevVar, textMinikernelUsed) => {
  if (!textMinikernelUsed) return;
  [
    textScrollBaseVarName(), textScrollOffsetVarName(), textScrollMaxVarName(),
    textScrollDirVarName(), textScrollTimerVarName(), textScrollSpeedVarName(),
    textScrollPauseVarName(),
  ].forEach((name) => reserveDevVar(name));
};

// The maxWidth setting (see resolveTextMaxDisplayWidth) only ever applies
// to STATIC text (text-minikernel.js's own encodeTextMessage/plain "Show
// text" blocks) - the "(scrolling)" block variants ignore it entirely and
// always scroll through the message's own FULL, untruncated length using
// the kernel's full TEXT_MESSAGE_LENGTH-wide read window, one character at
// a time. A message longer than TEXT_MESSAGE_LENGTH doesn't fit in one
// static row at all - it needs its own untruncated, contiguous copy here
// instead of the plain fixed-row one every shorter message still uses
// unchanged.
const isScrollable = (text) => String(text || '').length > TEXT_MESSAGE_LENGTH;

// How many bytes a scrollable message needs reserved: its own (uppercased)
// character count, or TEXT_MESSAGE_LENGTH if that's larger - guarantees the
// kernel's own fixed TEXT_MESSAGE_LENGTH-byte read is always safely
// in-bounds even at scroll offset 0, via trailing blank glyphs (see
// encodeScrollableMessage).
const scrollableReservedLength = (text) =>
  Math.max(TEXT_MESSAGE_LENGTH, String(text || '').toUpperCase().length);

// The highest valid scroll offset for a message - at this offset the
// kernel's fixed-width read lands exactly on the message's own last
// TEXT_MESSAGE_LENGTH characters. 0 for a message routed through the
// scrollable path but not actually longer than TEXT_MESSAGE_LENGTH (not
// reachable via isScrollable's own check, but kept as a safe fallback).
const scrollMaxOffset = (text) =>
  Math.max(0, String(text || '').toUpperCase().length - TEXT_MESSAGE_LENGTH);

// Converts free-typed text into glyph tokens for the scrollable append
// region of the "data text_strings" table - unlike text-minikernel.js's own
// encodeTextMessage, never truncated (to maxWidth OR TEXT_MESSAGE_LENGTH)
// and never justified (justify only means something for a message that
// sits statically in one fixed position), just uppercased and padded out to
// scrollableReservedLength so the kernel's read never runs past the end of
// the table.
const encodeScrollableMessage = (text) => {
  const upper = String(text || '').toUpperCase();
  const width = scrollableReservedLength(text);
  return upper.padEnd(width, ' ').split('').map((char) => CHAR_TO_GLYPH[char] || '_sp');
};

// Every Text tab entry's own byte offset/glyphs/scroll range within the
// scrollable append region of the "data text_strings" table (see
// generateTextMinikernel in text-minikernel.js, which emits each entry's
// own `glyphs` as a single extra row right after every entry's own
// ordinary static row - see registerFreeTypedMessage's own comment in
// text-minikernel.js for why the plain, non-scrolling rows stay completely
// separate from this). An entry short enough to not need scrolling at all
// just reuses its own static row (offset = position*TEXT_MESSAGE_LENGTH,
// maxOffset = 0) rather than getting a second, redundant copy here.
// Position 0 is the reserved blank guard entry (see namedMessagePosition's
// own comment in text-minikernel.js).
export const getNamedScrollLayout = () => {
  const entries = listTextStrings();
  const staticRegionEnd = (entries.length + 1) * TEXT_MESSAGE_LENGTH;
  // glyphs: null here too - the guard entry's own offset (0) already points
  // at its static row, same as any other non-scrollable entry, so it never
  // needs (or gets) a second copy in the append region.
  const layout = [{offset: 0, maxOffset: 0, glyphs: null, text: '', justify: 'left'}];
  let appendOffset = staticRegionEnd;
  entries.forEach(({text, justify}, i) => {
    const position = i + 1;
    if (!isScrollable(text)) {
      layout.push({offset: position * TEXT_MESSAGE_LENGTH, maxOffset: 0, glyphs: null, text, justify});
      return;
    }
    const glyphs = encodeScrollableMessage(text);
    layout.push({offset: appendOffset, maxOffset: scrollMaxOffset(text), glyphs, text, justify});
    appendOffset += glyphs.length;
  });
  return layout;
};

// Free-typed scrolling messages ("Show text (scrolling): <literal>") have
// no Text tab entry to number them by, so - same reasoning as
// text-minikernel.js's own registerFreeTypedMessage for the plain,
// non-scrolling case - they get a lazy, dedup-by-content registry of their
// own, appended right after the ENTIRE named-scroll append region above
// (whose own total size is already fully known up front, from Text tab
// data alone, with no registration-order dependency - see
// namedScrollRegionEnd below). A message that doesn't actually need
// scrolling still gets its own row here (unlike the named case, which can
// fall back to an existing static row - a free-typed message has no such
// row to fall back to), just built via encodeScrollableMessage the same as
// any other entry (harmless: it comes out identical to a left-justified
// static row when the text already fits).
const namedScrollRegionEnd = () => {
  const layout = getNamedScrollLayout();
  // The static region is always exactly layout.length rows wide (guard +
  // one row per Text tab entry); summed on top of that is only the
  // append-region space entries with a real `glyphs` row actually used -
  // computed this way (rather than reading the last layout entry's own
  // offset) so it stays correct regardless of whether the LAST Text tab
  // entry happens to be one of the ones that needed an append row at all.
  const staticRegionEnd = layout.length * TEXT_MESSAGE_LENGTH;
  const appendTotal = layout.reduce((sum, entry) => sum + (entry.glyphs ? entry.glyphs.length : 0), 0);
  return staticRegionEnd + appendTotal;
};

export const registerFreeTypedScrollMessage = (Blockly, text) => {
  Blockly.BBasic.freeTypedScrollMessages = Blockly.BBasic.freeTypedScrollMessages || [];
  const messages = Blockly.BBasic.freeTypedScrollMessages;
  let entry = messages.find((m) => m.text === text);
  if (!entry) {
    const prevTotal = messages.reduce((sum, m) => sum + m.glyphs.length, 0);
    const glyphs = encodeScrollableMessage(text);
    entry = {text, offset: namedScrollRegionEnd() + prevTotal, maxOffset: scrollMaxOffset(text), glyphs};
    messages.push(entry);
  }
  return entry;
};

// Builds the lines every "Show text" block's generator emits to (re)point
// the Text Minikernel at a message and (re)configure the shared scroll
// state for it - called unconditionally, even for a message that fits
// without scrolling (maxOffsetExpr = '0' then), so a static message halts
// any scrolling left running from whatever was shown before it, rather than
// the per-frame check (see generateTextScrollAdvance below) silently
// continuing to animate a message that already changed underneath it.
export const buildTextScrollSetupLines = (resolveVar, offsetExpr, maxOffsetExpr, speedCode, pauseCode) => {
  const base = resolveVar(textScrollBaseVarName());
  const off = resolveVar(textScrollOffsetVarName());
  const max = resolveVar(textScrollMaxVarName());
  const dir = resolveVar(textScrollDirVarName());
  const timer = resolveVar(textScrollTimerVarName());
  const speed = resolveVar(textScrollSpeedVarName());
  const pause = resolveVar(textScrollPauseVarName());
  return [
    `${base} = ${offsetExpr}`,
    `${off} = 0`,
    `${dir} = 0`,
    `${max} = ${maxOffsetExpr}`,
    `${speed} = ${speedCode}`,
    `${pause} = ${pauseCode}`,
    `${timer} = ${speedCode}`,
  ];
};

// Spliced into commongamelogic (see bbasic.bb.hbs) right after the distance
// checks - once per frame, advances (or, having reached an end, pauses)
// whichever message is currently scrolling, one byte (one character) at a
// time. A message with nothing to scroll (max = 0, true for every static
// message and every message no longer than TEXT_MESSAGE_LENGTH - see
// buildTextScrollSetupLines above) exits on the very first line, so this
// costs almost nothing for a project that never uses scrolling text at all,
// and only a few cycles per frame even for one that does.
export const generateTextScrollAdvance = (Blockly) => {
  if (!Blockly.BBasic.isTextMinikernelActive()) return '';
  const resolveVar = (name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const base = resolveVar(textScrollBaseVarName());
  const off = resolveVar(textScrollOffsetVarName());
  const max = resolveVar(textScrollMaxVarName());
  const dir = resolveVar(textScrollDirVarName());
  const timer = resolveVar(textScrollTimerVarName());
  const speed = resolveVar(textScrollSpeedVarName());
  const pause = resolveVar(textScrollPauseVarName());
  // Spliced directly into bbasic.bb.hbs's commongamelogic, bypassing
  // Blockly.BBasic.normalizeIndents() the same way generateBackgroundFadeChecks/
  // generateSoundFadeChecks/generateMusicChecks do (see
  // generateBackgroundFadeChecks' own comment in background.js) - every
  // statement line below needs EXACTLY one leading space and every label
  // line needs NONE, or the compiler misparses the line as a "complex
  // statement" expression instead of an if/goto (confirmed directly: an
  // earlier version of this left the very first "if" line without its
  // leading space and got "Unknown Mnemonic 'lda then'" from a real build).
  return [
    ` if ${max} = 0 then goto _textscroll_done`,
    ` ${timer} = ${timer} - 1`,
    ` if ${timer} <> 0 then goto _textscroll_done`,
    ` if ${dir} = 1 then goto _textscroll_back`,
    ` if ${off} <> ${max} then goto _textscroll_advance`,
    ` ${dir} = 1`,
    ` ${timer} = ${pause}`,
    ` goto _textscroll_done`,
    '_textscroll_advance',
    ` ${off} = ${off} + 1`,
    ` TextIndex = ${base} + ${off}`,
    ` ${timer} = ${speed}`,
    ` goto _textscroll_done`,
    '_textscroll_back',
    ` if ${off} <> 0 then goto _textscroll_retreat`,
    ` ${dir} = 0`,
    ` ${timer} = ${pause}`,
    ` goto _textscroll_done`,
    '_textscroll_retreat',
    ` ${off} = ${off} - 1`,
    ` TextIndex = ${base} + ${off}`,
    ` ${timer} = ${speed}`,
    '_textscroll_done',
  ].join('\n') + '\n';
};

// "Show text with ID" doesn't know which message it's showing until
// runtime, so unlike the other two "Show text" blocks (which know their
// message at compile time, and can just emit its offset/max as literal
// numbers - see text-minikernel.js's own registerFreeTypedMessage/
// namedMessagePosition call sites) it needs an actual runtime lookup: two
// small parallel tables, one byte per Text tab entry (including the
// reserved blank guard row, so a stray id of 0 reads harmlessly zeroed
// entries instead of garbage), giving that entry's own text_strings byte
// offset and max scroll offset. A table can only be read correctly from the
// bank it's declared in (see dataTableSymbolName/trackDataTableBank in
// generators/bbasic.js), so these follow that same per-bank-copy scheme
// data.js's own tables use - trackByIdScrollUsage below records which banks
// actually read them (called from text-minikernel.js's own
// text_minikernel_show_by_id generator), and generateTextOffsetTables emits
// a copy into each one, exactly like generateDataTables(bank) does for a
// Data tab table.
const TEXT_OFFSET_TABLE_ID = '__text_offsets';
const TEXT_SCROLL_MAX_TABLE_ID = '__text_scroll_max';

export const trackTextByIdScrollUsage = (Blockly, bank) => {
  Blockly.BBasic.trackDataTableBank(TEXT_OFFSET_TABLE_ID, bank);
  Blockly.BBasic.trackDataTableBank(TEXT_SCROLL_MAX_TABLE_ID, bank);
};

// Spliced into bbasic.bb.hbs right alongside generatedDataTables - see
// generators/bbasic.js's own finish() (bank 1's own copy) and
// generateRelocatedSections (each relocated bank's own copy). A table
// nothing ever read still gets a bank 1 copy, matching generateDataTables'
// own "unused table" behavior.
export const generateTextOffsetTables = (Blockly, bank) => {
  if (!Blockly.BBasic.isTextMinikernelActive()) return '';
  const usage = Blockly.BBasic.dataTableBankUsage[TEXT_OFFSET_TABLE_ID];
  if (!(usage ? usage.has(bank) : bank === 1)) return '';
  const layout = getNamedScrollLayout();
  const offsets = layout.map((entry) => `${entry.offset}`).join(', ');
  const maxOffsets = layout.map((entry) => `${entry.maxOffset}`).join(', ');
  return ` data text_offsets\n  ${offsets}\nend\n\n data text_scroll_max\n  ${maxOffsets}\nend`;
};
