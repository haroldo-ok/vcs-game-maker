import {changedVoiceControls, encodeSpeech, SPEAKJET_VOICE, voiceBytes, voiceById} from './speakjet';
import {pronunciationsFor} from './speakjet-dictionary';
import {textToSpeakJetWords} from './speakjet-text';
export {VOICE_NOTE_MIN_MIDI, VOICE_NOTE_MAX_MIDI} from './music-notes';

// Speech with notes (the Music tab): a voice of the Vox tab can be an instrument (an AtariVox card with a voice, see the Sound tab), and a note of it can
// have text. The note says its text at its pitch: the phrase of the note starts with the voice's controls and the PITCH of the note, so the pitch is
// the one of the note for the words of the note (the PITCH control, 0 to 255, takes effect for what comes after it in the same phrase).

// The notes of a voice go from C0 to B3 (see utils/music-notes.js): the PITCH control of the chip goes to 255 (about 247 Hz, B3), and a deep voice is about
// 90 Hz (F#2).

// Whether an instrument is a voice (an AtariVox card with a voice picked, not a sound effect of the chip).
export const isVoiceInstrument = (soundEffect) => !!soundEffect && !!soundEffect.isAtariVox && Number(soundEffect.avoxVoice) > 0;

export const midiToHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

// The PITCH of the chip for a note: its frequency in Hz (the chip's pitch is about that), from 1 to 255.
export const notePitchControl = (midi) => Math.max(1, Math.min(255, Math.round(midiToHz(Number(midi)))));

// The commands of the chip that can be put in the text of a note, as buttons (see the Music tab): each is written between < and >, as in "<SLOW> la <PAUSE60>".
export const SPEECH_COMMANDS = [
  {text: 'FAST', title: 'Say the next sound faster'},
  {text: 'SLOW', title: 'Say the next sound slower'},
  {text: 'STRESS', title: 'Stress the next sound'},
  {text: 'RELAX', title: 'Relax the next sound'},
  {text: 'PAUSE30', title: 'A pause of 30 ms'},
  {text: 'PAUSE60', title: 'A pause of 60 ms'},
  {text: 'PAUSE90', title: 'A pause of 90 ms'},
  {text: 'PAUSE100', title: 'A pause of 100 ms'},
  {text: 'PAUSE200', title: 'A pause of 200 ms'},
  {text: 'PAUSE700', title: 'A pause of 700 ms'},
  ...['SPEED', 'PITCH', 'BEND', 'VOLUME'].map((control) => ({text: `${control} ${SPEAKJET_VOICE[control.toLowerCase()].default}`,
    title: `Set the ${control.toLowerCase()} from here on (0 to ${SPEAKJET_VOICE[control.toLowerCase()].max})`})),
];

// The SpeakJet words of the text of a note, as the Text cards make them (the dictionaries and the pronunciations of the project apply). What is between < and >
// is a command of the chip (see SPEECH_COMMANDS), put in the words as it is.
export const noteSpeechWords = (note, strings) => {
  const text = String((note && note.text) || '').trim();
  if (!text) return '';
  const pronunciations = pronunciationsFor(strings);
  const parts = text.split(/<([^<>]*)>/);
  const words = parts.map((part, index) => (index % 2 ? part.trim().toUpperCase() :
    (part.trim() ? textToSpeakJetWords(part, pronunciations) : ''))).filter(Boolean).join(' ');
  return words.replace(/\s*PAUSE30\s*$/, '').trim();
};

// The bytes of a note's phrase: the controls of the voice other than its pitch, the PITCH of the note, and the words. Empty when the note has no text. The
// controls are the ones the voice sets to other than what the chip has at start (a byte takes a frame to send, and a short note has few of them), or the ones
// that `controls` says (the ROM sends the ones that any voice of the project changes, as the chip may have been left in another voice).
export const noteSpeechBytes = (note, voice, strings, controls = null) => {
  const words = noteSpeechWords(note, strings);
  if (!words) return [];
  const chosen = voiceById(strings.voices, voice && voice.id);
  const sent = (controls || changedVoiceControls(chosen)).filter((control) => control !== 'pitch');
  return [...voiceBytes(chosen, sent), SPEAKJET_VOICE.pitch.code, notePitchControl(note.midi), ...encodeSpeech(words).bytes];
};
