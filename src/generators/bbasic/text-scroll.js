'use strict';

// Everything the Text Minikernel's per-character scrolling feature needs,
// kept apart from generators/bbasic/text-minikernel.js's  static
// (non-scrolling) message encoding the same way generators/bbasic/music.js
// is kept apart from the rest of generators/bbasic.js - a self-contained
// concern with its  dev vars, its  data tables, and its  per-frame
// runtime check, that the "Show text" block generators just call into.

import {TEXT_MESSAGE_LENGTH, CHAR_TO_GLYPH, listTextStrings, resolveTextMaxDisplayWidth} from '../../blocks/text-strings';
import {bankSuffixedTableName} from '../../blocks/data';
import {getStaticMessageLayout, staticMessageRegionEnd} from './text-minikernel-layout';

// One shared copy of this runtime state project-wide, reconfigured by
// whichever "Show text" block most recently triggered a message - the Text
// Minikernel can only ever show one message at a time anyway, so there's
// nothing to gain from a per-message copy. Reserved (see
// reserveTextScrollDevVars below) whenever the Text Minikernel is used at
// all, regardless of whether any particular message actually needs to
// scroll - see buildTextScrollSetupLines'  comment for why every "Show
// text" call always writes all of these, even for a message that fits
// without scrolling.
export const textScrollBaseVarName = () => 'textScrollStart';
// The message's  far-end TextIndex bound (base + its  max scroll
// offset), NOT a relative distance - deliberately absolute so
// generateTextScrollAdvance below can compare it directly against
// TextIndex itself. TextIndex (a real bB system variable the standard
// kernel already reads every frame regardless) IS this scroll feature's
// current-position tracker now - there used to be a separate "offset" dev
// var for that (added to base every step to recompute TextIndex), but nothing
// ever needed the offset by itself, only ever "base + offset" (to set
// TextIndex) or "offset compared against 0/max" (to detect either end) -
// both of those read just as correctly straight off TextIndex once base and
// this far-end bound are both stored as absolute values instead: advance/
// retreat become a plain "TextIndex = TextIndex +/- 1" (actually ONE
// operation cheaper per step than the old "offset +/- 1, then TextIndex =
// base + offset" pair), and the two turnaround checks become "TextIndex <>
// this var" / "TextIndex <> base" - the same single comparison as before,
// just against a variable instead of a literal 0. Net: one whole dev var
// gone, no per-frame cost added (if anything, slightly less).
export const textScrollFarEndVarName = () => 'textScrollEnd';
export const textScrollTimerVarName = () => 'textScrollTimer';
export const textScrollSpeedVarName = () => 'textScrollSpeed';
// The "pause at limits" DURATION, in frames - how long to hold at each end
// of the scroll before reversing. An arbitrary user-configurable frame
// count (the "Show text (scrolling)" block's "pause" field), not a
// flag - kept as its  full-byte var, distinct from
// textScrollStateVarName below despite the similar name (that one's a
// flag/state byte, this one's a plain duration).
export const textScrollPauseDurationVarName = () => 'textScrollPauseDuration';
// Set/cleared by the "Text scroll: Pause"/"Unpause" actions (see
// text_minikernel_scroll_control's  generator in text-minikernel.js) -
// checked first thing in generateTextScrollAdvance below, so a paused
// message holds at exactly whatever offset it was showing, with none of
// off/dir/timer disturbed, ready to pick back up exactly where it left off
// once unpaused.
// Tri-state, not boolean, in its  low 2 bits (mask $03): 0 = playing, 1 =
// genuinely paused (via "Text scroll: Pause"/"Stop"), 2 = cleared (via
// "Clear text"). generateTextScrollAdvance's "if state then goto done"
// check already treats any nonzero value as "don't advance" regardless of
// bit 2 (see below) - exactly the behavior a cleared message needs too -
// only buildTextScrollSetupLines' setup guard needs to tell 1 and 2 apart,
// via "(state & $03) = 2" rather than a bare "state = 2" (see its
// comment on why a bare comparison would misfire once bit 2 is in play).
//
// Bit 2 ($04) doubles up as the scroll direction flag that otherwise would
// have needed its  separate dev var (see TEXT_SCROLL_DIR_BIT below) - a
// real, previously hit constraint (confirmed directly: a project already
// near the 11/12-letter variable budget hit "Too many variables" the moment
// a 10th text-scroll var was added), so every bit of headroom in an
// already-reserved byte is worth reusing before reaching for an 11th/12th
// var. Safe to share because every site that needs the LOW bits to hold an
// exact 0/1/2 value either already masks with "& $03" first (see above), or
// is one of the two places (buildTextScrollSetupLines'  reset block, and
// the "Clear text"/"stop"/"restart" actions in text-minikernel.js) that are
// ALSO resetting direction back to 0 at the very same moment, so a bare
// "state = 0"/"state = 1" there is correct, not just lucky. The two
// actions that must NOT disturb direction - "Text scroll: Pause"/
// "Unpause"/"Start" - use "(state & $04) | n"/"state & $04" instead of a
// bare overwrite specifically because of this (see
// text_minikernel_scroll_control's  comment). Named "State", not
// "Paused" (its old name), now that it holds more than just a pause flag.
export const textScrollStateVarName = () => 'textScrollState';

