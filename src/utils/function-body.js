'use strict';

// Whether a block is inside the body of a custom function (a function_define block), however deep: temp1 to temp6 hold the arguments there, so a block
// that works in them needs a byte of its own instead. Follows value inputs as well as statements.
export const isInsideFunctionBody = (block) => {
  let ancestor = block.getParent();
  while (ancestor) {
    if (ancestor.type === 'function_define') return true;
    ancestor = ancestor.getParent();
  }
  return false;
};
