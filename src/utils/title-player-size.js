// The width and number of copies of a player of the title screen: the code the TIA takes (NUSIZ, 0 to 7), as the options of "Player set width/quantity".
// A card saved by an older version has the width as player0Width/player1Width (2 or 4: double and quad size) instead of player0Size/player1Size.
export const TITLE_PLAYER_SIZE_OPTIONS = [
  {text: '1 copy', value: 0},
  {text: '2 close', value: 1},
  {text: '2 medium', value: 2},
  {text: '3 close', value: 3},
  {text: '2 wide', value: 4},
  {text: 'Double size', value: 5},
  {text: '3 medium', value: 6},
  {text: 'Quad size', value: 7},
];

const LEGACY_WIDTH_CODES = {2: 5, 4: 7};

// The code of a player of a Player card: 0 (one copy, which needs no setting) when nothing is set.
export const titlePlayerSizeCode = (card, player) => {
  const size = card[`player${player}Size`];
  if (size !== undefined && size !== null && size !== '' && Number.isInteger(Number(size))) return Math.max(0, Math.min(7, Number(size)));
  return LEGACY_WIDTH_CODES[Number(card[`player${player}Width`])] || 0;
};
