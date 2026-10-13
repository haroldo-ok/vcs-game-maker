'use strict';

// The Options tab's "Faster multiply and divide": a div_mul.asm that looks products up in a table and shifts and
// subtracts for large quotients (see public/bb19/includes/div_mul_fast.asm). Placed next to the compiled source,
// it is found before the stock div_mul.asm that the generated code inlines.
//
// The tables do not fit in the DPC+ kernel's bank, so there the big quotients go to the coprocessor instead
// (div_mul_dpc.asm, function 40 of the coprocessor program in custom/main.c).
const cache = {};
export const getFastMathSiblingFiles = (kernel) => {
  const dpcPlus = kernel === 'dpcplus';
  const key = dpcPlus ? 'dpcplus' : 'table';
  if (!cache[key]) {
    cache[key] = dpcPlus ?
      fetch('bb19/includes/div_mul_dpc.asm').then((r) => r.text()).then((text) => ({'div_mul.asm': text})) :
      fetch('bb19/includes/div_mul_fast.asm').then((r) => r.text()).then((text) => ({'div_mul.asm': text}));
  }
  return cache[key];
};
