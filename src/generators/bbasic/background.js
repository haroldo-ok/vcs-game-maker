'use strict';

// batari Basic's "pfpixel X Y OP"/"pfhline X Y ENDX OP"/"pfvline X Y ENDX OP"
// statements only accept a SIMPLE token (a bare variable or literal number)
// for each argument, not a compound expression - confirmed directly: an
// X argument straight from a Random block (e.g. "(rand/8)") compiled to
// garbage assembly ("LDA #(" - a syntax error), even though the exact same
// expression works fine as an ordinary "var = (rand/8)" assignment
// elsewhere. This buffers anything that isn't already a simple token
// through a scratch var first - temp4/temp5 specifically (not temp1/temp2/
// temp3, which pf_drawing.asm's own pfpixel/pfhline/pfvline/setuppointers
// use internally as their OWN scratch space - see includes/pf_drawing.asm -
// avoiding any of those sidesteps having to reason about whether that
// internal reuse could ever clobber a value of ours it still needed).
// Between-statement scratch vars are safe to reuse this way because they're
// only ever clobbered by drawscreen, which can't run in the middle of a
// single statement (same reasoning generators/bbasic/score.js's own temp1/
// temp2 comment documents for a different pair) - this is the same
// workaround a user would otherwise have to build by hand (assign a
// variable first, then pass that instead), so a Random block (or any other
// non-trivial expression) can be plugged in directly without burning a
// variable of their own on it.
const SIMPLE_TOKEN_RE = /^-?[A-Za-z0-9_]+$/;
const asSimplePfArg = (code, tempVar) => {
  if (SIMPLE_TOKEN_RE.test(code)) return {setup: '', arg: code};
  return {setup: `${tempVar} = ${code}\n`, arg: tempVar};
};

export default (Blockly) => {
  Blockly.BBasic[`background_select`] = function(block) {
    const code = block.getFieldValue('VAR') || 0;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_set`] = function(block) {
    // Score setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return 'newbackground = ' + argument0 + '\n';
  };

  Blockly.BBasic[`background_set_select`] = function(block) {
    // Score setter.
    const argument0 = block.getFieldValue('VAR') || 0;
    return 'newbackground = ' + argument0 + '\n';
  };

  Blockly.BBasic[`background_set_color`] = function(block) {
    // Background/playfield color setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const rawVar = block.getFieldValue('VAR');
    // COLUPF and COLUBK are both overwritten every frame by the score/text
    // drawing routines (the standard kernel's score digits, the playfield
    // score bars if enabled, and the Text Minikernel's own "sta COLUBK"),
    // so both are tracked and restored each frame from a shadow variable,
    // just like COLUP0/COLUP1 are.
    const targetVar = rawVar === 'COLUPF' ? 'playfieldrealcolor' :
      rawVar === 'COLUBK' ? 'backgroundrealcolor' : rawVar;
    const varName = Blockly.BBasic.nameDB_.getName(
        targetVar, Blockly.VARIABLE_CATEGORY_NAME);
    return varName + ' = ' + argument0 + '\n';
  };

  Blockly.BBasic[`background_get_pixel`] = function(block) {
    // Block for getting a playfield pixel
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';

    const code = `pfread(${argumentX}, ${argumentY})`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`background_change_pixel`] = function(block) {
    // Block for setting a playfield pixel
    const operation = block.getFieldValue('OPERATION');
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const x = asSimplePfArg(argumentX, 'temp4');
    const y = asSimplePfArg(argumentY, 'temp5');

    return `${x.setup}${y.setup}pfpixel ${x.arg} ${y.arg} ${operation}\n`;
  };

  Blockly.BBasic[`background_change_hv_line`] = function(block) {
    // Block for drawing an horizontal/vertical line
    const direction = block.getFieldValue('DIRECTION');
    const operation = block.getFieldValue('OPERATION');
    const argumentLineLength = Blockly.BBasic.valueToCode(block, 'LENGTH',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '2';
    const argumentX = Blockly.BBasic.valueToCode(block, 'X',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const argumentY = Blockly.BBasic.valueToCode(block, 'Y',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    // Buffering ONCE and reusing the same simple token in both the length
    // calc and the actual pfhline/pfvline call also fixes a second bug this
    // shares with background_change_pixel: using the raw expression twice
    // (as this used to) would re-evaluate it twice, e.g. drawing a line
    // whose start position and length were computed from two DIFFERENT
    // random values instead of the same one. temp1 (below, unchanged) is
    // still this function's own pre-existing end-X scratch var.
    const x = asSimplePfArg(argumentX, 'temp4');
    const y = asSimplePfArg(argumentY, 'temp5');

    return `${x.setup}${y.setup}` +
      `temp1 = ${argumentLineLength} + ${direction == 'pfhline' ? x.arg : y.arg} - 1\n` +
      `${direction} ${x.arg} ${y.arg} temp1 ${operation}\n`;
  };

  Blockly.BBasic[`background_scroll`] = function(block) {
    // Block for scrolling the background on a certain direction
    const direction = block.getFieldValue('DIRECTION');

    return `pfscroll ${direction}\n`;
  };

  Blockly.BBasic[`draw_screen`] = function(block) {
    // Draw screen.
    return 'COLUP1 = player1color\n' +
      'COLUP0 = player0color\n' +
      'drawscreen\n';
  };
};

