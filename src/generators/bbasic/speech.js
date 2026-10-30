'use strict';

import {appendCompileLog, useConfigurationStorage, useSoundEffectsStorage, useTextStringsStorage} from '../../hooks/project';
import {encodeSpeech, SPEAKJET_END, avoxEffectBytes, touchedVoiceControls, voiceBytes, voiceById, voiceControlValue, VOICE_CONTROLS,
  SPEAKJET_VOICE} from '../../utils/speakjet';
import {speechWordsFor, textToSpeakJetWords} from '../../utils/speakjet-text';
import {processTextStringsStorageDefaults} from '../../blocks/text-strings';
import {processSoundEffectsStorageDefaults} from '../../blocks/soundfx';
import {registerMemorySubroutine} from './avox-memory';
import {isVoiceInstrument, noteSpeechBytes} from '../../utils/note-speech';
import {musicSongIndexVarName} from './music';

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
// The variables of the table of high scores in the AtariVox's memory (see avox-memory.js).
export const HIGH_SCORE_VARS = ['_avoxHsA', '_avoxHsB', '_avoxHsC'];
export const SPEECH_POSITION_HIGH_VAR = '_avoxPosHi';
export const SPEECH_QUEUE_VARS = ['_avoxQ1', '_avoxQ2'];
export const SPEECH_SUBROUTINE_NAME = '_avox_step';
// The subroutine that gives the phrase of the next note of a voice instrument (see the notes of voices below), and the variable of each such instrument
// that counts its notes.
export const VOICE_NOTE_SUBROUTINE_NAME = '_avox_note';
export const voiceNoteCounterVar = (np) => `_avoxVN${np}`;
// The frames left of the note whose words are being said, for each voice instrument: the voice stops when they run out (see the stop phrase below).
export const voiceNoteTimerVar = (np) => `_avoxVT${np}`;
// A phrase is called by one byte (its number + 1; 0 is none).
export const SPEECH_PHRASE_MAX = 254;

// The control codes of a change of voice: [code, the largest value].
export const SPEECH_VOICE_CODES = {volume: [20, 127], speed: [21, 127], pitch: [22, 255], bend: [23, 15]};

const ONES = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE', 'TEN', 'ELEVEN', 'TWELVE', 'THIRTEEN', 'FOURTEEN',
  'FIFTEEN', 'SIXTEEN', 'SEVENTEEN', 'EIGHTEEN', 'NINETEEN'];
const TENS = ['', '', 'TWENTY', 'THIRTY', 'FORTY', 'FIFTY', 'SIXTY', 'SEVENTY', 'EIGHTY', 'NINETY'];
const numberUnder100 = (n) => (n < 20 ? ONES[n] : `${TENS[Math.floor(n / 10)]} ${n % 10 ? ONES[n % 10] : ''}`.trim());

// The voice a block says with: the voice picked in the block (the first voice when none, or one that is gone), the first voice for the numbers and
// the messages said by their ID.
const voiceOfBlock = (block, strings) => (Number(block.getFieldValue('VOICE')) > 0 ? voiceById(strings.voices, block.getFieldValue('VOICE')) : null);

// The key of the phrase a block says in the table: the same message, words or voice are kept once (with the voice it is said in).
const speechKey = (block) => {
  const voiceId = () => {
    const voice = voiceOfBlock(block, processTextStringsStorageDefaults(useTextStringsStorage()));
    return voice ? voice.id : 0;
  };
  const useVoiceId = () => voiceById(processTextStringsStorageDefaults(useTextStringsStorage()).voices, block.getFieldValue('VOICE')).id;
  switch (block.type) {
    case 'speech_say_text': return `text:${block.getFieldValue('TEXT_ID')}@${voiceId()}`;
    case 'speech_voice': return `voice:${block.getFieldValue('KIND')}:${Number(block.getFieldValue('VALUE')) || 0}`;
    case 'speech_use_voice': return `voice:use:${useVoiceId()}`;
    // (an effect has no voice: the chip says it as it is set)
    case 'speech_effect': return `words:${block.getFieldValue('EFFECT')}`;
    default: return `words:${String(block.getFieldValue('TEXT') || '')}@${voiceId()}`;
  }
};

