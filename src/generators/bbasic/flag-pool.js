// Packs the small "active bit" flag bytes of different features into shared
// bytes. Each feature (a "family") keeps one byte with one bit per thing it
// tracks (a sprite, a player...), but most projects only use a few bits of
// each, so e.g. Fire's byte (1 bit used for the ball) and the rainbow/ROM noise
// byte (2 bits used) fit into one variable together.
//
// planFlagPool() runs once per code generation (from init(), after the
// pre-scans know which bits are in use) and assigns every family a run of bits
// inside one of the pooled bytes. A family always sits in a single byte, so its
// generators keep using one variable plus bit numbers: flagPoolVar(family) is
// the variable to use and flagPoolBit(family, bit) turns the feature's
// bit number into the real one. A family that is not in the plan (or was never
// planned, because the pooling does not apply to it) falls back to a byte
// named after the family and the original bit numbers, exactly as before.
//
// Only families whose code reads and writes single bits ("var{n}") belong here.
// Flag bytes that assembly code masks as a whole (the fade and music flags) are
// left out.
let layout = new Map();
let phaseBits = {title: [], game: []};
// Which phases each phased family was used in by the blocks (see flagPoolPhaseConflict), and where the phase of the block being generated comes from.
let usedIn = new Map();
let phaseSource = null;

export const resetFlagPool = () => {
  layout = new Map();
  phaseBits = {title: [], game: []};
  usedIn = new Map();
};

// families: [{family: 'missileFireFlags', bits: [0, 2], first: false, phase: 'title'}] - the feature's bit
// numbers that are actually used; first: the family is put at bit 0 of the first byte; phase: 'title' or 'game' for a family only
// read and written while the Title Screen loop runs, or only while the game runs. Those two kinds share bits: a title family and a game
// family can sit on the same bits of a byte (the code sets the bits of the phase that starts to 0 when it starts, see flagPoolPhaseMasks).
// A family without a phase is used in both and keeps bits of its own. `overlay: false` ignores the phases. Returns nothing; read the
// result through flagPoolVar/flagPoolBit.
export const planFlagPool = (families, {overlay = true} = {}) => {
  layout = new Map();
  phaseBits = {title: [], game: []};
  usedIn = new Map();
  const wanted = families
      .map(({family, bits, first, phase}) => ({family, first: !!first, phase: overlay ? phase : undefined,
        bits: [...new Set(bits)].sort((a, b) => a - b)}))
      .filter(({bits}) => bits.length > 0)
      // A family that has to start at bit 0 of its byte goes first (assembly code changes its one bit with INC and DEC); then the
      // biggest first, so the small ones fill the gaps.
      .sort((a, b) => (b.first - a.first) || (b.bits.length - a.bits.length));
  // Each byte: the bits taken by families of both phases (from the bottom of the byte) and above them the bits of each phase.
  const bytes = [];
  ['both', 'game', 'title'].forEach((kind) => {
    wanted.filter(({phase}) => (phase || 'both') === kind).forEach(({family, bits}) => {
      let target = bytes.find((entry) => entry.both + (kind === 'both' ? 0 : entry[kind]) + bits.length <= 8);
      if (!target) {
        target = {members: [], both: 0, title: 0, game: 0};
        bytes.push(target);
      }
      target.members.push({family, bits, base: target.both + (kind === 'both' ? 0 : target[kind])});
      target[kind] += bits.length;
    });
  });
  bytes.forEach((entry, index) => {
    // A byte holding one family keeps that family's name.
    const name = entry.members.length === 1 ? entry.members[0].family : `flagPool${index}`;
    entry.members.forEach(({family, bits, base}) => layout.set(family, {byte: name, base, bits}));
  });
  wanted.forEach(({family, phase}) => {
    if (phase) phaseBits[phase].push(family);
  });
};

// The phase ('title', 'game' or 'both') of the code being generated, or nothing outside the blocks: set once by the generator.
export const setFlagPhaseSource = (source) => {
  phaseSource = source;
};

const noteUse = (family) => {
  const phase = phaseSource && phaseSource();
  if (!phase) return;
  if (!usedIn.has(family)) usedIn.set(family, new Set());
  usedIn.get(family).add(phase);
};

// A family of one phase was used by a block of the other phase (or of both), so its bits cannot be shared.
export const flagPoolPhaseConflict = () => ['title', 'game'].some((phase) => phaseBits[phase].some((family) =>
  [...(usedIn.get(family) || [])].some((used) => used !== phase)));

// The variable a family's bits live in.
export const flagPoolVar = (family) => {
  noteUse(family);
  return layout.has(family) ? layout.get(family).byte : family;
};

// The real bit number for one of the feature's bit numbers.
export const flagPoolBit = (family, bit) => {
  noteUse(family);
  const entry = layout.get(family);
  if (!entry) return bit;
  const rank = entry.bits.indexOf(bit);
  if (rank < 0) {
    throw new Error(`Flag bit ${bit} of ${family} was used but not planned (see planFlagPool)`);
  }
  return entry.base + rank;
};

// Every pooled byte (name and a short list of which families share it), for
// reserving the variables.
export const flagPoolBytes = () => {
  const bytes = new Map();
  layout.forEach(({byte}, family) => {
    if (!bytes.has(byte)) bytes.set(byte, []);
    bytes.get(byte).push(family);
  });
  return [...bytes.entries()].map(([name, families]) => ({name, families}));
};

// The bits each phase's families sit on, as {name, mask} per pooled byte (mask: the bits of that phase's families in it). The code sets
// them to 0 when the phase starts, because the other phase left its own values on the same bits.
export const flagPoolPhaseMasks = (phase) => {
  const masks = new Map();
  phaseBits[phase].forEach((family) => {
    const {byte, base, bits} = layout.get(family);
    masks.set(byte, (masks.get(byte) || 0) | (((1 << bits.length) - 1) << base));
  });
  return [...masks.entries()].map(([name, mask]) => ({name, mask}));
};
