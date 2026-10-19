 ifnconst pfscore
TextDataPtr = pfscore1
 endif
TextColor = statusbarlength
 ifnconst textbkcolor
textbkcolor = 0
 endif
 ifnconst scorepointers
scorepointers = temp1 ; the scroll cursor's scratch bytes, free once the text is drawn
 endif
; noscore = 1
 ifconst fontstyle
  ifconst SQUISH
   if fontstyle == SQUISH
scorecount = 4
   endif
  endif
 endif


 ifnconst scorecount
scorecount = 7
 endif

textoffset0  = temp1
textoffset1  = temp2
textoffset2  = temp3
textoffset3  = temp4
textoffset4  = temp5
textoffset5  = temp6
textoffset6  = temp7
textoffset7  = aux4 ; this seems to be oddly unused by anything
 ; vcs-game-maker: the last four are in SpriteGfxIndex, nine bytes the kernel's sprite sort fills in at the start of every drawscreen
 ; (copied back from the coprocessor by the kernel before it reads them) and nothing reads once the picture is drawn. The text is drawn
 ; below the picture, so they are free here and cost the project no variables.
 ifnconst textoffset8
textoffset8  = SpriteGfxIndex+5
 endif
 ifnconst textoffset9
textoffset9  = SpriteGfxIndex+6
 endif
 ifnconst textoffset10
textoffset10 = SpriteGfxIndex+7
 endif
 ifnconst textoffset11
textoffset11 = SpriteGfxIndex+8
 endif

    ifconst bs_mask
        ifconst FASTFETCH ; using DPC+
KERNELBANK = 1
        else
KERNELBANK = (bs_mask + 1)
        endif
    endif


textkernel

	; the kernel's score loop used to clear these before calling in; done here to keep that bank smaller
	ldx #0
	stx GRP0
	stx GRP1
	stx GRP0
	stx PF1

	ldy #0                  ; 2
    
    ifconst extendedtxt
    sty TextDataPtr+1              ; 3
    sty temp7               ; 3
    lax TextIndex           ; 3
    asl                     ; 2
    rol TextDataPtr+1              ; 5
    asl                     ; 2
    rol TextDataPtr+1              ; 5
    asl                     ; 2
    rol TextDataPtr+1              ; 5
    sta TextDataPtr              ; 3
    txa                     ; 2
    asl                     ; 2
    rol temp7               ; 5
    asl                     ; 2
    rol temp7               ; 5
    clc                     ; 2
    adc TextDataPtr              ; 3
    sta temp1               ; 3
    lda TextDataPtr+1              ; 3
    adc temp7               ; 3 - Use existing carry from last operation
    endif
    
    ; vcs-game-maker: with the score hidden row 1 reads the messages directly (showtextrowfast below), so the pointer is only
    ; set up for a second row.
    ifnconst dpchidescore
    ifconst extendedtxt
        adc #>text_strings  ; carry already clear
    else
        lda #>text_strings
    endif
    sta TextDataPtr+1
    lda #<text_strings
    sta TextDataPtr
    else
        ifconst textkernel2ndrow
    ifconst extendedtxt
        adc #>text_strings  ; carry already clear
    else
        lda #>text_strings
    endif
    sta TextDataPtr+1
    lda #<text_strings
    sta TextDataPtr
        endif
    endif

	lda TextColor
	sta COLUP0
	sta COLUP1 
	lda #textbkcolor
	sta COLUBK
	
    lda TextIndex
    ifconst dpchidescore
    jsr showtextrowfast
    else
    jsr showtextrow
    endif

    ; "textkernel2ndrow" is the app's switch for the wrapped second line (not the bB "extendedtxt" const).
    ; Row 2 is drawn every frame whenever this is compiled in, so the frame always has the same number of
    ; scanlines. When the message does not wrap it reads the blank row at offset 0 instead.
    ifconst textkernel2ndrow
        ; row 1 ends with GRP0/GRP1 still holding its last glyphs, blank them before row 2 starts
        lda #0
        sta GRP0
        sta GRP1
        sta GRP0
        lda TextRow2Active
        bne userealrow2
        lda #0
        jmp gotrow2base
