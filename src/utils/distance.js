'use strict';

// The hidden per-frame variable name a "Distance" block's chosen object pair
// computes into - shared between the block definition (blocks/input.js's
// getDeveloperVariables, so Blockly allocates it a free letter), its own
// getter generator, and the once-per-frame computation (both in
// generators/bbasic/input.js), so all three agree on the same name and a
// pair checked from more than one block is only ever computed once.
export const canonicalDistanceVarName = (axis, obj0, obj1) => `distance${axis}_${obj0}_${obj1}`;

// Same idea as canonicalDistanceVarName above, for a "Distance to point"
// block (blocks/input.js's distance_x_to_point_get/distance_y_to_point_get).
// The second operand there is an arbitrary value input, not a
// dropdown-selectable object, so it can't be deduped by content the way two
// object names can - each block instance gets its own hidden variable
// instead, numbered in workspace order (see bbasic.js's own pre-scan).
export const distancePointVarName = (axis, index) => `distance${axis}_point${index}`;
