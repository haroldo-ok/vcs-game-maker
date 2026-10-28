import * as Blockly from 'blockly/core';

import {SPEECH_ICON} from './icon';
import {buildTextStringOptions, processTextStringsStorageDefaults} from './text-strings';
import {useTextStringsStorage} from '../hooks/project';
import {encodeSpeech} from '../utils/speakjet';
import {speechWordsFor} from '../utils/speakjet-text';
import {speakBytes} from '../utils/speech-preview';

const MODE_OPTIONS = [['now', 'now'], ['after the current phrase', 'after']];
const modeField = () => new Blockly.FieldDropdown(MODE_OPTIONS);

// A small play button in a block: hears the phrase the block says.
const PLAY_ICON = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><circle cx="8" cy="8" r="8" fill="white" ' +
    'fill-opacity="0.9"/><path d="M6 4.5v7l6-3.5z" fill="rgb(156,39,176)"/></svg>');
const playButton = (words) => new Blockly.FieldImage(PLAY_ICON, 16, 16, 'Hear it', () => speakBytes(encodeSpeech(words()).bytes));

// (The Sound category's color: the Speech blocks sit in it.)
const SPEECH_COLOR = 'rgb(156, 39, 176)';

// The AtariVox's SpeakJet speech chip (see generators/bbasic/speech.js). "say text" reads a message of the Text tab (turned into speech when
// the project is built, see utils/speakjet-text.js); "say phonemes" takes a phrase typed as SpeakJet words (see utils/speakjet.js).
Blockly.Blocks['speech_say_text'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SPEECH_ICON} AtariVox say text`)
        .appendField(new Blockly.FieldDropdown(buildTextStringOptions), 'TEXT_ID')
        .appendField(modeField(), 'MODE')
        .appendField(playButton(() => {
          const strings = processTextStringsStorageDefaults(useTextStringsStorage());
          const id = this.getFieldValue('TEXT_ID');
          return speechWordsFor(strings.textStrings.find((entry) => `${entry.id}` === `${id}`), strings);
        }));
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Speaks a message of the Text tab through an AtariVox (a speech chip in the Player 2 controller port). The text is turned into ' +
      'speech sounds when the project is built, by rules for English: most plain words are understood, but not all (numbers are spoken as ' +
      'words). For a phrase that has to be exactly right use "AtariVox say phonemes". The phrase goes out a byte a frame while the game runs, ' +
      'and the game goes on at once. The preview speaks in either emulator (the AtariVox is plugged in for you while the project has a Speech ' +
      'block). All the speech of a project together takes at most 254 bytes. The Player 2 joystick can not be used with the AtariVox.');
  },
};

Blockly.Blocks['speech_say'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SPEECH_ICON} AtariVox say phonemes`)
        .appendField(new Blockly.FieldTextInput('HE EH LE OWWW'), 'TEXT')
        .appendField(modeField(), 'MODE')
        .appendField(playButton(() => this.getFieldValue('TEXT')));
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Speaks a phrase of SpeakJet words through an AtariVox (a speech chip in the Player 2 controller port). The words are ' +
      'separated by spaces: allophones (the sounds of speech, like HE EH LE OWWW for "hello"), sound effects (R0 to R9 robot, A0 to A9 alarm, ' +
      'B0 to B9 beeps, C0 to C9 biological, D0 to D11 tones, M0 to M2 miscellaneous), PAUSE30 / PAUSE60 / PAUSE90 / PAUSE200 / PAUSE700 / ' +
      'PAUSE1000, FAST, SLOW, STRESS, RELAX, VOLUME n, SPEED n, PITCH n and BEND n (n from 0 to 254), or #n for any byte. The phrase goes out ' +
      'a byte a frame while the game runs, and the game goes on at once. The preview speaks in either emulator (the AtariVox is plugged in ' +
      'for you while the project has a Speech block). All the phrases of a project together take at most 254 bytes. The Player 2 joystick ' +
      'can not be used with the AtariVox.');
  },
};