userealrow2
        lda TextIndex
        clc
        adc #12
gotrow2base
        ; the row drawing code overwrites the low byte of TextDataPtr, put it back
        ldx #<text_strings
        stx TextDataPtr
        ; vcs-game-maker row2-color hook - utils/text-font.js splices row 2's color in right after this line
        jsr showtextrow
    endif
    jmp textrowsdone

; vcs-game-maker: the same fill as showtextrow, read from the message table directly (absolute indexed by X, 4 cycles a byte
; instead of the 10 of the pointer and Y, and no pointer to set up), then on to the drawing. A is the row's base offset.
    ifconst dpchidescore
showtextrowfast
    tax
    lda text_strings+11,x
    sta textoffset11
    lda text_strings+10,x
    sta textoffset10
    lda text_strings+9,x
    sta textoffset9
    lda text_strings+8,x
    sta textoffset8
    lda text_strings+7,x
    sta textoffset7
    lda text_strings+6,x
    sta textoffset6
    lda text_strings+5,x
    sta textoffset5
    lda text_strings+4,x
    sta textoffset4
    lda text_strings+3,x
    sta textoffset3
    lda text_strings+2,x
    sta textoffset2
    lda text_strings+1,x
    sta textoffset1
    lda text_strings+0,x
    sta textoffset0
    jmp showtextrowdraw
    endif

; Reads 12 message bytes from (TextDataPtr) starting at the offset in A, then draws that row.
showtextrow
    clc
    adc #11
    tay
    
;TextPointersLoop
    lda (TextDataPtr),y  
    sta textoffset11
    dey
    lda (TextDataPtr),y  
    sta textoffset10
    dey
    lda (TextDataPtr),y  
    sta textoffset9
    dey
    lda (TextDataPtr),y  
    sta textoffset8
    dey
;    dex
;    bpl TextPointersLoop
    
    lda (TextDataPtr),y
    sta textoffset7
    dey

    lda (TextDataPtr),y
    sta textoffset6
    dey

    ldx #5

TextPointersLoop2
    lda (TextDataPtr),y  
    sta textoffset0,x
    dey
    dex
    bpl TextPointersLoop2

    ifnconst extendedtxt
        sta WSYNC           ; 3
    endif
showtextrowdraw

    ldx textoffset0
    lda left_text,x
    ldx textoffset1
    ora right_text,x
	ldy #textbkcolor
	
firstbreak
    ; Text line 1 / 5
 
    ;line 1
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)  vcs-game-maker: text sprites take the background color on this line
    sty COLUP1              ; 3     (6)
    sta GRP0                ; 3     (6)

    ldx textoffset2     ; 3     (9)
    lda left_text,x         ; 4     (13)
    ldx textoffset3     ; 3     (16)
    ora right_text,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx textoffset4     ; 3     (26)
    lda left_text,x         ; 4     (30)
    ldx textoffset5     ; 3     (33)
    ora right_text,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx textoffset6     ; 3     (43) 3 in A
    lda left_text,x         ; 4     (47)
    ldx textoffset7     ; 3     (50)
    ora right_text,x        ; 4     (54)
    
    ldy TextColor           ; 3     (56) line 2 shows the text in its color
    sty COLUP0              ; 3
    sty COLUP1              ; 3
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sleep 3                 ; (3) vcs-game-maker: was sty VBLANK, kept the same length
    tay                     ; 2     (5) 3 in Y

    ldx textoffset8     ; 3     (8) 4
    lda left_text,x         ; 4     (12)
    ldx textoffset9     ; 3     (15)
    ora right_text,x        ; 4     (19)
    sta TextDataPtr              ; 3     (22)

    ldx textoffset10    ; 3     (25*) 5 in A
    lda left_text,x         ; 4     (29)
    ldx textoffset11    ; 3     (32)
    ora right_text,x        ; 4     (36)
    
    ldx TextDataPtr              ; 3     (39) 4 in X
    sleep 2                 ; 7     (46)
    sty GRP1                ; 3     (49) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (52) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (55) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (58) 5 -> GRP1

    ldy #textbkcolor                  ; 2     (60)
    ldx textoffset0     ; 3     (63)
    lda left_text+1,x       ; 4     (67)
    ldx textoffset1     ; 3     (70)
    ora right_text+1,x      ; 4     (74)
