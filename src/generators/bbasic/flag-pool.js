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

export const resetFlagPool = () => {
  layout = new Map();
};

// families: [{family: 'missileFireFlags', bits: [0, 2]}] - the feature's bit
// numbers that are actually used. Returns nothing; read the result through
// flagPoolVar/flagPoolBit.
export const planFlagPool = (families) => {
  layout = new Map();
  const wanted = families
      .map(({family, bits}) => ({family, bits: [...new Set(bits)].sort((a, b) => a - b)}))
      .filter(({bits}) => bits.length > 0)
      // Biggest first, so the small ones fill the gaps.
      .sort((a, b) => b.bits.length - a.bits.length);
  const bytes = [];
  wanted.forEach(({family, bits}) => {
    let target = bytes.find((entry) => entry.free >= bits.length);
    if (!target) {
      target = {members: [], free: 8};
      bytes.push(target);
    }
    target.members.push({family, bits, base: 8 - target.free});
    target.free -= bits.length;
  });
  bytes.forEach((entry, index) => {
    // A byte holding one family keeps that family's name.
    const name = entry.members.length === 1 ? entry.members[0].family : `flagPool${index}`;
    entry.members.forEach(({family, bits, base}) => layout.set(family, {byte: name, base, bits}));
  });
};

// The variable a family's bits live in.
export const flagPoolVar = (family) => (layout.has(family) ? layout.get(family).byte : family);

// The real bit number for one of the feature's bit numbers.
export const flagPoolBit = (family, bit) => {
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
