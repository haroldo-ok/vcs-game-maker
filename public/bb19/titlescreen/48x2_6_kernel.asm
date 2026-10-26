
draw_bmp_48x2_6

 ifconst bmp_48x2_6_colorheight
	lda #<(bmp_48x2_6_colors-1+bmp_48x2_6_colorheight-bmp_48x2_6_window)
 else
	lda #<(bmp_48x2_6_colors-1+bmp_48x2_6_height-bmp_48x2_6_window)
 endif
 ifconst bmp_48x2_6_colorindex
	sec
	sbc bmp_48x2_6_colorindex
 else
  ifconst bmp_48x2_6_index
	sec
	sbc bmp_48x2_6_index
  endif
 endif
	sta aux5+0
 ifconst bmp_48x2_6_colorheight
	lda #>(bmp_48x2_6_colors-1+bmp_48x2_6_colorheight-bmp_48x2_6_window)
 else
	lda #>(bmp_48x2_6_colors-1+bmp_48x2_6_height-bmp_48x2_6_window)
 endif
 ifconst bmp_48x2_6_colorpage
	clc
	adc bmp_48x2_6_colorpage
 endif
	sta aux5+1

 ifconst bmp_48x2_6_index
        ldy #11
bmp_48x2_6_pointersetup
        lda bmp_48x2_6_values,y
        sta scorepointers,y
        dey
        lda bmp_48x2_6_values,y
 ifconst bmp_48x2_6_index
        sec
        sbc bmp_48x2_6_index
 endif
        sta scorepointers,y
        dey
        bpl bmp_48x2_6_pointersetup
 else
; vcs-game-maker: a graphic that does not animate or scroll has its pointers as constants, set directly, which is shorter than the loop
; that copies them from the table (the space above the graphic is made of the lines this takes)
	lda #<(bmp_48x2_6_00+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+0
	lda #>(bmp_48x2_6_00+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+1
	lda #<(bmp_48x2_6_01+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+2
	lda #>(bmp_48x2_6_01+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+3
	lda #<(bmp_48x2_6_02+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+4
	lda #>(bmp_48x2_6_02+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+5
	lda #<(bmp_48x2_6_03+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+6
	lda #>(bmp_48x2_6_03+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+7
	lda #<(bmp_48x2_6_04+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+8
	lda #>(bmp_48x2_6_04+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+9
	lda #<(bmp_48x2_6_05+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+10
	lda #>(bmp_48x2_6_05+#bmp_48x2_6_height-#bmp_48x2_6_window)
	sta scorepointers+11
 endif


	ldy #(bmp_48x2_6_window-1)
	sty aux2

	iny
	lda (aux5),y
	dey

        sta COLUP0              ;3
        sta COLUP1              ;3
        sta HMCLR               ;3

        lda titlescreencolor
        sta COLUPF

 ifconst bmp_48x2_6_background
	lda bmp_48x2_6_background
 else
	lda titlescreencolor
 endif
	sta aux4
  ifconst bmp_48x2_6_PF1
        lda bmp_48x2_6_PF1
  else
        lda #0
        nop
  endif
        sta PF1

  ifconst bmp_48x2_6_PF2
        lda bmp_48x2_6_PF2
  else
        lda #0
        nop
  endif
        sta PF2

 	jmp draw_bmp_48x2_X
	
bmp_48x2_6_values
        .word (bmp_48x2_6_00+#bmp_48x2_6_height-#bmp_48x2_6_window)
        .word (bmp_48x2_6_01+#bmp_48x2_6_height-#bmp_48x2_6_window)
        .word (bmp_48x2_6_02+#bmp_48x2_6_height-#bmp_48x2_6_window)
        .word (bmp_48x2_6_03+#bmp_48x2_6_height-#bmp_48x2_6_window)
        .word (bmp_48x2_6_04+#bmp_48x2_6_height-#bmp_48x2_6_window)
        .word (bmp_48x2_6_05+#bmp_48x2_6_height-#bmp_48x2_6_window)

