 ifconst title_uniform_48x2
  ; The entry is in one page, so that the branch that picks the loop below takes the same time either way.
  if >. != >[.+$70]
	align 256
  endif
 endif
draw_bmp_48x2_X

	lda #0
	sta GRP0
	sta GRP1

	lda #3
	sta NUSIZ0	;3=Player and Missile are drawn twice 32 clocks apart 
	sta NUSIZ1	;3=Player and Missile are drawn twice 32 clocks apart 

	tsx
	stx stack1 ;save the stack pointer

	jsr position48

	lda #3		;2
	sta VDELP0	;3
	sta VDELP1	;3

	lda #1		;2
	sta CTRLPF	;3

	;enough cycles have passed for the HMOV, so we can clear HMCLR
	sta HMCLR
	sta WSYNC


 ifconst title_uniform_48x2
	; The setup left bit 0 of the color of the first row in stack2: set when the row colors of the frame are one color for every row,
	; which has a separate loop that does not read them. Both ways reach their loop at the same cycle (72) of the line.
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1		;40
	lda stack2		;3
	bne pf48x2_U_entry	;2/3
	sleep 18

	lda aux4		;3
	sta COLUPF		;3

	jmp pf48x2_X_loop 	;3

pf48x2_U_entry
	sleep 17

	lda aux4		;3
	sta COLUPF		;3

	jmp pf48x2_U_loop 	;3
 else
	;sleep (63)		;63
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
	sleep 3

	lda aux4		;3
	sta COLUPF		;3

	jmp pf48x2_X_loop 	;3
 endif

 if >. != >[.+$52]
	align 256
 endif

pf48x2_X_loop

	lda (scorepointers+0),y 	;5
	sta GRP0			;3
	lda (scorepointers+2),y 	;5
	sta GRP1			;3
        lda (scorepointers+4),y         ;5
        sta GRP0                        ;3

        lax (scorepointers+10),y        ;5
        lda (scorepointers+8),y         ;5
        sta stack2                      ;3
        lda (scorepointers+6),y         ;5
        ldy stack2                      ;3

        sta GRP1                        ;3
        sty GRP0                        ;3
        stx GRP1                        ;3
        sty GRP0                        ;3

	ldy aux2			;3

	lda (aux5),y			;5
	sta missile0y			;3

	sleep 3

	dec aux2			;5


	lda (scorepointers+0),y 	;5
	sta GRP0			;3
	lda (scorepointers+2),y 	;5
	sta GRP1			;3
        lda (scorepointers+4),y         ;5
        sta GRP0                        ;3

        lax (scorepointers+10),y        ;5
        lda (scorepointers+8),y         ;5
        sta stack2                      ;3
        lda (scorepointers+6),y         ;5
        ldy stack2                      ;3

        sta GRP1                        ;3
        sty GRP0                        ;3
        stx GRP1                        ;3
        sty GRP0                        ;3

	sleep 4

	lda missile0y
	sta COLUP1
	sta COLUP0

	ldy aux2			;3
	bpl pf48x2_X_loop		;2/3


pf48x2_X_codeend
 ;echo "critical code in 48x2 is ",(pf48x2_X_codeend-pf48x2_X_loop), " bytes long."

	lda #0
	sta GRP0
	sta GRP1
	sta GRP0
	sta GRP1
	sta VDELP0
	sta VDELP1
	sta PF0
	sta PF1
	sta PF2

	ldx stack1 ;restore the stack pointer
	txs
	rts

 ifconst title_uniform_48x2
 ; The loop for a frame whose row colors are one color: the same lines as the loop above, with the color of the row not read (the
 ; colors of the players stay the one the setup gave them).
 if >. != >[.+$52]
	align 256
 endif

