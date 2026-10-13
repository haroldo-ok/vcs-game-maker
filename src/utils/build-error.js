'use strict';

import {useErrorBannerHighlight} from '../hooks/project';

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
          // stage's  errors (see hooks/bb-compiler.js's assemble())
          // number lines within main.asm, the fully macro-expanded assembly
          // DASM actually saw, not the bBasic source passed in here, which
          // is far shorter - confirmed directly as the cause of a bare
          // "undefined" appearing where the source line should have been.
          // That stage already embeds its  correctly-numbered context
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

// Escapes text for safe use inside App.vue's errorStorage <pre>, which
// renders via v-html (not v-text) so boldenErrorHeaders below can add
// <b> tags - every OTHER call site that writes errorStorage.value
// directly (App.vue's handleRomDownload/handleTestInStella) needs this too,
// even though none of them add bolding, since a raw '<'/'>'/'&' in e.g. a
// Stella launch error would otherwise be parsed as real markup instead of
// showing as the literal character v-text used to guarantee.
export const escapeHtml = (text) => String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

// Bolds the "header" lines of an error report - the top summary line and
// every "Line N: ..." annotation preprocessError adds above - leaving the
// actual source/context lines under each (asm dumps, source snippets) at
// normal weight, so the parts that actually say WHAT went wrong stand out
// from the surrounding detail, confirmed directly as a real request once
// showError's highlightHtml made bolding part of an error message possible
// at all. Escapes first, then only ever wraps already-escaped lines in
// <b> tags this function adds itself - never raw content - so the result
// stays safe to render via v-html.
// The one context line bb-compiler.js's assemble() marks with a leading
// "> " (see its comment on annotating main.asm context around the
// offending line) - matched against the ALREADY-escaped text, so this
// looks for "&gt; " (escapeHtml above turns a literal ">" into that),
// not a raw ">".
const OFFENDING_LINE_PATTERN = /^&gt;\s*\d+:/;
// main.asm (the source of the context lines around "Line N:") is saved
// with CRLF line endings - split('\n') below leaves a trailing "\r" stuck
// to the end of each of those lines, invisible in v-text's plain rendering
// but, once wrapped in a real <b> tag for v-html, rendered by the browser
// as an actual second line break (bare "\r" inside preformatted content is
// itself a line separator) - confirmed directly as a real reported blank
// line appearing right after the bolded offending line. Normalized away
// before splitting, not per-line after, so it's gone everywhere at once.
const boldenErrorHeaders = (text) => escapeHtml(text.replace(/\r\n?/g, '\n'))
    .split('\n')
    .map((line, index) => (index === 0 || /^Line \d+:/.test(line) || OFFENDING_LINE_PATTERN.test(line)) ?
      `<b>${line}</b>` : line)
    .join('\n');

/**
 * Reports an error on the footer and the console.
 * @param {!Object} errorStorage The error message storage.
 * @param {string} msg A description of what failed.
 * @param {string} code The bBasic source involved, if any.
 * @param {*} e The error.
 * @param {string=} highlightHtml A short, safe HTML snippet (e.g. built
 *     from a caller's plain numbers, never raw project/user data - see
 *     useErrorBannerHighlight's comment) shown bold above the error
 *     banner. Cleared when omitted, so a highlight from a previous,
 *     unrelated error never lingers above this one.
 */
export const showError = (errorStorage, msg, code, e, highlightHtml) => {
  console.error(msg, e);
  errorStorage.value = boldenErrorHeaders(`${msg}: ${preprocessError(code, e)}`);
  useErrorBannerHighlight().value = highlightHtml || '';
};
