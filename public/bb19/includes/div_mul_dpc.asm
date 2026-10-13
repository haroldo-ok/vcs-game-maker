; Provided under the CC0 license. See the included LICENSE.txt for details.
;
; Faster replacement for div_mul.asm on the DPC+ kernel (the Options tab's "Faster multiply and divide"). Same entry
; points and registers as the original. Dividing by a number that goes into the numerator fewer than 8 times is counted
; on the 6502; anything bigger is handed to the coprocessor (function 40 of the program in custom/main.c), which
; divides in a fixed number of steps.

mul8
 sty temp1
 sta temp2
 lda #0
reptmul8
 lsr temp2
 bcc skipmul8
 clc
 adc temp1
skipmul8
 asl temp1
 bne reptmul8
donemul8
 RETURN

div8
 cpy #2
 bcc div8done
 sty temp1
 sta temp2
 lsr
 lsr
 lsr
 cmp temp1
 bcs div8arm       ; quotient is 8 or more
 lda temp2
 sec
 ldy #$ff
div8loop
 sbc temp1
 iny
 bcs div8loop
 tya
div8done
 RETURN
div8arm
 lda #<C_function
 sta DF0LOW
 lda #(>C_function) & $0F
 sta DF0HI
 lda #40
 sta DF0WRITE
 lda temp2
 sta DF0WRITE
 lda temp1
 sta DF0WRITE
 lda #255
 sta CALLFUNCTION
 lda DF0DATA
 RETURN