// Bit index (for the "{n}" single-bit read/write syntax) AND the matching
// mask value (for "& "/"| " arithmetic that has to touch this bit while
// leaving textScrollStateVarName's  tri-state bits alone) that direction
// shares with state - see that var's  comment above for why the two are
// packed into one byte instead of getting a dev var each.
export const TEXT_SCROLL_DIR_BIT = 2;
export const TEXT_SCROLL_DIR_MASK = '$04';
// Mask isolating state's  tri-state value (bits 0-1) from the direction
// bit packed in above it - see textScrollStateVarName's  comment.
export const TEXT_SCROLL_STATE_MASK = '$03';

export const DEFAULT_TEXT_SCROLL_SPEED = 20;
export const DEFAULT_TEXT_SCROLL_PAUSE = 30;

const constantOf = (block, input, fallback) => {
  const target = block.getInputTargetBlock(input);
  if (!target) return fallback;
  const value = target.type === 'math_number' ? Number(target.getFieldValue('NUM')) : NaN;
  return Number.isInteger(value) && value >= 0 && value <= 255 ? value : null;
};

/**
 * The scroll speed and pause every message of the project is shown with, when they are all the same
 * fixed number: those two then need no variable (the number is compiled in instead). A value is null
 * when blocks disagree or one of them uses a calculated value.
 * @param {!Blockly.Workspace} workspace
 * @return {{speed: ?number, pause: ?number}}
 */
export const resolveTextScrollConstants = (workspace) => {
  const speeds = new Set();
  const pauses = new Set();
  workspace.getAllBlocks(false).filter((block) => block.isEnabled()).forEach((block) => {
    if (block.getInput('SCROLL_SPEED')) {
      speeds.add(constantOf(block, 'SCROLL_SPEED', DEFAULT_TEXT_SCROLL_SPEED));
      pauses.add(constantOf(block, 'SCROLL_PAUSE', DEFAULT_TEXT_SCROLL_PAUSE));
    } else if (block.type === 'text_minikernel_show' && isScrollable(block.getFieldValue('TEXT'))) {
      // Free-typed text longer than the display width scrolls with the defaults.
      speeds.add(DEFAULT_TEXT_SCROLL_SPEED);
      pauses.add(DEFAULT_TEXT_SCROLL_PAUSE);
    }
  });
  const only = (values, fallback) => (values.size === 0 ? fallback : (values.size === 1 ? [...values][0] : null));
  return {speed: only(speeds, DEFAULT_TEXT_SCROLL_SPEED), pause: only(pauses, DEFAULT_TEXT_SCROLL_PAUSE)};
};

