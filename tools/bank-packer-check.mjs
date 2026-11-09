// Checks of the bank layout planner (src/utils/bank-packer.js). Run with: npm run check:packer
import test from 'node:test';
import assert from 'node:assert/strict';
import {planBankPacking} from '../src/utils/bank-packer.js';
import {calledNames} from '../src/utils/call-scan.js';

// The cost of a layout worked out from the definition, apart from the planner's running totals.
const layoutCost = (problem, assignment) => {
  const {units, banks, primary, edges = []} = problem;
  const bankOf = (key) => assignment.get(key);
  let cost = 0;
  units.forEach((unit) => {
    if (bankOf(unit.key) !== primary) cost += unit.weight;
    const original = banks.includes(unit.bank) ? unit.bank : banks[0];
    if (bankOf(unit.key) !== original) cost += unit.settled ? 3 : 0.5;
  });
  edges.forEach(({a, b, weight}) => {
    if (bankOf(a) !== bankOf(b)) cost += weight;
  });
  return cost;
};

// A small series of numbers that is the same on every run.
const series = (seed) => {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
};

const randomProblem = (seed) => {
  const next = series(seed);
  const banks = [1, 2, 3, 4];
  const units = Array.from({length: 8 + Math.floor(next() * 6)}, (_, i) => ({
    key: `u${i}`, bank: banks[Math.floor(next() * banks.length)], size: 100 + Math.floor(next() * 500), weight: [1, 4, 12, 80][Math.floor(next() * 4)], settled: next() < 0.5,
  }));
  const edges = [];
  units.forEach((unit, i) => {
    if (i && next() < 0.7) edges.push({a: unit.key, b: units[Math.floor(next() * i)].key, weight: [1, 4, 12, 80][Math.floor(next() * 4)]});
  });
  const free = {1: 300, 2: 500, 3: 800, 4: 1200};
  return {units, banks, free, primary: 1, margin: 24, enterBytes: 10, edges};
};

test('the cost the planner reports is the cost of the layout it returns', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const problem = randomProblem(seed);
    const result = planBankPacking(problem);
    assert.ok(Math.abs(result.cost - layoutCost(problem, result.assignment)) < 1e-6, `seed ${seed}: ${result.cost} against ${layoutCost(problem, result.assignment)}`);
  }
});

test('a unit that is called often goes in the bank of the unit that calls it', () => {
  const units = [
    {key: 'caller', bank: 3, size: 400, weight: 12, settled: true},
    {key: 'callee', bank: 2, size: 400, weight: 80, settled: true},
    {key: 'filler', bank: 1, size: 3000, weight: 80, settled: true},
  ];
  const problem = {units, banks: [1, 2, 3], free: {1: 100, 2: 3000, 3: 3000}, primary: 1, margin: 8, enterBytes: 10, edges: [{a: 'caller', b: 'callee', weight: 80}]};
  const {assignment} = planBankPacking(problem);
  assert.equal(assignment.get('caller'), assignment.get('callee'));
});

// The calls found in a piece of code, as name: whether it is made whenever the code runs.
const callsIn = (text) => Object.fromEntries(calledNames(text, new Set(['a', 'b', 'c', 'd', 'f', 'g'])));

test('a call is found as made always or only under a rare condition', () => {
  // A rare condition: an input, a collision, a random number, a block that runs once or every few frames.
  assert.deepEqual(callsIn(' gosub a\n if joy0fire then gosub b\n if !collision(ball, player1) then goto _skip\n gosub c\n_skip\n gosub d'), {a: true, b: false, c: false, d: true});
  assert.deepEqual(callsIn(' if joy0left then return\n gosub a'), {a: false});
  // A condition on a variable (the state of the game) can hold for a long time: the code under it counts as run whenever the code that holds it is.
  assert.deepEqual(callsIn(' if gameState <> 6 then goto _end\n gosub a\n if flag then gosub b\n_end\n gosub c'), {a: true, b: true, c: true});
  assert.deepEqual(callsIn(' if temp2 then goto _run_once_3_end\n gosub a\n_run_once_3_end\n gosub b'), {a: false, b: true});
  // Code as it is stored: indented, with the lines that start in the first column marked with an "@".
  assert.deepEqual(callsIn('    gosub a\n    if !rand then goto _skip\n    gosub c\n  @ _skip\n    gosub d\n    if joy0up then goto _skip2\n    gosub b\n@_skip2\n   gosub f'), {a: true, c: false, d: true, b: false, f: true});
  assert.deepEqual(callsIn('_top\n gosub a\n if joy0fire then goto _top\n gosub b'), {a: true, b: true});
  assert.deepEqual(callsIn(' rem gosub a\n gosub b ; gosub c\n x = f(1)'), {b: true, f: true});
  assert.deepEqual(callsIn(' if f(1) then gosub g'), {f: true, g: true});
});
