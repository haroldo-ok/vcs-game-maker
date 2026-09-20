
draw_bmp_48x2_7

	lda #<(bmp_48x2_7_colors-1+bmp_48x2_7_height-bmp_48x2_7_window)
 ifconst bmp_48x2_7_index
	sec
	sbc bmp_48x2_7_index
 endif
	sta aux5+0
	lda #>(bmp_48x2_7_colors-1+bmp_48x2_7_height-bmp_48x2_7_window)
	sta aux5+1

        ldy #11
bmp_48x2_7_pointersetup
        lda bmp_48x2_7_values,y
        sta scorepointers,y
        dey
        lda bmp_48x2_7_values,y
 ifconst bmp_48x2_7_index
        sec
        sbc bmp_48x2_7_index
 endif
        sta scorepointers,y
        dey
        bpl bmp_48x2_7_pointersetup


	ldy #(bmp_48x2_7_window-1)
	sty aux2

	iny
	lda (aux5),y
	dey

        sta COLUP0              ;3
        sta COLUP1              ;3
        sta HMCLR               ;3

        lda titlescreencolor
        sta COLUPF

 ifconst bmp_48x2_7_background
	lda bmp_48x2_7_background
 else
	lda titlescreencolor
 endif
	sta aux4
  ifconst bmp_48x2_7_PF1
        lda bmp_48x2_7_PF1
  else
        lda #0
        nop
  endif
        sta PF1

  ifconst bmp_48x2_7_PF2
        lda bmp_48x2_7_PF2
  else
        lda #0
        nop
  endif
        sta PF2

 	jmp draw_bmp_48x2_X
	
bmp_48x2_7_values
        .word (bmp_48x2_7_00+#bmp_48x2_7_height-#bmp_48x2_7_window)
        .word (bmp_48x2_7_01+#bmp_48x2_7_height-#bmp_48x2_7_window)
        .word (bmp_48x2_7_02+#bmp_48x2_7_height-#bmp_48x2_7_window)
        .word (bmp_48x2_7_03+#bmp_48x2_7_height-#bmp_48x2_7_window)
        .word (bmp_48x2_7_04+#bmp_48x2_7_height-#bmp_48x2_7_window)
        .word (bmp_48x2_7_05+#bmp_48x2_7_height-#bmp_48x2_7_window)

