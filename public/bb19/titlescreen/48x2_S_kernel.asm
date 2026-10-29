
; The setup of a 48x2 graphic that every card of that kind shares, for a title screen too big for its bank (see "title_share_48x2" in
; generators/bbasic/titlescreen.js). The setup of a card (48x2_N_kernel.asm) is about 85 bytes of code that only differs in its numbers;
; here a card is a "jsr" to this routine followed by its numbers, so a card takes about 21 bytes (and 8 more for each of its three
; optional variables) and this routine is written once. It is slower than the setup of a card (about 80 to 110 cycles, so a graphic
; starts a line or so lower), which is why a title screen only uses it when it would not fit otherwise.
;
; The card's numbers follow the "jsr" in the code (the return address says where):
;   +0  .. +11  the six pointers of the columns (a low and a high byte each), as in the "values" table of the card
;   +12, +13    the low and high byte of the table of row colors, less the row of the first line (before the index is taken off)
;   +14         the height of the window less one
;   +15         PF1, +16 PF2, +17 the color of the background of the box behind the graphic
; temp3 is taken off the low byte of each pointer (the frame of an animation or the scroll: "bmp_48x2_N_index"), temp4 off the low byte
; of the row colors (the same, or a frame of the colors: "bmp_48x2_N_colorindex") and temp5 is added to the high byte of the row colors
; ("bmp_48x2_N_colorpage"). A card that has none of them calls title48x2_setup_static, which clears all three.

title48x2_setup_static
	lda #0
	sta temp3
	sta temp4
	sta temp5

title48x2_setup
	pla
	clc
	adc #1
	sta temp1
	pla
	adc #0
	sta temp2		; temp1 and temp2: where the card's numbers are

	ldy #11
title48x2_pointers
	lda (temp1),y
	sta scorepointers,y
	dey
	lda (temp1),y
	sec
	sbc temp3
	sta scorepointers,y
	dey
	bpl title48x2_pointers

	ldy #12
	lda (temp1),y
	sec
	sbc temp4
	sta aux5+0
	iny
	lda (temp1),y
 ifconst title_uniform_48x2
	sbc #0			; (the list of one color is found past its table's start: the row of the pointer can be on the page before)
 endif
	clc
	adc temp5
	sta aux5+1

	iny
	lda (temp1),y
	sta aux2
	tay
	iny
	lda (aux5),y		; the color of the first row

	sta COLUP0
	sta COLUP1
	sta HMCLR
 ifconst title_uniform_48x2
	and #1			; bit 0 of the color: set for a list of one color (see 48x2_X_kernel.asm)
	sta temp6
 endif

	lda titlescreencolor
	sta COLUPF

	ldy #15
	lda (temp1),y
	sta PF1
	iny
	lda (temp1),y
	sta PF2
	iny
	lda (temp1),y
	sta aux4

	ldy aux2
	jmp draw_bmp_48x2_X
