// The Fire block's object list holds the missiles and the ball by their old values ('0', '1', 'ball'), and every
// player by its name ('player0' to 'player9').
export const fireObjectName = (value) => {
  if (value === 'ball') return 'ball';
  if (/^player[0-9]$/.test(value)) return value;
  return `missile${value === '1' ? '1' : '0'}`;
};

export const fireObjectFieldValue = (name) => {
  if (name === 'ball' || /^player[0-9]$/.test(name)) return name;
  return name === 'missile1' ? '1' : '0';
};
