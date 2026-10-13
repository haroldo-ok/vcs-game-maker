// The four bytes the standard kernel always leaves free (var44-var47), which the Text Minikernel and the sound
// envelopes keep their fixed-name variables in. DPC+ has no such block, so there they sit in the memory of the
// virtual sprites the app never uses (see DPCPLUS_FREED_SPRITE_RAM in generators/bbasic.js): TextDataPtr takes two
// bytes in a row, so the last two are neighbours.
export const DPCPLUS_FIXED_VARIABLE_SLOTS = ['player9x', 'player9y', 'NUSIZ8', 'NUSIZ9'];

// With the last two virtual sprites on (dpcspritemax 8 or 9) their memory is taken, so the four bytes sit in the last four of the
// bonus variable slots (var5 to var8) instead, and the bonus pool is four slots shorter.
export const DPCPLUS_MOVED_FIXED_SLOT_COUNT = 4;
export const DPCPLUS_MOVED_FIXED_FIRST_VAR = 5;
export const dpcPlusFixedSlotsMoved = (spriteMax) => spriteMax >= 8;

export const fixedFreeVariable = (config, number, spriteMax = 1) => {
  if (!config || config.kernel !== 'dpcplus') return `var${number}`;
  return dpcPlusFixedSlotsMoved(spriteMax) ?
    `var${DPCPLUS_MOVED_FIXED_FIRST_VAR + number - 44}` : DPCPLUS_FIXED_VARIABLE_SLOTS[number - 44];
};
