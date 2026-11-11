; The player minikernel - display 2 different players, 1 line resolution
;
; Adapted from the Titlescreen Kernel 1.8's own examples/ex5-player_and_
; playfield/titlescreen/asm/player_kernel.asm. Only change from the
; original: the setup-phase REFP0/REFP1/NUSIZ0/NUSIZ1 overrides (which
; reset those registers from bmp_player0_refp/bmp_player0_nusiz/etc every
; call) now take the width/quantity the game set with the "Player 0/1 set
; width/quantity" block (player0size/player1size, one copy by default),
; instead of a fixed value, since the bitmap kernels above leave the
; registers on "three copies". The horizontal flip blocks (Actions tab)
; write REFP0/REFP1 themselves. This does not affect the routine's
; cycle-exact timing below - it's plain sequential setup code that runs
; once per call, well before the real per-scanline WSYNC loop begins.

; What every page does after its routine has set its numbers (the line count in temp1, the heights less one and the pointers to the
; pictures and colors, see buildPlayerDataAsm in generators/bbasic/titlescreen.js): position the sprites, set their size and keep
; their y. The page's routine jumps here (a jsr would put one more return address on the stack, where TSpositionp0p1's "sta stack1,X"
; writes). The page's numbers are set before the sprites are placed, so the setup ends a line earlier than with them after: one more
; WSYNC keeps the first line of the sprites where it was.
 MAC TITLE_PLAYER_BEGIN

	jsr TSpositionp0p1

	; The bitmap kernels leave NUSIZ0/NUSIZ1 on "three copies", so the sprites would show up
	; repeated. Put back what the game set with "Player 0/1 set width/quantity" (one copy unless
	; it chose otherwise); the top bit of player0size is only a flag of the title screen loop,
	; and NUSIZ ignores it.
	lda player0size
	sta NUSIZ0
	lda player1size
	sta NUSIZ1

	lda player0y
	sta temp2
	lda player1y
	sta temp3

	lda #1
	sta VDELP0
	lda #0
	sta GRP1
	sta GRP0
	sta WSYNC
 ENDM

 ifconst title_player_k1
draw_player_go_k1
	TITLE_PLAYER_BEGIN
	lda #0
	; The first line reads (player1color),y before anything has set y, and it was left at $FF by the code above. With the
	; color table in the wrong place, table + $FF is a bank switching address: reading it switched banks in the middle of
	; the kernel and the frame ran for hundreds of scanlines (a green flicker, the sprites never drawn).
	tay
draw_players_k1
        sta WSYNC
        sta GRP1		;3
        lda (player1color),y	;5
	sta COLUP1		;3
	stx COLUP0		;3

	lda player0height	;3
	dcp player0y		;5
	bcc skipdrawP0_k1		;2/3
 	ldy player0y		;3
	lda (player0pointer),y	;5+
continueP0_k1
        sta GRP0		;3

        lax (player0color),y	;5+
				;=29++

	lda player1height	;3
	dcp player1y		;5
	bcc skipdrawP1_k1		;2/3
 	ldy player1y		;3
	lda (player1pointer),y	;5
continueP1_k1

	dec temp1		;5
	bne draw_players_k1	;2/3
	sta WSYNC
        sta GRP1		;3
        sta GRP0		;3
				;=8
	lda #0
	sta GRP0
	sta GRP1
	sta REFP0
	sta REFP1
	sta VDELP1

restore_variables_k1
	lda temp2
	sta player0y
	lda temp3
	sta player1y

	rts

skipdrawP0_k1
	lda #0		;2
	tay		;2
	jmp continueP0_k1	;5

skipdrawP1_k1
	lda #0		;2
	tay		;2
	jmp continueP1_k1	;5
 endif

 ifconst title_player_k2
draw_player_go_k2
	TITLE_PLAYER_BEGIN
	lda #0
	; The first line reads (player1color),y before anything has set y, and it was left at $FF by the code above. With the
	; color table in the wrong place, table + $FF is a bank switching address: reading it switched banks in the middle of
	; the kernel and the frame ran for hundreds of scanlines (a green flicker, the sprites never drawn).
	tay
draw_players_k2
        sta WSYNC
        sta GRP1		;3
        lda (player1color),y	;5
	sta COLUP1		;3
	stx COLUP0		;3

	lda player0height	;3
	dcp player0y		;5
	bcc skipdrawP0_k2		;2/3
 	ldy player0y		;3
	lda (player0pointer),y	;5+
continueP0_k2
        sta GRP0		;3

        lax (player0color),y	;5+
				;=29++

        sta WSYNC
	lda player1height	;3
	dcp player1y		;5
	bcc skipdrawP1_k2		;2/3
 	ldy player1y		;3
	lda (player1pointer),y	;5
continueP1_k2

	dec temp1		;5
	bne draw_players_k2	;2/3
	sta WSYNC
        sta GRP1		;3
        sta GRP0		;3
				;=8
	lda #0
	sta GRP0
	sta GRP1
	sta REFP0
	sta REFP1
	sta VDELP1

restore_variables_k2
	lda temp2
	sta player0y
	lda temp3
	sta player1y

	rts

skipdrawP0_k2
	lda #0		;2
	tay		;2
	jmp continueP0_k2	;5

skipdrawP1_k2
	lda #0		;2
	tay		;2
	jmp continueP1_k2	;5
 endif

   if >. != >[.+$55]
      align 256
   endif

TSpositionp0p1
        ldx #1
        lda player0x
        sta aux5
        lda player1x
        sta aux6
TSpositionp0p1Loop
        lda aux5,x
        clc
        adc TSadjust,x
	cmp #161
	bcc TSskipadjust
	sec
	sbc #160
TSskipadjust
        sta aux5,x
        sta WSYNC
        sta HMCLR       ; clear out HMP*
        SLEEP 2
TSHorPosLoop       ;     5
        lda aux5,x  ;+4   9
        sec           ;+2  11
TSDivLoop
        sbc #15
        bcs TSDivLoop;+4  15
        sta stack1,X    ;+4  19
        sta RESP0,X   ;+4  23
        sta WSYNC

        ldy stack1,X            ;+4
        lda TSrepostable-256,Y  ;+4
        sta HMP0,X              ;+4
                                ;=12
        ldy #10 ;+2
wastetimeloop1
        dey ;2
        bpl wastetimeloop1 ;3/2
        sleep 2
        sta HMOVE
	dex
	bpl TSpositionp0p1Loop
        rts

   .byte $80,$70,$60,$50,$40,$30,$20,$10,$00
   .byte $F0,$E0,$D0,$C0,$B0,$A0,$90
TSrepostable

TSadjust
   .byte 9,17

 ; DPC doesn't have these adjacent in memory. Ughh.
TSregister
   .byte player0x,player1x
