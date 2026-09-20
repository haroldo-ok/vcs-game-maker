draw_bmp_96x2_1

 ifconst bmp_96x2_1_index
        lda #(bmp_96x2_1_height-1)
	sec
	sbc bmp_96x2_1_index
	tay
	sbc #bmp_96x2_1_window
	sta temp1
 else
	ldy #(bmp_96x2_1_window-1)
	lda #255
	sta temp1
 endif
	
	lda #3
	sta NUSIZ0	;3=Player and Missile are drawn twice 32 clocks apart 
	sta NUSIZ1	;3=Player and Missile are drawn twice 32 clocks apart 
	lda #0

	lda bmp_96x2_1_colors,y 	;4
 ifconst bmp_96x2_1_fade
	and bmp_96x2_1_fade
 endif
	sta COLUP0		;3
	sta COLUP1	  	;3
	sta HMCLR		;3

	lda titleframe
	and #1
	beq jmp_pf96x2_1_frame0
	jmp pf96x2_1_frame1
jmp_pf96x2_1_frame0
	jmp pf96x2_1_frame0

pf96x2_1_frame0
	;postion P0 and P1
	sta WSYNC
	lda #%11100000
	sta HMP0
	lda #%00010000
	sta HMP1
	sta WSYNC
	sleep 28
	sta RESP0
	sleep 14
	sta RESP1
	sta WSYNC
	sta HMOVE

	sta WSYNC
	sta HMCLR
	sta WSYNC

	sleep 4
	jmp pfline_96x2_1_frame0
	;align so our branch doesn't unexpectedly cross a page...
	if >. != >[.+$70]
	align 256
	endif

pfline_96x2_1_frame0
	lda #$80 	;2
	sta HMP0 	;3
	sta HMP1 	;3

	lda bmp_96x2_1_06,y ;4
	sta GRP1	 ;3

	lda bmp_96x2_1_00,y 
	sta GRP0
	lda bmp_96x2_1_02,y 
	sta GRP0
	lda bmp_96x2_1_04,y 
	sta GRP0

	sleep 2
	
	lda bmp_96x2_1_08,y
	sta GRP1
	lda bmp_96x2_1_10,y
	sta GRP1

	lda bmp_96x2_1_01,y 
	sta GRP0

	sleep 8

	;sta WSYNC 	;=0
	sta HMOVE	;3 - NORMAL HMOVE

	lda bmp_96x2_1_colors-1,y 	;4 - get the title color early and store it for later
 ifconst bmp_96x2_1_fade
        and bmp_96x2_1_fade
 else
	sleep 3
 endif
	tax

	lda #0			;2
	sta HMP0		;3
	sta HMP1		;3

	sleep 7

	lda bmp_96x2_1_07,y	
	sta GRP1

	lda bmp_96x2_1_03,y   ;5
	sta GRP0	;3 =  8
	lda bmp_96x2_1_05,y   ;5
	sta GRP0	;3 =  8

	sleep 2

	lda bmp_96x2_1_09,y   ;5
	sta GRP1	;3 =  8
	lda bmp_96x2_1_11,y  ;5
	sta GRP1	;3 =  8

	sleep 2
	stx COLUP1
	stx COLUP0

	sta HMOVE 	;3 - CYCLE 74 HMOVE 
	sleep 2
	dey

	cpy temp1 	;3
	bne pfline_96x2_1_frame0		;2/3

pf96x2_1_0codeend
 ;echo "critical code #1 in 96x2_1 is ",(pf96x2_1_0codeend-pfline_96x2_1_frame0), " bytes long."

	lda #0
	sta GRP0
	sta GRP1
	jmp pfdone_96x2_1


pf96x2_1_frame1

	;postion P0 and P1
	sta WSYNC
	lda #%00100000
	sta HMP0
	lda #0
	lda #%11110000
	sta HMP1
	sta WSYNC
	sleep 32
	sta RESP0
	sleep 12
	sta RESP1
	sta WSYNC
	sta HMOVE

	sta WSYNC
	sta HMCLR



	sta WSYNC
	sleep 3
	jmp pfline_96x2_1_frame1

	;align so our branch doesn't unexpectedly cross a page...
	if >. != >[.+$70]
	align 256
	endif

pfline_96x2_1_frame1

	sta HMOVE

	lda bmp_96x2_1_07,y ;4
	sta GRP1	 ;3

	lda #$0 	;2
	sta HMP0 	;3
	sta HMP1 	;3

	lda bmp_96x2_1_01,y 
	sta.w GRP0
	lda bmp_96x2_1_03,y 
	sta GRP0
	lda bmp_96x2_1_05,y 
	sta GRP0

	sleep 2
	
	lda bmp_96x2_1_09,y
	sta GRP1
	lda bmp_96x2_1_11,y
	sta GRP1

	lda bmp_96x2_1_00,y 
	sta GRP0

	sta.w HMOVE	;3 - cycle 74

	;sta WSYNC 	;=0 -----------------------------------------

	lda bmp_96x2_1_06,y	
	sta GRP1

	sleep 8

	lda bmp_96x2_1_colors-1,y 	;get the title color early and store it for later
	tax			;2

	sleep 3

	lda #$80		;2
	sta HMP0		;3
	sta HMP1		;3


	lda bmp_96x2_1_02,y   ;5
	sta GRP0	;3 =  8

	lda bmp_96x2_1_04,y   ;5
	sta GRP0	;3 =  8

	sleep 2

	lda bmp_96x2_1_08,y   ;5
	sta GRP1	;3 =  8

	lda bmp_96x2_1_10,y  ;5
	sta GRP1	;3 =  8

	sleep 4

	dey

	txa
 ifconst bmp_96x2_1_fade
	and bmp_96x2_1_fade
 else
	sleep 3
 endif
	sta COLUP1		;3
	sta COLUP0		;3

	cpy temp1 	;2
	bne pfline_96x2_1_frame1		;2/3

pf96x2_1_1codeend
 ;echo "critical code #2 in 96x2_1 is ",(pf96x2_1_1codeend-pfline_96x2_1_frame1), " bytes long."

	lda #0
	sta GRP0
	sta GRP1

pfdone_96x2_1
	sta WSYNC ; debug

	rts