// The speech blocks of the project (enabled ones), the table of all their phrases, and the number of each phrase. Called from init.
export const prepareSpeech = (Blockly, workspace) => {
  const config = (useConfigurationStorage() && useConfigurationStorage().value) || {};
  // The AtariVox is a project option (Options tab, ROM Options): off, its blocks build to nothing.
  Blockly.BBasic.avoxEnabled = !!config.enableAtariVox;
  const speechTypes = ['speech_say', 'speech_use_voice', 'speech_use_voice_id', 'speech_effect', 'speech_say_text', 'speech_say_card', 'speech_say_number', 'speech_voice', 'speech_stop', 'speech_busy'];
  const avoxBlockTypes = (block) => speechTypes.includes(block.type) || block.type.startsWith('avox_');
  const allBlocks = workspace.getAllBlocks(false).filter((block) => block.isEnabled());
  if (!Blockly.BBasic.avoxEnabled && allBlocks.some(avoxBlockTypes)) {
    appendCompileLog('The AtariVox blocks are left out: the AtariVox is off (Options tab, ROM Options).', 'info');
  }
  const blocks = Blockly.BBasic.avoxEnabled ? allBlocks : [];
  // The AtariVox instruments of the music (see resolveNotePlayedInstruments in music.js: a note of one sets the watch of its instrument): each
  // has a phrase, the sound effect of its card, that the program says when the watch is set.
  const soundEffects = Blockly.BBasic.avoxEnabled ? processSoundEffectsStorageDefaults(useSoundEffectsStorage()).soundEffects : [];
  const avoxInstruments = [...(Blockly.BBasic.notePlayedInstruments || new Map()).entries()]
      .map(([id, index]) => ({id, index, soundEffect: soundEffects.find((candidate) => `${candidate.id}` === id)}))
      .filter(({soundEffect}) => soundEffect && soundEffect.isAtariVox);
  Blockly.BBasic.avoxInstruments = avoxInstruments;
  // The AtariVox cards that a "Play sound effect" block plays: the effect is a phrase of the speech like the one of an instrument.
  const playedAvoxCards = soundEffects.filter((soundEffect) => soundEffect.isAtariVox &&
    blocks.some((block) => block.type === 'soundfx_play' && `${block.getFieldValue('SOUNDFX')}` === `${soundEffect.id}`));
  const avoxCards = [...new Map([...avoxInstruments.map(({soundEffect}) => soundEffect), ...playedAvoxCards].map((card) => [card.id, card])).values()];
  const used = blocks.some((block) => speechTypes.includes(block.type)) || avoxCards.length > 0;
  // The AtariVox's memory (a 32 KB EEPROM on the same port): blocks that save and load a byte (see avox-memory.js).
  Blockly.BBasic.avoxHighScoresUsed = blocks.some((block) => block.type.startsWith('avox_highscore_'));
  Blockly.BBasic.avoxMemoryUsed = Blockly.BBasic.avoxHighScoresUsed ||
    blocks.some((block) => block.type === 'avox_memory_save' || block.type === 'avox_memory_load' || block.type === 'avox_memory_check');
  // The voices (the Voice tab): each phrase of speech starts by putting the chip in the controls of its voice, for the controls that any voice
  // changes from the start values or that an AtariVox instrument changes (an effect leaves its volume and bend as they are). A control that a "set voice"
  // block of the project sets is left to the blocks.
  const strings = processTextStringsStorageDefaults(useTextStringsStorage());
  const effectCards = avoxCards.filter((card) => !isVoiceInstrument(card));
  const effectVoiceControls = touchedVoiceControls(effectCards);
  const voiceBlockKinds = new Set(blocks.filter((block) => block.type === 'speech_voice').map((block) => block.getFieldValue('KIND')));
  const speechVoiceControls = VOICE_CONTROLS.filter((control) => !voiceBlockKinds.has(control) &&
    (effectVoiceControls.includes(control) ||
      strings.voices.some((voice) => voiceControlValue(voice, control) !== SPEAKJET_VOICE[control].default)));
  const phrases = [];
  const numbers = {};
  const add = (key, bytes, voice = null) => {
    if (key in numbers) return;
    numbers[key] = phrases.length;
    phrases.push(bytes.length && voice ? [...voiceBytes(voice, speechVoiceControls), ...bytes] : bytes);
  };
  blocks.forEach((block) => {
    const key = speechKey(block);
    if (block.type === 'speech_say_text') {
      const id = block.getFieldValue('TEXT_ID');
      const entry = strings.textStrings.find((candidate) => `${candidate.id}` === `${id}`);
      const found = encodeSpeech(speechWordsFor(entry, strings));
      if (found.unknown.length) appendCompileLog(`AtariVox message ${id}: not understood: ${found.unknown.join(', ')}.`, 'info');
      add(key, found.bytes, voiceOfBlock(block, strings));
    } else if (block.type === 'speech_say') {
      const text = String(block.getFieldValue('TEXT') || '');
      const found = encodeSpeech(text);
      if (found.unknown.length) appendCompileLog(`AtariVox phrase "${text}": not understood: ${found.unknown.join(', ')}.`, 'info');
      add(key, found.bytes, voiceOfBlock(block, strings));
    } else if (block.type === 'speech_effect') {
      add(key, encodeSpeech(String(block.getFieldValue('EFFECT') || '')).bytes);
    } else if (block.type === 'speech_use_voice') {
      add(key, voiceBytes(voiceById(strings.voices, block.getFieldValue('VOICE')), VOICE_CONTROLS));
    } else if (block.type === 'speech_voice') {
      const [code, largest] = SPEECH_VOICE_CODES[block.getFieldValue('KIND')] || SPEECH_VOICE_CODES.volume;
      add(key, [code, Math.max(0, Math.min(largest, Number(block.getFieldValue('VALUE')) || 0))]);
    }
  });
  // (The phrase of an instrument is its voice and its effect: the controls of the voice that any instrument changes are sent by all of them, as the
  // chip keeps a setting until it is changed.)
  const voiceControls = effectVoiceControls;
  effectCards.forEach((soundEffect) => {
    add(`avox:${soundEffect.id}`, avoxEffectBytes(soundEffect, voiceControls));
  });
  // The notes of the voice instruments (the Music tab): each firing of the watch of an instrument says the next note's words at its pitch. For every
  // voice instrument and song there is a list of what the firings say (the phrase number + 1, 0 for a note without words), in the order they fire; the
  // program counts the firings of an instrument (see voiceNoteCounterVar) and reads that place of the list of the song that is playing.
  const music = Blockly.BBasic.projectMusic;
  const songCount = music && music.songs ? music.songs.length : 0;
  const voiceNotes = [];
  avoxInstruments.filter(({soundEffect}) => isVoiceInstrument(soundEffect)).forEach(({id, index, soundEffect}, ordinal) => {
    const voice = strings.voices.find((candidate) => Number(candidate.id) === Number(soundEffect.avoxVoice)) || strings.voices[0];
    const lists = (music ? music.songs : []).map((song) => (song.voiceNotes && song.voiceNotes[index] || []).map(({key, frames}) => {
      if (!key) return {phrase: 0, frames: 0};
      const [, midi, text] = JSON.parse(key);
      const bytes = noteSpeechBytes({midi, text}, voice, strings, speechVoiceControls);
      if (!bytes.length) return {phrase: 0, frames: 0};
      add(`vnote:${key}`, bytes);
      // (A note longer than a byte of frames is not stopped.)
      return {phrase: numbers[`vnote:${key}`] + 1, frames: frames > 255 ? 0 : frames};
    }));
    lists.forEach((list) => {
      if (list.length > 255) throw new Error(`The voice instrument ${soundEffect.name || id} has ${list.length} notes in a song: the most is 255.`);
    });
    voiceNotes.push({id, np: index, ordinal, lists});
  });
  // The phrase that stops the voice when its note ends: the RESET of the chip (31), which clears what it has to say (the next phrase starts with its voice).
  if (voiceNotes.length) add('avox:stop', [31]);
  Blockly.BBasic.avoxStopPhrase = voiceNotes.length ? numbers['avox:stop'] + 1 : 0;
  Blockly.BBasic.avoxVoiceNotes = voiceNotes;
  Blockly.BBasic.avoxVoiceNoteSongs = Math.max(1, songCount);
  // The counters go back to the start when a song starts (see music.js).
  Blockly.BBasic.avoxVoiceResetLines = () => voiceNotes.map(({np}) => `${resolve(Blockly, voiceNoteCounterVar(np))} = 0\n`).join('');
  // Using a voice by its ID: a phrase for every voice, from the first ID to the largest (an ID no voice has is an empty phrase).
  let voiceBase = 0;
  let voiceMax = 0;
  if (blocks.some((block) => block.type === 'speech_use_voice_id')) {
    voiceBase = phrases.length;
    voiceMax = strings.voices.reduce((most, voice) => Math.max(most, Number(voice.id) || 0), 0);
    for (let id = 1; id <= voiceMax; id++) {
      const voice = strings.voices.find((candidate) => Number(candidate.id) === id);
      add(`voiceid:${id}`, voice ? voiceBytes(voice, VOICE_CONTROLS) : [], null);
    }
  }
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
  // The table: a filler byte first so that no phrase is at offset 0, then the phrases, each ending with its end byte. A phrase that is the tail of one
  // stored already (the end byte is in no phrase, so a run that ends with it is the end of one) is not stored again, only pointed at: the same phrase twice, "one"
  // inside "twenty one", a word at the end of a message. The longest are stored first, so that the shorter ones can be found in them.
  const table = [SPEAKJET_END];
  const offsets = new Array(phrases.length);
  const found = (run) => {
    for (let at = 1; at + run.length <= table.length; at++) {
      if (run.every((value, i) => table[at + i] === value)) return at;
    }
    return -1;
  };
  phrases.map((bytes, index) => ({index, run: [...bytes, SPEAKJET_END]})).sort((a, b) => b.run.length - a.run.length).forEach(({index, run}) => {
    const at = found(run);
    if (at !== -1) {
      offsets[index] = at;
    } else {
      offsets[index] = table.length;
      table.push(...run);
    }
  });
  Blockly.BBasic.speechUsed = used;
  Blockly.BBasic.speechTable = table;
  Blockly.BBasic.speechOffsets = offsets;
  Blockly.BBasic.speechNumbers = numbers;
  Blockly.BBasic.speechNumberBase = numberBase;
  Blockly.BBasic.speechVoiceBase = voiceBase;
  Blockly.BBasic.speechVoiceMax = voiceMax;
  Blockly.BBasic.speechCardBase = cardBase;
  Blockly.BBasic.speechCardMax = cardMax;
  return used;
};

