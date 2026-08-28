'use strict';

// Everything the Text Minikernel's per-character scrolling feature needs,
// kept apart from generators/bbasic/text-minikernel.js's own static
// (non-scrolling) message encoding the same way generators/bbasic/music.js
// is kept apart from the rest of generators/bbasic.js - a self-contained
// concern with its own dev vars, its own data tables, and its own per-frame
// runtime check, that the "Show text" block generators just call into.

import {TEXT_MESSAGE_LENGTH, CHAR_TO_GLYPH, listTextStrings, resolveTextMaxDisplayWidth} from '../../blocks/text-strings';

// One shared copy of this runtime state project-wide, reconfigured by
// whichever "Show text" block most recently triggered a message - the Text
// Minikernel can only ever show one message at a time anyway, so there's
// nothing to gain from a per-message copy. Reserved (see
// reserveTextScrollDevVars below) whenever the Text Minikernel is used at
// all, regardless of whether any particular message actually needs to
// scroll - see buildTextScrollSetupLines' own comment for why every "Show
// text" call always writes all of these, even for a message that fits
// without scrolling.
export const textScrollBaseVarName = () => '_textScrollStart';
// The message's own far-end TextIndex bound (base + its own max scroll
// offset), NOT a relative distance - deliberately absolute so
// generateTextScrollAdvance below can compare it directly against
// TextIndex itself. TextIndex (a real bB system variable the standard
// kernel already reads every frame regardless) IS this scroll feature's own
// current-position tracker now - there used to be a separate "offset" dev
// var for that (added to base every step to recompute TextIndex), but nothing
// ever needed the offset ON ITS OWN, only ever "base + offset" (to set
// TextIndex) or "offset compared against 0/max" (to detect either end) -
// both of those read just as correctly straight off TextIndex once base and
// this far-end bound are both stored as absolute values instead: advance/
// retreat become a plain "TextIndex = TextIndex +/- 1" (actually ONE
// operation cheaper per step than the old "offset +/- 1, then TextIndex =
// base + offset" pair), and the two turnaround checks become "TextIndex <>
// this var" / "TextIndex <> base" - the same single comparison as before,
// just against a variable instead of a literal 0. Net: one whole dev var
// gone, no per-frame cost added (if anything, slightly less).
export const textScrollFarEndVarName = () => '_textScrollEnd';
export const textScrollTimerVarName = () => '_textScrollTimer';
export const textScrollSpeedVarName = () => '_textScrollSpeed';
// The "pause at limits" DURATION, in frames - how long to hold at each end
// of the scroll before reversing. An arbitrary user-configurable frame
// count (the "Show text (scrolling)" block's own "pause" field), not a
// flag - kept as its own full-byte var, distinct from
// textScrollStateVarName below despite the similar name (that one's a
// flag/state byte, this one's a plain duration).
export const textScrollPauseDurationVarName = () => '_textScrollPauseDuration';
// Set/cleared by the "Text scroll: Pause"/"Unpause" actions (see
// text_minikernel_scroll_control's own generator in text-minikernel.js) -
// checked first thing in generateTextScrollAdvance below, so a paused
// message holds at exactly whatever offset it was showing, with none of
// off/dir/timer disturbed, ready to pick back up exactly where it left off
// once unpaused.
// Tri-state, not boolean, in its own low 2 bits (mask $03): 0 = playing, 1 =
// genuinely paused (via "Text scroll: Pause"/"Stop"), 2 = cleared (via
// "Clear text"). generateTextScrollAdvance's own "if state then goto done"
// check already treats any nonzero value as "don't advance" regardless of
// bit 2 (see below) - exactly the behavior a cleared message needs too -
// only buildTextScrollSetupLines' setup guard needs to tell 1 and 2 apart,
// via "(state & $03) = 2" rather than a bare "state = 2" (see its own
// comment on why a bare comparison would misfire once bit 2 is in play).
//
// Bit 2 ($04) doubles up as the scroll direction flag that otherwise would
// have needed its own separate dev var (see TEXT_SCROLL_DIR_BIT below) - a
// real, previously hit constraint (confirmed directly: a project already
// near the 11/12-letter variable budget hit "Too many variables" the moment
// a 10th text-scroll var was added), so every bit of headroom in an
// already-reserved byte is worth reusing before reaching for an 11th/12th
// var. Safe to share because every site that needs the LOW bits to hold an
// exact 0/1/2 value either already masks with "& $03" first (see above), or
// is one of the two places (buildTextScrollSetupLines' own reset block, and
// the "Clear text"/"stop"/"restart" actions in text-minikernel.js) that are
// ALSO resetting direction back to 0 at the very same moment, so a bare
// "state = 0"/"state = 1" there is correct, not just lucky. The two
// actions that must NOT disturb direction - "Text scroll: Pause"/
// "Unpause"/"Start" - use "(state & $04) | n"/"state & $04" instead of a
// bare overwrite specifically because of this (see
// text_minikernel_scroll_control's own comment). Named "State", not
// "Paused" (its old name), now that it holds more than just a pause flag.
export const textScrollStateVarName = () => '_textScrollState';

