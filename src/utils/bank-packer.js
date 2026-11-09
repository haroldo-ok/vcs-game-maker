// Plans which bank each relocatable unit goes in, from what the assembler measured: the room left in every bank and the address of every label
// (see measureBanks in hooks/bb-compiler.js). The old way moved one unit at a time by estimates of its size and compiled again; this one knows the
// size of each unit, so a layout that fits is found in a few compiles.

// The room left in each bank, from the assembler's "bytes of ROM space left in bank N" lines (the last line of a bank wins): {bank: bytes}.
export const parseBankFree = (stdout) => {
  const free = {};
  [...(stdout || '').matchAll(/(-?\d+) bytes of ROM space left in bank (\d+)/g)].forEach((match) => {
    free[Number(match[2])] = Number(match[1]);
  });
  return free;
};

// The first address of the labels in `names` that exist, or null.
const addressOf = (symbolmap, names) => {
  for (const name of names) {
    if (symbolmap[name] !== undefined) return symbolmap[name];
  }
  return null;
};

// The bank an address is in: each bank's code is placed at a 4 KB page of its bank of addresses, and the label start_bankN is near the end of that page.
const bankOfAddress = (symbolmap, address) => {
  for (let bank = 1; symbolmap[`start_bank${bank}`] !== undefined; bank++) {
    if ((symbolmap[`start_bank${bank}`] >> 12) === (address >> 12)) return bank;
  }
  return null;
};

/**
 * The size in bytes of each unit, found from where the labels at the start of the units are: a unit runs from its label to the next unit's in the same
 * bank (the last one in a bank to the first data table copy after it, else to where the code of the bank ends).
 * @param {!Object<string, number>} symbolmap
 * @param {!Object<number, number>} free Room left in each bank, from parseBankFree.
 * @param {!Array<{key: string, labels: !Array<string>, endLabels: (!Array<string>|undefined)}>} units Each unit with the names its first label can have
 *   (and its last, when it has one: then the size is exact; without it the unit is taken to run up to the next one).
 * @return {!Map<string, {size: number, bank: number, exact: (boolean|undefined)}>} Only for the units whose label was found.
 */
export const measureUnitSizes = (symbolmap, free, units) => {
  const found = [];
  units.forEach(({key, labels, endLabels}) => {
    const address = addressOf(symbolmap, labels);
    if (address === null) return;
    const bank = bankOfAddress(symbolmap, address);
    const endAddress = endLabels ? addressOf(symbolmap, endLabels) : null;
    if (bank !== null) found.push({key, address, bank, endAddress});
  });
  const tableCopies = {};
  Object.keys(symbolmap).forEach((name) => {
    const match = /^_dt_\d+_.*_b(\d+)$/.exec(name);
    if (match) (tableCopies[match[1]] = tableCopies[match[1]] || []).push(symbolmap[name]);
  });
  const sizes = new Map();
  const byBank = {};
  found.forEach((unit) => (byBank[unit.bank] = byBank[unit.bank] || []).push(unit));
  Object.keys(byBank).forEach((bankKey) => {
    const bank = Number(bankKey);
    const list = byBank[bank].sort((a, b) => a.address - b.address);
    const codeEnd = symbolmap[`start_bank${bank}`] !== undefined && free[bank] !== undefined ? symbolmap[`start_bank${bank}`] - free[bank] : null;
    list.forEach((unit, i) => {
      let end = null;
      if (unit.endAddress !== null && unit.endAddress >= unit.address) {
        sizes.set(unit.key, {size: unit.endAddress - unit.address, bank, exact: true});
        return;
      }
      if (i + 1 < list.length) end = list[i + 1].address;
      else {
        const tables = (tableCopies[bank] || []).filter((address) => address > unit.address);
        end = tables.length ? Math.min(...tables) : codeEnd;
        if (codeEnd !== null && end !== null) end = Math.min(end, codeEnd);
      }
      if (end !== null && end >= unit.address) sizes.set(unit.key, {size: end - unit.address, bank});
    });
  });
  return sizes;
};

// A small deterministic random number generator, so the same project is always packed the same way.
const makeRandom = (seed) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Chooses a bank for every unit so that each bank keeps `margin` bytes free, moving as little as possible and keeping what runs often in the main
 * bank (a call into another bank takes 35 to 50 cycles).
 * @param {{units: !Array<{key: string, bank: number, size: number, weight: number}>, banks: !Array<number>, free: !Object<number, number>,
 *   primary: number, margin: number, enterBytes: number, edges: (!Array<{a: string, b: string, weight: number}>|undefined)}} problem
 *   units: where each is now (bank) and what it costs to run away from the main bank (weight); banks: the banks they can go in; free: the room
 *   each of those has now; enterBytes: the code a unit adds to a bank it was not in (the bank switching calls to it); edges: pairs of units where
 *   one calls the other, with what each call costs when the two are in different banks (how often it is made): a unit called every pass goes in the
 *   bank of the one that calls it, not in a bank by itself.
 * @return {{assignment: !Map<string, number>, deficit: number, feasible: boolean, cost: number}} deficit: the bytes by which the banks fall short of the margin;
 *   cost: what the layout costs (the weights of the units away from the main bank, the moves, and the calls across banks).
 */
