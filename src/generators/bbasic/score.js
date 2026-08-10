'use strict';

import {useConfigurationStorage} from '../../hooks/project';
import {colorByteToBBasic} from '../../utils/palette';

// The literal bB identifier itself (not an internal "_xyz" bookkeeping
// name), reserved directly through the normal dev var pool when the Text
// Minikernel is active and the Score tab's picker holds a fixed literal
// (not 'background') - see the scoreBkColorNeedsOwnVar pre-scan in
// generators/bbasic.js's init(). The standard "dim <name> = <letter>"
// mechanism (definitions_['variables'], built from that same pool) then
// declares it automatically, with no aliasing/chaining of our own needed -
// see generateScoreBkColorRuntimeDims below for why that matters.
export const scoreBkColorVarName = () => 'scorebkcolor';

const PFSCORE_ENABLE_CODE = '  const pfscore = 1';

// The score is three bytes of packed BCD, two digits per byte, so each digit is
// one nibble. "score+1" cannot be assigned to directly, but aliasing it with
// dim works. These are aliases onto the existing score bytes, so they cost no
// variable slots.
const SCORE_DIGIT_ALIASES = [
  '  dim scorebyte1 = score',
  '  dim scorebyte2 = score+1',
  '  dim scorebyte3 = score+2',
].join('\n');

/**
 * Locates a score digit within the packed BCD bytes.
 * @param {string} digit Digit number, "1" (leftmost) to "6".
 * @return {{alias: string, address: string, high: boolean}} The dim alias for
 *     reading, the raw address for assembly, and which nibble holds the digit.
 */
const scoreDigitTarget = (digit) => {
  const index = Math.max(0, Math.min(5, parseInt(digit, 10) - 1 || 0));
  const byteIndex = Math.floor(index / 2);
  return {
    alias: `scorebyte${byteIndex + 1}`,
    address: byteIndex ? `score+${byteIndex}` : 'score',
    high: index % 2 === 0,
  };
};

