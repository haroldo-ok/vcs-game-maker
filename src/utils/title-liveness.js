'use strict';

// Which variables the generated code uses only after the Title Screen is over. The Title Screen variables only live while
// the title loop runs, so a variable that nothing in that loop touches can share a slot with one of them (see titleSharedSlots
// in generators/bbasic.js).
//
// The generated batari Basic is read as text: the code that can run during the title screen is the start-up code up to the
// main loop, the Title Screen events, the first half of commongamelogic (the second half is skipped while the title loop
// runs), and every routine those reach through gosub or goto. The main loop, the gameplay events and the second half of
// commongamelogic are where the title screen hands over, so they are never followed.

// The variables the Titlescreen Kernel's assembly reads while it draws.
const KERNEL_VARIABLES = ['player0size', 'player1size'];
const EVENT_LABEL = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)*_(?:begin|end)$/;
const TITLE_EVENTS = ['system_start', 'title_start', 'title_update'];
const HANDOVER_LABELS = ['main', 'commongamelogicdraw'];
const NOT_LABELS = new Set(['end', 'asm', 'return', 'else', 'next', 'data', 'dim', 'const', 'rem', 'bank', 'inline', 'include',
  'set', 'def', 'game', 'alphachars', 'pfcolors:', 'pfheights:', 'bkcolors:', 'playfield:', 'player0:', 'player1:']);
const WORD = /[A-Za-z_][A-Za-z0-9_]*/g;
const INIT_CONSTANT = /^\s*([A-Za-z_]\w*)\s*=\s*(\$[0-9A-Fa-f]+|%[01]+|\d+)\s*(?:;.*)?$/;
const JUMP = /\b(?:gosub|goto|jmp|jsr)\s+([A-Za-z_.]\w*)/g;

const stripComment = (line) => line.replace(/\s;.*$/, '');

export const findGameplayOnlyNames = (code) => {
  const lines = code.split('\n');
  const labelAt = new Map();
  lines.forEach((line, index) => {
    const match = /^(\.?[A-Za-z_]\w*)\s*(?:bank\d+)?\s*$/.exec(stripComment(line));
    if (match && !NOT_LABELS.has(match[1]) && !labelAt.has(match[1])) labelAt.set(match[1], index);
  });
  const callTargets = new Set();
  lines.forEach((line) => {
    for (const match of stripComment(line).matchAll(/\bgosub\s+([A-Za-z_.]\w*)/g)) callTargets.add(match[1]);
  });
  const isEntry = (label) => callTargets.has(label) || EVENT_LABEL.test(label) || /_reloc_entry$/.test(label) ||
    label === 'main' || label === 'commongamelogic' || label === 'commongamelogicdraw' || label === 'fullgameloop';
  const entryLines = [...labelAt].filter(([label]) => isEntry(label)).map(([, index]) => index).sort((a, b) => a - b);
  const regionEnd = (start) => entryLines.find((index) => index > start) ?? lines.length;

  const handover = new Set(HANDOVER_LABELS);
  labelAt.forEach((index, label) => {
    const event = /^(.+)_begin$/.exec(label);
    if (event && EVENT_LABEL.test(label) && !TITLE_EVENTS.includes(event[1])) handover.add(label);
  });
  const mainLine = labelAt.get('main');
  if (mainLine === undefined) return {names: new Set(), initValues: new Map()};
  // The lines reachable from some starting ranges, never following a jump into a label in `blocked`.
  const reach = (ranges, blocked) => {
    const reached = new Array(lines.length).fill(false);
    const queue = [];
    const addRegion = (start, end) => {
      if (start >= end || reached[start]) return;
      for (let i = start; i < end; i++) reached[i] = true;
      queue.push([start, end]);
    };
    ranges.forEach(([start, end]) => addRegion(start, end));
    while (queue.length) {
      const [start, end] = queue.pop();
      for (let i = start; i < end; i++) {
        for (const match of stripComment(lines[i]).matchAll(JUMP)) {
          const target = match[1];
          if (blocked.has(target) || !labelAt.has(target)) continue;
          const targetLine = labelAt.get(target);
          addRegion(targetLine, regionEnd(targetLine));
        }
      }
    }
    return reached;
  };
  const eventRange = (event) => {
    const start = labelAt.get(`${event}_begin`);
    const end = labelAt.get(`${event}_end`);
    return start !== undefined && end !== undefined ? [[start, end + 1]] : [];
  };
  // What runs every frame of the title loop (Title screen update and the first half of commongamelogic), and what runs once
  // as the title screen starts (start-up code, System start, Title screen start).
  const everyFrame = reach([...eventRange('title_update'), ...(labelAt.has('commongamelogic') && labelAt.has('commongamelogicdraw') ?
    [[labelAt.get('commongamelogic'), labelAt.get('commongamelogicdraw')]] : [])], handover);
  const onceBlocked = new Set([...handover, 'title_update_begin']);
  const atStart = reach([[0, mainLine], ...eventRange('system_start'), ...eventRange('title_start')], onceBlocked);
  const live = lines.map((line, index) => everyFrame[index] || atStart[index]);

  // The lines before the first event that give a variable its starting value are replayed when gameplay starts.
  const firstEvent = lines.findIndex((line) => /^system_start_begin\s*$/.test(line));
  const initValues = new Map();
  const wordsOf = (line) => stripComment(line).match(WORD) || [];
  const liveWords = new Set();
  const otherWords = new Set();
  const zeroedAtStart = new Set();
  lines.forEach((line, index) => {
    if (/^\s*(?:rem|dim)\b/.test(line)) return;
    const init = index < firstEvent ? INIT_CONSTANT.exec(line) : null;
    if (init && live[index]) {
      initValues.set(init[1], init[2]);
      return;
    }
    // Setting a variable to 0 as the title screen starts leaves what zeroing it as gameplay starts does.
    const zeroed = live[index] && !everyFrame[index] && /^\s*([A-Za-z_]\w*)\s*=\s*0\s*$/.exec(stripComment(line));
    if (zeroed) {
      zeroedAtStart.add(zeroed[1]);
      return;
    }
    // COLUBK = backgroundrealcolor and the like only copy the starting value to a register.
    if (index < firstEvent && /^\s*COLU\w+\s*=\s*\w+\s*$/.test(line)) return;
    wordsOf(line).forEach((word) => (live[index] ? liveWords : otherWords).add(word));
  });
  KERNEL_VARIABLES.forEach((name) => liveWords.add(name));
  // A variable the shared code outside the events sets (a background's loader sets its colors, an animation its frame) holds
  // state that outlives the title screen, and the starting value cannot bring it back.
  let inEvent = false;
  lines.forEach((line, index) => {
    const label = /^([A-Za-z_]\w*)\s*$/.exec(line);
    if (label && EVENT_LABEL.test(label[1])) inEvent = label[1].endsWith('_begin');
    if (inEvent || index < firstEvent || live[index]) return;
    const assigned = /^\s*([A-Za-z_]\w*)\s*(?:\{\d+\})?\s*=[^=]/.exec(stripComment(line));
    if (assigned) liveWords.add(assigned[1]);
  });
  const names = new Set([...otherWords, ...zeroedAtStart].filter((word) => !liveWords.has(word)));
  return {names, initValues};
};
