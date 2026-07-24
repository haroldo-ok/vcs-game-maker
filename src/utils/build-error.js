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
          return `Line ${position}: ${rest}` + '\n' + codeLines[position - 1];
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
