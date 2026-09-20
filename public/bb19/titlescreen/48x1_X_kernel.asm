draw_bmp_48x1_X

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

	inc temp1 ;5
	dec temp1 ;5
	inc temp1 ;5
	dec temp1 ;5
	inc temp1 ;5
	dec temp1 ;5
	inc temp1 ;5
	dec temp1 ;5
	inc temp1 ;5
	dec temp1 ;5

        sleep 5

	iny

	jmp pf48x1_X_loop_entry 

 if >. != >[.+$2a]
	align 256
 endif

pf48x1_X_loop_entry
pf48x1_X_loop
	dey         ;2
        sty aux2    ;3
	lda (scorepointers+0),y 	;5
	sta GRP0			;3

	lda (scorepointers+2),y 	;5
	sta GRP1			;3
        lda (scorepointers+4),y         ;5
        sta GRP0                        ;3

        sleep 2 ; I could make this indirect, if we want to burn more rom 
	lda aux4  ;3
	sta COLUPF  ;3 this is a big fat waste...

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
	bne pf48x1_X_loop		;2/3

pf48x1_X_codeend
 ;echo "critical code in 48x1 is ",(pf48x1_X_codeend-pf48x1_X_loop), " bytes long."

	lda #0
	sta GRP0
	sta GRP1
	sta GRP0
	sta GRP1
	sta ENABL
	sta ENAM0
	sta VDELP0
	sta VDELP1
	sta PF0
	sta PF1
	sta PF2

	ldx stack1 ;restore the stack pointer
	txs
	rts