;    sleep 4
    
    ; Text line 2 / 5
endl1 
    ;line 1
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)  vcs-game-maker: text sprites take the background color on this line
    sty COLUP1              ; 3     (6)
    sta GRP0                ; 3     (6)

    ldx textoffset2     ; 3     (9)
    lda left_text+1,x         ; 4     (13)
    ldx textoffset3     ; 3     (16)
    ora right_text+1,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx textoffset4     ; 3     (26)
    lda left_text+1,x         ; 4     (30)
    ldx textoffset5     ; 3     (33)
    ora right_text+1,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx textoffset6     ; 3     (43) 3 in A
    lda left_text+1,x         ; 4     (47)
    ldx textoffset7     ; 3     (50)
    ora right_text+1,x        ; 4     (54)
    
    ldy TextColor           ; 3     (56) line 2 shows the text in its color
    sty COLUP0              ; 3
    sty COLUP1              ; 3
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sleep 3                 ; (3) vcs-game-maker: was sty VBLANK, kept the same length
    tay                     ; 2     (5) 3 in Y

    ldx textoffset8     ; 3     (8) 4
    lda left_text+1,x         ; 4     (12)
    ldx textoffset9     ; 3     (15)
    ora right_text+1,x        ; 4     (19)
    sta TextDataPtr              ; 3     (22)

    ldx textoffset10    ; 3     (25*) 5 in A
    lda left_text+1,x         ; 4     (29)
    ldx textoffset11    ; 3     (32)
    ora right_text+1,x        ; 4     (36)
    
    ldx TextDataPtr              ; 3     (39) 4 in X
    sleep 2                 ; 7     (46)
    sty GRP1                ; 3     (49) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (52) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (55) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (58) 5 -> GRP1

    ldy #textbkcolor                  ; 2     (56)
    ldx textoffset0     ; 3     (59)
    lda left_text+2,x         ; 4     (63)
    ldx textoffset1     ; 3     (66)
    ora right_text+2,x        ; 4     (70)
;    sleep 4

    ; Text line 3 / 5
endl2 
    ;line 1
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)  vcs-game-maker: text sprites take the background color on this line
    sty COLUP1              ; 3     (6)
    sta GRP0                ; 3     (6)

    ldx textoffset2     ; 3     (9)
    lda left_text+2,x         ; 4     (13)
    ldx textoffset3     ; 3     (16)
    ora right_text+2,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx textoffset4     ; 3     (26)
    lda left_text+2,x         ; 4     (30)
    ldx textoffset5     ; 3     (33)
    ora right_text+2,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx textoffset6     ; 3     (43) 3 in A
    lda left_text+2,x         ; 4     (47)
    ldx textoffset7     ; 3     (50)
    ora right_text+2,x        ; 4     (54)
    
    ldy TextColor           ; 3     (56) line 2 shows the text in its color
    sty COLUP0              ; 3
    sty COLUP1              ; 3
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sleep 3                 ; (3) vcs-game-maker: was sty VBLANK, kept the same length
    tay                     ; 2     (5) 3 in Y

    ldx textoffset8     ; 3     (8) 4
    lda left_text+2,x         ; 4     (12)
    ldx textoffset9     ; 3     (15)
    ora right_text+2,x        ; 4     (19)
    sta TextDataPtr              ; 3     (22)

    ldx textoffset10    ; 3     (25*) 5 in A
    lda left_text+2,x         ; 4     (29)
    ldx textoffset11    ; 3     (32)
    ora right_text+2,x        ; 4     (36)
    
    ldx TextDataPtr              ; 3     (39) 4 in X
    sleep 2                 ; 3     (42)
    sty GRP1                ; 3     (45) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (48) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (51) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (54) 5 -> GRP1

    ldy #textbkcolor                  ; 2     (56)
    ldx textoffset0     ; 3     (59)
    lda left_text+3,x         ; 4     (63)
    ldx textoffset1     ; 3     (66)
    ora right_text+3,x        ; 4     (70)
