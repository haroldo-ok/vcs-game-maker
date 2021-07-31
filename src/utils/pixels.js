export const playfieldToMatrix = (text) => text.trim().split('\n')
    .map((line) => line.trim().split('').map((ch) => ch === 'X' ? 1 : 0));

export const matrixToPlayfield = (matrix) => matrix
    .map((line) => line.map((pixel) => pixel ? 'X' : '.').join(''))
    .join('\n').trim();
