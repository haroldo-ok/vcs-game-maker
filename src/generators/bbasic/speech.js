'use strict';

import {appendCompileLog, useTextStringsStorage} from '../../hooks/project';
import {encodeSpeech, SPEAKJET_END} from '../../utils/speakjet';
import {speechWordsFor, textToSpeakJetWords} from '../../utils/speakjet-text';
import {processTextStringsStorageDefaults} from '../../blocks/text-strings';
import {registerMemorySubroutine} from './avox-memory';

// The AtariVox's SpeakJet speech chip is fed serially through the right controller port: the program writes the bits of each byte to bit 0 of
// SWCHA (bit 0 of SWACNT makes it an output), at 19200 baud (62 cycles a bit), and bit 1 of SWCHA reads high while the chip can take more.
//
// Every phrase of the project (a message of the Text tab, a phrase of SpeakJet words, a change of voice, and the numbers when a block says one)
// is a run of bytes ending in 255 in one table, and has a number. A "say" block puts that number in a small queue of two (a variable each:
// _avoxQ1 is the one to say next, _avoxQ2 the one after); a subroutine called once a frame takes the next phrase when none is being sent and
// sends one byte of it when the chip is ready, so a phrase goes out over several frames while the game runs on. A byte takes 10 bits of
// 62 cycles (about 8 lines) once a frame. The place in the phrase being sent is the ROM address of its next byte (_avoxPos low, _avoxPosHi
// high; 0 when none is being sent), so the table can be as long as the ROM has room for.

export const SPEECH_POSITION_VAR = '_avoxPos';
export const SPEECH_POSITION_HIGH_VAR = '_avoxPosHi';
export const SPEECH_QUEUE_VARS = ['_avoxQ1', '_avoxQ2'];
export const SPEECH_SUBROUTINE_NAME = '_avox_step';
// A phrase is called by one byte (its number + 1; 0 is none).
export const SPEECH_PHRASE_MAX = 254;

// The control codes of a change of voice: [code, the largest value].
export const SPEECH_VOICE_CODES = {volume: [20, 127], speed: [21, 127], pitch: [22, 255], bend: [23, 15]};

const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN',
  'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const numberUnder100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${n % 10 ? ONES[n % 10] : ''}`.trim());

// The key of the phrase a block says in the table: the same message, words or voice are kept once.
const speechKey = (block) => {
  switch (block.type) {
    case 'speech_say_text': return `text:${block.getFieldValue('TEXT_ID')}`;
    case 'speech_voice': return `voice:${block.getFieldValue('KIND')}:${Number(block.getFieldValue('VALUE')) || 0}`;
    default: return `words:${String(block.getFieldValue('TEXT') || '')}`;
  }
};