// Bit index (for the "{n}" single-bit read/write syntax) AND the matching
// mask value (for "& "/"| " arithmetic that has to touch this bit while
// leaving textScrollStateVarName's own tri-state bits alone) that direction
// shares with state - see that var's own comment above for why the two are
// packed into one byte instead of getting a dev var each.
export const TEXT_SCROLL_DIR_BIT = 2;
export const TEXT_SCROLL_DIR_MASK = '$04';
// Mask isolating state's own tri-state value (bits 0-1) from the direction
// bit packed in above it - see textScrollStateVarName's own comment.
export const TEXT_SCROLL_STATE_MASK = '$03';

export const reserveTextScrollDevVars = (reserveDevVar, textMinikernelUsed) => {
  if (!textMinikernelUsed) return;
  [
    [textScrollBaseVarName(), 'scrolling text: TextIndex at the message\'s own start'],
    [textScrollFarEndVarName(), 'scrolling text: TextIndex at the message\'s own end'],
    [textScrollTimerVarName(), 'scrolling text: frames left before the next step'],
    [textScrollSpeedVarName(), 'scrolling text: frames per step'],
    [textScrollPauseDurationVarName(), 'scrolling text: frames to hold at each end'],
    [textScrollStateVarName(), 'scrolling text: playing/paused/cleared + direction bit'],
  ].forEach(([name, description]) => reserveDevVar(name, undefined, description));
};

// Whether a message needs the scrolling append-region path at all, rather
// than the plain static row every shorter message uses. Compared against
// resolveTextMaxDisplayWidth() (the Text tab's own "Max characters to
// display at once" setting, 1..TEXT_MESSAGE_LENGTH), NOT the raw
// TEXT_MESSAGE_LENGTH ceiling - matching the documented, user-facing
// contract every "Show text" block's own tooltip states ("Automatically
// scrolls...if the message is longer than the Text tab's own max display
// width" - see blocks/text-minikernel.js's own top-of-file comment). A
// message longer than the configured display width but still <=
// TEXT_MESSAGE_LENGTH chars used to fall through to the static path
// instead (comparing against TEXT_MESSAGE_LENGTH here), which silently
// truncated it to the display width with no way to ever see the rest - a
// real reported regression ("the scroll text blocks aren't scrolling the
// text"), since a static row's own encodeTextMessage always clips to
// maxWidth regardless. Once scrolling starts, it still uses the kernel's
// full TEXT_MESSAGE_LENGTH-wide read window (see scrollMaxOffset below) -
// only the THRESHOLD for whether to scroll at all uses the narrower
// configured width, not the scroll motion itself.
const isScrollable = (text) => String(text || '').length > resolveTextMaxDisplayWidth();

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