// The subroutine that gives the phrase of the next note of a voice instrument. Hand written 6502 like the one that sends the bytes. In: temp1 the number
// of notes of the instrument that have fired in this song, temp2 the place of the list (the instrument's number times the number of songs, plus the
// song); out: temp2 the phrase number + 1 (0 for none), temp6 the frames of the length of the note (0 for none), temp1 the count moved on (back to 0 after
// the last note of the list, for a song that loops).
export const registerVoiceNoteSubroutine = (Blockly) => {
  const voiceNotes = Blockly.BBasic.avoxVoiceNotes || [];
  if (!voiceNotes.length) return;
  const songs = Blockly.BBasic.avoxVoiceNoteSongs;
  const lists = [];
  voiceNotes.forEach(({lists: perSong}) => {
    for (let song = 0; song < songs; song++) lists.push(perSong[song] || []);
  });
  // Two tables with the same places: the phrase of each note, and the frames of its length.
  const table = [];
  const frames = [];
  const offsets = lists.map((list) => {
    const at = table.length;
    list.forEach((entry) => {
      table.push(entry.phrase);
      frames.push(entry.frames);
    });
    return at;
  });
  const rows = (values) => Array.from({length: Math.ceil(values.length / 8)}, (_, row) => `.byte ${values.slice(row * 8, row * 8 + 8).join(', ')}`);
  Blockly.BBasic.subroutines[VOICE_NOTE_SUBROUTINE_NAME] = [
    'asm',
    'jmp _avoxn_code',
    '@_avoxn_tab',
    ...rows(table.length ? table : [0]),
    '@_avoxn_ftab',
    ...rows(frames.length ? frames : [0]),
    '@_avoxn_lo',
    ...rows(offsets.map((offset) => `<(_avoxn_tab+${offset})`)),
    '@_avoxn_hi',
    ...rows(offsets.map((offset) => `>(_avoxn_tab+${offset})`)),
    '@_avoxn_flo',
    ...rows(offsets.map((offset) => `<(_avoxn_ftab+${offset})`)),
    '@_avoxn_fhi',
    ...rows(offsets.map((offset) => `>(_avoxn_ftab+${offset})`)),
    '@_avoxn_len',
    ...rows(lists.map((list) => list.length)),
    '@_avoxn_code',
    'ldx temp2',
    'lda _avoxn_len,x',
    'beq _avoxn_none',
    'sta temp5',
    'lda temp1',
    'cmp temp5',
    'bcc _avoxn_ok',
    'lda #0',
    'sta temp1',
    '@_avoxn_ok',
    'lda _avoxn_lo,x',
    'sta temp3',
    'lda _avoxn_hi,x',
    'sta temp4',
    'ldy temp1',
    'lda (temp3),y',
    'sta temp2',
    'lda _avoxn_flo,x',
    'sta temp3',
    'lda _avoxn_fhi,x',
    'sta temp4',
    'lda (temp3),y',
    'sta temp6',
    'inc temp1',
    'jmp _avoxn_out',
    '@_avoxn_none',
    'lda #0',
    'sta temp2',
    'sta temp6',
    '@_avoxn_out',
    '@end',
  ].join('\n');
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
  if (Blockly.BBasic.avoxMemoryUsed) {
    registerMemorySubroutine(Blockly, Blockly.BBasic.avoxHighScoresUsed ? HIGH_SCORE_VARS.map((name) => resolve(Blockly, name)) : null);
  }
  if (!Blockly.BBasic.speechUsed) return '';
  registerSpeechSubroutine(Blockly);
  registerVoiceNoteSubroutine(Blockly);
  const low = resolve(Blockly, SPEECH_POSITION_VAR);
  const high = resolve(Blockly, SPEECH_POSITION_HIGH_VAR);
  const [q1, q2] = SPEECH_QUEUE_VARS.map((name) => resolve(Blockly, name));
  const suffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(SPEECH_SUBROUTINE_NAME));
  const number = Blockly.BBasic.blockNumbers.next('avox');
  const active = `_avox_active_${number}`;
  const skip = `_avox_skip_${number}`;
  // A note of an AtariVox instrument has set its watch: its sound effect is said at once.
  const flags = Blockly.BBasic.musicEventFlags;
  const instrumentLines = [];
  const voiceNoteById = new Map((Blockly.BBasic.avoxVoiceNotes || []).map((entry) => [`${entry.id}`, entry]));
  (Blockly.BBasic.avoxInstruments || []).forEach(({id, index}) => {
    const target = flags && flags.notePlayed.get(id);
    // A note of a voice instrument: the next entry of the list of its song says what to say (see registerVoiceNoteSubroutine).
    const voiceNote = voiceNoteById.get(`${id}`);
    if (voiceNote) {
      if (!target) return;
      const flagBit = `${resolve(Blockly, target.varName)}{${target.bit}}`;
      const end = `_avox_inst_${Blockly.BBasic.blockNumbers.next('avox')}`;
      const counter = resolve(Blockly, voiceNoteCounterVar(voiceNote.np));
      const songs = Blockly.BBasic.avoxVoiceNoteSongs;
      const noteSuffix = Blockly.BBasic.bankJumpSuffix(Blockly.BBasic.primaryBank(), Blockly.BBasic.getSubroutineBank(VOICE_NOTE_SUBROUTINE_NAME));
      const songIndexVar = songs > 1 ? resolve(Blockly, musicSongIndexVarName()) : null;
      const timer = resolve(Blockly, voiceNoteTimerVar(voiceNote.np));
      const stopped = Blockly.BBasic.avoxStopPhrase;
      const direct = `_avox_direct_${Blockly.BBasic.blockNumbers.next('avox')}`;
      const timerEnd = `_avox_timer_${Blockly.BBasic.blockNumbers.next('avox')}`;
      // When the note ends the voice is stopped (the stop phrase is first in the queue, and a phrase is said after it).
      instrumentLines.push(` if ${timer} = 0 then goto ${timerEnd}`, ` ${timer} = ${timer} - 1`, ` if ${timer} <> 0 then goto ${timerEnd}`, ` ${q1} = ${stopped}`,
          ` ${q2} = 0`, ` ${low} = 0`, ` ${high} = 0`, `${timerEnd}`);
      instrumentLines.push(` if !${flagBit} then goto ${end}`, ` ${flagBit} = 0`, ` temp1 = ${counter}`,
          songIndexVar ? ` temp2 = ${songIndexVar}` : ` temp2 = 0`, ...(voiceNote.ordinal * songs ? [` temp2 = temp2 + ${voiceNote.ordinal * songs}`] : []),
          ` gosub ${VOICE_NOTE_SUBROUTINE_NAME}${noteSuffix}`, ` ${counter} = temp1`, ` if temp2 = 0 then goto ${end}`, ` ${timer} = temp6`,
          ` if ${q1} <> ${stopped} then goto ${direct}`, ` ${q2} = temp2`, ` goto ${end}`, `${direct}`, ` ${q1} = temp2`, ` ${q2} = 0`,
          ` ${low} = 0`, ` ${high} = 0`, `${end}`);
      return;
    }
    const phraseNumber = Blockly.BBasic.speechNumbers[`avox:${id}`];
    if (!target || phraseNumber === undefined) return;
    const flagBit = `${resolve(Blockly, target.varName)}{${target.bit}}`;
    const end = `_avox_inst_${Blockly.BBasic.blockNumbers.next('avox')}`;
    instrumentLines.push(` if !${flagBit} then goto ${end}`, ` ${flagBit} = 0`, ` ${q1} = ${phraseNumber + 1}`, ` ${q2} = 0`, ` ${low} = 0`,
        ` ${high} = 0`, `${end}`);
  });
  return [
    ...instrumentLines,
    ` if ${high} <> 0 then goto ${active}`,
    ` if ${q1} = 0 then goto ${skip}`,
    `${active}`,
    ` temp3 = ${low}`,
    ` temp4 = ${high}`,
    ` temp5 = ${q1}`,
    ` temp6 = ${q2}`,
    // Each call sends a byte: with voice instruments in the music a note is short, so a phrase is sent three bytes a frame (a call that has nothing to send
    // or a chip that is not ready costs little).
    ...Array.from({length: (Blockly.BBasic.avoxVoiceNotes || []).length ? 3 : 1}, () => ` gosub ${SPEECH_SUBROUTINE_NAME}${suffix}`),
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
  Blockly.BBasic['speech_effect'] = say;
  // A "Play sound effect" block of a card of the AtariVox kind: its effect at once (see soundfx_play in soundfx.js).
  Blockly.BBasic.avoxPlayLines = (id) => {
    const index = (Blockly.BBasic.speechNumbers || {})[`avox:${id}`];
    return index === undefined ? '' : `${sayLines(index + 1, 'now').join('\n')}\n`;
  };
  Blockly.BBasic['speech_say_text'] = say;
  // A change of voice goes in the queue like a phrase, so it comes in its place between the phrases.
  Blockly.BBasic['speech_voice'] = function(block) {
    const index = (Blockly.BBasic.speechNumbers || {})[speechKey(block)];
    if (index === undefined) return '';
    return sayLines(index + 1, 'after').join('\n') + '\n';
  };

  // Puts the chip in a voice: by the list the phrase is known when building, by the ID the voice is picked by the program (the phrase of the voice is at
  // the first voice phrase + ID, the number + 1 that the queue holds). In the queue like a change of one control.
  Blockly.BBasic['speech_use_voice'] = function(block) {
    const index = (Blockly.BBasic.speechNumbers || {})[speechKey(block)];
    if (index === undefined) return '';
    return sayLines(index + 1, 'after').join('\n') + '\n';
  };
  Blockly.BBasic['speech_use_voice_id'] = function(block) {
    const value = Blockly.BBasic.valueToCode(block, 'VALUE', Blockly.BBasic.ORDER_ASSIGNMENT) || '0';
    const skip = label('novoice');
    const lines = [` temp1 = ${value}`, ` if temp1 = 0 then goto ${skip}`, ` if temp1 > ${Blockly.BBasic.speechVoiceMax || 0} then goto ${skip}`,
      ` temp1 = temp1 + ${Blockly.BBasic.speechVoiceBase || 0}`];
    const {q1, q2} = vars();
    const second = label('second');
    lines.push(` if ${q1} <> 0 then goto ${second}`, ` ${q1} = temp1`, ` goto ${skip}`, `@ ${second}`, ` if ${q2} <> 0 then goto ${skip}`, ` ${q2} = temp1`,
        `@ ${skip}`);
    return lines.join('\n') + '\n';
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
