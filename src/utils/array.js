// Based on https://stackoverflow.com/a/16436975/679240
export const isArrayEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; ++i) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

export const isMatrixEqual = (a, b) => {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (a.length !== b.length) return false;

  for (let i = 0; i < a.length; ++i) {
    if (!isArrayEqual(a[i], b[i])) return false;
  }

  return true;
};

export const copyMatrix = (original) => original.map((row) => row.slice());