// Free-typed scrolling messages ("Scroll text: <literal>") have
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
//
// The actual RESET (offset/direction/timer/TextIndex all snapping back to
// the start) only happens when offsetExpr differs from the base the scroll
// state was last configured for (textScrollBaseVarName - reused directly as
// its own "last configured for" marker, rather than a second, always-
// identical copy: base is ONLY ever written here, in this same reset block,
// so comparing against its current value already means exactly "did the
// offset change since the last reset" - no separate var needed) - guarded by
// a real "if base = offsetExpr then goto <skip>" rather than
// unconditional, because a "Show text (scrolling)" block placed in a
// per-frame event (title_update, say) calls this every single frame for
// the SAME message: unconditionally resetting offset/timer/TextIndex back
// to the start every time that happens meant the per-frame advance in
// generateTextScrollAdvance (which runs earlier in commongamelogic, so its
// own progress got immediately overwritten right after) could never
// accumulate past a single frame's worth of movement - a real reported bug
// ("the scroll text blocks aren't scrolling the text"), confirmed directly
// against a real project's own generated code. base/max/speed/pause still
// update unconditionally either way - they don't affect in-progress scroll
// state, so keeping them in sync with every call (even a same-message one,
// in case speed/pause were changed) is harmless.
//
// uniqueId needs to be different per call SITE (not per message) - multiple
// "Show text" block generators all route through this one function (see
// text-minikernel.js's own emitScrollSetup), and DASM requires every label
// in the whole program to be unique, so reusing one fixed skip-label name
// across more than one call site would collide.
export const buildTextScrollSetupLines = (resolveVar, offsetExpr, maxOffsetExpr, speedCode, pauseCode, uniqueId) => {
  const base = resolveVar(textScrollBaseVarName());
  const farEnd = resolveVar(textScrollFarEndVarName());
  const timer = resolveVar(textScrollTimerVarName());
  const speed = resolveVar(textScrollSpeedVarName());
  const pauseDuration = resolveVar(textScrollPauseDurationVarName());
  const state = resolveVar(textScrollStateVarName());
  const skipLabel = `_textscroll_setup_skip_${uniqueId}`;
  const resetLabel = `_textscroll_setup_reset_${uniqueId}`;
  return [
    // "Clear text" leaves state's own low bits at 2 (see
    // textScrollStateVarName's own comment) - that forces the reset below
    // even though base still matches (the message never actually changed,
    // only got cleared). Masked against TEXT_SCROLL_STATE_MASK rather than
    // a bare "state = 2", since state's own bit 2 doubles as the
    // direction flag now and could be set independently of the tri-state
    // value this check actually cares about. Checked before, not instead
    // of, the ordinary base guard, so the common per-frame "same message,
    // never cleared" case still skips straight past the reset as before.
    `if (${state} & ${TEXT_SCROLL_STATE_MASK}) = 2 then goto ${resetLabel}`,
    `if ${base} = ${offsetExpr} then goto ${skipLabel}`,
    `@${resetLabel}`,
    `TextIndex = ${offsetExpr}`,
    `${base} = ${offsetExpr}`,
    // A genuinely new message always starts unpaused AND scrolling forward,
    // even if the PREVIOUS message was left paused/reversed (see
    // text_minikernel_scroll_control's own "Pause" action) - neither is a
    // property that should silently carry over onto whatever gets shown
    // next. A bare overwrite (rather than the bit-preserving form the
    // "Pause"/"Unpause" actions themselves need - see that generator's own
    // comment) is correct here specifically BECAUSE this is the one place
    // direction is meant to reset too - see TEXT_SCROLL_DIR_BIT's own
    // comment.
    `${state} = 0`,
    // Starts the message at its own near end (TextIndex = base), which is
    // itself the SAME "limit" the per-frame advance (generateTextScrollAdvance
    // below) already pauses at for "pause" frames every time it's reached
    // mid-scroll (TextIndex = base or TextIndex = farEnd, both wait "pause"
    // before reversing) - a brand new message waits that same "pause at
    // limits" duration before its first scroll step too, instead of the
    // shorter per-character "speed" duration, which used to make it start
    // scrolling away almost immediately.
    `${timer} = ${pauseCode}`,
    `@${skipLabel}`,
    // Absolute, not relative (see textScrollFarEndVarName's own comment) -
    // "base" here (not offsetExpr again) deliberately reuses whatever
    // TextIndex/base were JUST set to above (on the reset path) or already
    // held (on the skip path), rather than re-evaluating offsetExpr a
    // second time - harmless if offsetExpr is a plain literal/variable, but
    // offsetExpr can also be a table lookup (e.g. "text_offsets[id]" for
    // "Show text with ID"), which a second, redundant read would only cost
    // cycles on for no benefit.
    `${farEnd} = ${base} + ${maxOffsetExpr}`,
    `${speed} = ${speedCode}`,
    `${pauseDuration} = ${pauseCode}`,
  ];
};

