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
	; The setup left bit 0 of the color of the first row in temp6: set when the row colors of the frame are one color for every row,
	; which has a separate loop that does not read them. Both ways reach their loop at the same cycle (72) of the line.
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1
 	inc temp1
 	dec temp1		;40
	lda temp6		;3
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