;    sleep 2

    ; Text line 4 / 5
 
    ;line 1
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)  vcs-game-maker: text sprites take the background color on this line
    sty COLUP1              ; 3     (6)
    sta GRP0                ; 3     (6)

    ldx textoffset2     ; 3     (9)
    lda left_text+3,x         ; 4     (13)
    ldx textoffset3     ; 3     (16)
    ora right_text+3,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx textoffset4     ; 3     (26)
    lda left_text+3,x         ; 4     (30)
    ldx textoffset5     ; 3     (33)
    ora right_text+3,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx textoffset6     ; 3     (43) 3 in A
    lda left_text+3,x         ; 4     (47)
    ldx textoffset7     ; 3     (50)
    ora right_text+3,x        ; 4     (54)
    
    ldy TextColor           ; 3     (56) line 2 shows the text in its color
    sty COLUP0              ; 3
    sty COLUP1              ; 3
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sleep 3                 ; (3) vcs-game-maker: was sty VBLANK, kept the same length
    tay                     ; 2     (5) 3 in Y

    ldx textoffset8     ; 3     (8) 4
    lda left_text+3,x         ; 4     (12)
    ldx textoffset9     ; 3     (15)
    ora right_text+3,x        ; 4     (19)
    sta TextDataPtr              ; 3     (22)

    ldx textoffset10    ; 3     (25*) 5 in A
    lda left_text+3,x         ; 4     (29)
    ldx textoffset11    ; 3     (32)
    ora right_text+3,x        ; 4     (36)
    
    ldx TextDataPtr              ; 3     (39) 4 in X
    sleep 2                 ; 3     (42)
    sty GRP1                ; 3     (45) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (48) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (51) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (54) 5 -> GRP1

    ldy #textbkcolor                  ; 2     (56)
    ldx textoffset0     ; 3     (59)
    lda left_text+4,x         ; 4     (63)
    ldx textoffset1     ; 3     (66)
    ora right_text+4,x        ; 4     (70)
;    sleep 2

    ; Text line 5 / 5
 
    ;line 1
    sta WSYNC               ; 3     (0)
    sty COLUP0              ; 3     (3)  vcs-game-maker: text sprites take the background color on this line
    sty COLUP1              ; 3     (6)
    sta GRP0                ; 3     (6)

    ldx textoffset2     ; 3     (9)
    lda left_text+4,x         ; 4     (13)
    ldx textoffset3     ; 3     (16)
    ora right_text+4,x        ; 4     (20)
    sta GRP1                ; 3     (23*)
    
    ldx textoffset4     ; 3     (26)
    lda left_text+4,x         ; 4     (30)
    ldx textoffset5     ; 3     (33)
    ora right_text+4,x        ; 4     (37)
    sta GRP0                ; 3     (40)
    
    ldx textoffset6     ; 3     (43) 3 in A
    lda left_text+4,x         ; 4     (47)
    ldx textoffset7     ; 3     (50)
    ora right_text+4,x        ; 4     (54)
    
    ldy TextColor           ; 3     (56) line 2 shows the text in its color
    sty COLUP0              ; 3
    sty COLUP1              ; 3
    
    ;line 2
    sta WSYNC               ; 3     (0)
    sleep 3                 ; (3) vcs-game-maker: was sty VBLANK, kept the same length
    tay                     ; 2     (5) 3 in Y

    ldx textoffset8     ; 3     (8) 4
    lda left_text+4,x         ; 4     (12)
    ldx textoffset9     ; 3     (15)
    ora right_text+4,x        ; 4     (19)
    sta TextDataPtr              ; 3     (22)

    ldx textoffset10    ; 3     (25*) 5 in A
    lda left_text+4,x         ; 4     (29)
    ldx textoffset11    ; 3     (32)
    ora right_text+4,x        ; 4     (36)
    
    ldx TextDataPtr              ; 3     (39) 4 in X
    sleep 2                 ; 3     (42)
    sty GRP1                ; 3     (45) 3 -> [GRP1] ; 2 -> GRP0
    stx GRP0                ; 3     (48) 4 -> [GRP0] ; 3 -> GRP1
    sta GRP1                ; 3     (51) 5 -> [GRP1] ; 4 -> GRP0
    sta GRP0                ; 3     (54) 5 -> GRP1

    rts

