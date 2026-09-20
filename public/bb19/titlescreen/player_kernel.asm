; The player minikernel - display 2 different players, 1 line resolution
;
; Adapted from the Titlescreen Kernel 1.8's own examples/ex5-player_and_
; playfield/titlescreen/asm/player_kernel.asm. Only change from the
; original: the setup-phase REFP0/REFP1/NUSIZ0/NUSIZ1 overrides (which
; unconditionally reset those registers from bmp_player0_refp/bmp_player0_
; nusiz/etc every call) were removed - VCS Game Maker's own "Player 0/1 set
; width/quantity"/"horizontal flip" blocks (Actions tab) already write
; those exact same registers, and this minikernel is meant to draw whatever
; the game already configured there rather than silently reset it back to
; "normal size, no flip" every frame. This is safe to remove without
; affecting the routine's own cycle-exact timing below - it's plain
; sequential setup code that runs once per call, well before the real
; per-scanline WSYNC loop begins.

draw_player_display

	jsr TSpositionp0p1

save_variables
	lda player0y
	sta temp2
	lda player1y
	sta temp3

init_variables
	lda #(bmp_player_window+1)
	sta temp1 ; our line count
	lda #1
	sta VDELP0
	lda #0
	sta GRP1
	sta GRP0
	lda #(bmp_player0_height-1)
	sta player0height
	lda #(bmp_player1_height-1)
	sta player1height

	lda #<bmp_player0
 ifconst bmp_player0_index
	clc
	adc bmp_player0_index
 endif
	sta player0pointer
	lda #>bmp_player0
 ifconst bmp_player0_index
	adc #0
 endif
	sta player0pointer+1

	lda #<bmp_color_player0
 ifconst bmp_player0_index
	clc
	adc bmp_player0_index
 endif
	sta player0color
	lda #>bmp_color_player0
 ifconst bmp_player0_index
	adc #0
 endif
	sta player0color+1


	lda #<bmp_player1
 ifconst bmp_player1_index
	clc
	adc bmp_player1_index
 endif
	sta player1pointer
	lda #>bmp_player1
 ifconst bmp_player1_index
	adc #0
 endif
	sta player1pointer+1

	lda #<bmp_color_player1
 ifconst bmp_player1_index
	clc
	adc bmp_player1_index
 endif
	sta player1color
	lda #>bmp_color_player1
 ifconst bmp_player1_index
	adc #0
 endif
	sta player1color+1

	lda #bmp_player_kernellines
	sta temp4
	lda #0

draw_players
        sta WSYNC
        sta GRP1		;3
        lda (player1color),y	;5
	sta COLUP1		;3
	stx COLUP0		;3

	lda player0height	;3
	dcp player0y		;5
	bcc skipdrawP0		;2/3
 	ldy player0y		;3
	lda (player0pointer),y	;5+
continueP0
        sta GRP0		;3

        lax (player0color),y	;5+
				;=29++

 REPEAT (bmp_player_kernellines-1)
        sta WSYNC
 REPEND
	lda player1height	;3
	dcp player1y		;5
	bcc skipdrawP1		;2/3
 	ldy player1y		;3
	lda (player1pointer),y	;5
continueP1

	dec temp1		;5
	bne draw_players	;2/3
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

restore_variables
	lda temp2
	sta player0y
	lda temp3
	sta player1y

	rts

skipdrawP0
	lda #0		;2
	tay		;2
	jmp continueP0	;5

skipdrawP1
	lda #0		;2
	tay		;2
	jmp continueP1	;5


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
