'use strict';

// The hidden per-frame variable name a "Distance" block's chosen object pair
// computes into - shared between the block definition (blocks/input.js's
// getDeveloperVariables, so Blockly allocates it a free letter), its own
// getter generator, and the once-per-frame computation (both in
// generators/bbasic/input.js), so all three agree on the same name and a
// pair checked from more than one block is only ever computed once.
export const canonicalDistanceVarName = (axis, obj0, obj1) => `distance${axis}_${obj0}_${obj1}`;
