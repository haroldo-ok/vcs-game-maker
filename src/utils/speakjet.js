import {SPEAKJET_ALLOPHONES, SPEAKJET_SOUND_EFFECTS} from './speakjet-codes';

// What the Speech blocks send the AtariVox's SpeakJet chip. A phrase is typed as words separated by spaces:
//  - an allophone (IY, HE, EHLL, ...) or a sound effect (R0, A3, B1, M2, ...), by its SpeakJet name;
//  - a pause or a change of the speech: PAUSE30, PAUSE60, PAUSE90, PAUSE200, PAUSE700, PAUSE1000, FAST, SLOW, STRESS, RELAX;
//  - VOLUME, SPEED, PITCH, BEND, DELAY or PORT with a number after it (VOLUME 100), which the chip takes as the next byte;
//  - #n for any byte (0 to 254) as it is, for what none of the above says.
// Letters can be either case; a comma, a dot or a new line counts as a space.

export const SPEAKJET_END = 255;

const WORD_CODES = new Map();
SPEAKJET_ALLOPHONES.concat(SPEAKJET_SOUND_EFFECTS).forEach(([code, name]) => WORD_CODES.set(name, code));
const CONTROL_CODES = {
  PAUSE1000: 1, PAUSE200: 2, PAUSE700: 3, PAUSE30: 4, PAUSE60: 5, PAUSE90: 6, FAST: 7, SLOW: 8, STRESS: 14, RELAX: 15, WAIT: 16, RESET: 31,
};
// The codes that are followed by a number.
const NUMBER_CODES = {VOLUME: 20, SPEED: 21, PITCH: 22, BEND: 23, PORTCTR: 24, PORT: 25, DELAY: 30};

export const SPEAKJET_WORDS = [
  ...Object.keys(CONTROL_CODES), ...Object.keys(NUMBER_CODES).map((word) => `${word} n`),
  ...SPEAKJET_ALLOPHONES.map(([, name]) => name), ...SPEAKJET_SOUND_EFFECTS.map(([, name]) => name),
];

// The bytes of a phrase, and the words it did not understand (each is left out of the bytes).
export const encodeSpeech = (text) => {
  const words = String(text || '').toUpperCase().split(/[\s,.;]+/).filter(Boolean);
  const bytes = [];
  const unknown = [];
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (WORD_CODES.has(word)) bytes.push(WORD_CODES.get(word));
    else if (word in CONTROL_CODES) bytes.push(CONTROL_CODES[word]);
    else if (word in NUMBER_CODES) {
      const value = Number(words[i + 1]);
      if (Number.isInteger(value) && value >= 0 && value <= 254) {
        bytes.push(NUMBER_CODES[word], value);
        i++;
      } else {
        unknown.push(`${word} needs a number from 0 to 254`);
      }
    } else if (/^#\d+$/.test(word) && Number(word.slice(1)) <= 254) bytes.push(Number(word.slice(1)));
    else unknown.push(word);
  }
  return {bytes, unknown};
};