export const planBankPacking = ({units, banks, free, primary, margin, enterBytes, edges = []}) => {
  const count = units.length;
  const indexOfKey = new Map(units.map((unit, i) => [unit.key, i]));
  // For each unit, the units it calls or is called by, with what it costs when they are in different banks.
  const links = units.map(() => []);
  edges.forEach(({a, b, weight}) => {
    if (!indexOfKey.has(a) || !indexOfKey.has(b) || a === b) return;
    links[indexOfKey.get(a)].push({other: indexOfKey.get(b), weight});
    links[indexOfKey.get(b)].push({other: indexOfKey.get(a), weight});
  });
  const binIndex = new Map(banks.map((bank, i) => [bank, i]));
  const original = units.map((unit) => (binIndex.has(unit.bank) ? binIndex.get(unit.bank) : -1));
  const baseFree = banks.map((bank) => (free[bank] === undefined ? 0 : free[bank]));
  // (A unit whose size is known is where an earlier layout put it for a reason: moving it again costs more than moving one that was only guessed at.)
  const costOf = (i, bin) => (banks[bin] === primary ? 0 : units[i].weight) + (bin !== original[i] ? (units[i].settled ? 3 : 0.5) : 0);
  const state = original.map((bin, i) => (bin >= 0 ? bin : 0));
  // What the calls of unit i cost with the unit in bank bin (the others where they are now).
  const linkCost = (i, bin) => links[i].reduce((sum, {other, weight}) => sum + (state[other] === bin ? 0 : weight), 0);
  const room = baseFree.slice();
  // Room left in each bank for a layout, as the sum of what units entering and leaving it do.
  units.forEach((unit, i) => {
    if (original[i] >= 0 && state[i] !== original[i]) room[original[i]] += unit.size;
    if (state[i] !== original[i]) room[state[i]] -= unit.size + enterBytes;
  });
  const deficitOf = (bin) => Math.max(0, margin - room[bin]);
  let deficit = 0;
  let cost = 0;
  banks.forEach((bank, bin) => (deficit += deficitOf(bin)));
  units.forEach((unit, i) => (cost += costOf(i, state[i]) + linkCost(i, state[i]) / 2));
  const PENALTY = 4;
  const energy = () => cost + PENALTY * deficit;
  const move = (i, to) => {
    const from = state[i];
    if (from === to) return;
    const unit = units[i];
    // Leaving the original bank gives its room back; entering any other bank takes it.
    const leave = (bin) => {
      deficit -= deficitOf(bin);
      if (bin === original[i]) room[bin] += unit.size;
      else room[bin] += unit.size + enterBytes;
      deficit += deficitOf(bin);
    };
    const enter = (bin) => {
      deficit -= deficitOf(bin);
      if (bin === original[i]) room[bin] -= unit.size;
      else room[bin] -= unit.size + enterBytes;
      deficit += deficitOf(bin);
    };
    cost -= costOf(i, from) + linkCost(i, from);
    leave(from);
    state[i] = to;
    enter(to);
    cost += costOf(i, to) + linkCost(i, to);
  };
  // A unit that is back in its original bank does not take room twice: the room sums above are relative to the layout as it started, so the
  // original bank counts the unit as already there (leave() and enter() are written so that going out and coming back cancel).
  let best = {state: state.slice(), deficit, cost};
  const better = (a, b) => (a.deficit !== b.deficit ? a.deficit < b.deficit : a.cost < b.cost);
  const random = makeRandom(count * 7919 + banks.length);
  const iterations = Math.min(60000, 4000 + count * 1500);
  let temperature = 40;
  const cooling = Math.pow(0.02 / 40, 1 / iterations);
  for (let step = 0; step < iterations; step++) {
    const before = energy();
    let undo = null;
    if (count > 1 && random() < 0.35) {
      const a = Math.floor(random() * count);
      const b = Math.floor(random() * count);
      if (state[a] === state[b]) {
        temperature *= cooling;
        continue;
      }
      const binA = state[a];
      const binB = state[b];
      move(a, binB);
      move(b, binA);
      undo = () => {
        move(a, binA);
        move(b, binB);
      };
    } else {
      const a = Math.floor(random() * count);
      const to = Math.floor(random() * banks.length);
      if (to === state[a]) {
        temperature *= cooling;
        continue;
      }
      const from = state[a];
      move(a, to);
      undo = () => move(a, from);
    }
    const after = energy();
    if (after > before && random() >= Math.exp((before - after) / temperature)) undo();
    else {
      const here = {deficit, cost};
      if (better(here, best)) best = {state: state.slice(), deficit, cost};
    }
    temperature *= cooling;
  }
  const assignment = new Map();
  units.forEach((unit, i) => assignment.set(unit.key, banks[best.state[i]]));
  return {assignment, deficit: best.deficit, feasible: best.deficit <= 0, cost: best.cost};
};