textrowsdone
    lda #0
    sta GRP0
    sta GRP1
    sta GRP0
    sta NUSIZ0
    sta NUSIZ1
    sta VDELP0
    sta VDELP1

clear_dpc   ; clear out temp variables
    sta textoffset9
    sta textoffset9
    sta textoffset10
    sta textoffset11

    ; vcs-game-maker scroll-cursor hook - utils/text-font.js splices the "more below" indicator in right after
    ; this line when that feature is on. GRP0/GRP1 are free here, nothing after this point needs them.

    ifconst textbank
        sta temp7
        lda #>(posttextkernel-1)
        pha
        lda #<(posttextkernel-1)
        pha
        lda temp7
        pha ; *** save A
        txa
        pha ; *** save X
        ldx #KERNELBANK
        jmp BS_jsr
    endif

   if >. != >[.+text_data_height]
	align 256
   endif

text_data

left_text

__A = * - text_data ; baseline (0)
    .byte %00100000 
    .byte %01010000
    .byte %01110000
    .byte %01010000
    .byte %01010000
    
__B = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01100000
    .byte %01010000
    .byte %01100000    
    
__C = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %00110000    
    
__D = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01100000
    
__E = * - text_data
    .byte %01110000
    .byte %01000000
    .byte %01100000
    .byte %01000000
    .byte %01110000
    
__F = * - text_data
    .byte %01110000
    .byte %01000000
    .byte %01100000
    .byte %01000000
    .byte %01000000

__G = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %01010000
    .byte %01010000
    .byte %00100000

__H = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01110000
    .byte %01010000
    .byte %01010000
    
__I = * - text_data
    .byte %01110000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    .byte %01110000
    
__J = * - text_data
    .byte %00010000
    .byte %00010000
    .byte %00010000
    .byte %01010000
    .byte %00100000

__K = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01100000
    .byte %01010000
    .byte %01010000

__L = * - text_data
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %01110000
    
__M = * - text_data
    .byte %01010000
    .byte %01110000
    .byte %01110000
    .byte %01010000
    .byte %01010000
    
__N = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01010000

__O = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %00100000

__P = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01100000
    .byte %01000000
    .byte %01000000
    
__Q = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %00110000
    
__R = * - text_data
    .byte %01100000
    .byte %01010000
    .byte %01100000
    .byte %01010000
    .byte %01010000
    
__S = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %00100000
    .byte %00010000
    .byte %01100000
    
__T = * - text_data
    .byte %01110000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    
__U = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01110000
    
__V = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %00100000

__W = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01110000
    .byte %01110000
    .byte %01010000

__X = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %00100000
    .byte %01010000
    .byte %01010000
    
__Y = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %00100000
    .byte %00100000
    .byte %00100000
    
__Z = * - text_data
    .byte %01110000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01110000

__0 = * - text_data
    .byte %01110000
    .byte %01010000
    .byte %01010000
    .byte %01010000
    .byte %01110000
    
__1 = * - text_data
    .byte %00100000
    .byte %01100000
    .byte %00100000
    .byte %00100000
    .byte %01110000
    
