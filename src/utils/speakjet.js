import {SPEAKJET_ALLOPHONES, SPEAKJET_SOUND_EFFECTS} from './speakjet-codes';

// What the Speech blocks send the AtariVox's SpeakJet chip. A phrase is typed as words separated by spaces:
//  - an allophone (IY, HE, EHLL, ...) or a sound effect (R0, A3, B1, M2, ...), by its SpeakJet name;
//  - a pause or a change of the speech: PAUSE30, PAUSE60, PAUSE90, PAUSE100 (PAUSE1000 is the old name of it), PAUSE200, PAUSE700, FAST, SLOW, STRESS, RELAX;
//  - VOLUME, SPEED, PITCH, BEND, DELAY or PORT with a number after it (VOLUME 100), which the chip takes as the next byte;
//  - #n for any byte (0 to 254) as it is, for what none of the above says.
// Letters can be either case; a comma, a dot or a new line counts as a space.

export const SPEAKJET_END = 255;

const WORD_CODES = new Map();
SPEAKJET_ALLOPHONES.concat(SPEAKJET_SOUND_EFFECTS).forEach(([code, name]) => WORD_CODES.set(name, code));
const CONTROL_CODES = {
  PAUSE100: 1, PAUSE1000: 1, PAUSE200: 2, PAUSE700: 3, PAUSE30: 4, PAUSE60: 5, PAUSE90: 6, FAST: 7, SLOW: 8, STRESS: 14, RELAX: 15, WAIT: 16, RESET: 31,
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

// The voice of the chip: each control's code, the value it has at start and the largest it takes (see the AtariVox set blocks).
export const SPEAKJET_VOICE = {
  volume: {code: 20, default: 96, max: 127},
  speed: {code: 21, default: 114, max: 127},
  pitch: {code: 22, default: 88, max: 255},
  bend: {code: 23, default: 5, max: 15},
};
// The controls an effect follows: its volume and its bend (which moves the pitch of an effect). The speed and the pitch of the voice are only for speech
// sounds in the chip's model, so an effect has no field for them.
const EFFECT_CONTROLS = ['volume', 'bend'];
const VOICE_FIELDS = {bend: 'avoxBend'};
export const voiceValueOf = (soundEffect, control) => {
  // The volume is the card's Volume (0 to 15, the same field as for the console's sounds): 15 is the volume the chip has at start, the others are
  // that much of it.
  if (control === 'volume') {
    const audv = Number(soundEffect.audv);
    return Number.isFinite(audv) ? Math.max(0, Math.min(15, Math.round(audv))) * SPEAKJET_VOICE.volume.default / 15 | 0 : SPEAKJET_VOICE.volume.default;
  }
  const value = Number(soundEffect[VOICE_FIELDS[control]]);
  return Number.isFinite(value) ? Math.max(0, Math.min(SPEAKJET_VOICE[control].max, Math.round(value))) : SPEAKJET_VOICE[control].default;
};
// The controls of the voice that any of the cards sets to something other than the start value. The chip keeps a voice setting until it is
// changed, so every effect of a project sends the controls any of them changes (a card at the start value sends it too, to undo another's).
export const touchedVoiceControls = (soundEffects) => EFFECT_CONTROLS
    .filter((control) => soundEffects.some((soundEffect) => voiceValueOf(soundEffect, control) !== SPEAKJET_VOICE[control].default));
// The bytes of an AtariVox effect card: its voice controls (the ones in `controls`; with none, the ones it sets itself), then the effect.
export const avoxEffectBytes = (soundEffect, controls = touchedVoiceControls([soundEffect])) => {
  const bytes = [];
  controls.forEach((control) => bytes.push(SPEAKJET_VOICE[control].code, voiceValueOf(soundEffect, control)));
  return [...bytes, ...encodeSpeech(String(soundEffect.avoxEffect || '')).bytes];
};

// The voices of the project (the cards of the Text tab's AtariVox Voice section, kept with the text messages): a name and the four controls.
// A message, a say block or the numbers say with a voice; the speech starts by putting the chip in its controls.
export const VOICE_CONTROLS = Object.keys(SPEAKJET_VOICE);
export const DEFAULT_VOICE_ID = 1;
export const newVoice = (id, name) => ({id, name, volume: SPEAKJET_VOICE.volume.default, speed: SPEAKJET_VOICE.speed.default,
  pitch: SPEAKJET_VOICE.pitch.default, bend: SPEAKJET_VOICE.bend.default});
export const voiceControlValue = (voice, control) => {
  const value = Number((voice || {})[control]);
  return Number.isFinite(value) ? Math.max(0, Math.min(SPEAKJET_VOICE[control].max, Math.round(value))) : SPEAKJET_VOICE[control].default;
};
// The voice with an id (the first one for an id nothing has).
export const voiceById = (voices, id) => (voices || []).find((voice) => Number(voice.id) === Number(id)) || (voices || [])[0] || newVoice(DEFAULT_VOICE_ID, 'Default');
// The controls a voice has set to something other than the value the chip starts with.
export const changedVoiceControls = (voice) => VOICE_CONTROLS.filter((control) => voiceControlValue(voice, control) !== SPEAKJET_VOICE[control].default);
// The bytes that put the chip in the voice, in the given controls (the ones the voice changes when none are given).
export const voiceBytes = (voice, controls = changedVoiceControls(voice)) => {
  const bytes = [];
  controls.forEach((control) => bytes.push(SPEAKJET_VOICE[control].code, voiceControlValue(voice, control)));
  return bytes;
};
