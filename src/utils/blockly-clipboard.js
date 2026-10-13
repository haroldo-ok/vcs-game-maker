// Copy and paste of Blockly blocks between browser windows (and between
// different browsers or the desktop app). The multiselect plugin already
// shares copied blocks between windows of the same browser through
// localStorage; this also puts them on the system clipboard as text, and reads
// them back from it when pasting, so they get across windows that do not share
// storage. A copy puts a "VCSGM-BLOCKS:" line on the clipboard (the same data
// the plugin keeps in localStorage); a paste first looks at the clipboard and,
// when it holds blocks newer than the ones in localStorage, moves them into
// localStorage, then lets the plugin's own paste run.
//
// Goes through the browser's copy/cut/paste events (the clipboard data of the
// event itself) rather than the asynchronous clipboard API, so the browser
// never asks for permission to read the clipboard.
import Blockly from 'blockly';

const PREFIX = 'VCSGM-BLOCKS:';
const MULTI_KEY = 'blocklyStashMulti';
const CONNECTION_KEY = 'blocklyStashConnection';
const TIME_KEY = 'blocklyStashTime';

// How long to wait for the browser event before carrying on without it.
const EVENT_WAIT_MS = 120;

const readStash = () => {
  try {
    const multi = localStorage.getItem(MULTI_KEY);
    const time = Number(localStorage.getItem(TIME_KEY));
    if (!multi || !time) return null;
    return {
      multi: JSON.parse(multi),
      connection: JSON.parse(localStorage.getItem(CONNECTION_KEY) || '[]'),
      time,
    };
  } catch (e) {
    return null;
  }
};

// Moves blocks found in clipboard text into the plugin's localStorage copy when
// they are newer than what it already holds.
const importFromText = (text) => {
  if (!text || !text.startsWith(PREFIX)) return false;
  let stash;
  try {
    stash = JSON.parse(text.slice(PREFIX.length));
  } catch (e) {
    return false;
  }
  if (!stash || !Array.isArray(stash.multi)) return false;
  const current = readStash();
  if (current && current.time >= stash.time) return false;
  localStorage.setItem(MULTI_KEY, JSON.stringify(stash.multi));
  localStorage.setItem(CONNECTION_KEY, JSON.stringify(stash.connection || []));
  // Newer than anything this window has seen, so the plugin picks it up.
  localStorage.setItem(TIME_KEY, String(Date.now()));
  return true;
};

const isTextTarget = (event) => {
  const target = event.target;
  if (!target || !target.tagName) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
};

// Starts watching Ctrl/Cmd+C, X and V; returns a function that stops.
export const installBlocklyClipboardSync = () => {
  if (typeof document === 'undefined') return () => {};
  let copiedBefore = null;
  let copyTimer = null;
  let pendingPaste = null;

  const onKeyDown = (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || isTextTarget(event)) return;
    const key = (event.key || '').toLowerCase();
    if (key === 'c' || key === 'x') {
      // The plugin's handler runs after this one and stores the blocks; the
      // browser's copy/cut event follows and picks them up from there.
      copiedBefore = localStorage.getItem(TIME_KEY);
      clearTimeout(copyTimer);
      copyTimer = setTimeout(() => {
        // No copy event arrived: fall back to the clipboard API (writing needs
        // no permission prompt while the key press is recent).
        const stash = readStash();
        if (stash && String(stash.time) !== copiedBefore && navigator.clipboard) {
          navigator.clipboard.writeText(PREFIX + JSON.stringify(stash)).catch(() => {});
        }
      }, 400);
      return;
    }
    if (key === 'v') {
      const workspace = Blockly.common.getMainWorkspace();
      if (!workspace) return;
      // Hold the plugin's paste until the browser's paste event has delivered
      // the clipboard text (no preventDefault: the event has to fire).
      event.stopPropagation();
      const run = () => {
        if (!pendingPaste) return;
        const paste = pendingPaste;
        pendingPaste = null;
        clearTimeout(paste.timer);
        Blockly.ShortcutRegistry.registry.onKeyDown(workspace, paste.event);
      };
      pendingPaste = {event, run, timer: setTimeout(run, EVENT_WAIT_MS)};
    }
  };

  const onCopyOrCut = (event) => {
    if (isTextTarget(event) || !event.clipboardData) return;
    const stash = readStash();
    if (!stash || String(stash.time) === copiedBefore) return;
    clearTimeout(copyTimer);
    event.clipboardData.setData('text/plain', PREFIX + JSON.stringify(stash));
    event.preventDefault();
  };

  const onPaste = (event) => {
    if (!pendingPaste || isTextTarget(event)) return;
    const text = event.clipboardData ? event.clipboardData.getData('text/plain') : '';
    importFromText(text);
    pendingPaste.run();
  };

  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('copy', onCopyOrCut, true);
  document.addEventListener('cut', onCopyOrCut, true);
  document.addEventListener('paste', onPaste, true);
  return () => {
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('copy', onCopyOrCut, true);
    document.removeEventListener('cut', onCopyOrCut, true);
    document.removeEventListener('paste', onPaste, true);
    clearTimeout(copyTimer);
    if (pendingPaste) clearTimeout(pendingPaste.timer);
  };
};
