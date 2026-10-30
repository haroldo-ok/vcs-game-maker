'use strict';

// A sound card can have two sets of the settings that shape how a sound plays over time: the ones of the TIA (the fields of the card itself, the
// Standard settings) and, in "arm", the ones of the DPC+ sound chip. A card without "arm" plays on both chips with the one set, as cards
// always did. Everything that plays or generates a sound for the chip takes the card through dpcSettings, so only what a chip plays
// is used: a sound that is never played on the chip never has its "arm" settings read, and one that is only played on the chip never
// has the TIA's.
//
// The settings in the two sets: the volume and length, the volume envelope and the staircase, the frequency sweep and envelope, and the
// arpeggio. (Not the sound's type and divider, which are the TIA's, nor the waveform and the pitch of the chip, which are the chip's: they
// are not shared in the first place. Nor the priority, the kind of sound or the color, which are the card's.)
export const CHIP_SETTING_KEYS = [
  'audv', 'duration',
  'envelope', 'envelopeAttack', 'envelopeAttackEnd', 'envelopeDecay', 'envelopeDecayEnd', 'envelopeSustain', 'envelopeSustainLength', 'envelopeReleaseStart',
  'envelopeRelease',
  'staircase', 'staircaseStep', 'staircaseFrames',
  'sweep', 'sweepStep', 'sweepFrames', 'sweepRepeat', 'sweepWrap',
  'pitchEnvelope', 'pitchEnvelopeAmount', 'pitchEnvelopeAttack', 'pitchEnvelopeAttackEnd', 'pitchEnvelopeDecay', 'pitchEnvelopeDecayEnd',
  'pitchEnvelopeSustainLength', 'pitchEnvelopeReleaseStart', 'pitchEnvelopeRelease',
  'arpeggio', 'arpeggioDivision', 'arpeggioInterval', 'arpeggioRange',
];

// Whether the card has settings of the DPC+ chip that are separate from the TIA's.
export const hasSeparateArm = (card) => !!(card && card.arm && typeof card.arm === 'object');

// The card as the DPC+ chip plays it: the settings of the chip over the card's (the card itself when it has no separate ones).
export const dpcSettings = (card) => (hasSeparateArm(card) ? {...card, ...card.arm} : card);

// The card as the chip of a channel plays it: chipChannel says whether the channel is played by the DPC+ chip.
export const settingsForChannel = (card, chipChannel) => (chipChannel ? dpcSettings(card) : card);

// The settings of the chip a card has now, as a new set to start from (the TIA's values, so the sound plays the same until a value is
// changed).
export const armSettingsFrom = (card) => {
  const arm = {};
  CHIP_SETTING_KEYS.forEach((key) => {
    if (card[key] !== undefined) arm[key] = card[key];
  });
  return arm;
};

// What an editor changes for the chip it shows: the card's settings, or the separate ones of the chip when the card has them and the chip is
// the DPC+ one.
export const settingsOfView = (card, chipView) => (chipView && hasSeparateArm(card) ? card.arm : card);
