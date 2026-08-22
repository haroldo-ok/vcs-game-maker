'use strict';

import {chunk} from 'lodash';

import {useConfigurationStorage} from '../../hooks/project';
import {TEXT_MESSAGE_LENGTH, CHAR_TO_GLYPH, listTextStrings, resolveTextMaxDisplayWidth} from '../../blocks/text-strings';
import {getNamedScrollLayout, registerFreeTypedScrollMessage, buildTextScrollSetupLines,
  trackTextByIdScrollUsage, textScrollOffsetVarName, textScrollMaxVarName,
  textScrollBaseVarName, textScrollDirVarName, textScrollPausedVarName,
  textScrollPauseVarName, textScrollTimerVarName} from './text-scroll';

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
const KERNEL_BANK_BY_ROMSIZE = {'8k': 2, '16k': 4, '32k': 8};

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
// on the left, 'center' splits it across both sides, shorted by one space
// on the left than an even split would give when the padding is odd -
// confirmed against the actual rendered row, the Text Minikernel's own
// drawing doesn't quite treat both sides symmetrically, so a plain
// floor/ceil split still landed one space too far left). That maxWidth-wide
// field always starts at the row's own first character slot - the
// remaining TEXT_MESSAGE_LENGTH - maxWidth slots are always blank and
// always at the END of the row, regardless of justify, so a narrower
// maxWidth always reads as "the rest of the row got truncated," never as
// the message shifting position.
export const encodeTextMessage = (text, justify = 'left', maxWidth = resolveTextMaxDisplayWidth()) => {
  const upper = String(text || '').toUpperCase().slice(0, maxWidth);
  const totalPad = maxWidth - upper.length;
  const leftPad = justify === 'right' ? totalPad :
    justify === 'center' ? Math.max(0, Math.floor(totalPad / 2) - 1) : 0;
  const withinWidth = ' '.repeat(leftPad) + upper.padEnd(maxWidth - leftPad, ' ');
  const fullRow = withinWidth.padEnd(TEXT_MESSAGE_LENGTH, ' ');
  return fullRow.split('').map((char) => CHAR_TO_GLYPH[char] || '_sp');
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

  // Free-typed messages ("Show text: <literal>") have no Text tab entry to
  // number them by, so they keep the old lazy, dedup-by-content scheme,
  // appended after every Text tab entry's own fixed-width row (see
  // generateTextMinikernel()) - always TEXT_MESSAGE_LENGTH wide and always
  // truncated to maxWidth (see encodeTextMessage), same as every named row,
  // since maxWidth is a hard cap every "Show text" block respects,
  // scrolling variants included (see getNamedScrollLayout's own comment in
  // text-scroll.js).
  const registerFreeTypedMessage = (text) => {
    Blockly.BBasic.freeTypedMessages = Blockly.BBasic.freeTypedMessages || [];
    const messages = Blockly.BBasic.freeTypedMessages;
    let index = messages.indexOf(text);
    if (index === -1) {
      index = messages.length;
      messages.push(text);
    }
    const offset = (listTextStrings().length + 1 + index) * TEXT_MESSAGE_LENGTH;
    return {offset, maxOffset: 0};
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
    const lines = buildTextScrollSetupLines(resolveVar, offsetExpr, maxOffsetExpr, speed, pause, uniqueId);
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

  // Plain named block: always the ordinary, single, maxWidth-truncated
  // static row (position*TEXT_MESSAGE_LENGTH), maxOffset always 0 - never
  // touches the scroll append region at all.
  Blockly.BBasic['text_minikernel_show_named'] = function(block) {
    markTextMinikernelUsed();
    const offset = namedMessagePosition(block.getFieldValue('TEXT_ID')) * TEXT_MESSAGE_LENGTH;
    return emitScrollSetup(offset, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE);
  };
  // Scroll named block: uses the SAME position to look up that entry's own
  // page-0 offset/maxOffset in the scroll append region (see
  // getNamedScrollLayout in text-scroll.js) - naturally maxOffset = 0 for a
  // message with only one page (fits within maxWidth already), same
  // end-to-end effect as the plain block above for that message.
  Blockly.BBasic['text_minikernel_show_named_scroll'] = function(block) {
    markTextMinikernelUsed();
    const position = namedMessagePosition(block.getFieldValue('TEXT_ID'));
    const layout = getNamedScrollLayout();
    const entry = layout[position] || layout[0];
    return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block));
  };

  Blockly.BBasic['text_minikernel_show'] = function(block) {
    markTextMinikernelUsed();
    const entry = registerFreeTypedMessage(block.getFieldValue('TEXT'));
    return emitScrollSetup(entry.offset, entry.maxOffset, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE);
  };
  Blockly.BBasic['text_minikernel_show_scroll'] = function(block) {
    markTextMinikernelUsed();
    const entry = registerFreeTypedScrollMessage(Blockly, block.getFieldValue('TEXT'));
    return emitScrollSetup(entry.offset, entry.maxOffset, ...scrollFieldCodes(block));
  };

  Blockly.BBasic['text_minikernel_show_by_id'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
    // Hand-written "*" rather than routing through the math_arithmetic
    // block generator - see Blockly.BBasic.usesDivMul's own comment
    // elsewhere in this codebase: any multiply/divide has to flag
    // usesDivMul itself so generateDivMul() knows to pull in div_mul.asm.
    Blockly.BBasic.usesDivMul = true;
    return emitScrollSetup(`(${argument0}) * ${TEXT_MESSAGE_LENGTH}`, 0, DEFAULT_SCROLL_SPEED, DEFAULT_SCROLL_PAUSE);
  };
  // Scroll by-id block: which entry gets shown isn't known until runtime,
  // so unlike the compile-time-known blocks above, this needs an actual
  // runtime table lookup - see trackTextByIdScrollUsage/
  // generateTextOffsetTables' own comments in text-scroll.js.
  Blockly.BBasic['text_minikernel_show_by_id_scroll'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_NONE) || '0';
    trackTextByIdScrollUsage(Blockly, Blockly.BBasic.getCurrentBank());
    return emitScrollSetup(
        `text_offsets[${argument0}]`, `text_scroll_max[${argument0}]`, ...scrollFieldCodes(block));
  };

  Blockly.BBasic['text_minikernel_clear'] = function(block) {
    markTextMinikernelUsed();
    // Setting TextIndex alone isn't enough: if the message being cleared was
    // scrolling, generateTextScrollAdvance (text-scroll.js) runs every frame
    // in commongamelogic and keeps recomputing "TextIndex = base + off" from
    // the OLD scroll state, overwriting this back to the scrolling message on
    // the very next frame - a real reported bug ("text isn't staying clear
    // after using 'clear text'"). Zeroing max makes that per-frame check bail
    // immediately (its own first line is "if max = 0 then goto done"), and
    // base/off/dir are reset too so a later "Show text (scrolling)" call
    // starts from a clean slate rather than whatever was left over. paused is
    // set to 2, not 1 - a tri-state (see textScrollPausedVarName's own
    // comment) that also forces the NEXT "Show text" call to fully reset even
    // if it's showing the exact same message as before the clear (otherwise
    // buildTextScrollSetupLines' own lastBase-matches guard would think
    // nothing changed and skip re-pointing TextIndex at it - a real reported
    // follow-up bug, "scroll text is not coming back after using clear
    // text").
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const base = resolveVar(textScrollBaseVarName());
    const off = resolveVar(textScrollOffsetVarName());
    const max = resolveVar(textScrollMaxVarName());
    const dir = resolveVar(textScrollDirVarName());
    const paused = resolveVar(textScrollPausedVarName());
    return `TextIndex = 0\n` +
      `${base} = 0\n` +
      `${off} = 0\n` +
      `${max} = 0\n` +
      `${dir} = 0\n` +
      `${paused} = 2\n`;
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

  // A single comparison against the shared scroll state (see
  // text-scroll.js) - modeled directly on background_fade_active's own
  // simple-bit-read pattern in generators/bbasic/background.js. "Left"
  // reads offset = 0 (also true, harmlessly, for a message that never
  // needed to scroll at all - see buildTextScrollSetupLines' own comment);
  // "Right" reads offset = max, which is only ever reached by a message
  // that's actually scrolling.
  Blockly.BBasic['text_minikernel_scroll_at'] = function(block) {
    markTextMinikernelUsed();
    const resolveVar = (canonicalName) =>
      Blockly.BBasic.nameDB_.getName(canonicalName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
    const off = resolveVar(textScrollOffsetVarName());
    const side = block.getFieldValue('SIDE');
    const code = side === 'right' ? `${off} = ${resolveVar(textScrollMaxVarName())}` : `${off} = 0`;
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
    const off = resolveVar(textScrollOffsetVarName());
    const dir = resolveVar(textScrollDirVarName());
    const timer = resolveVar(textScrollTimerVarName());
    const pause = resolveVar(textScrollPauseVarName());
    const paused = resolveVar(textScrollPausedVarName());
    const action = block.getFieldValue('ACTION');
    // Snaps back to the message's own start (offset 0, TextIndex = base) -
    // shared by Stop/Restart, which only differ in whether they leave the
    // paused flag set afterward.
    const resetToStart = `${off} = 0\n` +
      `${dir} = 0\n` +
      `TextIndex = ${base}\n`;
    if (action === 'pause') return `${paused} = 1\n`;
    if (action === 'start' || action === 'unpause') return `${paused} = 0\n`;
    if (action === 'stop') return resetToStart + `${paused} = 1\n`;
    // 'restart' - waits the "pause at limits" duration before its first
    // step, matching buildTextScrollSetupLines' own reasoning for why a
    // freshly (re)started message shouldn't immediately start scrolling
    // away after only a "speed"-length delay.
    return resetToStart + `${paused} = 0\n` + `${timer} = ${pause}\n`;
  };

  // Drives generateSystemDims()'s TextIndex/TextDataPtr dims below - needs to
  // know this well before any block's own generator runs.
  Blockly.BBasic.isTextMinikernelActive = function() {
    return !!this.textMinikernelUsed;
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
  Blockly.BBasic.generateTextMinikernelDims = function() {
    if (!this.isTextMinikernelActive()) return '';
    const textIndexDim = '\n dim TextIndex = var44';
    const textDataPtrDim = this.pfscoreEnabledForTextMinikernel ? '\n dim TextDataPtr = var46' : '';
    return textIndexDim + textDataPtrDim;
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
    // offset = N * TEXT_MESSAGE_LENGTH - see namedMessagePosition() above
    // and "Show text with ID"'s own generator). Next: free-typed messages,
    // in first-referenced order (see registerFreeTypedMessage above). Every
    // row so far is always exactly TEXT_MESSAGE_LENGTH wide and always
    // truncated to maxWidth via encodeTextMessage - this is the region the
    // PLAIN "Show text" blocks exclusively read from.
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
    const staticEntries = [{text: '', justify: 'left'}, ...listTextStrings()];
    const namedRows = staticEntries.flatMap(({text, justify}) =>
      glyphRows(encodeTextMessage(text, justify, maxWidth)));
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