pf48x2_U_loop

	lda (scorepointers+0),y 	;5
	sta GRP0			;3
	lda (scorepointers+2),y 	;5
	sta GRP1			;3
        lda (scorepointers+4),y         ;5
        sta GRP0                        ;3

        lax (scorepointers+10),y        ;5
        lda (scorepointers+8),y         ;5
        sta stack2                      ;3
        lda (scorepointers+6),y         ;5
        ldy stack2                      ;3

        sta GRP1                        ;3
        sty GRP0                        ;3
        stx GRP1                        ;3
        sty GRP0                        ;3

	ldy aux2			;3

	sleep 11			;(the row's color: 8, and 3)

	dec aux2			;5


	lda (scorepointers+0),y 	;5
	sta GRP0			;3
	lda (scorepointers+2),y 	;5
	sta GRP1			;3
        lda (scorepointers+4),y         ;5
        sta GRP0                        ;3

        lax (scorepointers+10),y        ;5
        lda (scorepointers+8),y         ;5
        sta stack2                      ;3
        lda (scorepointers+6),y         ;5
        ldy stack2                      ;3

        sta GRP1                        ;3
        sty GRP0                        ;3
        stx GRP1                        ;3
        sty GRP0                        ;3

	sleep 13			;(4, and the 9 of the row's color)

	ldy aux2			;3
	bpl pf48x2_U_loop		;2/3

	lda #0
	sta GRP0
	sta GRP1
	sta GRP0
	sta GRP1
	sta VDELP0
	sta VDELP1
	sta PF0
	sta PF1
	sta PF2

	ldx stack1 ;restore the stack pointer
	txs
	rts
 endif


 ifconst title_ball_48x2
; A 48x2 graphic with the ball behind it (painted on the Title tab's canvas, see titleFrameBallLines in blocks/titlescreen.js). The ball has the
; playfield's color (COLUPF: the color of the box behind the picture) and is behind the players, so it shows where the picture's pixels are off.
; Its loop is in the graphic's kernel copy (pf48x2_N_ball_loop in 48x2_N_kernel.asm): it reads its tables with absolute addresses, which leaves
; the time to turn the ball on or off for each row and to set its width and move it (an HMOVE, at most 7 pixels left or 8 right) for every two
; rows. Those are set on the line before the row, so the ball is on the rows' lines (the loop reads the fourth column of the picture a line
; early to have the time for it; the top row's ENABL is in stack2, see the card's setup). The HMOVE is at the end of a line (cycle 76)
; and blanks the first 8 pixels of the next line, as an HMOVE does.
;
; The card's setup puts the ball's place in missile0y and calls draw_bmp_48x2_XB_place for the ball's line (7 + 6 cycles: with these 11,
; the 24 that draw_bmp_48x2_X takes before position48, so the graphic starts one line lower than without the ball, never two). position48
; returns to the card's setup, which sets the row index (aux2), the end (missile0y), the width of the first rows (CTRLPF) and the address
; of its loop (aux5) on the line after it, and goes on to draw_bmp_48x2_XB.

 if >. != >[.+$60]
	align 256
 endif
draw_bmp_48x2_XB_place
	lda #0
	sta GRP0
	sta GRP1
	sta ENABL
	sta WSYNC
	lda missile0y
	sec
draw_bmp_48x2_XB_div
	sbc #15
	bcs draw_bmp_48x2_XB_div
	eor #7
	asl
	asl
	asl
	asl
	sta HMBL
	sta RESBL
	jmp position48

draw_bmp_48x2_XB

	lda #3
	sta NUSIZ0
	sta NUSIZ1

	tsx
	stx stack1 ;save the stack pointer

	sta VDELP0	;3 (A is 3)
	sta VDELP1	;3

	ldy aux2
	sta WSYNC

	; The loop starts at cycle 86 (10 of the next line): its first line takes 31 cycles before the picture (see pf48x2_N_ball_loop).
	; HMCLR is on this line, not before the WSYNC: there it came while position48's HMOVE was still moving the objects, and the ball then
	; moved on every line. (In place of an inc and a dec of temp1, 10 cycles: temp1 is a picture pointer on the standard kernel,
	; scorepointers+6, so the incs and decs have to stay in pairs.)
	sta HMCLR		;3
	sta HMCLR		;3
	nop			;2
	nop			;2
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1		;40

	lda aux4		;3
	sta COLUPF		;3
	sleep 14
	; The top row's ENABL (stack2, from the card's setup), after the place of the ball on this line (cycle 66).
	lda stack2		;3
	sta ENABL		;3
	sleep 15
	jmp (aux5)		;5

pf48x2_XB_done
	lda #0
	sta GRP0
	sta GRP1
	sta GRP0
	sta GRP1
	sta ENABL
	sta VDELP0
	sta VDELP1
	sta PF0
	sta PF1
	sta PF2
	sta HMCLR
	lda #1
	sta CTRLPF

	ldx stack1 ;restore the stack pointer
	txs
	rts
 endif
