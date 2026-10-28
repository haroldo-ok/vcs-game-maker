'use strict';

import {appendCompileLog} from '../../hooks/project';
import {encodeSpeech, SPEAKJET_END} from '../../utils/speakjet';
import {encodeText} from '../../utils/speakjet-text';
import {findTextStringById} from '../../blocks/text-strings';

// The AtariVox's SpeakJet speech chip is fed serially through the right controller port: the program writes the bits of each byte to bit 0 of
// SWCHA (bit 0 of SWACNT makes it an output), at 19200 baud (62 cycles a bit), and bit 1 of SWCHA reads high while the chip can take more.
// "AtariVox say" blocks only point a variable at the phrase; a subroutine called once a frame sends one byte of it when the chip is ready, so
// a phrase goes out over several frames while the game runs on. A byte takes 10 bits of 62 cycles (about 8 lines) once a frame.

export const SPEECH_POSITION_VAR = '_avoxPos';
export const SPEECH_SUBROUTINE_NAME = '_avox_step';
// A position in the table of the phrases (a byte index into it, 0 = nothing being sent); the table starts with a filler byte so that the first
// phrase is not at 0.
export const SPEECH_TABLE_MAX = 255;

// The key of a phrase in the table: the same message or the same words are kept once.
const speechKey = (block) => (block.type === 'speech_say_text' ?
  `text:${block.getFieldValue('TEXT_ID')}` : `words:${String(block.getFieldValue('TEXT') || '')}`);

// The speech blocks of the project (enabled ones), the table of all their phrases, and where each phrase starts. Called from init.
export const prepareSpeech = (Blockly, workspace) => {
  const speechTypes = ['speech_say', 'speech_say_text', 'speech_stop', 'speech_busy'];
  const used = workspace.getAllBlocks(false).some((block) => speechTypes.includes(block.type) && block.isEnabled());
  const table = [SPEAKJET_END];
  const starts = {};
  workspace.getAllBlocks(false).filter((block) => block.isEnabled()).forEach((block) => {
    if (block.type !== 'speech_say' && block.type !== 'speech_say_text') return;
    const key = speechKey(block);
    if (key in starts) return;
    let bytes;
    if (block.type === 'speech_say_text') {
      const entry = findTextStringById(block.getFieldValue('TEXT_ID'));
      bytes = encodeText(entry ? entry.text : '').bytes;
    } else {
      const text = String(block.getFieldValue('TEXT') || '');
      const found = encodeSpeech(text);
      if (found.unknown.length) appendCompileLog(`AtariVox phrase "${text}": not understood: ${found.unknown.join(', ')}.`, 'info');
      bytes = found.bytes;
    }
    starts[key] = table.length;
    table.push(...bytes, SPEAKJET_END);
  });
  if (table.length > SPEECH_TABLE_MAX) {
    throw new Error(`The AtariVox phrases take ${table.length} bytes; the most is ${SPEECH_TABLE_MAX}. Shorten or remove some.`);
  }
  Blockly.BBasic.speechUsed = used;
  Blockly.BBasic.speechTable = table;
  Blockly.BBasic.speechStarts = starts;
  return used;
};

// The subroutine that sends the next byte of the phrase being spoken. Hand written 6502 ("@" marks a label that is defined here, see
// generateSubroutineBody). The bit timing: writes to SWCHA come exactly 62 cycles apart.
// The position goes in and out in temp3 (the variable itself can be one of the display RAM's, which the code here could not write with plain stores).
export const registerSpeechSubroutine = (Blockly) => {
  const position = 'temp3';
  // The body ends by falling out of the asm into the "return" that is added after it (a plain rts would not come back right from another
  // bank, where a subroutine is entered through the bank switch), so the table is in front of the code and the exits jump to the end.
  Blockly.BBasic.subroutines[SPEECH_SUBROUTINE_NAME] = [
    'asm',
    'jmp _avox_code',
    '@_avox_data',
    ...Array.from({length: Math.ceil(Blockly.BBasic.speechTable.length / 16)}, (_, row) =>
      `.byte ${Blockly.BBasic.speechTable.slice(row * 16, row * 16 + 16).join(', ')}`),
    '@_avox_code',
    `ldx ${position}`,
    'lda _avox_data,x',
    `cmp #${SPEAKJET_END}`,
    'bne _avox_next',
    'lda #0',
    `sta ${position}`,
    'jmp _avox_out',
    '@_avox_next',
    'sta temp4',
    // READY (bit 1 of SWCHA) is high while the chip can take a byte; not ready: try again next frame
    'lda SWCHA',
    'and #2',
    'bne _avox_ready',
    'jmp _avox_out',
    '@_avox_ready',
    `inc ${position}`,
    // bit 0 is an output (the line idles high), then the start bit, 8 data bits, the stop bit
    'lda #1',
    'sta SWACNT',
    'sta SWCHA',
    'lda #0',
    'sta SWCHA',
    'ldx #8',
    'sleep 48',
    '@_avox_bit',
    'lsr temp4',
    'lda #0',
    'rol',
    'sta SWCHA',
    'sleep 45',
    'dex',
    'bne _avox_bit',
    'sleep 8',
    'lda #1',
    'sta SWCHA',
    '@_avox_out',
    '@end',
  ].join('\n');
};

// Once a frame, in the main loop: sends the next byte of a phrase that is still being sent.
export const generateSpeechChecks = (Blockly) => {
  if (!Blockly.BBasic.speechUsed) return '';
  registerSpeechSubroutine(Blockly);
  const position = Blockly.BBasic.nameDB_.getName(SPEECH_POSITION_VAR, Blockly.Names.DEVELOPER_VARIABLE_TYPE);
  const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(SPEECH_SUBROUTINE_NAME));
  const skip = `_avox_skip_${Blockly.BBasic.blockNumbers.next('avox')}`;
  return ` if ${position} = 0 then goto ${skip}\n temp3 = ${position}\n gosub ${SPEECH_SUBROUTINE_NAME}${suffix}\n ${position} = temp3\n${skip}\n`;
};

export default (Blockly) => {
  const positionVar = () => Blockly.BBasic.nameDB_.getName(SPEECH_POSITION_VAR, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

  const say = function(block) {
    const start = (Blockly.BBasic.speechStarts || {})[speechKey(block)];
    if (start === undefined) return '';
    return ` ${positionVar()} = ${start}\n`;
  };
  Blockly.BBasic['speech_say'] = say;
  Blockly.BBasic['speech_say_text'] = say;

  Blockly.BBasic['speech_stop'] = function() {
    if (!Blockly.BBasic.speechUsed) return '';
    return ` ${positionVar()} = 0\n`;
  };

  Blockly.BBasic['speech_busy'] = function() {
    if (!Blockly.BBasic.speechUsed) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    return [`(${positionVar()} <> 0)`, Blockly.BBasic.ORDER_ATOMIC];
  };
};
