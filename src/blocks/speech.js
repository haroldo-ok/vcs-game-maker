import * as Blockly from 'blockly/core';

import {SPEECH_ICON} from './icon';
import {buildTextStringOptions} from './text-strings';

// (The Sound category's color: the Speech blocks sit in it.)
const SPEECH_COLOR = 'rgb(156, 39, 176)';

// The AtariVox's SpeakJet speech chip (see generators/bbasic/speech.js). "say text" reads a message of the Text tab (turned into speech when
// the project is built, see utils/speakjet-text.js); "say phonemes" takes a phrase typed as SpeakJet words (see utils/speakjet.js).
Blockly.Blocks['speech_say_text'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SPEECH_ICON} AtariVox say text`)
        .appendField(new Blockly.FieldDropdown(buildTextStringOptions), 'TEXT_ID');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Speaks a message of the Text tab through an AtariVox (a speech chip in the Player 2 controller port). The text is turned into ' +
      'speech sounds when the project is built, by rules for English: most plain words are understood, but not all (numbers are spoken as ' +
      'words). For a phrase that has to be exactly right use "AtariVox say phonemes". The phrase goes out a byte a frame while the game runs, ' +
      'and the game goes on at once. To hear it in the preview, turn on AtariVox in the Emulator Settings (it is switched on for you when the ' +
      'project has a Speech block, and the preview then runs gopher2600). All the speech of a project together takes at most 254 bytes. The ' +
      'Player 2 joystick can not be used with the AtariVox.');
  },
};

Blockly.Blocks['speech_say'] = {
  init: function() {
    this.appendDummyInput()
        .appendField(`${SPEECH_ICON} AtariVox say phonemes`)
        .appendField(new Blockly.FieldTextInput('HE EH LE OWWW'), 'TEXT');
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Speaks a phrase of SpeakJet words through an AtariVox (a speech chip in the Player 2 controller port). The words are ' +
      'separated by spaces: allophones (the sounds of speech, like HE EH LE OWWW for "hello"), sound effects (R0 to R9 robot, A0 to A9 alarm, ' +
      'B0 to B9 beeps, C0 to C9 biological, D0 to D11 tones, M0 to M2 miscellaneous), PAUSE30 / PAUSE60 / PAUSE90 / PAUSE200 / PAUSE700 / ' +
      'PAUSE1000, FAST, SLOW, STRESS, RELAX, VOLUME n, SPEED n, PITCH n and BEND n (n from 0 to 254), or #n for any byte. The phrase goes out ' +
      'a byte a frame while the game runs, and the game goes on at once. To hear it in the preview, turn on AtariVox in the Emulator ' +
      'Settings (the preview then runs gopher2600; it is switched on for you when the project has a Speech block). All the phrases of a project ' +
      'together take at most 254 bytes. The Player 2 joystick can not be used with the AtariVox.');
  },
};

Blockly.Blocks['speech_stop'] = {
  init: function() {
    this.appendDummyInput().appendField(`${SPEECH_ICON} AtariVox stop sending speech`);
    this.setPreviousStatement(true, null);
    this.setNextStatement(true, null);
    this.setColour(SPEECH_COLOR);
    this.setTooltip('Stops sending the rest of the phrase. What the chip has already been sent is still spoken.');
  },
};

Blockly.Blocks['speech_busy'] = {
  init: function() {
    this.appendDummyInput().appendField(`${SPEECH_ICON} AtariVox is still being sent a phrase`);
    this.setOutput(true, 'Boolean');
    this.setColour(SPEECH_COLOR);
    this.setTooltip('True while the bytes of a phrase are still being sent to the AtariVox (the chip may go on speaking a little after it).');
  },
};