// The speech blocks of the project (enabled ones), the table of all their phrases, and the number of each phrase. Called from init.
export const prepareSpeech = (Blockly, workspace) => {
  const speechTypes = ['speech_say', 'speech_say_text', 'speech_say_card', 'speech_say_number', 'speech_voice', 'speech_stop', 'speech_busy'];
  const blocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled());
  const used = blocks.some((block) => speechTypes.includes(block.type));
  // The AtariVox's memory (a 32 KB EEPROM on the same port): blocks that save and load a byte (see avox-memory.js).
  Blockly.BBasic.avoxMemoryUsed = blocks.some((block) => block.type === 'avox_memory_save' || block.type === 'avox_memory_load');
  const phrases = [];
  const numbers = {};
  const add = (key, bytes) => {
    if (key in numbers) return;
    numbers[key] = phrases.length;
    phrases.push(bytes);
  };
  const strings = processTextStringsStorageDefaults(useTextStringsStorage());
  blocks.forEach((block) => {
    const key = speechKey(block);
    if (block.type === 'speech_say_text') {
      const id = block.getFieldValue('TEXT_ID');
      const entry = strings.textStrings.find((candidate) => `${candidate.id}` === `${id}`);
      const found = encodeSpeech(speechWordsFor(entry, strings));
      if (found.unknown.length) appendCompileLog(`AtariVox message ${id}: not understood: ${found.unknown.join(', ')}.`, 'info');
      add(key, found.bytes);
    } else if (block.type === 'speech_say') {
      const text = String(block.getFieldValue('TEXT') || '');
      const found = encodeSpeech(text);
      if (found.unknown.length) appendCompileLog(`AtariVox phrase "${text}": not understood: ${found.unknown.join(', ')}.`, 'info');
      add(key, found.bytes);
    } else if (block.type === 'speech_voice') {
      const [code, largest] = SPEECH_VOICE_CODES[block.getFieldValue('KIND')] || SPEECH_VOICE_CODES.volume;
      add(key, [code, Math.max(0, Math.min(largest, Number(block.getFieldValue('VALUE')) || 0))]);
    }
  });
  // Saying a card by its ID: a phrase for every ID from 1 to the largest (an ID no card has is an empty phrase).
  let cardBase = 0;
  let cardMax = 0;
  if (blocks.some((block) => block.type === 'speech_say_card')) {
    cardBase = phrases.length;
    cardMax = strings.textStrings.reduce((most, entry) => Math.max(most, Number(entry.id) || 0), 0);
    for (let id = 1; id <= cardMax; id++) {
      const entry = strings.textStrings.find((candidate) => Number(candidate.id) === id);
      const found = entry ? encodeSpeech(speechWordsFor(entry, strings)) : {bytes: [], unknown: []};
      if (found.unknown.length) appendCompileLog(`AtariVox message ${id}: not understood: ${found.unknown.join(', ')}.`, 'info');
      add(`card:${id}`, found.bytes);
    }
  }
  // Saying a number: a phrase for each of 0 to 99, then "one hundred" and "two hundred" (a variable is a byte: up to 255).
  let numberBase = 0;
  if (blocks.some((block) => block.type === 'speech_say_number')) {
    numberBase = phrases.length;
    for (let n = 0; n < 100; n++) add(`number:${n}`, encodeSpeech(textToSpeakJetWords(numberUnder100(n))).bytes);
    add('number:100', encodeSpeech(textToSpeakJetWords('ONE HUNDRED')).bytes);
    add('number:200', encodeSpeech(textToSpeakJetWords('TWO HUNDRED')).bytes);
  }
  if (phrases.length > SPEECH_PHRASE_MAX) {
    throw new Error(`The AtariVox speech has ${phrases.length} phrases; the most is ${SPEECH_PHRASE_MAX}.`);
  }
  // The table: a filler byte first so that no phrase is at offset 0, then every phrase and its end.
  const table = [SPEAKJET_END];
  const offsets = phrases.map((bytes) => {
    const at = table.length;
    table.push(...bytes, SPEAKJET_END);
    return at;
  });
  Blockly.BBasic.speechUsed = used;
  Blockly.BBasic.speechTable = table;
  Blockly.BBasic.speechOffsets = offsets;
  Blockly.BBasic.speechNumbers = numbers;
  Blockly.BBasic.speechNumberBase = numberBase;
  Blockly.BBasic.speechCardBase = cardBase;
  Blockly.BBasic.speechCardMax = cardMax;
  return used;
};