Blockly.Blocks['speech_say_card'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${SPEECH_ICON} AtariVox say text card ID`);
    this.appendDummyInput().appendField(modeField(), 'MODE')
        .appendField(playButton(() => {
          // only a number typed in the block can be heard here (a variable has no value until the game runs)
          const target = this.getInputTargetBlock('VALUE');
          if (!target || target.type !== 'math_number') return '';
          const strings = processTextStringsStorageDefaults(useTextStringsStorage());
          return speechWordsFor(strings.textStrings.find((entry) => Number(entry.id) === Number(target.getFieldValue('NUM'))), strings);
        }));
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Speaks the message of the Text tab whose ID is the value (a number or variable; the ID is shown on the card). The program ' +
      'picks the card while it runs. Every card of the project goes in the ROM as speech, so it takes more room than "AtariVox say text". ' +
      'An ID that no card has says nothing. The play button hears the card when the ID is a number typed in the block.');
  },
};

Blockly.Blocks['speech_say_number'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${SPEECH_ICON} AtariVox say number`);
    this.appendDummyInput().appendField(modeField(), 'MODE');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Speaks a number from 0 to 255 (a value or variable) as words, for example the lives left or a level. It works with the speech ' +
      'blocks around it: "now" stops what is being sent and says it, "after the current phrase" waits for the phrase being sent and the one ' +
      'waiting. The words for 0 to 99 and for 100 and 200 take about a kilobyte of ROM, once, however many of these blocks there are.');
  },
};

Blockly.Blocks['speech_voice'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SPEECH_ICON} AtariVox set`)
        .appendField(new Blockly.FieldDropdown([['volume (0-127)', 'volume'], ['speed (0-127)', 'speed'], ['pitch (0-255)', 'pitch'],
          ['bend (0-15)', 'bend']]), 'KIND')
        .appendField('to')
        .appendField(new Blockly.FieldNumber(90, 0, 255, 1), 'VALUE');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Changes the voice of the AtariVox from the next phrase it is sent: the volume (default 96), the speed (default 114, higher is ' +
      'faster), the pitch (default 88) or the bend (default 5, from a deep to a high voice). It goes in the queue of the speech blocks, so it ' +
      'comes between the phrases in the order the blocks ran, and it stays until it is changed again.');
  },
};

// The AtariVox's memory (see generators/bbasic/avox-memory.js).
Blockly.Blocks['avox_memory_save'] = {
  init: function() {
    this.appendValueInput('VALUE')
        .setCheck('Number')
        .appendField(`${SPEECH_ICON} AtariVox memory: save`);
    this.appendValueInput('SLOT')
        .setCheck('Number')
        .appendField('in slot');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Saves a byte (0 to 255) in the memory of the AtariVox (the SaveKey chip on its controller port), kept when the console is off: a ' +
      'high score or a setting, one byte in each of its slots 0 to 255. Saving waits for the memory to finish, a few milliseconds, so the ' +
      'picture can jump once: do it between games, not during one. With no AtariVox plugged in nothing happens. In the preview the memory lasts ' +
      'while the preview runs.');
  },
};

Blockly.Blocks['avox_memory_load'] = {
  init: function() {
    this.appendValueInput('SLOT')
        .setCheck('Number')
        .appendField(`${SPEECH_ICON} AtariVox memory: load slot`);
    this.appendDummyInput()
        .appendField('into')
        .appendField(new Blockly.FieldVariable('item'), 'VAR');
    this.setInputsInline(true);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Loads the byte saved in a slot (0 to 255) of the memory of the AtariVox into a variable. A slot that was never saved holds 255. ' +
      'With no AtariVox plugged in the variable is left as it was. It takes a few lines of the picture: do it once, not every frame.');
  },
};

Blockly.Blocks['speech_stop'] = {
  init: function() {
    this.appendDummyInput().appendField(`${SPEECH_ICON} AtariVox stop sending speech`);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Stops sending the rest of the phrase and empties the queue. What the chip has already been sent (up to 64 bytes) is still spoken.');
  },
};

Blockly.Blocks['speech_busy'] = {
  init: function() {
    this.appendDummyInput().appendField(`${SPEECH_ICON} AtariVox is still being sent a phrase`);
    this.setOutput(true, 'Boolean');
    this.setColour(SPEECH_COLOR);
    this.setTooltip('True while the bytes of a phrase are still being sent to the AtariVox, or one is waiting in the queue (the chip may go on speaking ' +
      'a little after it). Use it to wait for the speech to be sent before the next thing.');
  },
};
