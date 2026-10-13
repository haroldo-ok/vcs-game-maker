'use strict';

// batari Basic 1.9 handles `return` and `gosub` correctly for 8k, 16k and 32k ROMs but not for 64k:
// - a `return` compiles to a plain RTS, where the smaller sizes get a check that sends a return
//   that crosses banks through BS_return (the routine that switches back to the caller's bank);
// - a `gosub` without a bank tag compiles to a plain JSR, which pushes an ordinary address, while
//   a tagged one (`gosub name bank3`) pushes the caller's bank number along with the return address.
// A subroutine called from another bank therefore returned into the wrong bank (the picture rolls,
// or sprites vanish when a collision runs a relocated routine) and leaked two bytes of stack on
// every call until the stack overwrote the variables.
//
// For a 64k build, every untagged `gosub` is tagged with the bank it is written in (a call that
// stays in its bank is still a call into that bank) and every subroutine `return` jumps to
// BS_return, so a call and its return always agree. The bank is tracked from the `bank N` lines the
// generator wraps relocated code in. Function returns (`return value`, inside `function ... end`)
// and anything inside asm, data or graphics blocks are left as they are.

const BLOCK_START = /^(asm|data\s|function\s|playfield:|pfcolors:|pfheights:|player\d*(color)?:|lives:)/i;
const GOSUB = /\bgosub\s+([A-Za-z_.][\w.]*)(?![\w.])(?!\s+bank\d)/g;
const BARE_RETURN_LINES = [' asm', ' jmp BS_return', 'end'];

/**
 * Whether the generated batari Basic is for a 64k ROM.
 * @param {string} code
 * @return {boolean}
 */
export const isSixtyFourK = (code) => /^\s*set\s+romsize\s+64k/im.test(code);

/**
 * Rewrites the code so gosubs and returns work between banks on a 64k ROM. See the top of this file.
 * @param {string} code Generated batari Basic.
 * @return {string} Code for the 64k bankswitching scheme; unchanged for any other ROM size.
 */
export const adaptFor64k = (code) => {
  if (!isSixtyFourK(code)) return code;
  const out = [];
  let bank = 1;
  let inBlock = false;
  let counter = 0;
  const tag = (text) => text.replace(GOSUB, (match, name) => `gosub ${name} bank${bank}`);

  code.split('\n').forEach((line) => {
    const trimmed = line.trim();
    if (inBlock) {
      out.push(line);
      if (trimmed.toLowerCase() === 'end') inBlock = false;
      return;
    }
    if (BLOCK_START.test(trimmed)) {
      inBlock = true;
      out.push(line);
      return;
    }
    const bankStatement = /^bank\s+(\d+)$/i.exec(trimmed);
    if (bankStatement) {
      bank = Number(bankStatement[1]);
      out.push(line);
      return;
    }
    if (/^rem(\s|$)/i.test(trimmed)) {
      out.push(line);
      return;
    }
    if (trimmed === 'return') {
      out.push(...BARE_RETURN_LINES);
      return;
    }
    // "if <condition> then <statements> : return" and "if <condition> then return": the return
    // can't be written inside a one-line if, so the if jumps to a labelled return instead.
    const conditionalReturn = /^(if\s.+?\s+then\s+)(?:(.*?)\s*:\s*)?return$/i.exec(trimmed);
    if (conditionalReturn) {
      counter += 1;
      const label = `_bank64_return_${counter}`;
      out.push(` ${conditionalReturn[1]}goto ${label}_do`, ` goto ${label}_skip`, `${label}_do`);
      if (conditionalReturn[2]) out.push(` ${tag(conditionalReturn[2])}`);
      out.push(...BARE_RETURN_LINES, `${label}_skip`);
      return;
    }
    out.push(tag(line));
  });
  return out.join('\n');
};
