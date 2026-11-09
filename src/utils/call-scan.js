// Reads the calls between pieces of generated bB and assembly code from their text.

// A call in the code: a gosub or goto to a name, a jump or call to its label in assembly, or the call of a function.
const CALL_PATTERN = /\b(?:gosub|goto|jsr|jmp)\s+\.?([A-Za-z_]\w*)|\b([A-Za-z_]\w*)\(/g;
// A conditional line of bB (the part before "then" runs whenever the line does).
const IF_PATTERN = /^\s*if\b(.*?)\bthen\b(.*)$/i;
// A label is a name on a line of its own, in the first column or marked with an "@" (the code of an event or a subroutine is indented, and the "@" keeps a line in the first column).
const LABEL_LINE = /^(?:\s*@\s*)?\.?([A-Za-z_]\w*):?\s*$/;
const NOT_LABELS = /^(?:end|return|asm|else|endif|next|loop|do|wend|drawscreen)$/i;
// A condition that holds only now and then: an input (the joystick, the console switches), a collision, a random number, or the block that runs something once or
// every few frames (the label of its code says which). A condition on a variable, such as the state of the game, can hold for as long as the game stays in that
// state, so the code under it is taken as run whenever the code that holds it is.
const RARE_CONDITION = /\b(?:joy[01]\w*|switch\w+|collision|rand)\b|_(?:run_once|frame_every_n)_/i;
// The names in known that a piece of code calls, each with whether some call of it is made whenever the code runs (true) or only under a rare condition (false).
// A call is under a rare condition when it is on a line "if ... then" with one, between a jump on one (the form the generated code takes for a block that is
// run only if something holds) and the label it jumps to, or after such a jump out of the code (a "then return", or a jump to a name or label that is not in the text).
export const calledNames = (text, known) => {
  const lines = text.split('\n').map((line) => (/^\s*rem\b/i.test(line) ? '' : line.replace(/;.*$/, '').trimEnd()));
  const labelAt = new Map();
  lines.forEach((line, index) => {
    const match = LABEL_LINE.exec(line);
    if (match && !NOT_LABELS.test(match[1])) labelAt.set(match[1], index);
  });
  const calls = new Map();
  const note = (name, rare) => {
    if (known.has(name)) calls.set(name, calls.get(name) === true || !rare);
  };
  const scan = (part, rare) => {
    for (const match of part.matchAll(CALL_PATTERN)) note(match[1] || match[2], rare);
  };
  const skipping = new Set();
  let left = false;
  // A jump made on a rare condition: forward to a label (the code up to it is skipped), back to one (a loop: nothing to do), or out of the text.
  const jump = (target, index) => {
    const at = labelAt.get(target);
    if (at === undefined) left = true;
    else if (at > index) skipping.add(target);
  };
  lines.forEach((line, index) => {
    const label = LABEL_LINE.exec(line);
    if (label && labelAt.get(label[1]) === index) {
      skipping.delete(label[1]);
      return;
    }
    const rareHere = skipping.size > 0 || left;
    const conditionLine = IF_PATTERN.exec(line);
    if (!conditionLine) {
      scan(line, rareHere);
      return;
    }
    scan(conditionLine[1], rareHere);
    const statement = conditionLine[2].trim();
    const rare = RARE_CONDITION.test(line);
    const target = /^goto\s+\.?([A-Za-z_]\w*)$/i.exec(statement);
    if (target) {
      note(target[1], rareHere || rare);
      if (rare) jump(target[1], index);
    } else if (/^return\b/i.test(statement)) {
      left = left || rare;
    } else {
      scan(statement, rareHere || rare);
    }
  });
  return calls;
};
