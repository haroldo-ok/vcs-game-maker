; Provided under the CC0 license. See the included LICENSE.txt for details.
;
; Faster replacement for div_mul.asm (the Options tab's "Faster multiply and divide"). Same entry points and
; registers as the original: mul8 takes Y and A and returns A, div8 takes the numerator in A and the divisor in Y
; and returns A, and X is left alone. Multiplying looks the answer up in a table of quarter squares
; (a * b = (a + b)^2 / 4 - (a - b)^2 / 4), so it takes the same time for every pair of numbers, and dividing by
; a number that goes into the numerator 8 times or more shifts and subtracts instead of counting one divisor at a time.

mul8
 sty temp1
 sta temp2
 clc
 adc temp1       ; a + b, low byte, carry for the 9th bit
 tay
 bcs mul8hi
 lda mulsq0,y
 jmp mul8sum
mul8hi
 lda mulsq1,y
mul8sum
 pha             ; the quarter square of a + b
 lda temp2
 sec
 sbc temp1       ; a - b
 bcs mul8abs
 eor #$ff
 adc #1
mul8abs
 tay
 pla
 sec
 sbc mulsq0,y    ; minus the quarter square of |a - b|
 RETURN

div8
 ; a=numerator y=denominator, result in a
 cpy #2
 bcc div8done    ; div by 0 = bad, div by 1=no calc needed, so bail out
 sty temp1
 sta temp2
 lsr
 lsr
 lsr
 cmp temp1
 bcs div8big     ; the answer is 8 or more: shift and subtract
 lda temp2       ; under 8: counting is quicker
 sec
 ldy #$ff
div8loop
 sbc temp1
 iny
 bcs div8loop
 tya
div8done
 RETURN
div8big
 lda #0
 asl temp2
 rol
 bcs div8sub0
 cmp temp1
 bcc div8next0
div8sub0
 sbc temp1
 inc temp2
div8next0
 asl temp2
 rol
 bcs div8sub1
 cmp temp1
 bcc div8next1
div8sub1
 sbc temp1
 inc temp2
div8next1
 asl temp2
 rol
 bcs div8sub2
 cmp temp1
 bcc div8next2
div8sub2
 sbc temp1
 inc temp2
div8next2
 asl temp2
 rol
 bcs div8sub3
 cmp temp1
 bcc div8next3
div8sub3
 sbc temp1
 inc temp2
div8next3
 asl temp2
 rol
 bcs div8sub4
 cmp temp1
 bcc div8next4
div8sub4
 sbc temp1
 inc temp2
div8next4
 asl temp2
 rol
 bcs div8sub5
 cmp temp1
 bcc div8next5
div8sub5
 sbc temp1
 inc temp2
div8next5
 asl temp2
 rol
 bcs div8sub6
 cmp temp1
 bcc div8next6
div8sub6
 sbc temp1
 inc temp2
div8next6
 asl temp2
 rol
 bcs div8sub7
 cmp temp1
 bcc div8next7
div8sub7
 sbc temp1
 inc temp2
div8next7
 lda temp2
 RETURN

 align 256
mulsq0
  .byte $00, $00, $01, $02, $04, $06, $09, $0c, $10, $14, $19, $1e, $24, $2a, $31, $38
  .byte $40, $48, $51, $5a, $64, $6e, $79, $84, $90, $9c, $a9, $b6, $c4, $d2, $e1, $f0
  .byte $00, $10, $21, $32, $44, $56, $69, $7c, $90, $a4, $b9, $ce, $e4, $fa, $11, $28
  .byte $40, $58, $71, $8a, $a4, $be, $d9, $f4, $10, $2c, $49, $66, $84, $a2, $c1, $e0
  .byte $00, $20, $41, $62, $84, $a6, $c9, $ec, $10, $34, $59, $7e, $a4, $ca, $f1, $18
  .byte $40, $68, $91, $ba, $e4, $0e, $39, $64, $90, $bc, $e9, $16, $44, $72, $a1, $d0
  .byte $00, $30, $61, $92, $c4, $f6, $29, $5c, $90, $c4, $f9, $2e, $64, $9a, $d1, $08
  .byte $40, $78, $b1, $ea, $24, $5e, $99, $d4, $10, $4c, $89, $c6, $04, $42, $81, $c0
  .byte $00, $40, $81, $c2, $04, $46, $89, $cc, $10, $54, $99, $de, $24, $6a, $b1, $f8
  .byte $40, $88, $d1, $1a, $64, $ae, $f9, $44, $90, $dc, $29, $76, $c4, $12, $61, $b0
  .byte $00, $50, $a1, $f2, $44, $96, $e9, $3c, $90, $e4, $39, $8e, $e4, $3a, $91, $e8
  .byte $40, $98, $f1, $4a, $a4, $fe, $59, $b4, $10, $6c, $c9, $26, $84, $e2, $41, $a0
  .byte $00, $60, $c1, $22, $84, $e6, $49, $ac, $10, $74, $d9, $3e, $a4, $0a, $71, $d8
  .byte $40, $a8, $11, $7a, $e4, $4e, $b9, $24, $90, $fc, $69, $d6, $44, $b2, $21, $90
  .byte $00, $70, $e1, $52, $c4, $36, $a9, $1c, $90, $04, $79, $ee, $64, $da, $51, $c8
  .byte $40, $b8, $31, $aa, $24, $9e, $19, $94, $10, $8c, $09, $86, $04, $82, $01, $80
mulsq1
  .byte $00, $80, $01, $82, $04, $86, $09, $8c, $10, $94, $19, $9e, $24, $aa, $31, $b8
  .byte $40, $c8, $51, $da, $64, $ee, $79, $04, $90, $1c, $a9, $36, $c4, $52, $e1, $70
  .byte $00, $90, $21, $b2, $44, $d6, $69, $fc, $90, $24, $b9, $4e, $e4, $7a, $11, $a8
  .byte $40, $d8, $71, $0a, $a4, $3e, $d9, $74, $10, $ac, $49, $e6, $84, $22, $c1, $60
  .byte $00, $a0, $41, $e2, $84, $26, $c9, $6c, $10, $b4, $59, $fe, $a4, $4a, $f1, $98
  .byte $40, $e8, $91, $3a, $e4, $8e, $39, $e4, $90, $3c, $e9, $96, $44, $f2, $a1, $50
  .byte $00, $b0, $61, $12, $c4, $76, $29, $dc, $90, $44, $f9, $ae, $64, $1a, $d1, $88
  .byte $40, $f8, $b1, $6a, $24, $de, $99, $54, $10, $cc, $89, $46, $04, $c2, $81, $40
  .byte $00, $c0, $81, $42, $04, $c6, $89, $4c, $10, $d4, $99, $5e, $24, $ea, $b1, $78
  .byte $40, $08, $d1, $9a, $64, $2e, $f9, $c4, $90, $5c, $29, $f6, $c4, $92, $61, $30
  .byte $00, $d0, $a1, $72, $44, $16, $e9, $bc, $90, $64, $39, $0e, $e4, $ba, $91, $68
  .byte $40, $18, $f1, $ca, $a4, $7e, $59, $34, $10, $ec, $c9, $a6, $84, $62, $41, $20
  .byte $00, $e0, $c1, $a2, $84, $66, $49, $2c, $10, $f4, $d9, $be, $a4, $8a, $71, $58
  .byte $40, $28, $11, $fa, $e4, $ce, $b9, $a4, $90, $7c, $69, $56, $44, $32, $21, $10
  .byte $00, $f0, $e1, $d2, $c4, $b6, $a9, $9c, $90, $84, $79, $6e, $64, $5a, $51, $48
  .byte $40, $38, $31, $2a, $24, $1e, $19, $14, $10, $0c, $09, $06, $04, $02, $01, $00