// The subroutine that sends the next byte of the phrase being spoken. Hand written 6502 ("@" marks a label that is defined here, see
// generateSubroutineBody). In: temp3/temp4 the place in the phrase (the ROM address of the next byte, 0 for none), temp5 and temp6 the
// queue; out: the same, moved on. The bit timing: writes to SWCHA come exactly 62 cycles apart. The pointer is temp3/temp4; the byte to
// send waits in temp1 (the variables themselves can be Superchip RAM or Display RAM, which the code here could not write with plain stores).
export const registerSpeechSubroutine = (Blockly) => {
  const table = Blockly.BBasic.speechTable;
  const offsets = Blockly.BBasic.speechOffsets;
  const rows = (values) => Array.from({length: Math.ceil(values.length / 8)}, (_, row) => `.byte ${values.slice(row * 8, row * 8 + 8).join(', ')}`);
  // The body ends by falling out of the asm into the "return" that is added after it (a plain rts would not come back right from another
  // bank, where a subroutine is entered through the bank switch), so the tables are in front of the code and the exits jump to the end.
  Blockly.BBasic.subroutines[SPEECH_SUBROUTINE_NAME] = [
    'asm',
    'jmp _avox_code',
    '@_avox_data',
    ...Array.from({length: Math.ceil(table.length / 16)}, (_, row) => `.byte ${table.slice(row * 16, row * 16 + 16).join(', ')}`),
    '@_avox_slo',
    ...rows(offsets.map((offset) => `<(_avox_data+${offset})`)),
    '@_avox_shi',
    ...rows(offsets.map((offset) => `>(_avox_data+${offset})`)),
    '@_avox_code',
    // Nothing being sent: take the next phrase of the queue (its number + 1 in temp5), if there is one.
    'lda temp4',
    'bne _avox_have',
    'ldx temp5',
    'bne _avox_take',
    'jmp _avox_out',
    '@_avox_take',
    'dex',
    'lda _avox_slo,x',
    'sta temp3',
    'lda _avox_shi,x',
    'sta temp4',
    'lda temp6',
    'sta temp5',
    'lda #0',
    'sta temp6',
    '@_avox_have',
    'ldy #0',
    'lda (temp3),y',
    `cmp #${SPEAKJET_END}`,
    'bne _avox_next',
    'lda #0',
    'sta temp3',
    'sta temp4',
    'jmp _avox_out',
    '@_avox_next',
    'sta temp1',
    // READY (bit 1 of SWCHA) is high while the chip can take a byte; not ready: try again next frame
    'lda SWCHA',
    'and #2',
    'bne _avox_ready',
    'jmp _avox_out',
    '@_avox_ready',
    'inc temp3',
    'bne _avox_sent',
    'inc temp4',
    '@_avox_sent',
    // bit 0 is an output (the line idles high), then the start bit, 8 data bits, the stop bit
    'lda #1',
    'sta SWACNT',
    'sta SWCHA',
    'lda #0',
    'sta SWCHA',
    'ldx #8',
    'sleep 48',
    '@_avox_bit',
    'lsr temp1',
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

const resolve = (Blockly, name) => Blockly.BBasic.nameDB_.getName(name, Blockly.Names.DEVELOPER_VARIABLE_TYPE);

// Once a frame, in the main loop: sends the next byte of a phrase that is still being sent (or takes the next one of the queue).
export const generateSpeechChecks = (Blockly) => {
  if (Blockly.BBasic.avoxMemoryUsed) registerMemorySubroutine(Blockly);
  if (!Blockly.BBasic.speechUsed) return '';
  registerSpeechSubroutine(Blockly);
  const low = resolve(Blockly, SPEECH_POSITION_VAR);
  const high = resolve(Blockly, SPEECH_POSITION_HIGH_VAR);
  const [q1, q2] = SPEECH_QUEUE_VARS.map((name) => resolve(Blockly, name));
  const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(SPEECH_SUBROUTINE_NAME));
  const number = Blockly.BBasic.blockNumbers.next('avox');
  const active = `_avox_active_${number}`;
  const skip = `_avox_skip_${number}`;
  return [
    ` if ${high} <> 0 then goto ${active}`,
    ` if ${q1} = 0 then goto ${skip}`,
    `${active}`,
    ` temp3 = ${low}`,
    ` temp4 = ${high}`,
    ` temp5 = ${q1}`,
    ` temp6 = ${q2}`,
    ` gosub ${SPEECH_SUBROUTINE_NAME}${suffix}`,
    ` ${low} = temp3`,
    ` ${high} = temp4`,
    ` ${q1} = temp5`,
    ` ${q2} = temp6`,
    `${skip}`,
  ].join('\n') + '\n';
};

export default (Blockly) => {
  const vars = () => ({
    low: resolve(Blockly, SPEECH_POSITION_VAR),
    high: resolve(Blockly, SPEECH_POSITION_HIGH_VAR),
    q1: resolve(Blockly, SPEECH_QUEUE_VARS[0]),
    q2: resolve(Blockly, SPEECH_QUEUE_VARS[1]),
  });
  const label = (kind) => `_avox_${kind}_${Blockly.BBasic.blockNumbers.next('avox')}`;

  // Says the phrase whose number + 1 is `value` (a constant or a variable): at once (what is being sent stops and the queue is emptied) or
  // after the phrase being sent and the one waiting.
  const sayLines = (value, mode) => {
    const {low, high, q1, q2} = vars();
    if (mode === 'now') return [` ${q1} = ${value}`, ` ${q2} = 0`, ` ${low} = 0`, ` ${high} = 0`];
    const second = label('second');
    const done = label('done');
    return [` if ${q1} <> 0 then goto ${second}`, ` ${q1} = ${value}`, ` goto ${done}`, `@ ${second}`, ` if ${q2} <> 0 then goto ${done}`,
      ` ${q2} = ${value}`, `@ ${done}`];
  };

  const say = function(block) {
    const index = (Blockly.BBasic.speechNumbers || {})[speechKey(block)];
    if (index === undefined) return '';
    return sayLines(index + 1, block.getFieldValue('MODE') || 'now').join('\n') + '\n';
  };
  Blockly.BBasic['speech_say'] = say;
  Blockly.BBasic['speech_say_text'] = say;
  // A change of voice goes in the queue like a phrase, so it comes in its place between the phrases.
  Blockly.BBasic['speech_voice'] = function(block) {
    const index = (Blockly.BBasic.speechNumbers || {})[speechKey(block)];
    if (index === undefined) return '';
    return sayLines(index + 1, 'after').join('\n') + '\n';
  };

  // Says the Text card whose ID is the value: the phrase of the card is at (the first card phrase + ID), the number + 1 that the queue holds.
  Blockly.BBasic['speech_say_card'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const max = Blockly.BBasic.speechCardMax || 0;
    const skip = label('nocard');
    const lines = [` temp1 = ${value}`, ` if temp1 = 0 then goto ${skip}`, ` if temp1 > ${max} then goto ${skip}`,
      ` temp1 = temp1 + ${Blockly.BBasic.speechCardBase || 0}`];
    const {low, high, q1, q2} = vars();
    if ((block.getFieldValue('MODE') || 'now') === 'now') {
      lines.push(` ${q1} = temp1`, ` ${q2} = 0`, ` ${low} = 0`, ` ${high} = 0`);
    } else {
      const second = label('second');
      lines.push(` if ${q1} <> 0 then goto ${second}`, ` ${q1} = temp1`, ` goto ${skip}`, `@ ${second}`, ` if ${q2} <> 0 then goto ${skip}`,
          ` ${q2} = temp1`);
    }
    lines.push(`@ ${skip}`);
    return lines.join('\n') + '\n';
  };

  // Says a number from 0 to 255 as words: the hundreds (a phrase for 100 and one for 200) and the rest (0 to 99, left out after a hundred
  // when it is 0).
  Blockly.BBasic['speech_say_number'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const mode = block.getFieldValue('MODE') || 'now';
    const base = Blockly.BBasic.speechNumberBase;
    const {q1, q2} = vars();
    const hundreds = (Blockly.BBasic.speechNumbers || {})['number:100'] + 1;
    const twoHundreds = (Blockly.BBasic.speechNumbers || {})['number:200'] + 1;
    const rest = label('rest');
    const has = label('has');
    const more = label('more');
    const done = label('done');
    // temp1: what is left after the hundreds, temp2: the hundreds' phrase (0 for none)
    const lines = [` temp1 = ${value}`, ' temp2 = 0',
      ` if temp1 < 100 then goto ${rest}`, ` temp2 = ${hundreds}`, ' temp1 = temp1 - 100', ` if temp1 < 100 then goto ${rest}`,
      ` temp2 = ${twoHundreds}`, ' temp1 = temp1 - 100', `@ ${rest}`,
      // the phrase of the rest: its number + 1 (when there are hundreds a rest of 0 is not said)
      ` temp1 = temp1 + ${base + 1}`, ` if temp2 = 0 then goto ${has}`, ` if temp1 = ${base + 1} then temp1 = 0`, `@ ${has}`];
    if (mode === 'now') {
      // the first phrase now, the other after it
      lines.push(` if temp2 = 0 then goto ${more}`, ` ${q1} = temp2`, ` ${q2} = temp1`, ` goto ${done}`, `@ ${more}`, ` ${q1} = temp1`, ` ${q2} = 0`,
          `@ ${done}`);
      const {low, high} = vars();
      lines.push(` ${low} = 0`, ` ${high} = 0`);
    } else {
      // after: the hundreds (if any) and the rest each go in the queue
      const queueTemp = (temp) => {
        const second = label('second');
        const finished = label('queued');
        return [` if ${temp} = 0 then goto ${finished}`, ` if ${q1} <> 0 then goto ${second}`, ` ${q1} = ${temp}`, ` goto ${finished}`, `@ ${second}`,
          ` if ${q2} <> 0 then goto ${finished}`, ` ${q2} = ${temp}`, `@ ${finished}`];
      };
      lines.push(...queueTemp('temp2'), ...queueTemp('temp1'));
    }
    return lines.join('\n') + '\n';
  };

  Blockly.BBasic['speech_stop'] = function() {
    if (!Blockly.BBasic.speechUsed) return '';
    const {low, high, q1, q2} = vars();
    return [` ${low} = 0`, ` ${high} = 0`, ` ${q1} = 0`, ` ${q2} = 0`].join('\n') + '\n';
  };

  Blockly.BBasic['speech_busy'] = function() {
    if (!Blockly.BBasic.speechUsed) return ['0', Blockly.BBasic.ORDER_ATOMIC];
    const {high, q1} = vars();
    return [`((${high} <> 0) || (${q1} <> 0))`, Blockly.BBasic.ORDER_ATOMIC];
  };
};
