import {max} from 'lodash';

import {VOICE_CONTROLS, voiceControlValue} from './speakjet';

// A voice file holds either a whole bank ({voices: [...]}, a .vcsvbnk file) or one voice alone (its name and controls at the top level, a .vcsvox
// file, as saved by the export of a voice card). Returns the voices inside, or throws if the file is neither.
export const voicesInFile = (data) => {
  if (data && Array.isArray(data.voices) && data.voices.length) return data.voices;
  if (data && typeof data === 'object' && !Array.isArray(data) && VOICE_CONTROLS.some((control) => control in data)) return [data];
  throw new Error('File does not contain valid voice data');
};

// What of a voice goes into a file, and what is taken from one: the name and the four controls (not the ID, which only means something in the
// project that numbered it, and not what the file says about itself).
export const voiceFields = (voice) => ({
  name: voice.name,
  ...Object.fromEntries(VOICE_CONTROLS.map((control) => [control, voiceControlValue(voice, control)])),
});

// The rows of the import popup, one per voice in the file. isExisting marks a voice whose name matches one already in the project (importing it
// replaces the controls of that one).
export const buildVoiceImportEntries = (data, voices) => voicesInFile(data).map((imported) => ({
  data: imported,
  name: imported.name || 'Unnamed voice',
  selected: true,
  replace: true,
  isExisting: !!(imported.name && voices.find((voice) => voice.name === imported.name)),
}));

// Adds the checked entries to the project's voices (the array is changed in place). An entry whose name matches a voice replaces its controls and
// keeps its ID, so the blocks that use that ID keep working; any other entry becomes a new voice with the next free ID.
export const importVoiceEntries = (voices, entries) => {
  let maxId = max(voices.map((voice) => Number(voice.id))) || 0;
  entries.forEach((entry) => {
    if (!entry.selected) return;
    const imported = entry.data;
    const existing = entry.replace !== false && imported.name && voices.find((voice) => voice.name === imported.name);
    if (existing) {
      Object.assign(existing, voiceFields(imported));
    } else {
      maxId += 1;
      // A copy of a name that is in use gets a number, so a later import by name still finds the original.
      let name = imported.name || `Voice ${maxId}`;
      for (let copy = 2; voices.some((voice) => voice.name === name); copy++) name = `${imported.name} ${copy}`;
      voices.push({id: maxId, ...voiceFields(imported), name});
    }
  });
};