export const reserveTextScrollDevVars = (reserveDevVar, textMinikernelUsed, constants = {}) => {
  if (!textMinikernelUsed) return;
  [
    [textScrollBaseVarName(), 'scrolling text: TextIndex at the message\'s start'],
    [textScrollFarEndVarName(), 'scrolling text: TextIndex at the message\'s end'],
    [textScrollTimerVarName(), 'scrolling text: frames left before the next step'],
    ...(constants.speed === null || constants.speed === undefined ?
      [[textScrollSpeedVarName(), 'scrolling text: frames per step']] : []),
    ...(constants.pause === null || constants.pause === undefined ?
      [[textScrollPauseDurationVarName(), 'scrolling text: frames to hold at each end']] : []),
    [textScrollStateVarName(), 'scrolling text: playing/paused/cleared + direction bit'],
  ].forEach(([name, description]) => reserveDevVar(name, undefined, description));
};

// The numbers found by resolveTextScrollConstants for the project being built (set at the start of each
// build); a null one is read from its variable.
let fixedConstants = {speed: null, pause: null};
export const setTextScrollConstants = (constants) => {
  fixedConstants = constants;
};
const operand = (fixed, varName, resolveVar) =>
  (fixed === null || fixed === undefined ? {value: resolveVar(varName), fixed: false} : {value: String(fixed), fixed: true});
// How the speed and pause are read: the compiled-in number when the project has just one, else the variable.
export const textScrollSpeedOperand = (resolveVar) => operand(fixedConstants.speed, textScrollSpeedVarName(), resolveVar);
export const textScrollPauseOperand = (resolveVar) =>
  operand(fixedConstants.pause, textScrollPauseDurationVarName(), resolveVar);

// Whether a message needs the scrolling append-region path at all, rather
// than the plain static row every shorter message uses. Compared against
// resolveTextMaxDisplayWidth() (the Text tab's "Max characters to
// display at once" setting, 1..TEXT_MESSAGE_LENGTH), NOT the raw
// TEXT_MESSAGE_LENGTH ceiling - matching the documented, user-facing
// contract every "Show text" block's  tooltip states ("Automatically
// scrolls...if the message is longer than the Text tab's  max display
// width" - see blocks/text-minikernel.js's  top-of-file comment). A
// message longer than the configured display width but still <=
// TEXT_MESSAGE_LENGTH chars used to fall through to the static path
// instead (comparing against TEXT_MESSAGE_LENGTH here), which silently
// truncated it to the display width with no way to ever see the rest - a
// real reported regression ("the scroll text blocks aren't scrolling the
// text"), since a static row's  encodeTextMessage always clips to
// maxWidth regardless. Once scrolling starts, it still uses the kernel's
// full TEXT_MESSAGE_LENGTH-wide read window (see scrollMaxOffset below) -
// only the THRESHOLD for whether to scroll at all uses the narrower
// configured width, not the scroll motion itself.
const isScrollable = (text) => String(text || '').length > resolveTextMaxDisplayWidth();

// How many bytes a scrollable message needs reserved: its (uppercased)
// character count, or TEXT_MESSAGE_LENGTH if that's larger - guarantees the
// kernel's  fixed TEXT_MESSAGE_LENGTH-byte read is always safely
// in-bounds even at scroll offset 0, via trailing blank glyphs (see
// encodeScrollableMessage).
const scrollableReservedLength = (text) =>
  Math.max(TEXT_MESSAGE_LENGTH, String(text || '').toUpperCase().length);

// The highest valid scroll offset for a message - at this offset the
// kernel's fixed-width read lands exactly on the message's  last
// TEXT_MESSAGE_LENGTH characters. 0 for a message routed through the
// scrollable path but not actually longer than TEXT_MESSAGE_LENGTH (not
// reachable via isScrollable's  check, but kept as a safe fallback).
const scrollMaxOffset = (text) =>
  Math.max(0, String(text || '').toUpperCase().length - TEXT_MESSAGE_LENGTH);