__2 = * - text_data
    .byte %01100000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01110000
    
__3 = * - text_data
    .byte %01100000
    .byte %00010000
    .byte %00100000
    .byte %00010000
    .byte %01100000
    
__4 = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %01110000
    .byte %00010000
    .byte %00010000
    
__5 = * - text_data
    .byte %01110000
    .byte %01000000
    .byte %01100000
    .byte %00010000
    .byte %01100000
    
__6 = * - text_data
    .byte %00110000
    .byte %01000000
    .byte %01100000
    .byte %01010000
    .byte %00100000

__7 = * - text_data
    .byte %01110000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01000000

__8 = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %00100000
    .byte %01010000
    .byte %00100000
    
__9 = * - text_data
    .byte %00100000
    .byte %01010000
    .byte %00110000
    .byte %00010000
    .byte %01100000
    
_sp = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

_pd = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00100000

_qu = * - text_data
    .byte %01100000
    .byte %00010000
    .byte %00100000
    .byte %00000000
    .byte %00100000
 
_ex = * - text_data
    .byte %00100000
    .byte %00100000
    .byte %00100000
    .byte %00000000
    .byte %00100000

_cm = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00100000
    .byte %01000000

_hy = * - text_data
    .byte %00000000
    .byte %00000000
    .byte %01110000
    .byte %00000000
    .byte %00000000

_pl = * - text_data
    .byte %00100000
    .byte %00100000
    .byte %01110000
    .byte %00100000
    .byte %00100000

_ap = * - text_data
    .byte %00100000
    .byte %01000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

_lp = * - text_data
    .byte %00100000
    .byte %01000000
    .byte %01000000
    .byte %01000000
    .byte %00100000

_rp = * - text_data
    .byte %00100000
    .byte %00010000
    .byte %00010000
    .byte %00010000
    .byte %00100000

_co = * - text_data
    .byte %00000000
    .byte %01000000
    .byte %00000000
    .byte %01000000
    .byte %00000000

_sl = * - text_data
    .byte %00010000
    .byte %00010000
    .byte %00100000
    .byte %01000000
    .byte %01000000

_eq = * - text_data
    .byte %00000000
    .byte %01110000
    .byte %00000000
    .byte %01110000
    .byte %00000000

_qt = * - text_data
    .byte %01010000
    .byte %01010000
    .byte %00000000
    .byte %00000000
    .byte %00000000

_po = * - text_data
_ht
    .byte %01010000
    .byte %11110000
    .byte %01010000
    .byte %11110000
    .byte %01010000

text_data_height = * - text_data

   if >. != >[.+text_data_height]
	align 256
   endif

right_text

; A
    .byte %00000010 
    .byte %00000101
    .byte %00000111
    .byte %00000101
    .byte %00000101

    
; B
    .byte %00000110
    .byte %00000101
    .byte %00000110
    .byte %00000101
    .byte %00000110    
    
; C
    .byte %00000011
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000011    
    
; D
    .byte %00000110
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000110
    
; E
    .byte %00000111
    .byte %00000100
    .byte %00000110
    .byte %00000100
    .byte %00000111
    
; F
    .byte %00000111
    .byte %00000100
    .byte %00000110
    .byte %00000100
    .byte %00000100

; G
    .byte %00000011
    .byte %00000100
    .byte %00000101
    .byte %00000101
    .byte %00000010

; H
    .byte %00000101
    .byte %00000101
    .byte %00000111
    .byte %00000101
    .byte %00000101
    
; I
    .byte %00000111
    .byte %00000010
    .byte %00000010
    .byte %00000010
    .byte %00000111
    
; J
    .byte %00000001
    .byte %00000001
    .byte %00000001
    .byte %00000101
    .byte %00000010

; K
    .byte %00000101
    .byte %00000101
    .byte %00000110
    .byte %00000101
    .byte %00000101

; L
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000111
    
