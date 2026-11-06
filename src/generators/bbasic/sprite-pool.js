'use strict';

// The sprite pool blocks are replaced by ordinary blocks before the code is made (see utils/sprite-pool.js); these only keep the generator from
// failing on one that is still there, which makes no code.
export default (Blockly) => {
  ['sprite_pool_spawn', 'sprite_pool_each', 'sprite_pool_release', 'sprite_pool_release_all'].forEach((type) => {
    Blockly.BBasic[type] = () => '';
  });
  Blockly.BBasic['sprite_pool_full'] = () => ['0', Blockly.BBasic.ORDER_ATOMIC];
};
