'use strict';

/**
 * Annotates each "Line N:" of a compiler error with the offending source line.
 * @param {string} code The bBasic source the error came from.
 * @param {*} e The error.
 * @return {*} The error message, with source lines interleaved.
 */
export const preprocessError = (code, e) => {
  if (!code) return e;
  try {
    const codeLines = code.split('\n');

    return `${e}`.split('\n')
        .map((line) => {
          const parts = /^Line (\d+):\s*(.*)/g.exec(line);
          if (!parts) return line;

          const position = parseInt(parts[1]);
          const rest = parts[2];
          const sourceLine = codeLines[position - 1];
          // A line number can point past the end of `code` - the assembler
          // stage's own errors (see hooks/bb-compiler.js's assemble())
          // number lines within main.asm, the fully macro-expanded assembly
          // DASM actually saw, not the bBasic source passed in here, which
          // is far shorter - confirmed directly as the cause of a bare
          // "undefined" appearing where the source line should have been.
          // That stage already embeds its own correctly-numbered context
          // lines from main.asm directly in the message, so silently
          // omitting a mismatched line here (rather than printing
          // "undefined") just leaves that context as the only line shown,
          // instead of a wrong and confusing extra one under it.
          return sourceLine === undefined ? `Line ${position}: ${rest}` : `Line ${position}: ${rest}\n${sourceLine}`;
        })
        .join('\n');
  } catch (e2) {
    console.warn('Error while preprocessing error message', e2);
    return e;
  }
};

/**
 * Reports an error on the footer and the console.
 * @param {!Object} errorStorage The error message storage.
 * @param {string} msg A description of what failed.
 * @param {string} code The bBasic source involved, if any.
 * @param {*} e The error.
 */
export const showError = (errorStorage, msg, code, e) => {
  console.error(msg, e);
  errorStorage.value = `${msg}: ${preprocessError(code, e)}`;
};
