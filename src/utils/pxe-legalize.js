'use strict';

// The PXE kernel runs the program on a software 6502 that lacks some official instructions (it has no CPX, CPY, INY, DEY, TYA, PHP, PLP
// and not most of the ,Y addressing forms). This rewrites the assembly inside asm...end blocks of the generated code
// with instructions it has, keeping the registers and flags the original would have left:
//
//   iny / dey / tya    -> through a scratch byte (INC, DEC and LDY of it, STY and LDA)
//   lda/cmp/adc/... a,y -> the index goes through X (X and A are put back)
//   cpx / cpy          -> a CMP of A with the register moved in (A is put back; the flags that survive are described below)
//   asl / lsr / rol / ror of memory -> the same shift done in A
//
// LDA, to restore A or X, sets the N and Z flags, so after a CPX or CPY only the carry survives. The code after a compare is a branch,
// so a BCC or BCS stays as it is, and the others (BEQ, BNE, BMI, BPL) are moved inside the sequence, before A is put back.

export const PXE_SCRATCH_NAMES = ['pxeA', 'pxeX', 'pxeT'];

const ALU_OPS = ['cmp', 'adc', 'sbc', 'and', 'ora', 'eor'];
const SHIFT_OPS = ['asl', 'lsr', 'rol', 'ror'];
const BRANCHES_ON_C = ['bcc', 'bcs'];
const BRANCHES_ON_NZ = ['beq', 'bne', 'bmi', 'bpl'];

const parseLine = (line) => {
  const noComment = line.replace(/;.*$/, '');
  const match = noComment.match(/^(\s*)([A-Za-z]{3})\b\s*(.*?)\s*$/);
  if (!match) return null;
  return {indent: match[1], op: match[2].toLowerCase(), operand: match[3]};
};

// The scratch byte names: {a: saves A, x: saves X, t: holds Y or a value}.
const sequences = (scratch) => {
  const {a, x, t} = scratch;
  return {
    // (Y goes through t into X, so the original X waits in x.)
    loadIndexed: (operand) => [`stx ${x}`, `sty ${t}`, `ldx ${t}`, `lda ${operand},x`, `ldx ${x}`, 'ora #0'],
    aluIndexed: (op, operand) => [`sta ${a}`, `stx ${x}`, `sty ${t}`, `ldx ${t}`, `lda ${operand},x`, `sta ${t}`, `ldx ${x}`, `lda ${a}`,
      `${op} ${t}`],
    // (TYA sets the same N and Z flags as the load.)
    tya: () => [`sty ${t}`, `lda ${t}`],
    incY: () => [`sty ${t}`, `inc ${t}`, `ldy ${t}`],
    decY: () => [`sty ${t}`, `dec ${t}`, `ldy ${t}`],
    // LDY of an address indexed by X: through A, which is put back.
    loadYIndexedX: (operand) => [`sta ${a}`, `lda ${operand}`, 'tay', `lda ${a}`],
    // LDX of an address indexed by Y: the index goes through X.
    loadXIndexed: (operand) => [`sta ${a}`, `sty ${t}`, `ldx ${t}`, `lda ${operand},x`, 'tax', `lda ${a}`],
    // STA of an address indexed by Y.
    storeIndexed: (operand) => [`stx ${x}`, `sty ${t}`, `ldx ${t}`, `sta ${operand},x`, `ldx ${x}`],
    // A shift or rotate of memory: through A (put back after; N and Z then describe A, the carry is the shift's).
    shiftMemory: (op, operand) => [`sta ${a}`, `lda ${operand}`, op, `sta ${operand}`, `lda ${a}`],
    // (There is no TYA either.)
    compare: (register, operand) => [`sta ${a}`, ...(register === 'x' ? ['txa'] : [`sty ${t}`, `lda ${t}`]), `cmp ${operand}`],
  };
};

/**
 * @param {string} code The generated batari Basic code, or (wholeFile) the assembly the compiler makes of it.
 * @param {{a: string, x: string, t: string}} scratch The names of three RAM bytes the replacements use.
 * @param {boolean=} wholeFile Every line is code, and may start with a label.
 * @return {string} The code with its asm blocks rewritten.
 */
export const legalizeForPxe = (code, scratch, wholeFile = false) => {
  const seq = sequences(scratch);
  const lines = code.split('\n');
  const out = [];
  let inAsm = wholeFile;
  let counter = 0;
  const emit = (indent, list) => list.forEach((text) => out.push(`${indent}${text}`));
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (!inAsm) {
      // (A label may come before it, on the same line.)
      if (/(^|\s)asm$/.test(trimmed)) inAsm = true;
      out.push(line);
      continue;
    }
    if (trimmed === 'end') {
      inAsm = false;
      out.push(line);
      continue;
    }
    const parsed = parseLine(line, wholeFile);
    if (!parsed) {
      out.push(line);
      continue;
    }
    const {label, indent, op, operand} = parsed;
    const before = out.length;
    if (label) out.push(label);
    const indexedY = operand.match(/^(.+),\s*[yY]$/);
    if (op === 'tya') {
      emit(indent, seq.tya());
    } else if (op === 'iny') {
      emit(indent, seq.incY());
    } else if (op === 'dey') {
      emit(indent, seq.decY());
    } else if (op === 'lda' && indexedY && !operand.startsWith('(')) {
      emit(indent, seq.loadIndexed(indexedY[1]));
    } else if (ALU_OPS.includes(op) && indexedY && !operand.startsWith('(')) {
      emit(indent, seq.aluIndexed(op, indexedY[1]));
    } else if (op === 'sta' && indexedY && !operand.startsWith('(')) {
      emit(indent, seq.storeIndexed(indexedY[1]));
    } else if (op === 'ldx' && indexedY && !operand.startsWith('(')) {
      emit(indent, seq.loadXIndexed(indexedY[1]));
    } else if (op === 'ldy' && /^.+,\s*[xX]$/.test(operand) && !operand.startsWith('(')) {
      emit(indent, seq.loadYIndexedX(operand));
    } else if (SHIFT_OPS.includes(op) && operand && !/^a$/i.test(operand)) {
      emit(indent, seq.shiftMemory(op, operand));
    } else if (op === 'cpx' || op === 'cpy') {
      const register = op === 'cpx' ? 'x' : 'y';
      // The branch that follows (blank lines and comments skipped).
      let next = i + 1;
      while (next < lines.length && lines[next].replace(/;.*$/, '').trim() === '') next++;
      const branch = next < lines.length ? parseLine(lines[next], wholeFile) : null;
      if (!branch || !(BRANCHES_ON_C.includes(branch.op) || BRANCHES_ON_NZ.includes(branch.op))) {
        throw new Error(`PXE: ${op} ${operand} is not followed by a branch on the compare (${lines[next] || 'end of code'}).`);
      }
      emit(indent, seq.compare(register, operand));
      if (BRANCHES_ON_C.includes(branch.op)) {
        emit(indent, [`lda ${scratch.a}`]);
      } else {
        const id = `.pxeCmp${++counter}`;
        emit(indent, [`${branch.op} ${id}take`, `lda ${scratch.a}`, `jmp ${id}end`]);
        out.push(`${id}take`);
        emit(indent, [`lda ${scratch.a}`, `jmp ${branch.operand}`]);
        out.push(`${id}end`);
        i = next;
      }
    } else {
      out.length = before;
      out.push(line);
    }
  }
  return out.join('\n');
};