// Spliced into commongamelogic (see bbasic.bb.hbs) right after the distance
// checks - once per frame, advances (or, having reached an end, pauses)
// whichever message is currently scrolling, one byte (one character) at a
// time. A message with nothing to scroll (farEnd = base, true for every
// static message and every message no longer than TEXT_MESSAGE_LENGTH - see
// buildTextScrollSetupLines above) exits on the very first line, so this
// costs almost nothing for a project that never uses scrolling text at all,
// and only a few cycles per frame even for one that does.
export const generateTextScrollAdvance = (Blockly) => {
  if (!Blockly.BBasic.isTextMinikernelActive()) return '';
  const resolveVar = (name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const base = resolveVar(textScrollBaseVarName());
  const farEnd = resolveVar(textScrollFarEndVarName());
  const timer = resolveVar(textScrollTimerVarName());
  const speed = resolveVar(textScrollSpeedVarName());
  const pauseDuration = resolveVar(textScrollPauseDurationVarName());
  const state = resolveVar(textScrollStateVarName());
  // Spliced directly into bbasic.bb.hbs's commongamelogic, bypassing
  // Blockly.BBasic.normalizeIndents() the same way generateBackgroundFadeChecks/
  // generateEnvelopeChecks/generateMusicChecks do (see
  // generateBackgroundFadeChecks' own comment in background.js) - every
  // statement line below needs EXACTLY one leading space and every label
  // line needs NONE, or the compiler misparses the line as a "complex
  // statement" expression instead of an if/goto (confirmed directly: an
  // earlier version of this left the very first "if" line without its
  // leading space and got "Unknown Mnemonic 'lda then'" from a real build).
  // Hand-written 6502 instead of the bB if/goto version this used to be -
  // same commongamelogic-splice context (not a subroutine) as
  // generateBackgroundFadeChecks/generateEnvelopeChecks, so plain column-0
  // labels/indented mnemonics, no "@" trick needed. Direction lives directly
  // in state's bit 2 ($04), so it's read/set/cleared with a plain AND/ORA/AND
  // instead of the "{n}" bit-accessor syntax bB itself needs; the pause mask
  // check reuses the same TEXT_SCROLL_STATE_MASK bits. Both timer decrements
  // are a single DEC on the zero-page dim var instead of bB's load/subtract/
  // store, and TextIndex's own advance/retreat are a single INC/DEC the same
  // way. Every branch target here sits well within +-127 bytes of its own
  // branch (this whole block is under 40 bytes), so plain beq/bne reach every
  // conditional target directly - only the three "always fall through to
  // done after writing pauseDuration/speed" cases need an actual JMP.
  return [
    ' asm',
    '       lda ' + farEnd,
    '       cmp ' + base,
    '       beq _textscrolladvanceasm_done',
    '       lda ' + state,
    '       and #' + TEXT_SCROLL_STATE_MASK,
    '       bne _textscrolladvanceasm_done',
    '       dec ' + timer,
    '       bne _textscrolladvanceasm_done',
    '       lda ' + state,
    '       and #$04',
    '       bne _textscrolladvanceasm_back',
    '       lda TextIndex',
    '       cmp ' + farEnd,
    '       bne _textscrolladvanceasm_advance',
    '       lda ' + state,
    '       ora #$04',
    '       sta ' + state,
    '       lda ' + pauseDuration,
    '       sta ' + timer,
    '       jmp _textscrolladvanceasm_done',
    '_textscrolladvanceasm_advance',
    '       inc TextIndex',
    '       lda ' + speed,
    '       sta ' + timer,
    '       jmp _textscrolladvanceasm_done',
    '_textscrolladvanceasm_back',
    '       lda TextIndex',
    '       cmp ' + base,
    '       bne _textscrolladvanceasm_retreat',
    '       lda ' + state,
    '       and #$FB',
    '       sta ' + state,
    '       lda ' + pauseDuration,
    '       sta ' + timer,
    '       jmp _textscrolladvanceasm_done',
    '_textscrolladvanceasm_retreat',
    '       dec TextIndex',
    '       lda ' + speed,
    '       sta ' + timer,
    '_textscrolladvanceasm_done',
    'end',
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
