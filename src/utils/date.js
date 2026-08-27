// Same "YYYY-MM-DD-HH-MM-SS" shape the old toISOString()-based version
// produced, but built from the Date object's own LOCAL getters instead -
// toISOString() always reports UTC regardless of the user's own timezone,
// so a save near midnight (or anywhere with a large UTC offset) landed on
// the wrong calendar day/hour in the filename, confirmed as a real
// reported "you seem hours off in the filename" mismatch against the
// user's own clock.
const pad2 = (n) => String(n).padStart(2, '0');

export const getDateInfix = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}-` +
    `${pad2(d.getHours())}-${pad2(d.getMinutes())}-${pad2(d.getSeconds())}`;
};
