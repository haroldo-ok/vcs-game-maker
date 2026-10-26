
draw_bmp_48x2_2

 ifconst bmp_48x2_2_colorheight
	lda #<(bmp_48x2_2_colors-1+bmp_48x2_2_colorheight-bmp_48x2_2_window)
 else
	lda #<(bmp_48x2_2_colors-1+bmp_48x2_2_height-bmp_48x2_2_window)
 endif
 ifconst bmp_48x2_2_colorindex
	sec
	sbc bmp_48x2_2_colorindex
 else
  ifconst bmp_48x2_2_index
	sec
	sbc bmp_48x2_2_index
  endif
 endif
	sta aux5+0
 ifconst bmp_48x2_2_colorheight
	lda #>(bmp_48x2_2_colors-1+bmp_48x2_2_colorheight-bmp_48x2_2_window)
 else
	lda #>(bmp_48x2_2_colors-1+bmp_48x2_2_height-bmp_48x2_2_window)
 endif
 ifconst bmp_48x2_2_colorpage
	clc
	adc bmp_48x2_2_colorpage
 endif
	sta aux5+1

 ifconst bmp_48x2_2_index
        ldy #11
bmp_48x2_2_pointersetup
        lda bmp_48x2_2_values,y
        sta scorepointers,y
        dey
        lda bmp_48x2_2_values,y
 ifconst bmp_48x2_2_index
        sec
        sbc bmp_48x2_2_index
 endif
        sta scorepointers,y
        dey
        bpl bmp_48x2_2_pointersetup
 else
; vcs-game-maker: a graphic that does not animate or scroll has its pointers as constants, set directly, which is shorter than the loop
; that copies them from the table (the space above the graphic is made of the lines this takes)
	lda #<(bmp_48x2_2_00+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+0
	lda #>(bmp_48x2_2_00+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+1
	lda #<(bmp_48x2_2_01+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+2
	lda #>(bmp_48x2_2_01+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+3
	lda #<(bmp_48x2_2_02+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+4
	lda #>(bmp_48x2_2_02+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+5
	lda #<(bmp_48x2_2_03+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+6
	lda #>(bmp_48x2_2_03+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+7
	lda #<(bmp_48x2_2_04+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+8
	lda #>(bmp_48x2_2_04+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+9
	lda #<(bmp_48x2_2_05+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+10
	lda #>(bmp_48x2_2_05+#bmp_48x2_2_height-#bmp_48x2_2_window)
	sta scorepointers+11
 endif


	ldy #(bmp_48x2_2_window-1)
	sty aux2

	iny
	lda (aux5),y
	dey

        sta COLUP0              ;3
        sta COLUP1              ;3
        sta HMCLR               ;3

        lda titlescreencolor
        sta COLUPF

 ifconst bmp_48x2_2_background
	lda bmp_48x2_2_background
 else
	lda titlescreencolor
 endif
	sta aux4
  ifconst bmp_48x2_2_PF1
        lda bmp_48x2_2_PF1
  else
        lda #0
        nop
  endif
        sta PF1

  ifconst bmp_48x2_2_PF2
        lda bmp_48x2_2_PF2
  else
        lda #0
        nop
  endif
        sta PF2

 	jmp draw_bmp_48x2_X
	
bmp_48x2_2_values
        .word (bmp_48x2_2_00+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_01+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_02+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_03+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_04+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_05+#bmp_48x2_2_height-#bmp_48x2_2_window)

