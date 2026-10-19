'use strict';

// Variables kept in the DPC+ display memory instead of the program's RAM (see displayRamVars in init() in generators/bbasic.js).
// The generated batari Basic names a variable in plain places only (a line that sets one or a bit of one, an if that tests them and
// jumps or does one simple statement), so a variable that is only ever used there can live in the display memory: a read is done into a
// scratch byte just before its line, a write goes through the same data fetcher just after. A variable used any other way (inside asm,
// in an array form, in a line of several statements, ...) is left where it is.

const TABLES = ['PF1L', 'PF2L', 'PF1R', 'PF2R', 'PFCOLS', 'BKCOLS'];
// The two bytes a read leaves its value in. The lines between the read and the line that uses it are only that line, so nothing else is
// using them then.
const SCRATCH = ['temp5', 'temp6'];
// The byte a write takes its value from (a bit set goes through it as well).
const WRITE_SCRATCH = 'temp6';

const escapeName = (name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// A name as a whole word (a bit of it, name{3}, counts as a use of it; an array form, name[2], is another thing).
// (The ones to test with are made once per name: the code has thousands of lines and tens of names.)
const testers = new Map();
const wordRegex = (name, flags = 'g') => {
  if (flags !== '') return new RegExp(`(?<![\\w{])${escapeName(name)}(?![\\w\\[])`, flags);
  if (!testers.has(name)) testers.set(name, new RegExp(`(?<![\\w{])${escapeName(name)}(?![\\w\\[])`));
  return testers.get(name);
};
const arrayTesters = new Map();
const arrayRegex = (name) => {
  if (!arrayTesters.has(name)) arrayTesters.set(name, new RegExp(`(?<![\\w])${escapeName(name)}\\[`));
  return arrayTesters.get(name);
};
const WORD = /[A-Za-z_]\w*/g;

const ASSIGNMENT = /^([A-Za-z_]\w*)\s*=\s*(.*)$/;
// A bit set or cleared by a constant: the byte is read, the bit changed in the copy, and the byte written back.
const BIT_ASSIGNMENT = /^([A-Za-z_]\w*)\{(\d)\}\s*=\s*([01])$/;
const JUMP = /^(goto|gosub)\s+[A-Za-z_]\w*(\s+bank\d+)?$/;

// What each line of the code is: inside an asm, data or function block (left alone), a comment or definition (ignored), or a statement.
const classifyLines = (code) => {
  let inBlock = false;
  // (The templates the code comes from may have Windows line ends.)
  return code.split(/\r?\n/).map((line) => {
    const text = line.trim();
    if (inBlock) {
      if (text === 'end') inBlock = false;
      return {line, kind: 'block'};
    }
    if (text === '' || /^rem\b/.test(text) || /^dim\s/.test(text) || text.startsWith(';')) return {line, kind: 'ignored'};
    if (/^(asm|data\s|function\s)/.test(text) || (/:$/.test(text) && !/^if\b/.test(text))) {
      inBlock = true;
      return {line, kind: 'block'};
    }
    return {line, kind: 'statement'};
  });
};

// The lines of the code, what each is, its statement, and the words in it: kept for the last code looked at, since the choice of the
// variables to spill asks about the same code again and again.
let parsedCode = null;
let parsedEntries = null;
const entriesOf = (code) => {
  if (parsedCode === code) return parsedEntries;
  parsedEntries = classifyLines(code).map(({line, kind}) => ({line, kind, shape: kind === 'statement' ? shapeOf(line) : null,
    words: new Set(line.match(WORD) || [])}));
  parsedCode = code;
  return parsedEntries;
};

// One plain statement: a jump, a bit set by a constant, or an assignment.
const parseSimple = (text) => {
  const body = text.trim();
  if (JUMP.test(body)) return {type: 'jump', text: body};
  const bit = BIT_ASSIGNMENT.exec(body);
  if (bit) return {type: 'setbit', target: bit[1], bit: bit[2], value: bit[3]};
  const assignment = ASSIGNMENT.exec(body);
  if (assignment && !/\bthen\b/.test(body)) return {type: 'set', target: assignment[1], rhs: assignment[2]};
  return null;
};

// A line of the code as a statement, or null when it is not in a shape that can be rewritten: the plain statements, and an if that
// jumps or does one plain statement (and another after else).
const shapeOf = (line) => {
  // (Statements after an else are part of it: a colon is allowed there only.)
  const elseAt = line.search(/\s+else\s+/);
  if (line.includes(' : ') && !(elseAt !== -1 && line.indexOf(' : ') > elseAt && /^\s*if\s/.test(line))) return null;
  const indent = /^\s*/.exec(line)[0];
  const body = line.trim();
  const conditional = /^if\s+(.+?)\s+then\s+(.+)$/.exec(body);
  if (conditional) {
    const [, cond, rest] = conditional;
    if (/\bthen\b/.test(cond)) return null;
    const split = rest.search(/\s+else\s+/);
    const thenText = split === -1 ? rest : rest.slice(0, split);
    const elseText = split === -1 ? null : rest.slice(split).replace(/^\s+else\s+/, '');
    const whenTrue = parseSimple(thenText);
    const whenFalse = elseText === null ? null : elseText.split(' : ').map(parseSimple);
    if (!whenTrue || (whenFalse && whenFalse.some((simple) => !simple))) return null;
    if (whenTrue.type === 'jump' && !whenFalse) return {type: 'if', indent, cond, jump: whenTrue.text};
    return {type: 'ifthen', indent, cond, whenTrue, whenFalse};
  }
  if (/\bthen\b/.test(body)) return null;
  const simple = parseSimple(body);
  return simple ? {...simple, indent} : null;
};

// The texts of a statement a name is read in (each is evaluated by itself, so the names read in each are counted separately), and
// the names it writes.
const readTexts = (shape) => {
  if (shape.type === 'if') return [shape.cond];
  if (shape.type === 'ifthen') {
    return [shape.cond, ...[shape.whenTrue, ...(shape.whenFalse || [])].map((simple) => (simple.type === 'set' ? simple.rhs : ''))];
  }
  return shape.type === 'set' ? [shape.rhs] : [];
};
const writtenNames = (shape) => {
  const simples = shape.type === 'ifthen' ? [shape.whenTrue, ...(shape.whenFalse || [])] : [shape];
  return simples.filter((simple) => simple && (simple.type === 'set' || simple.type === 'setbit')).map((simple) => simple.target);
};

// Which of the names can be spilled, and how many lines each is used in.
const analyze = (code, names) => {
  const lines = entriesOf(code);
  const usage = new Map(names.map((name) => [name, {uses: 0, ok: true, why: []}]));
  const lines5 = new Set();
  const lines6 = new Set();
  lines.forEach(({kind, words}, i) => {
    if (kind !== 'statement') return;
    if (words.has('temp5')) lines5.add(i);
    if (words.has('temp6')) lines6.add(i);
  });
  const near = (list, i, includeSame) => [i - 1, i + 1, ...(includeSame ? [i] : [])].some((j) => list.has(j));
  lines.forEach(({line, kind, shape, words}, i) => {
    if (kind === 'ignored') return;
    names.filter((name) => words.has(name)).forEach((name) => {
      if (!wordRegex(name, '').test(line) && !arrayRegex(name).test(line)) return;
      const entry = usage.get(name);
      const fail = (why) => {
        entry.ok = false;
        if (entry.why.length < 3) entry.why.push(`${why}: ${line.trim().slice(0, 60)}`);
      };
      if (kind === 'block' || arrayRegex(name).test(line)) return fail(kind);
      entry.uses++;
      if (!shape) return fail('shape');
      const writes = writtenNames(shape).includes(name);
      const reads = readTexts(shape).some((text) => wordRegex(name, '').test(text));
      // Next to a line that keeps something in the bytes the rewritten line leaves its values in.
      if (reads && (near(lines5, i, true) || near(lines6, i, true))) fail('scratch');
      else if (writes && near(lines6, i, false)) fail('scratch');
    });
  });
  return usage;
};

// How many of the chosen names each statement reads: at most the scratch bytes there are.
const readsOk = (code, chosen) => entriesOf(code).every(({kind, shape, words}) => {
  if (kind !== 'statement' || !shape) return true;
  const here = chosen.filter((name) => words.has(name));
  if (here.length <= SCRATCH.length) return true;
  return readTexts(shape).every((text) => here.filter((name) => wordRegex(name, '').test(text)).length <= SCRATCH.length);
});

// Picks `count` of the names to spill: the ones used in the fewest places, among the ones that can be. Null when there are not enough
// (with `partial`, as many as there are, up to `count`). Every use of a spilled name costs about a dozen bytes of code and as many
// cycles, so beyond the first `required` names only the ones that keep the total of their uses within `useBudget` are taken (counting
// only the `budgeted` names, when given).
export const chooseSpill = (code, names, count, partial = false, useBudget = Infinity, required = count, budgeted = null) => {
  if (count <= 0) return new Set();
  const usage = analyze(code, names);
  const candidates = names.filter((name) => usage.get(name).ok && usage.get(name).uses > 0)
      .sort((a, b) => usage.get(a).uses - usage.get(b).uses);
  const chosen = [];
  let uses = 0;
  for (const name of candidates) {
    if (chosen.length >= count) break;
    const counted = !budgeted || budgeted.has(name);
    if (counted && chosen.length >= required && uses + usage.get(name).uses > useBudget) continue;
    if (readsOk(code, [...chosen, name])) {
      chosen.push(name);
      if (counted) uses += usage.get(name).uses;
    }
  }
  return (partial || chosen.length >= count) ? new Set(chosen) : null;
};

// A number written out in the code (decimal, $hex or %binary): it can be loaded straight into the accumulator.
const LITERAL = /^(\d+|\$[0-9A-Fa-f]+|%[01]+)$/;
// Setting the pointer again after a read or a write moved it on by one byte: only the low byte changes, unless the byte was the last
// of the page (the carry went into the high byte).
const resetLines = (indent, slot) => {
  const address = `${TABLES[slot.area]}+${128 + slot.byte}`;
  return [`${indent}ldx #<(${address})`, `${indent}stx DF6LOW`,
    ...(slot.byte === 127 ? [`${indent}ldy #(>(${address})) & $0F`, `${indent}sty DF6HI`] : [])];
};

const pointerLines = (indent, {area, byte}) => {
  const address = `${TABLES[area]}+${128 + byte}`;
  return [`${indent}lda #<(${address})`, `${indent}sta DF6LOW`, `${indent}lda #(>(${address})) & $0F`, `${indent}sta DF6HI`];
};

// The code with the names in `slots` (name -> {area, byte}) read and written through the display memory.
export const applySpill = (code, slots) => {
  const names = [...slots.keys()];
  const out = [];
  let labelCount = 0;
  // The lines that bring the names `text` reads into the scratch bytes, and the text with them put in place of the names.
  const readsIn = (text, indent) => {
    const pre = [];
    let replaced = text;
    names.filter((name) => wordRegex(name, '').test(text)).forEach((name, index) => {
      pre.push(`${indent}asm`, ...pointerLines(indent, slots.get(name)), `${indent}lda DF6DATA`, `${indent}sta ${SCRATCH[index]}`, 'end');
      replaced = replaced.replace(wordRegex(name), SCRATCH[index]);
    });
    return {pre, text: replaced};
  };
  // The lines of one plain statement.
  const simpleLines = (simple, indent) => {
    if (simple.type === 'jump') return [`${indent}${simple.text}`];
    if (simple.type === 'setbit') {
      if (!slots.has(simple.target)) return [`${indent}${simple.target}{${simple.bit}} = ${simple.value}`];
      const mask = 1 << Number(simple.bit);
      return [`${indent}asm`, ...pointerLines(indent, slots.get(simple.target)), `${indent}lda DF6DATA`,
        simple.value === '1' ? `${indent}ora #${mask}` : `${indent}and #${255 - mask}`,
        ...resetLines(indent, slots.get(simple.target)), `${indent}sta DF6WRITE`, 'end'];
    }
    if (slots.has(simple.target) && LITERAL.test(simple.rhs.trim())) {
      return [`${indent}asm`, ...pointerLines(indent, slots.get(simple.target)), `${indent}lda #${simple.rhs.trim()}`, `${indent}sta DF6WRITE`, 'end'];
    }
    // name = name + 1 (or - 3, ...): one read and one write, the value kept in the accumulator in between.
    const step = slots.has(simple.target) ?
      new RegExp(`^${escapeName(simple.target)}\\s*([+-])\\s*(\\d+)$`).exec(simple.rhs.trim()) : null;
    if (step) {
      return [`${indent}asm`, ...pointerLines(indent, slots.get(simple.target)), `${indent}lda DF6DATA`,
        `${indent}${step[1] === '+' ? 'clc' : 'sec'}`, `${indent}${step[1] === '+' ? 'adc' : 'sbc'} #${step[2]}`,
        ...resetLines(indent, slots.get(simple.target)), `${indent}sta DF6WRITE`, 'end'];
    }
    const {pre, text} = readsIn(simple.rhs, indent);
    if (!slots.has(simple.target)) return [...pre, `${indent}${simple.target} = ${text}`];
    return [...pre, `${indent}${WRITE_SCRATCH} = ${text}`, `${indent}asm`, ...pointerLines(indent, slots.get(simple.target)),
      `${indent}lda ${WRITE_SCRATCH}`, `${indent}sta DF6WRITE`, 'end'];
  };
  const entries = entriesOf(code);
  const spilledIn = (text) => names.filter((name) => wordRegex(name, '').test(text));
  // A line that tests variables in the display memory and jumps away (or on) leaves the bytes it read where they are, so the tests that
  // follow it one after another (a long chain of "if x = 3 then goto ...", as the fades make) read each variable once, not for every line.
  const isTest = (entry) => entry.shape && entry.shape.type === 'if' && spilledIn(entry.shape.cond).length > 0;
  for (let at = 0; at < entries.length; at++) {
    const {line, shape, words} = entries[at];
    if (!shape || !names.some((name) => words.has(name) && wordRegex(name, '').test(line))) {
      out.push(line);
      continue;
    }
    if (isTest(entries[at])) {
      // The run of tests: lines that are only comments or blank are let through, anything else ends it (a goto leaves the bytes
      // valid for the next test; a gosub does not, so it is the last of a run).
      const run = [at];
      const union = new Set(spilledIn(shape.cond));
      let next = at + 1;
      while (!/^gosub\b/.test(entries[run[run.length - 1]].shape.jump)) {
        while (next < entries.length && entries[next].kind === 'ignored') next++;
        if (next >= entries.length || !isTest(entries[next])) break;
        const more = new Set([...union, ...spilledIn(entries[next].shape.cond)]);
        if (more.size > SCRATCH.length) break;
        more.forEach((name) => union.add(name));
        run.push(next);
        next++;
      }
      const where = new Map([...union].map((name, index) => [name, SCRATCH[index]]));
      [...union].forEach((name) => out.push(`${shape.indent}asm`, ...pointerLines(shape.indent, slots.get(name)),
          `${shape.indent}lda DF6DATA`, `${shape.indent}sta ${where.get(name)}`, 'end'));
      for (let k = at; k < next; k++) {
        const entry = entries[k];
        if (!run.includes(k)) {
          out.push(entry.line);
          continue;
        }
        let cond = entry.shape.cond;
        where.forEach((scratch, name) => {
          cond = cond.replace(wordRegex(name), scratch);
        });
        out.push(`${entry.shape.indent}if ${cond} then ${entry.shape.jump}`);
      }
      at = next - 1;
      continue;
    }
    if (shape.type === 'if') {
      const {pre, text} = readsIn(shape.cond, shape.indent);
      out.push(...pre, `${shape.indent}if ${text} then ${shape.jump}`);
    } else if (shape.type === 'ifthen') {
      const {pre, text} = readsIn(shape.cond, shape.indent);
      const id = labelCount++;
      out.push(...pre, `${shape.indent}if ${text} then goto _spl_${id}_a`);
      (shape.whenFalse || []).forEach((simple) => out.push(...simpleLines(simple, shape.indent)));
      out.push(`${shape.indent}goto _spl_${id}_e`, `_spl_${id}_a`, ...simpleLines(shape.whenTrue, shape.indent), `_spl_${id}_e`);
    } else {
      out.push(...simpleLines(shape, shape.indent));
    }
  }
  return out.join('\n');
};

// For looking at why a name cannot be spilled.
export const describeSpill = (code, names) => [...analyze(code, names)].map(([name, {uses, ok, why}]) => ({name, uses, ok, why}));

// The names that the code still uses, in a line that is not a comment or a definition.
export const remainingUses = (code, names) => {
  const lines = entriesOf(code).filter(({kind}) => kind !== 'ignored');
  return names.filter((name) => lines.some(({line, words}) => words.has(name) && (wordRegex(name, '').test(line) || arrayRegex(name).test(line))));
};
