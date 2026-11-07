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
  let blockId = 0;
  let blockIsAsm = false;
  // (The templates the code comes from may have Windows line ends.)
  return code.split(/\r?\n/).map((line) => {
    const text = line.trim();
    if (inBlock) {
      if (text === 'end') inBlock = false;
      return {line, kind: 'block', asm: blockIsAsm, block: blockId};
    }
    if (text === '' || /^rem\b/.test(text) || /^dim\s/.test(text) || text.startsWith(';')) return {line, kind: 'ignored'};
    if (/^(asm|data\s|function\s)/.test(text) || (/:$/.test(text) && !/^if\b/.test(text))) {
      inBlock = true;
      blockId++;
      blockIsAsm = /^asm\b/.test(text);
      return {line, kind: 'block', asm: blockIsAsm, block: blockId};
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
  parsedEntries = classifyLines(code).map(({line, kind, asm, block}) => ({line, kind, asm, block, shape: kind === 'statement' ? shapeOf(line) : null,
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
  // (Statements after an else, or after the then of an if, are part of it: a colon is allowed there only.)
  const thenAt = line.search(/\s+then\s+/);
  // (After an else, or after the then of an if: the statements that go with it.)
  if (line.includes(' : ') && !(/^\s*if\s/.test(line) && thenAt !== -1 && line.indexOf(' : ') > thenAt)) return null;
  const indent = /^\s*/.exec(line)[0];
  const body = line.trim();
  const conditional = /^if\s+(.+?)\s+then\s+(.+)$/.exec(body);
  if (conditional) {
    const [, cond, rest] = conditional;
    if (/\bthen\b/.test(cond)) return null;
    const split = rest.search(/\s+else\s+/);
    const thenText = split === -1 ? rest : rest.slice(0, split);
    const elseText = split === -1 ? null : rest.slice(split).replace(/^\s+else\s+/, '');
    const trueParts = thenText.split(' : ').map(parseSimple);
    const whenTrue = trueParts[0];
    const thenMore = trueParts.slice(1);
    const whenFalse = elseText === null ? null : elseText.split(' : ').map(parseSimple);
    if (!whenTrue || thenMore.some((simple) => !simple) || (whenFalse && whenFalse.some((simple) => !simple))) return null;
    if (whenTrue.type === 'jump' && !whenFalse && !thenMore.length) return {type: 'if', indent, cond, jump: whenTrue.text};
    // (A jump is the last statement: the ones after it would not run.)
    if ((whenTrue.type === 'jump' && thenMore.length) || thenMore.slice(0, -1).some((simple) => simple.type === 'jump')) return null;
    return {type: 'ifthen', indent, cond, whenTrue, thenMore, whenFalse};
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
    return [shape.cond, ...[shape.whenTrue, ...(shape.thenMore || []), ...(shape.whenFalse || [])].map((simple) => (simple.type === 'set' ? simple.rhs : ''))];
  }
  return shape.type === 'set' ? [shape.rhs] : [];
};
const writtenNames = (shape) => {
  const simples = shape.type === 'ifthen' ? [shape.whenTrue, ...(shape.thenMore || []), ...(shape.whenFalse || [])] : [shape];
  return simples.filter((simple) => simple && (simple.type === 'set' || simple.type === 'setbit')).map((simple) => simple.target);
};

// A name that is only loaded (lda, ldx or ldy NAME) or stored (sta, stx or sty NAME) in an assembly block can be spilled too: a load sets the pointer of the
// data fetcher with the register it loads (the others are not touched) and reads it, a store writes it there with the accumulator and the flags kept. Not in a block that is timed (it writes the TIA, or waits for a line), that uses the same data
// fetcher itself, or where a branch could be pushed out of its reach by the lines added (a branch reaches 127 bytes, a spilled access is about 28).
const ASM_ACCESS = /^\s*(lda|ldx|ldy|sta|stx|sty)\s+([A-Za-z_]\w*)\s*(;.*)?$/;
const ASM_TIMED = /\b(WSYNC|RESP[01MB]|RESM[01]|RESBL|HMOVE|HMCLR|HMP[01]|HMM[01]|HMBL|VSYNC|VBLANK|TIM64T|TIM8T|INTIM|DF6\w*)\b/;
const ASM_IMPLIED = new Set(['rts', 'rti', 'pha', 'pla', 'php', 'plp', 'tax', 'txa', 'tay', 'tya', 'tsx', 'txs', 'inx', 'iny', 'dex', 'dey', 'asl', 'lsr', 'rol',
  'ror', 'clc', 'sec', 'cli', 'sei', 'cld', 'sed', 'clv', 'nop', 'brk', 'end']);
const ASM_BRANCH = /^(bcc|bcs|beq|bne|bmi|bpl|bvc|bvs)\s+([.@]?[A-Za-z_]\w*)/i;
const SPILL_ACCESS_BYTES = 28;
// A load or store of one of the names that may be spilled (only those get the lines added).
const accessOf = (text, names) => {
  const access = ASM_ACCESS.exec(text);
  return access && names.includes(access[2]) ? access : null;
};
const asmLabelOf = (text) => {
  const m = /^[.@]?([A-Za-z_]\w*):?$/.exec(text);
  return m && !ASM_IMPLIED.has(m[1].toLowerCase()) ? m[1] : null;
};
const asmBytesOf = (text) => {
  if (!text || text.startsWith(';')) return 0;
  const word = text.split(/\s+/)[0].toLowerCase();
  if (asmLabelOf(text)) return 0;
  if (ASM_IMPLIED.has(word)) return 1;
  if (ASM_BRANCH.test(text)) return 2;
  if (word === '.byte') return text.split(',').length;
  if (word === 'jmp' || word === 'jsr') return 3;
  return /^\S+\s+#/.test(text) ? 2 : 3;
};
// For each asm block: whether it can be rewritten, and which of its lines are out of the reach of a branch with the lines a spill adds.
const asmBlocks = (entries, names) => {
  const blocks = new Map();
  entries.forEach((entry, i) => {
    if (entry.kind !== 'block' || !entry.asm) return;
    if (!blocks.has(entry.block)) blocks.set(entry.block, {lines: [], timed: false, tight: new Set()});
    const block = blocks.get(entry.block);
    block.lines.push(i);
    if (ASM_TIMED.test(entry.line.replace(/;.*$/, ''))) block.timed = true;
  });
  blocks.forEach((block) => {
    const texts = block.lines.map((i) => entries[i].line.replace(/;.*$/, '').trim());
    const labelAt = new Map();
    texts.forEach((text, k) => {
      const label = asmLabelOf(text);
      if (label) labelAt.set(label, k);
    });
    texts.forEach((text, k) => {
      const branch = ASM_BRANCH.exec(text);
      if (!branch || !labelAt.has(branch[2].replace(/^[.@]/, ''))) return;
      const target = labelAt.get(branch[2].replace(/^[.@]/, ''));
      const [from, to] = k < target ? [k, target] : [target, k];
      let bytes = 0;
      for (let j = from; j <= to; j++) bytes += asmBytesOf(texts[j]) + (accessOf(texts[j], names) ? SPILL_ACCESS_BYTES : 0);
      if (bytes > 110) for (let j = from; j <= to; j++) block.tight.add(block.lines[j]);
    });
  });
  return blocks;
};

// A plain "tempN = expression" (N of a scratch byte) whose expression does not read the other scratch byte or itself: a name in the expression can be
// read into that byte, since the statement overwrites it.
const selfScratch = (shape) => !!shape && shape.type === 'set' && SCRATCH.includes(shape.target) &&
  !SCRATCH.some((scratch) => wordRegex(scratch, '').test(shape.rhs));

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
  const blocks = asmBlocks(lines, names);
  lines.forEach(({line, kind, shape, words, asm, block}, i) => {
    if (kind === 'ignored') return;
    names.filter((name) => words.has(name)).forEach((name) => {
      if (!wordRegex(name, '').test(line) && !arrayRegex(name).test(line)) return;
      const entry = usage.get(name);
      const fail = (why) => {
        entry.ok = false;
        if (entry.why.length < 3) entry.why.push(`${why}: ${line.trim().slice(0, 60)}`);
      };
      if (kind === 'block' && asm && !arrayRegex(name).test(line)) {
        const access = ASM_ACCESS.exec(line);
        const info = blocks.get(block);
        if (!access || access[2] !== name) return fail('block');
        if (info.timed) return fail('timed block');
        if (info.tight.has(i)) return fail('branch range');
        entry.uses++;
        return;
      }
      if (kind === 'block' || arrayRegex(name).test(line)) return fail(kind);
      entry.uses++;
      if (!shape) return fail('shape');
      const writes = writtenNames(shape).includes(name);
      const reads = readTexts(shape).some((text) => wordRegex(name, '').test(text));
      // Next to a line that keeps something in the bytes the rewritten line leaves its values in. (Not a plain statement that sets one of those
      // bytes itself from the name and no other scratch byte: the name is read into that byte, which the statement sets anyway.)
      if (reads && !selfScratch(shape) && (near(lines5, i, true) || near(lines6, i, true))) fail('scratch');
      else if (writes && near(lines6, i, false)) fail('scratch');
    });
  });
  return usage;
};

// How many of the chosen names each statement reads: at most the scratch bytes there are.
const readsOk = (code, chosen) => entriesOf(code).every(({kind, shape, words}) => {
  if (kind !== 'statement' || !shape) return true;
  const here = chosen.filter((name) => words.has(name));
  if (selfScratch(shape) && here.filter((name) => wordRegex(name, '').test(shape.rhs)).length > 1) return false;
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
  const readsIn = (text, indent, preferred = null) => {
    const pre = [];
    let replaced = text;
    // (A statement that sets a scratch byte is read into that one.)
    const order = preferred ? [preferred, ...SCRATCH.filter((scratch) => scratch !== preferred)] : SCRATCH;
    names.filter((name) => wordRegex(name, '').test(text)).forEach((name, index) => {
      pre.push(`${indent}asm`, ...pointerLines(indent, slots.get(name)), `${indent}lda DF6DATA`, `${indent}sta ${order[index]}`, 'end');
      replaced = replaced.replace(wordRegex(name), order[index]);
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
    const {pre, text} = readsIn(simple.rhs, indent, selfScratch(simple) ? simple.target : null);
    if (!slots.has(simple.target)) return [...pre, `${indent}${simple.target} = ${text}`];
    return [...pre, `${indent}${WRITE_SCRATCH} = ${text}`, `${indent}asm`, ...pointerLines(indent, slots.get(simple.target)),
      `${indent}lda ${WRITE_SCRATCH}`, `${indent}sta DF6WRITE`, 'end'];
  };
  const entries = entriesOf(code);
  const spilledIn = (text) => names.filter((name) => wordRegex(name, '').test(text));
  // A label that only the jumps of tests reach, each with the same bytes holding the same names, and that the line before it does not
  // run into (a goto), is entered with those bytes still holding them: the test that follows it need not read them again (the frame checks
  // of an animation, one after another, test the same counter). The words of the code are counted for that, to know every jump to a label.
  const wordCounts = new Map();
  entries.forEach(({line, kind}) => {
    if (kind === 'ignored') return;
    (line.match(WORD) || []).forEach((word) => wordCounts.set(word, (wordCounts.get(word) || 0) + 1));
  });
  const carried = new Map();
  const labelOf = (entry) => (entry.kind === 'statement' && !entry.shape && /^[A-Za-z_]\w*$/.test(entry.line.trim()) ? entry.line.trim() : null);
  let held = null;
  let previous = null;
  // A line that tests variables in the display memory and jumps away (or on) leaves the bytes it read where they are, so the tests that
  // follow it one after another (a long chain of "if x = 3 then goto ...", as the fades make) read each variable once, not for every line.
  const isTest = (entry) => entry.shape && entry.shape.type === 'if' && spilledIn(entry.shape.cond).length > 0;
  for (let at = 0; at < entries.length; at++) {
    const {line, shape, words} = entries[at];
    if (entries[at].kind === 'ignored') {
      out.push(line);
      continue;
    }
    if (entries[at].kind === 'block' && entries[at].asm) {
      const access = ASM_ACCESS.exec(line);
      if (access && slots.has(access[2])) {
        const indent = /^\s*/.exec(line)[0];
        // A load: the pointer is put where the name is and the value read (the accumulator is the destination anyway). A store: the
        // accumulator and the flags are kept on the stack while the pointer is set, and the flags come back after the write.
        const op = access[1].toLowerCase();
        const slot = slots.get(access[2]);
        if (op === 'lda') {
          out.push(...pointerLines(indent, slot), `${indent}lda DF6DATA`);
        } else if (op === 'ldx' || op === 'ldy') {
          // (The register that is loaded sets the pointer: A, the other register and the carry are as they were.)
          const r = op.slice(2);
          const address = `${TABLES[slot.area]}+${128 + slot.byte}`;
          const loadLines = [`${indent}ld${r} #<(${address})`, `${indent}st${r} DF6LOW`, `${indent}ld${r} #(>(${address})) & $0F`, `${indent}st${r} DF6HI`];
          out.push(...loadLines, `${indent}ld${r} DF6DATA`);
        } else if (op === 'sta') {
          out.push(`${indent}php`, `${indent}pha`, ...pointerLines(indent, slot), `${indent}pla`, `${indent}sta DF6WRITE`, `${indent}plp`);
        } else {
          // (stx and sty: the register is not touched by the pointer lines, which use A, kept on the stack with the flags.)
          out.push(`${indent}php`, `${indent}pha`, ...pointerLines(indent, slot), `${indent}${op} DF6WRITE`, `${indent}pla`, `${indent}plp`);
        }

        held = null;
        previous = entries[at];
        continue;
      }
    }
    const label = labelOf(entries[at]);
    const reached = held;
    held = null;
    if (label) {
      const mine = carried.get(label);
      const lastJump = previous && previous.shape && previous.shape.type === 'jump' && /^goto\b/.test(previous.shape.text);
      if (mine && mine.where && lastJump && wordCounts.get(label) === mine.count + 1) held = mine.where;
    }
    previous = entries[at];
    if (label || !shape || !names.some((name) => words.has(name) && wordRegex(name, '').test(line))) {
      out.push(line);
      if (!label) held = null;
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
      // (Arriving from a test that read them already, the bytes hold the names still.)
      const reuse = reached && [...union].every((name) => reached.has(name));
      const where = reuse ? new Map(reached) : new Map([...union].map((name, index) => [name, SCRATCH[index]]));
      if (!reuse) {
        [...union].forEach((name) => out.push(`${shape.indent}asm`, ...pointerLines(shape.indent, slots.get(name)),
            `${shape.indent}lda DF6DATA`, `${shape.indent}sta ${where.get(name)}`, 'end'));
      }
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
        const jumpTo = /^goto\s+([A-Za-z_]\w*)(\s+bank\d+)?$/.exec(entry.shape.jump);
        if (jumpTo && !jumpTo[2]) {
          const key = JSON.stringify([...where]);
          const mine = carried.get(jumpTo[1]);
          if (!mine) carried.set(jumpTo[1], {where, key, count: 1});
          else if (mine.key === key) mine.count++;
          else mine.where = null;
        }
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
      const trueLines = [...simpleLines(shape.whenTrue, shape.indent), ...(shape.thenMore || []).flatMap((simple) => simpleLines(simple, shape.indent))];
      out.push(`${shape.indent}goto _spl_${id}_e`, `_spl_${id}_a`, ...trueLines, `_spl_${id}_e`);
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

// Two reads of the display memory one after the other, the second of the byte after the first: reading a byte moves the data fetcher on by one, so the pointer
// is where the second read wants it and its four lines that set it are left out (12 cycles and 10 bytes each). Only a read right after a read: a label between
// them (somewhere a jump can come in), a statement, or anything else on the way leaves the pointer to be set. Variables the project reads together are best
// kept in neighbouring bytes (the dev variables of a feature are made one after the other, so they usually are).
const READ_START = /^\s*asm\s*$/;
const READ_ADDRESS = /^\s*lda #<\((\w+)\+(\d+)\)\s*$/;
const READ_BLOCK = [READ_START, READ_ADDRESS, /^\s*sta DF6LOW\s*$/, /^\s*lda #\(>\((\w+)\+(\d+)\)\) & \$0F\s*$/, /^\s*sta DF6HI\s*$/, /^\s*lda DF6DATA\s*$/,
  /^\s*sta \w+\s*$/, /^\s*end\s*$/];
// The table and byte a read block at line `at` reads, or null when it is not one.
const readBlockAt = (lines, at) => {
  if (at + READ_BLOCK.length > lines.length) return null;
  const parts = READ_BLOCK.map((pattern, k) => pattern.exec(lines[at + k]));
  if (parts.some((part) => !part)) return null;
  const [, table, offset] = parts[1];
  if (parts[3][1] !== table || parts[3][2] !== offset) return null;
  return {table, offset: Number(offset)};
};
export const mergeAdjacentReads = (code) => {
  const lines = code.split(/\r?\n/);
  const drop = new Set();
  let previous = null;
  for (let at = 0; at < lines.length; at++) {
    if (lines[at].trim() === '') continue;
    const block = readBlockAt(lines, at);
    if (!block) {
      previous = null;
      continue;
    }
    // (Not over a page: the high byte of the pointer would change, and the last byte of a table is the byte before the next one's.)
    if (previous && previous.table === block.table && block.offset === previous.offset + 1 && previous.offset < 255) {
      [1, 2, 3, 4].forEach((k) => drop.add(at + k));
    }
    previous = block;
    at += READ_BLOCK.length - 1;
  }
  return drop.size ? lines.filter((line, i) => !drop.has(i)).join('\n') : code;
};
