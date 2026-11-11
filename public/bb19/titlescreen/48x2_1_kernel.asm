
draw_bmp_48x2_1

 ; (With the ball the rows' colors are read a row later, see draw_bmp_48x2_XB: their pointer is a row on.)
bmp_48x2_1_cshift SET 0
 ifconst bmp_48x2_1_ball
bmp_48x2_1_cshift SET 1
 endif

 ifconst bmp_48x2_1_shared
  ; The shared setup (see 48x2_S_kernel.asm): the variables the card has go to temp3 to temp5 and its numbers follow the "jsr".
bmp_48x2_1_dyn SET 0
  ifconst bmp_48x2_1_index
bmp_48x2_1_dyn SET 1
  endif
  ifconst bmp_48x2_1_colorindex
bmp_48x2_1_dyn SET 1
  endif
  ifconst bmp_48x2_1_colorpage
bmp_48x2_1_dyn SET 1
  endif
  if bmp_48x2_1_dyn
   ifconst bmp_48x2_1_index
	lda bmp_48x2_1_index
	sta temp3
   else
	lda #0
	sta temp3
   endif
   ifconst bmp_48x2_1_colorindex
	lda bmp_48x2_1_colorindex
	sta temp4
   else
    ifconst bmp_48x2_1_index
	lda bmp_48x2_1_index
	sta temp4
    else
	lda #0
	sta temp4
    endif
   endif
   ifconst bmp_48x2_1_colorpage
	lda bmp_48x2_1_colorpage
	sta temp5
   else
	lda #0
	sta temp5
   endif
	jsr title48x2_setup
  else
	jsr title48x2_setup_static
  endif
	.word (bmp_48x2_1_00+#bmp_48x2_1_height-#bmp_48x2_1_window)
	.word (bmp_48x2_1_01+#bmp_48x2_1_height-#bmp_48x2_1_window)
	.word (bmp_48x2_1_02+#bmp_48x2_1_height-#bmp_48x2_1_window)
	.word (bmp_48x2_1_03+#bmp_48x2_1_height-#bmp_48x2_1_window)
	.word (bmp_48x2_1_04+#bmp_48x2_1_height-#bmp_48x2_1_window)
	.word (bmp_48x2_1_05+#bmp_48x2_1_height-#bmp_48x2_1_window)
  ifconst bmp_48x2_1_colorheight
	.byte <(bmp_48x2_1_colors-1+bmp_48x2_1_colorheight-bmp_48x2_1_window), >(bmp_48x2_1_colors-1+bmp_48x2_1_colorheight-bmp_48x2_1_window)
  else
	.byte <(bmp_48x2_1_colors-1+bmp_48x2_1_height-bmp_48x2_1_window), >(bmp_48x2_1_colors-1+bmp_48x2_1_height-bmp_48x2_1_window)
  endif
	.byte (bmp_48x2_1_window-1), bmp_48x2_1_pf1c, bmp_48x2_1_pf2c, bmp_48x2_1_bgc
 else

 ; (A single color graphic has one color byte and no list of row colors: see generators/bbasic/titlescreen.js.)
 ifnconst bmp_48x2_1_onecolor
 ifconst bmp_48x2_1_colorheight
	lda #<(bmp_48x2_1_colors-1+bmp_48x2_1_cshift+bmp_48x2_1_colorheight-bmp_48x2_1_window)
 else
	lda #<(bmp_48x2_1_colors-1+bmp_48x2_1_cshift+bmp_48x2_1_height-bmp_48x2_1_window)
 endif
 ifconst bmp_48x2_1_colorindex
	sec
	sbc bmp_48x2_1_colorindex
 else
  ifconst bmp_48x2_1_index
	sec
	sbc bmp_48x2_1_index
  endif
 endif
	sta aux5+0
 ifconst bmp_48x2_1_colorheight
	lda #>(bmp_48x2_1_colors-1+bmp_48x2_1_cshift+bmp_48x2_1_colorheight-bmp_48x2_1_window)
 else
	lda #>(bmp_48x2_1_colors-1+bmp_48x2_1_cshift+bmp_48x2_1_height-bmp_48x2_1_window)
 endif
 ifconst title_uniform_48x2
  ifconst bmp_48x2_1_colorindex
	sbc #0			; (the list of one color is found past its table's start: the row of the pointer can be on the page before)
  endif
 endif
 ifconst bmp_48x2_1_colorpage
	clc
	adc bmp_48x2_1_colorpage
 endif
	sta aux5+1
 endif

        ldy #11
bmp_48x2_1_pointersetup
        lda bmp_48x2_1_values,y
        sta scorepointers,y
        dey
        lda bmp_48x2_1_values,y
 ifconst bmp_48x2_1_index
        sec
        sbc bmp_48x2_1_index
 endif
        sta scorepointers,y
        dey
        bpl bmp_48x2_1_pointersetup


 ifconst bmp_48x2_1_win
	ldy bmp_48x2_1_win	; the number of lines less one, in a byte (a graphic with a window height block; see windowVarValue in generators/bbasic/titlescreen.js)
 else
	ldy #(bmp_48x2_1_window-1)
 endif
	sty aux2

 ifconst bmp_48x2_1_onecolor
	lda bmp_48x2_1_color
 else
  if bmp_48x2_1_cshift
	lda (aux5),y		; (the pointer is a row on, see bmp_48x2_1_cshift)
  else
	iny
	lda (aux5),y
	dey
  endif
 endif

        sta COLUP0              ;3
        sta COLUP1              ;3
        sta HMCLR               ;3
 ifconst title_uniform_48x2
  ifconst bmp_48x2_1_onecolor
	lda #1			; one color: the loop that does not read row colors (see 48x2_X_kernel.asm)
  else
	and #1			; bit 0 of the color: set for a list of one color (see 48x2_X_kernel.asm)
  endif
	sta stack2		; (not temp6: on the standard kernel that is scorepointers+11, the picture pointer of the sixth column)
 endif

        lda titlescreencolor
        sta COLUPF

 ifconst bmp_48x2_1_background
	lda bmp_48x2_1_background
 else
	lda titlescreencolor
 endif
	sta aux4
  ifconst bmp_48x2_1_PF1
        lda bmp_48x2_1_PF1
  else
        lda #0
        nop
  endif
        sta PF1

  ifconst bmp_48x2_1_PF2
        lda bmp_48x2_1_PF2
  else
        lda #0
        nop
  endif
        sta PF2

 ifconst bmp_48x2_1_ball
	; The ball behind the picture (see draw_bmp_48x2_XB): its place, the ball's line and position48; then the index of the top row (as the
	; pictures' pointers: the height less one, less the frame's offset), the end of the rows, the first rows' width and the loop.
	; The top row's ENABL, set on the line before it (draw_bmp_48x2_XB), and its fourth and third columns, which the loop reads from
	; scorepointers (see pf48x2_1_ball_loop). (Read here, before the lines that are timed: on the line after position48 they put the graphic
	; a line lower.)
	lda #<(bmp_48x2_1_height-1)
  ifconst bmp_48x2_1_index
	sec
	sbc bmp_48x2_1_index
  endif
	tay
	lda bmp_48x2_1_ballen,y
	sta stack2
	lda bmp_48x2_1_04,y
	sta scorepointers
	lda bmp_48x2_1_03,y
	sta scorepointers+2
	lda bmp_48x2_1_ballx
	sta missile0y
	jsr draw_bmp_48x2_XB_place
	lda #<(bmp_48x2_1_height-1)
  ifconst bmp_48x2_1_index
	sec
	sbc bmp_48x2_1_index
  endif
	sta aux2
	tay
	lda bmp_48x2_1_ballw,y
	sta CTRLPF
	lda #<(bmp_48x2_1_height-bmp_48x2_1_window-1)
  ifconst bmp_48x2_1_index
	sec
	sbc bmp_48x2_1_index
  endif
	sta missile0y
	lda #<pf48x2_1_ball_loop
	sta aux5
	lda #>pf48x2_1_ball_loop
	sta aux5+1
	jmp draw_bmp_48x2_XB
 else
 	jmp draw_bmp_48x2_X
 endif
	
 endif

 ifnconst bmp_48x2_1_shared
bmp_48x2_1_values
        .word (bmp_48x2_1_00+#bmp_48x2_1_height-#bmp_48x2_1_window)
        .word (bmp_48x2_1_01+#bmp_48x2_1_height-#bmp_48x2_1_window)
        .word (bmp_48x2_1_02+#bmp_48x2_1_height-#bmp_48x2_1_window)
        .word (bmp_48x2_1_03+#bmp_48x2_1_height-#bmp_48x2_1_window)
        .word (bmp_48x2_1_04+#bmp_48x2_1_height-#bmp_48x2_1_window)
        .word (bmp_48x2_1_05+#bmp_48x2_1_height-#bmp_48x2_1_window)
 endif

 ifconst bmp_48x2_1_ball
; The ball's loop of this graphic (see draw_bmp_48x2_XB): two rows a pass, each row two lines; aux2 the row's index in the tables, missile0y
; the index after the last row. The ball is on its rows' lines: what it has for a row (ENABL, and for a pair of rows the width, CTRLPF, and the
; move, an HMOVE) is set on the line before the row, with the row's color. To have the time for it on those lines, the first line of a row
; reads four columns (31 cycles before the picture's stores): its third and fourth are read on the line before into bytes of scorepointers
; (the pointers are not used by this loop; scorepointers+0 and +2 for the pass's first row, +1 and +3 for its second); the second line reads
; four too, with the next row's index (the tables at +1: a table is in one page with a byte after it, see the build), and the sixth column is
; still in X. The test for the last row is on the first line of a row: the last row's second line is then drawn by a copy of it that ends the
; loop (pf48x2_1_ball_lastA, _lastB, after a WSYNC, so the branch's time does not count; with the index of that row, as the next one
; can be 255). The loop's jmp is on the first line of the second
; row, so the lines before a row do not take it. The top row's ENABL is set before the loop (stack2), its third and fourth columns read by the
; card's setup; the loop starts at pf48x2_1_ball_loop (cycle 10).
; Free cycles on each line (the sleeps): the line before the pass's second row 3 (the pair's width and move are set there), before the next
; pass 13, the two lines inside the rows 2 and 6; a single color graphic has 10 more on each line before a row.
pf48x2_1_ball_lastA
	iny				;2 (the row's index: the next one can be 255, past the table at +1)
	sta WSYNC			;3
	sleep 13
	lda bmp_48x2_1_00,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_01,y		;4
	sta GRP1			;3
	lda bmp_48x2_1_02,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_03,y		;4
	ldy scorepointers		;3 (X still has the sixth column)
	sta GRP1			;3
	sty GRP0			;3
	stx GRP1			;3
	sty GRP0			;3
	jmp pf48x2_XB_done

pf48x2_1_ball_next
	; The second line of the pass's second row, then the line before the next pass's first row: its color and ENABL.
	lda bmp_48x2_1_00+1,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_01+1,y		;4
	sta GRP1			;3
	lda bmp_48x2_1_02+1,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_03+1,y		;4
	ldy scorepointers+1		;3 (X still has the sixth column)
	sta GRP1			;3
	sty GRP0			;3
	stx GRP1			;3
	sty GRP0			;3

	ldy aux2			;3 (the next row)
 ifconst bmp_48x2_1_onecolor
	sleep 10			; (free: a single color graphic has no color to store)
 else
	lda bmp_48x2_1_colors,y		;4
	sta COLUP1			;3
	sta COLUP0			;3
 endif
	lda bmp_48x2_1_ballen,y		;4
	sta ENABL			;3
	sleep 13			; (free)

pf48x2_1_ball_loop
	; The pass's first row, its first line.
	lda bmp_48x2_1_00,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_01,y		;4
	sta GRP1			;3
	lda bmp_48x2_1_02,y		;4
	sta GRP0			;3
	ldx bmp_48x2_1_05,y		;4
	lda scorepointers+2		;3 (the third column, read on the line before)
	ldy scorepointers		;3 (the fourth column, read on the line before)
	sta GRP1			;3
	sty GRP0			;3
	stx GRP1			;3
	sty GRP0			;3

	dec aux2			;5
	ldy aux2			;3 (the next row)
	cpy missile0y			;3
	beq pf48x2_1_ball_lastA		;2 (this row is the last)
	lda bmp_48x2_1_04,y		;4
	sta scorepointers+1		;3 (the next row's fourth column)
	lda bmp_48x2_1_03,y		;4
	sta scorepointers+3		;3 (and its third)
	lda bmp_48x2_1_ballhm+1,y	;4 (this row's: the move for the HMOVE at the end of the next line)
	sta HMBL			;3
	sleep 2				; (free)

	; Its second line, then the line before the second row: its color, ENABL, the pair's width and move.
	lda bmp_48x2_1_00+1,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_01+1,y		;4
	sta GRP1			;3
	lda bmp_48x2_1_02+1,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_03+1,y		;4
	ldy scorepointers		;3 (X still has the sixth column)
	sta GRP1			;3
	sty GRP0			;3
	stx GRP1			;3
	sty GRP0			;3

	ldy aux2			;3 (the next row)
 ifconst bmp_48x2_1_onecolor
	sleep 10			; (free: a single color graphic has no color to store)
 else
	lda bmp_48x2_1_colors,y		;4
	sta COLUP1			;3
	sta COLUP0			;3
 endif
	lda bmp_48x2_1_ballen,y		;4
	sta ENABL			;3
	sta HMOVE			;3 (cycle 76: see draw_bmp_48x2_XB)
	lda bmp_48x2_1_ballw,y		;4
	sta CTRLPF			;3
	sleep 3				; (free)

	; The pass's second row, its first line.
	lda bmp_48x2_1_00,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_01,y		;4
	sta GRP1			;3
	lda bmp_48x2_1_02,y		;4
	sta GRP0			;3
	ldx bmp_48x2_1_05,y		;4
	lda scorepointers+3		;3 (the third column, read on the line before)
	ldy scorepointers+1		;3 (the fourth column, read on the line before)
	sta GRP1			;3
	sty GRP0			;3
	stx GRP1			;3
	sty GRP0			;3

	dec aux2			;5
	ldy aux2			;3 (the next row)
	cpy missile0y			;3
	beq pf48x2_1_ball_lastB		;2 (this row is the last)
	lda bmp_48x2_1_04,y		;4
	sta scorepointers		;3 (the next row's fourth column)
	lda bmp_48x2_1_03,y		;4
	sta scorepointers+2		;3 (and its third)
	sleep 6				; (free)
	jmp pf48x2_1_ball_next		;3

pf48x2_1_ball_lastB
	iny				;2 (the row's index)
	sta WSYNC			;3
	sleep 13
	lda bmp_48x2_1_00,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_01,y		;4
	sta GRP1			;3
	lda bmp_48x2_1_02,y		;4
	sta GRP0			;3
	lda bmp_48x2_1_03,y		;4
	ldy scorepointers+1		;3 (X still has the sixth column)
	sta GRP1			;3
	sty GRP0			;3
	stx GRP1			;3
	sty GRP0			;3
	jmp pf48x2_XB_done

pf48x2_1_ball_end
	jmp pf48x2_XB_done
 endif