; M
    .byte %00000101
    .byte %00000111
    .byte %00000111
    .byte %00000101
    .byte %00000101
    
; N
    .byte %00000110
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000101

; O
    .byte %00000010
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000010

; P
    .byte %00000110
    .byte %00000101
    .byte %00000110
    .byte %00000100
    .byte %00000100
    
; Q
    .byte %00000010
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000011
    
; R
    .byte %00000110
    .byte %00000101
    .byte %00000110
    .byte %00000101
    .byte %00000101
    
; S
    .byte %00000011
    .byte %00000100
    .byte %00000010
    .byte %00000001
    .byte %00000110
    
; T
    .byte %00000111
    .byte %00000010
    .byte %00000010
    .byte %00000010
    .byte %00000010
    
; U
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000111
    
; V
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000010

; W
    .byte %00000101
    .byte %00000101
    .byte %00000111
    .byte %00000111
    .byte %00000101

; X
    .byte %00000101
    .byte %00000101
    .byte %00000010
    .byte %00000101
    .byte %00000101
    
; Y
    .byte %00000101
    .byte %00000101
    .byte %00000010
    .byte %00000010
    .byte %00000010
    
; Z
    .byte %00000111
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000111

; 0
    .byte %00000111
    .byte %00000101
    .byte %00000101
    .byte %00000101
    .byte %00000111
    
; 1
    .byte %00000010
    .byte %00000110
    .byte %00000010
    .byte %00000010
    .byte %00000111
    
; 2
    .byte %00000110
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000111
    
; 3
    .byte %00000110
    .byte %00000001
    .byte %00000010
    .byte %00000001
    .byte %00000110
    
; 4
    .byte %00000101
    .byte %00000101
    .byte %00000111
    .byte %00000001
    .byte %00000001
    
; 5
    .byte %00000111
    .byte %00000100
    .byte %00000110
    .byte %00000001
    .byte %00000110
    
; 6
    .byte %00000011
    .byte %00000100
    .byte %00000110
    .byte %00000101
    .byte %00000010

; 7
    .byte %00000111
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000100

; 8
    .byte %00000010
    .byte %00000101
    .byte %00000010
    .byte %00000101
    .byte %00000010
    
; 9
    .byte %00000010
    .byte %00000101
    .byte %00000011
    .byte %00000001
    .byte %00000110

; space
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000

; period
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000010

; question mark
    .byte %00000110
    .byte %00000001
    .byte %00000010
    .byte %00000000
    .byte %00000010

; exclamation point
    .byte %00000010
    .byte %00000010
    .byte %00000010
    .byte %00000000
    .byte %00000010

; comma
    .byte %00000000
    .byte %00000000
    .byte %00000000
    .byte %00000010
    .byte %00000100

; hyphen
    .byte %00000000
    .byte %00000000
    .byte %00000111
    .byte %00000000
    .byte %00000000

; plus
    .byte %00000010
    .byte %00000010
    .byte %00000111
    .byte %00000010
    .byte %00000010

; apostrophe
    .byte %00000010
    .byte %00000100
    .byte %00000000
    .byte %00000000
    .byte %00000000

; left parenthesis 
    .byte %00000010
    .byte %00000100
    .byte %00000100
    .byte %00000100
    .byte %00000010

; right parenthesis 
    .byte %00000010
    .byte %00000001
    .byte %00000001
    .byte %00000001
    .byte %00000010

; colon
    .byte %00000000
    .byte %00000100
    .byte %00000000
    .byte %00000100
    .byte %00000000

;slash
    .byte %00000001
    .byte %00000001
    .byte %00000010
    .byte %00000100
    .byte %00000100

; equal
    .byte %00000000
    .byte %00000111
    .byte %00000000
    .byte %00000111
    .byte %00000000

; quote
    .byte %00000101
    .byte %00000101
    .byte %00000000
    .byte %00000000
    .byte %00000000

; pound sign
    .byte %00000101
    .byte %00001111
    .byte %00000101
    .byte %00001111
    .byte %00000101