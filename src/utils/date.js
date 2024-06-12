export const getDateInfix = () => new Date().toISOString().replace(/\..*/, '').replace(/[T:]/g, '-');
