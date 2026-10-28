
draw_bmp_48x1_3

	lda #0
	sta GRP0
	sta GRP1

	ldy #11
bmp_48x1_3_pointersetup
	lda bmp_48x1_3_values,y
	sta scorepointers,y
	dey
	lda bmp_48x1_3_values,y
 ifconst bmp_48x1_3_index
	sec
	sbc bmp_48x1_3_index
 endif
	sta scorepointers,y
	dey
	bpl bmp_48x1_3_pointersetup
	
	ldy (#bmp_48x1_3_window-1)
	sty aux2

 ifconst bmp_48x1_3_background
	lda bmp_48x1_3_background
 else
	lda titlescreencolor
 endif
	sta aux4

        lda bmp_48x1_3_color
        sta COLUP0              ;3
        sta COLUP1              ;3
        sta HMCLR               ;3

	lda titlescreencolor
	sta COLUPF

  ifconst bmp_48x1_3_PF1
  	lda bmp_48x1_3_PF1
  else
	lda #0
	nop
  endif
	sta PF1

  ifconst bmp_48x1_3_PF2
  	lda bmp_48x1_3_PF2
  else
	lda #0
	nop
  endif
	sta PF2

	jmp draw_bmp_48x1_X ; the common 1lk bitmap minikernel

bmp_48x1_3_values
	.word (bmp_48x1_3_00+#bmp_48x1_3_height-#bmp_48x1_3_window)
	.word (bmp_48x1_3_01+#bmp_48x1_3_height-#bmp_48x1_3_window)
	.word (bmp_48x1_3_02+#bmp_48x1_3_height-#bmp_48x1_3_window)
	.word (bmp_48x1_3_03+#bmp_48x1_3_height-#bmp_48x1_3_window)
	.word (bmp_48x1_3_04+#bmp_48x1_3_height-#bmp_48x1_3_window)
	.word (bmp_48x1_3_05+#bmp_48x1_3_height-#bmp_48x1_3_window)

