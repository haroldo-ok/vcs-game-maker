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

// On DPC+ the coprocessor does the big divisions and no table has to be kept, so it is always used there (when a block multiplies or
// divides by something that is not a power of 2); the other kernels use it when the Options tab's switch is on.
export const fastMathOn = (configuration) => (configuration.kernel === 'dpcplus' && !configuration.pxe) || !!configuration.enableFastMath;

// The PXE kernel's 6502 has no memory shifts, INY or CPY, which the stock routine uses, so it gets this one: the same entry points and
// results, with the working bytes in the scratch RAM the legalizer reserves (see utils/pxe-legalize.js).
export const getPxeMathSiblingFiles = ({a, t}) => ({
  'div_mul.asm': `mul8
 sty temp1
 sta temp2
 lda #0
 sta ${t}
reptmul8
 lda temp2
 lsr
 sta temp2
 bcc skipmul8
 lda ${t}
 clc
 adc temp1
 sta ${t}
skipmul8
 lda temp1
 asl
 sta temp1
 bne reptmul8
donemul8
 lda ${t}
 RETURN

div8
 sty temp1
 sta ${a}
 lda temp1
 cmp #2
 bcc div8bail
 lda #$ff
 sta ${t}
 lda ${a}
 sec
div8loop
 sbc temp1
 inc ${t}
 bcs div8loop
 lda ${t}
 RETURN
div8bail
 lda ${a}
 RETURN
`,
});
