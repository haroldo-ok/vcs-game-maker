'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {TEXT_MESSAGE_LENGTH, listTextStrings} from '../../blocks/text-strings';

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

// Maps each supported character to the glyph constant name declared in
// text12a.asm/text12b.asm's left_text/right_text tables. Anything not listed
// here (lowercase letters get upper-cased first) falls back to a blank space
// rather than failing the build.
export const CHAR_TO_GLYPH = {
  'A': '__A', 'B': '__B', 'C': '__C', 'D': '__D', 'E': '__E', 'F': '__F',
  'G': '__G', 'H': '__H', 'I': '__I', 'J': '__J', 'K': '__K', 'L': '__L',
  'M': '__M', 'N': '__N', 'O': '__O', 'P': '__P', 'Q': '__Q', 'R': '__R',
  'S': '__S', 'T': '__T', 'U': '__U', 'V': '__V', 'W': '__W', 'X': '__X',
  'Y': '__Y', 'Z': '__Z',
  '0': '__0', '1': '__1', '2': '__2', '3': '__3', '4': '__4',
  '5': '__5', '6': '__6', '7': '__7', '8': '__8', '9': '__9',
  ' ': '_sp', '.': '_pd', '?': '_qu', '!': '_ex', ',': '_cm', '-': '_hy',
  '+': '_pl', '\'': '_ap', '(': '_lp', ')': '_rp', ':': '_co', '/': '_sl',
  '=': '_eq', '"': '_qt', '#': '_po',
};

// Converts free-typed text into a fixed-width row of glyph tokens for the
// "data text_strings" table: upper-cased, unsupported characters become
// spaces, and the result is always exactly TEXT_MESSAGE_LENGTH tokens long
// (truncated or padded with spaces). justify (see the Text tab's own
// Left/Center/Right buttons - one of TEXT_JUSTIFY_OPTIONS in
// blocks/text-strings.js) decides where the padding goes: 'left' (the
// default) puts it all on the right, 'right' puts it all on the left,
// 'center' splits it across both sides - shorted by one space on the left
// than an even split would give when the padding is odd (confirmed against
// the actual rendered row - the Text Minikernel's own drawing doesn't quite
// treat both sides symmetrically, so a plain floor/ceil split still landed
// one space too far left).
export const encodeTextMessage = (text, justify = 'left') => {
  const upper = String(text || '').toUpperCase().slice(0, TEXT_MESSAGE_LENGTH);
  const totalPad = TEXT_MESSAGE_LENGTH - upper.length;
  const leftPad = justify === 'right' ? totalPad :
    justify === 'center' ? Math.max(0, Math.floor(totalPad / 2) - 1) : 0;
  const padded = ' '.repeat(leftPad) + upper.padEnd(TEXT_MESSAGE_LENGTH - leftPad, ' ');
  return padded.split('').map((char) => CHAR_TO_GLYPH[char] || '_sp');
};

export default (Blockly) => {
  const markTextMinikernelUsed = () => {
    Blockly.BBasic.textMinikernelUsed = true;
  };

  // Every message defined on the Text tab occupies a FIXED table row, one
  // more than its position in that list (row 0 is reserved blank - see
  // generateTextMinikernel() below) - not assigned lazily as blocks happen
  // to reference them. That's what makes "Show text with ID" possible at
  // all: its number is only known at runtime, so there's no block-visitation
  // moment to hang a lazy registration off of. A pure function of the Text
  // tab's own stored order also means a compile-time reference (the "Show
  // text" dropdown) and a runtime one (a variable someone sets to 1, 2, ...)
  // always agree on which message a given position means - typing "2" gets
  // you the second message listed on the Text tab, full stop.
  const namedMessagePosition = (id) => {
    const entries = listTextStrings();
    const index = entries.findIndex((entry) => `${entry.id}` === `${id}`);
    return index === -1 ? 0 : index + 1;
  };

  // Free-typed messages ("Show text: <literal>") have no Text tab entry to
  // number them by, so they keep the old lazy, dedup-by-content scheme,
  // appended after every Text tab entry's fixed row (see
  // generateTextMinikernel()).
  const registerFreeTypedMessage = (text) => {
    Blockly.BBasic.freeTypedMessages = Blockly.BBasic.freeTypedMessages || [];
    const messages = Blockly.BBasic.freeTypedMessages;
    let index = messages.indexOf(text);
    if (index === -1) {
      index = messages.length;
      messages.push(text);
    }
    return (listTextStrings().length + 1 + index) * TEXT_MESSAGE_LENGTH;
  };

  Blockly.BBasic['text_minikernel_show'] = function(block) {
    markTextMinikernelUsed();
    const message = block.getFieldValue('TEXT');
    const offset = registerFreeTypedMessage(message);
    return `TextIndex = ${offset}\n`;
  };

  Blockly.BBasic['text_minikernel_show_named'] = function(block) {
    markTextMinikernelUsed();
    const offset = namedMessagePosition(block.getFieldValue('TEXT_ID')) * TEXT_MESSAGE_LENGTH;
    return `TextIndex = ${offset}\n`;
  };

  Blockly.BBasic['text_minikernel_show_by_id'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_MULTIPLICATION) || '0';
    // Hand-written "*" rather than routing through the math_arithmetic
    // block generator - see Blockly.BBasic.usesDivMul's own comment in
    // bbasic.js: any multiply/divide has to flag usesDivMul itself so
    // generateDivMul() knows to pull in div_mul.asm, since nothing else
    // triggers on a "*" appearing in hand-written generator output.
    Blockly.BBasic.usesDivMul = true;
    return `TextIndex = (${argument0}) * ${TEXT_MESSAGE_LENGTH}\n`;
  };

  Blockly.BBasic['text_minikernel_clear'] = function(block) {
    markTextMinikernelUsed();
    return 'TextIndex = 0\n';
  };

  Blockly.BBasic['text_minikernel_set_color'] = function(block) {
    markTextMinikernelUsed();
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return `TextColor = ${argument0}\n`;
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
    // 1..N: every Text tab entry, in that same order (position N = row N -
    // see namedMessagePosition() above and "Show text with ID"). Remaining
    // rows: free-typed messages, in first-referenced order.
    // Free-typed messages ("Show text: <literal>") have no Justify buttons
    // of their own to read - only Text tab entries do.
    const namedTexts = listTextStrings().map(({text, justify}) => ({text, justify}));
    const freeTypedTexts = (this.freeTypedMessages || []).map((text) => ({text, justify: 'left'}));
    const allTexts = [{text: '', justify: 'left'}, ...namedTexts, ...freeTypedTexts];
    const rows = allTexts.map(({text, justify}) =>
      '  ' + encodeTextMessage(text, justify).join(', '));
    const dataTable = ` data text_strings\n${rows.join('\n')}\nend`;

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
    const skippedBankPlaceholders = [];
    for (let bank = 2; bank < kernelBank; bank++) {
      skippedBankPlaceholders.push(` bank ${bank}\n bank 1`);
    }

    return `${skippedBankPlaceholders.join('\n')}\n bank ${kernelBank}\n${block}\n bank 1`;
  };
};
