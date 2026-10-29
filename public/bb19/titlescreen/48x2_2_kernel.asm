
draw_bmp_48x2_2

 ifconst bmp_48x2_2_shared
  ; The shared setup (see 48x2_S_kernel.asm): the variables the card has go to temp3 to temp5 and its numbers follow the "jsr".
bmp_48x2_2_dyn SET 0
  ifconst bmp_48x2_2_index
bmp_48x2_2_dyn SET 1
  endif
  ifconst bmp_48x2_2_colorindex
bmp_48x2_2_dyn SET 1
  endif
  ifconst bmp_48x2_2_colorpage
bmp_48x2_2_dyn SET 1
  endif
  if bmp_48x2_2_dyn
   ifconst bmp_48x2_2_index
	lda bmp_48x2_2_index
	sta temp3
   else
	lda #0
	sta temp3
   endif
   ifconst bmp_48x2_2_colorindex
	lda bmp_48x2_2_colorindex
	sta temp4
   else
    ifconst bmp_48x2_2_index
	lda bmp_48x2_2_index
	sta temp4
    else
	lda #0
	sta temp4
    endif
   endif
   ifconst bmp_48x2_2_colorpage
	lda bmp_48x2_2_colorpage
	sta temp5
   else
	lda #0
	sta temp5
   endif
	jsr title48x2_setup
  else
	jsr title48x2_setup_static
  endif
	.word (bmp_48x2_2_00+#bmp_48x2_2_height-#bmp_48x2_2_window)
	.word (bmp_48x2_2_01+#bmp_48x2_2_height-#bmp_48x2_2_window)
	.word (bmp_48x2_2_02+#bmp_48x2_2_height-#bmp_48x2_2_window)
	.word (bmp_48x2_2_03+#bmp_48x2_2_height-#bmp_48x2_2_window)
	.word (bmp_48x2_2_04+#bmp_48x2_2_height-#bmp_48x2_2_window)
	.word (bmp_48x2_2_05+#bmp_48x2_2_height-#bmp_48x2_2_window)
  ifconst bmp_48x2_2_colorheight
	.byte <(bmp_48x2_2_colors-1+bmp_48x2_2_colorheight-bmp_48x2_2_window), >(bmp_48x2_2_colors-1+bmp_48x2_2_colorheight-bmp_48x2_2_window)
  else
	.byte <(bmp_48x2_2_colors-1+bmp_48x2_2_height-bmp_48x2_2_window), >(bmp_48x2_2_colors-1+bmp_48x2_2_height-bmp_48x2_2_window)
  endif
	.byte (bmp_48x2_2_window-1), bmp_48x2_2_pf1c, bmp_48x2_2_pf2c, bmp_48x2_2_bgc
 else

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
 ifconst title_uniform_48x2
  ifconst bmp_48x2_2_colorindex
	sbc #0			; (the list of one color is found past its table's start: the row of the pointer can be on the page before)
  endif
 endif
 ifconst bmp_48x2_2_colorpage
	clc
	adc bmp_48x2_2_colorpage
 endif
	sta aux5+1

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


	ldy #(bmp_48x2_2_window-1)
	sty aux2

	iny
	lda (aux5),y
	dey

        sta COLUP0              ;3
        sta COLUP1              ;3
        sta HMCLR               ;3
 ifconst title_uniform_48x2
	and #1			; bit 0 of the color: set for a list of one color (see 48x2_X_kernel.asm)
	sta temp6
 endif

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
	
 endif

 ifnconst bmp_48x2_2_shared
bmp_48x2_2_values
        .word (bmp_48x2_2_00+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_01+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_02+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_03+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_04+#bmp_48x2_2_height-#bmp_48x2_2_window)
        .word (bmp_48x2_2_05+#bmp_48x2_2_height-#bmp_48x2_2_window)
 endif