export default (Blockly) => {
  Blockly.BBasic[`score_get`] = function(block) {
    // Score getter.
    const code = 'score';
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_set`] = function(block) {
    // Score setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return 'score = ' + argument0 + '\n';
  };

  Blockly.BBasic[`score_change`] = function(block) {
    // Add value to the score.
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
    const operator = isNegativeConstant ? '' : '+';
    return `score = score ${operator} ${argument0}\n`;
  };

  Blockly.BBasic[`score_color_get`] = function(block) {
    // Score's color getter.
    const code = 'scorecolor';
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_color_set`] = function(block) {
    // Score's color setter.
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return 'scorecolor = ' + argument0 + '\n';
  };

  Blockly.BBasic[`score_color_change`] = function(block) {
    // Add value to the score's color.
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '1';
    const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
    const operator = isNegativeConstant ? '' : '+';
    return `scorecolor = scorecolor ${operator} ${argument0}\n`;
  };

  // The standard kernel's own generic score-row background hook - a
  // "minikernel" subroutine, called during the score row's own WSYNC-timed
  // drawing, that (if defined) gets to set COLUBK for that one scanline
  // group before the kernel restores it for the rest of the screen. Placed
  // in bbasic.bb.hbs's own trailing "never fallen into" section (see the
  // comment there) - like generateDivMul's div_mul.asm, only ever entered
  // via the kernel's own internal call, never by falling through from the
  // line above, which naturally lands it in whatever bank ends up last
  // once every other, earlier piece of code has been assigned to a bank
  // (matching the reference docs' own "add this to last bank"
  // instruction).
  //
  // Only emitted when the Text Minikernel ISN'T active (that case is
  // handled instead by scorebkcolor's own dim - see
  // generateScoreBkColorRuntimeDims/generateScoreBkColorDefaults below -
  // since both this and the Text Minikernel compile to a subroutine
  // literally labeled "minikernel", the standard kernel's one generic
  // score-row hook point; a project can only use one or the other). Always
  // emitted otherwise, defaulting to black (0) the same way
  // generateScoreBkColorDefaults does when the Score tab's background
  // color picker (see views/ScoreFontEditor.vue) hasn't been touched.
  //
  // This whole subroutine is ours (unlike text12a.asm's own vendored one -
  // see generateScoreBkColorRuntimeDims below for how that side handles the
  // same "Use background color" case): a single one-shot "jsr minikernel"
  // call with no packed per-scanline timing budget to protect, so it can
  // read a genuine RAM variable at runtime instead of baking in a literal.
  // "Use background color" (config.scoreBkColor === 'background') takes
  // advantage of that: backgroundrealcolor is the same live bB variable
  // commongamelogic already copies into COLUBK every frame (see
  // bbasic.bb.hbs and generators/bbasic/background.js's own "Background:
  // set color" generator, which can write there too), so reading it here
  // tracks the ACTUAL current background color, live, including any later
  // runtime change - not just this project's starting color the way any
  // explicitly picked palette color here is stuck with. Deliberately
  // backgroundrealcolor (COLUBK - the general screen backdrop), not
  // playfieldrealcolor (COLUPF - the playfield's own drawn shape color):
  // the latter only ever reflects a real per-background color when
  // "Enable per-row playfield colors" is on (it's a fixed default
  // otherwise, regardless of what's drawn in the Background editor), so it
  // was a poor match for "the color behind everything" in the common case
  // - backgroundrealcolor has no such caveat, it's always live and
  // meaningful.
  Blockly.BBasic.generateScoreBkColorAsm = function() {
    if (this.isTextMinikernelActive()) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    const colorLine = config.scoreBkColor === 'background' ?
      '       lda backgroundrealcolor' :
      `       lda #${colorByteToBBasic(this.resolveScoreBkColorByte(config.scoreBkColor))}`;
    return [
      ' asm',
      'minikernel',
      '       sta WSYNC',
      colorLine,
      '       sta COLUBK',
      '       rts',
      ' end',
    ].join('\n');
  };

  // scorebkcolor's own RAM home when the Text Minikernel IS active. Used to
  // be a plain "const scorebkcolor = <literal>" (see generateConfiguration
  // in generators/bbasic.js), which text12a.asm read with immediate
  // addressing ("lda #scorebkcolor") - fine for a fixed literal, but a
  // compile-time const has no runtime existence, so there was no way to
  // make it track backgroundrealcolor. text12a.asm has since been patched
  // (see its own inline comment, right where "lda #scorebkcolor" became
  // "lda scorebkcolor") to read scorebkcolor as a real RAM address instead
  // - so it now needs an actual dim.
  //
  // Deliberately never "dim scorebkcolor = <some other dim'd NAME>" -
  // chaining one dim onto another dim's own NAME (rather than a raw
  // register letter/varN) doesn't reliably resolve here (confirmed: it
  // compiled to a bare, unresolved "lda =" - an empty operand - once
  // assembled), unlike SCORE_DIGIT_ALIASES's scorebyte1/2/3 below, which
  // alias onto "score"/"score+N" (bB's own built-in multi-byte variable,
  // not another ordinary dim). So both cases below resolve to a raw
  // target instead: "Use background color" reads backgroundRealColorRawTarget()
  // (the exact same raw letter/varN backgroundrealcolor's own
  // SYSTEM_VARIABLES entry already resolves to - see generators/bbasic.js),
  // so it stays live/tracking automatically, the same reasoning as
  // generateScoreBkColorAsm above; anything else reserves scorebkcolor
  // (the literal name, not an internal alias) directly through the normal
  // dev var pool (see the scoreBkColorNeedsOwnVar pre-scan in
  // generators/bbasic.js's init()), which lets the standard "dim <name> =
  // <letter>" mechanism declare it with a raw letter automatically - so
  // this function has nothing left to emit for that case at all.
  Blockly.BBasic.generateScoreBkColorRuntimeDims = function() {
    if (!this.isTextMinikernelActive()) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    if (config.scoreBkColor !== 'background') return '';
    return `\n dim scorebkcolor = ${this.backgroundRealColorRawTarget()}`;
  };

  // Initializes scorebkcolor's own dev var (see
  // generateScoreBkColorRuntimeDims above) once at Setup time, the same
  // spot TextColor's own default gets written (see
  // generateTextMinikernelDefaults in generators/bbasic/text-minikernel.js,
  // spliced right alongside this in generators/bbasic.js). Only needed for
  // the literal/default case - "Use background color" aliases directly onto
  // backgroundrealcolor instead, which is already initialized elsewhere, so
  // there's nothing of its own to set here.
  Blockly.BBasic.generateScoreBkColorDefaults = function() {
    if (!this.isTextMinikernelActive()) return '';
    const configurationStorage = useConfigurationStorage();
    const config = (configurationStorage && configurationStorage.value) || {};
    if (config.scoreBkColor === 'background') return '';
    return ` scorebkcolor = ${colorByteToBBasic(this.resolveScoreBkColorByte(config.scoreBkColor))}\n`;
  };

  Blockly.BBasic[`score_digit_get`] = function(block) {
    // Single score digit getter. Reading the score bytes compiles correctly,
    // unlike writing to them.
    Blockly.BBasic.definitions_['score_digit_aliases'] = SCORE_DIGIT_ALIASES;
    const {alias, high} = scoreDigitTarget(block.getFieldValue('DIGIT'));
    // Integer division drops the low nibble.
    const code = high ? `(${alias} / 16)` : `(${alias} & $0F)`;
    return [code, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_digit_set`] = function(block) {
    // batari Basic special cases any assignment whose target is the score, and
    // a dim alias of it inherits that: it discards the expression and stores a
    // six digit BCD literal instead. So the digit's nibble is merged in
    // assembly, leaving its partner in the same byte untouched.
    //
    // temp1 and temp2 are only clobbered by drawscreen, which cannot run in the
    // middle of this. "end" has to sit at column 0, hence the "@" that the
    // indent normaliser strips.
    const {address, high} = scoreDigitTarget(block.getFieldValue('DIGIT'));
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return [
      `temp1 = ${argument0}`,
      'asm',
      'lda temp1',
      'and #$0F',
      ...(high ? ['asl', 'asl', 'asl', 'asl'] : []),
      'sta temp2',
      `lda ${address}`,
      `and #${high ? '$0F' : '$F0'}`,
      'ora temp2',
      `sta ${address}`,
      '@end',
    ].join('\n') + '\n';
  };

  Blockly.BBasic[`score_bar_get`] = function(block) {
    // Score bar getter.
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    return [varName, Blockly.BBasic.ORDER_ATOMIC];
  };

  Blockly.BBasic[`score_bar_set`] = function(block) {
    // Score bar setter.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return varName + ' = ' + argument0 + '\n';
  };

  Blockly.BBasic[`score_bar_change`] = function(block) {
    // Add value to a score bar.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const isNegativeConstant = /^\s*-\s*\d+\s*$/.test(argument0);
    const operator = isNegativeConstant ? '' : '+';
    return `${varName} = ${varName} ${operator} ${argument0}\n`;
  };

  // A score bar's byte is a raw bit pattern read directly by the kernel, not
  // a plain "N units" value - so building "N units filled, growing outward
  // from the score" means constructing that pattern one step at a time, the
  // same way the batari Basic docs' own "add a life"/"add to health" examples
  // do (pfscoreN = pfscoreN*2|1 for a solid bar, pfscoreN = pfscoreN*4|2 for
  // evenly spaced dots) - just run from a value of 0, N times, instead of
  // once. Confirmed directly against the compiler and emulator: N=5 health
  // renders as one solid block, N=3 lives renders as 3 evenly spaced dots,
  // and N=0 safely loops zero times (no wraparound).
  //
  // temp1/temp2 are the compiler's own scratch registers, already reused
  // this way elsewhere for one-off statement-local bookkeeping (see
  // event_frame_even_odd) - nothing needs them to persist past this block.
  const buildBarFillLoop = (varName, targetCode, stepExpression) => [
    `${varName} = 0`,
    `temp1 = ${targetCode}`,
    'for temp2 = 1 to temp1',
    `${varName} = ${stepExpression}`,
    'next',
  ].join('\n') + '\n';

  Blockly.BBasic[`score_bar_set_health`] = function(block) {
    // Fill a score bar with a solid block, N units wide (0-8).
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarFillLoop(varName, argument0, `${varName}*2+1`);
  };

  Blockly.BBasic[`score_bar_set_lives`] = function(block) {
    // Fill a score bar with N evenly spaced dots (0-4).
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'VALUE',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarFillLoop(varName, argument0, `${varName}*4+2`);
  };

  // Grows or shrinks a score bar by repeating its one-step doubling/halving
  // move (see buildBarFillLoop above) a number of times, instead of just
  // once like the docs' own "add a life"/"add to health" examples do.
  //
  // The existing raw score_bar_get already returns the bar's plain byte
  // value (not BCD, a normal 0-255 number) - callers wanting a relative
  // change from "the current value" read that directly and do the math
  // themselves; this block only needs the delta, not the current value.
  //
  // A literal delta (the common case - a plain number typed into the
  // block, matching the default shadow) has its direction known at
  // generation time, so it compiles to a single fixed-count loop with no
  // runtime branching at all. A non-literal delta (a variable/expression)
  // can't be sign-branched safely with plain bB comparisons - these bytes
  // are unsigned, so a "negative" runtime value is really a large positive
  // one (two's complement wraparound), not something "temp < 0" can detect
  // - so that case only supports growing the bar; shrinking always needs a
  // literal negative number. Documented on the block's own tooltip.
  const buildBarChangeLoop = (varName, deltaCode, growStep, shrinkStep) => {
    const literalMatch = /^\s*(-?\d+)\s*$/.exec(deltaCode);
    if (literalMatch) {
      const n = parseInt(literalMatch[1], 10);
      if (n === 0) return '';
      const step = n > 0 ? growStep : shrinkStep;
      return [
        `for temp2 = 1 to ${Math.abs(n)}`,
        `${varName} = ${step}`,
        'next',
      ].join('\n') + '\n';
    }
    return [
      `temp1 = ${deltaCode}`,
      'for temp2 = 1 to temp1',
      `${varName} = ${growStep}`,
      'next',
    ].join('\n') + '\n';
  };

  Blockly.BBasic[`score_bar_change_health`] = function(block) {
    // Change a health-style score bar by a number of units.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarChangeLoop(varName, argument0, `${varName}*2+1`, `${varName}/2`);
  };

  Blockly.BBasic[`score_bar_change_lives`] = function(block) {
    // Change a lives-style score bar by a number of dots.
    Blockly.BBasic.definitions_['pfscore_enable'] = PFSCORE_ENABLE_CODE;
    const varName = Blockly.BBasic.nameDB_.getName(block.getFieldValue('VAR'),
        Blockly.VARIABLE_CATEGORY_NAME);
    const argument0 = Blockly.BBasic.valueToCode(block, 'DELTA',
        Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    return buildBarChangeLoop(varName, argument0, `${varName}*4+2`, `${varName}/4`);
  };
};
