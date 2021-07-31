export const playfieldToMatrix = (text) => text.trim().split('\n')
    .map((line) => line.trim().split('').map((ch) => ch === 'X' ? 1 : 0));
