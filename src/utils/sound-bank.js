import {max} from 'lodash';

import {audcHasTunableNotes, notesForAudc} from './music-notes';

// A sound bank file holds either a whole bank ({soundEffects: [...]}) or one
// single sound effect alone (its parameters at the top level, as saved by a
// sound effect card's export). Returns the sound effects inside, or throws if
// the file is neither.
export const soundEffectsInBankFile = (bankData) => {
  if (bankData && Array.isArray(bankData.soundEffects)) return bankData.soundEffects;
  if (bankData && typeof bankData === 'object' && 'audc' in bankData) return [bankData];
  throw new Error('File does not contain valid sound bank data');
};

// The rows of the import popup, one per sound in the file. isExisting marks a
// sound whose name matches one already in the project (importing it replaces
// that one's parameters).
export const buildSoundBankImportEntries = (bankData, soundEffects) =>
  soundEffectsInBankFile(bankData).map((imported) => ({
    data: imported,
    name: imported.name || 'Unnamed sound effect',
    selected: true,
    // Whether a sound that matches an existing one's name replaces it (the
    // popup offers this as "Replace existing" when there is only one sound);
    // unticked, it is added as a new sound effect instead.
    replace: true,
    isExisting: !!(imported.name && soundEffects.find((o) => o.name === imported.name)),
  }));

// Frequency items only offered for a type with well-defined notes, so a sound
// from a file whose AUDF isn't one of them is moved to the closest valid one.
export const snapAudfToValid = (soundEffect) => {
  if (!audcHasTunableNotes(soundEffect.audc)) return;
  const items = notesForAudc(soundEffect.audc);
  if (!items.length || items.some(({value}) => value === soundEffect.audf)) return;
  let closest = items[0];
  items.forEach((item) => {
    if (Math.abs(item.value - soundEffect.audf) < Math.abs(closest.value - soundEffect.audf)) closest = item;
  });
  soundEffect.audf = closest.value;
};

// Adds the checked entries to the project's sound effects (the array is
// changed in place). An entry whose name matches an existing sound effect
// replaces that one's parameters and keeps its id, so everything already
// pointing at that id keeps working; any other entry becomes a new one.
export const importSoundBankEntries = (soundEffects, entries) => {
  let maxId = max(soundEffects.map((o) => o.id)) || 0;
  entries.forEach((entry) => {
    if (!entry.selected) return;
    const imported = entry.data;
    // The kernel the file was made for is only information about the file; the project's kernel decides what
    // kind of sound a sound is (see hooks/sound-kernel.js, which converts it).
    // eslint-disable-next-line no-unused-vars
    const {id, kernel, developer, website, ...importedData} = imported;
    const existing = entry.replace !== false && imported.name && soundEffects.find((o) => o.name === imported.name);
    if (existing) {
      delete existing.dpcShape;
      delete existing.dpcFrequency;
      delete existing.dpcWave;
      delete existing.dpcWaveBars;
      Object.assign(existing, importedData, {id: existing.id});
      snapAudfToValid(existing);
    } else {
      maxId += 1;
      // A new copy of a name already in use gets a number, so later imports
      // by name still find the original.
      let name = imported.name || `Sound effect ${maxId}`;
      for (let copy = 2; soundEffects.some((o) => o.name === name); copy++) {
        name = `${imported.name} ${copy}`;
      }
      const newSoundEffect = {...importedData, id: maxId, name};
      soundEffects.push(newSoundEffect);
      snapAudfToValid(newSoundEffect);
    }
  });
};