// Converts free-typed text into glyph tokens for the scrollable append
// region of the "data text_strings" table - unlike text-minikernel.js's
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

// Every Text tab entry's  byte offset/glyphs/scroll range within the
// scrollable append region of the "data text_strings" table (see
// generateTextMinikernel in text-minikernel.js, which emits each entry's
// `glyphs` as a single extra row right after every entry's
// ordinary static row(s) - see registerFreeTypedMessage's  comment in
// text-minikernel.js for why the plain, non-scrolling rows stay completely
// separate from this). An entry short enough to not need scrolling at all
// just reuses its  static row (offset = its  entry in
// getStaticMessageLayout(), maxOffset = 0) rather than getting a second,
// redundant copy here - scrolling never wraps (see this file's
// isScrollable comment), so it's always that entry's row 1 offset, even for
// an entry that separately has "Wrap to line 2" on for the PLAIN block.
// Position 0 is the reserved blank guard entry (see namedMessagePosition's
// comment in text-minikernel.js).
export const getNamedScrollLayout = () => {
  const entries = listTextStrings();
  const staticLayout = getStaticMessageLayout();
  // glyphs: null here too - the guard entry's  offset (0) already points
  // at its static row, same as any other non-scrollable entry, so it never
  // needs (or gets) a second copy in the append region.
  const layout = [{offset: 0, maxOffset: 0, glyphs: null, text: '', justify: 'left'}];
  let appendOffset = staticMessageRegionEnd();
  entries.forEach(({text, justify}, i) => {
    const position = i + 1;
    if (!isScrollable(text)) {
      layout.push({offset: staticLayout[position].offset, maxOffset: 0, glyphs: null, text, justify});
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
// text-minikernel.js's  registerFreeTypedMessage for the plain,
// non-scrolling case - they get a lazy, dedup-by-content registry of their
// , appended right after the ENTIRE named-scroll append region above
// (whose total size is already fully known up front, from Text tab
// data alone, with no registration-order dependency - see
// namedScrollRegionEnd below). A message that doesn't actually need
// scrolling still gets its  row here (unlike the named case, which can
// fall back to an existing static row - a free-typed message has no such
// row to fall back to), just built via encodeScrollableMessage the same as
// any other entry (harmless: it comes out identical to a left-justified
// static row when the text already fits).
const namedScrollRegionEnd = () => {
  const layout = getNamedScrollLayout();
  // staticMessageRegionEnd() (not layout.length*TEXT_MESSAGE_LENGTH - the
  // static region isn't a uniform stride any more once an entry wraps, see
  // getStaticMessageLayout's  comment) plus only the append-region space
  // entries with a real `glyphs` row actually used - computed this way
  // (rather than reading the last layout entry's  offset) so it stays
  // correct regardless of whether the LAST Text tab entry happens to be one
  // of the ones that needed an append row at all.
  const appendTotal = layout.reduce((sum, entry) => sum + (entry.glyphs ? entry.glyphs.length : 0), 0);
  return staticMessageRegionEnd() + appendTotal;
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
// state for it - called unconditionally, including for a message that fits
// without scrolling, so a static message halts any scrolling left running
// from whatever was shown before it, rather than the per-frame check (see
// generateTextScrollAdvance below) silently continuing to animate a message
// that already changed underneath it. See the maxOffsetExpr === 0 fast path
// below for the (structurally can-never-scroll) case this most commonly
// covers - everything from here down is the full version, used whenever
// scrolling is actually possible for this call site.
//
// The actual RESET (offset/direction/timer/TextIndex all snapping back to
// the start) only happens when offsetExpr differs from the base the scroll
// state was last configured for (textScrollBaseVarName - reused directly as
// its "last configured for" marker, rather than a second, always-
// identical copy: base is ONLY ever written here, in this same reset block,
// so comparing against its current value already means exactly "did the
// offset change since the last reset" - no separate var needed) - guarded by
// a real "if base = offsetExpr then goto <skip>" rather than
// unconditional, because a "Show text (scrolling)" block placed in a
// per-frame event (title_update, say) calls this every single frame for
// the SAME message: unconditionally resetting offset/timer/TextIndex back
// to the start every time that happens meant the per-frame advance in
// generateTextScrollAdvance (which runs earlier in commongamelogic, so its
// progress got immediately overwritten right after) could never
// accumulate past a single frame's worth of movement - a real reported bug
// ("the scroll text blocks aren't scrolling the text"), confirmed directly
// against a real project's  generated code. base/max/speed/pause still
// update unconditionally either way - they don't affect in-progress scroll
// state, so keeping them in sync with every call (even a same-message one,
// in case speed/pause were changed) is harmless.
//
// uniqueId needs to be different per call SITE (not per message) - multiple
// "Show text" block generators all route through this one function (see
// text-minikernel.js's  emitScrollSetup), and DASM requires every label
// in the whole program to be unique, so reusing one fixed skip-label name
// across more than one call site would collide.
export const buildTextScrollSetupLines = (
    resolveVar, offsetExpr, maxOffsetExpr, speedCode, pauseCode, uniqueId, scrollActive, startAtEnd) => {
  // resolveVar (Blockly.BBasic.nameDB_.getName under the hood - see
  // emitScrollSetup's  comment in text-minikernel.js) is what actually
  // ASSIGNS a real letter/RAM slot to a dev var name the FIRST time it's
  // called, independent of reserveTextScrollDevVars'  separate pre-scan
  // reservation - so these six calls have to stay lazy (only made when a
  // return path below actually needs that name), not hoisted up here
  // unconditionally, or the !scrollActive fast path below would silently
  // re-allocate the exact letters it exists to avoid spending.
  const base = () => resolveVar(textScrollBaseVarName());
  const farEnd = () => resolveVar(textScrollFarEndVarName());
  const timer = () => resolveVar(textScrollTimerVarName());
  const speed = () => resolveVar(textScrollSpeedVarName());
  const pauseDuration = () => resolveVar(textScrollPauseDurationVarName());
  const state = () => resolveVar(textScrollStateVarName());
  // maxOffsetExpr === 0 (a real JS number, not a runtime expression string
  // like the by-id-scroll block's "text_scroll_max[id]") means THIS
  // call site can never scroll, full stop - known at compile time,
  // regardless of what offsetExpr evaluates to. farEnd = base always holds
  // for it, which is exactly generateTextScrollAdvance's  short-circuit
  // condition (its very first check, before touching timer/state at all),
  // so none of the reset-guard machinery below - branches, labels, the
  // timer/speed/pauseDuration writes - can ever affect anything observable
  // for a call site like this: scroll_at's Left/Right checks only compare
  // TextIndex against base/farEnd (both always pinned to offsetExpr right
  // here), and scroll_control's actions only touch state/timer, neither of
  // which generateTextScrollAdvance ever reads once it's already bailed out
  // on farEnd = base. A plain, unconditional 4-line write covers every
  // externally-visible effect the full version has for this case, INCLUDING
  // the "was previously Clear text'd" edge case the reset-guard's
  // state-2 check exists for above (moot here - this always re-writes
  // TextIndex regardless, no guard to skip past). Added specifically to fix
  // a real reported ROM-capacity regression: every "Show text" call site
  // unconditionally cost this function's full ~11 lines even when, as here,
  // the referenced message could structurally never scroll - a project with
  // many short, non-scrolling messages (the common case) was paying for
  // scroll infrastructure it could never use at every single call site.
  if (maxOffsetExpr === 0) {
    // scrollActive false means NO block anywhere in the project can ever
    // make a message scroll or reads/controls scroll state (see
    // Blockly.BBasic.isTextScrollActive's  comment) - in that case
    // generateTextScrollAdvance is never even emitted, so nothing ever
    // reads base/farEnd/state either, and reserveTextScrollDevVars never
    // reserves them - writing to them here would reference unreserved
    // (undim'd) variables. TextIndex alone (a real bB system variable,
    // always available) is the only thing that still needs setting.
    if (!scrollActive) return [`TextIndex = ${offsetExpr}`];
    return [
      `TextIndex = ${offsetExpr}`,
      `${base()} = ${offsetExpr}`,
      `${farEnd()} = ${offsetExpr}`,
      `${state()} = 0`,
    ];
  }
  const skipLabel = `_textscroll_setup_skip_${uniqueId}`;
  const resetLabel = `_textscroll_setup_reset_${uniqueId}`;
  return [
    // "Clear text" leaves state's  low bits at 2 (see
    // textScrollStateVarName's  comment) - that forces the reset below
    // even though base still matches (the message never actually changed,
    // only got cleared). Masked against TEXT_SCROLL_STATE_MASK rather than
    // a bare "state = 2", since state's  bit 2 doubles as the
    // direction flag now and could be set independently of the tri-state
    // value this check actually cares about. Checked before, not instead
    // of, the ordinary base guard, so the common per-frame "same message,
    // never cleared" case still skips straight past the reset as before.
    `if (${state()} & ${TEXT_SCROLL_STATE_MASK}) = 2 then goto ${resetLabel}`,
    `if ${base()} = ${offsetExpr} then goto ${skipLabel}`,
    `@${resetLabel}`,
    // startAtEnd puts TextIndex at the message's  far end (base +
    // maxOffset, computed directly here rather than via farEnd() below -
    // farEnd isn't written until after skipLabel, and offsetExpr IS what
    // base is about to become anyway) instead of its near end, so a message
    // shown this way opens already scrolled to its last character.
    `TextIndex = ${startAtEnd ? `${offsetExpr} + ${maxOffsetExpr}` : offsetExpr}`,
    `${base()} = ${offsetExpr}`,
    // A genuinely new message always starts unpaused, and scrolling in
    // whichever direction moves it AWAY from wherever TextIndex was just set
    // above - forward (bit clear) from the near end normally, backward (bit
    // set, TEXT_SCROLL_DIR_MASK) from the far end when startAtEnd - even if
    // the PREVIOUS message was left paused/reversed (see
    // text_minikernel_scroll_control's "Pause" action), which shouldn't
    // silently carry over onto whatever gets shown next. A bare overwrite
    // (rather than the bit-preserving form the "Pause"/"Unpause" actions
    // themselves need - see that generator's  comment) is correct here
    // specifically BECAUSE this is the one place direction is meant to reset
    // too - see TEXT_SCROLL_DIR_BIT's  comment.
    `${state()} = ${startAtEnd ? TEXT_SCROLL_DIR_MASK : '0'}`,
    // 1, not pauseCode/speedCode - generateTextScrollAdvance's "dec
    // timer; bne done" only falls through to the actual advance once timer
    // hits 0, so starting it at 1 makes that happen on the very next frame
    // this runs, i.e. no wait at all before a brand new message's first
    // character shift. (This used to start at pauseCode, mirroring the
    // "pause at limits" delay a mid-scroll reversal waits out at each end -
    // deliberately dropped: a first run isn't a reversal, and the user
    // reported it shouldn't wait like one.)
    `${timer()} = 1`,
    `@${skipLabel}`,
    // Absolute, not relative (see textScrollFarEndVarName's  comment) -
    // "base" here (not offsetExpr again) deliberately reuses whatever
    // TextIndex/base were JUST set to above (on the reset path) or already
    // held (on the skip path), rather than re-evaluating offsetExpr a
    // second time - harmless if offsetExpr is a plain literal/variable, but
    // offsetExpr can also be a table lookup (e.g. "text_offsets[id]" for
    // "Show text with ID"), which a second, redundant read would only cost
    // cycles on for no benefit.
    `${farEnd()} = ${base()} + ${maxOffsetExpr}`,
    ...(textScrollSpeedOperand(resolveVar).fixed ? [] : [`${speed()} = ${speedCode}`]),
    ...(textScrollPauseOperand(resolveVar).fixed ? [] : [`${pauseDuration()} = ${pauseCode}`]),
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
  // isTextScrollActive (not just isTextMinikernelActive) - a project using
  // only plain, static "Show text" blocks has nothing for this to ever do
  // (every call site's  farEnd already equals base unconditionally, see
  // buildTextScrollSetupLines'  maxOffsetExpr===0 fast path), and none
  // of the vars this references below are even reserved in that case.
  if (!Blockly.BBasic.isTextScrollActive()) return '';
  const resolveVar = (name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const base = resolveVar(textScrollBaseVarName());
  const farEnd = resolveVar(textScrollFarEndVarName());
  const timer = resolveVar(textScrollTimerVarName());
  const speedOperand = textScrollSpeedOperand(resolveVar);
  const pauseOperand = textScrollPauseOperand(resolveVar);
  const speed = speedOperand.fixed ? '#' + speedOperand.value : speedOperand.value;
  const pauseDuration = pauseOperand.fixed ? '#' + pauseOperand.value : pauseOperand.value;
  const state = resolveVar(textScrollStateVarName());
  // Spliced directly into bbasic.bb.hbs's commongamelogic, bypassing
  // Blockly.BBasic.normalizeIndents() the same way generateBackgroundFadeChecks/
  // generateEnvelopeChecks/generateMusicChecks do (see
  // generateBackgroundFadeChecks'  comment in background.js) - every
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
  // store, and TextIndex's  advance/retreat are a single INC/DEC the same
  // way. Every branch target here sits well within +-127 bytes
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
// numbers - see text-minikernel.js's  registerFreeTypedMessage/
// namedMessagePosition call sites) it needs an actual runtime lookup: two
// small parallel tables, one byte per Text tab entry (including the
// reserved blank guard row, so a stray id of 0 reads harmlessly zeroed
// entries instead of garbage), giving that entry's  text_strings byte
// offset and max scroll offset. A table can only be read correctly from the
// bank it's declared in (see dataTableSymbolName/trackDataTableBank in
// generators/bbasic.js), so these follow that same per-bank-copy scheme
// data.js's  tables use - trackByIdScrollUsage below records which banks
// actually read them (called from text-minikernel.js's
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
// generators/bbasic.js's  finish() (bank 1's  copy) and
// generateRelocatedSections (each relocated bank's  copy). A table
// nothing ever read still gets a bank 1 copy, matching generateDataTables'
// "unused table" behavior.
export const generateTextOffsetTables = (Blockly, bank) => {
  if (!Blockly.BBasic.isTextMinikernelActive()) return '';
  const usage = Blockly.BBasic.dataTableBankUsage[TEXT_OFFSET_TABLE_ID];
  if (!(usage ? usage.has(bank) : bank === Blockly.BBasic.primaryBank())) return '';
  const layout = getNamedScrollLayout();
  const offsets = layout.map((entry) => `${entry.offset}`).join(', ');
  const maxOffsets = layout.map((entry) => `${entry.maxOffset}`).join(', ');
  // Bank-suffixed (see bankSuffixedTableName's  comment in blocks/data.js)
  // - a project reading these from more than one bank needs a distinctly
  // named copy per bank, not a second copy sharing the same name (a real
  // reported duplicate-label assembly failure).
  const offsetsName = bankSuffixedTableName('text_offsets', bank);
  const scrollMaxName = bankSuffixedTableName('text_scroll_max', bank);
  return ` data ${offsetsName}\n  ${offsets}\nend\n\n data ${scrollMaxName}\n  ${maxOffsets}\nend`;
};
