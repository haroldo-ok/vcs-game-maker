
draw_bmp_48x2_6

	lda #<(bmp_48x2_6_colors-1+bmp_48x2_6_height-bmp_48x2_6_window)
 ifconst bmp_48x2_6_index
	sec
	sbc bmp_48x2_6_index
 endif
	sta aux5+0
	lda #>(bmp_48x2_6_colors-1+bmp_48x2_6_height-bmp_48x2_6_window)
	sta aux5+1

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

