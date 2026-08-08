'use strict';

import {canonicalDistanceVarName} from '../../utils/distance';

export default (Blockly) => {
  const createGeneratorForJoystick = (name) => {
    Blockly.BBasic[`input_${name}_get`] = function(block) {
      // Variable getter.
      const code = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
          Blockly.VARIABLE_CATEGORY_NAME);
      return [code, Blockly.BBasic.ORDER_ATOMIC];
    };
  };

  ['joy0', 'joy1'].forEach(createGeneratorForJoystick);

  Blockly.BBasic['input_console_switch_get'] = function(block) {
    // Variable getter.
    const switchName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('SWITCH'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [switchName, Blockly.BBasic.ORDER_ATOMIC];
  };

  // Distance between any two objects (Player 0/1, Missile 0/1, Ball), one
  // axis at a time - a plain number, recomputed once per frame (see
  // generateDistanceChecks below) into the same hidden variable bbasic.js's
  // own pre-scan registered for this exact (axis, object pair), so reading
  // it here is free regardless of how many "Distance" blocks a project has.
  // Routed through nameDB_.getName (same bucket bbasic.js used to dim it)
  // rather than the raw canonical string, so this always matches whatever
  // name actually got dimmed.
  const getDistanceVarName = (axis, block) => Blockly.BBasic.nameDB_.getName(
      canonicalDistanceVarName(axis, block.getFieldValue('VAR0'), block.getFieldValue('VAR1')),
      Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  Blockly.BBasic['distance_x_get'] = function(block) {
    return [getDistanceVarName('x', block), Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic['distance_y_get'] = function(block) {
    return [getDistanceVarName('y', block), Blockly.BBasic.ORDER_ATOMIC];
  };

  // Spliced into commongamelogic (see bbasic.js/bbasic.bb.hbs), once per
  // unique (axis, object pair) collected by bbasic.js's own pre-scan (see
  // its init() - distanceChecks is keyed by canonicalDistanceVarName so a
  // pair picked by more than one "Distance" block is only computed once).
  //
  // Every relevant object's coordinate variable follows the same
  // "<name>x"/"<name>y" naming (player0x, missile1y, ballx, etc), so the
  // stored object names just need the axis letter appended. Coordinates are
  // unsigned bytes, so a plain subtraction underflows (wraps around to a
  // huge value) whenever the first operand is smaller - has to branch on
  // which object is further along the axis and subtract the smaller from
  // the larger. "if X then A : B" only conditions A, not B, so this can't be
  // collapsed onto fewer lines with a trailing goto - every branch needs its
  // own line, same as generateSoundFadeChecks.
  Blockly.BBasic.generateDistanceChecks = function() {
    const checks = this.distanceChecks;
    if (!checks || !checks.size) return '';
    const lines = [];
    let i = 0;
    checks.forEach(({axis, obj0, obj1}, rawVarName) => {
      i++;
      const varName = Blockly.BBasic.nameDB_.getName(rawVarName, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
      const coord0 = `${obj0}${axis}`;
      const coord1 = `${obj1}${axis}`;
      const negLabel = `_distance_check_${i}_neg`;
      const doneLabel = `_distance_check_${i}_done`;
      lines.push(
          ` if ${coord0} < ${coord1} then goto ${negLabel}`,
          ` ${varName} = ${coord0} - ${coord1}`,
          ` goto ${doneLabel}`,
          `${negLabel}`,
          ` ${varName} = ${coord1} - ${coord0}`,
          `${doneLabel}`,
      );
    });
    return lines.join('\n');
  };
};

